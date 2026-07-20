import type { InstalledAddon } from "@streamer/shared";
import {
  addonQueryKeys,
  removeInstalledAddon,
  upsertInstalledAddon,
} from "../useAddons";

const earlierAddon: InstalledAddon = {
  id: "earlier",
  userId: "user-a",
  transportUrl: "https://earlier.example/manifest.json",
  installedAt: "2026-07-20T10:00:00.000Z",
  manifest: {
    id: "earlier.example",
    version: "1.0.0",
    name: "Earlier",
    description: "Fixture",
    resources: ["catalog"],
    types: ["movie"],
    catalogs: [{ type: "movie", id: "top", name: "Top" }],
  },
};

const installedAddon: InstalledAddon = {
  ...earlierAddon,
  id: "new-catalog",
  transportUrl: "https://new.example/manifest.json",
  installedAt: "2026-07-20T10:05:00.000Z",
  manifest: {
    ...earlierAddon.manifest,
    id: "new.example",
    name: "New catalog",
  },
};

describe("add-on query cache helpers", () => {
  it("scopes persisted add-on data to the signed-in account", () => {
    expect(addonQueryKeys.list("user-a")).toEqual(["addons", "user-a"]);
    expect(addonQueryKeys.list("user-b")).toEqual(["addons", "user-b"]);
  });

  it("adds a new catalog to an empty cache without waiting for a refetch", () => {
    expect(upsertInstalledAddon([], installedAddon)).toEqual([installedAddon]);
  });

  it("deduplicates, orders, and removes cache entries by installed add-on id", () => {
    expect(
      upsertInstalledAddon([installedAddon, earlierAddon], installedAddon),
    ).toEqual([installedAddon, earlierAddon]);
    expect(
      removeInstalledAddon([installedAddon, earlierAddon], installedAddon.id),
    ).toEqual([earlierAddon]);
  });
});
