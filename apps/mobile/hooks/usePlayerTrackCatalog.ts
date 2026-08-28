import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { PlaybackRoute } from "@streamer/shared";

import type { MediaInfo } from "../stores/playerStore";
import type {
  AudioTrack,
  IStreamEngine,
  SubtitleTrack,
} from "../services/streamEngine/IStreamEngine";
import {
  getAddonSubtitles,
  loadAddonSubtitleDocument,
} from "../services/playback/AddonSubtitleService";
import {
  buildMediaAdapterTrackCatalog,
  mergeSubtitleTracks,
} from "../services/playback/trackSelection";
import type { MediaPlayerAdapter } from "../services/playback/MediaPlayerAdapter";
import {
  parseSubtitleDocument,
  type SubtitleCue,
} from "../services/playback/SubtitleParser";
import type { PlaybackDiagnosticEvent } from "../services/playback/PlaybackDiagnostics";

interface UsePlayerTrackCatalogOptions {
  mediaInfo: MediaInfo | null;
  engine: IStreamEngine | null;
  engineSubtitles: SubtitleTrack[];
  playbackRoute: PlaybackRoute | null;
  playbackUri: string | null;
  player: unknown | null;
  mediaAdapter: MediaPlayerAdapter;
  setAudioTracks: Dispatch<SetStateAction<AudioTrack[]>>;
  setSubtitles: Dispatch<SetStateAction<SubtitleTrack[]>>;
  recordDiagnostic: (event: PlaybackDiagnosticEvent) => void;
}

interface PlayerTrackCatalog {
  addonSubtitles: SubtitleTrack[];
  audioTracks: AudioTrack[];
  subtitles: SubtitleTrack[];
  externalSubtitleCues: SubtitleCue[];
  subtitleLoadState: "idle" | "loading" | "ready" | "error";
  trackCatalogRevision: number;
  handleSubtitleSelection: (id: string | null) => Promise<void>;
  refreshPlayerTracks: () => void;
}

/**
 * Owns the runtime track catalog for a player attempt. Engine metadata,
 * native adapter tracks, and add-on subtitle candidates arrive through
 * different lifecycles; this hook keeps their merge and document loading
 * policy in one place while exposing only safe, normalized track rows.
 */
