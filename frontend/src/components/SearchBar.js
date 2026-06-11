/**
 * frontend/src/components/SearchBar.js
 * ======================================
 * Wallet address search input with client-side validation.
 *
 * Accepts EVM addresses (0x…, 42 chars) and Solana base58 addresses (32–44 chars).
 * Passes validated addresses up to the parent via the `onSearch` callback.
 *
 * Props:
 *   onSearch {Function} — called with the trimmed, validated address string
 *   loading  {boolean}  — disables the input and shows a spinner while fetching
 */

import React, { useState, useEffect } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";

// ---------------------------------------------------------------------------
// Validation helper
// ---------------------------------------------------------------------------

/**
 * Validate a wallet address string.
 *
 * Rules:
 *   - Must not be empty.
 *   - EVM (starts with "0x")  → must be exactly 42 characters.
 *   - Solana (no "0x" prefix) → must be 32–44 characters (base58).
 *
 * @param {string} address - Raw address input.
 * @returns {string|null}  Error message, or null if valid.
 */
function validateAddress(address) {
  const trimmed = address.trim();

  if (!trimmed) {
    return "Please enter a wallet address";
  }

  if (trimmed.startsWith("0x")) {
    // EVM address — must be exactly 42 chars (0x + 40 hex digits)
    if (trimmed.length !== 42) {
      return "Invalid Ethereum/Polygon/BSC address (must be 42 chars)";
    }
    return null;
  }

  // Solana — base58 encoded public key, 32–44 characters, no 0x prefix
  if (trimmed.length < 32) {
    return "Invalid Solana address (must be at least 32 characters)";
  }

  return null; // Valid
}

// ===========================================================================
// Component
// ===========================================================================

/**
 * SearchBar component — renders an address input with validation and submit.
 *
 * @param {{ onSearch: Function, loading: boolean, signLoading: boolean }} props
 */
export default function SearchBar({ onSearch, loading, signLoading }) {
  const [inputValue,      setInputValue]      = useState("");
  const [validationError, setValidationError] = useState(null);

  // ── Wallet connection ──────────────────────────────────────────────────────
  const { address: connectedAddress, isConnected } = useAccount();

  /**
   * Auto-fill the search input whenever a wallet connects or the
   * connected address changes.  Clear the field if the wallet disconnects.
   */
  useEffect(() => {
    if (isConnected && connectedAddress) {
      setInputValue(connectedAddress);
      setValidationError(null);
    } else if (!isConnected) {
      setInputValue("");
    }
  }, [isConnected, connectedAddress]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSubmit = () => {
    const error = validateAddress(inputValue);
    if (error) {
      setValidationError(error);
      return;
    }
    setValidationError(null);
    onSearch(inputValue.trim());
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSubmit();
  };

  const handleChange = (e) => {
    setInputValue(e.target.value);
    // Clear validation error as the user types
    if (validationError) setValidationError(null);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto mb-8">
      {/* ── Header row: title + ConnectButton (top-right) ──────────────── */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-white font-bold text-lg">Search Wallet</h2>

        {/* Wallet connect controls */}
        <div className="flex items-center gap-3">
          {/* Green dot + "Connected" badge — only shown when wallet is live */}
          {isConnected && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-green-400">
              <span
                className="relative flex h-2 w-2"
                aria-hidden="true"
              >
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              Connected
            </span>
          )}

          {/* RainbowKit connect / account button — disabled while sign is pending */}
          <div
            style={signLoading ? { pointerEvents: "none", opacity: 0.5 } : undefined}
            title={signLoading ? "Awaiting wallet signature…" : undefined}
          >
            <ConnectButton
              showBalance={false}
              chainStatus="none"
              accountStatus="address"
            />
          </div>
        </div>
      </div>

      {/* Input row */}
      <div className="flex gap-3">
        {/* Address input */}
        <input
          type="text"
          value={inputValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Enter wallet address (ETH, Polygon, BSC, or Solana)"
          disabled={loading || signLoading}
          className={`
            flex-1 bg-gray-800 border rounded-xl px-4 py-3
            text-white placeholder-gray-500 text-sm
            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-all duration-200
            ${validationError ? "border-red-500" : "border-gray-700"}
          `}
        />

        {/* Search button */}
        <button
          onClick={handleSubmit}
          disabled={loading || signLoading}
          title={signLoading ? "Awaiting wallet signature…" : undefined}
          className="
            bg-blue-600 hover:bg-blue-500 active:bg-blue-700
            text-white font-semibold px-6 py-3 rounded-xl
            disabled:opacity-50 disabled:cursor-not-allowed
            flex items-center gap-2 transition-all duration-200
            whitespace-nowrap
          "
        >
          {loading ? (
            <>
              {/* Animated border spinner */}
              <span
                className="inline-block w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin"
                aria-hidden="true"
              />
              Searching...
            </>
          ) : (
            <>
              {/* Search icon */}
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              Search
            </>
          )}
        </button>
      </div>

      {/* Validation error */}
      {validationError && (
        <p className="mt-2 text-sm text-red-400 flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          {validationError}
        </p>
      )}

      {/* Hint row */}
      <p className="mt-2 text-xs text-gray-500">
        Supports: Ethereum &bull; Polygon &bull; BNB Chain &bull; Solana
      </p>
    </div>
  );
}
