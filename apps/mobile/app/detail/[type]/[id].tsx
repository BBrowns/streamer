import { useLocalSearchParams, useRouter } from "expo-router";
import { useState, useEffect, useCallback } from "react";
import { Linking } from "react-native";
import { getMetaLoadFailureKind, useMeta } from "../../../hooks/useMeta";
import { useStreams } from "../../../hooks/useStreams";
import { usePlayerStore } from "../../../stores/playerStore";
import {
  useAddToLibrary,
  useIsInLibrary,
  useRemoveFromLibrary,
} from "../../../hooks/useLibrary";
import { streamEngineManager } from "../../../services/streamEngine/StreamEngineManager";
import {
  isTaskOfflinePlayable,
  useDownloadStore,
} from "../../../stores/downloadStore";
import { downloadService } from "../../../services/DownloadService";
import { useTranslation } from "react-i18next";
import { useToastStore } from "../../../stores/toastStore";
import { hapticImpactLight, hapticSuccess } from "../../../lib/haptics";
import { goBackOrReplace } from "../../../lib/navigation";
import type { PlaybackAction, PlaybackPlan, Stream } from "@streamer/shared";
import {
  playCandidate,
  playBest,
  prepareDownload,
} from "../../../services/playback/PlaybackOrchestrator";
import { DesktopCastModal } from "../../../components/DesktopCastModal";
import { useCastStore } from "../../../stores/castStore";
import { useSmartDownloadStore } from "../../../stores/smartDownloadStore";
import { createNextEpisodePlan } from "../../../services/SmartDownloadPlanner";
import { useWindowClass } from "../../../hooks/useWindowClass";
import { mapPlaybackMessageToRuntimeFailure } from "../../../services/playback/PlaybackErrors";

import { DesktopDetailLayout } from "../../../components/detail/DesktopDetailLayout";
import { MobileDetailLayout } from "../../../components/detail/MobileDetailLayout";
import {
  getPlaybackReadinessRoute,
  getPlaybackReadinessCopy,
  getPlaybackReadinessCopyFromError,
  type PlaybackReadinessActionTarget,
  type PlaybackReadinessNoticeCopy,
} from "../../../components/detail/PlaybackReadinessNotice";
import { DetailLoadState } from "../../../components/detail/DetailLoadState";
import { getSafeTrailerUrl } from "../../../services/trailer";

