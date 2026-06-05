/**
 * frontend/src/App.js
 * ====================
 * Root application shell for MultiChain Dashboard.
 *
 * Orchestrates:
 *   - Global state (wallet, portfolio, transactions, loading, errors, tabs)
 *   - Backend health check on mount
 *   - Wallet search → sequential portfolio + transaction fetches
 *   - Tab-based dashboard layout (Overview / Tokens / NFTs / Transactions)
 *   - Welcome state, loading skeleton, and error display
 */

import React, { useState, useEffect, useCallback } from "react";

import SearchBar          from "./components/SearchBar";
import PortfolioSummary   from "./components/PortfolioSummary";
import ChainBreakdown     from "./components/ChainBreakdown";
import TokenTable         from "./components/TokenTable";
import TransactionHistory from "./components/TransactionHistory";
import { ChainPieChart }  from "./components/PieChart";
import { TokenBarChart }  from "./components/BarChart";
import PrismHealth        from "./components/PrismHealth";
import AiAdvisor          from "./components/AiAdvisor";

import { fetchPortfolio, fetchTransactions, checkHealth } from "./services/api";

// ---------------------------------------------------------------------------
// Chain metadata used in the welcome state
// ---------------------------------------------------------------------------
const CHAINS = [
  { id: "ethereum", label: "Ethereum", color: "#627EEA" },
  { id: "polygon",  label: "Polygon",  color: "#8247E5" },
  { id: "bsc",      label: "BNB Chain", color: "#F3BA2F" },
  { id: "solana",   label: "Solana",   color: "#9945FF" },
];

// Tab definitions
const TABS = [
  { id: "overview",      label: "Overview" },
  { id: "tokens",        label: "Tokens" },
  { id: "nfts",          label: "NFTs" },
  { id: "transactions",  label: "Transactions" },
  { id: "ai",            label: "🧠 AI Advisor" },
];

// ===========================================================================
// NFT image resolver
// ===========================================================================

// IPFS gateways tried in order — first one that loads wins
const IPFS_GATEWAYS = [
  "https://nftstorage.link/ipfs/",
  "https://ipfs.io/ipfs/",
  "https://dweb.link/ipfs/",
  "https://gateway.pinata.cloud/ipfs/",
  "https://cloudflare-ipfs.com/ipfs/",
];

function resolveImage(nft) {
  // Parse metadata if it's a JSON string
  let parsedMetadata = nft.metadata;
  if (typeof parsedMetadata === "string") {
    try { parsedMetadata = JSON.parse(parsedMetadata); } catch { parsedMetadata = {}; }
  }
  parsedMetadata = parsedMetadata || {};

  // Try every known image field in order of reliability
  const candidates = [
    nft.image,
    parsedMetadata.image,
    parsedMetadata.image_url,
    parsedMetadata.animation_url,
    nft.collection_logo,   // OpenSea CDN fallback supplied by backend
  ];

  for (const raw of candidates) {
    if (!raw || typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    // Already a usable HTTP/data URL
    if (trimmed.startsWith("data:") || trimmed.startsWith("https://") || trimmed.startsWith("http://")) return trimmed;
    // Convert IPFS protocol URI → HTTP gateway
    if (trimmed.startsWith("ipfs://")) return IPFS_GATEWAYS[0] + trimmed.slice(7);
    // Handle bare CID (starts with Qm... or baf...)
    if (/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|baf[a-z2-7]{56})/.test(trimmed)) return IPFS_GATEWAYS[0] + trimmed;
  }

  return null;
}

function getGatewayFallbacks(src) {
  // Returns ordered list of URLs to try if current src fails
  if (!src) return [];
  for (const gw of IPFS_GATEWAYS) {
    if (src.startsWith(gw)) {
      const cid = src.slice(gw.length);
      return IPFS_GATEWAYS.filter((g) => g !== gw).map((g) => g + cid);
    }
  }
  return [];
}

