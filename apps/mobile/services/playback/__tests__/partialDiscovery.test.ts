import { makePlannedMediaCandidate } from "../../../test-utils/playbackPlan";
import {
  getStableCandidateSourceIdentity,
  hasNewStablePlaybackCandidate,
} from "../partialDiscovery";

describe("partial discovery candidate identity", () => {
  it("does not retry the same URL when its planner UUID changes", () => {
    const original = makePlannedMediaCandidate({
      id: "00000000-0000-4000-8000-000000000101",
      stream: { url: "https://cdn.example.test/same.mp4" },
    });
    const replanned = makePlannedMediaCandidate({
      id: "00000000-0000-4000-8000-000000000102",
      stream: { url: "https://cdn.example.test/same.mp4" },
    });

    expect(getStableCandidateSourceIdentity(original)).toBe(
      "url:https://cdn.example.test/same.mp4",
    );
    expect(hasNewStablePlaybackCandidate([original], [replanned])).toBe(false);
  });

  it("accepts a genuinely different stable source", () => {
    const original = makePlannedMediaCandidate({
      stream: { infoHash: "AAAA" },
    });
    const replacement = makePlannedMediaCandidate({
      stream: { infoHash: "BBBB" },
    });

    expect(hasNewStablePlaybackCandidate([original], [replacement])).toBe(true);
  });
});
