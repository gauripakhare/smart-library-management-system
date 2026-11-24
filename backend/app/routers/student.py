import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, and_
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user_id, get_current_user_profile
from ..models import Seat, SeatReservation, User, Book, BookIssue, AttendanceLog, Notification, GeofenceSetting
from ..schemas import CreateBookingRequest, CheckInRequest, CheckOutRequest, GeofenceValidateRequest, AgentExecuteRequest, UpdateGenderRequest, BarcodeScanRequest
from ..services import reservation_service as svc
from ..utils.geofence import check_geofence_status, get_active_geofence
from ..utils.library_schedule import get_library_schedule_payload, IST
from ..agent.graph import run_agent_workflow

legacy_router = APIRouter(prefix="/api/student", tags=["student"])
router = legacy_router


def _to_naive_utc(dt: datetime) -> datetime:
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _iso_utc(dt: datetime) -> str:
    return dt.isoformat() + "Z"


@router.get("/seat-dashboard")
def seat_dashboard(
    gender: Optional[str] = Query(None, description="Optional gender override for testing (e.g. 'Male', 'Female')"),
    day: Optional[str] = Query(None, description="Optional day override for testing (e.g. 'Sunday')"),
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id)
):
    total_seats = db.query(Seat).count() or 160
    now_utc = svc.utcnow()
    occupied_count = db.query(SeatReservation).filter(
        or_(
            SeatReservation.status == "CHECKED_IN",
            and_(
                SeatReservation.status == "RESERVED",
                SeatReservation.end_time > now_utc
            )
        )
    ).count()
    available_seats = max(0, total_seats - occupied_count)

    now_dt = datetime.now(IST)
    if day and day.strip().lower() == "sunday":
        days_ahead = (6 - now_dt.weekday()) % 7
        if days_ahead == 0 and now_dt.weekday() != 6:
            days_ahead = 7
        now_dt = now_dt + timedelta(days=days_ahead)

    today_str = now_dt.strftime("%a, %d %b %Y")

    user_obj = db.query(User).filter(User.id == user_id).first()
    effective_gender = gender if gender else (user_obj.gender if user_obj and user_obj.gender else "Female")

    # Dynamic library operating hours based on user gender and day:
    # Sunday: 11:00 AM - 05:00 PM (for everyone)
    # Mon-Sat Male: 08:00 AM - 12:00 AM (midnight)
    # Mon-Sat Female: 08:00 AM - 09:00 PM
    sched = get_library_schedule_payload(now_dt, effective_gender)

    active_res = svc.get_active_reservation(db, user_id)
    serialized_res = svc.serialize_reservation(db, active_res) if active_res else None

    today_att = db.query(AttendanceLog).filter(
        AttendanceLog.user_id == user_id,
        AttendanceLog.date == now_dt.date()
    ).order_by(AttendanceLog.check_in_time.desc()).first()

    is_checked_in = (
        (active_res is not None and active_res.status == "CHECKED_IN") or
        (today_att is not None and today_att.status == "PRESENT" and today_att.check_out_time is None)
    )

    attendance_info = {
        "isCheckedIn": is_checked_in,
        "status": "CHECKED_IN" if is_checked_in else ("CHECKED_OUT" if (today_att and today_att.check_out_time) else "NOT_CHECKED_IN"),
        "seatCode": serialized_res.get("seatId") if serialized_res else None,
        "floorName": serialized_res.get("floorName") if serialized_res else None
    }

    user_profile = get_current_user_profile(db=db, user_id=user_id)
    if user_obj and user_obj.gender:
        user_profile["gender"] = user_obj.gender

    return {
        "success": True,
        "today": today_str,
        "libraryHours": sched["libraryHours"],
        "scheduleRule": sched["scheduleRule"],
        "targetGroup": sched["targetGroup"],
        "isOpen": sched["isOpen"],
        "isSunday": sched["isSunday"],
        "effectiveGender": sched["gender"],
        "totalSeats": total_seats,
        "occupiedSeats": occupied_count,
        "availableSeats": available_seats,
        "user": user_profile,
        "notificationsCount": 0,
        "reservation": serialized_res,
        "attendance": attendance_info,
        "schedule": sched
    }


