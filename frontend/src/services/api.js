/**
 * frontend/src/services/api.js
 * =============================
 * Centralised API service layer for the MultiChain Dashboard frontend.
 *
 * ALL communication with the FastAPI backend flows through this file.
 * Components should never call axios or fetch directly — import from here instead.
 *
 * Exports:
 *   - api              : configured axios instance (named + default)
 *   - fetchPortfolio   : fetch full multi-chain portfolio for a wallet
 *   - fetchTransactions: fetch recent Ethereum transactions for a wallet
 *   - checkHealth      : ping the backend health endpoint
 *   - formatUSD        : format a number as a USD currency string
 *   - formatAddress    : shorten a wallet address for display
 *   - getChainColor    : hex color for a given chain name
 *   - getChainLabel    : human-readable display label for a chain
 *   - getRiskBadgeStyle: style object for rendering risk score badges
 */

import axios from "axios";

// ===========================================================================
// STEP 1 — Axios instance
// ===========================================================================

/**
 * Shared axios instance.
 * baseURL falls back to localhost:8000 if REACT_APP_API_URL is not set in .env
 */
const api = axios.create({
  // In CRA dev mode (localhost:3000) the built-in proxy forwards all unknown
  // requests to localhost:8000, so we use an empty baseURL (same-origin) to
  // avoid CORS entirely.  In production set REACT_APP_API_URL to the real API.
  baseURL: process.env.REACT_APP_API_URL || "",
  timeout: 30000, // 30 seconds — chain API calls can be slow
  headers: {
    "Content-Type": "application/json",
    // Sent with every request when REACT_APP_API_KEY is set in .env.
    // Must match SOVEREIGN_API_KEY in backend/.env.
    // Falls back to "" (empty string) so unauthenticated dev mode still works.
    "X-API-Key": process.env.REACT_APP_API_KEY || "",
  },
});

// ===========================================================================
// STEP 2 — Request interceptor (logging)
// ===========================================================================

api.interceptors.request.use(
  (config) => {
    const method = (config.method || 'GET').toUpperCase();
    console.log(`[API] Request: ${method} ${config.url}`);
    return config;
  },
  (error) => Promise.reject(error)
);

// ===========================================================================
// STEP 3 — Response interceptor (logging + error normalisation)
// ===========================================================================

api.interceptors.response.use(
  (response) => {
    console.log(`[API] Response: ${response.status} ${response.config.url}`);
    return response;
  },
  (error) => {
    console.log(`[API] Error: ${error.message}`);
    return Promise.reject(error);
  }
);

// ===========================================================================
// STEP 4 — API call functions
// ===========================================================================

/**
 * Fetch the full multi-chain portfolio for a wallet address.
 *
 * Calls: GET /portfolio/{walletAddress}
 *
 * @param {string} walletAddress - The wallet address to look up (EVM or Solana).
 * @returns {Promise<Object>} Portfolio data including tokens, NFTs, chain breakdown, and risk score.
 * @throws {Error} If the wallet address is empty or the API call fails.
 */
export const fetchPortfolio = async (walletAddress) => {
  // Validate input before hitting the network
  if (!walletAddress || walletAddress.trim() === "") {
    throw new Error("Wallet address is required");
  }

  try {
    const response = await api.get(`/portfolio/${walletAddress.trim()}`);
    return response.data;
  } catch (error) {
    throw new Error(
      error.response?.data?.detail ||
        error.message ||
        "Failed to fetch portfolio"
    );
  }
};

/**
 * Fetch the most recent Ethereum transactions for a wallet address.
 *
 * Calls: GET /transactions/{walletAddress}
 *
 * @param {string} walletAddress - The EVM wallet address.
 * @returns {Promise<Object>} Object containing the wallet address and transactions array.
 * @throws {Error} If the wallet address is empty or the API call fails.
 */
export const fetchTransactions = async (walletAddress) => {
  // Validate input before hitting the network
  if (!walletAddress || walletAddress.trim() === "") {
    throw new Error("Wallet address is required");
  }

  try {
    const response = await api.get(`/transactions/${walletAddress.trim()}`);
    return response.data;
  } catch (error) {
    throw new Error(
      error.response?.data?.detail ||
        error.message ||
        "Failed to fetch transactions"
    );
  }
};

/**
 * Ping the backend health endpoint to verify the API is reachable.
 *
 * Calls: GET /health
 *
 * @returns {Promise<Object>} { status: "ok", version: "1.0.0" } on success,
 *                            { status: "error", version: "unknown" } on failure.
 */
