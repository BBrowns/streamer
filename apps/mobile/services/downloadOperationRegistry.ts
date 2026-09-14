/**
 * Process-local single-flight registry for user-triggered downloads.
 *
 * The registry deliberately owns only the preparation Promise. Persisted
 * queue state remains owned by downloadStore, while bridge idempotency remains
 * owned by BridgeClient. A settled operation is removed so an explicit retry
 * can start a fresh preparation.
 */
export class DownloadOperationRegistry {
  private readonly active = new Map<string, Promise<unknown>>();

  run<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const existing = this.active.get(key);
    if (existing) return existing as Promise<T>;

    const promise = Promise.resolve()
      .then(operation)
      .finally(() => {
        if (this.active.get(key) === promise) this.active.delete(key);
      });
    this.active.set(key, promise);
    return promise;
  }

  clear() {
    this.active.clear();
  }
}

export function getDownloadOperationKey(input: {
  type: "movie" | "series";
  id: string;
  season?: number;
  episode?: number;
}) {
  return JSON.stringify([
    "download",
    input.type,
    input.id,
    input.season ?? null,
    input.episode ?? null,
  ]);
}
