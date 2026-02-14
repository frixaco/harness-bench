import { Effect } from "effect";
import { serve } from "bun";
import { OpenRouter } from "@openrouter/sdk";
import index from "./index.html";

import { existsSync, mkdirSync, rmSync } from "fs";
import os from "os";
import path from "path";
import agentModeMapping from "./lib/models.json";

const openRouterClient = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

const procs = new Map<string, Bun.Subprocess>();
const agentWorktrees = new Map<string, string>();

const agents = Object.keys(agentModeMapping);
const defaultCols = 80;
const defaultRows = 24;
const sandboxRoot = path.join(os.homedir(), ".hbench");
const corsHeaders = { "access-control-allow-origin": "*" };
const reviewMaxTokens = 2_400;
const stopDelayMs = {
  interrupt: 250,
  secondInterrupt: 350,
  term: 1200,
  kill: 500,
};
let stopAllInFlight: Promise<void> | null = null;

type ReviewMessage = {
  role: "system" | "user";
  content: string;
};

type ReviewReasoningEffort =
  | "xhigh"
  | "high"
  | "medium"
  | "low"
  | "minimal"
  | "none";

const reviewReasoningEfforts = new Set<ReviewReasoningEffort>([
  "xhigh",
  "high",
  "medium",
  "low",
  "minimal",
  "none",
]);

const agentBranchName = (agent: string) => `agent/${agent}`;

const repoSlugFromUrl = (repoUrl: string) => {
  const match = repoUrl.trim().match(/[:/]([^/]+\/[^/]+?)(\.git)?$/);
  if (!match) return null;
  return match[1].replace(/\.git$/, "").replace(/[\/\\]/g, "-");
};

const runGit = async (args: string[], cwd: string) => {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`git ${args.join(" ")} failed: ${stderr.trim()}`);
  }
};

const runGitWithOutput = async (args: string[], cwd: string) => {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`git ${args.join(" ")} failed: ${stderr.trim()}`);
  }
  return stdout;
};

const runGitNoIndexDiff = async (args: string[], cwd: string) => {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  if (exitCode > 1) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`git ${args.join(" ")} failed: ${stderr.trim()}`);
  }
  return stdout;
};

const buildWorktreeDiff = async (cwd: string) => {
  const diff = await runGitWithOutput(["-C", cwd, "diff"], cwd);
  const status = await runGitWithOutput(
    ["-C", cwd, "status", "--porcelain"],
    cwd,
  );
  const untracked = status
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("?? "))
    .map((line) => line.slice(3));

  if (untracked.length === 0) {
    return diff;
  }

  const untrackedDiffs = await Promise.all(
    untracked.map((file) =>
      runGitNoIndexDiff(
        ["-C", cwd, "diff", "--no-index", "--", "/dev/null", file],
        cwd,
      ),
    ),
  );
  return [diff, ...untrackedDiffs].filter(Boolean).join("\n");
};

const sendStatus = (
  ws: Bun.ServerWebSocket<undefined>,
  type: "setup-status" | "wipe-status",
  status: "start" | "success" | "error",
  payload: Record<string, unknown> = {},
) => {
  ws.send(
    JSON.stringify({
      type,
      status,
      ...payload,
    }),
  );
};

const sendAgentNotice = (
  ws: Bun.ServerWebSocket<undefined>,
  agent: string,
  message: string,
) => {
  ws.send(
    JSON.stringify({
      type: "output",
      agent,
      data: Buffer.from(message).toString("base64"),
    }),
  );
};

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const waitForExit = async (proc: Bun.Subprocess, timeoutMs: number) => {
  if (proc.exitCode !== null) return true;
  await Promise.race([proc.exited, wait(timeoutMs)]);
  return proc.exitCode !== null;
};

const stopTrackedProcess = async (agent: string, proc: Bun.Subprocess) => {
  if (proc.exitCode === null) {
    try {
      proc.terminal?.write("\u0003");
    } catch (error) {
      console.warn("Failed to send interrupt", agent, error);
    }

    const exitedAfterInterrupt = await waitForExit(proc, stopDelayMs.interrupt);
    if (!exitedAfterInterrupt && proc.exitCode === null) {
      try {
        proc.terminal?.write("\u0003");
      } catch (error) {
        console.warn("Failed to send second interrupt", agent, error);
      }
    }

    const exitedAfterSecondInterrupt = await waitForExit(
      proc,
      stopDelayMs.secondInterrupt,
    );
    if (!exitedAfterSecondInterrupt && proc.exitCode === null) {
      try {
        proc.kill("SIGTERM");
      } catch (error) {
        console.warn("Failed to send SIGTERM", agent, error);
      }
    }

    const exitedAfterTerm = await waitForExit(proc, stopDelayMs.term);
    if (!exitedAfterTerm && proc.exitCode === null) {
      try {
        proc.kill("SIGKILL");
      } catch (error) {
        console.warn("Failed to send SIGKILL", agent, error);
      }
      await waitForExit(proc, stopDelayMs.kill);
    }
  }

  try {
    proc.terminal?.close();
  } catch (error) {
    console.warn("Failed to close terminal", agent, error);
  }

  if (procs.get(agent) === proc) {
    procs.delete(agent);
  }
};

