import { EventEmitter } from "events";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __resetSeekThumbnailSpawnerForTests,
  __setSeekThumbnailSpawnerForTests,
  createSeekThumbnailService,
} from "../seek-thumbnail.js";

describe("seek thumbnail service", () => {
  afterEach(() => {
    __resetSeekThumbnailSpawnerForTests();
    vi.useRealTimers();
  });

  it("coalesces identical buckets and reuses the bounded in-memory result", async () => {
    let resolveGeneration: ((value: Buffer) => void) | undefined;
    const generate = vi.fn(
      () =>
        new Promise<Buffer>((resolve) => {
          resolveGeneration = resolve;
        }),
    );
    const service = createSeekThumbnailService({ generate });
    const request = {
      cacheKey: "retained-cache",
      filePath: "/private/runtime/cache.mp4",
      timeSeconds: 20,
    };

    const first = service.getOrCreate(request);
    const second = service.getOrCreate(request);

    expect(generate).toHaveBeenCalledTimes(1);
    resolveGeneration?.(Buffer.from("jpeg"));

    await expect(first).resolves.toEqual(Buffer.from("jpeg"));
    await expect(second).resolves.toEqual(Buffer.from("jpeg"));
    await expect(service.getOrCreate(request)).resolves.toEqual(
      Buffer.from("jpeg"),
    );
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("never runs more generators than the configured concurrency budget", async () => {
    const releases: Array<() => void> = [];
    let active = 0;
    let peak = 0;
    const generate = vi.fn(
      () =>
        new Promise<Buffer>((resolve) => {
          active += 1;
          peak = Math.max(peak, active);
          releases.push(() => {
            active -= 1;
            resolve(Buffer.from("jpeg"));
          });
        }),
    );
    const service = createSeekThumbnailService({
      generate,
      maxConcurrency: 1,
    });

    const first = service.getOrCreate({
      cacheKey: "cache",
      filePath: "/private/runtime/cache.mp4",
      timeSeconds: 10,
    });
    const second = service.getOrCreate({
      cacheKey: "cache",
      filePath: "/private/runtime/cache.mp4",
      timeSeconds: 20,
    });

    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    releases.shift()?.();
    await first;
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(2));
    releases.shift()?.();
    await second;

    expect(peak).toBe(1);
  });

  it("rejects oversized output without retaining it", async () => {
    const generate = vi.fn().mockResolvedValue(Buffer.alloc(5));
    const service = createSeekThumbnailService({
      generate,
      maxOutputBytes: 4,
    });
    const request = {
      cacheKey: "cache",
      filePath: "/private/runtime/cache.mp4",
      timeSeconds: 10,
    };

    await expect(service.getOrCreate(request)).rejects.toThrow(
      "Thumbnail exceeded its size limit",
    );
    await expect(service.getOrCreate(request)).rejects.toThrow(
      "Thumbnail exceeded its size limit",
    );
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("drops the least-recently-used entries to stay within byte and entry limits", async () => {
    const generate = vi.fn(({ timeSeconds }: { timeSeconds: number }) =>
      Promise.resolve(Buffer.from(String(timeSeconds).padEnd(4, "_"))),
    );
    const service = createSeekThumbnailService({
      generate,
      maxEntries: 2,
      maxCacheBytes: 8,
    });
    const source = {
      cacheKey: "cache",
      filePath: "/private/runtime/cache.mp4",
    };

    await service.getOrCreate({ ...source, timeSeconds: 10 });
    await service.getOrCreate({ ...source, timeSeconds: 20 });
    await service.getOrCreate({ ...source, timeSeconds: 30 });
    await service.getOrCreate({ ...source, timeSeconds: 10 });

    expect(generate).toHaveBeenCalledTimes(4);
  });

  it("does not start queued work after its owning job is cancelled", async () => {
    let releaseFirst: (() => void) | undefined;
    const generate = vi.fn(({ timeSeconds }: { timeSeconds: number }) =>
      timeSeconds === 10
        ? new Promise<Buffer>((resolve) => {
            releaseFirst = () => resolve(Buffer.from("jpeg"));
          })
        : Promise.resolve(Buffer.from("jpeg")),
    );
    const service = createSeekThumbnailService({
      generate,
      maxConcurrency: 1,
    });
    const controller = new AbortController();

    const first = service.getOrCreate({
      cacheKey: "cache",
      filePath: "/private/runtime/cache.mp4",
      timeSeconds: 10,
    });
    const queued = service.getOrCreate({
      cacheKey: "cache",
      filePath: "/private/runtime/cache.mp4",
      timeSeconds: 20,
      signal: controller.signal,
    });
    controller.abort(new Error("Gateway job cancelled"));
    releaseFirst?.();

    await first;
    await expect(queued).rejects.toThrow("Gateway job cancelled");
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("terminates FFmpeg and force-kills it when image output exceeds the hard cap", async () => {
    vi.useFakeTimers();
    const child = new EventEmitter() as any;
    child.stdout = new EventEmitter();
    child.kill = vi.fn();
    __setSeekThumbnailSpawnerForTests(vi.fn(() => child) as any);
    const service = createSeekThumbnailService();

    const thumbnail = service.getOrCreate({
      cacheKey: "cache",
      filePath: "/private/runtime/cache.mp4",
      timeSeconds: 10,
    });
    child.stdout.emit("data", Buffer.alloc(512 * 1024 + 1));

    await expect(thumbnail).rejects.toThrow(
      "Thumbnail exceeded its size limit",
    );
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
  });
});
