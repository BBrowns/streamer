import { prisma } from '../../../prisma/client.js';
import type {
    IWatchProgressRepository,
    WatchProgressRecord,
} from '../ports/library.ports.js';

/** Prisma adapter implementing IWatchProgressRepository */
export class PrismaWatchProgressRepository implements IWatchProgressRepository {
    async findByUser(userId: string, limit = 20): Promise<WatchProgressRecord[]> {
        const records = await prisma.watchProgress.findMany({
            where: { userId },
            orderBy: { lastWatched: 'desc' },
            take: limit,
        });

        return records.map((r) => ({
            id: r.id,
            userId: r.userId,
            type: r.type,
            itemId: r.itemId,
            season: r.season,
            episode: r.episode,
            currentTime: r.currentTime,
            duration: r.duration,
            title: r.title,
            poster: r.poster,
            lastWatched: r.lastWatched,
        }));
    }

    async upsert(data: {
        userId: string;
        type: string;
        itemId: string;
        season?: number | null;
        episode?: number | null;
        currentTime: number;
        duration: number;
        title: string;
        poster?: string | null;
    }): Promise<WatchProgressRecord> {
        const record = await prisma.watchProgress.upsert({
            where: {
                userId_itemId_season_episode: {
                    userId: data.userId,
                    itemId: data.itemId,
                    season: data.season ?? 0,
                    episode: data.episode ?? 0,
                },
            },
            create: {
                userId: data.userId,
                type: data.type,
                itemId: data.itemId,
                season: data.season ?? 0,
                episode: data.episode ?? 0,
                currentTime: data.currentTime,
                duration: data.duration,
                title: data.title,
                poster: data.poster ?? null,
            },
            update: {
                currentTime: data.currentTime,
                duration: data.duration,
                title: data.title,
                poster: data.poster ?? null,
                lastWatched: new Date(),
            },
        });

        return {
            id: record.id,
            userId: record.userId,
            type: record.type,
            itemId: record.itemId,
            season: record.season,
            episode: record.episode,
            currentTime: record.currentTime,
            duration: record.duration,
            title: record.title,
            poster: record.poster,
            lastWatched: record.lastWatched,
        };
    }

    async delete(userId: string, itemId: string): Promise<void> {
        await prisma.watchProgress.deleteMany({
            where: { userId, itemId },
        });
    }
}
