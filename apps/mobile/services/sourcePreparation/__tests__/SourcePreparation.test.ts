import type {
  BridgeDelivery,
  BridgeJobMediaV1,
  BridgeJobResponseV1,
  PlaybackRoute,
  PlannedMediaCandidate,
  PlannedMediaCandidateV3,
} from "@streamer/shared";
import { BridgeClientError } from "../../bridge/BridgeClient";
import type { IStreamEngine } from "../../streamEngine/IStreamEngine";
import {
  BridgeV1SourceAdapter,
  DirectSourceAdapter,
  HlsSourceAdapter,
  LegacyStreamEngineAdapter,
  SourcePreparationError,
  SourcePreparationRegistry,
  SourcePreparer,
  type BridgeV1Client,
} from "../index";

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const JOB_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_JOB_ID = "33333333-3333-4333-8333-333333333333";

const routeCapabilities = {
  seek: "immediate",
  audioTracks: false,
  embeddedSubtitles: false,
  externalSubtitles: true,
  cast: true,
  offline: false,
  thumbnails: false,
} as const;

function route(
  delivery: PlaybackRoute["delivery"],
  executionTarget: PlaybackRoute["executionTarget"] = "on-device",
): PlaybackRoute {
  return {
    candidateId: "candidate-1",
    executionTarget,
    delivery,
    capabilities: routeCapabilities,
  };
}

function candidateFor(
  selectedRoute: PlaybackRoute,
  overrides: Partial<PlannedMediaCandidateV3> = {},
): PlannedMediaCandidateV3 {
  const action = overrides.actionEligibility?.action ?? "play";
  return {
    id: selectedRoute.candidateId,
    kind:
      selectedRoute.delivery === "hls"
        ? "hls"
        : selectedRoute.executionTarget === "on-device"
          ? "direct"
          : "torrent",
    stream:
      selectedRoute.executionTarget === "on-device"
        ? { url: "https://media.example.test/video.mp4" }
        : {
            infoHash: "0123456789abcdef0123456789abcdef01234567",
            fileIdx: 3,
            fileSelectionHints: {
              title: "Episode title",
              season: 1,
              episode: 2,
            },
          },
    route: selectedRoute,
    actionEligibility: {
      action,
      eligible: true,
      ...overrides.actionEligibility,
    },
    ...overrides,
  } as PlannedMediaCandidateV3;
}

function legacyCandidate(
  overrides: Partial<PlannedMediaCandidate> = {},
): PlannedMediaCandidate {
  return {
    id: "legacy-candidate",
    kind: "direct",
    stream: { url: "https://media.example.test/legacy.mp4" },
    ...overrides,
  } as PlannedMediaCandidate;
}

function jobResponse(
  overrides: Partial<BridgeJobResponseV1["job"]> = {},
): BridgeJobResponseV1 {
  return {
    protocolVersion: 1,
    job: {
      id: JOB_ID,
      state: "preparing",
      phase: "finding_peers",
      delivery: "seekable-cache",
      peerCount: 0,
      readinessProgress: null,
      elapsedMs: 10,
      readyTimeoutMs: 45_000,
      media: {
        container: "mp4",
        remuxed: true,
        seek: "preparing",
      },
      ...overrides,
    },
  };
}

function readyJob(
  path = `/api/bridge/v1/jobs/${JOB_ID}/stream?expires=4102444800000&signature=signed`,
): BridgeJobResponseV1 {
  return readyJobFor(
    "seekable-cache",
    {
      container: "mp4",
      remuxed: true,
      seek: "immediate",
      seekableCache: { status: "ready" },
    },
    {
      stream: {
        path,
        expiresAt: "2100-01-01T00:00:00.000Z",
      },
    },
  );
}

function readyJobFor(
  delivery: BridgeDelivery,
  media: BridgeJobMediaV1,
  overrides: Partial<BridgeJobResponseV1["job"]> = {},
): BridgeJobResponseV1 {
  const jobId = overrides.id ?? JOB_ID;
  return jobResponse({
    id: jobId,
    state: "ready",
    phase: "ready",
    delivery,
    peerCount: 4,
    readinessProgress: 1,
    media,
    stream: {
      path: `/api/bridge/v1/jobs/${jobId}/stream?expires=4102444800000&signature=signed`,
      expiresAt: "2100-01-01T00:00:00.000Z",
    },
    ...overrides,
  });
}

