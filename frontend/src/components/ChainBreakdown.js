/**
 * frontend/src/components/ChainBreakdown.js
 * ===========================================
 * Displays a grid showing per-chain portfolio value, percentage share,
 * animated progress bar, and a live chain health badge sourced from the
 * real-time /chain-health API.
 *
 * Props:
 *   chainBreakdown {Array}  — list of { chain, value_usd, percentage }
 *                              from GET /portfolio/{wallet}
 *   chainHealth    {Object} — live health map from portfolio.chain_health
 *                              { ethereum: { is_healthy, latency_ms, ... }, ... }
 */

import React from "react";
import { getChainLabel, formatUSD } from "../services/api";

// ---------------------------------------------------------------------------
// Chain visual config — icon glyph and Tailwind gradient per chain
// ---------------------------------------------------------------------------

const CHAIN_CONFIG = {
  ethereum: { icon: "Ξ",  gradient: "from-blue-600 to-blue-400"      },
  polygon:  { icon: "⬡",  gradient: "from-purple-600 to-purple-400"  },
  bsc:      { icon: "⬡",  gradient: "from-yellow-500 to-yellow-300"  },
  solana:   { icon: "◎",  gradient: "from-purple-500 to-pink-400"    },
  arbitrum: { icon: "A",  gradient: "from-sky-600 to-sky-400"         },
};

// Canonical display order — always render all 5 chains
const CHAIN_ORDER = ["ethereum", "polygon", "bsc", "solana", "arbitrum"];

// ---------------------------------------------------------------------------
// ChainCard sub-component
// ---------------------------------------------------------------------------

/**
 * Single chain card showing icon, value, percentage pill, progress bar,
 * and a live health badge sourced from the real-time chain health API.
 *
 * @param {{ chain: string, value_usd: number, percentage: number, healthData: Object|null }} props
 */
function ChainCard({ chain, value_usd, percentage, healthData }) {
  const config      = CHAIN_CONFIG[chain] || { icon: "?", gradient: "from-gray-600 to-gray-400" };
  const isActive    = value_usd > 0;
  const safePercent = Math.min(100, Math.max(0, percentage || 0));

  // ── Live health fields (safe if chainHealth not yet available) ─────────
  const isHealthy = healthData?.is_healthy ?? null;   // null = no data yet
  const latencyMs = healthData?.latency_ms  ?? null;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-all duration-200">

      {/* ── Top row: icon + health badge ────────────────────── */}
      <div className="flex justify-between items-start mb-3">

        {/* Chain icon circle */}
        <div
          className={`w-10 h-10 rounded-full bg-gradient-to-br ${config.gradient} flex items-center justify-center text-white font-bold text-lg select-none`}
        >
          {config.icon}
        </div>

        {/* Health badge — Live / Degraded / percentage pill */}
        <div className="flex flex-col items-end gap-1">
          {isHealthy === true && (
            <span
              title={latencyMs !== null ? `${Math.round(latencyMs)}ms latency` : 'Healthy'}
              style={{
                fontSize: '10px',
                fontWeight: 600,
                padding: '1px 6px',
                borderRadius: '9999px',
                backgroundColor: '#14532d44',
                border: '1px solid #22c55e55',
                color: '#22c55e',
                cursor: 'default',
                whiteSpace: 'nowrap',
              }}
            >
              Live ✅
            </span>
          )}
          {isHealthy === false && (
            <span
              title={latencyMs !== null ? `${Math.round(latencyMs)}ms latency` : 'Degraded'}
              style={{
                fontSize: '10px',
                fontWeight: 600,
                padding: '1px 6px',
                borderRadius: '9999px',
                backgroundColor: '#7c150044',
                border: '1px solid #ef444455',
                color: '#ef4444',
                cursor: 'default',
                whiteSpace: 'nowrap',
              }}
            >
              Degraded ⚠️
            </span>
          )}

          {/* Percentage pill */}
          {isActive ? (
            <span className="bg-gray-800 text-gray-300 text-xs px-2 py-0.5 rounded-full font-medium">
              {safePercent.toFixed(1)}%
            </span>
          ) : (
            <span className="text-gray-600 text-xs">—</span>
          )}
        </div>
      </div>

      {/* ── Chain label ────────────────────────────────────────── */}
      <p className="text-white font-semibold text-sm mt-1">
        {getChainLabel(chain)}
      </p>

      {/* ── USD value ────────────────────────────────────────── */}
      <p className={`text-xl font-bold mt-0.5 ${isActive ? "text-white" : "text-gray-600"}`}>
        {isActive ? formatUSD(value_usd) : "$0.00"}
      </p>

      {/* ── Progress bar ────────────────────────────────────────── */}
      <div className="mt-3 w-full bg-gray-800 rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full bg-gradient-to-r ${config.gradient} transition-all duration-500`}
          style={{ width: `${safePercent}%`, minWidth: safePercent > 0 ? "4px" : "0" }}
        />
      </div>

      {/* ── Latency subtitle (when live data is available) ────────────── */}
      {latencyMs !== null && latencyMs > 0 ? (
        <p className="text-xs mt-1" style={{
          color: latencyMs < 1000 ? '#22c55e'
               : latencyMs < 2000 ? '#f59e0b'
               : '#ef4444',
        }}>
          {Math.round(latencyMs).toLocaleString('en-US')}ms latency
        </p>
      ) : (
        <p className={`text-xs mt-1 ${isActive ? "text-gray-400" : "text-gray-600"}`}>
          {isActive ? "Active" : "No assets"}
        </p>
      )}
    </div>
  );
}

// ===========================================================================
// Main component
// ===========================================================================

/**
 * ChainBreakdown — renders the 5-chain value + health grid.
 *
 * Guarantees all 5 chains are always shown by merging incoming data with
 * zero-value defaults, then sorting into the canonical CHAIN_ORDER.
 *
 * @param {{ chainBreakdown: Array, chainHealth: Object }} props
 */
export default function ChainBreakdown({ chainBreakdown = [], chainHealth = {} }) {

  // Build a lookup of incoming data keyed by chain id
  const dataMap = Object.fromEntries(
    (chainBreakdown || []).map((c) => [c.chain, c])
  );

  // Always render all 5 chains; fill missing ones with zero-value defaults
  const normalised = CHAIN_ORDER.map((chainId) =>
    dataMap[chainId] || { chain: chainId, value_usd: 0, percentage: 0 }
  );

  return (
    <div>
      <h3 className="text-white font-bold text-base mb-4">Chain Breakdown</h3>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {normalised.map((item) => (
          <ChainCard
            key={item.chain}
            chain={item.chain}
            value_usd={item.value_usd}
            percentage={item.percentage}
            healthData={chainHealth?.[item.chain] ?? null}
          />
        ))}
      </div>
    </div>
  );
}
