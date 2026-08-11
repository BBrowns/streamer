import type { SubtitleCandidate } from "@streamer/shared";
import {
  applySubtitleOffset,
  cuesAtTime,
  MAX_SUBTITLE_CUES,
  MAX_SUBTITLE_CUE_TEXT_LENGTH,
  parseSubtitleDocument,
} from "../SubtitleParser";
import {
  deduplicateSubtitleCandidates,
  rankSubtitleCandidates,
  selectAutomaticSubtitle,
} from "../SubtitleSelection";

const candidate = (
  overrides: Partial<SubtitleCandidate>,
): SubtitleCandidate => ({
  id: "subtitle",
  providerId: "provider",
  providerName: "Provider",
  language: "en",
  format: "vtt",
  source: "addon",
  label: "English",
  hearingImpaired: false,
  forced: false,
  fileHashMatch: false,
  fileNameMatch: false,
  contentIdMatch: false,
  confidence: 0.8,
  active: false,
  ...overrides,
});

describe("subtitle parsing", () => {
  it("normalizes SRT, multiline cues, and supported inline emphasis", () => {
    const cues = parseSubtitleDocument(
      `1
00:00:01,000 --> 00:00:03,500
Hello <b>world</b>
second line

2
00:00:03,000 --> 00:00:04,000
Overlap`,
      "srt",
    );

    expect(cues).toEqual([
      {
        id: "cue-1",
        start: 1,
        end: 3.5,
        text: "Hello world\nsecond line",
      },
      { id: "cue-2", start: 3, end: 4, text: "Overlap" },
    ]);
    expect(cuesAtTime(cues, 3.2).map((cue) => cue.text)).toEqual([
      "Hello world\nsecond line",
      "Overlap",
    ]);
  });

  it("applies sync offset without mutating parsed cues", () => {
    const cues = [{ id: "1", start: 1, end: 2, text: "Hi" }];
    expect(applySubtitleOffset(cues, 1.5)).toEqual([
      { id: "1", start: 2.5, end: 3.5, text: "Hi" },
    ]);
    expect(cues[0].start).toBe(1);
  });

  it("sanitizes script-like and unsupported cue markup", () => {
    const [cue] = parseSubtitleDocument(
      `WEBVTT

00:00:01.000 --> 00:00:02.000
<script>alert(1)</script><c.red>Hello</c>`,
      "vtt",
    );
    expect(cue.text).toBe("alert(1)Hello");
    expect(cue.text).not.toContain("<");
  });

  it("sanitizes encoded markup before it reaches subtitle rendering", () => {
    const [cue] = parseSubtitleDocument(
      `WEBVTT

00:00:01.000 --> 00:00:02.000
&lt;script&gt;alert(1)&lt;/script&gt;&lt;br/&gt;Hello`,
      "vtt",
    );

    expect(cue.text).toBe("alert(1)\nHello");
  });

  it("bounds cue count and cue text from untrusted subtitle documents", () => {
    const document = Array.from(
      { length: MAX_SUBTITLE_CUES + 2 },
      (_, index) => `00:00:01.000 --> 00:00:02.000\ncue-${index}\n`,
    ).join("\n");

    const cues = parseSubtitleDocument(document, "vtt");
    const [oversizedCue] = parseSubtitleDocument(
      `00:00:01.000 --> 00:00:02.000\n${"x".repeat(
        MAX_SUBTITLE_CUE_TEXT_LENGTH + 20,
      )}`,
      "vtt",
    );

    expect(cues).toHaveLength(MAX_SUBTITLE_CUES);
    expect(oversizedCue.text).toHaveLength(MAX_SUBTITLE_CUE_TEXT_LENGTH);
  });
});

describe("subtitle ranking", () => {
  it("deduplicates normalized identities while keeping stronger evidence", () => {
    const weak = candidate({
      id: "weak",
      language: "nld",
      releaseName: "Movie.Release",
      confidence: 0.4,
    });
    const strong = candidate({
      id: "strong",
      language: "nl",
      releaseName: "movie release",
      fileNameMatch: true,
      confidence: 0.9,
    });

    expect(deduplicateSubtitleCandidates([weak, strong])).toEqual([strong]);
  });

  it("ranks language, forced, match evidence, SDH preference, and provider order deterministically", () => {
    const ranked = rankSubtitleCandidates(
      [
        candidate({
          id: "generic",
          language: "nl",
          providerId: "second",
          confidence: 0.4,
        }),
        candidate({
          id: "matched",
          language: "nl",
          providerId: "first",
          fileNameMatch: true,
          contentIdMatch: true,
          confidence: 0.9,
        }),
        candidate({
          id: "sdh",
          language: "nl",
          providerId: "first",
          hearingImpaired: true,
          fileNameMatch: true,
          confidence: 0.9,
        }),
      ],
      {
        preferredLanguage: "nl",
        selectedAudioLanguage: "en",
        accessibilityPreference: "avoid",
        providerOrder: ["first", "second"],
      },
    );

    expect(ranked.map((item) => item.candidate.id)).toEqual([
      "matched",
      "sdh",
      "generic",
    ]);
  });

  it("does not auto-enable weak subtitles or normal subtitles when audio already matches", () => {
    const weak = candidate({ language: "nl", confidence: 0.3 });
    expect(
      selectAutomaticSubtitle([weak], {
        mode: "auto",
        preferredLanguage: "nl",
        selectedAudioLanguage: "en",
        accessibilityPreference: "neutral",
        providerOrder: [],
      }),
    ).toBeNull();

    expect(
      selectAutomaticSubtitle(
        [candidate({ language: "nl", confidence: 0.95 })],
        {
          mode: "auto",
          preferredLanguage: "nl",
          selectedAudioLanguage: "nl",
          accessibilityPreference: "neutral",
          providerOrder: [],
        },
      ),
    ).toBeNull();
  });
});
