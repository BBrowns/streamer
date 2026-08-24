import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { AppState, DeviceEventEmitter } from "react-native";
import { usePlayerStore } from "../stores/playerStore";
import { streamEngineManager } from "../services/streamEngine/StreamEngineManager";
import { useSync } from "./useSync";
import { useRemoteControl } from "./useRemoteControl";
import { useTraktScrobbler } from "./useTraktScrobbler";
import { useUpdateProgress, useContinueWatching } from "./useContinueWatching";
import { useMeta } from "./useMeta";
import type {
  AudioTrack,
  GatewayJobProgress,
  SubtitleTrack,
  StreamStats,
} from "../services/streamEngine/IStreamEngine";
import { mapPlaybackMessageToRuntimeFailure } from "../services/playback/PlaybackErrors";
import {
  PlaybackProgressClock,
  resolveProgressDuration,
} from "../services/playback/PlaybackProgressClock";
import { beginPlaybackLaunch } from "../services/playback/PlaybackLaunchService";
import {
  completePlaybackSession,
  getActivePlaybackSourceRuntime,
} from "../services/playback/PlaybackSessionPlaybackService";
import { findNextEpisode } from "../services/playback/NextEpisode";
import { preplanNextEpisode } from "../services/playback/NextEpisodePreplanner";
import {
  loadPlaybackSegments,
  type PlaybackSegment,
} from "../services/playback/PlaybackSegmentsProvider";
import type { PlaybackDiagnosticEvent } from "../services/playback/PlaybackDiagnostics";

interface UsePlayerControllerProps {
  player: any; // Expo Video Player instance
  playbackUri: string | null;
  onClose: () => void;
  showControls: () => void;
  isProgressiveRemux?: boolean;
  hasSeekableHandoff?: boolean;
  onCompleted?: () => void;
  onDiagnosticEvent?: (event: PlaybackDiagnosticEvent) => void;
}

const PROGRESS_REPORT_INTERVAL = 15_000;

function getPersistableArtworkUri(uri?: string) {
  const normalized = uri?.trim();
  if (!normalized) return undefined;
  try {
    const parsed = new URL(normalized);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? normalized
      : undefined;
  } catch {
    return undefined;
  }
}

