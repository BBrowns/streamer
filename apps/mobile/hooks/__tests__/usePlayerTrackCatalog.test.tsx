import { renderHook, waitFor } from "@testing-library/react-native";
import type { PlaybackRoute } from "@streamer/shared";

import type { MediaInfo } from "../../stores/playerStore";
import { getAddonSubtitles } from "../../services/playback/AddonSubtitleService";
import { usePlayerTrackCatalog } from "../usePlayerTrackCatalog";

jest.mock("../../services/playback/AddonSubtitleService", () => ({
  getAddonSubtitles: jest.fn(),
  loadAddonSubtitleDocument: jest.fn(),
}));

const mockedGetAddonSubtitles = jest.mocked(getAddonSubtitles);

const mediaInfo: MediaInfo = {
  type: "movie",
  itemId: "movie-1",
  title: "Example movie",
};

const route: PlaybackRoute = {
  candidateId: "candidate-1",
  executionTarget: "on-device",
  delivery: "range-http",
  capabilities: {
    seek: "immediate",
    audioTracks: true,
    embeddedSubtitles: true,
    externalSubtitles: true,
    cast: true,
    offline: false,
    thumbnails: false,
  },
};

function createOptions() {
  const engineTrackListener = jest.fn();
  const adapterListener = jest.fn();
  const engine = {
    getSubtitles: jest.fn(() => [
      {
        id: "engine:nl",
        label: "Original",
        language: "nl",
        active: false,
        source: "torrent-file" as const,
      },
    ]),
    on: jest.fn((_event, listener) => {
      engineTrackListener.mockImplementation(listener);
    }),
    off: jest.fn(),
    refreshTrackCatalog: jest.fn().mockResolvedValue(undefined),
  } as any;
  const mediaAdapter = {
    getCapabilities: jest.fn(() => ({
      target: "web",
      sourceReplacement: true,
      playerVolume: true,
      fullscreen: true,
      pictureInPicture: true,
      nativeThumbnails: false,
      audioTracks: true,
      embeddedSubtitles: true,
    })),
    getAudioTracks: jest.fn(() => [
      {
        id: "audio:nl",
        kind: "audio" as const,
        language: "nl",
        label: "Nederlands",
        active: true,
        isDefault: true,
        autoSelect: true,
      },
    ]),
    getSubtitleTracks: jest.fn(() => []),
    subscribe: jest.fn((listener) => {
      adapterListener.mockImplementation(listener);
      return jest.fn();
    }),
  } as any;

  return {
    options: {
      mediaInfo,
      engine,
      engineSubtitles: engine.getSubtitles(),
      playbackRoute: route,
      playbackUri: "runtime-source",
      player: {},
      mediaAdapter,
      setAudioTracks: jest.fn(),
      setSubtitles: jest.fn(),
      recordDiagnostic: jest.fn(),
    },
    engineTrackListener,
    adapterListener,
  };
}

describe("usePlayerTrackCatalog", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetAddonSubtitles.mockResolvedValue([
      {
        id: "addon:nl",
        label: "Nederlands",
        language: "nl",
        active: false,
        source: "addon",
        confidence: 0.9,
        contentIdMatch: true,
      },
    ]);
  });

  it("coordinates engine, native, and add-on tracks into one catalog", async () => {
    const { options } = createOptions();
    const { result } = renderHook(() => usePlayerTrackCatalog(options));

    await waitFor(() =>
      expect(result.current.subtitles).toEqual([
        expect.objectContaining({ id: "addon:nl" }),
        expect.objectContaining({ id: "engine:nl" }),
      ]),
    );

    expect(result.current.audioTracks).toEqual([
      expect.objectContaining({ id: "audio:nl", active: true }),
    ]);
    expect(mockedGetAddonSubtitles).toHaveBeenCalledWith(
      mediaInfo,
      expect.any(AbortSignal),
    );
    expect(options.engine.refreshTrackCatalog).toHaveBeenCalled();
  });

  it("refreshes the catalog when either runtime source reports new tracks", async () => {
    const { options, engineTrackListener, adapterListener } = createOptions();
    const { result } = renderHook(() => usePlayerTrackCatalog(options));
    await waitFor(() =>
      expect(options.mediaAdapter.subscribe).toHaveBeenCalled(),
    );

    engineTrackListener();
    adapterListener({ type: "tracks_changed" });
    expect(result.current.refreshPlayerTracks).toBeDefined();
    expect(options.mediaAdapter.getAudioTracks).toHaveBeenCalledTimes(3);
  });
});
