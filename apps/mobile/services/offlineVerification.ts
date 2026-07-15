import { Platform } from "react-native";
import { MIN_OFFLINE_MEDIA_BYTES } from "../stores/downloadStore";

export const OFFLINE_MEDIA_PROBE_TIMEOUT_MS = 8_000;

export type LocalFileInspection = {
  exists: boolean;
  isFile: boolean;
  sizeBytes: number;
};

export type OfflineInspectionFailure =
  | "missing"
  | "not_file"
  | "too_small"
  | "size_mismatch"
  | "invalid_content_type";

export type OfflineInspectionResult =
  | { ok: true; sizeBytes: number }
  | {
      ok: false;
      reason: OfflineInspectionFailure;
      message: string;
      sizeBytes?: number;
    };

const REJECTED_CONTENT_TYPES = new Set([
  "application/json",
  "application/problem+json",
  "application/x-bittorrent",
  "application/xml",
  "text/html",
  "text/plain",
  "text/xml",
]);

export function validateOfflineInspection({
  inspection,
  expectedMediaBytes,
  contentType,
}: {
  inspection: LocalFileInspection;
  expectedMediaBytes?: number;
  contentType?: string;
}): OfflineInspectionResult {
  if (!inspection.exists) {
    return {
      ok: false,
      reason: "missing",
      message: "Downloaded file could not be found.",
    };
  }
  if (!inspection.isFile) {
    return {
      ok: false,
      reason: "not_file",
      message: "Downloaded path is not a media file.",
    };
  }
  if (inspection.sizeBytes < MIN_OFFLINE_MEDIA_BYTES) {
    return {
      ok: false,
      reason: "too_small",
      message:
        "Downloaded file is too small to be a complete movie or episode.",
      sizeBytes: inspection.sizeBytes,
    };
  }

  const normalizedContentType = contentType
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (
    normalizedContentType &&
    (REJECTED_CONTENT_TYPES.has(normalizedContentType) ||
      normalizedContentType.startsWith("text/") ||
      normalizedContentType.endsWith("+json") ||
      normalizedContentType.endsWith("+xml"))
  ) {
    return {
      ok: false,
      reason: "invalid_content_type",
      message: "Downloaded file contains metadata instead of playable media.",
      sizeBytes: inspection.sizeBytes,
    };
  }

  const expected = Math.max(0, expectedMediaBytes || 0);
  if (expected > 0 && inspection.sizeBytes !== expected) {
    return {
      ok: false,
      reason: "size_mismatch",
      message:
        "Downloaded media does not match the expected file size and must be downloaded again.",
      sizeBytes: inspection.sizeBytes,
    };
  }

  return { ok: true, sizeBytes: inspection.sizeBytes };
}

export async function probeLocalMedia(
  localUri: string,
  timeoutMs = OFFLINE_MEDIA_PROBE_TIMEOUT_MS,
): Promise<boolean> {
  try {
    if (Platform.OS === "web" && typeof document !== "undefined") {
      return await probeLocalMediaOnWeb(localUri, timeoutMs);
    }
    return await probeLocalMediaWithExpoVideo(localUri, timeoutMs);
  } catch {
    return false;
  }
}

async function probeLocalMediaOnWeb(localUri: string, timeoutMs: number) {
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.style.position = "fixed";
  video.style.width = "1px";
  video.style.height = "1px";
  video.style.opacity = "0";
  video.style.pointerEvents = "none";

  return new Promise<boolean>((resolve) => {
    let settled = false;
    let canPlay = false;
    let hasValidDuration = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const finish = (playable: boolean) => {
      if (settled) return;
      settled = true;
      if (timeout !== undefined) clearTimeout(timeout);
      video.pause();
      video.removeAttribute("src");
      video.load();
      video.remove();
      resolve(playable);
    };
    const rememberDuration = () => {
      hasValidDuration = Number.isFinite(video.duration) && video.duration > 0;
    };
    const finishWhenPlayable = () => {
      if (canPlay && hasValidDuration) finish(true);
    };
    timeout = setTimeout(() => finish(false), timeoutMs);
    video.addEventListener(
      "loadedmetadata",
      () => {
        rememberDuration();
        finishWhenPlayable();
      },
      { once: true },
    );
    video.addEventListener(
      "canplay",
      () => {
        canPlay = true;
        rememberDuration();
        finishWhenPlayable();
      },
      { once: true },
    );
    video.addEventListener("error", () => finish(false), { once: true });
    try {
      document.body.appendChild(video);
      video.src = localUri;
      video.load();
    } catch {
      finish(false);
    }
  });
}

async function probeLocalMediaWithExpoVideo(
  localUri: string,
  timeoutMs: number,
) {
  // Keep the native module out of web and unit-test initialization. Metro
  // still resolves this static require for native bundles.
  const { createVideoPlayer } =
    require("expo-video") as typeof import("expo-video");
  const player = createVideoPlayer({
    uri: localUri,
    contentType: "progressive",
  });
  try {
    return await new Promise<boolean>((resolve) => {
      let settled = false;
      let readyToPlay = player.status === "readyToPlay";
      let hasValidDuration =
        Number.isFinite(player.duration) && player.duration > 0;
      let statusSubscription: { remove: () => void } | undefined;
      let sourceSubscription: { remove: () => void } | undefined;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const finish = (playable: boolean) => {
        if (settled) return;
        settled = true;
        if (timeout !== undefined) clearTimeout(timeout);
        statusSubscription?.remove();
        sourceSubscription?.remove();
        resolve(playable);
      };
      const finishWhenPlayable = () => {
        if (readyToPlay && hasValidDuration) finish(true);
      };
      const rememberDuration = (duration: number) => {
        if (Number.isFinite(duration) && duration > 0) {
          hasValidDuration = true;
        }
      };
      timeout = setTimeout(() => finish(false), timeoutMs);
      try {
        statusSubscription = player.addListener(
          "statusChange",
          ({ status }) => {
            if (status === "error") finish(false);
            if (status === "readyToPlay") {
              readyToPlay = true;
              rememberDuration(player.duration);
              finishWhenPlayable();
            }
          },
        );
        sourceSubscription = player.addListener(
          "sourceLoad",
          ({ duration }) => {
            rememberDuration(duration);
            finishWhenPlayable();
          },
        );
        if (player.status === "error") finish(false);
        finishWhenPlayable();
      } catch {
        finish(false);
      }
    });
  } finally {
    try {
      player.release();
    } catch {}
  }
}
