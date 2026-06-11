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
from datetime import datetime, timedelta, timezone

# ---------------------------------------------------------------------------
# Load .env FIRST — before any project modules that call os.getenv() at
# import time (ethereum.py, polygon.py, bsc.py, solana.py all read their
# API keys the moment they are imported, so dotenv must run before that).
# ---------------------------------------------------------------------------
from dotenv import load_dotenv
load_dotenv()

import bcrypt
import uvicorn
from fastapi import Depends, FastAPI, Header, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from jose import JWTError, jwt
from pydantic import BaseModel, EmailStr
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
import json

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

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
from utils import router
from utils import prism_state as prism_state_util
from utils.auth import verify_signature
from utils.gas          import get_gas_estimates
from utils.chain_monitor import get_chain_health, get_all_chains_health
from ai_advisor import ask_advisor, is_advisor_ready
from database import AsyncSessionLocal, close_db, get_db, init_db
from models import HealthScore, PortfolioCache, User, Wallet
from state_machine import StateMachine

# (AsyncSessionLocal, Wallet, PortfolioCache, json, func, pg_insert are already
#  imported above via the database/models/sqlalchemy lines.)


# ---------------------------------------------------------------------------
# JWT configuration — read secret from .env
# ---------------------------------------------------------------------------
JWT_SECRET:    str = os.getenv("JWT_SECRET", "change-me-in-production-sovereign-2025")
JWT_ALGORITHM: str = "HS256"
JWT_EXPIRE_HOURS: int = 24

# (load_dotenv() already called above, before chain imports)

# ---------------------------------------------------------------------------
# Rate limiter — 30 requests / minute per IP
# ---------------------------------------------------------------------------
limiter = Limiter(key_func=get_remote_address, default_limits=["30/minute"])

# ---------------------------------------------------------------------------
# API Key — read from environment
# ---------------------------------------------------------------------------
SOVEREIGN_API_KEY: str | None = os.getenv("SOVEREIGN_API_KEY")

# Routes that bypass API key auth (FastAPI internal + health check + gas + WS + auth)
_AUTH_SKIP_PREFIXES = ("/health", "/docs", "/openapi", "/redoc", "/gas", "/chain-health", "/ws", "/auth")

# ---------------------------------------------------------------------------
# App initialisation
# ---------------------------------------------------------------------------
app = FastAPI(
    title="MultiChain Dashboard API",
    description="Aggregate blockchain portfolio data across EVM chains and Solana.",
    version="1.0.0",
)

# Attach limiter to app state (required by slowapi)
app.state.limiter = limiter
app.add_exception_handler(
    RateLimitExceeded,
    lambda req, exc: JSONResponse(
        status_code=429,
        content={"error": "Rate limit exceeded. Max 30 requests/minute per IP."},
    ),
)

