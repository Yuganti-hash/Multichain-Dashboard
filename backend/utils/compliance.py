"""
backend/utils/compliance.py
============================
VERTEX On-Chain Compliance Module.
Screens wallet addresses against a known sanctions / flagged-wallet list
and returns a structured compliance result.

Returns:
  - FLAGGED  → wallet is on the OFAC sanctions list
  - CLEAR    → wallet passed screening, includes a VERTEX credential token
"""

# ---------------------------------------------------------------------------
# Flagged wallet addresses (lowercase, checksumless)
# Source: OFAC sanctions list (sample subset)
# ---------------------------------------------------------------------------
FLAGGED_WALLETS: list[str] = [
    "0x7f367cc41522ce07553e823bf3be79a889debe1b",
    "0xd882cfc20f52f2599d84b8e8d58c7fb62cfe344b",
]


# ===========================================================================
# PUBLIC FUNCTION — check_compliance
# ===========================================================================
def check_compliance(wallet: str) -> dict:
    """
    Screen a wallet address against the flagged wallets list.

    Parameters
    ----------
    wallet : str
        Any EVM-compatible wallet address (checksummed or not).

    Returns
    -------
    dict
        {
            "status":            "FLAGGED" | "CLEAR",
            "risk_level":        "HIGH"   | "LOW",
            "reason":            str,
            "vertex_certified":  bool,
            "credential":        str   # only present when CLEAR
        }
    """
    w = wallet.lower().strip()

    if w in FLAGGED_WALLETS:
        return {
            "status":           "FLAGGED",
            "risk_level":       "HIGH",
            "reason":           "OFAC sanctions list",
            "vertex_certified": False,
        }

    return {
        "status":           "CLEAR",
        "risk_level":       "LOW",
        "reason":           "No sanctions matches found",
        "vertex_certified": True,
        "credential":       f"VERTEX-{wallet[:8].upper()}-CLEAR",
    }


import hashlib, time


# ===========================================================================
# PUBLIC FUNCTION — generate_zk_proof
# ===========================================================================
def generate_zk_proof(wallet: str, total_value: float,
                      risk_score: str) -> dict:
    """
    Generate a simulated zero-knowledge proof for a portfolio snapshot.

    The proof is deterministic within the same clock-hour (time // 3600)
    so repeated calls for the same wallet in the same hour return the
    same proof hash — matching the behaviour of a real ZK commitment scheme.

    Parameters
    ----------
    wallet      : str   — wallet address
    total_value : float — total portfolio value in USD
    risk_score  : str   — "LOW" | "MEDIUM" | "HIGH"

    Returns
    -------
    dict
        {
            "proof":     str,   # 64-char hex digest
            "nullifier": str,   # 16-char wallet-derived nullifier
            "verified":  bool,
            "algorithm": str,
            "note":      str
        }
    """
    data = f"{wallet}:{total_value:.2f}:{risk_score}:{int(time.time() // 3600)}"
    proof_hash = hashlib.sha256(data.encode()).hexdigest()
    nullifier  = hashlib.sha256(wallet.encode()).hexdigest()[:16]
    return {
        "proof":     proof_hash,
        "nullifier": nullifier,
        "verified":  True,
        "algorithm": "SHA256-PRISM-SIM",
        "note":      "Simulated ZK proof — production uses Groth16",
    }
