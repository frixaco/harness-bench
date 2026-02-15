const allowedReviewModels = new Set([
  "openai/gpt-5.2",
  "google/gemini-3-pro-preview",
]);

const maxPromptChars = 48_000;

type ReviewRequestPayload = {
  model: string;
  apiKey?: string;
  prompt: string;
};

class ReviewRequestError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ReviewRequestError";
    this.status = status;
  }
}

const createRequestId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const logReviewApi = (
  requestId: string,
  message: string,
  payload?: unknown,
) => {
  if (payload === undefined) {
    console.log(`[review-api:${requestId}] ${message}`);
    return;
  }

  console.log(`[review-api:${requestId}] ${message}`, payload);
};

const errorResponse = (status: number, message: string, requestId?: string) =>
  new Response(message, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      ...(requestId ? { "x-review-request-id": requestId } : {}),
    },
  });

const asNonEmptyString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const parsePrompt = (value: unknown): string => {
  const prompt = asNonEmptyString(value);
  if (!prompt) {
    throw new ReviewRequestError(400, "Missing review prompt");
  }
  if (prompt.length > maxPromptChars) {
    throw new ReviewRequestError(400, "Review prompt is too large");
  }
  return prompt;
};

const parseReviewRequest = async (
  req: Request,
): Promise<ReviewRequestPayload> => {
  let payload: unknown;

  try {
    payload = await req.json();
  } catch {
    throw new ReviewRequestError(400, "Invalid JSON body");
  }

  if (!payload || typeof payload !== "object") {
    throw new ReviewRequestError(400, "Invalid review request body");
  }

  const record = payload as Record<string, unknown>;
  const model = asNonEmptyString(record.model);
  if (!model) {
    throw new ReviewRequestError(400, "Missing review model");
  }
  if (!allowedReviewModels.has(model)) {
    throw new ReviewRequestError(400, "Unsupported review model");
  }

  const apiKey = asNonEmptyString(record.apiKey) ?? undefined;
  const prompt = parsePrompt(record.prompt);

  return {
    model,
    apiKey,
    prompt,
  };
};

export const handleReviewPost = async (req: Request) => {
  const requestId = createRequestId();
  try {
    logReviewApi(requestId, "incoming review request");
    const payload = await parseReviewRequest(req);
    const resolvedApiKey =
      payload.apiKey ?? asNonEmptyString(process.env.OPENROUTER_API_KEY);

    if (!resolvedApiKey) {
      throw new ReviewRequestError(
        400,
        "Missing OpenRouter API key. Provide a key or set OPENROUTER_API_KEY.",
      );
    }

    logReviewApi(requestId, "validated review request", {
      model: payload.model,
      promptChars: payload.prompt.length,
      keySource: payload.apiKey ? "request" : "env",
    });

    const openrouter = createOpenRouter({ apiKey: resolvedApiKey });
    const result = streamText({
      model: openrouter(payload.model),
      prompt: payload.prompt,
      maxRetries: 1,
      onFinish({ finishReason, usage }) {
        logReviewApi(requestId, "review stream finished", {
          finishReason,
          totalTokens: usage.totalTokens,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
        });
      },
      onError({ error }) {
        const message =
          error instanceof Error ? error.message : "Unknown stream error";
        logReviewApi(requestId, "review stream error", { message });
      },
    });

    logReviewApi(requestId, "stream response opened");
    return result.toTextStreamResponse({
      headers: {
        "x-review-request-id": requestId,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to start review stream";
    logReviewApi(requestId, "review handler failed", { message });

    if (error instanceof ReviewRequestError) {
      return errorResponse(error.status, error.message, requestId);
    }

    return errorResponse(500, message, requestId);
  }
};

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { streamText } from "ai";
