import uuid
from typing import Optional
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import func

from .database import get_db
from .models import User
from .utils.jwt_handler import decode_token

security = HTTPBearer(auto_error=False)


def get_token_from_request(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> str | None:
    if credentials and credentials.credentials:
        return credentials.credentials
    # Check cookies
    token = request.cookies.get("access_token") or request.cookies.get("cetguru_access_token")
    if token:
        return token
    # Check Authorization header manually
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        return auth_header.split(" ")[1]
    return None


def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    token = get_token_from_request(request, credentials)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please log in."
        )

    payload = decode_token(token)
    if not payload or "user_id" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token."
        )

    user_id = payload.get("user_id")
    try:
        user_uuid = uuid.UUID(str(user_id))
        user = db.query(User).filter(User.id == user_uuid).first()
    except Exception:
        user = db.query(User).filter(User.email == str(user_id)).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User associated with token not found."
        )

    return user


def get_current_user_optional(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db)
) -> User | None:
    try:
        user = get_current_user(request, credentials, db)
        if user:
            return user
    except Exception:
        pass

    # Check X-User-Id header
    custom_uid = request.headers.get("X-User-Id")
    if custom_uid:
        try:
            u = db.query(User).filter(User.id == uuid.UUID(str(custom_uid))).first()
            if u:
                return u
        except Exception:
            pass
        u = db.query(User).filter(
            (func.lower(User.roll_number) == str(custom_uid).strip().lower()) |
            (func.lower(User.library_card_number) == str(custom_uid).strip().lower()) |
            (func.lower(User.email) == str(custom_uid).strip().lower())
        ).first()
        if u:
            return u

    # Check X-User-Email header
    custom_email = request.headers.get("X-User-Email")
    if custom_email:
        u = db.query(User).filter(func.lower(User.email) == custom_email.strip().lower()).first()
        if u:
            return u

    # Check query param if present
    for q_param in ["user_id", "roll_number", "barcode", "roll"]:
        query_val = request.query_params.get(q_param)
        if query_val:
            try:
                u = db.query(User).filter(User.id == uuid.UUID(str(query_val))).first()
                if u:
                    return u
            except Exception:
                pass
            u = db.query(User).filter(
                (func.lower(User.roll_number) == str(query_val).strip().lower()) |
                (func.lower(User.library_card_number) == str(query_val).strip().lower()) |
                (func.lower(User.email) == str(query_val).strip().lower())
            ).first()
            if u:
                return u

    return None


def get_current_user_id(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db)
) -> uuid.UUID | None:
    user = get_current_user_optional(request, credentials, db)
    if user:
        return user.id
    return None


def get_current_user_profile(
    request: Request = None,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
    user_id: Optional[uuid.UUID] = None
) -> dict | None:
    user = None
    if user_id:
        try:
            user = db.query(User).filter(User.id == user_id).first()
        except Exception:
            pass

    if not user and request:
        user = get_current_user_optional(request, credentials, db)

    if user:
        return {
            "id": str(user.id),
            "name": user.name or "Student",
            "email": user.email or "",
            "rollNumber": user.roll_number or user.library_card_number or "-",
            "role": user.class_name or user.role or "Student",
            "department": user.department or "Student Profile",
            "gender": user.gender or "Female",
            "avatarUrl": user.avatar_url
        }

    return None
