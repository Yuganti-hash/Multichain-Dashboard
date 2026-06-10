/**
 * frontend/src/components/ErrorBoundary.js
 * ==========================================
 * Standard React class-based Error Boundary.
 *
 * Catches any JavaScript errors that occur during rendering of a child
 * component tree and renders a clean fallback UI instead of a blank/crashed
 * screen. Functional components cannot implement getDerivedStateFromError /
 * componentDidCatch, so a class component is required here.
 *
 * Usage
 * -----
 * <ErrorBoundary>
 *   <SomePotentiallyBrokenComponent />
 * </ErrorBoundary>
 */

import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  /**
   * React calls this static method when a child throws during render.
   * Return a state update to record that an error occurred.
   */
  static getDerivedStateFromError(error) {
    return {
      hasError:     true,
      errorMessage: error?.message || "Unknown error",
    };
  }

  /**
   * Called after an error has been thrown by a descendant.
   * Use this to log to an error tracking service (Sentry, etc.) if needed.
   */
  componentDidCatch(error, info) {
    // Log to console in development for easy debugging
    console.error("[ErrorBoundary] Caught error:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            backgroundColor: "#030712",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            fontFamily: "'Inter', 'Segoe UI', sans-serif",
          }}
        >
          <div
            style={{
              maxWidth: 480,
              width: "100%",
              backgroundColor: "#111827",
              border: "1px solid #450a0a",
              borderRadius: 16,
              padding: "36px 32px",
              textAlign: "center",
              boxShadow: "0 8px 32px rgba(239,68,68,0.1)",
            }}
          >
            {/* Error icon */}
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 12,
                background: "linear-gradient(135deg, #7f1d1d, #991b1b)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 20px",
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  stroke="white"
                  d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                />
              </svg>
            </div>

            <h1
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: "#fca5a5",
                margin: "0 0 8px",
              }}
            >
              Something went wrong
            </h1>

            <p
              style={{
                fontSize: 14,
                color: "#6b7280",
                margin: "0 0 24px",
                lineHeight: 1.6,
              }}
            >
              An unexpected error occurred in the dashboard. Try refreshing the
              page — if the problem persists, check the browser console for
              details.
            </p>

            {/* Error detail (collapsed, monospace) */}
            {this.state.errorMessage && (
              <div
                style={{
                  backgroundColor: "#0d1117",
                  border: "1px solid #1f2937",
                  borderRadius: 8,
                  padding: "10px 14px",
                  marginBottom: 24,
                  textAlign: "left",
                }}
              >
                <p
                  style={{
                    fontSize: 11,
                    color: "#4b5563",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    margin: "0 0 4px",
                    fontWeight: 600,
                  }}
                >
                  Error detail
                </p>
                <code
                  style={{
                    fontSize: 12,
                    color: "#ef4444",
                    fontFamily: "monospace",
                    wordBreak: "break-word",
                  }}
                >
                  {this.state.errorMessage}
                </code>
              </div>
            )}

            <button
              onClick={() => window.location.reload()}
              style={{
                display: "inline-block",
                padding: "10px 24px",
                borderRadius: 8,
                background: "linear-gradient(135deg, #1d4ed8, #7c3aed)",
                color: "white",
                fontSize: 14,
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
                letterSpacing: "0.02em",
              }}
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
