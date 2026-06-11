/**
 * frontend/src/config/layerzero.js
 * ==================================
 * LayerZero V2 configuration for the SOVEREIGN / MultiChain Dashboard.
 *
 * References
 * ----------
 *   EndpointV2 (same address on all EVM chains):
 *   https://docs.layerzero.network/v2/developers/evm/technical-reference/deployed-contracts
 *
 *   LayerZero EIDs (Endpoint IDs):
 *   https://docs.layerzero.network/v2/developers/evm/technical-reference/layerzero-endpoint-ids
 *
 * Phase 4 scope
 * -------------
 *   EVM chains (Ethereum, Polygon, Arbitrum, BSC) are fully supported
 *   for OFT / bridge operations via the EndpointV2 contract.
 *
 *   NOTE: Solana bridge requires a separate implementation using the
 *   LayerZero Solana SDK and is out of scope for Phase 4.  The Solana
 *   EID is listed here for reference only.
 */

// ---------------------------------------------------------------------------
// EndpointV2 contract addresses
// LayerZero V2 deploys the same EndpointV2 address on every EVM chain.
// ---------------------------------------------------------------------------
export const LZ_ENDPOINTS = {
  ethereum: "0x1a44076050125825900e736c501f859c50fE728c",
  polygon:  "0x1a44076050125825900e736c501f859c50fE728c",
  arbitrum: "0x1a44076050125825900e736c501f859c50fE728c",
  bsc:      "0x1a44076050125825900e736c501f859c50fE728c",
  // Solana: not applicable — EndpointV2 is EVM-only.
  //         Use the LayerZero Solana SDK for Solana bridging (Phase 5+).
};

// ---------------------------------------------------------------------------
// LayerZero Endpoint IDs (EIDs)
// Unique numeric identifier for each chain inside the LayerZero messaging
// protocol.  Used as `dstEid` in SendParam when routing cross-chain messages.
// ---------------------------------------------------------------------------
export const LZ_EIDS = {
  ethereum: 30101,
  polygon:  30109,
  arbitrum: 30110,
  bsc:      30102,
  solana:   30168, // Listed for reference — Solana bridge is Phase 5+
};

// ---------------------------------------------------------------------------
// Supported chains for Phase 4 EVM bridging
// Solana is intentionally excluded until the Solana SDK is integrated.
// ---------------------------------------------------------------------------
export const SUPPORTED_CHAINS = ["ethereum", "polygon", "arbitrum", "bsc"];
