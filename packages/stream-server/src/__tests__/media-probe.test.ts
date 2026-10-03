import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { spawnProbe } = vi.hoisted(() => ({ spawnProbe: vi.fn() }));
vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("child_process")>();
  return { ...actual, spawn: spawnProbe };
});
vi.mock("../media-runtime.js", () => ({
  getFfprobeBinaryPath: () => "ffprobe",
}));
import {
  createMediaProbeCache,
  discoverExternalSubtitleCandidates,
  parseFfprobeTrackCatalog,
  probeMediaDurationAtUrl,
  probeMediaTracksAtUrl,
} from "../media-probe.js";

const MAX_PENDING_PROBES_FOR_TEST = 16;
const PROBE_TERMINATION_GRACE_MS_FOR_TEST = 500;

function createPausedProbeChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: PassThrough;
    stderr: PassThrough;
    kill: ReturnType<typeof vi.fn>;
  };
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = vi.fn();
  return child;
}

type ProbeInvoker = (
  signal: AbortSignal,
  timeoutMs: number,
  index: number,
) => Promise<unknown>;

async function assertProbeSlotWaitsForChildExit(
  invoke: ProbeInvoker,
  trigger: "abort" | "timeout",
) {
  vi.useFakeTimers();
  const controllers = [new AbortController(), new AbortController()];
  const probePromises = controllers.map((controller, index) =>
    invoke(
      controller.signal,
      index === 0 && trigger === "timeout" ? 100 : 10_000,
      index,
    ).catch((error: unknown) => error),
  );
  const queuedController = new AbortController();
  const queuedProbe = invoke(queuedController.signal, 10_000, 2).catch(
    (error: unknown) => error,
  );

  try {
    await letProbeStartsRun();
    expect(spawnProbe).toHaveBeenCalledTimes(2);
    const children = () =>
      spawnProbe.mock.results.map(
        (result) => result.value as ReturnType<typeof createPausedProbeChild>,
      );
    const firstChild = children()[0];

    if (trigger === "abort") {
      controllers[0].abort(new Error("cancel active probe"));
    } else {
      await vi.advanceTimersByTimeAsync(100);
    }
    await letProbeStartsRun();

    expect(await probePromises[0]).toBeInstanceOf(Error);
    expect(firstChild.kill).toHaveBeenCalledWith("SIGTERM");
    expect(spawnProbe).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(PROBE_TERMINATION_GRACE_MS_FOR_TEST);
    expect(firstChild.kill).toHaveBeenCalledWith("SIGKILL");
    expect(spawnProbe).toHaveBeenCalledTimes(2);

    firstChild.emit("close", null, null);
    await letProbeStartsRun();
    expect(spawnProbe).toHaveBeenCalledTimes(3);
  } finally {
    for (const controller of [...controllers, queuedController]) {
      controller.abort(new Error("test cleanup"));
    }
    for (const result of spawnProbe.mock.results) {
      const child = result.value as ReturnType<typeof createPausedProbeChild>;
      child.emit("close", null, null);
    }
    await Promise.allSettled([...probePromises, queuedProbe]);
    vi.useRealTimers();
  }
}

