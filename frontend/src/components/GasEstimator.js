/**
 * frontend/src/components/GasEstimator.js
 * ==========================================
 * Real-time Ethereum gas price estimator widget.
 *
 * Fetches GET /gas on mount and refreshes every 30 seconds.
 * Renders three speed-tier cards: Slow / Normal / Fast.
 * "Normal" is highlighted as the recommended tier.
 *
 * States
 * ------
 *   loading   — first fetch in progress (skeleton shimmer)
 *   refreshing — subsequent background refresh (animated pulse dot)
 *   error     — fetch failed (user-friendly fallback message)
 *   data      — live estimates rendered
 *
 * No props required. Placement: below the SearchBar in App.js.
 */

import React, { useState, useEffect, useRef } from "react";
import api from "../services/api"; // reuses base URL + X-API-Key

// ---------------------------------------------------------------------------
// Tier configuration
// ---------------------------------------------------------------------------

const TIERS = [
  {
    key:         "slow",
    label:       "Slow",
    recommended: false,
    icon:        "🐢",
    accent:      { border: "#374151", bg: "#111827", badge: "#1f2937", text: "#9ca3af" },
  },
  {
    key:         "normal",
    label:       "Normal",
    recommended: true,
    icon:        "⚡",
    accent:      { border: "#3b82f6", bg: "#0f1f3d", badge: "#1e3a8a", text: "#93c5fd" },
  },
  {
    key:         "fast",
    label:       "Fast",
    recommended: false,
    icon:        "🚀",
    accent:      { border: "#8b5cf6", bg: "#1a0f3d", badge: "#2e1065", text: "#c4b5fd" },
  },
];

// Refresh interval in milliseconds (30 s)
const REFRESH_MS = 30_000;

// ---------------------------------------------------------------------------
// Helper — format wait time
// ---------------------------------------------------------------------------

function formatWait(minutes) {
  if (minutes < 1) return `~${Math.round(minutes * 60)}s`;
  return `~${minutes} min`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * GasEstimator — always-visible gas price widget.
 * No props.
 */
export default function GasEstimator() {
  const [gasData,    setGasData]    = useState(null);   // { slow, normal, fast }
  const [loading,    setLoading]    = useState(true);   // initial load
  const [refreshing, setRefreshing] = useState(false);  // background refresh
  const [error,      setError]      = useState(false);
  const intervalRef  = useRef(null);
  const mountedRef   = useRef(true);

  // ── Fetch ────────────────────────────────────────────────────────────────

  const fetchGas = async (isBackground = false) => {
    if (!mountedRef.current) return;

    if (isBackground) setRefreshing(true);
    else              setLoading(true);

    try {
      const response = await api.get("/gas");
      if (!mountedRef.current) return;
      setGasData(response.data);
      setError(false);
    } catch {
      if (!mountedRef.current) return;
      setError(true);
    } finally {
      if (!mountedRef.current) return;
      setLoading(false);
      setRefreshing(false);
    }
  };

  // ── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => {
    mountedRef.current = true;
    fetchGas(false);                                 // initial load

    // Schedule background refresh every 30 s
    intervalRef.current = setInterval(() => fetchGas(true), REFRESH_MS);

    return () => {
      mountedRef.current  = false;
      clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Loading skeleton ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-4 w-24 bg-gray-800 rounded animate-pulse" />
          <div className="h-3 w-16 bg-gray-800 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="bg-gray-900 border border-gray-800 rounded-xl p-4 animate-pulse"
            >
              <div className="h-3 w-12 bg-gray-800 rounded mb-3" />
              <div className="h-6 w-20 bg-gray-700 rounded mb-2" />
              <div className="h-3 w-16 bg-gray-800 rounded mb-1" />
              <div className="h-3 w-10 bg-gray-800 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────

  if (error && !gasData) {
    return (
      <div className="mb-8 flex items-center gap-2 text-gray-500 text-sm">
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20A10 10 0 0012 2z" />
        </svg>
        Gas data unavailable — will retry automatically
      </div>
    );
  }

  // ── Render cards ─────────────────────────────────────────────────────────

  return (
    <div className="mb-8">

      {/* ── Section header ── */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
            ⛽ Gas Estimator
          </h3>
          <span className="text-xs text-gray-600">· ETH transfer · 21,000 gas</span>
        </div>

        {/* Refresh indicator */}
        <div className="flex items-center gap-1.5 text-xs text-gray-600">
          {refreshing ? (
            <>
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500" />
              </span>
              Refreshing…
            </>
          ) : (
            <>
              <span className="relative flex h-1.5 w-1.5">
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
              </span>
              Live · 30s
            </>
          )}
        </div>
      </div>

      {/* ── Tier cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {TIERS.map((tier) => {
          const data = gasData?.[tier.key];
          const { border, bg, badge, text } = tier.accent;

          return (
            <div
              key={tier.key}
              style={{
                background:   bg,
                borderColor:  border,
                borderWidth:  tier.recommended ? "1.5px" : "1px",
                borderStyle:  "solid",
              }}
              className="relative rounded-xl p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
            >
              {/* Recommended badge */}
              {tier.recommended && (
                <span
                  className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-xs font-bold px-2.5 py-0.5 rounded-full"
                  style={{ backgroundColor: badge, color: text }}
                >
                  Recommended
                </span>
              )}

              {/* Header row */}
              <div className="flex items-center gap-1.5 mb-3 mt-1">
                <span className="text-base leading-none">{tier.icon}</span>
                <span
                  className="text-sm font-bold"
                  style={{ color: text }}
                >
                  {tier.label}
                </span>
              </div>

              {/* Gwei — primary metric */}
              <p className="text-white font-bold text-2xl leading-none mb-1">
                {data ? data.gwei.toFixed(1) : "—"}
                <span className="text-xs font-normal text-gray-500 ml-1">Gwei</span>
              </p>

              {/* USD cost */}
              <p className="text-sm" style={{ color: text }}>
                {data
                  ? `$${data.usd < 0.01 ? data.usd.toFixed(6) : data.usd.toFixed(4)}`
                  : "—"}
                <span className="text-gray-600 text-xs ml-1">USD</span>
              </p>

              {/* Wait time */}
              <p className="text-xs text-gray-600 mt-1.5">
                ⏱ {data ? formatWait(data.minutes) : "—"}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
