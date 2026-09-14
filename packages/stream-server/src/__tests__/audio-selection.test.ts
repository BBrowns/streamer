import { describe, expect, it } from "vitest";
import { selectPreferredAudioTrack } from "../audio-selection.js";

const track = (id: string, language: string, overrides = {}) => ({
  id,
  language,
  kind: "audio",
  supported: true,
  default: false,
  audioDescription: false,
  commentary: false,
  ...overrides,
});

describe("authoritative audio preferences", () => {
  const catalog = [
    track("es", "es", { default: true }),
    track("en", "en"),
    track("nl", "nl"),
  ];
  it.each([
    [undefined, "en"],
    ["eng", "en"],
    ["en", "en"],
    ["nl", "nl"],
    [null, "es"],
  ])(
    "selects preference %s independently of the source default",
    (language, expected) => {
      expect(selectPreferredAudioTrack(catalog, language)).toBe(expected);
    },
  );
  it("does not treat missing metadata or conflicting titles as English", () => {
    expect(
      selectPreferredAudioTrack([
        track("unknown", "unknown"),
        track("es", "es", { title: "English" }),
      ]),
    ).toBeUndefined();
    expect(
      selectPreferredAudioTrack([
        track("title", "unknown", { title: "English Stereo" }),
      ]),
    ).toBe("title");
  });
  it("does not auto-select commentary or descriptive audio even when default", () => {
    expect(
      selectPreferredAudioTrack([
        track("commentary", "en", { default: true, commentary: true }),
        track("description", "en", { audioDescription: true }),
        track("main", "en"),
      ]),
    ).toBe("main");
  });
});
