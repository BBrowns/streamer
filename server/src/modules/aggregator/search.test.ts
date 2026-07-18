import { describe, expect, it, vi } from "vitest";
import type { AddonManifest, MetaPreview } from "@streamer/shared";
import {
  getSearchableCatalogs,
  normalizeSearchText,
  rankSearchCandidates,
  SearchOutboundBudget,
  SearchOutboundBudgetExceededError,
  scoreSearchResult,
} from "./search";

function manifest(
  catalogs: AddonManifest["catalogs"],
  overrides: Partial<AddonManifest> = {},
): AddonManifest {
  return {
    id: "com.example.search",
    version: "1.0.0",
    name: "Search",
    description: "Search provider",
    resources: ["catalog"],
    types: ["movie", "series"],
    catalogs,
    ...overrides,
  };
}

function meta(
  id: string,
  name: string,
  type: MetaPreview["type"] = "movie",
  overrides: Partial<MetaPreview> = {},
): MetaPreview {
  return { id, type, name, poster: "", ...overrides };
}

describe("search catalog capabilities", () => {
  it("finds every explicitly searchable catalog instead of the first catalog", () => {
    const catalogs = getSearchableCatalogs(
      manifest([
        { type: "movie", id: "popular", name: "Popular" },
        {
          type: "movie",
          id: "movie-search",
          name: "Movie Search",
          extra: [{ name: "search", isRequired: true }],
        },
        {
          type: "series",
          id: "series-search",
          name: "Series Search",
          extra: [{ name: "SEARCH" }],
        },
      ]),
    );

    expect(catalogs.map(({ type, id }) => `${type}:${id}`)).toEqual([
      "movie:movie-search",
      "series:series-search",
    ]);
  });

  it("filters movie and series capabilities independently", () => {
    const addon = manifest([
      {
        type: "movie",
        id: "movie-search",
        name: "Movies",
        extra: [{ name: "search" }],
      },
      {
        type: "series",
        id: "series-search",
        name: "Series",
        extra: [{ name: "search" }],
      },
    ]);

    expect(getSearchableCatalogs(addon, "series").map(({ id }) => id)).toEqual([
      "series-search",
    ]);
  });

  it("accepts an explicit searchable catalog even when resources omit catalog", () => {
    const addon = manifest(
      [
        {
          type: "movie",
          id: "tc-search",
          name: "Search",
          extra: [{ name: "search", isRequired: true }],
        },
      ],
      { resources: ["stream", "meta"] },
    );

    expect(getSearchableCatalogs(addon)).toHaveLength(1);
  });

  it("rejects stream-only and non-search catalog add-ons", () => {
    expect(
      getSearchableCatalogs(
        manifest([], { resources: ["stream"], types: ["movie"] }),
      ),
    ).toEqual([]);
    expect(
      getSearchableCatalogs(
        manifest([{ type: "movie", id: "popular", name: "Popular" }]),
      ),
    ).toEqual([]);
  });
});

describe("search outbound budget", () => {
  it("never starts more work than the global concurrency allowance", async () => {
    const budget = new SearchOutboundBudget(2, 2);
    const releases: Array<() => void> = [];
    const started: number[] = [];
    const tasks = Array.from({ length: 3 }, (_, index) =>
      budget.run(async () => {
        started.push(index);
        await new Promise<void>((resolve) => releases.push(resolve));
        return index;
      }),
    );

    await vi.waitFor(() =>
      expect(budget.getState()).toEqual({ active: 2, queued: 1 }),
    );
    expect(started).toEqual([0, 1]);

    releases.shift()?.();
    await vi.waitFor(() => expect(started).toEqual([0, 1, 2]));
    while (releases.length > 0) releases.shift()?.();

    await expect(Promise.all(tasks)).resolves.toEqual([0, 1, 2]);
    expect(budget.getState()).toEqual({ active: 0, queued: 0 });
  });

  it("rejects excess queued work instead of growing without bound", async () => {
    const budget = new SearchOutboundBudget(1, 1);
    let releaseActive: (() => void) | undefined;
    let releaseQueued: (() => void) | undefined;
    const active = budget.run(
      () =>
        new Promise<void>((resolve) => {
          releaseActive = resolve;
        }),
    );
    const queued = budget.run(
      () =>
        new Promise<void>((resolve) => {
          releaseQueued = resolve;
        }),
    );

    await expect(budget.run(async () => undefined)).rejects.toBeInstanceOf(
      SearchOutboundBudgetExceededError,
    );
    releaseActive?.();
    await active;
    await vi.waitFor(() => {
      expect(budget.getState()).toEqual({ active: 1, queued: 0 });
      expect(releaseQueued).toBeTypeOf("function");
    });
    releaseQueued?.();
    await queued;
  });
});

