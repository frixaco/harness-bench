const WebSocketContext = createContext<WebSocket | null>(null);

export function useWS() {
  const socket = useContext(WebSocketContext);

  return {
    isReady: socket?.readyState == WebSocket.OPEN,
    socket,
    send: (msg: string) => socket?.send(msg),
  };
}

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const [conn, setConn] = useState<WebSocket | null>(null);
  const setupToastIdRef = useRef<string | number | null>(null);
  const wipeToastIdRef = useRef<string | number | null>(null);

  useEffect(() => {
    let retry = 0;
    let socket: WebSocket | null = null;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProtocol}//${window.location.host}/api/vt`;

    function initWSConnection() {
      const wsConn = new WebSocket(wsUrl);
      wsConn.binaryType = "arraybuffer";

      socket = wsConn;
      setConn(wsConn);

      wsConn.onopen = () => {
        retry = 0;
      };
      wsConn.onerror = (err) => {
        console.error("ws err:", err);
      };
      wsConn.onclose = () => {
        console.error(`ws closed, retrying ${retry} times`);

        if (retry < 3) {
          retry++;

          timeout = setTimeout(() => initWSConnection(), 2000);
        }
      };
    }

    initWSConnection();

    return () => {
      socket?.close();
      setConn(null);

      if (timeout) clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    if (!conn) return;

    const handleStatus = (event: MessageEvent) => {
      if (typeof event.data !== "string") return;
      try {
        const payload = JSON.parse(event.data);
        if (payload?.type === "setup-status") {
          const isUseExisting = payload.mode === "existing";
          if (payload.status === "start") {
            setActiveRepoUrl(null);
            setupToastIdRef.current = toast.loading(
              isUseExisting
                ? "Loading existing worktrees..."
                : "Setting up worktrees...",
              {
                description: payload.repoUrl,
              },
            );
            return;
          }
          if (payload.status === "success") {
            setActiveRepoUrl(
              typeof payload.repoUrl === "string"
                ? payload.repoUrl.trim()
                : null,
            );
            toast.success(
              isUseExisting ? "Using existing worktrees" : "Setup complete",
              {
                id: setupToastIdRef.current ?? undefined,
                description: payload.repoUrl,
              },
            );
            return;
          }
          if (payload.status === "error") {
            setActiveRepoUrl(null);
            toast.error(
              isUseExisting ? "Use Existing failed" : "Setup failed",
              {
                id: setupToastIdRef.current ?? undefined,
                description: payload.message ?? payload.repoUrl,
              },
            );
          }
        }

        if (payload?.type === "wipe-status") {
          if (payload.status === "start") {
            setActiveRepoUrl(null);
            wipeToastIdRef.current = toast.loading("Wiping ~/.hbench...");
            return;
          }
          if (payload.status === "success") {
            setActiveRepoUrl(null);
            toast.success("Sandbox wiped", {
              id: wipeToastIdRef.current ?? undefined,
            });
            return;
          }
          if (payload.status === "error") {
            toast.error("Wipe failed", {
              id: wipeToastIdRef.current ?? undefined,
              description: payload.message,
            });
          }
        }
      } catch (error) {
        console.warn("Invalid status payload", error);
      }
    };

    conn.addEventListener("message", handleStatus);
    return () => {
      conn.removeEventListener("message", handleStatus);
    };
  }, [conn]);

  return <WebSocketContext value={conn}>{children}</WebSocketContext>;
}

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { setActiveRepoUrl } from "./store";