const stopAgentProcess = async (agent: string) => {
  const proc = procs.get(agent);
  if (!proc) return;
  await stopTrackedProcess(agent, proc);
};

const stopAllProcesses = async () => {
  if (stopAllInFlight) {
    await stopAllInFlight;
    return;
  }

  stopAllInFlight = (async () => {
    const entries = Array.from(procs.entries());
    await Promise.all(
      entries.map(([agent, proc]) => stopTrackedProcess(agent, proc)),
    );
    procs.clear();
  })();

  try {
    await stopAllInFlight;
  } finally {
    stopAllInFlight = null;
  }
};

const wipeSandbox = () => {
  if (!existsSync(sandboxRoot)) return;
  rmSync(sandboxRoot, { force: true, recursive: true });
  agentWorktrees.clear();
};

const ensureAgentWorktrees = async (repoUrl: string) => {
  const slug = repoSlugFromUrl(repoUrl);
  if (!slug) throw new Error("Invalid repository URL");

  const repoRoot = path.join(sandboxRoot, slug);
  const baseRepoPath = path.join(repoRoot, "repo");
  const worktreeRoot = path.join(repoRoot, "worktrees");

  if (existsSync(repoRoot)) {
    rmSync(repoRoot, { force: true, recursive: true });
  }

  mkdirSync(repoRoot, { recursive: true });
  mkdirSync(worktreeRoot, { recursive: true });
  await runGit(["clone", repoUrl, baseRepoPath], repoRoot);

  for (const agent of agents) {
    const worktreePath = path.join(worktreeRoot, agent);
    if (!existsSync(worktreePath)) {
      await runGit(
        [
          "-C",
          baseRepoPath,
          "worktree",
          "add",
          "-b",
          agentBranchName(agent),
          worktreePath,
        ],
        repoRoot,
      );
    }
    agentWorktrees.set(agent, worktreePath);
  }
};

const jsonErrorResponse = (status: number, message: string) =>
  new Response(JSON.stringify({ status: "error", message }), {
    status,
    headers: {
      ...corsHeaders,
      "content-type": "application/json; charset=utf-8",
    },
  });

const parseReviewMessages = (value: unknown): Array<ReviewMessage> => {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }

    const record = entry as Record<string, unknown>;
    const role = record.role;
    const content = record.content;
    if ((role !== "system" && role !== "user") || typeof content !== "string") {
      return [];
    }

    const trimmed = content.trim();
    if (!trimmed) return [];

    return [{ role, content: trimmed }];
  });
};

const resolveReviewReasoningEffort = (
  value: unknown,
): ReviewReasoningEffort | undefined => {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase() as ReviewReasoningEffort;
  if (!reviewReasoningEfforts.has(normalized)) return undefined;
  return normalized;
};

const errorMessageFromUnknown = (error: unknown) =>
  error instanceof Error ? error.message : "Unknown error";

const parseOpenRouterErrorMessage = async (response: Response) => {
  const raw = (await response.text()).trim();
  if (!raw) {
    return `${response.status} ${response.statusText}`.trim();
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "error" in parsed &&
      typeof parsed.error === "object" &&
      parsed.error !== null &&
      "message" in parsed.error &&
      typeof parsed.error.message === "string"
    ) {
      const errorRecord = parsed.error as Record<string, unknown>;
      const details: Array<string> = [errorRecord.message as string];
      if (
        "code" in errorRecord &&
        (typeof errorRecord.code === "string" ||
          typeof errorRecord.code === "number")
      ) {
        details.push(`code=${String(errorRecord.code)}`);
      }
      if (
        "metadata" in errorRecord &&
        typeof errorRecord.metadata === "object" &&
        errorRecord.metadata !== null
      ) {
        const metadata = errorRecord.metadata as Record<string, unknown>;
        if (typeof metadata.provider_name === "string") {
          details.push(`provider=${metadata.provider_name}`);
        }
        if (typeof metadata.raw === "string" && metadata.raw.trim()) {
          details.push(metadata.raw.trim());
        }
      }
      return details.join(" | ");
    }
  } catch {
    // ignore JSON parse errors
  }

  return raw;
};

