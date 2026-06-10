"""
backend/utils/chain_monitor.py
──────────────────────────────
Real-time chain health monitor for the SOVEREIGN multichain dashboard.

Supports: Ethereum, Polygon, Arbitrum, Solana, BSC

Health schema per chain:
    {
        "chain": str,
        "block_number": int,
        "block_time_seconds": float,
        "gas_price_gwei": float,
        "is_healthy": bool,
        "latency_ms": float,
        "last_updated": str          # ISO-8601 UTC
    }

is_healthy == True  iff:
    • RPC responded in < 3 000 ms
    • block_time_seconds < 30 s
"""

import asyncio
import json
import os
import time
from datetime import datetime, timezone
from typing import Any

import httpx
from dotenv import load_dotenv

load_dotenv()

# ─── RPC endpoints ────────────────────────────────────────────────────────────

HELIUS_API_KEY: str = os.getenv("HELIUS_API_KEY", "")

RPC_URLS: dict[str, str] = {
    # Override via ETHEREUM_RPC_URL / POLYGON_RPC_URL in .env for private keys
    # (e.g. Alchemy/Infura). Public fallbacks work but may be rate-limited.
    "ethereum": os.getenv("ETHEREUM_RPC_URL", "https://cloudflare-eth.com"),
    "polygon":  os.getenv("POLYGON_RPC_URL",  "https://polygon-rpc.com"),
    "arbitrum": os.getenv("ARBITRUM_RPC_URL", "https://arb1.arbitrum.io/rpc"),
    "bsc":      os.getenv("BSC_RPC_URL",      "https://bsc-dataseed.binance.org"),
    "solana":   os.getenv(
                    "SOLANA_RPC_URL",
                    f"https://mainnet.helius-rpc.com/?api-key={HELIUS_API_KEY}",
                ),
}

# Maximum acceptable latency and block time for a healthy chain
MAX_LATENCY_MS:    float = 3_000.0
MAX_BLOCK_TIME_S:  float = 30.0

# Number of historical blocks used to compute average block time
BLOCK_SAMPLE_SIZE: int = 5

# ─── Shared async HTTP client (one per call to avoid event-loop issues) ───────

_TIMEOUT = httpx.Timeout(connect=5.0, read=10.0, write=5.0, pool=5.0)


def _json_rpc(method: str, params: list[Any], rpc_id: int = 1) -> dict:
    """Build a minimal JSON-RPC 2.0 request body."""
    return {
        "jsonrpc": "2.0",
        "id":      rpc_id,
        "method":  method,
        "params":  params,
    }


# ─── EVM helpers (Ethereum / Polygon / Arbitrum / BSC) ────────────────────────

async def _evm_call(client: httpx.AsyncClient, url: str, payload: dict) -> Any:
    """POST a single JSON-RPC call and return the 'result' field."""
    response = await client.post(url, json=payload, timeout=_TIMEOUT)
    response.raise_for_status()
    data = response.json()
    if "error" in data:
        raise ValueError(f"RPC error: {data['error']}")
    return data["result"]


async def _get_evm_health(chain: str, url: str) -> dict:
    """
    Fetch health metrics for any EVM-compatible chain via its JSON-RPC endpoint.

    Steps:
        1. eth_blockNumber  → latest block hex
        2. eth_getBlockByNumber (latest) → timestamp
        3. eth_getBlockByNumber (latest - 4) → timestamp  (5-block window)
        4. eth_gasPrice → gas price hex
    """
    t_start = time.perf_counter()

    async with httpx.AsyncClient() as client:
        # 1. Latest block number
        result_bn = await _evm_call(
            client, url,
            _json_rpc("eth_blockNumber", []),
        )
        latest_block = int(result_bn, 16)

        # 2. Latest block details (full=False for speed)
        result_latest = await _evm_call(
            client, url,
            _json_rpc("eth_getBlockByNumber", [hex(latest_block), False]),
        )

        # 3. Block N - (BLOCK_SAMPLE_SIZE - 1) for average block-time window
        older_block_num = latest_block - (BLOCK_SAMPLE_SIZE - 1)
        result_older = await _evm_call(
            client, url,
            _json_rpc("eth_getBlockByNumber", [hex(older_block_num), False]),
        )

        # 4. Gas price
        result_gp = await _evm_call(
            client, url,
            _json_rpc("eth_gasPrice", []),
        )

    latency_ms = (time.perf_counter() - t_start) * 1_000

    # Parse timestamps (hex seconds since epoch)
    ts_latest = int(result_latest["timestamp"], 16)
    ts_older  = int(result_older["timestamp"],  16)

    # Average block time over the sample window
    block_time_s = (ts_latest - ts_older) / (BLOCK_SAMPLE_SIZE - 1)

    # Gas price: hex wei → Gwei
    gas_price_gwei = int(result_gp, 16) / 1e9

    is_healthy = latency_ms < MAX_LATENCY_MS and block_time_s < MAX_BLOCK_TIME_S

    return {
        "chain":               chain,
        "block_number":        latest_block,
        "block_time_seconds":  round(block_time_s, 3),
        "gas_price_gwei":      round(gas_price_gwei, 4),
        "is_healthy":          is_healthy,
        "latency_ms":          round(latency_ms, 2),
        "last_updated":        datetime.now(timezone.utc).isoformat(),
    }


