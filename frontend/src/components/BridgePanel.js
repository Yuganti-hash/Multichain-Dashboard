/**
 * frontend/src/components/BridgePanel.js
 * ==========================================
 * PRISM Bridge — cross-chain asset transfer UI powered by LayerZero V2.
 *
 * Sections
 * --------
 *   A) Header      — Title, subtitle, Simulation Mode badge
 *   B) Chain Selector — From / To dropdowns with chain colour dots
 *   C) Amount Input — ETH amount + "Get Quote" button
 *   D) Quote Display — fee breakdown, time, validity, Execute button
 *   E) TX Status   — hash, status badge, explorer links, auto-poll every 10 s
 *   F) Simulation Note — Phase 4 disclaimer footer
 *
 * Props
 * -----
 *   isConnected   {boolean} — whether a wallet is currently connected
 *   walletAddress {string}  — connected wallet address (may be null)
 *
 * API Calls
 * ---------
 *   GET /bridge/quote   — fetch LayerZero fee estimate
 *   GET /bridge/status/{tx_hash}?from_chain=… — poll tx status
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import api, { getChainColor, getChainLabel, formatAddress } from "../services/api";
import { LZ_ENDPOINTS, SUPPORTED_CHAINS } from "../config/layerzero.js";
import useBridge from "../hooks/useBridge";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** How often (ms) to re-poll the bridge status endpoint while a tx is tracked. */
const STATUS_POLL_MS = 10_000;

/** Chains available in the From / To dropdowns — EVM-only (Phase 4). */
const BRIDGE_CHAINS = SUPPORTED_CHAINS; // ["ethereum","polygon","arbitrum","bsc"]

// ---------------------------------------------------------------------------
// Small sub-components / helpers
// ---------------------------------------------------------------------------

/** Coloured dot matching a chain's brand colour. */
function ChainDot({ chain, size = 10 }) {
  return (
    <span
      style={{
        display:       "inline-block",
        width:         size,
        height:        size,
        borderRadius:  "50%",
        backgroundColor: getChainColor(chain),
        flexShrink:    0,
      }}
    />
  );
}

/** Human-readable status badge for a bridge transaction. */
function StatusBadge({ status }) {
  const cfg = {
    pending:   { bg: "#451a03", border: "#d97706", color: "#fbbf24", label: "⏳ Pending"   },
    confirmed: { bg: "#052e16", border: "#16a34a", color: "#4ade80", label: "✅ Confirmed" },
    failed:    { bg: "#450a0a", border: "#dc2626", color: "#f87171", label: "❌ Failed"    },
    not_found: { bg: "#1c1917", border: "#6b7280", color: "#9ca3af", label: "🔍 Not Found" },
  };
  const s = cfg[status] || cfg.not_found;
  return (
    <span
      style={{
        background:   s.bg,
        border:       `1px solid ${s.border}`,
        color:        s.color,
        padding:      "2px 10px",
        borderRadius: 999,
        fontSize:     12,
        fontWeight:   700,
        letterSpacing: "0.03em",
      }}
    >
      {s.label}
    </span>
  );
}

