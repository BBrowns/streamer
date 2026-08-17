import { createHash, randomUUID } from "crypto";
import rateLimit, { MemoryStore } from "express-rate-limit";
import { Router, type Request, type Response } from "express";
import {
  bridgeCapabilitiesV1Schema,
  bridgeAccessSessionIdSchema,
  bridgeCastControlV1Schema,
  bridgeCastDevicesV1Schema,
  bridgeCastPlayV1Schema,
  bridgeCastStatusV1Schema,
  bridgeCommandResponseV1Schema,
  bridgeCreateAccessSessionV1Schema,
  bridgeCreateJobV1Schema,
  bridgeErrorResponseV1Schema,
  bridgeHelloV1Schema,
  bridgeJobMetricsV1Schema,
  bridgeOperationalMetricsV1Schema,
  bridgeTrackCatalogV1Schema,
  BRIDGE_V1_MAX_REQUEST_BYTES,
  type BridgeDelivery,
  type BridgeV1ErrorCode,
  type CreateBridgeJobV1,
} from "@streamer/shared";
import {
  cancelGatewayJob,
  buildGatewayTrackCatalog,
  createGatewayJob,
  GATEWAY_MAX_THUMBNAIL_BUCKET,
  gatewayJobOwnsSeekableCache,
  getGatewayJob,
  getGatewaySubtitleDocument,
  getGatewayThumbnail,
  serializeBridgeJobV1,
  serveGatewayJobStream,
} from "./gateway.js";
import {
  createBridgeV1AccessSession,
  getConfiguredBridgePublicOrigin,
  getBridgeV1AuthContext,
  requireBridgeV1MasterAuth,
  requireBridgeV1Scope,
  revokeBridgeV1AccessSession,
  validateCastPlaybackUrlWithDns,
} from "./security.js";
import {
  __resetBridgeOperationalMetricsForTests,
  getBridgeOperationalMetricsSnapshot,
  recordBridgeOperationalEvent,
  recordBridgeTerminalState,
} from "./bridge-metrics.js";
import {
  getRemuxRuntimeStatus,
  getTorrentEngineStatus,
  isTorrentEngineUnavailableError,
} from "./torrent.js";
import { streamServerBuildMetadata } from "./build-metadata.js";
import { MAX_SUBTITLE_DOCUMENT_BYTES } from "./subtitle-normalizer.js";
import { MAX_SEEK_THUMBNAIL_BYTES } from "./seek-thumbnail.js";
import { getTorrentMetricsSnapshot } from "./metrics.js";
import {
  controlBridgeCastDevice,
  getBridgeCastDevices,
  getBridgeCastStatus,
  playBridgeCastDevice,
} from "./cast.js";

interface IdempotencyRecord {
  digest: string;
  jobId: string;
}

const idempotencyRecords = new Map<string, IdempotencyRecord>();

interface BridgeMediaIdentities {
  mediaId: string;
  subtitleIds: Map<string, string>;
  documentIds: Map<string, string>;
  subtitleIdentityByDocumentId: Map<string, string>;
}

const mediaIdentitiesByJobId = new Map<string, BridgeMediaIdentities>();
const castPlayRequests = new Map<string, string>();

function sendBridgeV1Error(
  res: Response,
  status: number,
  code: BridgeV1ErrorCode,
  message: string,
  retryable = false,
) {
  return res.status(status).json(
    bridgeErrorResponseV1Schema.parse({
      protocolVersion: 1,
      error: {
        code,
        message,
        retryable,
      },
    }),
  );
}

function bridgeOwner() {
  const owner = process.env.STREAMER_BRIDGE_OWNER;
  if (owner === "desktop" || owner === "api-supervisor") return owner;
  return "standalone" as const;
}

function gatewayInputForDelivery(
  delivery: BridgeDelivery,
  source: {
    magnet: string;
  },
  selection?: {
    fileIndex?: number;
    title?: string;
    season?: number;
    episode?: number;
  },
) {
  const remux = delivery !== "range-http";
  return {
    magnet: source.magnet,
    fileIdx: selection?.fileIndex,
    hints: selection
      ? {
          title: selection.title,
          season: selection.season,
          episode: selection.episode,
        }
      : undefined,
    mode: remux ? ("remux" as const) : ("bridge" as const),
    remuxStrategy:
      delivery === "progressive-fmp4"
        ? ("progressive-fmp4" as const)
        : ("seekable-cache" as const),
    requestedDelivery: delivery,
  };
}

