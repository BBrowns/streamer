import {
  bridgeCapabilitiesV1Schema,
  bridgeCastControlV1Schema,
  bridgeCastDevicesV1Schema,
  bridgeCastPlayV1Schema,
  bridgeCastStatusV1Schema,
  bridgeCommandResponseV1Schema,
  bridgeErrorResponseV1Schema,
  bridgeHelloV1Schema,
  bridgeCreateJobV1Schema,
  bridgeJobMetricsV1Schema,
  bridgeJobResponseV1Schema,
  bridgeOperationalMetricsV1Schema,
  bridgeTrackCatalogV1Schema,
  type BridgeCapabilitiesV1,
  type BridgeCastControlV1,
  type BridgeCastDevicesV1,
  type BridgeCastPlayV1,
  type BridgeCastStatusV1,
  type BridgeCommandResponseV1,
  type BridgeHelloV1,
  type BridgeJobMetricsV1,
  type BridgeJobResponseV1,
  type BridgeOperationalCounterName,
  type BridgeOperationalMetricsV1,
  type BridgeTrackCatalogV1,
  type BridgeV1ErrorCode,
  type CreateBridgeJobV1,
} from "@streamer/shared";
import {
  getBridgeAuthHeaders,
  refreshDesktopBridgeAccessSession,
  withBridgeJsonHeaders,
} from "../bridgeAuth";
import { isBridgeV1OpaqueId } from "./BridgeV1StreamGuard";

const NEGOTIATION_TTL_MS = 30_000;
export const BRIDGE_V1_CLIENT_MAX_SUBTITLE_BYTES = 8 * 1024 * 1024;
export const BRIDGE_V1_CLIENT_MAX_THUMBNAIL_BYTES = 512 * 1024;

export type BridgeProtocolSelection =
  | { kind: "v1"; hello: BridgeHelloV1 }
  | { kind: "legacy" };

export type BridgeClientErrorCode =
  | BridgeV1ErrorCode
  | "BRIDGE_UNREACHABLE"
  | "BRIDGE_RESPONSE_INVALID";

export class BridgeClientError extends Error {
  readonly code: BridgeClientErrorCode;
  readonly status?: number;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;

  constructor(
    code: BridgeClientErrorCode,
    message: string,
    options: {
      status?: number;
      retryable?: boolean;
      retryAfterMs?: number;
      cause?: unknown;
    } = {},
  ) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "BridgeClientError";
    this.code = code;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
    this.retryAfterMs = options.retryAfterMs;
  }
}

type ResponseSchema<T> = {
  parse(value: unknown): T;
};

export interface BridgeClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  authHeaders?: () => Record<string, string>;
  jsonHeaders?: () => Record<string, string>;
  refreshAuth?: () => Promise<boolean>;
  onOperationalEvent?: (event: "session_renewed") => void;
  now?: () => number;
}

export interface BridgeBinaryRequestOptions {
  signal?: AbortSignal;
  maxBytes: number;
}

type BridgeRequestPolicy = {
  retryOnAuth?: boolean;
};

const terminalCounterByState = {
  no_peers: "terminal_no_peers",
  stalled: "terminal_stalled",
  error: "terminal_error",
  cancelled: "terminal_cancelled",
  expired: "terminal_expired",
} as const satisfies Partial<Record<string, BridgeOperationalCounterName>>;

function createEmptyOperationalCounters(): BridgeOperationalMetricsV1["counters"] {
  return {
    rate_limited: 0,
    session_issued: 0,
    session_renewed: 0,
    session_revoked: 0,
    idempotency_conflict: 0,
    terminal_no_peers: 0,
    terminal_stalled: 0,
    terminal_error: 0,
    terminal_cancelled: 0,
    terminal_expired: 0,
  };
}

