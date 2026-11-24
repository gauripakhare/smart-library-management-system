import uuid
from datetime import datetime, timedelta, timezone, date
from decimal import Decimal
from typing import Optional

from sqlalchemy import select, and_, or_, func, case
from sqlalchemy.orm import Session

from ..models import User, Seat, SeatReservation, AttendanceLog, GeofenceSetting, Notification
from ..utils.geofence import check_geofence_status
from ..utils.library_schedule import get_library_operating_hours, is_time_within_library_hours, IST


BOOKING_WINDOW_MINUTES = 30   # Students can only book slots within 30 min from current time
SLOT_DURATION_MINUTES = 30    # Each reservation is 30 minutes
CHECKIN_WINDOW_MINUTES = 15   # 15 minutes to check-in after slot starts

FLOOR_NAMES = {"GROUND": "Ground Floor", "FIRST": "First Floor"}


def utcnow() -> datetime:
    """Current UTC timezone-aware datetime for consistent time comparisons."""
    return datetime.now(timezone.utc)


def ist_now() -> datetime:
    """Current India Standard Time (IST) datetime."""
    return datetime.now(IST)


def format_ist_time(dt: Optional[datetime]) -> str:
    """Format any datetime to Indian Standard Time (IST) 12-hour and 24-hour string (e.g. 09:00 PM (21:00))."""
    if not dt:
        return "-"
    aware = _ensure_aware(dt)
    ist_dt = aware.astimezone(IST)
    return f"{ist_dt.strftime('%I:%M %p')} ({ist_dt.strftime('%H:%M')})"


def format_ist_time_both(dt: Optional[datetime]) -> str:
    """Format any datetime to Indian Standard Time (IST) 12-hour and 24-hour string."""
    return format_ist_time(dt)


def format_ist_date(dt: Optional[datetime]) -> str:
    """Format any datetime to Indian Standard Time (IST) date string (e.g. 07 Oct 2026)."""
    if not dt:
        return "-"
    aware = _ensure_aware(dt)
    ist_dt = aware.astimezone(IST)
    return ist_dt.strftime("%d %b %Y")


def _ensure_aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _floor_name(floor_code: str) -> str:
    return FLOOR_NAMES.get(str(floor_code).upper(), floor_code)


def _iso_utc(dt: Optional[datetime]) -> Optional[str]:
    if not dt:
        return None
    aware = _ensure_aware(dt)
    return aware.isoformat().replace("+00:00", "Z")


def get_booking_window(now: Optional[datetime] = None):
    """
    Student can pick any start time from right now up to 30 minutes from now.
    """
    now = _ensure_aware(now or utcnow())
    return now, now + timedelta(minutes=BOOKING_WINDOW_MINUTES)


def serialize_reservation(db: Session, reservation: SeatReservation) -> dict:
    seat = db.get(Seat, reservation.seat_id)
    start_time = _ensure_aware(reservation.start_time)
    end_time = _ensure_aware(reservation.end_time)
    check_in_deadline = start_time + timedelta(minutes=CHECKIN_WINDOW_MINUTES)
    now = utcnow()

    is_upcoming = (now < start_time) and (reservation.status == "RESERVED")
    is_checkin_open = (start_time <= now <= check_in_deadline) and (reservation.status == "RESERVED")
    is_expired = (now > check_in_deadline) and (reservation.status == "RESERVED")

    seconds_until_start = max(0, int((start_time - now).total_seconds())) if is_upcoming else 0
    if is_checkin_open:
        remaining_seconds = max(0, int((check_in_deadline - now).total_seconds()))
    elif is_upcoming:
        remaining_seconds = CHECKIN_WINDOW_MINUTES * 60
    else:
        remaining_seconds = 0

    return {
        "id": str(reservation.id),
        "seatId": seat.seat_code if seat else None,
        "seatLabel": seat.seat_code if seat else None,
        "floor": seat.floor if seat else None,
        "floorName": _floor_name(seat.floor) if seat else None,
        "date": reservation.booking_date.isoformat(),
        "startTime": _iso_utc(start_time),
        "endTime": _iso_utc(end_time),
        "timeSlot": start_time.strftime("%I:%M %p"),
        "status": "EXPIRED" if is_expired else reservation.status,
        "checkInTime": _iso_utc(_ensure_aware(reservation.check_in_time)) if reservation.check_in_time else None,
        "checkOutTime": _iso_utc(_ensure_aware(reservation.check_out_time)) if reservation.check_out_time else None,
        "checkInDeadline": _iso_utc(check_in_deadline),
        "isUpcoming": is_upcoming,
        "isCheckinOpen": is_checkin_open,
        "secondsUntilStart": seconds_until_start,
        "remainingSeconds": remaining_seconds,
        "serverNow": _iso_utc(now)
    }


def _seat_is_free(db: Session, seat_id: uuid.UUID, start_time: datetime, end_time: datetime, exclude_reservation_id=None):
    # A seat is NOT free if:
    # 1. Any student is currently CHECKED_IN to this seat (they occupy it continuously until checkout)
    # 2. Or another student has an active RESERVED booking overlapping with [start_time, end_time]
    query = select(SeatReservation).where(
        SeatReservation.seat_id == seat_id,
        or_(
            SeatReservation.status == "CHECKED_IN",
            and_(
                SeatReservation.status == "RESERVED",
                SeatReservation.start_time < end_time,
                SeatReservation.end_time > start_time
            )
        )
    )
    if exclude_reservation_id:
        query = query.where(SeatReservation.id != exclude_reservation_id)
    return db.execute(query).scalars().first() is None


_SEATS_CACHE = {}

class CachedSeat:
    __slots__ = ("id", "seat_code", "floor", "is_active")
    def __init__(self, id, seat_code, floor, is_active=True):
        self.id = id
        self.seat_code = seat_code
        self.floor = floor
        self.is_active = is_active


def _get_cached_seats(db: Session, floor: str) -> list[CachedSeat]:
    floor_upper = floor.upper()
    if floor_upper in _SEATS_CACHE:
        return _SEATS_CACHE[floor_upper]
    rows = db.execute(
        select(Seat.id, Seat.seat_code, Seat.floor, Seat.is_active).where(
            func.upper(Seat.floor) == floor_upper,
            Seat.is_active == True
        ).order_by(Seat.seat_code)
    ).all()
    cached = [CachedSeat(r[0], r[1], r[2], r[3]) for r in rows]
    if cached:
        _SEATS_CACHE[floor_upper] = cached
    return cached