/** Inline spinner used inside buttons. */
function Spinner({ size = 14, color = "#a78bfa" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2.5}
      style={{ animation: "bp-spin 0.75s linear infinite", flexShrink: 0 }}
    >
      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

/**
 * BridgePanel — PRISM Bridge UI widget.
 *
 * @param {{ isConnected: boolean, walletAddress: string|null }} props
 */
export default function BridgePanel({ isConnected = false, walletAddress = null }) {
  // ── State ─────────────────────────────────────────────────────────────────
  const [fromChain,    setFromChain]    = useState("ethereum");
  const [toChain,      setToChain]      = useState("arbitrum");
  const [amount,       setAmount]       = useState("");
  const [quote,        setQuote]        = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError,   setQuoteError]   = useState(null);
  const [txHash,       setTxHash]       = useState(null);
  const [txStatus,     setTxStatus]     = useState(null);

  // Demo-only: local tx-hash input so the user can paste a real hash to watch
  const [txHashInput,  setTxHashInput]  = useState("");

  const [howItWorksOpen, setHowItWorksOpen] = useState(false);

  // ── useBridge hook ────────────────────────────────────────────────────────
  const {
    executeBridge,
    isPending,
    isConfirming,
    isSuccess,
    isError,
    error,
    txHash: bridgeTxHash,
    reset,
  } = useBridge();

  // When bridgeTxHash changes: set txHash state to start polling
  useEffect(() => {
    if (bridgeTxHash) {
      setTxHash(bridgeTxHash);
      setTxHashInput(bridgeTxHash);
    }
  }, [bridgeTxHash]);

  const pollRef    = useRef(null);
  const mountedRef = useRef(true);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // ── Prevent same chain on both sides ─────────────────────────────────────
  const handleFromChainChange = (val) => {
    setFromChain(val);
    if (val === toChain) {
      // Swap to the first chain that isn't val
      setToChain(BRIDGE_CHAINS.find((c) => c !== val) || "arbitrum");
    }
    // Clear stale quote when source chain changes
    setQuote(null);
    setQuoteError(null);
    reset();
  };

  const handleToChainChange = (val) => {
    setToChain(val);
    if (val === fromChain) {
      setFromChain(BRIDGE_CHAINS.find((c) => c !== val) || "ethereum");
    }
    setQuote(null);
    setQuoteError(null);
    reset();
  };

  /** Swap From ↔ To. */
  const swapChains = () => {
    setFromChain(toChain);
    setToChain(fromChain);
    setQuote(null);
    setQuoteError(null);
    reset();
  };

  // ── Amount input — numeric only ───────────────────────────────────────────
  const handleAmountChange = (e) => {
    const val = e.target.value;
    // Allow empty, digits, and a single decimal point
    if (/^(\d*\.?\d*)$/.test(val)) {
      setAmount(val);
      setQuote(null);
      setQuoteError(null);
      reset();
    }
  };

  // ── Fetch bridge quote ────────────────────────────────────────────────────
  const fetchQuote = useCallback(async () => {
    const amtFloat = parseFloat(amount);
    if (!amount || isNaN(amtFloat) || amtFloat <= 0) {
      setQuoteError("Enter a valid amount greater than 0.");
      return;
    }

    setQuoteLoading(true);
    setQuoteError(null);
    setQuote(null);
    reset();

    try {
      const amountWei = BigInt(Math.round(amtFloat * 1e18)).toString();
      const resp = await api.get("/bridge/quote", {
        params: {
          from_chain: fromChain,
          to_chain:   toChain,
          token:      "0x0000000000000000000000000000000000000000",
          amount:     amountWei,
          sender:     walletAddress || "0x0000000000000000000000000000000000000000",
        },
      });
      if (mountedRef.current) setQuote(resp.data);
    } catch (err) {
      if (mountedRef.current) {
        setQuoteError(
          err.response?.data?.detail ||
          err.message ||
          "Failed to fetch quote. Check the API connection."
        );
      }
    } finally {
      if (mountedRef.current) setQuoteLoading(false);
    }
  }, [amount, fromChain, toChain, walletAddress, reset]);

  // ── Poll bridge status ────────────────────────────────────────────────────
  const fetchStatus = useCallback(async (hash, chain) => {
    if (!hash || !chain) return;
    try {
      const resp = await api.get(`/bridge/status/${hash}`, {
        params: { from_chain: chain },
      });
      if (mountedRef.current) setTxStatus(resp.data);
    } catch {
      // Non-fatal — keep polling
    }
  }, []);

  // Start / restart polling whenever txHash changes
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (!txHash) { setTxStatus(null); return; }

    // Immediate fetch, then every STATUS_POLL_MS
    fetchStatus(txHash, fromChain);
    pollRef.current = setInterval(() => fetchStatus(txHash, fromChain), STATUS_POLL_MS);

    return () => clearInterval(pollRef.current);
  }, [txHash, fromChain, fetchStatus]);

  // Stop polling when tx reaches a terminal state
  useEffect(() => {
    if (txStatus?.status === "confirmed" || txStatus?.status === "failed") {
      clearInterval(pollRef.current);
    }
  }, [txStatus]);

  // ── "Execute Bridge" — Calling the wired hook ────────────────────────────
  const handleExecuteBridge = () => {
    executeBridge({ fromChain, toChain, amount, quote });
  };

  // ── Track custom tx hash entered by the user ──────────────────────────────
  const trackCustomHash = () => {
    const h = txHashInput.trim();
    if (!h.startsWith("0x") || h.length !== 66) {
      alert("Invalid tx hash — must start with 0x and be 66 characters.");
      return;
    }
    setTxHash(h);
  };

  // ── Formatters ─────────────────────────────────────────────────────────────
  const fmtEth = (wei) => {
    if (wei == null) return "—";
    return (Number(wei) / 1e18).toFixed(6) + " ETH";
  };

  const fmtTime = (secs) => {
    if (!secs) return "—";
    if (secs < 60) return `~${secs}s`;
    return `~${Math.round(secs / 60)} min`;
  };

  const fmtDate = (iso) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleTimeString();
    } catch {
      return iso;
    }
  };

  // ── Styles (shared tokens) ────────────────────────────────────────────────
  const S = {
    card: {
      background:   "linear-gradient(135deg, #0f0c1a 0%, #12101f 100%)",
      border:       "1px solid #2d2450",
      borderRadius: 20,
      padding:      "28px 28px 24px",
      color:        "#e2e8f0",
      fontFamily:   "'Inter', 'Segoe UI', sans-serif",
      position:     "relative",
      overflow:     "hidden",
    },
    section: {
      background:   "rgba(255,255,255,0.03)",
      border:       "1px solid rgba(255,255,255,0.07)",
      borderRadius: 14,
      padding:      "18px 20px",
      marginBottom: 16,
    },
    label: {
      fontSize:     11,
      fontWeight:   700,
      letterSpacing: "0.08em",
      color:        "#6366f1",
      textTransform: "uppercase",
      marginBottom:  6,
    },
    select: {
      background:    "#1a1730",
      border:        "1px solid #3730a3",
      borderRadius:  10,
      color:         "#e2e8f0",
      padding:       "10px 14px",
      fontSize:      14,
      fontWeight:    600,
      width:         "100%",
      cursor:        "pointer",
      outline:       "none",
      appearance:    "none",
      WebkitAppearance: "none",
    },
    input: {
      background:   "#1a1730",
      border:       "1px solid #3730a3",
      borderRadius: 10,
      color:        "#e2e8f0",
      padding:      "10px 14px",
      fontSize:     15,
      fontWeight:   500,
      outline:      "none",
      width:        "100%",
      boxSizing:    "border-box",
    },
    btn: {
      background:    "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
      border:        "none",
      borderRadius:  10,
      color:         "#fff",
      padding:       "10px 20px",
      fontSize:      13,
      fontWeight:    700,
      cursor:        "pointer",
      display:       "flex",
      alignItems:    "center",
      gap:           7,
      letterSpacing: "0.04em",
      whiteSpace:    "nowrap",
      transition:    "opacity 0.15s",
    },
    btnDisabled: {
      opacity:  0.45,
      cursor:   "not-allowed",
    },
    btnSecondary: {
      background: "rgba(99,102,241,0.15)",
      border:     "1px solid #4338ca",
      borderRadius: 10,
      color:      "#a5b4fc",
      padding:    "8px 16px",
      fontSize:   12,
      fontWeight: 600,
      cursor:     "pointer",
      whiteSpace: "nowrap",
    },
    row: {
      display:     "flex",
      alignItems:  "center",
      gap:         10,
    },
    divider: {
      height:     1,
      background: "rgba(255,255,255,0.06)",
      margin:     "14px 0",
    },
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Keyframe for spinner — injected once */}
      <style>{`
        @keyframes bp-spin { to { transform: rotate(360deg); } }
        @keyframes bp-pulse { 0%,100%{opacity:1} 50%{opacity:.45} }
        .bp-select-wrap { position: relative; }
        .bp-select-wrap::after {
          content: "▾";
          position: absolute;
          right: 12px; top: 50%;
          transform: translateY(-50%);
          color: #6366f1;
          pointer-events: none;
          font-size: 12px;
        }
        .bp-btn:hover:not(:disabled) { opacity: 0.85; }
        .bp-link { color: #818cf8; text-decoration: none; font-size: 12px; }
        .bp-link:hover { text-decoration: underline; }
      `}</style>

      <div style={S.card}>

        {/* ── Ambient glow ── */}
        <div style={{
          position:   "absolute",
          top:        -80,
          right:      -80,
          width:      260,
          height:     260,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />

        {/* ══════════════════════════════════════════════════════════════════
            A) HEADER
        ══════════════════════════════════════════════════════════════════ */}
        <div style={{ marginBottom: 22 }}>
          <div style={{ ...S.row, marginBottom: 6 }}>
            {/* Bridge icon */}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M8 7h12M8 12h12M8 17h12M4 7v.01M4 12v.01M4 17v.01" />
            </svg>
            <h2 style={{
              fontSize:      20,
              fontWeight:    800,
              background:    "linear-gradient(90deg,#a5b4fc,#e879f9)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              margin:        0,
            }}>
              PRISM Bridge
            </h2>

            {/* Simulation Mode badge */}
            <span style={{
              marginLeft:   "auto",
              background:   "#451a03",
              border:       "1px solid #d97706",
              color:        "#fbbf24",
              fontSize:     10,
              fontWeight:   800,
              padding:      "3px 9px",
              borderRadius: 999,
              letterSpacing: "0.08em",
              animation:    "bp-pulse 2.5s ease-in-out infinite",
            }}>
              ⚡ SIMULATION MODE
            </span>
          </div>
          <p style={{ fontSize: 13, color: "#94a3b8", margin: 0, paddingLeft: 32 }}>
            Cross-chain asset transfer powered by&nbsp;
            <span style={{ color: "#a5b4fc", fontWeight: 600 }}>LayerZero V2</span>
          </p>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            B) CHAIN SELECTOR
        ══════════════════════════════════════════════════════════════════ */}
        <div style={S.section}>
          <p style={S.label}>⛓ Route</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 40px 1fr", gap: 10, alignItems: "center" }}>

            {/* From chain */}
            <div>
              <p style={{ fontSize: 11, color: "#64748b", marginBottom: 6, fontWeight: 600 }}>FROM</p>
              <div className="bp-select-wrap">
                <select
                  style={S.select}
                  value={fromChain}
                  onChange={(e) => handleFromChainChange(e.target.value)}
                >
                  {BRIDGE_CHAINS.map((c) => (
                    <option key={c} value={c}>{getChainLabel(c)}</option>
                  ))}
                </select>
              </div>
              {/* Colour dot + endpoint hint */}
              <div style={{ ...S.row, marginTop: 7 }}>
                <ChainDot chain={fromChain} />
                <span style={{ fontSize: 10, color: "#4b5563", fontFamily: "monospace" }}>
                  {(LZ_ENDPOINTS[fromChain] || "").slice(0, 10)}…
                </span>
              </div>
            </div>

            {/* Swap arrow */}
            <div style={{ display: "flex", justifyContent: "center" }}>
              <button
                onClick={swapChains}
                title="Swap chains"
                style={{
                  background:   "rgba(99,102,241,0.15)",
                  border:       "1px solid #4338ca",
                  borderRadius: "50%",
                  width:        36,
                  height:       36,
                  display:      "flex",
                  alignItems:   "center",
                  justifyContent: "center",
                  cursor:       "pointer",
                  color:        "#818cf8",
                  transition:   "background 0.15s",
                }}
              >
                ⇄
              </button>
            </div>

            {/* To chain */}
            <div>
              <p style={{ fontSize: 11, color: "#64748b", marginBottom: 6, fontWeight: 600 }}>TO</p>
              <div className="bp-select-wrap">
                <select
                  style={S.select}
                  value={toChain}
                  onChange={(e) => handleToChainChange(e.target.value)}
                >
                  {BRIDGE_CHAINS.map((c) => (
                    <option key={c} value={c} disabled={c === fromChain}>
                      {getChainLabel(c)}{c === fromChain ? " (same)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ ...S.row, marginTop: 7 }}>
                <ChainDot chain={toChain} />
                <span style={{ fontSize: 10, color: "#4b5563", fontFamily: "monospace" }}>
                  {(LZ_ENDPOINTS[toChain] || "").slice(0, 10)}…
                </span>
              </div>
            </div>
          </div>

          {/* Live chain colour strip */}
          <div style={{
            display:  "flex",
            gap:      4,
            marginTop: 14,
            height:   3,
            borderRadius: 99,
            overflow: "hidden",
          }}>
            <div style={{ flex: 1, background: getChainColor(fromChain), borderRadius: 99 }} />
            <div style={{ flex: 1, background: "linear-gradient(90deg," + getChainColor(fromChain) + "," + getChainColor(toChain) + ")", borderRadius: 99 }} />
            <div style={{ flex: 1, background: getChainColor(toChain), borderRadius: 99 }} />
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            C) AMOUNT INPUT
        ══════════════════════════════════════════════════════════════════ */}
        <div style={S.section}>
          <p style={S.label}>💠 Amount</p>
          <div style={{ ...S.row }}>
            <div style={{ flex: 1, position: "relative" }}>
              <input
                id="bridge-amount-input"
                type="text"
                inputMode="decimal"
                placeholder="0.0"
                value={amount}
                onChange={handleAmountChange}
                style={S.input}
              />
              <span style={{
                position: "absolute",
                right:    12,
                top:      "50%",
                transform: "translateY(-50%)",
                fontSize: 12,
                color:    "#6366f1",
                fontWeight: 700,
                pointerEvents: "none",
              }}>ETH</span>
            </div>

            <button
              id="bridge-get-quote-btn"
              className="bp-btn"
              style={{
                ...S.btn,
                ...(quoteLoading ? S.btnDisabled : {}),
              }}
              onClick={fetchQuote}
              disabled={quoteLoading}
            >
              {quoteLoading ? <Spinner /> : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19V5a2 2 0 012-2h12a2 2 0 012 2v14" />
                </svg>
              )}
              Get Quote
            </button>
          </div>

          {/* Quote error */}
          {quoteError && (
            <div style={{
              marginTop:  10,
              background: "#450a0a",
              border:     "1px solid #dc2626",
              borderRadius: 8,
              padding:    "8px 12px",
              fontSize:   12,
              color:      "#fca5a5",
              display:    "flex",
              alignItems: "center",
              gap:        6,
            }}>
              ⚠️ {quoteError}
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            D) QUOTE DISPLAY
        ══════════════════════════════════════════════════════════════════ */}
        {quote && (
          <div style={{
            ...S.section,
            border:     "1px solid rgba(99,102,241,0.35)",
            background: "linear-gradient(135deg, rgba(99,102,241,0.07) 0%, rgba(139,92,246,0.05) 100%)",
          }}>
            <div style={{ ...S.row, marginBottom: 14 }}>
              <p style={{ ...S.label, marginBottom: 0 }}>📋 Quote</p>
              {quote.simulated && (
                <span style={{
                  marginLeft:   "auto",
                  background:   "#451a03",
                  border:       "1px solid #b45309",
                  color:        "#fcd34d",
                  fontSize:     10,
                  fontWeight:   700,
                  padding:      "2px 8px",
                  borderRadius: 999,
                }}>
                  🔮 Simulated estimate
                </span>
              )}
            </div>

            {/* Route display */}
            <div style={{
              ...S.row,
              justifyContent: "center",
              gap:            12,
              marginBottom:   14,
              fontSize:       13,
              fontWeight:     600,
            }}>
              <div style={{ ...S.row, gap: 6 }}>
                <ChainDot chain={fromChain} size={8} />
                <span style={{ color: getChainColor(fromChain) }}>{getChainLabel(fromChain)}</span>
              </div>
              <span style={{ color: "#4b5563" }}>→</span>
              <div style={{ ...S.row, gap: 6 }}>
                <ChainDot chain={toChain} size={8} />
                <span style={{ color: getChainColor(toChain) }}>{getChainLabel(toChain)}</span>
              </div>
            </div>

            {/* Fee grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              {[
                {
                  label: "LZ Fee",
                  val:   quote.lz_fee_eth != null ? quote.lz_fee_eth.toFixed(6) + " ETH" : "—",
                  sub:   quote.lz_fee_usd != null ? `$${quote.lz_fee_usd.toFixed(4)} USD` : "",
                  icon:  "⚡",
                },
                {
                  label: "Est. Time",
                  val:   fmtTime(quote.estimated_time_seconds),
                  sub:   "cross-chain delivery",
                  icon:  "⏱",
                },
                {
                  label: "Amount",
                  val:   fmtEth(quote.lz_fee_wei != null ? null : null) || (quote.amount_eth != null ? quote.amount_eth.toFixed(6) + " ETH" : "—"),
                  sub:   `${getChainLabel(fromChain)} → ${getChainLabel(toChain)}`,
                  icon:  "💎",
                },
                {
                  label: "Quote valid until",
                  val:   fmtDate(quote.quote_valid_until),
                  sub:   "refresh for updated fee",
                  icon:  "🕒",
                },
              ].map(({ label, val, sub, icon }) => (
                <div key={label} style={{
                  background:   "rgba(255,255,255,0.03)",
                  border:       "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 10,
                  padding:      "12px 14px",
                }}>
                  <p style={{ fontSize: 10, color: "#6b7280", fontWeight: 700, marginBottom: 4 }}>{icon} {label.toUpperCase()}</p>
                  <p style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0", margin: 0 }}>{val}</p>
                  {sub && <p style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>{sub}</p>}
                </div>
              ))}
            </div>

            {/* Simulated fallback reason */}
            {quote.simulated && quote.fallback_reason && (
              <div style={{
                fontSize:   11,
                color:      "#92400e",
                background: "#1c1007",
                border:     "1px solid #78350f",
                borderRadius: 8,
                padding:    "6px 10px",
                marginBottom: 12,
                wordBreak:  "break-all",
              }}>
                ℹ️ Fallback: {quote.fallback_reason}
              </div>
            )}

            {/* Execute Bridge button */}
            <button
              id="bridge-execute-btn"
              className="bp-btn"
              style={{
                ...S.btn,
                width:          "100%",
                justifyContent: "center",
                padding:        "12px 20px",
                fontSize:       14,
                background: isSuccess
                  ? "linear-gradient(135deg, #052e16 0%, #16a34a 100%)"
                  : isError
                  ? "linear-gradient(135deg, #450a0a 0%, #dc2626 100%)"
                  : isConnected
                  ? "linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%)"
                  : "#1e1b4b",
                ...((isConnected && !isPending && !isConfirming && !isSuccess) ? {} : S.btnDisabled),
              }}
              onClick={isConnected && !isPending && !isConfirming && !isSuccess ? handleExecuteBridge : undefined}
              disabled={!isConnected || isPending || isConfirming || isSuccess}
              title={
                !isConnected
                  ? "Connect wallet to execute bridge"
                  : isPending
                  ? "Waiting for wallet signature"
                  : isConfirming
                  ? "Confirming transaction on-chain"
                  : isSuccess
                  ? "Transaction confirmed successfully!"
                  : "Execute bridge"
              }
            >
              {isPending && (
                <>
                  <Spinner size={14} color="#ffffff" />
                  <span>Waiting for signature...</span>
                </>
              )}
              {isConfirming && (
                <>
                  <Spinner size={14} color="#ffffff" />
                  <span>Confirming transaction...</span>
                </>
              )}
              {isSuccess && (
                <>
                  <span style={{ color: "#4ade80", fontWeight: "bold", marginRight: 4 }}>✓</span>
                  <span>Bridge initiated!</span>
                </>
              )}
              {isError && (
                <>
                  <span style={{ color: "#f87171", fontWeight: "bold", marginRight: 4 }}>✕</span>
                  <span style={{ textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                    Error: {error?.message || "Bridge failed"}
                  </span>
                </>
              )}
              {!isPending && !isConfirming && !isSuccess && !isError && (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round"
                      d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span>{isConnected ? "Execute Bridge" : "Connect Wallet to Execute"}</span>
                </>
              )}
            </button>

            {/* Success message banner */}
            {isSuccess && (
              <div style={{
                marginTop:  12,
                background: "#052e16",
                border:     "1px solid #16a34a",
                borderRadius: 8,
                padding:    "10px 14px",
                fontSize:   12,
                color:      "#4ade80",
                display:    "flex",
                alignItems: "flex-start",
                gap:        8,
                lineHeight: 1.5,
              }}>
                <span style={{ fontSize: 14, flexShrink: 0 }}>✅</span>
                <div>
                  <strong style={{ display: "block", marginBottom: 2 }}>Bridge Initiated!</strong>
                  <span>Transaction has been successfully submitted. You can track its status in the panel below.</span>
                </div>
              </div>
            )}

            {/* Error message banner */}
            {isError && error && (
              <div style={{
                marginTop:  12,
                background: "#450a0a",
                border:     "1px solid #dc2626",
                borderRadius: 8,
                padding:    "10px 14px",
                fontSize:   12,
                color:      "#fca5a5",
                display:    "flex",
                alignItems: "flex-start",
                gap:        8,
                lineHeight: 1.5,
              }}>
                <span style={{ fontSize: 14, flexShrink: 0 }}>⚠️</span>
                <div>
                  <strong style={{ display: "block", marginBottom: 2 }}>Execution Failed</strong>
                  <span>{error.message}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            E) TX STATUS TRACKER
        ══════════════════════════════════════════════════════════════════ */}
        <div style={S.section}>
          <p style={S.label}>🔍 Track Transaction</p>

          {/* Custom hash input */}
          <div style={{ ...S.row, marginBottom: txHash ? 14 : 0 }}>
            <input
              id="bridge-txhash-input"
              type="text"
              placeholder="0x… (66 chars) — paste a tx hash to track"
              value={txHashInput}
              onChange={(e) => setTxHashInput(e.target.value)}
              style={{ ...S.input, fontSize: 12, fontFamily: "monospace" }}
            />
            <button
              id="bridge-track-btn"
              style={S.btnSecondary}
              onClick={trackCustomHash}
            >
              Track
            </button>
          </div>

          {/* Status panel */}
          {txHash && (
            <div style={{
              background:   "rgba(255,255,255,0.02)",
              border:       "1px solid rgba(255,255,255,0.08)",
              borderRadius: 12,
              padding:      "16px 18px",
            }}>
              {/* Hash row */}
              <div style={{ ...S.row, marginBottom: 12 }}>
                <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>TX HASH</span>
                <span style={{
                  fontFamily: "monospace",
                  fontSize:   12,
                  color:      "#a5b4fc",
                  background: "#1e1b4b",
                  padding:    "3px 9px",
                  borderRadius: 6,
                  marginLeft: "auto",
                }}>
                  {formatAddress(txHash)}
                </span>
              </div>

              {/* Status badge row */}
              {txStatus ? (
                <>
                  <div style={{ ...S.row, marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                    <StatusBadge status={txStatus.status} />
                    {txStatus.confirmations > 0 && (
                      <span style={{
                        fontSize:   11,
                        color:      "#4ade80",
                        background: "#052e16",
                        border:     "1px solid #16a34a",
                        padding:    "2px 8px",
                        borderRadius: 999,
                        fontWeight: 700,
                      }}>
                        {txStatus.confirmations} confirmations
                      </span>
                    )}
                    {txStatus.block_number && (
                      <span style={{ fontSize: 11, color: "#6b7280" }}>
                        Block #{txStatus.block_number}
                      </span>
                    )}
                  </div>

                  {/* Message */}
                  <p style={{
                    fontSize:   12,
                    color:      "#94a3b8",
                    margin:     "0 0 12px",
                    lineHeight: 1.5,
                  }}>
                    {txStatus.message}
                  </p>

                  <div style={S.divider} />

                  {/* Explorer links */}
                  <div style={{ ...S.row, flexWrap: "wrap", gap: 10 }}>
                    {txStatus.src_tx_url && txStatus.src_tx_url !== `#${txHash}` && (
                      <a
                        id="bridge-src-explorer-link"
                        className="bp-link"
                        href={txStatus.src_tx_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ ...S.row, gap: 4 }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round"
                            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        View on {getChainLabel(fromChain)} Explorer
                      </a>
                    )}
                    {txStatus.lz_scan_url && (
                      <a
                        id="bridge-lz-scan-link"
                        className="bp-link"
                        href={txStatus.lz_scan_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ ...S.row, gap: 4 }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round"
                            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        View on LayerZero Scan
                      </a>
                    )}

                    {/* Poll indicator */}
                    {txStatus.status === "pending" && (
                      <div style={{ ...S.row, gap: 5, marginLeft: "auto", fontSize: 11, color: "#6b7280" }}>
                        <span style={{
                          width:  7,
                          height: 7,
                          borderRadius: "50%",
                          background: "#d97706",
                          display: "inline-block",
                          animation: "bp-pulse 1s infinite",
                        }} />
                        Auto-refreshing every 10s
                      </div>
                    )}
                  </div>
                </>
              ) : (
                /* Loading state */
                <div style={{ ...S.row, gap: 8, color: "#6b7280", fontSize: 13 }}>
                  <Spinner size={13} color="#6366f1" />
                  Fetching status…
                </div>
              )}
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            F) SIMULATION NOTE
        ══════════════════════════════════════════════════════════════════ */}
        <div style={{
          background:   "#1c1007",
          border:       "1px solid #78350f",
          borderRadius: 10,
          padding:      "10px 14px",
          display:      "flex",
          alignItems:   "flex-start",
          gap:          8,
          fontSize:     11,
          color:        "#92400e",
          lineHeight:   1.6,
        }}>
          <span style={{ fontSize: 14, flexShrink: 0 }}>🔬</span>
          <span>
            <strong style={{ color: "#d97706" }}>Phase 4 simulation mode.</strong>{" "}
            Real bridge execution requires smart contract deployment on testnet.
            Fees shown are LayerZero V2 estimates fetched from the EndpointV2 contract
            (or simulated when RPC is unavailable). No tokens are transferred.
          </span>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            G) HOW IT WORKS COLLAPSIBLE SECTION
        ══════════════════════════════════════════════════════════════════ */}
        <div style={{ marginTop: 14 }}>
          <button
            onClick={() => setHowItWorksOpen(!howItWorksOpen)}
            style={{
              background: "transparent",
              border: "none",
              color: "#a5b4fc",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 8px",
              marginLeft: -8,
              outline: "none",
              transition: "color 0.15s",
            }}
          >
            <span>{howItWorksOpen ? "▼" : "▶"}</span>
            <span>How it works</span>
          </button>
          
          {howItWorksOpen && (
            <div style={{
              marginTop: 10,
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 10,
              padding: "14px 16px",
              fontSize: 12,
              color: "#94a3b8",
              lineHeight: 1.6,
            }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div>
                  <strong style={{ color: "#e2e8f0" }}>Step 1: Quote</strong> — Get LayerZero fee estimate
                </div>
                <div>
                  <strong style={{ color: "#e2e8f0" }}>Step 2: Sign</strong> — Approve transaction in wallet
                </div>
                <div>
                  <strong style={{ color: "#e2e8f0" }}>Step 3: Bridge</strong> — Assets move cross-chain via LayerZero V2 protocol
                </div>
              </div>
              <div style={{
                marginTop: 10,
                paddingTop: 8,
                borderTop: "1px solid rgba(255,255,255,0.06)",
                fontSize: 11,
                color: "#64748b",
              }}>
                ℹ️ In simulation mode, no real transaction is sent.
              </div>
            </div>
          )}
        </div>

      </div>
    </>
  );
}
