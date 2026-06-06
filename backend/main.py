"""
MultiChain Dashboard — FastAPI Backend
========================================
Entry point for the MultiChain Dashboard API.
Aggregates portfolio data across Ethereum, Polygon, BSC, and Solana,
enriches it with live USD prices, and computes a risk score.

Run with:
    uvicorn main:app --reload --port 8000
"""

import asyncio
import os

# ---------------------------------------------------------------------------
# Load .env FIRST — before any project modules that call os.getenv() at
# import time (ethereum.py, polygon.py, bsc.py, solana.py all read their
# API keys the moment they are imported, so dotenv must run before that).
# ---------------------------------------------------------------------------
from dotenv import load_dotenv
load_dotenv()

import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# ---------------------------------------------------------------------------
# Chain modules — each exposes get_portfolio() and get_transactions()
# ---------------------------------------------------------------------------
from chains import ethereum, polygon, bsc, solana, arbitrum

# ---------------------------------------------------------------------------
# Utility modules
# ---------------------------------------------------------------------------
from utils import prices as prices_util
from utils import risk as risk_util
from utils import compliance
from utils import lumina
from ai_advisor import ask_advisor, is_advisor_ready
from state_machine import StateMachine

# (load_dotenv() already called above, before chain imports)

# ---------------------------------------------------------------------------
# App initialisation
# ---------------------------------------------------------------------------
app = FastAPI(
    title="MultiChain Dashboard API",
    description="Aggregate blockchain portfolio data across EVM chains and Solana.",
    version="1.0.0",
)

# ---------------------------------------------------------------------------
# CORS — allow all origins in development.
# Tighten this to specific frontend origins before going to production.
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],        # All origins allowed (dev only)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Startup event
# ---------------------------------------------------------------------------
@app.on_event("startup")
async def on_startup():
    """Print a startup banner so operators know the server is live."""
    print("MultiChain Dashboard API running on port 8000")