def get_seat_matrix(db: Session, floor: str, start_time: datetime):
    start_time = _ensure_aware(start_time)
    end_time = start_time + timedelta(minutes=SLOT_DURATION_MINUTES)

    seats = _get_cached_seats(db, floor)

    # Fast single batch query:
    # - Any seat currently CHECKED_IN is occupied until student checks out
    # - Any seat with RESERVED status overlapping with target slot is reserved
    active_res = db.execute(
        select(SeatReservation.seat_id, SeatReservation.status).where(
            or_(
                SeatReservation.status == "CHECKED_IN",
                and_(
                    SeatReservation.status == "RESERVED",
                    SeatReservation.start_time < end_time,
                    SeatReservation.end_time > start_time
                )
            )
        )
    ).all()

    # Prioritize CHECKED_IN status if multiple records exist
    status_by_seat_id = {}
    for seat_id_val, res_status_val in active_res:
        if res_status_val == "CHECKED_IN":
            status_by_seat_id[seat_id_val] = "CHECKED_IN"
        elif seat_id_val not in status_by_seat_id:
            status_by_seat_id[seat_id_val] = res_status_val

    result = []
    for seat in seats:
        res_status = status_by_seat_id.get(seat.id)
        if res_status is None:
            status = "available"
        elif res_status == "CHECKED_IN":
            status = "occupied"
        else:
            status = "reserved"

        result.append({
            "seatCode": seat.seat_code,
            "status": status
        })

    return result


def get_available_seats(db: Session, floor: str, start_time: Optional[datetime] = None):
    now, _ = get_booking_window()
    start_time = _ensure_aware(start_time or now)
    end_time = start_time + timedelta(minutes=SLOT_DURATION_MINUTES)

    seats = db.execute(
        select(Seat).where(
            func.upper(Seat.floor) == floor.upper(),
            Seat.is_active == True
        )
    ).scalars().all()

    return [
        seat for seat in seats
        if _seat_is_free(db, seat.id, start_time, end_time)
    ]


def book_seat(
    db: Session,
    user_id: uuid.UUID,
    seat_id: uuid.UUID,
    start_time: Optional[datetime] = None,
    user_gender: Optional[str] = "Female"
) -> SeatReservation:
    now, max_window = get_booking_window()
    start_time = _ensure_aware(start_time or now)

    # Validate that start_time falls within allowed library hours for user's gender and weekday
    is_allowed, error_msg = is_time_within_library_hours(start_time, gender=user_gender)
    if not is_allowed:
        raise ValueError(error_msg)

    min_allowed = now - timedelta(minutes=2)
    max_allowed = now + timedelta(minutes=BOOKING_WINDOW_MINUTES + 1)

    if start_time < min_allowed:
        raise ValueError("Selected booking time is in the past. Please choose a slot starting now or in the next 30 minutes.")

    if start_time > max_allowed:
        raise ValueError("Advance booking is restricted to 30 minutes from current time. Selected time is beyond the 30-minute booking window.")

    end_time = start_time + timedelta(minutes=SLOT_DURATION_MINUTES)

    seat = db.get(Seat, seat_id)
    if not seat:
        raise ValueError("Seat does not exist")
    if not seat.is_active:
        raise ValueError("Seat is inactive")

    if not _seat_is_free(db, seat_id, start_time, end_time):
        raise ValueError(f"Seat {seat.seat_code} is already reserved for this time slot.")

    existing_student_booking = db.execute(
        select(SeatReservation).where(
            SeatReservation.user_id == user_id,
            or_(
                SeatReservation.status == "CHECKED_IN",
                and_(
                    SeatReservation.status == "RESERVED",
                    SeatReservation.start_time < end_time,
                    SeatReservation.end_time > start_time
                )
            )
        )
    ).scalars().first()

    if existing_student_booking:
        if existing_student_booking.status == "CHECKED_IN":
            raise ValueError("You are currently checked in to a library seat. Please check out before booking another seat.")
        else:
            raise ValueError("You already have an active seat reservation during this time slot.")

    reservation = SeatReservation(
        id=uuid.uuid4(),
        user_id=user_id,
        seat_id=seat_id,
        booking_date=start_time.date(),
        start_time=start_time,
        end_time=end_time,
        status="RESERVED"
    )

    db.add(reservation)

    notif = Notification(
        id=uuid.uuid4(),
        user_id=user_id,
        title="Seat Reserved",
        message=f"Seat {seat.seat_code} reserved successfully for {start_time.strftime('%I:%M %p')}. Check-in window will open at {start_time.strftime('%I:%M %p')}.",
        type="RESERVATION_CONFIRM"
    )
    db.add(notif)

    db.commit()
    db.refresh(reservation)

    return reservation


def check_in(
    db: Session,
    reservation_id: Optional[uuid.UUID],
    user_id: uuid.UUID,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    verification_method: str = "BARCODE"
) -> SeatReservation:
    if reservation_id:
        reservation = db.get(SeatReservation, reservation_id)
    else:
        reservation = get_active_reservation(db, user_id)

    if not reservation:
        raise ValueError("No active seat reservation found for this student. Seat must be booked before check-in is possible.")

    if reservation.user_id != user_id:
        raise ValueError("This reservation does not belong to you.")

    if reservation.status == "CHECKED_IN":
        return reservation

    if reservation.status != "RESERVED":
        raise ValueError(f"Cannot check in: reservation status is {reservation.status}.")

    now = utcnow()
    start_time = _ensure_aware(reservation.start_time)
    check_in_deadline = start_time + timedelta(minutes=CHECKIN_WINDOW_MINUTES)

    # If already past the 15-minute check-in deadline
    if now > check_in_deadline and verification_method != "BARCODE":
        reservation.status = "EXPIRED"
        reservation.cancelled_at = now
        reservation.cancellation_reason = "Expired: 15-minute check-in deadline passed"
        seat = db.get(Seat, reservation.seat_id)
        seat_name = seat.seat_code if seat else "your seat"
        notif = Notification(
            id=uuid.uuid4(),
            user_id=user_id,
            title="Seat Reservation Expired",
            message=f"Your reservation for {seat_name} has expired and was automatically cancelled because check-in was not completed within 15 minutes of your slot start time.",
            type="RESERVATION_CANCEL",
            is_read=False,
            created_at=now
        )
        db.add(notif)
        db.commit()

        user = db.get(User, user_id)
        if user and user.email:
            try:
                from ..agent.email_agent import send_seat_cancellation_email
                slot_time = start_time.strftime("%I:%M %p")
                send_seat_cancellation_email(
                    recipient_email=user.email,
                    student_name=user.name or "Student",
                    seat_code=seat_name,
                    floor_name=_floor_name(seat.floor) if seat else "",
                    slot_time=slot_time
                )
            except Exception:
                pass

        raise ValueError("Check-in window (15 minutes from slot start) has expired. Your reservation has been cancelled.")

    if verification_method == "GEOFENCE" and latitude is not None and longitude is not None:
        geo = check_geofence_status(db, latitude, longitude)
        if not geo["inside"]:
            raise ValueError(
                f"Geofence check failed: You are currently {int(geo['relative_distance_meters'])}m from the library. "
                f"Check-in is only allowed within the {int(geo['boundary_limit_meters'])}m library boundary."
            )

    reservation.status = "CHECKED_IN"
    reservation.check_in_time = now

    att_log = AttendanceLog(
        id=uuid.uuid4(),
        user_id=user_id,
        date=now.date(),
        check_in_time=now,
        latitude=Decimal(str(latitude)) if latitude is not None else None,
        longitude=Decimal(str(longitude)) if longitude is not None else None,
        verification_method=verification_method,
        status="PRESENT"
    )
    db.add(att_log)

    seat = db.get(Seat, reservation.seat_id)
    seat_name = seat.seat_code if seat else "your seat"

    notif = Notification(
        id=uuid.uuid4(),
        user_id=user_id,
        title="Check-in Successful",
        message=f"You have successfully checked in to Seat {seat_name}. Attendance recorded as PRESENT.",
        type="ATTENDANCE"
    )
    db.add(notif)

    db.commit()
    db.refresh(reservation)

    return reservation


