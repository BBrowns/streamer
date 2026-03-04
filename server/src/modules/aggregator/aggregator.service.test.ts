import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AggregatorService } from './aggregator.service';
import { RealDebridResolver } from '../debrid/adapters/real-debrid.resolver';
import { featureFlags } from '../feature-flag/feature-flag.service';

// Mock dependencies
vi.mock('../debrid/adapters/real-debrid.resolver');
vi.mock('../feature-flag/feature-flag.service');
vi.mock('../../prisma/client', () => ({
    prisma: {
        userAddon: { findMany: vi.fn() }
    }
}));
vi.mock('../../config/logger', () => ({
    logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    }
}));

describe('AggregatorService', () => {
    let service: AggregatorService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new AggregatorService();
    });

    describe('resolveStream', () => {
        const mockStream = {
            userId: 'user-1',
            type: 'movie',
            id: 'meta-1',
            infoHash: 'hash123',
            requestId: 'req-1'
        };

        it('should return RD direct link if RD is enabled and resolves', async () => {
            // 1. Feature flag enabled
            vi.mocked(featureFlags.getAll).mockReturnValue({
                'real-debrid': true,
                'torrent-engine': false,
                'trakt-sync': false,
                'ai-recommendations': false,
                'continue-watching': true,
                'server-driven-ui': true,
            });

            // 2. Mock Resolver
            const mockResolved = { url: 'https://rd.com/file.mp4', host: 'rd', size: 100 };
            vi.mocked(RealDebridResolver).mockImplementation(() => ({
                resolve: vi.fn().mockResolvedValue(mockResolved),
                canResolve: vi.fn().mockReturnValue(true),
                getAccountStatus: vi.fn(),
            } as any));

            const result = await service.resolveStream(
                mockStream.userId,
                mockStream.type,
                mockStream.id,
                mockStream.infoHash,
                mockStream.requestId
            );

            expect(result).toEqual(mockResolved);
        });

        it('should fallback to magnet link if RD is disabled', async () => {
            vi.mocked(featureFlags.getAll).mockReturnValue({
                'real-debrid': false,
                'torrent-engine': false,
                'trakt-sync': false,
                'ai-recommendations': false,
                'continue-watching': true,
                'server-driven-ui': true,
            });

            const result = await service.resolveStream(
                mockStream.userId,
                mockStream.type,
                mockStream.id,
                mockStream.infoHash,
                mockStream.requestId
            );

            expect(result).toEqual({
                url: `magnet:?xt=urn:btih:${mockStream.infoHash}`,
                type: 'magnet'
            });
        });

        it('should fallback to magnet link if RD fails to resolve', async () => {
            vi.mocked(featureFlags.getAll).mockReturnValue({
                'real-debrid': true,
                'torrent-engine': false,
                'trakt-sync': false,
                'ai-recommendations': false,
                'continue-watching': true,
                'server-driven-ui': true,
            });

            vi.mocked(RealDebridResolver).mockImplementation(() => ({
                resolve: vi.fn().mockResolvedValue(null),
                canResolve: vi.fn().mockReturnValue(true),
                getAccountStatus: vi.fn(),
            } as any));

            const result = await service.resolveStream(
                mockStream.userId,
                mockStream.type,
                mockStream.id,
                mockStream.infoHash,
                mockStream.requestId
            );

            expect(result).toEqual({
                url: `magnet:?xt=urn:btih:${mockStream.infoHash}`,
                type: 'magnet'
            });
        });
    });
});
