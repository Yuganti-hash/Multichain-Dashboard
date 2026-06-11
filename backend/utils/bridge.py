"""
backend/utils/bridge.py
=======================
LayerZero V2 bridge-fee estimation and transaction status tracking
for the SOVEREIGN MultiChain Dashboard.

Public API
----------
get_bridge_quote(from_chain, to_chain, token_address, amount_wei, sender_address)
    → Async function that returns a LayerZero fee quote dict.

get_bridge_status(tx_hash, from_chain)
    → Async function that returns a bridge transaction status dict.

Strategy
--------
1. If BRIDGE_SIMULATE=true (or unset=true in dev), skip the RPC call and
   return a deterministic simulated quote immediately.
2. Otherwise, connect to the source-chain RPC via web3.py, load the
   EndpointV2 ABI, and call ``quoteSend()`` (view function, no gas).
3. If the on-chain call fails for any reason (bad RPC, network error,
   ABI mismatch, …) fall back to the same simulated quote with
   ``"simulated": true`` and ``"fallback_reason"`` populated.

Quote validity
--------------
LayerZero fees fluctuate with native gas prices.  Quotes are stamped with
``quote_valid_until`` = now + 5 minutes so the frontend can warn the user
when a quote has expired.

References
----------
- EndpointV2 quoteSend():
  https://docs.layerzero.network/v2/developers/evm/technical-reference/deployed-contracts
- OFT SendParam struct:
  https://docs.layerzero.network/v2/developers/evm/oft/quickstart
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from web3 import AsyncWeb3
from web3.providers import AsyncHTTPProvider

from utils.layerzero import (
    SUPPORTED_EVM_CHAINS,
    format_send_param,
    get_lz_eid,
    get_lz_endpoint,
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Simulated LZ native fee used when on-chain call is unavailable.
_SIMULATED_FEE_ETH: float = 0.002
_SIMULATED_FEE_WEI: int   = int(_SIMULATED_FEE_ETH * 10**18)

# Estimated cross-chain delivery time (seconds) — LZ V2 median ~2 minutes.
_ESTIMATED_TIME_SECONDS: int = 120

# Quote TTL — quotes expire after 5 minutes.
_QUOTE_TTL_SECONDS: int = 300

# Fallback ETH price (USD) — used when CoinGecko is unreachable.
_FALLBACK_ETH_USD: float = 3_000.0

# Path to the LayerZero EndpointV2 ABI (relative to this file's package root).
_ABI_PATH: Path = Path(__file__).parent.parent / "abis" / "LayerZeroEndpoint.json"

# RPC env-var name per chain
_RPC_ENV: dict[str, str] = {
    "ethereum": "ETHEREUM_RPC_URL",
    "polygon":  "POLYGON_RPC_URL",
    "arbitrum": "ARBITRUM_RPC_URL",
    "bsc":      "BSC_RPC_URL",
}

# Public fallback RPC URLs (rate-limited, for dev / CI only)
_PUBLIC_RPC: dict[str, str] = {
    "ethereum": "https://cloudflare-eth.com",
    "polygon":  "https://polygon-rpc.com",
    "arbitrum": "https://arb1.arbitrum.io/rpc",
    "bsc":      "https://bsc-dataseed.binance.org",
}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _load_abi() -> list[dict]:
    """Load the LayerZero EndpointV2 ABI from disk."""
    with _ABI_PATH.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def _get_rpc_url(chain: str) -> str:
    """Return the RPC URL for *chain*, preferring the env-var override."""
    env_key = _RPC_ENV.get(chain, "")
    url = os.getenv(env_key, "").strip() if env_key else ""
    if url:
        return url
    fallback = _PUBLIC_RPC.get(chain, "")
    if not fallback:
        raise ValueError(f"No RPC URL available for chain '{chain}'.")
    return fallback


async def _get_eth_usd_price() -> float:
    """
    Fetch the current ETH/USD price from CoinGecko (free tier).
    Returns _FALLBACK_ETH_USD on any failure.
    """
    try:
        import httpx
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                "https://api.coingecko.com/api/v3/simple/price",
                params={"ids": "ethereum", "vs_currencies": "usd"},
            )
            resp.raise_for_status()
            return float(resp.json()["ethereum"]["usd"])
    except Exception:
        return _FALLBACK_ETH_USD


def _build_quote_until() -> str:
    """Return an ISO-8601 UTC timestamp for now + 5 minutes."""
    return (
        datetime.now(timezone.utc) + timedelta(seconds=_QUOTE_TTL_SECONDS)
    ).isoformat()


def _build_simulated_quote(
    from_chain: str,
    to_chain: str,
    amount_wei: int,
    eth_usd: float,
    src_eid: int,
    dst_eid: int,
    fallback_reason: str | None = None,
) -> dict[str, Any]:
    """Construct the canonical quote dict using the simulated fee."""
    quote: dict[str, Any] = {
        "from_chain":               from_chain,
        "to_chain":                 to_chain,
        "amount_wei":               amount_wei,
        "amount_eth":               amount_wei / 10**18,
        "lz_fee_wei":               _SIMULATED_FEE_WEI,
        "lz_fee_eth":               _SIMULATED_FEE_ETH,
        "lz_fee_usd":               round(_SIMULATED_FEE_ETH * eth_usd, 4),
        "estimated_time_seconds":   _ESTIMATED_TIME_SECONDS,
        "src_eid":                  src_eid,
        "dst_eid":                  dst_eid,
        "quote_valid_until":        _build_quote_until(),
        "simulated":                True,
    }
    if fallback_reason:
        quote["fallback_reason"] = fallback_reason
    return quote


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def get_bridge_quote(
    from_chain: str,
    to_chain: str,
    token_address: str,
    amount_wei: int,
    sender_address: str,
) -> dict[str, Any]:
    """
    Return a LayerZero fee estimate for bridging *amount_wei* tokens from
    *from_chain* to *to_chain*.

    Parameters
    ----------
    from_chain : str
        Source chain key, e.g. ``"ethereum"`` — must be in SUPPORTED_EVM_CHAINS.
    to_chain : str
        Destination chain key, e.g. ``"arbitrum"`` — must be in LZ_EIDS.
    token_address : str
        ERC-20 token contract address on the source chain (or zero address for
        native ETH). Used for context in the returned quote; not validated
        on-chain in this function.
    amount_wei : int
        Token amount in the source-chain's smallest unit (wei for ERC-20/ETH).
    sender_address : str
        Wallet address that will initiate the send.  Used as the ``to``
        (recipient) address in the LayerZero ``SendParam`` for quote purposes.

    Returns
    -------
    dict
        {
          "from_chain":             str,
          "to_chain":               str,
          "amount_wei":             int,
          "amount_eth":             float,
          "lz_fee_wei":             int,
          "lz_fee_eth":             float,
          "lz_fee_usd":             float,
          "estimated_time_seconds": int,
          "src_eid":                int,
          "dst_eid":                int,
          "quote_valid_until":      str,   # ISO-8601, now+5min
          "simulated":              bool,
          "fallback_reason":        str,   # only when simulated=True due to RPC error
        }

    Raises
    ------
    ValueError
        If either chain is unsupported.
    """
    # ── Resolve EIDs ────────────────────────────────────────────────────────
    src_eid: int = get_lz_eid(from_chain)
    dst_eid: int = get_lz_eid(to_chain)

    # ── Fetch ETH price for USD conversion (non-blocking) ───────────────────
    eth_usd = await _get_eth_usd_price()

    # ── Simulation mode ─────────────────────────────────────────────────────
    simulate_env = os.getenv("BRIDGE_SIMULATE", "true").lower()
    if simulate_env in ("true", "1", "yes"):
        return _build_simulated_quote(
            from_chain, to_chain, amount_wei, eth_usd, src_eid, dst_eid
        )

    # ── On-chain quoteSend() call ────────────────────────────────────────────
    try:
        rpc_url      = _get_rpc_url(from_chain)
        endpoint_addr = get_lz_endpoint(from_chain)
        abi          = _load_abi()

        w3 = AsyncWeb3(AsyncHTTPProvider(rpc_url))

        # Build the SendParam struct — sender is also the recipient for quoting.
        send_param = format_send_param(
            to_address=sender_address,
            dst_eid=dst_eid,
            amount_wei=amount_wei,
            min_amount_wei=amount_wei,  # No slippage tolerance for fee quote
        )

        # Encode SendParam as tuple for web3.py ABI encoding
        send_param_tuple = (
            send_param["dstEid"],
            send_param["to"],
            send_param["amountLD"],
            send_param["minAmountLD"],
            send_param["extraOptions"],
            send_param["composeMsg"],
            send_param["oftCmd"],
        )

        contract = w3.eth.contract(
            address=AsyncWeb3.to_checksum_address(endpoint_addr),
            abi=abi,
        )

        # quoteSend(SendParam _sendParam, bool _payInLzToken)
        fee = await contract.functions.quoteSend(
            send_param_tuple,
            False,  # pay in native token, not LZ token
        ).call()

        # fee is a tuple/named-tuple: (nativeFee, lzTokenFee)
        native_fee_wei: int = int(fee[0])
        native_fee_eth: float = native_fee_wei / 10**18

        return {
            "from_chain":               from_chain,
            "to_chain":                 to_chain,
            "amount_wei":               amount_wei,
            "amount_eth":               amount_wei / 10**18,
            "lz_fee_wei":               native_fee_wei,
            "lz_fee_eth":               native_fee_eth,
            "lz_fee_usd":               round(native_fee_eth * eth_usd, 4),
            "estimated_time_seconds":   _ESTIMATED_TIME_SECONDS,
            "src_eid":                  src_eid,
            "dst_eid":                  dst_eid,
            "quote_valid_until":        _build_quote_until(),
            "simulated":                False,
        }

    except Exception as exc:
        # RPC unreachable, contract revert, ABI mismatch, etc.
        # Fall back to simulated fee so the UI never shows an error.
        fallback_reason = f"{type(exc).__name__}: {exc}"
        print(f"[bridge] quoteSend() failed — returning simulated fee. Reason: {fallback_reason}")
        return _build_simulated_quote(
            from_chain, to_chain, amount_wei, eth_usd, src_eid, dst_eid,
            fallback_reason=fallback_reason,
        )


# ---------------------------------------------------------------------------
# Bridge Transaction Status
# ---------------------------------------------------------------------------

# Block-explorer base URLs per supported chain.
_SRC_TX_EXPLORER: dict[str, str] = {
    "ethereum": "https://etherscan.io/tx/{}",
    "polygon":  "https://polygonscan.com/tx/{}",
    "arbitrum": "https://arbiscan.io/tx/{}",
    "bsc":      "https://bscscan.com/tx/{}",
}


async def get_bridge_status(tx_hash: str, from_chain: str) -> dict:
    """
    Check the on-chain status of a bridge transaction.

    Parameters
    ----------
    tx_hash : str
        The 0x-prefixed, 66-character transaction hash to look up.
    from_chain : str
        Source chain key (``"ethereum"``, ``"polygon"``, ``"arbitrum"``,
        ``"bsc"``).  Used to select the correct RPC and explorer URL.

    Returns
    -------
    dict
        {
          "tx_hash":      str,
          "from_chain":   str,
          "status":       "pending" | "confirmed" | "failed" | "not_found",
          "confirmations": int,
          "block_number": int | None,
          "lz_scan_url":  str,   # https://layerzeroscan.com/tx/{tx_hash}
          "src_tx_url":   str,   # chain-specific block explorer URL
          "message":      str,   # human-readable status summary
        }

    Notes
    -----
    - Never raises — all exceptions are caught and reflected in the
      ``status`` / ``message`` fields so the API layer always gets a dict.
    - Confirmations are computed as ``latest_block - tx_block_number``.
      If the latest block cannot be fetched, confirmations defaults to 0.
    """
    chain_key = from_chain.lower().strip()

    # Build explorer URLs — fall back to a generic string if chain is unknown.
    lz_scan_url = f"https://layerzeroscan.com/tx/{tx_hash}"
    src_tx_url  = _SRC_TX_EXPLORER.get(chain_key, "").format(tx_hash) or f"#{tx_hash}"

    # Base result skeleton — overwritten as we learn more.
    result: dict = {
        "tx_hash":      tx_hash,
        "from_chain":   chain_key,
        "status":       "not_found",
        "confirmations": 0,
        "block_number": None,
        "lz_scan_url":  lz_scan_url,
        "src_tx_url":   src_tx_url,
        "message":      "Transaction not found on chain.",
    }

    try:
        rpc_url = _get_rpc_url(chain_key)
        w3 = AsyncWeb3(AsyncHTTPProvider(rpc_url))

        # ── Attempt to fetch the transaction receipt ─────────────────────────
        receipt = await w3.eth.get_transaction_receipt(tx_hash)

        if receipt is None:
            # Transaction is known to the mempool but not yet mined.
            result["status"]  = "pending"
            result["message"] = "Transaction is pending — not yet included in a block."
            return result

        # ── Receipt obtained — decode status ─────────────────────────────────
        block_number: int = receipt.get("blockNumber") or receipt.blockNumber
        result["block_number"] = block_number

        tx_status: int = receipt.get("status", -1)
        if tx_status == 1:
            result["status"]  = "confirmed"
            result["message"] = f"Transaction confirmed in block {block_number}."
        elif tx_status == 0:
            result["status"]  = "failed"
            result["message"] = f"Transaction reverted/failed in block {block_number}."
        else:
            # Pre-Byzantium receipts lack a status field — treat as confirmed.
            result["status"]  = "confirmed"
            result["message"] = f"Transaction included in block {block_number} (legacy receipt, no status field)."

        # ── Compute confirmations ─────────────────────────────────────────────
        try:
            latest_block: int = await w3.eth.block_number
            result["confirmations"] = max(0, latest_block - block_number)
        except Exception:
            result["confirmations"] = 0   # Non-fatal — just omit confirmation count.

    except Exception as exc:
        # RPC unreachable, bad tx hash format, network timeout, etc.
        err_msg = f"{type(exc).__name__}: {exc}"
        print(f"[bridge] get_bridge_status() error for {tx_hash} on {chain_key}: {err_msg}")
        # Return the skeleton with not_found + the error detail in message.
        result["status"]  = "not_found"
        result["message"] = f"Could not retrieve status: {err_msg}"

    return result
