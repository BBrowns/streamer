import { logger } from "../../config/logger.js";
import { streamResponseSchema, type Stream } from "@streamer/shared";
import { addonSupportsResource, getUserAddons } from "./addon-data.js";
import { buildAddonPolicyKey, resilientFetch } from "./upstream.js";
import { StreamParser } from "./domain/stream-parser.js";

const STREAM_DISCOVERY_CACHE_TTL_MS = 30_000;
const STREAM_DISCOVERY_CACHE_MAX_ENTRIES = 100;
const STREAM_DISCOVERY_FAST_WINDOW_MS = 250;
const STREAM_DISCOVERY_FAST_DEADLINE_MS = 1_750;

export type StreamDiscoveryStatus = "partial" | "complete";

/**
 * Internal, memory-only stream lookup result shared by the stream route and
 * the playback planner. The nested streams are runtime-only and are never
 * persisted or included in timing logs.
 */
export interface StreamDiscoveryResult {
  streams: Stream[];
  status: StreamDiscoveryStatus;
}

export interface StreamDiscoveryRequestOptions {
  /** Stops provider work only while no caller has received a fast result. */
  signal?: AbortSignal;
  /** Wait for every provider so the result can authorize a source. */
  requireComplete?: boolean;
}

type CachedStreamDiscoveryEntry = {
  expiresAt: number;
  value: StreamDiscoveryResult;
};

type InFlightStreamDiscoveryEntry = {
  controller: AbortController;
  fastPromise: Promise<StreamDiscoveryResult>;
  completePromise: Promise<StreamDiscoveryResult>;
  resolveFast: (value: StreamDiscoveryResult) => void;
  rejectFast: (reason?: unknown) => void;
  resolveComplete: (value: StreamDiscoveryResult) => void;
  rejectComplete: (reason?: unknown) => void;
  waiters: number;
  fastSettled: boolean;
  settled: boolean;
  invalidated: boolean;
  cancelledBeforeFastResult: boolean;
};

function isPlayableStreamResult(stream: Stream) {
  return Boolean(stream.url || stream.infoHash);
}

function sortAndEnrichStreams(
  batches: Array<Stream[] | undefined>,
  type: string,
  id: string,
): Stream[] {
  return batches
    .flatMap((batch) => batch ?? [])
    .map((stream, index) => ({
      stream: StreamParser.enrich({ ...stream, type, id }),
      index,
    }))
    .sort((a, b) => {
      const comparison = StreamParser.compare(a.stream, b.stream);
      return comparison === 0 ? a.index - b.index : comparison;
    })
    .map(({ stream }) => stream);
}

export class StreamDiscoveryService {
  private readonly streamDiscoveryCache = new Map<
    string,
    CachedStreamDiscoveryEntry
  >();
  private readonly streamDiscoveryInFlight = new Map<
    string,
    InFlightStreamDiscoveryEntry
  >();

  private streamDiscoveryKey(userId: string, type: string, id: string) {
    return `${userId}\u0000${type}\u0000${id}`;
  }

  private deleteStreamDiscoveryCacheEntry(key: string) {
    this.streamDiscoveryCache.delete(key);
  }

  private getStreamDiscoveryCacheEntry(key: string) {
    const entry = this.streamDiscoveryCache.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.deleteStreamDiscoveryCacheEntry(key);
      return undefined;
    }

