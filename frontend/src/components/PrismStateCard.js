/**
 * frontend/src/components/PrismStateCard.js
 * ==========================================
 * Displays the PRISM state object built by prism_state.build_prism_state()
 * on the backend. Shows:
 *   - active_chain
 *   - degraded_chains list
 *   - recommended_migration (when not null)
 *
 * Props
 * -----
 * prismState {Object} — portfolio.prism_state from the backend response:
 *   {
 *     active_chain:          string | null,
 *     degraded_chains:       string[],
 *     recommended_migration: string | null,
 *     ... (other fields ignored here)
 *   }
 */

import React from "react";

export default function PrismStateCard({ prismState }) {
  if (!prismState) return null;

  const {
    active_chain          = null,
    degraded_chains       = [],
    recommended_migration = null,
  } = prismState;

  const hasDegraded   = Array.isArray(degraded_chains) && degraded_chains.length > 0;
  const hasMigration  = recommended_migration && recommended_migration !== "none";

  return (
    <div
      style={{
        backgroundColor: "#111827",
        border: "1px solid #1f2937",
        borderRadius: 16,
        padding: "20px 24px",
        boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: "linear-gradient(135deg, #1d4ed8, #7c3aed)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {/* Shield icon */}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M8 1.5L2 4v4c0 3.3 2.5 6.4 6 7 3.5-.6 6-3.7 6-7V4L8 1.5z"
              fill="white"
              opacity="0.9"
            />
          </svg>
        </div>
        <div>
          <p style={{ fontSize: 14, fontWeight: 700, color: "#f9fafb", margin: 0 }}>
            PRISM State
          </p>
          <p style={{ fontSize: 11, color: "#6b7280", margin: 0, marginTop: 1 }}>
            Protocol Resilient Interoperable State Machine
          </p>
        </div>
      </div>

      {/* Body */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

        {/* Active Chain */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: "#6b7280", minWidth: 140 }}>Active Chain</span>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: active_chain ? "#34d399" : "#6b7280",
              textTransform: "capitalize",
            }}
          >
            {active_chain ?? "—"}
          </span>
        </div>

        {/* Degraded Chains */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <span style={{ fontSize: 12, color: "#6b7280", minWidth: 140, paddingTop: 2 }}>
            Degraded Chains
          </span>
          {hasDegraded ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {degraded_chains.map((ch) => (
                <span
                  key={ch}
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: 9999,
                    backgroundColor: "#451a0320",
                    border: "1px solid #f59e0b40",
                    color: "#f59e0b",
                    textTransform: "capitalize",
                  }}
                >
                  {ch}
                </span>
              ))}
            </div>
          ) : (
            <span style={{ fontSize: 12, color: "#22c55e" }}>None</span>
          )}
        </div>

        {/* Recommended Migration — only shown when non-null */}
        {hasMigration && (
          <div
            style={{
              marginTop: 4,
              padding: "10px 14px",
              borderRadius: 10,
              backgroundColor: "#1d4ed810",
              border: "1px solid #3b82f630",
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              style={{ flexShrink: 0, marginTop: 1 }}
            >
              <path
                d="M8 1v9M5 7l3 3 3-3M2 13h12"
                stroke="#60a5fa"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div>
              <p style={{ fontSize: 11, color: "#60a5fa", fontWeight: 600, margin: 0 }}>
                Recommended Migration
              </p>
              <p
                style={{
                  fontSize: 12,
                  color: "#93c5fd",
                  margin: 0,
                  marginTop: 3,
                  textTransform: "capitalize",
                }}
              >
                {recommended_migration}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