def check_out(db: Session, reservation_id: uuid.UUID, user_id: Optional[uuid.UUID] = None) -> dict:
    reservation = db.get(SeatReservation, reservation_id)

    if not reservation:
        raise ValueError("Reservation not found")

    if reservation.status == "CHECKED_OUT":
        return {
            "id": str(reservation_id),
            "success": True,
            "message": "Already checked out."
        }

    actual_user_id = reservation.user_id
    now = utcnow()
    reservation.status = "CHECKED_OUT"
    reservation.check_out_time = now
    reservation.end_time = now

    # Update latest open attendance log for this user
    log = db.execute(
        select(AttendanceLog)
        .where(
            AttendanceLog.user_id == actual_user_id,
            AttendanceLog.check_out_time == None
        )
        .order_by(AttendanceLog.check_in_time.desc())
    ).scalars().first()

    if log:
        log.check_out_time = now
        log.status = "CHECKED_OUT"

    seat = db.get(Seat, reservation.seat_id)
    seat_name = seat.seat_code if seat else "Seat"

    notif = Notification(
        id=uuid.uuid4(),
        user_id=actual_user_id,
        title="Checked Out",
        message=f"Checked out from {seat_name}. Seat is now released and available for other students.",
        type="ATTENDANCE"
    )
    db.add(notif)

    db.commit()

    return {
        "id": str(reservation_id),
        "success": True,
        "message": f"Checked out successfully from {seat_name} and seat is now available for others."
    }


def cancel_reservation(db: Session, reservation_id: uuid.UUID, user_id: Optional[uuid.UUID] = None) -> dict:
    reservation = db.get(SeatReservation, reservation_id)

    if not reservation:
        raise ValueError("Reservation not found")

    if user_id and reservation.user_id != user_id:
        raise ValueError("Not your reservation")

    if reservation.status == "CANCELLED":
        return {"id": str(reservation_id), "success": True, "message": "Reservation is already cancelled."}

    if reservation.status != "RESERVED":
        raise ValueError(f"Only a pending (not yet checked-in) booking can be cancelled. Current status is {reservation.status}.")

    now = utcnow()
    reservation.status = "CANCELLED"
    reservation.end_time = now
    reservation.cancelled_at = now
    reservation.cancellation_reason = "Cancelled by user"

    seat = db.get(Seat, reservation.seat_id)
    seat_name = seat.seat_code if seat else "Seat"

    notif = Notification(
        id=uuid.uuid4(),
        user_id=reservation.user_id,
        title="Reservation Cancelled",
        message=f"Your reservation for {seat_name} has been cancelled and the seat is now released for others.",
        type="RESERVATION_CANCEL"
    )
    db.add(notif)

    db.commit()
    return {
        "id": str(reservation_id),
        "success": True,
        "message": f"Reservation for {seat_name} cancelled successfully and seat is now free."
    }


def get_my_bookings(db: Session, user_id: uuid.UUID):
    return db.execute(
        select(SeatReservation)
        .where(SeatReservation.user_id == user_id)
        .order_by(SeatReservation.start_time.desc())
    ).scalars().all()


def get_active_reservation(db: Session, user_id: uuid.UUID) -> Optional[SeatReservation]:
    checked_in = db.execute(
        select(SeatReservation)
        .where(
            SeatReservation.user_id == user_id,
            SeatReservation.status == "CHECKED_IN"
        )
        .order_by(SeatReservation.start_time.desc())
    ).scalars().first()
    if checked_in:
        return checked_in

    # Return the latest reserved booking
    active_reserved = db.execute(
        select(SeatReservation)
        .where(
            SeatReservation.user_id == user_id,
            SeatReservation.status == "RESERVED"
        )
        .order_by(SeatReservation.start_time.desc())
    ).scalars().first()

    return active_reserved


# ==========================================
# ADMIN SEAT RESERVATION SERVICES
# ==========================================

def get_admin_active_reservations(
    db: Session,
    status_filter: str = "active",
    search: Optional[str] = None
) -> list:
    query = (
        select(SeatReservation, User, Seat)
        .join(User, SeatReservation.user_id == User.id)
        .join(Seat, SeatReservation.seat_id == Seat.id)
    )

    if status_filter == "reserved":
        query = query.where(SeatReservation.status == "RESERVED")
    elif status_filter == "checked_in":
        query = query.where(SeatReservation.status == "CHECKED_IN")
    elif status_filter in ("all", "active"):
        query = query.where(SeatReservation.status.in_(["RESERVED", "CHECKED_IN"]))
    elif status_filter == "history":
        query = query.where(SeatReservation.status.in_(["CHECKED_OUT", "CANCELLED", "EXPIRED"]))
    # if "all_records", returns all without status filter

    if search:
        search_pattern = f"%{search.strip().lower()}%"
        query = query.where(
            or_(
                func.lower(User.name).like(search_pattern),
                func.lower(User.email).like(search_pattern),
                func.lower(User.roll_number).like(search_pattern),
                func.lower(User.library_card_number).like(search_pattern),
                func.lower(Seat.seat_code).like(search_pattern),
                func.lower(Seat.floor).like(search_pattern)
            )
        )

    # Order: CHECKED_IN first, then RESERVED, then most recent start_time
    rows = db.execute(
        query.order_by(
            case((SeatReservation.status == "CHECKED_IN", 1), (SeatReservation.status == "RESERVED", 2), else_=3),
            SeatReservation.start_time.desc()
        )
    ).all()

    results = []
    for reservation, user, seat in rows:
        st_aware = _ensure_aware(reservation.start_time)
        et_aware = _ensure_aware(reservation.end_time)
        cin_aware = _ensure_aware(reservation.check_in_time)
        cout_aware = _ensure_aware(reservation.check_out_time)
        deadline = st_aware + timedelta(minutes=CHECKIN_WINDOW_MINUTES)

        results.append({
            "id": str(reservation.id),
            "userId": str(user.id),
            "studentName": user.name or "Student",
            "studentEmail": user.email,
            "rollNumber": user.roll_number or user.library_card_number or "-",
            "className": user.class_name or "-",
            "avatarUrl": user.avatar_url,
            "seatId": str(seat.id),
            "seatCode": seat.seat_code,
            "floor": seat.floor,
            "floorName": _floor_name(seat.floor),
            "bookingDate": reservation.booking_date.isoformat(),
            "startTime": _iso_utc(st_aware),
            "endTime": _iso_utc(et_aware),
            "startTimeFormatted": st_aware.strftime("%I:%M %p"),
            "endTimeFormatted": et_aware.strftime("%I:%M %p"),
            "timeSlot": f"{st_aware.strftime('%I:%M %p')} - {et_aware.strftime('%I:%M %p')}",
            "checkInTime": _iso_utc(cin_aware) if cin_aware else None,
            "checkInTimeFormatted": cin_aware.strftime("%I:%M %p") if cin_aware else "-",
            "checkOutTime": _iso_utc(cout_aware) if cout_aware else None,
            "checkOutTimeFormatted": cout_aware.strftime("%I:%M %p") if cout_aware else "-",
            "checkInDeadline": _iso_utc(deadline),
            "status": reservation.status,
            "createdAt": _iso_utc(_ensure_aware(reservation.created_at)) if reservation.created_at else None
        })

    return results


