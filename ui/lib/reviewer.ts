export type ReviewModelOption = {
  id: string;
  label: string;
};

type DiffEntry = {
  agent: string;
  diff: string;
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
    label: "GPT 5.2",
  },
  {
    id: "google/gemini-3-pro-preview",
    label: "Gemini 3 Pro Preview",
  },
];

const truncateText = (value: string, maxChars: number) => {
  if (value.length <= maxChars) return value;
  const omitted = value.length - maxChars;
  return `${value.slice(0, maxChars)}\n\n... [truncated ${String(omitted)} chars]`;
};

export const buildReviewPrompt = ({
  repoUrl,
  diffs,
}: {
  repoUrl: string;
  diffs: Array<DiffEntry>;
}): string => {
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
    reviewSystemPrompt,
    repoHeader,
    "Review each agent diff. Rank best and worst. Keep it concise.",
    'Important: evaluate only changed code shown below. If information is missing, say "unclear from diff".',
    diffBlocks,
  ].join("\n\n");
};
