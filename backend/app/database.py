import os
import sys
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

env_path = Path(__file__).resolve().parent.parent / ".env"
if env_path.exists():
    load_dotenv(env_path)
else:
    load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()

# Supabase/Heroku-style URLs sometimes start with "postgres://" which
# SQLAlchemy's psycopg2 dialect no longer accepts — normalize it.
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

_is_placeholder = "[YOUR-PASSWORD]" in DATABASE_URL
_is_usable_postgres = DATABASE_URL.startswith("postgresql://") and not _is_placeholder
_is_sqlite = DATABASE_URL.startswith("sqlite://")

if not _is_usable_postgres and not _is_sqlite:
    if _is_placeholder:
        print(
            "[database] DATABASE_URL still has the [YOUR-PASSWORD] placeholder "
            "in backend/.env — falling back to a local SQLite file "
            "(./library.db) until you fill in your real Supabase DB password.",
            file=sys.stderr
        )
    else:
        print(
            "[database] DATABASE_URL is not a valid postgresql:// or "
            "sqlite:// URL — falling back to a local SQLite file "
            "(./library.db). See backend/.env for the format Supabase expects.",
            file=sys.stderr
        )
    DATABASE_URL = "sqlite:///./library.db"
else:
    print(f"[database] Connecting to: {DATABASE_URL.split('@')[-1] if '@' in DATABASE_URL else DATABASE_URL}", file=sys.stderr)

if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}
    engine_kwargs = {"connect_args": connect_args, "pool_pre_ping": True}
else:
    connect_args = {"sslmode": "require"}
    engine_kwargs = {
        "connect_args": connect_args,
        "pool_pre_ping": True,
        "pool_recycle": 300,
        "pool_size": 10,
        "max_overflow": 20
    }

engine = create_engine(
    DATABASE_URL,
    **engine_kwargs
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()

