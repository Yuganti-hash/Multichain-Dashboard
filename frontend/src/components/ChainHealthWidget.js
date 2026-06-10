/**
 * frontend/src/components/ChainHealthWidget.js
 * =============================================
 * Compact chain telemetry widget — always visible in the dashboard.
 *
 * Props
 * -----
 * chainHealth  {Object|null}  — per-chain map from useChainHealth():
 *                               { ethereum: { is_healthy, latency_ms,
 *                                 block_number, block_time_seconds,
 *                                 gas_price_gwei, last_updated }, ... }
 * isLive       {boolean}      — true when WebSocket is connected
 * isPolling    {boolean}      — true when falling back to HTTP polling
 */

import React, { useState, useEffect, useRef } from "react";

// ---------------------------------------------------------------------------
// Inject keyframe animations once into <head> — guarded to prevent duplicates
// ---------------------------------------------------------------------------
const CHW_STYLE_ID = "chw-keyframes";

// ---------------------------------------------------------------------------
// Chain metadata
// ---------------------------------------------------------------------------
const CHAIN_META = {
  ethereum: { label: "Ethereum", emoji: "Ξ",  color: "#627EEA" },
  polygon:  { label: "Polygon",  emoji: "⬡",  color: "#8247E5" },
  bsc:      { label: "BNB Chain",emoji: "⬡",  color: "#F3BA2F" },
  solana:   { label: "Solana",   emoji: "◎",  color: "#9945FF" },
  arbitrum: { label: "Arbitrum", emoji: "A",  color: "#28A0F0" },
};

const CHAIN_ORDER = ["ethereum", "polygon", "bsc", "solana", "arbitrum"];

// ---------------------------------------------------------------------------
// Utility formatters
// ---------------------------------------------------------------------------

/** Format a block number with comma separators: 21345678 → "21,345,678" */
function fmtBlock(n) {
  if (n == null || n === 0) return "—";
  return Number(n).toLocaleString("en-US");
}

/** Format block time in seconds: 0.5 → "0.50s", 12 → "12.0s" */
function fmtBlockTime(s) {
  if (s == null || s < 0) return "—";
  return s < 10 ? `${s.toFixed(2)}s` : `${s.toFixed(1)}s`;
}

/** Format gas price in Gwei: 25.4 → "25.4" */
function fmtGas(gwei) {
  if (gwei == null || gwei < 0) return "—";
  return gwei < 1 ? gwei.toFixed(3) : gwei.toFixed(1);
}

/** Format last-updated ISO string to a short "HH:MM:SS UTC" */
function fmtTimestamp(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: "UTC",
    }) + " UTC";
  } catch {
    return "—";
  }
}

// ---------------------------------------------------------------------------
// Status badge colours
// ---------------------------------------------------------------------------

function getStatus(data) {
  if (!data)                         return "unknown";
  if (!data.is_healthy)              return "failed";
  if ((data.latency_ms ?? 0) > 2000) return "degraded";
  return "healthy";
}

const STATUS_STYLES = {
  healthy:  { bg: "#052e1620", border: "#22c55e40", text: "#22c55e", label: "Healthy"  },
  degraded: { bg: "#451a0320", border: "#f59e0b40", text: "#f59e0b", label: "Degraded" },
  failed:   { bg: "#450a0a20", border: "#ef444440", text: "#ef4444", label: "Failed"   },
  unknown:  { bg: "#1f293740", border: "#6b728040", text: "#6b7280", label: "Unknown"  },
};

// ---------------------------------------------------------------------------
// Latency bar
// ---------------------------------------------------------------------------

/**
 * Visual latency bar — fills proportionally, colour-coded:
 *   green  < 500 ms
 *   amber  500–2000 ms
 *   red    > 2000 ms (or unhealthy)
 */
function LatencyBar({ latencyMs, isHealthy }) {
  if (latencyMs == null || latencyMs < 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{
          width: 80, height: 6, borderRadius: 999,
          backgroundColor: "#374151",
        }} />
        <span style={{ fontSize: 11, color: "#6b7280", fontVariantNumeric: "tabular-nums" }}>—</span>
      </div>
    );
  }

  const ms = Math.round(latencyMs);
  // Cap the bar at 4 000 ms for display purposes
  const pct = Math.min(100, (latencyMs / 4_000) * 100);

  const color = !isHealthy || latencyMs > 2_000 ? "#ef4444"
              : latencyMs > 500                  ? "#f59e0b"
              :                                    "#22c55e";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{
        width: 80, height: 6, borderRadius: 999,
        backgroundColor: "#1f2937",
        overflow: "hidden",
        flexShrink: 0,
      }}>
        <div style={{
          width: `${pct}%`,
          height: "100%",
          borderRadius: 999,
          backgroundColor: color,
          transition: "width 0.4s ease, background-color 0.3s ease",
          minWidth: pct > 0 ? 4 : 0,
        }} />
      </div>
      <span style={{
        fontSize: 11,
        color,
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
      }}>
        {ms.toLocaleString("en-US")} ms
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton row
// ---------------------------------------------------------------------------

