import { serve } from "@hono/node-server";
import { Hono } from "hono";

/**
 * A deterministic Stremio-compatible fixture modelled after TorrentClaw's
 * deployed manifest. In particular, searchable catalogs are declared after
 * several browse-only catalogs and the provider omits `catalog` from its
 * `resources` array despite serving working catalog routes.
 */
export const SEARCHABLE_ADDON_MANIFEST = {
  id: "com.streamer.fixture.searchable",
  version: "1.0.0",
  name: "Searchable fixture",
  description: "A multi-catalog metadata fixture for search integration tests",
  resources: [
    { name: "stream", types: ["movie", "series"], idPrefixes: ["tt"] },
    { name: "meta", types: ["movie", "series"], idPrefixes: ["tt"] },
  ],
  types: ["movie", "series"],
  catalogs: [
    {
      type: "movie",
      id: "featured-movies",
      name: "Featured movies",
      extra: [{ name: "skip" }],
    },
    {
      type: "series",
      id: "trending-series",
      name: "Trending series",
      extra: [{ name: "genre", options: ["Drama", "Comedy"] }],
    },
    {
      type: "movie",
      id: "search-movies",
      name: "Search movies",
      extra: [{ name: "search", isRequired: true }, { name: "skip" }],
    },
    {
      type: "series",
      id: "search-series",
      name: "Search series",
      extra: [{ name: "search", isRequired: true }, { name: "skip" }],
    },
  ],
} as const;

export const BROWSE_ONLY_ADDON_MANIFEST = {
  id: "com.streamer.fixture.browse-only",
  version: "1.0.0",
  name: "Browse-only fixture",
  description: "Catalogs without search capability",
  resources: ["catalog"],
  types: ["movie", "series"],
  catalogs: [
    {
      type: "movie",
      id: "popular-movies",
      name: "Popular movies",
      extra: [{ name: "genre", options: ["Action"] }],
    },
    {
      type: "series",
      id: "popular-series",
      name: "Popular series",
      extra: [{ name: "skip" }],
    },
  ],
} as const;

export const STREAM_ONLY_ADDON_MANIFEST = {
  id: "com.streamer.fixture.stream-only",
  version: "1.0.0",
  name: "Stream-only fixture",
  description: "A source provider without title catalogs",
  resources: [
    { name: "stream", types: ["movie", "series"], idPrefixes: ["tt"] },
  ],
  types: ["movie", "series"],
  catalogs: [],
} as const;

export interface SearchAddonFixtureRequest {
  provider: "searchable" | "failing" | "browse-only" | "stream-only";
  type: string;
  catalogId: string;
  search: string;
  skip?: number;
}

function parseCatalogExtras(value: string) {
  const withoutExtension = value.replace(/\.json$/, "");
  const params = new URLSearchParams(withoutExtension);
  const skipValue = params.get("skip");
  return {
    search: params.get("search") ?? "",
    skip: skipValue === null ? undefined : Number(skipValue),
  };
}

function resultsFor(type: string, query: string) {
  const normalized = query.trim().toLocaleLowerCase("en-US");

  if (type === "movie" && normalized.includes("matrix")) {
    return [
      {
        id: "tt0133093",
        type: "movie",
        name: "The Matrix",
        releaseInfo: "1999",
        poster: "https://fixture.example/matrix.jpg",
      },
      {
        id: "tt0234215",
        type: "movie",
        name: "The Matrix Reloaded",
        releaseInfo: "2003",
        poster: "https://fixture.example/matrix-reloaded.jpg",
      },
    ];
  }

  if (type === "series" && normalized.includes("breaking bad")) {
    return [
      {
        id: "tt0903747",
        type: "series",
        name: "Breaking Bad",
        releaseInfo: "2008-2013",
        poster: "https://fixture.example/breaking-bad.jpg",
      },
    ];
  }

  return [];
}

export function startSearchAddonFixture() {
  const app = new Hono();
  const requests: SearchAddonFixtureRequest[] = [];

  app.get("/searchable/manifest.json", (c) =>
    c.json(SEARCHABLE_ADDON_MANIFEST),
  );
  app.get("/failing/manifest.json", (c) =>
    c.json({
      ...SEARCHABLE_ADDON_MANIFEST,
      id: "com.streamer.fixture.failing",
      name: "Failing search fixture",
    }),
  );
  app.get("/browse-only/manifest.json", (c) =>
    c.json(BROWSE_ONLY_ADDON_MANIFEST),
  );
  app.get("/stream-only/manifest.json", (c) =>
    c.json(STREAM_ONLY_ADDON_MANIFEST),
  );

  app.get("/:provider/catalog/:type/:catalogId/:extras", (c) => {
    const provider = c.req.param(
      "provider",
    ) as SearchAddonFixtureRequest["provider"];
    const type = c.req.param("type");
    const catalogId = c.req.param("catalogId");
    const { search, skip } = parseCatalogExtras(c.req.param("extras"));

    requests.push({ provider, type, catalogId, search, skip });

    if (provider === "failing") {
      return c.json({ error: "fixture provider unavailable" }, 503);
    }

    if (provider !== "searchable") {
      return c.json({ error: "catalog does not support search" }, 400);
    }

    const expectedCatalog =
      type === "movie" ? "search-movies" : "search-series";
    if (catalogId !== expectedCatalog) {
      return c.json({ error: "catalog does not support search" }, 400);
    }

    return c.json({ metas: resultsFor(type, search) });
  });

  const server = serve({ fetch: app.fetch, port: 0 });
  const port = (server.address() as { port: number }).port;

  return {
    baseUrl: `http://localhost:${port}`,
    requests,
    resetRequests: () => requests.splice(0, requests.length),
    close: () => server.close(),
  };
}
