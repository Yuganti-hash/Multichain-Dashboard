/**
 * frontend/src/components/ExecutionRouter.js
 * ============================================
 * PRISM Execution Router — fully interactive simulation card.
 *
 * Modes:
 *  - Live mode   : real routing data from portfolio.router
 *  - Empty state : informative message when no chains have assets
 *
 * Features:
 *  - Animated score bars with staggered entry
 *  - Expandable per-chain score breakdown
 *  - "What-If" simulation panel to explore routing decisions interactively
 *  - Routing pipeline visualisation (Input → Score → Rank → Execute)
 *  - Fully robust: handles null data, empty rankings, and partial lumina data
 *
 * Props:
 *   routerData {Object | null}
 *     best_chain      {string}  e.g. "ethereum"
 *     chain_rankings  {Array}   sorted list of { chain, score, breakdown, tvl }
 *     recommendation  {string}  human-readable routing recommendation
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getChainLabel, getChainColor } from '../services/api';

// ─────────────────────────────────────────────────────────────────────────────
// Chain metadata helpers
// ─────────────────────────────────────────────────────────────────────────────

function getChainIcon(chain) {
  const icons = {
    ethereum: 'Ξ',
    polygon:  '⬡',
    bsc:      '◈',
    solana:   '◎',
    arbitrum: '🔵',
    base:     '🔷',
  };
  return icons[chain?.toLowerCase()] || '●';
}

function scoreColor(score) {
  if (score >= 60) return { text: '#4ade80', bar: '#22c55e', bg: 'rgba(34,197,94,0.10)'  };
  if (score >= 30) return { text: '#fbbf24', bar: '#f59e0b', bg: 'rgba(245,158,11,0.10)' };
  return              { text: '#f87171', bar: '#ef4444', bg: 'rgba(239,68,68,0.10)'    };
}

function fmtTVL(tvl) {
  if (!tvl) return '—';
  if (tvl >= 1e9) return `$${(tvl / 1e9).toFixed(1)}B`;
  if (tvl >= 1e6) return `$${(tvl / 1e6).toFixed(1)}M`;
  return `$${tvl.toLocaleString()}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: Animated score bar
// ─────────────────────────────────────────────────────────────────────────────

function ScoreBar({ pct, color, delay = 0 }) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setWidth(pct), delay + 80);
    return () => clearTimeout(t);
  }, [pct, delay]);

  return (
    <div className="flex-1 bg-gray-800 rounded-full h-1.5 mx-2">
      <div
        style={{
          width:      `${width}%`,
          background: color,
          height:     '100%',
          borderRadius: '999px',
          transition: `width 700ms cubic-bezier(0.4,0,0.2,1) ${delay}ms`,
        }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: Routing pipeline visualisation
// ─────────────────────────────────────────────────────────────────────────────

function RoutingPipeline({ best_chain, animated }) {
  const steps = [
    { icon: '📊', label: 'Collect Data',  sub: 'Health · Allocation · TVL' },
    { icon: '⚙️', label: 'Score Chains',  sub: '40% · 30% · 30%' },
    { icon: '📈', label: 'Rank Results',  sub: 'Sort descending' },
    { icon: '⚡', label: 'Route',          sub: best_chain ? getChainLabel(best_chain) : '—' },
  ];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
      {steps.map((step, i) => (
        <React.Fragment key={i}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '8px 12px',
              borderRadius: 10,
              background: i === 3 && best_chain
                ? `${getChainColor(best_chain)}18`
                : 'rgba(31,41,55,0.7)',
              border: `1px solid ${i === 3 && best_chain ? getChainColor(best_chain) + '44' : '#374151'}`,
              minWidth: 80,
              opacity: animated ? 1 : 0.4,
              transform: animated ? 'translateY(0)' : 'translateY(4px)',
              transition: `all 400ms ease ${i * 120}ms`,
            }}
          >
            <span style={{ fontSize: 18, marginBottom: 2 }}>{step.icon}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#e5e7eb', letterSpacing: '0.02em' }}>
              {step.label}
            </span>
            <span style={{ fontSize: 9, color: '#6b7280', marginTop: 1, textAlign: 'center', lineHeight: 1.2 }}>
              {step.sub}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div style={{ color: '#374151', fontSize: 16, padding: '0 4px', flexShrink: 0 }}>→</div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: What-If simulator panel
// ─────────────────────────────────────────────────────────────────────────────

function WhatIfSimulator({ baseRankings }) {
  const [open, setOpen]         = useState(false);
  const [overrides, setOverrides] = useState({});
  const [simResult, setSimResult] = useState(null);

  const chains = baseRankings.map(r => r.chain);

  const runSim = useCallback(() => {
    if (!baseRankings.length) return;

    const maxTVL = Math.max(...baseRankings.map(r => r.tvl || 0));

    const updated = baseRankings.map(r => {
      const ov = overrides[r.chain] || {};
      const health     = ov.health     ?? r.breakdown.chain_health;
      const allocation = ov.allocation ?? r.breakdown.portfolio_allocation;
      const tvl        = r.tvl || 0;
      const liqScore   = maxTVL > 0 ? (tvl / maxTVL) * 100 : 0;
      const score      = (0.4 * health) + (0.3 * allocation) + (0.3 * liqScore);
      return { chain: r.chain, score: Math.round(score * 100) / 100, health, allocation };
    });

    updated.sort((a, b) => b.score - a.score);
    setSimResult(updated);
  }, [baseRankings, overrides]);

  if (!baseRankings.length) return null;

  return (
    <div style={{
      marginTop: 16,
      border: '1px solid #1e3a5f',
      borderRadius: 12,
      overflow: 'hidden',
    }}>
      {/* Header toggle */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 16px',
          background: 'rgba(30,58,138,0.2)',
          border: 'none',
          cursor: 'pointer',
          color: '#93c5fd',
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        <span>🧪 What-If Simulator</span>
        <span style={{ transition: 'transform 200ms', transform: open ? 'rotate(180deg)' : 'none', fontSize: 10 }}>▾</span>
      </button>

      {open && (
        <div style={{ padding: '12px 16px', background: 'rgba(17,24,39,0.6)' }}>
          <p style={{ color: '#6b7280', fontSize: 11, marginBottom: 12 }}>
            Adjust health or allocation for any chain, then re-simulate to see how the routing decision changes.
          </p>

          {/* Sliders */}
          {chains.map(chain => {
            const base = baseRankings.find(r => r.chain === chain);
            const ov   = overrides[chain] || {};
            const health     = ov.health     ?? base.breakdown.chain_health;
            const allocation = ov.allocation ?? base.breakdown.portfolio_allocation;

            return (
              <div key={chain} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <span style={{ color: getChainColor(chain), fontSize: 14 }}>{getChainIcon(chain)}</span>
                  <span style={{ color: '#d1d5db', fontSize: 12, fontWeight: 600 }}>{getChainLabel(chain)}</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {/* Health slider */}
                  <label style={{ color: '#9ca3af', fontSize: 11 }}>
                    Health: <span style={{ color: scoreColor(health).text, fontWeight: 700 }}>{Math.round(health)}%</span>
                    <input
                      type="range" min="0" max="100" step="1"
                      value={Math.round(health)}
                      onChange={e => setOverrides(prev => ({
                        ...prev,
                        [chain]: { ...prev[chain], health: Number(e.target.value) }
                      }))}
                      style={{ width: '100%', marginTop: 3, accentColor: getChainColor(chain) }}
                    />
                  </label>

                  {/* Allocation slider */}
                  <label style={{ color: '#9ca3af', fontSize: 11 }}>
                    Allocation: <span style={{ color: '#93c5fd', fontWeight: 700 }}>{Math.round(allocation)}%</span>
                    <input
                      type="range" min="0" max="100" step="1"
                      value={Math.round(allocation)}
                      onChange={e => setOverrides(prev => ({
                        ...prev,
                        [chain]: { ...prev[chain], allocation: Number(e.target.value) }
                      }))}
                      style={{ width: '100%', marginTop: 3, accentColor: '#3b82f6' }}
                    />
                  </label>
                </div>
              </div>
            );
          })}

          {/* Run simulation */}
          <button
            onClick={runSim}
            style={{
              width: '100%',
              padding: '8px 0',
              borderRadius: 8,
              background: 'linear-gradient(135deg, #1d4ed8, #7c3aed)',
              border: 'none',
              color: '#fff',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              letterSpacing: '0.04em',
              marginTop: 4,
            }}
          >
            ⚡ Simulate Route
          </button>

          {/* Simulation result */}
          {simResult && (
            <div style={{ marginTop: 12 }}>
              <p style={{ color: '#6b7280', fontSize: 11, marginBottom: 8 }}>Simulation result:</p>
              {simResult.map((item, idx) => (
                <div key={item.chain} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '5px 8px',
                  borderRadius: 6,
                  marginBottom: 4,
                  background: idx === 0 ? `${getChainColor(item.chain)}15` : 'transparent',
                  border: idx === 0 ? `1px solid ${getChainColor(item.chain)}30` : '1px solid transparent',
                }}>
                  <span style={{ color: '#6b7280', fontSize: 11, width: 14 }}>{idx + 1}</span>
                  <span style={{ color: getChainColor(item.chain), fontSize: 13 }}>{getChainIcon(item.chain)}</span>
                  <span style={{ color: '#e5e7eb', fontSize: 12, flex: 1 }}>{getChainLabel(item.chain)}</span>
                  <span style={{ color: scoreColor(item.score).text, fontSize: 12, fontWeight: 700, fontFamily: 'monospace' }}>
                    {item.score.toFixed(1)}
                  </span>
                  {idx === 0 && (
                    <span style={{
                      fontSize: 9, fontWeight: 700, background: getChainColor(item.chain) + '25',
                      color: getChainColor(item.chain), padding: '1px 6px', borderRadius: 999, letterSpacing: '0.05em',
                    }}>BEST</span>
                  )}
                </div>
              ))}

              <button
                onClick={() => { setSimResult(null); setOverrides({}); }}
                style={{
                  marginTop: 8, background: 'transparent', border: '1px solid #374151',
                  color: '#6b7280', fontSize: 11, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                }}
              >
                Reset
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

const ExecutionRouter = ({ routerData }) => {
  const [expanded, setExpanded] = useState(null);
  const [pipelineAnimated, setPipelineAnimated] = useState(false);
  const cardRef = useRef(null);

  // Trigger pipeline animation on mount / when data arrives
  useEffect(() => {
    const t = setTimeout(() => setPipelineAnimated(true), 200);
    return () => clearTimeout(t);
  }, [routerData]);

  // ── No data guard ──────────────────────────────────────────────────────────
  if (!routerData) return null;

  const { best_chain, chain_rankings = [], recommendation } = routerData;
  const top4      = chain_rankings.slice(0, 4);
  const maxScore  = top4.length > 0 ? top4[0].score : 1;

  // ── Empty rankings state (wallet has no assets on any chain) ──────────────
  if (top4.length === 0) {
    return (
      <div
        ref={cardRef}
        style={{
          background: 'linear-gradient(135deg, rgba(17,24,39,0.95) 0%, rgba(31,41,55,0.9) 100%)',
          border: '1px solid #1f2937',
          borderRadius: 16,
          padding: 24,
          marginBottom: 24,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, #1d4ed8, #7c3aed)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
          }}>⚡</div>
          <div>
            <h3 style={{ color: '#fff', fontWeight: 700, fontSize: 16, margin: 0 }}>PRISM Execution Router</h3>
            <p style={{ color: '#6b7280', fontSize: 12, margin: 0 }}>Optimal chain for transaction execution</p>
          </div>
        </div>
        <div style={{
          background: 'rgba(31,41,55,0.6)', border: '1px solid #374151',
          borderRadius: 10, padding: '16px 20px', textAlign: 'center', marginTop: 12,
        }}>
          <p style={{ color: '#9ca3af', fontSize: 13 }}>
            {recommendation || 'No assets detected. Deposit funds to enable execution routing.'}
          </p>
        </div>
      </div>
    );
  }

  // ── Full render ────────────────────────────────────────────────────────────
  return (
    <div
      ref={cardRef}
      style={{
        background: 'linear-gradient(135deg, rgba(17,24,39,0.97) 0%, rgba(31,41,55,0.93) 100%)',
        border: '1px solid #1f2937',
        borderRadius: 16,
        padding: 24,
        marginBottom: 24,
        boxShadow: best_chain
          ? `0 0 40px ${getChainColor(best_chain)}12, 0 4px 24px rgba(0,0,0,0.4)`
          : '0 4px 24px rgba(0,0,0,0.4)',
      }}
    >
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, #1d4ed8, #7c3aed)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
          }}>⚡</div>
          <div>
            <h3 style={{ color: '#fff', fontWeight: 700, fontSize: 16, margin: 0 }}>PRISM Execution Router</h3>
            <p style={{ color: '#6b7280', fontSize: 12, margin: 0 }}>Optimal chain for transaction execution</p>
          </div>
        </div>

        {/* Best chain badge */}
        {best_chain && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 999,
            background: `${getChainColor(best_chain)}18`,
            border:     `1px solid ${getChainColor(best_chain)}44`,
            color:       getChainColor(best_chain),
            fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
          }}>
            <span>{getChainIcon(best_chain)}</span>
            {getChainLabel(best_chain)}
            <span style={{
              marginLeft: 2, padding: '1px 6px', borderRadius: 4,
              background: `${getChainColor(best_chain)}30`, fontSize: 10,
            }}>BEST</span>
          </div>
        )}
      </div>

      {/* ── Routing pipeline ──────────────────────────────────────────────── */}
      <RoutingPipeline best_chain={best_chain} animated={pipelineAnimated} />

      {/* ── Recommendation banner ─────────────────────────────────────────── */}
      <div style={{
        background: 'rgba(30,58,138,0.2)',
        border: '1px solid rgba(59,130,246,0.2)',
        borderRadius: 10,
        padding: '10px 14px',
        marginBottom: 20,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
      }}>
        <span style={{ color: '#60a5fa', fontSize: 16, flexShrink: 0, marginTop: 1 }}>💡</span>
        <p style={{ color: '#bfdbfe', fontSize: 13, lineHeight: 1.5, margin: 0 }}>{recommendation}</p>
      </div>

      {/* ── Chain rankings ────────────────────────────────────────────────── */}
      <p style={{ color: '#4b5563', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
        Chain Rankings
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {top4.map((item, idx) => {
          const chain   = item.chain;
          const score   = item.score ?? 0;
          const colors  = scoreColor(score);
          const isOpen  = expanded === chain;
          const isBest  = chain === best_chain;
          const { chain_health, portfolio_allocation, liquidity_score } = item.breakdown || {};
          const barPct  = maxScore > 0 ? Math.min((score / maxScore) * 100, 100) : 0;

          return (
            <div
              key={chain}
              style={{
                borderRadius: 10,
                overflow: 'hidden',
                background: isBest ? colors.bg : 'rgba(31,41,55,0.5)',
                border:     `1px solid ${isBest ? colors.bar + '44' : '#374151'}`,
                transition: 'border-color 300ms',
              }}
            >
              {/* Row header */}
              <button
                onClick={() => setExpanded(isOpen ? null : chain)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 14px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                {/* Rank badge */}
                <span style={{
                  width: 22, height: 22, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: '50%',
                  background: idx === 0 ? colors.bar : '#374151',
                  color:      idx === 0 ? '#111827' : '#9ca3af',
                  fontSize: 11, fontWeight: 700,
                }}>{idx + 1}</span>

                {/* Icon + label */}
                <span style={{ color: getChainColor(chain), fontSize: 16, flexShrink: 0 }}>
                  {getChainIcon(chain)}
                </span>
                <span style={{ color: '#f9fafb', fontSize: 13, fontWeight: 600, width: 80, flexShrink: 0 }}>
                  {getChainLabel(chain)}
                </span>

                {/* Animated score bar */}
                <ScoreBar pct={barPct} color={colors.bar} delay={idx * 100} />

                {/* Score number */}
                <span style={{
                  color: colors.text, fontSize: 12, fontFamily: 'monospace',
                  fontWeight: 700, width: 36, textAlign: 'right', flexShrink: 0,
                }}>
                  {score}
                </span>

                {/* Chevron */}
                <span style={{
                  color: '#4b5563', fontSize: 11, flexShrink: 0,
                  transition: 'transform 200ms',
                  transform: isOpen ? 'rotate(180deg)' : 'none',
                }}>▾</span>
              </button>

              {/* Expanded breakdown */}
              {isOpen && (
                <div style={{
                  padding: '0 14px 12px',
                  borderTop: '1px solid rgba(55,65,81,0.5)',
                  paddingTop: 12,
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 10 }}>
                    {[
                      { label: 'Chain Health',   value: chain_health,        unit: '%', hint: '40% weight' },
                      { label: 'Allocation',      value: portfolio_allocation, unit: '%', hint: '30% weight' },
                      { label: 'Liquidity Score', value: liquidity_score,     unit: '',  hint: '30% weight' },
                    ].map(({ label, value, unit, hint }) => (
                      <div key={label} style={{ textAlign: 'center' }}>
                        <p style={{ color: '#6b7280', fontSize: 10, marginBottom: 4 }}>{label}</p>
                        <p style={{
                          color: scoreColor(value ?? 0).text,
                          fontSize: 15, fontWeight: 700, fontFamily: 'monospace', margin: 0,
                        }}>
                          {value != null ? `${value.toFixed(1)}${unit}` : '—'}
                        </p>
                        <p style={{ color: '#374151', fontSize: 9, marginTop: 2 }}>{hint}</p>
                      </div>
                    ))}
                  </div>
                  {/* TVL row */}
                  <div style={{
                    borderTop: '1px solid rgba(55,65,81,0.4)',
                    paddingTop: 8,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <span style={{ color: '#6b7280', fontSize: 11 }}>Total Value Locked</span>
                    <span style={{ color: '#d1d5db', fontSize: 12, fontFamily: 'monospace' }}>
                      {fmtTVL(item.tvl)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Scoring formula hint ──────────────────────────────────────────── */}
      <p style={{
        color: '#374151', fontSize: 11, textAlign: 'center', marginTop: 16,
        letterSpacing: '0.02em',
      }}>
        Score = 40% Chain Health · 30% Portfolio Allocation · 30% Liquidity
      </p>

      {/* ── What-If Simulator ─────────────────────────────────────────────── */}
      <WhatIfSimulator baseRankings={chain_rankings} />
    </div>
  );
};

export default ExecutionRouter;
