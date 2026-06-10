# MultiChain Dashboard — Internship Report

## Problem
Today crypto users need 4 apps to see their full portfolio.
SOVEREIGN's insight: "Financial state and execution environment are merged."
This project fixes that — one dashboard, 4 chains, independent state.

---

## What I Built

| Feature | Tech | SOVEREIGN Pillar | Status |
|---|---|---|---|
| Multi-Chain Portfolio | Moralis + Helius | PRISM | ✅ Live |
| Risk Scoring | Python logic | PRISM | ✅ Live |
| PRISM Health Score | Custom 0-100 algorithm | PRISM | ✅ Live ⭐ |
| Live USD Prices | CoinGecko API | ORACLE | ✅ Live |
| AI Advisor | AutoGen + GPT-4o-mini | AXIOM | ✅ Live |
| CREDEX Credit Score | On-chain scoring | CREDEX | ✅ Live |
| VERTEX Compliance | OFAC check | VERTEX | ✅ Live |
| ZK State Proof | SHA256 simulation | PRISM | ✅ Simulated |
| LUMINA TVL | DeFiLlama API | LUMINA | ✅ Live |
| NFTs + Transactions | Moralis | Asset layer | ✅ Live |

⭐ Original feature — not found in any existing portfolio app

---

## Live Results (ex.Vitalik's Wallet)

- Wallet: 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
- Total Value: $500.14M
- Tokens: 2,684 | NFTs: 20 | Active Chains: 3
- Risk Score: MEDIUM
- PRISM Score: 78/100 — PRISM READY ✓
- VERTEX: CLEAR — no sanctions

---

## SOVEREIGN Pillars Covered

| Pillar | Status |
|---|---|
| PRISM | ✅ Core concept fully demonstrated |
| CREDEX | ✅ On-chain credit scoring |
| VERTEX | ✅ Compliance + credential |
| LUMINA | ✅ DeFiLlama TVL data |
| AXIOM | ✅ AutoGen AI agent |
| ORACLE | ✅ Live CoinGecko prices |
| NEXUS | 🟡 Read-only simulation |

---

## Tech Stack
- Backend: Python + FastAPI + asyncio
- Frontend: React + TailwindCSS + Recharts
- AI: Microsoft AutoGen (JULIUS pattern)
- APIs: Moralis + Helius + CoinGecko + DeFiLlama
- Files: 25 total

---

## What Makes It Original

1. PRISM Health Score — invented by me, simulates SOVEREIGN's
   chain-agnostic state portability. No other app has this.

2. JULIUS AI Pattern — adapted from SOVEREIGN's cybersecurity
   platform into portfolio intelligence agent.

3. All 7 SOVEREIGN pillars demonstrated in one project.

---

## How to Run
Terminal 1: cd backend && uvicorn main:app --reload --port 8000
Terminal 2: cd frontend && npm start
Test wallet: 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045

API Keys (all free): MORALIS_API_KEY + HELIUS_API_KEY
Optional: OPENAI_API_KEY (fallback works without it)

---


