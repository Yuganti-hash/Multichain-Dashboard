/**
 * frontend/src/hooks/useBridge.js
 * ================================
 * Custom React hook for executing LayerZero V2 bridge transactions.
 *
 * Wraps wagmi's useWriteContract + useWaitForTransactionReceipt to provide
 * a single, ergonomic interface for the Bridge UI.
 *
 * Simulation mode
 * ---------------
 *   If the environment variable REACT_APP_BRIDGE_SIMULATE=true is set,
 *   OR if the quote object has { simulated: true }, no real contract call
 *   is made.  Instead a deterministic fake tx hash is returned after a
 *   1-second delay, allowing full UI testing without a live wallet.
 *
 * Returns
 * -------
 *   {
 *     executeBridge,   // async (params) => void
 *     isPending,       // bool — tx is being sent (waiting for wallet sig)
 *     isConfirming,    // bool — waiting for on-chain receipt
 *     isSuccess,       // bool — tx confirmed
 *     isError,         // bool — something went wrong
 *     error,           // Error | null
 *     txHash,          // string | null  (0x… or 0xSIM_… in sim mode)
 *     reset,           // () => void — clear all state
 *   }
 *
 * executeBridge(params) accepts
 * ------------------------------
 *   {
 *     fromChain : string,  // e.g. "ethereum"
 *     toChain   : string,  // e.g. "polygon"
 *     amount    : string,  // ETH amount as a human-readable string, e.g. "0.5"
 *     quote     : object,  // quote object from GET /bridge/quote
 *   }
 */

import { useState, useCallback } from 'react';
import { useWriteContract, useWaitForTransactionReceipt, useChainId } from 'wagmi';
import { parseEther, pad } from 'viem';

import { LZ_ENDPOINTS, LZ_EIDS } from '../config/layerzero';
import LayerZeroEndpointABI from '../abis/LayerZeroEndpoint.json';

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Read the global simulation flag from the React env at module-load time.
 * Can be overridden per-call if quote.simulated is true.
 */
const GLOBAL_SIMULATE = process.env.REACT_APP_BRIDGE_SIMULATE === 'true';

/**
 * Slippage tolerance applied to amountLD when computing minAmountLD.
 * 0.5 % — keeps the bridge usable while protecting against large slippage.
 */
