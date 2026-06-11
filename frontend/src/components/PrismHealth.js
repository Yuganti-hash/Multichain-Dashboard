/**
 * frontend/src/components/PrismHealth.js
 * ========================================
 * Renders the PRISM State Health card for the MultiChain Dashboard.
 *
 * Displays:
 *   - An overall resilience score (0–100) rendered as a circular ring.
 *   - A PRISM READY / NEEDS REBALANCING status pill.
 *   - A human-readable recommendation from the backend.
 *   - Per-chain health bars with LIVE data: block number, latency, block
 *     time, and a real-time healthy / degraded indicator dot.
 *
 * Props:
 *   prismHealth  {Object}  Backend prism_health object
 *     overall_score  {number}   0–100 portfolio resilience score
 *     chain_scores   {Object}   Per-chain PRISM scores (real-health-adjusted)
 *     recommendation {string}   Human-readable rebalancing advice
 *     prism_ready    {boolean}  True when overall_score >= 70
 *
 *   chainHealth  {Object}  Backend chain_health object (may be undefined)
 *     [chain]: {
 *       block_number       {number}  Latest block / slot
 *       block_time_seconds {number}  Average block time in seconds
 *       gas_price_gwei     {number}  Gas price (0 for Solana)
 *       is_healthy         {boolean} Live RPC health flag
 *       latency_ms         {number}  Round-trip RPC latency
 *       last_updated       {string}  ISO-8601 UTC timestamp
 *     }
 */

import React from 'react';
import { getChainLabel } from '../services/api';

// ---------------------------------------------------------------------------
// Helper — map a 0-100 score to Tailwind colour classes
// ---------------------------------------------------------------------------

/**
 * Returns Tailwind class strings for text, border, and progress-bar colouring
 * based on a numeric score.
 *
 * @param {number} score - A value between 0 and 100.
 * @returns {{ text: string, border: string, bar: string }}
 */
const getScoreColor = (score) => {
  if (score >= 70) {
    return {
      text:   'text-green-400',
      border: 'border-green-500',
      bar:    'bg-green-500',
    };
  }
  if (score >= 40) {
    return {
      text:   'text-yellow-400',
      border: 'border-yellow-500',
      bar:    'bg-yellow-500',
    };
  }
  return {
    text:   'text-red-400',
    border: 'border-red-500',
    bar:    'bg-red-500',
  };
};

// ---------------------------------------------------------------------------
// Constants — chain render order
// ---------------------------------------------------------------------------

const CHAIN_ORDER = ['ethereum', 'polygon', 'bsc', 'solana', 'arbitrum'];

// Chain metadata for bars that need explicit overrides (e.g. Arbitrum's brand colour).
// Used to inject an inline `style` on the progress-bar fill when the generic
// getScoreColor green/yellow/red palette isn't specific enough.
const CHAIN_BAR_COLOR = {
  arbitrum: '#28A0F0',  // Arbitrum blue — overrides the score-based bar colour
};

