import type { SubtitleCandidateFormat } from "@streamer/shared";

export interface SubtitleCue {
  id: string;
  start: number;
  end: number;
  text: string;
}

export const MAX_SUBTITLE_CUES = 20_000;
export const MAX_SUBTITLE_CUE_TEXT_LENGTH = 4_096;

function parseTimestamp(value: string) {
  const normalized = value.trim().replace(",", ".");
  const parts = normalized.split(":");
  if (parts.length < 2 || parts.length > 3) return null;
  const seconds = Number(parts.at(-1));
  const minutes = Number(parts.at(-2));
  const hours = parts.length === 3 ? Number(parts[0]) : 0;
  if (
    !Number.isFinite(seconds) ||
    !Number.isFinite(minutes) ||
    !Number.isFinite(hours) ||
    seconds < 0 ||
    minutes < 0 ||
    hours < 0
  ) {
    return null;
  }
  return hours * 3600 + minutes * 60 + seconds;
}

export function sanitizeSubtitleText(value: string) {
  return value
    .replace(/\{\\[^}]+\}/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/\r/g, "")
    .slice(0, MAX_SUBTITLE_CUE_TEXT_LENGTH)
    .trim();
}

function parseBlockDocument(document: string) {
  const lines = document.replace(/^\uFEFF/, "").split(/\r?\n/);
  const cues: SubtitleCue[] = [];
  let index = 0;

  while (index < lines.length && cues.length < MAX_SUBTITLE_CUES) {
    const line = lines[index].trim();
    if (!line || line === "WEBVTT" || line.startsWith("NOTE")) {
      index += 1;
      continue;
    }

    let timingLine = line;
    if (!timingLine.includes("-->") && lines[index + 1]?.includes("-->")) {
      index += 1;
      timingLine = lines[index].trim();
    }
    const match = timingLine.match(
      /^(\d{1,2}:\d{2}(?::\d{2})?[,.]\d{3})\s*-->\s*(\d{1,2}:\d{2}(?::\d{2})?[,.]\d{3})/,
    );
    if (!match) {
      index += 1;
      continue;
    }
    const start = parseTimestamp(match[1]);
    const end = parseTimestamp(match[2]);
    index += 1;
    const textLines: string[] = [];
    while (index < lines.length && lines[index].trim() !== "") {
      textLines.push(lines[index]);
      index += 1;
    }
    const text = sanitizeSubtitleText(textLines.join("\n"));
    if (start !== null && end !== null && end > start && text.length > 0) {
      cues.push({
        id: `cue-${cues.length + 1}`,
        start,
        end,
        text,
      });
    }
  }
  return cues;
}

function parseAssDocument(document: string) {
  const cues: SubtitleCue[] = [];
  for (const line of document.split(/\r?\n/)) {
    if (cues.length >= MAX_SUBTITLE_CUES) break;
    if (!line.startsWith("Dialogue:")) continue;
    const fields = line.slice("Dialogue:".length).split(",");
    if (fields.length < 10) continue;
    const start = parseTimestamp(fields[1]);
    const end = parseTimestamp(fields[2]);
    const text = sanitizeSubtitleText(
      fields.slice(9).join(",").replace(/\\N/g, "\n"),
    );
    if (start === null || end === null || end <= start || !text) continue;
    cues.push({
      id: `cue-${cues.length + 1}`,
      start,
      end,
      text,
    });
  }
  return cues;
}

export function parseSubtitleDocument(
  document: string,
  format: SubtitleCandidateFormat,
) {
  if (format === "ass" || format === "ssa") {
    return parseAssDocument(document);
  }
  return parseBlockDocument(document);
}

export function applySubtitleOffset(
  cues: SubtitleCue[],
  offsetSeconds: number,
) {
  const offset = Number.isFinite(offsetSeconds) ? offsetSeconds : 0;
  return cues.map((cue) => ({
    ...cue,
    start: Math.max(0, cue.start + offset),
    end: Math.max(0, cue.end + offset),
  }));
}

export function cuesAtTime(cues: SubtitleCue[], currentTime: number) {
  if (!Number.isFinite(currentTime)) return [];
  return cues.filter(
    (cue) => cue.start <= currentTime && currentTime < cue.end,
  );
}
