import uuid
from typing import Optional
from datetime import datetime, date, timedelta, timezone
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, func, desc

from ..database import get_db
from ..models import User, AttendanceLog, GeofenceSetting, SeatReservation, Book, BookIssue, Notification, Seat
from ..schemas import CreateStudentSchema, UpdateStudentSchema, GeofenceSettingSchema, BarcodeScanRequest
from ..utils.password_handler import hash_password
from ..utils.geofence import get_active_geofence, DEFAULT_LIBRARY_LAT, DEFAULT_LIBRARY_LON, DEFAULT_RADIUS_METERS
from ..services import reservation_service as svc

router = APIRouter(prefix="/api/admin", tags=["Admin Management"])

DEFAULT_STUDENT_PASSWORD = "Ssgmce@1234"

AVAILABLE_CLASSES = [
    {"id": "B.Tech CSE", "name": "B.Tech CSE"},
    {"id": "B.Tech IT", "name": "B.Tech IT"},
    {"id": "B.Tech ENTC", "name": "B.Tech ENTC"},
    {"id": "B.Tech Electrical", "name": "B.Tech Electrical"},
    {"id": "B.Tech Mechanical", "name": "B.Tech Mechanical"},
    {"id": "B.Tech Civil", "name": "B.Tech Civil"},
]

AVAILABLE_ACADEMIC_YEARS = [
    {"id": "2024-2025", "label": "2024-2025"},
    {"id": "2025-2026", "label": "2025-2026"},
    {"id": "2026-2027", "label": "2026-2027"},
]


def _format_student(user: User) -> dict:
    dob_str = "-"
    if user.date_of_birth:
        try:
            dob_str = user.date_of_birth.strftime("%Y-%m-%d")
        except Exception:
            dob_str = str(user.date_of_birth)

    return {
        "id": str(user.id),
        "rollNumber": user.roll_number or "-",
        "libraryCardNumber": user.library_card_number or "-",
        "libraryNumber": user.library_card_number or "-",
        "name": user.name or "Student",
        "class": user.class_name or "-",
        "academicYear": user.academic_year or "-",
        "email": user.email or "-",
        "contact": user.contact_number or "-",
        "department": user.department or "-",
        "college": user.college or "-",
        "dob": dob_str,
        "gender": user.gender or "-",
        "address": user.address or "-",
        "avatarUrl": user.avatar_url,
        "status": user.status or "ACTIVE"
    }


# ==========================================
# GEOFENCE SETTINGS ENDPOINTS
# ==========================================

@router.get("/geofence-settings")
@router.get("/geofence-settings/")
def get_admin_geofence_settings(db: Session = Depends(get_db)):
    setting = get_active_geofence(db)
    if not setting:
        any_setting = db.query(GeofenceSetting).first()
        return {
            "id": str(any_setting.id) if any_setting else None,
            "libraryName": any_setting.library_name if any_setting else "Main Library",
            "latitude": float(any_setting.latitude) if (any_setting and any_setting.latitude) else None,
            "longitude": float(any_setting.longitude) if (any_setting and any_setting.longitude) else None,
            "radius": int(any_setting.radius_meters) if (any_setting and any_setting.radius_meters) else 120,
            "radiusMeters": float(any_setting.radius_meters) if (any_setting and any_setting.radius_meters) else 120.0,
            "isActive": False,
            "isConfigured": False,
            "updatedAt": any_setting.updated_at.isoformat() if (any_setting and any_setting.updated_at) else None
        }

    return {
        "id": str(setting.id),
        "libraryName": setting.library_name,
        "latitude": float(setting.latitude) if setting.latitude else None,
        "longitude": float(setting.longitude) if setting.longitude else None,
        "radius": int(setting.radius_meters),
        "radiusMeters": float(setting.radius_meters),
        "isActive": True,
        "isConfigured": True,
        "updatedAt": setting.updated_at.isoformat() if setting.updated_at else None
    }


