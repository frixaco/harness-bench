export function Dashboard() {
  const ws = useWS();
  const { repoUrl, runRequested } = useDashboardState();
  const { setRepoUrl, launchAgent: markAgentLaunched } = useDashboardActions();

  const trimmedRepoUrl = useDashboardStore(selectTrimmedRepoUrl);
  const isRepoSetup = useDashboardStore(selectIsRepoSetup);
  const launchedAgentCount = useDashboardStore(selectLaunchedAgentCount);

  const launchAgent = useCallback(
    (agent: string) => {
      ws.send(agent);
      markAgentLaunched(agent);
    },
    [markAgentLaunched, ws],
  );

  return (
    <main className="flex min-h-screen w-full flex-col bg-background">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
        <div className="mx-auto flex h-11 max-w-480 items-center gap-3 px-4">
          <span className="text-sm font-bold tracking-tight">hbench</span>

          <div className="mx-2 h-4 w-px bg-border" />

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
              variant="outline"
              disabled={trimmedRepoUrl.length === 0}
              onClick={() => {
                ws.send(
                  JSON.stringify({
                    type: "use-existing",
                    repoUrl: trimmedRepoUrl,
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
                  isRepoSetup ? "bg-emerald-500" : "bg-muted-foreground/50",
                )}
              />
              {isRepoSetup ? "ready" : "no repo"}
            </span>
          </div>

          <span className="text-xs tabular-nums text-muted-foreground">
            {launchedAgentCount}/{agents.length}
          </span>
        </div>
      </header>

      <CommandBar />

      <div className="flex-1 px-3 pt-3 pb-4">
        <div className="mx-auto grid max-w-480 gap-2 grid-cols-[repeat(auto-fit,minmax(420px,1fr))]">
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

import { useCallback } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "./components/button";
import { Input } from "./components/input";
import { useWS } from "./lib/websocket";
import { cn } from "./lib/utils";
import {
  agents,
  selectIsRepoSetup,
  selectLaunchedAgentCount,
  selectTrimmedRepoUrl,
  useDashboardActions,
  useDashboardState,
  useDashboardStore,
} from "./lib/store";
import { TUI } from "./components/tui";
import { CommandBar } from "./components/cmd-bar";
