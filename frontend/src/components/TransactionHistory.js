/**
 * frontend/src/components/TransactionHistory.js
 * ===============================================
 * Renders a list of recent Ethereum transactions with relative timestamps,
 * shortened addresses/hashes, ETH value, and a link to Etherscan.
 *
 * Props:
 *   transactions {Array}   — list of transaction objects from GET /transactions/{wallet}
 *   loading      {boolean} — shows skeleton rows while data is being fetched
 *
 * Each transaction object:
 *   { hash, from, to, value_eth, timestamp, chain, explorer_url }
 */

import React from "react";

// ---------------------------------------------------------------------------
// Helper: relative time from an ISO-8601 timestamp string
// ---------------------------------------------------------------------------

/**
 * Convert an ISO-8601 timestamp to a human-friendly "time ago" string.
 *
 * @param {string} timestamp — ISO-8601 date string, e.g. "2024-03-15T10:23:00.000Z"
 * @returns {string}
 */
function formatTimeAgo(timestamp) {
  if (!timestamp) return "Unknown time";

  try {
    const date    = new Date(timestamp);
    const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);

    if (diffSec < 0)      return "Just now";
    if (diffSec < 60)     return "Just now";
    if (diffSec < 3600)   return `${Math.floor(diffSec / 60)} minutes ago`;
    if (diffSec < 86400)  return `${Math.floor(diffSec / 3600)} hours ago`;
    return `${Math.floor(diffSec / 86400)} days ago`;
  } catch {
    return "Unknown time";
  }
}

// ---------------------------------------------------------------------------
// Helper: shorten a tx hash
// ---------------------------------------------------------------------------

/**
 * Abbreviate a transaction hash for display.
 * e.g. "0x3f9a1b...c4d2e1"
 *
 * @param {string} hash
 * @returns {string}
 */
function shortHash(hash) {
  if (!hash) return "—";
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

// ---------------------------------------------------------------------------
// Helper: shorten a wallet address
// ---------------------------------------------------------------------------

/**
 * Abbreviate a wallet address for display.
 * e.g. "0x1234...abcd"
 *
 * @param {string} addr
 * @returns {string}
 */
function shortAddress(addr) {
  if (!addr) return "—";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// Transfer icon SVG (neutral ↔ direction)
// ---------------------------------------------------------------------------

function TransferIcon() {
  return (
    <svg
      className="w-4 h-4 text-blue-400"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Skeleton row for loading state
// ---------------------------------------------------------------------------

function SkeletonRow() {
  return (
    <div className="animate-pulse bg-gray-800 rounded-lg h-12 mb-2" />
  );
}

// ===========================================================================
// Main component
// ===========================================================================

/**
 * TransactionHistory — list of recent transactions with Etherscan links.
 *
 * @param {{ transactions: Array, loading: boolean }} props
 */
export default function TransactionHistory({ transactions, loading }) {
  const txList = transactions || [];

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">

      {/* ── Title row ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-bold text-base">Recent Transactions</h3>
        {!loading && (
          <span className="text-gray-500 text-sm">
            {txList.length} transaction{txList.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* ── Loading skeleton ─────────────────────────────────────────── */}
      {loading && (
        <div>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────────────────── */}
      {!loading && txList.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          {/* Document / receipt icon */}
          <svg
            className="w-14 h-14 text-gray-700 mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <p className="text-gray-400 font-medium">No transactions found</p>
          <p className="text-gray-600 text-sm mt-1">
            Only Ethereum transactions are currently tracked
          </p>
        </div>
      )}

      {/* ── Transaction list ─────────────────────────────────────────── */}
      {!loading && txList.length > 0 && (
        <div className="divide-y divide-gray-800">
          {txList.map((tx, idx) => (
            <div
              key={tx.hash || idx}
              className="flex items-center justify-between gap-4 py-3 hover:bg-gray-800/30 transition-colors duration-100 -mx-2 px-2 rounded-lg"
            >
              {/* ── Left group: icon + tx info ─────────────────────── */}
              <div className="flex items-center gap-3 min-w-0">
                {/* Icon circle */}
                <div className="w-9 h-9 rounded-full bg-gray-800 flex items-center justify-center flex-shrink-0">
                  <TransferIcon />
                </div>

                {/* Tx hash + chain badge + time */}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-mono text-sm">
                      {shortHash(tx.hash)}
                    </span>
                    {/* Chain badge */}
                    <span className="bg-blue-900/50 text-blue-400 text-xs px-2 py-0.5 rounded font-medium flex-shrink-0">
                      {tx.chain
                        ? tx.chain.charAt(0).toUpperCase() + tx.chain.slice(1)
                        : "Ethereum"}
                    </span>
                  </div>
                  <p className="text-gray-500 text-xs mt-0.5">
                    {formatTimeAgo(tx.timestamp)}
                  </p>
                </div>
              </div>

              {/* ── Middle: from → to addresses (hidden on small screens) ── */}
              <div className="hidden md:flex items-center gap-1.5 text-gray-400 text-xs font-mono flex-shrink-0">
                <span>{shortAddress(tx.from)}</span>
                <span className="text-gray-600">→</span>
                <span>{shortAddress(tx.to)}</span>
              </div>

              {/* ── Right group: ETH value + explorer link ────────────── */}
              <div className="text-right flex-shrink-0">
                <p className="text-white font-semibold text-sm">
                  {tx.value_eth != null ? tx.value_eth : "0"} ETH
                </p>
                {tx.explorer_url && (
                  <a
                    href={tx.explorer_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 text-xs transition-colors duration-100"
                  >
                    View ↗
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
