"""
backend/utils/risk.py
======================
Portfolio risk scoring based on chain diversification.

Risk is evaluated on two axes:

  1. BREADTH  — How many chains hold a non-zero balance?
                More chains = lower concentration risk.

  2. CONCENTRATION — Does any single chain dominate the portfolio?
                     A chain holding > 80 % of total value bumps
                     the score up one severity level.

Score scale (from least to most risky):
  LOW    — 3+ active chains, no single chain > 80 %
  MEDIUM — 2 active chains OR concentration bump applied to LOW
  HIGH   — 1 active chain, empty portfolio, or concentration bump on MEDIUM

All functions are synchronous — no async or external dependencies needed.
"""

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Threshold above which a single chain is considered dangerously concentrated.
# Using strict inequality (>) so exactly 80 % does NOT trigger a bump.
CONCENTRATION_THRESHOLD: float = 80.0

# Risk level ordering — used to bump severity up one level
_RISK_ORDER: list[str] = ["LOW", "MEDIUM", "HIGH"]


# ===========================================================================
# PUBLIC FUNCTION 1 — calculate_risk
# ===========================================================================
def calculate_risk(chain_breakdown: list[dict]) -> str:
    """
    Compute a portfolio risk score from the chain breakdown.

    Parameters
    ----------
    chain_breakdown : list[dict]
        Each element must contain:
          { "chain": str, "value_usd": float, "percentage": float }
        `percentage` should already be on a 0–100 scale.

    Returns
    -------
    str
        One of "LOW", "MEDIUM", or "HIGH".
    """
    # ------------------------------------------------------------------
    # Edge case — no breakdown data at all: unknown situation = HIGH risk
    # ------------------------------------------------------------------
    if not chain_breakdown:
        return "HIGH"

    # ------------------------------------------------------------------
    # Step 1 — Filter to chains that actually hold value.
    #          Chains with zero USD value don't contribute to diversification.
    # ------------------------------------------------------------------
    active_chains: list[dict] = [
        c for c in chain_breakdown if c.get("value_usd", 0.0) > 0
    ]

    # ------------------------------------------------------------------
    # Step 2 — Count active chains.
    #          Zero active chains means the wallet is effectively empty.
    # ------------------------------------------------------------------
    active_count: int = len(active_chains)

    if active_count == 0:
        # All chains have zero value — treat as HIGH risk (unknown/empty portfolio)
        return "HIGH"

    # ------------------------------------------------------------------
    # Step 3 — Apply the BASE RULE based on chain breadth:
    #            1 chain  → HIGH
    #            2 chains → MEDIUM
    #            3+       → LOW
    # ------------------------------------------------------------------
    if active_count == 1:
        base_risk = "HIGH"
    elif active_count == 2:
        base_risk = "MEDIUM"
    else:
        base_risk = "LOW"

    # ------------------------------------------------------------------
    # Step 4 — Check CONCENTRATION: find the maximum percentage held by
    #          any single active chain.
    # ------------------------------------------------------------------
    max_percentage: float = max(c.get("percentage", 0.0) for c in active_chains)

    # ------------------------------------------------------------------
    # Step 5 — Concentration bump: if any chain holds STRICTLY more than
    #          80 % of the portfolio, promote the risk score by one level.
    #          "HIGH" is already the ceiling — it stays "HIGH".
    #
    #          Exactly 80 % does NOT trigger a bump (strict > comparison).
    # ------------------------------------------------------------------
    if max_percentage > CONCENTRATION_THRESHOLD:
        current_index = _RISK_ORDER.index(base_risk)
        # Clamp to the last index so "HIGH" stays "HIGH"
        bumped_index = min(current_index + 1, len(_RISK_ORDER) - 1)
        final_risk = _RISK_ORDER[bumped_index]
    else:
        final_risk = base_risk

    # ------------------------------------------------------------------
    # Step 6 — Return the final risk string
    # ------------------------------------------------------------------
    return final_risk


# ===========================================================================
# PUBLIC FUNCTION 2 — get_risk_color
# ===========================================================================
def get_risk_color(risk_score: str) -> str:
    """
    Return a hex color string for rendering the risk badge in the UI.

    Parameters
    ----------
    risk_score : str
        One of "LOW", "MEDIUM", "HIGH".

    Returns
    -------
    str
        Hex color code:
          LOW    → #22c55e  (green)
          MEDIUM → #f59e0b  (amber)
          HIGH   → #ef4444  (red)
          other  → #6b7280  (gray — fallback for unexpected values)
    """
    color_map: dict[str, str] = {
        "LOW":    "#22c55e",   # Tailwind green-500
        "MEDIUM": "#f59e0b",   # Tailwind amber-500
        "HIGH":   "#ef4444",   # Tailwind red-500
    }
    # Unknown/unexpected risk values fall back to neutral gray
    return color_map.get(risk_score.upper(), "#6b7280")


