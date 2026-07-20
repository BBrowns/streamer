import type { InstalledAddon } from "@streamer/shared";
import {
  buildCatalogDiscoveryRows,
  canBrowseCatalog,
} from "../catalogDiscovery";

const streamOnlyAddon: InstalledAddon = {
  id: "stream-only",
  userId: "user-a",
  transportUrl: "https://stream.example/manifest.json",
  installedAt: "2026-07-20T10:00:00.000Z",
  manifest: {
    id: "stream.example",
    version: "1.0.0",
    name: "Stream source",
    description: "Streams only",
    resources: ["stream"],
    types: ["movie", "series"],
    catalogs: [],
  },
};

const catalogAddon: InstalledAddon = {
  id: "catalog-source",
  userId: "user-a",
  transportUrl: "https://catalog.example/manifest.json",
  installedAt: "2026-07-20T10:01:00.000Z",
  manifest: {
    id: "catalog.example",
    version: "1.0.0",
    name: "Catalog source",
    description: "Browseable catalogs",
    resources: ["catalog", "meta"],
    types: ["movie", "series"],
    catalogs: [
      { type: "movie", id: "top", name: "Top movies" },
      { type: "series", id: "top", name: "Top series" },
      {
        type: "movie",
        id: "requires-genre",
        name: "Choose a genre",
        extra: [{ name: "genre", isRequired: true }],
      },
    ],
  },
};

const configurationRequiredAddon: InstalledAddon = {
  ...catalogAddon,
  id: "configuration-required",
  manifest: {
    ...catalogAddon.manifest,
    id: "configuration.required",
    name: "Needs setup",
    behaviorHints: { configurationRequired: true },
  },
};

describe("catalog discovery", () => {
  it("keeps stream-only add-ons out of browse rows", () => {
    expect(buildCatalogDiscoveryRows([streamOnlyAddon])).toEqual([]);
  });

  it("uses a newly available catalog provider immediately and excludes unsupported required extras", () => {
    expect(
      buildCatalogDiscoveryRows([streamOnlyAddon, catalogAddon]).map(
        ({ addon, catalog }) => `${addon.id}:${catalog.type}:${catalog.id}`,
      ),
    ).toEqual(["catalog-source:movie:top", "catalog-source:series:top"]);
  });

  it("keeps a source that needs setup out of browse rows until it can provide content", () => {
    expect(buildCatalogDiscoveryRows([configurationRequiredAddon])).toEqual([]);
  });

  it("allows the paging extra while rejecting choices the client cannot supply", () => {
    expect(
      canBrowseCatalog({
        type: "movie",
        id: "paged",
        name: "Paged",
        extra: [{ name: "skip", isRequired: true }],
      }),
    ).toBe(true);
    expect(
      canBrowseCatalog({
        type: "movie",
        id: "needs-search",
        name: "Needs a title",
        extra: [{ name: "search", isRequired: true }],
      }),
    ).toBe(false);
  });
});
