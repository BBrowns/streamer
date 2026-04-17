import {
  View,
  Text,
  ActivityIndicator,
  Alert,
  Platform,
  useWindowDimensions,
  StyleSheet,
} from "react-native";
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
import { useTheme } from "../../../hooks/useTheme";
import { useTranslation } from "react-i18next";
import { useToastStore } from "../../../stores/toastStore";
import { hapticImpactLight, hapticSuccess } from "../../../lib/haptics";
import type { Stream } from "@streamer/shared";

import { DesktopDetailLayout } from "../../../components/detail/DesktopDetailLayout";
import { MobileDetailLayout } from "../../../components/detail/MobileDetailLayout";

export default function DetailScreen() {
  const { type, id } = useLocalSearchParams<{ type: string; id: string }>();
  const castType = type as "movie" | "series";
  const router = useRouter();
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const { data: meta, isLoading: metaLoading } = useMeta(type, id);
  const { data: streams, isLoading: streamsLoading } = useStreams(type, id);
  const setStream = usePlayerStore((s) => s.setStream);
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 1024;

  const [selectedResolution, setSelectedResolution] = useState<string | null>(
    null,
  );
  const { data: inLibrary } = useIsInLibrary(id);
  const addToLibrary = useAddToLibrary();
  const removeFromLibrary = useRemoveFromLibrary();

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
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.tint} />
      </View>
    );
  }

  if (!meta) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{t("detail.errors.notFound")}</Text>
      </View>
    );
  }

  const handlePlayStream = async (
    stream: Stream,
    episodeTitle?: string,
    season?: number,
    episode?: number,
  ) => {
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
        setStream(
          { ...stream, url: task.localUri },
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

    const uri = await streamEngineManager.getPlaybackUri(stream);
    const playable = !!uri && uri.length > 0;

    if (!playable && stream.infoHash) {
      const bridgeUp = await streamEngineManager.detectBridge();
      if (bridgeUp) {
        const retryUri = await streamEngineManager.getPlaybackUri(stream);
        if (retryUri && retryUri.length > 0) {
          setStream(stream, {
            type: castType,
            itemId: id || "unknown",
            title: episodeTitle
              ? `${meta?.name} - ${episodeTitle}`
              : (meta?.name ?? stream.title ?? "Unknown"),
            poster: meta?.poster,
            season,
            episode,
          });
          router.push("/player");
          return;
        }
      }
    }

    if (!playable) {
      const msg = stream.infoHash
        ? t("detail.errors.torrentBridge")
        : t("detail.errors.notPlayable");
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert(t("detail.errors.unsupported"), msg);
      return;
    }

    setStream(stream, {
      type: castType,
      itemId: id || "unknown",
      title: episodeTitle
        ? `${meta?.name} - ${episodeTitle}`
        : (meta?.name ?? stream.title ?? "Unknown"),
      poster: meta?.poster,
      season,
      episode,
    });
    router.push("/player");
  };

  const handleDownloadStream = async (
    stream: Stream,
    episodeTitle?: string,
    season?: number,
    episode?: number,
  ) => {
    if (!meta) return;
    try {
      const displayTitle = episodeTitle
        ? `${meta.name} - ${episodeTitle}`
        : meta.name;

      await downloadService.startDownload(stream, {
        itemId: id,
        type: castType,
        title: displayTitle,
        poster: meta.poster,
        season,
        episode,
      });
    } catch (e) {
      Alert.alert(t("common.error"), t("detail.errors.downloadFailed"));
    }
  };

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
    onBack: () => router.back(),
  };

  return isDesktop ? (
    <DesktopDetailLayout {...layoutProps} />
  ) : (
    <MobileDetailLayout {...layoutProps} />
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: { color: "#ff3b3b" },
});
