import { useCallback, useEffect, useState, type Dispatch } from "react";
import type { ExpoVideoPlayerLike } from "../services/playback/mediaPlayerAdapters/ExpoVideoAdapterBase";
import type { MediaPlayerAdapter } from "../services/playback/MediaPlayerAdapter";
import {
  isMediaPositionSeekable,
  type MediaSeekOptions,
} from "../services/playback/MediaPlayerAdapter";
import type { PlaybackDiagnosticEvent } from "../services/playback/PlaybackDiagnostics";
import type { PlaybackRuntimeViewEvent } from "../services/playback/PlaybackRuntimeCoordinator";
import type { TimelineScrubbingChange } from "../services/playback/TimelineController";
import type { IStreamEngine } from "../services/streamEngine/IStreamEngine";

interface UsePlayerMediaControlsOptions {
  player: ExpoVideoPlayerLike | null;
  mediaAdapter: MediaPlayerAdapter;
  commitSeek: (position: number, options?: MediaSeekOptions) => Promise<number>;
  engine: IStreamEngine | null;
  canSeek: boolean;
  seekableOnRequest?: boolean;
  durationSeconds: number;
  markIntentionalSeek: () => void;
  recordDiagnostic: (event: PlaybackDiagnosticEvent) => void;
  recordExplicitSeek: (position: number) => void;
  setShowNextEpisodeOverlay: (visible: boolean) => void;
  showControls: () => void;
  dispatchRuntimeViewEvent: Dispatch<PlaybackRuntimeViewEvent>;
}

/**
 * Owns direct media-control mutations for the player screen. Session
 * selection, fallback and progress ownership remain outside this hook.
 */
