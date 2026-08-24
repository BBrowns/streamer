import { resolveNextEpisodeOverlayPlacement } from "../NextEpisodeOverlay";

describe("NextEpisodeOverlay placement", () => {
  it("uses a compact bottom card and a bottom-right desktop card", () => {
    expect(resolveNextEpisodeOverlayPlacement("compact")).toBe("bottom-card");
    expect(resolveNextEpisodeOverlayPlacement("medium")).toBe("bottom-right");
    expect(resolveNextEpisodeOverlayPlacement("expanded")).toBe("bottom-right");
    expect(resolveNextEpisodeOverlayPlacement("large")).toBe("bottom-right");
  });
});
