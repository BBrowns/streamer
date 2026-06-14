import {
  buildTrackRows,
  findPreferredPlayerTrack,
  normalizeTrackLanguage,
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
});
