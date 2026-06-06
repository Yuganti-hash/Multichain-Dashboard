/**
 * StateMachine.js
 * ---------------
 * Protocol Resilient Interoperable State Machine (PRISM) visualiser.
 *
 * Renders:
 *  - Current portfolio state badge + animated 5-node state diagram
 *  - Per-chain health cards with health bars and failure reasons
 *  - Migration plan recommendations (if any chains are at risk)
 *  - Explanatory SOVEREIGN deployment info banner
 *
 * @param {{ stateMachine: object }} props
 */

import React, { useState } from 'react'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a 6-digit hex colour + opacity into an rgba() string.
 * @param {string} hex     e.g. "#ef4444"
 * @param {number} opacity e.g. 0.15
 * @returns {string}       e.g. "rgba(239,68,68,0.15)"
 */
function colorWithOpacity(hex, opacity) {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.substring(0, 2), 16)
  const g = parseInt(clean.substring(2, 4), 16)
  const b = parseInt(clean.substring(4, 6), 16)
  return `rgba(${r},${g},${b},${opacity})`
}

/** Human-readable chain label */
function getChainLabel(chain) {
  const labels = {
    ethereum: 'Ethereum',
    polygon:  'Polygon',
    bsc:      'BNB Chain',
    solana:   'Solana',
  }
  return labels[chain] || chain
}

/** Symbolic chain icon */
function getChainIcon(chain) {
  const icons = {
    ethereum: 'Ξ',
    polygon:  '⬡',
    bsc:      '◈',
    solana:   '◎',
  }
  return icons[chain] || '●'
}

/** Format a USD value with smart precision */
function formatUSD(v) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000)     return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  if (v > 0)          return `$${v.toFixed(6)}`
  return '$0.00'
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHAIN_ORDER = ['ethereum', 'polygon', 'bsc', 'solana']

const DEFAULT_NODE = {
  state:          'UNKNOWN',
  value_usd:      0,
  percentage:     0,
  health_score:   0,
  state_color:    '#6b7280',
  failure_reason: null,
}

