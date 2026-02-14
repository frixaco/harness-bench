export function ReviewSheet({
  repoReady,
  repoUrl,
}: {
  repoReady: boolean;
  repoUrl: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewModel, setReviewModel] = useState(
    reviewModelOptions[0]?.id ?? "",
  );
  const [reviewApiKey, setReviewApiKey] = useState("");

  const reviewAbortRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      reviewAbortRef.current?.abort();
      reviewAbortRef.current = null;
    },
    [],
  );

  const requestReview = useCallback(async () => {
    reviewAbortRef.current?.abort();

    const controller = new AbortController();
    reviewAbortRef.current = controller;
    let streamedMarkdown = "";

    setOpen(true);
    setLoading(true);
    setError(null);
    setMarkdown("");

    try {
      const diffResults = await Promise.all(
        agents.map(async (agent, index) => {
          const search = new URLSearchParams({
            agent,
            t: `${Date.now()}-${index}`,
          });
          if (repoUrl) {
            search.set("repoUrl", repoUrl);
          }

          const response = await fetch(`/api/diff?${search.toString()}`, {
            signal: controller.signal,
          });
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

      const selectedModel =
        reviewModelOptions.find((option) => option.id === reviewModel) ??
        reviewModelOptions[0];

      if (!selectedModel) {
        throw new Error("No review model configured");
      }

      const response = await fetch("/api/review", {
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
            repoUrl,
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
        setMarkdown(streamedMarkdown);
      });

      if (streamedMarkdown.trim().length === 0) {
        setMarkdown("No review content returned.");
      }
    } catch (nextError) {
      if (controller.signal.aborted) {
        return;
      }

      const message =
        nextError instanceof Error ? nextError.message : "Unknown error";
      setError(`Review stream failed: ${message}`);

      if (streamedMarkdown.trim().length > 0) {
        setMarkdown(streamedMarkdown);
      } else {
        setMarkdown(null);
      }
    } finally {
      if (reviewAbortRef.current === controller) {
        reviewAbortRef.current = null;
        setLoading(false);
      }
    }
  }, [repoUrl, reviewApiKey, reviewModel]);

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          reviewAbortRef.current?.abort();
          reviewAbortRef.current = null;
          setLoading(false);
        }
      }}
    >
      <SheetTrigger
        render={
          <Button
            size="xs"
            variant="outline"
            disabled={!repoReady}
            onClick={() => void requestReview()}
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
                Re-run
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
import { agents } from "@/lib/store";
import {
  buildReviewMessages,
  readOpenRouterSseStream,
  reviewModelOptions,
} from "@/lib/reviewer";
