import type { MetaPreview, MetaDetail, Stream } from '@streamer/shared';

/** Port: Client for making requests to external add-on APIs */
export interface IAddonClient {
    fetchCatalog(
        transportUrl: string,
        addonId: string,
        type: string,
        catalogId: string,
        requestId: string,
        options?: { search?: string; skip?: number },
    ): Promise<MetaPreview[]>;

    fetchMeta(
        transportUrl: string,
        addonId: string,
        type: string,
        id: string,
        requestId: string,
    ): Promise<MetaDetail | null>;

    fetchStreams(
        transportUrl: string,
        addonId: string,
        type: string,
        id: string,
        requestId: string,
    ): Promise<Stream[]>;
}
