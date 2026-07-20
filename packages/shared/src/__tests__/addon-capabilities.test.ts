import { describe, expect, it } from "vitest";
import {
  requiresAddonConfiguration,
  supportsCatalogType,
} from "../addon-capabilities";

describe("supportsCatalogType", () => {
  const torrentClawManifest = {
    types: ["movie", "series"],
    catalogs: [{ type: "movie", id: "tc-search", name: "Movies" }],
  };

  it("uses a concrete catalog definition even when resources omits catalog", () => {
    expect(supportsCatalogType(torrentClawManifest, "movie")).toBe(true);
    expect(supportsCatalogType(torrentClawManifest, "movie", "tc-search")).toBe(
      true,
    );
  });

  it("does not infer a catalog for an unsupported type or unknown catalog id", () => {
    expect(supportsCatalogType(torrentClawManifest, "series")).toBe(false);
    expect(supportsCatalogType(torrentClawManifest, "movie", "unlisted")).toBe(
      false,
    );
  });

  it("excludes providers that explicitly still require configuration", () => {
    const pendingConfiguration = {
      ...torrentClawManifest,
      behaviorHints: { configurationRequired: true },
    };

    expect(requiresAddonConfiguration(pendingConfiguration)).toBe(true);
    expect(supportsCatalogType(pendingConfiguration, "movie")).toBe(false);
    expect(
      supportsCatalogType(
        {
          ...pendingConfiguration,
          behaviorHints: { configurationRequired: false },
        },
        "movie",
      ),
    ).toBe(true);
  });
});
