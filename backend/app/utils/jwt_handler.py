import os
from datetime import datetime, timedelta
from jose import jwt

SECRET_KEY = os.getenv("SECRET_KEY", "cetguru_super_secret_jwt_key_2026_ssgmce")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
TOKEN_EXPIRE_MINUTES = int(os.getenv("TOKEN_EXPIRE_MINUTES", "1440"))  # 24 hours


def create_token(data: dict) -> str:
    payload = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=TOKEN_EXPIRE_MINUTES)
    payload["exp"] = expire
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict | None:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except Exception:
        return None
