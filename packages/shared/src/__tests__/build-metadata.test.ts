import { describe, expect, it } from "vitest";
import {
  buildMetadataToSentryTags,
  createBuildMetadataFromEnv,
} from "../build-metadata";

describe("build metadata", () => {
  it("creates stable release metadata from env", () => {
    const metadata = createBuildMetadataFromEnv(
      {
        STREAMER_APP_VERSION: "1.2.3",
        STREAMER_GIT_SHA: "1234567890abcdef",
        STREAMER_BUILD_DATE: "2026-06-11T10:00:00.000Z",
        STREAMER_BUILD_CHANNEL: "beta",
        STREAMER_BUILD_ENVIRONMENT: "staging",
        NODE_ENV: "production",
      },
      { runtimeType: "server" },
    );

    expect(metadata).toEqual({
      appVersion: "1.2.3",
      gitSha: "1234567890abcdef",
      gitShaShort: "1234567890ab",
      buildDate: "2026-06-11T10:00:00.000Z",
      buildChannel: "beta",
      runtimeType: "server",
      environment: "preview",
      release: "streamer-server@1.2.3+1234567890ab",
    });
  });

  it("falls back without inventing build-time data", () => {
    const metadata = createBuildMetadataFromEnv(
      { NODE_ENV: "development", npm_package_version: "0.1.0" },
      { runtimeType: "stream-server" },
    );

    expect(metadata.appVersion).toBe("0.1.0");
    expect(metadata.gitSha).toBe("unknown");
    expect(metadata.buildDate).toBe("unknown");
    expect(metadata.environment).toBe("development");
    expect(metadata.release).toBe("streamer-stream-server@0.1.0");
  });

  it("maps metadata to privacy-safe Sentry tags", () => {
    const metadata = createBuildMetadataFromEnv(
      {
        STREAMER_APP_VERSION: "1.2.3",
        STREAMER_GIT_SHA: "abcdef",
        NODE_ENV: "production",
      },
      { runtimeType: "mobile" },
    );

    expect(buildMetadataToSentryTags(metadata)).toMatchObject({
      "streamer.runtime": "mobile",
      "streamer.version": "1.2.3",
      "streamer.git_sha": "abcdef",
      "streamer.git_sha_short": "abcdef",
      "streamer.build_channel": "production",
    });
  });
});
