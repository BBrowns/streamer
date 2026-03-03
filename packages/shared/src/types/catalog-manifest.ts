import type { MetaPreview } from "./meta";

/** Layout hint for how to render a catalog section on the Discover screen */
export type CatalogLayout = "hero" | "row" | "grid" | "continue";

/** A single catalog section (Server-Driven UI) */
export interface CatalogManifest {
  id: string;
  name: string;
  type: string;
  addonId: string;
  addonName: string;
  layout: CatalogLayout;
  items: MetaPreview[];
}

/** The full Discover screen response from the server */
export interface DiscoverResponse {
  catalogs: CatalogManifest[];
}