function idempotencyDigest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("base64url");
}

function serializeBridgeJobForResponse(
  job: Parameters<typeof serializeBridgeJobV1>[0],
) {
  const response = serializeBridgeJobV1(job);
  recordBridgeTerminalState(response.job.id, response.job.state);
  return response;
}

function pruneIdempotencyRecords() {
  for (const [key, record] of idempotencyRecords) {
    if (!getGatewayJob(record.jobId)) {
      idempotencyRecords.delete(key);
    }
  }
}

function castFailure(
  res: Response,
  reason: "device_not_found" | "session_not_found" | "unavailable",
) {
  if (reason === "device_not_found") {
    return sendBridgeV1Error(
      res,
      404,
      "CAST_DEVICE_NOT_FOUND",
      "The cast device was not found.",
    );
  }
  if (reason === "session_not_found") {
    return sendBridgeV1Error(
      res,
      404,
      "CAST_SESSION_NOT_FOUND",
      "The cast session was not found.",
    );
  }
  return sendBridgeV1Error(
    res,
    503,
    "CAST_UNAVAILABLE",
    "Casting is temporarily unavailable.",
    true,
  );
}

function mediaIdentitiesForJob(jobId: string): BridgeMediaIdentities {
  for (const existingJobId of mediaIdentitiesByJobId.keys()) {
    if (!getGatewayJob(existingJobId)) {
      mediaIdentitiesByJobId.delete(existingJobId);
    }
  }

  const existing = mediaIdentitiesByJobId.get(jobId);
  if (existing) return existing;
  const created: BridgeMediaIdentities = {
    mediaId: randomUUID(),
    subtitleIds: new Map(),
    documentIds: new Map(),
    subtitleIdentityByDocumentId: new Map(),
  };
  mediaIdentitiesByJobId.set(jobId, created);
  return created;
}

export async function buildBridgeTrackCatalogV1(
  job: NonNullable<ReturnType<typeof getGatewayJob>>,
) {
  const catalog = await buildGatewayTrackCatalog(job);
  const identities = mediaIdentitiesForJob(job.id);
  const subtitles = catalog.subtitles.map((subtitle) => {
    const { fetchIdentity, ...safeSubtitle } = subtitle;
    const identityKey =
      fetchIdentity ??
      `${subtitle.source}:${subtitle.id}:${subtitle.language}:${subtitle.label}`;
    let safeId = identities.subtitleIds.get(identityKey);
    if (!safeId) {
      safeId = randomUUID();
      identities.subtitleIds.set(identityKey, safeId);
    }

    let documentId: string | undefined;
    if (fetchIdentity) {
      documentId = identities.documentIds.get(fetchIdentity);
      if (!documentId) {
        documentId = randomUUID();
        identities.documentIds.set(fetchIdentity, documentId);
        identities.subtitleIdentityByDocumentId.set(documentId, fetchIdentity);
      }
    }

    return {
      ...safeSubtitle,
      id: safeId,
      ...(documentId ? { documentId } : {}),
    };
  });

  return bridgeTrackCatalogV1Schema.parse({
    protocolVersion: 1,
    jobId: job.id,
    mediaId: identities.mediaId,
    tracks: catalog.tracks,
    subtitles,
  });
}

export const bridgeV1Router = Router();

const bridgeV1RateLimitHandler = (_req: unknown, res: Response) => {
  recordBridgeOperationalEvent("rate_limited");
  return res.status(429).json(
    bridgeErrorResponseV1Schema.parse({
      protocolVersion: 1,
      error: {
        code: "RATE_LIMITED",
        message: "Too many bridge requests. Please try again later.",
        retryable: true,
        retryAfterMs: 60_000,
      },
    }),
  );
};

const bridgeV1RateLimitStore = new MemoryStore();
const bridgeV1PairingRateLimitStore = new MemoryStore();

const bridgeV1RateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  store: bridgeV1RateLimitStore,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: bridgeV1RateLimitHandler,
});

