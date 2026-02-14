export function ReviewView({
  loading,
  error,
  markdown,
}: {
  loading: boolean;
  error: string | null;
  markdown: string | null;
}) {
  if (!markdown && !loading && !error) {
    return (
      <p className="text-sm text-muted-foreground">
        Click Review to compare all agent diffs.
      </p>
    );
  }
  if (!markdown && loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Collecting diffs and sending for review…
      </div>
    );
  }
  if (error && !markdown) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  return (
    <div className="space-y-3">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Streamdown isAnimating={loading} caret={loading ? "block" : undefined}>
        {markdown ?? ""}
      </Streamdown>
    </div>
  );
}

import { Streamdown } from "streamdown";
import { Loader2 } from "lucide-react";
