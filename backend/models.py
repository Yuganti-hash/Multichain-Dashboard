"""
backend/models.py
==================
SQLAlchemy ORM models for the SOVEREIGN project.

Tables
------
  wallets          — tracked wallet addresses per chain
  portfolio_cache  — cached JSON portfolio snapshots per wallet
  health_scores    — per-chain PRISM health scores

All models inherit from `Base` defined in database.py so that
`Base.metadata.create_all()` / Alembic autogenerate pick them up.
"""

from datetime import datetime, timezone

from sqlalchemy import (
    DateTime,
    Float,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


# ---------------------------------------------------------------------------
# Shared UTC timestamp helper
# ---------------------------------------------------------------------------
def _utcnow() -> datetime:
    """Return the current UTC datetime (timezone-aware)."""
    return datetime.now(timezone.utc)


# ===========================================================================
# Table 1 — wallets
# Tracks every wallet address that has been queried, labelled by chain.
# ===========================================================================
class Wallet(Base):
    """
    Represents a blockchain wallet address associated with a specific chain.

    Columns
    -------
    id         : Auto-incrementing primary key.
    address    : The wallet address (e.g. 0xABCD…).  Max 255 chars.
    chain      : Chain identifier — "ethereum", "polygon", "bsc",
                 "solana", "arbitrum".
    created_at : UTC timestamp when this record was first inserted.

    Constraints
    -----------
    uq_wallet_address_chain : A wallet+chain pair is unique — prevents
                              duplicate rows when the same wallet is queried
                              multiple times on the same chain.
    ix_wallet_chain         : Index on `chain` for fast chain-scoped queries.
    """

    __tablename__ = "wallets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    address: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    chain: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
        server_default=func.now(),
    )

    __table_args__ = (
        UniqueConstraint("address", "chain", name="uq_wallet_address_chain"),
        Index("ix_wallet_chain", "chain"),
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Wallet id={self.id} address={self.address!r} chain={self.chain!r}>"


# ===========================================================================
# Table 2 — portfolio_cache
# Stores the last-known portfolio JSON snapshot for a wallet.
# Updated on every successful /portfolio/{wallet} response.
# ===========================================================================
class PortfolioCache(Base):
    """
    Caches the full portfolio JSON response for a given wallet address.

    Columns
    -------
    id             : Auto-incrementing primary key.
    wallet_address : The wallet this snapshot belongs to.
    data           : Raw JSON string (the full /portfolio response body).
    updated_at     : UTC timestamp of the most recent cache write.

    Constraints
    -----------
    uq_portfolio_wallet : One cache row per wallet address.
    ix_portfolio_wallet : Index for fast wallet-address lookups.
    ix_portfolio_updated: Index for TTL-based cache eviction queries.
    """

    __tablename__ = "portfolio_cache"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    wallet_address: Mapped[str] = mapped_column(
        String(255), nullable=False, unique=True
    )
    # Store the JSON payload as TEXT. Use JSON type if your PG version supports it
    # and you need server-side JSON queries; TEXT is always portable.
    data: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
        onupdate=_utcnow,
        server_default=func.now(),
    )

    __table_args__ = (
        UniqueConstraint("wallet_address", name="uq_portfolio_wallet"),
        Index("ix_portfolio_wallet", "wallet_address"),
        Index("ix_portfolio_updated", "updated_at"),
    )

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"<PortfolioCache id={self.id} "
            f"wallet={self.wallet_address!r} "
            f"updated_at={self.updated_at}>"
        )


# ===========================================================================
# Table 3 — health_scores
# Stores the latest PRISM health score for each supported chain.
# ===========================================================================
class HealthScore(Base):
    """
    Records the most recent PRISM health score for each blockchain.

    Columns
    -------
    id         : Auto-incrementing primary key.
    chain      : Chain identifier — "ethereum", "polygon", "bsc",
                 "solana", "arbitrum".
    score      : Numeric health score (0.0 – 100.0).
    updated_at : UTC timestamp of the most recent score write.

    Constraints
    -----------
    uq_health_chain : One score row per chain — use upsert semantics to update.
    ix_health_chain : Index for fast chain-scoped lookups.
    """

    __tablename__ = "health_scores"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    chain: Mapped[str] = mapped_column(
        String(64), nullable=False, unique=True
    )
    score: Mapped[float] = mapped_column(Float, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
        onupdate=_utcnow,
        server_default=func.now(),
    )

    __table_args__ = (
        UniqueConstraint("chain", name="uq_health_chain"),
        Index("ix_health_chain", "chain"),
    )

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"<HealthScore id={self.id} "
            f"chain={self.chain!r} "
            f"score={self.score} "
            f"updated_at={self.updated_at}>"
        )