@router.get("/dashboard-summary")
def dashboard_summary(
    gender: Optional[str] = Query(None),
    day: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id)
):
    """
    Main student dashboard summary combining student profile, active seat reservation,
    borrowed books, recommended catalog books, recent attendance, and operating schedule.
    """
    # 1. Student profile
    user_obj = db.query(User).filter(User.id == user_id).first()
    if not user_obj:
        user_obj = db.query(User).filter(User.role == "STUDENT").first()

    student_profile = {
        "id": str(user_obj.id) if user_obj else str(user_id),
        "name": user_obj.name if user_obj and user_obj.name else "Student",
        "className": user_obj.class_name if user_obj and user_obj.class_name else "B.Tech CSE",
        "department": user_obj.department if user_obj and user_obj.department else "Computer Science & Engineering",
        "libraryCard": user_obj.library_card_number if user_obj and user_obj.library_card_number else (user_obj.roll_number if user_obj and user_obj.roll_number else "308255"),
        "avatarUrl": user_obj.avatar_url if user_obj else None,
        "gender": user_obj.gender if user_obj and user_obj.gender else "Female"
    }

    target_user_id = user_obj.id if user_obj else user_id

    # 2. Geofence setting
    geofence = get_active_geofence(db)
    geofence_data = {
        "campusName": geofence.library_name if geofence and geofence.library_name else "Main Central Library",
        "status": f"Geofence Active ({int(geofence.radius_meters) if geofence and geofence.radius_meters else 120}m)",
        "radiusMeters": float(geofence.radius_meters) if geofence and geofence.radius_meters else 120.0
    }

    # 3. Active Reservation (Seat)
    active_res = svc.get_active_reservation(db, target_user_id)
    serialized_res = svc.serialize_reservation(db, active_res) if active_res else None

    # 4. Total and available seats
    total_seats = db.query(Seat).count() or 274
    now_utc = svc.utcnow()
    occupied_count = db.query(SeatReservation).filter(
        or_(
            SeatReservation.status == "CHECKED_IN",
            and_(
                SeatReservation.status == "RESERVED",
                SeatReservation.end_time > now_utc
            )
        )
    ).count()
    available_seats = max(0, total_seats - occupied_count)

    # 5. Issued Books for student
    now_date = datetime.now()
    search_student_ids = [str(target_user_id)]
    if user_obj:
        if user_obj.roll_number: search_student_ids.append(user_obj.roll_number)
        if user_obj.library_card_number: search_student_ids.append(user_obj.library_card_number)
        if user_obj.email: search_student_ids.append(user_obj.email)

    issues = db.query(BookIssue).filter(
        BookIssue.student_id.in_(search_student_ids)
    ).all()

    active_issues = [
        b for b in issues
        if (b.status or "").lower() in ["issued", "active", "borrowed"]
    ]
    display_issues = active_issues if active_issues else issues[:3]

    issued_books_list = []
    due_soon_count = 0
    for b in display_issues:
        due_dt = b.due_date or (now_date + timedelta(days=7))
        days_left = (due_dt.date() - now_date.date()).days
        is_due_soon = 0 <= days_left <= 3
        if is_due_soon:
            due_soon_count += 1
        issued_books_list.append({
            "id": str(b.id),
            "title": b.book_title or "Library Catalog Book",
            "author": "Reference Book",
            "dueDate": due_dt.strftime("%d %b %Y"),
            "isDueSoon": is_due_soon or (days_left < 0)
        })

    # 6. Recommended Books
    rec_books = db.query(Book).limit(4).all()
    recommended_books_list = []
    for bk in rec_books:
        recommended_books_list.append({
            "id": str(bk.id),
            "title": bk.title,
            "author": bk.author,
            "availableCopies": bk.available_copies if bk.available_copies is not None else 3,
            "shelf": bk.shelf_location or (f"Rack {bk.rack}" if hasattr(bk, "rack") and bk.rack else "Rack A-1")
        })

    # 7. Recent Attendance History - strictly for this authenticated student
    att_logs = db.query(AttendanceLog).filter(
        AttendanceLog.user_id == target_user_id
    ).order_by(AttendanceLog.check_in_time.desc()).limit(10).all()

    recent_attendance_list = []
    for att in att_logs:
        recent_attendance_list.append({
            "date": att.date.strftime("%d %b %Y") if att.date else att.check_in_time.strftime("%d %b %Y"),
            "checkInTime": att.check_in_time.strftime("%I:%M %p") if att.check_in_time else "10:00 AM",
            "method": att.verification_method or "GPS GEOFENCE"
        })

    # 8. Unread notifications
    unread_notifs = db.query(Notification).filter(
        Notification.user_id == target_user_id,
        Notification.is_read == False
    ).count()

    # 9. Dynamic Schedule info
    now_dt = datetime.now(IST)
    effective_gender = gender if gender else (student_profile["gender"])
    sched = get_library_schedule_payload(now_dt, effective_gender)

    # 10. Live Attendance & Check-In Status
    today_att = db.query(AttendanceLog).filter(
        AttendanceLog.user_id == target_user_id,
        AttendanceLog.date == now_dt.date()
    ).order_by(AttendanceLog.check_in_time.desc()).first()

    is_checked_in = (
        (active_res is not None and active_res.status == "CHECKED_IN") or
        (today_att is not None and today_att.status == "PRESENT" and today_att.check_out_time is None)
    )

    checkin_time_str = None
    if active_res and active_res.check_in_time:
        checkin_time_str = svc.format_ist_time(active_res.check_in_time)
    elif today_att and today_att.check_in_time:
        checkin_time_str = svc.format_ist_time(today_att.check_in_time)

    attendance_info = {
        "isCheckedIn": is_checked_in,
        "status": "CHECKED_IN" if is_checked_in else ("CHECKED_OUT" if (today_att and today_att.check_out_time) else "NOT_CHECKED_IN"),
        "checkInTime": checkin_time_str,
        "date": svc.format_ist_date(now_dt),
        "seatCode": serialized_res.get("seatId") if serialized_res else None,
        "floorName": serialized_res.get("floorName") if serialized_res else None,
        "message": f"Checked in to Seat {serialized_res.get('seatId')} at {checkin_time_str}" if (is_checked_in and serialized_res) else ("Currently checked in to library" if is_checked_in else "Not checked in")
    }

    return {
        "success": True,
        "student": student_profile,
        "geofence": geofence_data,
        "stats": {
            "unreadNotifications": unread_notifs,
            "booksIssued": len(active_issues) if active_issues else len(issued_books_list),
            "dueSoonCount": due_soon_count,
            "availableSeats": available_seats,
            "totalSeats": total_seats,
            "totalVisits": db.query(AttendanceLog).filter(AttendanceLog.user_id == target_user_id).count()
        },
        "activeReservation": serialized_res,
        "attendance": attendance_info,
        "issuedBooks": issued_books_list,
        "recommendedBooks": recommended_books_list,
        "recentAttendance": recent_attendance_list,
        "schedule": sched
    }



