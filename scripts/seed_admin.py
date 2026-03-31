"""Seed the first admin account.

Usage:
    python -m scripts.seed_admin
    
Or inside Docker:
    docker compose exec app python -m scripts.seed_admin

Environment variables (override via .env or shell):
    ADMIN_EMAIL      — defaults to admin@ufms.hehe
    ADMIN_PASSWORD   — defaults to Admin1234!
    ADMIN_NAME       — defaults to System Administrator
"""

import os
import sys

# Allow running from the project root without installing the package.
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.core.db import SessionLocal
from app.storage import user_repo
from app.storage.models import UserRole

ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@ufms.hehe")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "Admin1234!")
ADMIN_NAME = os.getenv("ADMIN_NAME", "System Administrator")


def main() -> None:
    db = SessionLocal()
    try:
        # Check by exact email — fully idempotent across restarts
        existing = user_repo.get_user_by_email(db, ADMIN_EMAIL)
        if existing is not None:
            print(f"[seed_admin] Admin account already exists: {existing.email} — skipping.")
            return

        admin = user_repo.create_user(
            db=db,
            email=ADMIN_EMAIL,
            password=ADMIN_PASSWORD,
            full_name=ADMIN_NAME,
            role=UserRole.admin,
        )
        print(f"[seed_admin] Admin account created: {admin.email}  (id={admin.id})")
    finally:
        db.close()


if __name__ == "__main__":
    main()