// Per-card NFT image component with gateway fallback
function NftImage({ nft }) {
  const initial = resolveImage(nft);
  const [src, setSrc]         = React.useState(initial);
  const [failed, setFailed]   = React.useState(!initial);
  const [loaded, setLoaded]   = React.useState(false);
  const triedRef              = React.useRef(new Set());

  // Reset state when the nft prop changes (e.g. new search)
  React.useEffect(() => {
    const next = resolveImage(nft);
    triedRef.current = new Set();
    setSrc(next);
    setFailed(!next);
    setLoaded(false);
  }, [nft]);

  const handleError = () => {
    if (src) triedRef.current.add(src);
    // Try collection_logo as a direct fallback before IPFS gateways
    const collectionLogo = nft.collection_logo;
    if (collectionLogo && !triedRef.current.has(collectionLogo)) {
      triedRef.current.add(src || "");
      setSrc(collectionLogo);
      return;
    }
    const fallbacks = getGatewayFallbacks(src || initial || "");
    const next = fallbacks.find((u) => !triedRef.current.has(u));
    if (next) {
      setSrc(next);
    } else {
      setFailed(true);
    }
  };

  if (failed || !src) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2"
           style={{ background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e1b4b 100%)" }}>
        {/* NFT placeholder: simple frame + mountain icon */}
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="4" y="4" width="32" height="32" rx="4" stroke="#6366f1" strokeWidth="1.5" fill="none" opacity="0.6"/>
          <circle cx="13" cy="15" r="3" fill="#818cf8" opacity="0.7"/>
          <path d="M4 27 L13 18 L20 24 L26 19 L36 27" stroke="#6366f1" strokeWidth="1.5"
                strokeLinejoin="round" fill="none" opacity="0.8"/>
        </svg>
        <span style={{ fontSize: "10px", color: "#818cf8", fontFamily: "monospace", opacity: 0.8 }}>No Image</span>
      </div>
    );
  }

  return (
    <>
      {/* Shimmer placeholder while image loads */}
      {!loaded && (
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(90deg, #1e1b4b 0%, #312e81 50%, #1e1b4b 100%)",
            backgroundSize: "200% 100%",
            animation: "nft-shimmer 1.5s ease-in-out infinite",
          }}
        />
      )}
      <img
        key={src}
        src={src}
        alt={nft.name || "NFT"}
        className="w-full h-full object-cover"
        style={{ display: loaded ? "block" : "none" }}
        onLoad={() => setLoaded(true)}
        onError={handleError}
        referrerPolicy="no-referrer"
      />
    </>
  );
}

// ===========================================================================
// App component
// ===========================================================================

/**
 * Top-level application component. Renders the header, search bar,
 * dashboard tabs, and footer. All child components receive pre-fetched data.
 */