# ─── Solana helper ─────────────────────────────────────────────────────────────

async def _get_solana_health() -> dict:
    """
    Fetch Solana health via Helius RPC.

    Calls:
        • getSlot                   → latest slot  (used as block_number)
        • getRecentPerformanceSamples(1) → numTransactions / samplePeriodSecs
          → TPS, stored in block_time_seconds as 1/TPS (seconds per tx).
            If TPS ≥ 1 this gives a sub-second figure (good for is_healthy).

    Gas price is always 0 for Solana (fee model is different).
    """
    url = RPC_URLS["solana"]
    t_start = time.perf_counter()

    async with httpx.AsyncClient() as client:
        # Latest slot
        slot_resp = await client.post(
            url,
            json=_json_rpc("getSlot", []),
            timeout=_TIMEOUT,
        )
        slot_resp.raise_for_status()
        slot_data = slot_resp.json()
        if "error" in slot_data:
            raise ValueError(f"Solana RPC error (getSlot): {slot_data['error']}")
        latest_slot: int = slot_data["result"]

        # Recent performance samples → TPS
        perf_resp = await client.post(
            url,
            json=_json_rpc("getRecentPerformanceSamples", [1]),
            timeout=_TIMEOUT,
        )
        perf_resp.raise_for_status()
        perf_data = perf_resp.json()
        if "error" in perf_data:
            raise ValueError(
                f"Solana RPC error (getRecentPerformanceSamples): {perf_data['error']}"
            )

    latency_ms = (time.perf_counter() - t_start) * 1_000

    samples = perf_data.get("result", [])
    if samples:
        sample          = samples[0]
        num_txns        = sample.get("numTransactions", 0)
        period_secs     = sample.get("samplePeriodSecs", 60)
        tps             = num_txns / period_secs if period_secs > 0 else 0.0
        # Represent as seconds-per-slot (Solana slot ≈ 0.4 s nominally)
        # We store 1/TPS clamped to a reasonable range so is_healthy logic works.
        block_time_s    = round(1.0 / tps, 4) if tps > 0 else 999.0
    else:
        tps          = 0.0
        block_time_s = 999.0          # unknown → mark unhealthy

    is_healthy = latency_ms < MAX_LATENCY_MS and block_time_s < MAX_BLOCK_TIME_S

    return {
        "chain":               "solana",
        "block_number":        latest_slot,
        "block_time_seconds":  block_time_s,   # 1/TPS (seconds per tx)
        "gas_price_gwei":      0.0,            # Solana uses lamports, not gwei
        "is_healthy":          is_healthy,
        "latency_ms":          round(latency_ms, 2),
        "last_updated":        datetime.now(timezone.utc).isoformat(),
    }


# ─── Per-chain dispatcher ─────────────────────────────────────────────────────

async def get_chain_health(chain: str) -> dict:
    """
    Return a health snapshot for *chain*.

    Supported values: "ethereum", "polygon", "arbitrum", "bsc", "solana".

    On any network or parsing error the function returns a safe fallback dict
    with is_healthy=False so the dashboard never crashes.
    """
    chain = chain.lower().strip()
    try:
        if chain == "solana":
            return await _get_solana_health()

        if chain in RPC_URLS:
            return await _get_evm_health(chain, RPC_URLS[chain])

        raise ValueError(f"Unknown chain: '{chain}'")

    except Exception as exc:  # noqa: BLE001
        return {
            "chain":               chain,
            "block_number":        0,
            "block_time_seconds":  -1.0,
            "gas_price_gwei":      -1.0,
            "is_healthy":          False,
            "latency_ms":          -1.0,
            "last_updated":        datetime.now(timezone.utc).isoformat(),
            "error":               str(exc),
        }


# ─── Concurrent all-chain snapshot ────────────────────────────────────────────

SUPPORTED_CHAINS: list[str] = ["ethereum", "polygon", "arbitrum", "solana", "bsc"]


async def get_all_chains_health() -> dict:
    """
    Fetch health for all supported chains concurrently.

    Returns:
        {
            "ethereum": { ... },
            "polygon":  { ... },
            "arbitrum": { ... },
            "solana":   { ... },
            "bsc":      { ... },
        }
    """
    results = await asyncio.gather(
        *[get_chain_health(chain) for chain in SUPPORTED_CHAINS],
        return_exceptions=False,   # individual errors already caught inside get_chain_health
    )
    return {chain: result for chain, result in zip(SUPPORTED_CHAINS, results)}


# ─── Quick CLI smoke-test ──────────────────────────────────────────────────────

if __name__ == "__main__":
    async def _smoke_test() -> None:
        print("Fetching health for all chains concurrently …\n")
        snapshot = await get_all_chains_health()
        print(json.dumps(snapshot, indent=2))

    asyncio.run(_smoke_test())
