/** One request at a time. A refresh after a write must not reuse an older read. */
export function createStudioSync<T>(options: {
  onSnapshot: (snapshot: T) => void;
  onSuccess: () => void;
  onError: (error: Error) => void;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}) {
  let pending: Promise<void> | null = null;
  let queued = false;
  let stopped = false;
  let etag: string | null = null;
  let controller: AbortController | null = null;

  function refresh(afterWrite = false): Promise<void> {
    if (stopped) return Promise.resolve();
    if (pending) {
      if (afterWrite) queued = true;
      return pending;
    }
    pending = (async () => {
      do {
        queued = false;
        controller = new AbortController();
        const timeout = setTimeout(() => controller?.abort(), options.timeoutMs ?? 15_000);
        try {
          const response = await (options.fetcher || fetch)("/api/studio", {
            cache: "no-store",
            signal: controller.signal,
            headers: etag ? { "If-None-Match": etag } : {},
          });
          if (response.status !== 304 && !response.ok) {
            if (response.status === 401) etag = null;
            throw new Error(response.status === 401 ? "session_expired" : "studio_refresh_failed");
          }
          const snapshot = response.status === 304 ? null : await response.json() as T;
          // A write happened while this request was pending. Read again before
          // applying anything, so old data cannot undo the user's latest action.
          if (stopped || queued) continue;
          if (snapshot !== null) {
            options.onSnapshot(snapshot);
            etag = response.headers.get("etag");
          }
          options.onSuccess();
        } catch (cause) {
          if (stopped || queued) continue;
          const error = cause instanceof Error ? cause : new Error("studio_refresh_failed");
          options.onError(error);
          throw error;
        } finally {
          clearTimeout(timeout);
          controller = null;
        }
      } while (queued && !stopped);
    })().finally(() => { pending = null; });
    return pending;
  }

  return {
    refresh,
    stop() { stopped = true; controller?.abort(); },
  };
}