export default function DetailScreen() {
  const {
    type,
    id,
    sources: sourcesParam,
  } = useLocalSearchParams<{
    type: string;
    id: string;
    sources?: string;
  }>();
  const castType = type as "movie" | "series";
  const router = useRouter();
  const { t } = useTranslation();
  const {
    data: meta,
    error: metaError,
    isLoading: metaLoading,
    isFetching: metaFetching,
    refetch: refetchMeta,
  } = useMeta(type, id);
  const { data: streams, isLoading: streamsLoading } = useStreams(type, id);
  const setStream = usePlayerStore((s) => s.setStream);
  const setSessionStream = usePlayerStore((s) => s.setSessionStream);
  const { isExpanded, isLarge } = useWindowClass();
  const isDesktop = isExpanded || isLarge;

  const [selectedResolution, setSelectedResolution] = useState<string | null>(
    null,
  );
  const [castModalOpen, setCastModalOpen] = useState(false);
  const [manualCastUri, setManualCastUri] = useState<string | null>(null);
  const [castUsesPlanner, setCastUsesPlanner] = useState(false);
  const [planningAction, setPlanningAction] = useState<
    "play" | "download" | "cast" | null
  >(null);
  const [playbackNotice, setPlaybackNotice] =
    useState<PlaybackReadinessNoticeCopy | null>(null);
  const { data: inLibrary } = useIsInLibrary(id);
  const addToLibrary = useAddToLibrary();
  const removeFromLibrary = useRemoveFromLibrary();
  const trailerUrl = getSafeTrailerUrl(meta?.trailers);

  const dismissPlaybackNotice = useCallback(() => {
    setPlaybackNotice(null);
  }, []);

  const handlePlaybackNoticeAction = useCallback(
    (target: PlaybackReadinessActionTarget) => {
      setPlaybackNotice(null);
      router.push(getPlaybackReadinessRoute(target));
    },
    [router],
  );

  const handleToggleLibrary = useCallback(() => {
    if (!meta) return;
    hapticImpactLight();
    const { show } = useToastStore.getState();
    if (inLibrary) {
      removeFromLibrary.mutate(id, {
        onSuccess: () =>
          show(t("library.alerts.removed"), "info", {
            actionLabel: t("library.actions.undo"),
            onAction: () =>
              addToLibrary.mutateAsync({
                type: castType,
                itemId: id,
                title: meta.name,
                poster: meta.poster,
              }),
          }),
      });
    } else {
      hapticSuccess();
      addToLibrary.mutate(
        {
          type: castType,
          itemId: id,
          title: meta.name,
          poster: meta.poster,
        },
        { onSuccess: () => show(t("library.alerts.added"), "success") },
      );
    }
  }, [meta, inLibrary, id, type, addToLibrary, removeFromLibrary]);

  const handleWatchTrailer = useCallback(async () => {
    if (!trailerUrl) return;

    try {
      const canOpen = await Linking.canOpenURL(trailerUrl);
      if (!canOpen) throw new Error("Trailer destination is unavailable");
      await Linking.openURL(trailerUrl);
    } catch {
      useToastStore
        .getState()
        .show(t("detail.actionPanel.trailerUnavailable"), "error");
    }
  }, [t, trailerUrl]);

  const groupedStreams = (streams || []).reduce(
    (acc, s) => {
      const res = s.resolution || "SD";
      if (!acc[res]) acc[res] = [];
      acc[res].push(s);
      return acc;
    },
    {} as Record<string, Stream[]>,
  );

  const availableResolutions = Object.keys(groupedStreams).sort((a, b) => {
    const order: Record<string, number> = {
      "2160p": 0,
      "1080p": 1,
      "720p": 2,
      "480p": 3,
      SD: 4,
    };
    return (order[a] ?? 99) - (order[b] ?? 99);
  });

  useEffect(() => {
    if (availableResolutions.length > 0 && !selectedResolution) {
      setSelectedResolution(availableResolutions[0]);
    }
  }, [availableResolutions, selectedResolution]);

  if (metaLoading || (!meta && !metaError)) {
    return (
      <DetailLoadState kind="loading" onBack={() => goBackOrReplace(router)} />
    );
  }

  if (!meta) {
    const failureKind = getMetaLoadFailureKind(metaError);
    return (
      <DetailLoadState
        kind={failureKind}
        retrying={metaFetching}
        onBack={() => goBackOrReplace(router)}
        onRetry={() => {
          void refetchMeta();
        }}
        onSupport={() =>
          router.push(
            failureKind === "notFound" ? "/addons" : "/settings/sources",
          )
        }
      />
    );
  }

  const handlePlayStream = async (
    stream?: Stream,
    episodeTitle?: string,
    season?: number,
    episode?: number,
  ) => {
    setPlaybackNotice(null);
    if (!stream) {
      setPlanningAction("play");
      try {
        const result = await playBest({
          type: castType,
          id: id || "unknown",
          season,
          episode,
          title: meta?.name,
          poster: meta?.poster,
          episodeTitle,
        });

        if (!result.ok) {
          setPlaybackNotice(
            getPlaybackReadinessCopyFromError(
              result.error,
              "play",
              result.resolveErrors,
            ),
          );
          return;
        }

        setSessionStream(
          result.stream,
          result.mediaInfo,
          result.sessionId,
          result.candidateId,
        );
        router.push("/player");
      } finally {
        setPlanningAction(null);
      }
      return;
    }

    try {
      const playbackStream =
        season && episode
          ? {
              ...stream,
              fileSelectionHints: {
                ...stream.fileSelectionHints,
                season,
                episode,
              },
            }
          : stream;
      const streamId = stream.infoHash || stream.url;
      const task = useDownloadStore.getState().tasks[streamId || ""];

      if (isTaskOfflinePlayable(task) && task?.localUri) {
        if (await downloadService.verifyTask(task.id)) {
          setPlaybackNotice(null);
          setStream(
            { ...playbackStream, url: task.localUri },
            {
              type: castType,
              itemId: id || "unknown",
              title: episodeTitle
                ? `${meta?.name} - ${episodeTitle}`
                : (meta?.name ?? stream.title ?? "Unknown"),
              poster: meta?.poster,
              season,
              episode,
            },
          );

          router.push("/player");
          return;
        }
      }

      const uri = await streamEngineManager.getPlaybackUri(playbackStream);
      const playable = !!uri && uri.length > 0;

      if (!playable && stream.infoHash) {
        const bridgeUp = await streamEngineManager.detectBridge();
        if (bridgeUp) {
          const retryUri =
            await streamEngineManager.getPlaybackUri(playbackStream);
          if (retryUri && retryUri.length > 0) {
            setStream(
              { ...playbackStream, url: retryUri },
              {
                type: castType,
                itemId: id || "unknown",
                title: episodeTitle
                  ? `${meta?.name} - ${episodeTitle}`
                  : (meta?.name ?? stream.title ?? "Unknown"),
                poster: meta?.poster,
                season,
                episode,
              },
            );
            router.push("/player");
            return;
          }
        }
      }

      if (!playable) {
        let msg = t("detail.errors.notPlayable");
        if (stream.infoHash) {
          if (streamEngineManager.bridgeStatus === "unsupported") {
            msg = t("detail.errors.bridgeBroken");
          } else {
            msg = t("detail.errors.torrentBridge");
          }
        }

        showPlanMessage(null, msg, "play");
        return;
      }

      setPlaybackNotice(null);
      setStream(
        uri && playbackStream.url !== uri
          ? { ...playbackStream, url: uri }
          : playbackStream,
        {
          type: castType,
          itemId: id || "unknown",
          title: episodeTitle
            ? `${meta?.name} - ${episodeTitle}`
            : (meta?.name ?? playbackStream.title ?? "Unknown"),
          poster: meta?.poster,
          season,
          episode,
        },
      );
      router.push("/player");
    } catch (err: any) {
      const message = err?.message || t("detail.errors.notPlayable");
      const failure = mapPlaybackMessageToRuntimeFailure(
        message,
        stream.infoHash ? "GATEWAY_TIMEOUT" : "SOURCE_UNAVAILABLE",
      );
      setPlaybackNotice(
        getPlaybackReadinessCopyFromError(failure.error, "play", [message]),
      );
    }
  };

  const maybePlanNextEpisode = (
    downloadedSeason?: number,
    downloadedEpisode?: number,
  ) => {
    const smartDownloads = useSmartDownloadStore.getState();
    if (
      castType !== "series" ||
      !smartDownloads.preferences.enabled ||
      !smartDownloads.preferences.autoDownloadNextEpisode ||
      typeof downloadedSeason !== "number" ||
      typeof downloadedEpisode !== "number"
    ) {
      return;
    }

    const plan = createNextEpisodePlan({
      seriesId: id || "unknown",
      title: meta?.name,
      videos: meta?.videos || [],
      downloadedSeason,
      downloadedEpisode,
    });
    if (plan) smartDownloads.planNextEpisode(plan);
  };

  const handlePlayCandidate = async (
    plan: PlaybackPlan,
    candidateId: string,
    episodeTitle?: string,
    season?: number,
    episode?: number,
  ) => {
    setPlaybackNotice(null);
    setPlanningAction("play");
    try {
      const result = await playCandidate(
        {
          type: castType,
          id: id || "unknown",
          title: meta.name,
          poster: meta.poster,
          episodeTitle,
          season,
          episode,
        },
        plan,
        candidateId,
      );
      if (!result.ok) {
        setPlaybackNotice(
          getPlaybackReadinessCopyFromError(
            result.error,
            "play",
            result.resolveErrors,
          ),
        );
        return;
      }

      setSessionStream(
        result.stream,
        result.mediaInfo,
        result.sessionId,
        result.candidateId,
      );
      router.push("/player");
    } finally {
      setPlanningAction(null);
    }
  };

  const handleDownloadStream = async (
    stream?: Stream,
    episodeTitle?: string,
    season?: number,
    episode?: number,
  ) => {
    if (!meta) return;
    setPlaybackNotice(null);
    try {
      let streamToDownload: Stream | undefined = stream;
      if (streamToDownload && season && episode) {
        streamToDownload = {
          ...streamToDownload,
          fileSelectionHints: {
            ...streamToDownload.fileSelectionHints,
            season,
            episode,
          },
        };
      }
      if (!streamToDownload) {
        setPlanningAction("download");
        try {
          const result = await prepareDownload({
            type: castType,
            id: id || "unknown",
            season,
            episode,
            title: meta.name,
            poster: meta.poster,
            episodeTitle,
          });
          if (!result.ok) {
            setPlaybackNotice(
              getPlaybackReadinessCopyFromError(
                result.error,
                "download",
                result.resolveErrors,
              ),
            );
            return;
          }

          await downloadService.startDownload(result.stream, result.mediaInfo, {
            resolvedUrl: result.resolvedUrl,
            eligibility: result.eligibility,
            playbackSession: {
              sessionId: result.sessionId,
              candidateId: result.candidateId,
              attemptId: result.attemptId,
            },
            metadataBytes: result.plan.selectedCandidate?.sizeBytes,
          });
          maybePlanNextEpisode(season, episode);
          return;
        } finally {
          setPlanningAction(null);
        }
      }

      const displayTitle = episodeTitle
        ? `${meta.name} - ${episodeTitle}`
        : meta.name;

      await downloadService.startDownload(streamToDownload, {
        itemId: id,
        type: castType,
        title: displayTitle,
        poster: meta.poster,
        season,
        episode,
      });
      maybePlanNextEpisode(season, episode);
    } catch (e) {
      showPlanMessage(null, t("detail.errors.downloadFailed"), "download");
    }
  };

  const handleCastStream = async (stream?: Stream) => {
    if (!meta) return;
    setPlaybackNotice(null);
    try {
      if (!stream) {
        setManualCastUri(null);
        setCastUsesPlanner(true);
        setCastModalOpen(true);
        return;
      }

      const uri = await streamEngineManager.getPlaybackUri(stream);
      if (!uri) {
        showPlanMessage(null, t("detail.errors.notPlayable"), "cast");
        return;
      }

      setManualCastUri(uri);
      setCastUsesPlanner(false);
      setCastModalOpen(true);
    } catch {
      showPlanMessage(null, t("detail.errors.notPlayable"), "cast");
    }
  };

  function showPlanMessage(
    plan: PlaybackPlan | null,
    fallback: string,
    action: PlaybackAction = "play",
    errors: string[] = [],
  ) {
    setPlaybackNotice(getPlaybackReadinessCopy(plan, fallback, action, errors));
  }

  const layoutProps = {
    id,
    castType,
    meta,
    streams,
    streamsLoading,
    groupedStreams,
    availableResolutions,
    selectedResolution,
    initiallyOpenSources: sourcesParam === "1",
    setSelectedResolution,
    inLibrary: !!inLibrary,
    handleToggleLibrary,
    trailerUrl,
    onWatchTrailer: handleWatchTrailer,
    handlePlayStream,
    handlePlayCandidate,
    handleDownloadStream,
    handleCastStream,
    planningAction,
    playbackNotice,
    onDismissPlaybackNotice: dismissPlaybackNotice,
    onPlaybackNoticeAction: handlePlaybackNoticeAction,
    onBack: () => goBackOrReplace(router),
  };

  return (
    <>
      {isDesktop ? (
        <DesktopDetailLayout {...layoutProps} />
      ) : (
        <MobileDetailLayout {...layoutProps} />
      )}
      {castModalOpen && (
        <DesktopCastModal
          visible={castModalOpen}
          orchestratorInput={
            castUsesPlanner
              ? {
                  type: castType,
                  id: id || "unknown",
                  title: meta.name,
                  poster: meta.poster,
                }
              : undefined
          }
          playbackUri={manualCastUri || ""}
          title={meta.name}
          onClose={() => setCastModalOpen(false)}
          onOpenSourcesDevices={() => {
            setCastModalOpen(false);
            router.push("/settings/sources" as any);
          }}
          onCastStart={(device, details) => {
            usePlayerStore.getState().clearPlayer();
            useCastStore.getState().setActiveCast({
              device,
              mediaInfo: details.source?.mediaInfo || {
                type: castType,
                itemId: id || "unknown",
                title: meta.name,
                poster: meta.poster,
              },
              sessionId: details.sessionId,
            });
            setCastModalOpen(false);
            router.push("/player");
          }}
        />
      )}
    </>
  );
}
