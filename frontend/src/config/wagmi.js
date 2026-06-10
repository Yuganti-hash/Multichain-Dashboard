/**
 * frontend/src/config/wagmi.js
 * ==============================
 * Wagmi v2 + RainbowKit v2 configuration for the SOVEREIGN MultiChain Dashboard.
 *
 * Supported chains:
 *   - Ethereum Mainnet  (chain ID 1)
 *   - Polygon           (chain ID 137)
 *   - BNB Smart Chain   (chain ID 56)
 *   - Arbitrum One      (chain ID 42161)
 *
 * Transport:
 *   All chains use http() which falls back to the chain's default public RPC.
 *   For production, replace with paid RPC URLs (Alchemy, Infura, QuickNode)
 *   to avoid rate limiting on the public endpoints.
 *
 * WalletConnect Project ID:
 *   Get a free project ID at https://cloud.walletconnect.com
 *   Set it in frontend/.env as REACT_APP_WALLETCONNECT_PROJECT_ID
 *   or replace the fallback string below.
 */

import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { mainnet, polygon, bsc, arbitrum } from 'wagmi/chains';
import { http } from 'wagmi';

// ---------------------------------------------------------------------------
// WalletConnect Project ID
// ---------------------------------------------------------------------------
// Get your free project ID at https://cloud.walletconnect.com
// Set REACT_APP_WALLETCONNECT_PROJECT_ID in frontend/.env for production.
const PROJECT_ID =
  process.env.REACT_APP_WALLETCONNECT_PROJECT_ID || 'YOUR_PROJECT_ID';

if (PROJECT_ID === 'YOUR_PROJECT_ID') {
  console.warn(
    '[wagmi] WalletConnect projectId is not set. ' +
    'Get a free one at https://cloud.walletconnect.com and set ' +
    'REACT_APP_WALLETCONNECT_PROJECT_ID in frontend/.env'
  );
}

// ---------------------------------------------------------------------------
// Supported chains — matches the backend chains: ethereum, polygon, bsc, arbitrum
// ---------------------------------------------------------------------------
export const chains = [mainnet, polygon, bsc, arbitrum];

// ---------------------------------------------------------------------------
// Wagmi config — created via RainbowKit's getDefaultConfig() helper.
//
// getDefaultConfig() wires together:
//   - WagmiConfig  (provider management, account state)
//   - RainbowKit   (wallet modal UI, connectors)
//   - TanStack Query (async data fetching for chain state)
// ---------------------------------------------------------------------------
export const wagmiConfig = getDefaultConfig({
  // App metadata shown in wallet connection modals
  appName:        'SOVEREIGN MultiChain Dashboard',
  appDescription: 'Multi-chain portfolio intelligence powered by PRISM architecture.',
  appUrl:         process.env.REACT_APP_API_URL || 'http://localhost:3000',
  appIcon:        '', // Optional: URL to a 256×256 app icon

  projectId: PROJECT_ID,
  chains:    [mainnet, polygon, bsc, arbitrum],

  // ---------------------------------------------------------------------------
  // Transports — one per chain.
  // http() with no argument uses the chain's built-in public RPC endpoint.
  // For production, pass your own RPC URL:
  //   [mainnet.id]: http('https://mainnet.infura.io/v3/YOUR_KEY'),
  // ---------------------------------------------------------------------------
  transports: {
    [mainnet.id]:  http(), // Ethereum — defaults to cloudflare-eth.com
    [polygon.id]:  http(), // Polygon  — defaults to polygon-rpc.com
    [bsc.id]:      http(), // BNB Chain — defaults to bsc-dataseed.binance.org
    [arbitrum.id]: http(), // Arbitrum  — defaults to arb1.arbitrum.io/rpc
  },

  // Disable SSR (this is a CRA app, no server-side rendering)
  ssr: false,
});
