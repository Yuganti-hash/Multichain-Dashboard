# MultiChain Dashboard 🌐

Unified crypto portfolio viewer — see all your assets across Ethereum, Polygon, BNB Chain, and Solana in one dashboard.

> **Live demo** → open `frontend/public/landing.html` directly in any browser (no build step needed).

---

## Features

- 🔗 **Multi-chain support** — Ethereum, Polygon, BNB Chain, Solana
- 💰 **Live USD prices** via CoinGecko API
- 🎨 **NFT detection** across all EVM chains
- 📊 **Interactive charts** — donut pie + bar chart
- ⚠️ **Risk score** based on chain concentration / diversification
- 📋 **Transaction history** with direct Etherscan deep-links
- 🧬 **PRISM Health Score** — portfolio resilience scoring (0–100) inspired by SOVEREIGN architecture
- 🧠 **AI Portfolio Advisor** — AutoGen + GPT-4o-mini with rule-based fallback
- ⚡ **Fast async backend** — FastAPI + asyncio parallel chain fetching

---

## UI Highlights (v2 — Dark Theme Redesign)

The landing page (`frontend/public/landing.html`) received a complete visual overhaul:

| Feature | Detail |
|---|---|
| **Theme** | Deep dark (`#060C1A`) with blue/cyan/purple accent system |
| **Typography** | Space Grotesk · Syne · Space Mono (Google Fonts) |
| **Custom cursor** | Dot + lagging ring, colour-shifts on hover; mouse-trail particles |
| **Particle canvas** | 80-particle interactive field — repels from cursor |
| **Hero animations** | Word-by-word headline reveal, parallax orbs, floating rings |
| **Ticker strip** | Live-style scrolling price/stat marquee below the hero |
| **3D tilt cards** | Feature cards, hero card, PRISM card, and all app cards use `preserve-3d` mouse-tilt |
| **Scroll reveals** | `.sr-section`, `.reveal-left/right/scale` driven by IntersectionObserver |
| **Glassmorphism nav** | `backdrop-filter: blur(20px)` navbar that darkens on scroll |
| **Gradient fills** | All progress bars, chain icons, and buttons use multi-stop gradients |
| **Animated step connector** | Progress line between "How it works" steps animates in on scroll |
| **Responsive** | Full mobile breakpoints at 768 px and 480 px |

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

---

## Tech Stack

| Layer | Technology |
|---|---|
| Landing / App shell | Vanilla HTML · CSS · JS (`landing.html`) — zero build step |
| Fonts | Space Grotesk · Syne · Space Mono (Google Fonts) |
| Icons | Tabler Icons webfont |
| Backend | Python 3.11+, FastAPI, Uvicorn, httpx |
| Data APIs | Moralis (EVM), Helius (Solana), CoinGecko |
| AI Advisor | AutoGen + GPT-4o-mini (rule-based fallback) |
| Deploy | Vercel (frontend), Railway (backend) |

---

## Prerequisites

- **Node.js** 18+ *(only needed if you use the React `src/` components)*
- **Python** 3.11+
- API keys for **Moralis**, **Helius**, and optionally **CoinGecko**

---

## Quick Start

### 1. Clone & enter the project

```bash
git clone https://github.com/Yuganti-hash/Multichain-Dashboard.git
cd multichain-dashboard
```

### 2. Open the landing page (no build needed)

```bash
# Just open in your browser — works without any server
start frontend/public/landing.html   # Windows
open  frontend/public/landing.html   # macOS
```

### 3. Backend setup

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
```

#### Database Setup (Optional)
The backend features an automatic DB fallback mechanism. If PostgreSQL is not running or not configured, the backend will automatically fallback to in-memory user and session storage so you can still register, login, and use the dashboard.

To enable persistent storage using PostgreSQL:
1. Ensure your PostgreSQL service is running.
2. In your `.env` file, configure the connection URL:
   `DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/sovereign`
3. Run the one-time database & tables setup script:
   ```bash
   python create_db.py
   ```

#### Start Backend:
```bash
# Start the backend
uvicorn main:app --reload --port 8000

# Verify it's running
curl http://localhost:8000/health
# Expected: {"status":"ok","version":"1.0.0"}
```

### 4. React Frontend Setup (Optional)

If you wish to run the full React dashboard with WalletConnect, RainbowKit, and Recharts:

```bash
cd frontend

# Install Node dependencies (if not already installed)
npm install

# Start the frontend React app (runs on port 3000, proxies requests to backend on port 8000)
npm start
```

### 5. Test with a real wallet

Paste Vitalik's public address into the search bar:

```
0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Health check — returns version info |
| GET | `/portfolio/{wallet_address}` | Full multi-chain portfolio data |
| GET | `/transactions/{wallet_address}` | Last 10 Ethereum transactions |

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `MORALIS_API_KEY` | ✅ Yes | Moralis Web3 API key — EVM chain data |
| `HELIUS_API_KEY` | ✅ Yes | Helius Solana API key — SPL token balances |
| `COINGECKO_API_KEY` | ⚪ No | CoinGecko Pro key — free tier works without it |

---

## Project Structure

```
multichain-dashboard/
├── backend/
│   ├── chains/
│   │   ├── ethereum.py        # Moralis EVM — ETH balance, ERC-20, NFTs, txns
│   │   ├── polygon.py         # Moralis EVM — MATIC balance, ERC-20, NFTs
│   │   ├── bsc.py             # Moralis EVM — BNB balance, BEP-20
│   │   └── solana.py          # Helius + Solana RPC — SOL balance, SPL tokens
│   ├── utils/
│   │   ├── prices.py          # CoinGecko live USD prices
│   │   └── risk.py            # Chain diversification risk scoring
│   ├── ai_advisor.py          # AutoGen AI advisor agent
│   ├── main.py                # FastAPI app — /portfolio, /transactions, /health
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── public/
│   │   └── landing.html       # ★ Self-contained landing + dashboard (no build)
│   ├── src/                   # React components (optional / legacy)
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

> **Tip:** `landing.html` is fully self-contained and can also be served as a static file on any CDN — no Node.js or build tooling required.

---

## Getting API Keys

| Provider | Sign-up URL | Free Tier |
|---|---|---|
| Moralis | https://admin.moralis.io/ | 40,000 requests/month |
| Helius | https://dev.helius.xyz/ | 100,000 requests/month |
| CoinGecko | https://www.coingecko.com/en/api | Public free tier (no key needed) |

---

## License

MIT — use, modify, and distribute freely.