function bridgeClient(
  overrides: Partial<BridgeV1Client> = {},
): BridgeV1Client & {
  createJob: jest.Mock;
  getJob: jest.Mock;
  cancelJob: jest.Mock;
} {
  return {
    createJob: jest.fn(),
    getJob: jest.fn(),
    cancelJob: jest.fn().mockResolvedValue(null),
    ...overrides,
  } as BridgeV1Client & {
    createJob: jest.Mock;
    getJob: jest.Mock;
    cancelJob: jest.Mock;
  };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("SourcePreparer route registry", () => {
  it("selects direct and HLS adapters by the exact planned route", async () => {
    const registry = new SourcePreparationRegistry([
      new DirectSourceAdapter(),
      new HlsSourceAdapter(),
    ]);
    const preparer = new SourcePreparer(registry);

    const directRoute = route("direct");
    const direct = await preparer.prepare({
      action: "play",
      attemptId: "attempt-direct",
      requestId: REQUEST_ID,
      candidate: candidateFor(directRoute),
      route: directRoute,
    });
    expect(direct.uri).toBe("https://media.example.test/video.mp4");
    expect(direct.runtime?.getEngineType()).toBe("http-video");

    const hlsRoute = route("hls");
    const hls = await preparer.prepare({
      action: "play",
      attemptId: "attempt-hls",
      requestId: REQUEST_ID,
      candidate: candidateFor(hlsRoute, {
        stream: { url: "https://media.example.test/master.m3u8" },
      }),
      route: hlsRoute,
    });
    expect(hls.uri).toBe("https://media.example.test/master.m3u8");
    expect(hls.runtime?.getEngineType()).toBe("hls");
  });

  it("fails closed for an unregistered v3 route without invoking legacy", async () => {
    const resolveEngine = jest.fn();
    const preparer = new SourcePreparer(
      new SourcePreparationRegistry([new DirectSourceAdapter()]),
      new LegacyStreamEngineAdapter({ resolveEngine }),
    );
    const unsupportedRoute = route("range-http");

    await expect(
      preparer.prepare({
        action: "play",
        attemptId: "attempt-unsupported",
        requestId: REQUEST_ID,
        candidate: candidateFor(unsupportedRoute),
        route: unsupportedRoute,
      }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_ROUTE" });
    expect(resolveEngine).not.toHaveBeenCalled();
  });

  it("rejects duplicate route ownership", () => {
    expect(
      () =>
        new SourcePreparationRegistry([
          new DirectSourceAdapter(),
          new DirectSourceAdapter(),
        ]),
    ).toThrow(SourcePreparationError);
  });

  it("keeps legacy preparation isolated and releases its engine once", async () => {
    const engine = {
      getPlaybackUri: jest
        .fn()
        .mockResolvedValue("https://media.example.test/legacy.mp4"),
      getEngineType: jest.fn().mockReturnValue("legacy"),
      stop: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
    } as unknown as IStreamEngine;
    const legacy = new LegacyStreamEngineAdapter({
      resolveEngine: jest.fn().mockReturnValue(engine),
    });
    const preparer = new SourcePreparer(
      new SourcePreparationRegistry(),
      legacy,
    );

    const prepared = await preparer.prepare({
      action: "play",
      attemptId: "attempt-legacy",
      requestId: REQUEST_ID,
      candidate: legacyCandidate(),
    });
    await prepared.release();
    await prepared.release();

    expect(prepared.route).toBeUndefined();
    expect(engine.stop).toHaveBeenCalledTimes(1);
  });

  it("rejects unsafe direct URLs and prepares desktop HLS downloads", async () => {
    const registry = new SourcePreparationRegistry([
      new DirectSourceAdapter(),
      new HlsSourceAdapter(),
    ]);
    const preparer = new SourcePreparer(registry);
    const directRoute = route("direct");
    const hlsRoute = route("hls");

    await expect(
      preparer.prepare({
        action: "play",
        attemptId: "attempt-unsafe",
        requestId: REQUEST_ID,
        candidate: candidateFor(directRoute, {
          stream: { url: "file:///private/video.mp4" },
        }),
        route: directRoute,
      }),
    ).rejects.toMatchObject({ code: "INVALID_SOURCE" });

    const hlsDownloadRoute = {
      ...hlsRoute,
      capabilities: { ...hlsRoute.capabilities, offline: true },
    } satisfies PlaybackRoute;
    const hlsDownload = await preparer.prepare({
      action: "download",
      attemptId: "attempt-hls-download",
      requestId: REQUEST_ID,
      candidate: candidateFor(hlsDownloadRoute, {
        stream: { url: "https://media.example.test/master.m3u8" },
        actionEligibility: { action: "download", eligible: true },
      }),
      route: hlsDownloadRoute,
    });
    expect(hlsDownload.uri).toBe("https://media.example.test/master.m3u8");
    await hlsDownload.release();
  });
});

describe("BridgeV1SourceAdapter", () => {
  it("adopts a seekable-cache upgrade discovered from the selected torrent file", async () => {
    const client = bridgeClient();
    client.createJob.mockResolvedValue(
      jobResponse({
        delivery: "range-http",
        media: {
          container: "unknown",
          remuxed: false,
          seek: "preparing",
        },
      }),
    );
    client.getJob.mockResolvedValue(
      readyJobFor("seekable-cache", {
        container: "mp4",
        remuxed: true,
        seek: "immediate",
        seekableCache: { status: "ready" },
      }),
    );
    const adapter = new BridgeV1SourceAdapter({
      executionTarget: "local-sidecar",
      baseUrl: "http://localhost:11470",
      client,
      pollIntervalMs: 0,
      sleep: jest.fn().mockResolvedValue(undefined),
    });
    const selectedRoute = route("range-http", "local-sidecar");

    const prepared = await adapter.prepare({
      action: "play",
      attemptId: "attempt-container-upgrade",
      requestId: REQUEST_ID,
      candidate: candidateFor(selectedRoute),
      route: selectedRoute,
    });

    expect(prepared.route).toEqual({
      ...selectedRoute,
      delivery: "seekable-cache",
      capabilities: {
        ...selectedRoute.capabilities,
        seek: "immediate",
      },
    });
    await prepared.release();
  });

  it("adopts the longer authoritative timeout when runtime inspection requires remux", async () => {
    let clock = 0;
    const client = bridgeClient();
    client.createJob.mockResolvedValue(
      jobResponse({
        delivery: "range-http",
        elapsedMs: 19_000,
        readyTimeoutMs: 20_000,
        media: {
          container: "unknown",
          remuxed: false,
          seek: "preparing",
        },
      }),
    );
    client.getJob
      .mockResolvedValueOnce(
        jobResponse({
          delivery: "seekable-cache",
          elapsedMs: 20_500,
          readyTimeoutMs: 65_000,
          media: {
            container: "mp4",
            remuxed: true,
            seek: "preparing",
            seekableCache: { status: "preparing" },
          },
        }),
      )
      .mockResolvedValueOnce(
        readyJobFor(
          "seekable-cache",
          {
            container: "mp4",
            remuxed: true,
            seek: "immediate",
            seekableCache: { status: "ready" },
          },
          { elapsedMs: 21_000, readyTimeoutMs: 65_000 },
        ),
      );
    const adapter = new BridgeV1SourceAdapter({
      executionTarget: "local-sidecar",
      baseUrl: "http://localhost:11470",
      client,
      pollIntervalMs: 800,
      now: () => clock,
      sleep: jest.fn(async (milliseconds: number) => {
        clock += milliseconds;
      }),
    });
    const selectedRoute = route("range-http", "local-sidecar");

    const prepared = await adapter.prepare({
      action: "play",
      attemptId: "attempt-extended-remux-budget",
      requestId: REQUEST_ID,
      candidate: candidateFor(selectedRoute),
      route: selectedRoute,
    });

    expect(client.getJob).toHaveBeenCalledTimes(2);
    expect(prepared.route?.delivery).toBe("seekable-cache");
    await prepared.release();
  });

  it("creates, polls and releases an exactly bound seekable-cache job", async () => {
    const client = bridgeClient();
    client.createJob.mockResolvedValue(jobResponse());
    client.getJob.mockResolvedValue(readyJob());
    const progress = jest.fn();
    const adapter = new BridgeV1SourceAdapter({
      executionTarget: "paired-bridge",
      baseUrl: "http://192.168.1.25:11470",
      client,
      pollIntervalMs: 0,
      sleep: jest.fn().mockResolvedValue(undefined),
    });
    const registry = new SourcePreparationRegistry([adapter]);
    const preparer = new SourcePreparer(registry);
    const selectedRoute = route("seekable-cache", "paired-bridge");

    const prepared = await preparer.prepare({
      action: "cast",
      attemptId: "attempt-bridge",
      requestId: REQUEST_ID,
      candidate: candidateFor(selectedRoute, {
        actionEligibility: { action: "cast", eligible: true },
      }),
      route: selectedRoute,
      onGatewayProgress: progress,
    });

    expect(client.createJob).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: REQUEST_ID,
        source: {
          kind: "magnet",
          magnet: expect.stringMatching(/^magnet:\?xt=urn:btih:/),
        },
        delivery: "seekable-cache",
        selection: {
          fileIndex: 3,
          title: "Episode title",
          season: 1,
          episode: 2,
        },
      }),
      undefined,
    );
    expect(client.getJob).toHaveBeenCalledWith(JOB_ID, undefined);
    expect(progress).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        state: "preparing",
        phase: "creating_gateway_job",
      }),
    );
    expect(progress).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        id: JOB_ID,
        state: "preparing",
        phase: "finding_peers",
      }),
    );
    expect(progress).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: JOB_ID, state: "ready", phase: "ready" }),
    );
    expect(prepared.uri).toBe(
      `http://192.168.1.25:11470/api/bridge/v1/jobs/${JOB_ID}/stream?expires=4102444800000&signature=signed`,
    );
    expect(prepared.bridgeJobId).toBe(JOB_ID);
    expect(prepared.runtime?.getEngineType()).toBe("bridge-v1");
    expect(prepared.runtime?.canPlay(prepared.stream)).toBe(true);

    await prepared.release();
    await prepared.release();
    expect(client.cancelJob).toHaveBeenCalledTimes(1);
    expect(client.cancelJob).toHaveBeenCalledWith(JOB_ID);
    expect(prepared.runtime?.canPlay(prepared.stream)).toBe(false);
  });

  it("rejects a route assigned to another execution target", async () => {
    const client = bridgeClient();
    const adapter = new BridgeV1SourceAdapter({
      executionTarget: "local-sidecar",
      baseUrl: "http://localhost:11470",
      client,
    });
    const selectedRoute = route("range-http", "paired-bridge");

    await expect(
      adapter.prepare({
        action: "play",
        attemptId: "attempt-wrong-target",
        requestId: REQUEST_ID,
        candidate: candidateFor(selectedRoute),
        route: selectedRoute,
      }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_ROUTE" });
    expect(client.createJob).not.toHaveBeenCalled();
  });

  it("rejects route capability drift and ineligible action bindings", async () => {
    const preparer = new SourcePreparer(
      new SourcePreparationRegistry([new DirectSourceAdapter()]),
    );
    const selectedRoute = route("direct");

    await expect(
      preparer.prepare({
        action: "play",
        attemptId: "attempt-capability-drift",
        requestId: REQUEST_ID,
        candidate: candidateFor(selectedRoute),
        route: {
          ...selectedRoute,
          capabilities: {
            ...selectedRoute.capabilities,
            thumbnails: !selectedRoute.capabilities.thumbnails,
          },
        },
      }),
    ).rejects.toMatchObject({
      code: "INVALID_SOURCE",
      shouldFallback: false,
    });

    await expect(
      preparer.prepare({
        action: "cast",
        attemptId: "attempt-ineligible-action",
        requestId: REQUEST_ID,
        candidate: candidateFor(selectedRoute, {
          actionEligibility: { action: "play", eligible: true },
        }),
        route: selectedRoute,
      }),
    ).rejects.toMatchObject({
      code: "INVALID_SOURCE",
      shouldFallback: false,
    });

    await expect(
      preparer.prepare({
        action: "cast",
        attemptId: "attempt-ineligible-candidate",
        requestId: REQUEST_ID,
        candidate: candidateFor(selectedRoute, {
          actionEligibility: { action: "cast", eligible: false },
        }),
        route: selectedRoute,
      }),
    ).rejects.toMatchObject({
      code: "INVALID_SOURCE",
      shouldFallback: false,
    });

    const noCastRoute: PlaybackRoute = {
      ...selectedRoute,
      capabilities: { ...selectedRoute.capabilities, cast: false },
    };
    await expect(
      preparer.prepare({
        action: "cast",
        attemptId: "attempt-unsupported-capability",
        requestId: REQUEST_ID,
        candidate: candidateFor(noCastRoute, {
          actionEligibility: { action: "cast", eligible: true },
        }),
        route: noCastRoute,
      }),
    ).rejects.toMatchObject({
      code: "INVALID_SOURCE",
      shouldFallback: false,
    });
  });

  it("rejects a stream path that escapes the configured bridge origin", async () => {
    const client = bridgeClient();
    client.createJob.mockResolvedValue(
      readyJob(`//other-bridge.test/api/bridge/v1/jobs/${JOB_ID}/stream`),
    );
    const adapter = new BridgeV1SourceAdapter({
      executionTarget: "paired-bridge",
      baseUrl: "http://192.168.1.25:11470",
      client,
    });
    const selectedRoute = route("seekable-cache", "paired-bridge");

    await expect(
      adapter.prepare({
        action: "play",
        attemptId: "attempt-path-escape",
        requestId: REQUEST_ID,
        candidate: candidateFor(selectedRoute),
        route: selectedRoute,
      }),
    ).rejects.toMatchObject({
      code: "BRIDGE_UNSUPPORTED",
      shouldFallback: false,
    });
    expect(client.cancelJob).toHaveBeenCalledWith(JOB_ID);
  });

  it.each([
    {
      delivery: "range-http",
      media: {
        container: "unknown",
        remuxed: false,
        seek: "immediate",
      },
    },
    {
      delivery: "progressive-fmp4",
      media: {
        container: "mp4",
        remuxed: true,
        seek: "preparing",
        seekableCache: { status: "preparing" },
      },
    },
    {
      delivery: "seekable-cache",
      media: {
        container: "mp4",
        remuxed: true,
        seek: "immediate",
        seekableCache: { status: "ready" },
      },
    },
  ] satisfies Array<{
    delivery: BridgeDelivery;
    media: BridgeJobMediaV1;
  }>)("accepts ready $delivery media", async ({ delivery, media }) => {
    const client = bridgeClient();
    client.createJob.mockResolvedValue(readyJobFor(delivery, media));
    const adapter = new BridgeV1SourceAdapter({
      executionTarget: "local-sidecar",
      baseUrl: "http://localhost:11470",
      client,
      now: () => 1_000_000,
    });
    const selectedRoute = route(delivery, "local-sidecar");

    const prepared = await adapter.prepare({
      action: "play",
      attemptId: `attempt-ready-${delivery}`,
      requestId: REQUEST_ID,
      candidate: candidateFor(selectedRoute),
      route: selectedRoute,
    });

    expect(prepared.bridgeJobId).toBe(JOB_ID);
    await prepared.release();
    expect(client.cancelJob).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      delivery: "range-http",
      media: {
        container: "mp4",
        remuxed: true,
        seek: "immediate",
      },
    },
    {
      delivery: "progressive-fmp4",
      media: {
        container: "mkv",
        remuxed: true,
        seek: "preparing",
        seekableCache: { status: "preparing" },
      },
    },
    {
      delivery: "seekable-cache",
      media: {
        container: "mp4",
        remuxed: true,
        seek: "preparing",
        seekableCache: { status: "preparing" },
      },
    },
  ] satisfies Array<{
    delivery: BridgeDelivery;
    media: BridgeJobMediaV1;
  }>)(
    "rejects contradictory ready $delivery media without fallback",
    async ({ delivery, media }) => {
      const client = bridgeClient();
      client.createJob.mockResolvedValue(readyJobFor(delivery, media));
      const adapter = new BridgeV1SourceAdapter({
        executionTarget: "local-sidecar",
        baseUrl: "http://localhost:11470",
        client,
      });
      const selectedRoute = route(delivery, "local-sidecar");

      await expect(
        adapter.prepare({
          action: "play",
          attemptId: `attempt-invalid-media-${delivery}`,
          requestId: REQUEST_ID,
          candidate: candidateFor(selectedRoute),
          route: selectedRoute,
        }),
      ).rejects.toMatchObject({
        code: "BRIDGE_UNSUPPORTED",
        retryable: false,
        shouldFallback: false,
      });
      expect(client.cancelJob).toHaveBeenCalledTimes(1);
    },
  );

  it("keeps the create-response readiness deadline immutable", async () => {
    let currentTime = 1_000;
    const client = bridgeClient();
    client.createJob.mockResolvedValue(
      jobResponse({ elapsedMs: 0, readyTimeoutMs: 1_000 }),
    );
    client.getJob
      .mockResolvedValueOnce(
        jobResponse({ elapsedMs: 100, readyTimeoutMs: 60_000 }),
      )
      .mockResolvedValueOnce(readyJob());
    const adapter = new BridgeV1SourceAdapter({
      executionTarget: "local-sidecar",
      baseUrl: "http://localhost:11470",
      client,
      pollIntervalMs: 600,
      now: () => currentTime,
      sleep: jest.fn().mockImplementation(async (milliseconds: number) => {
        currentTime += milliseconds;
      }),
    });
    const selectedRoute = route("seekable-cache", "local-sidecar");

    await expect(
      adapter.prepare({
        action: "play",
        attemptId: "attempt-hard-deadline",
        requestId: REQUEST_ID,
        candidate: candidateFor(selectedRoute),
        route: selectedRoute,
      }),
    ).rejects.toMatchObject({ code: "GATEWAY_TIMEOUT" });
    expect(client.getJob).toHaveBeenCalledTimes(1);
    expect(client.cancelJob).toHaveBeenCalledTimes(1);
  });

  it("honors cancellation triggered by initial progress before creating a job", async () => {
    const controller = new AbortController();
    const client = bridgeClient();
    const adapter = new BridgeV1SourceAdapter({
      executionTarget: "local-sidecar",
      baseUrl: "http://localhost:11470",
      client,
    });
    const selectedRoute = route("range-http", "local-sidecar");

    await expect(
      adapter.prepare({
        action: "play",
        attemptId: "attempt-abort-before-create",
        requestId: REQUEST_ID,
        candidate: candidateFor(selectedRoute),
        route: selectedRoute,
        signal: controller.signal,
        onGatewayProgress: () => controller.abort(),
      }),
    ).rejects.toMatchObject({ code: "CANCELLED", isCancellation: true });
    expect(client.createJob).not.toHaveBeenCalled();
    expect(client.cancelJob).not.toHaveBeenCalled();
  });

  it("honors cancellation triggered by ready progress before leasing", async () => {
    const controller = new AbortController();
    const client = bridgeClient();
    client.createJob.mockResolvedValue(readyJob());
    const adapter = new BridgeV1SourceAdapter({
      executionTarget: "local-sidecar",
      baseUrl: "http://localhost:11470",
      client,
    });
    const selectedRoute = route("seekable-cache", "local-sidecar");

    await expect(
      adapter.prepare({
        action: "play",
        attemptId: "attempt-abort-before-lease",
        requestId: REQUEST_ID,
        candidate: candidateFor(selectedRoute),
        route: selectedRoute,
        signal: controller.signal,
        onGatewayProgress: (progress) => {
          if (progress.state === "ready") controller.abort();
        },
      }),
    ).rejects.toMatchObject({ code: "CANCELLED", isCancellation: true });
    expect(client.cancelJob).toHaveBeenCalledTimes(1);
    expect(client.cancelJob).toHaveBeenCalledWith(JOB_ID);
  });

  it.each([
    "INVALID_REQUEST",
    "PROTOCOL_UNSUPPORTED",
    "IDEMPOTENCY_CONFLICT",
    "DELIVERY_UNSUPPORTED",
    "BRIDGE_RESPONSE_INVALID",
  ] as const)(
    "maps protocol or identity error %s without fallback",
    async (code) => {
      const client = bridgeClient();
      client.createJob.mockRejectedValue(
        new BridgeClientError(code, "Redacted bridge error."),
      );
      const adapter = new BridgeV1SourceAdapter({
        executionTarget: "local-sidecar",
        baseUrl: "http://localhost:11470",
        client,
      });
      const selectedRoute = route("range-http", "local-sidecar");

      await expect(
        adapter.prepare({
          action: "play",
          attemptId: `attempt-${code.toLowerCase()}`,
          requestId: REQUEST_ID,
          candidate: candidateFor(selectedRoute),
          route: selectedRoute,
        }),
      ).rejects.toMatchObject({
        code: "BRIDGE_UNSUPPORTED",
        retryable: false,
        shouldFallback: false,
      });
    },
  );

  it("maps a disappeared bridge job to one retryable source recovery", async () => {
    const client = bridgeClient();
    client.createJob.mockResolvedValue(jobResponse({ delivery: "range-http" }));
    client.getJob.mockRejectedValue(
      new BridgeClientError("JOB_NOT_FOUND", "The bridge job was not found.", {
        status: 404,
      }),
    );
    const adapter = new BridgeV1SourceAdapter({
      executionTarget: "local-sidecar",
      baseUrl: "http://localhost:11470",
      client,
      pollIntervalMs: 0,
      sleep: jest.fn().mockResolvedValue(undefined),
    });
    const selectedRoute = route("range-http", "local-sidecar");

    await expect(
      adapter.prepare({
        action: "download",
        attemptId: "attempt-missing-job",
        requestId: REQUEST_ID,
        candidate: candidateFor(selectedRoute, {
          actionEligibility: { action: "download", eligible: true },
        }),
        route: selectedRoute,
      }),
    ).rejects.toMatchObject({
      code: "SOURCE_UNAVAILABLE",
      retryable: true,
      shouldFallback: true,
    });
    expect(client.getJob).toHaveBeenCalledTimes(1);
    expect(client.cancelJob).toHaveBeenCalledTimes(1);
    expect(client.cancelJob).toHaveBeenCalledWith(JOB_ID);
  });

  it("maps a terminal protocol failure without fallback", async () => {
    const client = bridgeClient();
    client.createJob.mockResolvedValue(
      jobResponse({
        state: "error",
        phase: "error",
        failure: {
          code: "IDEMPOTENCY_CONFLICT",
          message: "The request identity conflicts with an existing job.",
          retryable: false,
        },
      }),
    );
    const adapter = new BridgeV1SourceAdapter({
      executionTarget: "local-sidecar",
      baseUrl: "http://localhost:11470",
      client,
    });
    const selectedRoute = route("seekable-cache", "local-sidecar");

    await expect(
      adapter.prepare({
        action: "play",
        attemptId: "attempt-terminal-protocol-error",
        requestId: REQUEST_ID,
        candidate: candidateFor(selectedRoute),
        route: selectedRoute,
      }),
    ).rejects.toMatchObject({
      code: "BRIDGE_UNSUPPORTED",
      retryable: false,
      shouldFallback: false,
    });
    expect(client.cancelJob).toHaveBeenCalledTimes(1);
  });

  it("rejects a polled job identity change without fallback", async () => {
    const client = bridgeClient();
    client.createJob.mockResolvedValue(jobResponse());
    client.getJob.mockResolvedValue(
      readyJobFor(
        "seekable-cache",
        {
          container: "mp4",
          remuxed: true,
          seek: "immediate",
          seekableCache: { status: "ready" },
        },
        { id: OTHER_JOB_ID },
      ),
    );
    const adapter = new BridgeV1SourceAdapter({
      executionTarget: "local-sidecar",
      baseUrl: "http://localhost:11470",
      client,
      pollIntervalMs: 0,
      sleep: jest.fn().mockResolvedValue(undefined),
    });
    const selectedRoute = route("seekable-cache", "local-sidecar");

    await expect(
      adapter.prepare({
        action: "play",
        attemptId: "attempt-job-identity-change",
        requestId: REQUEST_ID,
        candidate: candidateFor(selectedRoute),
        route: selectedRoute,
      }),
    ).rejects.toMatchObject({
      code: "BRIDGE_UNSUPPORTED",
      shouldFallback: false,
    });
    expect(client.cancelJob).toHaveBeenCalledTimes(1);
    expect(client.cancelJob).toHaveBeenCalledWith(JOB_ID);
  });

  it("cancels exactly once when polling is aborted", async () => {
    const controller = new AbortController();
    const client = bridgeClient();
    client.createJob.mockResolvedValue(jobResponse());
    const adapter = new BridgeV1SourceAdapter({
      executionTarget: "local-sidecar",
      baseUrl: "http://localhost:11470",
      client,
      sleep: jest.fn().mockImplementation(async () => {
        controller.abort();
      }),
    });
    const selectedRoute = route("seekable-cache", "local-sidecar");

    await expect(
      adapter.prepare({
        action: "play",
        attemptId: "attempt-abort",
        requestId: REQUEST_ID,
        candidate: candidateFor(selectedRoute),
        route: selectedRoute,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: "CANCELLED", isCancellation: true });
    expect(client.cancelJob).toHaveBeenCalledTimes(1);
    expect(client.getJob).not.toHaveBeenCalled();
  });

  it("cleans up a job that arrives after create was aborted", async () => {
    const controller = new AbortController();
    const deferred = createDeferred<BridgeJobResponseV1>();
    const client = bridgeClient();
    client.createJob.mockReturnValue(deferred.promise);
    const adapter = new BridgeV1SourceAdapter({
      executionTarget: "local-sidecar",
      baseUrl: "http://localhost:11470",
      client,
    });
    const selectedRoute = route("range-http", "local-sidecar");
    const preparation = adapter.prepare({
      action: "play",
      attemptId: "attempt-late-create",
      requestId: REQUEST_ID,
      candidate: candidateFor(selectedRoute),
      route: selectedRoute,
      signal: controller.signal,
    });

    controller.abort();
    await expect(preparation).rejects.toMatchObject({ code: "CANCELLED" });
    deferred.resolve(jobResponse({ delivery: "range-http" }));
    await Promise.resolve();
    await Promise.resolve();

    expect(client.cancelJob).toHaveBeenCalledTimes(1);
    expect(client.cancelJob).toHaveBeenCalledWith(JOB_ID);
  });

  it("cancels timed out and no-peer jobs with stable error codes", async () => {
    const selectedRoute = route("seekable-cache", "local-sidecar");
    const request = {
      action: "play" as const,
      attemptId: "attempt-terminal",
      requestId: REQUEST_ID,
      candidate: candidateFor(selectedRoute),
      route: selectedRoute,
    };

    const timeoutClient = bridgeClient();
    timeoutClient.createJob.mockResolvedValue(
      jobResponse({ elapsedMs: 45_000, readyTimeoutMs: 45_000 }),
    );
    const timeoutAdapter = new BridgeV1SourceAdapter({
      executionTarget: "local-sidecar",
      baseUrl: "http://localhost:11470",
      client: timeoutClient,
    });
    await expect(timeoutAdapter.prepare(request)).rejects.toMatchObject({
      code: "GATEWAY_TIMEOUT",
    });
    expect(timeoutClient.cancelJob).toHaveBeenCalledTimes(1);

    const noPeersClient = bridgeClient();
    noPeersClient.createJob.mockResolvedValue(
      jobResponse({
        state: "no_peers",
        phase: "no_peers",
        failure: {
          code: "NO_PEERS",
          message: "No peers were available.",
          retryable: true,
        },
      }),
    );
    const noPeersAdapter = new BridgeV1SourceAdapter({
      executionTarget: "local-sidecar",
      baseUrl: "http://localhost:11470",
      client: noPeersClient,
    });
    await expect(noPeersAdapter.prepare(request)).rejects.toMatchObject({
      code: "NO_PEERS",
      retryable: true,
    });
    expect(noPeersClient.cancelJob).toHaveBeenCalledTimes(1);
  });
});
