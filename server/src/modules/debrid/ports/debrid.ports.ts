import type { Stream } from '@streamer/shared';

/** Port: Resolves magnet/torrent links to direct HTTP streams via a debrid service */
export interface IDebridResolver {
    /** Check if this resolver can handle the given stream */
    canResolve(stream: Stream): boolean;

    /** Resolve a stream (e.g. magnet link) to a direct HTTP URL */
    resolve(stream: Stream, requestId: string): Promise<ResolvedStream | null>;

    /** Check account status/quota */
    getAccountStatus(): Promise<DebridAccountStatus>;
}

/** A resolved direct link from a debrid service */
export interface ResolvedStream {
    url: string;
    quality?: string;
    size?: number;
    host?: string;
}

/** Debrid service account status */
export interface DebridAccountStatus {
    isActive: boolean;
    isPremium: boolean;
    expiresAt?: string;
    quotaUsed?: number;
    quotaLimit?: number;
}
