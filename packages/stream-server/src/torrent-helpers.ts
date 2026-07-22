/**
 * Pure helper functions for torrent streaming — no webtorrent dependency.
 * Extracted to a separate module so they can be unit-tested without
 * vitest resolving the webtorrent ESM graph (which opens sockets and hangs).
 */
import path from "path";
import type { Request, Response } from "express";

export type ByteRangeResult =
  | { type: "full" }
  | { type: "partial"; start: number; end: number; length: number }
  | { type: "unsatisfiable" };

/**
 * Controls for the metadata-readiness wait.
 *
 * `initialPeerTimeoutMs` is deliberately separate from the metadata timeout:
 * it lets a caller stop trying a source that has not found a single peer yet,
 * while still allowing a connected source enough time to receive metadata.
 *
 * `metadataTimeoutAfterPeerMs` gives a source a bounded metadata window after
 * its first peer connects. `timeoutMs` remains the overall hard cap, so a late
 * peer cannot extend preparation indefinitely.
 */
export interface TorrentReadinessOptions {
  signal?: AbortSignal;
  initialPeerTimeoutMs?: number;
  metadataTimeoutAfterPeerMs?: number;
}

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
 * Parse the single byte range used by media players for seeking.
 *
 * Unsupported range units and multi-range requests are ignored so the caller
 * can serve the full representation. Malformed or unsatisfiable byte ranges
 * are rejected instead of serving the wrong bytes as a valid seek.
 */
export function parseByteRange(
  rangeHeader: string | string[] | undefined,
  total: number,
): ByteRangeResult {
  if (rangeHeader === undefined) return { type: "full" };
  if (
    typeof rangeHeader !== "string" ||
    !Number.isSafeInteger(total) ||
    total < 0
  ) {
    return { type: "unsatisfiable" };
  }

  const unitMatch = /^([^=]+)=(.*)$/.exec(rangeHeader.trim());
  if (!unitMatch) return { type: "unsatisfiable" };

  const [, unit, rangeSet] = unitMatch;
  if (unit.trim().toLowerCase() !== "bytes") return { type: "full" };

  // Multipart byte-range responses are not implemented. Ignore the Range
  // header and serve the full representation instead of returning a false 416.
  if (rangeSet.includes(",")) return { type: "full" };

  const match = /^(\d*)-(\d*)$/.exec(rangeSet.trim());
  if (!match || total === 0) return { type: "unsatisfiable" };

  const [, startText, endText] = match;
  if (!startText && !endText) return { type: "unsatisfiable" };

  if (!startText) {
    const suffixLength = Number(endText);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
      return { type: "unsatisfiable" };
    }
    const start = Math.max(0, total - suffixLength);
    return {
      type: "partial",
      start,
      end: total - 1,
      length: total - start,
    };
  }

  const start = Number(startText);
  const requestedEnd = endText ? Number(endText) : total - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(requestedEnd) ||
    start < 0 ||
    requestedEnd < start ||
    start >= total
  ) {
    return { type: "unsatisfiable" };
  }

  const end = Math.min(requestedEnd, total - 1);
  return {
    type: "partial",
    start,
    end,
    length: end - start + 1,
  };
}

/**
 * Wait for a torrent to be ready (files populated).
 *
 * webtorrent v2 fires `ready` once all metadata is received and
 * `torrent.files` is populated. The Torrent class extends EventEmitter.
 *
 * Times out after `timeoutMs` (default 120 s) to avoid infinite hangs.
 */
