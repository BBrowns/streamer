import { Platform } from "react-native";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import type {
  PlaybackPlan,
  PlannedMediaCandidate,
  RejectedCandidate,
} from "@streamer/shared";
import type { PlaybackSession } from "@streamer/shared";
import { usePlaybackSessionStore } from "../stores/playbackSessionStore";
import {
  isSensitiveDownloadId,
  isTaskOfflinePlayable,
  useDownloadStore,
  type DownloadTask,
} from "../stores/downloadStore";
import { streamEngineManager } from "./streamEngine/StreamEngineManager";
import { redactSensitiveText } from "./redaction";

const cacheDirectory = (FileSystem as any).cacheDirectory;
const REDACTED = "[redacted]";
const REDACTED_ID = "[redacted-id]";

type JsonValue =
  | null
  | string
  | number
  | boolean
  | JsonValue[]
  | { [key: string]: JsonValue | undefined };

export interface DebugBundleInput {
  sessionId?: string | null;
  plan?: PlaybackPlan | null;
  context?: Record<string, unknown>;
}

export interface DebugBundle {
  schemaVersion: 1;
  createdAt: string;
  platform: string;
  context?: JsonValue;
  bridge: JsonValue;
  session?: JsonValue;
  planner?: JsonValue;
  downloads: JsonValue[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isSensitiveKey(key: string) {
  const normalized = key.toLowerCase();
  return (
    normalized === "stream" ||
    normalized === "originalstream" ||
    normalized === "headers" ||
    normalized === "authorization" ||
    normalized === "password" ||
    normalized === "secret" ||
    normalized === "token" ||
    normalized === "infoshash" ||
    normalized === "magnet" ||
    normalized === "localuri" ||
    normalized === "downloadurl" ||
    normalized === "playbackurl" ||
    normalized.endsWith("token") ||
    normalized.endsWith("secret") ||
    normalized.endsWith("url") ||
    normalized.endsWith("uri") ||
    normalized.endsWith("path")
  );
}

function redactPathLikeText(text: string) {
  return redactSensitiveText(text)
    .replace(/file:\/\/[^\s"'<>]+/gi, "[file]")
    .replace(/\/Users\/[^\s"'<>]+/g, "[path]")
    .replace(/\/home\/[^\s"'<>]+/g, "[path]")
    .replace(/[A-Z]:\\[^\s"'<>]+/gi, "[path]");
}

export function sanitizeDebugValue(
  value: unknown,
  key?: string,
): JsonValue | undefined {
  if (value === undefined || typeof value === "function") return undefined;
  if (value === null) return null;

  if (key && isSensitiveKey(key)) {
    return value ? REDACTED : null;
  }

  if (typeof value === "string") return redactPathLikeText(value);
  if (typeof value === "number" || typeof value === "boolean") return value;

  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeDebugValue(item))
      .filter((item): item is JsonValue => item !== undefined);
  }

  if (!isRecord(value)) return String(value);

  const output: Record<string, JsonValue | undefined> = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    const sanitized = sanitizeDebugValue(childValue, childKey);
    if (sanitized !== undefined) output[childKey] = sanitized;
  }
  return output;
}

function candidateTitle(candidate: PlannedMediaCandidate) {
  const stream = candidate.stream as Record<string, unknown> | undefined;
  const rawTitle =
    typeof stream?.title === "string"
      ? stream.title
      : typeof stream?.name === "string"
        ? stream.name
        : undefined;
  return rawTitle ? redactPathLikeText(rawTitle) : undefined;
}

function safePlannedCandidate(candidate: PlannedMediaCandidate) {
  return sanitizeDebugValue({
    candidateId: candidate.id,
    rank: candidate.rank,
    score: candidate.score,
    sourceType: candidate.kind,
    title: candidateTitle(candidate),
    quality: candidate.quality,
    container: candidate.container,
    videoCodec: candidate.videoCodec,
    audioCodec: candidate.audioCodec,
    hdr: candidate.hdr,
    seeders: candidate.seeders,
    sizeBytes: candidate.sizeBytes,
    riskFlags: candidate.riskFlags,
    requiresBridge: candidate.requiresBridge,
    requiresRemux: candidate.requiresRemux,
    deviceCompatibility: candidate.deviceCompatibility,
    actionEligibility: candidate.actionEligibility,
    decisionReasons: candidate.decisionReasons,
  });
}

function safeRejectedCandidate(candidate: RejectedCandidate) {
  return sanitizeDebugValue({
    candidateId: candidate.candidateId,
    title: candidate.title ? redactPathLikeText(candidate.title) : undefined,
    reason: redactPathLikeText(candidate.reason),
    reasonCode: candidate.reasonCode,
    requiresBridge: candidate.requiresBridge,
    requiresRemux: candidate.requiresRemux,
    deviceCompatibility: candidate.deviceCompatibility,
    actionEligibility: candidate.actionEligibility,
  });
}

export function createSafePlaybackPlanSnapshot(plan?: PlaybackPlan | null) {
  if (!plan) return undefined;

  return sanitizeDebugValue({
    version: plan.version,
    action: plan.action,
    state: plan.state,
    selectedCandidateId: plan.selectedCandidate?.id,
    selectedCandidate: plan.selectedCandidate
      ? safePlannedCandidate(plan.selectedCandidate)
      : undefined,
    fallbackCandidateIds: plan.fallbackCandidates.map(
      (candidate) => candidate.id,
    ),
    fallbackCandidates: plan.fallbackCandidates.map(safePlannedCandidate),
    orderedCandidates: plan.orderedCandidates.map(safePlannedCandidate),
    rejectedCandidates: plan.rejectedCandidates.map(safeRejectedCandidate),
    decisionReasons: plan.decisionReasons.map((reason) => ({
      ...reason,
      message: redactPathLikeText(reason.message),
    })),
    actionEligibility: plan.actionEligibility,
    timeoutBudget: plan.timeoutBudget,
    requiresBridge: plan.requiresBridge,
    requiresRemux: plan.requiresRemux,
    deviceCompatibility: plan.deviceCompatibility,
    plan: plan.plan
      ? {
          mode: plan.plan.mode,
          selectedCandidateId: plan.plan.selectedCandidate.id,
          fallbackCandidateIds:
            plan.plan.fallbackCandidates?.map((candidate) => candidate.id) ??
            [],
        }
      : undefined,
    userMessage: plan.userMessage
      ? redactPathLikeText(plan.userMessage)
      : undefined,
    debug: {
      rejectedCandidates: (plan.debug?.rejectedCandidates ?? []).map(
        safeRejectedCandidate,
      ),
    },
  });
}

function safePlaybackSessionSnapshot(session?: PlaybackSession | null) {
  if (!session) return undefined;
  return sanitizeDebugValue(session);
}

function safeBridgeSnapshot() {
  const { url: _url, ...diagnostics } =
    streamEngineManager.getBridgeDiagnostics();
  return sanitizeDebugValue(diagnostics) ?? {};
}

function safeDownloadTask(task: DownloadTask) {
  return sanitizeDebugValue({
    id: isSensitiveDownloadId(task.id) ? REDACTED_ID : task.id,
    status: task.status,
    progress: task.progress,
    error: task.error ? redactPathLikeText(task.error) : undefined,
    totalBytesWritten: task.totalBytesWritten,
    totalBytesExpectedToWrite: task.totalBytesExpectedToWrite,
    offlinePlayable: isTaskOfflinePlayable(task),
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    offlineVerified: Boolean(task.offlineVerifiedAt),
    mediaInfo: {
      type: task.mediaInfo.type,
      itemId: task.mediaInfo.itemId,
      title: task.mediaInfo.title,
      season: task.mediaInfo.season,
      episode: task.mediaInfo.episode,
    },
    playbackSession: task.playbackSession,
    replanContext: task.replanContext
      ? {
          type: task.replanContext.type,
          id: task.replanContext.id,
          title: task.replanContext.title,
          season: task.replanContext.season,
          episode: task.replanContext.episode,
          episodeTitle: task.replanContext.episodeTitle,
        }
      : undefined,
  });
}

export function createDebugBundle(input: DebugBundleInput = {}): DebugBundle {
  const playbackState = usePlaybackSessionStore.getState();
  const sessionId = input.sessionId ?? playbackState.activeSessionId;
  const session = sessionId ? playbackState.sessions[sessionId] : undefined;
  const runtimePlan = sessionId
    ? playbackState.getRuntimePlan(sessionId)
    : null;
  const plan = input.plan ?? runtimePlan;
  const downloads = Object.values(useDownloadStore.getState().tasks);

  return {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    platform: Platform.OS,
    context: sanitizeDebugValue(input.context),
    bridge: safeBridgeSnapshot(),
    session: safePlaybackSessionSnapshot(session),
    planner: createSafePlaybackPlanSnapshot(plan),
    downloads: downloads
      .map(safeDownloadTask)
      .filter((task): task is JsonValue => task !== undefined),
  };
}

export function serializeDebugBundle(bundle: DebugBundle) {
  return JSON.stringify(bundle, null, 2);
}

export async function exportDebugBundle(bundle: DebugBundle) {
  const payload = serializeDebugBundle(bundle);

  if (Platform.OS === "web") {
    const clipboard = (globalThis as any).navigator?.clipboard;
    if (clipboard?.writeText) {
      await clipboard.writeText(payload);
      return { method: "clipboard" as const };
    }
  }

  const fileUri = `${cacheDirectory ?? ""}streamer_debug_bundle_${Date.now()}.json`;
  await FileSystem.writeAsStringAsync(fileUri, payload);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType: "application/json",
      dialogTitle: "Streamer Debug Bundle",
      UTI: "public.json",
    });
    return { method: "share" as const, fileUri };
  }

  return { method: "file" as const, fileUri };
}