const bridgeV1PairingRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  store: bridgeV1PairingRateLimitStore,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: bridgeV1RateLimitHandler,
});

export function buildBridgeHelloV1() {
  return bridgeHelloV1Schema.parse({
    protocol: {
      name: "streamer-bridge",
      current: 1,
      supported: [1],
    },
    serviceVersion: streamServerBuildMetadata.appVersion,
    auth: {
      required: true,
      methods: ["bearer", "x-streamer-bridge-token"],
    },
  });
}

export async function buildBridgeCapabilitiesV1() {
  const torrent = getTorrentEngineStatus();
  const remux = await getRemuxRuntimeStatus();
  const health = !torrent.available
    ? "unavailable"
    : remux.available
      ? "ready"
      : "degraded";

  return bridgeCapabilitiesV1Schema.parse({
    protocolVersion: 1,
    owner: bridgeOwner(),
    health,
    capabilities: {
      jobs: {
        sourceKinds: ["magnet"],
        deliveries: [
          {
            delivery: "range-http",
            available: torrent.available,
            ...(!torrent.available
              ? { unavailableReason: "torrent_unavailable" }
              : {}),
          },
          {
            delivery: "progressive-fmp4",
            available: torrent.available && remux.available,
            ...(!(torrent.available && remux.available)
              ? {
                  unavailableReason: !torrent.available
                    ? "torrent_unavailable"
                    : "ffmpeg_unavailable",
                }
              : {}),
          },
          {
            delivery: "seekable-cache",
            available: torrent.available && remux.available,
            ...(!(torrent.available && remux.available)
              ? {
                  unavailableReason: !torrent.available
                    ? "torrent_unavailable"
                    : "ffmpeg_unavailable",
                }
              : {}),
          },
        ],
        cancellation: true,
        tracks: true,
        subtitles: true,
        thumbnails: true,
        metrics: true,
      },
      cast: {
        available: true,
        controls: ["play", "pause", "resume", "seek", "stop"],
      },
    },
    limits: {
      maxRequestBytes: BRIDGE_V1_MAX_REQUEST_BYTES,
      maxSubtitleBytes: MAX_SUBTITLE_DOCUMENT_BYTES,
      thumbnailBucketSeconds: 10,
      maxThumbnailBucket: 24 * 60 * 6,
      maxThumbnailBytes: MAX_SEEK_THUMBNAIL_BYTES,
    },
  });
}

export async function createBridgeJobV1(
  principal: string,
  input: CreateBridgeJobV1,
) {
  pruneIdempotencyRecords();
  const idempotencyKey = `${principal}:${input.requestId}`;
  const digest = idempotencyDigest(input);
  const existing = idempotencyRecords.get(idempotencyKey);
  if (existing) {
    if (existing.digest !== digest) {
      recordBridgeOperationalEvent("idempotency_conflict");
      return { kind: "conflict" as const };
    }
    const existingJob = getGatewayJob(existing.jobId);
    if (existingJob) {
      return { kind: "job" as const, job: existingJob, reused: true };
    }
    idempotencyRecords.delete(idempotencyKey);
  }

  const job = await createGatewayJob(
    gatewayInputForDelivery(input.delivery, input.source, input.selection),
  );
  idempotencyRecords.set(idempotencyKey, {
    digest,
    jobId: job.id,
  });
  return { kind: "job" as const, job, reused: false };
}

bridgeV1Router.get("/hello", (_req, res) => {
  return res.json(buildBridgeHelloV1());
});

bridgeV1Router.get(
  "/capabilities",
  bridgeV1RateLimiter,
  requireBridgeV1Scope("capabilities:read"),
  async (_req, res) => {
    return res.json(await buildBridgeCapabilitiesV1());
  },
);

bridgeV1Router.post(
  "/access-sessions",
  bridgeV1PairingRateLimiter,
  requireBridgeV1MasterAuth,
  (req, res) => {
    const parsed = bridgeCreateAccessSessionV1Schema.safeParse(req.body);
    if (!parsed.success) {
      return sendBridgeV1Error(
        res,
        400,
        "INVALID_REQUEST",
        "The bridge access-session request is invalid.",
      );
    }
    return res.json(createBridgeV1AccessSession(parsed.data));
  },
);

