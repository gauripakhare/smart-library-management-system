import io
import csv
import uuid
from datetime import datetime, timedelta, date
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, and_, desc, String

from ..database import get_db
from ..deps import get_current_user_id, get_current_user_profile
from ..models import (
    User, Book, BookIssue, BookFine, AttendanceLog, Seat, SeatReservation, Notification, BookReview
)

try:
    from reportlab.lib.pagesizes import letter, A4
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    HAS_REPORTLAB = True
except ImportError:
    HAS_REPORTLAB = False


router = APIRouter(prefix="/api/reports", tags=["Admin Reports"])
student_router = APIRouter(prefix="/api/student/reports", tags=["Student Reports"])


# ---------------------------------------------------------------------------
# String & Date Range Filtering Helpers
# ---------------------------------------------------------------------------
def _clean_str_param(val: Any) -> Optional[str]:
    if isinstance(val, str) and val.strip():
        return val.strip()
    return None


def _parse_date_range(preset: Any = None, start_date_str: Any = None, end_date_str: Any = None):
    now = datetime.now()
    start_dt = None
    end_dt = datetime(now.year, now.month, now.day, 23, 59, 59)

    preset_clean = (_clean_str_param(preset) or "").lower()
    start_str = _clean_str_param(start_date_str)
    end_str = _clean_str_param(end_date_str)

    if preset_clean == "today":
        start_dt = datetime(now.year, now.month, now.day, 0, 0, 0)
    elif preset_clean in ["this_week", "week"]:
        monday = now - timedelta(days=now.weekday())
        start_dt = datetime(monday.year, monday.month, monday.day, 0, 0, 0)
    elif preset_clean in ["this_month", "month"]:
        start_dt = datetime(now.year, now.month, 1, 0, 0, 0)
    elif preset_clean == "last_month":
        first_of_this_month = datetime(now.year, now.month, 1)
        last_day_of_last_month = first_of_this_month - timedelta(days=1)
        start_dt = datetime(last_day_of_last_month.year, last_day_of_last_month.month, 1, 0, 0, 0)
        end_dt = datetime(last_day_of_last_month.year, last_day_of_last_month.month, last_day_of_last_month.day, 23, 59, 59)
    elif start_str:
        try:
            start_dt = datetime.strptime(start_str, "%Y-%m-%d")
        except ValueError:
            start_dt = None
        if end_str:
            try:
                dt_parsed = datetime.strptime(end_str, "%Y-%m-%d")
                end_dt = datetime(dt_parsed.year, dt_parsed.month, dt_parsed.day, 23, 59, 59)
            except ValueError:
                pass

    return start_dt, end_dt


def _find_student(db: Session, student_id_str: str) -> Optional[User]:
    if not student_id_str:
        return None
    return db.query(User).filter(
        or_(
            User.roll_number == student_id_str,
            User.library_card_number == student_id_str,
            User.email == student_id_str,
            func.cast(User.id, String) == student_id_str if hasattr(User, "id") else False
        )
    ).first()


# ---------------------------------------------------------------------------
# 1. ADMIN REPORTS ENDPOINTS
# ---------------------------------------------------------------------------

