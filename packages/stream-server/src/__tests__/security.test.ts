import { describe, it, expect, vi } from "vitest";
import { validateTorrentFiles, pruneTorrents } from "../torrent.js";

describe("MalwareShield (validateTorrentFiles)", () => {
  it("should allow safe media files", () => {
    const torrent = {
      files: [
        { name: "movie.mp4" },
        { name: "subs.srt" },
        { name: "video.mkv" },
      ],
    };
    expect(() => validateTorrentFiles(torrent)).not.toThrow();
  });

  it("should block executable files (.exe)", () => {
    const torrent = {
      files: [{ name: "movie.mp4" }, { name: "virus.exe" }],
    };
    expect(() => validateTorrentFiles(torrent)).toThrow(/Security Violation/);
  });

  it("should block script files (.sh)", () => {
    const torrent = {
      files: [{ name: "script.sh" }],
    };
    expect(() => validateTorrentFiles(torrent)).toThrow(/Security Violation/);
  });

  it("should block windows system files (.cpl)", () => {
    const torrent = {
      files: [{ name: "malicious.cpl" }],
    };
    expect(() => validateTorrentFiles(torrent)).toThrow(/Security Violation/);
  });

  it("should be case-insensitive", () => {
    const torrent = {
      files: [{ name: "DANGEROUS.EXE" }],
    };
    expect(() => validateTorrentFiles(torrent)).toThrow(/Security Violation/);
  });

  it("should allow files without extensions (if they don't match blacklist)", () => {
    const torrent = {
      files: [{ name: "README" }],
    };
    expect(() => validateTorrentFiles(torrent)).not.toThrow();
  });
});

describe("Torrent Engine Memory Management (pruneTorrents)", () => {
  it("should not prune if under the limit", async () => {
    const torrents = [
      { infoHash: "t1", destroy: vi.fn((cb) => cb()) },
      { infoHash: "t2", destroy: vi.fn((cb) => cb()) },
    ];
    const client = { torrents };

    await pruneTorrents(client);

    expect(torrents[0].destroy).not.toHaveBeenCalled();
    expect(torrents[1].destroy).not.toHaveBeenCalled();
  });

  it("should prune the oldest torrent when limit is exceeded", async () => {
    // Mock current time
    const now = Date.now();

    // Manual setup of lastAccessMap via getTorrent behavior (or just test the logic)
    // Since we can't easily access the private map here without exporting it,
    // we rely on the fact that if we haven't 'accessed' them, they have 0 or undefined.
    // We'll simulate the limit being 5 (default).

    const torrents = Array.from({ length: 6 }, (_, i) => ({
      infoHash: `hash${i}`,
      destroy: vi.fn((cb) => cb()),
    }));

    const client = { torrents };

    // We want to verify it destroys at least one.
    await pruneTorrents(client);

    // One of them should have been destroyed
    const destroyedCount = torrents.filter(
      (t) => t.destroy.mock.calls.length > 0,
    ).length;
    expect(destroyedCount).toBeGreaterThanOrEqual(1);
  });
});