@router.post("/geofence-settings")
def save_admin_geofence_settings(
    payload: GeofenceSettingSchema,
    db: Session = Depends(get_db)
):
    setting = db.query(GeofenceSetting).first()
    radius_val = payload.radius if payload.radius is not None else payload.radius_meters

    if not setting:
        setting = GeofenceSetting(
            id=uuid.uuid4(),
            library_name=payload.library_name or "Main Library",
            latitude=Decimal(str(payload.latitude)),
            longitude=Decimal(str(payload.longitude)),
            radius_meters=Decimal(str(radius_val or 120.0)),
            is_active=True
        )
        db.add(setting)
    else:
        setting.library_name = payload.library_name or setting.library_name
        setting.latitude = Decimal(str(payload.latitude))
        setting.longitude = Decimal(str(payload.longitude))
        setting.radius_meters = Decimal(str(radius_val or 120.0))
        setting.is_active = True
        setting.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(setting)

    return {
        "success": True,
        "message": "Geofence settings activated and saved successfully!",
        "settings": {
            "latitude": float(setting.latitude),
            "longitude": float(setting.longitude),
            "radius": int(setting.radius_meters),
            "radiusMeters": float(setting.radius_meters),
            "isActive": True,
            "isConfigured": True
        }
    }


@router.post("/geofence-settings/unset")
def unset_admin_geofence_settings(db: Session = Depends(get_db)):
    setting = db.query(GeofenceSetting).first()
    if setting:
        setting.is_active = False
        setting.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(setting)

    return {
        "success": True,
        "message": "Geofence location unset successfully. You can now set a new location.",
        "isActive": False,
        "isConfigured": False
    }


# ==========================================
# ATTENDANCE LOGS & OVERVIEW ENDPOINTS
# ==========================================

@router.get("/attendance-logs")
def get_attendance_logs(
    filter: str = Query("day", description="day | week | month"),
    db: Session = Depends(get_db)
):
    today = date.today()
    query = db.query(AttendanceLog, User).join(User, AttendanceLog.user_id == User.id)

    if filter == "day":
        query = query.filter(AttendanceLog.date == today)
    elif filter == "week":
        week_ago = today - timedelta(days=7)
        query = query.filter(AttendanceLog.date >= week_ago)
    elif filter == "month":
        month_ago = today - timedelta(days=30)
        query = query.filter(AttendanceLog.date >= month_ago)

    logs = query.order_by(AttendanceLog.check_in_time.desc()).all()

    results = []
    for att, usr in logs:
        check_in_str = svc.format_ist_time(att.check_in_time)
        check_out_str = svc.format_ist_time(att.check_out_time)

        # Look up corresponding seat reservation for this student on this date
        res_seat = db.query(SeatReservation, Seat).join(
            Seat, SeatReservation.seat_id == Seat.id
        ).filter(
            SeatReservation.user_id == usr.id,
            SeatReservation.booking_date == att.date
        ).order_by(SeatReservation.start_time.desc()).first()

        seat_code = res_seat[1].seat_code if res_seat else "General Entry"
        floor = res_seat[1].floor if res_seat else ""

        results.append({
            "id": str(att.id),
            "studentName": usr.name or "Student",
            "rollNo": usr.roll_number or usr.library_card_number or "-",
            "department": usr.department or "-",
            "seatCode": seat_code,
            "floor": floor,
            "date": att.date.strftime("%Y-%m-%d"),
            "checkIn": check_in_str,
            "checkOut": check_out_str,
            "status": att.status or "PRESENT",
            "verificationMethod": att.verification_method or "BARCODE"
        })

    return results


@router.post("/scan-barcode")
@router.post("/attendance/scan-barcode")
def scan_barcode_admin(
    payload: BarcodeScanRequest,
    db: Session = Depends(get_db)
):
    """
    Kiosk / Entrance barcode scanner endpoint:
    Scans student ID barcode (roll number or library card number).
    Auto checks in or checks out student based on active reservation/attendance.
    """
    try:
        res = svc.process_barcode_scan(db, barcode=payload.barcode)
        return res
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))



