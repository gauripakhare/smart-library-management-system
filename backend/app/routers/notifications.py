import uuid
from datetime import datetime, timezone
from typing import Optional, List
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import or_, desc, func

from ..database import get_db
from ..models import Notification, User


admin_notif_router = APIRouter(prefix="/api/admin/notifications", tags=["Admin Notifications"])
student_notif_router = APIRouter(prefix="/api/student/notifications", tags=["Student Notifications"])
public_notif_router = APIRouter(prefix="/api/notifications", tags=["Notifications Public"])


class CreateNotificationSchema(BaseModel):
    title: str
    message: str
    type: Optional[str] = "Announcement"  # Announcement, Notification, Alert
    audience: Optional[str] = "All Students"  # All Students, All Users, Seat Booked Students
    target_user_id: Optional[str] = None


class TestAiEmailSchema(BaseModel):
    recipient_email: str
    email_type: Optional[str] = "overdue"  # "overdue" or "seat_cancelled"
    student_name: Optional[str] = "Rahul Patil"
    book_title: Optional[str] = "Atomic Habits"
    days_overdue: Optional[int] = 3
    fine_amount: Optional[float] = 75.0
    seat_code: Optional[str] = "G-R1-C1-A"
    floor_name: Optional[str] = "Ground Floor"


def _seed_initial_notifications(db: Session):
    if db.query(Notification).count() > 0:
        return

    demo_notifs = [
        {
            "title": "Library Timing Update",
            "message": "The library will be open from 8:00 AM to 6:00 PM (Monday to Friday) and 8:00 AM to 2:00 PM on Saturday.",
            "type": "Announcement",
        },
        {
            "title": "Holiday Notice",
            "message": "The library will remain closed on 15 Aug (Independence Day).",
            "type": "Notification",
        },
        {
            "title": "New Books Added",
            "message": "New books are available in the library. Check the latest collection now!",
            "type": "Announcement",
        },
        {
            "title": "Maintenance Notice",
            "message": "Library system will be under maintenance on Sunday from 10 AM to 12 PM.",
            "type": "Announcement",
        },
        {
            "title": "Book Due Date Reminder",
            "message": "Please return your borrowed books before the due date to avoid overdue fines.",
            "type": "Notification",
        }
    ]

    for item in demo_notifs:
        notif = Notification(
            id=uuid.uuid4(),
            user_id=None,
            title=item["title"],
            message=item["message"],
            type=item["type"],
            is_read=False,
            created_at=datetime.utcnow()
        )
        db.add(notif)
    db.commit()


def _format_notification_for_admin(n: Notification, db: Session) -> dict:
    created_str = "-"
    if n.created_at:
        try:
            created_str = n.created_at.strftime("%d %b %Y %I:%M %p")
        except Exception:
            created_str = str(n.created_at)

    audience = "All Students"
    if n.user_id:
        u = db.query(User).filter(User.id == n.user_id).first()
        if u:
            audience = u.name or u.roll_number or "Specific User"

    return {
        "id": str(n.id),
        "type": n.type or "Notification",
        "title": n.title,
        "message": n.message,
        "audience": audience,
        "dateTime": created_str,
        "status": "Published" if not n.is_read else "Read",
        "is_read": n.is_read,
        "created_at": n.created_at.isoformat() if n.created_at else None
    }


