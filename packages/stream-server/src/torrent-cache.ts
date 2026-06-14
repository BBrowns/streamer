import { createHash } from "crypto";
import { homedir, platform, tmpdir } from "os";
import path from "path";
import { mkdir, readdir, rm, stat, utimes } from "fs/promises";

const APP_CACHE_NAME = "Streamer";
const DEFAULT_TORRENT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TORRENT_CACHE_MAX_BYTES = 8 * 1024 * 1024 * 1024;

export interface TorrentCacheConfig {
  rootDir: string;
  maxBytes: number;
  ttlMs: number;
}

export interface TorrentCacheCleanupResult {
  rootDir: string;
  removedEntries: number;
  removedFiles: number;
  freedBytes: number;
  totalBytesBefore: number;
  totalBytesAfter: number;
  activeEntriesProtected: number;
}

export interface TorrentCacheStatus {
  rootDir: string;
  totalBytes: number;
  entryCount: number;
  maxBytes: number;
  ttlMs: number;
}

interface CacheEntry {
  path: string;
  bytes: number;
  fileCount: number;
  mtimeMs: number;
  active: boolean;
}

function readPositiveIntegerEnv(name: string, fallback: number) {
  const parsed = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function defaultTorrentCacheRoot() {
  if (platform() === "darwin") {
    return path.join(
      homedir(),
      "Library",
      "Caches",
      APP_CACHE_NAME,
      "webtorrent",
    );
  }
  return path.join(tmpdir(), "streamer", "webtorrent");
}

export function resolveTorrentCacheConfig(): TorrentCacheConfig {
  const configuredRoot = process.env.STREAMER_TORRENT_CACHE_DIR?.trim();
  return {
    rootDir: path.resolve(configuredRoot || defaultTorrentCacheRoot()),
    maxBytes: readPositiveIntegerEnv(
      "STREAMER_TORRENT_CACHE_MAX_BYTES",
      DEFAULT_TORRENT_CACHE_MAX_BYTES,
    ),
    ttlMs: readPositiveIntegerEnv(
      "STREAMER_TORRENT_CACHE_TTL_MS",
      DEFAULT_TORRENT_CACHE_TTL_MS,
    ),
  };
}

export async function ensureTorrentCacheRoot() {
  const config = resolveTorrentCacheConfig();
  await mkdir(config.rootDir, { recursive: true });
  return config.rootDir;
}

export async function getTorrentCacheDirForKey(key: string) {
  const rootDir = await ensureTorrentCacheRoot();
  const digest = createHash("sha256").update(key).digest("hex").slice(0, 32);
  const cacheDir = path.join(rootDir, digest);
  await mkdir(cacheDir, { recursive: true });
  return cacheDir;
}

async function collectEntry(entryPath: string, activeDirs: Set<string>) {
  let bytes = 0;
  let fileCount = 0;
  let mtimeMs = 0;

  async function walk(currentPath: string) {
    const currentStat = await stat(currentPath);
    mtimeMs = Math.max(mtimeMs, currentStat.mtimeMs);
    if (currentStat.isDirectory()) {
      const children = await readdir(currentPath);
      for (const child of children) {
        await walk(path.join(currentPath, child));
      }
      return;
    }
    bytes += currentStat.size;
    fileCount += 1;
  }

  await walk(entryPath);
  return {
    path: entryPath,
    bytes,
    fileCount,
    mtimeMs,
    active: activeDirs.has(path.resolve(entryPath)),
  };
}

async function listTorrentCacheEntries(activeDirs = new Set<string>()) {
  const { rootDir } = resolveTorrentCacheConfig();
  await mkdir(rootDir, { recursive: true });
  const names = await readdir(rootDir);
  const entries: CacheEntry[] = [];
  for (const name of names) {
    const entryPath = path.join(rootDir, name);
    try {
      const entry = await collectEntry(entryPath, activeDirs);
      entries.push(entry);
    } catch {
      // Entry may disappear while cleanup runs; ignore and continue.
    }
  }
  return entries;
}

export async function cleanupTorrentCache({
  activeDirs = new Set<string>(),
  now = Date.now(),
}: {
  activeDirs?: Set<string>;
  now?: number;
} = {}): Promise<TorrentCacheCleanupResult> {
  const config = resolveTorrentCacheConfig();
  const resolvedActiveDirs = new Set(
    Array.from(activeDirs).map((entry) => path.resolve(entry)),
  );
  let entries = await listTorrentCacheEntries(resolvedActiveDirs);
  const totalBytesBefore = entries.reduce((sum, entry) => sum + entry.bytes, 0);
  let totalBytesAfter = totalBytesBefore;
  let removedEntries = 0;
  let removedFiles = 0;
  let freedBytes = 0;

  async function removeEntry(entry: CacheEntry) {
    if (entry.active) return false;
    await rm(entry.path, { recursive: true, force: true });
    removedEntries += 1;
    removedFiles += entry.fileCount;
    freedBytes += entry.bytes;
    totalBytesAfter = Math.max(0, totalBytesAfter - entry.bytes);
    return true;
  }

  for (const entry of entries) {
    if (!entry.active && now - entry.mtimeMs > config.ttlMs) {
      await removeEntry(entry);
    }
  }

  entries = await listTorrentCacheEntries(resolvedActiveDirs);
  totalBytesAfter = entries.reduce((sum, entry) => sum + entry.bytes, 0);
  if (totalBytesAfter > config.maxBytes) {
    const inactiveOldestFirst = entries
      .filter((entry) => !entry.active)
      .sort((a, b) => a.mtimeMs - b.mtimeMs);
    for (const entry of inactiveOldestFirst) {
      if (totalBytesAfter <= config.maxBytes) break;
      await removeEntry(entry);
    }
  }

  if (removedEntries > 0) {
    console.log(
      `[stream-server] Torrent cache cleanup removed ${removedEntries} entries / ${removedFiles} files and freed ${freedBytes} bytes.`,
    );
  }

  return {
    rootDir: config.rootDir,
    removedEntries,
    removedFiles,
    freedBytes,
    totalBytesBefore,
    totalBytesAfter,
    activeEntriesProtected: entries.filter((entry) => entry.active).length,
  };
}

export async function removeTorrentCacheDir(cacheDir?: string) {
  if (!cacheDir) return 0;
  const config = resolveTorrentCacheConfig();
  const resolvedRoot = path.resolve(config.rootDir);
  const resolvedDir = path.resolve(cacheDir);
  if (
    resolvedDir === resolvedRoot ||
    !resolvedDir.startsWith(resolvedRoot + path.sep)
  ) {
    return 0;
  }
  let bytes = 0;
  try {
    const entry = await collectEntry(resolvedDir, new Set());
    bytes = entry.bytes;
  } catch {
    return 0;
  }
  await rm(resolvedDir, { recursive: true, force: true });
  return bytes;
}

export async function markTorrentCacheDirAccessed(cacheDir?: string) {
  if (!cacheDir) return;
  const now = new Date();
  try {
    await utimes(cacheDir, now, now);
  } catch {
    // Best-effort access marker only.
  }
}

export async function getTorrentCacheStatus(): Promise<TorrentCacheStatus> {
  const config = resolveTorrentCacheConfig();
  const entries = await listTorrentCacheEntries();
  return {
    rootDir: config.rootDir,
    totalBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
    entryCount: entries.length,
    maxBytes: config.maxBytes,
    ttlMs: config.ttlMs,
  };
}