@router.get("/attendance-overview")
@router.get("/attendance-overview/")
def get_attendance_overview(db: Session = Depends(get_db)):
    today = date.today()

    total_students = db.query(User).filter(func.lower(User.role) == "student").count() or 1
    present_today = db.query(AttendanceLog).filter(AttendanceLog.date == today).count()
    absent_today = max(0, total_students - present_today)
    avg_attendance = round((present_today / total_students) * 100, 1) if total_students else 0.0

    # 7-day chart data
    days = []
    values = []
    day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

    for i in range(6, -1, -1):
        target_date = today - timedelta(days=i)
        day_label = day_names[target_date.weekday()]
        cnt = db.query(AttendanceLog).filter(AttendanceLog.date == target_date).count()
        days.append(day_label)
        values.append(cnt)

    return {
        "currentDate": today.strftime("%A, %B %d, %Y"),
        "stats": {
            "totalStudents": total_students,
            "presentToday": present_today,
            "absentToday": absent_today,
            "avgAttendance30d": avg_attendance
        },
        "chartData": {
            "labels": days,
            "values": values
        }
    }


@router.get("/attendance-students")
@router.get("/attendance-students/")
def get_attendance_students(db: Session = Depends(get_db)):
    today = date.today()
    thirty_days_ago = today - timedelta(days=30)

    users = db.query(User).filter(
        or_(
            func.lower(User.role) == "student",
            func.lower(User.role) == "user"
        )
    ).order_by(User.name.asc()).all()

    results = []
    for u in users:
        today_log = db.query(AttendanceLog).filter(
            AttendanceLog.user_id == u.id,
            AttendanceLog.date == today
        ).first()

        today_status = "Present" if today_log else "Absent"

        logs_30d = db.query(AttendanceLog).filter(
            AttendanceLog.user_id == u.id,
            AttendanceLog.date >= thirty_days_ago
        ).count()

        # Express 30-day percentage cleanly
        if logs_30d > 0:
            percentage = min(100.0, round((logs_30d / 30.0) * 100, 1))
        else:
            percentage = 85.0 if today_status == "Present" else 0.0

        results.append({
            "id": str(u.id),
            "studentName": u.name or "Student",
            "rollNo": u.roll_number or u.library_card_number or "-",
            "attendance30Days": percentage,
            "todayStatus": today_status
        })

    return results



# ==========================================
# STUDENT MANAGEMENT ENDPOINTS
# ==========================================

@router.get("/student-form-options")
def get_student_form_options():
    return {
        "classes": AVAILABLE_CLASSES,
        "academicYears": AVAILABLE_ACADEMIC_YEARS
    }


@router.get("/students")
def get_all_students(db: Session = Depends(get_db)):
    users = db.query(User).filter(
        or_(
            func.lower(User.role) == "student",
            func.lower(User.role) == "user"
        )
    ).order_by(User.created_at.desc()).all()

    formatted_students = [_format_student(u) for u in users]
    class_names = [c["name"] for c in AVAILABLE_CLASSES]

    return {
        "students": formatted_students,
        "classes": class_names
    }


@router.get("/students/{student_id}")
def get_student_by_id(student_id: str, db: Session = Depends(get_db)):
    try:
        user_uuid = uuid.UUID(student_id)
        user = db.query(User).filter(User.id == user_uuid).first()
    except Exception:
        user = db.query(User).filter(
            or_(
                User.roll_number == student_id,
                User.library_card_number == student_id,
                User.email == student_id
            )
        ).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student not found"
        )

    return _format_student(user)


