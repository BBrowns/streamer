import path from "path";
import { spawn } from "child_process";
import type {
  NormalizedMediaTrack,
  SubtitleCandidate,
  SubtitleCandidateFormat,
} from "@streamer/shared";

interface FfprobeStream {
  index?: unknown;
  codec_type?: unknown;
  codec_name?: unknown;
  channels?: unknown;
  channel_layout?: unknown;
  tags?: {
    language?: unknown;
    title?: unknown;
  };
  disposition?: Record<string, unknown>;
}

interface FfprobeDocument {
  streams?: FfprobeStream[];
}

const BITMAP_SUBTITLE_CODECS = new Set([
  "dvb_subtitle",
  "dvd_subtitle",
  "hdmv_pgs_subtitle",
  "pgssub",
  "xsub",
]);

const LANGUAGE_ALIASES: Record<string, string> = {
  eng: "en",
  en: "en",
  nld: "nl",
  dut: "nl",
  nl: "nl",
  spa: "es",
  esp: "es",
  es: "es",
  deu: "de",
  ger: "de",
  de: "de",
  fra: "fr",
  fre: "fr",
  fr: "fr",
  ita: "it",
  it: "it",
  por: "pt",
  pt: "pt",
};

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function dispositionEnabled(
  disposition: Record<string, unknown> | undefined,
  key: string,
) {
  const value = disposition?.[key];
  return value === 1 || value === true || value === "1";
}

export function normalizeMediaLanguage(value: unknown) {
  const raw = stringValue(value, "unknown").toLowerCase();
  const primary = raw.split(/[-_]/)[0];
  return LANGUAGE_ALIASES[primary] || primary || "unknown";
}

export function parseFfprobeTrackCatalog(
  document: FfprobeDocument,
): NormalizedMediaTrack[] {
  if (!Array.isArray(document.streams)) return [];

  return document.streams.flatMap((stream) => {
    const kind =
      stream.codec_type === "audio"
        ? "audio"
        : stream.codec_type === "subtitle"
          ? "subtitle"
          : null;
    if (!kind || !Number.isInteger(stream.index)) return [];

    const streamIndex = Number(stream.index);
    const codec = stringValue(stream.codec_name, "unknown").toLowerCase();
    const title = stringValue(stream.tags?.title) || undefined;
    const titleText = title || "";
    const bitmapSubtitle =
      kind === "subtitle" && BITMAP_SUBTITLE_CODECS.has(codec);

    return [
      {
        id: `${kind}:${streamIndex}`,
        streamIndex,
        kind,
        language: normalizeMediaLanguage(stream.tags?.language),
        title,
        codec,
        channelCount:
          kind === "audio" &&
          typeof stream.channels === "number" &&
          Number.isInteger(stream.channels) &&
          stream.channels > 0
            ? stream.channels
            : undefined,
        channelLayout:
          kind === "audio"
            ? stringValue(stream.channel_layout) || undefined
            : undefined,
        default: dispositionEnabled(stream.disposition, "default"),
        forced: dispositionEnabled(stream.disposition, "forced"),
        hearingImpaired:
          dispositionEnabled(stream.disposition, "hearing_impaired") ||
          /\b(?:sdh|hearing impaired|closed captions?)\b/i.test(titleText),
        audioDescription:
          dispositionEnabled(stream.disposition, "visual_impaired") ||
          /\b(?:audio description|descriptive audio|\bad\b)\b/i.test(titleText),
        commentary:
          dispositionEnabled(stream.disposition, "comment") ||
          /\bcommentary\b/i.test(titleText),
        source: "embedded",
        supported: !bitmapSubtitle,
        unsupportedReason: bitmapSubtitle
          ? ("bitmap_subtitle" as const)
          : undefined,
      },
    ];
  });
}

function subtitleFormatForFile(name: string): SubtitleCandidateFormat | null {
  const extension = path.extname(name).toLowerCase().slice(1);
  if (extension === "srt") return "srt";
  if (extension === "vtt") return "vtt";
  if (extension === "ass") return "ass";
  if (extension === "ssa") return "ssa";
  return null;
}

function languageFromFilename(name: string) {
  const tokens = path
    .basename(name, path.extname(name))
    .toLowerCase()
    .split(/[._\-[\]()\s]+/)
    .filter(Boolean);
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const language = LANGUAGE_ALIASES[tokens[index]];
    if (language) return language;
  }
  return "unknown";
}

export function discoverExternalSubtitleCandidates(
  files: Array<{ name?: string }>,
  selectedFileIndex: number,
): SubtitleCandidate[] {
  const selectedName = stringValue(files[selectedFileIndex]?.name);
  const selectedDirectory = path.posix.dirname(selectedName);
  const selectedStem = path
    .basename(selectedName, path.extname(selectedName))
    .toLowerCase();

  return files.flatMap((file, fileIndex) => {
    const name = stringValue(file.name);
    const format = subtitleFormatForFile(name);
    if (!format || path.posix.dirname(name) !== selectedDirectory) return [];

    const subtitleStem = path.basename(name, path.extname(name)).toLowerCase();
    const fileNameMatch =
      Boolean(selectedStem) &&
      (subtitleStem.startsWith(selectedStem) ||
        selectedStem.startsWith(subtitleStem));
    const language = languageFromFilename(name);

    return [
      {
        id: `torrent-file:${fileIndex}`,
        language,
        format,
        source: "torrent-file",
        label: path.basename(name),
        releaseName: path.basename(name),
        hearingImpaired: /\b(?:sdh|hi|cc)\b/i.test(name),
        forced: /\bforced\b/i.test(name),
        fileHashMatch: false,
        fileNameMatch,
        contentIdMatch: false,
        confidence: fileNameMatch ? 0.85 : 0.45,
        active: false,
        fetchIdentity: `external:${fileIndex}`,
      },
    ];
  });
}

