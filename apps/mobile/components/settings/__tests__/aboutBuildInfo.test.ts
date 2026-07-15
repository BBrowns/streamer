import type { BuildMetadata } from "@streamer/shared";
import { resolveAboutBuildInfo } from "../aboutBuildInfo";

const clientBuild: BuildMetadata = {
  appVersion: "1.0.0",
  gitSha: "unknown",
  gitShaShort: "unknown",
  buildDate: "unknown",
  buildChannel: "development",
  runtimeType: "desktop-renderer",
  environment: "development",
  release: "streamer-desktop-renderer@1.0.0",
};

describe("About build information", () => {
  it("keeps product, desktop shell and Electron versions separate", () => {
    const desktopBuild: BuildMetadata = {
      ...clientBuild,
      appVersion: "0.4.2",
      gitSha: "1234567890abcdef",
      gitShaShort: "1234567890ab",
      buildChannel: "beta",
      runtimeType: "desktop-main",
    };

    expect(
      resolveAboutBuildInfo({
        clientBuild,
        desktopInfo: {
          build: desktopBuild,
          desktopRuntime: {
            productVersion: "0.4.2",
            electronVersion: "40.10.6",
          },
        },
      }),
    ).toEqual({
      streamerVersion: "1.0.0",
      desktopVersion: "0.4.2",
      electronVersion: "40.10.6",
      buildSha: "1234567890ab",
      channel: "beta",
    });
  });

  it("uses explicit development stamping and no invented desktop runtime", () => {
    expect(resolveAboutBuildInfo({ clientBuild })).toMatchObject({
      desktopVersion: null,
      electronVersion: null,
      buildSha: "Not stamped (development)",
    });
  });
});
