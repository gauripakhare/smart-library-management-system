import uuid
import os
import hmac
import hashlib
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import or_, func

from ..database import get_db
from ..models import User, Book, BookIssue, BookFine, BookReview
from ..schemas import IssueBookSchema, ReturnBookSchema, PayFineSchema, CreateReviewSchema

try:
    import razorpay
except ImportError:  # Payment endpoints report a useful error until dependencies are installed.
    razorpay = None

router = APIRouter(prefix="/api/admin/issues", tags=["Book Issue & Return Management"])
FINE_PER_DAY = 25


def _is_uuid(val: str) -> bool:
    if not val:
        return False
    try:
        uuid.UUID(str(val))
        return True
    except (ValueError, TypeError, AttributeError):
        return False


def _find_student(db: Session, student_id: str) -> Optional[User]:
    if not student_id:
        return None
    user_conds = [
        User.roll_number == student_id,
        User.library_card_number == student_id,
        User.email == student_id
    ]
    if _is_uuid(student_id):
        user_conds.append(User.id == student_id)
    return db.query(User).filter(or_(*user_conds)).first()


def _find_book(db: Session, book_id_or_title: str) -> Optional[Book]:
    if not book_id_or_title:
        return None
    book_conds = [
        Book.isbn == book_id_or_title,
        Book.title == book_id_or_title
    ]
    if _is_uuid(book_id_or_title):
        book_conds.append(Book.id == book_id_or_title)
    return db.query(Book).filter(or_(*book_conds)).first()


def _format_student(u: User) -> dict:
    return {
        "id": str(u.id),
        "name": u.name or "Student",
        "contact": u.contact_number or "-",
        "email": u.email or "-",
        "class": u.class_name or "Student",
        "rollNo": u.roll_number or "-",
        "libraryCardNo": u.library_card_number or "-",
        "batch": u.academic_year or "1R"
    }


def _format_book(b: Book) -> dict:
    return {
        "id": str(b.id),
        "title": b.title,
        "author": b.author or "Unknown",
        "isbn": b.isbn or "-",
        "department": b.category or "General",
        "availableCopies": b.available_copies
    }


def _format_issue(iss: BookIssue, db: Session) -> dict:
    # Find student details
    student = _find_student(db, iss.student_id)
    stu_dict = _format_student(student) if student else {
        "id": iss.student_id,
        "name": "Student",
        "contact": "-",
        "email": "-",
        "class": "-",
        "rollNo": "-",
        "libraryCardNo": "-",
        "batch": "1R"
    }

    # Find book details
    book = _find_book(db, iss.book_id) or db.query(Book).filter(Book.title == iss.book_title).first()
    bk_dict = _format_book(book) if book else {
        "id": iss.book_id,
        "title": iss.book_title,
        "author": "Unknown",
        "isbn": "-",
        "department": "General",
        "availableCopies": 0
    }

    return {
        "id": str(iss.id),
        "issueCode": iss.issue_code,
        "studentId": iss.student_id,
        "student": stu_dict,
        "bookId": iss.book_id,
        "book": bk_dict,
        "bookTitle": iss.book_title,
        "author": bk_dict["author"],
        "isbn": bk_dict["isbn"],
        "issueDate": iss.issue_date.strftime("%Y-%m-%d") if iss.issue_date else "-",
        "dueDate": iss.due_date.strftime("%Y-%m-%d") if iss.due_date else "-",
        "returnDate": iss.return_date.strftime("%Y-%m-%d") if iss.return_date else None,
        "comments": iss.comments or "",
        "status": iss.status or "active"
    }


