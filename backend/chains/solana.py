"""
backend/chains/solana.py
=========================
Fetches Solana portfolio data using two separate APIs:

  1. Solana public JSON-RPC (api.mainnet-beta.solana.com)
     — used for native SOL balance via getBalance (no API key required)

  2. Helius API (api.helius.xyz/v0)
     — used for SPL token balances via the /addresses/{wallet}/balances endpoint

Unlike the EVM chain modules (ethereum, polygon, bsc) which all use Moralis,
Solana has its own distinct account model and requires a different data source.

Helius API docs: https://docs.helius.dev
Required env var: HELIUS_API_KEY
"""

import asyncio
import os

import httpx

# ---------------------------------------------------------------------------
# Configuration — Helius API key loaded from environment at import time.
# SOL balance is fetched from the public Solana RPC, which needs no key.
# ---------------------------------------------------------------------------
HELIUS_API_KEY: str | None = os.getenv("HELIUS_API_KEY")
HELIUS_BASE_URL = "https://api.helius.xyz/v0"
SOLANA_RPC_URL  = "https://api.mainnet-beta.solana.com"

if not HELIUS_API_KEY:
    print(
        "[solana] WARNING: HELIUS_API_KEY is not set. "
        "All Solana token balance calls will return empty data."
    )


# ---------------------------------------------------------------------------
# Internal helpers — one coroutine per data type, called concurrently
# ---------------------------------------------------------------------------

async def _fetch_sol_balance(client: httpx.AsyncClient, wallet: str) -> float:
    """
    Fetch the native SOL balance for *wallet* using the public Solana RPC.

    Endpoint: POST https://api.mainnet-beta.solana.com  (no API key needed)
    JSON-RPC method: getBalance

    The response contains the balance in **lamports** (1 SOL = 1,000,000,000 lamports).
    We divide by 1e9 to convert to SOL.

    Response structure:
        { "result": { "value": <lamports: int> } }
    """
    try:
        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getBalance",
            "params": [wallet],
        }
        resp = await client.post(SOLANA_RPC_URL, json=payload)
        resp.raise_for_status()
        data = resp.json()

        # Navigate the JSON-RPC envelope: result.value holds lamports
        lamports = data.get("result", {}).get("value", 0)
        return int(lamports) / 1e9

    except Exception as exc:
        print(f"[solana] Failed to fetch SOL balance: {exc}")
        return 0.0


async def _fetch_token_balances(client: httpx.AsyncClient, wallet: str) -> list[dict]:
    """
    Fetch SPL token balances for *wallet* using the Helius balances endpoint.

    Endpoint: GET /v0/addresses/{wallet}/balances?api-key={HELIUS_API_KEY}

    Response structure:
        {
            "tokens": [
                { "mint": str, "amount": int, "decimals": int, "tokenAccount": str },
                ...
            ]
        }

    Each raw `amount` is in the token's smallest unit; we normalise with `decimals`.
    Tokens with a zero or negative effective balance are skipped.

    Because Helius does not always return human-readable symbol/name metadata on
    this endpoint, we derive a short symbol from the first 6 chars of the mint
    address as a fallback. Full metadata enrichment can be added later via the
    Helius DAS API.
    """
    try:
        url = f"{HELIUS_BASE_URL}/addresses/{wallet}/balances"
        params = {"api-key": HELIUS_API_KEY}
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        data = resp.json()

        raw_tokens: list[dict] = data.get("tokens", [])
        tokens: list[dict] = []

        for t in raw_tokens:
            try:
                mint     = t.get("mint") or ""
                decimals = int(t.get("decimals") or 0)
                raw_amt  = int(t.get("amount") or 0)
                amount   = raw_amt / (10 ** decimals) if decimals else raw_amt

                # Skip dust / zero-balance entries
                if amount <= 0:
                    continue

                # Derive a short symbol from the mint address as a readable fallback
                symbol = mint[:6].upper() if mint else "UNKNOWN"

                tokens.append(
                    {
                        "symbol":        symbol,
                        "name":          f"Solana Token ({mint[:8]}...)" if mint else "Unknown SPL Token",
                        "amount":        amount,
                        "token_address": mint,
                        "chain":         "solana",
                    }
                )
            except Exception as token_exc:
                # Skip a single malformed token but continue processing the rest
                print(f"[solana] Skipping malformed SPL token entry: {token_exc}")

        return tokens

    except Exception as exc:
        print(f"[solana] Failed to fetch token balances: {exc}")
        return []


# ===========================================================================
# PUBLIC FUNCTION — get_portfolio
# ===========================================================================
async def get_portfolio(wallet_address: str) -> dict:
    """
    Return a full Solana portfolio for *wallet_address*.

    Fires 2 API requests **concurrently** via asyncio.gather():
      - Native SOL balance  (Solana public RPC — POST, no key needed)
      - SPL token balances  (Helius API — GET, requires HELIUS_API_KEY)

    NFTs are excluded from this module; "nfts" is always returned as [].
    (Helius NFT data can be wired in later via the DAS /getAssetsByOwner endpoint.)

    Native SOL is injected into `tokens` so the caller can compute a total
    USD value uniformly alongside SPL tokens.

    Returns
    -------
    {
        "chain":          "solana",
        "tokens":         [{"symbol", "name", "amount", "token_address", "chain"}, ...],
        "nfts":           [],      # NFT fetching not implemented for Solana yet
        "native_balance": float    # SOL balance
    }
    """
    # ------------------------------------------------------------------
    # Guard: if the Helius API key is missing, SOL balance can still be
    # fetched from the public RPC, but token balances will be empty.
    # We opt to return fully empty data to keep the response consistent.
    # ------------------------------------------------------------------
    if not HELIUS_API_KEY:
        print("[solana] Skipping get_portfolio — HELIUS_API_KEY not set.")
        return {"chain": "solana", "tokens": [], "nfts": [], "native_balance": 0.0}

    async with httpx.AsyncClient(timeout=15.0) as client:
        # ------------------------------------------------------------------
        # Fire both requests concurrently — SOL RPC + Helius token balances
        # ------------------------------------------------------------------
        sol_balance, spl_tokens = await asyncio.gather(
            _fetch_sol_balance(client, wallet_address),
            _fetch_token_balances(client, wallet_address),
        )

    # ------------------------------------------------------------------
    # Prepend native SOL as a synthetic token entry so downstream price
    # logic can assign it a USD value alongside SPL tokens
    # ------------------------------------------------------------------
    native_sol_token: dict = {
        "symbol":        "SOL",
        "name":          "Solana",
        "amount":        sol_balance,
        "token_address": "native",
        "chain":         "solana",
    }
    all_tokens: list[dict] = [native_sol_token] + spl_tokens

    return {
        "chain":          "solana",
        "tokens":         all_tokens,
        "nfts":           [],       # NFT support not yet implemented for Solana
        "native_balance": sol_balance,
    }
