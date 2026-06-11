"""
backend/utils/layerzero.py
===========================
LayerZero V2 configuration helpers for the SOVEREIGN / MultiChain Dashboard.

Provides pure config-and-formatting utilities used by Phase 4 bridge
endpoints.  No on-chain calls are made here — this module is intentionally
kept free of web3 / async dependencies so it can be imported from anywhere.

Phase 4 scope
-------------
  Only EVM chains (Ethereum, Polygon, Arbitrum, BSC) are supported.
  Solana bridging requires the LayerZero Solana SDK and is deferred to
  Phase 5+.  The Solana EID constant is included for reference only.

References
----------
  EndpointV2 deployment addresses:
  https://docs.layerzero.network/v2/developers/evm/technical-reference/deployed-contracts

  LayerZero EIDs (Endpoint IDs):
  https://docs.layerzero.network/v2/developers/evm/technical-reference/layerzero-endpoint-ids

  SendParam struct (IOFT interface):
  https://docs.layerzero.network/v2/developers/evm/oft/quickstart
"""

from __future__ import annotations

# ---------------------------------------------------------------------------
# EndpointV2 contract addresses
# LayerZero V2 uses the same EndpointV2 address on every EVM chain.
# ---------------------------------------------------------------------------
LZ_ENDPOINTS: dict[str, str] = {
    "ethereum": "0x1a44076050125825900e736c501f859c50fE728c",
    "polygon":  "0x1a44076050125825900e736c501f859c50fE728c",
    "arbitrum": "0x1a44076050125825900e736c501f859c50fE728c",
    "bsc":      "0x1a44076050125825900e736c501f859c50fE728c",
    # Solana: not applicable — EndpointV2 is EVM-only.
    # Use the LayerZero Solana SDK for Solana bridging (Phase 5+).
}

# ---------------------------------------------------------------------------
# LayerZero Endpoint IDs (EIDs)
# Numeric identifier used as `dstEid` in SendParam to route messages.
# ---------------------------------------------------------------------------
LZ_EIDS: dict[str, int] = {
    "ethereum": 30101,
    "polygon":  30109,
    "arbitrum": 30110,
    "bsc":      30102,
    "solana":   30168,  # Reference only — Solana bridge is Phase 5+
}

# EVM-only chains supported in Phase 4
SUPPORTED_EVM_CHAINS: list[str] = ["ethereum", "polygon", "arbitrum", "bsc"]


# ---------------------------------------------------------------------------
# Config helpers
# ---------------------------------------------------------------------------

def get_lz_endpoint(chain: str) -> str:
    """Return the LayerZero V2 EndpointV2 address for the given EVM chain.

    Parameters
    ----------
    chain : str
        Chain identifier, e.g. ``"ethereum"``, ``"arbitrum"``.

    Returns
    -------
    str
        Checksummed EndpointV2 contract address.

    Raises
    ------
    ValueError
        If *chain* is not in ``LZ_ENDPOINTS`` (e.g. ``"solana"``).
    """
    address = LZ_ENDPOINTS.get(chain)
    if address is None:
        supported = ", ".join(sorted(LZ_ENDPOINTS))
        raise ValueError(
            f"No LayerZero EndpointV2 address for chain '{chain}'. "
            f"Supported EVM chains: {supported}. "
            f"Solana bridging requires the LZ Solana SDK (Phase 5+)."
        )
    return address


def get_lz_eid(chain: str) -> int:
    """Return the LayerZero Endpoint ID (EID) for the given chain.

    Parameters
    ----------
    chain : str
        Chain identifier, e.g. ``"ethereum"``, ``"solana"``.

    Returns
    -------
    int
        LayerZero EID used as ``dstEid`` in a ``SendParam`` struct.

    Raises
    ------
    ValueError
        If *chain* is not a recognised LayerZero chain.
    """
    eid = LZ_EIDS.get(chain)
    if eid is None:
        supported = ", ".join(sorted(LZ_EIDS))
        raise ValueError(
            f"No LayerZero EID for chain '{chain}'. "
            f"Known chains: {supported}."
        )
    return eid


# ---------------------------------------------------------------------------
# SendParam formatter
# ---------------------------------------------------------------------------

def format_send_param(
    to_address: str,
    dst_eid: int,
    amount_wei: int,
    min_amount_wei: int,
    extra_options: bytes = b"",
    compose_msg: bytes = b"",
    oft_cmd: bytes = b"",
) -> dict:
    """Build a ``SendParam`` struct dict for a LayerZero V2 OFT send call.

    The dict mirrors the Solidity ``SendParam`` struct defined in the
    ``IOFT`` interface and is compatible with web3.py's tuple encoding
    when passed to an ABI-encoded contract call.

    Parameters
    ----------
    to_address : str
        Recipient address on the destination chain (EVM hex string or
        Solana base58).  **Must** be zero-padded to 32 bytes (``bytes32``).
        Pass a standard ``0x…`` EVM address — this function handles padding.
    dst_eid : int
        LayerZero destination Endpoint ID.  Use :func:`get_lz_eid` to
        retrieve the correct value for a chain name.
    amount_wei : int
        Token amount to send in the token's local decimals (wei for ERC-20).
    min_amount_wei : int
        Minimum acceptable amount after slippage on the destination side.
        Must be ``<= amount_wei``.
    extra_options : bytes, optional
        Encoded executor options (gas limit, airdrop, etc.).
        Defaults to empty bytes — the executor uses its default settings.
    compose_msg : bytes, optional
        Optional composed message payload for ``lzCompose`` callbacks.
        Defaults to empty bytes (no compose).
    oft_cmd : bytes, optional
        OFT-specific command bytes (e.g. for ``OFTAdapter``).
        Defaults to empty bytes.

    Returns
    -------
    dict
        A dict with keys matching the ``SendParam`` struct fields, ready
        to be passed as a tuple argument to a web3.py contract function.

    Raises
    ------
    ValueError
        If *to_address* is not a valid hex address, or if
        ``min_amount_wei > amount_wei``.

    Examples
    --------
    >>> param = format_send_param(
    ...     to_address="0xAbCd…",
    ...     dst_eid=get_lz_eid("arbitrum"),
    ...     amount_wei=10**18,
    ...     min_amount_wei=99 * 10**16,
    ... )
    >>> param["dstEid"]
    30110
    """
    # ── Validation ──────────────────────────────────────────────────────────
    if min_amount_wei > amount_wei:
        raise ValueError(
            f"min_amount_wei ({min_amount_wei}) must be <= "
            f"amount_wei ({amount_wei})."
        )

    # ── Normalise address → bytes32 ──────────────────────────────────────────
    # Strip "0x" prefix, left-pad to 32 bytes (64 hex chars).
    clean = to_address.lower().removeprefix("0x")
    if len(clean) > 40:
        raise ValueError(
            f"to_address '{to_address}' is longer than 20 bytes; "
            "expected a standard EVM address."
        )
    to_bytes32 = bytes.fromhex(clean.zfill(64))  # 32-byte zero-padded

    # ── Build struct dict ────────────────────────────────────────────────────
    return {
        "dstEid":       dst_eid,
        "to":           to_bytes32,
        "amountLD":     amount_wei,
        "minAmountLD":  min_amount_wei,
        "extraOptions": extra_options,
        "composeMsg":   compose_msg,
        "oftCmd":       oft_cmd,
    }