export function usePlayerController({
  player,
  playbackUri,
  onClose,
  showControls,
  isProgressiveRemux = false,
  hasSeekableHandoff = false,
  onCompleted,
  onDiagnosticEvent,
}: UsePlayerControllerProps) {
  const currentStream = usePlayerStore((s) => s.currentStream);
  const mediaInfo = usePlayerStore((s) => s.mediaInfo);
  const subscribeToStreamMetrics = usePlayerStore(
    (s) => s.subscribeToStreamMetrics,
  );
  const setProgress = usePlayerStore((s) => s.setProgress);
  const setPlaybackPlanning = usePlayerStore((s) => s.setPlaybackPlanning);
  const setRuntimeState = usePlayerStore((s) => s.setRuntimeState);
  const setRuntimeFailure = usePlayerStore((s) => s.setRuntimeFailure);
  const autoPlayNext = usePlayerStore((s) => s.autoPlayNext);
  const playbackLaunchIntent = usePlayerStore((s) => s.playbackLaunchIntent);
  const playbackSessionId = usePlayerStore((s) => s.playbackSessionId);
  const playbackAttemptId = usePlayerStore((s) => s.playbackAttemptId);
  const consumePlaybackLaunchIntent = usePlayerStore(
    (s) => s.consumePlaybackLaunchIntent,
  );

  const { updateStatus } = useRemoteControl();
  const { sendMessage } = useSync();
  const { mutate: updateProgress } = useUpdateProgress();
  const { data: cwItems } = useContinueWatching();
  const { data: meta } = useMeta(
    mediaInfo?.type || "",
    mediaInfo?.itemId || "",
  );

  useTraktScrobbler();

  // Local state for engine/playback coordination
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [subtitles, setSubtitles] = useState<SubtitleTrack[]>([]);
  const [stats, setStats] = useState<StreamStats>({ speed: 0, peers: 0 });
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [hasPromptedResume, setHasPromptedResume] = useState(false);
  const [readyPlaybackUri, setReadyPlaybackUri] = useState<string | null>(null);
  const [showNextEpisodeOverlay, setShowNextEpisodeOverlay] = useState(false);
  const [playbackSegments, setPlaybackSegments] = useState<PlaybackSegment[]>(
    [],
  );

  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressClockRef = useRef(new PlaybackProgressClock());
  const nextEpisodePreplanKeyRef = useRef<string | null>(null);
  const nextEpisodePreplanControllerRef = useRef<AbortController | null>(null);
  const lastReportedProgressRef = useRef<{
    mediaKey: string;
    currentTime: number;
    duration: number;
    durationSource: string;
    reportedAt: number;
  } | null>(null);

  // The runtime handoff is an in-memory, attempt-scoped lease. Read it on
  // every render so a fallback/cancel cannot leave this hook attached to a
  // runtime from the previous attempt.
  const activeSourceRuntime =
    playbackSessionId && playbackAttemptId
      ? getActivePlaybackSourceRuntime(playbackSessionId, playbackAttemptId)
      : null;
  const engineOwnedBySession = playbackSessionId !== null;
  const engine = useMemo(() => {
    // PlaybackSessionPlaybackService is the single owner of every prepared
    // session source. While it is resolving (or when a bridge route exposes no
    // legacy runtime), never sniff the Stream and construct a second engine.
    if (playbackSessionId) return activeSourceRuntime?.runtime ?? null;
    return currentStream
      ? streamEngineManager.resolveEngine(currentStream)
      : null;
  }, [activeSourceRuntime, currentStream, playbackSessionId]);
  const effectiveIsProgressiveRemux =
    isProgressiveRemux ||
    activeSourceRuntime?.route?.delivery === "progressive-fmp4";

  const previousProgress = useMemo(() => {
    if (!mediaInfo || !cwItems) return null;
    return cwItems.find(
      (p) =>
        p.itemId === mediaInfo.itemId &&
        p.type === mediaInfo.type &&
        p.season === mediaInfo.season &&
        p.episode === mediaInfo.episode,
    );
  }, [mediaInfo, cwItems]);

  const nextEpisode = useMemo(() => {
    if (!meta || !mediaInfo || mediaInfo.type !== "series") return null;
    return findNextEpisode(meta.videos, mediaInfo);
  }, [meta, mediaInfo]);

  useEffect(() => {
    setPlaybackSegments([]);
    if (!mediaInfo) return;

    const controller = new AbortController();
    void loadPlaybackSegments(
      {
        type: mediaInfo.type,
        itemId: mediaInfo.itemId,
        season: mediaInfo.season,
        episode: mediaInfo.episode,
      },
      controller.signal,
    ).then((segments) => {
      if (!controller.signal.aborted) setPlaybackSegments(segments);
    });

    return () => controller.abort();
  }, [
    mediaInfo?.episode,
    mediaInfo?.itemId,
    mediaInfo?.season,
    mediaInfo?.type,
  ]);

  useEffect(() => {
    nextEpisodePreplanKeyRef.current = null;
    nextEpisodePreplanControllerRef.current?.abort();
    nextEpisodePreplanControllerRef.current = null;
    return () => {
      nextEpisodePreplanControllerRef.current?.abort();
      nextEpisodePreplanControllerRef.current = null;
    };
  }, [
    mediaInfo?.episode,
    mediaInfo?.itemId,
    mediaInfo?.season,
    mediaInfo?.type,
  ]);

  // 1. Engine lifecycle (stats, tracks)
  useEffect(() => {
    if (!engine) return;
    setAudioTracks([]);
    setSubtitles(engine.getSubtitles());

    const onStats = (data: StreamStats) => setStats(data);
    const onGateway = (data: GatewayJobProgress) => {
      if (data.state === "error") {
        setRuntimeFailure(
          mapPlaybackMessageToRuntimeFailure(
            data.error || "Stream gateway could not prepare this source.",
            "GATEWAY_TIMEOUT",
            { retryable: data.retryable ?? true, shouldFallback: true },
          ).error,
        );
        return;
      }

      if (data.state === "cancelled") {
        setRuntimeState("cancelled");
        return;
      }

      if (data.state === "ready" || data.phase === "ready") {
        setRuntimeState("buffering");
        return;
      }

      if (data.phase === "creating_gateway_job") {
        setRuntimeState("creating_gateway_job");
        return;
      }

      if (data.phase === "preparing_metadata") {
        setRuntimeState("preparing_metadata");
        return;
      }

      if (data.phase === "remuxing") {
        setRuntimeState("preparing_metadata");
        return;
      }

      if (
        data.phase === "fetching_metadata" ||
        data.phase === "selecting_file" ||
        data.phase === "checking_piece_availability"
      ) {
        setRuntimeState("preparing_metadata");
        return;
      }

      setRuntimeState("finding_peers");
    };
    engine.on("stats", onStats);
    engine.on("gateway", onGateway);

    return () => {
      engine.off("stats", onStats);
      engine.off("gateway", onGateway);
      if (!engineOwnedBySession) engine.stop?.();
    };
  }, [engine, engineOwnedBySession, setRuntimeFailure, setRuntimeState]);

  // 2. Metrics subscription
  useEffect(() => {
    if (!playbackSessionId && currentStream?.infoHash && playbackUri) {
      subscribeToStreamMetrics(currentStream.infoHash);
    }
  }, [
    currentStream?.infoHash,
    playbackSessionId,
    playbackUri,
    subscribeToStreamMetrics,
  ]);

  const mediaKey = mediaInfo
    ? `${mediaInfo.type}:${mediaInfo.itemId}:${mediaInfo.season ?? 0}:${mediaInfo.episode ?? 0}`
    : null;

  useEffect(() => {
    setHasPromptedResume(false);
    setShowResumePrompt(false);
    progressClockRef.current.reset();
    lastReportedProgressRef.current = null;
  }, [mediaKey]);

  const getProgressSnapshot = useCallback(() => {
    const duration = resolveProgressDuration({
      observedDuration: Number(player?.duration) || 0,
      metadataRuntime: meta?.runtime,
      isProgressiveRemux: effectiveIsProgressiveRemux,
      hasSeekableHandoff,
    });
    return progressClockRef.current.snapshot(
      duration.duration,
      duration.durationSource,
    );
  }, [effectiveIsProgressiveRemux, hasSeekableHandoff, meta?.runtime, player]);

  const reportProgress = useCallback(
    (force = false) => {
      if (!mediaInfo || !mediaKey) return;
      const snapshot = getProgressSnapshot();
      if (snapshot.currentTime <= 0) return;

      const now = Date.now();
      const previous = lastReportedProgressRef.current;
      const sameSample =
        previous?.mediaKey === mediaKey &&
        Math.abs(previous.currentTime - snapshot.currentTime) < 0.5 &&
        previous.duration === snapshot.duration &&
        previous.durationSource === snapshot.durationSource;
      if (sameSample) return;
      if (
        !force &&
        previous?.mediaKey === mediaKey &&
        now - previous.reportedAt < PROGRESS_REPORT_INTERVAL &&
        Math.abs(previous.currentTime - snapshot.currentTime) < 2
      ) {
        return;
      }

      setProgress(snapshot.currentTime, snapshot.duration);
      updateProgress({
        itemId: mediaInfo.itemId,
        type: mediaInfo.type,
        season: mediaInfo.season,
        episode: mediaInfo.episode,
        currentTime: snapshot.currentTime,
        duration: snapshot.duration,
        durationSource: snapshot.durationSource,
        title: mediaInfo.title,
        poster: getPersistableArtworkUri(mediaInfo.poster),
        background: getPersistableArtworkUri(mediaInfo.background),
      });
      lastReportedProgressRef.current = {
        mediaKey,
        ...snapshot,
        reportedAt: now,
      };
    },
    [getProgressSnapshot, mediaInfo, mediaKey, setProgress, updateProgress],
  );

  const recordExplicitSeek = useCallback((position: number) => {
    progressClockRef.current.recordExplicitSeek(position);
  }, []);
  const beginProgressSourceReplacement = useCallback(() => {
    progressClockRef.current.beginSourceReplacement();
  }, []);
  const completeProgressSourceReplacement = useCallback((position: number) => {
    progressClockRef.current.completeSourceReplacement(position);
  }, []);

  // Expo creates the player before an asynchronously resolved session URI is
  // available. Track readiness for the current URI so a Resume seek cannot be
  // consumed against the player's temporary empty source.
  useEffect(() => {
    setReadyPlaybackUri(null);
    if (!player || !playbackUri) return;

    const markReady = (status = player.status) => {
      if (status === "readyToPlay") {
        setReadyPlaybackUri(playbackUri);
      }
    };
    const statusSubscription = player.addListener?.(
      "statusChange",
      ({ status }: { status?: string }) => {
        if (status === "readyToPlay") markReady(status);
      },
    );
    const sourceSubscription = player.addListener?.("sourceLoad", () =>
      markReady(),
    );
    markReady();

    return () => {
      statusSubscription?.remove?.();
      sourceSubscription?.remove?.();
    };
  }, [playbackUri, player]);

  // 3. Resume prompt logic. An explicit runtime launch intent wins over the
  // generic prompt and is consumed after one use, so Resume from Home seeks
  // directly while an explicit Play starts from the beginning.
  useEffect(() => {
    if (
      !player ||
      !playbackUri ||
      readyPlaybackUri !== playbackUri ||
      hasPromptedResume
    ) {
      return;
    }

    if (playbackLaunchIntent) {
      setHasPromptedResume(true);
      setShowResumePrompt(false);
      if (
        playbackLaunchIntent.type === "resume" &&
        Number.isFinite(playbackLaunchIntent.positionSeconds) &&
        playbackLaunchIntent.positionSeconds >= 15
      ) {
        recordExplicitSeek(playbackLaunchIntent.positionSeconds);
        player.currentTime = playbackLaunchIntent.positionSeconds;
      }
      consumePlaybackLaunchIntent();
      player.play();
      return;
    }

    if (previousProgress && previousProgress.currentTime > 15) {
      setHasPromptedResume(true);
      setShowResumePrompt(true);
      if (player.playing) player.pause();
    }
  }, [
    consumePlaybackLaunchIntent,
    hasPromptedResume,
    playbackLaunchIntent,
    playbackUri,
    player,
    previousProgress,
    readyPlaybackUri,
    recordExplicitSeek,
  ]);

  const handleResumeResponse = useCallback(
    (resume: boolean) => {
      setShowResumePrompt(false);
      if (resume && previousProgress && player) {
        recordExplicitSeek(previousProgress.currentTime);
        player.currentTime = previousProgress.currentTime;
      }
      player?.play();
    },
    [player, previousProgress, recordExplicitSeek],
  );

  // 4. Progress Reporting & Sync intervals
  useEffect(() => {
    if (!mediaInfo || !player) return;

    const timeSubscription = player.addListener?.(
      "timeUpdate",
      ({ currentTime }: { currentTime?: number }) => {
        if (
          typeof currentTime !== "number" ||
          !progressClockRef.current.acceptTimeUpdate(currentTime)
        ) {
          return;
        }
        const snapshot = getProgressSnapshot();
        setProgress(snapshot.currentTime, snapshot.duration);
        if (
          autoPlayNext &&
          nextEpisode &&
          !showNextEpisodeOverlay &&
          snapshot.duration - snapshot.currentTime < 30 &&
          snapshot.duration > 60
        ) {
          setShowNextEpisodeOverlay(true);
        }
        if (
          nextEpisode &&
          mediaInfo.type === "series" &&
          snapshot.duration > 120 &&
          snapshot.duration - snapshot.currentTime <= 120
        ) {
          const key = `${mediaInfo.itemId}:${nextEpisode.season}:${nextEpisode.episode}`;
          if (nextEpisodePreplanKeyRef.current !== key) {
            nextEpisodePreplanKeyRef.current = key;
            nextEpisodePreplanControllerRef.current?.abort();
            const controller = new AbortController();
            nextEpisodePreplanControllerRef.current = controller;
            const preplanStartedAt = Date.now();
            void preplanNextEpisode(
              {
                type: "series",
                id: mediaInfo.itemId,
                season: nextEpisode.season,
                episode: nextEpisode.episode,
                title: mediaInfo.title,
                poster: mediaInfo.poster,
                background: mediaInfo.background,
                episodeTitle: nextEpisode.title,
              },
              controller.signal,
            )
              .then((result) => {
                onDiagnosticEvent?.({
                  type: "next_episode_preplan",
                  outcome: result.safeImmediateReplacement
                    ? "ready"
                    : "unavailable",
                  elapsedMs: Date.now() - preplanStartedAt,
                });
              })
              .catch(() => {
                onDiagnosticEvent?.({
                  type: "next_episode_preplan",
                  outcome: controller.signal.aborted
                    ? "cancelled"
                    : "unavailable",
                  elapsedMs: Date.now() - preplanStartedAt,
                });
              });
          }
        }
      },
    );
    const playingSubscription = player.addListener?.(
      "playingChange",
      ({ isPlaying }: { isPlaying?: boolean }) => {
        if (isPlaying === false) reportProgress(true);
      },
    );
    const completedSubscription = player.addListener?.("playToEnd", () => {
      reportProgress(true);
      if (playbackSessionId) completePlaybackSession(playbackSessionId);
      if (nextEpisode) setShowNextEpisodeOverlay(true);
      onCompleted?.();
    });
    const appStateSubscription = AppState.addEventListener(
      "change",
      (nextState) => {
        if (nextState !== "active") reportProgress(true);
      },
    );
    progressTimerRef.current = setInterval(
      () => reportProgress(false),
      PROGRESS_REPORT_INTERVAL,
    );

    const sessionTimer = setInterval(() => {
      if (!player) return;
      updateStatus({
        status: player.playing ? "playing" : "paused",
        itemId: mediaInfo.itemId,
        itemTitle: mediaInfo.title,
        position: player.currentTime,
        duration: player.duration,
      });
    }, 5000);

    return () => {
      reportProgress(true);
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      clearInterval(sessionTimer);
      timeSubscription?.remove?.();
      playingSubscription?.remove?.();
      completedSubscription?.remove?.();
      appStateSubscription.remove();
      updateStatus({ status: "idle" });
    };
  }, [
    mediaInfo,
    player,
    getProgressSnapshot,
    reportProgress,
    setProgress,
    updateStatus,
    autoPlayNext,
    nextEpisode,
    onCompleted,
    onDiagnosticEvent,
    playbackSessionId,
    showNextEpisodeOverlay,
  ]);

  // 5. Sync Event Handlers
  useEffect(() => {
    const handleRemoteCommand = (cmd: any) => {
      if (!player) return;
      switch (cmd.action) {
        case "play":
          player.play();
          showControls();
          break;
        case "pause":
          player.pause();
          showControls();
          break;
        case "seek":
          if (cmd.data?.position !== undefined) {
            recordExplicitSeek(cmd.data.position);
            player.currentTime = cmd.data.position;
          }
          break;
        case "stop":
          onClose();
          break;
      }
    };

    const handlePlaybackSync = (data: any) => {
      if (!player || data.itemId !== mediaInfo?.itemId) return;
      const diff = Math.abs((player.currentTime || 0) - data.position);
      if (data.status === "playing" && !player.playing) player.play();
      else if (data.status === "paused" && player.playing) player.pause();
      if (diff > 3) {
        recordExplicitSeek(data.position);
        player.currentTime = data.position;
      }
    };

    const remoteSub = DeviceEventEmitter.addListener(
      "REMOTE_COMMAND",
      handleRemoteCommand,
    );
    const syncSub = DeviceEventEmitter.addListener(
      "playback_update",
      handlePlaybackSync,
    );

    return () => {
      remoteSub.remove();
      syncSub.remove();
    };
  }, [player, onClose, showControls, mediaInfo?.itemId, recordExplicitSeek]);

  // 6. Broadcast local changes
  useEffect(() => {
    if (!player || !mediaInfo) return;
    let lastStatus = player.playing ? "playing" : "paused";
    let lastPosition = player.currentTime;

    const interval = setInterval(() => {
      const currentStatus = player.playing ? "playing" : "paused";
      const currentPosition = player.currentTime;
      const statusChanged = currentStatus !== lastStatus;
      const positionJumped = Math.abs(currentPosition - lastPosition) > 2;

      if (statusChanged || positionJumped) {
        sendMessage("playback_update", {
          itemId: mediaInfo.itemId,
          status: currentStatus,
          position: currentPosition,
          duration: player.duration,
          timestamp: Date.now(),
        });
        lastStatus = currentStatus;
        lastPosition = currentPosition;
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [player, mediaInfo, sendMessage]);

  const handleNextEpisode = useCallback(async () => {
    if (!nextEpisode || !mediaInfo) return;
    try {
      if (playbackSessionId) completePlaybackSession(playbackSessionId);
      const nextMedia = {
        ...mediaInfo,
        season: nextEpisode.season,
        episode: nextEpisode.episode,
        title: `${mediaInfo.title} - ${nextEpisode.title}`,
      };
      const launchId = beginPlaybackLaunch({
        type: "series",
        id: mediaInfo.itemId,
        title: mediaInfo.title,
        poster: mediaInfo.poster,
        background: mediaInfo.background,
        season: nextEpisode.season,
        episode: nextEpisode.episode,
        episodeTitle: nextEpisode.title,
      });
      setPlaybackPlanning(nextMedia, launchId);
      setHasPromptedResume(false);
      setShowNextEpisodeOverlay(false);
    } catch {
      setRuntimeFailure(
        mapPlaybackMessageToRuntimeFailure(
          "The next episode could not be prepared.",
          "SOURCE_UNAVAILABLE",
          { retryable: true, shouldFallback: false },
        ).error,
      );
    }
  }, [
    mediaInfo,
    nextEpisode,
    playbackSessionId,
    setPlaybackPlanning,
    setRuntimeFailure,
  ]);

  return {
    audioTracks,
    subtitles,
    stats,
    engine,
    playbackRoute: activeSourceRuntime?.route ?? null,
    bridgeJobId: activeSourceRuntime?.bridgeJobId ?? null,
    showResumePrompt,
    resumePromptTimeSeconds: previousProgress?.currentTime ?? null,
    handleResumeResponse,
    showNextEpisodeOverlay,
    setShowNextEpisodeOverlay,
    handleNextEpisode,
    setAudioTracks,
    setSubtitles,
    nextEpisode,
    playbackSegments,
    originalLanguage: meta?.originalLanguage ?? null,
    reportProgress,
    recordExplicitSeek,
    beginProgressSourceReplacement,
    completeProgressSourceReplacement,
  };
}
