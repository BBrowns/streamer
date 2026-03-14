import { describe, it, expect, vi, beforeEach } from "vitest";
import { AggregatorService } from "./aggregator.service";
import * as resilience from "./resilience";

// Mock dependencies
vi.mock("../../prisma/client", () => ({
  prisma: {
    installedAddon: { findMany: vi.fn() },
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

// Mock axios
vi.mock("axios", () => ({
  default: {
    get: vi.fn(),
  },
}));

describe("AggregatorService Search Re-ranking", () => {
  let service: AggregatorService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AggregatorService();
  });

  const mockUserAddons = [
    {
      transportUrl: "https://addon.com/manifest.json",
      manifest: {
        id: "test-addon",
        name: "Test Addon",
        resources: ["catalog"],
        types: ["movie", "series"],
        catalogs: [
          { type: "movie", id: "top" },
          { type: "series", id: "top" },
        ],
      },
    },
  ];

  it("should rank exact matches higher than fuzzy matches", async () => {
    // Mock user addons
    (service as any).getUserAddons = vi.fn().mockResolvedValue(mockUserAddons);

    // Mock axios response
    const axios = (await import("axios")).default;
    vi.mocked(axios.get).mockResolvedValue({
      data: {
        metas: [
          { id: "1", name: "Inception", type: "movie", imdbRating: "8.8" },
          { id: "2", name: "The Incept", type: "movie", imdbRating: "5.0" },
        ],
      },
    });

    const results = await service.search("user-1", "Inception", "req-1");

    expect(results[0].name).toBe("Inception");
    expect(results[1].name).toBe("The Incept");
  });

  it("should handle typos using fuzzy matching", async () => {
    (service as any).getUserAddons = vi.fn().mockResolvedValue(mockUserAddons);
    const axios = (await import("axios")).default;
    vi.mocked(axios.get).mockResolvedValue({
      data: {
        metas: [
          { id: "1", name: "Inception", type: "movie", imdbRating: "8.8" },
          { id: "2", name: "Interstellar", type: "movie", imdbRating: "8.7" },
        ],
      },
    });

    const results = await service.search("user-1", "Incepton", "req-1");

    expect(results[0].name).toBe("Inception");
    expect(results.length).toBeGreaterThan(0);
  });

  it("should boost results based on IMDB rating", async () => {
    (service as any).getUserAddons = vi.fn().mockResolvedValue(mockUserAddons);
    const axios = (await import("axios")).default;

    // Both match "Dark" equally in term of text prefix/content
    // But The Dark Knight has much higher rating
    vi.mocked(axios.get).mockResolvedValue({
      data: {
        metas: [
          {
            id: "1",
            name: "Darker Than Black",
            type: "series",
            imdbRating: "7.7",
          },
          {
            id: "2",
            name: "The Dark Knight",
            type: "movie",
            imdbRating: "9.0",
          },
        ],
      },
    });

    const results = await service.search("user-1", "Dark", "req-1");

    // The Dark Knight should win due to 9.0 rating vs 7.7
    expect(results[0].name).toBe("The Dark Knight");
  });

  it("should deduplicate results by ID across different addons/types", async () => {
    (service as any).getUserAddons = vi.fn().mockResolvedValue(mockUserAddons);
    const axios = (await import("axios")).default;

    vi.mocked(axios.get).mockResolvedValue({
      data: {
        metas: [{ id: "1", name: "Duplicate", type: "movie" }],
      },
    });

    const results = await service.search("user-1", "Duplicate", "req-1");

    // Even though it fetches for movie and series, it should deduplicate
    expect(results.length).toBe(1);
  });
});
