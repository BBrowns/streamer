import {
  getUnsupportedWebCodecReason,
  isLikelyHevcStream,
} from "../codecSupport";

describe("codecSupport", () => {
  const originalDocument = global.document;

  afterEach(() => {
    Object.defineProperty(global, "document", {
      configurable: true,
      value: originalDocument,
    });
  });

  it("detects HEVC/H.265/Dolby Vision torrent labels", () => {
    expect(
      isLikelyHevcStream({
        title: "Movie.2026.2160p.WEB-DL.DV.HDR.H265.MP4",
      }),
    ).toBe(true);
    expect(isLikelyHevcStream({ title: "Movie.1080p.x264.MP4" })).toBe(false);
  });

  it("returns a web codec warning when HEVC cannot be played", () => {
    Object.defineProperty(global, "document", {
      configurable: true,
      value: {
        createElement: () => ({
          canPlayType: () => "",
        }),
      },
    });

    expect(
      getUnsupportedWebCodecReason(
        { title: "Show.S01E01.2160p.HEVC.WEB-DL" },
        () => false,
      ),
    ).toContain("HEVC");
  });

  it("does not warn for browsers that report HEVC support", () => {
    Object.defineProperty(global, "document", {
      configurable: true,
      value: {
        createElement: () => ({
          canPlayType: () => "probably",
        }),
      },
    });

    expect(
      getUnsupportedWebCodecReason(
        { title: "Show.S01E01.2160p.HEVC.WEB-DL" },
        () => true,
      ),
    ).toBeNull();
  });
});
