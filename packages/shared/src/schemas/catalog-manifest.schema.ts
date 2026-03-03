import { z } from "zod";
import { metaPreviewSchema } from "./meta.schema";

/** Layout hint for Server-Driven UI rendering */
export const catalogLayoutSchema = z.enum([
  "hero", // Full-width hero banner carousel
  "row", // Horizontal poster row (default)
  "grid", // Grid of posters
  "continue", // Continue watching row with progress bars
]);

/** A single catalog section for the Discover screen */
export const catalogManifestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1), // content type: "movie", "series"
  addonId: z.string().min(1),
  addonName: z.string().min(1),
  layout: catalogLayoutSchema.default("row"),
  items: z.array(metaPreviewSchema),
});

/** Full discover response: ordered list of catalog sections */
export const discoverResponseSchema = z.object({
  catalogs: z.array(catalogManifestSchema),
});

/** Inferred types */
export type CatalogLayout = z.infer<typeof catalogLayoutSchema>;
export type CatalogManifestItem = z.infer<typeof catalogManifestSchema>;
export type DiscoverResponse = z.infer<typeof discoverResponseSchema>;