async function letProbeStartsRun() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("media probe queue reliability", () => {
  beforeEach(() => {
    spawnProbe.mockReset();
    spawnProbe.mockImplementation(createPausedProbeChild);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects probe requests when the bounded wait queue is full", async () => {
    const activeControllers = [new AbortController(), new AbortController()];
    const queuedControllers = Array.from(
      { length: MAX_PENDING_PROBES_FOR_TEST },
      () => new AbortController(),
    );
    const activeProbes = activeControllers.map((controller, index) =>
      probeMediaDurationAtUrl({
        streamUrl: `http://fixture/${index}`,
        signal: controller.signal,
        timeoutMs: 5_000,
      }).catch((error: unknown) => error),
    );
    const queuedProbes = queuedControllers.map((controller, index) =>
      probeMediaDurationAtUrl({
        streamUrl: `http://fixture/queued-${index}`,
        signal: controller.signal,
        timeoutMs: 5_000,
      }).catch((error: unknown) => error),
    );
    const overflowController = new AbortController();
    let overflowError: unknown;
    const overflowProbe = probeMediaDurationAtUrl({
      streamUrl: "http://fixture/overflow",
      signal: overflowController.signal,
      timeoutMs: 5_000,
    }).catch((error: unknown) => {
      overflowError = error;
    });

    try {
      await letProbeStartsRun();
      expect(spawnProbe).toHaveBeenCalledTimes(2);
      expect(overflowError).toBeInstanceOf(Error);
      expect((overflowError as Error).message).toBe(
        "Media probe queue is full",
      );
    } finally {
      for (const controller of [
        ...activeControllers,
        ...queuedControllers,
        overflowController,
      ]) {
        controller.abort(new Error("test cleanup"));
      }
      for (const result of spawnProbe.mock.results) {
        const child = result.value as ReturnType<typeof createPausedProbeChild>;
        child.emit("close", null, null);
      }
      await Promise.all([...activeProbes, ...queuedProbes, overflowProbe]);
    }
    expect(spawnProbe).toHaveBeenCalledTimes(2);
  });

  it("includes time spent waiting for a probe slot in its deadline", async () => {
    vi.useFakeTimers();
    const activeControllers = [new AbortController(), new AbortController()];
    const activeProbes = activeControllers.map((controller, index) =>
      probeMediaDurationAtUrl({
        streamUrl: `http://fixture/${index}`,
        signal: controller.signal,
        timeoutMs: 5_000,
      }).catch((error: unknown) => error),
    );
    const queuedController = new AbortController();
    let queuedError: unknown;
    const queuedProbe = probeMediaDurationAtUrl({
      streamUrl: "http://fixture/queued",
      signal: queuedController.signal,
      timeoutMs: 100,
    }).catch((error: unknown) => {
      queuedError = error;
    });

    try {
      await letProbeStartsRun();
      expect(spawnProbe).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(75);
      activeControllers[0].abort(new Error("free one probe slot"));
      await letProbeStartsRun();
      expect(spawnProbe).toHaveBeenCalledTimes(2);
      const firstActiveChild = spawnProbe.mock.results[0].value as ReturnType<
        typeof createPausedProbeChild
      >;
      expect(firstActiveChild.kill).toHaveBeenCalledWith("SIGTERM");
      firstActiveChild.emit("close", null, null);
      await letProbeStartsRun();
      expect(spawnProbe).toHaveBeenCalledTimes(3);
      const queuedChild = spawnProbe.mock.results[2].value as ReturnType<
        typeof createPausedProbeChild
      >;

      await vi.advanceTimersByTimeAsync(24);
      expect(queuedChild.kill).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await letProbeStartsRun();
      expect(queuedChild.kill).toHaveBeenCalledWith("SIGTERM");
      expect(queuedError).toBeInstanceOf(Error);
      expect((queuedError as Error).message).toBe(
        "Media duration probe timed out",
      );
    } finally {
      activeControllers[1].abort(new Error("test cleanup"));
      queuedController.abort(new Error("test cleanup"));
      for (const result of spawnProbe.mock.results) {
        const child = result.value as ReturnType<typeof createPausedProbeChild>;
        child.emit("close", null, null);
      }
      await Promise.allSettled([...activeProbes, queuedProbe]);
      vi.useRealTimers();
    }
  });

  it.each([
    {
      name: "duration probe cancellation",
      trigger: "abort" as const,
      invoke: (signal: AbortSignal, timeoutMs: number, index: number) =>
        probeMediaDurationAtUrl({
          streamUrl: `http://fixture/duration-lifecycle-${index}`,
          signal,
          timeoutMs,
        }),
    },
    {
      name: "track probe timeout",
      trigger: "timeout" as const,
      invoke: (signal: AbortSignal, timeoutMs: number, index: number) =>
        probeMediaTracksAtUrl({
          streamUrl: `http://fixture/tracks-lifecycle-${index}`,
          signal,
          timeoutMs,
        }),
    },
  ])(
    "keeps the process slot until close after $name",
    async ({ invoke, trigger }) => {
      await assertProbeSlotWaitsForChildExit(invoke, trigger);
    },
  );

  it("does not escalate after exit while waiting for the close event", async () => {
    vi.useFakeTimers();
    const controllers = [new AbortController(), new AbortController()];
    const activeProbes = controllers.map((controller, index) =>
      probeMediaDurationAtUrl({
        streamUrl: `http://fixture/exit-before-close-${index}`,
        signal: controller.signal,
        timeoutMs: 10_000,
      }).catch((error: unknown) => error),
    );
    const queuedController = new AbortController();
    const queuedProbe = probeMediaDurationAtUrl({
      streamUrl: "http://fixture/exit-before-close-queued",
      signal: queuedController.signal,
      timeoutMs: 10_000,
    }).catch((error: unknown) => error);

    try {
      await letProbeStartsRun();
      const firstChild = spawnProbe.mock.results[0].value as ReturnType<
        typeof createPausedProbeChild
      >;

      controllers[0].abort(new Error("cancel active probe"));
      await letProbeStartsRun();
      expect(firstChild.kill).toHaveBeenCalledWith("SIGTERM");
      expect(spawnProbe).toHaveBeenCalledTimes(2);

      firstChild.emit("exit", 0, null);
      await vi.advanceTimersByTimeAsync(PROBE_TERMINATION_GRACE_MS_FOR_TEST);
      expect(firstChild.kill).toHaveBeenCalledTimes(1);
      expect(spawnProbe).toHaveBeenCalledTimes(2);

      firstChild.emit("close", 0, null);
      await letProbeStartsRun();
      expect(spawnProbe).toHaveBeenCalledTimes(3);
    } finally {
      for (const controller of [...controllers, queuedController]) {
        controller.abort(new Error("test cleanup"));
      }
      for (const result of spawnProbe.mock.results) {
        const child = result.value as ReturnType<typeof createPausedProbeChild>;
        child.emit("close", null, null);
      }
      await Promise.allSettled([...activeProbes, queuedProbe]);
      vi.useRealTimers();
    }
  });
});

