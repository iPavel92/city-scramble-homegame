import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMessage, GameStateView, ServerMessage } from "../shared/types";

export interface LobbyConnection {
  state: GameStateView | null;
  error: string | null;
  connected: boolean;
  send: (msg: ClientMessage) => void;
  clearError: () => void;
}

/** Connects to a lobby's WebSocket, authenticates with `token`, and keeps the
 *  latest server-pushed state. Reconnects automatically on drop. */
export function useLobby(code: string | undefined, token: string | null): LobbyConnection {
  const [state, setState] = useState<GameStateView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  useEffect(() => {
    if (!code || !token) return;
    let closedByUs = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let pingTimer: ReturnType<typeof setInterval> | undefined;
    let missedPongs = 0;

    const connect = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${location.host}/ws/${code}`);
      wsRef.current = ws;
      missedPongs = 0;

      ws.onopen = () => {
        setConnected(true);
        ws.send(JSON.stringify({ t: "hello", token: tokenRef.current } as ClientMessage));
        missedPongs = 0;
        // Keepalive: the server auto-responds "pong" without waking the DO. If we
        // stop getting any traffic back, the connection is dead — reconnect.
        pingTimer = setInterval(() => {
          if (ws.readyState !== WebSocket.OPEN) return;
          if (missedPongs >= 2) {
            try {
              ws.close();
            } catch {
              /* ignore */
            }
            return;
          }
          missedPongs++;
          try {
            ws.send("ping");
          } catch {
            /* ignore */
          }
        }, 25000);
      };
      ws.onmessage = (e) => {
        missedPongs = 0;
        if (e.data === "pong") return;
        let msg: ServerMessage;
        try {
          msg = JSON.parse(e.data as string) as ServerMessage;
        } catch {
          return;
        }
        if (msg.t === "state") setState(msg.state);
        else if (msg.t === "error") setError(msg.message);
      };
      ws.onclose = () => {
        setConnected(false);
        if (pingTimer) clearInterval(pingTimer);
        if (!closedByUs) retryTimer = setTimeout(connect, 1500);
      };
      ws.onerror = () => {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      };
    };

    connect();
    return () => {
      closedByUs = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (pingTimer) clearInterval(pingTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [code, token]);

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { state, error, connected, send, clearError };
}
