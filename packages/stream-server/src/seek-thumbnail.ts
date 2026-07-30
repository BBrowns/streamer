import { spawn as nodeSpawn } from "child_process";

const DEFAULT_MAX_ENTRIES = 96;
const DEFAULT_MAX_CACHE_BYTES = 24 * 1024 * 1024;
const DEFAULT_MAX_OUTPUT_BYTES = 512 * 1024;
const DEFAULT_TTL_MS = 10 * 60_000;
const DEFAULT_MAX_CONCURRENCY = 2;
const DEFAULT_TIMEOUT_MS = 8_000;
const FFMPEG_CLOSE_GRACE_MS = 1_000;
type FfmpegSpawner = typeof nodeSpawn;
let spawnFfmpeg: FfmpegSpawner = nodeSpawn;

export interface SeekThumbnailRequest {
  cacheKey: string;
  filePath: string;
  timeSeconds: number;
  signal?: AbortSignal;
}

interface ThumbnailCacheEntry {
  data: Buffer;
  expiresAt: number;
  lastAccessAt: number;
}

interface QueuedGeneration<T> {
  factory: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
}

type ThumbnailGenerator = (request: SeekThumbnailRequest) => Promise<Buffer>;

interface SeekThumbnailServiceOptions {
  generate?: ThumbnailGenerator;
  maxEntries?: number;
  maxCacheBytes?: number;
  maxOutputBytes?: number;
  ttlMs?: number;
  maxConcurrency?: number;
  now?: () => number;
}

function positiveInteger(value: number | undefined, fallback: number) {
  return Number.isSafeInteger(value) && (value as number) > 0
    ? (value as number)
    : fallback;
}

function abortReason(signal: AbortSignal) {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error("Thumbnail generation cancelled");
}

function getFfmpegBinaryPath() {
  return process.env.STREAMER_FFMPEG_PATH?.trim() || "ffmpeg";
}

