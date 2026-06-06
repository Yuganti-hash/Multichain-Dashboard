/**
 * ResilienceDashboard.js
 * ----------------------
 * PRISM Resilience Center Dashboard component.
 * Displays:
 *  - Overall Resilience Score (0-100) as a custom SVG circular dial.
 *  - Current Portfolio State with glowing indicators and descriptions.
 *  - Failed and Degraded chain status panels.
 *  - Migration readiness checklist and recommended relocation plans.
 *  - An Interactive Simulator to execute cross-chain state relocation.
 *
 * Frontend-only implementation using existing state_machine and prism_health data.
 */

import React, { useState, useEffect, useRef } from 'react';

// ---------------------------------------------------------------------------
// Helpers & Lookups
// ---------------------------------------------------------------------------

function colorWithOpacity(hex, opacity) {
  if (!hex) return `rgba(107, 114, 128, ${opacity})`;
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${opacity})`;
}

const CHAIN_LABELS = {
  ethereum: 'Ethereum',
  polygon: 'Polygon',
  bsc: 'BNB Chain',
  solana: 'Solana',
  arbitrum: 'Arbitrum',
};

const CHAIN_ICONS = {
  ethereum: 'Ξ',
  polygon: '⬡',
  bsc: '◈',
  solana: '◎',
  arbitrum: '▲',
};

function getChainLabel(chain) {
  return CHAIN_LABELS[chain?.toLowerCase()] || chain;
}

function getChainIcon(chain) {
  return CHAIN_ICONS[chain?.toLowerCase()] || '●';
}

function formatUSD(val) {
  if (val === null || val === undefined || isNaN(val)) return '$0.00';
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) {
    return `$${val.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  return `$${val.toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ResilienceDashboard({ stateMachine, prismHealth }) {
  // Guard clause if data is loading or missing
  if (!stateMachine || !prismHealth) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-400">
        <p className="font-semibold text-lg">Waiting for portfolio data...</p>
        <p className="text-sm text-gray-500 mt-2">Search for a wallet to load PRISM Resilience metrics.</p>
      </div>
    );
  }

  // --- Simulation State ---
  const [isSimulated, setIsSimulated] = useState(false);
  const [simStep, setSimStep] = useState(0); // 0: Idle, 1: Scanning, 2: Liquidity Check, 3: Relocating, 4: Recalculating, 5: Finished
  const [simLogs, setSimLogs] = useState([]);
  const [simScore, setSimScore] = useState(prismHealth.overall_score);
  const [simState, setSimState] = useState({
    portfolio_state: stateMachine.portfolio_state,
    portfolio_state_label: stateMachine.portfolio_state_label,
    portfolio_state_color: stateMachine.portfolio_state_color,
    chain_nodes: JSON.parse(JSON.stringify(stateMachine.chain_nodes || {})),
    migration_plan: JSON.parse(JSON.stringify(stateMachine.migration_plan || {})),
    prism_health: JSON.parse(JSON.stringify(prismHealth || {})),
  });

  const logsEndRef = useRef(null);

  // Auto-scroll simulation logs
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [simLogs]);

  // Synchronize state if props change when simulation is not active
  useEffect(() => {
    if (!isSimulated) {
      setSimScore(prismHealth.overall_score);
      setSimState({
        portfolio_state: stateMachine.portfolio_state,
        portfolio_state_label: stateMachine.portfolio_state_label,
        portfolio_state_color: stateMachine.portfolio_state_color,
        chain_nodes: JSON.parse(JSON.stringify(stateMachine.chain_nodes || {})),
        migration_plan: JSON.parse(JSON.stringify(stateMachine.migration_plan || {})),
        prism_health: JSON.parse(JSON.stringify(prismHealth || {})),
      });
    }
  }, [stateMachine, prismHealth, isSimulated]);

  // Extract variables based on current simulated state
  const currentScore = isSimulated ? simScore : prismHealth.overall_score;
  const currentPrismHealth = isSimulated ? simState.prism_health : prismHealth;
  const currentStateMachine = isSimulated ? simState : stateMachine;

  const {
    portfolio_state,
    portfolio_state_label,
    portfolio_state_color,
    chain_nodes = {},
    migration_plan = {},
  } = currentStateMachine;

  const activeNodes = Object.values(chain_nodes).filter((n) => n.value_usd > 0);
  const failedNodes = Object.values(chain_nodes).filter((n) => n.state === 'FAILED' || n.health_score < 40);
  const degradedNodes = Object.values(chain_nodes).filter((n) => n.state === 'DEGRADED' && n.health_score >= 40 && n.health_score < 70);
  const healthyNodes = Object.values(chain_nodes).filter((n) => n.state === 'HEALTHY' || (n.health_score >= 70 && n.state !== 'FAILED'));

  // Determine readiness details
  const isPrismReady = currentScore >= 70;

  // --- Run Relocation Simulation ---
  const runSimulation = () => {
    setIsSimulated(true);
    setSimStep(1);
    setSimLogs([
      `[${new Date().toLocaleTimeString()}] 📡 INITIATING PRISM SENTINEL STATE ANALYSIS...`,
      `[${new Date().toLocaleTimeString()}] 🛡️ Current Resilience Index: ${prismHealth.overall_score}/100`,
      `[${new Date().toLocaleTimeString()}] ⚠️ Checking active security alerts and degraded nodes...`,
    ]);

    // Find alternative target chain
    const targetChain = stateMachine.migration_status?.best_alternative || 'ethereum';
    const targetsName = getChainLabel(targetChain);

    // Timeout Sequence for Mock Migration
    setTimeout(() => {
      // Step 2: Check Liquidity Nodes
      setSimStep(2);
      setSimLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] 🟢 Sentinels active. Failed/Degraded chains identified: [${failedNodes.map((n) => getChainLabel(n.chain)).join(', ') || 'None'}].`,
        `[${new Date().toLocaleTimeString()}] 🧪 Querying LUMINA Liquidity Engine for routing alternatives...`,
        `[${new Date().toLocaleTimeString()}] ⚡ Destination node identified: ${targetsName} (Health Score: ${stateMachine.chain_nodes?.[targetChain]?.health_score ?? 100}/100)`,
        `[${new Date().toLocaleTimeString()}] 🔒 Securing cross-chain relay bridges and cryptographic proofs...`,
      ]);
    }, 1000);

    setTimeout(() => {
      // Step 3: Relocate State
      setSimStep(3);
      setSimLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] 🔗 Bridges locked. Relocating state hashes...`,
        ...failedNodes.map((node) => 
          `[${new Date().toLocaleTimeString()}] 💸 Transferring ${formatUSD(node.value_usd)} (${node.percentage}%) from ${getChainLabel(node.chain)} to ${targetsName}...`
        ),
        `[${new Date().toLocaleTimeString()}] 🔀 Running smart router contract execution...`,
      ]);

      // Locally shift balances to target chain
      setSimState((prev) => {
        const nextNodes = JSON.parse(JSON.stringify(prev.chain_nodes));
        let valueToMigrate = 0;

        // Reset failed node values and mark them as MIGRATING
        Object.keys(nextNodes).forEach((c) => {
          const node = nextNodes[c];
          if (node.state === 'FAILED' || node.health_score < 40) {
            valueToMigrate += node.value_usd;
            node.value_usd = 0;
            node.percentage = 0;
            node.state = 'MIGRATING';
            node.state_color = '#3b82f6'; // Blue for migrating
            node.failure_reason = 'Assets relocated to secure node';
          }
        });

        // Add values to target node
        if (nextNodes[targetChain]) {
          nextNodes[targetChain].value_usd += valueToMigrate;
          nextNodes[targetChain].state = 'HEALTHY';
          nextNodes[targetChain].state_color = '#22c55e';
        }

        // Recalculate percentages
        const totalVal = Object.values(nextNodes).reduce((acc, curr) => acc + curr.value_usd, 0);
        Object.keys(nextNodes).forEach((c) => {
          const node = nextNodes[c];
          node.percentage = totalVal > 0 ? parseFloat(((node.value_usd / totalVal) * 100).toFixed(2)) : 0;
        });

        return {
          ...prev,
          chain_nodes: nextNodes,
          portfolio_state: 'MIGRATING',
          portfolio_state_label: 'Migrating',
          portfolio_state_color: '#3b82f6',
        };
      });
    }, 2500);

    setTimeout(() => {
      // Step 4: Recalculate
      setSimStep(4);
      setSimLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] 🌀 Relocation transactions confirmed on-chain.`,
        `[${new Date().toLocaleTimeString()}] 🧾 State proofs generated. Finalizing ledger settlement...`,
        `[${new Date().toLocaleTimeString()}] 📡 Recalculating portfolio health indicators...`,
      ]);

      // Shift score and state to stable/resilient
      setSimScore(95); // Higher score
      setSimState((prev) => {
        const nextNodes = JSON.parse(JSON.stringify(prev.chain_nodes));
        Object.keys(nextNodes).forEach((c) => {
          const node = nextNodes[c];
          if (node.state === 'MIGRATING') {
            node.state = 'UNKNOWN'; // Safe but inactive
            node.state_color = '#6b7280';
          }
        });

        return {
          ...prev,
          chain_nodes: nextNodes,
          portfolio_state: 'RESILIENT',
          portfolio_state_label: 'Resilient',
          portfolio_state_color: '#00d4aa',
          migration_plan: {
            migration_needed: false,
            plans: [],
            estimated_safety_improvement: 0,
          },
          prism_health: {
            overall_score: 95,
            recommendation: 'Portfolio fully stabilized post-relocation.',
            prism_ready: true,
            chain_scores: {
              ethereum: 95,
              polygon: 95,
              bsc: 90,
              solana: 95,
              arbitrum: 95,
            },
          },
        };
      });
    }, 4000);

    setTimeout(() => {
      // Step 5: Finished
      setSimStep(5);
      setSimLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ✅ STATE RELOCATION COMPLETE.`,
        `[${new Date().toLocaleTimeString()}] 🛡️ New Portfolio State: RESILIENT (Score: 95/100)`,
        `[${new Date().toLocaleTimeString()}] 🚀 All assets secured. PRISM Safeguards at full capacity.`,
      ]);
    }, 5000);
  };

  const resetSimulation = () => {
    setIsSimulated(false);
    setSimStep(0);
    setSimLogs([]);
    setSimScore(prismHealth.overall_score);
    setSimState({
      portfolio_state: stateMachine.portfolio_state,
      portfolio_state_label: stateMachine.portfolio_state_label,
      portfolio_state_color: stateMachine.portfolio_state_color,
      chain_nodes: JSON.parse(JSON.stringify(stateMachine.chain_nodes || {})),
      migration_plan: JSON.parse(JSON.stringify(stateMachine.migration_plan || {})),
      prism_health: JSON.parse(JSON.stringify(prismHealth || {})),
    });
  };

  // Color classes helper for resilience score
  const getScoreStyle = (score) => {
    if (score >= 70) return { text: 'text-emerald-400', stroke: '#10b981', bg: 'bg-emerald-950/20', border: 'border-emerald-500/30' };
    if (score >= 40) return { text: 'text-amber-400', stroke: '#f59e0b', bg: 'bg-amber-950/20', border: 'border-amber-500/30' };
    return { text: 'text-rose-400', stroke: '#f43f5e', bg: 'bg-rose-950/20', border: 'border-rose-500/30' };
  };

  const scoreStyle = getScoreStyle(currentScore);
  const strokeDashoffset = 282.6 - (282.6 * currentScore) / 100; // SVG circle circumference is ~282.6

  return (
    <div className="space-y-6 tab-content">
      {/* --- Simulation Warning Ribbon --- */}
      {isSimulated && (
        <div className="bg-gradient-to-r from-blue-900/60 to-indigo-900/60 border border-blue-500/40 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg shadow-blue-950/20 animate-pulse">
          <div className="flex items-center gap-2">
            <span className="text-xl">🔬</span>
            <div className="text-left">
              <p className="text-blue-100 font-bold text-sm">PRISM Simulation Mode Active</p>
              <p className="text-blue-300 text-xs mt-0.5">
                Displaying simulated post-migration states. No real wallet assets are affected.
              </p>
            </div>
          </div>
          <button
            onClick={resetSimulation}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs rounded-lg transition-all border border-blue-400/30 shadow-md shadow-blue-950/40"
          >
            Reset Simulation
          </button>
        </div>
      )}

      {/* --- HEADER BLOCK --- */}
      <div className="bg-gray-900/40 border border-gray-800/80 rounded-xl p-6 relative overflow-hidden backdrop-blur-md">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-indigo-500/5 to-cyan-500/5 rounded-full filter blur-3xl -z-10" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">🛡️</span>
              <h2 className="text-white font-bold text-xl tracking-tight">PRISM Resilience Center</h2>
            </div>
            <p className="text-gray-400 text-sm mt-1 max-w-2xl">
              Monitor, mitigate, and resolve multi-chain vulnerabilities. PRISM drives automatic state relocations
              to shield your portfolio from single-chain node failure and liquidity constraints.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 font-mono">Status:</span>
            {isPrismReady ? (
              <span className="bg-emerald-950/50 border border-emerald-500/40 text-emerald-400 text-xs font-bold px-3.5 py-1.5 rounded-full uppercase tracking-wider shadow-sm shadow-emerald-950/50">
                ✓ PRISM Ready
              </span>
            ) : (
              <span className="bg-rose-950/50 border border-rose-500/40 text-rose-400 text-xs font-bold px-3.5 py-1.5 rounded-full uppercase tracking-wider shadow-sm shadow-rose-950/50 animate-pulse">
                ⚠ Rebalancing Advised
              </span>
            )}
          </div>
        </div>
      </div>

      {/* --- 4-HERO METRICS GRID --- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Resilience Score */}
        <div className="bg-gray-900 border border-gray-800 hover:border-gray-700/80 rounded-xl p-5 flex items-center justify-between transition-all duration-300 shadow-sm">
          <div className="space-y-1">
            <span className="text-gray-500 text-xs font-medium uppercase tracking-wider">Resilience Score</span>
            <div className="flex items-baseline gap-1">
              <span className={`text-2xl font-bold font-mono ${scoreStyle.text}`}>{currentScore}</span>
              <span className="text-gray-600 text-sm">/100</span>
            </div>
            <p className="text-gray-400 text-xs mt-1">Weighted network stability score</p>
          </div>
          {/* Radial Dial */}
          <div className="relative w-16 h-16 flex-shrink-0">
            <svg className="w-16 h-16 transform -rotate-90">
              <circle cx="32" cy="32" r="28" stroke="#1f2937" strokeWidth="4" fill="transparent" />
              <circle
                cx="32"
                cy="32"
                r="28"
                stroke={scoreStyle.stroke}
                strokeWidth="4"
                fill="transparent"
                strokeDasharray="175.8"
                strokeDashoffset={175.8 - (175.8 * currentScore) / 100}
                className="transition-all duration-1000 ease-out"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-gray-500">
              {currentScore}%
            </div>
          </div>
        </div>

        {/* Metric 2: Portfolio State */}
        <div className="bg-gray-900 border border-gray-800 hover:border-gray-700/80 rounded-xl p-5 transition-all duration-300 shadow-sm">
          <span className="text-gray-500 text-xs font-medium uppercase tracking-wider">Portfolio State</span>
          <div className="flex items-center gap-2.5 mt-2">
            <span
              className="w-3.5 h-3.5 rounded-full flex-shrink-0 relative"
              style={{ backgroundColor: portfolio_state_color }}
            >
              <span
                className="animate-ping absolute inset-0 rounded-full opacity-60"
                style={{ backgroundColor: portfolio_state_color }}
              />
            </span>
            <span className="text-white font-bold text-lg">{portfolio_state_label}</span>
          </div>
          <p className="text-gray-400 text-xs mt-2.5 leading-snug">
            {portfolio_state === 'CRITICAL' && 'Dominant asset node has failed. Emergency relocation recommended.'}
            {portfolio_state === 'AT_RISK' && 'Vulnerability detected on one or more active nodes.'}
            {portfolio_state === 'STABLE' && 'Assets are healthy and well diversified.'}
            {portfolio_state === 'RESILIENT' && 'Shielded cross-chain state. Max survivability active.'}
            {portfolio_state === 'MIGRATING' && 'Active cross-chain ledger relocations in progress...'}
          </p>
        </div>

        {/* Metric 3: Failed Chains */}
        <div className="bg-gray-900 border border-gray-800 hover:border-gray-700/80 rounded-xl p-5 transition-all duration-300 shadow-sm">
          <span className="text-gray-500 text-xs font-medium uppercase tracking-wider">Failed Nodes</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className={`text-2xl font-bold font-mono ${failedNodes.length > 0 ? 'text-rose-500' : 'text-emerald-400'}`}>
              {failedNodes.length}
            </span>
            <span className="text-gray-500 text-xs">/ {Object.keys(chain_nodes).length} total</span>
          </div>
          {failedNodes.length > 0 ? (
            <div className="flex gap-1 flex-wrap mt-2.5">
              {failedNodes.map((n) => (
                <span key={n.chain} className="bg-rose-950/50 border border-rose-500/30 text-rose-400 text-[10px] px-2 py-0.5 rounded font-mono uppercase tracking-wide">
                  {n.chain}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-xs mt-3">All nodes responsive. Cryptographic bridges secure.</p>
          )}
        </div>

        {/* Metric 4: Migration Readiness */}
        <div className="bg-gray-900 border border-gray-800 hover:border-gray-700/80 rounded-xl p-5 transition-all duration-300 shadow-sm">
          <span className="text-gray-500 text-xs font-medium uppercase tracking-wider">Migration Readiness</span>
          <div className="flex items-center gap-2 mt-2">
            <span className={`text-2xl font-bold font-mono ${migration_plan?.migration_needed ? 'text-amber-500' : 'text-emerald-400'}`}>
              {migration_plan?.migration_needed ? 'PENDING' : 'SECURE'}
            </span>
          </div>
          <p className="text-gray-400 text-xs mt-2.5 leading-snug">
            {migration_plan?.migration_needed
              ? `PRISM recommends relocating ${formatUSD(
                  migration_plan.plans.reduce((acc, curr) => acc + curr.value_at_risk, 0)
                )} off vulnerable nodes.`
              : 'Ledger distribution meets all stability guidelines.'}
          </p>
        </div>
      </div>

      {/* --- MIDDLE ROW: VULNERABLE NODES & MIGRATION CONTROLS --- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Relocation Engine & Recommendations */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <div className="flex items-center justify-between border-b border-gray-800 pb-4 mb-4">
              <div>
                <h3 className="text-white font-bold text-base">State Relocation Engine</h3>
                <p className="text-gray-400 text-xs mt-0.5">Automated cross-chain execution routing plans</p>
              </div>
              <span className="bg-indigo-950 text-indigo-400 text-[10px] px-2.5 py-1 rounded font-mono uppercase font-bold tracking-wide">
                PRISM-V1
              </span>
            </div>

            {migration_plan?.migration_needed ? (
              <div className="space-y-4">
                <div className="bg-amber-950/20 border border-amber-500/25 rounded-lg p-4 flex items-start gap-3">
                  <span className="text-amber-500 text-lg mt-0.5">⚡</span>
                  <div>
                    <p className="text-amber-200 font-semibold text-sm">Vulnerabilities Detected</p>
                    <p className="text-amber-300/80 text-xs mt-0.5">
                      Vulnerabilities on degraded nodes require relocating balances to alternative safe chains.
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {migration_plan.plans.map((plan, i) => {
                    const isImmediate = plan.urgency === 'IMMEDIATE';
                    return (
                      <div
                        key={i}
                        className="bg-gray-950/60 border border-gray-800/80 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-gray-700/60 transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <div className="bg-gray-900 px-3 py-1.5 rounded-lg border border-gray-800 text-center font-mono">
                            <span className="text-gray-400 text-xs block uppercase">From</span>
                            <span className="text-white font-bold text-sm">{getChainLabel(plan.from_chain)}</span>
                          </div>
                          <span className="text-indigo-500 font-bold text-lg">→</span>
                          <div className="bg-gray-900 px-3 py-1.5 rounded-lg border border-gray-800 text-center font-mono">
                            <span className="text-gray-400 text-xs block uppercase">To</span>
                            <span className="text-emerald-400 font-bold text-sm">{getChainLabel(plan.to_chain)}</span>
                          </div>
                        </div>

                        <div className="flex flex-col sm:items-end gap-1">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-400 text-xs">Value:</span>
                            <span className="text-white font-semibold font-mono text-sm">
                              {formatUSD(plan.value_at_risk)}
                            </span>
                          </div>
                          <span
                            className={`text-[9px] px-2 py-0.5 rounded font-mono uppercase font-bold tracking-wider self-start sm:self-auto border ${
                              isImmediate
                                ? 'bg-rose-950/40 border-rose-500/30 text-rose-400'
                                : 'bg-amber-950/40 border-amber-500/30 text-amber-400'
                            }`}
                          >
                            {plan.urgency}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Relocation Trigger Button */}
                <div className="pt-2">
                  {simStep === 0 ? (
                    <button
                      onClick={runSimulation}
                      className="w-full py-3 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold text-sm rounded-xl transition-all shadow-md shadow-indigo-900/30 flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-indigo-900/40 hover:-translate-y-0.5 border border-indigo-400/20"
                    >
                      <span>⚡</span> Execute PRISM Automated Relocation
                    </button>
                  ) : simStep < 5 ? (
                    <div className="w-full bg-gray-950 border border-gray-800 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-400 font-medium animate-pulse flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping inline-block" />
                          {simStep === 1 && 'Scanning ledger states...'}
                          {simStep === 2 && 'Querying LUMINA Liquidity Engine...'}
                          {simStep === 3 && 'Relocating ledger assets...'}
                          {simStep === 4 && 'Settling on-chain cryptographic proofs...'}
                        </span>
                        <span className="text-gray-500 font-mono">{simStep * 25}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-gray-900 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-500 transition-all duration-700 ease-out rounded-full"
                          style={{ width: `${simStep * 25}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="bg-emerald-950/20 border border-emerald-500/20 rounded-xl p-4 text-center space-y-2">
                      <p className="text-emerald-400 font-bold text-sm flex items-center justify-center gap-1.5">
                        <span>✓</span> State Relocation Succeeded
                      </p>
                      <p className="text-gray-400 text-xs">
                        All vulnerable ledger balances relocated to secure alternative nodes.
                      </p>
                      <button
                        onClick={resetSimulation}
                        className="mt-1 px-4 py-1.5 bg-gray-800 hover:bg-gray-700 text-white text-xs font-semibold rounded-lg transition-all border border-gray-700"
                      >
                        Reset Console Data
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Operational stable state */
              <div className="space-y-4">
                <div className="bg-emerald-950/20 border border-emerald-500/25 rounded-lg p-5 text-center flex flex-col items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-emerald-950 border border-emerald-500/30 flex items-center justify-center mb-3">
                    <span className="text-emerald-400 text-xl">✓</span>
                  </div>
                  <h4 className="text-emerald-200 font-bold text-sm">Resilience Threshold Satisfied</h4>
                  <p className="text-gray-400 text-xs mt-1 max-w-sm">
                    No active state migrations are recommended. All active ledger nodes satisfy critical security benchmarks.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Real-time simulation developer logs panel */}
          {isSimulated && (
            <div className="bg-black border border-gray-800 rounded-xl p-4 font-mono text-xs text-indigo-400/90 shadow-inner">
              <div className="flex items-center justify-between border-b border-gray-900 pb-2 mb-2">
                <span className="text-gray-500 uppercase tracking-wider text-[10px] font-bold">Relocation Console Output</span>
                <span className="text-gray-600 text-[10px]">{simStep}/5 steps</span>
              </div>
              <div className="h-40 overflow-y-auto space-y-1.5 scrollbar-thin">
                {simLogs.map((log, idx) => (
                  <p key={idx} className="leading-relaxed whitespace-pre-wrap break-all">
                    {log}
                  </p>
                ))}
                <div ref={logsEndRef} />
              </div>
            </div>
          )}
        </div>

        {/* Right Col: Degraded Node Health details */}
        <div className="space-y-6">
          {/* Failed / Degraded nodes panel */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
            <h3 className="text-white font-bold text-base">Node Health Indicators</h3>

            <div className="space-y-3">
              {Object.keys(chain_nodes).map((cKey) => {
                const node = chain_nodes[cKey];
                const isFailed = node.health_score < 40;
                const isDegraded = node.health_score >= 40 && node.health_score < 70;
                const isNodeHealthy = node.health_score >= 70;

                return (
                  <div
                    key={cKey}
                    className={`border rounded-lg p-3 transition-all ${
                      isFailed
                        ? 'bg-rose-950/10 border-rose-900/30'
                        : isDegraded
                        ? 'bg-amber-950/10 border-amber-900/30'
                        : 'bg-gray-950/40 border-gray-800/80'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-gray-400">{getChainIcon(cKey)}</span>
                        <span className="text-white font-bold text-xs">{getChainLabel(cKey)}</span>
                      </div>
                      <span
                        className="text-[9px] px-2 py-0.5 rounded font-mono uppercase font-bold tracking-wider"
                        style={{
                          backgroundColor: colorWithOpacity(node.state_color, 0.15),
                          color: node.state_color,
                          border: `1px solid ${colorWithOpacity(node.state_color, 0.3)}`,
                        }}
                      >
                        {node.state}
                      </span>
                    </div>

                    <div className="flex items-baseline justify-between">
                      <span className="text-gray-400 text-xs font-mono">Value: {formatUSD(node.value_usd)}</span>
                      <span className="text-white font-semibold text-xs font-mono">{node.percentage}%</span>
                    </div>

                    {/* Node Health Bar */}
                    <div className="mt-2 space-y-1">
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="text-gray-500">Node Stability Index</span>
                        <span style={{ color: node.state_color }} className="font-mono font-semibold">
                          {node.health_score}/100
                        </span>
                      </div>
                      <div className="w-full h-1 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${node.health_score}%`,
                            backgroundColor: node.state_color,
                          }}
                        />
                      </div>
                    </div>

                    {/* Failure details if not healthy */}
                    {node.failure_reason && (
                      <p className="mt-2 text-[10px] text-amber-400 bg-amber-950/20 border border-amber-900/20 rounded p-1.5 leading-normal">
                        ⚠ {node.failure_reason}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>


    </div>
  );
}
