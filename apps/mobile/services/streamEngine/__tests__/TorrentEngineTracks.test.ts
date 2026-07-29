import { useAuthStore } from "../../../stores/authStore";
import { TorrentEngine } from "../TorrentEngine";

jest.mock("../../api", () => ({
  api: {
    get: jest.fn(),
  },
}));

const bridge = {
  activeStrategy: "local",
  bridgeAvailable: true,
  bridgeStatus: "available",
  bridgeUrl: "http://bridge.test",
};

function jsonResponse(data: unknown, headers: Record<string, string> = {}) {
  return {
    ok: true,
    status: 200,
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    },
    json: async () => data,
    text: async () => String(data),
  };
}

function binaryResponse(
  data: Uint8Array,
  headers: Record<string, string> = {},
) {
  return {
    ok: true,
    status: 200,
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    },
    arrayBuffer: async () =>
      data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
  };
}

describe("TorrentEngine track catalog", () => {
  let engine: TorrentEngine;

  beforeEach(() => {
    global.fetch = jest.fn() as any;
    useAuthStore.setState({ streamServerToken: "pairing-token" });
    engine = new TorrentEngine(bridge);
    (engine as any).activeGatewayJob = {
      bridgeUrl: bridge.bridgeUrl,
      id: "job-1",
      generation: 1,
    };
  });

  afterEach(() => {
    engine.stop();
    useAuthStore.setState({ streamServerToken: null });
  });

  it("maps the authenticated URL-free gateway catalog", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse({
        jobId: "job-1",
        selectedFileIndex: 2,
        tracks: [
          {
            id: "audio:1",
            streamIndex: 1,
            kind: "audio",
            language: "en",
            title: "English",
            codec: "eac3",
            channelCount: 6,
            channelLayout: "5.1",
            default: true,
            forced: false,
            hearingImpaired: false,
            audioDescription: false,
            commentary: false,
            source: "embedded",
            supported: true,
          },
        ],
        subtitles: [
          {
            id: "torrent-file:3",
            language: "nl",
            format: "srt",
            source: "torrent-file",
            label: "Nederlands",
            hearingImpaired: false,
            forced: false,
            fileHashMatch: false,
            fileNameMatch: true,
            contentIdMatch: false,
            confidence: 0.85,
            active: false,
            fetchIdentity: "external:3",
          },
        ],
      }),
    );

    await engine.refreshTrackCatalog();

    expect(global.fetch).toHaveBeenCalledWith(
      "http://bridge.test/api/gateway/jobs/job-1/tracks",
      expect.objectContaining({
        headers: { Authorization: "Bearer pairing-token" },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(engine.getAudioTracks()).toEqual([
      expect.objectContaining({
        id: "audio:1",
        label: "English",
        codec: "eac3",
        channelCount: 6,
        active: true,
      }),
    ]);
    expect(engine.getSubtitles()).toEqual([
      expect.objectContaining({
        id: "torrent-file:3",
        language: "nl",
        format: "srt",
        fetchIdentity: "external:3",
      }),
    ]);
    expect(JSON.stringify(engine.getSubtitles())).not.toMatch(
      /magnet:|playbackUrl|streamURL|btih/i,
    );
  });

  it("loads normalized WebVTT and aborts a stale document request", async () => {
    (engine as any).subtitleTracks = [
      {
        id: "torrent-file:3",
        label: "Nederlands",
        language: "nl",
        active: false,
        source: "torrent-file",
        format: "srt",
        fetchIdentity: "external:3",
      },
    ];
    let firstSignal: AbortSignal | undefined;
    (global.fetch as jest.Mock)
      .mockImplementationOnce(
        (_url: string, options: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            firstSignal = options.signal;
            options.signal.addEventListener(
              "abort",
              () =>
                reject(
                  Object.assign(new Error("aborted"), { name: "AbortError" }),
                ),
              { once: true },
            );
          }),
      )
      .mockResolvedValueOnce(
        jsonResponse("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHallo"),
      );

    const stale = engine.loadSubtitleDocument("torrent-file:3");
    await Promise.resolve();
    const current = engine.loadSubtitleDocument("torrent-file:3");

    await expect(stale).rejects.toMatchObject({ name: "AbortError" });
    expect(firstSignal?.aborted).toBe(true);
    await expect(current).resolves.toMatch(/^WEBVTT/);
    expect(global.fetch).toHaveBeenLastCalledWith(
      "http://bridge.test/api/gateway/jobs/job-1/subtitles/external%3A3",
      expect.objectContaining({
        headers: { Authorization: "Bearer pairing-token" },
      }),
    );
  });

  it("aborts active catalog work on stop", async () => {
    let catalogSignal: AbortSignal | undefined;
    (global.fetch as jest.Mock).mockImplementationOnce(
      (_url: string, options: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          catalogSignal = options.signal;
          options.signal.addEventListener(
            "abort",
            () =>
              reject(
                Object.assign(new Error("aborted"), { name: "AbortError" }),
              ),
            { once: true },
          );
        }),
    );

    const pending = engine.refreshTrackCatalog();
    await Promise.resolve();
    engine.stop();

    expect(catalogSignal?.aborted).toBe(true);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("loads an authenticated JPEG from the active job's fixed thumbnail bucket", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      binaryResponse(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
        "content-type": "image/jpeg",
        "content-length": "4",
      }),
    );

    await expect(engine.getThumbnail(24)).resolves.toEqual({
      uri: "data:image/jpeg;base64,/9j/2Q==",
    });
    expect(global.fetch).toHaveBeenCalledWith(
      "http://bridge.test/api/gateway/jobs/job-1/thumbnails/2",
      expect.objectContaining({
        headers: { Authorization: "Bearer pairing-token" },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("rejects oversized thumbnail responses before reading their body", async () => {
    const arrayBuffer = jest.fn();
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: {
        get: (name: string) =>
          name.toLowerCase() === "content-type"
            ? "image/jpeg"
            : String(512 * 1024 + 1),
      },
      arrayBuffer,
    });

    await expect(engine.getThumbnail(20)).rejects.toThrow(
      "Thumbnail exceeded its size limit",
    );
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it("aborts an obsolete thumbnail request when a new bucket is requested", async () => {
    let staleSignal: AbortSignal | undefined;
    (global.fetch as jest.Mock)
      .mockImplementationOnce(
        (_url: string, options: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            staleSignal = options.signal;
            options.signal.addEventListener(
              "abort",
              () =>
                reject(
                  Object.assign(new Error("aborted"), { name: "AbortError" }),
                ),
              { once: true },
            );
          }),
      )
      .mockResolvedValueOnce(
        binaryResponse(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
          "content-type": "image/jpeg",
        }),
      );

    const stale = engine.getThumbnail(10);
    await Promise.resolve();
    const current = engine.getThumbnail(20);

    await expect(stale).rejects.toMatchObject({ name: "AbortError" });
    expect(staleSignal?.aborted).toBe(true);
    await expect(current).resolves.toEqual({
      uri: "data:image/jpeg;base64,/9j/2Q==",
    });
  });
});