def _format_fine(fn: BookFine, db: Session) -> dict:
    student = _find_student(db, fn.student_id)
    stu_dict = _format_student(student) if student else {
        "id": fn.student_id,
        "name": "Student",
        "contact": "-",
        "email": "-",
        "class": "-",
        "rollNo": "-",
        "libraryCardNo": "-",
        "batch": "1R"
    }

    book = _find_book(db, fn.book_id) or db.query(Book).filter(Book.title == fn.book_title).first()

    ret_dt = fn.return_date
    if not ret_dt and fn.issue_id:
        iss = db.query(BookIssue).filter(BookIssue.id == fn.issue_id).first()
        if iss and iss.return_date:
            ret_dt = iss.return_date

    roll_display = (student.roll_number if (student and student.roll_number) else None) or stu_dict.get("rollNo")
    if not roll_display or roll_display == "-" or _is_uuid(roll_display):
        roll_display = (student.library_card_number if (student and student.library_card_number) else None) or stu_dict.get("libraryCardNo") or fn.student_id

    return {
        "id": str(fn.id),
        "fineCode": fn.fine_code,
        "issueId": fn.issue_id or "-",
        "studentId": roll_display,
        "rollNo": roll_display,
        "studentRollNo": roll_display,
        "student": stu_dict,
        "studentName": stu_dict.get("name") or "Student",
        "studentClass": stu_dict.get("class") or "-",
        "bookId": fn.book_id or "-",
        "book": fn.book_title,
        "author": book.author if book else "Unknown",
        "isbn": book.isbn if book else "-",
        "originalDueDate": fn.original_due_date.strftime("%Y-%m-%d") if fn.original_due_date else "-",
        "returnDate": ret_dt.strftime("%Y-%m-%d") if ret_dt else "-",
        "daysOverdue": fn.days_overdue,
        "fine": float(fn.fine_amount),
        "finePaid": float(fn.fine_paid),
        "status": fn.status,
        "paymentMethod": fn.payment_method or "",
        "transactionId": fn.transaction_id or "",
        "notes": fn.notes or ""
    }


def _ensure_overdue_fines(db: Session) -> None:
    now = datetime.utcnow()
    overdue_issues = db.query(BookIssue).filter(
        BookIssue.status.in_(["active", "overdue"]),
        BookIssue.due_date < now,
    ).all()
    if not overdue_issues:
        return

    # Bulk query existing fines for overdue issues in 1 query
    existing_fines = db.query(BookFine.issue_id).filter(
        BookFine.issue_id.in_([i.id for i in overdue_issues])
    ).all()
    existing_ids = {f.issue_id for f in existing_fines if f.issue_id}

    fine_count = db.query(func.count(BookFine.id)).scalar() or 0
    fine_number = fine_count + 1001
    created = False

    for issue in overdue_issues:
        if issue.id in existing_ids:
            continue

        days_overdue = max(1, (now - issue.due_date).days)
        fine_code = f"FIN-{fine_number:04d}"
        fine_number += 1

        db.add(BookFine(
            id=fine_code,
            fine_code=fine_code,
            issue_id=issue.id,
            student_id=issue.student_id,
            book_id=issue.book_id,
            book_title=issue.book_title,
            original_due_date=issue.due_date,
            days_overdue=days_overdue,
            fine_amount=days_overdue * FINE_PER_DAY,
            fine_paid=0,
            status="Unpaid",
            notes="Automatically created for overdue book.",
        ))
        created = True

    if created:
        db.commit()


def _normalize_prepaid_issues(db: Session) -> None:
    pass

def _seed_issue_data_if_empty(db: Session):
    pass