@router.post("/students")
def create_student(payload: CreateStudentSchema, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    library_number = payload.libraryNumber.strip()
    roll_number = payload.rollNumber.strip() if payload.rollNumber else library_number

    existing = db.query(User).filter(
        or_(
            func.lower(User.email) == email,
            func.lower(User.roll_number) == roll_number.lower(),
            func.lower(User.library_card_number) == library_number.lower()
        )
    ).first()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Student already exists with email ({email}) or ID ({library_number})."
        )

    dob_date = None
    if payload.dob:
        try:
            dob_date = datetime.strptime(payload.dob, "%Y-%m-%d").date()
        except Exception:
            pass

    hashed_pwd = hash_password(DEFAULT_STUDENT_PASSWORD)

    new_user = User(
        id=uuid.uuid4(),
        name=payload.name.strip(),
        email=email,
        password_hash=hashed_pwd,
        roll_number=roll_number,
        library_card_number=library_number,
        class_name=payload.className,
        academic_year=payload.academicYear,
        contact_number=payload.contactNumber,
        department=payload.department,
        college=payload.college,
        date_of_birth=dob_date,
        gender=payload.gender,
        address=payload.address,
        role="STUDENT",
        status="ACTIVE"
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return {
        "success": True,
        "message": f"Student '{new_user.name}' added successfully. Default password is set to '{DEFAULT_STUDENT_PASSWORD}'.",
        "student": _format_student(new_user)
    }


@router.put("/students/{student_id}")
@router.put("/students")
def update_student(payload: UpdateStudentSchema, student_id: Optional[str] = None, db: Session = Depends(get_db)):
    target_id = student_id or payload.libraryNumber or payload.rollNumber
    user = None

    if target_id:
        try:
            user_uuid = uuid.UUID(target_id)
            user = db.query(User).filter(User.id == user_uuid).first()
        except Exception:
            user = db.query(User).filter(
                or_(
                    User.roll_number == target_id,
                    User.library_card_number == target_id,
                    User.email == target_id
                )
            ).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student record not found"
        )

    if payload.name is not None:
        user.name = payload.name.strip()
    if payload.email is not None:
        user.email = payload.email.strip().lower()
    if payload.rollNumber is not None:
        user.roll_number = payload.rollNumber.strip()
    if payload.libraryNumber is not None:
        user.library_card_number = payload.libraryNumber.strip()
    if payload.contactNumber is not None:
        user.contact_number = payload.contactNumber.strip()
    
    # Check class or className
    cls_val = payload.className
    if hasattr(payload, "class_") and payload.class_:
        cls_val = payload.class_
    elif hasattr(payload, "__dict__") and "class" in payload.__dict__:
        cls_val = payload.__dict__["class"]
    if cls_val is not None:
        user.class_name = cls_val

    if payload.academicYear is not None:
        user.academic_year = payload.academicYear
    if payload.department is not None:
        user.department = payload.department
    if payload.college is not None:
        user.college = payload.college
    if payload.gender is not None:
        user.gender = payload.gender
    if payload.address is not None:
        user.address = payload.address
    if payload.dob:
        try:
            user.date_of_birth = datetime.strptime(payload.dob, "%Y-%m-%d").date()
        except Exception:
            pass

    db.commit()
    db.refresh(user)

    return {
        "success": True,
        "message": f"Student '{user.name}' updated successfully.",
        "student": _format_student(user)
    }


@router.delete("/students/{student_id}")
def delete_student(student_id: str, db: Session = Depends(get_db)):
    try:
        user_uuid = uuid.UUID(student_id)
        user = db.query(User).filter(User.id == user_uuid).first()
    except Exception:
        user = db.query(User).filter(
            or_(
                User.roll_number == student_id,
                User.library_card_number == student_id,
                User.email == student_id
            )
        ).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student record not found"
        )

    db.delete(user)
    db.commit()

    return {
        "success": True,
        "message": "Student record deleted successfully"
    }


# ==========================================
# SEAT RESERVATION ADMIN ENDPOINTS
# ==========================================

@router.get("/seat-overview")
@router.get("/seat-overview/")
def get_admin_seat_overview_route(db: Session = Depends(get_db)):
    return svc.get_admin_seat_overview(db)


@router.get("/floor-seats")
@router.get("/floor-seats/")
def get_admin_floor_seats_route(
    floor: str = Query("ground"),
    date: str | None = Query(None),
    slot: str | None = Query(None),
    db: Session = Depends(get_db)
):
    return svc.get_admin_floor_seats(db, floor, date, slot)


@router.get("/seat-history")
@router.get("/seat-history/")
@router.get("/seat-reservations/history")
@router.get("/seat-reservations/history/")
def get_admin_seat_history_route(
    date: str | None = Query(None, description="Specific date YYYY-MM-DD or 'all'"),
    time: str | None = Query(None, description="Time slot e.g. morning, afternoon, evening, 08:00-09:00, or 'all'"),
    time_slot: str | None = Query(None),
    floor: str | None = Query(None, description="ground | first | all"),
    status: str | None = Query(None, description="CHECKED_IN | CHECKED_OUT | RESERVED | EXPIRED | CANCELLED | all"),
    search: str | None = Query(None),
    limit: int = Query(300, ge=1, le=1000),
    db: Session = Depends(get_db)
):
    selected_time = time or time_slot
    return svc.get_admin_seat_booking_history(
        db,
        date_filter=date,
        time_filter=selected_time,
        floor_filter=floor,
        status_filter=status,
        search=search,
        limit=limit
    )


