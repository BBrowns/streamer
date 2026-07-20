/** Lightweight metadata for catalog listings */
export interface MetaPreview {
  id: string;
  type: "movie" | "series";
  name: string;
  poster: string;
  description?: string;
  releaseInfo?: string;
  released?: string;
  imdbRating?: string;
  aliases?: string[];
  alternativeTitles?: string[];
}

/** Episode/video within a series */
export interface VideoEntry {
  id: string;
  title: string;
  season: number;
  episode: number;
  released: string;
}

/**
 * A provider-declared trailer. `source` is usually a YouTube video id in the
 * Stremio protocol, but can be an allowlisted HTTPS URL for trusted providers.
 */
export interface MediaTrailer {
  source: string;
  type?: string;
}

/** Full metadata for a single item */
export interface MetaDetail extends MetaPreview {
  background?: string;
  logo?: string;
  genres?: string[];
  cast?: string[];
  director?: string[];
  runtime?: string;
  videos?: VideoEntry[];
  trailers?: MediaTrailer[];
}

/** Catalog response from an add-on */
export interface CatalogResponse {
  metas: MetaPreview[];
}

/** Meta detail response from an add-on */
export interface MetaResponse {
  meta: MetaDetail;
}