@router.get("/issue-data")
def get_issue_data(db: Session = Depends(get_db)):
    _normalize_prepaid_issues(db)
    _ensure_overdue_fines(db)

    # 1. Bulk query all required models in 5 fast queries (NO N+1 roundtrips!)
    users_db = db.query(User).all()
    books_db = db.query(Book).all()
    issues_db = db.query(BookIssue).order_by(BookIssue.issue_date.desc()).all()
    fines_db = db.query(BookFine).order_by(BookFine.created_at.desc()).all()
    reviews_db = db.query(BookReview).order_by(BookReview.created_at.desc()).all()

    # 2. Build fast in-memory lookup dictionaries (0ms lookups)
    stu_map = {}
    formatted_students = []
    for s in users_db:
        sd = _format_student(s)
        stu_map[str(s.id)] = sd
        if s.roll_number: stu_map[s.roll_number] = sd
        if s.library_card_number: stu_map[s.library_card_number] = sd
        if s.email: stu_map[s.email] = sd
        if (s.role or '').lower() in ['student', 'user']:
            formatted_students.append(sd)

    bk_map = {}
    formatted_books = []
    for b in books_db:
        bd = _format_book(b)
        bk_map[str(b.id)] = bd
        if b.isbn: bk_map[b.isbn] = bd
        if b.title: bk_map[b.title.lower()] = bd
        formatted_books.append(bd)

    fines_by_issue = {f.issue_id: f for f in fines_db if f.issue_id}
    reviews_by_title = {}
    for r in reviews_db:
        if r.book_title:
            reviews_by_title[r.book_title.lower()] = r

    # 3. Format active issues and history (0ms)
    formatted_issues = []
    formatted_history = []
    for iss in issues_db:
        is_returned = (iss.return_date is not None) or (iss.status or '').lower().startswith('returned')
        stu_dict = stu_map.get(iss.student_id, {
            "id": iss.student_id,
            "name": "Student",
            "contact": "-",
            "email": "-",
            "class": "-",
            "rollNo": "-",
            "libraryCardNo": "-",
            "batch": "1R"
        })
        bk_dict = bk_map.get(iss.book_id) or bk_map.get((iss.book_title or '').lower(), {
            "id": iss.book_id or "-",
            "title": iss.book_title or "Unknown",
            "author": "Unknown",
            "isbn": "-",
            "department": "General",
            "availableCopies": 0
        })

        if not is_returned:
            formatted_issues.append({
                "id": str(iss.id),
                "issueCode": iss.issue_code,
                "studentId": iss.student_id,
                "student": stu_dict,
                "bookId": iss.book_id,
                "book": bk_dict,
                "bookTitle": iss.book_title,
                "author": bk_dict["author"],
                "isbn": bk_dict["isbn"],
                "issueDate": iss.issue_date.strftime("%Y-%m-%d") if iss.issue_date else "-",
                "dueDate": iss.due_date.strftime("%Y-%m-%d") if iss.due_date else "-",
                "returnDate": None,
                "comments": iss.comments or "",
                "status": iss.status or "active"
            })
        else:
            fine_rec = fines_by_issue.get(iss.id)
            fine_paid = float(fine_rec.fine_paid) if fine_rec else 0.0
            pay_method = fine_rec.payment_method if fine_rec else ""
            tx_id = fine_rec.transaction_id if fine_rec else ""
            ret_dt = iss.return_date or (fine_rec.return_date if fine_rec else None)
            rev = reviews_by_title.get((iss.book_title or '').lower())

            formatted_history.append({
                "id": str(iss.id),
                "issueCode": iss.issue_code,
                "studentId": iss.student_id,
                "student": stu_dict,
                "book": iss.book_title,
                "author": bk_dict["author"],
                "isbn": bk_dict["isbn"],
                "bookId": iss.book_id,
                "issueDate": iss.issue_date.strftime("%Y-%m-%d") if iss.issue_date else "-",
                "originalDueDate": iss.due_date.strftime("%Y-%m-%d") if iss.due_date else "-",
                "returnDate": ret_dt.strftime("%Y-%m-%d") if ret_dt else "-",
                "finePaid": fine_paid,
                "status": iss.status or "Returned",
                "paymentMethod": pay_method,
                "transactionId": tx_id,
                "notes": iss.comments or "",
                "reviewed": rev is not None,
                "rating": rev.rating if rev else 0,
                "review": rev.review_text if rev else ""
            })

    # 4. Format fines (0ms)
    formatted_fines = []
    for fn in fines_db:
        stu_dict = stu_map.get(fn.student_id, {
            "id": fn.student_id,
            "name": "Student",
            "contact": "-",
            "email": "-",
            "class": "-",
            "rollNo": "-",
            "libraryCardNo": "-",
            "batch": "1R"
        })
        bk_dict = bk_map.get(fn.book_id) or bk_map.get((fn.book_title or '').lower(), {
            "author": "Unknown",
            "isbn": "-"
        })
        formatted_fines.append({
            "id": str(fn.id),
            "fineCode": fn.fine_code,
            "issueId": fn.issue_id or "-",
            "studentId": fn.student_id,
            "student": stu_dict,
            "bookId": fn.book_id or "-",
            "book": fn.book_title,
            "author": bk_dict.get("author", "Unknown"),
            "isbn": bk_dict.get("isbn", "-"),
            "originalDueDate": fn.original_due_date.strftime("%Y-%m-%d") if fn.original_due_date else "-",
            "returnDate": fn.return_date.strftime("%Y-%m-%d") if fn.return_date else "-",
            "daysOverdue": fn.days_overdue,
            "fine": float(fn.fine_amount),
            "finePaid": float(fn.fine_paid),
            "status": fn.status,
            "paymentMethod": fn.payment_method or "",
            "transactionId": fn.transaction_id or "",
            "notes": fn.notes or ""
        })

    # 5. Format reviews (0ms)
    formatted_reviews = []
    for r in reviews_db:
        stu = stu_map.get(r.student_id)
        formatted_reviews.append({
            "id": str(r.id),
            "studentId": r.student_id,
            "studentName": stu["name"] if stu else r.student_id,
            "libraryCardNo": stu["libraryCardNo"] if stu else "-",
            "bookTitle": r.book_title,
            "rating": r.rating,
            "review": r.review_text or "",
            "date": r.created_at.strftime("%Y-%m-%d") if r.created_at else "-"
        })

    return {
        "students": formatted_students,
        "books": formatted_books,
        "issues": formatted_issues,
        "fines": formatted_fines,
        "history": formatted_history,
        "reviews": formatted_reviews
    }


