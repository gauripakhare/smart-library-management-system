import bcrypt

MAX_BCRYPT_PASSWORD_BYTES = 72


def hash_password(password: str) -> str:
    password_bytes = password.encode("utf-8")
    if len(password_bytes) > MAX_BCRYPT_PASSWORD_BYTES:
        raise ValueError("Password must be 72 bytes or fewer.")

    hashed_bytes = bcrypt.hashpw(password_bytes, bcrypt.gensalt())
    return hashed_bytes.decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    if not plain or not hashed:
        return False
    try:
        plain_bytes = plain.encode("utf-8")
        hashed_bytes = hashed.encode("utf-8")

        if len(plain_bytes) > MAX_BCRYPT_PASSWORD_BYTES:
            return False

        return bcrypt.checkpw(plain_bytes, hashed_bytes)
    except Exception:
        return False
