"""
backend/utils/prism_state.py
=============================
Chain-agnostic PRISM State Object.

Provides a single, portable snapshot of the portfolio's execution state
that is not tied to any specific chain — suitable for cross-chain routing,
credit systems, and resilience scoring.
"""

import hashlib
from datetime import datetime


def build_prism_state(
    wallet: str,
    total_value_usd: float,
    risk_score: str,
    credit_score: dict,
    router_data: dict,
) -> dict:
    """
    Build a chain-agnostic PRISM state object.

    Parameters
    ----------
    wallet          : str   — wallet address
    total_value_usd : float — total portfolio value in USD
    risk_score      : str   — "LOW" / "MEDIUM" / "HIGH"
    credit_score    : dict  — { score, grade, label, max }
    router_data     : dict  — output of calculate_routing(); supplies active_chain

    Returns
    -------
    {
        state_id       : str   — deterministic SHA-256 ID (wallet + timestamp minute)
        active_chain   : str   — best execution chain from PRISM router
        portfolio_value: float — total USD value across all chains
        risk_score     : str   — portfolio risk level
        credit_score   : dict  — CREDEX on-chain credit snapshot
        last_updated   : str   — ISO-8601 UTC timestamp
    }
    """
    now = datetime.utcnow()
    last_updated = now.isoformat()

    # Deterministic ID: SHA-256 of wallet + truncated-to-minute timestamp
    # Stable within the same minute so repeated calls return the same ID.
    fingerprint = f"{wallet.lower()}:{now.strftime('%Y%m%dT%H%M')}"
    state_id = "prism-" + hashlib.sha256(fingerprint.encode()).hexdigest()[:16]

    active_chain = router_data.get("best_chain") or "unknown"

    return {
        "state_id":        state_id,
        "active_chain":    active_chain,
        "portfolio_value": round(total_value_usd, 2),
        "risk_score":      risk_score,
        "credit_score":    credit_score,
        "last_updated":    last_updated,
    }
