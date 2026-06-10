"""
backend/utils/gas.py
======================
Ethereum gas price estimator.

Fetches the current base fee from Ethereum mainnet via the Cloudflare public
JSON-RPC endpoint, applies slow / normal / fast multipliers, and converts the
results to USD using a live CoinGecko ETH price lookup.

Public interface
----------------
    get_gas_estimates() -> dict
        Always returns a valid dict.  Falls back to hard-coded sentinel values
        if the RPC or CoinGecko call fails — the endpoint should never 500.

Example return value
--------------------
    {
        "slow":   { "gwei": 12.0,  "usd": 0.053, "minutes": 5   },
        "normal": { "gwei": 14.4,  "usd": 0.064, "minutes": 2   },
        "fast":   { "gwei": 18.0,  "usd": 0.080, "minutes": 0.5 },
    }

Dependencies
------------
    pip install web3 httpx        (both already in requirements.txt)
"""

import httpx
from web3 import Web3

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Public Cloudflare Ethereum JSON-RPC — no API key required
_ETH_RPC = "https://cloudflare-eth.com"

# CoinGecko simple-price endpoint — no key needed for the free tier
_COINGECKO_PRICE_URL = (
    "https://api.coingecko.com/api/v3/simple/price"
    "?ids=ethereum&vs_currencies=usd"
)

# Standard ETH transfer gas limit (21 000 units)
_TRANSFER_GAS_UNITS = 21_000

# Multipliers for the three speed tiers
_MULTIPLIERS = {
    "slow":   1.0,
    "normal": 1.2,
    "fast":   1.5,
}

# Time-to-inclusion estimates (in minutes) for each tier
_MINUTES = {
    "slow":   5,
    "normal": 2,
    "fast":   0.5,
}

# Fallback values returned when either fetch fails — keeps the endpoint alive
_FALLBACK = {
    "slow":   {"gwei": 10.0,  "usd": 0.044, "minutes": 5  },
    "normal": {"gwei": 12.0,  "usd": 0.053, "minutes": 2  },
    "fast":   {"gwei": 15.0,  "usd": 0.066, "minutes": 0.5},
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _fetch_base_fee_gwei() -> float:
    """
    Call eth_getBlockByNumber("latest", false) via JSON-RPC and extract the
    ``baseFeePerGas`` field.  Returns the base fee in **Gwei** (float).

    Raises on any HTTP or parsing error — caller must catch.
    """
    payload = {
        "jsonrpc": "2.0",
        "method":  "eth_getBlockByNumber",
        "params":  ["latest", False],
        "id":      1,
    }
    async with httpx.AsyncClient(timeout=8.0) as client:
        response = await client.post(_ETH_RPC, json=payload)
        response.raise_for_status()
        data = response.json()

    # baseFeePerGas is a hex string in Wei (e.g. "0x59682f00")
    base_fee_hex: str = data["result"]["baseFeePerGas"]
    base_fee_wei: int = int(base_fee_hex, 16)
    return base_fee_wei / 1e9  # Wei → Gwei


async def _fetch_eth_price_usd() -> float:
    """
    Fetch the current ETH/USD price from CoinGecko's public simple-price API.
    Returns the price as a float.

    Raises on any HTTP or parsing error — caller must catch.
    """
    async with httpx.AsyncClient(timeout=8.0) as client:
        response = await client.get(_COINGECKO_PRICE_URL)
        response.raise_for_status()
        data = response.json()

    return float(data["ethereum"]["usd"])


def _usd_cost(gwei: float, eth_price_usd: float) -> float:
    """
    Calculate the USD cost of a standard 21 000-gas ETH transfer.

    Formula:  gwei × 21 000 × eth_price / 1e9
              └─ gas price ─┘└─ gas units ─┘└─ Wei→ETH ─┘
    """
    eth_cost = (gwei * _TRANSFER_GAS_UNITS) / 1e9
    return round(eth_cost * eth_price_usd, 6)


# ---------------------------------------------------------------------------
# Public interface
# ---------------------------------------------------------------------------

async def get_gas_estimates() -> dict:
    """
    Return slow / normal / fast gas estimates for a standard ETH transfer.

    Flow
    ----
    1. Fetch the current base fee from Ethereum mainnet (Cloudflare RPC).
    2. Fetch the current ETH/USD spot price from CoinGecko.
    3. Apply tier multipliers (1.0 / 1.2 / 1.5) to the base fee.
    4. Convert each tier to USD using the transfer formula.

    Fallback
    --------
    If *either* external call fails the function logs a warning and returns
    ``_FALLBACK`` so the ``GET /gas`` endpoint never propagates a 500.

    Returns
    -------
    dict
        {
            "slow":   { "gwei": float, "usd": float, "minutes": 5   },
            "normal": { "gwei": float, "usd": float, "minutes": 2   },
            "fast":   { "gwei": float, "usd": float, "minutes": 0.5 },
        }
    """
    try:
        base_fee_gwei = await _fetch_base_fee_gwei()
        eth_price_usd = await _fetch_eth_price_usd()
    except Exception as exc:
        print(f"[gas] Failed to fetch gas/price data: {exc} — returning fallback values")
        return _FALLBACK

    estimates: dict = {}
    for tier, multiplier in _MULTIPLIERS.items():
        tier_gwei = round(base_fee_gwei * multiplier, 4)
        estimates[tier] = {
            "gwei":    tier_gwei,
            "usd":     _usd_cost(tier_gwei, eth_price_usd),
            "minutes": _MINUTES[tier],
        }

    return estimates