interface ProbeCacheEntry {
  createdAt: number;
  promise: Promise<unknown>;
}

const DEFAULT_PROBE_TIMEOUT_MS = 10_000;
const MAX_PROBE_OUTPUT_BYTES = 256 * 1024;
const MAX_CONCURRENT_PROBES = 2;
let activeProbeCount = 0;
const pendingProbeStarts: Array<() => void> = [];

async function acquireProbeSlot(signal?: AbortSignal) {
  if (activeProbeCount < MAX_CONCURRENT_PROBES) {
    activeProbeCount += 1;
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const start = () => {
      signal?.removeEventListener("abort", onAbort);
      activeProbeCount += 1;
      resolve();
    };
    const onAbort = () => {
      const index = pendingProbeStarts.indexOf(start);
      if (index >= 0) pendingProbeStarts.splice(index, 1);
      reject(signal?.reason || new Error("Media probe cancelled"));
    };
    pendingProbeStarts.push(start);
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

function releaseProbeSlot() {
  activeProbeCount = Math.max(0, activeProbeCount - 1);
  pendingProbeStarts.shift()?.();
}

export async function probeMediaTracksAtUrl({
  streamUrl,
  signal,
  timeoutMs = DEFAULT_PROBE_TIMEOUT_MS,
}: {
  streamUrl: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}) {
  await acquireProbeSlot(signal);
  try {
    return await new Promise<NormalizedMediaTrack[]>((resolve, reject) => {
      const child = spawn(
        process.env.STREAMER_FFPROBE_PATH?.trim() || "ffprobe",
        [
          "-v",
          "error",
          "-show_entries",
          [
            "stream=index,codec_type,codec_name,channels,channel_layout",
            "stream_tags=language,title",
            "stream_disposition=default,forced,hearing_impaired,visual_impaired,comment",
          ].join(":"),
          "-of",
          "json",
          streamUrl,
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      let output = "";
      let stderr = "";
      let settled = false;

      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        signal?.removeEventListener("abort", onAbort);
        callback();
      };
      const stop = (error: Error) => {
        try {
          child.kill("SIGTERM");
        } catch {}
        finish(() => reject(error));
      };
      const onAbort = () =>
        stop(
          signal?.reason instanceof Error
            ? signal.reason
            : new Error("Media probe cancelled"),
        );
      const timeout = setTimeout(
        () => stop(new Error("Media probe timed out")),
        timeoutMs,
      );
      timeout.unref?.();

      child.stdout?.on("data", (data: Buffer) => {
        if (Buffer.byteLength(output) + data.length > MAX_PROBE_OUTPUT_BYTES) {
          stop(new Error("Media probe output exceeded its size limit"));
          return;
        }
        output += data.toString("utf8");
      });
      child.stderr?.on("data", (data: Buffer) => {
        stderr = `${stderr}${data.toString("utf8")}`.slice(0, 2_048);
      });
      child.on("error", (error) => stop(error));
      child.on("close", (code) => {
        if (settled) return;
        if (code !== 0) {
          finish(() =>
            reject(
              new Error(
                stderr.trim()
                  ? "Media track probe failed"
                  : `Media track probe exited with code ${code ?? "unknown"}`,
              ),
            ),
          );
          return;
        }
        try {
          const parsed = JSON.parse(output) as FfprobeDocument;
          finish(() => resolve(parseFfprobeTrackCatalog(parsed)));
        } catch {
          finish(() =>
            reject(new Error("Media track probe returned invalid data")),
          );
        }
      });

      signal?.addEventListener("abort", onAbort, { once: true });
      if (signal?.aborted) onAbort();
    });
  } finally {
    releaseProbeSlot();
  }
}

export function createMediaProbeCache({
  ttlMs = 5 * 60_000,
  maxEntries = 16,
}: {
  ttlMs?: number;
  maxEntries?: number;
} = {}) {
  const entries = new Map<string, ProbeCacheEntry>();

  return {
    getOrCreate<T>(key: string, factory: () => Promise<T>): Promise<T> {
      const now = Date.now();
      for (const [entryKey, entry] of entries) {
        if (now - entry.createdAt > ttlMs) entries.delete(entryKey);
      }
      const existing = entries.get(key);
      if (existing) return existing.promise as Promise<T>;

      const promise = factory().catch((error) => {
        if (entries.get(key)?.promise === promise) entries.delete(key);
        throw error;
      });
      entries.set(key, { createdAt: now, promise });
      while (entries.size > maxEntries) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
      return promise;
    },
    clear() {
      entries.clear();
    },
  };
}