@router.get("/booking-window")
def booking_window():
    now, window_end = svc.get_booking_window()
    return {
        "now": _iso_utc(now),
        "windowEnd": _iso_utc(window_end),
        "windowMinutes": svc.BOOKING_WINDOW_MINUTES,
        "slotDurationMinutes": svc.SLOT_DURATION_MINUTES,
        "checkInWindowMinutes": svc.CHECKIN_WINDOW_MINUTES
    }


@router.get("/seat-config")
def seat_config(
    db: Session = Depends(get_db),
    user_profile: dict = Depends(get_current_user_profile)
):
    return {
        "user": user_profile,
        "notificationsCount": 0
    }


@router.get("/seats")
def seats(
    floor: str = Query("ground"),
    start_time: str | None = Query(None, description="ISO timestamp for the chosen booking start"),
    db: Session = Depends(get_db)
):
    now, window_end = svc.get_booking_window()

    if start_time:
        try:
            cleaned_time = start_time.replace("Z", "+00:00")
            parsed_dt = datetime.fromisoformat(cleaned_time)
            parsed_start = _to_naive_utc(parsed_dt)
        except (ValueError, Exception):
            raise HTTPException(status_code=400, detail="Invalid start_time format")
    else:
        parsed_start = _to_naive_utc(now)

    seat_rows = svc.get_seat_matrix(db, floor, parsed_start)

    return {
        "floor": floor,
        "floorName": svc._floor_name(floor),
        "startTime": _iso_utc(parsed_start),
        "endTime": _iso_utc(parsed_start + timedelta(minutes=svc.SLOT_DURATION_MINUTES)),
        "totalSeats": len(seat_rows),
        "seats": seat_rows
    }


@router.post("/create-booking")
def create_booking(
    payload: CreateBookingRequest,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id)
):
    seat = db.query(Seat).filter(Seat.seat_code == payload.seatId).first()
    if not seat:
        raise HTTPException(status_code=404, detail="Seat not found")

    user_obj = db.query(User).filter(User.id == user_id).first()
    user_gender = user_obj.gender if user_obj and user_obj.gender else "Female"

    try:
        reservation = svc.book_seat(
            db,
            user_id=user_id,
            seat_id=seat.id,
            start_time=_to_naive_utc(payload.startTime) if payload.startTime else None,
            user_gender=user_gender
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return {
        "success": True,
        "message": f"Seat {seat.seat_code} reserved successfully!",
        "reservation": svc.serialize_reservation(db, reservation)
    }


@router.post("/set-gender")
def set_gender(
    payload: UpdateGenderRequest,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id)
):
    user_obj = db.query(User).filter(User.id == user_id).first()
    if user_obj:
        user_obj.gender = payload.gender.strip().capitalize()
        db.commit()
        db.refresh(user_obj)
        return {"success": True, "gender": user_obj.gender}
    return {"success": False, "message": "User not found"}