@router.post("")
@router.post("/")
def create_issue(payload: IssueBookSchema, db: Session = Depends(get_db)):
    # Check student
    student = _find_student(db, payload.studentId)

    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # Check book
    book = _find_book(db, payload.bookId)

    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    if book.available_copies <= 0:
        raise HTTPException(status_code=400, detail=f"Book '{book.title}' is currently out of stock / no available copies left.")

    # Decrement available copies
    book.available_copies -= 1
    if book.available_copies == 0:
        book.status = "Issued"
    elif book.available_copies <= 2:
        book.status = "Low Stock"

    # Generate issue code
    count = db.query(BookIssue).count() + 101
    issue_code = f"ISS-{count:05d}"
    now = datetime.utcnow()
    due_dt = now + timedelta(days=payload.durationDays)

    new_issue = BookIssue(
        id=issue_code,
        issue_code=issue_code,
        student_id=str(student.id),
        book_id=str(book.id),
        book_title=book.title,
        issue_date=now,
        due_date=due_dt,
        comments=payload.comments,
        status="active"
    )

    db.add(new_issue)
    db.add(book)
    db.commit()
    db.refresh(new_issue)

    return {
        "success": True,
        "message": f"Book '{book.title}' issued successfully to {student.name}!",
        "issue": _format_issue(new_issue, db)
    }


