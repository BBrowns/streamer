import { castService, CastServiceError } from "../CastService";
import { useAuthStore } from "../../stores/authStore";
import { streamEngineManager } from "../streamEngine/StreamEngineManager";
import { Platform } from "react-native";

describe("CastService", () => {
  beforeEach(() => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "web",
    });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { id: "living-room", name: "Living Room", type: "chromecast" },
      ],
    }) as jest.Mock;
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
    jest.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => JSON.stringify({ error: "Device not found" }),
    } as Response);

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
    jest.mocked(global.fetch).mockRejectedValueOnce(new Error("fetch failed"));

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
    jest.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        currentTime: 42,
        duration: 120,
        isPaused: false,
        playerState: "PLAYING",
      }),
    } as Response);

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
});
