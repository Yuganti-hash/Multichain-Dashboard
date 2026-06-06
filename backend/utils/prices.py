"""
backend/utils/prices.py
========================
Fetches live USD prices for crypto tokens using the CoinGecko Simple Price API.

CoinGecko uses internal IDs (e.g. "ethereum", "solana") rather than ticker
symbols (e.g. "ETH", "SOL"). This module maintains a curated symbol→ID mapping
to bridge the gap between the token symbols returned by chain modules and the
IDs that CoinGecko expects.

Supports both:
  - Free tier  : api.coingecko.com          (no key required, rate-limited)
  - Pro tier   : pro-api.coingecko.com      (requires COINGECKO_API_KEY)

CoinGecko docs: https://www.coingecko.com/en/api/documentation
Optional env var: COINGECKO_API_KEY
"""

import os

import httpx

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
COINGECKO_API_KEY: str | None = os.getenv("COINGECKO_API_KEY")

# Choose the right base URL based on whether a key is present and its type
if COINGECKO_API_KEY:
    # CoinGecko Demo keys start with 'CG-'
    if COINGECKO_API_KEY.startswith("CG-"):
        COINGECKO_BASE_URL = "https://api.coingecko.com/api/v3"
        COINGECKO_HEADERS  = {"x-cg-demo-api-key": COINGECKO_API_KEY}
    else:
        COINGECKO_BASE_URL = "https://pro-api.coingecko.com/api/v3"
        COINGECKO_HEADERS  = {"x-cg-pro-api-key": COINGECKO_API_KEY}
else:
    COINGECKO_BASE_URL = "https://api.coingecko.com/api/v3"
    COINGECKO_HEADERS  = {}


# ---------------------------------------------------------------------------
# Symbol → CoinGecko ID mapping
#
# CoinGecko does not accept ticker symbols directly — it requires its own
# internal coin IDs. This dict translates the uppercase symbols returned
# by our chain modules into the IDs the Simple Price endpoint understands.
#
# To add a new token:
#   1. Find its ID at https://api.coingecko.com/api/v3/coins/list
#   2. Add an entry here: "SYMBOL": "coingecko-id"
# ---------------------------------------------------------------------------
SYMBOL_TO_COINGECKO_ID: dict[str, str] = {
    "ETH":   "ethereum",
    "MATIC": "matic-network",
    "POL":   "matic-network",          # POL is the rebranded MATIC
    "BNB":   "binancecoin",
    "SOL":   "solana",
    "USDT":  "tether",
    "USDC":  "usd-coin",
    "DAI":   "dai",
    "WETH":  "weth",
    "WBTC":  "wrapped-bitcoin",
    "UNI":   "uniswap",
    "LINK":  "chainlink",
    "AAVE":  "aave",
    "COMP":  "compound-governance-token",
    "MKR":   "maker",
    "SNX":   "havven",
    "CRV":   "curve-dao-token",
    "SUSHI": "sushi",
    "1INCH": "1inch",
    "LDO":   "lido-dao",
    "ARB":   "arbitrum",
    "OP":    "optimism",
    "APE":   "apecoin",
    "SAND":  "the-sandbox",
    "MANA":  "decentraland",
    "AXS":   "axie-infinity",
    "SHIB":  "shiba-inu",
    "PEPE":  "pepe",
    "FLOKI": "floki",
}

# ---------------------------------------------------------------------------
# Fallback prices — used ONLY when the CoinGecko API call fails entirely.
# These are rough estimates to prevent a total price outage from breaking
# portfolio value calculations. They are NOT used for unknown tokens.
# ---------------------------------------------------------------------------
FALLBACK_PRICES: dict[str, float] = {
    "ETH":   3000.0,
    "BNB":    500.0,
    "SOL":    150.0,
    "MATIC":    0.8,
    "USDT":     1.0,
    "USDC":     1.0,
    "DAI":      1.0,
}


# ===========================================================================
# PUBLIC FUNCTION — get_prices
# ===========================================================================
async def get_prices(symbols: list[str]) -> dict[str, float]:
    """
    Fetch live USD prices for a list of token symbols.

    Only symbols present in SYMBOL_TO_COINGECKO_ID are queried; unknown
    symbols are silently ignored (they have no CoinGecko mapping).

    Parameters
    ----------
    symbols : list[str]
        Uppercase token symbols, e.g. ["ETH", "SOL", "USDC"].

    Returns
    -------
    dict[str, float]
        Mapping of symbol → USD price, e.g. {"ETH": 3200.5, "SOL": 145.0}.
        Returns 0.0 for any symbol whose price could not be fetched.
        Falls back to FALLBACK_PRICES for known symbols if the API is down.
    """
    try:
        # ------------------------------------------------------------------
        # Step 1 — Filter to only symbols we have a CoinGecko ID for.
        #          Normalise to uppercase for consistent lookup.
        # ------------------------------------------------------------------
        known_symbols: list[str] = [
            s.upper() for s in symbols if s.upper() in SYMBOL_TO_COINGECKO_ID
        ]

        # ------------------------------------------------------------------
        # Step 2 — Early exit if nothing is mappable
        # ------------------------------------------------------------------
        if not known_symbols:
            return {}

        # ------------------------------------------------------------------
        # Step 3 — Build the list of CoinGecko IDs from the known symbols
        # ------------------------------------------------------------------
        id_map: dict[str, str] = {
            symbol: SYMBOL_TO_COINGECKO_ID[symbol] for symbol in known_symbols
        }

        # ------------------------------------------------------------------
        # Step 4 — Deduplicate IDs (e.g. both MATIC and POL → "matic-network")
        # ------------------------------------------------------------------
        unique_ids: list[str] = list(set(id_map.values()))

        # ------------------------------------------------------------------
        # Step 5 — Fetch prices from CoinGecko Simple Price endpoint
        # ------------------------------------------------------------------
        print(f"[prices] Fetching prices for: {unique_ids}")

        params = {
            "ids":          ",".join(unique_ids),
            "vs_currencies": "usd",
        }

        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{COINGECKO_BASE_URL}/simple/price",
                params=params,
                headers=COINGECKO_HEADERS,
            )
            resp.raise_for_status()
            price_data: dict = resp.json()

        # ------------------------------------------------------------------
        # Step 6 & 7 — Map each original symbol back to its USD price.
        # If a CoinGecko ID is missing from the response (e.g. delisted),
        # we default to 0.0 for that symbol.
        # ------------------------------------------------------------------
        result: dict[str, float] = {}
        for symbol in known_symbols:
            coingecko_id = id_map[symbol]
            usd_price = price_data.get(coingecko_id, {}).get("usd", 0.0)
            result[symbol] = float(usd_price)

        return result

    except Exception as exc:
        # ------------------------------------------------------------------
        # Error path — API is unreachable or returned a non-2xx status.
        # Return fallback prices for known tokens; 0.0 for everything else.
        # ------------------------------------------------------------------
        print(f"[prices] Failed to fetch prices: {exc}")
        print("[prices] Returning fallback prices for known tokens.")

        fallback_result: dict[str, float] = {}
        for s in symbols:
            sym = s.upper()
            fallback_result[sym] = FALLBACK_PRICES.get(sym, 0.0)

        return fallback_result
