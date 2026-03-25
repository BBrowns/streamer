import { describe, it, expect } from "vitest";
import { StreamParser } from "./stream-parser";

describe("StreamParser", () => {
  describe("enrich", () => {
    it("should correctly enrich streams with resolution from title", () => {
      const streams = [
        { title: "Movie.2024.4K.HDR.mp4", infoHash: "1" },
        { title: "Movie.2024.1080p.BluRay.mp4", infoHash: "2" },
        { title: "Movie.2024.720p.WEB.mp4", infoHash: "3" },
        { title: "Movie.2024.SD.mp4", infoHash: "4" },
      ] as any[];

      const enriched = streams.map((s) => StreamParser.enrich(s));

      expect(enriched[0].resolution).toBe("2160p");
      expect(enriched[1].resolution).toBe("1080p");
      expect(enriched[2].resolution).toBe("720p");
      expect(enriched[3].resolution).toBeUndefined();
    });

    it("should correctly enrich streams with seeder counts from title", () => {
      const streams = [
        { title: "Movie [S: 500 P: 10]", infoHash: "1" },
        { title: "Movie 120 seeders", infoHash: "2" },
      ] as any[];

      const enriched = streams.map((s) => StreamParser.enrich(s));

      expect(enriched[0].seeders).toBe(500);
      expect(enriched[1].seeders).toBe(120);
    });
  });

  describe("compare", () => {
    it("should sort streams by resolution first, then seeders", () => {
      const streams = [
        {
          title: "Low Res High Seeders [S: 1000]",
          resolution: "720p",
          seeders: 1000,
        },
        {
          title: "High Res Low Seeders [S: 10]",
          resolution: "2160p",
          seeders: 10,
        },
        { title: "Mid Res [S: 50]", resolution: "1080p", seeders: 50 },
        {
          title: "High Res High Seeders [S: 100]",
          resolution: "2160p",
          seeders: 100,
        },
      ] as any[];

      const sorted = [...streams].sort((a, b) =>
        StreamParser.compare(a as any, b as any),
      );

      expect(sorted[0].title).toBe("High Res High Seeders [S: 100]");
      expect(sorted[1].title).toBe("High Res Low Seeders [S: 10]");
      expect(sorted[2].title).toBe("Mid Res [S: 50]");
      expect(sorted[3].title).toBe("Low Res High Seeders [S: 1000]");
    });
  });
});
