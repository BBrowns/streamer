import type { CatalogDefinition, InstalledAddon } from "@streamer/shared";
import { rankProviderCatalogRows } from "../homeDiscovery";

const addon = (id: string): InstalledAddon => ({
  id,
  userId: "user-1",
  transportUrl: `https://${id}.example.test/manifest.json`,
  installedAt: "2026-07-18T00:00:00.000Z",
  manifest: {
    id,
    version: "1.0.0",
    name: id,
    description: "",
    resources: ["catalog"],
    types: ["movie", "series"],
    catalogs: [],
  },
});

const catalog = (
  type: "movie" | "series",
  id: string = type,
): CatalogDefinition => ({
  type,
  id,
  name: id,
});

describe("rankProviderCatalogRows", () => {
  const rows = [
    { addon: addon("a"), catalog: catalog("movie"), originalIndex: 0 },
    { addon: addon("b"), catalog: catalog("series"), originalIndex: 1 },
    {
      addon: addon("c"),
      catalog: catalog("movie", "movies-2"),
      originalIndex: 2,
    },
  ];

  it("uses local continuation and library signals without renaming provider rails", () => {
    const ranked = rankProviderCatalogRows(
      rows,
      [
        {
          id: "library-1",
          userId: "user-1",
          type: "series",
          itemId: "series-1",
          title: "Series",
          addedAt: "2026-07-18T00:00:00.000Z",
        },
      ],
      [
        {
          id: "progress-1",
          userId: "user-1",
          type: "series",
          itemId: "series-2",
          currentTime: 120,
          duration: 3600,
          title: "Series two",
          lastWatched: "2026-07-18T12:00:00.000Z",
        },
      ],
    );

    expect(ranked.map((row) => row.catalog.id)).toEqual([
      "series",
      "movie",
      "movies-2",
    ]);
  });

  it("preserves installed/catalog order with no activity", () => {
    expect(rankProviderCatalogRows(rows).map((row) => row.catalog.id)).toEqual([
      "movie",
      "series",
      "movies-2",
    ]);
  });
});
