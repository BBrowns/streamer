/**
 * Pure helper functions for torrent streaming — no webtorrent dependency.
 * Extracted to a separate module so they can be unit-tested without
 * vitest resolving the webtorrent ESM graph (which opens sockets and hangs).
 */
import path from "path";
import type { Request, Response } from "express";

/** Detect MIME type from file extension for correct Content-Type header */
export function mimeFromExt(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const mimes: Record<string, string> = {
    ".mp4": "video/mp4",
    ".mkv": "video/x-matroska",
    ".avi": "video/x-msvideo",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".m4v": "video/x-m4v",
    ".ts": "video/mp2t",
  };
  return mimes[ext] ?? "video/mp4";
}

/**
 * Wait for a torrent to be ready (files populated).
 *
 * webtorrent v2 fires `ready` once all metadata is received and
 * `torrent.files` is populated. The Torrent class extends EventEmitter.
 *
 * Times out after `timeoutMs` (default 30 s) to avoid infinite hangs.
 */
export function waitForReady(torrent: any, timeoutMs = 120_000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (torrent.files && torrent.files.length > 0) {
      return resolve();
    }

    let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      timer = null;
      cleanup();
      reject(new Error("Torrent ready timeout"));
    }, timeoutMs);

    function cleanup() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      torrent.removeListener("ready", onReady);
      torrent.removeListener("error", onError);
    }

    function onReady() {
      cleanup();
      resolve();
    }
    function onError(err: Error) {
      cleanup();
      reject(err);
    }

    torrent.once("ready", onReady);
    torrent.once("error", onError);
  });
}

/** Stream the largest video file from a torrent to an Express response */
export function handleTorrent(torrent: any, req: Request, res: Response) {
  const file: any = torrent.files.reduce((a: any, b: any) =>
    (a.length ?? 0) > (b.length ?? 0) ? a : b,
  );

  const total: number = file.length;
  const contentType = mimeFromExt(file.name ?? "");
  const range = req.headers.range;

  if (range) {
    const [startStr, endStr] = range.replace(/bytes=/, "").split("-");
    const start = parseInt(startStr, 10);
    const end = endStr ? parseInt(endStr, 10) : total - 1;
    const chunksize = end - start + 1;

    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${total}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunksize,
      "Content-Type": contentType,
    });

    const stream = file.createReadStream({ start, end });
    stream.pipe(res);
    req.on("close", () => stream.destroy());
  } else {
    res.writeHead(200, {
      "Content-Length": total,
      "Accept-Ranges": "bytes",
      "Content-Type": contentType,
    });
    const stream = file.createReadStream();
    stream.pipe(res);
    req.on("close", () => stream.destroy());
  }
}

// ─── Smarter file selection ───────────────────────────────────────────────────

/** Known video file extensions (lower-case). */
const VIDEO_EXTENSIONS = new Set([
  ".mkv",
  ".mp4",
  ".avi",
  ".webm",
  ".mov",
  ".m4v",
  ".wmv",
  ".ts",
]);

/**
 * Keyword fragments that strongly indicate non-main-feature files.
 * Matched against the lower-cased filename (dots/hyphens/underscores normalised to spaces).
 */
const EXCLUSION_KEYWORDS = [
  "sample",
  "trailer",
  "extra",
  "featurette",
  "behind the scenes",
  "deleted scene",
  "interview",
  "making of",
  "bonus",
  "short film",
];

export interface FileSelectionHints {
  /** e.g. 1 */
  season?: number;
  /** e.g. 2 */
  episode?: number;
  /** e.g. "The Crown" — used to prefer filenames that contain the title words */
  title?: string;
}

/**
 * Normalise a filename for keyword matching:
 * replace dots/underscores/hyphens with spaces and lower-case.
 */
function normalise(name: string): string {
  return name.replace(/[._\-]/g, " ").toLowerCase();
}

/**
 * Select the best video file from a list of torrent file objects.
 *
 * Strategy (in order of priority):
 * 1. Only consider files with a known video extension.
 * 2. Exclude files whose names contain exclusion keywords (sample, trailer, etc.).
 * 3. Exclude files smaller than 10 % of the largest video candidate (eliminates micro-extras).
 * 4. If episode hints are provided, prefer files matching `S<season>E<episode>` patterns.
 * 5. Tiebreak: largest remaining file wins.
 *
 * If no valid candidate survives all filters, falls back to the largest file overall.
 */
export function selectBestVideoFile(
  files: { name: string; length: number }[],
  hints?: FileSelectionHints,
): { name: string; length: number } {
  if (files.length === 0) {
    throw new Error("Torrent has no files to select from");
  }

  if (files.length === 1) {
    return files[0];
  }

  // --- Step 1: Filter to known video extensions ---
  const videoFiles = files.filter((f) => {
    const ext = path.extname(f.name).toLowerCase();
    return VIDEO_EXTENSIONS.has(ext);
  });

  const pool = videoFiles.length > 0 ? videoFiles : files;

  // --- Step 2: Exclude unwanted keyword matches ---
  const notExcluded = pool.filter((f) => {
    const norm = normalise(f.name);
    return !EXCLUSION_KEYWORDS.some((kw) => norm.includes(kw));
  });

  // If all files were excluded via keywords, fall back to the pool
  const candidates = notExcluded.length > 0 ? notExcluded : pool;

  // --- Step 3: Size ratio filter (drop files < 10 % of largest candidate) ---
  const maxSize = Math.max(...candidates.map((f) => f.length));
  const sizeFiltered = candidates.filter((f) => f.length >= maxSize * 0.1);
  const sizedCandidates = sizeFiltered.length > 0 ? sizeFiltered : candidates;

  // --- Step 4: Episode hint scoring ---
  if (hints?.season !== undefined && hints?.episode !== undefined) {
    const s = String(hints.season).padStart(2, "0");
    const e = String(hints.episode).padStart(2, "0");
    // Accept both S01E02 and 1x02 style patterns
    const episodeRegex = new RegExp(`s${s}e${e}|${parseInt(s, 10)}x${e}`, "i");

    const episodeMatches = sizedCandidates.filter((f) =>
      episodeRegex.test(f.name),
    );

    if (episodeMatches.length > 0) {
      return episodeMatches.reduce((a, b) => (a.length >= b.length ? a : b));
    }
  }

  // --- Step 5: Tiebreak — largest file wins ---
  return sizedCandidates.reduce((a, b) => (a.length >= b.length ? a : b));
}
