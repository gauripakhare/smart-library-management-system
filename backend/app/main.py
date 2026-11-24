import asyncio
from datetime import datetime
from contextlib import asynccontextmanager

from typing import Optional
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from .database import Base, engine, SessionLocal
from . import models  # noqa: F401  (ensures models are registered on Base)
from .seed import seed_seats
from .routers import student, auth, admin, books, issues, reports, notifications, voice
from .utils.library_schedule import IST


from sqlalchemy import text


async def _library_background_worker():
    """
    Continuous background worker:
    1. Every 60 seconds: Checks & auto-expires unclaimed seat reservations (15-min window)
       and generates In-App Notifications ('Seat Reservation Expired').
    2. Daily at 10:00 AM IST: Checks for overdue books & calculates fines (Rs. 25/day)
       and dispatches In-App Notifications ('Overdue Book Alert' & 'Book Due Today').
    """
    last_overdue_run_date = None

    # Brief delay on startup before initial sweep
    await asyncio.sleep(5)

    while True:
        try:
            db = SessionLocal()
            try:
                from .services.overdue_service import expire_unclaimed_seat_reservations, process_overdue_books_and_fines

                # 1. Sweep expired seat reservations every 60s
                expire_unclaimed_seat_reservations(db)

                # 2. Daily 10:00 AM IST Overdue Books & Fines check
                now_ist = datetime.now(IST)
                today_ist = now_ist.date()

                if now_ist.hour >= 10 and last_overdue_run_date != today_ist:
                    print(f"[background_worker] Running daily 10:00 AM Overdue Books & Fine scan for {today_ist}...")
                    res = process_overdue_books_and_fines(db)
                    last_overdue_run_date = today_ist
                    print(f"[background_worker] Overdue scan completed: {res}")

            finally:
                db.close()
        except Exception as e:
            print(f"[background_worker] Worker exception: {e}")

        await asyncio.sleep(60)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Safely create tables and seed data on startup without breaking on existing Supabase schema
    for model_cls in [models.User, models.Book, models.BookIssue, models.BookFine, models.BookReview]:
        try:
            model_cls.__table__.create(bind=engine, checkfirst=True)
        except Exception as e:
            print(f"[database] {model_cls.__name__} table setup notice: {e}")

    try:
        Base.metadata.create_all(bind=engine, checkfirst=True)
    except Exception as e:
        print(f"[database] Base schema creation notice: {e}")

    # Ensure new columns exist on books table (works for both PostgreSQL and SQLite)
    with engine.connect() as conn:
        for col_name, col_type in [
            ("accession_number", "VARCHAR(100)"),
            ("class_number", "VARCHAR(100)"),
            ("price", "NUMERIC(10,2) DEFAULT 0.0"),
            ("shelf_location", "VARCHAR(100)"),
            ("subtitle", "VARCHAR(255)"),
            ("co_author", "VARCHAR(255)"),
            ("language", "VARCHAR(100) DEFAULT 'English'"),
            ("pub_year", "VARCHAR(50)"),
            ("edition", "VARCHAR(100)"),
            ("status", "VARCHAR(50) DEFAULT 'Available'"),
            ("shelf", "VARCHAR(100)"),
            ("rack", "VARCHAR(100)"),
            ("pages", "VARCHAR(50)"),
            ("dimensions", "VARCHAR(100)"),
            ("weight", "VARCHAR(100)"),
            ("description", "TEXT"),
            ("added_by", "VARCHAR(255)"),
            ("updated_at", "TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP")
        ]:
            try:
                conn.execute(text(f"ALTER TABLE books ADD COLUMN {col_name} {col_type};"))
                conn.commit()
            except Exception:
                pass

    try:
        db = SessionLocal()
        try:
            seed_seats(db)
        finally:
            db.close()
    except Exception as e:
        print(f"[database] Seeding notice: {e}")

    # Launch background scheduler
    worker_task = asyncio.create_task(_library_background_worker())

    yield

    worker_task.cancel()
    try:
        await worker_task
    except asyncio.CancelledError:
        pass


app = FastAPI(
    title="Agentic Library Management System",
    description="Backend API for Library Management System with Auth",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration for development frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(admin.dashboard_router)
app.include_router(books.router)
app.include_router(books.public_router)
app.include_router(books.student_books_router)
app.include_router(issues.router)
app.include_router(student.router)
app.include_router(student.legacy_router)
app.include_router(reports.router)
app.include_router(reports.student_router)
app.include_router(notifications.admin_notif_router)
app.include_router(notifications.student_notif_router)
app.include_router(notifications.public_notif_router)
app.include_router(voice.router)



@app.get("/")
def root():
    return {
        "message": "Agentic Library Management System API is running"
    }


@app.get("/health")
def health_check():
    return {
        "status": "healthy"
    }


@app.post("/api/attendance/scan-barcode")
@app.post("/api/v1/attendance/scan-barcode")
@app.get("/api/attendance/scan-barcode")
@app.get("/api/v1/attendance/scan-barcode")
async def direct_scan_barcode(request: Request, barcode: Optional[str] = None):
    from .database import SessionLocal
    from .services import reservation_service as svc
    from fastapi import HTTPException
    
    code = (barcode or "").strip()
    if not code:
        # Check query parameters (e.g. ?code=308255 or ?barcode=308255 or ?text=308255)
        for q_key in ["code", "barcode", "text", "data", "id", "roll_number"]:
            if request.query_params.get(q_key):
                code = request.query_params.get(q_key).strip()
                break

    if not code:
        # Try JSON body (Barcode to PC HTTP mode)
        try:
            body = await request.json()
            if isinstance(body, dict):
                code = str(
                    body.get("barcode") or
                    body.get("text") or
                    body.get("data") or
                    body.get("code") or
                    body.get("scanned_code") or
                    body.get("roll_number") or ""
                ).strip()
            elif isinstance(body, (str, int)):
                code = str(body).strip()
        except Exception:
            pass

    if not code:
        # Try raw body bytes
        try:
            raw_bytes = await request.body()
            if raw_bytes:
                code = raw_bytes.decode("utf-8", errors="ignore").strip().strip('"').strip("'")
        except Exception:
            pass

    if not code:
        raise HTTPException(status_code=400, detail="Barcode data is required. Send JSON { barcode: '308255' } or query param ?barcode=308255.")

    db = SessionLocal()
    try:
        res = svc.process_barcode_scan(db, barcode=code)
        return res
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    finally:
        db.close()