@router.post("/{issue_id}/return")
def return_issue(issue_id: str, payload: ReturnBookSchema, db: Session = Depends(get_db)):
    issue = db.query(BookIssue).filter(
        or_(
            BookIssue.id == issue_id,
            BookIssue.issue_code == issue_id
        )
    ).first()
    if not issue:
        raise HTTPException(status_code=404, detail="Issue record not found")
    if issue.return_date is not None or (issue.status or "").lower().startswith("returned"):
        raise HTTPException(status_code=400, detail="This book has already been returned.")

    now = datetime.utcnow()
    if payload.returnDate:
        try:
            now = datetime.strptime(payload.returnDate, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=400, detail="returnDate must use YYYY-MM-DD format")
    issue.return_date = now

    # Increment available copies of book
    book = db.query(Book).filter(Book.id == issue.book_id).first()
    if book:
        book.available_copies += 1
        if book.available_copies > 2:
            book.status = "Available"
        elif book.available_copies > 0:
            book.status = "Low Stock"
        db.add(book)

    days_overdue = max(0, (now - issue.due_date).days)
    fine_amt = days_overdue * FINE_PER_DAY
    fine_obj = db.query(BookFine).filter(BookFine.issue_id == issue.id).first()

    if fine_amt > 0 or fine_obj is not None:
        is_paid = bool(fine_obj and fine_obj.status == "Paid") or bool(payload.paymentMethod) or (issue.status or "").lower() == "fine paid"
        fine_status = "Paid" if is_paid else "Unpaid"

        if fine_obj:
            fine_obj.return_date = now
            fine_obj.days_overdue = max(fine_obj.days_overdue, days_overdue)
            fine_obj.fine_amount = max(fine_obj.fine_amount, fine_amt)
            if is_paid:
                fine_obj.fine_paid = fine_obj.fine_amount
                fine_obj.status = "Paid"
            else:
                fine_obj.status = fine_status
            if payload.paymentMethod:
                fine_obj.payment_method = payload.paymentMethod
            if payload.transactionId:
                fine_obj.transaction_id = payload.transactionId
            if payload.notes:
                fine_obj.notes = payload.notes
        else:
            fine_count = db.query(BookFine).count() + 1001
            fine_code = f"FIN-{fine_count:04d}"
            fine_obj = BookFine(
                id=fine_code,
                fine_code=fine_code,
                issue_id=issue.id,
                student_id=issue.student_id,
                book_id=issue.book_id,
                book_title=issue.book_title,
                original_due_date=issue.due_date,
                return_date=now,
                days_overdue=days_overdue,
                fine_amount=fine_amt,
                fine_paid=fine_amt if is_paid else 0.0,
                status=fine_status,
                payment_method=payload.paymentMethod,
                transaction_id=payload.transactionId,
                notes=payload.notes
            )
        db.add(fine_obj)
        issue.status = "Returned - Fine Paid" if is_paid else "Returned - Late"
    else:
        issue.status = "Returned"

    db.add(issue)
    db.commit()

    return {
        "success": True,
        "message": f"Book '{issue.book_title}' returned successfully!",
        "issue": _format_issue(issue, db)
    }


@router.post("/fines/{fine_id}/pay")
def pay_fine(fine_id: str, payload: PayFineSchema, db: Session = Depends(get_db)):
    fine = db.query(BookFine).filter(
        or_(
            BookFine.id == fine_id,
            BookFine.fine_code == fine_id
        )
    ).first()

    if not fine:
        raise HTTPException(status_code=404, detail="Fine record not found")

    amount_paid = float(payload.amountPaid)
    if amount_paid < 0:
        raise HTTPException(status_code=400, detail="amountPaid cannot be negative")
    if amount_paid > 0:
        fine.fine_paid = float(fine.fine_paid or 0) + amount_paid
        if fine.fine_paid >= float(fine.fine_amount):
            fine.status = "Paid"
        else:
            fine.status = "Partially Paid"

    fine.payment_method = payload.paymentMethod
    if payload.transactionId:
        fine.transaction_id = payload.transactionId
    if payload.notes:
        fine.notes = payload.notes

    # Keep an unpaid/active book issue active until the book is actually returned.
    if fine.issue_id:
        issue = db.query(BookIssue).filter(BookIssue.id == fine.issue_id).first()
        if issue and issue.return_date:
            issue.status = "Fine Paid"
            db.add(issue)

    db.add(fine)
    db.commit()

    return {
        "success": True,
        "message": f"Fine payment of Rs. {payload.amountPaid} recorded successfully!",
        "fine": _format_fine(fine, db)
    }