bridgeV1Router.delete(
  "/access-sessions/:sessionId",
  bridgeV1PairingRateLimiter,
  requireBridgeV1MasterAuth,
  (req: Request<{ sessionId: string }>, res) => {
    const parsedSessionId = bridgeAccessSessionIdSchema.safeParse(
      req.params.sessionId,
    );
    if (!parsedSessionId.success) {
      return sendBridgeV1Error(
        res,
        400,
        "INVALID_REQUEST",
        "The bridge access-session identity is invalid.",
      );
    }

    revokeBridgeV1AccessSession(parsedSessionId.data);
    return res.json(
      bridgeCommandResponseV1Schema.parse({
        protocolVersion: 1,
        success: true,
      }),
    );
  },
);

bridgeV1Router.get(
  "/metrics",
  bridgeV1RateLimiter,
  requireBridgeV1MasterAuth,
  (_req, res) => {
    return res.json(
      bridgeOperationalMetricsV1Schema.parse(
        getBridgeOperationalMetricsSnapshot(),
      ),
    );
  },
);

bridgeV1Router.post(
  "/jobs",
  bridgeV1RateLimiter,
  requireBridgeV1Scope("jobs:write"),
  async (req, res) => {
    const parsed = bridgeCreateJobV1Schema.safeParse(req.body);
    if (!parsed.success) {
      return sendBridgeV1Error(
        res,
        400,
        "INVALID_REQUEST",
        "The bridge job request is invalid.",
      );
    }

    const auth = getBridgeV1AuthContext(res);
    if (!auth) {
      return sendBridgeV1Error(
        res,
        401,
        "AUTH_REQUIRED",
        "Bridge authentication is required.",
      );
    }

    try {
      const result = await createBridgeJobV1(auth.principal, parsed.data);
      if (result.kind === "conflict") {
        return sendBridgeV1Error(
          res,
          409,
          "IDEMPOTENCY_CONFLICT",
          "The requestId was already used with a different payload.",
        );
      }
      return res.status(202).json(serializeBridgeJobForResponse(result.job));
    } catch (error) {
      if (isTorrentEngineUnavailableError(error)) {
        return sendBridgeV1Error(
          res,
          503,
          "RUNTIME_UNAVAILABLE",
          "The torrent runtime is unavailable.",
        );
      }
      return sendBridgeV1Error(
        res,
        503,
        "INTERNAL",
        "The bridge could not create the job.",
        true,
      );
    }
  },
);

bridgeV1Router.get(
  "/jobs/:jobId",
  bridgeV1RateLimiter,
  requireBridgeV1Scope("jobs:read"),
  (req: Request<{ jobId: string }>, res) => {
    const job = getGatewayJob(req.params.jobId);
    if (!job) {
      return sendBridgeV1Error(
        res,
        404,
        "JOB_NOT_FOUND",
        "The bridge job was not found.",
      );
    }
    return res.json(serializeBridgeJobForResponse(job));
  },
);

bridgeV1Router.get(
  "/jobs/:jobId/metrics",
  bridgeV1RateLimiter,
  requireBridgeV1Scope("jobs:read"),
  (req: Request<{ jobId: string }>, res) => {
    const job = getGatewayJob(req.params.jobId);
    if (!job) {
      return sendBridgeV1Error(
        res,
        404,
        "JOB_NOT_FOUND",
        "The bridge job was not found.",
      );
    }
    const metrics = job.infoHash
      ? getTorrentMetricsSnapshot(job.infoHash)
      : undefined;
    if (!metrics) {
      return sendBridgeV1Error(
        res,
        425,
        "JOB_NOT_READY",
        "Bridge job metrics are not ready.",
        true,
      );
    }
    const progress = Number(metrics.progress);
    return res.json(
      bridgeJobMetricsV1Schema.parse({
        protocolVersion: 1,
        jobId: job.id,
        sampledAt: new Date().toISOString(),
        state: metrics.state,
        peers: Math.max(0, metrics.numPeers),
        downloadBytesPerSecond: Math.max(0, metrics.downloadSpeed),
        downloadedBytes: Math.max(0, metrics.downloaded),
        torrentProgress: Number.isFinite(progress)
          ? Math.min(1, Math.max(0, progress))
          : null,
      }),
    );
  },
);

