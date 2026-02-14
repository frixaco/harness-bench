const agents = Object.keys(modelsJson as Record<string, unknown>);
const reviewModels = reviewModelOptions.map((option) => option.id);
const getReviewModelOption = (modelId: string) =>
  reviewModelOptions.find((option) => option.id === modelId) ??
  reviewModelOptions[0];
const createRunRequestedState = () =>
  agents.reduce(
    (a, c) => {
      a[c] = false;
      return a;
    },
    {} as Record<string, boolean>,
  );

export function Dashboard() {
  const [prompt, setPrompt] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [setupRepoUrl, setSetupRepoUrl] = useState<string | null>(null);
  const ws = useWS();
  const [runRequested, setRunRequested] = useState<Record<string, boolean>>(
    createRunRequestedState(),
  );
  const [stopping, setStopping] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewMarkdown, setReviewMarkdown] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewModel, setReviewModel] = useState(reviewModels[0]);
  const [reviewApiKey, setReviewApiKey] = useState("");
  const setupToastIdRef = useRef<string | number | null>(null);
  const wipeToastIdRef = useRef<string | number | null>(null);
  const reviewAbortRef = useRef<AbortController | null>(null);
  const trimmedRepoUrl = repoUrl.trim();
  const trimmedPrompt = prompt.trim();
  const isRepoSetup =
    trimmedRepoUrl.length > 0 && setupRepoUrl === trimmedRepoUrl;
  const launchedAgentCount = useMemo(
    () => Object.values(runRequested).filter(Boolean).length,
    [runRequested],
  );

  const launchAgent = useCallback(
    (agent: string) => {
      ws.send(agent);
      setRunRequested((prev) => ({ ...prev, [agent]: true }));
    },
    [ws],
  );

  const launchAllAgents = useCallback(() => {
    agents.forEach((agent) => ws.send(agent));
    setRunRequested(
      agents.reduce(
        (acc, agent) => {
          acc[agent] = true;
          return acc;
        },
        {} as Record<string, boolean>,
      ),
    );
  }, [ws]);

  const runPromptOnAllAgents = useCallback(() => {
    if (!trimmedPrompt) return;

    agents.forEach((agent) => {
      ws.send(
        JSON.stringify({
          type: "input",
          agent,
          data: trimmedPrompt,
        }),
      );
      window.setTimeout(() => {
        ws.send(
          JSON.stringify({
            type: "input",
            agent,
            data: "\r",
          }),
        );
      }, 250);
    });
  }, [trimmedPrompt, ws]);

  const stopAllAgents = useCallback(async () => {
    if (stopping) return;
    setStopping(true);
    try {
      const stopBase = `${window.location.protocol}//${window.location.hostname}:4000`;
      const response = await fetch(`${stopBase}/stop`, {
        method: "POST",
      });
      if (!response.ok) {
        const message = (await response.text()).trim();
        throw new Error(message || "Failed to stop agents");
      }
      toast.success("Stopped all agents");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error("Stop failed", { description: message });
    } finally {
      setRunRequested(createRunRequestedState());
      setStopping(false);
    }
  }, [stopping]);

  const requestReview = useCallback(async () => {
    reviewAbortRef.current?.abort();

    const controller = new AbortController();
    reviewAbortRef.current = controller;
    let streamedMarkdown = "";

    setReviewOpen(true);
    setReviewLoading(true);
    setReviewError(null);
    setReviewMarkdown("");

    try {
      const reviewBase = `${window.location.protocol}//${window.location.hostname}:4000`;
      const diffResults = await Promise.all(
        agents.map(async (agent, index) => {
          const search = new URLSearchParams({
            agent,
            t: `${Date.now()}-${index}`,
          });
          if (trimmedRepoUrl) {
            search.set("repoUrl", trimmedRepoUrl);
          }
          const response = await fetch(
            `${reviewBase}/diff?${search.toString()}`,
            {
              signal: controller.signal,
            },
          );
          const body = await response.text();
          if (!response.ok) {
            throw new Error(`${agent}: ${body || "Failed to load diff"}`);
          }
          return {
            agent,
            diff: body.trim(),
          };
        }),
      );

      const diffs = diffResults.filter((entry) => entry.diff.length > 0);
      if (diffs.length === 0) {
        throw new Error(
          "No agent diffs found. Run agents and make changes first.",
        );
      }

      const selectedModel = getReviewModelOption(reviewModel);
      const response = await fetch(`${reviewBase}/review`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: selectedModel.id,
          apiKey: reviewApiKey.trim() || undefined,
          reasoningEffort: selectedModel.reasoningEffort,
          messages: buildReviewMessages({
            repoUrl: trimmedRepoUrl,
            diffs,
          }),
        }),
      });

      if (!response.ok) {
        const raw = (await response.text()).trim();
        let message = raw || "Failed to start review stream";
        if (raw) {
          try {
            const parsed: unknown = JSON.parse(raw);
            if (
              typeof parsed === "object" &&
              parsed !== null &&
              "message" in parsed &&
              typeof parsed.message === "string"
            ) {
              message = parsed.message;
            }
          } catch {
            // non-JSON error body
          }
        }
        throw new Error(message);
      }
      if (!response.body) {
        throw new Error("Review stream unavailable");
      }

      await readOpenRouterSseStream(response.body, (token) => {
        streamedMarkdown += token;
        setReviewMarkdown(streamedMarkdown);
      });

      if (streamedMarkdown.trim().length === 0) {
        setReviewMarkdown("No review content returned.");
      }
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      const message = error instanceof Error ? error.message : "Unknown error";
      setReviewError(`Review stream failed: ${message}`);
      if (streamedMarkdown.trim().length > 0) {
        setReviewMarkdown(streamedMarkdown);
      } else {
        setReviewMarkdown(null);
      }
    } finally {
      if (reviewAbortRef.current === controller) {
        reviewAbortRef.current = null;
        setReviewLoading(false);
      }
    }
  }, [reviewApiKey, reviewModel, trimmedRepoUrl]);

  useEffect(
    () => () => {
      reviewAbortRef.current?.abort();
      reviewAbortRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (!ws.conn) return;

    const handleStatus = (event: MessageEvent) => {
      if (typeof event.data !== "string") return;
      try {
        const payload = JSON.parse(event.data);
        if (payload?.type === "setup-status") {
          if (payload.status === "start") {
            setSetupRepoUrl(null);
            setupToastIdRef.current = toast.loading("Setting up worktrees...", {
              description: payload.repoUrl,
            });
            return;
          }
          if (payload.status === "success") {
            setSetupRepoUrl(
              typeof payload.repoUrl === "string"
                ? payload.repoUrl.trim()
                : null,
            );
            toast.success("Setup complete", {
              id: setupToastIdRef.current ?? undefined,
              description: payload.repoUrl,
            });
            return;
          }
          if (payload.status === "error") {
            setSetupRepoUrl(null);
            toast.error("Setup failed", {
              id: setupToastIdRef.current ?? undefined,
              description: payload.message ?? payload.repoUrl,
            });
          }
        }

        if (payload?.type === "wipe-status") {
          if (payload.status === "start") {
            setSetupRepoUrl(null);
            wipeToastIdRef.current = toast.loading("Wiping ~/.hbench...");
            return;
          }
          if (payload.status === "success") {
            setSetupRepoUrl(null);
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

    ws.conn.addEventListener("message", handleStatus);
    return () => {
      ws.conn?.removeEventListener("message", handleStatus);
    };
  }, [ws.conn]);

  return (
    <main className="flex min-h-screen w-full flex-col bg-background">
      {/* ── Header ── */}
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex h-11 max-w-[1920px] items-center gap-3 px-4">
          <span className="text-sm font-bold tracking-tight">hbench</span>

          <div className="mx-2 h-4 w-px bg-border" />

          {/* Repo setup inline */}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Input
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.currentTarget.value)}
              placeholder="https://github.com/org/repo"
              className="h-7 max-w-sm font-mono text-xs"
            />
            <Button
              size="xs"
              disabled={trimmedRepoUrl.length === 0}
              onClick={() => {
                ws.send(
                  JSON.stringify({
                    type: "setup",
                    repoUrl: trimmedRepoUrl,
                  }),
                );
              }}
            >
              Setup
            </Button>
            <Button
              size="xs"
              variant="destructive"
              onClick={() => {
                ws.send(JSON.stringify({ type: "wipe" }));
              }}
            >
              <Trash2 /> Wipe
            </Button>
          </div>

          {/* Status indicators */}
          <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  ws.ready ? "bg-emerald-500" : "bg-red-400",
                )}
              />
              {ws.ready ? "ws" : "offline"}
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  isRepoSetup ? "bg-emerald-500" : "bg-muted-foreground/50",
                )}
              />
              {isRepoSetup ? "ready" : "no repo"}
            </span>
          </div>

          <span className="text-xs tabular-nums text-muted-foreground">
            {launchedAgentCount}/{agents.length}
          </span>

          <ThemeToggle />
        </div>
      </header>

      {/* ── Command bar ── */}
      <div className="sticky top-11 z-20 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-[1920px] items-center gap-2 px-4 py-1.5">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                runPromptOnAllAgents();
              }
            }}
            placeholder="Broadcast prompt to all agents…"
            className="h-7 flex-1 rounded-md border border-input bg-transparent px-2.5 font-mono text-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 dark:bg-input/30"
          />
          <Button
            size="xs"
            disabled={!isRepoSetup || trimmedPrompt.length === 0}
            onClick={runPromptOnAllAgents}
          >
            <Send /> Send
          </Button>

          <div className="mx-1 h-4 w-px bg-border" />

          <Button
            size="xs"
            variant="outline"
            disabled={!isRepoSetup}
            onClick={launchAllAgents}
          >
            <Play /> All
          </Button>
          <Button
            size="xs"
            variant="destructive"
            disabled={stopping || launchedAgentCount === 0}
            onClick={() => void stopAllAgents()}
          >
            <Square /> Stop
          </Button>

          <div className="mx-1 h-4 w-px bg-border" />

          <Sheet
            open={reviewOpen}
            onOpenChange={(open) => {
              setReviewOpen(open);
              if (!open) {
                reviewAbortRef.current?.abort();
                reviewAbortRef.current = null;
                setReviewLoading(false);
              }
            }}
          >
            <SheetTrigger
              render={
                <Button
                  size="xs"
                  variant="outline"
                  disabled={!isRepoSetup}
                  onClick={requestReview}
                />
              }
            >
              {reviewLoading ? (
                <Loader2 className="animate-spin" />
              ) : (
                <MessageSquareCode />
              )}{" "}
              Review
            </SheetTrigger>
            <SheetContent
              side="right"
              className="data-[side=right]:w-[96vw] data-[side=right]:sm:max-w-[48rem]"
            >
              <SheetHeader>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Select
                      value={reviewModel}
                      onValueChange={(v) => v && setReviewModel(v)}
                    >
                      <SelectTrigger
                        size="sm"
                        className="h-6 gap-1 px-2 text-xs font-mono"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {reviewModelOptions.map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="xs"
                      disabled={reviewLoading}
                      onClick={requestReview}
                    >
                      {reviewLoading ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <RefreshCcw />
                      )}{" "}
                      Re-run
                    </Button>
                  </div>
                  <Input
                    value={reviewApiKey}
                    onChange={(event) =>
                      setReviewApiKey(event.currentTarget.value)
                    }
                    type="password"
                    placeholder="OpenRouter API key (optional)"
                    className="h-7 font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    Empty = use <code>OPENROUTER_API_KEY</code> from shell env.
                  </p>
                </div>
              </SheetHeader>
              <div className="flex-1 overflow-auto p-4">
                <ReviewView
                  loading={reviewLoading}
                  error={reviewError}
                  markdown={reviewMarkdown}
                />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* ── Terminal grid ── */}
      <div className="flex-1 px-3 pt-3 pb-4">
        <div className="mx-auto grid max-w-[1920px] gap-2 [grid-template-columns:repeat(auto-fit,minmax(420px,1fr))]">
          {agents.map((agent) => (
            <TUI
              key={agent}
              name={agent}
              runRequested={runRequested[agent] ?? false}
              repoReady={isRepoSetup}
              repoUrl={trimmedRepoUrl}
              onLaunch={() => launchAgent(agent)}
            />
          ))}
        </div>
      </div>
    </main>
  );
}

