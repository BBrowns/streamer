import * as Crypto from "expo-crypto";
import { castService, CastServiceError } from "../CastService";
import { useAuthStore } from "../../stores/authStore";
import { streamEngineManager } from "../streamEngine/StreamEngineManager";
import { Platform } from "react-native";
import { __resetBridgeClientsForTests } from "../bridge/BridgeClient";

jest.mock("expo-crypto", () => ({ randomUUID: jest.fn() }));

const REQUEST_ID = "00000000-0000-4000-8000-000000000101";
const DEVICE_ID = "00000000-0000-4000-8000-000000000102";
const JOB_ID = "00000000-0000-4000-8000-000000000103";
const BRIDGE_HELLO = {
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

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
    text: jest.fn().mockResolvedValue(JSON.stringify(body)),
  } as unknown as Response;
}

function installLegacyBridgeMock() {
  global.fetch = jest.fn(async (input) => {
    const url = String(input);
    if (url.endsWith("/api/bridge/v1/hello")) {
      return response(404, {});
    }
    if (url.endsWith("/api/cast/devices")) {
      return response(200, [
        { id: "living-room", name: "Living Room", type: "chromecast" },
      ]);
    }
    return response(200, { success: true });
  }) as jest.Mock;
}

describe("CastService", () => {
  beforeEach(() => {
    __resetBridgeClientsForTests();
    (castService as unknown as { __resetForTests(): void }).__resetForTests();
    jest.mocked(Crypto.randomUUID).mockReturnValue(REQUEST_ID);
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "web",
    });
    installLegacyBridgeMock();
    useAuthStore.setState({
      streamServerUrl: "http://192.168.1.25:11470",
      streamServerToken: null,
    });
    streamEngineManager.bridgeAvailable = true;
    streamEngineManager.bridgeStatus = "available";
  });

  it("uses the configured stream bridge URL for device discovery", async () => {
    await castService.getDevices();

    expect(global.fetch).toHaveBeenCalledWith(
      "http://192.168.1.25:11470/api/cast/devices",
    );
    expect(
      jest
        .mocked(global.fetch)
        .mock.calls.every(([url]) => !String(url).includes("localhost")),
    ).toBe(true);
  });

  it("reuses a short-lived device and capability snapshot until a refresh is requested", async () => {
    const first = await castService.getDevices();
    const callsAfterFirstDiscovery = jest.mocked(global.fetch).mock.calls
      .length;

    await expect(castService.getDevices()).resolves.toEqual(first);
    expect(jest.mocked(global.fetch).mock.calls).toHaveLength(
      callsAfterFirstDiscovery,
    );

    await castService.getDevices({ forceRefresh: true });
    expect(jest.mocked(global.fetch).mock.calls.length).toBeGreaterThan(
      callsAfterFirstDiscovery,
    );
  });

  it("does not reuse an authenticated snapshot across discovery calls", async () => {
    useAuthStore.setState({ streamServerToken: "scoped-pairing-token" });

    await castService.getDevices();
    const callsAfterFirstDiscovery = jest.mocked(global.fetch).mock.calls
      .length;

    await castService.getDevices();

    expect(jest.mocked(global.fetch).mock.calls.length).toBeGreaterThan(
      callsAfterFirstDiscovery,
    );
  });

  it("deep-clones supported codec hints returned from the runtime cache", async () => {
    global.fetch = jest.fn(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/bridge/v1/hello")) {
        return response(404, {});
      }
      if (url.endsWith("/api/cast/devices")) {
        return response(200, [
          {
            id: "living-room",
            name: "Living Room",
            type: "chromecast",
            capabilities: { supportedCodecs: ["h264"] },
          },
        ]);
      }
      return response(200, { success: true });
    }) as jest.Mock;

    const first = await castService.getDevices();
    first[0].capabilities?.supportedCodecs?.push("mutated-by-consumer");

    await expect(castService.getDevices()).resolves.toEqual([
      {
        id: "living-room",
        name: "Living Room",
        type: "chromecast",
        capabilities: { supportedCodecs: ["h264"] },
      },
    ]);
  });

  it("keeps a fresh force-refresh result when discovery completes out of order", async () => {
    const pendingDeviceResponses: Array<(value: Response) => void> = [];
    global.fetch = jest.fn((input) => {
      const url = String(input);
      if (url.endsWith("/api/bridge/v1/hello")) {
        return Promise.resolve(response(404, {}));
      }
      if (url.endsWith("/api/cast/devices")) {
        return new Promise<Response>((resolve) => {
          pendingDeviceResponses.push(resolve);
        });
      }
      return Promise.resolve(response(200, { success: true }));
    }) as jest.Mock;

    const firstDiscovery = castService.getDevices({ forceRefresh: true });
    const secondDiscovery = castService.getDevices({ forceRefresh: true });
    for (
      let attempt = 0;
      attempt < 20 && pendingDeviceResponses.length < 2;
      attempt += 1
    ) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(pendingDeviceResponses).toHaveLength(2);

    pendingDeviceResponses[1](
      response(200, [{ id: "fresh", name: "Living Room", type: "chromecast" }]),
    );
    await expect(secondDiscovery).resolves.toEqual([
      { id: "fresh", name: "Living Room", type: "chromecast" },
    ]);
    pendingDeviceResponses[0](
      response(200, [{ id: "stale", name: "Living Room", type: "chromecast" }]),
    );
    await firstDiscovery;

    await expect(castService.getDevices()).resolves.toEqual([
      { id: "fresh", name: "Living Room", type: "chromecast" },
    ]);
  });

  it("waits for the shared bridge probe before web device discovery", async () => {
    streamEngineManager.bridgeAvailable = false;
    streamEngineManager.bridgeStatus = "unreachable";

    await castService.getDevices();

    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      "http://192.168.1.25:11470/api/health",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      "http://192.168.1.25:11470/api/bridge/v1/hello",
      { redirect: "error", signal: undefined },
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      3,
      "http://192.168.1.25:11470/api/cast/devices",
    );
  });

  it("uses the configured stream bridge URL for playback", async () => {
    await castService.play(
      "living-room",
      "https://example.test/movie.mp4",
      "Movie",
    );

    expect(global.fetch).toHaveBeenCalledWith(
      "http://192.168.1.25:11470/api/cast/play",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          deviceId: "living-room",
          url: "https://example.test/movie.mp4",
          title: "Movie",
          contentType: "video/mp4",
        }),
      }),
    );
    expect(
      jest
        .mocked(global.fetch)
        .mock.calls.every(([url]) => !String(url).includes("localhost")),
    ).toBe(true);
  });

  it("allows a local web bridge to control a remote direct source", async () => {
    useAuthStore.setState({ streamServerUrl: "http://localhost:11470" });

    await castService.play(
      "living-room",
      "https://example.test/movie.mp4",
      "Movie",
    );

    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:11470/api/cast/play",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("sends the optional bridge auth token to protected bridge endpoints", async () => {
    useAuthStore.setState({ streamServerToken: "pairing-token" });

    await castService.play(
      "living-room",
      "https://example.test/movie.mp4",
      "Movie",
    );

    expect(global.fetch).toHaveBeenCalledWith(
      "http://192.168.1.25:11470/api/cast/play",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer pairing-token",
        }),
      }),
    );
  });

  it("rejects localhost-only playback URLs before sending a cast request", async () => {
    const localhostUrls = [
      "http://localhost:11470/api/gateway/jobs/current/stream",
      "http://127.0.0.1:11470/movie.mp4",
      "http://[::1]:11470/movie.mp4",
      "http://bridge.localhost:11470/movie.mp4",
    ];

    for (const url of localhostUrls) {
      await expect(
        castService.play("living-room", url, "Movie"),
      ).rejects.toThrow(
        "The cast device cannot access a source that only exists on localhost.",
      );
    }

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("does not send cast requests to an untrusted public bridge URL", async () => {
    useAuthStore.setState({
      streamServerUrl: "https://bridge.example.com",
    });

    await expect(castService.getDevices()).rejects.toThrow(
      "The desktop bridge URL is invalid. Check Sources & Devices.",
    );

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns a typed recovery error when device discovery cannot reach the bridge", async () => {
    jest.mocked(global.fetch).mockRejectedValueOnce(new Error("fetch failed"));

    await expect(castService.getDevices()).rejects.toMatchObject({
      name: "CastServiceError",
      code: "CAST_DEVICES_UNREACHABLE",
    });
  });

  it("returns a typed recovery error when a selected device disappeared", async () => {
    jest
      .mocked(global.fetch)
      .mockResolvedValueOnce(response(404, {}))
      .mockResolvedValueOnce(response(404, { error: "Device not found" }));

    await expect(
      castService.play(
        "living-room",
        "https://example.test/movie.mp4",
        "Movie",
      ),
    ).rejects.toEqual(
      expect.objectContaining<Partial<CastServiceError>>({
        code: "CAST_DEVICE_UNREACHABLE",
        status: 404,
      }),
    );
  });

  it("returns a typed recovery error when cast control loses the device", async () => {
    jest
      .mocked(global.fetch)
      .mockResolvedValueOnce(response(404, {}))
      .mockRejectedValueOnce(new Error("fetch failed"));

    await expect(
      castService.control("living-room", "pause"),
    ).rejects.toMatchObject({
      name: "CastServiceError",
      code: "CAST_DEVICE_UNREACHABLE",
    });
  });

  it("sends seek positions through the configured bridge", async () => {
    await castService.control("living-room", "seek", 84);

    expect(global.fetch).toHaveBeenCalledWith(
      "http://192.168.1.25:11470/api/cast/control",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          deviceId: "living-room",
          action: "seek",
          position: 84,
        }),
      }),
    );
  });

  it("loads normalized playback status from the selected display", async () => {
    jest
      .mocked(global.fetch)
      .mockResolvedValueOnce(response(404, {}))
      .mockResolvedValueOnce(
        response(200, {
          currentTime: 42,
          duration: 120,
          isPaused: false,
          playerState: "PLAYING",
        }),
      );

    await expect(castService.getStatus("living-room:8009")).resolves.toEqual({
      currentTime: 42,
      duration: 120,
      isPaused: false,
      playerState: "PLAYING",
    });
    expect(global.fetch).toHaveBeenCalledWith(
      "http://192.168.1.25:11470/api/cast/status/living-room%3A8009",
      { headers: {} },
    );
  });

  it("uses strict bridge v1 device discovery when available", async () => {
    jest
      .mocked(global.fetch)
      .mockResolvedValueOnce(response(200, BRIDGE_HELLO))
      .mockResolvedValueOnce(
        response(200, {
          protocolVersion: 1,
          devices: [{ id: DEVICE_ID, name: "Living Room", type: "chromecast" }],
        }),
      );

    await expect(castService.getDevices()).resolves.toEqual([
      { id: DEVICE_ID, name: "Living Room", type: "chromecast" },
    ]);
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      "http://192.168.1.25:11470/api/bridge/v1/cast/devices",
      expect.objectContaining({ headers: {} }),
    );
    expect(
      jest
        .mocked(global.fetch)
        .mock.calls.some(([url]) => String(url).endsWith("/api/cast/devices")),
    ).toBe(false);
  });

  it("prefers an opaque bridge-job cast source over forwarding a signed URL", async () => {
    jest
      .mocked(global.fetch)
      .mockResolvedValueOnce(response(200, BRIDGE_HELLO))
      .mockResolvedValueOnce(
        response(200, { protocolVersion: 1, success: true }),
      );

    await castService.play(
      DEVICE_ID,
      `http://192.168.1.25:11470/api/bridge/v1/jobs/${JOB_ID}/stream?expires=1&signature=secret`,
      "Movie",
    );

    const request = jest.mocked(global.fetch).mock.calls[1];
    expect(request[0]).toBe(
      "http://192.168.1.25:11470/api/bridge/v1/cast/play",
    );
    expect(JSON.parse(String((request[1] as RequestInit).body))).toEqual({
      requestId: REQUEST_ID,
      deviceId: DEVICE_ID,
      source: { kind: "bridge-job", jobId: JOB_ID },
      title: "Movie",
    });
    expect(String((request[1] as RequestInit).body)).not.toContain("signature");
  });

  it("uses the prepared opaque job identity without deriving it from a runtime URL", async () => {
    jest
      .mocked(global.fetch)
      .mockResolvedValueOnce(response(200, BRIDGE_HELLO))
      .mockResolvedValueOnce(
        response(200, { protocolVersion: 1, success: true }),
      );

    await castService.play(
      DEVICE_ID,
      "https://runtime-location.example.test/movie.mp4?signature=secret",
      "Movie",
      "video/mp4",
      { bridgeJobId: JOB_ID },
    );

    const body = JSON.parse(
      String((jest.mocked(global.fetch).mock.calls[1][1] as RequestInit).body),
    );
    expect(body.source).toEqual({ kind: "bridge-job", jobId: JOB_ID });
    expect(JSON.stringify(body)).not.toContain("runtime-location");
    expect(JSON.stringify(body)).not.toContain("signature");
  });

  it("does not fall back to v0 after a v1 authorization failure", async () => {
    jest
      .mocked(global.fetch)
      .mockResolvedValueOnce(response(200, BRIDGE_HELLO))
      .mockResolvedValueOnce(
        response(401, {
          protocolVersion: 1,
          error: {
            code: "AUTH_REQUIRED",
            message: "Bridge authentication is required.",
            retryable: false,
          },
        }),
      );

    await expect(castService.getDevices()).rejects.toMatchObject({
      code: "CAST_BRIDGE_REJECTED",
      status: 401,
    });
    expect(
      jest
        .mocked(global.fetch)
        .mock.calls.some(([url]) => String(url).endsWith("/api/cast/devices")),
    ).toBe(false);
  });
});
