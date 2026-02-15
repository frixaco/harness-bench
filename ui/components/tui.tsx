type TUIProps = {
  name: string;
  runRequested: boolean;
  isRepoReady: boolean;
  repoUrlInput: string;
  onLaunch: () => void;
};

export function TUI({
  name,
  runRequested,
  isRepoReady,
  repoUrlInput,
  onLaunch,
}: TUIProps) {
  const ws = useWS();
  const termDivContainer = useRef<HTMLDivElement | null>(null);
  const termInstance = useRef<Terminal | null>(null);
  const [diffOpen, setDiffOpen] = useState(false);
  const [diffPatch, setDiffPatch] = useState<string | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffRepoUrlInput, setDiffRepoUrlInput] = useState<string | null>(null);
  const headerPattern = getAgentPattern(name.toLowerCase());

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
      if (!ws.socket || !ws.isReady) return;
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
      if (!active || !ws.socket || !termInstance.current) return;
      attachSocket(ws.socket, termInstance.current);

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
  }, [runRequested, ws.socket]);

  const fetchDiff = useCallback(
    async (repoUrlInputOverride?: string) => {
      setDiffLoading(true);
      setDiffError(null);
      try {
        const nextRepoUrlInput =
          repoUrlInputOverride ?? diffRepoUrlInput ?? repoUrlInput;
        const body = await fetchAgentDiff({
          agent: name,
          repoUrlInput: nextRepoUrlInput,
        });
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
    [diffRepoUrlInput, name, repoUrlInput],
  );

  return (
    <div className="flex h-[38rem] min-h-[28rem] flex-col overflow-hidden rounded-lg border bg-[#16181a]">
      {/* Card header: agent name + model + actions */}
      <div
        className="flex items-center gap-2 border-b border-white/[0.06] bg-[#1c1e21] px-2.5 py-1.5"
        style={headerPattern}
      >
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
          disabled={!isRepoReady}
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
              setDiffRepoUrlInput(repoUrlInput);
              fetchDiff(repoUrlInput);
            }
          }}
        >
          <SheetTrigger
            render={
              <Button
                size="icon-xs"
                variant="ghost"
                className="text-white/60 hover:text-white"
                disabled={!isRepoReady}
                onClick={() => {
                  if (!diffOpen) {
                    setDiffOpen(true);
                  }
                  setDiffRepoUrlInput(repoUrlInput);
                  fetchDiff(repoUrlInput);
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
import { getAgentPattern } from "@/lib/agent-patterns";
import { fetchAgentDiff } from "@/lib/diff-client";
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