# ---------------------------------------------------------------------------
# CORS — restricted to known frontend origins.
# In production, set ALLOWED_ORIGINS in .env as a comma-separated list:
#   ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
# ---------------------------------------------------------------------------
_env_origins = os.getenv("ALLOWED_ORIGINS", "")
allowed_origins = (
    [o.strip() for o in _env_origins.split(",") if o.strip()]
    if _env_origins
    else [
        "http://localhost:3000",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
    ]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# API Key Authentication middleware
# Checks every request for a valid X-API-Key header.
# Skips auth for /health, /docs, /openapi, and /redoc.
# ---------------------------------------------------------------------------
@app.middleware("http")
async def api_key_middleware(request: Request, call_next):
    # Allow unauthenticated access to health + docs routes
    if request.url.path.startswith(_AUTH_SKIP_PREFIXES):
        return await call_next(request)

    # If no key is configured in .env, skip enforcement (dev convenience)
    if not SOVEREIGN_API_KEY:
        return await call_next(request)

    provided_key = request.headers.get("X-API-Key", "")
    if provided_key != SOVEREIGN_API_KEY:
        return JSONResponse(
            status_code=401,
            content={"error": "Unauthorized. Provide a valid X-API-Key header."},
        )

    return await call_next(request)


# ---------------------------------------------------------------------------
# Startup / Shutdown lifecycle
# ---------------------------------------------------------------------------
@app.on_event("startup")
async def on_startup():
    """
    Application startup handler.

    1. Attempts to create all DB tables if they don't exist (dev/CI convenience).
       Fails gracefully — the app will start even if PostgreSQL is unavailable.
       In production, run `alembic upgrade head` before starting the server.
    2. Prints a startup banner for operator visibility.
    """
    try:
        await init_db()
        print("Database initialised successfully.")
    except Exception as e:
        print(f"[startup] DB unavailable: {e} — running without database.")
        print("[startup] To enable persistence, set DATABASE_URL in .env and start Postgres.")
    print("MultiChain Dashboard API running on port 8000")


@app.on_event("shutdown")
async def on_shutdown():
    """
    Application shutdown handler.

    Gracefully disposes the SQLAlchemy async connection pool
    so all in-flight connections are closed cleanly.
    """
    await close_db()


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
@limiter.limit("30/minute")
async def get_portfolio(request: Request, wallet_address: str):
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
        # Cache check — return immediately if a fresh snapshot exists
        # (updated within the last 5 minutes).  Skips all external calls.
        # ------------------------------------------------------------------
        _CACHE_TTL_SECONDS = 300  # 5 minutes
        try:
            async with AsyncSessionLocal() as _cs:
                _cached = await _cs.execute(
                    select(PortfolioCache).where(
                        PortfolioCache.wallet_address == wallet_address
                    )
                )
                _row = _cached.scalar_one_or_none()
                if _row is not None:
                    _age = (
                        datetime.now(timezone.utc) - _row.updated_at
                    ).total_seconds()
                    if _age < _CACHE_TTL_SECONDS:
                        return json.loads(_row.data)
        except Exception as _ce:
            # Cache read failure must never block a live fetch
            print(f"[portfolio] cache-read skipped: {_ce}")

        # ------------------------------------------------------------------
        # Step 1 — Fetch all four chains + Ethereum tx history in parallel.
        # Each get_portfolio() returns:
        #   { "chain": str, "tokens": list, "nfts": list, "native_balance": float }
        # ethereum.get_transactions() is fetched here so tx_count is available
        # for the CREDEX credit score without a separate round-trip.
        # ------------------------------------------------------------------
        (
            eth_data, poly_data, bsc_data, sol_data, arb_data,
            transactions, chain_health,
        ) = await asyncio.gather(
            ethereum.get_portfolio(wallet_address),
            polygon.get_portfolio(wallet_address),
            bsc.get_portfolio(wallet_address),
            solana.get_portfolio(wallet_address),
            arbitrum.get_portfolio(wallet_address),
            ethereum.get_transactions(wallet_address, limit=50),
            get_all_chains_health(),          # ← real-time chain health
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

        # ------------------------------------------------------------------
        # Enrich PRISM chain_scores with real network health data.
        # If a chain is live-unhealthy (is_healthy=False) its PRISM score is
        # capped at 40; latency above 2 000 ms applies a proportional penalty.
        # ------------------------------------------------------------------
        enriched_chain_scores: dict = dict(prism_health["chain_scores"])
        for ch_name, ch_data in chain_health.items():
            if ch_name not in enriched_chain_scores:
                continue
            base_score: int = enriched_chain_scores[ch_name]
            if not ch_data.get("is_healthy", True):
                # Chain is down or unhealthy — hard cap at 40
                base_score = min(base_score, 40)
            else:
                lat = ch_data.get("latency_ms", 0.0)
                if lat > 2_000:
                    # Proportional latency penalty: -1 pt per 100 ms over 2 s
                    penalty = int((lat - 2_000) / 100)
                    base_score = max(0, base_score - penalty)
            enriched_chain_scores[ch_name] = base_score
        prism_health = {**prism_health, "chain_scores": enriched_chain_scores}

        # CREDEX On-Chain Credit Score
        # transactions is fetched concurrently in Step 1 above (limit=50).
        # Passing real tx data activates component E (+0–150) in the scorer.
        credit_score = risk_util.calculate_credit_score(all_tokens, transactions)


        # Build Protocol Resilient Interoperable State Machine
        sm = StateMachine(
            wallet=wallet_address,
            chain_breakdown=chain_breakdown,
            prism_health=prism_health,
            chain_health=chain_health,   # ← real is_healthy / latency_ms data
        )
        state_machine = sm.to_dict()

        # PRISM Execution Router
        router_data = router.calculate_routing(chain_breakdown, prism_health, lumina_data, chain_health)

        # Chain-agnostic PRISM State Object
        # Assemble the portfolio_data bundle that prism_state needs.
        _portfolio_snapshot = {
            "total_value_usd": total_value_usd,
            "risk_score":      risk_score,
            "credit_score":    credit_score,
            "chain_breakdown": chain_breakdown,
            "prism_health":    prism_health,
        }
        prism_state_obj = prism_state_util.build_prism_state(
            wallet=wallet_address,
            portfolio_data=_portfolio_snapshot,
            chain_health=chain_health,
        )

        # ------------------------------------------------------------------
        # Final response payload
        # ------------------------------------------------------------------
        response_payload = {
            "wallet":            wallet_address,
            "total_value_usd":   round(total_value_usd, 2),
            "transaction_count": len(transactions),
            "risk_score":        risk_score,
            "vertex":            vertex,
            "prism_health":      prism_health,
            "credit_score":      credit_score,
            "lumina":            lumina_data,
            "zk_proof":          compliance.generate_zk_proof(
                                     wallet_address,
                                     total_value_usd,
                                     risk_score,
                                 ),
            "chain_breakdown":   chain_breakdown,
            "tokens":            all_tokens,
            "nfts":              all_nfts,
            "prices":            prices,
            "state_machine":     state_machine,
            "router":            router_data,
            "prism_state":       prism_state_obj,
            "chain_health":      chain_health,    # ← real-time per-chain health
        }

        # ------------------------------------------------------------------
        # Persist to DB — failures are fully isolated from the response.
        # ------------------------------------------------------------------
        try:
            async with AsyncSessionLocal() as _db:
                # 1. Upsert wallet address
                await _db.execute(
                    pg_insert(Wallet)
                    .values(address=wallet_address, chain="multichain")
                    .on_conflict_do_nothing(constraint="uq_wallet_address_chain")
                )

                # 2. Upsert portfolio cache (one row per wallet, updated_at auto-bumped)
                _now = datetime.now(timezone.utc)
                await _db.execute(
                    pg_insert(PortfolioCache)
                    .values(
                        wallet_address=wallet_address,
                        data=json.dumps(response_payload),
                        updated_at=_now,
                    )
                    .on_conflict_do_update(
                        constraint="uq_portfolio_wallet",
                        set_={
                            "data":       json.dumps(response_payload),
                            "updated_at": _now,
                        },
                    )
                )

                # 3. Upsert health score for each chain
                _chain_scores: dict = prism_health.get("chain_scores", {})
                for _chain_name, _score in _chain_scores.items():
                    await _db.execute(
                        pg_insert(HealthScore)
                        .values(
                            chain=_chain_name,
                            score=float(_score),
                            updated_at=_now,
                        )
                        .on_conflict_do_update(
                            constraint="uq_health_chain",
                            set_={
                                "score":      float(_score),
                                "updated_at": _now,
                            },
                        )
                    )

                await _db.commit()
        except Exception as _dbe:
            print(f"[portfolio] DB write skipped (non-fatal): {_dbe}")

        return response_payload

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
# ROUTE 1b — GET /portfolio/cache/{wallet_address}
# ===========================================================================
@app.get("/portfolio/cache/{wallet_address}", summary="Check portfolio cache")
@limiter.limit("60/minute")
async def get_portfolio_cache(request: Request, wallet_address: str):
    """
    Check whether a fresh (< 5 minute) portfolio cache entry exists for
    the given wallet address.

    Called by the frontend *before* hitting /portfolio so it can display
    cached data immediately and show a “Cached” badge.

    Returns
    -------
    200  { fresh: true,  data: <portfolio payload> }  — cache hit, < 5 min old
    200  { fresh: false }                              — cache miss or stale
    200  { fresh: false, error: str }                  — DB unavailable (non-fatal)
    """
    _CACHE_TTL_SECONDS = 300  # 5 minutes
    try:
        async with AsyncSessionLocal() as _cs:
            _cached = await _cs.execute(
                select(PortfolioCache).where(
                    PortfolioCache.wallet_address == wallet_address
                )
            )
            _row = _cached.scalar_one_or_none()
            if _row is None:
                return {"fresh": False}
            _age = (
                datetime.now(timezone.utc) - _row.updated_at
            ).total_seconds()
            if _age >= _CACHE_TTL_SECONDS:
                return {"fresh": False}
            return {"fresh": True, "data": json.loads(_row.data)}
    except Exception as _ce:
        # DB failure is non-fatal: frontend falls through to live fetch
        return {"fresh": False, "error": str(_ce)}


# ===========================================================================
# ROUTE 2 — GET /transactions/{wallet_address}
# ===========================================================================
@app.get("/transactions/{wallet_address}", summary="Get recent Ethereum transactions")
@limiter.limit("30/minute")
async def get_transactions(request: Request, wallet_address: str):
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
@limiter.limit("30/minute")
async def health_check(request: Request):
    """
    Simple health-check endpoint.
    Returns 200 OK with the API version — useful for load balancers and monitoring.
    """
    return {"status": "ok", "version": "1.0.0"}


# ===========================================================================
# ROUTE 3b — GET /gas
# ===========================================================================
@app.get("/gas", summary="Current Ethereum gas price estimates")
@limiter.limit("20/minute")
async def get_gas(request: Request):
    """
    Return slow / normal / fast gas estimates for a standard ETH transfer.

    This endpoint is **public** (no X-API-Key required) — gas prices are
    not sensitive and caching them client-side is encouraged.

    Data sources
    ------------
    - Base fee   : eth_getBlockByNumber via Cloudflare public RPC
    - ETH price  : CoinGecko simple-price API (free tier)

    Falls back to pre-set sentinel values if either source is unreachable
    so this endpoint never returns a 5xx.

    Returns
    -------
    JSON object with three speed tiers, each containing:
      - ``gwei``    : gas price in Gwei (float)
      - ``usd``     : estimated USD cost for a 21 000-gas transfer (float)
      - ``minutes`` : expected inclusion time in minutes (float)
    """
    estimates = await get_gas_estimates()
    return estimates


# ===========================================================================
# ROUTE 3c — GET /chain-health   (public, 10/min)
# ===========================================================================
_VALID_CHAINS = frozenset({"ethereum", "polygon", "arbitrum", "solana", "bsc"})


@app.get("/chain-health", summary="Real-time health for all supported chains")
@limiter.limit("10/minute")
async def get_all_chains_health_route(request: Request):
    """
    Return a live health snapshot for all five supported chains concurrently.

    No authentication required — chain health is public information.

    Response shape
    --------------
    {
      "ethereum": {
        "chain": str,
        "block_number": int,
        "block_time_seconds": float,
        "gas_price_gwei": float,
        "is_healthy": bool,
        "latency_ms": float,
        "last_updated": str           # ISO-8601 UTC
      },
      "polygon":  { ... },
      "arbitrum": { ... },
      "solana":   { ... },
      "bsc":      { ... }
    }
    """
    return await get_all_chains_health()


# ===========================================================================
# ROUTE 3d — GET /chain-health/{chain}   (public, 20/min)
# ===========================================================================
@app.get("/chain-health/{chain}", summary="Real-time health for a single chain")
@limiter.limit("20/minute")
async def get_single_chain_health_route(request: Request, chain: str):
    """
    Return a live health snapshot for *one* chain.

    Path parameter
    --------------
    chain : one of ``ethereum``, ``polygon``, ``arbitrum``, ``solana``, ``bsc``

    Raises
    ------
    400 Bad Request — if an unsupported chain name is supplied.

    No authentication required.
    """
    chain_key = chain.lower().strip()
    if chain_key not in _VALID_CHAINS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unknown chain '{chain}'. "
                f"Valid options: {', '.join(sorted(_VALID_CHAINS))}"
            ),
        )
    return await get_chain_health(chain_key)


