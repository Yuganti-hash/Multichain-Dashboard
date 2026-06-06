"""
backend/chains/polygon.py
==========================
Fetches Polygon network portfolio data (native MATIC balance, ERC-20 tokens, NFTs)
using the Moralis Deep Index API v2.2.

Mirrors ethereum.py exactly in structure; the only differences are:
  - All chain parameters use "polygon" instead of "eth"
  - Native token is MATIC, not ETH
  - All "chain" labels in returned objects are "polygon"
  - No get_transactions() — transaction history is Ethereum-only in this project

Moralis API docs: https://docs.moralis.io/web3-data-api/evm
Required env var: MORALIS_API_KEY
"""

import asyncio
import os

import httpx

# ---------------------------------------------------------------------------
# Configuration — same API key and base URL as ethereum.py.
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
        "[polygon] WARNING: MORALIS_API_KEY is not set. "
        "All Polygon API calls will return empty data."
    )


# ---------------------------------------------------------------------------
# Internal helpers — one coroutine per data type, called concurrently
# ---------------------------------------------------------------------------

async def _fetch_native_balance(client: httpx.AsyncClient, wallet: str) -> float:
    """
    Fetch the native MATIC balance for *wallet* on the Polygon network.

    Endpoint: GET /v2.2/{wallet}/balance?chain=polygon
    The API returns { "balance": "<wei as string>" }.
    We divide by 1e18 to convert wei → MATIC.
    """
    try:
        url = f"{BASE_URL}/{wallet}/balance"
        resp = await client.get(url, params={"chain": "polygon"}, headers=HEADERS)
        resp.raise_for_status()
        data = resp.json()
        wei = int(data.get("balance", 0))
        return wei / 1e18
    except Exception as exc:
        print(f"[polygon] Failed to fetch native balance for {wallet}: {exc}")
        return 0.0


async def _fetch_erc20_tokens(client: httpx.AsyncClient, wallet: str) -> list[dict]:
    """
    Fetch ERC-20 token balances for *wallet* on the Polygon network.

    Endpoint: GET /v2.2/{wallet}/erc20?chain=polygon
    Returns a list of token objects. Each raw balance is in the token's
    smallest unit; we convert using `decimals`.
    """
    try:
        url = f"{BASE_URL}/{wallet}/erc20"
        resp = await client.get(url, params={"chain": "polygon"}, headers=HEADERS)
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
                        "chain":         "polygon",
                    }
                )
            except Exception as token_exc:
                # Skip a single malformed token but keep the rest
                print(f"[polygon] Skipping malformed ERC-20 token entry: {token_exc}")

        return tokens

    except Exception as exc:
        print(f"[polygon] Failed to fetch ERC-20 tokens for {wallet}: {exc}")
        return []


