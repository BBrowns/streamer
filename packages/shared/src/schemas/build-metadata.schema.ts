import { z } from "zod";

export const buildRuntimeTypeSchema = z.enum([
  "mobile",
  "desktop-main",
  "desktop-renderer",
  "server",
  "stream-server",
]);

export const buildEnvironmentSchema = z.enum([
  "development",
  "preview",
  "production",
  "test",
]);

export const buildMetadataSchema = z.object({
  appVersion: z.string(),
  gitSha: z.string(),
  gitShaShort: z.string(),
  buildDate: z.string(),
  buildChannel: z.string(),
  runtimeType: buildRuntimeTypeSchema,
  environment: buildEnvironmentSchema,
  release: z.string(),
});

export type BuildMetadataSchema = z.infer<typeof buildMetadataSchema>;