async function generateSeekThumbnail(
  request: SeekThumbnailRequest,
): Promise<Buffer> {
  if (request.signal?.aborted) {
    throw abortReason(request.signal);
  }

  return new Promise<Buffer>((resolve, reject) => {
    const ffmpeg = spawnFfmpeg(
      getFfmpegBinaryPath(),
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        String(request.timeSeconds),
        "-i",
        request.filePath,
        "-frames:v",
        "1",
        "-vf",
        "scale=320:180:force_original_aspect_ratio=decrease",
        "-f",
        "image2pipe",
        "-c:v",
        "mjpeg",
        "-q:v",
        "4",
        "pipe:1",
      ],
      { stdio: ["ignore", "pipe", "ignore"] },
    );
    const chunks: Buffer[] = [];
    let outputBytes = 0;
    let settled = false;
    let forceKillTimer: ReturnType<typeof setTimeout> | undefined;

    const timeout = setTimeout(() => {
      stop(new Error("Thumbnail generation timed out"));
    }, DEFAULT_TIMEOUT_MS);
    timeout.unref?.();

    const cleanup = () => {
      clearTimeout(timeout);
      request.signal?.removeEventListener("abort", onAbort);
      ffmpeg.stdout?.removeAllListeners();
      ffmpeg.removeAllListeners();
    };

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) {
        reject(error);
        return;
      }
      const data = Buffer.concat(chunks, outputBytes);
      if (
        data.length < 3 ||
        data[0] !== 0xff ||
        data[1] !== 0xd8 ||
        data[2] !== 0xff
      ) {
        reject(new Error("Thumbnail generator returned an invalid image"));
        return;
      }
      resolve(data);
    };

    const terminate = () => {
      try {
        ffmpeg.kill("SIGTERM");
      } catch {}
      forceKillTimer = setTimeout(() => {
        try {
          ffmpeg.kill("SIGKILL");
        } catch {}
      }, FFMPEG_CLOSE_GRACE_MS);
      forceKillTimer.unref?.();
    };

    const stop = (error: Error) => {
      if (settled) return;
      terminate();
      finish(error);
    };

    const onAbort = () => {
      if (request.signal) stop(abortReason(request.signal));
    };

    ffmpeg.stdout?.on("data", (chunk: Buffer | Uint8Array) => {
      if (settled) return;
      const buffer = Buffer.from(chunk);
      outputBytes += buffer.length;
      if (outputBytes > DEFAULT_MAX_OUTPUT_BYTES) {
        stop(new Error("Thumbnail exceeded its size limit"));
        return;
      }
      chunks.push(buffer);
    });
    ffmpeg.on("error", (error) => finish(error));
    ffmpeg.on("close", (code) => {
      if (settled) return;
      if (code !== 0) {
        finish(new Error("Thumbnail generation failed"));
        return;
      }
      finish();
    });
    request.signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function createSeekThumbnailService(
  options: SeekThumbnailServiceOptions = {},
) {
  const generate = options.generate ?? generateSeekThumbnail;
  const maxEntries = positiveInteger(options.maxEntries, DEFAULT_MAX_ENTRIES);
  const maxCacheBytes = positiveInteger(
    options.maxCacheBytes,
    DEFAULT_MAX_CACHE_BYTES,
  );
  const maxOutputBytes = positiveInteger(
    options.maxOutputBytes,
    DEFAULT_MAX_OUTPUT_BYTES,
  );
  const ttlMs = positiveInteger(options.ttlMs, DEFAULT_TTL_MS);
  const maxConcurrency = positiveInteger(
    options.maxConcurrency,
    DEFAULT_MAX_CONCURRENCY,
  );
  const now = options.now ?? Date.now;
  const cache = new Map<string, ThumbnailCacheEntry>();
  const pending = new Map<string, Promise<Buffer>>();
  const queue: Array<QueuedGeneration<Buffer>> = [];
  let activeCount = 0;
  let cacheBytes = 0;

  const deleteEntry = (key: string) => {
    const entry = cache.get(key);
    if (!entry) return;
    cache.delete(key);
    cacheBytes = Math.max(0, cacheBytes - entry.data.length);
  };

  const prune = () => {
    const currentTime = now();
    for (const [key, entry] of cache) {
      if (entry.expiresAt <= currentTime) deleteEntry(key);
    }

    const oldestFirst = () =>
      [...cache.entries()].sort(
        ([, left], [, right]) => left.lastAccessAt - right.lastAccessAt,
      );
    for (const [key] of oldestFirst()) {
      if (cache.size <= maxEntries && cacheBytes <= maxCacheBytes) break;
      deleteEntry(key);
    }
  };

  const drain = () => {
    while (activeCount < maxConcurrency && queue.length > 0) {
      const queued = queue.shift();
      if (!queued) return;
      if (queued.onAbort) {
        queued.signal?.removeEventListener("abort", queued.onAbort);
      }
      if (queued.signal?.aborted) {
        queued.reject(abortReason(queued.signal));
        continue;
      }

      activeCount += 1;
      void queued
        .factory()
        .then(queued.resolve, queued.reject)
        .finally(() => {
          activeCount = Math.max(0, activeCount - 1);
          drain();
        });
    }
  };

  const schedule = (factory: () => Promise<Buffer>, signal?: AbortSignal) =>
    new Promise<Buffer>((resolve, reject) => {
      const queued: QueuedGeneration<Buffer> = {
        factory,
        resolve,
        reject,
        signal,
      };
      queued.onAbort = () => {
        const index = queue.indexOf(queued);
        if (index >= 0) queue.splice(index, 1);
        if (signal) reject(abortReason(signal));
      };
      if (signal?.aborted) {
        reject(abortReason(signal));
        return;
      }
      signal?.addEventListener("abort", queued.onAbort, { once: true });
      queue.push(queued);
      drain();
    });

  const getOrCreate = (request: SeekThumbnailRequest) => {
    prune();
    const key = `${request.cacheKey}:${request.timeSeconds}`;
    const cached = cache.get(key);
    if (cached) {
      cached.lastAccessAt = now();
      return Promise.resolve(cached.data);
    }

    const current = pending.get(key);
    if (current) return current;

    const generation = schedule(() => generate(request), request.signal)
      .then((data) => {
        if (data.length > maxOutputBytes) {
          throw new Error("Thumbnail exceeded its size limit");
        }
        const timestamp = now();
        cache.set(key, {
          data,
          expiresAt: timestamp + ttlMs,
          lastAccessAt: timestamp,
        });
        cacheBytes += data.length;
        prune();
        return data;
      })
      .finally(() => {
        pending.delete(key);
      });
    pending.set(key, generation);
    return generation;
  };

  return {
    getOrCreate,
    clear() {
      cache.clear();
      cacheBytes = 0;
    },
  };
}

export const seekThumbnailService = createSeekThumbnailService();

export function __setSeekThumbnailSpawnerForTests(spawner: FfmpegSpawner) {
  spawnFfmpeg = spawner;
}

export function __resetSeekThumbnailSpawnerForTests() {
  spawnFfmpeg = nodeSpawn;
}
