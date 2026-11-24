import random
import secrets
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import or_, func

from ..database import get_db
from ..models import User
from ..schemas import (
    LoginSchema,
    ForgotRequestSchema,
    ForgotVerifySchema,
    ResetPasswordSchema,
)
from ..utils.password_handler import hash_password, verify_password
from ..utils.jwt_handler import create_token
from ..utils.email_handler import send_otp_email
from ..deps import get_current_user

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

PENDING_RESETS = {}
RESET_TTL_MINUTES = 15


def _generate_otp() -> str:
    return f"{random.randint(0, 999999):06d}"


def _generate_reset_token() -> str:
    return secrets.token_urlsafe(32)


@router.post("/login")
def login(payload: LoginSchema, db: Session = Depends(get_db)):
    identifier = payload.identifier.strip().lower()
    
    # Find user by email, roll_number, library_card_number, or name (case-insensitive)
    existing_user = db.query(User).filter(
        or_(
            func.lower(User.email) == identifier,
            func.lower(User.roll_number) == identifier,
            func.lower(User.library_card_number) == identifier,
            func.lower(User.name) == identifier
        )
    ).first()

    if not existing_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email, roll number, or password."
        )

    # Password hash check
    stored_hash = existing_user.password_hash
    if not stored_hash or not verify_password(payload.password, stored_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email, roll number, or password."
        )

    # Normalize role to lowercase ('ADMIN' -> 'admin')
    user_role = (existing_user.role or "student").strip().lower()

    # Generate JWT token
    token = create_token({
        "user_id": str(existing_user.id),
        "email": existing_user.email,
        "name": existing_user.name,
        "role": user_role,
    })

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": str(existing_user.id),
            "name": existing_user.name or "User",
            "email": existing_user.email,
            "rollNumber": existing_user.roll_number or "-",
            "libraryCardNumber": existing_user.library_card_number or "-",
            "role": user_role,
        }
    }


@router.post("/forgot/request")
def forgot_request(payload: ForgotRequestSchema, db: Session = Depends(get_db)):
    identifier = payload.email.strip().lower()
    
    user = db.query(User).filter(
        or_(
            func.lower(User.email) == identifier,
            func.lower(User.roll_number) == identifier,
            func.lower(User.library_card_number) == identifier
        )
    ).first()

    if not user or not user.email:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No account found associated with that email or roll number."
        )

    otp_code = _generate_otp()
    expires_at = datetime.utcnow() + timedelta(minutes=RESET_TTL_MINUTES)

    PENDING_RESETS[user.email] = {
        "otp_code": otp_code,
        "expires_at": expires_at,
        "reset_token": None,
    }

    try:
        send_otp_email(user.email, otp_code)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to send password reset OTP email: {str(e)}"
        )

    return {
        "message": f"OTP verification code sent to your registered email ({user.email}).",
        "email": user.email
    }


@router.post("/forgot/verify")
def forgot_verify(payload: ForgotVerifySchema):
    email = payload.email.strip().lower()
    entry = PENDING_RESETS.get(email)

    if not entry:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No pending password reset request found for this email."
        )

    if datetime.utcnow() > entry["expires_at"]:
        del PENDING_RESETS[email]
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OTP verification code has expired. Please request a new code."
        )

    if entry["otp_code"] != payload.otp_code.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid OTP code. Please check and try again."
        )

    reset_token = _generate_reset_token()
    entry["reset_token"] = reset_token

    return {
        "message": "OTP verified successfully.",
        "reset_token": reset_token,
        "email": email
    }


@router.post("/forgot/reset")
def forgot_reset(payload: ResetPasswordSchema, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    entry = PENDING_RESETS.get(email)

    if not entry or not entry.get("reset_token"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid session or reset token. Please restart the forgot password process."
        )

    if entry["reset_token"] != payload.reset_token.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid reset token authorization."
        )

    if datetime.utcnow() > entry["expires_at"]:
        del PENDING_RESETS[email]
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset token session expired. Please request a new OTP."
        )

    user = db.query(User).filter(func.lower(User.email) == email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User account not found."
        )

    try:
        user.password_hash = hash_password(payload.new_password)
        db.add(user)
        db.commit()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    del PENDING_RESETS[email]

    return {
        "message": "Password updated successfully! You can now log in with your new password."
    }


@router.get("/me")
def get_me(current_user: User = Depends(get_current_user)):
    dob_str = "-"
    if current_user.date_of_birth:
        try:
            dob_str = current_user.date_of_birth.strftime("%Y-%m-%d")
        except Exception:
            dob_str = str(current_user.date_of_birth)

    return {
        "id": str(current_user.id),
        "name": current_user.name or "User",
        "email": current_user.email,
        "rollNumber": current_user.roll_number or "-",
        "libraryCardNumber": current_user.library_card_number or "-",
        "libraryNumber": current_user.library_card_number or "-",
        "class": current_user.class_name or "-",
        "academicYear": current_user.academic_year or "-",
        "contactNumber": current_user.contact_number or "-",
        "department": current_user.department or "-",
        "college": current_user.college or "-",
        "dob": dob_str,
        "gender": current_user.gender or "-",
        "address": current_user.address or "-",
        "avatarUrl": current_user.avatar_url,
        "role": (current_user.role or "student").lower(),
        "createdAt": current_user.created_at.strftime("%Y-%m-%d") if current_user.created_at else "-"
    }