export const checkHealth = async () => {
  try {
    const response = await api.get("/health");
    return response.data;
  } catch (error) {
    // Health check failures are non-fatal — return a degraded status object
    return { status: "error", version: "unknown" };
  }
};

// ===========================================================================
// STEP 5 — Utility / helper functions
// ===========================================================================

/**
 * Format a numeric value as a USD currency string.
 *
 * Behaviour:
 *   value >= 1,000,000 → "$1.23M"
 *   value >= 1,000     → "$12,345.67"
 *   0 < value < 1      → "$0.000123"  (6 decimal places for micro-amounts)
 *   null/undefined/NaN → "$0.00"
 *
 * @param {number|null|undefined} value - Numeric USD amount.
 * @returns {string} Formatted currency string.
 */
export const formatUSD = (value) => {
  // Guard against null, undefined, NaN, and non-numeric inputs
  if (value === null || value === undefined || isNaN(Number(value))) {
    return "$0.00";
  }

  const num = Number(value);

  // Millions — compact suffix format
  if (num >= 1_000_000) {
    return (
      "$" +
      new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(num / 1_000_000) +
      "M"
    );
  }

  // Thousands and above — standard currency format
  if (num >= 1_000) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  }

  // Sub-dollar amounts — show 6 decimal places for micro-token values
  if (num < 1 && num > 0) {
    return "$" + num.toFixed(6);
  }

  // Anything else (0, negatives, small positives) — standard 2dp
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

/**
 * Shorten a wallet address for compact display.
 *
 * e.g. "0x1234567890abcdef1234" → "0x1234...cdef"
 *
 * @param {string|null|undefined} address - Full wallet address.
 * @returns {string} Shortened address, or "" if input is falsy.
 */
export const formatAddress = (address) => {
  if (!address) return "";
  // Show first 6 characters and last 4 characters separated by ellipsis
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

/**
 * Return the brand hex color for a given blockchain name.
 *
 * @param {string} chain - Chain identifier ("ethereum", "polygon", "bsc", "solana").
 * @returns {string} Hex color code.
 */
export const getChainColor = (chain) => {
  const colors = {
    ethereum: "#627EEA", // Ethereum blue
    polygon:  "#8247E5", // Polygon purple
    bsc:      "#F3BA2F", // BSC / BNB Chain yellow
    solana:   "#9945FF", // Solana purple
    arbitrum: "#28A0F0", // Arbitrum blue
  };
  return colors[chain?.toLowerCase()] || "#6B7280"; // Default: neutral gray
};

/**
 * Return the human-readable display label for a blockchain.
 *
 * @param {string} chain - Chain identifier ("ethereum", "polygon", "bsc", "solana").
 * @returns {string} Display label, e.g. "Ethereum", "BNB Chain".
 */
export const getChainLabel = (chain) => {
  const labels = {
    ethereum: "Ethereum",
    polygon:  "Polygon",
    bsc:      "BNB Chain",
    solana:   "Solana",
    arbitrum: "Arbitrum",
  };

  if (!chain) return "";

  return (
    labels[chain.toLowerCase()] ||
    chain.charAt(0).toUpperCase() + chain.slice(1)
  );
};

/**
 * Return a style object for rendering a risk score badge in the UI.
 *
 * @param {string} riskScore - One of "LOW", "MEDIUM", "HIGH".
 * @returns {{ backgroundColor: string, color: string, label: string }}
 */
export const getRiskBadgeStyle = (riskScore) => {
  const styles = {
    LOW: {
      backgroundColor: "#dcfce7", // green-100
      color:           "#16a34a", // green-600
      label:           "LOW RISK",
    },
    MEDIUM: {
      backgroundColor: "#fef9c3", // yellow-100
      color:           "#ca8a04", // yellow-600
      label:           "MEDIUM RISK",
    },
    HIGH: {
      backgroundColor: "#fee2e2", // red-100
      color:           "#dc2626", // red-600
      label:           "HIGH RISK",
    },
  };

  return (
    styles[riskScore?.toUpperCase()] || {
      backgroundColor: "#f3f4f6", // gray-100
      color:           "#6b7280", // gray-500
      label:           "UNKNOWN",
    }
  );
};

// ===========================================================================
// Exports
// ===========================================================================

// Named export of the axios instance so consumers can extend it if needed
export { api };

// Default export for convenience: import api from './services/api'
export default api;