bridgeV1Router.get(
  "/jobs/:jobId/tracks",
  bridgeV1RateLimiter,
  requireBridgeV1Scope("jobs:read"),
  async (req: Request<{ jobId: string }>, res) => {
    const job = getGatewayJob(req.params.jobId);
    if (!job) {
      return sendBridgeV1Error(
        res,
        404,
        "JOB_NOT_FOUND",
        "The bridge job was not found.",
      );
    }
    if (job.state === "cancelled") {
      return sendBridgeV1Error(
        res,
        410,
        "JOB_CANCELLED",
        "The bridge job was cancelled.",
      );
    }
    if (job.state !== "ready") {
      return sendBridgeV1Error(
        res,
        425,
        "JOB_NOT_READY",
        "Bridge media tracks are not ready.",
        true,
      );
    }

    try {
      return res.json(await buildBridgeTrackCatalogV1(job));
    } catch {
      return sendBridgeV1Error(
        res,
        503,
        "TRACKS_UNAVAILABLE",
        "Media tracks are temporarily unavailable.",
        true,
      );
    }
  },
);

bridgeV1Router.get(
  "/jobs/:jobId/subtitles/:documentId",
  bridgeV1RateLimiter,
  requireBridgeV1Scope("jobs:read"),
  async (req: Request<{ jobId: string; documentId: string }>, res) => {
    const job = getGatewayJob(req.params.jobId);
    if (!job) {
      return sendBridgeV1Error(
        res,
        404,
        "JOB_NOT_FOUND",
        "The bridge job was not found.",
      );
    }
    if (job.state === "cancelled") {
      return sendBridgeV1Error(
        res,
        410,
        "JOB_CANCELLED",
        "The bridge job was cancelled.",
      );
    }
    if (job.state !== "ready") {
      return sendBridgeV1Error(
        res,
        425,
        "JOB_NOT_READY",
        "Bridge subtitles are not ready.",
        true,
      );
    }

    const identities = mediaIdentitiesByJobId.get(job.id);
    const identity = identities?.subtitleIdentityByDocumentId.get(
      req.params.documentId,
    );
    if (!identity) {
      return sendBridgeV1Error(
        res,
        404,
        "SUBTITLE_NOT_FOUND",
        "The subtitle document was not found.",
      );
    }

    try {
      const document = await getGatewaySubtitleDocument(job, identity);
      if (!document) {
        return sendBridgeV1Error(
          res,
          404,
          "SUBTITLE_NOT_FOUND",
          "The subtitle document was not found.",
        );
      }
      if (Buffer.byteLength(document, "utf8") > MAX_SUBTITLE_DOCUMENT_BYTES) {
        return sendBridgeV1Error(
          res,
          503,
          "SUBTITLE_UNAVAILABLE",
          "The subtitle document exceeded its size limit.",
        );
      }
      res.set({
        "Cache-Control": "no-store",
        "Content-Type": "text/vtt; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      });
      return res.send(document);
    } catch {
      return sendBridgeV1Error(
        res,
        503,
        "SUBTITLE_UNAVAILABLE",
        "The subtitle document is temporarily unavailable.",
        true,
      );
    }
  },
);

bridgeV1Router.get(
  "/jobs/:jobId/thumbnails/:bucket",
  bridgeV1RateLimiter,
  requireBridgeV1Scope("jobs:read"),
  async (req: Request<{ jobId: string; bucket: string }>, res) => {
    const job = getGatewayJob(req.params.jobId);
    if (!job) {
      return sendBridgeV1Error(
        res,
        404,
        "JOB_NOT_FOUND",
        "The bridge job was not found.",
      );
    }
    if (job.state === "cancelled") {
      return sendBridgeV1Error(
        res,
        410,
        "JOB_CANCELLED",
        "The bridge job was cancelled.",
      );
    }

    const bucketText = req.params.bucket;
    const bucket = /^\d+$/.test(bucketText) ? Number(bucketText) : NaN;
    if (
      !Number.isSafeInteger(bucket) ||
      bucket < 0 ||
      bucket > GATEWAY_MAX_THUMBNAIL_BUCKET
    ) {
      return sendBridgeV1Error(
        res,
        400,
        "INVALID_REQUEST",
        "The thumbnail bucket is invalid.",
      );
    }
    if (!gatewayJobOwnsSeekableCache(job)) {
      return sendBridgeV1Error(
        res,
        425,
        "JOB_NOT_READY",
        "Seekable media is still preparing.",
        true,
      );
    }

    const abortController = new AbortController();
    let responseReady = false;
    const abortOnDisconnect = () => {
      if (!responseReady) {
        abortController.abort(new Error("Thumbnail request cancelled"));
      }
    };
    req.once("aborted", abortOnDisconnect);
    res.once("close", abortOnDisconnect);

    try {
      const thumbnail = await getGatewayThumbnail(
        job,
        bucket,
        abortController.signal,
      );
      if (!thumbnail) {
        return sendBridgeV1Error(
          res,
          425,
          "JOB_NOT_READY",
          "Seekable media is still preparing.",
          true,
        );
      }
      if (thumbnail.length > MAX_SEEK_THUMBNAIL_BYTES) {
        return sendBridgeV1Error(
          res,
          503,
          "THUMBNAIL_UNAVAILABLE",
          "The thumbnail exceeded its size limit.",
        );
      }
      responseReady = true;
      res.set({
        "Cache-Control": "no-store",
        "Content-Length": String(thumbnail.length),
        "Content-Type": "image/jpeg",
        "X-Content-Type-Options": "nosniff",
      });
      return res.status(200).send(thumbnail);
    } catch {
      if (res.destroyed) return;
      if (getGatewayJob(job.id)?.state === "cancelled") {
        return sendBridgeV1Error(
          res,
          410,
          "JOB_CANCELLED",
          "The bridge job was cancelled.",
        );
      }
      return sendBridgeV1Error(
        res,
        503,
        "THUMBNAIL_UNAVAILABLE",
        "The thumbnail is temporarily unavailable.",
        true,
      );
    } finally {
      responseReady = true;
      req.off("aborted", abortOnDisconnect);
      res.off("close", abortOnDisconnect);
    }
  },
);

bridgeV1Router.delete(
  "/jobs/:jobId",
  bridgeV1RateLimiter,
  requireBridgeV1Scope("jobs:write"),
  (req: Request<{ jobId: string }>, res) => {
    const job = getGatewayJob(req.params.jobId);
    if (!job) return res.status(204).send();
    if (job.state !== "cancelled") cancelGatewayJob(job);
    mediaIdentitiesByJobId.delete(job.id);
    return res.json(serializeBridgeJobForResponse(job));
  },
);

bridgeV1Router.get("/jobs/:id/stream", serveGatewayJobStream);
bridgeV1Router.head("/jobs/:id/stream", serveGatewayJobStream);

bridgeV1Router.get(
  "/cast/devices",
  bridgeV1RateLimiter,
  requireBridgeV1Scope("cast:read"),
  async (_req, res) => {
    return res.json(
      bridgeCastDevicesV1Schema.parse({
        protocolVersion: 1,
        devices: await getBridgeCastDevices(),
      }),
    );
  },
);

bridgeV1Router.post(
  "/cast/play",
  bridgeV1RateLimiter,
  requireBridgeV1Scope("cast:write"),
  async (req, res) => {
    const parsed = bridgeCastPlayV1Schema.safeParse(req.body);
    if (!parsed.success) {
      return sendBridgeV1Error(
        res,
        400,
        "INVALID_REQUEST",
        "The cast play request is invalid.",
      );
    }
    const auth = getBridgeV1AuthContext(res);
    if (!auth) {
      return sendBridgeV1Error(
        res,
        401,
        "AUTH_REQUIRED",
        "Bridge authentication is required.",
      );
    }
    const requestKey = `${auth.principal}:${parsed.data.requestId}`;
    const digest = idempotencyDigest(parsed.data);
    const previousDigest = castPlayRequests.get(requestKey);
    if (previousDigest && previousDigest !== digest) {
      recordBridgeOperationalEvent("idempotency_conflict");
      return sendBridgeV1Error(
        res,
        409,
        "IDEMPOTENCY_CONFLICT",
        "The requestId was already used with a different payload.",
      );
    }
    if (previousDigest === digest) {
      return res.json(
        bridgeCommandResponseV1Schema.parse({
          protocolVersion: 1,
          success: true,
        }),
      );
    }

    const bridgeOrigin = getConfiguredBridgePublicOrigin();
    if (!bridgeOrigin) {
      return sendBridgeV1Error(
        res,
        400,
        "CAST_SOURCE_REJECTED",
        "The bridge public origin is not configured for casting.",
      );
    }

    let sourceUrl: string;
    let contentType:
      "video/mp4" | "application/vnd.apple.mpegurl" | "application/x-mpegURL";
    if (parsed.data.source.kind === "bridge-job") {
      const job = getGatewayJob(parsed.data.source.jobId);
      if (!job) {
        return sendBridgeV1Error(
          res,
          404,
          "JOB_NOT_FOUND",
          "The bridge job was not found.",
        );
      }
      const response = serializeBridgeJobForResponse(job);
      if (response.job.state !== "ready" || !response.job.stream) {
        return sendBridgeV1Error(
          res,
          425,
          "JOB_NOT_READY",
          "The bridge job is not ready for casting.",
          true,
        );
      }
      sourceUrl = new URL(
        response.job.stream.path,
        `${bridgeOrigin}/`,
      ).toString();
      contentType = "video/mp4";
    } else {
      sourceUrl = parsed.data.source.url;
      contentType = parsed.data.source.contentType;
    }

    const safeSource = await validateCastPlaybackUrlWithDns(sourceUrl, {
      allowedHosts: [new URL(bridgeOrigin).hostname],
    });
    if (!safeSource.ok || !safeSource.url) {
      return sendBridgeV1Error(
        res,
        400,
        "CAST_SOURCE_REJECTED",
        "The cast source was rejected.",
      );
    }

    const result = await playBridgeCastDevice({
      deviceId: parsed.data.deviceId,
      url: safeSource.url,
      title: parsed.data.title,
      contentType,
    });
    if (!result.ok) return castFailure(res, result.reason);

    while (castPlayRequests.size >= 128) {
      const oldest = castPlayRequests.keys().next().value;
      if (!oldest) break;
      castPlayRequests.delete(oldest);
    }
    castPlayRequests.set(requestKey, digest);
    return res.json(
      bridgeCommandResponseV1Schema.parse({
        protocolVersion: 1,
        success: true,
      }),
    );
  },
);

bridgeV1Router.post(
  "/cast/control",
  bridgeV1RateLimiter,
  requireBridgeV1Scope("cast:write"),
  async (req, res) => {
    const parsed = bridgeCastControlV1Schema.safeParse(req.body);
    if (!parsed.success) {
      return sendBridgeV1Error(
        res,
        400,
        "INVALID_REQUEST",
        "The cast control request is invalid.",
      );
    }
    const result = await controlBridgeCastDevice(parsed.data);
    if (!result.ok) return castFailure(res, result.reason);
    return res.json(
      bridgeCommandResponseV1Schema.parse({
        protocolVersion: 1,
        success: true,
      }),
    );
  },
);

bridgeV1Router.get(
  "/cast/status/:deviceId",
  bridgeV1RateLimiter,
  requireBridgeV1Scope("cast:read"),
  async (req: Request<{ deviceId: string }>, res) => {
    const result = await getBridgeCastStatus(req.params.deviceId);
    if (!result.ok) return castFailure(res, result.reason);
    return res.json(
      bridgeCastStatusV1Schema.parse({
        protocolVersion: 1,
        deviceId: req.params.deviceId,
        ...result.value,
      }),
    );
  },
);

export function __resetBridgeV1ForTests() {
  idempotencyRecords.clear();
  mediaIdentitiesByJobId.clear();
  castPlayRequests.clear();
  __resetBridgeOperationalMetricsForTests();
}

export async function __resetBridgeV1RateLimitersForTests() {
  await Promise.all([
    bridgeV1RateLimitStore.resetAll(),
    bridgeV1PairingRateLimitStore.resetAll(),
  ]);
}