# ===========================================================================
# PUBLIC FUNCTION 3 — get_risk_explanation
# ===========================================================================
def get_risk_explanation(risk_score: str, chain_breakdown: list[dict]) -> str:
    """
    Return a human-readable explanation of the risk score for display in the UI.

    The message is tailored using the actual number of active chains so it
    feels specific rather than generic.

    Parameters
    ----------
    risk_score : str
        One of "LOW", "MEDIUM", "HIGH".
    chain_breakdown : list[dict]
        The same chain breakdown passed to calculate_risk().

    Returns
    -------
    str
        A plain-English explanation sentence.
    """
    # Count active chains for a more informative message
    active_count: int = len(
        [c for c in chain_breakdown if c.get("value_usd", 0.0) > 0]
    )

    score = risk_score.upper()

    if score == "HIGH":
        if active_count <= 1:
            return (
                "Portfolio concentrated on 1 chain. "
                "Diversify across multiple chains to reduce risk."
            )
        # HIGH triggered by concentration bump on a 2-chain portfolio
        return (
            "One chain dominates over 80 % of your portfolio value. "
            "Rebalancing across chains will lower your risk."
        )

    if score == "MEDIUM":
        if active_count == 2:
            return (
                "Portfolio spread across 2 chains. "
                "Consider adding exposure to more chains for better diversification."
            )
        # MEDIUM triggered by concentration bump on a 3+-chain portfolio
        return (
            "Good chain breadth, but one chain holds over 80 % of your value. "
            "Rebalancing will bring your risk down to LOW."
        )

    if score == "LOW":
        return (
            f"Well diversified across {active_count} chains. "
            "Risk is low — no single chain dominates your portfolio."
        )

    # Fallback for any unexpected risk_score value
    return "Risk score unavailable. Please check your portfolio data."


# ===========================================================================
# PUBLIC FUNCTION 4 — calculate_prism_health_score
# ===========================================================================
def calculate_prism_health_score(chain_breakdown: list[dict], tokens: list[dict]) -> dict:
    """
    Simulates PRISM's execution environment health scoring.
    Evaluates how portable/resilient a portfolio is across chains.

    Args:
        chain_breakdown: list of { chain, value_usd, percentage }
        tokens: flat list of all tokens across all chains

    Returns:
        {
            overall_score: int (0-100),
            chain_scores: { ethereum, polygon, bsc, solana },
            recommendation: str,
            prism_ready: bool
        }
    """
    # Default scores for all supported chains
    chain_scores = {
        "ethereum": 100,
        "polygon":  100,
        "bsc":      100,
        "solana":   100,
        "arbitrum": 100,
    }

    # Filter to active chains only
    active_chains = [c for c in chain_breakdown if (c.get("value_usd") or 0) > 0]

    if not active_chains:
        return {
            "overall_score": 0,
            "chain_scores": chain_scores,
            "recommendation": "No assets detected. Add assets across multiple chains.",
            "prism_ready": False,
        }

    for chain_data in active_chains:
        chain   = chain_data.get("chain", "")
        pct     = chain_data.get("percentage", 0)
        score   = 100

        # Concentration penalties
        if pct > 80:
            score -= 50   # severe concentration
        elif pct > 60:
            score -= 30   # moderate concentration

        # Count tokens on this chain
        chain_token_count = sum(
            1 for t in tokens if t.get("chain") == chain
        )
        if chain_token_count <= 1:
            score -= 10   # low diversification within chain

        # BSC bridge risk penalty
        if chain == "bsc":
            score -= 5

        chain_scores[chain] = max(0, score)

    # Weighted average: only active chains contribute
    active_scores = [
        chain_scores[c.get("chain")]
        for c in active_chains
        if c.get("chain") in chain_scores
    ]
    overall_score = int(sum(active_scores) / len(active_scores)) if active_scores else 0

    # Recommendation
    if overall_score >= 80:
        recommendation = "Portfolio is well-structured for PRISM state migration."
    elif overall_score >= 60:
        recommendation = "Consider rebalancing to reduce single-chain dependency."
    elif overall_score >= 40:
        recommendation = "High concentration risk. Diversify across more chains."
    else:
        recommendation = "Critical: portfolio is dangerously concentrated."

    return {
        "overall_score": overall_score,
        "chain_scores":  chain_scores,
        "recommendation": recommendation,
        "prism_ready":   overall_score >= 70,
    }


