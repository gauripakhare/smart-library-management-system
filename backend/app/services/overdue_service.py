import uuid
from datetime import datetime, date, timedelta, timezone
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from sqlalchemy import or_, func, and_

from ..models import BookIssue, BookFine, User, Notification, Seat, SeatReservation
from ..utils.library_schedule import IST

FINE_PER_DAY = 25


def _find_user_for_student_id(db: Session, student_id: str) -> Optional[User]:
    if not student_id:
        return None
    
    clean_id = str(student_id).strip()
    
    # Try direct UUID
    try:
        u_uuid = uuid.UUID(clean_id)
        user = db.query(User).filter(User.id == u_uuid).first()
        if user:
            return user
    except (ValueError, TypeError, AttributeError):
        pass

    # Try roll number, library card number, or email
    user = db.query(User).filter(
        or_(
            func.lower(User.roll_number) == clean_id.lower(),
            func.lower(User.library_card_number) == clean_id.lower(),
            func.lower(User.email) == clean_id.lower()
        )
    ).first()
    return user


def process_overdue_books_and_fines(db: Session, force: bool = False) -> Dict[str, Any]:
    """
    1. Updates days_overdue and fine_amount (Rs. 25/day) for all non-returned overdue book issues.
    2. Sends In-App Notification to students whose books are:
       - Overdue (Fine alert with total fine amount)
       - Due today (Due date reminder)
    Deduplication: Only 1 notification per book issue per day (unless force=True).
    """
    now_utc = datetime.utcnow()
    now_ist = datetime.now(IST)
    today_ist = now_ist.date()
    today_start_utc = datetime.combine(today_ist, datetime.min.time())

    active_issues = db.query(BookIssue).filter(
        BookIssue.status.in_(["active", "issued", "overdue", "borrowed"]),
        BookIssue.return_date.is_(None)
    ).all()

    overdue_notifs_created = 0
    due_today_notifs_created = 0
    fines_updated_count = 0

    for issue in active_issues:
        if not issue.due_date:
            continue

        # Convert issue.due_date to date for exact date comparison
        issue_due_date = issue.due_date.date() if isinstance(issue.due_date, datetime) else issue.due_date

        user = _find_user_for_student_id(db, issue.student_id)
        book_title = issue.book_title or "Library Book"

        # CASE 1: Book is Overdue
        if issue_due_date < today_ist:
            issue.status = "overdue"
            days_overdue = max(1, (today_ist - issue_due_date).days)
            fine_amt = float(days_overdue * FINE_PER_DAY)

            # Update or create BookFine record
            fine_record = db.query(BookFine).filter(BookFine.issue_id == issue.id).first()
            if not fine_record:
                fine_code = f"FIN-{uuid.uuid4().hex[:8].upper()}"
                fine_record = BookFine(
                    id=fine_code,
                    fine_code=fine_code,
                    issue_id=issue.id,
                    student_id=issue.student_id,
                    book_id=issue.book_id,
                    book_title=book_title,
                    original_due_date=issue.due_date,
                    days_overdue=days_overdue,
                    fine_amount=fine_amt,
                    fine_paid=0.0,
                    status="Unpaid",
                    notes="Daily overdue fine automatically calculated."
                )
                db.add(fine_record)
                fines_updated_count += 1
            else:
                fine_record.days_overdue = max(fine_record.days_overdue, days_overdue)
                fine_record.fine_amount = max(float(fine_record.fine_amount or 0), fine_amt)
                if fine_record.status == "Paid" and fine_amt > float(fine_record.fine_paid or 0):
                    fine_record.status = "Partially Paid"
                fines_updated_count += 1

            # In-App Notification for Overdue Book
            if user:
                # Check deduplication: did we already send notification for this book today?
                already_sent = False
                if not force:
                    existing_notif = db.query(Notification).filter(
                        Notification.user_id == user.id,
                        Notification.created_at >= today_start_utc,
                        Notification.type == "FINE_ALERT",
                        Notification.title.contains(book_title[:30])
                    ).first()
                    if existing_notif:
                        already_sent = True

                if not already_sent:
                    due_date_str = issue.due_date.strftime("%d %b %Y") if hasattr(issue.due_date, "strftime") else str(issue.due_date)
                    notif = Notification(
                        id=uuid.uuid4(),
                        user_id=user.id,
                        title=f"⚠️ Overdue Book Alert: {book_title}",
                        message=(
                            f"Your borrowed book '{book_title}' was due on {due_date_str} and is now {days_overdue} day(s) overdue. "
                            f"Accumulated fine: ₹{fine_amt:.0f} (₹{FINE_PER_DAY}/day). "
                            f"Please return the book to the library immediately to avoid further fines."
                        ),
                        type="FINE_ALERT",
                        is_read=False,
                        created_at=now_utc
                    )
                    db.add(notif)
                    overdue_notifs_created += 1

                    # Trigger AI Email Agent for Overdue Book
                    if user.email:
                        try:
                            from ..agent.email_agent import send_overdue_book_email
                            student_name = user.name or "Student"
                            send_overdue_book_email(
                                recipient_email=user.email,
                                student_name=student_name,
                                book_title=book_title,
                                days_overdue=days_overdue,
                                fine_amount=fine_amt,
                                due_date_str=due_date_str
                            )
                        except Exception as em_err:
                            print(f"[overdue_service] Email dispatch error: {em_err}")

        # CASE 2: Book is Due TODAY
        elif issue_due_date == today_ist:
            if user:
                already_sent = False
                if not force:
                    existing_notif = db.query(Notification).filter(
                        Notification.user_id == user.id,
                        Notification.created_at >= today_start_utc,
                        Notification.type == "DUE_REMINDER",
                        Notification.title.contains(book_title[:30])
                    ).first()
                    if existing_notif:
                        already_sent = True

                if not already_sent:
                    due_date_str = issue.due_date.strftime("%d %b %Y") if hasattr(issue.due_date, "strftime") else str(issue.due_date)
                    notif = Notification(
                        id=uuid.uuid4(),
                        user_id=user.id,
                        title=f"📅 Book Due Today: {book_title}",
                        message=(
                            f"Reminder: Your borrowed book '{book_title}' is due for return today ({due_date_str}). "
                            f"Please return it to the library today before closing time to prevent an overdue fine of ₹{FINE_PER_DAY}/day."
                        ),
                        type="DUE_REMINDER",
                        is_read=False,
                        created_at=now_utc
                    )
                    db.add(notif)
                    due_today_notifs_created += 1

    db.commit()

    return {
        "success": True,
        "date": today_ist.isoformat(),
        "totalActiveIssues": len(active_issues),
        "finesUpdated": fines_updated_count,
        "overdueNotificationsSent": overdue_notifs_created,
        "dueTodayNotificationsSent": due_today_notifs_created
    }