function normalizeBaseUrl(baseUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch (cause) {
    throw new BridgeClientError(
      "INVALID_REQUEST",
      "The bridge endpoint is invalid.",
      { cause },
    );
  }
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new BridgeClientError(
      "INVALID_REQUEST",
      "The bridge endpoint is invalid.",
    );
  }
  return parsed.origin;
}

function rethrowAbort(cause: unknown, signal?: AbortSignal): void {
  if (signal?.aborted) throw abortReason(signal);
  if (
    !!cause &&
    typeof cause === "object" &&
    (cause as { name?: unknown }).name === "AbortError"
  ) {
    throw cause;
  }
}

function abortReason(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) return signal.reason;
  return Object.assign(new Error("Bridge request cancelled."), {
    name: "AbortError",
  });
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortReason(signal);
}

function invalidBridgeResponse(status: number, cause?: unknown) {
  return new BridgeClientError(
    "BRIDGE_RESPONSE_INVALID",
    "The bridge returned a response that does not match protocol v1.",
    { status, cause },
  );
}

function boundedByteLimit(requested: number, hardMaximum: number) {
  if (!Number.isSafeInteger(requested) || requested <= 0) {
    throw new BridgeClientError(
      "INVALID_REQUEST",
      "The bridge response limit is invalid.",
    );
  }
  return Math.min(requested, hardMaximum);
}

function contentLength(response: Response): number | null {
  const value = response.headers.get("content-length");
  if (value === null) return null;
  if (!/^\d+$/.test(value)) throw invalidBridgeResponse(response.status);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw invalidBridgeResponse(response.status);
  }
  return parsed;
}

