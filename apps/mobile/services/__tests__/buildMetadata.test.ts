import type { BuildMetadata } from "@streamer/shared";
import { formatBuildLabel, formatBuildStamp } from "../buildMetadata";

function metadata(overrides: Partial<BuildMetadata> = {}): BuildMetadata {
  return {
    appVersion: "1.2.3",
    gitSha: "unknown",
    gitShaShort: "unknown",
    buildDate: "unknown",
    buildChannel: "development",
    runtimeType: "desktop-renderer",
    environment: "development",
    release: "streamer-desktop-renderer@1.2.3",
    ...overrides,
  };
}

describe("build metadata presentation", () => {
  it("labels an unstamped local build without claiming an unknown SHA", () => {
    expect(formatBuildStamp(metadata())).toBe("Not stamped (development)");
    expect(formatBuildLabel(metadata())).toBe(
      "desktop-renderer v1.2.3 · development · Not stamped (development)",
    );
  });

  it("shows a stamped build SHA", () => {
    expect(
      formatBuildStamp(
        metadata({
          gitSha: "1234567890abcdef",
          gitShaShort: "1234567890ab",
          environment: "production",
          buildChannel: "stable",
        }),
      ),
    ).toBe("1234567890ab");
  });
});