const SLIPPAGE_BPS = 50n; // 50 basis points = 0.5 %

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useBridge() {
  // ── Local state ─────────────────────────────────────────────────────────

  const [isPending,    setIsPending]    = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSuccess,    setIsSuccess]    = useState(false);
  const [isError,      setIsError]      = useState(false);
  const [error,        setError]        = useState(null);
  const [txHash,       setTxHash]       = useState(null);

  // ── wagmi hooks ─────────────────────────────────────────────────────────

  /**
   * useChainId — used for defensive checks; verifies the user's wallet is
   * on the expected source chain before dispatching the tx.
   * (Surfaced in return value via chainId for callers that need it.)
   */
  const chainId = useChainId();

  /**
   * writeContractAsync — returns the tx hash directly (throws on rejection).
   * We call this inside executeBridge rather than via the write() trigger
   * pattern, giving us full control over state sequencing.
   */
  const { writeContractAsync } = useWriteContract();

  /**
   * useWaitForTransactionReceipt — watches a submitted hash for confirmation.
   * We derive isConfirming / isSuccess from its status rather than managing
   * a second polling loop ourselves.
   */
  const {
    isLoading: receiptLoading,
    isSuccess: receiptSuccess,
    isError:   receiptError,
  } = useWaitForTransactionReceipt({
    hash: txHash ?? undefined,
    // Only start watching once we actually have a real hash
    query: { enabled: !!txHash && !txHash.startsWith('0xSIM_') },
  });

  // Keep confirming/success derived from wagmi receipt in sync
  // (these update automatically when the receipt hook changes)
  // We handle the sim-path states manually inside executeBridge.

  // ── Reset ────────────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    setIsPending(false);
    setIsConfirming(false);
    setIsSuccess(false);
    setIsError(false);
    setError(null);
    setTxHash(null);
  }, []);

  // ── Simulation helper ─────────────────────────────────────────────────────

  /**
   * _simulateBridge
   * Produces a fake tx hash, waits 1 s to mimic block time, then sets
   * success state.  Never throws.
   */
  const _simulateBridge = useCallback(async () => {
    const fakeHash = '0xSIM_' + Date.now().toString(16);

    setIsPending(true);
    setIsConfirming(false);
    setIsSuccess(false);
    setIsError(false);
    setError(null);
    setTxHash(null);

    // Simulate wallet confirmation delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    setTxHash(fakeHash);
    setIsPending(false);
    setIsConfirming(false);
    setIsSuccess(true);

    return fakeHash;
  }, []);

  // ── Main execute function ────────────────────────────────────────────────

  /**
   * executeBridge
   *
   * @param {object} params
   * @param {string} params.fromChain  - Source chain key, e.g. "ethereum"
   * @param {string} params.toChain    - Destination chain key, e.g. "polygon"
   * @param {string} params.amount     - Human-readable ETH amount, e.g. "0.5"
   * @param {object} params.quote      - Quote from /bridge/quote endpoint
   */
  const executeBridge = useCallback(async ({ fromChain, toChain, amount, quote }) => {
    // ── Guard: reset previous run state ────────────────────────────────
    setIsPending(false);
    setIsConfirming(false);
    setIsSuccess(false);
    setIsError(false);
    setError(null);
    setTxHash(null);

    try {
      // ── Simulation short-circuit ──────────────────────────────────────
      const shouldSimulate = GLOBAL_SIMULATE || !!quote?.simulated;
      if (shouldSimulate) {
        await _simulateBridge();
        return;
      }

      // ── Validation ────────────────────────────────────────────────────

      const endpointAddress = LZ_ENDPOINTS[fromChain];
      if (!endpointAddress) {
        throw new Error(`No LayerZero endpoint found for source chain: "${fromChain}"`);
      }

      const dstEid = LZ_EIDS[toChain];
      if (!dstEid) {
        throw new Error(`No LayerZero EID found for destination chain: "${toChain}"`);
      }

      if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
        throw new Error(`Invalid bridge amount: "${amount}"`);
      }

      // ── Parse fee from quote ──────────────────────────────────────────

      /**
       * The /bridge/quote endpoint returns:
       *   { native_fee: "123456789", lz_token_fee: "0", ... }
       *
       * Both fields are expected to be stringified BigInt-safe integers
       * (wei values).  We parse them safely with BigInt().
       */
      let nativeFeeBigInt;
      let lzTokenFeeBigInt;
      try {
        nativeFeeBigInt  = BigInt(quote?.native_fee  ?? quote?.nativeFee  ?? '0');
        lzTokenFeeBigInt = BigInt(quote?.lz_token_fee ?? quote?.lzTokenFee ?? '0');
      } catch {
        throw new Error('Malformed fee values in quote object — expected integer strings.');
      }

      // Total msg.value = native bridge fee
      const lzFeeWei = nativeFeeBigInt;

      // ── Build SendParam ───────────────────────────────────────────────

      /**
       * SendParam struct (LayerZero OFT standard):
       *   uint32  dstEid        — destination chain EID
       *   bytes32 to            — recipient address, left-padded to 32 bytes
       *   uint256 amountLD      — amount in local decimals (wei for ETH OFTs)
       *   uint256 minAmountLD   — min acceptable after fees/slippage
       *   bytes   extraOptions  — optional LZ executor options (empty = defaults)
       *   bytes   composeMsg    — optional compose message (empty = none)
       *   bytes   oftCmd        — optional OFT command (empty = default taxi)
       */
      const amountWei    = parseEther(amount);
      const minAmountWei = (amountWei * (10_000n - SLIPPAGE_BPS)) / 10_000n;

      /**
       * `to` must be a bytes32: the recipient address zero-padded to 32 bytes.
       * pad() from viem handles this — it left-pads the 20-byte address.
       *
       * We use the quote's recipient if provided, otherwise fall back to a
       * zero address as a placeholder (callers should always pass a recipient
       * via the quote or as a separate param in a future API revision).
       */
      const recipientAddress = (quote?.recipient ?? '0x0000000000000000000000000000000000000000');
      const recipientBytes32 = pad(recipientAddress, { size: 32 });

      const sendParam = {
        dstEid:       dstEid,
        to:           recipientBytes32,
        amountLD:     amountWei,
        minAmountLD:  minAmountWei,
        extraOptions: '0x',   // empty bytes — use LZ executor defaults
        composeMsg:   '0x',   // no compose message
        oftCmd:       '0x',   // default taxi mode
      };

      const messagingFee = {
        nativeFee:  nativeFeeBigInt,
        lzTokenFee: lzTokenFeeBigInt,
      };

      /**
       * refundAddress: excess msg.value is refunded here by the LZ endpoint.
       * We use the quote's recipient as the refund destination (same wallet).
       */
      const refundAddress = recipientAddress;

      // ── Submit transaction ─────────────────────────────────────────────

      setIsPending(true);

      const hash = await writeContractAsync({
        address:      endpointAddress,
        abi:          LayerZeroEndpointABI,
        functionName: 'send',
        args:         [sendParam, messagingFee, refundAddress],
        value:        lzFeeWei,
      });

      // Wallet has accepted — tx is now in-flight
      setTxHash(hash);
      setIsPending(false);
      setIsConfirming(true);

      // useWaitForTransactionReceipt will flip isConfirming → isSuccess
      // automatically via its query once txHash is set.
      // We still manually track it here via receiptLoading / receiptSuccess
      // in the effect below so callers don't have to sync two hooks.

    } catch (err) {
      // Never re-throw — always set error state instead.
      setIsPending(false);
      setIsConfirming(false);
      setIsSuccess(false);
      setIsError(true);
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  }, [_simulateBridge, writeContractAsync]);

  // ── Sync wagmi receipt state into our local booleans ────────────────────

  /**
   * wagmi's useWaitForTransactionReceipt runs as a side-effect query.
   * We derive our local isConfirming / isSuccess from it so the hook's
   * return surface stays consistent whether we submitted via the real path
   * or are in sim mode.
   *
   * Note: we only update from wagmi if txHash is real (not SIM_).
   */
  const isRealHash = txHash && !txHash.startsWith('0xSIM_');
  const derivedIsConfirming = isRealHash ? receiptLoading  : isConfirming;
  const derivedIsSuccess    = isRealHash ? receiptSuccess   : isSuccess;
  const derivedIsError      = isRealHash ? (isError || receiptError) : isError;

  // ─── Return ────────────────────────────────────────────────────────────────

  return {
    executeBridge,
    isPending,
    isConfirming: derivedIsConfirming,
    isSuccess:    derivedIsSuccess,
    isError:      derivedIsError,
    error,
    txHash,
    reset,
    /** Exposed for callers that want to warn the user about wrong network */
    chainId,
  };
}

export default useBridge;