@router.get("/my-bookings")
def my_bookings(
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id)
):
    reservations = svc.get_my_bookings(db, user_id)
    return {
        "user": get_current_user_profile(db=db, user_id=user_id),
        "notificationsCount": 0,
        "bookings": [svc.serialize_reservation(db, r) for r in reservations]
    }


@router.get("/active-checkin")
def active_checkin(
    booking_id: str | None = Query(None),
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id)
):
    reservation = None
    if booking_id:
        try:
            b_uuid = uuid.UUID(str(booking_id))
            reservation = db.query(SeatReservation).filter(
                SeatReservation.id == b_uuid,
                SeatReservation.user_id == user_id
            ).first()
        except Exception:
            pass

    if not reservation:
        reservation = svc.get_active_reservation(db, user_id)

    setting = get_active_geofence(db)
    geofence_dict = {
        "isActive": bool(setting and setting.is_active),
        "isConfigured": bool(setting and setting.is_active and setting.latitude and setting.longitude),
        "latitude": float(setting.latitude) if (setting and setting.latitude) else None,
        "longitude": float(setting.longitude) if (setting and setting.longitude) else None,
        "radius": int(setting.radius_meters) if (setting and setting.radius_meters) else 120,
        "radiusMeters": float(setting.radius_meters) if (setting and setting.radius_meters) else 120.0
    }

    return {
        "user": get_current_user_profile(db=db, user_id=user_id),
        "notificationsCount": 0,
        "reservation": svc.serialize_reservation(db, reservation) if reservation else None,
        "geofence": geofence_dict
    }


@router.post("/validate-geofence")
def validate_geofence(
    payload: GeofenceValidateRequest,
    db: Session = Depends(get_db)
):
    """
    Checks student's live GPS coordinates against library geofence boundary.
    """
    status = check_geofence_status(db, payload.latitude, payload.longitude)
    return status


@router.post("/checkin")
def checkin(
    payload: CheckInRequest,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id)
):
    res_uuid = None
    if payload.reservationId:
        try:
            res_uuid = uuid.UUID(str(payload.reservationId))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid reservationId UUID format")

    try:
        reservation = svc.check_in(
            db,
            reservation_id=res_uuid,
            user_id=user_id,
            latitude=payload.latitude,
            longitude=payload.longitude,
            verification_method="BARCODE"
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return {
        "success": True,
        "message": "Checked in successfully! Attendance marked as PRESENT.",
        "reservation": svc.serialize_reservation(db, reservation)
    }


@router.post("/scan-barcode")
def scan_barcode_student(
    payload: BarcodeScanRequest,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id)
):
    """
    Student-side Barcode Scan:
    If student scans barcode, checks in if reserved; checks out if already checked in!
    """
    try:
        user = db.get(User, user_id)
        barcode = (payload.barcode or "").strip()
        if not barcode and user:
            barcode = user.roll_number or user.library_card_number or str(user.id)
        res = svc.process_barcode_scan(db, barcode=barcode, current_user_id=user_id)
        if res.get("student") and res["student"].get("id") and res["student"]["id"] != str(user_id):
            raise ValueError("You can only check in or check out for your own account.")
        return res
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))



@router.post("/checkout")
def checkout(
    payload: CheckOutRequest,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id)
):
    try:
        res_uuid = uuid.UUID(str(payload.reservationId))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid reservationId UUID format")

    try:
        res = svc.check_out(db, res_uuid, user_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return res


@router.post("/cancel")
def cancel(
    payload: CheckOutRequest,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id)
):
    try:
        res_uuid = uuid.UUID(str(payload.reservationId))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid reservationId UUID format")

    try:
        res = svc.cancel_reservation(db, res_uuid, user_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return res


@router.post("/agent/execute")
def agent_execute(
    payload: AgentExecuteRequest,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id)
):
    """
    Executes the LangGraph StateGraph workflow for intelligent agentic operations.
    """
    state_input = {
        "user_id": str(user_id),
        "action": payload.action,
        "seat_code": payload.seat_code,
        "floor": payload.floor,
        "start_time": payload.start_time,
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "reservation_id": payload.reservation_id,
        "query": payload.query
    }

    result = run_agent_workflow(db, state_input)
    if not result.get("success", True):
        raise HTTPException(
            status_code=result.get("status_code", 400),
            detail=result.get("message", "Agent operation failed.")
        )

    return result



