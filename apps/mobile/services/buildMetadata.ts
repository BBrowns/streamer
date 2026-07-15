import Constants from "expo-constants";
import { Platform } from "react-native";
import {
  buildMetadataToSentryTags,
  createBuildMetadataFromEnv,
  type BuildMetadata,
  type BuildRuntimeType,
} from "@streamer/shared";
import { clientRuntimeConfig } from "./runtimeConfig";

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
  return createBuildMetadataFromEnv(
    {
      ...process.env,
      EXPO_PUBLIC_STREAMER_GIT_SHA: clientRuntimeConfig.gitSha,
      EXPO_PUBLIC_STREAMER_BUILD_DATE: clientRuntimeConfig.buildDate,
      EXPO_PUBLIC_STREAMER_BUILD_CHANNEL: clientRuntimeConfig.buildChannel,
      EXPO_PUBLIC_STREAMER_BUILD_ENVIRONMENT:
        clientRuntimeConfig.buildEnvironment,
    },
    {
      runtimeType: resolveRuntimeType(),
      appVersion: Constants.expoConfig?.version,
    },
  );
}

export const clientBuildMetadata = getClientBuildMetadata();

export const clientBuildSentryTags =
  buildMetadataToSentryTags(clientBuildMetadata);

export function formatBuildStamp(metadata: BuildMetadata) {
  if (metadata.gitShaShort && metadata.gitShaShort !== "unknown") {
    return metadata.gitShaShort;
  }

  return metadata.environment === "development"
    ? "Not stamped (development)"
    : "Not stamped";
}

export function formatBuildLabel(metadata: BuildMetadata) {
  const sha = formatBuildStamp(metadata);
  return `${metadata.runtimeType} v${metadata.appVersion} · ${metadata.buildChannel} · ${sha}`;
}
