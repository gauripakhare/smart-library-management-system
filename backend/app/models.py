import uuid
from datetime import datetime, date
from decimal import Decimal
from typing import Optional

from sqlalchemy import String, Integer, Boolean, Date, DateTime, Numeric, Text, ForeignKey, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        primary_key=True,
        default=uuid.uuid4
    )

    name: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True
    )

    email: Mapped[Optional[str]] = mapped_column(
        String(255),
        unique=True,
        nullable=True,
        index=True
    )

    password_hash: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True
    )

    role: Mapped[str] = mapped_column(
        String(50),
        default="STUDENT"
    )

    class_name: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True
    )

    academic_year: Mapped[Optional[str]] = mapped_column(
        String(50),
        nullable=True
    )

    contact_number: Mapped[Optional[str]] = mapped_column(
        String(20),
        nullable=True
    )

    library_card_number: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        index=True
    )

    roll_number: Mapped[Optional[str]] = mapped_column(
        String(50),
        nullable=True,
        index=True
    )

    department: Mapped[Optional[str]] = mapped_column(
        String(150),
        nullable=True
    )

    college: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True
    )

    date_of_birth: Mapped[Optional[date]] = mapped_column(
        Date,
        nullable=True
    )

    gender: Mapped[Optional[str]] = mapped_column(
        String(20),
        nullable=True
    )

    address: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True
    )

    avatar_url: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True
    )

    status: Mapped[Optional[str]] = mapped_column(
        String(20),
        default="ACTIVE"
    )

    created_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow
    )

    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        onupdate=datetime.utcnow
    )


class Seat(Base):
    __tablename__ = "seats"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        primary_key=True,
        default=uuid.uuid4
    )

    seat_code: Mapped[str] = mapped_column(
        String(20),
        unique=True,
        nullable=False
    )

    floor: Mapped[str] = mapped_column(
        String(50),
        nullable=False
    )

    section: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True
    )

    area: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True
    )

    row_number: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True
    )

    created_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow
    )


class SeatReservation(Base):
    __tablename__ = "seat_reservations"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        primary_key=True,
        default=uuid.uuid4
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False
    )

    seat_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("seats.id", ondelete="CASCADE"),
        nullable=False
    )

    booking_date: Mapped[date] = mapped_column(
        Date,
        default=date.today,
        nullable=False
    )

    start_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False
    )

    end_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False
    )

    check_in_time: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )

    check_out_time: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )

    status: Mapped[str] = mapped_column(
        String(30),
        default="RESERVED"  # RESERVED, CHECKED_IN, CHECKED_OUT, CANCELLED, EXPIRED
    )

    cancelled_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )

    cancellation_reason: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True
    )

    created_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow
    )

    # Relationships
    seat = relationship("Seat", foreign_keys=[seat_id])
    user = relationship("User", foreign_keys=[user_id])


# Backwards compatibility alias
Reservation = SeatReservation


class AttendanceLog(Base):
    __tablename__ = "attendance_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        primary_key=True,
        default=uuid.uuid4
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False
    )

    date: Mapped[date] = mapped_column(
        Date,
        default=date.today,
        nullable=False
    )

    check_in_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        nullable=False
    )

    check_out_time: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )

    latitude: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(10, 7),
        nullable=True
    )

    longitude: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(10, 7),
        nullable=True
    )

    verification_method: Mapped[str] = mapped_column(
        String(50),
        default="GEOFENCE"
    )

    status: Mapped[str] = mapped_column(
        String(20),
        default="PRESENT"  # PRESENT, CHECKED_OUT
    )

    created_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow
    )

    user = relationship("User", foreign_keys=[user_id])


class GeofenceSetting(Base):
    __tablename__ = "geofence_settings"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        primary_key=True,
        default=uuid.uuid4
    )

    library_name: Mapped[Optional[str]] = mapped_column(
        String(255),
        default="Main Library"
    )

    latitude: Mapped[Decimal] = mapped_column(
        Numeric(10, 7),
        nullable=False
    )

    longitude: Mapped[Decimal] = mapped_column(
        Numeric(10, 7),
        nullable=False
    )

    radius_meters: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        default=Decimal("50.00"),
        nullable=False
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True
    )

    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        onupdate=datetime.utcnow
    )


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        primary_key=True,
        default=uuid.uuid4
    )

    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True
    )

    title: Mapped[str] = mapped_column(
        String(255),
        nullable=False
    )

    message: Mapped[str] = mapped_column(
        Text,
        nullable=False
    )

    type: Mapped[str] = mapped_column(
        String(50),
        default="GENERAL"  # BOOK_DUE, RESERVATION_CONFIRM, ATTENDANCE, GENERAL
    )

    is_read: Mapped[bool] = mapped_column(
        Boolean,
        default=False
    )

    created_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow
    )


