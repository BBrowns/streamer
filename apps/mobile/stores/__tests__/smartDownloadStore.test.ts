import {
  DEFAULT_SMART_DOWNLOAD_PREFERENCES,
  useSmartDownloadStore,
} from "../smartDownloadStore";

describe("smartDownloadStore", () => {
  beforeEach(() => {
    useSmartDownloadStore.getState().resetSmartDownloads();
  });

  afterEach(() => {
    useSmartDownloadStore.getState().resetSmartDownloads();
  });

  it("keeps smart downloads disabled by default", () => {
    const state = useSmartDownloadStore.getState();

    expect(state.preferences).toMatchObject({
      ...DEFAULT_SMART_DOWNLOAD_PREFERENCES,
      enabled: false,
      autoDownloadNextEpisode: false,
      autoDeleteWatched: false,
      wifiOnly: true,
    });
    expect(state.getNextEpisodePlan("series-1")).toBeNull();
  });

  it("stores opt-in next-episode plans with safe limits", () => {
    const store = useSmartDownloadStore.getState();

    store.updatePreferences({
      enabled: true,
      autoDownloadNextEpisode: true,
      quality: "720p",
      storageLimitGb: 2,
    });
    store.planNextEpisode({
      seriesId: "series-1",
      title: "Example Show",
      season: 1,
      episode: 3,
      episodeTitle: "The Third",
      status: "planned",
    });

    expect(useSmartDownloadStore.getState().preferences).toMatchObject({
      enabled: true,
      autoDownloadNextEpisode: true,
      quality: "720p",
      storageLimitGb: 2,
    });
    expect(
      useSmartDownloadStore.getState().getNextEpisodePlan("series-1"),
    ).toMatchObject({
      seriesId: "series-1",
      season: 1,
      episode: 3,
      status: "planned",
    });
  });

  it("removes per-series plans when smart downloads are disabled", () => {
    const store = useSmartDownloadStore.getState();

    store.updatePreferences({ enabled: true, autoDownloadNextEpisode: true });
    store.planNextEpisode({
      seriesId: "series-1",
      title: "Example Show",
      season: 1,
      episode: 4,
      status: "planned",
    });

    store.updatePreferences({ enabled: false });

    expect(useSmartDownloadStore.getState().nextEpisodePlans).toEqual({});
    expect(
      useSmartDownloadStore.getState().getNextEpisodePlan("series-1"),
    ).toBeNull();
  });
});
