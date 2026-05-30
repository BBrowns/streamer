import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";
import { AggregatorService, buildCatalogPath } from "./aggregator.service";
import { RealDebridResolver } from "../debrid/adapters/real-debrid.resolver";
import { featureFlags } from "../feature-flag/feature-flag.service";
import { prisma } from "../../prisma/client";

// Mock dependencies
vi.mock("axios");
vi.mock("../debrid/adapters/real-debrid.resolver");
vi.mock("../feature-flag/feature-flag.service");
vi.mock("../../prisma/client", () => ({
  prisma: {
    installedAddon: { findMany: vi.fn(), findFirst: vi.fn() },
  },
}));
vi.mock("../../utils/security", () => ({
  validateSafeUrl: vi.fn().mockResolvedValue(undefined),
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

  describe("catalog paths", () => {
    it("builds Stremio extras as path segments", () => {
      expect(buildCatalogPath("movie", "top", "blade runner", 100)).toBe(
        "catalog/movie/top/search=blade%20runner&skip=100.json",
      );
      expect(buildCatalogPath("series", "popular")).toBe(
        "catalog/series/popular.json",
      );
    });

    it("fetches an exact add-on catalog by add-on id and catalog id", async () => {
      vi.mocked(prisma.installedAddon.findFirst).mockResolvedValue({
        id: "addon-row-1",
        userId: "user-1",
        transportUrl: "https://example.test/manifest.json",
        installedAt: new Date(),
        manifest: {
          id: "com.example.catalog",
          version: "1.0.0",
          name: "Example",
          description: "Catalog add-on",
          resources: ["catalog"],
          types: ["movie"],
          catalogs: [{ type: "movie", id: "top", name: "Top" }],
        },
      } as any);
      vi.mocked(axios.get).mockResolvedValue({
        data: {
          metas: [{ id: "tt1", type: "movie", name: "Movie One" }],
        },
      });

      const metas = await service.getAddonCatalog(
        "user-1",
        "addon-row-1",
        "movie",
        "top",
        "req-1",
        "matrix",
        50,
      );

      expect(metas).toEqual([
        { id: "tt1", type: "movie", name: "Movie One", poster: "" },
      ]);
      expect(axios.get).toHaveBeenCalledWith(
        "https://example.test/catalog/movie/top/search=matrix&skip=50.json",
        expect.any(Object),
      );
    });
  });

  describe("getStreams", () => {
    it("attaches type and id context to streams returned from add-ons", async () => {
      vi.mocked(prisma.installedAddon.findMany).mockResolvedValue([
        {
          id: "addon-row-1",
          userId: "user-1",
          transportUrl: "https://example.test/manifest.json",
          installedAt: new Date(),
          manifest: {
            id: "com.example.streams",
            version: "1.0.0",
            name: "Example",
            description: "Stream add-on",
            resources: ["stream"],
            types: ["movie"],
            catalogs: [],
          },
        },
      ] as any);
      vi.mocked(axios.get).mockResolvedValue({
        data: {
          streams: [{ infoHash: "abc123", title: "Torrent source" }],
        },
      });

      const streams = await service.getStreams(
        "user-1",
        "movie",
        "tt1234567",
        "req-1",
      );

      expect(streams[0]).toMatchObject({
        infoHash: "abc123",
        type: "movie",
        id: "tt1234567",
      });
    });
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
});