def _format_notification_for_student(n: Notification) -> dict:
    created_str = "Just now"
    if n.created_at:
        diff = datetime.utcnow() - (n.created_at.replace(tzinfo=None) if n.created_at.tzinfo else n.created_at)
        if diff.days > 0:
            created_str = f"{diff.days} day{'s' if diff.days > 1 else ''} ago"
        elif diff.seconds >= 3600:
            hours = diff.seconds // 3600
            created_str = f"{hours} hour{'s' if hours > 1 else ''} ago"
        elif diff.seconds >= 60:
            mins = diff.seconds // 60
            created_str = f"{mins} min{'s' if mins > 1 else ''} ago"
        else:
            created_str = "Just now"

    ntype = (n.type or "GENERAL").upper()
    if "FINE" in ntype or "OVERDUE" in ntype:
        cat = "Fines"
        tag_class = "badge-fine-bg badge-fine-text"
        icon = "fa-solid fa-indian-rupee-sign"
        icon_bg = "#FEF2F2"
        icon_color = "#EF4444"
    elif "DUE" in ntype or "BOOK" in ntype:
        cat = "Due Date"
        tag_class = "badge-duedate-bg badge-duedate-text"
        icon = "fa-regular fa-calendar-check"
        icon_bg = "#EEF2FF"
        icon_color = "#2563EB"
    elif "CANCEL" in ntype or "EXPIRE" in ntype or "ALERT" in ntype:
        cat = "Alert"
        tag_class = "badge-fine-bg badge-fine-text"
        icon = "fa-solid fa-circle-xmark" if "CANCEL" in ntype or "EXPIRE" in ntype else "fa-solid fa-triangle-exclamation"
        icon_bg = "#FEF2F2"
        icon_color = "#EF4444"
    elif "CONFIRM" in ntype or "RESERVATION" in ntype:
        cat = "Announcements"
        tag_class = "badge-notice-bg badge-notice-text"
        icon = "fa-solid fa-chair"
        icon_bg = "#ECFDF5"
        icon_color = "#10B981"
    elif "ATTENDANCE" in ntype:
        cat = "Announcements"
        tag_class = "badge-notice-bg badge-notice-text"
        icon = "fa-solid fa-user-check"
        icon_bg = "#ECFDF5"
        icon_color = "#10B981"
    else:
        cat = "Announcements"
        tag_class = "badge-announcement-bg badge-announcement-text"
        icon = "fa-solid fa-bullhorn"
        icon_bg = "#F3E8FF"
        icon_color = "#9333EA"

    return {
        "id": str(n.id),
        "category": cat,
        "title": n.title,
        "message": n.message,
        "bookInfo": "",
        "timeAgo": created_str,
        "tagClass": tag_class,
        "icon": icon,
        "iconBg": icon_bg,
        "iconColor": icon_color,
        "is_read": n.is_read,
        "type": n.type or "Announcement"
    }


# ==========================================
# ADMIN ENDPOINTS
# ==========================================

@admin_notif_router.get("")
@admin_notif_router.get("/")
def get_admin_notifications(db: Session = Depends(get_db)):
    _seed_initial_notifications(db)
    notifs = db.query(Notification).order_by(desc(Notification.created_at)).all()
    formatted = [_format_notification_for_admin(n, db) for n in notifs]
    unread_count = db.query(Notification).filter(Notification.is_read == False).count()
    return {
        "success": True,
        "unreadCount": unread_count,
        "notifications": formatted
    }


@admin_notif_router.post("")
@admin_notif_router.post("/")
def create_admin_notification(
    payload: CreateNotificationSchema,
    db: Session = Depends(get_db)
):
    target_user_id = None
    if payload.target_user_id:
        try:
            target_user_id = uuid.UUID(payload.target_user_id)
        except Exception:
            u = db.query(User).filter(
                or_(User.roll_number == payload.target_user_id, User.email == payload.target_user_id)
            ).first()
            if u:
                target_user_id = u.id

    new_notif = Notification(
        id=uuid.uuid4(),
        user_id=target_user_id,
        title=payload.title.strip(),
        message=payload.message.strip(),
        type=payload.type or "Announcement",
        is_read=False,
        created_at=datetime.utcnow()
    )

    db.add(new_notif)
    db.commit()
    db.refresh(new_notif)

    return {
        "success": True,
        "message": "Notification created successfully",
        "notification": _format_notification_for_admin(new_notif, db)
    }


@admin_notif_router.delete("/{notification_id}")
@admin_notif_router.delete("/{notification_id}/")
def delete_admin_notification(notification_id: str, db: Session = Depends(get_db)):
    try:
        n_uuid = uuid.UUID(notification_id)
        notif = db.query(Notification).filter(Notification.id == n_uuid).first()
    except Exception:
        notif = None

    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")

    db.delete(notif)
    db.commit()

    return {"success": True, "message": "Notification deleted successfully"}


@admin_notif_router.get("/unread-count")
def get_admin_unread_count(db: Session = Depends(get_db)):
    cnt = db.query(Notification).filter(Notification.is_read == False).count()
    return {"unreadCount": cnt}


@admin_notif_router.post("/mark-all-read")
def mark_all_admin_notifications_read(db: Session = Depends(get_db)):
    db.query(Notification).filter(Notification.is_read == False).update({"is_read": True})
    db.commit()
    return {"success": True, "message": "All notifications marked as read"}


@admin_notif_router.post("/{notification_id}/read")
def mark_single_admin_notification_read(notification_id: str, db: Session = Depends(get_db)):
    try:
        n_uuid = uuid.UUID(notification_id)
        notif = db.query(Notification).filter(Notification.id == n_uuid).first()
        if notif:
            notif.is_read = True
            db.commit()
    except Exception:
        pass
    return {"success": True}


