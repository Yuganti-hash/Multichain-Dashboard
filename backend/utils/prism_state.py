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


# ---------------------------------------------------------------------------
# Thresholds (mirrors chain_monitor.py constants)
# ---------------------------------------------------------------------------
_LATENCY_DEGRADED_MS: float = 2_000.0   # > 2 000 ms → chain is degraded


def _select_active_chain(
    chain_health: dict,
    portfolio_data: dict,
) -> str:
    """
    Pick the best execution chain for this wallet.

    Selection criteria (in priority order):
      1. Chain must hold wallet assets (value_usd > 0 in chain_breakdown).
      2. Chain must be healthy (is_healthy == True).
      3. Among healthy candidates, prefer highest PRISM health score;
         break ties by lowest latency_ms.

    Falls back to the globally healthiest chain (regardless of asset presence)
    if no asset-holding chain is healthy, and finally to "unknown" if
    chain_health is empty.

    Parameters
    ----------
    chain_health  : dict — output of get_all_chains_health()
                    { chain_name: { is_healthy, latency_ms, ... }, ... }
    portfolio_data: dict — output of /portfolio route; must contain
                    chain_breakdown: [{ chain, value_usd, percentage }]

    Returns
    -------
    str — lowercase chain name, e.g. "ethereum"
    """
    chain_breakdown: list[dict] = portfolio_data.get("chain_breakdown", [])
    prism_health: dict = portfolio_data.get("prism_health", {})
    chain_scores: dict = prism_health.get("chain_scores", {})

    # Chains where the wallet actually holds assets
    chains_with_assets: set[str] = {
        entry["chain"].lower()
        for entry in chain_breakdown
        if entry.get("value_usd", 0) > 0
    }

    def _sort_key(chain_name: str) -> tuple:
        """Higher score → better; lower latency → better (tie-break)."""
        score: int = chain_scores.get(chain_name, 0)
        lat: float = chain_health.get(chain_name, {}).get("latency_ms", 9_999.0)
        return (-score, lat)

    # --- Pass 1: healthy chains where the wallet has assets ----------------
    candidates = [
        ch for ch, data in chain_health.items()
        if data.get("is_healthy", False) and ch in chains_with_assets
    ]
    if candidates:
        return min(candidates, key=_sort_key)

    # --- Pass 2: any healthy chain (no asset requirement) ------------------
    healthy_any = [
        ch for ch, data in chain_health.items()
        if data.get("is_healthy", False)
    ]
    if healthy_any:
        return min(healthy_any, key=_sort_key)

    # --- Fallback -----------------------------------------------------------
    return "unknown"


def _get_degraded_chains(chain_health: dict) -> list[str]:
    """
    Return a list of chain names that are explicitly unhealthy.

    A chain is degraded when is_healthy == False (covers both hard failures
    and latency-based failures as reported by chain_monitor).

    Parameters
    ----------
    chain_health : dict — output of get_all_chains_health()

    Returns
    -------
    list[str] — sorted list of unhealthy chain names
    """
    return sorted(
        ch for ch, data in chain_health.items()
        if not data.get("is_healthy", True)
    )


def _get_recommended_migration(
    active_chain: str,
    chain_health: dict,
    portfolio_data: dict,
) -> dict | None:
    """
    If the active chain is unhealthy, suggest the best healthy alternative.

    Parameters
    ----------
    active_chain  : str  — current active chain name
    chain_health  : dict — output of get_all_chains_health()
    portfolio_data: dict — portfolio route output (for PRISM scores)

    Returns
    -------
    dict or None.

    dict shape:
        {
            "from_chain"   : str,
            "to_chain"     : str,
            "reason"       : str,
            "urgency"      : "IMMEDIATE" | "RECOMMENDED",
            "latency_ms"   : float,
        }

    None — returned when active_chain is healthy (no migration needed).
    """
    active_data: dict = chain_health.get(active_chain, {})
    is_active_healthy: bool = active_data.get("is_healthy", True)

    if is_active_healthy:
        return None   # No migration required

    prism_health: dict = portfolio_data.get("prism_health", {})
    chain_scores: dict = prism_health.get("chain_scores", {})

    # Best healthy alternative: highest PRISM score, lowest latency as tie-break
    healthy_alternatives = [
        ch for ch, data in chain_health.items()
        if data.get("is_healthy", False) and ch != active_chain
    ]

    if not healthy_alternatives:
        return {
            "from_chain": active_chain,
            "to_chain":   "unavailable",
            "reason":     "No healthy alternative chains found",
            "urgency":    "IMMEDIATE",
            "latency_ms": active_data.get("latency_ms", -1.0),
        }

    best_alt = min(
        healthy_alternatives,
        key=lambda ch: (
            -chain_scores.get(ch, 0),
            chain_health[ch].get("latency_ms", 9_999.0),
        ),
    )

    return {
        "from_chain": active_chain,
        "to_chain":   best_alt,
        "reason": (
            f"Active chain '{active_chain}' is unhealthy "
            f"(latency={active_data.get('latency_ms', -1):.0f} ms). "
            f"Migrate to '{best_alt}' for best performance."
        ),
        "urgency":    "IMMEDIATE",
        "latency_ms": active_data.get("latency_ms", -1.0),
    }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def build_prism_state(
    wallet: str,
    portfolio_data: dict,
    chain_health: dict,
) -> dict:
    """
    Build a chain-agnostic PRISM state object enriched with real chain health.

    Parameters
    ----------
    wallet         : str  — wallet address
    portfolio_data : dict — full output of /portfolio route; expected keys:
                       total_value_usd, risk_score, credit_score,
                       chain_breakdown, prism_health
    chain_health   : dict — output of get_all_chains_health(); shape:
                       { chain_name: { is_healthy, latency_ms, ... } }

    Returns
    -------
    {
        state_id              : str   — deterministic SHA-256 ID (wallet + minute)
        active_chain          : str   — healthiest chain where wallet has assets
        degraded_chains       : list  — chains with is_healthy == False
        recommended_migration : dict | None — migration suggestion when active
                                              chain is unhealthy; else None
        portfolio_value       : float — total USD value across all chains
        risk_score            : str   — "LOW" / "MEDIUM" / "HIGH"
        credit_score          : dict  — CREDEX on-chain credit snapshot
        last_updated          : str   — ISO-8601 UTC timestamp
    }
    """
    now = datetime.utcnow()
    last_updated = now.isoformat()

    # Deterministic ID: SHA-256 of wallet + truncated-to-minute timestamp.
    # Stable within the same minute so repeated calls return the same ID.
    fingerprint = f"{wallet.lower()}:{now.strftime('%Y%m%dT%H%M')}"
    state_id = "prism-" + hashlib.sha256(fingerprint.encode()).hexdigest()[:16]

    # --- Derive fields from live chain health --------------------------------
    active_chain          = _select_active_chain(chain_health, portfolio_data)
    degraded_chains       = _get_degraded_chains(chain_health)
    recommended_migration = _get_recommended_migration(
        active_chain, chain_health, portfolio_data
    )

    # --- Pull scalars from portfolio_data ------------------------------------
    total_value_usd: float = portfolio_data.get("total_value_usd", 0.0)
    risk_score: str        = portfolio_data.get("risk_score", "UNKNOWN")
    credit_score: dict     = portfolio_data.get("credit_score", {})

    return {
        "state_id":              state_id,
        "active_chain":          active_chain,
        "degraded_chains":       degraded_chains,
        "recommended_migration": recommended_migration,
        "portfolio_value":       round(total_value_usd, 2),
        "risk_score":            risk_score,
        "credit_score":          credit_score,
        "last_updated":          last_updated,
    }