function SkeletonRow({ idx }) {
  return (
    <tr style={{
      animation: `chw-pulse 1.5s ease-in-out ${idx * 0.1}s infinite`,
    }}>
      {[40, 70, 80, 60, 100, 70].map((w, i) => (
        <td key={i} style={{ padding: "10px 12px" }}>
          <div style={{
            width: w, height: 12, borderRadius: 4,
            backgroundColor: "#1f2937",
          }} />
        </td>
      ))}
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Single chain row
// ---------------------------------------------------------------------------

/**
 * @param {{ chain: string, data: Object|null, flash: boolean }} props
 */
function ChainRow({ chain, data, flash }) {
  const meta   = CHAIN_META[chain] || { label: chain, emoji: "?", color: "#6b7280" };
  const status = getStatus(data);
  const badge  = STATUS_STYLES[status];

  return (
    <tr
      style={{
        transition: "background-color 0.6s ease",
        backgroundColor: flash ? "rgba(99,102,241,0.08)" : "transparent",
      }}
    >
      {/* Chain name + icon */}
      <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 28, height: 28,
              borderRadius: "50%",
              backgroundColor: meta.color + "22",
              border: `1px solid ${meta.color}44`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 700,
              color: meta.color,
              flexShrink: 0,
            }}
          >
            {meta.emoji}
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#e5e7eb" }}>
            {meta.label}
          </span>
        </div>
      </td>

      {/* Block number */}
      <td style={{ padding: "10px 12px" }}>
        <span style={{
          fontSize: 12, color: "#9ca3af",
          fontVariantNumeric: "tabular-nums",
          fontFamily: "monospace",
        }}>
          {fmtBlock(data?.block_number)}
        </span>
      </td>

      {/* Block time */}
      <td style={{ padding: "10px 12px" }}>
        <span style={{
          fontSize: 12, color: "#9ca3af",
          fontVariantNumeric: "tabular-nums",
        }}>
          {fmtBlockTime(data?.block_time_seconds)}
        </span>
      </td>

      {/* Gas (EVM only — Solana shows em-dash) */}
      <td style={{ padding: "10px 12px" }}>
        {chain === "solana" ? (
          <span style={{ fontSize: 12, color: "#4b5563" }}>—</span>
        ) : (
          <span style={{
            fontSize: 12, color: "#9ca3af",
            fontVariantNumeric: "tabular-nums",
          }}>
            {fmtGas(data?.gas_price_gwei)}{" "}
            {data?.gas_price_gwei != null && data.gas_price_gwei >= 0 && (
              <span style={{ color: "#6b7280", fontSize: 10 }}>Gwei</span>
            )}
          </span>
        )}
      </td>

      {/* Latency bar */}
      <td style={{ padding: "10px 12px" }}>
        <LatencyBar
          latencyMs={data?.latency_ms ?? null}
          isHealthy={data?.is_healthy ?? true}
        />
      </td>

      {/* Status badge */}
      <td style={{ padding: "10px 12px" }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 11,
            fontWeight: 600,
            padding: "3px 8px",
            borderRadius: 9999,
            backgroundColor: badge.bg,
            border: `1px solid ${badge.border}`,
            color: badge.text,
            whiteSpace: "nowrap",
          }}
        >
          {/* Dot indicator */}
          <span
            style={{
              width: 6, height: 6,
              borderRadius: "50%",
              backgroundColor: badge.text,
              flexShrink: 0,
              ...(status === "healthy" ? {
                animation: "chw-ping 1.5s ease-in-out infinite",
              } : {}),
            }}
          />
          {badge.label}
        </span>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Live / Polling pill (mirrors App.js header pill)
// ---------------------------------------------------------------------------

function FeedPill({ isLive, isPolling }) {
  if (!isLive && !isPolling) return null;

  const pill = isLive
    ? { bg: "#052e1644", border: "#22c55e55", text: "#22c55e", label: "● Live" }
    : { bg: "#451a0344", border: "#f59e0b55", text: "#f59e0b", label: "● Polling" };

  return (
    <span style={{
      fontSize: 11, fontWeight: 600,
      padding: "2px 8px",
      borderRadius: 9999,
      backgroundColor: pill.bg,
      border: `1px solid ${pill.border}`,
      color: pill.text,
      letterSpacing: "0.02em",
    }}>
      {pill.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * ChainHealthWidget
 *
 * @param {{
 *   chainHealth : Object|null,
 *   isLive      : boolean,
 *   isPolling   : boolean,
 * }} props
 */
export default function ChainHealthWidget({ chainHealth, isLive, isPolling }) {
  // Inject keyframe CSS once on mount; clean up on unmount
  useEffect(() => {
    if (document.getElementById(CHW_STYLE_ID)) return; // guard: already injected
    const style = document.createElement("style");
    style.id = CHW_STYLE_ID;
    style.textContent = `
      @keyframes chw-pulse {
        0%, 100% { opacity: 1; }
        50%       { opacity: 0.4; }
      }
      @keyframes chw-ping {
        0%, 100% { opacity: 1;   transform: scale(1);    }
        50%       { opacity: 0.6; transform: scale(1.35); }
      }
    `;
    document.head.appendChild(style);
    return () => {
      const el = document.getElementById(CHW_STYLE_ID);
      if (el) el.remove();
    };
  }, []);

  // Track which rows flashed (chain name → flash boolean)
  const [flashMap, setFlashMap] = useState({});
  const prevDataRef = useRef(null);

  // Derive the "last updated" timestamp from the first chain that has one
  const lastUpdated = chainHealth
    ? Object.values(chainHealth).find((d) => d?.last_updated)?.last_updated ?? null
    : null;

  // ── Flash animation on data change ──────────────────────────────────────
  useEffect(() => {
    if (!chainHealth) return;

    const prev = prevDataRef.current;
    const newFlash = {};

    CHAIN_ORDER.forEach((chain) => {
      const cur  = chainHealth[chain];
      const old  = prev?.[chain];
      if (!cur) return;
      // Flash if block_number changed or this is the first snapshot
      if (!old || old.block_number !== cur.block_number || old.latency_ms !== cur.latency_ms) {
        newFlash[chain] = true;
      }
    });

    if (Object.keys(newFlash).length > 0) {
      setFlashMap(newFlash);
      // Remove flash flag after 700 ms so the CSS transition fades out
      const t = setTimeout(() => setFlashMap({}), 700);
      return () => clearTimeout(t);
    }
  }, [chainHealth]);

  // Store previous snapshot for comparison
  useEffect(() => {
    if (chainHealth) prevDataRef.current = chainHealth;
  }, [chainHealth]);

  return (
    <>
      <div style={{
        backgroundColor: "#111827",
        border: "1px solid #1f2937",
        borderRadius: 16,
        overflow: "hidden",
        boxShadow: "0 4px 24px rgba(0,0,0,0.35)",
      }}>

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 20px",
          borderBottom: "1px solid #1f2937",
          background: "linear-gradient(90deg, #0f172a 0%, #111827 100%)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Satellite dish icon */}
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: "linear-gradient(135deg, #1d4ed8, #7c3aed)",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="6" cy="10" r="2" fill="white" opacity="0.9" />
                <path d="M9 7 Q12 4 14 2" stroke="white" strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />
                <path d="M10 9 Q13 8 15 6" stroke="white" strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
                <path d="M8 11 Q8 14 9 15" stroke="white" strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />
              </svg>
            </div>

            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: "#f9fafb", margin: 0 }}>
                Chain Telemetry
              </p>
              <p style={{ fontSize: 11, color: "#6b7280", margin: 0, marginTop: 1 }}>
                {lastUpdated
                  ? `Updated ${fmtTimestamp(lastUpdated)}`
                  : chainHealth
                  ? "Live feed connected"
                  : "Waiting for data…"}
              </p>
            </div>
          </div>

          {/* Live / Polling pill */}
          <FeedPill isLive={isLive} isPolling={isPolling} />
        </div>

        {/* ── Table ───────────────────────────────────────────────────── */}
        <div style={{ overflowX: "auto" }}>
          <table style={{
            width: "100%",
            borderCollapse: "collapse",
            tableLayout: "auto",
          }}>
            {/* Column headers */}
            <thead>
              <tr style={{ borderBottom: "1px solid #1f2937" }}>
                {["Chain", "Block", "Block Time", "Gas", "Latency", "Status"].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "8px 12px",
                      textAlign: "left",
                      fontSize: 11,
                      fontWeight: 600,
                      color: "#4b5563",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      whiteSpace: "nowrap",
                      backgroundColor: "#0d1117",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {/* Skeleton rows while chainHealth is null */}
              {!chainHealth && CHAIN_ORDER.map((_, idx) => (
                <SkeletonRow key={idx} idx={idx} />
              ))}

              {/* Live data rows */}
              {chainHealth && CHAIN_ORDER.map((chain) => (
                <ChainRow
                  key={chain}
                  chain={chain}
                  data={chainHealth[chain] ?? null}
                  flash={!!flashMap[chain]}
                />
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Footer legend ────────────────────────────────────────────── */}
        <div style={{
          padding: "10px 20px",
          borderTop: "1px solid #1f2937",
          backgroundColor: "#0d1117",
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}>
          {[
            { color: "#22c55e", label: "< 500 ms" },
            { color: "#f59e0b", label: "500–2000 ms" },
            { color: "#ef4444", label: "> 2000 ms / Failed" },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{
                width: 24, height: 5, borderRadius: 999,
                backgroundColor: color, opacity: 0.8,
              }} />
              <span style={{ fontSize: 11, color: "#6b7280" }}>{label}</span>
            </div>
          ))}
          <span style={{ fontSize: 11, color: "#374151", marginLeft: "auto" }}>
            Latency bar scale: 0–4 000 ms
          </span>
        </div>
      </div>
    </>
  );
}
