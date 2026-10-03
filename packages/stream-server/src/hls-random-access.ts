const MAX_RANDOM_ACCESS_DURATION_SECONDS = 24 * 60 * 60;
const DEFAULT_SEGMENT_SECONDS = 2;
const DEFAULT_SEGMENTS_PER_CHUNK = 4;
const RANDOM_ACCESS_SEGMENT = /^segment-(\d{6})\.m4s$/;
const RANDOM_ACCESS_INIT = /^init-(\d{6})\.mp4$/;

export interface RandomAccessHlsOptions {
  durationSeconds: number;
  segmentSeconds?: number;
  segmentsPerChunk?: number;
}

export type RandomAccessHlsObject =
  { kind: "segment"; index: number } | { kind: "init"; index: number };

function positiveFinite(value: number) {
  return Number.isFinite(value) && value > 0;
}

export function getRandomAccessSegmentCount({
  durationSeconds,
  segmentSeconds = DEFAULT_SEGMENT_SECONDS,
}: Pick<RandomAccessHlsOptions, "durationSeconds" | "segmentSeconds">) {
  if (
    !positiveFinite(durationSeconds) ||
    durationSeconds > MAX_RANDOM_ACCESS_DURATION_SECONDS ||
    !positiveFinite(segmentSeconds) ||
    segmentSeconds > 10
  ) {
    throw new Error("Invalid random access HLS duration");
  }
  return Math.ceil(durationSeconds / segmentSeconds);
}

export function buildRandomAccessHlsManifest({
  durationSeconds,
  segmentSeconds = DEFAULT_SEGMENT_SECONDS,
  segmentsPerChunk = DEFAULT_SEGMENTS_PER_CHUNK,
}: RandomAccessHlsOptions) {
  const segmentCount = getRandomAccessSegmentCount({
    durationSeconds,
    segmentSeconds,
  });
  if (!Number.isInteger(segmentsPerChunk) || segmentsPerChunk < 1) {
    throw new Error("Invalid random access HLS chunk size");
  }

  const lines = [
    "#EXTM3U",
    "#EXT-X-VERSION:7",
    `#EXT-X-TARGETDURATION:${Math.ceil(segmentSeconds)}`,
    "#EXT-X-PLAYLIST-TYPE:VOD",
    "#EXT-X-INDEPENDENT-SEGMENTS",
  ];

  for (let index = 0; index < segmentCount; index += 1) {
    if (index % segmentsPerChunk === 0) {
      lines.push(`#EXT-X-MAP:URI="init-${String(index).padStart(6, "0")}.mp4"`);
    }
    const remaining = durationSeconds - index * segmentSeconds;
    const segmentDuration = Math.min(segmentSeconds, remaining);
    lines.push(`#EXTINF:${segmentDuration.toFixed(6)},`);
    lines.push(`segment-${String(index).padStart(6, "0")}.m4s`);
  }

  lines.push("#EXT-X-ENDLIST", "");
  return lines.join("\n");
}

export function parseRandomAccessObjectName(
  name: string,
  segmentCount: number,
  segmentsPerChunk = DEFAULT_SEGMENTS_PER_CHUNK,
): RandomAccessHlsObject | null {
  if (!Number.isInteger(segmentCount) || segmentCount < 1) return null;
  const segment = RANDOM_ACCESS_SEGMENT.exec(name);
  if (segment) {
    const index = Number(segment[1]);
    return index < segmentCount ? { kind: "segment", index } : null;
  }

  const init = RANDOM_ACCESS_INIT.exec(name);
  if (init) {
    const index = Number(init[1]);
    return index < segmentCount && index % segmentsPerChunk === 0
      ? { kind: "init", index }
      : null;
  }
  return null;
}