// Chain display names for chains not covered by getChainLabel
const CHAIN_DISPLAY_NAME = {
  ethereum: 'Ethereum',
  polygon:  'Polygon',
  bsc:      'BNB Chain',
  solana:   'Solana',
  arbitrum: 'Arbitrum',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helper — format a large integer with locale commas (e.g. 471,950,335)
// ---------------------------------------------------------------------------
const fmtBlock = (n) =>
  typeof n === 'number' && n > 0
    ? n.toLocaleString('en-US')
    : '—';

/**
 * PrismHealth — PRISM State Health card component.
 *
 * @param {{ prismHealth: Object, chainHealth: Object }} props
 */
const PrismHealth = ({ prismHealth, chainHealth }) => {
  // Guard: nothing to render without data
  if (!prismHealth) return null;

  const overallScore   = prismHealth?.overall_score   ?? 0;
  const recommendation = prismHealth?.recommendation  ?? '';
  const prismReady     = prismHealth?.prism_ready     ?? false;

  const overallColors = getScoreColor(overallScore);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">

      {/* ── TOP ROW ─────────────────────────────────────────────────────── */}
      <div className="flex justify-between items-start mb-6">

        {/* Left — title + subtitle */}
        <div>
          <h3 className="text-white font-bold text-lg">
            PRISM State Health
          </h3>
          <p className="text-gray-400 text-sm mt-0.5">
            Chain-agnostic portfolio resilience score
          </p>
        </div>

        {/* Right — readiness pill */}
        {prismReady ? (
          <span className="bg-green-900/40 border border-green-700 text-green-400 text-xs font-bold px-3 py-1.5 rounded-full uppercase tracking-wide">
            ✓ PRISM READY
          </span>
        ) : (
          <span className="bg-red-900/40 border border-red-700 text-red-400 text-xs font-bold px-3 py-1.5 rounded-full uppercase tracking-wide">
            ✗ NEEDS REBALANCING
          </span>
        )}
      </div>

      {/* ── SCORE + RECOMMENDATION ROW ──────────────────────────────────── */}
      <div className="flex items-center gap-8 mb-6">

        {/* Left — circular score ring */}
        <div className="relative w-24 h-24 flex-shrink-0">
          <div
            className={`w-24 h-24 rounded-full border-4 ${overallColors.border} flex items-center justify-center flex-col bg-gray-950`}
          >
            <span className={`text-2xl font-bold ${overallColors.text}`}>
              {overallScore}
            </span>
            <span className="text-xs text-gray-500">/100</span>
          </div>
        </div>

        {/* Right — recommendation text */}
        <div>
          <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">
            Overall Resilience Score
          </p>
          <p className="text-white text-sm leading-relaxed">
            {recommendation}
          </p>
          <p className="mt-2 text-xs text-gray-500">
            Higher scores indicate your portfolio can migrate across chains with
            minimal disruption under PRISM architecture.
          </p>
        </div>
      </div>

      {/* ── PER-CHAIN HEALTH BARS ───────────────────────────────────────── */}
      <p className="text-gray-400 text-xs uppercase tracking-wider mb-3">
        Per-Chain Health
      </p>

      {CHAIN_ORDER.map((chain) => {
        const score       = prismHealth?.chain_scores?.[chain] ?? 0;
        const scoreColors = getScoreColor(score);
        const barColor    = CHAIN_BAR_COLOR[chain];
        const displayName = CHAIN_DISPLAY_NAME[chain] || getChainLabel(chain);

        // ── Live data from chain_health (may be absent) ──────────────────
        const live          = chainHealth?.[chain];
        const isHealthy     = live?.is_healthy ?? null;   // null = unknown
        const latencyMs     = live?.latency_ms  ?? null;
        const blockNum      = live?.block_number ?? null;
        const blockTimeSec  = live?.block_time_seconds ?? null;

        // Dot colour: green = healthy, red = degraded, gray = no data
        const dotColor =
          isHealthy === true  ? '#22c55e' :   // green-500
          isHealthy === false ? '#ef4444' :   // red-500
          '#4b5563';                          // gray-600

        return (
          <div key={chain} className="mb-3">

            {/* ── Row 1: dot + name + bar + score ────────────────────── */}
            <div className="flex items-center gap-3">

              {/* Live-status dot */}
              <span
                title={isHealthy === true ? 'Healthy' : isHealthy === false ? 'Degraded' : 'Unknown'}
                style={{
                  display:         'inline-block',
                  width:           '8px',
                  height:          '8px',
                  borderRadius:    '50%',
                  backgroundColor: dotColor,
                  flexShrink:      0,
                  boxShadow:       isHealthy === true
                                     ? '0 0 6px #22c55e88'
                                     : isHealthy === false
                                       ? '0 0 6px #ef444488'
                                       : 'none',
                }}
              />

              {/* Chain name */}
              <span className="text-sm text-gray-300 w-20 flex-shrink-0">
                {displayName}
              </span>

              {/* Progress bar track */}
              <div className="flex-1 bg-gray-800 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all duration-700 ease-out ${
                    barColor ? '' : scoreColors.bar
                  }`}
                  style={{
                    width: `${score}%`,
                    ...(barColor ? { backgroundColor: barColor } : {}),
                  }}
                />
              </div>

              {/* PRISM score */}
              <span className={`text-xs font-mono w-8 text-right flex-shrink-0 ${scoreColors.text}`}>
                {score}
              </span>
            </div>

            {/* ── Row 2: live metrics (only when chainHealth data exists) ─ */}
            {live && (
              <div
                className="flex items-center gap-4 mt-1"
                style={{ paddingLeft: '20px' }}  /* indent past dot */
              >
                {/* Block number */}
                {blockNum !== null && blockNum > 0 && (
                  <span className="text-xs text-gray-500 font-mono">
                    Block&nbsp;#{fmtBlock(blockNum)}
                  </span>
                )}

                {/* Block time */}
                {blockTimeSec !== null && blockTimeSec > 0 && (
                  <span className="text-xs text-gray-500">
                    {blockTimeSec < 1
                      ? `${(blockTimeSec * 1000).toFixed(0)}ms blocks`
                      : `${blockTimeSec.toFixed(2)}s blocks`}
                  </span>
                )}

                {/* Latency */}
                {latencyMs !== null && latencyMs > 0 && (
                  <span
                    className="text-xs font-mono"
                    style={{
                      color: latencyMs < 1000 ? '#22c55e'
                           : latencyMs < 2000 ? '#f59e0b'
                           : '#ef4444',
                    }}
                  >
                    {latencyMs.toLocaleString('en-US', { maximumFractionDigits: 0 })}ms
                  </span>
                )}

                {/* Health label */}
                <span
                  className="text-xs font-semibold"
                  style={{ color: dotColor }}
                >
                  {isHealthy === true ? '● Live' : isHealthy === false ? '● Degraded' : ''}
                </span>
              </div>
            )}
          </div>
        );
      })}

    </div>
  );
};

export default PrismHealth;