def _razorpay_client():
    if razorpay is None:
        raise HTTPException(status_code=503, detail="Razorpay SDK is not installed on the server")
    key_id = os.getenv("RAZORPAY_KEY_ID", "").strip()
    key_secret = os.getenv("RAZORPAY_KEY_SECRET", "").strip()
    if not key_id or not key_secret:
        raise HTTPException(status_code=503, detail="Razorpay test credentials are not configured")
    return key_id, razorpay.Client(auth=(key_id, key_secret))


@router.get("/payment-config")
def payment_config():
    key_id, _ = _razorpay_client()
    return {"keyId": key_id}


@router.post("/fines/{fine_id}/payment-order")
def create_payment_order(fine_id: str, db: Session = Depends(get_db)):
    fine = db.query(BookFine).filter(or_(BookFine.id == fine_id, BookFine.fine_code == fine_id)).first()
    if not fine:
        raise HTTPException(status_code=404, detail="Fine record not found")
    amount = max(0, float(fine.fine_amount) - float(fine.fine_paid or 0))
    if amount <= 0:
        raise HTTPException(status_code=400, detail="This fine is already paid")
    key_id, client = _razorpay_client()
    order = client.order.create({
        "amount": int(round(amount * 100)),
        "currency": "INR",
        "receipt": fine.fine_code,
        "notes": {"fine_id": str(fine.id)},
    })
    return {"keyId": key_id, "order": order, "amount": amount, "currency": "INR"}


@router.post("/fines/{fine_id}/payment-verify")
def verify_payment(fine_id: str, payload: dict, db: Session = Depends(get_db)):
    fine = db.query(BookFine).filter(or_(BookFine.id == fine_id, BookFine.fine_code == fine_id)).first()
    if not fine:
        raise HTTPException(status_code=404, detail="Fine record not found")
    key_id = os.getenv("RAZORPAY_KEY_ID", "").strip()
    key_secret = os.getenv("RAZORPAY_KEY_SECRET", "").strip()
    required = [payload.get("razorpay_order_id"), payload.get("razorpay_payment_id"), payload.get("razorpay_signature")]
    if not key_id or not key_secret or not all(required):
        raise HTTPException(status_code=400, detail="Incomplete Razorpay payment response")
    message = f"{payload['razorpay_order_id']}|{payload['razorpay_payment_id']}".encode()
    expected = hmac.new(key_secret.encode(), message, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, payload["razorpay_signature"]):
        raise HTTPException(status_code=400, detail="Razorpay payment signature verification failed")

    amount_paid = max(0, float(fine.fine_amount) - float(fine.fine_paid or 0))
    fine.fine_paid = float(fine.fine_paid or 0) + amount_paid
    fine.status = "Paid"
    fine.payment_method = "Razorpay"
    fine.transaction_id = payload["razorpay_payment_id"]
    fine.notes = payload.get("notes") or fine.notes
    if fine.issue_id:
        issue = db.query(BookIssue).filter(BookIssue.id == fine.issue_id).first()
        if issue:
            issue.status = "Fine Paid"
            db.add(issue)
    db.add(fine)
    db.commit()
    return {"success": True, "message": "Razorpay payment verified successfully", "fine": _format_fine(fine, db)}


@router.post("/reviews")
def create_or_update_review(payload: CreateReviewSchema, db: Session = Depends(get_db)):
    stu_id = payload.studentId or "me"
    existing = db.query(BookReview).filter(
        or_(BookReview.student_id == stu_id, BookReview.student_id == "me"),
        BookReview.book_title == payload.bookTitle
    ).first()

    if existing:
        existing.rating = payload.rating
        existing.review_text = payload.review
        existing.student_id = stu_id
        db.add(existing)
    else:
        rev_count = db.query(BookReview).count() + 1001
        new_rev = BookReview(
            id=f"REV-{rev_count:05d}",
            student_id=stu_id,
            book_title=payload.bookTitle,
            rating=payload.rating,
            review_text=payload.review
        )
        db.add(new_rev)

    db.commit()
    return {"success": True, "message": f"Review for '{payload.bookTitle}' saved successfully!"}


