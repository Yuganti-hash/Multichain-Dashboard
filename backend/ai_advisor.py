"""
backend/ai_advisor.py
======================
JULIUS-inspired AI Advisor for MultiChain Dashboard.

Adapts JULIUS's autogen_brain.py pattern to provide portfolio intelligence.
Instead of cybersecurity tools, this agent has crypto portfolio tools.

Requires: OPENAI_API_KEY in .env
Uses: Microsoft AutoGen (autogen-agentchat, autogen-ext)
"""

import os
import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)

# ── AutoGen imports (same pattern as JULIUS autogen_brain.py) ─────────────
try:
    from autogen_agentchat.agents import AssistantAgent
    from autogen_agentchat.messages import TextMessage
    from autogen_ext.models.openai import OpenAIChatCompletionClient
    from autogen_core import CancellationToken
    AUTOGEN_AVAILABLE = True
    logger.info("AutoGen loaded for Portfolio Advisor")
except ImportError:
    AUTOGEN_AVAILABLE = False
    CancellationToken = None  # type: ignore
    logger.warning("AutoGen not available — install autogen-agentchat autogen-ext")

# ── Module-level portfolio context store ──────────────────────────────────
# Holds the last fetched portfolio data so tools can access it
_portfolio_context: Dict[str, Any] = {}

def set_portfolio_context(portfolio: dict):
    """Store portfolio data so AI tools can read it."""
    global _portfolio_context
    _portfolio_context = portfolio or {}


# ═══════════════════════════════════════════════════════════════════════════
# PORTFOLIO TOOL FUNCTIONS
# These mirror JULIUS's tool functions but for crypto portfolio data
# ═══════════════════════════════════════════════════════════════════════════

async def get_portfolio_summary() -> str:
    """Get the total portfolio value, risk score, and PRISM health score."""
    p = _portfolio_context
    if not p:
        return "No portfolio data loaded. Please search a wallet first."

    wallet  = p.get("wallet", "unknown")
    total   = p.get("total_value_usd", 0)
    risk    = p.get("risk_score", "UNKNOWN")
    prism   = p.get("prism_health", {})
    p_score = prism.get("overall_score", "N/A")
    p_ready = prism.get("prism_ready", False)
    rec     = prism.get("recommendation", "")

    return (
        f"Wallet: {wallet}\n"
        f"Total Value: ${total:,.2f} USD\n"
        f"Risk Score: {risk}\n"
        f"PRISM Health Score: {p_score}/100 ({'PRISM READY' if p_ready else 'Needs Rebalancing'})\n"
        f"Recommendation: {rec}"
    )


async def get_chain_breakdown() -> str:
    """Get the portfolio value breakdown across all chains."""
    chains = _portfolio_context.get("chain_breakdown", [])
    if not chains:
        return "No chain breakdown data available."

    lines = []
    for c in chains:
        value = c.get("value_usd", 0)
        if value <= 0:
            continue
        chain = c.get("chain", "unknown")
        pct   = c.get("percentage", 0)
        lines.append(f"- {chain.upper()}: ${value:,.2f} ({pct:.1f}% of portfolio)")

    return "Chain Breakdown:\n" + "\n".join(lines)


async def get_top_tokens() -> str:
    """Get the top 10 tokens by USD value in the portfolio."""
    tokens = _portfolio_context.get("tokens", [])
    prices = _portfolio_context.get("prices", {})
    if not tokens:
        return "No tokens found in portfolio."

    enriched = []
    for t in tokens:
        symbol    = t.get("symbol", "?")
        amount    = t.get("amount", 0)
        chain     = t.get("chain", "?")
        price     = prices.get(symbol, 0)
        value_usd = amount * price
        enriched.append((symbol, amount, chain, price, value_usd))

    enriched.sort(key=lambda x: x[4], reverse=True)
    top10 = enriched[:10]

    lines = []
    for sym, amt, chn, price, val in top10:
        lines.append(
            f"- {sym} on {chn}: {amt:.4f} tokens"
            f" @ ${price:,.4f} = ${val:,.2f}"
        )

    return f"Top {len(top10)} tokens by value:\n" + "\n".join(lines)


async def get_nft_summary() -> str:
    """Get a summary of NFTs found in the portfolio."""
    nfts = _portfolio_context.get("nfts", [])
    if not nfts:
        return "No NFTs found in this wallet."

    lines = []
    for n in nfts[:10]:
        name   = n.get("name", "Unknown NFT")
        chain  = n.get("chain", "?")
        tok_id = n.get("token_id", "?")
        lines.append(f"- {name} (ID: {tok_id}) on {chain}")

    return f"NFTs found ({len(nfts)} total):\n" + "\n".join(lines)