export default function App() {
  // ── State ─────────────────────────────────────────────────────────────────
  const [walletAddress, setWalletAddress] = useState("");
  const [portfolio,     setPortfolio]     = useState(null);
  const [transactions,  setTransactions]  = useState(null);
  const [loading,       setLoading]       = useState(false);
  const [txLoading,     setTxLoading]     = useState(false); // reserved for future use
  const [error,         setError]         = useState(null);
  const [apiStatus,     setApiStatus]     = useState("checking"); // "ok" | "error" | "checking"
  const [activeTab,     setActiveTab]     = useState("overview");

  // ── Effects ───────────────────────────────────────────────────────────────

  /** Ping the backend once on mount to determine API availability. */
  useEffect(() => {
    (async () => {
      const health = await checkHealth();
      setApiStatus(health.status === "ok" ? "ok" : "error");
    })();
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────

  /**
   * Handle wallet search.
   * Fetches portfolio first, then transactions sequentially so we can
   * display portfolio data immediately without waiting for tx history.
   */
  const handleSearch = useCallback(async (address) => {
    setLoading(true);
    setError(null);
    setPortfolio(null);
    setTransactions(null);
    setWalletAddress(address);
    setActiveTab("overview");

    try {
      // Fetch portfolio (primary — shown first)
      const portfolioData = await fetchPortfolio(address);
      setPortfolio(portfolioData);

      // Fetch transactions sequentially after portfolio is ready
      const txData = await fetchTransactions(address);
      setTransactions(txData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Render the coloured API status indicator dot + label. */
  const renderApiStatus = () => {
    const states = {
      ok:       { color: "bg-green-500",  label: "API Online",  ring: "shadow-green-500/50" },
      error:    { color: "bg-red-500",    label: "API Offline", ring: "shadow-red-500/50" },
      checking: { color: "bg-yellow-400", label: "Checking...", ring: "shadow-yellow-400/50" },
    };
    const { color, label, ring } = states[apiStatus] || states.checking;

    return (
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <span
          className={`relative flex h-2 w-2`}
        >
          <span
            className={`animate-ping absolute inline-flex h-full w-full rounded-full ${color} opacity-75`}
          />
          <span className={`relative inline-flex rounded-full h-2 w-2 ${color}`} />
        </span>
        {label}
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-950 text-white">

      {/* ================================================================
          HEADER — sticky, blurred backdrop
          ================================================================ */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">

          {/* Logo + title */}
          <div className="flex items-center gap-3">
            {/* Brand icon */}
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{
                background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="4"  cy="4"  r="2.5" fill="white" opacity="0.9" />
                <circle cx="12" cy="4"  r="2.5" fill="white" opacity="0.7" />
                <circle cx="4"  cy="12" r="2.5" fill="white" opacity="0.7" />
                <circle cx="12" cy="12" r="2.5" fill="white" opacity="0.5" />
                <line x1="4" y1="4" x2="12" y2="4"  stroke="white" strokeWidth="1" opacity="0.4" />
                <line x1="4" y1="4" x2="4"  y2="12" stroke="white" strokeWidth="1" opacity="0.4" />
                <line x1="4" y1="4" x2="12" y2="12" stroke="white" strokeWidth="1" opacity="0.3" />
              </svg>
            </div>

            {/* Title */}
            <div>
              <div className="flex items-baseline gap-1">
                <span className="font-bold text-lg text-white leading-none">MultiChain</span>
                <span className="font-bold text-lg text-blue-400 leading-none">Dashboard</span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">Unified Portfolio Intelligence</p>
            </div>
          </div>

          {/* API status indicator */}
          {renderApiStatus()}
        </div>
      </header>

      {/* ================================================================
          MAIN CONTENT
          ================================================================ */}
      <main className="max-w-7xl mx-auto px-4 py-8">

        {/* Search bar — always visible */}
        <SearchBar onSearch={handleSearch} loading={loading} />

        {/* ── Error state ─────────────────────────────────────────────── */}
        {error && (
          <div className="mt-6 flex items-start gap-3 bg-red-950/50 border border-red-800 rounded-xl p-4 text-red-300">
            <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <div>
              <p className="font-semibold text-red-200">Failed to fetch portfolio</p>
              <p className="text-sm mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* ── Loading skeleton ─────────────────────────────────────────── */}
        {loading && (
          <div className="mt-8 space-y-4 animate-pulse">
            <p className="text-center text-gray-400 text-sm mb-6">
              Fetching portfolio across all chains...
            </p>
            {/* Summary bar shimmer */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <div className="h-5 bg-gray-700 rounded w-1/4 mb-4" />
              <div className="grid grid-cols-3 gap-4">
                <div className="h-16 bg-gray-800 rounded-lg" />
                <div className="h-16 bg-gray-800 rounded-lg" />
                <div className="h-16 bg-gray-800 rounded-lg" />
              </div>
            </div>
            {/* Charts shimmer */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 h-64" />
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 h-64" />
            </div>
            {/* Table shimmer */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <div className="h-4 bg-gray-700 rounded w-1/5 mb-4" />
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-10 bg-gray-800 rounded-lg mb-2" />
              ))}
            </div>
          </div>
        )}

        {/* ── Dashboard (data loaded) ───────────────────────────────────── */}
        {portfolio && !loading && (
          <div className="mt-8">

            {/* ── Tab navigation ───────────────────────────────────────── */}
            <div className="flex gap-1 border-b border-gray-800 mb-6">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    px-4 py-2.5 text-sm font-medium transition-all duration-200
                    border-b-2 -mb-px
                    ${activeTab === tab.id
                      ? "border-blue-500 text-white"
                      : "border-transparent text-gray-400 hover:text-blue-400 hover:border-gray-600"
                    }
                  `}
                >
                  {tab.label}
                  {/* Badge counts on tabs */}
                  {tab.id === "tokens" && portfolio.tokens?.length > 0 && (
                    <span className="ml-1.5 text-xs bg-gray-700 text-gray-300 rounded-full px-1.5 py-0.5">
                      {portfolio.tokens.length}
                    </span>
                  )}
                  {tab.id === "nfts" && portfolio.nfts?.length > 0 && (
                    <span className="ml-1.5 text-xs bg-gray-700 text-gray-300 rounded-full px-1.5 py-0.5">
                      {portfolio.nfts.length}
                    </span>
                  )}
                  {tab.id === "transactions" && transactions?.transactions?.length > 0 && (
                    <span className="ml-1.5 text-xs bg-gray-700 text-gray-300 rounded-full px-1.5 py-0.5">
                      {transactions.transactions.length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* ── OVERVIEW TAB ─────────────────────────────────────────── */}
            {activeTab === "overview" && (
              <div className="space-y-6 transition-all duration-200">
                <PortfolioSummary portfolio={portfolio} />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <ChainPieChart data={portfolio.chain_breakdown} />
                  <TokenBarChart data={portfolio.tokens} prices={portfolio.prices} />
                </div>

                {portfolio.prism_health && (
                  <PrismHealth prismHealth={portfolio.prism_health} />
                )}

                <ChainBreakdown chainBreakdown={portfolio.chain_breakdown} />
              </div>
            )}

            {/* ── TOKENS TAB ───────────────────────────────────────────── */}
            {activeTab === "tokens" && (
              <div className="transition-all duration-200">
                <TokenTable tokens={portfolio.tokens} prices={portfolio.prices} />
              </div>
            )}

            {/* ── NFTS TAB ─────────────────────────────────────────────── */}
            {activeTab === "nfts" && (
              <div className="transition-all duration-200">
                {portfolio.nfts && portfolio.nfts.length > 0 ? (
                  <>
                    {/* Section header */}
                    <div className="flex items-center justify-between mb-5">
                      <h2 className="text-white font-bold text-lg">
                        NFTs{" "}
                        <span className="text-gray-500 font-normal text-base">
                          ({portfolio.nfts.length} collectible{portfolio.nfts.length !== 1 ? "s" : ""})
                        </span>
                      </h2>
                      <span className="text-xs text-gray-500 font-mono">
                        Ethereum &middot; Polygon
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      {portfolio.nfts.map((nft, idx) => (
                        <div
                          key={`${nft.token_address}-${nft.token_id}-${idx}`}
                          className="group bg-gray-900 border border-gray-800 rounded-xl overflow-hidden
                            hover:border-indigo-500/50 transition-all duration-200
                            hover:shadow-lg hover:shadow-indigo-900/20 hover:-translate-y-0.5"
                        >
                          {/* NFT image */}
                          <div className="relative w-full aspect-square overflow-hidden
                            bg-gradient-to-br from-indigo-950 to-purple-950">
                            <NftImage nft={nft} />
                          </div>

                          {/* NFT details */}
                          <div className="p-3">
                            <p className="font-semibold text-xs text-white truncate leading-snug">
                              {nft.name || "Unnamed NFT"}
                            </p>
                            <p className="text-xs text-gray-600 mt-0.5 font-mono truncate">
                              #{nft.token_id ? String(nft.token_id).slice(0, 10) : "—"}
                            </p>

                            {/* Badges row */}
                            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                              {/* Type badge */}
                              <span className="text-xs px-1.5 py-0.5 rounded font-medium"
                                style={{ backgroundColor: "#1f2937", color: "#9ca3af" }}>
                                {nft.symbol || "NFT"}
                              </span>

                              {/* Chain badge */}
                              <span
                                className="text-xs px-1.5 py-0.5 rounded font-medium uppercase tracking-wide"
                                style={{
                                  backgroundColor:
                                    nft.chain === "ethereum" ? "#627EEA18" :
                                    nft.chain === "polygon"  ? "#8247E518" : "#6B728018",
                                  color:
                                    nft.chain === "ethereum" ? "#627EEA" :
                                    nft.chain === "polygon"  ? "#8247E5" : "#9ca3af",
                                  border: `1px solid ${
                                    nft.chain === "ethereum" ? "#627EEA33" :
                                    nft.chain === "polygon"  ? "#8247E533" : "#6B728033"
                                  }`,
                                }}
                              >
                                {nft.chain}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  /* Empty NFT state */
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-16 text-center">
                    <svg className="w-16 h-16 text-gray-700 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-gray-400 font-medium">No NFTs found in this wallet</p>
                    <p className="text-gray-600 text-sm mt-1">NFTs on Ethereum and Polygon will appear here.</p>
                  </div>
                )}
              </div>
            )}

            {/* ── TRANSACTIONS TAB ─────────────────────────────────────── */}
            {activeTab === "transactions" && (
              <div className="transition-all duration-200">
                <TransactionHistory
                  transactions={transactions?.transactions || []}
                  loading={txLoading}
                />
              </div>
            )}

            {/* ── AI ADVISOR TAB ───────────────────────────────────────── */}
            {activeTab === "ai" && (
              <div className="transition-all duration-200">
                <div className="mb-4">
                  <h2 className="text-white font-bold text-lg">AI Portfolio Advisor</h2>
                  <p className="text-gray-400 text-sm mt-1">
                    Powered by JULIUS's AutoGen architecture — ask anything about your portfolio
                  </p>
                </div>
                <AiAdvisor portfolio={portfolio} />
              </div>
            )}
          </div>
        )}

        {/* ── AI tab — no portfolio loaded yet ─────────────────────────── */}
        {activeTab === "ai" && !portfolio && !loading && (
          <div className="text-center py-20 text-gray-500">
            Search a wallet first to use the AI Advisor
          </div>
        )}

        {/* ── Welcome state — no search yet ────────────────────────────── */}
        {!portfolio && !loading && !error && activeTab !== "ai" && (
          <div className="mt-20 text-center">
            {/* Hero icon */}
            <div
              className="w-20 h-20 rounded-2xl mx-auto mb-8 flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #1d4ed8, #7c3aed)" }}
            >
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                <circle cx="10"  cy="10"  r="6" fill="white" opacity="0.9" />
                <circle cx="30"  cy="10"  r="6" fill="white" opacity="0.7" />
                <circle cx="10"  cy="30"  r="6" fill="white" opacity="0.7" />
                <circle cx="30"  cy="30"  r="6" fill="white" opacity="0.5" />
                <line x1="10" y1="10" x2="30" y2="10" stroke="white" strokeWidth="1.5" opacity="0.5" />
                <line x1="10" y1="10" x2="10" y2="30" stroke="white" strokeWidth="1.5" opacity="0.5" />
                <line x1="10" y1="10" x2="30" y2="30" stroke="white" strokeWidth="1.5" opacity="0.4" />
                <line x1="30" y1="10" x2="30" y2="30" stroke="white" strokeWidth="1.5" opacity="0.4" />
                <line x1="10" y1="30" x2="30" y2="30" stroke="white" strokeWidth="1.5" opacity="0.4" />
              </svg>
            </div>

            <h2 className="text-3xl font-bold text-white mb-3">
              Enter a wallet address to get started
            </h2>
            <p className="text-gray-400 text-lg mb-10">
              Supports Ethereum, Polygon, BNB Chain, and Solana
            </p>

            {/* Chain badges */}
            <div className="flex items-center justify-center gap-3 flex-wrap mb-10">
              {CHAINS.map((chain) => (
                <div
                  key={chain.id}
                  className="flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium"
                  style={{
                    borderColor: chain.color + "44",
                    backgroundColor: chain.color + "11",
                    color: chain.color,
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: chain.color }}
                  />
                  {chain.label}
                </div>
              ))}
            </div>

            {/* Sample address hint */}
            <div className="inline-block bg-gray-900 border border-gray-700 rounded-xl px-6 py-4 text-left max-w-lg">
              <p className="text-xs text-gray-500 mb-1 uppercase tracking-wider font-medium">
                Example — vitalik.eth
              </p>
              <code className="text-sm text-blue-400 break-all select-all">
                0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
              </code>
            </div>
          </div>
        )}
      </main>

      {/* ================================================================
          FOOTER
          ================================================================ */}
      <footer className="mt-16 border-t border-gray-800 py-6 text-center text-gray-600 text-sm">
        MultiChain Dashboard &bull; Powered by{" "}
        <span className="text-gray-500">Moralis</span>,{" "}
        <span className="text-gray-500">Helius</span> &amp;{" "}
        <span className="text-gray-500">CoinGecko</span>
      </footer>
    </div>
  );
}
