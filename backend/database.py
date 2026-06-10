"""
backend/database.py
====================
SQLAlchemy async engine and session factory for the SOVEREIGN project.

Usage
-----
Import `AsyncSessionLocal` and use it as an async context manager in routes:

    from database import AsyncSessionLocal

    async with AsyncSessionLocal() as session:
        result = await session.execute(select(WalletModel))

Or use the `get_db` dependency in FastAPI routes:

    from database import get_db
    from sqlalchemy.ext.asyncio import AsyncSession
    from fastapi import Depends

    @app.get("/example")
    async def example(db: AsyncSession = Depends(get_db)):
        ...

Run Alembic migrations before starting the server:
    alembic upgrade head

Or call `init_db()` at startup for auto-create (dev only):
    await init_db()
"""

import os
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

# ---------------------------------------------------------------------------
# Read connection URL from environment
# ---------------------------------------------------------------------------
# Expected format: postgresql+asyncpg://user:password@host:port/dbname
# Falls back to a local dev default so the app still imports without a .env.
DATABASE_URL: str = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:5432/sovereign",
)

# ---------------------------------------------------------------------------
# Async engine
# ---------------------------------------------------------------------------
# pool_pre_ping=True: test connections on checkout so stale ones are dropped.
# echo=False: set to True locally to see generated SQL in the console.
engine = create_async_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    echo=False,
    # asyncpg-specific: keep a reasonable pool size for an API server.
    pool_size=10,
    max_overflow=20,
)

# ---------------------------------------------------------------------------
# Async session factory
# ---------------------------------------------------------------------------
# expire_on_commit=False: keep ORM objects usable after session.commit()
# without triggering extra lazy-load queries.
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


# ---------------------------------------------------------------------------
# Declarative base — shared by all models in models.py
# ---------------------------------------------------------------------------
class Base(DeclarativeBase):
    pass


# ---------------------------------------------------------------------------
# FastAPI dependency — yields a session per request, always closes it
# ---------------------------------------------------------------------------
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Yield an async DB session for use with FastAPI's Depends().

    The session is committed on success and rolled back on any exception,
    then closed unconditionally in the finally block.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


# ---------------------------------------------------------------------------
# init_db — create all tables from metadata (dev / CI convenience only)
# ---------------------------------------------------------------------------
async def init_db() -> None:
    """
    Create all tables defined in models.py against the live database.

    Intended for development and CI environments.
    In production, run Alembic migrations instead:
        alembic upgrade head
    """
    # Import models here to ensure their metadata is registered on Base
    # before create_all is called.
    import models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


# ---------------------------------------------------------------------------
# close_db — graceful shutdown
# ---------------------------------------------------------------------------
async def close_db() -> None:
    """Dispose the engine connection pool on application shutdown."""
    await engine.dispose()
