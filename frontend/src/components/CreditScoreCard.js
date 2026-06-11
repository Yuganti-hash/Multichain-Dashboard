/**
 * frontend/src/components/CreditScoreCard.js
 * ============================================
 * Renders the CREDEX On-Chain Credit Score card.
 *
 * Reads the `credit_score` object returned by the backend's
 * calculate_credit_score() function (utils/risk.py):
 *
 *   {
 *     score:       number  — 300–850  (bureau-scale integer)
 *     grade:       string  — "A" | "B" | "C" | "D"
 *     label:       string  — "CREDEX On-Chain Credit Score"
 *     max:         number  — 850
 *     tx_count:    number  — transactions used for scoring
 *     chain_count: number  — unique chains detected
 *     token_count: number  — unique tokens detected
 *   }
 *
 * Props:
 *   creditScore {Object} — the credit_score object from portfolio response
 *
 * Returns null when creditScore prop is falsy.
 */

import React, { useEffect, useRef } from "react";

// ---------------------------------------------------------------------------
// Grade metadata — colour palette and human label per grade
// ---------------------------------------------------------------------------
const GRADE_META = {
  A: {
    label:       "Excellent",
    color:       "#22c55e",   // green-500
    bgColor:     "#052e1630", // green tinted bg
    border:      "#22c55e44",
    ringColor:   "#22c55e",
    glow:        "0 0 24px #22c55e33",
  },
  B: {
    label:       "Good",
    color:       "#3b82f6",   // blue-500
    bgColor:     "#1e3a8a20",
    border:      "#3b82f644",
    ringColor:   "#3b82f6",
    glow:        "0 0 24px #3b82f633",
  },
  C: {
    label:       "Fair",
    color:       "#f59e0b",   // amber-500
    bgColor:     "#451a0320",
    border:      "#f59e0b44",
    ringColor:   "#f59e0b",
    glow:        "0 0 24px #f59e0b33",
  },
  D: {
    label:       "Poor",
    color:       "#ef4444",   // red-500
    bgColor:     "#450a0a20",
    border:      "#ef444444",
    ringColor:   "#ef4444",
    glow:        "0 0 24px #ef444433",
  },
};

// Fallback for unexpected grade values
const DEFAULT_META = {
  label:     "Unrated",
  color:     "#6b7280",
  bgColor:   "#1f293740",
  border:    "#6b728044",
  ringColor: "#6b7280",
  glow:      "none",
};

// ---------------------------------------------------------------------------
// Animated score bar sub-component
// ---------------------------------------------------------------------------

/**
 * Fills from 0% to the target width on first render using CSS transition.
 * Min score is 300, max is 850 — bar fills proportionally within that range.
 */