@router.put("/{issue_id}")
@router.post("/{issue_id}")
def update_issue(issue_id: str, payload: dict, db: Session = Depends(get_db)):
    issue = db.query(BookIssue).filter(
        or_(
            BookIssue.id == issue_id,
            BookIssue.issue_code == issue_id
        )
    ).first()
    if not issue:
        raise HTTPException(status_code=404, detail="Issue record not found")

    previous_status = (issue.status or "").lower()
    was_completed = previous_status.startswith("returned") or previous_status in {"fine paid", "lost"}

    if "issueDate" in payload and payload["issueDate"]:
        try:
            issue.issue_date = datetime.strptime(payload["issueDate"], "%Y-%m-%d")
        except Exception:
            pass
    if "dueDate" in payload and payload["dueDate"]:
        try:
            issue.due_date = datetime.strptime(payload["dueDate"], "%Y-%m-%d")
        except Exception:
            pass
    if "returnDate" in payload:
        if payload["returnDate"]:
            try:
                issue.return_date = datetime.strptime(payload["returnDate"], "%Y-%m-%d")
            except Exception:
                pass
        else:
            issue.return_date = None
    if "status" in payload and payload["status"]:
        issue.status = payload["status"]
        if issue.status.lower() in ["returned", "fine paid"] and not issue.return_date:
            issue.return_date = datetime.utcnow()
    if "comments" in payload and payload["comments"] is not None:
        issue.comments = payload["comments"]

    current_status = (issue.status or "").lower()
    is_completed = current_status.startswith("returned") or current_status == "fine paid"
    book = db.query(Book).filter(Book.id == issue.book_id).first()
    if book and is_completed and not was_completed:
        book.available_copies += 1
        book.status = "Available" if book.available_copies > 2 else "Low Stock"
        db.add(book)
    elif book and not is_completed and was_completed:
        if book.available_copies <= 0:
            raise HTTPException(status_code=400, detail="Book has no available copy to re-issue")
        book.available_copies -= 1
        book.status = "Issued" if book.available_copies == 0 else ("Low Stock" if book.available_copies <= 2 else "Available")
        db.add(book)

    db.add(issue)
    db.commit()
    db.refresh(issue)

    return {
        "success": True,
        "message": f"Issue '{issue.issue_code or issue.id}' updated successfully!",
        "issue": _format_issue(issue, db)
    }





