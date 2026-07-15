import type { MetaPreview } from "./meta";

export interface SearchProviderFacet {
  id: string;
  name: string;
}

/**
 * Aggregated search response with enough health information for clients to
 * distinguish an empty result from missing or temporarily failing providers.
 */
export interface SearchResponse {
  metas: MetaPreview[];
  providers: SearchProviderFacet[];
  providersByContent: Record<string, string[]>;
  attemptedProviders: number;
  successfulProviders: number;
  failedProviderIds: string[];
  partial: boolean;
}