function utf8ByteLength(value: string) {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.codePointAt(index) ?? 0;
    if (codePoint > 0xffff) index += 1;
    if (codePoint <= 0x7f) bytes += 1;
    else if (codePoint <= 0x7ff) bytes += 2;
    else if (codePoint <= 0xffff) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

async function parseResponseBody(
  response: Response,
  signal?: AbortSignal,
): Promise<unknown> {
  try {
    return await response.json();
  } catch (cause) {
    rethrowAbort(cause, signal);
    throw new BridgeClientError(
      "BRIDGE_RESPONSE_INVALID",
      "The bridge returned an invalid response.",
      { status: response.status, cause },
    );
  }
}

function bridgeErrorFromResponse(status: number, body: unknown) {
  const parsed = bridgeErrorResponseV1Schema.safeParse(body);
  if (!parsed.success) {
    return new BridgeClientError(
      "BRIDGE_RESPONSE_INVALID",
      "The bridge returned an invalid error response.",
      { status },
    );
  }

  return new BridgeClientError(
    parsed.data.error.code,
    parsed.data.error.message,
    {
      status,
      retryable: parsed.data.error.retryable,
      retryAfterMs: parsed.data.error.retryAfterMs,
    },
  );
}

export class BridgeClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly authHeaders: () => Record<string, string>;
  private readonly jsonHeaders: () => Record<string, string>;
  private readonly refreshAuth: () => Promise<boolean>;
  private readonly onOperationalEvent?: (event: "session_renewed") => void;
  private readonly now: () => number;
  private readonly operationalCounters = createEmptyOperationalCounters();
  private readonly observedTerminalJobs = new Set<string>();
  private selectedProtocol: BridgeProtocolSelection | null = null;
  private selectedProtocolExpiresAt = 0;
  private refreshInFlight: Promise<boolean> | null = null;

  constructor(options: BridgeClientOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.authHeaders = options.authHeaders ?? getBridgeAuthHeaders;
    this.jsonHeaders = options.jsonHeaders ?? withBridgeJsonHeaders;
    this.refreshAuth = options.refreshAuth ?? refreshDesktopBridgeAccessSession;
    this.onOperationalEvent = options.onOperationalEvent;
    this.now = options.now ?? Date.now;
  }

  resetNegotiation() {
    this.selectedProtocol = null;
    this.selectedProtocolExpiresAt = 0;
  }

  getOperationalMetrics(): BridgeOperationalMetricsV1 {
    return bridgeOperationalMetricsV1Schema.parse({
      protocolVersion: 1,
      sampledAt: new Date(this.now()).toISOString(),
      counters: { ...this.operationalCounters },
    });
  }

  async negotiate(signal?: AbortSignal): Promise<BridgeProtocolSelection> {
    throwIfAborted(signal);
    if (this.selectedProtocol && this.selectedProtocolExpiresAt > this.now()) {
      return this.selectedProtocol;
    }

    let response: Response;
    try {
      response = await this.fetchImpl(this.url("/api/bridge/v1/hello"), {
        redirect: "error",
        signal,
      });
    } catch (cause) {
      rethrowAbort(cause, signal);
      throw new BridgeClientError(
        "BRIDGE_UNREACHABLE",
        "The bridge could not be reached.",
        { retryable: true, cause },
      );
    }

    if (response.status === 404 || response.status === 501) {
      return this.remember({ kind: "legacy" });
    }

    const body = await parseResponseBody(response, signal);
    if (!response.ok) {
      const error = bridgeErrorFromResponse(response.status, body);
      if (error.code === "PROTOCOL_UNSUPPORTED") {
        return this.remember({ kind: "legacy" });
      }
      throw error;
    }

    let hello: BridgeHelloV1;
    try {
      hello = bridgeHelloV1Schema.parse(body);
    } catch (cause) {
      throw new BridgeClientError(
        "BRIDGE_RESPONSE_INVALID",
        "The bridge protocol response is invalid.",
        { status: response.status, cause },
      );
    }

    return this.remember({ kind: "v1", hello });
  }

  async getCapabilities(signal?: AbortSignal): Promise<BridgeCapabilitiesV1> {
    return this.requestJson(
      "/api/bridge/v1/capabilities",
      bridgeCapabilitiesV1Schema,
      { headers: this.authHeaders(), signal },
    );
  }

  async createJob(
    input: CreateBridgeJobV1,
    signal?: AbortSignal,
  ): Promise<BridgeJobResponseV1> {
    const validatedInput = this.parseRequest(input, bridgeCreateJobV1Schema);
    return this.requestJson(
      "/api/bridge/v1/jobs",
      bridgeJobResponseV1Schema,
      {
        method: "POST",
        headers: this.jsonHeaders(),
        body: JSON.stringify(validatedInput),
        signal,
      },
      { retryOnAuth: true },
    );
  }

  async getJob(
    jobId: string,
    signal?: AbortSignal,
  ): Promise<BridgeJobResponseV1> {
    const validatedJobId = this.requireOpaqueId(jobId);
    return this.requestJson(
      `/api/bridge/v1/jobs/${encodeURIComponent(validatedJobId)}`,
      bridgeJobResponseV1Schema,
      { headers: this.authHeaders(), signal },
    );
  }

  async cancelJob(
    jobId: string,
    signal?: AbortSignal,
  ): Promise<BridgeJobResponseV1 | null> {
    const validatedJobId = this.requireOpaqueId(jobId);
    const response = await this.request(
      `/api/bridge/v1/jobs/${encodeURIComponent(validatedJobId)}`,
      { method: "DELETE", headers: this.authHeaders(), signal },
    );
    if (response.status === 204) return null;
    return this.parseSuccessfulResponse(
      response,
      bridgeJobResponseV1Schema,
      signal,
    );
  }

  async getJobMetrics(
    jobId: string,
    signal?: AbortSignal,
  ): Promise<BridgeJobMetricsV1> {
    const validatedJobId = this.requireOpaqueId(jobId);
    return this.requestJson(
      `/api/bridge/v1/jobs/${encodeURIComponent(validatedJobId)}/metrics`,
      bridgeJobMetricsV1Schema,
      { headers: this.authHeaders(), signal },
    );
  }

  async getTrackCatalog(
    jobId: string,
    signal?: AbortSignal,
  ): Promise<BridgeTrackCatalogV1> {
    const validatedJobId = this.requireOpaqueId(jobId);
    return this.requestJson(
      `/api/bridge/v1/jobs/${encodeURIComponent(validatedJobId)}/tracks`,
      bridgeTrackCatalogV1Schema,
      { headers: this.authHeaders(), signal },
    );
  }

  async getSubtitleDocument(
    jobId: string,
    documentId: string,
    options: BridgeBinaryRequestOptions,
  ): Promise<string> {
    const validatedJobId = this.requireOpaqueId(jobId);
    const validatedDocumentId = this.requireOpaqueId(documentId);
    const maxBytes = boundedByteLimit(
      options.maxBytes,
      BRIDGE_V1_CLIENT_MAX_SUBTITLE_BYTES,
    );
    const response = await this.request(
      `/api/bridge/v1/jobs/${encodeURIComponent(validatedJobId)}/subtitles/${encodeURIComponent(validatedDocumentId)}`,
      { headers: this.authHeaders(), signal: options.signal },
    );
    const mediaType = response.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase();
    const advertisedBytes = contentLength(response);
    if (
      mediaType !== "text/vtt" ||
      advertisedBytes === null ||
      advertisedBytes > maxBytes
    ) {
      throw invalidBridgeResponse(response.status);
    }

    let document: string;
    try {
      document = await response.text();
    } catch (cause) {
      rethrowAbort(cause, options.signal);
      throw invalidBridgeResponse(response.status, cause);
    }
    throwIfAborted(options.signal);
    const actualBytes = utf8ByteLength(document);
    if (
      actualBytes > maxBytes ||
      advertisedBytes !== actualBytes ||
      !/^WEBVTT(?:\r?\n|$)/.test(document)
    ) {
      throw invalidBridgeResponse(response.status);
    }
    return document;
  }

  async getThumbnail(
    jobId: string,
    bucket: number,
    options: BridgeBinaryRequestOptions,
  ): Promise<Uint8Array> {
    const validatedJobId = this.requireOpaqueId(jobId);
    if (!Number.isSafeInteger(bucket) || bucket < 0) {
      throw new BridgeClientError(
        "INVALID_REQUEST",
        "The bridge thumbnail bucket is invalid.",
      );
    }
    const maxBytes = boundedByteLimit(
      options.maxBytes,
      BRIDGE_V1_CLIENT_MAX_THUMBNAIL_BYTES,
    );
    const response = await this.request(
      `/api/bridge/v1/jobs/${encodeURIComponent(validatedJobId)}/thumbnails/${bucket}`,
      { headers: this.authHeaders(), signal: options.signal },
    );
    const mediaType = response.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase();
    const advertisedBytes = contentLength(response);
    if (
      mediaType !== "image/jpeg" ||
      advertisedBytes === null ||
      advertisedBytes > maxBytes
    ) {
      throw invalidBridgeResponse(response.status);
    }

    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await response.arrayBuffer());
    } catch (cause) {
      rethrowAbort(cause, options.signal);
      throw invalidBridgeResponse(response.status, cause);
    }
    throwIfAborted(options.signal);
    if (
      bytes.length > maxBytes ||
      advertisedBytes !== bytes.length ||
      bytes.length < 2 ||
      bytes[0] !== 0xff ||
      bytes[1] !== 0xd8
    ) {
      throw invalidBridgeResponse(response.status);
    }
    return bytes;
  }

  async getCastDevices(signal?: AbortSignal): Promise<BridgeCastDevicesV1> {
    return this.requestJson(
      "/api/bridge/v1/cast/devices",
      bridgeCastDevicesV1Schema,
      { headers: this.authHeaders(), signal },
    );
  }

  async playCast(
    input: BridgeCastPlayV1,
    signal?: AbortSignal,
  ): Promise<BridgeCommandResponseV1> {
    const validatedInput = this.parseRequest(input, bridgeCastPlayV1Schema);
    return this.requestJson(
      "/api/bridge/v1/cast/play",
      bridgeCommandResponseV1Schema,
      {
        method: "POST",
        headers: this.jsonHeaders(),
        body: JSON.stringify(validatedInput),
        signal,
      },
      { retryOnAuth: true },
    );
  }

  async controlCast(
    input: BridgeCastControlV1,
    signal?: AbortSignal,
  ): Promise<BridgeCommandResponseV1> {
    const validatedInput = this.parseRequest(input, bridgeCastControlV1Schema);
    return this.requestJson(
      "/api/bridge/v1/cast/control",
      bridgeCommandResponseV1Schema,
      {
        method: "POST",
        headers: this.jsonHeaders(),
        body: JSON.stringify(validatedInput),
        signal,
      },
      { retryOnAuth: false },
    );
  }

  async getCastStatus(
    deviceId: string,
    signal?: AbortSignal,
  ): Promise<BridgeCastStatusV1> {
    return this.requestJson(
      `/api/bridge/v1/cast/status/${encodeURIComponent(deviceId)}`,
      bridgeCastStatusV1Schema,
      { headers: this.authHeaders(), signal },
    );
  }

  private remember(selection: BridgeProtocolSelection) {
    this.selectedProtocol = selection;
    this.selectedProtocolExpiresAt = this.now() + NEGOTIATION_TTL_MS;
    return selection;
  }

  private url(path: string) {
    return new URL(path, `${this.baseUrl}/`).toString();
  }

  private async requireV1(signal?: AbortSignal) {
    const selection = await this.negotiate(signal);
    if (selection.kind === "legacy") {
      throw new BridgeClientError(
        "PROTOCOL_UNSUPPORTED",
        "Bridge protocol v1 is unavailable.",
      );
    }
  }

  private async request(
    path: string,
    init: RequestInit,
    policy: BridgeRequestPolicy = {},
  ) {
    throwIfAborted(init.signal ?? undefined);
    await this.requireV1(init.signal ?? undefined);
    throwIfAborted(init.signal ?? undefined);
    let response: Response;
    try {
      response = await this.fetchImpl(this.url(path), {
        ...init,
        redirect: "error",
      });
    } catch (cause) {
      rethrowAbort(cause, init.signal ?? undefined);
      throw new BridgeClientError(
        "BRIDGE_UNREACHABLE",
        "The bridge could not be reached.",
        { retryable: true, cause },
      );
    }

    if (!response.ok && response.status !== 204) {
      const body = await parseResponseBody(response, init.signal ?? undefined);
      const error = bridgeErrorFromResponse(response.status, body);
      if (
        policy.retryOnAuth !== false &&
        response.status === 401 &&
        error.code === "AUTH_REQUIRED"
      ) {
        throwIfAborted(init.signal ?? undefined);
        const refreshed = await this.refreshAuthOnce();
        throwIfAborted(init.signal ?? undefined);
        if (!refreshed) {
          this.recordOperationalError(error);
          throw error;
        }
        const headers = new Headers(init.headers);
        headers.delete("Authorization");
        headers.delete("X-Streamer-Bridge-Token");
        for (const [name, value] of Object.entries(this.authHeaders())) {
          headers.set(name, value);
        }

        try {
          throwIfAborted(init.signal ?? undefined);
          response = await this.fetchImpl(this.url(path), {
            ...init,
            headers,
            redirect: "error",
          });
        } catch (cause) {
          rethrowAbort(cause, init.signal ?? undefined);
          throw new BridgeClientError(
            "BRIDGE_UNREACHABLE",
            "The bridge could not be reached.",
            { retryable: true, cause },
          );
        }

        if (!response.ok && response.status !== 204) {
          const retryBody = await parseResponseBody(
            response,
            init.signal ?? undefined,
          );
          const retryError = bridgeErrorFromResponse(
            response.status,
            retryBody,
          );
          this.recordOperationalError(retryError);
          throw retryError;
        }
        return response;
      }
      this.recordOperationalError(error);
      throw error;
    }
    return response;
  }

  private async requestJson<T>(
    path: string,
    schema: ResponseSchema<T>,
    init: RequestInit,
    policy: BridgeRequestPolicy = {},
  ): Promise<T> {
    const response = await this.request(path, init, policy);
    return this.parseSuccessfulResponse(
      response,
      schema,
      init.signal ?? undefined,
    );
  }

  private async parseSuccessfulResponse<T>(
    response: Response,
    schema: ResponseSchema<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    const body = await parseResponseBody(response, signal);
    try {
      const parsed = schema.parse(body);
      this.recordTerminalResponse(parsed);
      return parsed;
    } catch (cause) {
      throw new BridgeClientError(
        "BRIDGE_RESPONSE_INVALID",
        "The bridge returned a response that does not match protocol v1.",
        { status: response.status, cause },
      );
    }
  }

  private parseRequest<T>(value: unknown, schema: ResponseSchema<T>): T {
    try {
      return schema.parse(value);
    } catch (cause) {
      throw new BridgeClientError(
        "INVALID_REQUEST",
        "The bridge request is invalid.",
        { cause },
      );
    }
  }

  private async refreshAuthOnce() {
    if (this.refreshInFlight) return this.refreshInFlight;

    let refreshPromise: Promise<boolean>;
    refreshPromise = Promise.resolve()
      .then(() => this.refreshAuth())
      .then((refreshed) => {
        if (refreshed) {
          this.operationalCounters.session_renewed += 1;
          try {
            this.onOperationalEvent?.("session_renewed");
          } catch {
            // Telemetry callbacks must never change request semantics.
          }
        }
        return refreshed;
      })
      .finally(() => {
        if (this.refreshInFlight === refreshPromise) {
          this.refreshInFlight = null;
        }
      });
    this.refreshInFlight = refreshPromise;
    return refreshPromise;
  }

  private recordOperationalError(error: BridgeClientError) {
    if (
      error.code === "RATE_LIMITED" ||
      error.code === "IDEMPOTENCY_CONFLICT"
    ) {
      const counter =
        error.code === "RATE_LIMITED" ? "rate_limited" : "idempotency_conflict";
      this.operationalCounters[counter] += 1;
    }
  }

  private recordTerminalResponse(body: unknown) {
    if (!body || typeof body !== "object") return;
    const job = (body as { job?: unknown }).job;
    if (!job || typeof job !== "object") return;
    const state = (job as { state?: unknown }).state;
    const jobId = (job as { id?: unknown }).id;
    if (typeof state !== "string" || typeof jobId !== "string") {
      return;
    }
    const counter =
      terminalCounterByState[state as keyof typeof terminalCounterByState];
    if (!counter) return;
    if (this.observedTerminalJobs.has(jobId)) return;
    if (this.observedTerminalJobs.size >= 1_024) {
      const oldest = this.observedTerminalJobs.values().next().value;
      if (oldest) this.observedTerminalJobs.delete(oldest);
    }
    this.observedTerminalJobs.add(jobId);
    this.operationalCounters[counter] += 1;
  }

  private requireOpaqueId(value: string) {
    if (!isBridgeV1OpaqueId(value)) {
      throw new BridgeClientError(
        "INVALID_REQUEST",
        "The bridge resource identity is invalid.",
      );
    }
    return value;
  }
}

const bridgeClients = new Map<string, BridgeClient>();

export function getBridgeClient(baseUrl: string) {
  const normalized = normalizeBaseUrl(baseUrl);
  const existing = bridgeClients.get(normalized);
  if (existing) return existing;
  const client = new BridgeClient({ baseUrl: normalized });
  bridgeClients.set(normalized, client);
  return client;
}

export function __resetBridgeClientsForTests() {
  bridgeClients.clear();
}
