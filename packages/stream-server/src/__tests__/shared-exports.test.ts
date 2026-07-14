import { describe, expect, it } from "vitest";
import {
  buildMetadataToSentryTags,
  createBuildMetadata,
} from "@streamer/shared";

describe("shared workspace ESM exports", () => {
  it("exposes runtime build metadata helpers as named imports", () => {
    const metadata = createBuildMetadata({
      runtimeType: "stream-server",
      appVersion: "1.0.0",
    });

    expect(buildMetadataToSentryTags(metadata)).toMatchObject({
      "streamer.runtime": "stream-server",
      "streamer.version": "1.0.0",
    });
  });
});
