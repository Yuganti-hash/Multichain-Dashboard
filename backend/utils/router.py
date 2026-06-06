"""
backend/utils/router.py
========================
PRISM Execution Router.
Evaluates the best chain to route transaction execution based on
Chain Health, Portfolio Allocation, and Liquidity (TVL) Score.

Scoring formula:
  score = (0.40 * chain_health) + (0.30 * portfolio_allocation) + (0.30 * liquidity_score)

Only chains where the wallet actually holds assets (allocation > 0) are ranked.
"""

# ---------------------------------------------------------------------------
# DeFiLlama returns chain names with specific capitalisation (e.g. "BSC", not "bsc").
# This map converts them to the lowercase internal identifiers used throughout.
# ---------------------------------------------------------------------------
_DEFILLAMA_NAME_TO_CHAIN: dict[str, str] = {
    "ethereum":  "ethereum",
    "polygon":   "polygon",
    "bsc":       "bsc",        # DeFiLlama returns "BSC"
    "solana":    "solana",
    "arbitrum":  "arbitrum",
    "base":      "base",
}

# ---------------------------------------------------------------------------
# Chain allocation aliases — backend chain names vary slightly across modules.
# Maps any variant to the canonical lowercase key used here.
# ---------------------------------------------------------------------------
_ALLOCATION_ALIASES: dict[str, str] = {
    "eth":      "ethereum",
    "matic":    "polygon",
    "binance":  "bsc",
    "bnb":      "bsc",
    "sol":      "solana",
    "arb":      "arbitrum",
}

# ---------------------------------------------------------------------------
# Realistic per-chain health baselines used when prism_health has no entry.
# These reflect general network maturity / reliability, not live data.
# ---------------------------------------------------------------------------
_DEFAULT_HEALTH: dict[str, float] = {
    "ethereum":  95.0,
    "polygon":   88.0,
    "bsc":       82.0,
    "solana":    85.0,
    "arbitrum":  90.0,
    "base":      87.0,
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def format_tvl(tvl: float) -> str:
    """Format TVL value into a readable string (e.g., $45.2B or $120.5M)."""
    if tvl >= 1e9:
        return f"${tvl / 1e9:.2f}B"
    elif tvl >= 1e6:
        return f"${tvl / 1e6:.2f}M"
    else:
        return f"${tvl:,.0f}"


# ---------------------------------------------------------------------------
# Public function
# ---------------------------------------------------------------------------

def calculate_routing(chain_breakdown: list[dict], prism_health: dict, lumina_data: dict) -> dict:
    """
    Calculate the execution router rankings and best routing path.

    Only chains where the wallet holds a non-zero allocation are evaluated.

    Parameters
    ----------
    chain_breakdown : list[dict]
        Chain allocation percentages. Each entry: { chain, value_usd, percentage }.
    prism_health : dict
        PRISM health score. Must contain: { chain_scores: { chain: score } }.
    lumina_data : dict
        Liquidity (TVL) data per chain from LUMINA / DeFiLlama.

    Returns
    -------
    dict
        {
            "best_chain": str | None,
            "chain_rankings": list[dict],
            "recommendation": str
        }
    """

    # ------------------------------------------------------------------
    # 1. Build TVL map: lowercase chain name → TVL float
    # ------------------------------------------------------------------
    tvl_map: dict[str, float] = {}
    for lc in lumina_data.get("chains", []):
        raw_name = lc.get("name", "").lower()
        # Normalise via alias table, then fall through to the raw lowercase name
        chain_key = _DEFILLAMA_NAME_TO_CHAIN.get(raw_name, raw_name)
        tvl_map[chain_key] = float(lc.get("tvl", 0.0))

    # ------------------------------------------------------------------
    # 2. Build allocation map from chain_breakdown
    # ------------------------------------------------------------------
    allocation_map: dict[str, float] = {}
    for cb in chain_breakdown:
        raw = cb.get("chain", "").lower()
        chain_key = _ALLOCATION_ALIASES.get(raw, raw)
        allocation_map[chain_key] = float(cb.get("percentage", 0.0))

    # ------------------------------------------------------------------
    # 3. Only process chains where the wallet holds assets (percentage > 0)
    # ------------------------------------------------------------------
    active_chains = [
        chain for chain, pct in allocation_map.items() if pct > 0.0
    ]

    if not active_chains:
        return {
            "best_chain": None,
            "chain_rankings": [],
            "recommendation": "No assets detected across any chain. Deposit funds to enable execution routing.",
        }

    # ------------------------------------------------------------------
    # 4. Fetch health scores from prism_health
    # ------------------------------------------------------------------
    health_map: dict[str, float] = prism_health.get("chain_scores", {})

    # ------------------------------------------------------------------
    # 5. Find the max TVL among active chains (used for normalisation)
    # ------------------------------------------------------------------
    max_tvl = max(
        (tvl_map.get(chain, 0.0) for chain in active_chains),
        default=0.0
    )

    # ------------------------------------------------------------------
    # 6. Calculate score for each active chain
    # ------------------------------------------------------------------
    rankings: list[dict] = []

    for chain in active_chains:
        # Health: use prism_health chain score, then realistic default, then 100
        health = float(
            health_map.get(chain,
                _DEFAULT_HEALTH.get(chain, 100.0))
        )
        allocation = allocation_map[chain]
        tvl = tvl_map.get(chain, 0.0)

        # Normalised liquidity score (0–100)
        liquidity_score = (tvl / max_tvl * 100.0) if max_tvl > 0 else 0.0

        # Composite score
        score = (0.4 * health) + (0.3 * allocation) + (0.3 * liquidity_score)
        score = round(score, 2)

        rankings.append({
            "chain":  chain,
            "score":  score,
            "breakdown": {
                "chain_health":         round(health, 2),
                "portfolio_allocation": round(allocation, 2),
                "liquidity_score":      round(liquidity_score, 2),
            },
            "tvl": tvl,
        })

    # Sort descending by score
    rankings.sort(key=lambda x: x["score"], reverse=True)

    # ------------------------------------------------------------------
    # 7. Determine best chain and generate recommendation
    # ------------------------------------------------------------------
    best_item  = rankings[0]
    best_chain = best_item["chain"]

    # Human-readable chain name
    chain_labels = {
        "ethereum": "Ethereum",
        "polygon":  "Polygon",
        "bsc":      "BSC",
        "solana":   "Solana",
        "arbitrum": "Arbitrum",
        "base":     "Base",
    }
    label       = chain_labels.get(best_chain, best_chain.capitalize())
    health_val  = best_item["breakdown"]["chain_health"]
    tvl_val     = best_item["tvl"]
    alloc_val   = best_item["breakdown"]["portfolio_allocation"]

    if health_val >= 80 and tvl_val > 0:
        recommendation = (
            f"{label} is the optimal execution destination — "
            f"strong network health ({health_val:.0f}%), "
            f"high liquidity ({format_tvl(tvl_val)} TVL), "
            f"and {alloc_val:.1f}% of your portfolio is already positioned here."
        )
    elif health_val >= 80:
        recommendation = (
            f"{label} is the top-ranked chain based on network health ({health_val:.0f}%) "
            f"and portfolio allocation ({alloc_val:.1f}%). "
            f"Liquidity data is estimated."
        )
    else:
        recommendation = (
            f"{label} ranks highest overall, but network health is degraded "
            f"({health_val:.0f}%). Consider routing to the next-ranked chain "
            f"for critical transactions."
        )

    return {
        "best_chain":     best_chain,
        "chain_rankings": rankings,
        "recommendation": recommendation,
    }