@router.get("/overview")
def admin_overview_report(
    preset: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    start_dt, end_dt = _parse_date_range(preset, start_date, end_date)

    total_books = db.query(Book).count()
    total_students = db.query(User).filter(
        or_(func.lower(User.role) == "student", func.lower(User.role) == "user")
    ).count()

    issues_query = db.query(BookIssue)
    returns_query = db.query(BookIssue).filter(BookIssue.return_date.isnot(None))
    fines_query = db.query(BookFine)

    if start_dt:
        issues_query = issues_query.filter(BookIssue.issue_date >= start_dt, BookIssue.issue_date <= end_dt)
        returns_query = returns_query.filter(BookIssue.return_date >= start_dt, BookIssue.return_date <= end_dt)
        fines_query = fines_query.filter(BookFine.created_at >= start_dt, BookFine.created_at <= end_dt)

    books_issued_count = issues_query.count()
    books_returned_count = returns_query.count()

    fines = fines_query.all()
    total_fines_collected = sum(float(f.fine_paid or 0.0) for f in fines)
    total_fines_pending = sum(max(0.0, float(f.fine_amount or 0.0) - float(f.fine_paid or 0.0)) for f in fines if f.status != "Paid")

    # Issue vs Return Trends (last 6 months or current range)
    issues_all = issues_query.all()
    returns_all = returns_query.all()

    month_labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    issue_monthly = [0] * 12
    return_monthly = [0] * 12

    for i in issues_all:
        if i.issue_date:
            issue_monthly[i.issue_date.month - 1] += 1
    for r in returns_all:
        if r.return_date:
            return_monthly[r.return_date.month - 1] += 1

    # Seat utilization Overview
    total_seats = db.query(Seat).count() or 160
    occupied_seats = db.query(SeatReservation).filter(SeatReservation.status.in_(["RESERVED", "CHECKED_IN"])).count()
    available_seats = max(0, total_seats - occupied_seats)

    # Attendance Overview
    att_query = db.query(AttendanceLog)
    if start_dt:
        att_query = att_query.filter(AttendanceLog.check_in_time >= start_dt, AttendanceLog.check_in_time <= end_dt)
    present_count = att_query.count()

    return {
        "success": True,
        "kpis": {
            "totalBooks": total_books,
            "totalStudents": total_students,
            "booksIssued": books_issued_count,
            "booksReturned": books_returned_count,
            "totalFinesCollected": total_fines_collected,
            "totalFinesPending": total_fines_pending,
            "totalSeats": total_seats,
            "occupiedSeats": occupied_seats,
            "availableSeats": available_seats,
            "presentAttendance": present_count
        },
        "charts": {
            "months": month_labels,
            "issuedMonthly": issue_monthly,
            "returnedMonthly": return_monthly,
            "seatUtilization": {
                "occupied": occupied_seats,
                "available": available_seats,
                "maintenance": 0
            }
        }
    }


@router.get("/books")
def admin_books_report(
    preset: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    dept_str = _clean_str_param(department)
    search_str = _clean_str_param(search)

    query = db.query(Book)
    if dept_str and dept_str.lower() != "all":
        query = query.filter(Book.category.ilike(f"%{dept_str}%"))
    if search_str:
        s = f"%{search_str}%"
        query = query.filter(or_(Book.title.ilike(s), Book.author.ilike(s), Book.isbn.ilike(s)))

    books = query.all()
    total_books = len(books)
    available_books = sum(b.available_copies for b in books if b.available_copies is not None)
    total_copies_sum = sum(b.total_copies for b in books if b.total_copies is not None)
    issued_copies_sum = max(0, total_copies_sum - available_books)
    low_stock_count = sum(1 for b in books if (b.available_copies or 0) <= 2)

    # Book inventory list
    book_list = []
    for b in books:
        # Calculate issue count
        issue_cnt = db.query(BookIssue).filter(
            or_(BookIssue.book_id == str(b.id), BookIssue.book_title == b.title)
        ).count()

        book_list.append({
            "id": str(b.id),
            "isbn": b.isbn or "-",
            "title": b.title,
            "author": b.author or "Unknown",
            "category": b.category or "General",
            "totalCopies": b.total_copies or 1,
            "availableCopies": b.available_copies if b.available_copies is not None else 1,
            "issuedCount": issue_cnt,
            "status": "Low Stock" if (b.available_copies or 0) <= 2 else ("Available" if (b.available_copies or 0) > 0 else "Out of Stock")
        })

    # Sort popular books by issue count
    popular_books = sorted(book_list, key=lambda x: x["issuedCount"], reverse=True)[:5]

    return {
        "success": True,
        "kpis": {
            "totalBooks": total_books,
            "totalCopies": total_copies_sum,
            "availableCopies": available_books,
            "issuedCopies": issued_copies_sum,
            "lowStockCount": low_stock_count
        },
        "popularBooks": popular_books,
        "inventory": book_list
    }


@router.get("/students")
def admin_students_report(
    department: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    dept_str = _clean_str_param(department)
    search_str = _clean_str_param(search)

    query = db.query(User).filter(
        or_(func.lower(User.role) == "student", func.lower(User.role) == "user")
    )
    if dept_str and dept_str.lower() != "all":
        query = query.filter(User.department.ilike(f"%{dept_str}%"))
    if search_str:
        s = f"%{search_str}%"
        query = query.filter(or_(User.name.ilike(s), User.roll_number.ilike(s), User.email.ilike(s)))

    students = query.all()
    total_students = len(students)

    dept_counts = {}
    student_list = []

    for s in students:
        dept = s.department or "Unassigned"
        dept_counts[dept] = dept_counts.get(dept, 0) + 1

        # Search student issues and fines
        search_ids = [str(s.id)]
        if s.roll_number: search_ids.append(s.roll_number)
        if s.library_card_number: search_ids.append(s.library_card_number)

        active_issues = db.query(BookIssue).filter(
            BookIssue.student_id.in_(search_ids),
            BookIssue.return_date.is_(None)
        ).count()

        pending_fines = db.query(BookFine).filter(
            BookFine.student_id.in_(search_ids),
            BookFine.status != "Paid"
        ).all()
        pending_fine_amt = sum(max(0.0, float(f.fine_amount or 0.0) - float(f.fine_paid or 0.0)) for f in pending_fines)

        student_list.append({
            "id": str(s.id),
            "name": s.name or "Student",
            "rollNo": s.roll_number or "-",
            "libraryCardNo": s.library_card_number or "-",
            "email": s.email or "-",
            "department": dept,
            "className": s.class_name or "B.Tech",
            "activeIssuesCount": active_issues,
            "pendingFineAmount": pending_fine_amt,
            "status": s.status or "ACTIVE"
        })

    return {
        "success": True,
        "kpis": {
            "totalStudents": total_students,
            "departmentsCount": len(dept_counts)
        },
        "departmentDistribution": dept_counts,
        "students": student_list
    }


@router.get("/issues")
def admin_issues_report(
    preset: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    start_dt, end_dt = _parse_date_range(preset, start_date, end_date)
    status_str = _clean_str_param(status)
    search_str = _clean_str_param(search)

    query = db.query(BookIssue)
    if start_dt:
        query = query.filter(BookIssue.issue_date >= start_dt, BookIssue.issue_date <= end_dt)
    if status_str and status_str.lower() != "all":
        query = query.filter(BookIssue.status.ilike(f"%{status_str}%"))
    if search_str:
        s = f"%{search_str}%"
        query = query.filter(or_(BookIssue.book_title.ilike(s), BookIssue.issue_code.ilike(s), BookIssue.student_id.ilike(s)))

    issues = query.order_by(desc(BookIssue.issue_date)).all()

    total_issues = len(issues)
    currently_issued = sum(1 for i in issues if i.return_date is None and not (i.status or "").lower().startswith("returned"))
    returned_count = sum(1 for i in issues if i.return_date is not None or (i.status or "").lower().startswith("returned"))
    now = datetime.now()
    overdue_count = sum(1 for i in issues if i.return_date is None and i.due_date and i.due_date < now)

    issue_list = []
    for i in issues:
        # Find student and book
        stu = db.query(User).filter(
            or_(
                func.cast(User.id, String) == i.student_id if hasattr(User, "id") else False,
                User.roll_number == i.student_id,
                User.library_card_number == i.student_id
            )
        ).first()

        bk = db.query(Book).filter(or_(func.cast(Book.id, String) == i.book_id if hasattr(Book, "id") else False, Book.title == i.book_title)).first()

        issue_list.append({
            "id": str(i.id),
            "issueCode": i.issue_code or str(i.id),
            "studentName": stu.name if stu else i.student_id,
            "rollNo": stu.roll_number if stu else "-",
            "bookTitle": i.book_title,
            "author": bk.author if bk else "Unknown",
            "issueDate": i.issue_date.strftime("%Y-%m-%d") if i.issue_date else "-",
            "dueDate": i.due_date.strftime("%Y-%m-%d") if i.due_date else "-",
            "returnDate": i.return_date.strftime("%Y-%m-%d") if i.return_date else "-",
            "status": i.status or "active"
        })

    return {
        "success": True,
        "kpis": {
            "totalIssued": total_issues,
            "currentlyIssued": currently_issued,
            "returnedCount": returned_count,
            "overdueCount": overdue_count
        },
        "issues": issue_list
    }


@router.get("/fines")
def admin_fines_report(
    preset: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    start_dt, end_dt = _parse_date_range(preset, start_date, end_date)
    status_str = _clean_str_param(status)
    search_str = _clean_str_param(search)

    query = db.query(BookFine)
    if start_dt:
        query = query.filter(BookFine.created_at >= start_dt, BookFine.created_at <= end_dt)
    if status_str and status_str.lower() != "all":
        query = query.filter(BookFine.status.ilike(f"%{status_str}%"))
    if search_str:
        s = f"%{search_str}%"
        query = query.filter(or_(BookFine.book_title.ilike(s), BookFine.fine_code.ilike(s), BookFine.student_id.ilike(s)))

    fines = query.order_by(desc(BookFine.created_at)).all()

    total_generated = sum(float(f.fine_amount or 0.0) for f in fines)
    total_collected = sum(float(f.fine_paid or 0.0) for f in fines)
    pending_amount = sum(max(0.0, float(f.fine_amount or 0.0) - float(f.fine_paid or 0.0)) for f in fines if f.status != "Paid")

    fine_list = []
    for f in fines:
        stu = db.query(User).filter(
            or_(
                func.cast(User.id, String) == f.student_id if hasattr(User, "id") else False,
                User.roll_number == f.student_id,
                User.library_card_number == f.student_id
            )
        ).first()

        fine_list.append({
            "id": str(f.id),
            "fineCode": f.fine_code or str(f.id),
            "studentName": stu.name if stu else f.student_id,
            "rollNo": stu.roll_number if stu else "-",
            "bookTitle": f.book_title,
            "originalDueDate": f.original_due_date.strftime("%Y-%m-%d") if f.original_due_date else "-",
            "returnDate": f.return_date.strftime("%Y-%m-%d") if f.return_date else "-",
            "daysOverdue": f.days_overdue or 0,
            "fineAmount": float(f.fine_amount or 0.0),
            "finePaid": float(f.fine_paid or 0.0),
            "status": f.status or "Unpaid",
            "paymentMethod": f.payment_method or "-",
            "transactionId": f.transaction_id or "-"
        })

    return {
        "success": True,
        "kpis": {
            "totalGenerated": total_generated,
            "totalCollected": total_collected,
            "pendingAmount": pending_amount,
            "totalFinesCount": len(fines)
        },
        "fines": fine_list
    }


@router.get("/attendance")
def admin_attendance_report(
    preset: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    start_dt, end_dt = _parse_date_range(preset, start_date, end_date)
    search_str = _clean_str_param(search)

    query = db.query(AttendanceLog)
    if start_dt:
        query = query.filter(AttendanceLog.check_in_time >= start_dt, AttendanceLog.check_in_time <= end_dt)

    logs = query.order_by(desc(AttendanceLog.check_in_time)).all()

    total_logs = len(logs)
    total_students = db.query(User).filter(or_(func.lower(User.role) == "student", func.lower(User.role) == "user")).count() or 1

    attendance_list = []
    for l in logs:
        stu = db.query(User).filter(User.id == l.user_id).first()
        if search_str:
            s = search_str.lower()
            if stu and not (s in (stu.name or "").lower() or s in (stu.roll_number or "").lower()):
                continue

        # Look up corresponding seat reservation for student on this date
        res_seat = db.query(SeatReservation, Seat).join(
            Seat, SeatReservation.seat_id == Seat.id
        ).filter(
            SeatReservation.user_id == l.user_id,
            SeatReservation.booking_date == (l.date if l.date else l.check_in_time.date())
        ).order_by(SeatReservation.start_time.desc()).first()
        seat_code = res_seat[1].seat_code if res_seat else "General Entry"

        attendance_list.append({
            "id": str(l.id),
            "studentName": stu.name if stu else "Student",
            "rollNo": stu.roll_number if stu else "-",
            "department": stu.department if stu else "-",
            "seatCode": seat_code,
            "date": l.date.strftime("%Y-%m-%d") if l.date else l.check_in_time.strftime("%Y-%m-%d"),
            "checkInTime": l.check_in_time.strftime("%I:%M %p") if l.check_in_time else "-",
            "checkOutTime": l.check_out_time.strftime("%I:%M %p") if l.check_out_time else "-",
            "method": l.verification_method or "BARCODE",
            "status": l.status or "PRESENT"
        })

    att_rate = min(100.0, round((len(attendance_list) / max(1, total_students * 30)) * 100, 1))

    return {
        "success": True,
        "kpis": {
            "totalLogs": len(attendance_list),
            "attendanceRate": att_rate,
            "totalStudents": total_students
        },
        "attendance": attendance_list
    }


@router.get("/seats")
def admin_seats_report(
    preset: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    start_dt, end_dt = _parse_date_range(preset, start_date, end_date)

    query = db.query(SeatReservation)
    if start_dt:
        query = query.filter(SeatReservation.start_time >= start_dt, SeatReservation.start_time <= end_dt)

    reservations = query.order_by(desc(SeatReservation.created_at)).all()

    total_seats = db.query(Seat).count() or 160
    occupied_count = db.query(SeatReservation).filter(SeatReservation.status.in_(["RESERVED", "CHECKED_IN"])).count()
    available_seats = max(0, total_seats - occupied_count)

    booking_list = []
    for r in reservations:
        stu = db.query(User).filter(User.id == r.user_id).first()
        seat = db.query(Seat).filter(Seat.id == r.seat_id).first()

        booking_list.append({
            "id": str(r.id),
            "seatCode": seat.seat_code if seat else "Seat",
            "floor": seat.floor if seat else "Ground",
            "studentName": stu.name if stu else "Student",
            "rollNo": stu.roll_number if stu else "-",
            "bookingDate": r.booking_date.strftime("%Y-%m-%d") if r.booking_date else "-",
            "startTime": r.start_time.strftime("%I:%M %p") if r.start_time else "-",
            "endTime": r.end_time.strftime("%I:%M %p") if r.end_time else "-",
            "status": r.status or "RESERVED"
        })

    return {
        "success": True,
        "kpis": {
            "totalSeats": total_seats,
            "availableSeats": available_seats,
            "occupiedSeats": occupied_count,
            "totalBookings": len(booking_list)
        },
        "bookings": booking_list
    }


@router.get("/notifications")
def admin_notifications_report(db: Session = Depends(get_db)):
    notifs = db.query(Notification).order_by(desc(Notification.created_at)).all()
    notif_list = []
    for n in notifs:
        stu = db.query(User).filter(User.id == n.user_id).first() if n.user_id else None
        notif_list.append({
            "id": str(n.id),
            "title": n.title,
            "message": n.message,
            "type": n.type or "GENERAL",
            "targetUser": stu.name if stu else "All Students",
            "createdAt": n.created_at.strftime("%Y-%m-%d %H:%M") if n.created_at else "-"
        })

    return {
        "success": True,
        "kpis": {
            "totalNotifications": len(notif_list),
            "unreadCount": sum(1 for n in notifs if not n.is_read)
        },
        "notifications": notif_list
    }


# ---------------------------------------------------------------------------
# 2. STUDENT REPORTS ENDPOINTS
# ---------------------------------------------------------------------------
def _get_student_user_and_ids(db: Session, user_id: uuid.UUID) -> tuple[Optional[User], list[str]]:
    user = None
    if user_id:
        user = db.query(User).filter(User.id == user_id).first()

    if not user:
        user = db.query(User).filter(or_(func.lower(User.role) == "student", func.lower(User.role) == "user")).first()

    search_ids = []
    if user:
        search_ids.append(str(user.id))
        if user.roll_number:
            search_ids.append(user.roll_number)
        if user.library_card_number:
            search_ids.append(user.library_card_number)
        if user.email:
            search_ids.append(user.email)
        if user.name:
            search_ids.append(user.name)

    return user, search_ids


@student_router.get("/overview")
def student_overview_report(
    preset: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id)
):
    start_dt, end_dt = _parse_date_range(preset, start_date, end_date)
    user, search_ids = _get_student_user_and_ids(db, user_id)
    target_user_id = user.id if user else user_id

    # Student active issues (unreturned books)
    issues = db.query(BookIssue).filter(BookIssue.student_id.in_(search_ids)).all()
    currently_issued = sum(1 for i in issues if i.return_date is None)
    returned_count = sum(1 for i in issues if i.return_date is not None)
    now = datetime.now()
    overdue_count = sum(1 for i in issues if i.return_date is None and i.due_date and i.due_date < now)

    # Student fines
    fines = db.query(BookFine).filter(BookFine.student_id.in_(search_ids)).all()
    pending_fines_amt = sum(max(0.0, float(f.fine_amount or 0.0) - float(f.fine_paid or 0.0)) for f in fines if f.status != "Paid")

    # Student seat bookings
    seat_bookings = db.query(SeatReservation).filter(
        or_(
            SeatReservation.user_id == target_user_id,
            func.cast(SeatReservation.user_id, String).in_(search_ids)
        )
    ).count()

    # Student attendance
    att_logs = db.query(AttendanceLog).filter(
        or_(
            AttendanceLog.user_id == target_user_id,
            func.cast(AttendanceLog.user_id, String).in_(search_ids)
        )
    ).all()
    present_days = len(att_logs)
    attendance_rate = min(100.0, round((present_days / 25.0) * 100, 1)) if present_days > 0 else 0.0

    # Monthly reading history
    month_labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    issued_monthly = [0] * 12
    returned_monthly = [0] * 12
    for i in issues:
        if i.issue_date:
            issued_monthly[i.issue_date.month - 1] += 1
        if i.return_date:
            returned_monthly[i.return_date.month - 1] += 1

    # Student recent book transactions
    recent_transactions = []
    for i in issues[:5]:
        fine_obj = db.query(BookFine).filter(BookFine.issue_id == i.id).first()
        recent_transactions.append({
            "id": str(i.id),
            "bookTitle": i.book_title,
            "issueDate": i.issue_date.strftime("%Y-%m-%d") if i.issue_date else "-",
            "dueDate": i.due_date.strftime("%Y-%m-%d") if i.due_date else "-",
            "returnDate": i.return_date.strftime("%Y-%m-%d") if i.return_date else "-",
            "fine": float(fine_obj.fine_amount) if fine_obj else 0.0,
            "status": "Returned" if i.return_date else ("Overdue" if (i.due_date and i.due_date < now) else "Issued")
        })

    # Student notifications
    notifs = db.query(Notification).filter(
        or_(
            Notification.user_id == target_user_id,
            Notification.user_id.is_(None),
            func.cast(Notification.user_id, String).in_(search_ids)
        )
    ).order_by(desc(Notification.created_at)).limit(5).all()

    notif_list = [{
        "id": str(n.id),
        "title": n.title,
        "message": n.message,
        "type": n.type or "GENERAL",
        "date": n.created_at.strftime("%b %d, %Y") if n.created_at else "-"
    } for n in notifs]

    return {
        "success": True,
        "user": {
            "id": str(user.id) if user else str(user_id),
            "name": user.name if user else "Student",
            "rollNo": user.roll_number if user else "-",
            "className": user.class_name if user else "-"
        },
        "kpis": {
            "currentlyIssued": currently_issued,
            "returnedBooks": returned_count,
            "overdueBooks": overdue_count,
            "pendingFines": pending_fines_amt,
            "seatBookings": seat_bookings,
            "attendanceRate": attendance_rate
        },
        "charts": {
            "months": month_labels,
            "issuedMonthly": issued_monthly,
            "returnedMonthly": returned_monthly
        },
        "recentTransactions": recent_transactions,
        "notifications": notif_list
    }


@student_router.get("/books")
def student_books_report(
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id)
):
    user, search_ids = _get_student_user_and_ids(db, user_id)
    issues = db.query(BookIssue).filter(BookIssue.student_id.in_(search_ids)).order_by(desc(BookIssue.issue_date)).all()

    book_list = []
    for i in issues:
        bk = db.query(Book).filter(or_(func.cast(Book.id, String) == i.book_id if hasattr(Book, "id") else False, Book.title == i.book_title)).first()
        book_list.append({
            "id": str(i.id),
            "issueCode": i.issue_code or str(i.id),
            "title": i.book_title,
            "author": bk.author if bk else "Unknown",
            "isbn": bk.isbn if bk else "-",
            "issueDate": i.issue_date.strftime("%Y-%m-%d") if i.issue_date else "-",
            "dueDate": i.due_date.strftime("%Y-%m-%d") if i.due_date else "-",
            "returnDate": i.return_date.strftime("%Y-%m-%d") if i.return_date else "-",
            "status": "Returned" if i.return_date else ("Overdue" if (i.due_date and i.due_date < datetime.now()) else "Issued")
        })

    return {"success": True, "books": book_list}


@student_router.get("/fines")
def student_fines_report(
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id)
):
    user, search_ids = _get_student_user_and_ids(db, user_id)
    fines = db.query(BookFine).filter(BookFine.student_id.in_(search_ids)).order_by(desc(BookFine.created_at)).all()

    fine_list = []
    for f in fines:
        fine_list.append({
            "id": str(f.id),
            "fineCode": f.fine_code or str(f.id),
            "bookTitle": f.book_title,
            "originalDueDate": f.original_due_date.strftime("%Y-%m-%d") if f.original_due_date else "-",
            "returnDate": f.return_date.strftime("%Y-%m-%d") if f.return_date else "-",
            "daysOverdue": f.days_overdue or 0,
            "fineAmount": float(f.fine_amount or 0.0),
            "finePaid": float(f.fine_paid or 0.0),
            "status": f.status or "Unpaid",
            "paymentMethod": f.payment_method or "-"
        })

    return {"success": True, "fines": fine_list}


@student_router.get("/attendance")
def student_attendance_report(
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id)
):
    user, search_ids = _get_student_user_and_ids(db, user_id)
    target_uid = user.id if user else user_id
    logs = db.query(AttendanceLog).filter(
        or_(
            AttendanceLog.user_id == target_uid,
            func.cast(AttendanceLog.user_id, String).in_(search_ids)
        )
    ).order_by(desc(AttendanceLog.check_in_time)).all()

    att_list = []
    for l in logs:
        att_list.append({
            "id": str(l.id),
            "date": l.date.strftime("%Y-%m-%d") if l.date else l.check_in_time.strftime("%Y-%m-%d"),
            "checkInTime": l.check_in_time.strftime("%I:%M %p") if l.check_in_time else "-",
            "checkOutTime": l.check_out_time.strftime("%I:%M %p") if l.check_out_time else "-",
            "method": l.verification_method or "GEOFENCE",
            "status": l.status or "PRESENT"
        })

    return {
        "success": True,
        "stats": {
            "presentDays": len(att_list),
            "attendanceRate": min(100.0, round((len(att_list) / 25.0) * 100, 1)) if len(att_list) > 0 else 0.0
        },
        "attendance": att_list
    }


@student_router.get("/seats")
def student_seats_report(
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id)
):
    user, search_ids = _get_student_user_and_ids(db, user_id)
    target_uid = user.id if user else user_id
    reservations = db.query(SeatReservation).filter(
        or_(
            SeatReservation.user_id == target_uid,
            func.cast(SeatReservation.user_id, String).in_(search_ids)
        )
    ).order_by(desc(SeatReservation.created_at)).all()

    booking_list = []
    for r in reservations:
        seat = db.query(Seat).filter(Seat.id == r.seat_id).first()
        booking_list.append({
            "id": str(r.id),
            "seatCode": seat.seat_code if seat else "Seat",
            "floor": seat.floor if seat else "Ground",
            "bookingDate": r.booking_date.strftime("%Y-%m-%d") if r.booking_date else "-",
            "startTime": r.start_time.strftime("%I:%M %p") if r.start_time else "-",
            "endTime": r.end_time.strftime("%I:%M %p") if r.end_time else "-",
            "status": r.status or "RESERVED"
        })

    return {"success": True, "bookings": booking_list}


@student_router.get("/notifications")
def student_notifications_report(
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id)
):
    notifs = db.query(Notification).filter(
        or_(Notification.user_id == user_id, Notification.user_id.is_(None))
    ).order_by(desc(Notification.created_at)).all()

    notif_list = [{
        "id": str(n.id),
        "title": n.title,
        "message": n.message,
        "type": n.type or "GENERAL",
        "createdAt": n.created_at.strftime("%Y-%m-%d %H:%M") if n.created_at else "-"
    } for n in notifs]

    return {"success": True, "notifications": notif_list}


# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# 3. REPORT EXPORT (CSV / PDF)
# ---------------------------------------------------------------------------

def _build_pdf_response(title_text: str, subtitle_text: str, kpi_pairs: list[tuple[str, str]], headers: list[str], rows: list[list[Any]], filename: str):
    pdf_buffer = io.BytesIO()
    doc = SimpleDocTemplate(pdf_buffer, pagesize=A4, rightMargin=30, leftMargin=30, topMargin=30, bottomMargin=30)
    styles = getSampleStyleSheet()

    elements = []
    title_style = ParagraphStyle(
        'ReportTitle',
        parent=styles['Heading1'],
        fontSize=16,
        textColor=colors.HexColor("#3D539F"),
        spaceAfter=4
    )
    subtitle_style = ParagraphStyle(
        'ReportSubtitle',
        parent=styles['Normal'],
        fontSize=9,
        textColor=colors.HexColor("#64748B"),
        spaceAfter=12
    )

    elements.append(Paragraph(title_text, title_style))
    elements.append(Paragraph(f"Generated On: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} | {subtitle_text}", subtitle_style))
    elements.append(Spacer(1, 8))

    # KPI Summary Box (if present)
    if kpi_pairs:
        elements.append(Paragraph("<b>KEY PERFORMANCE SUMMARY (KPI METRICS)</b>", styles['Heading2']))
        elements.append(Spacer(1, 4))
        kpi_table_data = []
        for idx in range(0, len(kpi_pairs), 2):
            chunk = kpi_pairs[idx:idx+2]
            row_cell = []
            for label, val in chunk:
                row_cell.append(Paragraph(f"<b>{label}:</b> {val}", styles['Normal']))
            while len(row_cell) < 2:
                row_cell.append(Paragraph("", styles['Normal']))
            kpi_table_data.append(row_cell)

        kpi_table = Table(kpi_table_data, colWidths=[260, 260])
        kpi_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#F1F5F9')),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 8),
            ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
            ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E2E8F0')),
        ]))
        elements.append(kpi_table)
        elements.append(Spacer(1, 14))

    # Detailed Table
    elements.append(Paragraph("<b>DETAILED RECORDS TABLE</b>", styles['Heading2']))
    elements.append(Spacer(1, 6))

    table_data = [[Paragraph(f"<b>{h}</b>", styles['Normal']) for h in headers]]
    for row in rows[:60]:
        table_data.append([Paragraph(str(val), styles['Normal']) for val in row])

    pdf_table = Table(table_data)
    pdf_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#EEF2FF')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#3D539F')),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
    ]))

    elements.append(pdf_table)
    doc.build(elements)

    pdf_bytes = pdf_buffer.getvalue()
    pdf_buffer.close()

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}.pdf"'}
    )


