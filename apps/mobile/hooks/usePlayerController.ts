import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { DeviceEventEmitter } from "react-native";
import { usePlayerStore } from "../stores/playerStore";
import { streamEngineManager } from "../services/streamEngine/StreamEngineManager";
import { useSync } from "./useSync";
import { useRemoteControl } from "./useRemoteControl";
import { useTraktScrobbler } from "./useTraktScrobbler";
import { useUpdateProgress, useContinueWatching } from "./useContinueWatching";
import { useMeta } from "./useMeta";
import { api } from "../services/api";
import type {
  AudioTrack,
  GatewayJobProgress,
  SubtitleTrack,
  StreamStats,
} from "../services/streamEngine/IStreamEngine";
import { mapPlaybackMessageToRuntimeFailure } from "../services/playback/PlaybackErrors";

interface UsePlayerControllerProps {
  player: any; // Expo Video Player instance
  playbackUri: string | null;
  onClose: () => void;
  showControls: () => void;
}

const PROGRESS_REPORT_INTERVAL = 15_000;

export function usePlayerController({
  player,
  playbackUri,
  onClose,
  showControls,
}: UsePlayerControllerProps) {
  const currentStream = usePlayerStore((s) => s.currentStream);
  const mediaInfo = usePlayerStore((s) => s.mediaInfo);
  const subscribeToStreamMetrics = usePlayerStore(
    (s) => s.subscribeToStreamMetrics,
  );
  const setProgress = usePlayerStore((s) => s.setProgress);
  const setStream = usePlayerStore((s) => s.setStream);
  const setRuntimeState = usePlayerStore((s) => s.setRuntimeState);
  const setRuntimeFailure = usePlayerStore((s) => s.setRuntimeFailure);
  const autoPlayNext = usePlayerStore((s) => s.autoPlayNext);

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
  const [showNextEpisodeOverlay, setShowNextEpisodeOverlay] = useState(false);

  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const engine = useMemo(
    () =>
      currentStream ? streamEngineManager.resolveEngine(currentStream) : null,
    [currentStream],
  );

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
    const currentIndex = meta.videos?.findIndex(
      (v) => v.season === mediaInfo.season && v.episode === mediaInfo.episode,
    );
    if (currentIndex === undefined || currentIndex === -1) return null;
    return meta.videos?.[currentIndex + 1] || null;
  }, [meta, mediaInfo]);

  // 1. Engine lifecycle (stats, tracks)
  useEffect(() => {
    if (!engine) return;
    setAudioTracks(engine.getAudioTracks());
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
      engine.stop?.();
    };
  }, [engine, setRuntimeFailure, setRuntimeState]);

  // 2. Metrics subscription
  useEffect(() => {
    if (currentStream?.infoHash && playbackUri) {
      subscribeToStreamMetrics(currentStream.infoHash);
    }
  }, [currentStream?.infoHash, playbackUri, subscribeToStreamMetrics]);

  // 3. Resume prompt logic
  useEffect(() => {
    if (
      player &&
      previousProgress &&
      previousProgress.currentTime > 15 &&
      !hasPromptedResume
    ) {
      setHasPromptedResume(true);
      setShowResumePrompt(true);
      if (player.playing) player.pause();
    }
  }, [player, previousProgress, hasPromptedResume]);

  const handleResumeResponse = useCallback(
    (resume: boolean) => {
      setShowResumePrompt(false);
      if (resume && previousProgress && player) {
        player.currentTime = previousProgress.currentTime;
      }
      player?.play();
    },
    [player, previousProgress],
  );

  // 4. Progress Reporting & Sync intervals
  useEffect(() => {
    if (!mediaInfo || !player) return;

    progressTimerRef.current = setInterval(() => {
      let currentTime = 0;
      let duration = 0;
      try {
        currentTime = player.currentTime || 0;
        duration = player.duration || 0;
      } catch (e) {
        return;
      }

      setProgress(currentTime, duration);

      if (currentTime > 0 && duration > 0) {
        updateProgress({
          itemId: mediaInfo.itemId,
          type: mediaInfo.type,
          season: mediaInfo.season,
          episode: mediaInfo.episode,
          currentTime,
          duration,
          title: mediaInfo.title,
          poster: mediaInfo.poster,
        });

        if (
          autoPlayNext &&
          nextEpisode &&
          !showNextEpisodeOverlay &&
          duration - currentTime < 30 &&
          duration > 60
        ) {
          setShowNextEpisodeOverlay(true);
        }
      }
    }, PROGRESS_REPORT_INTERVAL);

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
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      clearInterval(sessionTimer);
      updateStatus({ status: "idle" });
    };
  }, [
    mediaInfo,
    player,
    setProgress,
    updateProgress,
    updateStatus,
    autoPlayNext,
    nextEpisode,
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
          if (cmd.data?.position !== undefined)
            player.currentTime = cmd.data.position;
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
      if (diff > 3) player.currentTime = data.position;
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
  }, [player, onClose, showControls, mediaInfo?.itemId]);

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
      const episodeId = `${mediaInfo.itemId}:${nextEpisode.season}:${nextEpisode.episode}`;
      const { data } = await api.get(`/api/stream/series/${episodeId}`);
      if (data.streams?.length > 0) {
        setStream(data.streams[0], {
          ...mediaInfo,
          season: nextEpisode.season,
          episode: nextEpisode.episode,
          title: `${mediaInfo.title} - ${nextEpisode.title}`,
        });
        setHasPromptedResume(false);
        setShowNextEpisodeOverlay(false);
      }
    } catch (e) {
      console.error("Failed to auto-play next episode", e);
    }
  }, [nextEpisode, mediaInfo, setStream]);

  return {
    audioTracks,
    subtitles,
    stats,
    engine,
    showResumePrompt,
    resumePromptTimeSeconds: previousProgress?.currentTime ?? null,
    handleResumeResponse,
    showNextEpisodeOverlay,
    setShowNextEpisodeOverlay,
    handleNextEpisode,
    setAudioTracks,
    setSubtitles,
    nextEpisode,
  };
}