async def get_risk_explanation() -> str:
    """Explain the risk score and what it means for this specific portfolio."""
    p        = _portfolio_context
    risk     = p.get("risk_score", "UNKNOWN")
    chains   = p.get("chain_breakdown", [])
    prism    = p.get("prism_health", {})
    score    = prism.get("overall_score", 0)
    chain_sc = prism.get("chain_scores", {})

    active   = [c for c in chains if c.get("value_usd", 0) > 0]
    n_active = len(active)

    # Find most concentrated chain
    dominant  = max(chains, key=lambda c: c.get("percentage", 0), default={})
    dom_chain = dominant.get("chain", "unknown")
    dom_pct   = dominant.get("percentage", 0)

    lines = [
        f"Risk Score: {risk}",
        f"Active Chains: {n_active}",
        f"Most concentrated chain: {dom_chain.upper()} at {dom_pct:.1f}%",
        f"",
        f"PRISM Health Score: {score}/100",
        f"Per-chain scores:",
    ]
    for chain, sc in chain_sc.items():
        lines.append(f"  - {chain}: {sc}/100")

    lines += [
        f"",
        f"Risk Logic:",
        f"  - 1 active chain = HIGH risk",
        f"  - 2 active chains = MEDIUM risk",
        f"  - 3+ active chains = LOW risk",
        f"  - Any chain >80% of total = risk bumped up one level",
    ]

    return "\n".join(lines)


async def get_rebalancing_advice() -> str:
    """Suggest specific rebalancing steps to improve the PRISM health score."""
    p      = _portfolio_context
    chains = p.get("chain_breakdown", [])
    prism  = p.get("prism_health", {})
    score  = prism.get("overall_score", 0)
    total  = p.get("total_value_usd", 0)

    active = [c for c in chains if c.get("value_usd", 0) > 0]

    advice = [f"Current PRISM Score: {score}/100", ""]

    if score >= 70:
        advice.append("Portfolio is already PRISM READY. No urgent action needed.")
        advice.append("Consider adding more token diversity within each chain.")
        return "\n".join(advice)

    # Check concentration
    for c in active:
        pct = c.get("percentage", 0)
        chn = c.get("chain", "?")
        val = c.get("value_usd", 0)
        if pct > 60:
            target_val = total * 0.4
            move_amt   = val - target_val
            advice.append(
                f"Warning: {chn.upper()} holds {pct:.1f}% of your portfolio."
            )
            advice.append(
                f"   Consider moving ~${move_amt:,.0f} to other chains "
                f"to bring it below 60%."
            )

    if len(active) == 1:
        advice.append("")
        advice.append("All assets are on a single chain.")
        advice.append("   Spreading across 2+ chains will immediately improve your score.")

    advice.append("")
    advice.append("Target: PRISM score ≥ 70 = PRISM READY status.")

    return "\n".join(advice)


# ═══════════════════════════════════════════════════════════════════════════
# TOOLS LIST — mirrors JULIUS_TOOLS pattern from autogen_brain.py
# ═══════════════════════════════════════════════════════════════════════════

ADVISOR_TOOLS = [
    get_portfolio_summary,
    get_chain_breakdown,
    get_top_tokens,
    get_nft_summary,
    get_risk_explanation,
    get_rebalancing_advice,
]


# ═══════════════════════════════════════════════════════════════════════════
# SYSTEM PROMPT — adapted from JULIUS SYSTEM_PROMPT pattern
# ═══════════════════════════════════════════════════════════════════════════

SYSTEM_PROMPT = """
You are PRISM Advisor — an AI portfolio intelligence agent for the
MultiChain Dashboard, inspired by SOVEREIGN's PRISM architecture.

## YOUR ROLE
You analyze crypto portfolios across Ethereum, Polygon, BNB Chain, Solana, and Arbitrum.
You help users understand their risk exposure, PRISM health score, and how
to improve their portfolio's chain-agnostic resilience.

## CORE CONCEPT TO REFERENCE
The PRISM architecture separates financial state from execution environment.
A wallet with a high PRISM score can theoretically migrate its state to a
new chain if the current one fails — because it is not overly concentrated
on any single chain.

## AVAILABLE TOOLS
- get_portfolio_summary    → total value, risk, PRISM score
- get_chain_breakdown      → value per chain
- get_top_tokens           → top 10 tokens by USD value
- get_nft_summary          → NFTs in the wallet
- get_risk_explanation     → detailed risk score logic
- get_rebalancing_advice   → specific steps to improve PRISM score

## BEHAVIOR RULES (same pattern as JULIUS)
- ALWAYS use tools to get real data — never make up numbers
- Be concise and actionable
- Use markdown formatting in responses
- When asked about risk, ALWAYS call get_risk_explanation first
- When asked how to improve, ALWAYS call get_rebalancing_advice
- Chain tool calls when needed: summary → breakdown → advice
- Reference PRISM concepts naturally when relevant
"""