@admin_notif_router.post("/trigger-overdue-check")
def trigger_overdue_check(force: bool = False, db: Session = Depends(get_db)):
    """
    Manually scan for overdue books and fines, update fine amounts,
    and dispatch in-app notifications to students.
    """
    from ..services.overdue_service import process_overdue_books_and_fines
    result = process_overdue_books_and_fines(db, force=force)
    return result


@admin_notif_router.post("/trigger-seat-expiry-check")
def trigger_seat_expiry_check(db: Session = Depends(get_db)):
    """
    Manually scan for pending seat reservations that exceeded the 15-minute window,
    cancel them, release seats, and send in-app notifications.
    """
    from ..services.overdue_service import expire_unclaimed_seat_reservations
    result = expire_unclaimed_seat_reservations(db)
    return result


@admin_notif_router.post("/test-ai-email")
def test_ai_email(payload: TestAiEmailSchema):
    """
    Test endpoint to draft and dispatch an AI-crafted Overdue or Seat Cancellation email.
    """
    from ..agent.email_agent import send_overdue_book_email, send_seat_cancellation_email

    if payload.email_type == "seat_cancelled":
        sent = send_seat_cancellation_email(
            recipient_email=payload.recipient_email,
            student_name=payload.student_name or "Student",
            seat_code=payload.seat_code or "G-R1-C1-A",
            floor_name=payload.floor_name or "Ground Floor",
            slot_time="11:00 AM"
        )
    else:
        sent = send_overdue_book_email(
            recipient_email=payload.recipient_email,
            student_name=payload.student_name or "Student",
            book_title=payload.book_title or "Atomic Habits",
            days_overdue=payload.days_overdue or 3,
            fine_amount=payload.fine_amount or 75.0,
            due_date_str=datetime.now().strftime("%d %b %Y")
        )

    return {
        "success": sent,
        "recipient": payload.recipient_email,
        "type": payload.email_type,
        "message": "AI email dispatched successfully!" if sent else "Failed to send email via SMTP (check logs)."
    }


# ==========================================
# STUDENT ENDPOINTS
# ==========================================

@student_notif_router.get("")
@student_notif_router.get("/")
def get_student_notifications(
    user_id: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    _seed_initial_notifications(db)

    target_user_uuid = None
    if user_id:
        try:
            target_user_uuid = uuid.UUID(user_id)
        except Exception:
            u = db.query(User).filter(or_(User.roll_number == user_id, User.email == user_id)).first()
            if u:
                target_user_uuid = u.id

    if target_user_uuid:
        notifs = db.query(Notification).filter(
            or_(Notification.user_id == target_user_uuid, Notification.user_id.is_(None))
        ).order_by(desc(Notification.created_at)).all()
    else:
        notifs = db.query(Notification).order_by(desc(Notification.created_at)).all()

    formatted = [_format_notification_for_student(n) for n in notifs]
    unread_count = sum(1 for n in notifs if not n.is_read)

    return {
        "success": True,
        "unreadCount": unread_count,
        "notifications": formatted
    }


@student_notif_router.post("/{notification_id}/read")
def mark_notification_read(notification_id: str, db: Session = Depends(get_db)):
    try:
        n_uuid = uuid.UUID(notification_id)
        notif = db.query(Notification).filter(Notification.id == n_uuid).first()
        if notif:
            notif.is_read = True
            db.commit()
    except Exception:
        pass
    return {"success": True}


@student_notif_router.post("/mark-all-read")
def mark_all_student_notifications_read(
    user_id: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    target_user_uuid = None
    if user_id:
        try:
            target_user_uuid = uuid.UUID(user_id)
        except Exception:
            u = db.query(User).filter(or_(User.roll_number == user_id, User.email == user_id)).first()
            if u:
                target_user_uuid = u.id

    if target_user_uuid:
        db.query(Notification).filter(
            or_(Notification.user_id == target_user_uuid, Notification.user_id.is_(None)),
            Notification.is_read == False
        ).update({"is_read": True})
    else:
        db.query(Notification).filter(Notification.is_read == False).update({"is_read": True})
    db.commit()
    return {"success": True}


# Public fallback endpoints
@public_notif_router.get("")
@public_notif_router.get("/")
def get_public_notifications(db: Session = Depends(get_db)):
    return get_admin_notifications(db)