@router.get("/active-reservations")
@router.get("/active-reservations/")
def get_admin_active_reservations_route(
    status: str = Query("active", description="active | reserved | checked_in | history | all_records"),
    search: str | None = Query(None),
    db: Session = Depends(get_db)
):
    reservations = svc.get_admin_active_reservations(db, status_filter=status, search=search)
    return {
        "success": True,
        "total": len(reservations),
        "statusFilter": status,
        "reservations": reservations
    }


@router.post("/reservations/{reservation_id}/release")
@router.post("/reservations/{reservation_id}/release/")
def release_seat_reservation_route(
    reservation_id: str,
    db: Session = Depends(get_db)
):
    try:
        res_uuid = uuid.UUID(reservation_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid reservation UUID")

    try:
        result = svc.admin_force_release_seat(db, res_uuid)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return result


@router.get("/dashboard")
@router.get("/dashboard/")
def get_admin_dashboard(db: Session = Depends(get_db)):
    """
    Returns real-time aggregated metrics and activities for Admin Dashboard:
    - total_books: Total count/copies of books in library
    - total_seats: Total seats in library
    - available_seats: Seats currently not reserved or checked in
    - active_students: Total registered active students
    - todays_reservations: Number of reservations booked for today
    - admin_name: Admin display name
    - notification_count: Unread notifications count
    - reservation_trend: Mon-Sun reservation counts for chart
    - recent_activities: Real-time list of latest library activities
    - upcoming_reservations: Upcoming or active seat bookings
    """
    now = svc.utcnow()
    today = date.today()

    # 1. Total Books & Available Books from Database
    total_books_count = db.query(Book).count()
    total_copies = int(db.query(func.coalesce(func.sum(Book.total_copies), 0)).scalar() or total_books_count)
    active_book_issues = db.query(BookIssue).filter(
        BookIssue.status.in_(["issued", "active", "overdue", "borrowed"]),
        BookIssue.return_date == None
    ).count()
    available_books = max(0, total_copies - active_book_issues)
    total_books = total_copies if total_copies > 0 else total_books_count

    # 2. Total & Available Seats from Database
    total_seats = db.query(Seat).count() or 274
    active_seats = db.query(Seat).filter(Seat.is_active == True).count() or total_seats
    active_reservations = db.query(SeatReservation).filter(
        or_(
            SeatReservation.status == "CHECKED_IN",
            and_(
                SeatReservation.status == "RESERVED",
                SeatReservation.end_time > now
            )
        )
    ).count()
    available_seats = max(0, active_seats - active_reservations)

    # 3. Active Students
    active_students = db.query(User).filter(User.role == "STUDENT").count()

    # 4. Today's Reservations
    todays_reservations = db.query(SeatReservation).filter(
        SeatReservation.booking_date == today
    ).count()

    # 5. Admin Name
    admin_user = db.query(User).filter(User.role == "ADMIN").first()
    admin_name = admin_user.name if admin_user and admin_user.name else "Administrator"

    # 6. Unread Notifications Count
    notification_count = db.query(Notification).filter(Notification.is_read == False).count()

    # 7. Reservation Trend (Mon to Sun for the current week)
    weekday_idx = today.weekday()  # Monday is 0, Sunday is 6
    start_of_week = today - timedelta(days=weekday_idx)
    day_labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    reservation_trend = []
    for i, label in enumerate(day_labels):
        day_date = start_of_week + timedelta(days=i)
        day_count = db.query(SeatReservation).filter(
            SeatReservation.booking_date == day_date
        ).count()
        reservation_trend.append({"label": label, "value": day_count})

    # 8. Recent Activities (aggregating SeatReservation, BookIssue, AttendanceLog, User)
    events = []

    # 8. Recent Activities (aggregating SeatReservation, BookIssue, AttendanceLog, User)
    events = []

    # Recent reservations
    res_list = (
        db.query(SeatReservation)
        .order_by(SeatReservation.created_at.desc())
        .limit(6)
        .all()
    )
    for r in res_list:
        u_name = r.user.name if r.user and r.user.name else "Student"
        s_code = r.seat.seat_code if r.seat else "a seat"
        events.append({
            "type": "reservation",
            "title": f"Seat {s_code} reserved",
            "description": f"Seat {s_code} reserved by {u_name}",
            "raw_time": r.created_at or r.start_time
        })

    # Recent book issues / returns
    issues = (
        db.query(BookIssue)
        .order_by(BookIssue.created_at.desc())
        .limit(6)
        .all()
    )
    for b in issues:
        stu_name = b.student_id or "Student"
        if b.student_id:
            try:
                sid_uuid = uuid.UUID(b.student_id)
                stu_user = db.query(User).filter(User.id == sid_uuid).first()
            except (ValueError, TypeError):
                stu_user = db.query(User).filter(
                    or_(
                        User.roll_number == b.student_id,
                        User.library_card_number == b.student_id
                    )
                ).first()
            if stu_user and stu_user.name:
                stu_name = stu_user.name

        b_title = b.book_title or "Library Book"
        is_ret = b.status and ("return" in b.status.lower() or "fine paid" in b.status.lower())
        ev_type = "book_returned" if is_ret else "book_issued"
        action_verb = "returned by" if is_ret else "issued to"
        events.append({
            "type": ev_type,
            "title": f"Book {'Returned' if is_ret else 'Issued'}",
            "description": f"'{b_title}' {action_verb} {stu_name}",
            "raw_time": b.return_date if (is_ret and b.return_date) else (b.issue_date or b.created_at)
        })

    # Recent attendance logs
    attendances = (
        db.query(AttendanceLog)
        .order_by(AttendanceLog.check_in_time.desc())
        .limit(6)
        .all()
    )
    for a in attendances:
        a_name = a.user.name if a.user and a.user.name else "Student"
        events.append({
            "type": "attendance",
            "title": "Attendance Recorded",
            "description": f"{a_name} marked library attendance",
            "raw_time": a.check_in_time
        })

    # Recent student registrations
    new_users = (
        db.query(User)
        .filter(User.role == "STUDENT")
        .order_by(User.created_at.desc())
        .limit(4)
        .all()
    )
    for u in new_users:
        events.append({
            "type": "new_user",
            "title": "New Registration",
            "description": f"New student {u.name or 'User'} registered",
            "raw_time": u.created_at
        })

    def _to_utc(dt: Optional[datetime]) -> datetime:
        if not dt:
            return datetime.min.replace(tzinfo=timezone.utc)
        if isinstance(dt, date) and not isinstance(dt, datetime):
            dt = datetime.combine(dt, datetime.min.time())
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)

    # Sort events by raw_time descending
    events.sort(key=lambda x: _to_utc(x["raw_time"]), reverse=True)
    recent_activities = [
        {
            "type": e["type"],
            "title": e.get("title", e["description"]),
            "description": e["description"],
            "raw_time": _to_utc(e["raw_time"]).isoformat().replace("+00:00", "Z")
        }
        for e in events[:10]
    ]

    # 9. Upcoming Reservations
    upcoming_query = (
        db.query(SeatReservation)
        .filter(SeatReservation.status.in_(["RESERVED", "CHECKED_IN"]))
        .order_by(SeatReservation.start_time.asc())
        .limit(8)
        .all()
    )
    if not upcoming_query:
        upcoming_query = (
            db.query(SeatReservation)
            .order_by(SeatReservation.booking_date.desc(), SeatReservation.start_time.desc())
            .limit(5)
            .all()
        )

    upcoming_reservations = []
    for ur in upcoming_query:
        s_name = ur.user.name if ur.user and ur.user.name else "Student"
        s_code = ur.seat.seat_code if ur.seat else "-"
        start_str = ur.start_time.strftime("%I:%M %p") if ur.start_time else "--:--"
        end_str = ur.end_time.strftime("%I:%M %p") if ur.end_time else "--:--"
        time_display = f"{start_str} - {end_str}"
        status_display = "Reserved"
        if ur.status == "CHECKED_IN":
            status_display = "Checked In"
        elif ur.status == "CHECKED_OUT":
            status_display = "Checked Out"
        elif ur.status == "CANCELLED":
            status_display = "Cancelled"
        elif ur.status == "EXPIRED":
            status_display = "Expired"

        upcoming_reservations.append({
            "student_name": s_name,
            "seat_number": s_code,
            "time": time_display,
            "status": status_display
        })

    return {
        "success": True,
        "total_books": total_books,
        "available_books": available_books,
        "total_seats": total_seats,
        "available_seats": available_seats,
        "active_students": active_students,
        "todays_reservations": todays_reservations,
        "admin_name": admin_name,
        "notification_count": notification_count,
        "reservation_trend": reservation_trend,
        "recent_activities": recent_activities,
        "upcoming_reservations": upcoming_reservations
    }