# ===========================================================================
# ROUTE 3e — WebSocket /ws/chain-health   (public, no rate-limit)
# ===========================================================================

# Broadcast interval — how often the server pushes fresh data (seconds)
_WS_PUSH_INTERVAL: int = 15


@app.websocket("/ws/chain-health")
async def ws_chain_health(websocket: WebSocket):
    """
    WebSocket endpoint that streams real-time chain health to a single client.

    Protocol
    --------
    1. Server accepts the connection immediately.
    2. Server sends the full health snapshot as JSON right away.
    3. Server loops: waits _WS_PUSH_INTERVAL seconds, fetches fresh health,
       sends the JSON payload, repeats.
    4. On WebSocketDisconnect (client closed tab / navigated away) the loop
       exits cleanly with no exception propagating.

    No authentication required — chain health is public information.
    No rate-limiting — the push interval is server-controlled.
    """
    await websocket.accept()
    try:
        while True:
            snapshot = await get_all_chains_health()
            await websocket.send_json(snapshot)
            # Wait for the next push interval, but wake immediately if the
            # client disconnects (asyncio.sleep raises CancelledError on task
            # cancellation, which is caught by WebSocketDisconnect handling).
            await asyncio.sleep(_WS_PUSH_INTERVAL)
    except WebSocketDisconnect:
        # Client closed the connection — exit silently
        pass
    except Exception:
        # Any other error (network blip, serialisation fault) — close cleanly
        try:
            await websocket.close()
        except Exception:
            pass


