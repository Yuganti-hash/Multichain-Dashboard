/**
 * frontend/src/hooks/useChainHealth.js
 * ======================================
 * Custom React hook for real-time chain health data.
 *
 * Strategy (in priority order):
 *   1. WebSocket — connects to ws://localhost:8000/ws/chain-health
 *      • Receives an immediate snapshot on connect, then updates every 15 s.
 *      • Auto-reconnects after 5 s on any drop, up to MAX_WS_FAILURES times.
 *   2. HTTP polling — falls back to GET /chain-health every 30 s after
 *      MAX_WS_FAILURES consecutive WebSocket failures.
 *
 * Returns:
 *   {
 *     chainHealth  {Object|null}  Latest per-chain health map
 *     isLive       {boolean}      true = WebSocket connected
 *     isPolling    {boolean}      true = fallback HTTP polling active
 *     lastUpdated  {string|null}  ISO-8601 timestamp of last successful update
 *   }
 */

import { useState, useEffect, useRef, useCallback } from 'react';

// ─── Configuration ────────────────────────────────────────────────────────────

// Derive URLs from the API URL or current host so they work behind the CRA dev proxy
// and in production with different frontend/backend origins.
const getBackendUrls = () => {
  const apiUrl = process.env.REACT_APP_API_URL || '';
  if (apiUrl) {
    // apiUrl looks like https://domain.com
    const restUrl = `${apiUrl}/chain-health`;
    const wsUrl = apiUrl.replace(/^http/, 'ws') + '/ws/chain-health';
    return { restUrl, wsUrl };
  }
  // Fallback for same-origin dev proxy
  const _host = window.location.hostname;
  const _port = window.location.port;
  const _wsProto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const wsUrl = `${_wsProto}://${_host}${_port ? `:${_port}` : ''}/ws/chain-health`;
  const restUrl = `/chain-health`;
  return { restUrl, wsUrl };
};

const { restUrl: REST_URL, wsUrl: WS_URL } = getBackendUrls();
const WS_RECONNECT_MS = 5_000;   // wait before reconnect attempt
const POLL_INTERVAL_MS= 30_000;  // HTTP polling interval when WS has given up
const MAX_WS_FAILURES = 3;       // consecutive failures before switching to poll

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useChainHealth() {
  const [chainHealth,  setChainHealth]  = useState(null);
  const [isLive,       setIsLive]       = useState(false);
  const [isPolling,    setIsPolling]    = useState(false);
  const [lastUpdated,  setLastUpdated]  = useState(null);

  // Stable refs so callbacks never go stale
  const wsRef           = useRef(null);   // active WebSocket instance
  const failureCountRef = useRef(0);      // consecutive WS failures
  const reconnectTimer  = useRef(null);   // setTimeout handle for reconnect
  const pollTimer       = useRef(null);   // setInterval handle for HTTP poll
  const destroyedRef    = useRef(false);  // set true on unmount to stop loops

  // ── Helpers ──────────────────────────────────────────────────────────────

  const applySnapshot = useCallback((data) => {
    setChainHealth(data);
    setLastUpdated(new Date().toISOString());
  }, []);

  const clearReconnectTimer = () => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
  };

  const clearPollTimer = () => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  };

  // ── HTTP polling fallback ─────────────────────────────────────────────────

  const startPolling = useCallback(() => {
    if (destroyedRef.current) return;
    setIsPolling(true);
    setIsLive(false);

    const poll = async () => {
      if (destroyedRef.current) return;
      try {
        const res  = await fetch(REST_URL);
        const data = await res.json();
        applySnapshot(data);
      } catch {
        // silently ignore poll errors — UI already shows isPolling state
      }
    };

    poll();                                         // immediate first fetch
    pollTimer.current = setInterval(poll, POLL_INTERVAL_MS);
  }, [applySnapshot]);

  // ── WebSocket connection ──────────────────────────────────────────────────

  const connect = useCallback(() => {
    if (destroyedRef.current) return;

    // Close any stale socket first
    if (wsRef.current) {
      wsRef.current.onclose = null; // suppress recursive close handler
      wsRef.current.close();
      wsRef.current = null;
    }

    let ws;
    try {
      ws = new WebSocket(WS_URL);
    } catch {
      // WebSocket constructor itself threw (e.g. bad URL in test env)
      failureCountRef.current += 1;
      if (failureCountRef.current >= MAX_WS_FAILURES) {
        startPolling();
      } else {
        reconnectTimer.current = setTimeout(connect, WS_RECONNECT_MS);
      }
      return;
    }

    wsRef.current = ws;

    ws.onopen = () => {
      if (destroyedRef.current) { ws.close(); return; }
      failureCountRef.current = 0;   // reset failure counter on success
      setIsLive(true);
      setIsPolling(false);
      clearPollTimer();              // cancel any active poll loop
    };

    ws.onmessage = (evt) => {
      if (destroyedRef.current) return;
      try {
        const data = JSON.parse(evt.data);
        applySnapshot(data);
      } catch {
        // ignore malformed frames
      }
    };

    ws.onerror = () => {
      // onerror always precedes onclose — we react in onclose below
    };

    ws.onclose = () => {
      if (destroyedRef.current) return;
      setIsLive(false);
      failureCountRef.current += 1;

      if (failureCountRef.current >= MAX_WS_FAILURES) {
        // Give up on WebSocket and fall back to polling
        startPolling();
      } else {
        // Schedule a reconnect attempt
        reconnectTimer.current = setTimeout(connect, WS_RECONNECT_MS);
      }
    };
  }, [applySnapshot, startPolling]);

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  useEffect(() => {
    destroyedRef.current = false;
    connect();

    return () => {
      // Teardown: close WS, cancel timers
      destroyedRef.current = true;
      clearReconnectTimer();
      clearPollTimer();
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      setIsLive(false);
      setIsPolling(false);
    };
  }, [connect]);

  return { chainHealth, isLive, isPolling, lastUpdated };
}

export default useChainHealth;
