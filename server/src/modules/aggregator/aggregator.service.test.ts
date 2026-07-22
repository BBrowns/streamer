import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";
import {
  AggregatorService,
  boundSearchCatalogPayload,
  buildAddonPolicyKey,
  buildCatalogPath,
  InvalidSearchCursorError,
  MetadataProvidersUnavailableError,
} from "./aggregator.service";
import { RealDebridResolver } from "../debrid/adapters/real-debrid.resolver";
import { featureFlags } from "../feature-flag/feature-flag.service";
import { prisma } from "../../prisma/client";
import { resilienceRegistry } from "./resilience";
import { logger } from "../../config/logger";

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

    it("uses a manifest-declared catalog for Home when resources omits catalog", async () => {
      vi.mocked(prisma.installedAddon.findMany).mockResolvedValue([
        {
          id: "torrentclaw-installation",
          userId: "user-1",
          transportUrl: "https://torrentclaw.com/api/stremio/manifest.json",
          installedAt: new Date(),
          manifest: {
            id: "com.torrentclaw",
            version: "1.0.0",
            name: "TorrentClaw",
            description: "Search and stream add-on",
            resources: ["stream", "meta"],
            types: ["movie", "series"],
            catalogs: [{ type: "movie", id: "tc-search", name: "Movies" }],
            behaviorHints: { configurationRequired: false },
          },
        },
      ] as any);
      vi.mocked(axios.get).mockResolvedValue({
        data: {
          metas: [{ id: "tt0133093", type: "movie", name: "The Matrix" }],
        },
      });

      await expect(
        service.getCatalog("user-1", "movie", "req-torrentclaw-home"),
      ).resolves.toMatchObject([
        { id: "tt0133093", type: "movie", name: "The Matrix" },
      ]);
      expect(axios.get).toHaveBeenCalledWith(
        "https://torrentclaw.com/api/stremio/catalog/movie/tc-search.json",
        expect.any(Object),
      );
    });

    it("uses a manifest-declared catalog for exact Discover fetches when resources omits catalog", async () => {
      vi.mocked(prisma.installedAddon.findFirst).mockResolvedValue({
        id: "torrentclaw-installation",
        userId: "user-1",
        transportUrl: "https://torrentclaw.com/api/stremio/manifest.json",
        installedAt: new Date(),
        manifest: {
          id: "com.torrentclaw",
          version: "1.0.0",
          name: "TorrentClaw",
          description: "Search and stream add-on",
          resources: ["stream", "meta"],
          types: ["movie", "series"],
          catalogs: [{ type: "movie", id: "tc-search", name: "Movies" }],
          behaviorHints: { configurationRequired: false },
        },
      } as any);
      vi.mocked(axios.get).mockResolvedValue({
        data: {
          metas: [{ id: "tt0133093", type: "movie", name: "The Matrix" }],
        },
      });

      await expect(
        service.getAddonCatalog(
          "user-1",
          "torrentclaw-installation",
          "movie",
          "tc-search",
          "req-torrentclaw-discover",
        ),
      ).resolves.toMatchObject([
        { id: "tt0133093", type: "movie", name: "The Matrix" },
      ]);
      expect(axios.get).toHaveBeenCalledWith(
        "https://torrentclaw.com/api/stremio/catalog/movie/tc-search.json",
        expect.any(Object),
      );
    });

    it("keeps nullable Stremio catalog metadata out of the provider failure circuit", async () => {
      const addon = {
        id: "cinemeta-installation",
        userId: "user-1",
        transportUrl: "https://v3-cinemeta.strem.io/manifest.json",
        installedAt: new Date(),
        manifest: {
          id: "com.linvo.cinemeta",
          version: "1.0.0",
          name: "Cinemeta",
          description: "Metadata provider",
          resources: ["catalog"],
          types: ["movie"],
          catalogs: [{ type: "movie", id: "top", name: "Top" }],
        },
      } as any;
      const policyKey = buildAddonPolicyKey(
        "user-1",
        addon.id,
        addon.transportUrl,
      );
      resilienceRegistry.reset();
      vi.mocked(prisma.installedAddon.findMany).mockResolvedValue([addon]);
      vi.mocked(axios.get).mockResolvedValue({
        data: {
          metas: [
            {
              id: "tt0133093",
              type: "movie",
              name: "The Matrix",
              released: null,
            },
            {
              id: "tt-malformed",
              type: "movie",
              name: null,
            },
          ],
        },
      });

      for (let attempt = 0; attempt < 3; attempt += 1) {
        await expect(
          service.getCatalog("user-1", "movie", `req-${attempt}`),
        ).resolves.toMatchObject([
          { id: "tt0133093", type: "movie", name: "The Matrix" },
        ]);
      }

      expect(axios.get).toHaveBeenCalledTimes(3);
      expect(resilienceRegistry.getMetrics(policyKey)).toMatchObject({
        retries: 0,
        circuitOpens: 0,
      });
    });
  });

  describe("configuration-required add-ons", () => {
    it("does not fetch an unconfigured provider for catalog, metadata, search, or streams", async () => {
      const addon = {
        id: "rpdb-installation",
        userId: "user-1",
        transportUrl: "https://api.ratingposterdb.com/manifest.json",
        installedAt: new Date(),
        manifest: {
          id: "com.ratingposterdb.rpdb",
          version: "1.0.0",
          name: "RatingPosterDB",
          description: "Poster customization",
          resources: ["catalog", "meta", "stream"],
          types: ["movie"],
          catalogs: [
            {
              type: "movie",
              id: "rpdb-search",
              name: "Movies",
              extra: [{ name: "search", isRequired: true }],
            },
          ],
          behaviorHints: { configurationRequired: true },
        },
      } as any;
      vi.mocked(prisma.installedAddon.findMany).mockResolvedValue([addon]);
      vi.mocked(prisma.installedAddon.findFirst).mockResolvedValue(addon);

      await expect(
        service.getCatalog("user-1", "movie", "req-rpdb-catalog"),
      ).resolves.toEqual([]);
      await expect(
        service.getMeta("user-1", "movie", "tt0133093", "req-rpdb-meta"),
      ).resolves.toBeNull();
      await expect(
        service.getStreams("user-1", "movie", "tt0133093", "req-rpdb-stream"),
      ).resolves.toEqual([]);
      await expect(
        service.searchWithProvenance("user-1", "matrix", "req-rpdb-search"),
      ).resolves.toMatchObject({
        attemptedProviders: 0,
        successfulProviders: 0,
        failedProviderIds: [],
        metas: [],
      });
      await expect(
        service.getAddonCatalog(
          "user-1",
          addon.id,
          "movie",
          "rpdb-search",
          "req-rpdb-discover",
        ),
      ).rejects.toThrow("Add-on does not support this catalog type");

      expect(axios.get).not.toHaveBeenCalled();
    });
  });

  describe("resilience diagnostics", () => {
    it("returns only redacted metrics for the authenticated user's installations", async () => {
      const ownAddon = {
        id: "private-installation-id",
        userId: "user-1",
        transportUrl: "https://secret-token.example/manifest.json",
        installedAt: new Date(),
        manifest: { name: "My provider" },
      } as any;
      vi.mocked(prisma.installedAddon.findMany).mockResolvedValue([ownAddon]);
      resilienceRegistry.reset();
      const ownKey = buildAddonPolicyKey(
        "user-1",
        ownAddon.id,
        ownAddon.transportUrl,
      );
      resilienceRegistry.getMetrics(ownKey).timeouts = 2;
      resilienceRegistry.getMetrics("another-user-policy").retries = 99;

      const diagnostics = await service.getResilienceDiagnostics("user-1");
      const serialized = JSON.stringify(diagnostics);

      expect(diagnostics).toMatchObject({
        providers: [
          { provider: "My provider", metrics: { timeouts: 2, retries: 0 } },
        ],
        totals: { timeouts: 2, retries: 0 },
        truncated: false,
      });
      expect(serialized).not.toContain("private-installation-id");
      expect(serialized).not.toContain("secret-token.example");
      expect(serialized).not.toContain(ownKey);
      expect(serialized).not.toContain("another-user-policy");
      expect(serialized).not.toContain("99");
    });

    it("removes an uninstalled add-on's resilience state", () => {
      const key = buildAddonPolicyKey(
        "user-1",
        "installed-addon",
        "https://provider.example/manifest.json",
      );
      resilienceRegistry.reset();
      resilienceRegistry.getPolicy(key);

      service.removeAddonStateForUser(
        "user-1",
        "installed-addon",
        "https://provider.example/manifest.json",
      );

      expect(resilienceRegistry.peekMetrics(key)).toBeUndefined();
    });
  });

  describe("search provenance", () => {
    function searchableAddon(
      id: string,
      types: Array<"movie" | "series"> = ["movie"],
    ) {
      return {
        id,
        userId: "user-1",
        transportUrl: `https://${id}.example/manifest.json`,
        installedAt: new Date(),
        manifest: {
          id: `com.example.${id}`,
          version: "1.0.0",
          name: id,
          description: "Search catalog",
          resources: ["catalog"],
          types,
          catalogs: types.map((type) => ({
            type,
            id: `${type}-search`,
            name: `${type} search`,
            extra: [{ name: "search", isRequired: true }],
          })),
        },
      } as any;
    }

    function searchHttpError(status: number) {
      return Object.assign(new Error(`Request failed with status ${status}`), {
        response: { status },
      });
    }

    it("uses the search-capable catalog instead of the first catalog for a type", async () => {
      vi.mocked(prisma.installedAddon.findMany).mockResolvedValue([
        {
          id: "addon-multi-catalog",
          userId: "user-1",
          transportUrl: "https://catalogs.example/manifest.json",
          installedAt: new Date(),
          manifest: {
            id: "com.example.catalogs",
            version: "1.0.0",
            name: "Catalogs",
            description: "Multiple catalogs",
            resources: ["catalog"],
            types: ["movie"],
            catalogs: [
              { type: "movie", id: "popular", name: "Popular" },
              {
                type: "movie",
                id: "tc-search",
                name: "Search",
                extra: [{ name: "search", isRequired: true }],
              },
            ],
          },
        },
      ] as any);
      vi.mocked(axios.get).mockResolvedValue({
        data: {
          metas: [{ id: "tt1", type: "movie", name: "The Matrix" }],
        },
      });

      const result = await service.searchWithProvenance(
        "user-1",
        "matrix",
        "req-searchable-catalog",
      );

      expect(result.metas).toHaveLength(1);
      expect(axios.get).toHaveBeenCalledWith(
        "https://catalogs.example/catalog/movie/tc-search/search=matrix.json",
        expect.any(Object),
      );
    });

    it("accepts Cinemeta-style nullable release dates in bounded search results", async () => {
      const addon = searchableAddon("nullable-search");
      const policyKey = buildAddonPolicyKey(
        "user-1",
        addon.id,
        addon.transportUrl,
      );
      resilienceRegistry.reset();
      vi.mocked(prisma.installedAddon.findMany).mockResolvedValue([addon]);
      vi.mocked(axios.get).mockResolvedValue({
        data: {
          metas: [
            {
              id: "tt0133093",
              type: "movie",
              name: "The Matrix",
              released: null,
            },
            {
              id: "tt-malformed",
              type: "movie",
              name: null,
            },
          ],
        },
      });

      for (const query of ["matrix one", "matrix two", "matrix three"]) {
        await expect(
          service.searchWithProvenance("user-1", query, `req-${query}`),
        ).resolves.toMatchObject({
          metas: [{ id: "tt0133093", type: "movie", name: "The Matrix" }],
          partial: false,
        });
      }

      expect(axios.get).toHaveBeenCalledTimes(3);
      expect(resilienceRegistry.getMetrics(policyKey)).toMatchObject({
        retries: 0,
        circuitOpens: 0,
      });
    });

    it("uses TorrentClaw-style tc-search capability when resources omits catalog", async () => {
      vi.mocked(prisma.installedAddon.findMany).mockResolvedValue([
        {
          id: "torrentclaw",
          userId: "user-1",
          transportUrl: "https://torrentclaw.com/api/stremio/manifest.json",
          installedAt: new Date(),
          manifest: {
            id: "com.torrentclaw",
            version: "1.0.0",
            name: "TorrentClaw",
            description: "Search and stream add-on",
            resources: ["stream", "meta"],
            types: ["movie", "series"],
            catalogs: [
              {
                type: "movie",
                id: "tc-search",
                name: "Search",
                extra: [{ name: "search", isRequired: true }],
              },
            ],
          },
        },
      ] as any);
      vi.mocked(axios.get).mockResolvedValue({
        data: {
          metas: [{ id: "tt0133093", type: "movie", name: "The Matrix" }],
        },
      });

      const result = await service.searchWithProvenance(
        "user-1",
        "Matrix",
        "req-torrentclaw-capability",
      );

      expect(result.metas.map(({ id }) => id)).toEqual(["tt0133093"]);
      expect(axios.get).toHaveBeenCalledWith(
        "https://torrentclaw.com/api/stremio/catalog/movie/tc-search/search=Matrix.json",
        expect.any(Object),
      );
    });

    it("deduplicates by type and id while retaining provider facets", async () => {
      vi.mocked(prisma.installedAddon.findMany).mockResolvedValue(
        ["Alpha", "Beta"].map((name, index) => ({
          id: `addon-${index + 1}`,
          userId: "user-1",
          transportUrl: `https://${name.toLowerCase()}.example/manifest.json`,
          installedAt: new Date(),
          manifest: {
            id: `com.example.${name.toLowerCase()}`,
            version: "1.0.0",
            name,
            description: `${name} catalog`,
            resources: ["catalog"],
            types: ["movie"],
            catalogs: [
              {
                type: "movie",
                id: "top",
                name: "Top",
                extra: [{ name: "search" }],
              },
            ],
          },
        })) as any,
      );
      vi.mocked(axios.get).mockResolvedValue({
        data: {
          metas: [{ id: "tt1", type: "movie", name: "Shared Movie" }],
        },
      });

      const result = await service.searchWithProvenance(
        "user-1",
        "shared",
        "req-1",
      );

      expect(result.metas).toHaveLength(1);
      expect(result.providers).toEqual([
        { id: "addon-1", name: "Alpha" },
        { id: "addon-2", name: "Beta" },
      ]);
      expect(result.providersByContent).toEqual({
        "movie:tt1": ["addon-1", "addon-2"],
      });
      expect(result).toMatchObject({
        attemptedProviders: 2,
        successfulProviders: 2,
        failedProviderIds: [],
        partial: false,
        truncated: false,
      });
    });

    it("reports partial provider failures without hiding successful results", async () => {
      vi.mocked(prisma.installedAddon.findMany).mockResolvedValue(
        ["Alpha", "Beta"].map((name, index) => ({
          id: `addon-${index + 1}`,
          userId: "user-1",
          transportUrl: `https://${name.toLowerCase()}.example/manifest.json`,
          installedAt: new Date(),
          manifest: {
            id: `com.example.${name.toLowerCase()}`,
            version: "1.0.0",
            name,
            description: `${name} catalog`,
            resources: ["catalog"],
            types: ["movie"],
            catalogs: [
              {
                type: "movie",
                id: "top",
                name: "Top",
                extra: [{ name: "search" }],
              },
            ],
          },
        })) as any,
      );
      vi.mocked(axios.get).mockImplementation(async (url) => {
        if (String(url).includes("beta.example")) {
          throw new Error("provider unavailable");
        }
        return {
          data: {
            metas: [{ id: "tt1", type: "movie", name: "Available Movie" }],
          },
        };
      });

      const result = await service.searchWithProvenance(
        "user-1",
        "available",
        "req-2",
      );

      expect(result.metas).toHaveLength(1);
      expect(result).toMatchObject({
        attemptedProviders: 2,
        successfulProviders: 1,
        failedProviderIds: ["addon-2"],
        partial: true,
        truncated: false,
      });
    });

    it("returns fast suggestion results when another provider exceeds its budget", async () => {
      vi.useFakeTimers();
      try {
        const fastAddon = searchableAddon("fast-suggestions");
        const slowAddon = searchableAddon("slow-suggestions");
        resilienceRegistry.reset();
        vi.mocked(prisma.installedAddon.findMany).mockResolvedValue([
          fastAddon,
          slowAddon,
        ]);
        vi.mocked(axios.get).mockImplementation(async (url, options: any) => {
          if (String(url).includes("fast-suggestions")) {
            return {
              data: {
                metas: [{ id: "tt1", type: "movie", name: "Matrix" }],
              },
            };
          }
          return new Promise((_resolve, reject) => {
            if (options.signal.aborted) {
              reject(new Error("provider timeout"));
              return;
            }
            options.signal.addEventListener(
              "abort",
              () => reject(new Error("provider timeout")),
              { once: true },
            );
          });
        });

        const pending = service.searchWithProvenance(
          "user-1",
          "matrix",
          "req-provider-timeout",
          { mode: "suggestions" },
        );
        await vi.advanceTimersByTimeAsync(1_800);
        const result = await pending;

        expect(result.metas.map(({ id }) => id)).toEqual(["tt1"]);
        expect(result).toMatchObject({
          attemptedProviders: 2,
          successfulProviders: 1,
          failedProviderIds: ["slow-suggestions"],
          partial: true,
        });
        await vi.advanceTimersByTimeAsync(1_000);
        expect(axios.get).toHaveBeenCalledTimes(2);
        expect(
          resilienceRegistry.getMetrics(
            buildAddonPolicyKey("user-1", slowAddon.id, slowAddon.transportUrl),
          ),
        ).toMatchObject({ retries: 0, circuitOpens: 0 });
      } finally {
        vi.useRealTimers();
      }
    });

    it("reports a provider as partial when one supported content type fails", async () => {
      vi.mocked(prisma.installedAddon.findMany).mockResolvedValue([
        {
          id: "addon-mixed",
          userId: "user-1",
          transportUrl: "https://mixed.example/manifest.json",
          installedAt: new Date(),
          manifest: {
            id: "com.example.mixed",
            version: "1.0.0",
            name: "Mixed",
            description: "Movie and series catalog",
            resources: ["catalog"],
            types: ["movie", "series"],
            catalogs: [
              {
                type: "movie",
                id: "movies",
                name: "Movies",
                extra: [{ name: "search" }],
              },
              {
                type: "series",
                id: "series",
                name: "Series",
                extra: [{ name: "search" }],
              },
            ],
          },
        },
      ] as any);
      vi.mocked(axios.get).mockImplementation(async (url) => {
        if (String(url).includes("catalog/series/")) {
          throw new Error("series catalog unavailable");
        }
        return {
          data: {
            metas: [{ id: "tt1", type: "movie", name: "Available Movie" }],
          },
        };
      });

      const result = await service.searchWithProvenance(
        "user-1",
        "available",
        "req-mixed",
      );

      expect(result.metas).toHaveLength(1);
      expect(result).toMatchObject({
        attemptedProviders: 1,
        successfulProviders: 1,
        failedProviderIds: ["addon-mixed"],
        partial: true,
      });
    });

    it("reports a no-provider search separately from a provider outage", async () => {
      vi.mocked(prisma.installedAddon.findMany).mockResolvedValue([]);

      const result = await service.searchWithProvenance(
        "user-1",
        "anything",
        "req-3",
      );

      expect(result).toMatchObject({
        metas: [],
        attemptedProviders: 0,
        successfulProviders: 0,
        failedProviderIds: [],
        partial: false,
      });
    });

    it("classifies total searchable-provider failure separately from no providers", async () => {
      vi.mocked(prisma.installedAddon.findMany).mockResolvedValue([
        searchableAddon("unavailable-search"),
      ]);
      vi.mocked(axios.get).mockRejectedValue(new Error("provider unavailable"));

      const result = await service.searchWithProvenance(
        "user-1",
        "matrix",
        "req-provider-unavailable",
      );

      expect(result).toMatchObject({
        metas: [],
        total: 0,
        attemptedProviders: 1,
        successfulProviders: 0,
        failedProviderIds: ["unavailable-search"],
        partial: false,
      });
    });

    it("does not retry search-specific 4xx responses or poison the circuit", async () => {
      const addon = searchableAddon("query-rejected");
      const policyKey = buildAddonPolicyKey(
        "user-1",
        addon.id,
        addon.transportUrl,
      );
      resilienceRegistry.reset();
      vi.mocked(prisma.installedAddon.findMany).mockResolvedValue([addon]);
      vi.mocked(axios.get).mockRejectedValue(searchHttpError(400));

      const rejected = await service.searchWithProvenance(
        "user-1",
        "matrix rejected",
        "req-query-rejected",
      );

      expect(rejected).toMatchObject({
        successfulProviders: 0,
        failedProviderIds: [addon.id],
      });
      expect(axios.get).toHaveBeenCalledTimes(1);
      expect(resilienceRegistry.getMetrics(policyKey)).toMatchObject({
        retries: 0,
        circuitOpens: 0,
      });

      vi.mocked(axios.get).mockResolvedValue({
        data: { metas: [{ id: "tt1", type: "movie", name: "Matrix" }] },
      });
      const recovered = await service.searchWithProvenance(
        "user-1",
        "matrix recovered",
        "req-query-recovered",
      );
      expect(recovered.metas).toHaveLength(1);
    });

    it("classifies a malformed metas payload as provider failure", async () => {
      const addon = searchableAddon("malformed-search");
      vi.mocked(prisma.installedAddon.findMany).mockResolvedValue([addon]);
      vi.mocked(axios.get).mockResolvedValue({
        data: { error: "provider returned HTTP 200 with an error body" },
      });

      const result = await service.searchWithProvenance(
        "user-1",
        "matrix malformed",
        "req-malformed-search",
      );

      expect(result).toMatchObject({
        metas: [],
        attemptedProviders: 1,
        successfulProviders: 0,
        failedProviderIds: [addon.id],
        partial: false,
      });
    });

    it("isolates circuit state for installations that spoof the same manifest id", async () => {
      const malicious = searchableAddon("malicious-row");
      const trusted = searchableAddon("trusted-row");
      malicious.manifest.id = "com.example.shared-id";
      trusted.manifest.id = "com.example.shared-id";
      resilienceRegistry.reset();
      vi.mocked(prisma.installedAddon.findMany).mockImplementation(((
        args: any,
      ) =>
        Promise.resolve(
          args?.where?.userId === "attacker" ? [malicious] : [trusted],
        )) as any);
      vi.mocked(axios.get).mockImplementation(async (url) => {
        if (String(url).includes("malicious-row")) {
          throw searchHttpError(503);
        }
        return {
          data: { metas: [{ id: "tt1", type: "movie", name: "Matrix" }] },
        };
      });

      await service.searchWithProvenance(
        "attacker",
        "matrix poison one",
        "req-poison-1",
      );
      await service.searchWithProvenance(
        "attacker",
        "matrix poison two",
        "req-poison-2",
      );

      const trustedResult = await service.searchWithProvenance(
        "victim",
        "matrix trusted",
        "req-trusted",
      );
      expect(trustedResult.metas.map(({ id }) => id)).toEqual(["tt1"]);
      expect(
        buildAddonPolicyKey("attacker", malicious.id, malicious.transportUrl),
      ).not.toBe(
        buildAddonPolicyKey("victim", trusted.id, trusted.transportUrl),
      );
    });

    it("enforces the six-item suggestion limit on the server", async () => {
      vi.mocked(prisma.installedAddon.findMany).mockResolvedValue([
        searchableAddon("suggestion-limit"),
      ]);
      vi.mocked(axios.get).mockResolvedValue({
        data: {
          metas: Array.from({ length: 10 }, (_, index) => ({
            id: `tt${index}`,
            type: "movie",
            name: `Matrix ${index}`,
          })),
        },
      });

      const result = await service.searchWithProvenance(
        "user-1",
        "matrix",
        "req-suggestions",
        { mode: "suggestions", limit: 100 },
      );

      expect(result.metas).toHaveLength(6);
      expect(result.total).toBe(10);
      expect(result.nextCursor).toBeUndefined();
    });

    it("paginates ranked results with an opaque cursor without refetching", async () => {
      vi.mocked(prisma.installedAddon.findMany).mockResolvedValue([
        searchableAddon("result-pagination"),
      ]);
      vi.mocked(axios.get).mockResolvedValue({
        data: {
          metas: Array.from({ length: 5 }, (_, index) => ({
            id: `tt${index}`,
            type: "movie",
            name: index === 0 ? "Matrix" : `Matrix ${index}`,
          })),
        },
      });

      const first = await service.searchWithProvenance(
        "user-1",
        "matrix",
        "req-page-1",
        { limit: 2 },
      );
      const second = await service.searchWithProvenance(
        "user-1",
        "matrix",
        "req-page-2",
        { limit: 2, cursor: first.nextCursor },
      );

      expect(first.metas.map(({ id }) => id)).toEqual(["tt0", "tt1"]);
      expect(second.metas.map(({ id }) => id)).toEqual(["tt2", "tt3"]);
      expect(first.nextCursor).toEqual(expect.any(String));
      expect(first.nextCursor).not.toBe("2");
      expect(second.nextCursor).toEqual(expect.any(String));
      expect(axios.get).toHaveBeenCalledTimes(1);
    });

    it("keeps an opaque result snapshot stable beyond the query-cache ttl", async () => {
      vi.useFakeTimers();
      try {
        vi.mocked(prisma.installedAddon.findMany).mockResolvedValue([
          searchableAddon("stable-pagination"),
        ]);
        vi.mocked(axios.get).mockResolvedValue({
          data: {
            metas: Array.from({ length: 4 }, (_, index) => ({
              id: `old-${index}`,
              type: "movie",
              name: index === 0 ? "Matrix" : `Matrix ${index}`,
            })),
          },
        });

        const first = await service.searchWithProvenance(
          "user-1",
          "matrix",
          "req-stable-page-1",
          { limit: 2 },
        );
        await vi.advanceTimersByTimeAsync(15_001);
        vi.mocked(axios.get).mockResolvedValue({
          data: {
            metas: [{ id: "new-0", type: "movie", name: "Matrix" }],
          },
        });

        const second = await service.searchWithProvenance(
          "user-1",
          "matrix",
          "req-stable-page-2",
          { limit: 2, cursor: first.nextCursor },
        );

        expect(second.metas.map(({ id }) => id)).toEqual(["old-2", "old-3"]);
        expect(axios.get).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it("rejects an expired opaque snapshot instead of refetching a different page", async () => {
      vi.useFakeTimers();
      try {
        vi.mocked(prisma.installedAddon.findMany).mockResolvedValue([
          searchableAddon("expired-pagination"),
        ]);
        vi.mocked(axios.get).mockResolvedValue({
          data: {
            metas: Array.from({ length: 4 }, (_, index) => ({
              id: `tt${index}`,
              type: "movie",
              name: `Matrix ${index}`,
            })),
          },
        });

        const first = await service.searchWithProvenance(
          "user-1",
          "matrix expiry",
          "req-expiry-page-1",
          { limit: 2 },
        );
        await vi.advanceTimersByTimeAsync(5 * 60_000 + 1);

        await expect(
          service.searchWithProvenance(
            "user-1",
            "matrix expiry",
            "req-expiry-page-2",
            { limit: 2, cursor: first.nextCursor },
          ),
        ).rejects.toBeInstanceOf(InvalidSearchCursorError);
        expect(axios.get).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it("rejects an opaque cursor when its process-local snapshot is missing", async () => {
      vi.mocked(prisma.installedAddon.findMany).mockResolvedValue([
        searchableAddon("missing-pagination"),
      ]);
      vi.mocked(axios.get).mockResolvedValue({
        data: {
          metas: Array.from({ length: 4 }, (_, index) => ({
            id: `tt${index}`,
            type: "movie",
            name: `Matrix ${index}`,
          })),
        },
      });
      const first = await service.searchWithProvenance(
        "user-1",
        "matrix missing snapshot",
        "req-missing-page-1",
        { limit: 2 },
      );
      const restartedService = new AggregatorService();

      await expect(
        restartedService.searchWithProvenance(
          "user-1",
          "matrix missing snapshot",
          "req-missing-page-2",
          { limit: 2, cursor: first.nextCursor },
        ),
      ).rejects.toBeInstanceOf(InvalidSearchCursorError);
      expect(axios.get).toHaveBeenCalledTimes(1);
    });

    it("fans out only to catalogs for the requested result type", async () => {
      vi.mocked(prisma.installedAddon.findMany).mockResolvedValue([
        searchableAddon("typed-search", ["movie", "series"]),
      ]);
      vi.mocked(axios.get).mockImplementation(async (url) => ({
        data: {
          metas: [
            {
              id: "series-1",
              type: String(url).includes("/series/") ? "series" : "movie",
              name: "Matrix",
            },
          ],
        },
      }));

      const result = await service.searchWithProvenance(
        "user-1",
        "matrix",
        "req-series-only",
        { type: "series" },
      );

      expect(result.metas.map(({ type }) => type)).toEqual(["series"]);
      expect(axios.get).toHaveBeenCalledTimes(1);
      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining("catalog/series/series-search/"),
        expect.any(Object),
      );
    });

    it("reuses normalized full-result work for subsequent suggestions", async () => {
      vi.mocked(prisma.installedAddon.findMany).mockResolvedValue([
        searchableAddon("normalized-cache"),
      ]);
      vi.mocked(axios.get).mockResolvedValue({
        data: {
          metas: [{ id: "tt1", type: "movie", name: "Amélie" }],
        },
      });

      await service.searchWithProvenance(
        "user-1",
        " Amélie! ",
        "req-cache-results",
        { mode: "results" },
      );
      const suggestions = await service.searchWithProvenance(
        "user-1",
        "amelie",
        "req-cache-suggestions",
        { mode: "suggestions" },
      );

      expect(suggestions.metas).toHaveLength(1);
      expect(axios.get).toHaveBeenCalledTimes(1);
    });

    it("reuses a complete suggestion-origin cache for a full result run", async () => {
      vi.mocked(prisma.installedAddon.findMany).mockResolvedValue([
        searchableAddon("cache-direction"),
      ]);
      vi.mocked(axios.get).mockResolvedValue({
        data: {
          metas: [{ id: "tt1", type: "movie", name: "Matrix" }],
        },
      });

      await service.searchWithProvenance(
        "user-1",
        "matrix",
        "req-cache-suggestions",
        { mode: "suggestions" },
      );
      await service.searchWithProvenance(
        "user-1",
        "matrix",
        "req-cache-results",
        { mode: "results" },
      );

      expect(axios.get).toHaveBeenCalledTimes(1);
    });

    it("reruns a partial suggestion search before returning full results", async () => {
      const fast = searchableAddon("cache-fast");
      const recovering = searchableAddon("cache-recovering");
      let recoveringCalls = 0;
      vi.mocked(prisma.installedAddon.findMany).mockResolvedValue([
        fast,
        recovering,
      ]);
      vi.mocked(axios.get).mockImplementation(async (url) => {
        if (String(url).includes("cache-recovering")) {
          recoveringCalls += 1;
          if (recoveringCalls === 1) throw searchHttpError(400);
          return {
            data: {
              metas: [{ id: "tt2", type: "movie", name: "Matrix Two" }],
            },
          };
        }
        return {
          data: {
            metas: [{ id: "tt1", type: "movie", name: "Matrix One" }],
          },
        };
      });

      const suggestions = await service.searchWithProvenance(
        "user-1",
        "matrix",
        "req-partial-suggestions",
        { mode: "suggestions" },
      );
      const results = await service.searchWithProvenance(
        "user-1",
        "matrix",
        "req-complete-results",
        { mode: "results" },
      );

      expect(suggestions).toMatchObject({ partial: true });
      expect(results).toMatchObject({
        partial: false,
        attemptedProviders: 2,
        successfulProviders: 2,
      });
      expect(results.metas.map(({ id }) => id).sort()).toEqual(["tt1", "tt2"]);
      expect(axios.get).toHaveBeenCalledTimes(4);
    });

    it("does not make suggestions inherit an in-flight full-result budget", async () => {
      const addon = searchableAddon("in-flight-cache");
      const resultController = new AbortController();
      let call = 0;
      vi.mocked(prisma.installedAddon.findMany).mockResolvedValue([addon]);
      vi.mocked(axios.get).mockImplementation(async (_url, options: any) => {
        call += 1;
        if (call === 2) {
          return {
            data: { metas: [{ id: "tt1", type: "movie", name: "Matrix" }] },
          };
        }
        return new Promise((_resolve, reject) => {
          options.signal.addEventListener(
            "abort",
            () => reject(options.signal.reason ?? new Error("cancelled")),
            { once: true },
          );
        });
      });

      const results = service.searchWithProvenance(
        "user-1",
        "matrix",
        "req-in-flight-results",
        { mode: "results", signal: resultController.signal },
      );
      await vi.waitFor(() => expect(axios.get).toHaveBeenCalledTimes(1));
      const suggestions = service.searchWithProvenance(
        "user-1",
        "matrix",
        "req-in-flight-suggestions",
        { mode: "suggestions" },
      );

      await expect(suggestions).resolves.toMatchObject({
        partial: false,
        truncated: false,
        total: 1,
      });
      expect(axios.get).toHaveBeenCalledTimes(2);

      resultController.abort(new Error("test cleanup"));
      await expect(results).rejects.toThrow("test cleanup");
    });

    it("reports bounded searchable catalogs as truncated, not partial", async () => {
      const addon = searchableAddon("fanout-bound");
      addon.manifest.catalogs = Array.from({ length: 20 }, (_, index) => ({
        type: "movie",
        id: `search-${index}`,
        name: `Search ${index}`,
        extra: [{ name: "search" }],
      }));
      vi.mocked(prisma.installedAddon.findMany).mockResolvedValue([addon]);
      vi.mocked(axios.get).mockResolvedValue({
        data: { metas: [{ id: "tt1", type: "movie", name: "Matrix" }] },
      });

      const result = await service.searchWithProvenance(
        "user-1",
        "matrix bounded",
        "req-fanout-bound",
      );

      expect(axios.get).toHaveBeenCalledTimes(4);
      expect(result).toMatchObject({
        attemptedProviders: 1,
        successfulProviders: 1,
        failedProviderIds: [],
        partial: false,
        truncated: true,
      });
    });

    it("bounds results retained from one searchable catalog", async () => {
      const addon = searchableAddon("result-bound");
      vi.mocked(prisma.installedAddon.findMany).mockResolvedValue([addon]);
      vi.mocked(axios.get).mockResolvedValue({
        data: {
          metas: Array.from({ length: 500 }, (_, index) => ({
            id: `tt${index}`,
            type: "movie",
            name: `Matrix ${index}`,
          })),
        },
      });

      const result = await service.searchWithProvenance(
        "user-1",
        "matrix bounded results",
        "req-result-bound",
        { limit: 100 },
      );

      expect(result.metas).toHaveLength(100);
      expect(result.total).toBe(200);
      expect(result).toMatchObject({ partial: false, truncated: true });
    });

    it("bounds provider-controlled collections and fields before validation", () => {
      const bounded = boundSearchCatalogPayload({
        metas: [
          {
            id: "tt0",
            type: "movie",
            name: "x".repeat(100_000),
            aliases: Array.from({ length: 40 }, () => "y".repeat(1_000)),
            ignored: { nested: "z".repeat(100_000) },
          },
          ...Array.from({ length: 499 }, (_, index) => ({
            id: `tt${index + 1}`,
            type: "movie",
            name: `Matrix ${index + 1}`,
          })),
        ],
        ignoredRoot: "z".repeat(100_000),
      });

      expect(bounded.truncated).toBe(true);
      const metas = (bounded.payload as any).metas;
      expect(metas).toHaveLength(200);
      expect(metas[0].name.length).toBe(513);
      expect(metas[0].aliases).toHaveLength(33);
      expect(metas[0].aliases[0].length).toBe(513);
      expect(metas[0]).not.toHaveProperty("ignored");
      expect(bounded.payload).not.toHaveProperty("ignoredRoot");
    });

    it("rejects oversized retained fields without sending them to ranking", async () => {
      const addon = searchableAddon("oversized-search-meta");
      vi.mocked(prisma.installedAddon.findMany).mockResolvedValue([addon]);
      vi.mocked(axios.get).mockResolvedValue({
        data: {
          metas: [
            {
              id: "tt1",
              type: "movie",
              name: "x".repeat(100_000),
            },
          ],
        },
      });

      const result = await service.searchWithProvenance(
        "user-1",
        "bounded invalid",
        "req-bounded-invalid",
      );

      expect(result).toMatchObject({
        metas: [],
        successfulProviders: 0,
        failedProviderIds: [addon.id],
      });
      expect(axios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          maxContentLength: 512 * 1024,
          maxBodyLength: 512 * 1024,
        }),
      );
    });

    it("does not fan out a blank or one-character query", async () => {
      vi.mocked(prisma.installedAddon.findMany).mockResolvedValue([
        searchableAddon("short-query"),
      ]);

      const result = await service.searchWithProvenance(
        "user-1",
        "x",
        "req-short-query",
      );

      expect(result).toEqual({
        metas: [],
        providers: [],
        providersByContent: {},
        attemptedProviders: 0,
        successfulProviders: 0,
        failedProviderIds: [],
        partial: false,
        truncated: false,
        total: 0,
      });
      expect(prisma.installedAddon.findMany).not.toHaveBeenCalled();
      expect(axios.get).not.toHaveBeenCalled();
    });

    it("propagates a superseded caller cancellation without retrying providers", async () => {
      const addon = searchableAddon("cancelled-query");
      const addonId = buildAddonPolicyKey(
        "user-1",
        addon.id,
        addon.transportUrl,
      );
      resilienceRegistry.reset();
      vi.mocked(prisma.installedAddon.findMany).mockResolvedValue([addon]);
      vi.mocked(axios.get).mockImplementation(
        async (_url, options: any) =>
          new Promise((_resolve, reject) => {
            options.signal.addEventListener(
              "abort",
              () => reject(new Error("canceled")),
              { once: true },
            );
          }),
      );
      const controller = new AbortController();

      const search = service.searchWithProvenance(
        "user-1",
        "matrix",
        "req-cancelled",
        { signal: controller.signal },
      );
      await vi.waitFor(() => expect(axios.get).toHaveBeenCalledTimes(1));
      controller.abort(new Error("superseded"));

      await expect(search).rejects.toThrow("superseded");
      expect(resilienceRegistry.getMetrics(addonId).retries).toBe(0);
    });
  });

  describe("getMeta failure semantics", () => {
    function metaAddon(id: string, transportUrl: string) {
      return {
        id,
        userId: "user-1",
        transportUrl,
        installedAt: new Date(),
        manifest: {
          id: `com.example.${id}`,
          version: "1.0.0",
          name: id,
          description: "Metadata provider",
          resources: ["meta"],
          types: ["movie"],
          catalogs: [],
        },
      } as any;
    }

    function httpError(status: number) {
      return Object.assign(new Error(`Request failed with status ${status}`), {
        response: { status },
      });
    }

    it("returns null when no installed add-on provides metadata", async () => {
      vi.mocked(prisma.installedAddon.findMany).mockResolvedValue([]);

      await expect(
        service.getMeta("user-1", "movie", "tt-missing", "req-meta-none"),
      ).resolves.toBeNull();
      expect(axios.get).not.toHaveBeenCalled();
    });

    it("returns null when every metadata provider explicitly returns 404", async () => {
      vi.mocked(prisma.installedAddon.findMany).mockResolvedValue([
        metaAddon("meta-404-a", "https://missing-a.example/manifest.json"),
        metaAddon("meta-404-b", "https://missing-b.example/manifest.json"),
      ]);
      vi.mocked(axios.get).mockRejectedValue(httpError(404));

      await expect(
        service.getMeta("user-1", "movie", "tt-missing", "req-meta-404"),
      ).resolves.toBeNull();
    });

    it("does not retry metadata 404s or open the provider circuit", async () => {
      const addon = metaAddon(
        "meta-404-recovery",
        "https://recovering.example/manifest.json",
      );
      const addonId = buildAddonPolicyKey(
        "user-1",
        addon.id,
        addon.transportUrl,
      );
      resilienceRegistry.reset();
      vi.mocked(prisma.installedAddon.findMany).mockResolvedValue([addon]);
      vi.mocked(axios.get).mockImplementation(async (url) => {
        if (String(url).includes("/meta/movie/tt-found.json")) {
          return {
            data: {
              meta: {
                id: "tt-found",
                type: "movie",
                name: "Found after misses",
              },
            },
          };
        }
        throw httpError(404);
      });

      for (const id of [
        "tt-missing-1",
        "tt-missing-2",
        "tt-missing-3",
        "tt-missing-4",
      ]) {
        await expect(
          service.getMeta("user-1", "movie", id, `req-${id}`),
        ).resolves.toBeNull();
      }

      await expect(
        service.getMeta("user-1", "movie", "tt-found", "req-meta-found"),
      ).resolves.toMatchObject({
        id: "tt-found",
        name: "Found after misses",
      });
      expect(axios.get).toHaveBeenCalledTimes(5);
      expect(resilienceRegistry.getMetrics(addonId)).toMatchObject({
        retries: 0,
        circuitOpens: 0,
      });
    });

    it("throws a recoverable outage when no provider succeeds and one failure is not 404", async () => {
      vi.mocked(prisma.installedAddon.findMany).mockResolvedValue([
        metaAddon("meta-mixed-404", "https://missing.example/manifest.json"),
        metaAddon("meta-mixed-down", "https://offline.example/manifest.json"),
      ]);
      vi.mocked(axios.get).mockImplementation(async (url) => {
        if (String(url).includes("missing.example")) throw httpError(404);
        throw Object.assign(new Error("Network unavailable"), {
          code: "ECONNRESET",
        });
      });

      await expect(
        service.getMeta("user-1", "movie", "tt-unknown", "req-meta-down"),
      ).rejects.toBeInstanceOf(MetadataProvidersUnavailableError);
      expect(axios.get).toHaveBeenCalledTimes(3);
      expect(
        resilienceRegistry.getMetrics(
          buildAddonPolicyKey(
            "user-1",
            "meta-mixed-down",
            "https://offline.example/manifest.json",
          ),
        ),
      ).toMatchObject({
        retries: 1,
        circuitOpens: 0,
      });
    });

    it("treats invalid upstream metadata as recoverable instead of missing", async () => {
      vi.mocked(prisma.installedAddon.findMany).mockResolvedValue([
        metaAddon("meta-invalid", "https://invalid.example/manifest.json"),
      ]);
      vi.mocked(axios.get).mockResolvedValue({ data: { meta: null } });

      await expect(
        service.getMeta("user-1", "movie", "tt-invalid", "req-meta-invalid"),
      ).rejects.toBeInstanceOf(MetadataProvidersUnavailableError);
    });

    it("returns successful metadata despite another provider failing", async () => {
      vi.mocked(prisma.installedAddon.findMany).mockResolvedValue([
        metaAddon("meta-success", "https://healthy.example/manifest.json"),
        metaAddon(
          "meta-partial",
          "https://offline-partial.example/manifest.json",
        ),
      ]);
      vi.mocked(axios.get).mockImplementation(async (url) => {
        if (String(url).includes("healthy.example")) {
          return {
            data: {
              meta: {
                id: "tt-found",
                type: "movie",
                name: "Found title",
              },
            },
          };
        }
        throw new Error("Provider temporarily unavailable");
      });

      await expect(
        service.getMeta("user-1", "movie", "tt-found", "req-meta-partial"),
      ).resolves.toMatchObject({
        id: "tt-found",
        name: "Found title",
        poster: "",
      });
    });
  });

  describe("getStreams", () => {
    function streamAddon(id: string) {
      return {
        id,
        userId: "user-1",
        transportUrl: `https://${id}.example/manifest.json`,
        installedAt: new Date(),
        manifest: {
          id: `com.example.${id}`,
          version: "1.0.0",
          name: id,
          description: "Stream add-on",
          resources: ["stream"],
          types: ["movie"],
          catalogs: [],
        },
      } as any;
    }

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

    it("shares one in-flight lookup between stream cards and playback planning", async () => {
      vi.mocked(prisma.installedAddon.findMany).mockResolvedValue([
        streamAddon("shared-streams"),
      ]);
      let resolveResponse!: (value: unknown) => void;
      vi.mocked(axios.get).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveResponse = resolve;
          }) as any,
      );

      const streamsPromise = service.getStreams(
        "user-1",
        "movie",
        "tt-shared",
        "req-stream-cards",
      );
      const discoveryPromise = service.getStreamDiscovery(
        "user-1",
        "movie",
        "tt-shared",
        "req-planner",
      );

      await vi.waitFor(() => expect(axios.get).toHaveBeenCalledTimes(1));
      resolveResponse({
        data: {
          streams: [
            {
              url: "https://cdn.example.test/shared.1080p.h264.mp4",
              title: "Shared 1080p H264",
            },
          ],
        },
      });

      const [streams, discovery] = await Promise.all([
        streamsPromise,
        discoveryPromise,
      ]);
      expect(discovery.status).toBe("complete");
      expect(discovery.streams).toEqual(streams);
      expect(axios.get).toHaveBeenCalledTimes(1);
    });

    it("returns a viable fast batch without waiting for a slow provider", async () => {
      vi.useFakeTimers();
      try {
        vi.mocked(prisma.installedAddon.findMany).mockResolvedValue([
          streamAddon("fast-streams"),
          streamAddon("slow-streams"),
        ]);
        vi.mocked(axios.get).mockImplementation((url) => {
          if (String(url).includes("fast-streams")) {
            return Promise.resolve({
              data: {
                streams: [
                  {
                    url: "https://cdn.example.test/fast.1080p.h264.mp4",
                    title: "Fast 1080p H264",
                  },
                ],
              },
            });
          }
          return new Promise(() => undefined) as any;
        });

        const resultPromise = service.getStreamDiscovery(
          "user-1",
          "movie",
          "tt-fast",
          "req-fast",
        );

        await vi.advanceTimersByTimeAsync(0);
        await vi.advanceTimersByTimeAsync(250);
        const result = await resultPromise;

        expect(result.status).toBe("partial");
        expect(result.streams).toHaveLength(1);
        expect(result.streams[0]).toMatchObject({
          url: "https://cdn.example.test/fast.1080p.h264.mp4",
          type: "movie",
          id: "tt-fast",
        });
        expect(axios.get).toHaveBeenCalledTimes(2);
        expect(JSON.stringify(vi.mocked(logger.info).mock.calls)).not.toContain(
          "cdn.example.test",
        );
      } finally {
        vi.useRealTimers();
      }
    });

    it("releases the first viable batch that arrives after the fast deadline", async () => {
      vi.useFakeTimers();
      try {
        vi.mocked(prisma.installedAddon.findMany).mockResolvedValue([
          streamAddon("late-healthy-streams"),
          streamAddon("still-slow-streams"),
        ]);
        vi.mocked(axios.get).mockImplementation((url) => {
          if (String(url).includes("late-healthy-streams")) {
            return new Promise((resolve) => {
              setTimeout(
                () =>
                  resolve({
                    data: {
                      streams: [
                        {
                          url: "https://cdn.example.test/late.1080p.h264.mp4",
                          title: "Late but viable 1080p H264",
                        },
                      ],
                    },
                  }),
                2_000,
              );
            }) as any;
          }
          return new Promise(() => undefined) as any;
        });

        const resultPromise = service.getStreamDiscovery(
          "user-1",
          "movie",
          "tt-late",
          "req-late",
        );
        let settled = false;
        void resultPromise.then(() => {
          settled = true;
        });

        await vi.advanceTimersByTimeAsync(0);
        await vi.advanceTimersByTimeAsync(1_750);
        expect(settled).toBe(false);

        await vi.advanceTimersByTimeAsync(250);
        expect(settled).toBe(true);
        await expect(resultPromise).resolves.toMatchObject({
          status: "partial",
          streams: [
            {
              url: "https://cdn.example.test/late.1080p.h264.mp4",
              type: "movie",
              id: "tt-late",
            },
          ],
        });
      } finally {
        vi.useRealTimers();
      }
    });

    it("caches a complete lookup per user and invalidates it with add-on state", async () => {
      vi.mocked(prisma.installedAddon.findMany).mockResolvedValue([
        streamAddon("cache-streams"),
      ]);
      vi.mocked(axios.get).mockResolvedValue({
        data: {
          streams: [
            {
              url: "https://cdn.example.test/cache.1080p.h264.mp4",
              title: "Cache 1080p H264",
            },
          ],
        },
      });

      await service.getStreams("user-1", "movie", "tt-cache", "req-1");
      await service.getStreams("user-1", "movie", "tt-cache", "req-2");
      expect(axios.get).toHaveBeenCalledTimes(1);

      service.removeAddonStateForUser(
        "user-1",
        "cache-streams",
        "https://cache-streams.example/manifest.json",
      );
      await service.getStreams("user-1", "movie", "tt-cache", "req-3");
      expect(axios.get).toHaveBeenCalledTimes(2);
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
