/**
 * frontend/src/components/TokenTable.js
 * =======================================
 * Sortable, filterable table of all tokens held across chains.
 *
 * Features:
 *   - Per-chain filter buttons (All / Ethereum / Polygon / BNB Chain / Solana)
 *   - Free-text search against symbol and name
 *   - Sortable columns: Value (default desc), Symbol, Amount, Chain
 *   - Graceful empty state when no tokens match filters
 *
 * Props:
 *   tokens {Array}  — flat token list from portfolio response
 *   prices {Object} — symbol → USD price map (optional; falls back to 0)
 */

import React, { useState, useMemo } from "react";
import { formatUSD, getChainColor, getChainLabel } from "../services/api";

// ---------------------------------------------------------------------------
// Chain filter options
// ---------------------------------------------------------------------------
const CHAIN_FILTERS = [
  { value: "all",      label: "All"       },
  { value: "ethereum", label: "Ethereum"  },
  { value: "polygon",  label: "Polygon"   },
  { value: "bsc",      label: "BNB Chain" },
  { value: "solana",   label: "Solana"    },
];

// ---------------------------------------------------------------------------
// Sort arrow indicator
// ---------------------------------------------------------------------------
function SortArrow({ field, sortField, sortDir }) {
  if (sortField !== field) return <span className="ml-1 text-gray-600">↕</span>;
  return (
    <span className="ml-1 text-blue-400">
      {sortDir === "asc" ? "↑" : "↓"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Amount formatter helper
// ---------------------------------------------------------------------------
function formatAmount(amount) {
  if (amount == null) return "—";
  return amount >= 1 ? amount.toFixed(4) : amount.toFixed(8);
}

// ===========================================================================
// Main component
// ===========================================================================

/**
 * TokenTable — sortable, filterable token holdings table.
 *
 * @param {{ tokens: Array, prices: Object }} props
 */
export default function TokenTable({ tokens, prices }) {
  // ── State ─────────────────────────────────────────────────────────────────
  const [sortField,   setSortField]   = useState("value");
  const [sortDir,     setSortDir]     = useState("desc");
  const [filterChain, setFilterChain] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // ── Sort toggle ───────────────────────────────────────────────────────────
  const toggleSort = (field) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  // ── Computed token list ───────────────────────────────────────────────────
  const tokensWithValue = useMemo(() => {
    // Guard against undefined/null tokens prop
    const raw = tokens || [];

    // 1. Enrich each token with price + USD value
    let enriched = raw.map((token) => {
      const price     = prices?.[token.symbol] || 0;
      const value_usd = (token.amount || 0) * price;
      return { ...token, price, value_usd };
    });

    // 2. Filter by chain
    if (filterChain !== "all") {
      enriched = enriched.filter((t) => t.chain === filterChain);
    }

    // 3. Filter by search query (symbol or name, case-insensitive)
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      enriched = enriched.filter(
        (t) =>
          (t.symbol || "").toLowerCase().includes(q) ||
          (t.name   || "").toLowerCase().includes(q)
      );
    }

    // 4. Sort
    enriched.sort((a, b) => {
      let valA, valB;
      switch (sortField) {
        case "symbol": valA = (a.symbol || "").toLowerCase(); valB = (b.symbol || "").toLowerCase(); break;
        case "amount": valA = a.amount    || 0;               valB = b.amount    || 0;               break;
        case "chain":  valA = (a.chain  || "").toLowerCase(); valB = (b.chain  || "").toLowerCase(); break;
        case "value":
        default:       valA = a.value_usd || 0;               valB = b.value_usd || 0;               break;
      }
      if (valA < valB) return sortDir === "asc" ? -1 :  1;
      if (valA > valB) return sortDir === "asc" ?  1 : -1;
      return 0;
    });

    return enriched;
  }, [tokens, prices, filterChain, searchQuery, sortField, sortDir]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ── Section title + count badge ──────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-bold text-base">Token Holdings</h3>
        <span className="text-xs bg-gray-800 text-gray-400 px-3 py-1 rounded-full font-medium">
          {tokensWithValue.length} token{tokensWithValue.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Chain filter buttons ──────────────────────────────────────── */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {CHAIN_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilterChain(f.value)}
            className={`
              px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150
              ${filterChain === f.value
                ? "bg-blue-600 text-white"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
              }
            `}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ── Search input ─────────────────────────────────────────────── */}
      <div className="mb-4">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search tokens..."
          className="
            w-full md:w-64 bg-gray-800 border border-gray-700 rounded-lg
            px-3 py-2 text-white placeholder-gray-500 text-sm
            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
            transition-all duration-200
          "
        />
      </div>

      {/* ── Table ────────────────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-xl border border-gray-800">
        <table className="w-full text-sm">

          {/* thead */}
          <thead className="bg-gray-900 border-b border-gray-800">
            <tr>
              {/* Token — sortable */}
              <th
                className={`
                  px-4 py-3 text-left text-xs font-medium uppercase tracking-wider
                  cursor-pointer select-none hover:text-blue-400 transition-colors
                  ${sortField === "symbol" ? "text-blue-400" : "text-gray-400"}
                `}
                onClick={() => toggleSort("symbol")}
              >
                Token
                <SortArrow field="symbol" sortField={sortField} sortDir={sortDir} />
              </th>

              {/* Chain — sortable */}
              <th
                className={`
                  px-4 py-3 text-left text-xs font-medium uppercase tracking-wider
                  cursor-pointer select-none hover:text-blue-400 transition-colors
                  ${sortField === "chain" ? "text-blue-400" : "text-gray-400"}
                `}
                onClick={() => toggleSort("chain")}
              >
                Chain
                <SortArrow field="chain" sortField={sortField} sortDir={sortDir} />
              </th>

              {/* Amount — sortable */}
              <th
                className={`
                  px-4 py-3 text-right text-xs font-medium uppercase tracking-wider
                  cursor-pointer select-none hover:text-blue-400 transition-colors
                  ${sortField === "amount" ? "text-blue-400" : "text-gray-400"}
                `}
                onClick={() => toggleSort("amount")}
              >
                Amount
                <SortArrow field="amount" sortField={sortField} sortDir={sortDir} />
              </th>

              {/* Price — not sortable */}
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                Price
              </th>

              {/* Value — sortable */}
              <th
                className={`
                  px-4 py-3 text-right text-xs font-medium uppercase tracking-wider
                  cursor-pointer select-none hover:text-blue-400 transition-colors
                  ${sortField === "value" ? "text-blue-400" : "text-gray-400"}
                `}
                onClick={() => toggleSort("value")}
              >
                Value
                <SortArrow field="value" sortField={sortField} sortDir={sortDir} />
              </th>
            </tr>
          </thead>

          {/* tbody */}
          <tbody className="bg-gray-900 divide-y divide-gray-800">
            {tokensWithValue.length === 0 ? (
              /* Empty state */
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center">
                  <p className="text-gray-500 font-medium">No tokens found</p>
                  <p className="text-gray-600 text-xs mt-1">
                    Try adjusting your chain filter or search query.
                  </p>
                </td>
              </tr>
            ) : (
              tokensWithValue.map((token, idx) => {
                const chainColor = getChainColor(token.chain);

                return (
                  <tr
                    key={`${token.token_address || token.symbol}-${token.chain}-${idx}`}
                    className="hover:bg-gray-800/50 transition-colors duration-100"
                  >
                    {/* Token cell */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {/* Symbol initial icon */}
                        <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0">
                          <span className="text-white font-bold text-xs">
                            {(token.symbol || "?").charAt(0).toUpperCase()}
                          </span>
                        </div>

                        {/* Symbol + name */}
                        <div className="min-w-0">
                          <p className="text-white font-semibold leading-none">
                            {token.symbol || "Unknown"}
                          </p>
                          <p
                            className="text-gray-400 text-xs mt-0.5 truncate"
                            style={{ maxWidth: "120px" }}
                            title={token.name}
                          >
                            {token.name || "—"}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Chain cell */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: chainColor }}
                        />
                        <span className="text-gray-400 text-xs">
                          {getChainLabel(token.chain)}
                        </span>
                      </div>
                    </td>

                    {/* Amount cell */}
                    <td className="px-4 py-3 text-right text-gray-300 font-mono text-xs">
                      {formatAmount(token.amount)}
                    </td>

                    {/* Price cell */}
                    <td className="px-4 py-3 text-right">
                      {token.price > 0 ? (
                        <span className="text-gray-300">{formatUSD(token.price)}</span>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>

                    {/* Value cell */}
                    <td className="px-4 py-3 text-right">
                      {token.value_usd > 0.01 ? (
                        <span className="text-white font-semibold">
                          {formatUSD(token.value_usd)}
                        </span>
                      ) : token.value_usd > 0 ? (
                        <span className="text-gray-500">&lt;$0.01</span>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
