/**
 * frontend/src/services/auth.js
 * ================================
 * Wallet ownership verification helpers.
 *
 * Flow
 * ----
 * 1. requestSignature()  — prompts MetaMask / RainbowKit to sign a challenge
 *                          message and returns the raw payload.
 * 2. verifyWithBackend() — POSTs that payload to POST /verify-wallet and
 *                          returns true only when the backend confirms the
 *                          signature is valid.
 *
 * The message text is read from REACT_APP_SIGN_MESSAGE so it stays in sync
 * with the backend's SIGN_MESSAGE env-var without hard-coding anything here.
 */

import api from "./api"; // re-uses the shared axios instance (base URL + X-API-Key)

// ---------------------------------------------------------------------------
// Challenge message
// ---------------------------------------------------------------------------

/**
 * The plain-text string the user will be asked to sign.
 * Must match SIGN_MESSAGE in backend/.env exactly — both sides use the same
 * string so ecrecover produces the expected signer address.
 */
const SIGN_MESSAGE =
  process.env.REACT_APP_SIGN_MESSAGE ||
  "Sign this to verify wallet ownership on SOVEREIGN Dashboard";

// ===========================================================================
// requestSignature
// ===========================================================================

/**
 * Ask the connected wallet to sign the challenge message.
 *
 * Wraps wagmi's ``signMessageAsync`` so the component only needs to pass the
 * function in — it does not need to know what message is being signed.
 *
 * @param {string}   address         - Connected Ethereum address (used only
 *                                     as metadata; the signer is whoever
 *                                     holds the private key).
 * @param {Function} signMessageAsync - ``signMessageAsync`` from wagmi's
 *                                     ``useSignMessage`` hook.
 * @returns {Promise<{ address: string, message: string, signature: string }>}
 *          The address, the signed message text, and the hex signature.
 *
 * @throws Will re-throw if the user rejects the signature request in MetaMask
 *         (error.code === 4001) or if signing fails for any other reason.
 *         The caller (App.js) is responsible for catching and surfacing the
 *         user-visible error message.
 */
export async function requestSignature(address, signMessageAsync) {
  // Ask MetaMask / WalletConnect to show the sign dialog
  const signature = await signMessageAsync({ message: SIGN_MESSAGE });

  return {
    address,
    message: SIGN_MESSAGE,
    signature,
  };
}

// ===========================================================================
// verifyWithBackend
// ===========================================================================

/**
 * Send the signed payload to the backend for EIP-191 ecrecover verification.
 *
 * The backend recovers the signer address from the signature and checks it
 * matches ``address``.  Returns ``true`` only when the backend responds with
 * ``{ verified: true }``.
 *
 * Uses the shared ``api`` axios instance, so:
 *   - baseURL  comes from REACT_APP_API_URL (defaults to localhost:8000)
 *   - X-API-Key comes from REACT_APP_API_KEY (matches backend SOVEREIGN_API_KEY)
 *
 * Never throws — any network error or 401 response resolves to ``false``.
 *
 * @param {string} address   - Ethereum address claiming ownership.
 * @param {string} message   - The plain-text message that was signed.
 * @param {string} signature - Hex-encoded personal_sign output (0x-prefixed).
 * @returns {Promise<boolean>} ``true`` if the backend confirms ownership.
 */
export async function verifyWithBackend(address, message, signature) {
  try {
    const response = await api.post("/verify-wallet", {
      address,
      message,
      signature,
    });

    // Backend returns { verified: true, address } on success
    return response.data?.verified === true;
  } catch (error) {
    // 401 Unauthorized (bad signature) or any network error → treat as invalid
    console.warn("[auth] Wallet verification failed:", error.message);
    return false;
  }
}