export function waitForReady(
  torrent: any,
  timeoutMs = 120_000,
  options: TorrentReadinessOptions = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (torrent.files && torrent.files.length > 0) {
      return resolve();
    }

    const { signal, initialPeerTimeoutMs, metadataTimeoutAfterPeerMs } =
      options;
    if (signal?.aborted) {
      return reject(createTorrentReadinessAbortError());
    }

    let settled = false;
    let readyTimer: ReturnType<typeof setTimeout> | null = null;
    let initialPeerTimer: ReturnType<typeof setTimeout> | null = null;
    let metadataAfterPeerTimer: ReturnType<typeof setTimeout> | null = null;
    let sawInitialPeer = Number(torrent.numPeers) > 0;
    const hasInitialPeerDeadline =
      !sawInitialPeer &&
      typeof initialPeerTimeoutMs === "number" &&
      Number.isFinite(initialPeerTimeoutMs) &&
      initialPeerTimeoutMs > 0;
    const hasMetadataAfterPeerDeadline =
      typeof metadataTimeoutAfterPeerMs === "number" &&
      Number.isFinite(metadataTimeoutAfterPeerMs) &&
      metadataTimeoutAfterPeerMs > 0;

    function cleanup() {
      if (readyTimer) {
        clearTimeout(readyTimer);
        readyTimer = null;
      }
      if (initialPeerTimer) {
        clearTimeout(initialPeerTimer);
        initialPeerTimer = null;
      }
      if (metadataAfterPeerTimer) {
        clearTimeout(metadataAfterPeerTimer);
        metadataAfterPeerTimer = null;
      }
      torrent.removeListener("ready", onReady);
      torrent.removeListener("error", onError);
      torrent.removeListener("wire", onWire);
      signal?.removeEventListener("abort", onAbort);
    }

    function settle(resolveOrReject: "resolve" | "reject", error?: Error) {
      if (settled) return;
      settled = true;
      cleanup();
      if (resolveOrReject === "resolve") {
        resolve();
      } else {
        reject(error);
      }
    }

    function onReady() {
      settle("resolve");
    }
    function onError(err: Error) {
      settle("reject", err);
    }
    function onAbort() {
      settle("reject", createTorrentReadinessAbortError());
    }
    function startMetadataAfterPeerTimer() {
      if (!hasMetadataAfterPeerDeadline || metadataAfterPeerTimer || settled) {
        return;
      }
      metadataAfterPeerTimer = setTimeout(() => {
        metadataAfterPeerTimer = null;
        settle(
          "reject",
          new Error("Torrent metadata timeout after peer connection"),
        );
      }, metadataTimeoutAfterPeerMs);
    }
    function onWire() {
      sawInitialPeer = true;
      if (initialPeerTimer) {
        clearTimeout(initialPeerTimer);
        initialPeerTimer = null;
      }
      startMetadataAfterPeerTimer();
    }
    function onInitialPeerTimeout() {
      initialPeerTimer = null;
      if (sawInitialPeer || Number(torrent.numPeers) > 0) {
        sawInitialPeer = true;
        startMetadataAfterPeerTimer();
        return;
      }
      settle("reject", new Error("Torrent peer discovery timeout"));
    }

    torrent.once("ready", onReady);
    torrent.once("error", onError);
    if (hasInitialPeerDeadline || hasMetadataAfterPeerDeadline) {
      torrent.once("wire", onWire);
    }
    signal?.addEventListener("abort", onAbort, { once: true });

    readyTimer = setTimeout(() => {
      readyTimer = null;
      settle("reject", new Error("Torrent ready timeout"));
    }, timeoutMs);

    if (hasInitialPeerDeadline) {
      initialPeerTimer = setTimeout(onInitialPeerTimeout, initialPeerTimeoutMs);
    }
    if (sawInitialPeer) {
      startMetadataAfterPeerTimer();
    }
  });
}

function createTorrentReadinessAbortError() {
  const error = new Error("Torrent readiness was cancelled");
  error.name = "AbortError";
  return error;
}

