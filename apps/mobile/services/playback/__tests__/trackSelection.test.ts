import {
  buildMediaAdapterTrackCatalog,
  buildPlayerTrackCatalog,
  buildTrackRows,
  findPreferredPlayerTrack,
  formatMediaTrackLabel,
  normalizeTrackLanguage,
  rankAudioTracks,
} from "../trackSelection";

describe("trackSelection", () => {
  it("normalizes common ISO-639 audio and subtitle language aliases", () => {
    expect(normalizeTrackLanguage("eng")).toBe("en");
    expect(normalizeTrackLanguage("nld")).toBe("nl");
    expect(normalizeTrackLanguage("dut")).toBe("nl");
    expect(normalizeTrackLanguage("spa")).toBe("es");
    expect(normalizeTrackLanguage("pt-BR")).toBe("pt");
    expect(normalizeTrackLanguage(null)).toBe("unknown");
  });

  it("maps Expo tracks into stable rows with active state", () => {
    const tracks = [
      { id: "1", language: "eng", label: "English" },
      { id: "2", language: "spa", label: "Spanish" },
    ];

    expect(buildTrackRows(tracks, tracks[1])).toEqual([
      { id: "1", label: "English", language: "en", active: false },
      { id: "2", label: "Spanish", language: "es", active: true },
    ]);
  });

  it("exposes only native-switchable audio while merging native and gateway subtitles", () => {
    const nativeAudio = [
      { id: "native-audio", language: "eng", label: "English" },
    ];
    const nativeSubtitles = [
      { id: "native-en", language: "eng", label: "English" },
    ];

    const catalog = buildPlayerTrackCatalog({
      availableAudioTracks: nativeAudio,
      activeAudioTrack: nativeAudio[0],
      availableSubtitleTracks: nativeSubtitles,
      activeSubtitleTrack: nativeSubtitles[0],
      engineSubtitles: [
        {
          id: "gateway-en",
          label: "English",
          language: "en",
          active: false,
          source: "embedded",
        },
        {
          id: "gateway-nl",
          label: "Nederlands",
          language: "nl",
          active: false,
          source: "torrent-file",
          fetchIdentity: "opaque-nl",
        },
      ],
    });

    expect(catalog.audioTracks).toEqual([
      expect.objectContaining({ id: "native-audio", active: true }),
    ]);
    expect(catalog.subtitles).toEqual([
      expect.objectContaining({
        id: "native-en",
        active: true,
        source: "embedded",
      }),
      expect.objectContaining({
        id: "gateway-nl",
        source: "torrent-file",
        fetchIdentity: "opaque-nl",
      }),
    ]);
  });

  it("uses media-adapter capabilities as the authority for selectable tracks", () => {
    const mediaAudioTracks = [
      {
        id: "adapter-audio",
        kind: "audio" as const,
        language: "eng",
        label: "English",
        active: true,
        isDefault: true,
        autoSelect: true,
      },
    ];
    const mediaSubtitleTracks = [
      {
        id: "adapter-subtitle",
        kind: "subtitle" as const,
        language: "nld",
        label: "Nederlands",
        active: true,
        isDefault: false,
        autoSelect: false,
      },
    ];
    const engineSubtitles = [
      {
        id: "bridge-subtitle",
        label: "English",
        language: "en",
        active: false,
        source: "torrent-file" as const,
        fetchIdentity: "opaque-document",
      },
    ];

    expect(
      buildMediaAdapterTrackCatalog({
        capabilities: { audioTracks: true, embeddedSubtitles: true },
        mediaAudioTracks,
        mediaSubtitleTracks,
        engineSubtitles,
      }),
    ).toEqual({
      audioTracks: [
        expect.objectContaining({
          id: "adapter-audio",
          language: "en",
          active: true,
        }),
      ],
      subtitles: [
        expect.objectContaining({
          id: "bridge-subtitle",
          source: "torrent-file",
        }),
        expect.objectContaining({
          id: "adapter-subtitle",
          source: "embedded",
        }),
      ],
    });

    expect(
      buildMediaAdapterTrackCatalog({
        capabilities: { audioTracks: false, embeddedSubtitles: false },
        mediaAudioTracks,
        mediaSubtitleTracks,
        engineSubtitles,
      }),
    ).toEqual({
      audioTracks: [],
      subtitles: engineSubtitles,
    });
  });

  it("expands accessibility track abbreviations into understandable labels", () => {
    expect(formatMediaTrackLabel("English AD", "audio")).toBe(
      "English AD (Audio description)",
    );
    expect(formatMediaTrackLabel("English SDH", "subtitle")).toBe(
      "English SDH (Captions for deaf and hard of hearing)",
    );
    expect(formatMediaTrackLabel("English", "audio")).toBe("English");
  });

  it("finds the preferred track by normalized language before falling back to default", () => {
    const tracks = [
      { id: "1", language: "spa", label: "Audio Latino", isDefault: true },
      { id: "2", language: "eng", label: "English" },
    ];

    expect(findPreferredPlayerTrack(tracks, "en")).toEqual(tracks[1]);
    expect(findPreferredPlayerTrack(tracks, "nl")).toEqual(tracks[0]);
  });

  it("returns null when no track preference can be applied", () => {
    expect(findPreferredPlayerTrack([], "en")).toBeNull();
    expect(findPreferredPlayerTrack([{ language: "", label: "" }], null)).toBe(
      null,
    );
  });

  it("ranks main, compatible audio ahead of commentary deterministically", () => {
    const tracks = [
      {
        id: "commentary",
        streamIndex: 2,
        kind: "audio" as const,
        language: "en",
        title: "Director commentary",
        codec: "aac",
        default: true,
        forced: false,
        hearingImpaired: false,
        audioDescription: false,
        commentary: true,
        source: "embedded" as const,
        supported: true,
      },
      {
        id: "main",
        streamIndex: 1,
        kind: "audio" as const,
        language: "en",
        title: "English",
        codec: "eac3",
        channelCount: 6,
        channelLayout: "5.1",
        default: false,
        forced: false,
        hearingImpaired: false,
        audioDescription: false,
        commentary: false,
        source: "embedded" as const,
        supported: true,
      },
    ];

    expect(
      rankAudioTracks(tracks, {
        preferredLanguages: ["en"],
        preferOriginalLanguage: false,
        preferAudioDescription: false,
        supportedCodecs: ["aac", "eac3"],
      })[0].track.id,
    ).toBe("main");
  });

  it("lets an explicit choice and audio-description preference override defaults", () => {
    const tracks = [
      {
        id: "main",
        streamIndex: 1,
        kind: "audio" as const,
        language: "en",
        codec: "aac",
        default: true,
        forced: false,
        hearingImpaired: false,
        audioDescription: false,
        commentary: false,
        source: "embedded" as const,
        supported: true,
      },
      {
        id: "description",
        streamIndex: 2,
        kind: "audio" as const,
        language: "en",
        codec: "aac",
        default: false,
        forced: false,
        hearingImpaired: false,
        audioDescription: true,
        commentary: false,
        source: "embedded" as const,
        supported: true,
      },
    ];

    expect(
      rankAudioTracks(tracks, {
        explicitTrackId: "description",
        preferredLanguages: ["en"],
        preferOriginalLanguage: false,
        preferAudioDescription: false,
      })[0].track.id,
    ).toBe("description");
    expect(
      rankAudioTracks(tracks, {
        preferredLanguages: ["en"],
        preferOriginalLanguage: false,
        preferAudioDescription: true,
      })[0].track.id,
    ).toBe("description");
  });
});
