const WebSocketContext = createContext<WebSocket | null>(null);

export function useWS() {
  const conn = useContext(WebSocketContext);

  return {
    ready: conn?.readyState == WebSocket.OPEN,
    conn,
    error: null,
    send: (msg: string) => conn?.send(msg),
  };
}

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const [conn, setConn] = useState<WebSocket | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    let retry = 0;
    let socket: WebSocket | null = null;
    let timeout: NodeJS.Timeout | null = null;

    const base = new URL("http://localhost:4000");
    const wsProtocol = base.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProtocol}//${base.host}/vt`;

    function initWSConnection() {
      const wsConn = new WebSocket(wsUrl);
      wsConn.binaryType = "arraybuffer";

      socket = wsConn;
      setConn(wsConn);

      wsConn.onopen = () => {
        console.log("ws cond");
        retry = 0;
      };
      wsConn.onmessage = (event) => {
        console.log("ws msg:", event.data);
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

  if (!mounted) return null;

  return <WebSocketContext value={conn}>{children}</WebSocketContext>;
}

import { createContext, useContext, useEffect, useState } from "react";
