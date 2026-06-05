# MultiChain Dashboard 🌐

Unified crypto portfolio viewer — see all your assets across Ethereum, Polygon, BNB Chain, and Solana in one dashboard.

## Features

- 🔗 **Multi-chain support** — Ethereum, Polygon, BNB Chain, Solana
- 💰 **Live USD prices** via CoinGecko API
- 🎨 **NFT detection** across all EVM chains
- 📊 **Interactive charts** — donut pie + bar chart (Recharts)
- ⚠️  **Risk score** based on chain concentration / diversification
- 📋 **Transaction history** with direct Etherscan deep-links
- 🌙 **Full dark theme** — polished, production-quality UI
- ⚡ **Fast async backend** — FastAPI + asyncio parallel chain fetching

---

## Architecture Philosophy

This project is a **Mini-PRISM** proof of concept inspired by
SOVEREIGN's state-execution separation architecture.

### The Core Problem
> *"Financial state and execution environment are merged"*

Today your Ethereum balance only exists **on Ethereum**.  
Your Solana tokens only exist **on Solana**.  
If either chain fails, your financial state has a problem.

### PRISM-Inspired Approach

| PRISM Concept | This Implementation |
|---|---|
| Chain-agnostic state database | Portfolio aggregated from 4 chains into one unified view |
| Execution environment health | Per-chain PRISM health scoring (0–100) |
| State portability score | PRISM Ready badge when overall score ≥ 70 |
| Risk-based routing signals | Risk score + health score drive rebalancing recommendations |
| Universal state visibility | Single API response spanning ETH / Polygon / BSC / SOL |

### What a Production PRISM Would Add
- ZK proofs guaranteeing state integrity across data availability layers
- Automatic cross-chain migration when a chain health score drops
- Real-time protocol contagion detection (pre-cascade warning)
- Chain-agnostic transaction execution via PRISM Execution Router
- Jurisdiction-specific compliance proofs (VERTEX integration)

### How the Risk + PRISM Score Work Together

---

## Tech Stack

| Layer      | Technology                                  |
|------------|---------------------------------------------|
| Frontend   | React 18, TailwindCSS, Recharts, Axios      |
| Backend    | Python 3.11+, FastAPI, Uvicorn, httpx       |
| Data APIs  | Moralis (EVM), Helius (Solana), CoinGecko   |
| Deploy     | Vercel (frontend), Railway (backend)        |

---

## Prerequisites

- **Node.js** 18+
- **Python** 3.11+
- API keys for **Moralis**, **Helius**, and optionally **CoinGecko**

---

## Quick Start

### 1. Clone & enter the project

```bash
git clone <your-repo-url>
cd multichain-dashboard
```

### 2. Backend setup

```bash
cd backend

# Create and activate a virtual environment
python -m venv venv

# Windows
venv\Scripts\activate
# Mac / Linux
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env
# Open .env and paste in your API keys

# Start the backend
uvicorn main:app --reload --port 8000

# Verify it's running
curl http://localhost:8000/health
# Expected: {"status":"ok","version":"1.0.0"}
```

### 3. Frontend setup

```bash
cd ../frontend

# Install dependencies
npm install

# Point the frontend at the local backend
echo "REACT_APP_API_URL=http://localhost:8000" > .env

# Start the dev server
npm start
# Opens automatically at http://localhost:3000
```

### 4. Test with a real wallet

Paste Vitalik's public address into the search bar:

```
0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
```

---

## API Endpoints

| Method | Endpoint                          | Description                          |
|--------|-----------------------------------|--------------------------------------|
| GET    | `/health`                         | Health check — returns version info  |
| GET    | `/portfolio/{wallet_address}`     | Full multi-chain portfolio data      |
| GET    | `/transactions/{wallet_address}`  | Last 10 Ethereum transactions        |

---

## Environment Variables

| Variable            | Required | Description                                              |
|---------------------|----------|----------------------------------------------------------|
| `MORALIS_API_KEY`   | ✅ Yes   | Moralis Web3 API key — EVM chain data                    |
| `HELIUS_API_KEY`    | ✅ Yes   | Helius Solana API key — SPL token balances               |
| `COINGECKO_API_KEY` | ⚪ No    | CoinGecko Pro key — free tier works without it           |

---

## Project Structure

```
multichain-dashboard/
├── backend/
│   ├── chains/
│   │   ├── __init__.py
│   │   ├── ethereum.py        # Moralis EVM — ETH balance, ERC-20, NFTs, txns
│   │   ├── polygon.py         # Moralis EVM — MATIC balance, ERC-20, NFTs
│   │   ├── bsc.py             # Moralis EVM — BNB balance, BEP-20
│   │   └── solana.py          # Helius + Solana RPC — SOL balance, SPL tokens
│   ├── utils/
│   │   ├── __init__.py
│   │   ├── prices.py          # CoinGecko live USD prices
│   │   └── risk.py            # Chain diversification risk scoring
│   ├── main.py                # FastAPI app — /portfolio, /transactions, /health
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── SearchBar.js          # Wallet address input with validation
│   │   │   ├── PortfolioSummary.js   # 4-stat card grid + risk badge
│   │   │   ├── ChainBreakdown.js     # Per-chain value cards + progress bars
│   │   │   ├── TokenTable.js         # Sortable/filterable token table
│   │   │   ├── TransactionHistory.js # Recent txns with Etherscan links
│   │   │   ├── PieChart.js           # Recharts donut chart
│   │   │   └── BarChart.js           # Recharts bar chart (top 10 tokens)
│   │   ├── services/
│   │   │   └── api.js                # Axios instance + API helpers + formatters
│   │   ├── App.js                    # Root app shell — state, tabs, layout
│   │   └── index.js                  # React 18 createRoot entry point
│   ├── public/
│   │   └── index.html
│   ├── package.json
│   └── tailwind.config.js
└── README.md
```

---

## Deployment

### Backend — Railway

1. Push your repository to GitHub
2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
3. Select the `backend/` directory as the root
4. Add environment variables in the Railway dashboard:
   - `MORALIS_API_KEY`
   - `HELIUS_API_KEY`
   - `COINGECKO_API_KEY`
5. Railway auto-detects Python and deploys — note your public URL

### Frontend — Vercel

1. Go to [vercel.com](https://vercel.com) → **New Project** → Import from GitHub
2. Set **Root Directory** to `frontend`
3. Add environment variable:
   - `REACT_APP_API_URL` = `<your Railway backend URL>`
4. Click **Deploy**

---

## Getting API Keys

| Provider   | Sign-up URL                                      | Free Tier                        |
|------------|--------------------------------------------------|----------------------------------|
| Moralis    | https://admin.moralis.io/                        | 40,000 requests/month            |
| Helius     | https://dev.helius.xyz/                          | 100,000 requests/month           |
| CoinGecko  | https://www.coingecko.com/en/api                 | Public free tier (no key needed) |

---

## License

MIT — use, modify, and distribute freely.
