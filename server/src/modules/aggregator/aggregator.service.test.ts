import { describe, it, expect, vi, beforeEach } from "vitest";
import { AggregatorService } from "./aggregator.service";
import { RealDebridResolver } from "../debrid/adapters/real-debrid.resolver";
import { featureFlags } from "../feature-flag/feature-flag.service";

// Mock dependencies
vi.mock("../debrid/adapters/real-debrid.resolver");
vi.mock("../feature-flag/feature-flag.service");
vi.mock("../../prisma/client", () => ({
  prisma: {
    userAddon: { findMany: vi.fn() },
  },
}));
vi.mock("../../config/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("AggregatorService", () => {
  let service: AggregatorService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AggregatorService();
  });

  describe("resolveStream", () => {
    const mockStream = {
      userId: "user-1",
      type: "movie",
      id: "meta-1",
      infoHash: "hash123",
      requestId: "req-1",
    };

    it("should return RD direct link if RD is enabled and resolves", async () => {
      // 1. Feature flag enabled
      vi.mocked(featureFlags.getAll).mockReturnValue({
        "real-debrid": true,
        "torrent-engine": false,
        "trakt-sync": false,
        "ai-recommendations": false,
        "continue-watching": true,
        "server-driven-ui": true,
      });

      // 2. Mock Resolver
      const mockResolved = {
        url: "https://rd.com/file.mp4",
        host: "rd",
        size: 100,
      };
      vi.mocked(RealDebridResolver).mockImplementation(function (this: any) {
        this.resolve = vi.fn().mockResolvedValue(mockResolved);
        this.canResolve = vi.fn().mockReturnValue(true);
        this.getAccountStatus = vi.fn();
        return this;
      } as any);

      const result = await service.resolveStream(
        mockStream.userId,
        mockStream.type,
        mockStream.id,
        mockStream.infoHash,
        mockStream.requestId,
      );

      expect(result).toEqual(mockResolved);
    });

    it("should fallback to magnet link if RD is disabled", async () => {
      vi.mocked(featureFlags.getAll).mockReturnValue({
        "real-debrid": false,
        "torrent-engine": false,
        "trakt-sync": false,
        "ai-recommendations": false,
        "continue-watching": true,
        "server-driven-ui": true,
      });

      const result = await service.resolveStream(
        mockStream.userId,
        mockStream.type,
        mockStream.id,
        mockStream.infoHash,
        mockStream.requestId,
      );

      expect(result).toEqual({
        url: `magnet:?xt=urn:btih:${mockStream.infoHash}`,
        type: "magnet",
      });
    });

    it("should fallback to magnet link if RD fails to resolve", async () => {
      vi.mocked(featureFlags.getAll).mockReturnValue({
        "real-debrid": true,
        "torrent-engine": false,
        "trakt-sync": false,
        "ai-recommendations": false,
        "continue-watching": true,
        "server-driven-ui": true,
      });

      vi.mocked(RealDebridResolver).mockImplementation(function (this: any) {
        this.resolve = vi.fn().mockResolvedValue(null);
        this.canResolve = vi.fn().mockReturnValue(true);
        this.getAccountStatus = vi.fn();
        return this;
      } as any);

      const result = await service.resolveStream(
        mockStream.userId,
        mockStream.type,
        mockStream.id,
        mockStream.infoHash,
        mockStream.requestId,
      );

      expect(result).toEqual({
        url: `magnet:?xt=urn:btih:${mockStream.infoHash}`,
        type: "magnet",
      });
    });
  });

  describe("enrichStream & compareStreams (God-Tier Sorting)", () => {
    it("should correctly enrich streams with resolution from title", () => {
      const streams = [
        { title: "Movie.2024.4K.HDR.mp4", infoHash: "1" },
        { title: "Movie.2024.1080p.BluRay.mp4", infoHash: "2" },
        { title: "Movie.2024.720p.WEB.mp4", infoHash: "3" },
        { title: "Movie.2024.SD.mp4", infoHash: "4" },
      ] as any[];

      const enriched = streams.map((s) => (service as any).enrichStream(s));

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

      const enriched = streams.map((s) => (service as any).enrichStream(s));

      expect(enriched[0].seeders).toBe(500);
      expect(enriched[1].seeders).toBe(120);
    });

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
        (service as any).compareStreams(a, b),
      );

      expect(sorted[0].title).toBe("High Res High Seeders [S: 100]");
      expect(sorted[1].title).toBe("High Res Low Seeders [S: 10]");
      expect(sorted[2].title).toBe("Mid Res [S: 50]");
      expect(sorted[3].title).toBe("Low Res High Seeders [S: 1000]");
    });
  });
});
