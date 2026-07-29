import { useCallback, useEffect, useState, type Dispatch } from "react";
import type { VideoPlayer } from "expo-video";
import type { MediaPlayerAdapter } from "../services/playback/MediaPlayerAdapter";
import type { PlaybackDiagnosticEvent } from "../services/playback/PlaybackDiagnostics";
import type { PlaybackRuntimeViewEvent } from "../services/playback/PlaybackRuntimeCoordinator";
import type { TimelineScrubbingChange } from "../services/playback/TimelineController";
import type { IStreamEngine } from "../services/streamEngine/IStreamEngine";

interface UsePlayerMediaControlsOptions {
  player: VideoPlayer | null;
  mediaAdapter: MediaPlayerAdapter;
  engine: IStreamEngine | null;
  canSeek: boolean;
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
  engine,
  canSeek,
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
    setVolume(
      Number.isFinite(player.volume)
        ? Math.min(1, Math.max(0, player.volume))
        : 1,
    );

    const volumeSub = player.addListener?.(
      "volumeChange",
      ({ volume }: { volume: number }) =>
        setVolume(
          Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 1,
        ),
    );
    const mutedSub = player.addListener?.(
      "mutedChange",
      ({ muted }: { muted: boolean }) => setMuted(Boolean(muted)),
    );

    return () => {
      volumeSub?.remove?.();
      mutedSub?.remove?.();
    };
  }, [player]);

  const handleSeekBy = useCallback(
    (seconds: number) => {
      if (!canSeek) return;
      setShowNextEpisodeOverlay(false);
      markIntentionalSeek();
      recordDiagnostic({ type: "seek", outcome: "requested" });
      recordExplicitSeek(
        Math.max(0, mediaAdapter.snapshot().currentTime + seconds),
      );
      try {
        mediaAdapter.seekBy(seconds);
        recordDiagnostic({ type: "seek", outcome: "accepted" });
      } catch {
        recordDiagnostic({ type: "seek", outcome: "failed" });
      }
      showControls();
    },
    [
      canSeek,
      markIntentionalSeek,
      mediaAdapter,
      recordDiagnostic,
      recordExplicitSeek,
      setShowNextEpisodeOverlay,
      showControls,
    ],
  );

  const handleSeekTo = useCallback(
    (seconds: number) => {
      if (!canSeek) return;
      setShowNextEpisodeOverlay(false);
      markIntentionalSeek();
      recordDiagnostic({ type: "seek", outcome: "requested" });
      recordExplicitSeek(seconds);
      try {
        mediaAdapter.commitSeek(seconds);
        recordDiagnostic({ type: "seek", outcome: "accepted" });
      } catch {
        recordDiagnostic({ type: "seek", outcome: "failed" });
      }
      showControls();
    },
    [
      canSeek,
      markIntentionalSeek,
      mediaAdapter,
      recordDiagnostic,
      recordExplicitSeek,
      setShowNextEpisodeOverlay,
      showControls,
    ],
  );

  const handlePreviewSeek = useCallback(
    (seconds: number) => {
      if (!canSeek) return;
      markIntentionalSeek();
      mediaAdapter.previewSeek(seconds);
      dispatchRuntimeViewEvent({
        type: "scrubbing_previewed",
        previewPosition: seconds,
      });
      showControls();
    },
    [
      canSeek,
      dispatchRuntimeViewEvent,
      markIntentionalSeek,
      mediaAdapter,
      showControls,
    ],
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
        if (change.state === "cancelled") {
          mediaAdapter.commitSeek(change.restorePosition);
        }
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
    (percent: number) => {
      if (!canSeek || !player || !player.duration) return;
      setShowNextEpisodeOverlay(false);
      markIntentionalSeek();
      recordDiagnostic({ type: "seek", outcome: "requested" });
      const target = (player.duration * percent) / 100;
      recordExplicitSeek(target);
      try {
        player.currentTime = target;
        recordDiagnostic({ type: "seek", outcome: "accepted" });
      } catch {
        recordDiagnostic({ type: "seek", outcome: "failed" });
      }
      showControls();
    },
    [
      canSeek,
      markIntentionalSeek,
      player,
      recordDiagnostic,
      recordExplicitSeek,
      setShowNextEpisodeOverlay,
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