    // Keep the bounded Map in least-recently-used order.
    this.streamDiscoveryCache.delete(key);
    this.streamDiscoveryCache.set(key, entry);
    return entry.value;
  }

  private storeStreamDiscoveryCache(key: string, value: StreamDiscoveryResult) {
    for (const [cachedKey, cached] of this.streamDiscoveryCache) {
      if (cached.expiresAt <= Date.now()) {
        this.deleteStreamDiscoveryCacheEntry(cachedKey);
      }
    }

    this.deleteStreamDiscoveryCacheEntry(key);
    while (
      this.streamDiscoveryCache.size >= STREAM_DISCOVERY_CACHE_MAX_ENTRIES
    ) {
      const oldestKey = this.streamDiscoveryCache.keys().next().value;
      if (oldestKey === undefined) break;
      this.deleteStreamDiscoveryCacheEntry(oldestKey);
    }

    this.streamDiscoveryCache.set(key, {
      expiresAt: Date.now() + STREAM_DISCOVERY_CACHE_TTL_MS,
      value,
    });
  }

  private getOrStartStreamDiscoveryRun(
    key: string,
    userId: string,
    type: string,
    id: string,
    requestId: string,
  ) {
    const current = this.streamDiscoveryInFlight.get(key);
    if (current && !current.settled && !current.controller.signal.aborted) {
      return current;
    }

    const controller = new AbortController();
    let resolveFast!: (value: StreamDiscoveryResult) => void;
    let rejectFast!: (reason?: unknown) => void;
    const fastPromise = new Promise<StreamDiscoveryResult>(
      (resolve, reject) => {
        resolveFast = resolve;
        rejectFast = reject;
      },
    );
    let resolveComplete!: (value: StreamDiscoveryResult) => void;
    let rejectComplete!: (reason?: unknown) => void;
    const completePromise = new Promise<StreamDiscoveryResult>(
      (resolve, reject) => {
        resolveComplete = resolve;
        rejectComplete = reject;
      },
    );
    // A caller may cancel before the run finishes. Keep the background
    // single-flight from producing an unhandled rejection in that case.
    void fastPromise.catch(() => undefined);
    void completePromise.catch(() => undefined);

    const entry: InFlightStreamDiscoveryEntry = {
      controller,
      fastPromise,
      completePromise,
      resolveFast,
      rejectFast,
      resolveComplete,
      rejectComplete,
      waiters: 0,
      fastSettled: false,
      settled: false,
      invalidated: false,
      cancelledBeforeFastResult: false,
    };
    this.streamDiscoveryInFlight.set(key, entry);
    void this.runStreamDiscovery(key, userId, type, id, requestId, entry);
    return entry;
  }

  private waitForStreamDiscoveryRun(
    entry: InFlightStreamDiscoveryEntry,
    callerSignal?: AbortSignal,
    promise: Promise<StreamDiscoveryResult> = entry.fastPromise,
  ): Promise<StreamDiscoveryResult> {
    entry.waiters += 1;
    return new Promise((resolve, reject) => {
      let finished = false;
      const finish = (settle: () => void) => {
        if (finished) return;
        finished = true;
        callerSignal?.removeEventListener("abort", abortForCaller);
        entry.waiters = Math.max(0, entry.waiters - 1);

        // Before a fast response, a route cancellation should stop the
        // outbound work rather than leave an abandoned fan-out running. Once a
        // partial result was returned, the background run intentionally keeps
        // going for the short-lived cache.
        if (
          entry.waiters === 0 &&
          !entry.fastSettled &&
          !entry.settled &&
          !entry.controller.signal.aborted
        ) {
          entry.cancelledBeforeFastResult = true;
          entry.controller.abort(new Error("Stream discovery cancelled."));
        }
        settle();
      };
      const abortForCaller = () =>
        finish(() =>
          reject(
            callerSignal?.reason ?? new Error("Stream discovery cancelled."),
          ),
        );

      if (callerSignal?.aborted) {
        abortForCaller();
        return;
      }

      callerSignal?.addEventListener("abort", abortForCaller, { once: true });
      promise.then(
        (value) => finish(() => resolve(value)),
        (error) => finish(() => reject(error)),
      );
    });
  }

  private async runStreamDiscovery(
    key: string,
    userId: string,
    type: string,
    id: string,
    requestId: string,
    entry: InFlightStreamDiscoveryEntry,
  ) {
    const startedAt = Date.now();
    const deadlineAt = startedAt + STREAM_DISCOVERY_FAST_DEADLINE_MS;
    let providersTotal = 0;
    let providersCompleted = 0;
    let batches: Array<Stream[] | undefined> = [];
    let fastWindowTimer: ReturnType<typeof setTimeout> | undefined;
    let fastDeadlineTimer: ReturnType<typeof setTimeout> | undefined;

    const clearTimers = () => {
      if (fastWindowTimer) clearTimeout(fastWindowTimer);
      if (fastDeadlineTimer) clearTimeout(fastDeadlineTimer);
      fastWindowTimer = undefined;
      fastDeadlineTimer = undefined;
    };
    const collectedStreams = () => sortAndEnrichStreams(batches, type, id);
    const timingFields = (
      result: StreamDiscoveryResult,
      cache: "hit" | "miss",
    ) => ({
      requestId,
      cache,
      status: result.status,
      latencyMs: Date.now() - startedAt,
      usableStreamCount: result.streams.filter(isPlayableStreamResult).length,
      providerResponses: providersCompleted,
      providerCount: providersTotal,
    });
    const settleFast = (status: StreamDiscoveryStatus) => {
      if (entry.fastSettled) return;
      const result: StreamDiscoveryResult = {
        streams: collectedStreams(),
        status,
      };
      if (
        status === "partial" &&
        !result.streams.some(isPlayableStreamResult)
      ) {
        return;
      }

      entry.fastSettled = true;
      if (fastWindowTimer) clearTimeout(fastWindowTimer);
      fastWindowTimer = undefined;
      if (status === "partial" && fastDeadlineTimer) {
        clearTimeout(fastDeadlineTimer);
        fastDeadlineTimer = undefined;
      }
      logger.info(timingFields(result, "miss"), "Stream discovery timing");
      entry.resolveFast(result);
    };
    const settleComplete = () => {
      if (entry.settled) return;
      clearTimers();
      const alreadyReturnedFastResult = entry.fastSettled;
      const result: StreamDiscoveryResult = {
        streams: collectedStreams(),
        status: "complete",
      };
      if (!entry.fastSettled) settleFast("complete");
      if (!entry.invalidated && !entry.cancelledBeforeFastResult) {
        this.storeStreamDiscoveryCache(key, result);
      }
      entry.resolveComplete(result);
      entry.settled = true;
      if (this.streamDiscoveryInFlight.get(key) === entry) {
        this.streamDiscoveryInFlight.delete(key);
      }

      // A partial answer has already been returned, so this is the timing of
      // the cache warm-up rather than another source response.
      if (alreadyReturnedFastResult) {
        logger.info(
          timingFields(result, "miss"),
          "Stream discovery cache warmed",
        );
      }
    };
    const fail = (error: unknown) => {
      if (entry.settled) return;
      clearTimers();
      entry.settled = true;
      if (!entry.fastSettled) {
        entry.fastSettled = true;
        entry.rejectFast(error);
      }
      entry.rejectComplete(error);
      if (this.streamDiscoveryInFlight.get(key) === entry) {
        this.streamDiscoveryInFlight.delete(key);
      }
    };
    const scheduleFastResult = () => {
      if (entry.fastSettled || fastWindowTimer) return;

      // The deadline prevents a long wait for a *first* source; it must not
      // turn a viable response that arrives shortly afterward into a wait for
      // every remaining slow provider. Once we have a usable batch, release
      // it immediately and let the same run finish warming the cache.
      if (Date.now() >= deadlineAt) {
        settleFast("partial");
        return;
      }
      const remainingMs = Math.max(0, deadlineAt - Date.now());
      fastWindowTimer = setTimeout(
        () => settleFast("partial"),
        Math.min(STREAM_DISCOVERY_FAST_WINDOW_MS, remainingMs),
      );
    };

    try {
      const addons = await getUserAddons(userId);
      if (entry.controller.signal.aborted) {
        fail(
          entry.controller.signal.reason ??
            new Error("Stream discovery cancelled."),
        );
        return;
      }

      const providers = addons.filter((addon: any) =>
        addonSupportsResource(addon.manifest, "stream", type),
      );
      providersTotal = providers.length;
      batches = new Array(providers.length);

      if (providers.length === 0) {
        settleComplete();
        return;
      }

      fastDeadlineTimer = setTimeout(
        () => {
          settleFast("partial");
        },
        Math.max(0, deadlineAt - Date.now()),
      );

      await Promise.allSettled(
        providers.map(async (addon: any, index: number) => {
          try {
            const data = await resilientFetch(
              addon.transportUrl,
              buildAddonPolicyKey(userId, addon.id, addon.transportUrl),
              `stream/${type}/${id}.json`,
              requestId,
              streamResponseSchema,
              {
                signal: entry.controller.signal,
                callerSignal: entry.controller.signal,
              },
            );
            batches[index] = data.streams || [];
            if (batches[index]!.some(isPlayableStreamResult)) {
              scheduleFastResult();
            }
          } finally {
            providersCompleted += 1;
          }
        }),
      );

      if (entry.controller.signal.aborted) {
        fail(
          entry.controller.signal.reason ??
            new Error("Stream discovery cancelled."),
        );
        return;
      }
      settleComplete();
    } catch (error) {
      fail(error);
    }
  }

  /**
   * Returns a user-scoped, memory-only stream lookup. The first caller starts
   * the provider fan-out; callers that arrive while it runs receive the same
   * fast result, while late provider responses warm the 30-second cache.
   */
  async getStreamDiscovery(
    userId: string,
    type: string,
    id: string,
    requestId: string,
    options: StreamDiscoveryRequestOptions = {},
  ): Promise<StreamDiscoveryResult> {
    const key = this.streamDiscoveryKey(userId, type, id);
    const cached = this.getStreamDiscoveryCacheEntry(key);
    if (cached) {
      logger.info(
        {
          requestId,
          cache: "hit",
          status: cached.status,
          latencyMs: 0,
          usableStreamCount: cached.streams.filter(isPlayableStreamResult)
            .length,
        },
        "Stream discovery timing",
      );
      return cached;
    }

    const entry = this.getOrStartStreamDiscoveryRun(
      key,
      userId,
      type,
      id,
      requestId,
    );
    return this.waitForStreamDiscoveryRun(
      entry,
      options.signal,
      options.requireComplete ? entry.completePromise : entry.fastPromise,
    );
  }

  invalidateStreamDiscoveryCacheForUser(userId: string) {
    const prefix = `${userId}\u0000`;
    for (const key of this.streamDiscoveryCache.keys()) {
      if (key.startsWith(prefix)) this.deleteStreamDiscoveryCacheEntry(key);
    }
    for (const [key, entry] of this.streamDiscoveryInFlight) {
      if (!key.startsWith(prefix)) continue;
      entry.invalidated = true;
      entry.controller.abort(new Error("Installed add-ons changed."));
      this.streamDiscoveryInFlight.delete(key);
    }
  }
}
