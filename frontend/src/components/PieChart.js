/**
 * frontend/src/components/PieChart.js
 * =====================================
 * Donut pie chart showing portfolio value distribution across chains.
 * Uses Recharts for rendering with a custom tooltip, center value overlay,
 * and a custom legend rendered below the chart.
 *
 * Exports:
 *   ChainPieChart (default + named) — avoids collision with Recharts' own PieChart
 *
 * Props:
 *   data {Array} — list of { chain, value_usd, percentage } from portfolio response
 */

import React from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { getChainColor, getChainLabel, formatUSD } from "../services/api";

// ---------------------------------------------------------------------------
// Custom Tooltip — rendered when hovering a pie slice
// ---------------------------------------------------------------------------

/**
 * Custom Recharts tooltip for the pie chart.
 * Receives `active`, `payload` from Recharts internally.
 */
function CustomTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;

  const entry = payload[0]?.payload || {};

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 shadow-xl">
      <p className="text-white font-semibold text-sm mb-1">
        {getChainLabel(entry.chain)}
      </p>
      <p className="text-blue-400 text-sm font-medium">
        {formatUSD(entry.value_usd)}
      </p>
      <p className="text-gray-400 text-xs mt-0.5">
        {(entry.percentage || 0).toFixed(2)}% of portfolio
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom Legend — rendered below the donut as a flex-wrap row
// ---------------------------------------------------------------------------

/**
 * Custom legend rendered below the chart.
 *
 * @param {{ data: Array }} props
 */
function CustomLegend({ data }) {
  return (
    <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 mt-4">
      {data.map((entry) => (
        <div key={entry.chain} className="flex items-center gap-1.5">
          <span
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: getChainColor(entry.chain) }}
          />
          <span className="text-gray-300 text-sm">{getChainLabel(entry.chain)}</span>
          <span className="text-gray-500 text-xs">
            {(entry.percentage || 0).toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  );
}

// ===========================================================================
// Main component
// ===========================================================================

/**
 * ChainPieChart — donut chart of chain value distribution.
 * Named ChainPieChart to avoid collision with Recharts' own PieChart export.
 *
 * @param {{ data: Array }} props
 */
function ChainPieChart({ data }) {
  // Filter to chains that actually hold value
  const filteredData = (data || []).filter((d) => (d.value_usd || 0) > 0);

  // Total portfolio value (sum of visible slices)
  const totalValue = filteredData.reduce((sum, d) => sum + (d.value_usd || 0), 0);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
      <h3 className="text-white font-bold text-base mb-4">Chain Distribution</h3>

      {filteredData.length === 0 ? (
        /* Empty state */
        <div className="flex items-center justify-center h-64 text-gray-500">
          No chain data available
        </div>
      ) : (
        <>
          {/* Chart + center overlay wrapper */}
          <div className="relative">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={filteredData}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={110}
                  paddingAngle={3}
                  dataKey="value_usd"
                  nameKey="chain"
                  animationBegin={0}
                  animationDuration={800}
                >
                  {filteredData.map((entry) => (
                    <Cell
                      key={entry.chain}
                      fill={getChainColor(entry.chain)}
                      stroke="transparent"
                    />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>

            {/* Center label overlay — sits in the donut hole */}
            <div
              className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
              aria-hidden="true"
            >
              <span className="text-white font-bold text-lg leading-none">
                {formatUSD(totalValue)}
              </span>
              <span className="text-gray-400 text-xs mt-1">Total</span>
            </div>
          </div>

          {/* Custom legend below the donut */}
          <CustomLegend data={filteredData} />
        </>
      )}
    </div>
  );
}

// Both named and default export so App.js can use either import style
export { ChainPieChart };
export default ChainPieChart;
