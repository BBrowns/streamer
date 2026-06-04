import { castService } from "../CastService";
import { useAuthStore } from "../../stores/authStore";
import { streamEngineManager } from "../streamEngine/StreamEngineManager";

describe("CastService", () => {
  beforeEach(() => {
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
});
