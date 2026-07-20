import { getSafeTrailerUrl } from "../trailer";

describe("getSafeTrailerUrl", () => {
  it("turns a provider YouTube id into a safe trailer URL", () => {
    expect(getSafeTrailerUrl([{ source: "dQw4w9WgXcQ" }])).toBe(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
  });

  it("allows HTTPS YouTube URLs and ignores arbitrary provider links", () => {
    expect(
      getSafeTrailerUrl([
        { source: "https://example.test/trailer" },
        { source: "https://youtu.be/dQw4w9WgXcQ" },
      ]),
    ).toBe("https://youtu.be/dQw4w9WgXcQ");
  });

  it("returns null when no provider trailer is safe", () => {
    expect(getSafeTrailerUrl([{ source: "javascript:alert(1)" }])).toBeNull();
  });
});