const server = serve({
  routes: {
    "/*": index,

    "/api/stop": {
      async POST() {
        try {
          await stopAllProcesses();
          return Response.json({ status: "success" });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unknown error";
          return new Response(message, { status: 500 });
        }
      },
    },

    "/api/diff": {
      async GET(req) {
        const url = new URL(req.url);
        const agent = url.searchParams.get("agent");
        if (!agent || !agents.includes(agent)) {
          return new Response("Unknown agent", { status: 400 });
        }
        let cwd = agentWorktrees.get(agent);
        if (!cwd) {
          const repoUrl = url.searchParams.get("repoUrl");
          const slug = repoUrl ? repoSlugFromUrl(repoUrl) : null;
          if (slug) {
            const candidate = path.join(sandboxRoot, slug, "worktrees", agent);
            if (existsSync(candidate)) {
              cwd = candidate;
              agentWorktrees.set(agent, candidate);
            }
          }
        }
        if (!cwd) {
          return new Response("No worktree configured. Run SETUP first.", {
            status: 400,
          });
        }
        try {
          const diff = await buildWorktreeDiff(cwd);
          return new Response(diff || "", {
            headers: { "content-type": "text/plain; charset=utf-8" },
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unknown error";
          return new Response(message, { status: 500 });
        }
      },
    },

    "/api/review": {
      POST(req) {
        return proxyReviewStream(req);
      },
    },

    "/api/vt": (req, server) => {
      if (server.upgrade(req)) return;
      return new Response("Upgrade failed", { status: 400 });
    },
  },

  websocket: {
    async message(ws, message) {
      console.log(message);

      if (typeof message === "string" && agents.includes(message)) {
        const agent = message;
        const cwd = agentWorktrees.get(agent);
        if (!cwd) {
          console.warn("Missing worktree for agent", agent);
          sendAgentNotice(
            ws,
            agent,
            "No worktree configured. Run SETUP first.\r\n",
          );
          return;
        }
        await stopAgentProcess(agent);
        const proc = Bun.spawn([agent], {
          cwd,
          env: { ...process.env },
          onExit(exitedProc, _exitCode, _signalCode, _error) {
            if (procs.get(agent) === exitedProc) {
              procs.delete(agent);
            }
          },
          terminal: {
            cols: defaultCols,
            rows: defaultRows,
            data(_terminal, data) {
              const encoded = Buffer.from(data).toString("base64");
              ws.send(
                JSON.stringify({
                  type: "output",
                  agent,
                  data: encoded,
                }),
              );
            },
          },
        });
        procs.set(agent, proc);
      } else if (typeof message === "string" && message.startsWith("{")) {
        try {
          const payload = JSON.parse(message);
          if (payload.type === "wipe") {
            sendStatus(ws, "wipe-status", "start");
            try {
              await stopAllProcesses();
              wipeSandbox();
              sendStatus(ws, "wipe-status", "success");
            } catch (error) {
              const errorMessage =
                error instanceof Error ? error.message : "Unknown error";
              sendStatus(ws, "wipe-status", "error", { message: errorMessage });
            }
            return;
          }
          if (payload.type === "setup") {
            const repoUrl = payload.repoUrl;
            if (!repoUrl || typeof repoUrl !== "string") {
              sendStatus(ws, "setup-status", "error", {
                message: "Missing repository URL",
              });
              return;
            }
            try {
              sendStatus(ws, "setup-status", "start", { repoUrl });
              await ensureAgentWorktrees(repoUrl);
              sendStatus(ws, "setup-status", "success", { repoUrl });
            } catch (error) {
              const errorMessage =
                error instanceof Error ? error.message : "Unknown error";
              sendStatus(ws, "setup-status", "error", {
                repoUrl,
                message: errorMessage,
              });
              console.warn("Setup failed", error);
            }
            return;
          }
          if (payload.type === "input") {
            const agent = payload.agent;
            if (!agent || typeof agent !== "string") return;
            if (!agents.includes(agent)) return;
            if (typeof payload.data !== "string") return;
            procs.get(agent)?.terminal?.write(payload.data);
            return;
          }
          if (payload.type === "resize") {
            const agent = payload.agent;
            if (!agent || typeof agent !== "string") return;
            if (!agents.includes(agent)) return;
            const cols = Math.trunc(Number(payload.cols));
            const rows = Math.trunc(Number(payload.rows));
            if (!Number.isSafeInteger(cols) || !Number.isSafeInteger(rows))
              return;
            if (cols < 2 || rows < 1) return;
            if (cols > 2000 || rows > 1000) return;
            try {
              procs.get(agent)?.terminal?.resize(cols, rows);
            } catch (error) {
              console.warn("Failed to resize terminal", {
                agent,
                cols,
                rows,
                error,
              });
            }
            return;
          }
        } catch (error) {
          console.warn("Invalid message payload", error);
        }
      } else if (typeof message === "string") {
        const [agent, input] = message.split(":");
        procs.get(agent)?.terminal?.write(input);
      }
    },
    open(_ws) {
      console.log("opening");
    },
    close(_ws, _code, _message) {
      console.log("closing");
      void stopAllProcesses().catch((error) => {
        console.warn("Failed to stop processes on socket close", error);
      });
    },
    drain(_ws) {
      console.log("draining");
    },
  },

  development: process.env.NODE_ENV !== "production" && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