export function usePlayerTrackCatalog({
  mediaInfo,
  engine,
  engineSubtitles,
  playbackRoute,
  playbackUri,
  player,
  mediaAdapter,
  setAudioTracks,
  setSubtitles,
  recordDiagnostic,
}: UsePlayerTrackCatalogOptions): PlayerTrackCatalog {
  const [addonSubtitles, setAddonSubtitles] = useState<SubtitleTrack[]>([]);
  const [audioTracks, setCatalogAudioTracks] = useState<AudioTrack[]>([]);
  const [externalSubtitleCues, setExternalSubtitleCues] = useState<
    SubtitleCue[]
  >([]);
  const [subtitleLoadState, setSubtitleLoadState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [trackCatalogRevision, setTrackCatalogRevision] = useState(0);
  const subtitleDocumentControllerRef = useRef<AbortController | null>(null);

  const subtitles = useMemo(
    () => mergeSubtitleTracks([...engineSubtitles, ...addonSubtitles]),
    [addonSubtitles, engineSubtitles],
  );
  const routeAllowsAudioTracks =
    playbackRoute?.capabilities.audioTracks ?? true;
  const routeAllowsEmbeddedSubtitles =
    playbackRoute?.capabilities.embeddedSubtitles ?? true;
  const routeAllowsExternalSubtitles =
    playbackRoute?.capabilities.externalSubtitles ?? true;

  useEffect(() => {
    setAddonSubtitles([]);
    if (!mediaInfo) return;

    const controller = new AbortController();
    const startedAt = Date.now();
    void getAddonSubtitles(mediaInfo, controller.signal)
      .then((tracks) => {
        if (controller.signal.aborted) return;
        recordDiagnostic({
          type: "subtitle_provider",
          outcome: "succeeded",
          latencyMs: Date.now() - startedAt,
        });
        setAddonSubtitles(tracks);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        recordDiagnostic({
          type: "subtitle_provider",
          outcome: "failed",
          latencyMs: Date.now() - startedAt,
        });
        setAddonSubtitles([]);
      });
    return () => controller.abort();
  }, [
    mediaInfo?.episode,
    mediaInfo?.itemId,
    mediaInfo?.season,
    mediaInfo?.type,
    recordDiagnostic,
  ]);

  const refreshPlayerTracks = useCallback(() => {
    const runtimeSubtitles = engine?.getSubtitles() || [];
    if (!player) {
      setCatalogAudioTracks([]);
      setAudioTracks([]);
      setSubtitles(routeAllowsExternalSubtitles ? runtimeSubtitles : []);
      return;
    }

    const adapterCapabilities = mediaAdapter.getCapabilities();
    const catalog = buildMediaAdapterTrackCatalog({
      capabilities: {
        audioTracks: adapterCapabilities.audioTracks && routeAllowsAudioTracks,
        embeddedSubtitles:
          adapterCapabilities.embeddedSubtitles && routeAllowsEmbeddedSubtitles,
      },
      mediaAudioTracks: mediaAdapter.getAudioTracks(),
      mediaSubtitleTracks: mediaAdapter.getSubtitleTracks(),
      engineSubtitles: routeAllowsExternalSubtitles ? runtimeSubtitles : [],
    });
    setCatalogAudioTracks(catalog.audioTracks);
    setAudioTracks(catalog.audioTracks);
    setSubtitles(catalog.subtitles);
  }, [
    engine,
    mediaAdapter,
    player,
    routeAllowsAudioTracks,
    routeAllowsEmbeddedSubtitles,
    routeAllowsExternalSubtitles,
    setAudioTracks,
    setSubtitles,
  ]);

  const handleSubtitleSelection = useCallback(
    async (id: string | null) => {
      subtitleDocumentControllerRef.current?.abort();
      subtitleDocumentControllerRef.current = null;
      setExternalSubtitleCues([]);
      setSubtitleLoadState("idle");
      const addonTrack = id
        ? addonSubtitles.find((track) => track.id === id)
        : undefined;

      if (mediaAdapter.selectSubtitleTrack(id)) {
        engine?.setSubtitle(null);
        setAddonSubtitles((tracks) =>
          tracks.map((track) => ({ ...track, active: false })),
        );
        refreshPlayerTracks();
        return;
      }

      if (!id) {
        engine?.setSubtitle(null);
        setAddonSubtitles((tracks) =>
          tracks.map((track) => ({ ...track, active: false })),
        );
        refreshPlayerTracks();
        return;
      }

      mediaAdapter.selectSubtitleTrack(null);
      if (addonTrack) {
        engine?.setSubtitle(null);
        setAddonSubtitles((tracks) =>
          tracks.map((track) => ({ ...track, active: track.id === id })),
        );
      } else {
        engine?.setSubtitle(id);
        setAddonSubtitles((tracks) =>
          tracks.map((track) => ({ ...track, active: false })),
        );
      }
      if (!addonTrack && !engine?.loadSubtitleDocument) {
        refreshPlayerTracks();
        return;
      }

      const controller = new AbortController();
      subtitleDocumentControllerRef.current = controller;
      setSubtitleLoadState("loading");
      try {
        const document = addonTrack
          ? await loadAddonSubtitleDocument(addonTrack, controller.signal)
          : await engine!.loadSubtitleDocument!(id, controller.signal);
        if (controller.signal.aborted) return;
        const cues = parseSubtitleDocument(
          document,
          addonTrack?.format || "vtt",
        );
        if (cues.length === 0) {
          throw new Error("Subtitle document contains no usable cues");
        }
        recordDiagnostic({
          type: "subtitle_parse",
          outcome: "succeeded",
          cueCount: cues.length,
        });
        setExternalSubtitleCues(cues);
        setSubtitleLoadState("ready");
      } catch {
        if (controller.signal.aborted) return;
        recordDiagnostic({
          type: "subtitle_parse",
          outcome: "failed",
        });
        engine?.setSubtitle(null);
        setAddonSubtitles((tracks) =>
          tracks.map((track) => ({ ...track, active: false })),
        );
        setExternalSubtitleCues([]);
        setSubtitleLoadState("error");
      } finally {
        if (subtitleDocumentControllerRef.current === controller) {
          subtitleDocumentControllerRef.current = null;
        }
        refreshPlayerTracks();
      }
    },
    [
      addonSubtitles,
      engine,
      mediaAdapter,
      recordDiagnostic,
      refreshPlayerTracks,
    ],
  );

  useEffect(() => {
    return () => {
      subtitleDocumentControllerRef.current?.abort();
      subtitleDocumentControllerRef.current = null;
      setExternalSubtitleCues([]);
      setSubtitleLoadState("idle");
    };
  }, [engine, playbackUri]);

  useEffect(() => {
    setCatalogAudioTracks([]);
    setAudioTracks([]);
    setSubtitles(engine?.getSubtitles() || []);
    if (!engine) return;

    const controller = new AbortController();
    const handleEngineTracks = () => refreshPlayerTracks();
    engine.on("tracks", handleEngineTracks);
    void engine.refreshTrackCatalog?.(controller.signal).catch(() => {
      // Track discovery is optional. Native tracks and playback stay usable
      // when the bridge cannot provide richer metadata.
    });

    return () => {
      controller.abort();
      engine.off("tracks", handleEngineTracks);
    };
  }, [engine, playbackUri, refreshPlayerTracks, setAudioTracks, setSubtitles]);

  useEffect(() => {
    if (!player) return;

    refreshPlayerTracks();
    return mediaAdapter.subscribe((event) => {
      if (event.type === "tracks_changed") {
        refreshPlayerTracks();
        return;
      }
      if (event.type === "source_loaded") {
        refreshPlayerTracks();
        setTrackCatalogRevision((revision) => revision + 1);
      }
    });
  }, [mediaAdapter, player, refreshPlayerTracks]);

  return {
    addonSubtitles,
    audioTracks,
    subtitles,
    externalSubtitleCues,
    subtitleLoadState,
    trackCatalogRevision,
    handleSubtitleSelection,
    refreshPlayerTracks,
  };
}
