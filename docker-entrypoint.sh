#!/bin/sh
set -e

echo "==> Waiting for database..."
# Simple retry loop — psycopg2 will raise on connection failure
python - <<'EOF'
import time, sys
from sqlalchemy import text
from app.core.db import engine

for attempt in range(1, 31):
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        print(f"Database ready (attempt {attempt}).")
        sys.exit(0)
    except Exception as exc:
        print(f"Attempt {attempt}/30: {exc}")
        time.sleep(2)
print("Database not reachable after 30 attempts. Aborting.")
sys.exit(1)
EOF

echo "==> Running Alembic migrations..."
alembic upgrade head

echo "==> Seeding admin account..."
python -m scripts.seed_admin

echo "==> Starting UFMS API server..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