# ── Singleton agent (same pattern as JULIUS get_julius_agent) ─────────────
_advisor_instance = None

def get_advisor_agent():
    """Create or return singleton PRISM Advisor agent."""
    global _advisor_instance
    if _advisor_instance is not None:
        return _advisor_instance

    if not AUTOGEN_AVAILABLE:
        return None

    api_key = os.getenv("OPENAI_API_KEY", "")
    if not api_key:
        logger.warning("No OPENAI_API_KEY — AI Advisor disabled")
        return None

    model_name  = os.getenv("ADVISOR_MODEL", "gpt-4o-mini")
    temperature = float(os.getenv("ADVISOR_TEMPERATURE", "0.2"))

    # Guard: Gemini model names are not compatible with OpenAIChatCompletionClient.
    # If a Gemini model is configured, fall back to gpt-4o-mini and warn.
    if model_name.startswith("gemini"):
        logger.warning(
            "ADVISOR_MODEL=%s is a Gemini model but OpenAIChatCompletionClient is in use. "
            "Falling back to gpt-4o-mini. To use Gemini, switch to a Gemini-compatible client.",
            model_name,
        )
        model_name = "gpt-4o-mini"

    try:
        model_client = OpenAIChatCompletionClient(
            model=model_name,
            api_key=api_key,
            temperature=temperature,
        )
        agent = AssistantAgent(
            name="PRISM_Advisor",
            model_client=model_client,
            tools=ADVISOR_TOOLS,
            system_message=SYSTEM_PROMPT,
        )
        _advisor_instance = agent
        logger.info("PRISM Advisor agent created on model %s", model_name)
        return agent
    except Exception as e:
        logger.error(f"Failed to create advisor agent: {e}")
        return None


# ═══════════════════════════════════════════════════════════════════════════
# ask_advisor — mirrors ask_julius() from JULIUS autogen_brain.py
# ═══════════════════════════════════════════════════════════════════════════

async def ask_advisor(
    message: str,
    portfolio_data: dict = None,
    conversation_history: list = None,
) -> Dict[str, Any]:
    """
    Send a question to the PRISM Advisor agent.

    Args:
        message: User's natural language question
        portfolio_data: Full portfolio dict from /portfolio/{wallet}
        conversation_history: List of {role, content} dicts

    Returns:
        { "message": str, "tool_calls": list, "model": str }
        or None if agent unavailable
    """
    # Load portfolio into context so tools can access it
    if portfolio_data:
        set_portfolio_context(portfolio_data)

    agent = get_advisor_agent()
    if agent is None:
        return None

    try:
        # Build enriched message (same pattern as JULIUS ask_julius)
        parts = []

        if conversation_history:
            parts.append("--- CONVERSATION HISTORY ---")
            for turn in conversation_history[-6:]:
                role    = turn.get("role", "user").upper()
                content = turn.get("content", "")
                parts.append(f"{role}: {content}")
            parts.append("")

        parts.append(f"--- USER QUESTION ---\n{message}")
        enriched = "\n".join(parts)

        # Send to AutoGen agent
        response = await agent.on_messages(
            [TextMessage(content=enriched, source="user")],
            cancellation_token=CancellationToken(),
        )

        reply_text = (
            response.chat_message.content
            if response.chat_message else "No response."
        )

        # Extract tool calls (same pattern as JULIUS)
        tool_calls = []
        for msg in (response.inner_messages or []):
            if hasattr(msg, "content") and isinstance(msg.content, list):
                for item in msg.content:
                    if hasattr(item, "name"):
                        tool_calls.append({
                            "name": item.name,
                            "args": str(getattr(item, "arguments", ""))[:200],
                        })

        return {
            "message":    reply_text,
            "tool_calls": tool_calls,
            "model":      os.getenv("ADVISOR_MODEL", "gpt-4o-mini"),
            "engine":     "autogen+portfolio",
        }

    except Exception as e:
        logger.error(f"Advisor agent error: {e}")
        return None


def is_advisor_ready() -> bool:
    """Check if the AI advisor is configured and ready."""
    return AUTOGEN_AVAILABLE and bool(os.getenv("OPENAI_API_KEY", ""))