function ScoreBar({ score, max, color }) {
  const barRef  = useRef(null);
  const MIN     = 300;
  const fillPct = Math.min(100, Math.max(0, ((score - MIN) / (max - MIN)) * 100));

  // Animate bar width from 0 → fillPct on mount
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    el.style.width = "0%";
    const id = requestAnimationFrame(() => {
      el.style.transition = "width 1s cubic-bezier(0.4, 0, 0.2, 1)";
      el.style.width       = `${fillPct}%`;
    });
    return () => cancelAnimationFrame(id);
  }, [fillPct]);

  return (
    <div style={{
      width:           "100%",
      height:          10,
      borderRadius:    9999,
      backgroundColor: "#1f2937",
      overflow:        "hidden",
      position:        "relative",
    }}>
      {/* Track marks at 300 / 550 / 650 / 750 / 850 */}
      {[0, 45.5, 63.6, 81.8, 100].map((pct) => (
        <div
          key={pct}
          style={{
            position:        "absolute",
            left:            `${pct}%`,
            top:             0,
            width:           1,
            height:          "100%",
            backgroundColor: "#374151",
            zIndex:          1,
          }}
        />
      ))}

      {/* Filled bar */}
      <div
        ref={barRef}
        style={{
          height:          "100%",
          borderRadius:    9999,
          backgroundColor: color,
          minWidth:        fillPct > 0 ? 6 : 0,
          position:        "relative",
          zIndex:          2,
          boxShadow:       `0 0 8px ${color}88`,
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat pill sub-component
// ---------------------------------------------------------------------------

function StatPill({ icon, value, label }) {
  return (
    <div style={{
      display:         "flex",
      flexDirection:   "column",
      alignItems:      "center",
      gap:             2,
      backgroundColor: "#1f2937",
      border:          "1px solid #374151",
      borderRadius:    10,
      padding:         "8px 14px",
      minWidth:        72,
    }}>
      <span style={{ fontSize: 16, lineHeight: 1 }}>{icon}</span>
      <span style={{
        fontSize:    15,
        fontWeight:  700,
        color:       "#f9fafb",
        fontVariantNumeric: "tabular-nums",
      }}>
        {value}
      </span>
      <span style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * CreditScoreCard — CREDEX On-Chain Credit Score display.
 *
 * @param {{ creditScore: Object }} props
 */
export default function CreditScoreCard({ creditScore }) {
  // Guard: nothing to render without data
  if (!creditScore) return null;

  const {
    score       = 300,
    grade       = "D",
    label       = "CREDEX On-Chain Credit Score",
    max         = 850,
    tx_count    = 0,
    chain_count = 0,
    token_count = 0,
  } = creditScore;

  const meta = GRADE_META[grade] || DEFAULT_META;

  return (
    <div style={{
      backgroundColor: "#111827",
      border:          `1px solid ${meta.border}`,
      borderRadius:    16,
      padding:         "24px",
      boxShadow:       meta.glow,
      marginBottom:    24,
    }}>

      {/* ── Header ───────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Credit card icon */}
          <div style={{
            width:          32,
            height:         32,
            borderRadius:   8,
            background:     `linear-gradient(135deg, ${meta.color}cc, ${meta.color}66)`,
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            flexShrink:     0,
          }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="3" width="14" height="10" rx="2" stroke="white" strokeWidth="1.3" fill="none" opacity="0.9"/>
              <line x1="1" y1="6.5" x2="15" y2="6.5" stroke="white" strokeWidth="1.2" opacity="0.8"/>
              <rect x="3" y="9" width="4" height="1.5" rx="0.75" fill="white" opacity="0.7"/>
            </svg>
          </div>

          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: "#f9fafb", margin: 0 }}>
              CREDEX
            </p>
            <p style={{ fontSize: 11, color: "#6b7280", margin: 0, marginTop: 1 }}>
              {label}
            </p>
          </div>
        </div>

        {/* Grade badge — right side */}
        <div style={{
          display:         "flex",
          flexDirection:   "column",
          alignItems:      "center",
          gap:             2,
          backgroundColor: meta.bgColor,
          border:          `2px solid ${meta.border}`,
          borderRadius:    12,
          padding:         "6px 18px",
          boxShadow:       meta.glow,
        }}>
          <span style={{
            fontSize:    28,
            fontWeight:  900,
            color:       meta.color,
            lineHeight:  1,
            fontFamily:  "system-ui, sans-serif",
          }}>
            {grade}
          </span>
          <span style={{
            fontSize:    10,
            fontWeight:  600,
            color:       meta.color,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            opacity:     0.85,
          }}>
            {meta.label}
          </span>
        </div>
      </div>

      {/* ── Score number + bar ────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>

        {/* Score number row */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 10 }}>
          <span style={{
            fontSize:    38,
            fontWeight:  900,
            color:       meta.color,
            lineHeight:  1,
            fontVariantNumeric: "tabular-nums",
          }}>
            {score.toLocaleString("en-US")}
          </span>
          <span style={{ fontSize: 16, color: "#4b5563", fontWeight: 500 }}>
            / {max}
          </span>
        </div>

        {/* Animated fill bar */}
        <ScoreBar score={score} max={max} color={meta.color} />

        {/* Scale labels */}
        <div style={{
          display:        "flex",
          justifyContent: "space-between",
          marginTop:      5,
        }}>
          {["300", "550", "650", "750", "850"].map((n) => (
            <span key={n} style={{ fontSize: 9, color: "#4b5563", fontVariantNumeric: "tabular-nums" }}>
              {n}
            </span>
          ))}
        </div>
      </div>

      {/* ── Stat pills row ────────────────────────────────────────────── */}
      <div style={{
        display:   "flex",
        gap:       10,
        flexWrap:  "wrap",
      }}>
        <StatPill icon="⛓️" value={chain_count} label="Chains" />
        <StatPill icon="🪙" value={token_count}  label="Tokens" />
        <StatPill icon="🔁" value={tx_count}     label="Txns"   />
      </div>

      {/* ── Grade scale legend ────────────────────────────────────────── */}
      <div style={{
        marginTop:       16,
        paddingTop:      14,
        borderTop:       "1px solid #1f2937",
        display:         "flex",
        gap:             16,
        flexWrap:        "wrap",
      }}>
        {Object.entries(GRADE_META).map(([g, m]) => (
          <div key={g} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{
              width:           8,
              height:          8,
              borderRadius:    "50%",
              backgroundColor: m.color,
              display:         "inline-block",
              boxShadow:       grade === g ? `0 0 6px ${m.color}` : "none",
              flexShrink:      0,
            }} />
            <span style={{
              fontSize:   11,
              color:      grade === g ? m.color : "#4b5563",
              fontWeight: grade === g ? 700 : 400,
            }}>
              {g} — {m.label}
            </span>
          </div>
        ))}
        <span style={{ fontSize: 11, color: "#374151", marginLeft: "auto" }}>
          Scale: 300–850
        </span>
      </div>
    </div>
  );
}