def get_admin_seat_booking_history(
    db: Session,
    date_filter: Optional[str] = None,
    time_filter: Optional[str] = None,
    floor_filter: Optional[str] = None,
    status_filter: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 300
) -> dict:
    """
    Comprehensive Past Seat Booking History & Date/Time Analytics:
    - Daily booking counts breakdown ("kontya date la kiti hotya")
    - Filters by Date, Time slot / range, Floor, Status, Search
    - Detailed reservation rows with IST timestamps and student info
    """
    from datetime import time as dt_time

    # 1. Compute aggregate daily counts across ALL bookings
    all_res = db.execute(
        select(SeatReservation.booking_date, SeatReservation.status)
        .order_by(SeatReservation.booking_date.desc())
    ).all()

    from collections import defaultdict
    daily_stats = defaultdict(lambda: {"total": 0, "checked_in": 0, "checked_out": 0, "reserved": 0, "expired": 0, "cancelled": 0})
    for b_date, b_stat in all_res:
        daily_stats[b_date]["total"] += 1
        st_clean = (b_stat or "").upper()
        if st_clean == "CHECKED_IN":
            daily_stats[b_date]["checked_in"] += 1
        elif st_clean == "CHECKED_OUT":
            daily_stats[b_date]["checked_out"] += 1
        elif st_clean == "RESERVED":
            daily_stats[b_date]["reserved"] += 1
        elif st_clean == "EXPIRED":
            daily_stats[b_date]["expired"] += 1
        elif st_clean == "CANCELLED":
            daily_stats[b_date]["cancelled"] += 1

    daily_counts = []
    for d in sorted(daily_stats.keys(), reverse=True):
        st = daily_stats[d]
        daily_counts.append({
            "date": d.isoformat(),
            "dateFormatted": d.strftime("%d %b %Y"),
            "dayName": d.strftime("%A"),
            "totalBookings": st["total"],
            "checkedIn": st["checked_in"],
            "checkedOut": st["checked_out"],
            "reserved": st["reserved"],
            "expired": st["expired"],
            "cancelled": st["cancelled"]
        })

    # 2. Detailed Query with filters
    q = (
        select(SeatReservation, User, Seat)
        .join(User, SeatReservation.user_id == User.id)
        .join(Seat, SeatReservation.seat_id == Seat.id)
    )

    if date_filter and date_filter.lower() != "all":
        try:
            target_d = datetime.strptime(date_filter.strip(), "%Y-%m-%d").date()
            q = q.where(SeatReservation.booking_date == target_d)
        except Exception:
            pass

    if floor_filter and floor_filter.lower() != "all":
        q = q.where(func.upper(Seat.floor) == floor_filter.strip().upper())

    if status_filter and status_filter.lower() != "all":
        q = q.where(func.upper(SeatReservation.status) == status_filter.strip().upper())

    if search:
        search_pattern = f"%{search.strip().lower()}%"
        q = q.where(
            or_(
                func.lower(User.name).like(search_pattern),
                func.lower(User.email).like(search_pattern),
                func.lower(User.roll_number).like(search_pattern),
                func.lower(User.library_card_number).like(search_pattern),
                func.lower(Seat.seat_code).like(search_pattern)
            )
        )

    rows = db.execute(
        q.order_by(SeatReservation.booking_date.desc(), SeatReservation.start_time.desc())
    ).all()

    # Time filtering in Python using IST
    filtered_records = []
    unique_students = set()
    summary_counts = {"total": 0, "checked_in": 0, "checked_out": 0, "reserved": 0, "expired": 0, "cancelled": 0}

    for reservation, user, seat in rows:
        st_aware = _ensure_aware(reservation.start_time)
        et_aware = _ensure_aware(reservation.end_time)
        cin_aware = _ensure_aware(reservation.check_in_time)
        cout_aware = _ensure_aware(reservation.check_out_time)

        st_ist = st_aware.astimezone(IST)
        et_ist = et_aware.astimezone(IST)

        # Time filter evaluation
        if time_filter and time_filter.lower() != "all":
            tf = time_filter.lower().strip()
            h = st_ist.hour
            m = st_ist.minute
            res_t = dt_time(h, m)

            match = False
            if tf in ("morning", "06:00-12:00"):
                match = (6 <= h < 12)
            elif tf in ("afternoon", "12:00-17:00"):
                match = (12 <= h < 17)
            elif tf in ("evening", "17:00-24:00", "17:00-23:59"):
                match = (17 <= h <= 23)
            elif "-" in tf:
                parts = tf.split("-")
                try:
                    sh, sm = map(int, parts[0].strip().split(":"))
                    eh, em = map(int, parts[1].strip().split(":"))
                    match = (dt_time(sh, sm) <= res_t <= dt_time(eh, em))
                except Exception:
                    match = True
            elif ":" in tf:
                try:
                    sh, sm = map(int, tf.split(":"))
                    match = (h == sh and abs(m - sm) <= 30)
                except Exception:
                    match = True
            else:
                match = True

            if not match:
                continue

        st_status = (reservation.status or "RESERVED").upper()
        summary_counts["total"] += 1
        if st_status == "CHECKED_IN":
            summary_counts["checked_in"] += 1
        elif st_status == "CHECKED_OUT":
            summary_counts["checked_out"] += 1
        elif st_status == "RESERVED":
            summary_counts["reserved"] += 1
        elif st_status == "EXPIRED":
            summary_counts["expired"] += 1
        elif st_status == "CANCELLED":
            summary_counts["cancelled"] += 1

        unique_students.add(str(user.id))

        filtered_records.append({
            "id": str(reservation.id),
            "userId": str(user.id),
            "date": reservation.booking_date.isoformat(),
            "dateFormatted": reservation.booking_date.strftime("%d %b %Y"),
            "dayName": reservation.booking_date.strftime("%A"),
            "timeSlot": f"{st_ist.strftime('%I:%M %p')} - {et_ist.strftime('%I:%M %p')}",
            "startTimeFormatted": st_ist.strftime("%I:%M %p"),
            "endTimeFormatted": et_ist.strftime("%I:%M %p"),
            "startTime24": st_ist.strftime("%H:%M"),
            "endTime24": et_ist.strftime("%H:%M"),
            "seatId": str(seat.id),
            "seatCode": seat.seat_code,
            "floor": seat.floor.title() if seat.floor else "Ground",
            "floorRaw": seat.floor,
            "studentName": user.name or "Student",
            "studentEmail": user.email,
            "rollNumber": user.roll_number or user.library_card_number or "-",
            "className": user.class_name or "-",
            "department": user.department or "-",
            "avatarUrl": user.avatar_url,
            "status": st_status,
            "checkInTime": cin_aware.astimezone(IST).strftime("%I:%M %p") if cin_aware else "-",
            "checkOutTime": cout_aware.astimezone(IST).strftime("%I:%M %p") if cout_aware else "-",
            "createdAt": _iso_utc(_ensure_aware(reservation.created_at)) if reservation.created_at else None
        })

    # Standard time filter options for UI
    time_filter_options = [
        {"id": "all", "label": "All Time Slots"},
        {"id": "morning", "label": "Morning (06:00 AM - 12:00 PM)"},
        {"id": "afternoon", "label": "Afternoon (12:00 PM - 05:00 PM)"},
        {"id": "evening", "label": "Evening / Night (05:00 PM - 12:00 AM)"},
        {"id": "08:00-09:00", "label": "08:00 AM - 09:00 AM"},
        {"id": "09:00-10:00", "label": "09:00 AM - 10:00 AM"},
        {"id": "10:00-11:00", "label": "10:00 AM - 11:00 AM"},
        {"id": "11:00-12:00", "label": "11:00 AM - 12:00 PM"},
        {"id": "12:00-13:00", "label": "12:00 PM - 01:00 PM"},
        {"id": "13:00-14:00", "label": "01:00 PM - 02:00 PM"},
        {"id": "14:00-15:00", "label": "02:00 PM - 03:00 PM"},
        {"id": "15:00-16:00", "label": "03:00 PM - 04:00 PM"},
        {"id": "16:00-17:00", "label": "04:00 PM - 05:00 PM"},
        {"id": "17:00-18:00", "label": "05:00 PM - 06:00 PM"},
        {"id": "18:00-19:00", "label": "06:00 PM - 07:00 PM"},
        {"id": "19:00-20:00", "label": "07:00 PM - 08:00 PM"},
        {"id": "20:00-21:00", "label": "08:00 PM - 09:00 PM"},
        {"id": "21:00-22:00", "label": "09:00 PM - 10:00 PM"},
        {"id": "22:00-23:00", "label": "10:00 PM - 11:00 PM"},
        {"id": "23:00-24:00", "label": "11:00 PM - 12:00 AM"}
    ]

    return {
        "success": True,
        "dailyCounts": daily_counts,
        "totalRecords": len(filtered_records),
        "summary": {
            "totalBookings": summary_counts["total"],
            "checkedIn": summary_counts["checked_in"],
            "checkedOut": summary_counts["checked_out"],
            "reserved": summary_counts["reserved"],
            "expired": summary_counts["expired"],
            "cancelled": summary_counts["cancelled"],
            "uniqueStudents": len(unique_students),
            "allTimeTotal": len(all_res)
        },
        "timeFilterOptions": time_filter_options,
        "records": filtered_records[:limit]
    }