@router.get("/student-data/{student_id}")
def get_student_issue_data(student_id: str, db: Session = Depends(get_db)):
    user = None
    if student_id not in ["all", "me"]:
        user = _find_student(db, student_id)

    search_ids = []
    if user:
        if user.id: search_ids.append(str(user.id))
        if user.roll_number: search_ids.append(user.roll_number)
        if user.library_card_number: search_ids.append(user.library_card_number)
        if user.email: search_ids.append(user.email)
    elif student_id and student_id not in ["all", "me"]:
        search_ids.append(student_id)

    if search_ids:
        issues = db.query(BookIssue).filter(BookIssue.student_id.in_(search_ids)).all()
        fines = db.query(BookFine).filter(BookFine.student_id.in_(search_ids)).all()
    else:
        issues = db.query(BookIssue).all()
        fines = db.query(BookFine).all()

    formatted_issues = []
    formatted_history = []

    for i in issues:
        bk = _find_book(db, i.book_id) or db.query(Book).filter(Book.title == i.book_title).first()
        author_name = bk.author if (bk and bk.author) else "Unknown"
        isbn_num = bk.isbn if (bk and bk.isbn) else "-"

        is_returned = (i.return_date is not None) or (i.status or "").lower().startswith("returned")

        if not is_returned:
            formatted_issues.append({
                "id": i.issue_code or str(i.id),
                "db_id": str(i.id),
                "book": i.book_title,
                "author": author_name,
                "isbn": isbn_num,
                "issueDate": i.issue_date.strftime("%Y-%m-%d") if i.issue_date else "-",
                "dueDate": i.due_date.strftime("%Y-%m-%d") if i.due_date else "-",
                "renewals": 0,
                "status": i.status or "active"
            })
        else:
            fine_rec = db.query(BookFine).filter(BookFine.issue_id == i.id).first()
            fine_paid = "Paid" if fine_rec and fine_rec.status == "Paid" else ("Overdue" if fine_rec else "None Due")

            ret_dt = i.return_date
            if not ret_dt and fine_rec and fine_rec.return_date:
                ret_dt = fine_rec.return_date

            review_rec = None
            if search_ids:
                review_rec = db.query(BookReview).filter(
                    BookReview.student_id.in_(search_ids),
                    BookReview.book_title == i.book_title
                ).first()
            if not review_rec:
                review_rec = db.query(BookReview).filter(
                    BookReview.book_title == i.book_title
                ).first()

            formatted_history.append({
                "id": str(i.id),
                "issueCode": i.issue_code,
                "book": i.book_title,
                "author": author_name,
                "isbn": isbn_num,
                "issued": i.issue_date.strftime("%Y-%m-%d") if i.issue_date else "-",
                "returned": ret_dt.strftime("%Y-%m-%d") if ret_dt else "-",
                "returnDate": ret_dt.strftime("%Y-%m-%d") if ret_dt else "-",
                "finePaid": fine_paid,
                "reviewed": review_rec is not None,
                "rating": review_rec.rating if review_rec else 0,
                "review": review_rec.review_text if review_rec else ""
            })

    formatted_fines = []
    for f in fines:
        ret_dt = f.return_date
        if not ret_dt and f.issue_id:
            iss = db.query(BookIssue).filter(BookIssue.id == f.issue_id).first()
            if iss and iss.return_date:
                ret_dt = iss.return_date
        bk = _find_book(db, f.book_id) or db.query(Book).filter(Book.title == f.book_title).first()

        stu = _find_student(db, f.student_id) or user
        actual_roll = (stu.roll_number if (stu and stu.roll_number) else None) or (user.roll_number if (user and user.roll_number) else None)
        if not actual_roll or _is_uuid(actual_roll):
            actual_roll = (stu.library_card_number if (stu and stu.library_card_number) else None) or (user.library_card_number if (user and user.library_card_number) else None) or f.student_id

        actual_name = (stu.name if (stu and stu.name) else None) or (user.name if (user and user.name) else "Student")
        actual_class = (stu.class_name if (stu and stu.class_name) else None) or (user.class_name if (user and user.class_name) else "-")

        formatted_fines.append({
            "id": f.fine_code or str(f.id),
            "db_id": str(f.id),
            "date": ret_dt.strftime("%Y-%m-%d") if ret_dt else (f.original_due_date.strftime("%Y-%m-%d") if f.original_due_date else "-"),
            "book": f.book_title,
            "author": bk.author if (bk and bk.author) else "Unknown",
            "isbn": bk.isbn if (bk and bk.isbn) else "-",
            "amount": float(f.fine_amount),
            "finePaid": float(f.fine_paid or 0),
            "status": f.status,
            "overdueDays": f.days_overdue,
            "paymentMethod": f.payment_method or "",
            "transactionId": f.transaction_id or "",
            "studentId": actual_roll,
            "rollNo": actual_roll,
            "studentRollNo": actual_roll,
            "studentName": actual_name,
            "studentClass": actual_class,
            "paidAt": f.created_at.strftime("%Y-%m-%d %H:%M") if f.created_at else "-"
        })

    return {
        "user": _format_student(user) if user else None,
        "issues": formatted_issues,
        "fines": formatted_fines,
        "history": formatted_history
    }

