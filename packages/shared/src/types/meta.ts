/** Lightweight metadata for catalog listings */
export interface MetaPreview {
    id: string;
    type: 'movie' | 'series';
    name: string;
    poster: string;
    description?: string;
    releaseInfo?: string;
    imdbRating?: string;
}

/** Episode/video within a series */
export interface VideoEntry {
    id: string;
    title: string;
    season: number;
    episode: number;
    released: string;
}

/** Full metadata for a single item */
export interface MetaDetail extends MetaPreview {
    background?: string;
    genres?: string[];
    cast?: string[];
    director?: string[];
    runtime?: string;
    videos?: VideoEntry[];
}

/** Catalog response from an add-on */
export interface CatalogResponse {
    metas: MetaPreview[];
}

/** Meta detail response from an add-on */
export interface MetaResponse {
    meta: MetaDetail;
}
