const reviewReasoningEfforts = [
  "xhigh",
  "high",
  "medium",
  "low",
  "minimal",
  "none",
] as const;

export type ReviewReasoningEffort = (typeof reviewReasoningEfforts)[number];

export type ReviewModelOption = {
  id: string;
  label: string;
  reasoningEffort?: ReviewReasoningEffort;
};

type DiffEntry = {
  agent: string;
  diff: string;
};

type ReviewMessage = {
  role: "system" | "user";
  content: string;
};

const maxPerAgentDiffChars = 6_000;
const maxTotalDiffChars = 24_000;

const reviewSystemPrompt = [
  "You are a strict code-review judge comparing git diffs from multiple agents.",
  "Return markdown only. No preamble, no chain-of-thought, no speculation, no repetition.",
  "Keep response under 220 words.",
  "Focus only on what is visible in the diffs: correctness, risk, tests, maintainability.",
  "Use exactly this structure:",
  "## Best vs Worst",
  "- Best: <agent> — <one-line reason>",
  "- Worst: <agent> — <one-line reason>",
  "## Agent Review",
  "| Agent | Verdict | Good | Problems |",
  "|---|---|---|---|",
  "| <agent> | pass/warn/fail | <short> | <short> |",
  "## Comparison",
  "- Why best beats second best (one line)",
  "- Biggest risk in worst patch (one line)",
].join(" ");

export const reviewModelOptions: Array<ReviewModelOption> = [
  {
    id: "openai/gpt-5.2",
    label: "GPT 5.2 (xhigh)",
    reasoningEffort: "xhigh",
  },
  {
    id: "google/gemini-3-pro-preview",
    label: "Gemini 3 Pro Preview (high)",
    reasoningEffort: "high",
  },
];

const truncateText = (value: string, maxChars: number) => {
  if (value.length <= maxChars) return value;
  const omitted = value.length - maxChars;
  return `${value.slice(0, maxChars)}\n\n... [truncated ${String(omitted)} chars]`;
};

export const buildReviewMessages = ({
  repoUrl,
  diffs,
}: {
  repoUrl: string;
  diffs: Array<DiffEntry>;
}): Array<ReviewMessage> => {
  let budgetLeft = maxTotalDiffChars;
  const diffBlocks = diffs
    .map(({ agent, diff }) => {
      if (budgetLeft <= 0) {
        return `## Agent: ${agent}\n\nDiff omitted due to total size limit.`;
      }

      const capped = truncateText(diff, maxPerAgentDiffChars);
      const withinBudget = truncateText(capped, budgetLeft);
      budgetLeft -= withinBudget.length;

      return `## Agent: ${agent}\n\n\`\`\`diff\n${withinBudget}\n\`\`\``;
    })
    .join("\n\n");

  const repoHeader = repoUrl
    ? `Repository: ${repoUrl}`
    : "Repository: local worktree";

  return [
    {
      role: "system",
      content: reviewSystemPrompt,
    },
    {
      role: "user",
      content: [
        repoHeader,
        "Review each agent diff. Rank best and worst. Keep it concise.",
        'Important: evaluate only changed code shown below. If information is missing, say "unclear from diff".',
        diffBlocks,
      ].join("\n\n"),
    },
  ];
};

const readTextField = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";

  const chunks: Array<string> = [];
  for (const part of value) {
    if (!part || typeof part !== "object") continue;
    const record = part as Record<string, unknown>;
    if (typeof record.text === "string") {
      chunks.push(record.text);
    }
  }

  return chunks.join("");
};

const tokenFromChunk = (parsed: unknown): string => {
  if (!parsed || typeof parsed !== "object") return "";
  const record = parsed as Record<string, unknown>;

  if (
    "error" in record &&
    record.error &&
    typeof record.error === "object" &&
    "message" in record.error &&
    typeof record.error.message === "string"
  ) {
    throw new Error(record.error.message);
  }

  if (!Array.isArray(record.choices) || record.choices.length === 0) {
    return "";
  }

  const firstChoice = record.choices[0];
  if (!firstChoice || typeof firstChoice !== "object") return "";
  const choice = firstChoice as Record<string, unknown>;
  if (!choice.delta || typeof choice.delta !== "object") return "";
  const delta = choice.delta as Record<string, unknown>;

  const parts = [
    readTextField(delta.reasoning),
    readTextField(delta.reasoning_content),
    readTextField(delta.content),
  ].filter((part) => part.length > 0);

  return parts.join("");
};

export const readOpenRouterSseStream = async (
  stream: ReadableStream<Uint8Array>,
  onToken: (token: string) => void,
) => {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventDataLines: Array<string> = [];

  const flushEvent = () => {
    if (eventDataLines.length === 0) return;
    const payload = eventDataLines.join("\n");
    eventDataLines = [];

    if (payload === "[DONE]") {
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      return;
    }

    const token = tokenFromChunk(parsed);
    if (token) {
      onToken(token);
    }
  };

  const consumeLines = (input: string) => {
    buffer += input.replaceAll("\r\n", "\n");

    for (;;) {
      const lineEnd = buffer.indexOf("\n");
      if (lineEnd === -1) {
        return;
      }

      const rawLine = buffer.slice(0, lineEnd);
      buffer = buffer.slice(lineEnd + 1);
      const line = rawLine.trimEnd();

      if (line.length === 0) {
        flushEvent();
        continue;
      }

      if (line.startsWith(":")) {
        continue;
      }

      if (line.startsWith("data:")) {
        eventDataLines.push(line.slice(5).trimStart());
      }
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      consumeLines(decoder.decode(value, { stream: true }));
    }

    consumeLines(`${decoder.decode()}\n`);
    flushEvent();
  } finally {
    reader.releaseLock();
  }
};