class Book(Base):
    __tablename__ = "books"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        primary_key=True,
        default=uuid.uuid4
    )

    isbn: Mapped[Optional[str]] = mapped_column(
        String(50),
        unique=True,
        nullable=True
    )

    accession_number: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        index=True
    )

    class_number: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        index=True
    )

    price: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(10, 2),
        nullable=True,
        default=Decimal("0.0")
    )

    title: Mapped[str] = mapped_column(
        String(255),
        nullable=False
    )

    subtitle: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True
    )

    author: Mapped[str] = mapped_column(
        String(255),
        nullable=False
    )

    co_author: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True
    )

    category: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True
    )

    language: Mapped[Optional[str]] = mapped_column(
        String(100),
        default="English",
        nullable=True
    )

    publisher: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True
    )

    publication_year: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True
    )

    pub_year: Mapped[Optional[str]] = mapped_column(
        String(50),
        nullable=True
    )

    edition: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True
    )

    total_copies: Mapped[int] = mapped_column(
        Integer,
        default=1
    )

    available_copies: Mapped[int] = mapped_column(
        Integer,
        default=1
    )

    shelf_location: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True
    )

    shelf: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True
    )

    rack: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True
    )

    pages: Mapped[Optional[str]] = mapped_column(
        String(50),
        nullable=True
    )

    dimensions: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True
    )

    weight: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True
    )

    cover_image_url: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True
    )

    description: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True
    )

    status: Mapped[Optional[str]] = mapped_column(
        String(50),
        default="Available",
        nullable=True
    )

    added_by: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True
    )

    created_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow
    )

    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        onupdate=datetime.utcnow
    )


class BookIssue(Base):
    __tablename__ = "book_issues"

    id: Mapped[str] = mapped_column(
        String,
        primary_key=True
    )

    issue_code: Mapped[Optional[str]] = mapped_column(
        String,
        nullable=True
    )

    student_id: Mapped[str] = mapped_column(
        String,
        nullable=False,
        index=True
    )

    book_id: Mapped[Optional[str]] = mapped_column(
        String,
        nullable=True
    )

    book_title: Mapped[Optional[str]] = mapped_column(
        String,
        nullable=True
    )

    issue_date: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True
    )

    due_date: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True
    )

    return_date: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True
    )

    comments: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True
    )

    status: Mapped[Optional[str]] = mapped_column(
        String,
        default="issued"
    )

    created_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow
    )


class BookFine(Base):
    __tablename__ = "book_fines"

    id: Mapped[str] = mapped_column(
        String(100),
        primary_key=True,
        default=lambda: f"FIN-{uuid.uuid4().hex[:8].upper()}"
    )

    fine_code: Mapped[str] = mapped_column(
        String(50),
        unique=True,
        nullable=False,
        default=lambda: f"FIN-{uuid.uuid4().hex[:8].upper()}"
    )

    issue_id: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        index=True
    )

    student_id: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        index=True
    )

    book_id: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True
    )

    book_title: Mapped[str] = mapped_column(
        String(255),
        nullable=False
    )

    original_due_date: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True
    )

    return_date: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True
    )

    days_overdue: Mapped[int] = mapped_column(
        Integer,
        default=0
    )

    fine_amount: Mapped[float] = mapped_column(
        Numeric(10, 2),
        default=0.0
    )

    fine_paid: Mapped[float] = mapped_column(
        Numeric(10, 2),
        default=0.0
    )

    status: Mapped[str] = mapped_column(
        String(50),
        default="Unpaid",
        nullable=False
    )

    payment_method: Mapped[Optional[str]] = mapped_column(
        String(50),
        nullable=True
    )

    transaction_id: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True
    )

    notes: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True
    )

    created_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow
    )


class BookReview(Base):
    __tablename__ = "book_reviews"

    id: Mapped[str] = mapped_column(
        String(100),
        primary_key=True,
        default=lambda: f"REV-{uuid.uuid4().hex[:8].upper()}"
    )

    student_id: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        index=True
    )

    book_title: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        index=True
    )

    rating: Mapped[int] = mapped_column(
        Integer,
        nullable=False
    )

    review_text: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True
    )

    created_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow
    )