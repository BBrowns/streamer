import { castService } from "../CastService";
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
});
