export function Dashboard() {
  const ws = useWS();
  const repoUrlInput = useDashboardStore(selectRepoUrlInput);
  const runRequested = useDashboardStore(selectRunRequested);

  const trimmedRepoUrlInput = useDashboardStore(selectTrimmedRepoUrlInput);
  const isRepoReady = useDashboardStore(selectIsRepoReady);
  const launchedAgentCount = useDashboardStore(selectLaunchedAgentCount);

  const handleLaunchAgent = useCallback(
    (agent: string) => {
      ws.send(agent);
      launchAgent(agent);
    },
    [ws],
  );

  return (
    <main className="flex min-h-screen w-full flex-col bg-background">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
        <div className="mx-auto flex h-11 max-w-480 items-center gap-3 px-4">
          <span className="text-sm font-bold tracking-tight">hbench</span>

          <div className="mx-2 h-4 w-px bg-border" />

          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Input
              value={repoUrlInput}
              onChange={(e) => setRepoUrlInput(e.currentTarget.value)}
              placeholder="https://github.com/org/repo"
              className="h-7 max-w-sm font-mono text-xs"
            />
            <Button
              size="xs"
              disabled={trimmedRepoUrlInput.length === 0}
              onClick={() => {
                ws.send(
                  JSON.stringify({
                    type: "setup",
                    repoUrl: trimmedRepoUrlInput,
                  }),
                );
              }}
            >
              Setup
            </Button>
            <Button
              size="xs"
              variant="outline"
              disabled={trimmedRepoUrlInput.length === 0}
              onClick={() => {
                ws.send(
                  JSON.stringify({
                    type: "use-existing",
                    repoUrl: trimmedRepoUrlInput,
                  }),
                );
              }}
            >
              Use Existing
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
                  isRepoReady ? "bg-emerald-500" : "bg-muted-foreground/50",
                )}
              />
              {isRepoReady ? "ready" : "no repo"}
            </span>
          </div>

          <span className="text-xs tabular-nums text-muted-foreground">
            {launchedAgentCount}/{agents.length}
          </span>
        </div>
      </header>

      <CommandBar />

      <div className="flex-1 px-3 pt-3 pb-4">
        <div className="mx-auto grid max-w-480 gap-3 grid-cols-[repeat(auto-fit,minmax(420px,1fr))]">
          {agents.map((agent) => (
            <TUI
              key={agent}
              name={agent}
              runRequested={runRequested[agent] ?? false}
              repoReady={isRepoReady}
              repoUrl={trimmedRepoUrlInput}
              onLaunch={() => handleLaunchAgent(agent)}
            />
          ))}
        </div>
      </div>
    </main>
  );
}

import { useCallback } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "./components/button";
import { Input } from "./components/input";
import { useWS } from "./lib/websocket";
import { cn } from "./lib/utils";
import {
  agents,
  launchAgent,
  selectIsRepoReady,
  selectRunRequested,
  selectLaunchedAgentCount,
  selectRepoUrlInput,
  selectTrimmedRepoUrlInput,
  setRepoUrlInput,
  useDashboardStore,
} from "./lib/store";
import { TUI } from "./components/tui";
import { CommandBar } from "./components/cmd-bar";
