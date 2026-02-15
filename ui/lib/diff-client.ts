type FetchAgentDiffInput = {
  agent: string;
  repoUrlInput?: string | null;
  signal?: AbortSignal;
  requestId?: string;
};

const normalizeDiffErrorMessage = (body: string) => {
  const trimmedBody = body.trim();
  return trimmedBody.length > 0 ? trimmedBody : "Failed to load diff";
};

export async function fetchAgentDiff({
  agent,
  repoUrlInput,
  signal,
  requestId,
}: FetchAgentDiffInput): Promise<string> {
  const search = new URLSearchParams({
    agent,
    t: requestId ?? Date.now().toString(),
  });

  const trimmedRepoUrlInput = repoUrlInput?.trim();
  if (trimmedRepoUrlInput) {
    search.set("repoUrl", trimmedRepoUrlInput);
  }

  const response = await fetch(`/api/diff?${search.toString()}`, {
    signal,
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(normalizeDiffErrorMessage(body));
  }

  return body;
}