@router.get("/profile")
@router.get("/profile/")
def get_admin_profile(db: Session = Depends(get_db)):
    admin_user = db.query(User).filter(func.lower(User.role) == "admin").first()
    name = admin_user.name if admin_user and admin_user.name else "Administrator"
    first_name = name.split()[0] if name else "Admin"
    unread_notifs = db.query(Notification).filter(Notification.is_read == False).count()
    return {
        "id": str(admin_user.id) if admin_user else "admin-id",
        "name": name,
        "firstName": first_name,
        "role": "Chief Librarian / Admin",
        "avatarUrl": (admin_user.avatar_url if admin_user else None) or "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&q=80&w=150",
        "unreadNotifications": unread_notifs
    }


# ==========================================
# DASHBOARD SUB-ENDPOINTS ROUTER (/api/dashboard)
# ==========================================

dashboard_router = APIRouter(prefix="/api/dashboard", tags=["Dashboard Sub-Endpoints"])


@dashboard_router.get("/summary")
@dashboard_router.get("/summary/")
def get_dashboard_summary(db: Session = Depends(get_db)):
    dash = get_admin_dashboard(db)
    return {
        "totalBooks": dash["total_books"],
        "availableBooks": dash["available_books"],
        "totalSeats": dash["total_seats"],
        "availableSeats": dash["available_seats"],
        "activeStudents": dash["active_students"],
        "todaysReservations": dash["todays_reservations"]
    }


