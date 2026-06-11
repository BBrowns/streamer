import Constants from "expo-constants";
import { Platform } from "react-native";
import {
  buildMetadataToSentryTags,
  createBuildMetadataFromEnv,
  type BuildMetadata,
  type BuildRuntimeType,
} from "@streamer/shared";

function resolveRuntimeType(): BuildRuntimeType {
  if (
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    Boolean(window.desktopBridge)
  ) {
    return "desktop-renderer";
  }

  return "mobile";
}

export function getClientBuildMetadata(): BuildMetadata {
  return createBuildMetadataFromEnv(process.env, {
    runtimeType: resolveRuntimeType(),
    appVersion: Constants.expoConfig?.version,
  });
}

export const clientBuildMetadata = getClientBuildMetadata();

export const clientBuildSentryTags =
  buildMetadataToSentryTags(clientBuildMetadata);

export function formatBuildLabel(metadata: BuildMetadata) {
  const sha =
    metadata.gitShaShort && metadata.gitShaShort !== "unknown"
      ? metadata.gitShaShort
      : "unknown sha";
  return `${metadata.runtimeType} v${metadata.appVersion} · ${metadata.buildChannel} · ${sha}`;
}