describe("media probe", () => {
  it("normalizes multiple audio tracks and dispositions", () => {
    const tracks = parseFfprobeTrackCatalog({
      streams: [
        {
          index: 1,
          codec_type: "audio",
          codec_name: "eac3",
          channels: 6,
          channel_layout: "5.1(side)",
          tags: { language: "eng", title: "English Main" },
          disposition: { default: 1 },
        },
        {
          index: 2,
          codec_type: "audio",
          codec_name: "aac",
          channels: 2,
          channel_layout: "stereo",
          tags: { language: "nld", title: "Dutch commentary" },
          disposition: { comment: 1 },
        },
        {
          index: 4,
          codec_type: "subtitle",
          codec_name: "subrip",
          tags: { language: "eng", title: "English SDH" },
          disposition: { hearing_impaired: 1 },
        },
      ],
    });

    expect(tracks).toEqual([
      expect.objectContaining({
        id: "audio:1",
        kind: "audio",
        language: "en",
        codec: "eac3",
        channelCount: 6,
        default: true,
      }),
      expect.objectContaining({
        id: "audio:2",
        kind: "audio",
        language: "nl",
        commentary: true,
      }),
      expect.objectContaining({
        id: "subtitle:4",
        kind: "subtitle",
        hearingImpaired: true,
        supported: true,
      }),
    ]);
  });

  it("marks bitmap subtitles explicitly unsupported", () => {
    const [track] = parseFfprobeTrackCatalog({
      streams: [
        {
          index: 5,
          codec_type: "subtitle",
          codec_name: "hdmv_pgs_subtitle",
          tags: { language: "eng" },
          disposition: {},
        },
      ],
    });

    expect(track).toMatchObject({
      kind: "subtitle",
      supported: false,
      unsupportedReason: "bitmap_subtitle",
    });
  });

  it("discovers supported external subtitle files without selecting another video", () => {
    const candidates = discoverExternalSubtitleCandidates(
      [
        { name: "Show.S01E02.mkv" },
        { name: "Show.S01E02.nl.srt" },
        { name: "Show.S01E02.en.ass" },
        { name: "cover.jpg" },
      ],
      0,
    );

    expect(candidates).toEqual([
      expect.objectContaining({
        id: "torrent-file:1",
        language: "nl",
        format: "srt",
        fetchIdentity: "external:1",
      }),
      expect.objectContaining({
        id: "torrent-file:2",
        language: "en",
        format: "ass",
        fetchIdentity: "external:2",
      }),
    ]);
  });

  it("deduplicates concurrent probes and expires bounded runtime cache entries", async () => {
    let resolveProbe!: (value: string) => void;
    const runner = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveProbe = resolve;
        }),
    );
    const cache = createMediaProbeCache({ ttlMs: 10, maxEntries: 2 });

    const first = cache.getOrCreate("hash:1", runner);
    const second = cache.getOrCreate("hash:1", runner);
    expect(runner).toHaveBeenCalledTimes(1);
    resolveProbe("catalog");
    await expect(first).resolves.toBe("catalog");
    await expect(second).resolves.toBe("catalog");
  });
});