function TUI({
  name,
  runRequested,
  repoReady,
  repoUrl,
  onLaunch,
}: {
  name: string;
  runRequested: boolean;
  repoReady: boolean;
  repoUrl: string;
  onLaunch: () => void;
}) {
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
        const diffBase = `${window.location.protocol}//${window.location.hostname}:4000`;
        const search = new URLSearchParams({
          agent: name,
          t: Date.now().toString(),
        });
        if (repoUrlParam) {
          search.set("repoUrl", repoUrlParam);
        }
        const response = await fetch(`${diffBase}/diff?${search.toString()}`);
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

function DiffView({
  loading,
  error,
  patch,
}: {
  loading: boolean;
  error: string | null;
  patch: string | null;
}) {
  const files = useMemo(
    () =>
      patch
        ? parsePatchFiles(patch).flatMap((parsedPatch) => parsedPatch.files)
        : [],
    [patch],
  );

  if (loading) {
    return <p className="text-muted-foreground">Loading diff...</p>;
  }
  if (error) {
    return <p className="text-destructive">{error}</p>;
  }
  if (!patch) {
    return <p className="text-muted-foreground">No changes yet.</p>;
  }

  if (files.length === 0) {
    return (
      <pre className="max-h-full overflow-auto rounded bg-background/60 p-3 text-xs">
        {patch}
      </pre>
    );
  }

  return (
    <div className="space-y-4">
      {files.map((file, index) => (
        <FileDiff
          key={file.cacheKey ?? `${file.name}-${index}`}
          fileDiff={file}
          options={{ theme: "pierre-dark" }}
        />
      ))}
    </div>
  );
}

function ReviewView({
  loading,
  error,
  markdown,
}: {
  loading: boolean;
  error: string | null;
  markdown: string | null;
}) {
  if (!markdown && !loading && !error) {
    return (
      <p className="text-sm text-muted-foreground">
        Click Review to compare all agent diffs.
      </p>
    );
  }
  if (!markdown && loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Collecting diffs and sending for review…
      </div>
    );
  }
  if (error && !markdown) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  return (
    <div className="space-y-3">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Streamdown isAnimating={loading} caret={loading ? "block" : undefined}>
        {markdown ?? ""}
      </Streamdown>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Terminal, init } from "ghostty-web";
import { parsePatchFiles } from "@pierre/diffs";
import { FileDiff } from "@pierre/diffs/react";
import { Streamdown } from "streamdown";
import {
  Columns2,
  Loader2,
  MessageSquareCode,
  Play,
  RefreshCcw,
  Send,
  Square,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import modelsJson from "./models.json";
import { Button } from "./components/button";
import { Input } from "./components/input";
import { useWS } from "./lib/websocket";
import { ThemeToggle } from "./components/theme";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./components/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./components/select";
import { cn } from "./lib/utils";
import {
  buildReviewMessages,
  readOpenRouterSseStream,
  reviewModelOptions,
} from "./lib/reviewer";