export function usePlayerMediaControls({
  player,
  mediaAdapter,
  commitSeek,
  engine,
  canSeek,
  seekableOnRequest = false,
  durationSeconds,
  markIntentionalSeek,
  recordDiagnostic,
  recordExplicitSeek,
  setShowNextEpisodeOverlay,
  showControls,
  dispatchRuntimeViewEvent,
}: UsePlayerMediaControlsOptions) {
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);

  useEffect(() => {
    if (!player) return;
    setMuted(Boolean(player.muted));
    const currentVolume = typeof player.volume === "number" ? player.volume : 1;
    setVolume(
      Number.isFinite(currentVolume)
        ? Math.min(1, Math.max(0, currentVolume))
        : 1,
    );

    const volumeSub = player.addListener?.("volumeChange", (payload) => {
      const volume = typeof payload?.volume === "number" ? payload.volume : 1;
      setVolume(Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 1);
    });
    const mutedSub = player.addListener?.("mutedChange", (payload) =>
      setMuted(Boolean(payload?.muted)),
    );

    return () => {
      volumeSub?.remove?.();
      mutedSub?.remove?.();
    };
  }, [player]);

  const handleSeekBy = useCallback(
    async (seconds: number) => {
      if (!canSeek || !Number.isFinite(seconds)) return false;
      const snapshot = mediaAdapter.snapshot();
      const target = Math.max(
        0,
        Math.min(durationSeconds, snapshot.currentTime + seconds),
      );
      if (
        !isMediaPositionSeekable(
          target,
          snapshot.seekableRanges,
          seekableOnRequest || snapshot.seekableOnRequest,
        )
      ) {
        return false;
      }
      setShowNextEpisodeOverlay(false);
      markIntentionalSeek();
      recordDiagnostic({ type: "seek", outcome: "requested" });
      try {
        const actualPosition = await commitSeek(target);
        recordExplicitSeek(actualPosition);
        recordDiagnostic({ type: "seek", outcome: "accepted" });
        return true;
      } catch {
        recordDiagnostic({ type: "seek", outcome: "failed" });
        return false;
      } finally {
        showControls();
      }
    },
    [
      canSeek,
      commitSeek,
      durationSeconds,
      markIntentionalSeek,
      recordDiagnostic,
      recordExplicitSeek,
      setShowNextEpisodeOverlay,
      seekableOnRequest,
      showControls,
    ],
  );

  const handleSeekTo = useCallback(
    async (seconds: number) => {
      if (!canSeek || !Number.isFinite(seconds)) return false;
      const target = Math.max(0, Math.min(durationSeconds, seconds));
      const snapshot = mediaAdapter.snapshot();
      if (
        !isMediaPositionSeekable(
          target,
          snapshot.seekableRanges,
          seekableOnRequest || snapshot.seekableOnRequest,
        )
      ) {
        return false;
      }
      setShowNextEpisodeOverlay(false);
      markIntentionalSeek();
      recordDiagnostic({ type: "seek", outcome: "requested" });
      try {
        const actualPosition = await commitSeek(target);
        recordExplicitSeek(actualPosition);
        recordDiagnostic({ type: "seek", outcome: "accepted" });
        return true;
      } catch {
        recordDiagnostic({ type: "seek", outcome: "failed" });
        return false;
      } finally {
        showControls();
      }
    },
    [
      canSeek,
      commitSeek,
      durationSeconds,
      markIntentionalSeek,
      recordDiagnostic,
      recordExplicitSeek,
      setShowNextEpisodeOverlay,
      seekableOnRequest,
      showControls,
    ],
  );

  const handlePreviewSeek = useCallback(
    (seconds: number) => {
      if (!canSeek) return;
      dispatchRuntimeViewEvent({
        type: "scrubbing_previewed",
        previewPosition: seconds,
      });
      showControls();
    },
    [canSeek, dispatchRuntimeViewEvent, showControls],
  );

  const handleScrubbingChange = useCallback(
    (change: TimelineScrubbingChange) => {
      if (change.state === "started") {
        setShowNextEpisodeOverlay(false);
        mediaAdapter.beginScrubbing();
        dispatchRuntimeViewEvent({
          type: "scrubbing_started",
          previewPosition: mediaAdapter.snapshot().currentTime,
        });
      } else {
        mediaAdapter.endScrubbing({ shouldResume: change.shouldResume });
        dispatchRuntimeViewEvent({
          type:
            change.state === "cancelled"
              ? "scrubbing_cancelled"
              : "scrubbing_committed",
        });
      }
      showControls();
    },
    [
      dispatchRuntimeViewEvent,
      mediaAdapter,
      setShowNextEpisodeOverlay,
      showControls,
    ],
  );

  const getTimelineThumbnail = useCallback(
    async (position: number) => {
      const thumbnails = await mediaAdapter.generateThumbnails([position], {
        maxWidth: 320,
        maxHeight: 180,
      });
      if (thumbnails[0]) return thumbnails[0];
      return (await engine?.getThumbnail?.(position)) ?? null;
    },
    [engine, mediaAdapter],
  );

  const handleSeekPercent = useCallback(
    async (percent: number) => {
      if (!canSeek || durationSeconds <= 0 || !Number.isFinite(percent)) {
        return false;
      }
      const target =
        (durationSeconds * Math.max(0, Math.min(100, percent))) / 100;
      const snapshot = mediaAdapter.snapshot();
      if (
        !isMediaPositionSeekable(
          target,
          snapshot.seekableRanges,
          seekableOnRequest || snapshot.seekableOnRequest,
        )
      ) {
        return false;
      }
      setShowNextEpisodeOverlay(false);
      markIntentionalSeek();
      recordDiagnostic({ type: "seek", outcome: "requested" });
      try {
        const actualPosition = await commitSeek(target);
        recordExplicitSeek(actualPosition);
        recordDiagnostic({ type: "seek", outcome: "accepted" });
        return true;
      } catch {
        recordDiagnostic({ type: "seek", outcome: "failed" });
        return false;
      } finally {
        showControls();
      }
    },
    [
      canSeek,
      commitSeek,
      durationSeconds,
      markIntentionalSeek,
      recordDiagnostic,
      recordExplicitSeek,
      setShowNextEpisodeOverlay,
      seekableOnRequest,
      showControls,
    ],
  );

  const handleToggleMute = useCallback(() => {
    if (!player) return;
    const nextMuted = !player.muted;
    player.muted = nextMuted;
    setMuted(nextMuted);
    showControls();
  }, [player, showControls]);

  const handleVolumeChange = useCallback(
    (nextVolume: number) => {
      if (!player) return;
      const normalized = Math.min(1, Math.max(0, nextVolume));
      player.volume = normalized;
      setVolume(normalized);
      if (normalized > 0 && player.muted) {
        player.muted = false;
        setMuted(false);
      }
      showControls();
    },
    [player, showControls],
  );

  return {
    muted,
    volume,
    handleSeekBy,
    handleSeekTo,
    handlePreviewSeek,
    handleScrubbingChange,
    getTimelineThumbnail,
    handleSeekPercent,
    handleToggleMute,
    handleVolumeChange,
  };
}
