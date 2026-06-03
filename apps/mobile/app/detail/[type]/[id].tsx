import {
  View,
  Text,
  ActivityIndicator,
  Platform,
  Pressable,
  useWindowDimensions,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as FileSystem from "expo-file-system";
import { useState, useEffect, useCallback } from "react";
import { useMeta } from "../../../hooks/useMeta";
import { useStreams } from "../../../hooks/useStreams";
import { usePlayerStore } from "../../../stores/playerStore";
import {
  useAddToLibrary,
  useIsInLibrary,
  useRemoveFromLibrary,
} from "../../../hooks/useLibrary";
import { streamEngineManager } from "../../../services/streamEngine/StreamEngineManager";
import { useDownloadStore } from "../../../stores/downloadStore";
import { downloadService } from "../../../services/DownloadService";
import { useTranslation } from "react-i18next";
import { useToastStore } from "../../../stores/toastStore";
import { hapticImpactLight, hapticSuccess } from "../../../lib/haptics";
import { goBackOrReplace } from "../../../lib/navigation";
import type { PlaybackAction, PlaybackPlan, Stream } from "@streamer/shared";
import {
  createPlaybackPlanWithBridgeRetry,
  resolvePlaybackPlan,
} from "../../../services/playback/PlaybackPlanService";
import {
  playBest,
  prepareDownload,
} from "../../../services/playback/PlaybackOrchestrator";
import { DesktopCastModal } from "../../../components/DesktopCastModal";

import { DesktopDetailLayout } from "../../../components/detail/DesktopDetailLayout";
import { MobileDetailLayout } from "../../../components/detail/MobileDetailLayout";
import {
  getPlaybackReadinessCopy,
  getPlaybackReadinessCopyFromError,
  type PlaybackReadinessNoticeCopy,
} from "../../../components/detail/PlaybackReadinessNotice";

export default function DetailScreen() {
  const { type, id } = useLocalSearchParams<{ type: string; id: string }>();
  const castType = type as "movie" | "series";
  const router = useRouter();
  const { t } = useTranslation();
  const { data: meta, isLoading: metaLoading } = useMeta(type, id);
  const { data: streams, isLoading: streamsLoading } = useStreams(type, id);
  const setStream = usePlayerStore((s) => s.setStream);
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 1024;

  const [selectedResolution, setSelectedResolution] = useState<string | null>(
    null,
  );
  const [castModalOpen, setCastModalOpen] = useState(false);
  const [plannedCastUri, setPlannedCastUri] = useState<string | null>(null);
  const [planningAction, setPlanningAction] = useState<
    "play" | "download" | "cast" | null
  >(null);
  const [playbackNotice, setPlaybackNotice] =
    useState<PlaybackReadinessNoticeCopy | null>(null);
  const { data: inLibrary } = useIsInLibrary(id);
  const addToLibrary = useAddToLibrary();
  const removeFromLibrary = useRemoveFromLibrary();

  const dismissPlaybackNotice = useCallback(() => {
    setPlaybackNotice(null);
  }, []);

  const openSourcesDevices = useCallback(() => {
    setPlaybackNotice(null);
    router.push("/settings");
  }, [router]);

  const handleToggleLibrary = useCallback(() => {
    if (!meta) return;
    hapticImpactLight();
    const { show } = useToastStore.getState();
    if (inLibrary) {
      removeFromLibrary.mutate(id, {
        onSuccess: () => show(t("library.alerts.removed"), "info"),
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

  if (metaLoading) {
    return (
      <View style={styles.cinemaCentered}>
        <ActivityIndicator size="large" color="#d8b4fe" />
      </View>
    );
  }

  if (!meta) {
    return (
      <View style={styles.cinemaCentered}>
        <Pressable
          style={styles.errorBackButton}
          onPress={() => goBackOrReplace(router)}
        >
          <Ionicons name="chevron-back" size={20} color="#f2d7ff" />
          <Text style={styles.errorBackText}>Back</Text>
        </Pressable>
        <Text style={styles.errorText}>{t("detail.errors.notFound")}</Text>
      </View>
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

        setStream(result.stream, result.mediaInfo, result.fallbackStreams);
        router.push("/player");
      } finally {
        setPlanningAction(null);
      }
      return;
    }

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

    if (
      task?.status === "Completed" &&
      task.localUri &&
      task.localUri.length > 5
    ) {
      let fileExists = true;

      if (Platform.OS === "web") {
        const desktopBridge = (window as any).desktopBridge;
        if (desktopBridge) {
          try {
            fileExists = await desktopBridge.checkFile(task.localUri);
          } catch (e) {}
        }
      } else {
        try {
          const info = await FileSystem.getInfoAsync(task.localUri);
          fileExists = info.exists;
        } catch {
          // ignore
        }
      }

      if (!fileExists) {
        useDownloadStore.getState().verifyAndClean();
      } else {
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
          });
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
    } catch (e) {
      showPlanMessage(null, t("detail.errors.downloadFailed"), "download");
    }
  };

  const handleCastStream = async (stream?: Stream) => {
    if (!meta) return;
    setPlaybackNotice(null);
    try {
      let streamToCast: Stream | undefined = stream;
      let uri: string | null = null;
      if (!streamToCast) {
        setPlanningAction("cast");
        try {
          const plan = await createPlaybackPlanWithBridgeRetry({
            type: castType,
            id: id || "unknown",
            action: "cast",
          });
          const result = await resolvePlaybackPlan(plan);
          const resolved = result.resolved;
          if (!resolved) {
            showPlanMessage(
              plan,
              t("detail.errors.notPlayable"),
              "cast",
              result.errors,
            );
            return;
          }
          streamToCast = resolved.stream;
          uri = resolved.uri;
        } finally {
          setPlanningAction(null);
        }
      }

      if (!streamToCast) {
        showPlanMessage(null, t("detail.errors.notPlayable"));
        return;
      }

      uri = uri || (await streamEngineManager.getPlaybackUri(streamToCast));
      if (!uri) {
        showPlanMessage(null, t("detail.errors.notPlayable"));
        return;
      }

      setPlannedCastUri(uri);
      setCastModalOpen(true);
    } catch {
      showPlanMessage(null, t("detail.errors.notPlayable"));
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
    setSelectedResolution,
    inLibrary: !!inLibrary,
    handleToggleLibrary,
    handlePlayStream,
    handleDownloadStream,
    handleCastStream,
    planningAction,
    playbackNotice,
    onDismissPlaybackNotice: dismissPlaybackNotice,
    onOpenSourcesDevices: openSourcesDevices,
    onBack: () => goBackOrReplace(router),
  };

  return (
    <>
      {isDesktop ? (
        <DesktopDetailLayout {...layoutProps} />
      ) : (
        <MobileDetailLayout {...layoutProps} />
      )}
      {plannedCastUri && (
        <DesktopCastModal
          visible={castModalOpen}
          playbackUri={plannedCastUri}
          title={meta.name}
          onClose={() => setCastModalOpen(false)}
          onCastStart={() => setCastModalOpen(false)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  cinemaCentered: {
    flex: 1,
    backgroundColor: "#11121c",
    justifyContent: "center",
    alignItems: "center",
  },
  errorBackButton: {
    position: "absolute",
    top: 28,
    left: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  errorBackText: {
    color: "#f2d7ff",
    fontWeight: "800",
  },
  errorText: { color: "#ff9ba6" },
});