from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user_id, get_current_user_optional, get_current_user_profile
from ..models import Seat, Book, BookIssue, BookReview
from ..schemas import CreateBookingRequest, CheckInRequest, CheckOutRequest, CreateReviewSchema
from ..services import reservation_service as svc

router = APIRouter(prefix="/api/student", tags=["student"])

FLOOR_NAMES = {"GROUND": "Ground Floor", "FIRST": "First Floor"}


@router.post("/reviews")
def create_student_review(
    payload: CreateReviewSchema,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
    current_user = Depends(get_current_user_optional)
):
    rating = max(1, min(5, int(payload.rating)))
    student_ids = {str(user_id)}
    if current_user:
        student_ids.add(str(current_user.id))
        if current_user.roll_number:
            student_ids.add(str(current_user.roll_number))
    if str(user_id) == "student-demo-1":
        student_ids.add("me")
    existing = db.query(BookReview).filter(
        BookReview.student_id.in_(student_ids),
        BookReview.book_title == payload.bookTitle
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="You have already reviewed this book.")

    review = BookReview(
        student_id=str(user_id),
        book_title=payload.bookTitle,
        rating=rating,
        review_text=(payload.review or "").strip() or None
    )
    db.add(review)
    db.commit()
    return {"success": True, "message": f"Review for '{payload.bookTitle}' saved successfully."}


def _floor_name(floor_code: str) -> str:
    return FLOOR_NAMES.get(floor_code.upper(), floor_code)


def _time_slot_text(start: datetime, end: datetime | None = None) -> str:
    return start.strftime('%I:%M %p')


def _to_naive_utc(dt: datetime) -> datetime:
    """The frontend always sends timestamps via JS's toISOString(), which
    is UTC with a 'Z'/offset. The database stores naive datetimes. This
    converts any timezone-aware datetime to naive UTC so it can be safely
    compared against svc.utcnow() and the values already in the DB."""
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _iso_utc(dt: datetime) -> str:
    """Serialize a naive-UTC datetime with an explicit 'Z' so the
    frontend's `new Date(...)` parses it as UTC, not local time."""
    return dt.isoformat() + "Z"


def _serialize_reservation(db: Session, reservation) -> dict:
    seat = db.get(Seat, reservation.seat_id)
    check_in_deadline = reservation.start_time + timedelta(
        minutes=svc.CHECKIN_WINDOW_MINUTES
    )
    now = svc.utcnow()

    is_upcoming = (now < reservation.start_time) and (reservation.status == "RESERVED")
    is_checkin_open = (reservation.start_time <= now <= check_in_deadline) and (reservation.status == "RESERVED")
    is_expired = (now > check_in_deadline) and (reservation.status == "RESERVED")

    seconds_until_start = max(0, int((reservation.start_time - now).total_seconds())) if is_upcoming else 0
    if is_checkin_open:
        remaining_seconds = max(0, int((check_in_deadline - now).total_seconds()))
    elif is_upcoming:
        remaining_seconds = svc.CHECKIN_WINDOW_MINUTES * 60
    else:
        remaining_seconds = 0

    return {
        "id": str(reservation.id),
        "seatId": seat.seat_code if seat else None,
        "seatLabel": seat.seat_code if seat else None,
        "floor": seat.floor if seat else None,
        "floorName": _floor_name(seat.floor) if seat else None,
        "date": reservation.booking_date.isoformat(),
        "startTime": _iso_utc(reservation.start_time),
        "endTime": _iso_utc(reservation.end_time),
        "timeSlot": _time_slot_text(reservation.start_time),
        "status": "EXPIRED" if is_expired else reservation.status,
        "checkInTime": _iso_utc(reservation.check_in_time) if reservation.check_in_time else None,
        "checkOutTime": _iso_utc(reservation.check_out_time) if reservation.check_out_time else None,
        "checkInDeadline": _iso_utc(check_in_deadline),
        "isUpcoming": is_upcoming,
        "isCheckinOpen": is_checkin_open,
        "secondsUntilStart": seconds_until_start,
        "remainingSeconds": remaining_seconds,
        "serverNow": _iso_utc(now)
    }


@router.get("/booking-window")
def booking_window():
    now, window_end = svc.get_booking_window()
    return {
        "now": _iso_utc(now),
        "windowEnd": _iso_utc(window_end),
        "windowMinutes": svc.BOOKING_WINDOW_MINUTES,
        "checkInWindowMinutes": svc.CHECKIN_WINDOW_MINUTES
    }


