export function CommandBar() {
  const ws = useWS();
  const trimmedRepoUrl = useDashboardStore(selectTrimmedRepoUrl);
  const isRepoSetup = useDashboardStore(selectIsRepoSetup);
  const launchedAgentCount = useDashboardStore(selectLaunchedAgentCount);
  const { prompt, stopping } = useDashboardState();
  const {
    setPrompt,
    setStopping,
    launchAllAgents: markAllAgentsLaunched,
    resetRunRequested,
  } = useDashboardActions();
  const trimmedPrompt = useDashboardStore(selectTrimmedPrompt);

  const launchAllAgents = useCallback(() => {
    agents.forEach((agent) => ws.send(agent));
    markAllAgentsLaunched();
  }, [markAllAgentsLaunched, ws]);

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
      const response = await fetch("/api/stop", {
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
      resetRunRequested();
      setStopping(false);
    }
  }, [resetRunRequested, setStopping, stopping]);

  return (
    <div className="sticky top-11 z-20 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
      <div className="mx-auto flex max-w-480 items-center gap-2 px-4 py-1.5">
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

        <ReviewSheet repoReady={isRepoSetup} repoUrl={trimmedRepoUrl} />
      </div>
    </div>
  );
}

import { useCallback } from "react";
import { Play, Send, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./button";
import { ReviewSheet } from "./review-sheet";
import {
  agents,
  selectIsRepoSetup,
  selectLaunchedAgentCount,
  selectTrimmedPrompt,
  selectTrimmedRepoUrl,
  useDashboardActions,
  useDashboardState,
  useDashboardStore,
} from "@/lib/store";
import { useWS } from "@/lib/websocket";
