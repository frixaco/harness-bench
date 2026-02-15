export function ReviewSheet({
  isRepoReady,
  repoUrlInput,
}: {
  isRepoReady: boolean;
  repoUrlInput: string;
}) {
  const [open, setOpen] = useState(false);
  const [collectingDiffs, setCollectingDiffs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewModel, setReviewModel] = useState(
    reviewModelOptions[0]?.id ?? "",
  );
  const [reviewApiKey, setReviewApiKey] = useState("");

  const reviewAbortRef = useRef<AbortController | null>(null);
  const requestInFlightRef = useRef(false);

  const {
    completion,
    complete,
    error: completionError,
    isLoading,
    setCompletion,
    stop,
  } = useCompletion({
    api: "/api/review",
    streamProtocol: "text",
    experimental_throttle: 60,
  });

  const loading = collectingDiffs || isLoading;
  const markdown = completion.length > 0 ? completion : null;

  const abortDiffCollection = useCallback(() => {
    reviewAbortRef.current?.abort();
    reviewAbortRef.current = null;
  }, []);

  const stopReview = useCallback(() => {
    stop();
  }, [stop]);

  useEffect(
    () => () => {
      abortDiffCollection();
      stopReview();
    },
    [abortDiffCollection, stopReview],
  );

  useEffect(() => {
    if (!completionError) return;
    setError(`Review stream failed: ${completionError.message}`);
  }, [completionError]);

  const requestReview = useCallback(async () => {
    if (requestInFlightRef.current) {
      return;
    }
    requestInFlightRef.current = true;

    abortDiffCollection();
    stopReview();

    const controller = new AbortController();
    reviewAbortRef.current = controller;

    setOpen(true);
    setCollectingDiffs(true);
    setError(null);
    setCompletion("");

    try {
      const requestIdSeed = Date.now();
      const diffResults = await Promise.all(
        agents.map(async (agent, index) => {
          let body: string;
          try {
            body = await fetchAgentDiff({
              agent,
              repoUrlInput,
              signal: controller.signal,
              requestId: `${requestIdSeed}-${index}`,
            });
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Failed to load diff";
            throw new Error(`${agent}: ${message}`, { cause: error });
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

      const selectedModel =
        reviewModelOptions.find((option) => option.id === reviewModel) ??
        reviewModelOptions[0];

      if (!selectedModel) {
        throw new Error("No review model configured");
      }

      setCollectingDiffs(false);
      const output = await complete(
        buildReviewPrompt({ repoUrl: repoUrlInput, diffs }),
        {
          body: {
            model: selectedModel.id,
            apiKey: reviewApiKey.trim() || undefined,
          },
        },
      );

      if (
        !controller.signal.aborted &&
        typeof output === "string" &&
        output.trim().length === 0
      ) {
        setCompletion("No review content returned.");
      }
    } catch (nextError) {
      if (
        controller.signal.aborted ||
        (nextError instanceof Error && nextError.name === "AbortError")
      ) {
        return;
      }

      const message =
        nextError instanceof Error ? nextError.message : "Unknown error";
      setError(`Review stream failed: ${message}`);
    } finally {
      if (reviewAbortRef.current === controller) {
        reviewAbortRef.current = null;
      }
      setCollectingDiffs(false);
      requestInFlightRef.current = false;
    }
  }, [
    abortDiffCollection,
    complete,
    repoUrlInput,
    reviewApiKey,
    reviewModel,
    setCompletion,
    stopReview,
  ]);

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          abortDiffCollection();
          stopReview();
          setCollectingDiffs(false);
          requestInFlightRef.current = false;
        }
      }}
    >
      <SheetTrigger
        render={
          <Button
            size="xs"
            variant="outline"
            disabled={!isRepoReady || loading}
          />
        }
      >
        {loading ? <Loader2 className="animate-spin" /> : <MessageSquareCode />}{" "}
        Review
      </SheetTrigger>
      <SheetContent
        side="right"
        className="data-[side=right]:w-[96vw] data-[side=right]:sm:max-w-3xl"
      >
        <SheetHeader>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Select
                value={reviewModel}
                onValueChange={(nextModel) =>
                  nextModel && setReviewModel(nextModel)
                }
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
                disabled={loading}
                onClick={() => void requestReview()}
              >
                {loading ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <RefreshCcw />
                )}{" "}
                Run
              </Button>
            </div>
            <Input
              value={reviewApiKey}
              onChange={(event) => setReviewApiKey(event.currentTarget.value)}
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
          <ReviewView loading={loading} error={error} markdown={markdown} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { useCompletion } from "@ai-sdk/react";
import { Loader2, MessageSquareCode, RefreshCcw } from "lucide-react";
import { Button } from "./button";
import { Input } from "./input";
import { ReviewView } from "./review-view";
import { Sheet, SheetContent, SheetHeader, SheetTrigger } from "./sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";
import { fetchAgentDiff } from "@/lib/diff-client";
import { agents } from "@/lib/store";
import { buildReviewPrompt, reviewModelOptions } from "@/lib/reviewer";
