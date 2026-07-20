import { describe, expect, it } from "vitest";
import { addonManifestSchema } from "../schemas/manifest.schema";

describe("addonManifestSchema", () => {
  it("preserves the safe configuration-required hint", () => {
    const manifest = addonManifestSchema.parse({
      id: "com.ratingposterdb.rpdb",
      version: "1.0.0",
      name: "RatingPosterDB",
      description: "Poster customization",
      resources: ["catalog"],
      types: ["movie"],
      catalogs: [],
      behaviorHints: {
        configurationRequired: true,
        configurationUrl: "https://provider.example/private-token",
      },
    });

    expect(manifest.behaviorHints).toEqual({
      configurationRequired: true,
    });
    expect(JSON.stringify(manifest)).not.toContain("configurationUrl");
  });
});