def admin_force_release_seat(db: Session, reservation_id: uuid.UUID) -> dict:
    reservation = db.get(SeatReservation, reservation_id)
    if not reservation:
        raise ValueError("Reservation not found")

    seat = db.get(Seat, reservation.seat_id)
    seat_name = seat.seat_code if seat else "Seat"
    user_id = reservation.user_id
    now = utcnow()

    prev_status = reservation.status
    if prev_status in ("CHECKED_OUT", "CANCELLED"):
        return {"id": str(reservation_id), "success": True, "message": f"Seat {seat_name} is already released."}

    if prev_status == "CHECKED_IN":
        reservation.status = "CHECKED_OUT"
        reservation.check_out_time = now
        reservation.end_time = now

        log = db.execute(
            select(AttendanceLog)
            .where(
                AttendanceLog.user_id == user_id,
                AttendanceLog.check_out_time == None
            )
            .order_by(AttendanceLog.check_in_time.desc())
        ).scalars().first()

        if log:
            log.check_out_time = now
            log.status = "CHECKED_OUT"

        action_msg = f"Admin checked out and released Seat {seat_name}."
    else:
        reservation.status = "CANCELLED"
        reservation.end_time = now
        reservation.cancelled_at = now
        reservation.cancellation_reason = "Released by admin"
        action_msg = f"Admin cancelled reservation and released Seat {seat_name}."

    notif = Notification(
        id=uuid.uuid4(),
        user_id=user_id,
        title="Seat Released by Admin",
        message=f"Your seat reservation for {seat_name} was released by the library administrator.",
        type="ATTENDANCE" if prev_status == "CHECKED_IN" else "RESERVATION_CANCEL"
    )
    db.add(notif)
    db.commit()

    return {
        "id": str(reservation_id),
        "success": True,
        "message": action_msg,
        "seatCode": seat_name
    }