# ---------------------------------------------------------------------------
# Global exception handler
# Catches any unhandled exception and returns a structured JSON error.
# ---------------------------------------------------------------------------
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    Catch-all handler for unexpected server errors.
    Extracts the wallet address from the path (if present) for easier debugging.
    """
    # Try to pull the wallet address from the route path parameters
    wallet_address = request.path_params.get("wallet_address", "unknown")

    return JSONResponse(
        status_code=500,
        content={
            "error": str(exc),
            "wallet": wallet_address,
        },
    )


# ===========================================================================
# ROUTE 1 — GET /portfolio/{wallet_address}
# ===========================================================================
@app.get("/portfolio/{wallet_address}", summary="Get full multi-chain portfolio")
async def get_portfolio(wallet_address: str):
    """
    Aggregate the portfolio for a given wallet across all supported chains.

    Steps:
      1. Fetch portfolio data from all 4 chains concurrently via asyncio.gather().
      2. Collect every unique token symbol from the results.
      3. Fetch live USD prices for those symbols from CoinGecko.
      4. Compute per-token USD values and total portfolio value.
      5. Build a chain breakdown (value_usd + percentage per chain).
      6. Compute a risk score (LOW / MEDIUM / HIGH) from the breakdown.
      7. Return a unified JSON response.
    """
    try:
        # ------------------------------------------------------------------
        # Step 1 — Fetch all four chains in parallel.
        # Each get_portfolio() returns:
        #   { "chain": str, "tokens": list, "nfts": list, "native_balance": float }
        # ------------------------------------------------------------------
        eth_data, poly_data, bsc_data, sol_data, arb_data = await asyncio.gather(
            ethereum.get_portfolio(wallet_address),
            polygon.get_portfolio(wallet_address),
            bsc.get_portfolio(wallet_address),
            solana.get_portfolio(wallet_address),
            arbitrum.get_portfolio(wallet_address),
        )

        all_chains: list[dict] = [eth_data, poly_data, bsc_data, sol_data, arb_data]

        # ------------------------------------------------------------------
        # Step 2 — Collect unique token symbols across all chains.
        # Token objects are expected to carry at least: symbol, amount.
        # ------------------------------------------------------------------
        unique_symbols: set[str] = set()
        for chain_data in all_chains:
            for token in chain_data.get("tokens", []):
                symbol = token.get("symbol", "").upper()
                if symbol:
                    unique_symbols.add(symbol)

        # ------------------------------------------------------------------
        # Step 3 — Fetch live USD prices for every symbol we found.
        # get_prices() returns a dict: { "ETH": 3200.00, "MATIC": 0.85, ... }
        # Also fetch LUMINA liquidity data concurrently.
        # ------------------------------------------------------------------
        prices, lumina_data = await asyncio.gather(
            prices_util.get_prices(list(unique_symbols)),
            lumina.get_liquidity_data(),
        )

        # ------------------------------------------------------------------
        # Step 4 — Compute USD value for each token; build flat token list.
        # ------------------------------------------------------------------
        all_tokens: list[dict] = []   # Flat list with chain label attached
        all_nfts:   list[dict] = []   # Flat list with chain label attached
        chain_value_map: dict[str, float] = {}  # chain_name -> total USD value

        for chain_data in all_chains:
            chain_name = chain_data.get("chain", "unknown")
            chain_total = 0.0

            for token in chain_data.get("tokens", []):
                symbol  = token.get("symbol", "").upper()
                amount  = float(token.get("amount", 0))
                usd_price = prices.get(symbol, 0.0)
                usd_value = amount * usd_price

                enriched_token = {
                    **token,            # Preserve all original fields
                    "chain":     chain_name,
                    "usd_price": usd_price,
                    "usd_value": usd_value,
                }
                all_tokens.append(enriched_token)
                chain_total += usd_value

            # Collect NFTs with chain label (no price calculation for NFTs)
            for nft in chain_data.get("nfts", []):
                all_nfts.append({**nft, "chain": chain_name})

            chain_value_map[chain_name] = chain_total

        # ------------------------------------------------------------------
        # Step 5 — Total portfolio value across all chains.
        # ------------------------------------------------------------------
        total_value_usd: float = sum(chain_value_map.values())

        # ------------------------------------------------------------------
        # Step 6 — Build chain_breakdown list with percentages.
        # ------------------------------------------------------------------
        chain_breakdown: list[dict] = []
        for chain_name, value_usd in chain_value_map.items():
            percentage = (
                round((value_usd / total_value_usd) * 100, 2)
                if total_value_usd > 0
                else 0.0
            )
            chain_breakdown.append(
                {
                    "chain":      chain_name,
                    "value_usd":  round(value_usd, 2),
                    "percentage": percentage,
                }
            )

        # ------------------------------------------------------------------
        # Step 7 — Compute risk score from chain concentration data.
        # calculate_risk() returns one of: "LOW", "MEDIUM", "HIGH"
        # ------------------------------------------------------------------
        risk_score: str = risk_util.calculate_risk(chain_breakdown)

        # VERTEX compliance screening
        vertex = compliance.check_compliance(wallet_address)

        # PRISM health score — chain-agnostic resilience rating
        prism_health = risk_util.calculate_prism_health_score(chain_breakdown, all_tokens)

        # CREDEX On-Chain Credit Score
        credit_score = risk_util.calculate_credit_score(
            all_tokens, eth_data.get("transactions", []))

        # Build Protocol Resilient Interoperable State Machine
        sm = StateMachine(
            wallet=wallet_address,
            chain_breakdown=chain_breakdown,
            prism_health=prism_health,
        )
        state_machine = sm.to_dict()

        # ------------------------------------------------------------------
        # Final response
        # ------------------------------------------------------------------
        return {
            "wallet":          wallet_address,
            "total_value_usd": round(total_value_usd, 2),
            "risk_score":      risk_score,
            "vertex":          vertex,
            "prism_health":    prism_health,
            "credit_score":    credit_score,
            "lumina":          lumina_data,
            "zk_proof":        compliance.generate_zk_proof(
                                   wallet_address,
                                   total_value_usd,
                                   risk_score,
                               ),
            "chain_breakdown": chain_breakdown,
            "tokens":          all_tokens,
            "nfts":            all_nfts,
            "prices":          prices,
            "state_machine":   state_machine,
        }

    except HTTPException:
        # Re-raise FastAPI HTTP exceptions (e.g., 404) without wrapping
        raise
    except ValueError as exc:
        # Bad input — treat as a client error
        raise HTTPException(status_code=400, detail=f"Invalid request: {exc}") from exc
    except Exception as exc:
        # Unexpected server-side error
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch portfolio for {wallet_address}: {exc}",
        ) from exc


# ===========================================================================
# ROUTE 2 — GET /transactions/{wallet_address}
# ===========================================================================
@app.get("/transactions/{wallet_address}", summary="Get recent Ethereum transactions")
async def get_transactions(wallet_address: str):
    """
    Return the last 10 Ethereum transactions for the given wallet.

    Each transaction contains:
      { hash, from, to, value_eth, timestamp, chain }

    Currently scoped to Ethereum only — extend to other chains as needed.
    """
    try:
        # Fetch last 10 transactions from the Ethereum chain module
        transactions: list[dict] = await ethereum.get_transactions(wallet_address)

        return {
            "wallet":       wallet_address,
            "transactions": transactions,
        }

    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid request: {exc}") from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch transactions for {wallet_address}: {exc}",
        ) from exc


# ===========================================================================
# ROUTE 3 — GET /health
# ===========================================================================
@app.get("/health", summary="Health check")
async def health_check():
    """
    Simple health-check endpoint.
    Returns 200 OK with the API version — useful for load balancers and monitoring.
    """
    return {"status": "ok", "version": "1.0.0"}


# ===========================================================================
# ROUTE 4 — POST /ai/analyze
# ===========================================================================
@app.post("/ai/analyze", summary="AI portfolio analysis")
async def ai_analyze(request: dict):
    """
    AI portfolio analysis endpoint.
    Powered by JULIUS-inspired AutoGen agent architecture.

    Body: {
        "question": str,
        "portfolio_data": dict,      # from /portfolio/{wallet}
        "conversation_history": list  # optional, list of {role, content}
    }
    """
    question             = request.get("question", "").strip()
    portfolio_data       = request.get("portfolio_data", {})
    conversation_history = request.get("conversation_history", [])

    if not question:
        raise HTTPException(status_code=400, detail="question is required")

    # Check if AI is available
    if not is_advisor_ready():
        # Return a rule-based fallback when OpenAI key is missing
        fallback = _rule_based_fallback(question, portfolio_data)
        return {
            "message":    fallback,
            "tool_calls": [],
            "model":      "rule-based-fallback",
            "engine":     "fallback",
            "ai_ready":   False,
        }

    result = await ask_advisor(question, portfolio_data, conversation_history)

    if result is None:
        fallback = _rule_based_fallback(question, portfolio_data)
        return {
            "message":    fallback,
            "tool_calls": [],
            "model":      "rule-based-fallback",
            "engine":     "fallback",
            "ai_ready":   False,
        }

    result["ai_ready"] = True
    return result


def _rule_based_fallback(question: str, portfolio: dict) -> str:
    """
    Rule-based responses when OpenAI key is not set.
    Ensures the UI still works without an API key.
    """
    q = question.lower()

    risk    = portfolio.get("risk_score", "UNKNOWN")
    total   = portfolio.get("total_value_usd", 0)
    prism   = portfolio.get("prism_health", {})
    p_score = prism.get("overall_score", 0)
    p_rec   = prism.get("recommendation", "")
    chains  = portfolio.get("chain_breakdown", [])
    active  = [c for c in chains if c.get("value_usd", 0) > 0]

    if any(w in q for w in ["risk", "safe", "dangerous"]):
        return (
            f"**Risk Score: {risk}**\n\n"
            f"Your portfolio spans {len(active)} active chain(s). "
            f"{'Spreading across more chains reduces risk.' if len(active) < 3 else 'Good diversification across chains.'}\n\n"
            f"PRISM Health: {p_score}/100 — {p_rec}"
        )

    if any(w in q for w in ["prism", "health", "score", "ready"]):
        return (
            f"**PRISM Health Score: {p_score}/100**\n\n"
            f"{p_rec}\n\n"
            f"Scores \u2265 70 = PRISM READY. "
            f"This means your portfolio is resilient enough to migrate "
            f"across chains if one fails."
        )

    if any(w in q for w in ["value", "worth", "total", "much"]):
        return (
            f"**Total Portfolio Value: ${total:,.2f} USD**\n\n"
            f"Spread across {len(active)} chain(s):\n"
            + "\n".join(
                f"- {c['chain'].upper()}: ${c['value_usd']:,.2f} ({c['percentage']:.1f}%)"
                for c in chains if c.get("value_usd", 0) > 0
            )
        )

    if any(w in q for w in ["rebalance", "improve", "better", "advice", "suggest"]):
        return (
            f"**Rebalancing Advice**\n\n"
            f"Current PRISM Score: {p_score}/100\n\n"
            f"{p_rec}\n\n"
            f"To improve: spread assets across Ethereum, Polygon, BNB Chain, "
            f"and Solana. No single chain should hold more than 60% of your total value."
        )

    # Default
    return (
        f"**Portfolio Overview**\n\n"
        f"Total Value: ${total:,.2f} | Risk: {risk} | PRISM Score: {p_score}/100\n\n"
        f"Ask me about: risk score, PRISM health, chain breakdown, "
        f"rebalancing advice, or token values."
    )


# ---------------------------------------------------------------------------
# Uvicorn runner (used when executing directly: `python main.py`)
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",   # Bind to all interfaces
        port=8000,
        reload=True,       # Hot-reload on source changes (dev only)
        log_level="info",
    )
