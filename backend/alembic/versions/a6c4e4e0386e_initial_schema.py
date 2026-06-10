"""initial schema

Revision ID: a6c4e4e0386e
Revises: 
Create Date: 2026-06-09 16:19:31.820513

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'a6c4e4e0386e'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create wallets, portfolio_cache, and health_scores tables."""

    # ------------------------------------------------------------------
    # Table: wallets
    # ------------------------------------------------------------------
    op.create_table(
        'wallets',
        sa.Column('id',         sa.Integer(),     nullable=False, autoincrement=True),
        sa.Column('address',    sa.String(255),   nullable=False),
        sa.Column('chain',      sa.String(64),    nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_wallets')),
        sa.UniqueConstraint('address', 'chain', name='uq_wallet_address_chain'),
    )
    op.create_index('ix_wallet_address', 'wallets', ['address'], unique=False)
    op.create_index('ix_wallet_chain',   'wallets', ['chain'],   unique=False)

    # ------------------------------------------------------------------
    # Table: portfolio_cache
    # ------------------------------------------------------------------
    op.create_table(
        'portfolio_cache',
        sa.Column('id',             sa.Integer(),    nullable=False, autoincrement=True),
        sa.Column('wallet_address', sa.String(255),  nullable=False),
        sa.Column('data',           sa.Text(),       nullable=False),
        sa.Column('updated_at',     sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_portfolio_cache')),
        sa.UniqueConstraint('wallet_address', name='uq_portfolio_wallet'),
    )
    op.create_index('ix_portfolio_wallet',  'portfolio_cache', ['wallet_address'], unique=False)
    op.create_index('ix_portfolio_updated', 'portfolio_cache', ['updated_at'],     unique=False)

    # ------------------------------------------------------------------
    # Table: health_scores
    # ------------------------------------------------------------------
    op.create_table(
        'health_scores',
        sa.Column('id',         sa.Integer(),    nullable=False, autoincrement=True),
        sa.Column('chain',      sa.String(64),   nullable=False),
        sa.Column('score',      sa.Float(),      nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_health_scores')),
        sa.UniqueConstraint('chain', name='uq_health_chain'),
    )
    op.create_index('ix_health_chain', 'health_scores', ['chain'], unique=False)


def downgrade() -> None:
    """Drop all tables created by this migration."""
    op.drop_index('ix_health_chain',      table_name='health_scores')
    op.drop_table('health_scores')

    op.drop_index('ix_portfolio_updated', table_name='portfolio_cache')
    op.drop_index('ix_portfolio_wallet',  table_name='portfolio_cache')
    op.drop_table('portfolio_cache')

    op.drop_index('ix_wallet_chain',   table_name='wallets')
    op.drop_index('ix_wallet_address', table_name='wallets')
    op.drop_table('wallets')