@student_router.get("/download")
def student_download_report(
    report_type: str = Query("overview"),
    format: str = Query("pdf"),
    preset: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id)
):
    user, search_ids = _get_student_user_and_ids(db, user_id)
    format_clean = (_clean_str_param(format) or "pdf").lower()
    report_clean = (_clean_str_param(report_type) or "overview").lower()
    filename = f"student_{report_clean}_report_{datetime.now().strftime('%Y%m%d')}"

    subtitle_text = f"Student: {user.name if user else 'Gauri Pakhare'} (Roll: {user.roll_number if user else '308255'})"
    kpi_pairs = []
    headers = []
    rows = []

    if report_clean == "overview":
        res = student_overview_report(preset=preset, start_date=start_date, end_date=end_date, db=db, user_id=user_id)
        k = res.get("kpis", {})
        kpi_pairs = [
            ("Currently Issued", str(k.get("currentlyIssued", 0))),
            ("Returned Books", str(k.get("returnedBooks", 0))),
            ("Overdue Books", str(k.get("overdueBooks", 0))),
            ("Pending Fines", f"Rs. {k.get('pendingFines', 0)}"),
            ("Seat Bookings", str(k.get("seatBookings", 0))),
            ("Attendance Rate", f"{k.get('attendanceRate', 0)}%")
        ]
        headers = ["Book Title", "Issue Date", "Due Date", "Return Date", "Fine (Rs)", "Status"]
        for t in res.get("recentTransactions", []):
            rows.append([t["bookTitle"], t["issueDate"], t["dueDate"], t["returnDate"], f"Rs. {t['fine']}", t["status"]])

    elif report_clean == "books":
        res = student_books_report(db=db, user_id=user_id)
        books = res.get("books", [])
        active_cnt = sum(1 for b in books if b.get("returnDate") == "-" or "returned" not in (b.get("status") or "").lower())
        returned_cnt = sum(1 for b in books if b.get("returnDate") != "-" or "returned" in (b.get("status") or "").lower())
        kpi_pairs = [
            ("Total Books Borrowed", str(len(books))),
            ("Active Issues", str(active_cnt)),
            ("Returned Books", str(returned_cnt))
        ]
        headers = ["Issue Code", "Book Title", "Author", "ISBN", "Issue Date", "Due Date", "Return Date", "Status"]
        for b in books:
            rows.append([b["issueCode"], b["title"], b["author"], b["isbn"], b["issueDate"], b["dueDate"], b["returnDate"], b["status"]])

    elif report_clean == "fines":
        res = student_fines_report(db=db, user_id=user_id)
        fines = res.get("fines", [])
        total_paid = sum(float(f.get("finePaid", 0)) for f in fines)
        pending_amt = sum(float(f.get("fineAmount", 0)) - float(f.get("finePaid", 0)) for f in fines if f.get("status") != "Paid")
        kpi_pairs = [
            ("Total Fine Records", str(len(fines))),
            ("Total Fine Paid", f"Rs. {total_paid}"),
            ("Pending Fine Balance", f"Rs. {pending_amt}")
        ]
        headers = ["Fine Code", "Book Title", "Original Due Date", "Return Date", "Overdue Days", "Fine Amount (Rs)", "Paid (Rs)", "Status"]
        for f in fines:
            rows.append([f["fineCode"], f["bookTitle"], f["originalDueDate"], f["returnDate"], f"{f['daysOverdue']} days", f"Rs. {f['fineAmount']}", f"Rs. {f['finePaid']}", f["status"]])

    elif report_clean == "attendance":
        res = student_attendance_report(db=db, user_id=user_id)
        att = res.get("attendance", [])
        st = res.get("stats", {})
        kpi_pairs = [
            ("Days Present", str(st.get("presentDays", len(att)))),
            ("Attendance Rate", f"{st.get('attendanceRate', 0)}%")
        ]
        headers = ["Date", "Check-in Time", "Check-out Time", "Method", "Status"]
        for a in att:
            rows.append([a["date"], a["checkInTime"], a["checkOutTime"], a["method"], a["status"]])

    elif report_clean == "seats":
        res = student_seats_report(db=db, user_id=user_id)
        bk = res.get("bookings", [])
        kpi_pairs = [("Total Reservations", str(len(bk)))]
        headers = ["Seat Code", "Floor Location", "Booking Date", "Time Slot", "Status"]
        for b in bk:
            rows.append([b["seatCode"], b["floor"], b["bookingDate"], f"{b['startTime']} - {b['endTime']}", b["status"]])

    else:
        res = student_notifications_report(db=db, user_id=user_id)
        notifs = res.get("notifications", [])
        kpi_pairs = [("Total Notifications", str(len(notifs)))]
        headers = ["Title", "Message", "Category", "Date"]
        for n in notifs:
            rows.append([n["title"], n["message"], n["type"], n.get("createdAt") or n.get("date")])

    title_text = f"STUDENT - MY {report_clean.upper()} REPORT"

    if format_clean == "csv" or not HAS_REPORTLAB:
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["REPORT TITLE", title_text])
        writer.writerow(["STUDENT", subtitle_text])
        writer.writerow([])
        for label, val in kpi_pairs:
            writer.writerow([label, val])
        writer.writerow([])
        writer.writerow(headers)
        writer.writerows(rows)
        return Response(content=output.getvalue(), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{filename}.csv"'})

    return _build_pdf_response(title_text, subtitle_text, kpi_pairs, headers, rows, filename)


@router.get("/download")
def download_report(
    report_type: str = Query("overview"),
    format: str = Query("pdf"),
    preset: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    format_clean = (_clean_str_param(format) or "pdf").lower()
    report_clean = (_clean_str_param(report_type) or "overview").lower()
    filename = f"admin_{report_clean}_report_{datetime.now().strftime('%Y%m%d')}"

    subtitle_text = f"Scope: All Library Records | Preset: {preset or 'All Time'}"
    kpi_pairs = []
    headers = []
    rows = []

    if report_clean == "overview":
        res = admin_overview_report(preset=preset, start_date=start_date, end_date=end_date, db=db)
        k = res.get("kpis", {})
        kpi_pairs = [
            ("Total Books", str(k.get("totalBooks", 0))),
            ("Registered Students", str(k.get("totalStudents", 0))),
            ("Books Issued", str(k.get("booksIssued", 0))),
            ("Books Returned", str(k.get("booksReturned", 0))),
            ("Fines Collected", f"Rs. {k.get('totalFinesCollected', 0)}"),
            ("Fines Pending", f"Rs. {k.get('totalFinesPending', 0)}"),
            ("Available Seats", str(k.get("availableSeats", 0))),
            ("Attendance Check-ins", str(k.get("presentAttendance", 0)))
        ]
        headers = ["Metric Name", "Value / Count", "Category", "Status"]
        rows = [
            ["Total Library Books", str(k.get("totalBooks", 0)), "Catalog Inventory", "Active"],
            ["Registered Students", str(k.get("totalStudents", 0)), "User Base", "Active"],
            ["Total Books Issued", str(k.get("booksIssued", 0)), "Circulation", "Issued"],
            ["Total Books Returned", str(k.get("booksReturned", 0)), "Circulation", "Returned"],
            ["Total Fines Collected", f"Rs. {k.get('totalFinesCollected', 0)}", "Finance", "Collected"],
            ["Total Fines Pending", f"Rs. {k.get('totalFinesPending', 0)}", "Finance", "Pending"]
        ]

    elif report_clean == "books":
        res = admin_books_report(preset=preset, department=department, db=db)
        k = res.get("kpis", {})
        kpi_pairs = [
            ("Total Titles", str(k.get("totalBooks", 0))),
            ("Total Copies", str(k.get("totalCopies", 0))),
            ("Available Copies", str(k.get("availableCopies", 0))),
            ("Issued Copies", str(k.get("issuedCopies", 0))),
            ("Low Stock Titles", str(k.get("lowStockCount", 0)))
        ]
        headers = ["ISBN", "Book Title", "Author", "Category", "Total Copies", "Available Copies", "Issued Count", "Status"]
        for b in res.get("inventory", []):
            rows.append([b["isbn"], b["title"], b["author"], b["category"], b["totalCopies"], b["availableCopies"], b["issuedCount"], b["status"]])

    elif report_clean == "students":
        res = admin_students_report(department=department, db=db)
        k = res.get("kpis", {})
        kpi_pairs = [
            ("Total Students", str(k.get("totalStudents", 0))),
            ("Departments Count", str(k.get("departmentsCount", 0)))
        ]
        headers = ["Student Name", "Roll No", "Library Card No", "Department", "Class", "Active Issues", "Pending Fine (Rs)", "Status"]
        for s in res.get("students", []):
            rows.append([s["name"], s["rollNo"], s["libraryCardNo"], s["department"], s["className"], s["activeIssuesCount"], f"Rs. {s['pendingFineAmount']}", s["status"]])

    elif report_clean == "issues":
        res = admin_issues_report(preset=preset, start_date=start_date, end_date=end_date, db=db)
        k = res.get("kpis", {})
        kpi_pairs = [
            ("Total Issued", str(k.get("totalIssued", 0))),
            ("Currently Issued", str(k.get("currentlyIssued", 0))),
            ("Returned Count", str(k.get("returnedCount", 0))),
            ("Overdue Count", str(k.get("overdueCount", 0)))
        ]
        headers = ["Issue Code", "Student Name", "Roll No", "Book Title", "Author", "Issue Date", "Due Date", "Return Date", "Status"]
        for item in res.get("issues", []):
            rows.append([item["issueCode"], item["studentName"], item["rollNo"], item["bookTitle"], item["author"], item["issueDate"], item["dueDate"], item["returnDate"], item["status"]])

    elif report_clean == "fines":
        res = admin_fines_report(preset=preset, start_date=start_date, end_date=end_date, db=db)
        k = res.get("kpis", {})
        kpi_pairs = [
            ("Fine Generated", f"Rs. {k.get('totalGenerated', 0)}"),
            ("Fine Collected", f"Rs. {k.get('totalCollected', 0)}"),
            ("Pending Amount", f"Rs. {k.get('pendingAmount', 0)}"),
            ("Total Fine Records", str(k.get("totalFinesCount", 0)))
        ]
        headers = ["Fine Code", "Student Name", "Roll No", "Book Title", "Days Overdue", "Fine Amount (Rs)", "Paid (Rs)", "Status", "Payment Method"]
        for f in res.get("fines", []):
            rows.append([f["fineCode"], f["studentName"], f["rollNo"], f["bookTitle"], f"{f['daysOverdue']} days", f"Rs. {f['fineAmount']}", f"Rs. {f['finePaid']}", f["status"], f["paymentMethod"]])

    elif report_clean == "attendance":
        res = admin_attendance_report(preset=preset, start_date=start_date, end_date=end_date, db=db)
        k = res.get("kpis", {})
        kpi_pairs = [
            ("Total Logs", str(k.get("totalLogs", 0))),
            ("Attendance Rate", f"{k.get('attendanceRate', 0)}%"),
            ("Registered Students", str(k.get("totalStudents", 0)))
        ]
        headers = ["Student Name", "Roll No", "Department", "Date", "Check-in Time", "Check-out Time", "Method", "Status"]
        for a in res.get("attendance", []):
            rows.append([a["studentName"], a["rollNo"], a["department"], a["date"], a["checkInTime"], a["checkOutTime"], a["method"], a["status"]])

    elif report_clean == "seats":
        res = admin_seats_report(preset=preset, start_date=start_date, end_date=end_date, db=db)
        k = res.get("kpis", {})
        kpi_pairs = [
            ("Total Seats", str(k.get("totalSeats", 274))),
            ("Available Seats", str(k.get("availableSeats", 274))),
            ("Occupied Seats", str(k.get("occupiedSeats", 0))),
            ("Total Reservations", str(k.get("totalBookings", 0)))
        ]
        headers = ["Seat Code", "Floor", "Student Name", "Roll No", "Booking Date", "Start Time", "End Time", "Status"]
        for b in res.get("bookings", []):
            rows.append([b["seatCode"], b["floor"], b["studentName"], b["rollNo"], b["bookingDate"], b["startTime"], b["endTime"], b["status"]])

    else:
        res = admin_notifications_report(db=db)
        k = res.get("kpis", {})
        kpi_pairs = [
            ("Total Notifications", str(k.get("totalNotifications", 0))),
            ("Unread Notifications", str(k.get("unreadCount", 0)))
        ]
        headers = ["Title", "Message", "Type", "Target User", "Created At"]
        for n in res.get("notifications", []):
            rows.append([n["title"], n["message"], n["type"], n["targetUser"], n["createdAt"]])

    title_text = f"ADMIN - {report_clean.upper()} REPORT"

    if format_clean == "csv" or not HAS_REPORTLAB:
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["REPORT TITLE", title_text])
        writer.writerow(["SCOPE", subtitle_text])
        writer.writerow([])
        for label, val in kpi_pairs:
            writer.writerow([label, val])
        writer.writerow([])
        writer.writerow(headers)
        writer.writerows(rows)
        return Response(content=output.getvalue(), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{filename}.csv"'})

    return _build_pdf_response(title_text, subtitle_text, kpi_pairs, headers, rows, filename)
