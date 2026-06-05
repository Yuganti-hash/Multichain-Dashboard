/**
 * frontend/src/components/BarChart.js
 * =====================================
 * Horizontal bar chart showing the top 10 tokens by USD value.
 * Bars are coloured by chain using getChainColor, with a custom tooltip.
 *
 * Props:
 *   data   {Array}  — flat token list from portfolio response
 *   prices {Object} — symbol → USD price map (optional)
 */

import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { getChainColor, getChainLabel, formatUSD } from "../services/api";

// ---------------------------------------------------------------------------
// Custom Tooltip — shown on bar hover
// ---------------------------------------------------------------------------

/**
 * Custom Recharts tooltip for the bar chart.
 * Receives `active`, `payload` from Recharts internally.
 */
function CustomBarTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;

  const entry = payload[0]?.payload || {};
  const chainColor = getChainColor(entry.chain);

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 shadow-xl">
      {/* Token symbol */}
      <p className="text-white font-semibold text-sm mb-1">{entry.symbol}</p>

      {/* Chain label with coloured dot */}
      <div className="flex items-center gap-1.5 mb-1">
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: chainColor }}
        />
        <span className="text-gray-400 text-xs">{getChainLabel(entry.chain)}</span>
      </div>

      {/* USD value */}
      <p className="text-blue-400 text-sm font-medium">{formatUSD(entry.value_usd)}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// YAxis tick formatter — handles sub-$1000 values gracefully
// ---------------------------------------------------------------------------

/**
 * Format a raw USD value for the YAxis tick labels.
 * Shows "$Xk" for thousands, "$X" for sub-thousand values.
 *
 * @param {number} value
 * @returns {string}
 */
function yAxisFormatter(value) {
  if (value === 0) return "$0";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000)     return `$${(value / 1_000).toFixed(0)}k`;
  return `$${value.toFixed(0)}`;
}

// ===========================================================================
// Main component
// ===========================================================================

/**
 * BarChart — top 10 tokens by USD value, coloured by chain.
 *
 * @param {{ data: Array, prices: Object }} props
 */
function TokenBarChart({ data, prices }) {
  // ── Compute top 10 tokens with USD value ──────────────────────────────────
  const top10 = (data || [])
    .map((token) => {
      const price     = prices?.[token.symbol] || 0;
      const value_usd = (token.amount || 0) * price;
      return { ...token, price, value_usd };
    })
    .filter((t) => t.value_usd > 0)
    .sort((a, b) => b.value_usd - a.value_usd)
    .slice(0, 10);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
      {/* Title row */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-bold text-base">Top Tokens by Value</h3>
        <span className="text-gray-500 text-xs">USD Value</span>
      </div>

      {top10.length === 0 ? (
        /* Empty state */
        <div className="flex items-center justify-center h-64 text-gray-500">
          No token value data available
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart
            data={top10}
            margin={{ top: 5, right: 10, left: 10, bottom: 60 }}
            barSize={28}
          >
            {/* X axis — angled token symbols */}
            <XAxis
              dataKey="symbol"
              tick={{ fill: "#9ca3af", fontSize: 11 }}
              angle={-45}
              textAnchor="end"
              interval={0}
              axisLine={{ stroke: "#374151" }}
              tickLine={false}
            />

            {/* Y axis — USD formatted ticks */}
            <YAxis
              tickFormatter={yAxisFormatter}
              tick={{ fill: "#9ca3af", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={55}
            />

            {/* Tooltip */}
            <Tooltip
              content={<CustomBarTooltip />}
              cursor={{ fill: "rgba(255,255,255,0.05)" }}
            />

            {/* Bars — each coloured by its chain */}
            <Bar dataKey="value_usd" radius={[4, 4, 0, 0]}>
              {top10.map((entry, i) => (
                <Cell key={i} fill={getChainColor(entry.chain)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// Both named and default export so App.js can use either import style
export { TokenBarChart };
export default TokenBarChart;