describe("search relevance", () => {
  it("normalizes accents, punctuation, casing and whitespace", () => {
    expect(normalizeSearchText("  AmÉLIE:  Le  Fabuleux! ")).toBe(
      "amelie le fabuleux",
    );
  });

  it("orders exact, alternative, prefix, complete-token and partial matches", () => {
    const query = "matrix";
    const scores = [
      scoreSearchResult(meta("exact", "Matrix"), query),
      scoreSearchResult(
        meta("alternative", "Matriks", "movie", {
          alternativeTitles: ["Matrix"],
        }),
        query,
      ),
      scoreSearchResult(meta("prefix", "Matrix Reloaded"), query),
      scoreSearchResult(meta("complete", "Inside the Matrix"), query),
      scoreSearchResult(meta("partial", "The Matrixology"), query),
    ];

    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(new Set(scores).size).toBe(scores.length);
  });

  it("uses a requested release year within the same relevance tier", () => {
    const matching = meta("matching", "Dune", "movie", {
      releaseInfo: "2021",
    });
    const other = meta("other", "Dune", "movie", { releaseInfo: "1984" });

    expect(scoreSearchResult(matching, "Dune 2021")).toBeGreaterThan(
      scoreSearchResult(other, "Dune 2021"),
    );
  });

  it("deduplicates by type/id, merges provenance, and keeps movie/series separate", () => {
    const ranked = rankSearchCandidates(
      [
        { meta: meta("tt1", "Matrix"), providerId: "provider-b" },
        { meta: meta("tt1", "The Matrix"), providerId: "provider-a" },
        { meta: meta("tt1", "Matrix", "series"), providerId: "provider-a" },
        { meta: meta("tt2", "Matrix Reloaded"), providerId: "provider-a" },
      ],
      "matrix",
    );

    expect(ranked.metas.map(({ type, id }) => `${type}:${id}`)).toEqual([
      "movie:tt1",
      "series:tt1",
      "movie:tt2",
    ]);
    expect(ranked.providersByContent).toEqual({
      "movie:tt1": ["provider-a", "provider-b"],
      "series:tt1": ["provider-a"],
      "movie:tt2": ["provider-a"],
    });
  });

  it("chooses the richer duplicate deterministically regardless of provider order", () => {
    const sparse = { meta: meta("tt1", "Matrix"), providerId: "provider-a" };
    const rich = {
      meta: meta("tt1", "Matrix", "movie", {
        poster: "https://images.example/matrix.jpg",
        releaseInfo: "1999",
        description: "A complete metadata record.",
      }),
      providerId: "provider-b",
    };

    const forward = rankSearchCandidates([sparse, rich], "matrix");
    const reverse = rankSearchCandidates([rich, sparse], "matrix");

    expect(forward.metas).toEqual(reverse.metas);
    expect(forward.metas[0]).toMatchObject({
      poster: "https://images.example/matrix.jpg",
      releaseInfo: "1999",
    });
    expect(forward.providersByContent["movie:tt1"]).toEqual([
      "provider-a",
      "provider-b",
    ]);
  });
});
