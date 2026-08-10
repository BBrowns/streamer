import { BridgeClient, BridgeClientError } from "../BridgeClient";

const HELLO = {
  protocol: {
    name: "streamer-bridge",
    current: 1,
    supported: [1],
  },
  serviceVersion: "1.0.0",
  auth: {
    required: true,
    methods: ["bearer", "x-streamer-bridge-token"],
  },
};
const JOB_ID = "11111111-1111-4111-8111-111111111111";
const DOCUMENT_ID = "22222222-2222-4222-8222-222222222222";

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function binaryResponse(options: {
  contentType: string;
  text?: string;
  bytes?: Uint8Array;
  contentLength?: number | string | null;
}): Response {
  const bytes = options.bytes ?? new Uint8Array();
  const length =
    options.contentLength === undefined
      ? (options.text?.length ?? bytes.length)
      : options.contentLength;
  return {
    ok: true,
    status: 200,
    headers: {
      get: (name: string) => {
        if (name.toLowerCase() === "content-type") return options.contentType;
        if (name.toLowerCase() === "content-length") {
          return length === null ? null : String(length);
        }
        return null;
      },
    },
    text: jest.fn().mockResolvedValue(options.text ?? ""),
    arrayBuffer: jest
      .fn()
      .mockResolvedValue(
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
      ),
  } as unknown as Response;
}

