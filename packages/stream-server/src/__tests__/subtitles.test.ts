import { beforeEach, describe, expect, it, vi } from "vitest";
import { legacySubtitlesRetiredRequest } from "../subtitles.js";

describe("legacy subtitle routes", () => {
  let response: {
    set: ReturnType<typeof vi.fn>;
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    response = {
      set: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
  });

  it("fails closed without reflecting or processing a raw magnet", () => {
    const magnet = "magnet:?xt=urn:btih:sensitive";

    legacySubtitlesRetiredRequest(
      { query: { magnet }, params: { id: "external:1" } } as any,
      response as any,
    );

    expect(response.set).toHaveBeenCalledWith("Cache-Control", "no-store");
    expect(response.status).toHaveBeenCalledWith(410);
    expect(response.json).toHaveBeenCalledWith({
      error: "Legacy subtitle endpoint retired",
      code: "LEGACY_SUBTITLE_ENDPOINT_RETIRED",
      replacement: "/api/gateway/jobs/:id/subtitles/:identity",
    });
    expect(JSON.stringify(response.json.mock.calls)).not.toContain(magnet);
  });
});