def _build_floor_matrix_data(db: Session, floor: str, target_dt: datetime, target_date: Optional[date] = None) -> dict:
    floor_upper = floor.upper()
    seats = _get_cached_seats(db, floor)

    start_time = _ensure_aware(target_dt)
    end_time = start_time + timedelta(minutes=SLOT_DURATION_MINUTES)
    if target_date is None:
        target_date = start_time.astimezone(IST).date()
    today = ist_now().date()

    active_res = db.execute(
        select(
            SeatReservation.seat_id,
            SeatReservation.status,
            User.name,
            User.roll_number,
            User.library_card_number,
            SeatReservation.start_time,
            SeatReservation.end_time
        )
        .join(User, SeatReservation.user_id == User.id)
        .join(Seat, SeatReservation.seat_id == Seat.id)
        .where(
            func.upper(Seat.floor) == floor_upper,
            SeatReservation.status != "CANCELLED",
            or_(
                # Overlaps target slot on target_date
                and_(
                    SeatReservation.booking_date == target_date,
                    SeatReservation.start_time < end_time,
                    SeatReservation.end_time > start_time
                ),
                # If target is today and slot is current, include any student currently checked in
                and_(
                    SeatReservation.status == "CHECKED_IN",
                    target_date == today,
                    SeatReservation.booking_date == today,
                    SeatReservation.start_time <= end_time
                )
            )
        )
        .order_by(
            case(
                (SeatReservation.status == "CHECKED_IN", 1),
                (SeatReservation.status == "RESERVED", 2),
                else_=3
            ),
            SeatReservation.start_time.desc()
        )
    ).all()
    res_by_seat_id = {}
    for row in active_res:
        if row[0] not in res_by_seat_id:
            res_by_seat_id[row[0]] = row

    cols = ["Col 1", "Col 2", "Col 3", "Col 4", "Col 5"]
    num_cols = len(cols)
    num_seats = len(seats)
    num_rows = max(1, (num_seats + num_cols - 1) // num_cols)
    rows = [f"Row {i+1}" for i in range(num_rows)]

    booked_cnt = 0
    occupied_cnt = 0

    seat_map = {}
    for idx, seat in enumerate(seats):
        row_info = res_by_seat_id.get(seat.id)
        if row_info is None:
            st = "available"
            student_label = None
        else:
            seat_id_val, res_status, u_name, u_roll, u_lib, r_st, r_et = row_info
            student_label = f"{u_name or 'Student'} ({u_roll or u_lib or '-'})"
            if res_status in ("CHECKED_IN", "CHECKED_OUT", "COMPLETED"):
                st = "occupied"
                occupied_cnt += 1
            else:
                st = "reserved"
                booked_cnt += 1

        seat_info = {
            "id": seat.seat_code,
            "label": seat.seat_code,
            "status": st,
            "student": student_label
        }

        r_idx = idx // num_cols
        c_idx = idx % num_cols
        r_name = rows[r_idx]
        c_name = cols[c_idx]

        seat_map[f"{r_name}-{c_name}"] = seat_info
        seat_map[f"{c_name}-{r_name}"] = seat_info
        seat_map[f"{r_idx+1}-{c_name}"] = seat_info
        seat_map[seat.seat_code] = seat_info

        # Bidirectional alias mapping between G-{DEPT}-{POS}{ROW} and G-R{ROW}-C{COL}-{POS}
        dept_col_map = {1: "MBA", 2: "MECH", 3: "ENTC1", 4: "ENTC2", 5: "ELEC", 6: "SCI", 7: "COMP1", 8: "COMP2", 9: "REL"}
        col_dept_map = {v: k for k, v in dept_col_map.items()}
        s_parts = seat.seat_code.split("-")
        if len(s_parts) == 3 and s_parts[0] == "G":
            d_name = s_parts[1]
            pos = s_parts[2][0]
            row_n = s_parts[2][1:]
            if d_name in col_dept_map:
                alias = f"G-R{row_n}-C{col_dept_map[d_name]}-{pos}"
                seat_map[alias] = seat_info
        elif len(s_parts) == 4 and s_parts[0] == "G":
            row_n = s_parts[1].replace("R", "")
            c_num_str = s_parts[2].replace("C", "")
            c_num = int(c_num_str) if c_num_str.isdigit() else 0
            pos = s_parts[3]
            if c_num in dept_col_map:
                alias = f"G-{dept_col_map[c_num]}-{pos}{row_n}"
                seat_map[alias] = seat_info

    available_cnt = max(0, num_seats - (booked_cnt + occupied_cnt))

    depts = []
    sects = None
    if floor_upper == "GROUND":
        depts = [
            {"number": 1, "code": "MBA", "title": "Master of Business Administration", "seats": 16},
            {"number": 2, "code": "MECH", "title": "Mechanical Engineering", "seats": 16},
            {"number": 3, "code": "ENTC1", "title": "Electronics and Telecommunications Engineering", "seats": 16},
            {"number": 4, "code": "ENTC2", "title": "Electronics and Telecommunications Engineering", "seats": 16},
            {"number": 5, "code": "ELEC", "title": "Electrical Engineering", "seats": 16},
            {"number": 6, "code": "SCI", "title": "Pure Science", "seats": 16},
            {"number": 7, "code": "COMP1", "title": "Computer/IT Engineering", "seats": 16},
            {"number": 8, "code": "COMP2", "title": "Computer/IT Engineering", "seats": 16},
            {"number": 9, "code": "REL", "title": "Religious Section", "seats": 16}
        ]
    else:
        depts = [
            {"code": "COMP", "title": "Computer & IT", "seats": 6},
            {"code": "ET", "title": "Electronics & Tele", "seats": 6},
            {"code": "ENTC", "title": "Electronic & Telecommunications", "seats": 6},
            {"code": "ELEC", "title": "Electrical Engineering", "seats": 6},
            {"code": "MECH", "title": "Mechanical Engineering", "seats": 6},
            {"code": "MBA", "title": "Master of Business Administration", "seats": 6},
            {"code": "SCI", "title": "Pure Science", "seats": 6},
            {"code": "NTJ", "title": "Non Technical Journal", "seats": 6}
        ]
        sects = [
            {"code": "IEEE", "title": "IEEE Back Volume Section", "seats": 16},
            {"code": "AV", "title": "Audio Video DVD Section", "seats": 0},
            {"code": "CAS", "title": "Career Awareness Section", "seats": 12},
            {"code": "PHD", "title": "PhD Cell", "seats": 4}
        ]

    return {
        "floor": floor,
        "floorName": _floor_name(floor),
        "totalSeats": num_seats,
        "bookedCount": booked_cnt,
        "availableCount": available_cnt,
        "occupiedCount": occupied_cnt,
        "columns": cols,
        "rows": rows,
        "departments": depts,
        "sections": sects,
        "seats": seat_map
    }


def get_admin_seat_overview(db: Session) -> dict:
    now = utcnow()
    now_ist = ist_now()
    today_ist = now_ist.date()
    total_seats = 224
    ground_total = 144
    first_total = 80

    active_res = db.execute(
        select(SeatReservation, Seat)
        .join(Seat, SeatReservation.seat_id == Seat.id)
        .where(
            or_(
                SeatReservation.status == "CHECKED_IN",
                and_(
                    SeatReservation.status == "RESERVED",
                    SeatReservation.end_time > now
                )
            )
        )
    ).all()

    booked_seats = 0
    occupied_seats = 0

    for r, s in active_res:
        if r.status == "CHECKED_IN":
            occupied_seats += 1
        else:
            booked_seats += 1

    available_seats = max(0, total_seats - (booked_seats + occupied_seats))

    # Query today's non-cancelled reservations to get counts per slot
    todays_res = db.execute(
        select(SeatReservation.start_time, SeatReservation.end_time, SeatReservation.status)
        .where(
            SeatReservation.status != "CANCELLED",
            SeatReservation.booking_date == today_ist
        )
    ).all()

    from datetime import time as dt_time
    time_slots = []
    for h in range(7, 23):
        for m in (0, 30):
            slot_id = f"{h:02d}:{m:02d}"
            s_start_ist = datetime.combine(today_ist, dt_time(h, m), tzinfo=IST)
            s_end_ist = s_start_ist + timedelta(minutes=30)
            s_start_utc = s_start_ist.astimezone(timezone.utc)
            s_end_utc = s_end_ist.astimezone(timezone.utc)

            cnt = sum(
                1 for r in todays_res
                if _ensure_aware(r[0]) < s_end_utc and _ensure_aware(r[1]) > s_start_utc
            )

            start_12 = s_start_ist.strftime("%I:%M %p")
            end_12 = s_end_ist.strftime("%I:%M %p")
            slot_label = f"{start_12} - {end_12}"

            time_slots.append({
                "id": slot_id,
                "value": slot_id,
                "label": slot_label,
                "bookingCount": cnt,
                "display": f"{slot_label} ({cnt} Booked)"
            })

    ground_floor_data = _build_floor_matrix_data(db, "ground", now, target_date=today_ist)
    first_floor_data = _build_floor_matrix_data(db, "first", now, target_date=today_ist)

    return {
        "metrics": {
            "totalSeats": total_seats,
            "perFloor": f"Ground: {ground_total}, First: {first_total}",
            "bookedSeats": booked_seats,
            "bookedPercent": round((booked_seats / total_seats) * 100, 1) if total_seats else 0.0,
            "availableSeats": available_seats,
            "availablePercent": round((available_seats / total_seats) * 100, 1) if total_seats else 0.0,
            "occupiedSeats": occupied_seats
        },
        "timeSlots": time_slots,
        "groundFloor": ground_floor_data,
        "firstFloor": first_floor_data
    }


def get_admin_floor_seats(db: Session, floor: str, date_str: Optional[str] = None, slot: Optional[str] = None) -> dict:
    from datetime import time as dt_time
    now_ist = ist_now()
    today_ist = now_ist.date()
    target_date = today_ist
    target_hour = now_ist.hour
    target_minute = (now_ist.minute // 30) * 30

    if date_str:
        try:
            target_date = datetime.strptime(date_str.strip(), "%Y-%m-%d").date()
        except Exception:
            pass

    if slot:
        try:
            parts = slot.strip().split(":")
            target_hour = int(parts[0])
            target_minute = int(parts[1])
        except Exception:
            pass

    ist_target = datetime.combine(target_date, dt_time(target_hour, target_minute)).replace(tzinfo=IST)
    target_utc = ist_target.astimezone(timezone.utc)

    # 1. Fetch floor matrix data for the chosen date and slot
    floor_data = _build_floor_matrix_data(db, floor, target_utc, target_date=target_date)

    # 2. Compute booking counts for ALL 32 standard time slots for this floor on target_date
    floor_upper = floor.upper()
    date_reservations = db.execute(
        select(
            SeatReservation.start_time,
            SeatReservation.end_time,
            SeatReservation.status
        )
        .join(Seat, SeatReservation.seat_id == Seat.id)
        .where(
            func.upper(Seat.floor) == floor_upper,
            SeatReservation.status != "CANCELLED",
            SeatReservation.booking_date == target_date
        )
    ).all()

    time_slots = []
    selected_slot_id = f"{target_hour:02d}:{target_minute:02d}"
    selected_slot_count = 0

    for h in range(7, 23):
        for m in (0, 30):
            slot_id = f"{h:02d}:{m:02d}"
            s_start_ist = datetime.combine(target_date, dt_time(h, m), tzinfo=IST)
            s_end_ist = s_start_ist + timedelta(minutes=30)
            s_start_utc = s_start_ist.astimezone(timezone.utc)
            s_end_utc = s_end_ist.astimezone(timezone.utc)

            # Overlapping reservations count
            slot_cnt = sum(
                1 for r in date_reservations
                if _ensure_aware(r[0]) < s_end_utc and _ensure_aware(r[1]) > s_start_utc
            )

            start_12 = s_start_ist.strftime("%I:%M %p")
            end_12 = s_end_ist.strftime("%I:%M %p")
            slot_label = f"{start_12} - {end_12}"
            display_label = f"{slot_label} ({slot_cnt} Booked)"

            if slot_id == selected_slot_id:
                selected_slot_count = slot_cnt

            time_slots.append({
                "id": slot_id,
                "value": slot_id,
                "label": slot_label,
                "bookingCount": slot_cnt,
                "display": display_label
            })

    floor_data["timeSlots"] = time_slots
    floor_data["selectedSlot"] = selected_slot_id
    floor_data["selectedDate"] = str(target_date)
    floor_data["slotBookingCount"] = selected_slot_count

    return floor_data


def process_barcode_scan(db: Session, barcode: str, current_user_id: Optional[uuid.UUID] = None) -> dict:
    """
    Core Barcode Attendance Processor:
    - Identifies student by roll_number or library_card_number (or email / ID).
    - If student is currently CHECKED_IN -> Checks them out (releases seat, logs checkout).
    - If student has a RESERVED seat -> Checks them in to their seat (marks PRESENT, logs checkin).
    - If student has no seat booking:
      - If they have an open AttendanceLog today -> Checks them out.
      - Otherwise -> Marks general entrance AttendanceLog as PRESENT.
    """
    clean_code = (barcode or "").strip()
    if not clean_code:
        raise ValueError("Barcode or Roll Number cannot be empty.")

    # 1. Lookup user in database
    query = select(User).where(
        or_(
            func.lower(User.roll_number) == clean_code.lower(),
            func.lower(User.library_card_number) == clean_code.lower(),
            func.lower(User.email) == clean_code.lower()
        )
    )
    user = db.execute(query).scalars().first()

    if not user and current_user_id:
        user = db.get(User, current_user_id)

    if not user:
        try:
            u_uuid = uuid.UUID(clean_code)
            user = db.get(User, u_uuid)
        except Exception:
            pass

    if not user:
        raise ValueError(f"Student with Barcode / Roll Number '{clean_code}' not found in the database.")

    now = utcnow()
    today = ist_now().date()

    # -------------------------------------------------------------
    # CASE 1: Student is currently CHECKED_IN -> SCAN MEANS CHECK-OUT!
    # -------------------------------------------------------------
    checked_in_res = db.execute(
        select(SeatReservation).where(
            SeatReservation.user_id == user.id,
            SeatReservation.status == "CHECKED_IN"
        ).order_by(SeatReservation.start_time.desc())
    ).scalars().first()

    if checked_in_res:
        # Perform seat check-out and release
        res_data = check_out(db, checked_in_res.id, user.id)
        seat = db.get(Seat, checked_in_res.seat_id)
        seat_code = seat.seat_code if seat else "Assigned Seat"

        # Calculate time spent in library
        checkin_t = _ensure_aware(checked_in_res.check_in_time) or _ensure_aware(checked_in_res.start_time)
        duration_minutes = max(1, int((now - checkin_t).total_seconds() // 60))
        hours = duration_minutes // 60
        mins = duration_minutes % 60
        duration_str = f"{hours}h {mins}m" if hours > 0 else f"{mins} mins"

        return {
            "success": True,
            "action": "CHECKED_OUT",
            "message": f"Check-Out Successful! Seat {seat_code} has been released.",
            "student": {
                "id": str(user.id),
                "name": user.name or "Student",
                "rollNumber": user.roll_number or "-",
                "libraryCardNumber": user.library_card_number or "-",
                "department": user.department or "-",
                "className": user.class_name or "-",
                "avatarUrl": user.avatar_url or ""
            },
            "seat": {
                "seatCode": seat_code,
                "floor": _floor_name(seat.floor) if seat else ""
            },
            "time": format_ist_time(now),
            "date": format_ist_date(now),
            "duration": duration_str,
            "status": "CHECKED_OUT"
        }

    # -------------------------------------------------------------
    # CASE 2: Student has a RESERVED seat -> SCAN MEANS CHECK-IN!
    # -------------------------------------------------------------
    reserved_res = db.execute(
        select(SeatReservation).where(
            SeatReservation.user_id == user.id,
            SeatReservation.status == "RESERVED",
            SeatReservation.booking_date == today
        ).order_by(SeatReservation.start_time.asc())
    ).scalars().first()

    # Fallback to any pending RESERVED booking
    if not reserved_res:
        reserved_res = db.execute(
            select(SeatReservation).where(
                SeatReservation.user_id == user.id,
                SeatReservation.status == "RESERVED"
            ).order_by(SeatReservation.start_time.asc())
        ).scalars().first()

    if reserved_res:
        seat = db.get(Seat, reserved_res.seat_id)
        seat_code = seat.seat_code if seat else "Assigned Seat"

        # Check-in window validation:
        # Check-in window opens up to 15 minutes before slot start and remains open throughout the slot
        start_t = _ensure_aware(reserved_res.start_time)
        end_t = _ensure_aware(reserved_res.end_time)
        check_in_open_time = start_t - timedelta(minutes=15)
        check_in_deadline = max(end_t, start_t + timedelta(minutes=CHECKIN_WINDOW_MINUTES))

        if now < check_in_open_time:
            raise ValueError(
                f"Check-in is not open yet for Seat {seat_code}. Your slot starts at {format_ist_time_both(start_t)}. Please scan your ID card at entrance closer to your slot time."
            )

        if now > check_in_deadline:
            reserved_res.status = "EXPIRED"
            reserved_res.cancelled_at = now
            reserved_res.cancellation_reason = "Expired: 15-minute check-in deadline passed"
            notif = Notification(
                id=uuid.uuid4(),
                user_id=user.id,
                title="Seat Reservation Expired",
                message=f"Your reservation for Seat {seat_code} has expired and was automatically cancelled because check-in was not completed within the 15-minute window.",
                type="RESERVATION_CANCEL",
                is_read=False,
                created_at=now
            )
            db.add(notif)
            db.commit()

            if user and user.email:
                try:
                    from ..agent.email_agent import send_seat_cancellation_email
                    slot_time = start_t.strftime("%I:%M %p")
                    send_seat_cancellation_email(
                        recipient_email=user.email,
                        student_name=user.name or "Student",
                        seat_code=seat_code,
                        floor_name=_floor_name(seat.floor) if seat else "",
                        slot_time=slot_time
                    )
                except Exception:
                    pass

            raise ValueError(
                f"Check-in window for Seat {seat_code} has expired (Deadline: {format_ist_time_both(check_in_deadline)}). Reservation has expired and seat is released."
            )

        # Student's barcode matches their active booking within the 15-minute window -> Check-In!
        reserved_res.status = "CHECKED_IN"
        reserved_res.check_in_time = now

        att_log = AttendanceLog(
            id=uuid.uuid4(),
            user_id=user.id,
            date=today,
            check_in_time=now,
            verification_method="BARCODE",
            status="PRESENT"
        )
        db.add(att_log)

        notif = Notification(
            id=uuid.uuid4(),
            user_id=user.id,
            title="Check-in Successful (Barcode)",
            message=f"Barcode scanned. Checked in to Seat {seat_code}. Attendance marked as PRESENT.",
            type="ATTENDANCE"
        )
        db.add(notif)
        db.commit()

        return {
            "success": True,
            "action": "CHECKED_IN",
            "message": f"Check-In Successful! Verified booking for Seat {seat_code}.",
            "student": {
                "id": str(user.id),
                "name": user.name or "Student",
                "rollNumber": user.roll_number or "-",
                "libraryCardNumber": user.library_card_number or "-",
                "department": user.department or "-",
                "className": user.class_name or "-",
                "avatarUrl": user.avatar_url or ""
            },
            "seat": {
                "seatCode": seat_code,
                "floor": _floor_name(seat.floor) if seat else ""
            },
            "time": format_ist_time(now),
            "date": format_ist_date(now),
            "status": "PRESENT"
        }

    # -------------------------------------------------------------
    # CASE 3: Student DOES NOT have any active seat booking!
    # Attendance is strictly tied to Seat Reservation. Unbooked students cannot check in.
    # -------------------------------------------------------------
    # Check if student was previously checked in today and needs to checkout
    open_att = db.execute(
        select(AttendanceLog).where(
            AttendanceLog.user_id == user.id,
            AttendanceLog.date == today,
            AttendanceLog.check_out_time == None
        ).order_by(AttendanceLog.check_in_time.desc())
    ).scalars().first()

    if open_att:
        open_att.check_out_time = now
        open_att.status = "CHECKED_OUT"
        db.commit()
        checkin_t = _ensure_aware(open_att.check_in_time)
        duration_minutes = max(1, int((now - checkin_t).total_seconds() // 60)) if checkin_t else 1
        hours = duration_minutes // 60
        mins = duration_minutes % 60
        duration_str = f"{hours}h {mins}m" if hours > 0 else f"{mins} mins"

        return {
            "success": True,
            "action": "CHECKED_OUT",
            "message": "Library Check-Out Recorded Successfully! Have a good day.",
            "student": {
                "id": str(user.id),
                "name": user.name or "Student",
                "rollNumber": user.roll_number or "-",
                "libraryCardNumber": user.library_card_number or "-",
                "department": user.department or "-",
                "className": user.class_name or "-",
                "avatarUrl": user.avatar_url or ""
            },
            "seat": {
                "seatCode": "General Entry",
                "floor": "Library Hall"
            },
            "time": format_ist_time(now),
            "date": format_ist_date(now),
            "duration": duration_str,
            "status": "CHECKED_OUT"
        }

    # If student has NO active reservation for this slot, REJECT check-in!
    student_name = user.name or "Student"
    student_roll = user.roll_number or user.library_card_number or "ID"
    raise ValueError(
        f"Check-In Denied! Student {student_name} ({student_roll}) has NOT booked any seat for this time slot. Attendance is strictly allowed only for students with an active seat reservation."
    )