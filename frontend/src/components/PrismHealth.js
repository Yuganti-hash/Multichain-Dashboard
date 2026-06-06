/**
 * frontend/src/components/PrismHealth.js
 * ========================================
 * Renders the PRISM State Health card for the MultiChain Dashboard.
 *
 * Displays:
 *   - An overall resilience score (0–100) rendered as a circular ring.
 *   - A PRISM READY / NEEDS REBALANCING status pill.
 *   - A human-readable recommendation from the backend.
 *   - Per-chain health bars for Ethereum, Polygon, BSC, and Solana.
 *   - An informational banner explaining PRISM architecture context.
 *
 * Props:
 *   prismHealth {Object}
 *     overall_score  {number}   0–100 portfolio resilience score
 *     chain_scores   {Object}   Per-chain scores: { ethereum, polygon, bsc, solana }
 *     recommendation {string}   Human-readable rebalancing advice
 *     prism_ready    {boolean}  True when overall_score >= 70
 */

import React from 'react';
import { getChainLabel, getChainColor } from '../services/api';

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

const CHAIN_ORDER = ['ethereum', 'polygon', 'bsc', 'solana'];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * PrismHealth — PRISM State Health card component.
 *
 * @param {{ prismHealth: Object }} props
 */
const PrismHealth = ({ prismHealth }) => {
  // Guard: nothing to render without data
  if (!prismHealth) return null;

  const overallScore   = prismHealth?.overall_score   ?? 0;
  const chainScores    = prismHealth?.chain_scores    ?? {};
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

        return (
          <div key={chain} className="flex items-center gap-3 mb-2">

            {/* Chain name */}
            <span className="text-sm text-gray-300 w-24 flex-shrink-0">
              {getChainLabel(chain)}
            </span>

            {/* Progress bar track */}
            <div className="flex-1 bg-gray-800 rounded-full h-2">
              {/* Progress bar fill — width is dynamic so inline style is required */}
              <div
                className={`h-2 rounded-full transition-all duration-700 ease-out ${scoreColors.bar}`}
                style={{ width: `${score}%` }}
              />
            </div>

            {/* Score number */}
            <span className={`text-xs font-mono w-8 text-right flex-shrink-0 ${scoreColors.text}`}>
              {score}
            </span>
          </div>
        );
      })}

    </div>
  );
};

export default PrismHealth;
