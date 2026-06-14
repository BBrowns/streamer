import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  utimes,
  writeFile,
} from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanupTorrentCache,
  getTorrentCacheStatus,
  resolveTorrentCacheConfig,
} from "../torrent-cache.js";

const previousCacheDir = process.env.STREAMER_TORRENT_CACHE_DIR;
const previousCacheMaxBytes = process.env.STREAMER_TORRENT_CACHE_MAX_BYTES;
const previousCacheTtlMs = process.env.STREAMER_TORRENT_CACHE_TTL_MS;

async function writeSizedFile(filePath: string, size: number, mtimeMs: number) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, Buffer.alloc(size, 1));
  const date = new Date(mtimeMs);
  await utimes(filePath, date, date);
  await utimes(path.dirname(filePath), date, date);
}

async function makeCacheRoot() {
  const root = await mkdtemp(path.join(tmpdir(), "streamer-cache-test-"));
  process.env.STREAMER_TORRENT_CACHE_DIR = root;
  return root;
}

describe("torrent cache hygiene", () => {
  afterEach(async () => {
    if (previousCacheDir === undefined) {
      delete process.env.STREAMER_TORRENT_CACHE_DIR;
    } else {
      process.env.STREAMER_TORRENT_CACHE_DIR = previousCacheDir;
    }

    if (previousCacheMaxBytes === undefined) {
      delete process.env.STREAMER_TORRENT_CACHE_MAX_BYTES;
    } else {
      process.env.STREAMER_TORRENT_CACHE_MAX_BYTES = previousCacheMaxBytes;
    }

    if (previousCacheTtlMs === undefined) {
      delete process.env.STREAMER_TORRENT_CACHE_TTL_MS;
    } else {
      process.env.STREAMER_TORRENT_CACHE_TTL_MS = previousCacheTtlMs;
    }
  });

  it("resolves an explicit app-owned cache directory and size cap", async () => {
    const root = await makeCacheRoot();
    process.env.STREAMER_TORRENT_CACHE_MAX_BYTES = "12345";

    const config = resolveTorrentCacheConfig();

    expect(config.rootDir).toBe(root);
    expect(config.maxBytes).toBe(12345);
    expect(config.rootDir).not.toContain("/private/tmp/webtorrent");
    await rm(root, { recursive: true, force: true });
  });

  it("removes stale cache files older than the configured TTL", async () => {
    const root = await makeCacheRoot();
    process.env.STREAMER_TORRENT_CACHE_TTL_MS = "1000";
    process.env.STREAMER_TORRENT_CACHE_MAX_BYTES = "1000000";
    const oldDir = path.join(root, "old-cache");
    const freshDir = path.join(root, "fresh-cache");
    await writeSizedFile(path.join(oldDir, "old.mkv"), 1024, Date.now() - 5000);
    await writeSizedFile(path.join(freshDir, "fresh.mkv"), 1024, Date.now());

    const result = await cleanupTorrentCache({ now: Date.now() });

    await expect(stat(oldDir)).rejects.toThrow();
    await expect(stat(freshDir)).resolves.toBeTruthy();
    expect(result.removedEntries).toBe(1);
    expect(result.freedBytes).toBeGreaterThanOrEqual(1024);
    await rm(root, { recursive: true, force: true });
  });

  it("evicts oldest inactive directories when the cache exceeds the size cap", async () => {
    const root = await makeCacheRoot();
    process.env.STREAMER_TORRENT_CACHE_TTL_MS = "1000000";
    process.env.STREAMER_TORRENT_CACHE_MAX_BYTES = "1500";
    const olderDir = path.join(root, "older-cache");
    const newerDir = path.join(root, "newer-cache");
    await writeSizedFile(
      path.join(olderDir, "older.mkv"),
      1024,
      Date.now() - 5000,
    );
    await writeSizedFile(
      path.join(newerDir, "newer.mkv"),
      1024,
      Date.now() - 1000,
    );

    const result = await cleanupTorrentCache({ now: Date.now() });

    await expect(stat(olderDir)).rejects.toThrow();
    await expect(stat(newerDir)).resolves.toBeTruthy();
    expect(result.removedEntries).toBe(1);
    expect(result.totalBytesAfter).toBeLessThanOrEqual(1500);
    await rm(root, { recursive: true, force: true });
  });

  it("does not remove active torrent directories", async () => {
    const root = await makeCacheRoot();
    process.env.STREAMER_TORRENT_CACHE_TTL_MS = "1000";
    process.env.STREAMER_TORRENT_CACHE_MAX_BYTES = "1";
    const activeDir = path.join(root, "active-cache");
    await writeSizedFile(
      path.join(activeDir, "active.mkv"),
      2048,
      Date.now() - 5000,
    );

    const result = await cleanupTorrentCache({
      activeDirs: new Set([activeDir]),
      now: Date.now(),
    });

    await expect(
      readFile(path.join(activeDir, "active.mkv")),
    ).resolves.toHaveLength(2048);
    expect(result.removedEntries).toBe(0);
    expect(result.totalBytesAfter).toBeGreaterThan(1);
    await rm(root, { recursive: true, force: true });
  });

  it("reports cache diagnostics without exposing torrent identifiers", async () => {
    const root = await makeCacheRoot();
    await writeSizedFile(
      path.join(root, "cache-one", "movie.mkv"),
      512,
      Date.now(),
    );

    const status = await getTorrentCacheStatus();

    expect(status.rootDir).toBe(root);
    expect(status.totalBytes).toBe(512);
    expect(status.entryCount).toBe(1);
    expect(JSON.stringify(status)).not.toContain("movie.mkv");
    await rm(root, { recursive: true, force: true });
  });
});