# ===========================================================================
# PUBLIC FUNCTION 5 — calculate_credit_score
# ===========================================================================
def calculate_credit_score(tokens: list, transactions: list) -> dict:
    """
    Compute the CREDEX On-Chain Credit Score for a wallet.

    Score range: 300 (minimum) – 850 (maximum), matching a credit-bureau scale.

    Scoring components
    ------------------
    Base score:            500  (every wallet starts here)

    A. Token diversity:    +0–100
       Rewards holding a variety of tokens across chains.
       Formula: min(unique_token_count * 2, 100)

    B. Chain breadth:      +0–120
       Rewards spreading assets across multiple chains.
       Formula: min(unique_chain_count * 30, 120)

    C. Multi-chain bonus:  +30
       Extra reward for being active on 3+ chains simultaneously.

    D. Native asset bonus: +0–50
       Rewards holding native chain tokens (ETH, SOL, BNB, MATIC, ARB)
       as a proxy for genuine on-chain activity vs. just bridged tokens.
       Formula: min(native_count * 10, 50)

    E. Transaction history: +0–150  [additive when real tx data is provided]
       Formula: min(len(transactions) * 5, 150)
       NOTE: The caller in main.py currently passes transactions=[] because
       tx history is fetched separately on /transactions. This component
       activates automatically once real data is wired in — no further
       changes to this function are needed.

    Parameters
    ----------
    tokens : list[dict]
        Flat list of all tokens across all chains from the portfolio response.
        Each token must have at least: { "symbol": str, "chain": str }

    transactions : list[dict]
        On-chain transaction history. Pass [] if not available — the score
        degrades gracefully using the token-derived proxy instead.
        When real transactions are provided, each entry is counted toward
        component E above.

    Returns
    -------
    dict
        {
            "score":           int,   # 300–850
            "grade":           str,   # "A" | "B" | "C" | "D"
            "label":           str,   # "CREDEX On-Chain Credit Score"
            "max":             int,   # 850
            "tx_count":        int,   # transactions used for scoring
            "chain_count":     int,   # unique chains detected
            "token_count":     int,   # unique tokens detected
        }
    """
    # Guard: handle None inputs gracefully
    tokens       = tokens       if isinstance(tokens, list)       else []
    transactions = transactions if isinstance(transactions, list) else []

    # ------------------------------------------------------------------
    # Derive unique token symbols and chain names from the tokens list.
    # Using sets deduplicates tokens that appear on multiple chains.
    # ------------------------------------------------------------------
    unique_tokens: set[str] = set()
    unique_chains: set[str] = set()
    native_symbols = {"ETH", "SOL", "BNB", "MATIC", "ARB"}
    native_count   = 0

    for t in tokens:
        symbol = (t.get("symbol") or "").upper().strip()
        chain  = (t.get("chain")  or "").lower().strip()

        if symbol:
            unique_tokens.add(symbol)
        if chain:
            unique_chains.add(chain)

        # Count native-asset holdings as an on-chain activity signal.
        # Native tokens are a reliable proxy: wallets that actually *use*
        # a chain always hold a native balance for gas fees.
        if symbol in native_symbols:
            native_count += 1

    token_count = len(unique_tokens)
    chain_count = len(unique_chains)
    tx_count    = len(transactions)

    # ------------------------------------------------------------------
    # Base score
    # ------------------------------------------------------------------
    score: float = 500.0

    # A — Token diversity (max +100)
    # Each unique token held adds 2 points.
    # A wallet with 50+ distinct tokens earns the full 100.
    score += min(token_count * 2, 100)

    # B — Chain breadth (max +120)
    # Being active on more chains is a strong creditworthiness signal.
    score += min(chain_count * 30, 120)

    # C — Multi-chain bonus (+30)
    # Extra reward for genuine cross-chain presence (3+ chains).
    if chain_count >= 3:
        score += 30

    # D — Native asset bonus (max +50)
    # Each native token held (ETH, SOL, BNB, MATIC, ARB) adds 10 points.
    # Capped at 50 — holding 5 different natives is the ceiling.
    score += min(native_count * 10, 50)

    # E — Transaction history (max +150)
    # Activates when real tx data is passed by the caller.
    # Each transaction adds 5 points; 30+ transactions earns the full 150.
    score += min(tx_count * 5, 150)

    # ------------------------------------------------------------------
    # Clamp to valid range and convert to int
    # ------------------------------------------------------------------
    final_score: int = int(min(850, max(300, score)))

    # ------------------------------------------------------------------
    # Letter grade — mirrors US credit bureau thresholds
    # ------------------------------------------------------------------
    if final_score >= 750:
        grade = "A"   # Excellent
    elif final_score >= 650:
        grade = "B"   # Good
    elif final_score >= 550:
        grade = "C"   # Fair
    else:
        grade = "D"   # Poor

    return {
        "score":       final_score,
        "grade":       grade,
        "label":       "CREDEX On-Chain Credit Score",
        "max":         850,
        "tx_count":    tx_count,
        "chain_count": chain_count,
        "token_count": token_count,
    }
