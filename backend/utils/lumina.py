"""
backend/utils/lumina.py
========================
LUMINA Liquidity Intelligence Module.
Fetches real-time TVL (Total Value Locked) data from DeFiLlama
for the chains supported by this dashboard.

DeFiLlama API docs: https://defillama.com/docs/api
No API key required.
"""

import httpx

# Chains we care about — must match DeFiLlama's "name" field exactly
RELEVANT_CHAINS: list[str] = [
    "Ethereum",
    "Polygon",
    "BSC",
    "Solana",
    "Arbitrum",
    "Base",
]


# ===========================================================================
# PUBLIC FUNCTION — get_liquidity_data
# ===========================================================================
async def get_liquidity_data() -> dict:
    """
    Fetch live TVL data for all supported chains from DeFiLlama.

    Returns
    -------
    {
        "status": "live" | "error",
        "chains": [
            {
                "name":  str,    # e.g. "Ethereum"
                "tvl":   float,  # raw USD TVL
                "label": str     # formatted, e.g. "$45.2B TVL"
            },
            ...
        ],
        "source": "DeFiLlama"
    }
    """
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.get("https://api.llama.fi/v2/chains")
            chains = r.json()
            filtered = [c for c in chains if c.get("name") in RELEVANT_CHAINS]
            return {
                "status": "live",
                "chains": [
                    {
                        "name":  c["name"],
                        "tvl":   c.get("tvl", 0),
                        "label": f"${c.get('tvl', 0) / 1e9:.1f}B TVL",
                    }
                    for c in filtered
                ],
                "source": "DeFiLlama",
            }
    except Exception as e:
        print(f"[lumina] Failed to fetch liquidity data: {e}")
        return {"status": "error", "chains": [], "source": "DeFiLlama"}
