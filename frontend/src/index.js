/**
 * frontend/src/index.js
 * ======================
 * React application entry point.
 *
 * Provider tree (outermost → innermost):
 *
 *   React.StrictMode
 *   └── QueryClientProvider     (TanStack Query — async state for wagmi hooks)
 *       └── WagmiProvider       (wagmi v2 — wallet connection, account, chain state)
 *           └── RainbowKitProvider  (wallet modal UI, theme, chain switching)
 *               └── App         (existing application)
 *
 * This order is required by RainbowKit v2:
 *   - QueryClientProvider must wrap WagmiProvider (wagmi uses TanStack internally)
 *   - RainbowKitProvider must be inside WagmiProvider (it reads wagmi context)
 *   - App stays the innermost leaf — no changes needed to App.js
 *
 * To activate wallet connection in a component:
 *   import { ConnectButton } from '@rainbow-me/rainbowkit';
 *   import { useAccount, useChainId } from 'wagmi';
 *
 * WalletConnect Project ID:
 *   Set REACT_APP_WALLETCONNECT_PROJECT_ID in frontend/.env
 *   Get a free ID at https://cloud.walletconnect.com
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// ── RainbowKit CSS — must be imported before any component renders ───────────
import '@rainbow-me/rainbowkit/styles.css';

// ── RainbowKit + Wagmi providers ─────────────────────────────────────────────
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── Project wagmi config (chains, transports, WalletConnect projectId) ───────
import { wagmiConfig } from './config/wagmi';

// ---------------------------------------------------------------------------
// TanStack Query client
// Wagmi v2 uses TanStack Query internally for all async chain operations.
// One shared QueryClient instance is sufficient for the whole app.
// ---------------------------------------------------------------------------
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Retry failed chain RPC calls once before surfacing an error
      retry: 1,
      // Consider chain data fresh for 30 seconds before re-fetching
      staleTime: 30_000,
    },
  },
});

// ---------------------------------------------------------------------------
// Root render — provider tree wraps the existing App component unchanged
// ---------------------------------------------------------------------------
const root = ReactDOM.createRoot(document.getElementById('root'));

root.render(
  <React.StrictMode>
    {/*
      QueryClientProvider — must be outermost of the wagmi/rainbowkit stack.
      Provides async state management used by all wagmi hooks internally.
    */}
    <QueryClientProvider client={queryClient}>
      {/*
        WagmiProvider — manages wallet connection, account, and chain state.
        Reads config from wagmiConfig (chains, transports, WalletConnect).
      */}
      <WagmiProvider config={wagmiConfig}>
        {/*
          RainbowKitProvider — renders the ConnectButton wallet modal.
          Must live inside WagmiProvider so it can read wallet context.
          darkTheme() matches the existing dark-mode dashboard aesthetic.
        */}
        <RainbowKitProvider
          theme={darkTheme({
            accentColor:          '#00d4aa',  // SOVEREIGN teal — matches PRISM brand
            accentColorForeground: 'white',
            borderRadius:         'large',
            fontStack:            'system',
            overlayBlur:          'small',
          })}
          modalSize="compact"
        >
          {/* Existing App — no changes required */}
          <App />
        </RainbowKitProvider>
      </WagmiProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
