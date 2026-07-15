import type { BuildMetadata } from "@streamer/shared";
import { formatBuildStamp } from "../../services/buildMetadata";

export type AboutDesktopInfo = {
  build?: BuildMetadata;
  diagnostics?: { build?: BuildMetadata };
  desktopRuntime?: {
    productVersion?: string;
    electronVersion?: string;
  };
};

export function resolveAboutBuildInfo({
  clientBuild,
  desktopInfo,
  updateVersion,
}: {
  clientBuild: BuildMetadata;
  desktopInfo?: AboutDesktopInfo | null;
  updateVersion?: string | null;
}) {
  const desktopBuild = desktopInfo?.build ?? desktopInfo?.diagnostics?.build;
  const displayedBuild = desktopBuild ?? clientBuild;

  return {
    streamerVersion: clientBuild.appVersion,
    desktopVersion:
      desktopInfo?.desktopRuntime?.productVersion ||
      desktopBuild?.appVersion ||
      updateVersion ||
      null,
    electronVersion: desktopInfo?.desktopRuntime?.electronVersion || null,
    buildSha: formatBuildStamp(displayedBuild),
    channel: displayedBuild.buildChannel || null,
  };
}