def expire_unclaimed_seat_reservations(db: Session) -> Dict[str, Any]:
    """
    Checks all pending SeatReservations.
    If slot start time has passed + 15 minutes and student has NOT checked in:
    1. Sets status = 'EXPIRED'
    2. Releases seat
    3. Adds In-App Notification: 'Seat Reservation Expired'
    """
    from ..services.reservation_service import CHECKIN_WINDOW_MINUTES, utcnow, _ensure_aware, _floor_name

    now = utcnow()
    pending_reservations = db.query(SeatReservation).filter(
        SeatReservation.status == "RESERVED"
    ).all()

    expired_count = 0
    expired_details = []

    for res in pending_reservations:
        start_t = _ensure_aware(res.start_time)
        deadline = start_t + timedelta(minutes=CHECKIN_WINDOW_MINUTES)

        if now > deadline:
            res.status = "EXPIRED"
            res.cancelled_at = now
            res.cancellation_reason = "Expired: 15-minute check-in deadline passed without check-in."

            seat = db.get(Seat, res.seat_id)
            seat_code = seat.seat_code if seat else "your seat"
            slot_time = start_t.strftime("%I:%M %p")

            # In-App Notification for Expiry
            notif = Notification(
                id=uuid.uuid4(),
                user_id=res.user_id,
                title="Seat Reservation Expired",
                message=(
                    f"Your booking for Seat {seat_code} (Slot: {slot_time}) has expired and was automatically cancelled "
                    f"because check-in was not completed within the 15-minute window. The seat has been released for other students."
                ),
                type="RESERVATION_CANCEL",
                is_read=False,
                created_at=now
            )
            db.add(notif)
            expired_count += 1

            # Trigger AI Email Agent for Expired Seat
            user = db.get(User, res.user_id)
            if user and user.email:
                try:
                    from ..agent.email_agent import send_seat_cancellation_email
                    student_name = user.name or "Student"
                    floor_name = _floor_name(seat.floor) if seat else "Ground Floor"
                    send_seat_cancellation_email(
                        recipient_email=user.email,
                        student_name=student_name,
                        seat_code=seat_code,
                        floor_name=floor_name,
                        slot_time=slot_time
                    )
                except Exception as em_err:
                    print(f"[overdue_service] Seat cancellation email error: {em_err}")

            expired_details.append({
                "reservationId": str(res.id),
                "userId": str(res.user_id),
                "seatCode": seat_code,
                "slotTime": slot_time
            })

    if expired_count > 0:
        db.commit()

    return {
        "success": True,
        "expiredCount": expired_count,
        "expiredReservations": expired_details
    }