# ===========================================================================
# AUTH MODELS (Pydantic request bodies)
# ===========================================================================

class RegisterRequest(BaseModel):
    """
    Request body for POST /auth/register.
    name     : Display name (1–80 chars).
    email    : Valid email address — used as the unique login identifier.
    password : Plain-text password (min 8 chars). Hashed server-side with bcrypt.
    """
    name:     str
    email:    str
    password: str


class LoginRequest(BaseModel):
    """
    Request body for POST /auth/login.
    email    : The registered email.
    password : Plain-text password — verified against the stored bcrypt hash.
    """
    email:    str
    password: str


# ---------------------------------------------------------------------------
# JWT helper
# ---------------------------------------------------------------------------
def _create_jwt(user_id: int, email: str, name: str) -> str:
    """
    Create a signed HS256 JWT with a 24-hour expiry.
    Payload: { sub: str(user_id), email, name, exp }
    """
    expire = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS)
    payload = {
        "sub":   str(user_id),
        "email": email,
        "name":  name,
        "exp":   expire,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


# ===========================================================================
# ROUTE — POST /auth/register
# ===========================================================================
@app.post("/auth/register", summary="Register a new user account")
@limiter.limit("10/minute")
async def auth_register(
    request: Request,
    body: RegisterRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Register a new dashboard user.

    - Validates name, email, and password length.
    - Hashes the password with bcrypt (12 rounds).
    - Stores the user in the PostgreSQL `users` table.
    - Returns a signed JWT on success.

    Returns
    -------
    200  { token: str, name: str, email: str }
    400  email already registered
    422  validation failure
    """
    # ── Input validation ────────────────────────────────────────────────────
    name     = body.name.strip()
    email    = body.email.strip().lower()
    password = body.password

    if not name or len(name) > 80:
        raise HTTPException(status_code=422, detail="Name must be 1–80 characters.")
    if not email or "@" not in email:
        raise HTTPException(status_code=422, detail="A valid email address is required.")
    if len(password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters.")

    # ── Check for duplicate email ────────────────────────────────────────────
    existing = await db.execute(select(User).where(User.email == email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="An account with this email already exists.")

    # ── Hash password & persist ──────────────────────────────────────────────
    pw_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()
    user = User(name=name, email=email, password_hash=pw_hash)
    db.add(user)
    await db.flush()   # populate user.id without full commit yet
    await db.commit()
    await db.refresh(user)

    token = _create_jwt(user.id, user.email, user.name)
    return {"token": token, "name": user.name, "email": user.email}


# ===========================================================================
# ROUTE — POST /auth/login
# ===========================================================================
@app.post("/auth/login", summary="Sign in and receive a JWT")
@limiter.limit("15/minute")
async def auth_login(
    request: Request,
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Authenticate an existing user by email + password.

    - Looks up the user in PostgreSQL by email.
    - Verifies the submitted password against the stored bcrypt hash.
    - Returns a new signed JWT on success.

    Returns
    -------
    200  { token: str, name: str, email: str }
    401  invalid credentials
    """
    email    = body.email.strip().lower()
    password = body.password

    result = await db.execute(select(User).where(User.email == email))
    user   = result.scalar_one_or_none()

    # Use a constant-time check regardless of whether user exists
    dummy_hash = b"$2b$12$invalidhashpaddingtomatchlength000000000000000000000"
    stored = user.password_hash.encode() if user else dummy_hash
    password_ok = bcrypt.checkpw(password.encode(), stored)

    if not user or not password_ok:
        raise HTTPException(status_code=401, detail="Incorrect email or password.")

    token = _create_jwt(user.id, user.email, user.name)
    return {"token": token, "name": user.name, "email": user.email}


# ===========================================================================
# ROUTE 4b — POST /verify-wallet  (original, unchanged)
# ===========================================================================

class WalletVerifyRequest(BaseModel):
    """
    Request body for POST /verify-wallet.

    Fields
    ------
    address   : Ethereum address claiming ownership (0x-prefixed, 42 chars).
    message   : Plain-text message the user signed on the frontend.
    signature : Hex-encoded EIP-191 personal_sign output (0x-prefixed).
    """
    address:   str
    message:   str
    signature: str


@app.post("/verify-wallet", summary="Verify wallet ownership via EIP-191 signature")
@limiter.limit("10/minute")
async def verify_wallet(request: Request, body: WalletVerifyRequest):
    """
    Verify that the caller owns the Ethereum wallet at ``address``.

    The frontend should:
      1. Prompt the user to sign the ``SIGN_MESSAGE`` env-var string
         (or any agreed message) via MetaMask / RainbowKit ``signMessage``.
      2. POST the raw address, the signed message text, and the resulting
         hex signature to this endpoint.

    Returns
    -------
    200 { verified: true,  address: str }           — signature valid
    401 { verified: false, error:   str }           — signature invalid
    """
    is_valid = verify_signature(
        address=body.address,
        message=body.message,
        signature=body.signature,
    )

    if is_valid:
        return {
            "verified": True,
            "address":  body.address,
        }

    raise HTTPException(
        status_code=401,
        detail={"verified": False, "error": "Signature verification failed. Address mismatch or invalid signature."},
    )


# ===========================================================================
# ROUTE 4 — POST /ai/analyze
# ===========================================================================
@app.post("/ai/analyze", summary="AI portfolio analysis")
@limiter.limit("30/minute")
async def ai_analyze(request: Request):
    """
    AI portfolio analysis endpoint.
    Powered by JULIUS-inspired AutoGen agent architecture.

    Body: {
        "question": str,
        "portfolio_data": dict,      # from /portfolio/{wallet}
        "conversation_history": list  # optional, list of {role, content}
    }
    """
    body                 = await request.json()
    question             = body.get("question", "").strip()
    portfolio_data       = body.get("portfolio_data", {})
    conversation_history = body.get("conversation_history", [])

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


# ===========================================================================
# ROUTE — GET /history   (public, no auth)
# Returns the last 10 unique wallets that have been queried.
# ===========================================================================
@app.get("/history", summary="Last 10 searched wallets")
@limiter.limit("30/minute")
async def get_history(request: Request):
    """
    Return the 10 most recently added wallet addresses from the
    ``wallets`` table, ordered newest-first.

    No authentication required — wallet addresses are not sensitive
    (they are public blockchain identifiers).

    Returns
    -------
    200  { wallets: [ { address: str, created_at: str } ] }
    503  database unavailable
    """
    try:
        async with AsyncSessionLocal() as _db:
            result = await _db.execute(
                select(Wallet.address, Wallet.created_at)
                .order_by(Wallet.created_at.desc())
                .limit(10)
            )
            rows = result.all()
            return {
                "wallets": [
                    [row.address, row.created_at.isoformat() if hasattr(row.created_at, 'isoformat') else str(row.created_at)]
                    for row in rows
                ]
            }
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"History unavailable: {exc}",
        ) from exc


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