@router.get("/seat-config")
def seat_config():
    return {
        "user": get_current_user_profile(),
        "notificationsCount": 0
    }


@router.get("/seats-matrix-raw")
def seats_matrix_raw(
    floor: str = Query("ground"),
    start_time: str | None = Query(None, description="ISO timestamp for the chosen booking start"),
    db: Session = Depends(get_db)
):
    now, window_end = svc.get_booking_window()

    if start_time:
        try:
            cleaned_time = start_time.replace("Z", "+00:00")
            parsed_dt = datetime.fromisoformat(cleaned_time)
            parsed_start = _to_naive_utc(parsed_dt)
        except (ValueError, Exception):
            raise HTTPException(status_code=400, detail="Invalid start_time format")
    else:
        parsed_start = _to_naive_utc(now)

    seat_rows = svc.get_seat_matrix(db, floor, parsed_start)

    return {
        "floor": floor,
        "floorName": _floor_name(floor),
        "startTime": _iso_utc(parsed_start),
        "endTime": _iso_utc(parsed_start + timedelta(minutes=svc.SLOT_DURATION_MINUTES)),
        "totalSeats": len(seat_rows),
        "seats": seat_rows
    }


@router.post("/create-booking")
def create_booking(
    payload: CreateBookingRequest,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id)
):
    seat = db.query(Seat).filter(Seat.seat_code == payload.seatId).first()
    if not seat:
        raise HTTPException(status_code=404, detail="Seat not found")

    user_obj = db.query(User).filter(User.id == user_id).first()
    user_gender = user_obj.gender if user_obj and user_obj.gender else "Female"

    try:
        reservation = svc.book_seat(
            db,
            user_id=user_id,
            seat_id=seat.id,
            start_time=_to_naive_utc(payload.startTime) if payload.startTime else None,
            user_gender=user_gender
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return {
        "success": True,
        "message": f"Seat {seat.seat_code} reserved successfully!",
        "reservation": svc.serialize_reservation(db, reservation)
    }


@router.get("/my-bookings")
def my_bookings(
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id)
):
    reservations = svc.get_my_bookings(db, user_id)
    return {
        "user": get_current_user_profile(),
        "notificationsCount": 0,
        "bookings": [_serialize_reservation(db, r) for r in reservations]
    }


@router.get("/active-checkin")
def active_checkin(
    booking_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id)
):
    try:
        target_user_id = user_id if isinstance(user_id, uuid.UUID) else uuid.UUID(str(user_id))
    except Exception:
        target_user_id = user_id

    reservation = None
    if booking_id:
        try:
            bid = uuid.UUID(str(booking_id).strip())
            reservation = db.get(SeatReservation, bid)
        except Exception:
            pass

    if not reservation:
        reservation = svc.get_active_reservation(db, target_user_id)

    serialized_res = _serialize_reservation(db, reservation) if reservation else None

    # Attendance log details
    now_dt = datetime.now(IST)
    today_att = db.query(AttendanceLog).filter(
        AttendanceLog.user_id == target_user_id,
        AttendanceLog.date == now_dt.date()
    ).order_by(AttendanceLog.check_in_time.desc()).first()

    is_checked_in = (
        (reservation is not None and reservation.status == "CHECKED_IN") or
        (today_att is not None and today_att.status == "PRESENT" and today_att.check_out_time is None)
    )

    checkin_time_str = None
    if reservation and reservation.check_in_time:
        checkin_time_str = svc.format_ist_time(reservation.check_in_time)
    elif today_att and today_att.check_in_time:
        checkin_time_str = svc.format_ist_time(today_att.check_in_time)

    attendance_info = {
        "isCheckedIn": is_checked_in,
        "status": "CHECKED_IN" if is_checked_in else ("CHECKED_OUT" if (today_att and today_att.check_out_time) else "NOT_CHECKED_IN"),
        "checkInTime": checkin_time_str,
        "date": svc.format_ist_date(now_dt),
        "seatCode": serialized_res.get("seatId") if serialized_res else None,
        "floorName": serialized_res.get("floorName") if serialized_res else None,
        "message": f"Checked in to Seat {serialized_res.get('seatId')} at {checkin_time_str}" if (is_checked_in and serialized_res) else ("Currently checked in to library" if is_checked_in else "Not checked in")
    }

    geo_setting = get_active_geofence(db)
    geofence_info = {
        "isConfigured": bool(geo_setting and geo_setting.latitude is not None and geo_setting.longitude is not None),
        "isActive": bool(geo_setting.is_active) if geo_setting else False,
        "latitude": float(geo_setting.latitude) if geo_setting and geo_setting.latitude is not None else None,
        "longitude": float(geo_setting.longitude) if geo_setting and geo_setting.longitude is not None else None,
        "radius": float(geo_setting.radius_meters) if geo_setting and geo_setting.radius_meters else 120.0,
        "campusName": geo_setting.library_name if geo_setting and geo_setting.library_name else "Main Central Library"
    }

    return {
        "user": get_current_user_profile(db=db, user_id=target_user_id),
        "notificationsCount": 0,
        "reservation": serialized_res,
        "attendance": attendance_info,
        "geofence": geofence_info
    }


