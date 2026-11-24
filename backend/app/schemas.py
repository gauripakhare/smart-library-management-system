from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr


# Seat booking schemas
class CreateBookingRequest(BaseModel):
    seatId: str                                  # seat_code, e.g. "G-R1-C1-A"
    startTime: Optional[datetime] = None        # ISO timestamp chosen by the student (defaults to now)
    floor: str                                   # "ground" | "first"
    floorName: Optional[str] = None


class CheckInRequest(BaseModel):
    reservationId: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class CheckOutRequest(BaseModel):
    reservationId: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class BarcodeScanRequest(BaseModel):
    barcode: str
    user_id: Optional[str] = None



class GeofenceValidateRequest(BaseModel):
    latitude: float
    longitude: float


class GeofenceSettingSchema(BaseModel):
    library_name: Optional[str] = "Main Library"
    latitude: float
    longitude: float
    radius_meters: Optional[float] = 120.0
    radius: Optional[float] = None  # Admin form compatibility


class AgentExecuteRequest(BaseModel):
    action: str  # "get_seats", "book_seat", "verify_geofence", "checkin", "checkout", "get_status", "chat"
    seat_code: Optional[str] = None
    floor: Optional[str] = "ground"
    start_time: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    reservation_id: Optional[str] = None
    query: Optional[str] = None


# Authentication schemas
class LoginSchema(BaseModel):
    identifier: str  # Email OR Roll Number / Library Number OR Username
    password: str


class ForgotRequestSchema(BaseModel):
    email: str  # Email or Username or Roll No


class ForgotVerifySchema(BaseModel):
    email: str
    otp_code: str


class ResetPasswordSchema(BaseModel):
    email: str
    reset_token: str
    new_password: str


# Student Management schemas (Admin side)
class CreateStudentSchema(BaseModel):
    name: str
    email: str
    libraryNumber: str              # Library Card Number
    rollNumber: Optional[str] = None    # Roll Number
    contactNumber: Optional[str] = None
    className: Optional[str] = None      # FE, SE, TE, BE / Branch
    academicYear: Optional[str] = None
    department: Optional[str] = None
    college: Optional[str] = None
    dob: Optional[str] = None            # YYYY-MM-DD
    gender: Optional[str] = None
    address: Optional[str] = None


class UpdateStudentSchema(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    libraryNumber: Optional[str] = None
    rollNumber: Optional[str] = None
    contactNumber: Optional[str] = None
    className: Optional[str] = None
    academicYear: Optional[str] = None
    department: Optional[str] = None
    college: Optional[str] = None
    dob: Optional[str] = None
    gender: Optional[str] = None
    address: Optional[str] = None


class UpdateGenderRequest(BaseModel):
    gender: str



from datetime import datetime
from pydantic import BaseModel, EmailStr


# Seat booking schemas
class CreateBookingRequest(BaseModel):
    seatId: str          # seat_code, e.g. "G-R1-C1-A"
    startTime: datetime  # ISO timestamp chosen by the student
    floor: str            # "ground" | "first"
    floorName: str | None = None


class CheckInRequest(BaseModel):
    reservationId: int


class CheckOutRequest(BaseModel):
    reservationId: int


# Authentication schemas
class LoginSchema(BaseModel):
    identifier: str  # Email OR Roll Number / Library Number OR Username
    password: str


class ForgotRequestSchema(BaseModel):
    email: str  # Email or Username or Roll No


class ForgotVerifySchema(BaseModel):
    email: str
    otp_code: str


class ResetPasswordSchema(BaseModel):
    email: str
    reset_token: str
    new_password: str


# Student Management schemas (Admin side)
class CreateStudentSchema(BaseModel):
    name: str
    email: str
    libraryNumber: str              # Library Card Number
    rollNumber: str | None = None    # Roll Number
    contactNumber: str | None = None
    className: str | None = None      # FE, SE, TE, BE / Branch
    academicYear: str | None = None
    department: str | None = None
    college: str | None = None
    dob: str | None = None            # YYYY-MM-DD
    gender: str | None = None
    address: str | None = None


class UpdateStudentSchema(BaseModel):
    name: str | None = None
    email: str | None = None
    libraryNumber: str | None = None
    rollNumber: str | None = None
    contactNumber: str | None = None
    className: str | None = None
    academicYear: str | None = None
    department: str | None = None
    college: str | None = None
    dob: str | None = None
    gender: str | None = None
    address: str | None = None

    model_config = {"extra": "allow"}


# Book Management schemas
class CreateBookSchema(BaseModel):
    title: str
    subtitle: str | None = None
    author: str
    coAuthor: str | None = None
    isbn: str
    accessionNumber: str | None = None
    classNumber: str | None = None
    price: float | None = 0.0
    publisher: str | None = None
    category: str = "Computer Science"
    language: str = "English"
    pubYear: str | None = None
    edition: str | None = None
    totalCopies: int = 1
    shelf: str | None = None
    rack: str | None = None
    description: str | None = None
    pages: str | None = None
    dimensions: str | None = None
    weight: str | None = None
    cover: str | None = None


class UpdateBookSchema(BaseModel):
    title: str | None = None
    subtitle: str | None = None
    author: str | None = None
    coAuthor: str | None = None
    isbn: str | None = None
    accessionNumber: str | None = None
    classNumber: str | None = None
    price: float | None = None
    publisher: str | None = None
    category: str | None = None
    language: str | None = None
    pubYear: str | None = None
    edition: str | None = None
    totalCopies: int | None = None
    shelf: str | None = None
    rack: str | None = None
    description: str | None = None
    pages: str | None = None
    dimensions: str | None = None
    weight: str | None = None
    cover: str | None = None


# Book Issue, Return & Fine Schemas
class IssueBookSchema(BaseModel):
    studentId: str
    bookId: str
    durationDays: int = 14
    comments: str | None = None


class ReturnBookSchema(BaseModel):
    issueId: str | None = None
    returnDate: str | None = None
    fineAmount: float = 0.0
    paymentMethod: str | None = None
    transactionId: str | None = None
    notes: str | None = None


class PayFineSchema(BaseModel):
    fineId: str | None = None
    amountPaid: float
    paymentMethod: str = "Cash"
    transactionId: str | None = None
    notes: str | None = None


class CreateReviewSchema(BaseModel):
    studentId: str | None = None
    bookTitle: str
    rating: int
    review: str | None = None


