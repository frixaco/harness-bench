export function DiffView({
  loading,
  error,
  patch,
}: {
  loading: boolean;
  error: string | null;
  patch: string | null;
}) {
  const files = useMemo(
    () =>
      patch
        ? parsePatchFiles(patch).flatMap((parsedPatch) => parsedPatch.files)
        : [],
    [patch],
  );

  if (loading) {
    return <p className="text-muted-foreground">Loading diff...</p>;
  }
  if (error) {
    return <p className="text-destructive">{error}</p>;
  }
  if (!patch) {
    return <p className="text-muted-foreground">No changes yet.</p>;
  }

  if (files.length === 0) {
    return (
      <pre className="max-h-full overflow-auto rounded bg-background/60 p-3 text-xs">
        {patch}
      </pre>
    );
  }

  return (
    <div className="space-y-4">
      {files.map((file, index) => (
        <FileDiff
          key={file.cacheKey ?? `${file.name}-${index}`}
          fileDiff={file}
          options={{ theme: "pierre-dark" }}
        />
      ))}
    </div>
  );
}

import { useMemo } from "react";
import { parsePatchFiles } from "@pierre/diffs";
import { FileDiff } from "@pierre/diffs/react";
