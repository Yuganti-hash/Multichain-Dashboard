"""
backend/state_machine.py
========================
Protocol Resilient Interoperable State Machine (PRISM)

Tracks portfolio state transitions across chains, evaluates per-chain
health, and generates automatic migration plans when chains degrade or fail.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Optional


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class ChainState(str, Enum):
    HEALTHY   = "HEALTHY"    # chain responding, assets accessible
    DEGRADED  = "DEGRADED"   # chain slow or partially unavailable
    FAILED    = "FAILED"     # chain unreachable
    MIGRATING = "MIGRATING"  # assets being moved to another chain
    UNKNOWN   = "UNKNOWN"    # not yet checked


class PortfolioState(str, Enum):
    STABLE    = "STABLE"     # all active chains healthy
    AT_RISK   = "AT_RISK"    # one or more chains degraded
    CRITICAL  = "CRITICAL"   # dominant chain failed or failing
    MIGRATING = "MIGRATING"  # rebalancing in progress
    RESILIENT = "RESILIENT"  # well diversified, PRISM ready


# ---------------------------------------------------------------------------
# Dataclass
# ---------------------------------------------------------------------------

@dataclass
class ChainStateNode:
    chain:          str
    state:          ChainState
    value_usd:      float
    percentage:     float
    health_score:   int
    last_checked:   str           # ISO timestamp
    failure_reason: Optional[str]


# ---------------------------------------------------------------------------
# State Machine
# ---------------------------------------------------------------------------

# Human-readable labels for each portfolio state
_STATE_LABELS: dict[str, str] = {
    PortfolioState.STABLE:    "Stable",
    PortfolioState.AT_RISK:   "At Risk",
    PortfolioState.CRITICAL:  "Critical",
    PortfolioState.MIGRATING: "Migrating",
    PortfolioState.RESILIENT: "Resilient",
}

# Hex colors for portfolio states (matches frontend palette)
_STATE_COLORS: dict[str, str] = {
    PortfolioState.STABLE:    "#22c55e",
    PortfolioState.AT_RISK:   "#f59e0b",
    PortfolioState.CRITICAL:  "#ef4444",
    PortfolioState.MIGRATING: "#3b82f6",
    PortfolioState.RESILIENT: "#00d4aa",
}

# Hex colors for individual chain states
_CHAIN_STATE_COLORS: dict[str, str] = {
    ChainState.HEALTHY:   "#22c55e",
    ChainState.DEGRADED:  "#f59e0b",
    ChainState.FAILED:    "#ef4444",
    ChainState.MIGRATING: "#3b82f6",
    ChainState.UNKNOWN:   "#6b7280",
}

# Canonical chain order used when initialising nodes
_SUPPORTED_CHAINS: list[str] = ["ethereum", "polygon", "bsc", "solana", "arbitrum"]


class StateMachine:
    """
    Protocol Resilient Interoperable State Machine (PRISM).

    Consumes the chain_breakdown and prism_health output produced by
    the /portfolio route and derives:
      - A ChainStateNode for every supported chain
      - An overall PortfolioState
      - A migration plan (if any chains are at risk)
    """

    def __init__(
        self,
        wallet: str,
        chain_breakdown: list[dict],
        prism_health: dict,
    ) -> None:
        self.wallet:           str                         = wallet
        self.chain_nodes:      dict[str, ChainStateNode]  = {}
        self.portfolio_state:  PortfolioState             = PortfolioState.STABLE
        self.transitions:      list[dict]                 = []
        self.created_at:       str                        = datetime.utcnow().isoformat()

        self._initialize_nodes(chain_breakdown, prism_health)
        self._evaluate_portfolio_state()

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _initialize_nodes(
        self,
        chain_breakdown: list[dict],
        prism_health: dict,
    ) -> None:
        """
        Build one ChainStateNode per supported chain, using health scores
        from prism_health and value/percentage from chain_breakdown.
        """
        chain_scores: dict[str, int] = prism_health.get("chain_scores", {})

        for chain in _SUPPORTED_CHAINS:
            # Find the matching entry in chain_breakdown (if any)
            entry = next(
                (c for c in chain_breakdown if c.get("chain", "").lower() == chain),
                {},
            )

            score: int   = chain_scores.get(chain, 100)
            value: float = entry.get("value_usd", 0)
            pct:   float = entry.get("percentage", 0)

            # Determine chain state from health score + value
            if score < 40:
                state = ChainState.FAILED
            elif value == 0:
                state = ChainState.UNKNOWN
            elif score >= 70:
                state = ChainState.HEALTHY
            else:
                state = ChainState.DEGRADED

            self.chain_nodes[chain] = ChainStateNode(
                chain=chain,
                state=state,
                value_usd=value,
                percentage=pct,
                health_score=score,
                last_checked=datetime.utcnow().isoformat(),
                failure_reason=self._get_failure_reason(chain, score, pct),
            )

    def _get_failure_reason(
        self,
        chain: str,
        score: int,
        pct: float,
    ) -> Optional[str]:
        """
        Return a human-readable failure reason, or None when the chain is healthy.
        """
        if score < 40 and pct > 0:
            return (
                f"Critical concentration: {pct:.1f}% of portfolio on low-health chain"
            )
        if pct > 80:
            return f"Extreme concentration risk: {pct:.1f}% on single chain"
        if score < 40:
            return "Chain health score below critical threshold"
        return None

    def _evaluate_portfolio_state(self) -> None:
        """
        Derive the overall PortfolioState from the individual chain states.

        Decision tree (in priority order):
          1. No active chains          → AT_RISK
          2. Dominant chain is FAILED  → CRITICAL
          3. Any chain FAILED          → AT_RISK
          4. Any chain DEGRADED        → AT_RISK
          5. ≥ 3 chains HEALTHY        → RESILIENT
          6. Otherwise                 → STABLE
        """
        active = [n for n in self.chain_nodes.values() if n.value_usd > 0]

        if not active:
            self.portfolio_state = PortfolioState.AT_RISK
            return

        failed   = [n for n in active if n.state == ChainState.FAILED]
        degraded = [n for n in active if n.state == ChainState.DEGRADED]
        healthy  = [n for n in active if n.state == ChainState.HEALTHY]

        # Chain that holds the largest share of the portfolio
        dominant = max(active, key=lambda n: n.value_usd)

        if dominant.state == ChainState.FAILED:
            self.portfolio_state = PortfolioState.CRITICAL
        elif len(failed) > 0:
            self.portfolio_state = PortfolioState.AT_RISK
        elif len(degraded) > 0:
            self.portfolio_state = PortfolioState.AT_RISK
        elif len(healthy) >= 3:
            self.portfolio_state = PortfolioState.RESILIENT
        else:
            self.portfolio_state = PortfolioState.STABLE

    # ------------------------------------------------------------------
    # Public methods
    # ------------------------------------------------------------------

    def get_migration_plan(self) -> dict:
        """
        Simulate PRISM's automatic migration planning.

        For every chain that is FAILED or DEGRADED (and holds value),
        suggest the healthiest available destination chain.

        Returns
        -------
        dict with keys:
          migration_needed            – bool
          plans                       – list of per-chain migration dicts
          estimated_safety_improvement – int (capped at 60 pp)
        """
        plans: list[dict] = []

        at_risk_chains = [
            n for n in self.chain_nodes.values()
            if n.state in (ChainState.FAILED, ChainState.DEGRADED)
            and n.value_usd > 0
        ]

        healthy_chains = [
            n for n in self.chain_nodes.values()
            if n.state == ChainState.HEALTHY
            and n.value_usd >= 0
        ]

        # Sort healthy destinations by health score descending
        healthy_chains.sort(key=lambda n: n.health_score, reverse=True)

        for risk_node in at_risk_chains:
            if not healthy_chains:
                target: str = "diversify to any available chain"
            else:
                target = healthy_chains[0].chain

            plans.append(
                {
                    "from_chain":    risk_node.chain,
                    "from_state":    risk_node.state,
                    "value_at_risk": risk_node.value_usd,
                    "to_chain":      target,
                    "reason":        (
                        risk_node.failure_reason
                        or "health score below threshold"
                    ),
                    "urgency": (
                        "IMMEDIATE"
                        if risk_node.state == ChainState.FAILED
                        else "RECOMMENDED"
                    ),
                }
            )

        return {
            "migration_needed":             len(plans) > 0,
            "plans":                        plans,
            "estimated_safety_improvement": min(30 * len(plans), 60),
        }

    def get_migration_status(self) -> dict:
        """
        Simulate PRISM migration status.
        If any chain health is below 40, select the best alternative chain
        and generate a recommendation.
        """
        failed_chains = [
            node.chain for node in self.chain_nodes.values()
            if node.health_score < 40
        ]
        
        if failed_chains:
            alternatives = [
                node for node in self.chain_nodes.values()
                if node.chain not in failed_chains
            ]
            best_alt = None
            if alternatives:
                best_alt = max(alternatives, key=lambda n: n.health_score).chain
            
            failed_str = ", ".join([c.capitalize() if c != "bsc" else "BSC" for c in failed_chains])
            alt_str = "BSC" if best_alt == "bsc" else (best_alt.capitalize() if best_alt else "another secure chain")
            recommendation = f"Chain failure detected on {failed_str}. Migrate assets and operations to {alt_str}."
            
            return {
                "migration_required": True,
                "failed_chains": failed_chains,
                "best_alternative": best_alt,
                "recommendation": recommendation,
            }
        else:
            return {
                "migration_required": False,
                "failed_chains": [],
                "best_alternative": None,
                "recommendation": "All chains are operating normally. No migration required.",
            }

    def to_dict(self) -> dict:
        """
        Serialise the entire state machine to a JSON-compatible dict.

        Includes:
          - wallet & timestamps
          - overall portfolio_state with label and color
          - per-chain node details with state colors
          - migration plan
          - human-readable summary
        """
        active_count = sum(
            1 for n in self.chain_nodes.values() if n.value_usd > 0
        )

        return {
            "wallet":                self.wallet,
            "portfolio_state":       self.portfolio_state.value,
            "portfolio_state_label": _STATE_LABELS[self.portfolio_state],
            "portfolio_state_color": _STATE_COLORS[self.portfolio_state],
            "chain_nodes": {
                chain: {
                    "chain":          node.chain,
                    "state":          node.state.value,
                    "value_usd":      node.value_usd,
                    "percentage":     node.percentage,
                    "health_score":   node.health_score,
                    "last_checked":   node.last_checked,
                    "failure_reason": node.failure_reason,
                    "state_color":    _CHAIN_STATE_COLORS[node.state],
                }
                for chain, node in self.chain_nodes.items()
            },
            "migration_plan":   self.get_migration_plan(),
            "migration_status": self.get_migration_status(),
            "created_at":       self.created_at,
            "summary": (
                f"{self.portfolio_state.value} — {active_count} active chain"
                f"{'s' if active_count != 1 else ''}"
            ),
        }
