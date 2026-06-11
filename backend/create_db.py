"""
create_db.py — One-time setup script.
Creates the 'sovereign' PostgreSQL database and all tables.
Run once: python create_db.py

Reads PG connection details from environment / .env:
  PGUSER      (default: postgres)
  PGPASSWORD  (default: postgres  — override in production)
  PGHOST      (default: localhost)
  PGPORT      (default: 5432)
"""
import asyncio
import os
import sys

from dotenv import load_dotenv
load_dotenv()

PG_USER     = os.getenv("PGUSER",     "postgres")
PG_PASSWORD = os.getenv("PGPASSWORD", "postgres")  # set PGPASSWORD in .env
PG_HOST     = os.getenv("PGHOST",     "localhost")
PG_PORT     = int(os.getenv("PGPORT", "5432"))

# ── Step 1: Create the database if it doesn't exist ──────────────────────────
try:
    import psycopg2
    from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

    print("Connecting to postgres master database...")
    conn = psycopg2.connect(
        dbname="postgres",
        user=PG_USER,
        password=PG_PASSWORD,
        host=PG_HOST,
        port=PG_PORT,
    )
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    cur = conn.cursor()

    cur.execute("SELECT 1 FROM pg_database WHERE datname = 'sovereign'")
    exists = cur.fetchone()
    if exists:
        print("Database 'sovereign' already exists.")
    else:
        cur.execute("CREATE DATABASE sovereign")
        print("Created database 'sovereign'.")

    cur.close()
    conn.close()

except ImportError:
    print("psycopg2 not found — trying asyncpg fallback for DB creation...")
    try:
        import asyncpg

        async def create_db():
            conn = await asyncpg.connect(
                user=PG_USER, password=PG_PASSWORD,
                host=PG_HOST, port=PG_PORT, database="postgres"
            )
            exists = await conn.fetchval(
                "SELECT 1 FROM pg_database WHERE datname = 'sovereign'"
            )
            if exists:
                print("Database 'sovereign' already exists.")
            else:
                await conn.execute("CREATE DATABASE sovereign")
                print("Created database 'sovereign'.")
            await conn.close()

        asyncio.run(create_db())
    except Exception as e:
        print(f"Could not create database automatically: {e}")
        print("Please create it manually: CREATE DATABASE sovereign;")
        sys.exit(1)

except Exception as e:
    print(f"DB creation step: {e}")
    # Might already exist — continue anyway

# ── Step 2: Create all tables ─────────────────────────────────────────────────
print("\nCreating tables via SQLAlchemy...")

async def create_tables():
    from database import init_db, close_db
    try:
        await init_db()
        print("All tables created successfully!")
    except Exception as e:
        print(f"Error creating tables: {e}")
        raise
    finally:
        await close_db()

asyncio.run(create_tables())
print("\nDone! You can now sign up at http://localhost:3000/landing.html")
