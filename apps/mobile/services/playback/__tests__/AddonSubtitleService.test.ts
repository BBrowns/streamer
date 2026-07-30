import { api } from "../../api";
import {
  getAddonSubtitles,
  loadAddonSubtitleDocument,
  mergeSubtitleTracks,
} from "../AddonSubtitleService";

jest.mock("../../api", () => ({
  api: {
    get: jest.fn(),
  },
}));

describe("AddonSubtitleService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("requests episode-specific candidates and keeps provider URLs absent", async () => {
    (api.get as jest.Mock).mockResolvedValue({
      data: {
        subtitles: [
          {
            id: "addon:one:nl",
            providerId: "one",
            providerName: "OpenSubtitles",
            language: "nl",
            format: "srt",
            source: "addon",
            label: "Nederlands",
            hearingImpaired: false,
            forced: false,
            fileHashMatch: false,
            fileNameMatch: false,
            contentIdMatch: true,
            confidence: 0.9,
            active: false,
            fetchIdentity: "123e4567-e89b-42d3-a456-426614174000",
          },
        ],
      },
    });

    const tracks = await getAddonSubtitles({
      type: "series",
      itemId: "tt123",
      title: "Example",
      season: 2,
      episode: 3,
    });

    expect(api.get).toHaveBeenCalledWith(
      "/api/aggregator/subtitles/series/tt123%3A2%3A3",
      { signal: undefined },
    );
    expect(tracks).toEqual([
      expect.objectContaining({
        source: "addon",
        providerName: "OpenSubtitles",
        fetchIdentity: "123e4567-e89b-42d3-a456-426614174000",
      }),
    ]);
    expect(JSON.stringify(tracks)).not.toMatch(/https?:|magnet:|btih/i);
  });

  it("loads a bounded raw document through its opaque identity", async () => {
    (api.get as jest.Mock).mockResolvedValue({
      data: "1\n00:00:01,000 --> 00:00:02,000\nHallo",
    });
    const track = {
      id: "addon:one:nl",
      label: "Nederlands",
      language: "nl",
      active: false,
      source: "addon" as const,
      format: "srt" as const,
      fetchIdentity: "123e4567-e89b-42d3-a456-426614174000",
    };

    await expect(loadAddonSubtitleDocument(track)).resolves.toContain("Hallo");
    expect(api.get).toHaveBeenCalledWith(
      "/api/aggregator/subtitles/document/123e4567-e89b-42d3-a456-426614174000",
      expect.objectContaining({
        responseType: "text",
        signal: undefined,
      }),
    );
  });

  it("merges providers deterministically and keeps the strongest duplicate", () => {
    const base = {
      label: "Nederlands",
      language: "nl",
      active: false,
      forced: false,
      hearingImpaired: false,
    };
    expect(
      mergeSubtitleTracks([
        {
          ...base,
          id: "weak",
          source: "torrent-file",
          confidence: 0.7,
        },
        {
          ...base,
          id: "strong",
          source: "addon",
          confidence: 0.9,
          contentIdMatch: true,
        },
      ]),
    ).toEqual([expect.objectContaining({ id: "strong" })]);
  });
});