@router.post("/checkin")
def checkin(
    payload: CheckInRequest,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id)
):
    try:
        reservation = svc.check_in(db, payload.reservationId, user_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return {"success": True, "reservation": _serialize_reservation(db, reservation)}


@router.post("/checkout")
def checkout(
    payload: CheckOutRequest,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id)
):
    try:
        res = svc.check_out(db, payload.reservationId, user_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return {"success": True, "message": "Checked out successfully and seat is now available for others"}


@router.post("/cancel")
def cancel(
    payload: CheckInRequest,  # reuse {reservationId}
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id)
):
    try:
        res = svc.cancel_reservation(db, payload.reservationId, user_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return {"success": True, "message": "Booking cancelled and seat released"}


@router.get("/recommendations")
def get_recommendations(
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
    current_user = Depends(get_current_user_optional)
):
    books = db.query(Book).all()
    if not books:
        return {"success": True, "recommendations": []}

    student_ids = set()
    if user_id:
        student_ids.add(str(user_id))

    if current_user and hasattr(current_user, "id"):
        student_ids.add(str(current_user.id))
        if getattr(current_user, "roll_number", None):
            student_ids.add(str(current_user.roll_number))
        if getattr(current_user, "library_card_number", None):
            student_ids.add(str(current_user.library_card_number))
        if getattr(current_user, "email", None):
            student_ids.add(str(current_user.email))

    if student_ids:
        history = db.query(BookIssue).filter(BookIssue.student_id.in_(student_ids)).all()
    else:
        history = []
    books_by_id = {str(book.id): book for book in books}
    books_by_title = {book.title.casefold(): book for book in books}
    books_by_category = {}
    for book in books:
        books_by_category.setdefault(book.category, []).append(book)

    reviews_by_title = {}
    review_rows = db.query(BookReview).all()
    for review in review_rows:
        reviews_by_title.setdefault(review.book_title, []).append(review)

    history_ids = {issue.book_id for issue in history}
    history_titles = {issue.book_title.casefold() for issue in history}
    category_weights = {}
    author_weights = {}
    for issue in history:
        history_book = books_by_id.get(str(issue.book_id)) or books_by_title.get(issue.book_title.casefold())
        if history_book:
            category_weights[history_book.category] = category_weights.get(history_book.category, 0) + 1
            author_weights[history_book.author] = author_weights.get(history_book.author, 0) + 1

    recommended = []
    scored_books = []
    for b in books:
        if str(b.id) in history_ids or b.title.casefold() in history_titles:
            continue

        reviews = reviews_by_title.get(b.title, [])
        avg_rating = 0.0
        review_cnt = len(reviews)
        if reviews:
            avg_rating = round(sum(r.rating for r in reviews) / len(reviews), 1)
        rating_score = (avg_rating / 5) * 20 if avg_rating else 10
        category_score = min(category_weights.get(b.category, 0) * 15, 35)
        author_score = min(author_weights.get(b.author, 0) * 12, 25)
        availability_score = 10 if b.available_copies > 0 else 0
        score = round(min(100, 20 + category_score + author_score + rating_score + availability_score))
        scored_books.append((score, avg_rating, review_cnt, b))

    scored_books.sort(key=lambda item: (item[0], item[1], item[3].available_copies), reverse=True)

    for idx, (match_score, avg_rating, review_cnt, b) in enumerate(scored_books):

        alternates = [alternate for alternate in books_by_category.get(b.category, []) if alternate.id != b.id][:4]

        alt_list = []
        for alt_idx, alt_b in enumerate(alternates):
            alt_reviews = reviews_by_title.get(alt_b.title, [])
            alt_rating = round(sum(review.rating for review in alt_reviews) / len(alt_reviews), 1) if alt_reviews else 0
            alt_list.append({
                "id": alt_b.id,
                "title": alt_b.title,
                "author": alt_b.author,
                "rating": alt_rating,
                "match": max(1, match_score - 2 - alt_idx),
                "category": alt_b.category,
                "copies": alt_b.available_copies,
                "shelfLocation": alt_b.shelf_location or alt_b.shelf or "Not assigned",
                "whyAlternate": f"Similar {alt_b.category} title by {alt_b.author} available in library."
            })

        b_category = getattr(b, "category", None) or "General"
        b_author = getattr(b, "author", None) or "Unknown Author"
        b_language = getattr(b, "language", None) or "English"
        b_desc = getattr(b, "description", None) or f"Featured {b_category} book by {b_author}."
        b_pub_year = getattr(b, "pub_year", None) or getattr(b, "publication_year", None) or "-"
        b_isbn = getattr(b, "isbn", None) or "-"
        b_acc = getattr(b, "accession_number", None) or "-"
        b_class = getattr(b, "class_number", None) or "-"
        b_price_val = getattr(b, "price", 0.0)
        b_price = float(b_price_val) if b_price_val is not None else 0.0
        b_shelf = getattr(b, "shelf_location", None) or getattr(b, "shelf", None) or "Not assigned"
        b_pages = getattr(b, "pages", None) or "-"
        b_avail = getattr(b, "available_copies", 1)
        b_cover = getattr(b, "cover_image_url", None) or "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='160' viewBox='0 0 120 160'><rect width='100%' height='100%' fill='%233D539F'/><text x='60' y='80' fill='%23FFFFFF' font-size='10' font-weight='bold' text-anchor='middle'>BOOK</text></svg>"

        recommended.append({
            "id": str(b.id),
            "title": getattr(b, "title", "Untitled Book"),
            "author": b_author,
            "tags": [b_category, b_language, "Library Collection"],
            "rating": avg_rating or 0,
            "ratingsCount": str(review_cnt),
            "desc": b_desc,
            "match": match_score,
            "badge": "Recommended for you" if idx < 3 else ("Top Pick" if idx < 6 else "Popular in Library"),
            "publishedYear": str(b_pub_year),
            "isbn": b_isbn,
            "accessionNumber": b_acc,
            "classNumber": b_class,
            "price": b_price,
            "shelfLocation": b_shelf,
            "pages": str(b_pages),
            "copiesAvailable": b_avail,
            "cover": b_cover,
            "whyReasons": [
                {"label": "Category", "detail": f"Matches interest in {b_category}"},
                {"label": "Author", "detail": f"Author: {b_author}"},
                {"label": "Availability", "detail": f"{b_avail} copies currently available"},
                {"label": "Rating", "detail": f"{avg_rating or 'Not rated'}/5 rated in library"}
            ],
            "alternateBooks": alt_list
        })

    rating_distribution = {str(star): 0 for star in range(1, 6)}
    for review in review_rows:
        rating_distribution[str(max(1, min(5, review.rating)))] += 1

    history_payload = []
    for issue in sorted(history, key=lambda row: row.issue_date or datetime.min, reverse=True):
        issue_book = books_by_id.get(str(issue.book_id)) or books_by_title.get(issue.book_title.casefold())
        history_payload.append({
            "id": issue.id,
            "title": issue.book_title,
            "author": issue_book.author if issue_book else "Unknown Author",
            "category": issue_book.category if issue_book else "General",
            "issueDate": issue.issue_date.strftime("%d %b %Y") if issue.issue_date else "-",
            "dueDate": issue.due_date.strftime("%d %b %Y") if issue.due_date else "-",
            "returnDate": issue.return_date.strftime("%d %b %Y") if issue.return_date else "Pending",
            "status": issue.status,
            "statusType": "active" if issue.status.lower() in {"active", "issued"} else "returned"
        })

    category_counts = {}
    author_counts = {}
    for issue in history:
        issue_book = books_by_id.get(str(issue.book_id)) or books_by_title.get(issue.book_title.casefold())
        if issue_book:
            category_counts[issue_book.category] = category_counts.get(issue_book.category, 0) + 1
            author_counts[issue_book.author] = author_counts.get(issue_book.author, 0) + 1

    average_rating = round(sum(review.rating for review in review_rows) / len(review_rows), 1) if review_rows else 0
    return {
        "success": True,
        "recommendations": recommended,
        "history": history_payload,
        "profile": {
            "totalBorrowed": len(history_payload),
            "averageRating": average_rating,
            "favoriteAuthors": [author for author, _ in sorted(author_counts.items(), key=lambda item: item[1], reverse=True)[:4]],
            "favoriteTopics": [category for category, _ in sorted(category_counts.items(), key=lambda item: item[1], reverse=True)[:4]]
        },
        "ratingSummary": {
            "average": average_rating,
            "total": len(review_rows),
            "distribution": rating_distribution
        }
    }
