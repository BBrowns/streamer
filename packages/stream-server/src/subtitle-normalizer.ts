import { spawn } from "child_process";

export const MAX_SUBTITLE_DOCUMENT_BYTES = 8 * 1024 * 1024;
const SUBTITLE_EXTRACTION_TIMEOUT_MS = 15_000;
const MAX_CONCURRENT_SUBTITLE_EXTRACTIONS = 2;
let activeSubtitleExtractions = 0;
const pendingSubtitleExtractions: Array<() => void> = [];

type SupportedSubtitleFormat = "srt" | "vtt" | "ass" | "ssa";

interface Cue {
  start: number;
  end: number;
  text: string;
}

interface TorrentSubtitleFile {
  length?: number;
  createReadStream(): NodeJS.ReadableStream & {
    destroy(error?: Error): void;
  };
}

async function acquireSubtitleExtractionSlot(signal?: AbortSignal) {
  if (activeSubtitleExtractions < MAX_CONCURRENT_SUBTITLE_EXTRACTIONS) {
    activeSubtitleExtractions += 1;
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const start = () => {
      signal?.removeEventListener("abort", onAbort);
      activeSubtitleExtractions += 1;
      resolve();
    };
    const onAbort = () => {
      const index = pendingSubtitleExtractions.indexOf(start);
      if (index >= 0) pendingSubtitleExtractions.splice(index, 1);
      reject(
        signal?.reason instanceof Error
          ? signal.reason
          : new Error("Subtitle extraction cancelled"),
      );
    };

    pendingSubtitleExtractions.push(start);
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

function releaseSubtitleExtractionSlot() {
  activeSubtitleExtractions = Math.max(0, activeSubtitleExtractions - 1);
  pendingSubtitleExtractions.shift()?.();
}

function decodeSubtitle(buffer: Buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(buffer.subarray(2));
  }
  if (buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.allocUnsafe(buffer.length - 2);
    for (let index = 2; index + 1 < buffer.length; index += 2) {
      swapped[index - 2] = buffer[index + 1];
      swapped[index - 1] = buffer[index];
    }
    return new TextDecoder("utf-16le").decode(swapped);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(
      buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf
        ? buffer.subarray(3)
        : buffer,
    );
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

function parseTimestamp(value: string) {
  const parts = value.trim().replace(",", ".").split(":");
  if (parts.length < 2 || parts.length > 3) return null;
  const seconds = Number(parts.at(-1));
  const minutes = Number(parts.at(-2));
  const hours = parts.length === 3 ? Number(parts[0]) : 0;
  if (![seconds, minutes, hours].every(Number.isFinite)) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

function sanitizeText(value: string) {
  return value
    .replace(/\{\\[^}]+\}/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\r/g, "")
    .trim();
}

function parseBlockCues(document: string) {
  const lines = document.replace(/^\uFEFF/, "").split(/\r?\n/);
  const cues: Cue[] = [];
  let index = 0;
  while (index < lines.length) {
    let line = lines[index].trim();
    if (!line || line === "WEBVTT" || line.startsWith("NOTE")) {
      index += 1;
      continue;
    }
    if (!line.includes("-->") && lines[index + 1]?.includes("-->")) {
      index += 1;
      line = lines[index].trim();
    }
    const match = line.match(
      /^(\d{1,2}:\d{2}(?::\d{2})?[,.]\d{2,3})\s*-->\s*(\d{1,2}:\d{2}(?::\d{2})?[,.]\d{2,3})/,
    );
    if (!match) {
      index += 1;
      continue;
    }
    const start = parseTimestamp(match[1]);
    const end = parseTimestamp(match[2]);
    index += 1;
    const text: string[] = [];
    while (index < lines.length && lines[index].trim()) {
      text.push(lines[index]);
      index += 1;
    }
    const sanitized = sanitizeText(text.join("\n"));
    if (start !== null && end !== null && end > start && sanitized) {
      cues.push({ start, end, text: sanitized });
    }
  }
  return cues;
}

function parseAssCues(document: string) {
  const cues: Cue[] = [];
  for (const line of document.split(/\r?\n/)) {
    if (!line.startsWith("Dialogue:")) continue;
    const fields = line.slice("Dialogue:".length).split(",");
    if (fields.length < 10) continue;
    const start = parseTimestamp(fields[1]);
    const end = parseTimestamp(fields[2]);
    const text = sanitizeText(fields.slice(9).join(",").replace(/\\N/g, "\n"));
    if (start !== null && end !== null && end > start && text) {
      cues.push({ start, end, text });
    }
  }
  return cues;
}

function formatTimestamp(seconds: number) {
  const milliseconds = Math.round(Math.max(0, seconds) * 1000);
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const wholeSeconds = Math.floor((milliseconds % 60_000) / 1000);
  const remainder = milliseconds % 1000;
  return [hours, minutes, wholeSeconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":")
    .concat(`.${String(remainder).padStart(3, "0")}`);
}

function cuesToWebVtt(cues: Cue[]) {
  return `WEBVTT\n\n${cues
    .map(
      (cue, index) =>
        `${index + 1}\n${formatTimestamp(cue.start)} --> ${formatTimestamp(
          cue.end,
        )}\n${cue.text}`,
    )
    .join("\n\n")}\n`;
}

export function normalizeSubtitleBuffer(
  buffer: Buffer,
  format: SupportedSubtitleFormat,
) {
  if (buffer.length > MAX_SUBTITLE_DOCUMENT_BYTES) {
    throw new Error("Subtitle document exceeded its size limit");
  }
  if (!["srt", "vtt", "ass", "ssa"].includes(format)) {
    throw new Error("Unsupported subtitle format");
  }
  const document = decodeSubtitle(buffer);
  const cues =
    format === "ass" || format === "ssa"
      ? parseAssCues(document)
      : parseBlockCues(document);
  if (cues.length === 0) {
    throw new Error("Subtitle document contains no usable text cues");
  }
  return cuesToWebVtt(cues);
}

export function readTorrentSubtitleBuffer(
  file: TorrentSubtitleFile,
  signal?: AbortSignal,
) {
  if (
    typeof file.length === "number" &&
    file.length > MAX_SUBTITLE_DOCUMENT_BYTES
  ) {
    return Promise.reject(
      new Error("Subtitle document exceeded its size limit"),
    );
  }

  return new Promise<Buffer>((resolve, reject) => {
    const stream = file.createReadStream();
    const chunks: Buffer[] = [];
    let bytes = 0;
    let settled = false;

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      callback();
    };
    const stop = (error: Error) => {
      try {
        stream.destroy(error);
      } catch {}
      finish(() => reject(error));
    };
    const onAbort = () =>
      stop(
        signal?.reason instanceof Error
          ? signal.reason
          : new Error("Subtitle read cancelled"),
      );

    stream.on("data", (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > MAX_SUBTITLE_DOCUMENT_BYTES) {
        stop(new Error("Subtitle document exceeded its size limit"));
        return;
      }
      chunks.push(buffer);
    });
    stream.once("error", (error) =>
      finish(() =>
        reject(error instanceof Error ? error : new Error(String(error))),
      ),
    );
    stream.once("end", () => finish(() => resolve(Buffer.concat(chunks))));

    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

export async function extractEmbeddedSubtitleToVtt({
  streamUrl,
  streamIndex,
  signal,
}: {
  streamUrl: string;
  streamIndex: number;
  signal?: AbortSignal;
}) {
  await acquireSubtitleExtractionSlot(signal);
  try {
    return await new Promise<string>((resolve, reject) => {
      const child = spawn(
        process.env.STREAMER_FFMPEG_PATH?.trim() || "ffmpeg",
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-i",
          streamUrl,
          "-map",
          `0:${streamIndex}`,
          "-f",
          "webvtt",
          "pipe:1",
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      const chunks: Buffer[] = [];
      let bytes = 0;
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
            : new Error("Subtitle extraction cancelled"),
        );
      const timeout = setTimeout(
        () => stop(new Error("Subtitle extraction timed out")),
        SUBTITLE_EXTRACTION_TIMEOUT_MS,
      );
      timeout.unref?.();

      child.stdout?.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > MAX_SUBTITLE_DOCUMENT_BYTES) {
          stop(new Error("Subtitle document exceeded its size limit"));
          return;
        }
        chunks.push(Buffer.from(chunk));
      });
      child.on("error", (error) => stop(error));
      child.on("close", (code) => {
        if (settled) return;
        if (code !== 0) {
          finish(() =>
            reject(new Error("Embedded subtitle extraction failed")),
          );
          return;
        }
        try {
          const normalized = normalizeSubtitleBuffer(
            Buffer.concat(chunks),
            "vtt",
          );
          finish(() => resolve(normalized));
        } catch (error) {
          finish(() =>
            reject(error instanceof Error ? error : new Error(String(error))),
          );
        }
      });

      signal?.addEventListener("abort", onAbort, { once: true });
      if (signal?.aborted) onAbort();
    });
  } finally {
    releaseSubtitleExtractionSlot();
  }
}