@dashboard_router.get("/reservation-trend")
@dashboard_router.get("/reservation-trend/")
def get_dashboard_trend(db: Session = Depends(get_db)):
    dash = get_admin_dashboard(db)
    return [
        {"day": item["label"], "count": item["value"]}
        for item in dash["reservation_trend"]
    ]


@dashboard_router.get("/recent-activity")
@dashboard_router.get("/recent-activity/")
def get_dashboard_recent_activity(db: Session = Depends(get_db)):
    dash = get_admin_dashboard(db)
    return [
        {
            "type": item["type"],
            "title": item["title"],
            "description": item["description"],
            "timestamp": item["raw_time"]
        }
        for item in dash["recent_activities"]
    ]


@dashboard_router.get("/upcoming-reservations")
@dashboard_router.get("/upcoming-reservations/")
def get_dashboard_upcoming_reservations(db: Session = Depends(get_db)):
    dash = get_admin_dashboard(db)
    return [
        {
            "studentName": item["student_name"],
            "seatNo": item["seat_number"],
            "timeRange": item["time"],
            "status": item["status"]
        }
        for item in dash["upcoming_reservations"]
    ]


@dashboard_router.get("/quick-actions")
@dashboard_router.get("/quick-actions/")
def get_dashboard_quick_actions():
    return [
        {"label": "Book Management", "href": "book-management.html", "icon": "📚"},
        {"label": "Book Issue & Return", "href": "book-issue-return.html", "icon": "🔄"},
        {"label": "Student Management", "href": "student-management.html", "icon": "👥"},
        {"label": "Seat Reservation", "href": "seat-reservation.html", "icon": "💺"},
        {"label": "Attendance Overview", "href": "attendence_overview.html", "icon": "📋"},
        {"label": "Geofence Settings", "href": "geofence_setting.html", "icon": "📍"},
        {"label": "Reports & Analytics", "href": "reports.html", "icon": "📊"}
    ]