async def _fetch_nfts(client: httpx.AsyncClient, wallet: str) -> list[dict]:
    """
    Fetch the first 10 NFTs owned by *wallet* on the Polygon network.

    Endpoint: GET /v2.2/{wallet}/nft?chain=polygon&format=decimal&limit=10
    The response envelope has a `result` list of NFT metadata objects.
    """
    import json as _json
    try:
        url = f"{BASE_URL}/{wallet}/nft"
        params = {
            "chain": "polygon",
            "format": "decimal",
            "limit": 10,
            "normalizeMetadata": "true",
            "media_items": "true",
        }
        resp = await client.get(url, params=params, headers=HEADERS)
        resp.raise_for_status()
        data = resp.json()
        raw_nfts: list[dict] = data.get("result", [])

        nfts: list[dict] = []
        for item in raw_nfts:
            # Extract image from multiple fallback sources
            norm     = item.get("normalized_metadata") or {}
            metadata = item.get("metadata") or {}
            if isinstance(metadata, str):
                try: metadata = _json.loads(metadata)
                except: metadata = {}

            # Try Moralis pre-cached media items first (most reliable)
            media_image = ""
            media_items = item.get("media") or {}
            if isinstance(media_items, dict):
                media_collection = media_items.get("media_collection") or {}
                # Prefer medium size, then low, then high, then original
                for size_key in ["medium", "low", "high"]:
                    size_obj = media_collection.get(size_key) or {}
                    media_url = size_obj.get("url") or ""
                    if media_url and media_url.startswith("http"):
                        media_image = media_url
                        break
                if not media_image:
                    original = media_items.get("original_media_url") or ""
                    if original and original.startswith("http"):
                        media_image = original

            image = (
                media_image or
                norm.get("image") or
                norm.get("image_url") or
                metadata.get("image") or
                metadata.get("image_url") or
                item.get("collection_logo") or ""
            )

            # Convert IPFS to HTTP via nftstorage.link (reliable, good CORS support)
            if image and image.startswith("ipfs://"):
                image = image.replace("ipfs://", "https://nftstorage.link/ipfs/")
            elif image and image.startswith("https://ipfs.io/ipfs/"):
                image = image.replace("https://ipfs.io/ipfs/", "https://nftstorage.link/ipfs/")
            elif image and image.startswith("https://cloudflare-ipfs.com/ipfs/"):
                image = image.replace("https://cloudflare-ipfs.com/ipfs/", "https://nftstorage.link/ipfs/")

            nfts.append(
                {
                    "token_address":   item.get("token_address") or "",
                    "token_id":        item.get("token_id") or "",
                    "name":            norm.get("name") or item.get("name") or "Unknown NFT",
                    "symbol":          (item.get("symbol") or "NFT").upper(),
                    "image":           image or "",
                    "collection_logo": item.get("collection_logo") or "",
                    "metadata":        metadata,
                    "chain":           "polygon",
                }
            )

        return nfts

    except Exception as exc:
        print(f"[polygon] Failed to fetch NFTs for {wallet}: {exc}")
        return []


# ===========================================================================
# PUBLIC FUNCTION — get_portfolio
# ===========================================================================
async def get_portfolio(wallet_address: str) -> dict:
    """
    Return a full Polygon portfolio for *wallet_address*.

    Fires 3 Moralis API requests **concurrently** via asyncio.gather():
      - Native MATIC balance
      - ERC-20 token list (Polygon chain)
      - NFT collection (first 10, Polygon chain)

    Native MATIC is injected into the `tokens` list so the caller can
    compute a total USD value in a uniform way alongside ERC-20 tokens.

    Returns
    -------
    {
        "chain":          "polygon",
        "tokens":         [{"symbol", "name", "amount", "token_address", "chain"}, ...],
        "nfts":           [{"token_address", "token_id", "name", "symbol", "token_uri", "chain"}, ...],
        "native_balance": float   # MATIC balance
    }
    """
    # Guard: if the API key is missing, return empty but valid data immediately
    if not MORALIS_API_KEY:
        print("[polygon] Skipping get_portfolio — MORALIS_API_KEY not set.")
        return {"chain": "polygon", "tokens": [], "nfts": [], "native_balance": 0.0}

    async with httpx.AsyncClient(timeout=15.0) as client:
        # ------------------------------------------------------------------
        # Fire all three requests concurrently to minimise latency
        # ------------------------------------------------------------------
        native_matic, erc20_tokens, nfts = await asyncio.gather(
            _fetch_native_balance(client, wallet_address),
            _fetch_erc20_tokens(client, wallet_address),
            _fetch_nfts(client, wallet_address),
        )

    # ------------------------------------------------------------------
    # Prepend native MATIC as a synthetic token entry so downstream price
    # logic can assign it a USD value alongside ERC-20 tokens
    # ------------------------------------------------------------------
    native_token: dict = {
        "symbol":        "MATIC",
        "name":          "Polygon",
        "amount":        native_matic,
        "token_address": "native",
        "chain":         "polygon",
    }
    all_tokens: list[dict] = [native_token] + erc20_tokens

    return {
        "chain":          "polygon",
        "tokens":         all_tokens,
        "nfts":           nfts,
        "native_balance": native_matic,
    }
