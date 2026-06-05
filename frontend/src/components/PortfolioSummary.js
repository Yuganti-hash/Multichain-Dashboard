/**
 * frontend/src/components/PortfolioSummary.js
 * =============================================
 * Displays a high-level snapshot of the wallet portfolio:
 *   - 4 stat cards (total value, token count, NFT count, active chains)
 *   - Risk assessment section with coloured badge and plain-English explanation
 *
 * Props:
 *   portfolio {Object} — full portfolio response from GET /portfolio/{wallet}
 *     Fields used: total_value_usd, risk_score, chain_breakdown,
 *                  wallet, tokens, nfts
 */

import React from "react";
import { formatUSD, getRiskBadgeStyle } from "../services/api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derive a risk explanation sentence from the risk_score string.
 *
 * @param {string} riskScore - "LOW" | "MEDIUM" | "HIGH"
 * @returns {string}
 */
function getRiskExplanation(riskScore) {
  switch ((riskScore || "").toUpperCase()) {
    case "HIGH":
      return "Concentrated on few chains. Consider diversifying.";
    case "MEDIUM":
      return "Moderate diversification across chains.";
    case "LOW":
      return "Well diversified. Low concentration risk.";
    default:
      return "Risk data unavailable.";
  }
}

/**
 * Shorten a wallet address for header display.
 *
 * @param {string} address
 * @returns {string}
 */
function shortAddress(address) {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// ===========================================================================
// Stat Card sub-component
// ===========================================================================

/**
 * Single metric card inside the stats grid.
 *
 * @param {{ label: string, value: string|number, sub: string, accent?: boolean }} props
 */
function StatCard({ label, value, sub, accent = false }) {
  return (
    <div
      className={`
        bg-gray-900 border border-gray-800 rounded-xl p-4
        ${accent ? "border-l-4 border-l-blue-500" : ""}
        transition-all duration-200 hover:border-gray-700
      `}
    >
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
        {label}
      </p>
      <p className="text-2xl font-bold text-white leading-tight">{value}</p>
      <p className="text-xs text-gray-500 mt-1">{sub}</p>
    </div>
  );
}

// ===========================================================================
// Main component
// ===========================================================================

/**
 * PortfolioSummary — portfolio header with stat cards and risk badge.
 *
 * @param {{ portfolio: Object }} props
 */
export default function PortfolioSummary({ portfolio }) {
  if (!portfolio) return null;

  const {
    total_value_usd = 0,
    risk_score      = "UNKNOWN",
    chain_breakdown = [],
    wallet          = "",
    tokens          = [],
    nfts            = [],
  } = portfolio;

  // Count chains that actually hold value
  const activeChainCount = chain_breakdown.filter(
    (c) => (c.value_usd || 0) > 0
  ).length;

  // Risk badge styles from api.js utility
  const badge = getRiskBadgeStyle(risk_score);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="mb-8">

      {/* ── Title row ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-white font-bold text-lg">Portfolio Overview</h2>
        {wallet && (
          <span className="text-gray-400 text-sm font-mono bg-gray-800 px-3 py-1 rounded-lg">
            {shortAddress(wallet)}
          </span>
        )}
      </div>

      {/* ── Stat cards grid ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">

        {/* Card 1 — Total portfolio value (accented left border) */}
        <StatCard
          label="Total Value"
          value={formatUSD(total_value_usd)}
          sub="Across all chains"
          accent={true}
        />

        {/* Card 2 — Distinct token count */}
        <StatCard
          label="Tokens Found"
          value={tokens.length}
          sub="Unique assets"
        />

        {/* Card 3 — NFT count */}
        <StatCard
          label="NFTs Found"
          value={nfts.length}
          sub="Collectibles"
        />

        {/* Card 4 — Number of chains with > $0 value */}
        <StatCard
          label="Active Chains"
          value={activeChainCount}
          sub="Networks"
        />
      </div>

      {/* ── Risk assessment section ────────────────────────────────────── */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between gap-4">

        {/* Left — label + explanation */}
        <div>
          <p className="text-sm font-semibold text-white">Risk Assessment</p>
          <p className="text-sm text-gray-400 mt-0.5">
            {getRiskExplanation(risk_score)}
          </p>
        </div>

        {/* Right — coloured risk badge pill */}
        <span
          className="flex-shrink-0 inline-block px-4 py-1.5 rounded-full text-sm font-bold uppercase tracking-wide"
          style={{
            backgroundColor: badge.backgroundColor,
            color:           badge.color,
          }}
        >
          {badge.label}
        </span>
      </div>

      {/* PRISM architecture context banner */}
      <div className="mt-4 bg-blue-950/30 border border-blue-800/20 rounded-xl p-3 flex items-center gap-3">
        <span className="text-blue-400 text-lg flex-shrink-0">⬡</span>
        <p className="text-xs text-gray-300 leading-relaxed">
          <span className="text-blue-400 font-semibold">Mini-PRISM Demo: </span>
          This dashboard aggregates your financial state independently of any
          single chain — mirroring SOVEREIGN's state-execution separation
          architecture. Assets tracked across{" "}
          <span className="text-white font-semibold">
            {chain_breakdown.filter(c => c.value_usd > 0).length} execution environments
          </span>.
        </p>
      </div>
    </div>
  );
}
