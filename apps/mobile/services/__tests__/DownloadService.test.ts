import type { Stream } from "@streamer/shared";
import {
  getDownloadEligibility,
  mapDesktopDownloadStatus,
} from "../DownloadService";
import { streamEngineManager } from "../streamEngine/StreamEngineManager";

describe("getDownloadEligibility", () => {
  beforeEach(() => {
    streamEngineManager.bridgeAvailable = false;
    streamEngineManager.bridgeStatus = "unreachable";
  });

  it("does not mark HLS streams offline-playable", () => {
    const stream: Stream = { url: "https://example.test/live/master.m3u8" };

    expect(getDownloadEligibility(stream)).toMatchObject({
      mode: "unsupported",
      canDownload: false,
      offlinePlayable: false,
    });
  });

  it("requires the desktop bridge for torrent downloads", () => {
    const stream: Stream = { infoHash: "abc123" };

    expect(getDownloadEligibility(stream)).toMatchObject({
      mode: "bridge-torrent",
      canDownload: false,
      offlinePlayable: false,
    });

    streamEngineManager.bridgeAvailable = true;
    streamEngineManager.bridgeStatus = "available";

    expect(getDownloadEligibility(stream)).toMatchObject({
      mode: "bridge-torrent",
      canDownload: true,
      offlinePlayable: true,
    });
  });

  it("treats browser external sources as non-offline downloads", () => {
    const stream: Stream = { externalUrl: "https://example.test/file.mp4" };

    expect(getDownloadEligibility(stream)).toMatchObject({
      mode: "browser-external",
      offlinePlayable: false,
    });
  });

  it("maps desktop download job statuses to mobile queue statuses", () => {
    expect(mapDesktopDownloadStatus("Pending")).toBe("Downloading");
    expect(mapDesktopDownloadStatus("Downloading")).toBe("Downloading");
    expect(mapDesktopDownloadStatus("Paused")).toBe("Paused");
    expect(mapDesktopDownloadStatus("Completed")).toBe("Completed");
    expect(mapDesktopDownloadStatus("Error")).toBe("Error");
    expect(mapDesktopDownloadStatus("Canceled")).toBe("Error");
  });
});
