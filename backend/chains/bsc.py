"""
backend/chains/bsc.py
======================
Fetches BSC (Binance Smart Chain) portfolio data (native BNB balance and
BEP-20 tokens) using the Moralis Deep Index API v2.2.

Mirrors polygon.py in structure with these differences:
  - All chain parameters use "bsc" instead of "polygon"
  - Native token is BNB, not MATIC
  - All "chain" labels in returned objects are "bsc"
  - NFT fetching is omitted — "nfts" is always returned as []
  - No get_transactions() function

Moralis API docs: https://docs.moralis.io/web3-data-api/evm
Required env var: MORALIS_API_KEY
"""

import asyncio
import os

import httpx

# ---------------------------------------------------------------------------
# Configuration — same API key and base URL as ethereum.py / polygon.py.
# If the key is missing we print a warning; every function handles None safely.
# ---------------------------------------------------------------------------
MORALIS_API_KEY: str | None = os.getenv("MORALIS_API_KEY")
BASE_URL = "https://deep-index.moralis.io/api/v2.2"

# Standard headers sent with every Moralis request
HEADERS: dict[str, str] = {
    "X-API-Key": MORALIS_API_KEY or "",
    "Accept": "application/json",
}

if not MORALIS_API_KEY:
    print(
        "[bsc] WARNING: MORALIS_API_KEY is not set. "
        "All BSC API calls will return empty data."
    )


# ---------------------------------------------------------------------------
# Internal helpers — one coroutine per data type, called concurrently.
# NFTs are intentionally omitted for BSC.
# ---------------------------------------------------------------------------

async def _fetch_native_balance(client: httpx.AsyncClient, wallet: str) -> float:
    """
    Fetch the native BNB balance for *wallet* on Binance Smart Chain.

    Endpoint: GET /v2.2/{wallet}/balance?chain=bsc
    The API returns { "balance": "<wei as string>" }.
    We divide by 1e18 to convert wei → BNB.
    """
    try:
        url = f"{BASE_URL}/{wallet}/balance"
        resp = await client.get(url, params={"chain": "bsc"}, headers=HEADERS)
        resp.raise_for_status()
        data = resp.json()
        wei = int(data.get("balance", 0))
        return wei / 1e18
    except Exception as exc:
        print(f"[bsc] Failed to fetch native balance for {wallet}: {exc}")
        return 0.0


async def _fetch_erc20_tokens(client: httpx.AsyncClient, wallet: str) -> list[dict]:
    """
    Fetch BEP-20 token balances for *wallet* on Binance Smart Chain.

    Endpoint: GET /v2.2/{wallet}/erc20?chain=bsc
    Returns a list of token objects. Each raw balance is in the token's
    smallest unit; we convert using `decimals`.
    """
    try:
        url = f"{BASE_URL}/{wallet}/erc20"
        resp = await client.get(url, params={"chain": "bsc"}, headers=HEADERS)
        resp.raise_for_status()
        raw_tokens: list[dict] = resp.json()

        tokens: list[dict] = []
        for t in raw_tokens:
            try:
                decimals = int(t.get("decimals") or 18)
                raw_balance = int(t.get("balance") or 0)
                amount = raw_balance / (10 ** decimals)
                tokens.append(
                    {
                        "symbol":        (t.get("symbol") or "UNKNOWN").upper(),
                        "name":          t.get("name") or "Unknown Token",
                        "amount":        amount,
                        "token_address": t.get("token_address") or "",
                        "chain":         "bsc",
                    }
                )
            except Exception as token_exc:
                # Skip a single malformed token but keep the rest
                print(f"[bsc] Skipping malformed BEP-20 token entry: {token_exc}")

        return tokens

    except Exception as exc:
        print(f"[bsc] Failed to fetch BEP-20 tokens for {wallet}: {exc}")
        return []


# ===========================================================================
# PUBLIC FUNCTION — get_portfolio
# ===========================================================================
async def get_portfolio(wallet_address: str) -> dict:
    """
    Return a full BSC portfolio for *wallet_address*.

    Fires 2 Moralis API requests **concurrently** via asyncio.gather():
      - Native BNB balance
      - BEP-20 token list (bsc chain)

    NFTs are intentionally excluded for BSC — "nfts" is always [].

    Native BNB is injected into the `tokens` list so the caller can
    compute a total USD value in a uniform way alongside BEP-20 tokens.

    Returns
    -------
    {
        "chain":          "bsc",
        "tokens":         [{"symbol", "name", "amount", "token_address", "chain"}, ...],
        "nfts":           [],      # always empty for BSC
        "native_balance": float    # BNB balance
    }
    """
    # Guard: if the API key is missing, return empty but valid data immediately
    if not MORALIS_API_KEY:
        print("[bsc] Skipping get_portfolio — MORALIS_API_KEY not set.")
        return {"chain": "bsc", "tokens": [], "nfts": [], "native_balance": 0.0}

    async with httpx.AsyncClient(timeout=15.0) as client:
        # ------------------------------------------------------------------
        # Fire both requests concurrently (no NFT call for BSC)
        # ------------------------------------------------------------------
        native_bnb, erc20_tokens = await asyncio.gather(
            _fetch_native_balance(client, wallet_address),
            _fetch_erc20_tokens(client, wallet_address),
        )

    # ------------------------------------------------------------------
    # Prepend native BNB as a synthetic token entry so downstream price
    # logic can assign it a USD value alongside BEP-20 tokens
    # ------------------------------------------------------------------
    native_token: dict = {
        "symbol":        "BNB",
        "name":          "BNB",
        "amount":        native_bnb,
        "token_address": "native",
        "chain":         "bsc",
    }
    all_tokens: list[dict] = [native_token] + erc20_tokens

    return {
        "chain":          "bsc",
        "tokens":         all_tokens,
        "nfts":           [],       # NFT fetching intentionally omitted for BSC
        "native_balance": native_bnb,
    }