/** Stream the largest video file from a torrent to an Express response */
export function handleTorrent(torrent: any, req: Request, res: Response) {
  const file: any = torrent.files.reduce((a: any, b: any) =>
    (a.length ?? 0) > (b.length ?? 0) ? a : b,
  );

  const total: number = file.length;
  const contentType = mimeFromExt(file.name ?? "");
  const range = parseByteRange(
    req.method === "GET" ? req.headers.range : undefined,
    total,
  );

  if (range.type === "unsatisfiable") {
    res.writeHead(416, {
      "Content-Range": `bytes */${total}`,
      "Accept-Ranges": "bytes",
      "Content-Type": contentType,
    });
    return res.end();
  }

  if (range.type === "partial") {
    res.writeHead(206, {
      "Content-Range": `bytes ${range.start}-${range.end}/${total}`,
      "Accept-Ranges": "bytes",
      "Content-Length": range.length,
      "Content-Type": contentType,
    });

    if (req.method === "HEAD") return res.end();

    const stream = file.createReadStream({
      start: range.start,
      end: range.end,
    });
    stream.pipe(res);
    req.on("close", () => stream.destroy());
  } else {
    res.writeHead(200, {
      "Content-Length": total,
      "Accept-Ranges": "bytes",
      "Content-Type": contentType,
    });
    if (req.method === "HEAD") return res.end();

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
 * If all video files are excluded as samples/extras, falls back to the largest
 * video file. Non-video-only torrents fail instead of pretending subtitles or
 * metadata are playable.
 */
export function selectBestVideoFile(
  files: { name: string; length: number }[],
  hints?: FileSelectionHints,
): { name: string; length: number } {
  if (files.length === 0) {
    throw new Error("Torrent has no files to select from");
  }

  // --- Step 1: Filter to known video extensions ---
  const videoFiles = files.filter((f) => {
    const ext = path.extname(f.name).toLowerCase();
    return VIDEO_EXTENSIONS.has(ext);
  });

  if (videoFiles.length === 0) {
    throw new Error("Torrent has no playable video files");
  }

  if (videoFiles.length === 1) {
    return videoFiles[0];
  }

  // --- Step 2: Exclude unwanted keyword matches ---
  const notExcluded = videoFiles.filter((f) => {
    const norm = normalise(f.name);
    return !EXCLUSION_KEYWORDS.some((kw) => norm.includes(kw));
  });

  // If all video files were excluded via keywords, fall back to video files.
  const candidates = notExcluded.length > 0 ? notExcluded : videoFiles;

  // --- Step 3: Size ratio filter (drop files < 10 % of largest candidate) ---
  const maxSize = Math.max(...candidates.map((f) => f.length));
  const sizeFiltered = candidates.filter((f) => f.length >= maxSize * 0.1);
  const sizedCandidates = sizeFiltered.length > 0 ? sizeFiltered : candidates;

  // --- Step 4: Episode hint scoring ---
  if (hints?.season !== undefined && hints?.episode !== undefined) {
    const s = String(hints.season).padStart(2, "0");
    const e = String(hints.episode).padStart(2, "0");
    const season = String(parseInt(s, 10));
    const episode = String(parseInt(e, 10));
    // Accept S01E02, S1E2, 1x02, and 1x2 style patterns.
    const episodeRegex = new RegExp(
      `(?:^|[^a-z0-9])(?:s0*${season}e0*${episode}|0*${season}x0*${episode})(?:[^a-z0-9]|$)`,
      "i",
    );

    const episodeMatches = sizedCandidates.filter((f) =>
      episodeRegex.test(f.name),
    );

    if (episodeMatches.length > 0) {
      return episodeMatches.reduce((a, b) => (a.length >= b.length ? a : b));
    }
  }

  if (hints?.title) {
    const titleWords = normalise(hints.title)
      .split(/\s+/)
      .filter((word) => word.length >= 3);
    if (titleWords.length > 0) {
      const scored = sizedCandidates
        .map((file) => {
          const norm = normalise(file.name);
          return {
            file,
            score: titleWords.filter((word) => norm.includes(word)).length,
          };
        })
        .filter((entry) => entry.score > 0);

      if (scored.length > 0) {
        return scored.reduce((a, b) => {
          if (a.score !== b.score) return a.score > b.score ? a : b;
          return a.file.length >= b.file.length ? a : b;
        }).file;
      }
    }
  }

  // --- Step 5: Tiebreak — largest file wins ---
  return sizedCandidates.reduce((a, b) => (a.length >= b.length ? a : b));
}