describe("BridgeClient protocol negotiation", () => {
  it.each([
    "http://user:pass@bridge.test:11470",
    "http://bridge.test:11470?token=source",
    "http://bridge.test:11470#fragment",
  ])("rejects unsafe bridge base URL components: %s", (baseUrl) => {
    const fetchImpl = jest.fn();

    expect(() => new BridgeClient({ baseUrl, fetchImpl })).toThrow(
      expect.objectContaining({ code: "INVALID_REQUEST" }),
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("uses only the configured bridge origin and rejects hello redirects", async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new TypeError("redirect"));
    const client = new BridgeClient({
      baseUrl: "http://bridge.test:11470/nested/path",
      fetchImpl,
    });

    await expect(client.negotiate()).rejects.toMatchObject({
      code: "BRIDGE_UNREACHABLE",
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://bridge.test:11470/api/bridge/v1/hello",
      expect.objectContaining({ redirect: "error" }),
    );
  });

  it.each([404, 501])(
    "falls back to legacy only when v1 is absent with HTTP %s",
    async (status) => {
      const fetchImpl = jest.fn().mockResolvedValue(response(status, {}));
      const client = new BridgeClient({
        baseUrl: "http://bridge.test:11470",
        fetchImpl,
      });

      await expect(client.negotiate()).resolves.toEqual({ kind: "legacy" });
    },
  );

  it("falls back for the explicit protocol unsupported code", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      response(400, {
        protocolVersion: 1,
        error: {
          code: "PROTOCOL_UNSUPPORTED",
          message: "Protocol v1 is unsupported.",
          retryable: false,
        },
      }),
    );
    const client = new BridgeClient({
      baseUrl: "http://bridge.test:11470",
      fetchImpl,
    });

    await expect(client.negotiate()).resolves.toEqual({ kind: "legacy" });
  });

  it.each([401, 403, 500])(
    "does not hide bridge failures behind legacy fallback for HTTP %s",
    async (status) => {
      const fetchImpl = jest.fn().mockResolvedValue(
        response(status, {
          protocolVersion: 1,
          error: {
            code: status === 401 ? "AUTH_REQUIRED" : "INTERNAL",
            message: "Bridge request failed.",
            retryable: status === 500,
          },
        }),
      );
      const client = new BridgeClient({
        baseUrl: "http://bridge.test:11470",
        fetchImpl,
      });

      await expect(client.negotiate()).rejects.toBeInstanceOf(
        BridgeClientError,
      );
    },
  );

  it("rejects malformed successful hello responses", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(
        response(200, { ...HELLO, leakedPath: "/private/runtime" }),
      );
    const client = new BridgeClient({
      baseUrl: "http://bridge.test:11470",
      fetchImpl,
    });

    await expect(client.negotiate()).rejects.toMatchObject({
      code: "BRIDGE_RESPONSE_INVALID",
    });
  });

  it("strictly parses authenticated v1 responses and forwards abort signals", async () => {
    const controller = new AbortController();
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(response(200, HELLO))
      .mockResolvedValueOnce(
        response(200, {
          protocolVersion: 1,
          devices: [],
        }),
      );
    const client = new BridgeClient({
      baseUrl: "http://bridge.test:11470",
      fetchImpl,
      authHeaders: () => ({ Authorization: "Bearer scoped-token" }),
    });

    await expect(client.getCastDevices(controller.signal)).resolves.toEqual({
      protocolVersion: 1,
      devices: [],
    });
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "http://bridge.test:11470/api/bridge/v1/cast/devices",
      expect.objectContaining({
        headers: { Authorization: "Bearer scoped-token" },
        redirect: "error",
        signal: controller.signal,
      }),
    );
  });

  it("does not follow an authenticated request redirect with a bridge token", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(response(200, HELLO))
      .mockRejectedValueOnce(new TypeError("redirect"));
    const client = new BridgeClient({
      baseUrl: "http://bridge.test:11470",
      fetchImpl,
      authHeaders: () => ({
        "X-Streamer-Bridge-Token": "scoped-token",
      }),
    });

    await expect(client.getJob(JOB_ID)).rejects.toMatchObject({
      code: "BRIDGE_UNREACHABLE",
    });
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      `http://bridge.test:11470/api/bridge/v1/jobs/${JOB_ID}`,
      expect.objectContaining({
        headers: { "X-Streamer-Bridge-Token": "scoped-token" },
        redirect: "error",
      }),
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("rejects unknown fields in v1 endpoint responses", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(response(200, HELLO))
      .mockResolvedValueOnce(
        response(200, {
          protocolVersion: 1,
          devices: [],
          host: "192.168.1.25",
        }),
      );
    const client = new BridgeClient({
      baseUrl: "http://bridge.test:11470",
      fetchImpl,
    });

    await expect(client.getCastDevices()).rejects.toMatchObject({
      code: "BRIDGE_RESPONSE_INVALID",
    });
  });

  it("preserves abort cancellation instead of reporting bridge reachability", async () => {
    const controller = new AbortController();
    const abortError = Object.assign(new Error("cancelled"), {
      name: "AbortError",
    });
    const fetchImpl = jest.fn().mockImplementation(async () => {
      controller.abort(abortError);
      throw abortError;
    });
    const client = new BridgeClient({
      baseUrl: "http://bridge.test:11470",
      fetchImpl,
    });

    await expect(client.negotiate(controller.signal)).rejects.toBe(abortError);
  });

  it("rotates an expired desktop session once and retries the v1 request", async () => {
    let token = "expired-session";
    const refreshAuth = jest.fn(async () => {
      token = "rotated-session";
      return true;
    });
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(response(200, HELLO))
      .mockResolvedValueOnce(
        response(401, {
          protocolVersion: 1,
          error: {
            code: "AUTH_REQUIRED",
            message: "Bridge authentication is required.",
            retryable: false,
          },
        }),
      )
      .mockResolvedValueOnce(
        response(200, { protocolVersion: 1, devices: [] }),
      );
    const client = new BridgeClient({
      baseUrl: "http://bridge.test:11470",
      fetchImpl,
      authHeaders: () => ({ Authorization: `Bearer ${token}` }),
      refreshAuth,
    });

    await expect(client.getCastDevices()).resolves.toEqual({
      protocolVersion: 1,
      devices: [],
    });
    expect(refreshAuth).toHaveBeenCalledTimes(1);
    const retryHeaders = fetchImpl.mock.calls[2]?.[1]?.headers as Headers;
    expect(retryHeaders.get("Authorization")).toBe("Bearer rotated-session");
    expect(fetchImpl.mock.calls[2]?.[1]).toEqual(
      expect.objectContaining({ redirect: "error" }),
    );
  });

  it("does not rotate credentials for a genuine scope failure", async () => {
    const refreshAuth = jest.fn().mockResolvedValue(true);
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(response(200, HELLO))
      .mockResolvedValueOnce(
        response(403, {
          protocolVersion: 1,
          error: {
            code: "FORBIDDEN",
            message: "The bridge access token does not grant this scope.",
            retryable: false,
          },
        }),
      );
    const client = new BridgeClient({
      baseUrl: "http://bridge.test:11470",
      fetchImpl,
      refreshAuth,
    });

    await expect(client.getCastDevices()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(refreshAuth).not.toHaveBeenCalled();
  });

  it("loads bounded authenticated subtitle and thumbnail bodies", async () => {
    const subtitle = "WEBVTT\n\n";
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(response(200, HELLO))
      .mockResolvedValueOnce(
        binaryResponse({
          contentType: "text/vtt; charset=utf-8",
          text: subtitle,
        }),
      )
      .mockResolvedValueOnce(
        binaryResponse({ contentType: "image/jpeg", bytes: jpeg }),
      );
    const client = new BridgeClient({
      baseUrl: "http://bridge.test:11470",
      fetchImpl,
      authHeaders: () => ({ Authorization: "Bearer scoped-token" }),
    });

    await expect(
      client.getSubtitleDocument(JOB_ID, DOCUMENT_ID, { maxBytes: 1024 }),
    ).resolves.toBe(subtitle);
    await expect(
      client.getThumbnail(JOB_ID, 3, { maxBytes: 1024 }),
    ).resolves.toEqual(jpeg);

    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      `http://bridge.test:11470/api/bridge/v1/jobs/${JOB_ID}/subtitles/${DOCUMENT_ID}`,
      expect.objectContaining({
        headers: { Authorization: "Bearer scoped-token" },
        redirect: "error",
      }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      3,
      `http://bridge.test:11470/api/bridge/v1/jobs/${JOB_ID}/thumbnails/3`,
      expect.objectContaining({
        headers: { Authorization: "Bearer scoped-token" },
        redirect: "error",
      }),
    );
  });

  it("rejects missing or malformed binary lengths before reading bodies", async () => {
    const missingLength = binaryResponse({
      contentType: "text/vtt",
      text: "WEBVTT\n\n",
      contentLength: null,
    });
    const malformedLength = binaryResponse({
      contentType: "image/jpeg",
      bytes: new Uint8Array([0xff, 0xd8]),
      contentLength: "1e6",
    });
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(response(200, HELLO))
      .mockResolvedValueOnce(missingLength)
      .mockResolvedValueOnce(malformedLength);
    const client = new BridgeClient({
      baseUrl: "http://bridge.test:11470",
      fetchImpl,
    });

    await expect(
      client.getSubtitleDocument(JOB_ID, DOCUMENT_ID, { maxBytes: 1024 }),
    ).rejects.toMatchObject({ code: "BRIDGE_RESPONSE_INVALID" });
    expect(missingLength.text).not.toHaveBeenCalled();

    await expect(
      client.getThumbnail(JOB_ID, 0, { maxBytes: 1024 }),
    ).rejects.toMatchObject({ code: "BRIDGE_RESPONSE_INVALID" });
    expect(malformedLength.arrayBuffer).not.toHaveBeenCalled();
  });

  it("rejects invalid opaque identities and oversized binary responses", async () => {
    const oversized = binaryResponse({
      contentType: "text/vtt",
      text: "WEBVTT\n\n",
      contentLength: 2_048,
    });
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(response(200, HELLO))
      .mockResolvedValueOnce(oversized);
    const client = new BridgeClient({
      baseUrl: "http://bridge.test:11470",
      fetchImpl,
    });

    await expect(
      client.getSubtitleDocument("../source", DOCUMENT_ID, { maxBytes: 1024 }),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(fetchImpl).not.toHaveBeenCalled();

    await expect(
      client.getSubtitleDocument(JOB_ID, DOCUMENT_ID, { maxBytes: 1024 }),
    ).rejects.toMatchObject({ code: "BRIDGE_RESPONSE_INVALID" });
    expect(oversized.text).not.toHaveBeenCalled();
  });

  it("does not refresh or retry authentication after cancellation", async () => {
    const controller = new AbortController();
    const cancelled = Object.assign(new Error("cancelled"), {
      name: "AbortError",
    });
    const refreshAuth = jest.fn().mockResolvedValue(true);
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(response(200, HELLO))
      .mockImplementationOnce(async () => {
        controller.abort(cancelled);
        return response(401, {
          protocolVersion: 1,
          error: {
            code: "AUTH_REQUIRED",
            message: "Bridge authentication is required.",
            retryable: false,
          },
        });
      });
    const client = new BridgeClient({
      baseUrl: "http://bridge.test:11470",
      fetchImpl,
      refreshAuth,
    });

    await expect(client.getJob(JOB_ID, controller.signal)).rejects.toBe(
      cancelled,
    );
    expect(refreshAuth).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
