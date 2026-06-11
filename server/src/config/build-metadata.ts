import {
  buildMetadataToSentryTags,
  createBuildMetadataFromEnv,
  type BuildMetadata,
} from "@streamer/shared";

export const serverBuildMetadata = createBuildMetadataFromEnv(process.env, {
  runtimeType: "server",
}) as BuildMetadata & { runtimeType: "server" };

export const serverBuildSentryTags =
  buildMetadataToSentryTags(serverBuildMetadata);