/** All five portfolio states in diagram order */
const PORTFOLIO_STATES = [
  { key: 'STABLE',    label: 'Stable',    icon: '✓', color: '#22c55e' },
  { key: 'AT_RISK',   label: 'At Risk',   icon: '⚠', color: '#f59e0b' },
  { key: 'CRITICAL',  label: 'Critical',  icon: '✗', color: '#ef4444' },
  { key: 'MIGRATING', label: 'Migrating', icon: '↔', color: '#3b82f6' },
  { key: 'RESILIENT', label: 'Resilient', icon: '✓', color: '#00d4aa' },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function StateMachine({ stateMachine }) {
  // eslint-disable-next-line no-unused-vars
  const [_tick, setTick] = useState(0)   // reserved for future live refresh

  if (!stateMachine) return null

  const {
    portfolio_state,
    portfolio_state_label,
    portfolio_state_color,
    chain_nodes,
    migration_plan,
  } = stateMachine

  const isPulsing =
    portfolio_state === 'CRITICAL' || portfolio_state === 'AT_RISK'

  return (
    <div
      style={{ background: '#111827' }}
      className="border border-gray-800 rounded-xl p-6 mb-6"
    >
      {/* ------------------------------------------------------------------ */}
      {/* TOP ROW — title + portfolio state badge                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex justify-between items-start mb-6">
        {/* Left — title */}
        <div>
          <h3 className="text-white font-bold text-lg m-0">
            Protocol State Machine
          </h3>
          <p className="text-gray-400 text-sm mt-0.5 mb-0">
            Resilient interoperable portfolio state
          </p>
        </div>

        {/* Right — portfolio state badge */}
        <div
          style={{
            background: colorWithOpacity(portfolio_state_color, 0.15),
            border:     `1px solid ${colorWithOpacity(portfolio_state_color, 0.3)}`,
          }}
          className="flex items-center px-3 py-1.5 rounded-full"
        >
          {/* Pulsing dot */}
          <span
            style={{
              width:           8,
              height:          8,
              borderRadius:    '50%',
              background:      portfolio_state_color,
              display:         'inline-block',
              marginRight:     8,
              animation:       isPulsing ? 'pulse 1.5s infinite' : 'none',
            }}
          />
          <span
            style={{ color: portfolio_state_color }}
            className="font-bold uppercase text-sm"
          >
            {portfolio_state_label}
          </span>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* STATE DIAGRAM — 5 nodes in a horizontal row                         */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-center mt-2 mb-6">
        {PORTFOLIO_STATES.map((s, idx) => {
          const isActive = portfolio_state === s.key
          return (
            <React.Fragment key={s.key}>
              {/* Node */}
              <div className="flex-1 text-center">
                {/* Circle */}
                <div
                  style={{
                    width:        40,
                    height:       40,
                    borderRadius: '50%',
                    border:       isActive
                      ? `2px solid ${s.color}`
                      : '2px solid #374151',
                    background:   isActive
                      ? colorWithOpacity(s.color, 0.2)
                      : '#1f2937',
                    display:      'flex',
                    alignItems:   'center',
                    justifyContent: 'center',
                    margin:       '0 auto',
                    transition:   'all 0.3s ease',
                  }}
                >
                  <span
                    style={{
                      color:      isActive ? s.color : '#4b5563',
                      fontWeight: 'bold',
                      fontSize:   16,
                    }}
                  >
                    {s.icon}
                  </span>
                </div>

                {/* Label */}
                <p
                  style={{
                    color:      isActive ? '#ffffff' : '#4b5563',
                    fontWeight: isActive ? 600 : 400,
                  }}
                  className="text-xs mt-1 mb-0"
                >
                  {s.label}
                </p>
              </div>

              {/* Connector line (not after last node) */}
              {idx < PORTFOLIO_STATES.length - 1 && (
                <div
                  style={{
                    flex:       1,
                    height:     1,
                    background: '#374151',
                    alignSelf:  'center',
                    margin:     '0 4px',
                    marginBottom: 20,  /* offset for label height */
                  }}
                />
              )}
            </React.Fragment>
          )
        })}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* CHAIN NODES GRID                                                    */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {CHAIN_ORDER.map((chain) => {
          const node = chain_nodes?.[chain] || DEFAULT_NODE

          return (
            <div
              key={chain}
              style={{
                background:   colorWithOpacity('#1f2937', 0.5),
                border:       `1px solid ${colorWithOpacity(node.state_color, 0.3)}`,
                borderRadius: 12,
                padding:      12,
              }}
            >
              {/* Chain header row */}
              <div className="flex justify-between items-center mb-2">
                {/* Icon + label */}
                <div className="flex items-center">
                  <span style={{ fontSize: 18 }}>{getChainIcon(chain)}</span>
                  <span className="text-white text-sm font-medium ml-1">
                    {getChainLabel(chain)}
                  </span>
                </div>

                {/* State badge */}
                <span
                  style={{
                    background: colorWithOpacity(node.state_color, 0.15),
                    color:      node.state_color,
                    fontSize:   10,
                    padding:    '2px 8px',
                    borderRadius: 9999,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  {node.state}
                </span>
              </div>

              {/* Value */}
              <div
                style={{
                  color:      node.value_usd > 0 ? node.state_color : '#4b5563',
                  fontSize:   18,
                  fontWeight: 700,
                  lineHeight: 1.2,
                }}
              >
                {formatUSD(node.value_usd)}
              </div>

              {/* Health bar */}
              <div className="mt-2">
                <div
                  className="flex justify-between items-center"
                  style={{ marginBottom: 4 }}
                >
                  <span className="text-gray-500 text-xs">Health</span>
                  <span
                    style={{ color: node.state_color, fontFamily: 'monospace' }}
                    className="text-xs"
                  >
                    {node.health_score}
                  </span>
                </div>
                {/* Track */}
                <div
                  style={{
                    width:        '100%',
                    height:       6,
                    background:   '#374151',
                    borderRadius: 9999,
                    overflow:     'hidden',
                  }}
                >
                  {/* Fill */}
                  <div
                    style={{
                      width:      `${node.health_score}%`,
                      height:     '100%',
                      background: node.state_color,
                      borderRadius: 9999,
                      transition: 'width 0.7s ease',
                    }}
                  />
                </div>
              </div>

              {/* Failure reason */}
              {node.failure_reason && (
                <p
                  title={node.failure_reason}
                  className="mt-2 text-xs leading-tight"
                  style={{
                    color:     '#fbbf24',
                    overflow:  'hidden',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                    margin:    '8px 0 0 0',
                  }}
                >
                  ⚠ {node.failure_reason}
                </p>
              )}
            </div>
          )
        })}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* MIGRATION PLAN                                                       */}
      {/* ------------------------------------------------------------------ */}
      {migration_plan?.migration_needed ? (
        <div
          style={{
            background:   colorWithOpacity('#78350f', 0.3),
            border:       `1px solid ${colorWithOpacity('#92400e', 0.3)}`,
            borderRadius: 12,
            padding:      16,
            marginBottom: 24,
          }}
        >
          {/* Header */}
          <div className="flex items-center gap-2 mb-3">
            <span style={{ color: '#fbbf24', fontSize: 18 }}>⚡</span>
            <span className="text-white font-semibold">Migration Plan</span>
            <span
              style={{
                background: colorWithOpacity('#78350f', 0.4),
                color:      '#fbbf24',
                fontSize:   11,
                padding:    '2px 8px',
                borderRadius: 9999,
              }}
            >
              PRISM Recommended
            </span>
          </div>

          {/* Plans */}
          {migration_plan.plans.map((plan, i) => {
            const isImmediate = plan.urgency === 'IMMEDIATE'
            return (
              <div
                key={i}
                className="flex items-center justify-between py-2"
                style={{
                  borderBottom:
                    i < migration_plan.plans.length - 1
                      ? `1px solid ${colorWithOpacity('#92400e', 0.2)}`
                      : 'none',
                }}
              >
                {/* From → To */}
                <div className="flex items-center gap-3">
                  <span
                    style={{
                      background:   '#1f2937',
                      color:        '#ffffff',
                      fontFamily:   'monospace',
                      fontSize:     13,
                      padding:      '4px 12px',
                      borderRadius: 6,
                    }}
                  >
                    {getChainLabel(plan.from_chain)}
                  </span>

                  <span
                    style={{ color: '#fbbf24', fontWeight: 700, fontSize: 16 }}
                  >
                    →
                  </span>

                  <span
                    style={{
                      background:   '#1f2937',
                      color:        '#4ade80',
                      fontFamily:   'monospace',
                      fontSize:     13,
                      padding:      '4px 12px',
                      borderRadius: 6,
                    }}
                  >
                    {getChainLabel(plan.to_chain)}
                  </span>
                </div>

                {/* Urgency badge + value */}
                <div className="flex flex-col items-end gap-1">
                  <span
                    style={{
                      background:   isImmediate
                        ? colorWithOpacity('#7f1d1d', 0.4)
                        : colorWithOpacity('#78350f', 0.4),
                      color:        isImmediate ? '#f87171' : '#fbbf24',
                      border:       `1px solid ${isImmediate ? '#b91c1c' : '#b45309'}`,
                      fontSize:     10,
                      padding:      '2px 8px',
                      borderRadius: 9999,
                      fontWeight:   700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    {plan.urgency}
                  </span>
                  <span className="text-xs text-gray-400">
                    {formatUSD(plan.value_at_risk)}
                  </span>
                </div>
              </div>
            )
          })}

          {/* Safety improvement */}
          <p
            className="text-sm mt-2 mb-0"
            style={{ color: '#fde68a' }}
          >
            Estimated safety improvement:{' '}
            <strong>+{migration_plan.estimated_safety_improvement}%</strong>
          </p>
        </div>
      ) : (
        /* No migration needed */
        <div
          style={{
            background:   colorWithOpacity('#052e16', 0.3),
            border:       `1px solid ${colorWithOpacity('#166534', 0.3)}`,
            borderRadius: 12,
            padding:      16,
            marginBottom: 24,
          }}
          className="flex items-center gap-3"
        >
          <span style={{ color: '#4ade80', fontSize: 20 }}>✓</span>
          <span className="text-sm" style={{ color: '#86efac' }}>
            No migration needed — portfolio state is stable across all active
            chains
          </span>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* BOTTOM INFO BANNER                                                   */}
      {/* ------------------------------------------------------------------ */}
      <div
        style={{
          background:   colorWithOpacity('#1e3a5f', 0.3),
          border:       `1px solid ${colorWithOpacity('#1e40af', 0.3)}`,
          borderRadius: 8,
          padding:      12,
        }}
        className="flex items-start gap-2"
      >
        {/* Info icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          style={{ width: 14, height: 14, flexShrink: 0, marginTop: 1 }}
          className="text-blue-400"
        >
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0
               11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001
               1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
            clipRule="evenodd"
          />
        </svg>

        {/* Text */}
        <p className="text-xs m-0" style={{ lineHeight: 1.5 }}>
          <span className="font-semibold" style={{ color: '#93c5fd' }}>
            Protocol Resilient Interoperable State Machine:
          </span>
          <span style={{ color: 'rgba(191,219,254,0.7)' }}>
            {' '}In a full SOVEREIGN deployment, this state machine drives
            automatic cross-chain execution routing. State transitions trigger
            protocol-level migration — your financial state survives any single
            chain failure.
          </span>
        </p>
      </div>
    </div>
  )
}
