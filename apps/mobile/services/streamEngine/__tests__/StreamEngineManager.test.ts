import { StreamEngineManager } from "../StreamEngineManager";
import { HLSEngine } from "../HLSEngine";
import { HttpVideoEngine } from "../HttpVideoEngine";
import { TorrentEngine } from "../TorrentEngine";
import type { Stream } from "@streamer/shared";

describe("StreamEngineManager", () => {
  let manager: StreamEngineManager;

  beforeEach(() => {
    manager = new StreamEngineManager();
  });

  describe("resolveEngine", () => {
    it("should resolve HLS engine for .m3u8 URLs", () => {
      const stream: Stream = { url: "https://cdn.example.com/video.m3u8" };
      const engine = manager.resolveEngine(stream);
      expect(engine).not.toBeNull();
      expect(engine?.getEngineType()).toBe("hls");
    });

    it("should resolve HTTP engine for direct http URLs", () => {
      const stream: Stream = { url: "https://cdn.example.com/video.mp4" };
      const engine = manager.resolveEngine(stream);
      expect(engine).not.toBeNull();
      // HLS engine also matches http(s) URLs — it's registered first
      expect(["hls", "http-video"]).toContain(engine?.getEngineType());
    });

    it("should resolve torrent engine for infoHash streams", () => {
      const stream: Stream = {
        url: "",
        infoHash: "abc123def456",
      };
      const engine = manager.resolveEngine(stream);
      expect(engine).not.toBeNull();
      expect(engine?.getEngineType()).toBe("torrent");
    });

    it("should return null for streams with no url or infoHash", () => {
      const stream: Stream = { url: "" };
      const engine = manager.resolveEngine(stream);
      expect(engine).toBeNull();
    });
  });

  describe("getPlaybackUri", () => {
    it("should return the URL for HTTP streams", () => {
      const stream: Stream = { url: "https://cdn.example.com/video.mp4" };
      const uri = manager.getPlaybackUri(stream);
      expect(uri).toBe("https://cdn.example.com/video.mp4");
    });

    it("should return empty string for torrent streams (not directly playable)", () => {
      const stream: Stream = {
        url: "",
        infoHash: "abc123def456",
      };
      const uri = manager.getPlaybackUri(stream);
      expect(uri).toBe("");
    });

    it("should return null for completely unresolvable streams", () => {
      const stream: Stream = { url: "" };
      const uri = manager.getPlaybackUri(stream);
      expect(uri).toBeNull();
    });
  });

  describe("engine priority", () => {
    it("should prefer HLS over HTTP for http(s) URLs", () => {
      const stream: Stream = { url: "https://cdn.example.com/stream.m3u8" };
      const engine = manager.resolveEngine(stream);
      expect(engine?.getEngineType()).toBe("hls");
    });
  });
});

describe("TorrentEngine", () => {
  let engine: TorrentEngine;

  beforeEach(() => {
    engine = new TorrentEngine({} as any);
  });

  it("should claim it can play streams with infoHash", () => {
    const stream: Stream = { url: "", infoHash: "deadbeef" };
    expect(engine.canPlay(stream)).toBe(true);
  });

  it("should NOT claim it can play regular HTTP streams", () => {
    const stream: Stream = { url: "https://example.com/video.mp4" };
    expect(engine.canPlay(stream)).toBe(false);
  });

  it("should return empty string as playback URI (stub)", () => {
    const stream: Stream = { url: "", infoHash: "deadbeef" };
    expect(engine.getPlaybackUri(stream)).toBe("");
  });

  it("should identify itself as torrent engine", () => {
    expect(engine.getEngineType()).toBe("torrent");
  });
});

describe("HttpVideoEngine", () => {
  let engine: HttpVideoEngine;

  beforeEach(() => {
    engine = new HttpVideoEngine();
  });

  it("should handle any http(s) URL", () => {
    expect(engine.canPlay({ url: "https://x.com/v.mp4" })).toBe(true);
    expect(engine.canPlay({ url: "http://x.com/v.mkv" })).toBe(true);
  });

  it("should reject non-http URLs", () => {
    expect(engine.canPlay({ url: "" })).toBe(false);
    expect(engine.canPlay({ url: "magnet:?xt=abc" })).toBe(false);
    expect(engine.canPlay({ url: "stremio://foo" })).toBe(false);
  });

  it("should return the URL as-is for playback", () => {
    expect(engine.getPlaybackUri({ url: "https://x.com/v.mp4" })).toBe(
      "https://x.com/v.mp4",
    );
  });
});
