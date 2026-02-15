type TUIProps = {
  name: string;
  runRequested: boolean;
  repoReady: boolean;
  repoUrl: string;
  onLaunch: () => void;
};

export function TUI({
  name,
  runRequested,
  repoReady,
  repoUrl,
  onLaunch,
}: TUIProps) {
  const ws = useWS();
  const termDivContainer = useRef<HTMLDivElement | null>(null);
  const termInstance = useRef<Terminal | null>(null);
  const [diffOpen, setDiffOpen] = useState(false);
  const [diffPatch, setDiffPatch] = useState<string | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffRepoUrl, setDiffRepoUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let dataDisposable: { dispose: () => void } | null = null;
    let resizeDisposable: { dispose: () => void } | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let socket: WebSocket | null = null;

    const teardownSocket = () => {
      dataDisposable?.dispose();
      dataDisposable = null;
      resizeDisposable?.dispose();
      resizeDisposable = null;
      resizeObserver?.disconnect();
      resizeObserver = null;
      if (socket) {
        socket.removeEventListener("message", handleMessage);
        socket.removeEventListener("close", handleClose);
        socket = null;
      }
    };

    const attachSocket = (conn: WebSocket, term: Terminal) => {
      teardownSocket();
      socket = conn;
      dataDisposable = term.onData((data) => {
        socket?.send(
          JSON.stringify({
            type: "input",
            agent: name,
            data,
          }),
        );
      });
      socket.addEventListener("message", handleMessage);
      socket.addEventListener("close", handleClose);
    };

    const handleMessage = (event: MessageEvent) => {
      const term = termInstance.current;
      if (!term) return;
      const payload = event.data;
      if (typeof payload === "string") {
        try {
          const message = JSON.parse(payload);
          if (message.type !== "output") return;
          if (message.agent !== name) return;
          if (typeof message.data !== "string") return;
          const decoded = atob(message.data);
          const bytes = new Uint8Array(decoded.length);
          for (let i = 0; i < decoded.length; i += 1) {
            bytes[i] = decoded.charCodeAt(i);
          }
          term.write(bytes);
        } catch (error) {
          console.warn("Invalid output payload", error);
        }
      } else if (payload instanceof ArrayBuffer) {
        term.write(new Uint8Array(payload));
      }
    };

    const handleClose = () => {
      termInstance.current?.dispose();
      termInstance.current = null;
    };

    const sendResize = (cols: number, rows: number) => {
      if (!ws.conn || !ws.ready) return;
      ws.send(
        JSON.stringify({
          type: "resize",
          agent: name,
          cols,
          rows,
        }),
      );
    };

    const fitTerminal = (term: Terminal) => {
      const host = termDivContainer.current;
      if (!host || !term.renderer) return;
      const metrics = term.renderer.getMetrics();
      if (!metrics.width || !metrics.height) return;
      const cols = Math.max(2, Math.floor(host.clientWidth / metrics.width));
      const rows = Math.max(1, Math.floor(host.clientHeight / metrics.height));
      term.resize(cols, rows);
    };

    async function ensureTerminalSetup() {
      const host = termDivContainer.current;
      if (!host || termInstance.current) return;
      await init();
      if (!active) return;

      const term = new Terminal({
        fontSize: 14,
        theme: {
          background: "#16181a",
          foreground: "#ffffff",
          black: "#16181a",
          red: "#ff6e5e",
          green: "#5eff6c",
          yellow: "#f1ff5e",
          blue: "#5ea1ff",
          magenta: "#ff5ef1",
          cyan: "#5ef1ff",
          white: "#ffffff",
          brightBlack: "#3c4048",
          brightRed: "#ffbd5e",
          brightGreen: "#5eff6c",
          brightYellow: "#f1ff5e",
          brightBlue: "#5ea1ff",
          brightMagenta: "#ff5ea0",
          brightCyan: "#5ef1ff",
          brightWhite: "#ffffff",
        },
      });
      term.open(host);
      termInstance.current = term;
      fitTerminal(term);

      resizeObserver = new ResizeObserver(() => {
        if (termInstance.current) {
          fitTerminal(termInstance.current);
        }
      });
      resizeObserver.observe(host);
    }

    async function ensureSocketAttached() {
      await ensureTerminalSetup();
      if (!active || !ws.conn || !termInstance.current) return;
      attachSocket(ws.conn, termInstance.current);

      resizeDisposable = termInstance.current.onResize((size) => {
        sendResize(size.cols, size.rows);
      });

      fitTerminal(termInstance.current);
      sendResize(termInstance.current.cols, termInstance.current.rows);
    }

    if (runRequested) {
      ensureSocketAttached();
    }

    return () => {
      active = false;
      teardownSocket();
      termInstance.current?.dispose();
      termInstance.current = null;
    };
  }, [runRequested, ws.conn]);

  const fetchDiff = useCallback(
    async (repoUrlOverride?: string) => {
      setDiffLoading(true);
      setDiffError(null);
      try {
        const repoUrlParam = repoUrlOverride ?? diffRepoUrl ?? repoUrl;
        const search = new URLSearchParams({
          agent: name,
          t: Date.now().toString(),
        });
        if (repoUrlParam) {
          search.set("repoUrl", repoUrlParam);
        }
        const response = await fetch(`/api/diff?${search.toString()}`);
        const body = await response.text();
        if (!response.ok) {
          throw new Error(body || "Failed to load diff");
        }
        const trimmed = body.trim();
        setDiffPatch(trimmed.length > 0 ? body : null);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        setDiffError(message);
        setDiffPatch(null);
      } finally {
        setDiffLoading(false);
      }
    },
    [diffRepoUrl, name, repoUrl],
  );

  return (
    <div className="flex h-[38rem] min-h-[28rem] flex-col overflow-hidden rounded-lg border bg-[#16181a]">
      {/* Card header: agent name + model + actions */}
      <div className="flex items-center gap-2 border-b border-white/[0.06] bg-[#1c1e21] px-2.5 py-1.5">
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            runRequested ? "bg-emerald-500 animate-pulse" : "bg-white/20",
          )}
        />
        <span className="text-xs font-semibold capitalize text-white/90">
          {name}
        </span>

        <div className="flex-1" />

        <Button
          size="icon-xs"
          variant={runRequested ? "secondary" : "ghost"}
          disabled={!repoReady}
          onClick={onLaunch}
          className={cn(
            "text-white/60 hover:text-white",
            runRequested && "text-white",
          )}
          aria-label={`Launch ${name}`}
        >
          {runRequested ? <RefreshCcw className="animate-spin" /> : <Play />}
        </Button>

        <Sheet
          open={diffOpen}
          onOpenChange={(open) => {
            setDiffOpen(open);
            if (open) {
              setDiffRepoUrl(repoUrl);
              fetchDiff(repoUrl);
            }
          }}
        >
          <SheetTrigger
            render={
              <Button
                size="icon-xs"
                variant="ghost"
                className="text-white/60 hover:text-white"
                disabled={!repoReady}
                onClick={() => {
                  if (!diffOpen) {
                    setDiffOpen(true);
                  }
                  setDiffRepoUrl(repoUrl);
                  fetchDiff(repoUrl);
                }}
              />
            }
          >
            <Columns2 />
          </SheetTrigger>
          <SheetContent
            side="right"
            className="data-[side=right]:w-[96vw] data-[side=right]:sm:max-w-[92vw]"
          >
            <SheetHeader>
              <SheetTitle className="capitalize">{name} — Diff</SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-auto p-4">
              <DiffView
                loading={diffLoading}
                error={diffError}
                patch={diffPatch}
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Terminal area */}
      <div className="relative flex-1">
        {!runRequested && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <span className="text-xs text-white/25">press ▶ to launch</span>
          </div>
        )}
        <div ref={termDivContainer} className="size-full caret-background" />
      </div>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { Terminal, init } from "ghostty-web";
import { Columns2, Play, RefreshCcw } from "lucide-react";
import { Button } from "./button";
import { useWS } from "@/lib/websocket";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./sheet";
import { cn } from "@/lib/utils";
import { DiffView } from "./diff-view";
