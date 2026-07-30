export type PlaybackSegmentKind =
  | "intro"
  | "recap"
  | "credits"
  | "preview"
  | "post_credits";

export interface PlaybackSegment {
  id: string;
  kind: PlaybackSegmentKind;
  startSeconds: number;
  endSeconds: number;
  source: "metadata" | "provider";
}

export interface PlaybackSegmentsContext {
  type: "movie" | "series";
  itemId: string;
  season?: number;
  episode?: number;
  durationSeconds?: number;
}

export interface PlaybackSegmentsProvider {
  id: string;
  getSegments(
    context: PlaybackSegmentsContext,
    signal: AbortSignal,
  ): Promise<PlaybackSegment[]>;
}

const MAX_SEGMENT_PROVIDERS = 8;
const MAX_SEGMENTS = 64;
const DEFAULT_PROVIDER_TIMEOUT_MS = 2_500;
const supportedKinds = new Set<PlaybackSegmentKind>([
  "intro",
  "recap",
  "credits",
  "preview",
  "post_credits",
]);

const providers = new Map<string, PlaybackSegmentsProvider>();

export function registerPlaybackSegmentsProvider(
  provider: PlaybackSegmentsProvider,
) {
  providers.set(provider.id, provider);
  return () => {
    if (providers.get(provider.id) === provider) providers.delete(provider.id);
  };
}

function normalizeSegment(
  segment: PlaybackSegment,
  durationSeconds?: number,
): PlaybackSegment | null {
  if (
    !segment ||
    !supportedKinds.has(segment.kind) ||
    !Number.isFinite(segment.startSeconds) ||
    !Number.isFinite(segment.endSeconds)
  ) {
    return null;
  }

  const duration =
    Number.isFinite(durationSeconds) && Number(durationSeconds) > 0
      ? Number(durationSeconds)
      : Number.POSITIVE_INFINITY;
  const startSeconds = Math.max(0, Math.min(duration, segment.startSeconds));
  const endSeconds = Math.max(0, Math.min(duration, segment.endSeconds));
  if (endSeconds <= startSeconds) return null;

  return {
    id: String(segment.id).slice(0, 160),
    kind: segment.kind,
    startSeconds,
    endSeconds,
    source: segment.source === "metadata" ? "metadata" : "provider",
  };
}

function waitForProvider(
  provider: PlaybackSegmentsProvider,
  context: PlaybackSegmentsContext,
  parentSignal: AbortSignal,
  timeoutMs: number,
) {
  const controller = new AbortController();
  const onAbort = () => controller.abort(parentSignal.reason);
  parentSignal.addEventListener("abort", onAbort, { once: true });
  const timeout = setTimeout(
    () => controller.abort(new Error("Playback segment provider timed out")),
    timeoutMs,
  );
  const cancelled = new Promise<PlaybackSegment[]>((resolve) => {
    controller.signal.addEventListener("abort", () => resolve([]), {
      once: true,
    });
  });

  return Promise.race([
    provider.getSegments(context, controller.signal).catch(() => []),
    cancelled,
  ]).finally(() => {
    clearTimeout(timeout);
    parentSignal.removeEventListener("abort", onAbort);
  });
}

export async function loadPlaybackSegments(
  context: PlaybackSegmentsContext,
  signal: AbortSignal,
  options: { timeoutMs?: number } = {},
) {
  const activeProviders = [...providers.values()].slice(
    0,
    MAX_SEGMENT_PROVIDERS,
  );
  if (signal.aborted || activeProviders.length === 0) return [];

  const results = await Promise.all(
    activeProviders.map((provider) =>
      waitForProvider(
        provider,
        context,
        signal,
        options.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS,
      ),
    ),
  );
  if (signal.aborted) return [];

  const deduplicated = new Map<string, PlaybackSegment>();
  for (const segment of results.flat()) {
    const normalized = normalizeSegment(segment, context.durationSeconds);
    if (!normalized) continue;
    const identity = [
      normalized.kind,
      normalized.startSeconds.toFixed(3),
      normalized.endSeconds.toFixed(3),
    ].join(":");
    if (!deduplicated.has(identity)) deduplicated.set(identity, normalized);
    if (deduplicated.size >= MAX_SEGMENTS) break;
  }

  return [...deduplicated.values()].sort(
    (left, right) =>
      left.startSeconds - right.startSeconds ||
      left.endSeconds - right.endSeconds ||
      left.id.localeCompare(right.id),
  );
}

export function getActivePlaybackSegment(
  segments: PlaybackSegment[],
  currentTime: number,
) {
  if (!Number.isFinite(currentTime)) return null;
  return (
    segments.find(
      (segment) =>
        segment.startSeconds <= currentTime && currentTime < segment.endSeconds,
    ) ?? null
  );
}
