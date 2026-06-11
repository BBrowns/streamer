import {
  buildMetadataToSentryTags,
  createBuildMetadataFromEnv,
} from "@streamer/shared";

export const streamServerBuildMetadata = createBuildMetadataFromEnv(
  process.env,
  {
    runtimeType: "stream-server",
  },
);

export const streamServerBuildSentryTags = buildMetadataToSentryTags(
  streamServerBuildMetadata,
);
