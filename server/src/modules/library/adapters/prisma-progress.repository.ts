import { prisma } from "../../../prisma/client.js";
import { ContentType } from "@prisma/client";
import type {
  IWatchProgressRepository,
  WatchProgressRecord,
} from "../ports/library.ports.js";

/** Prisma adapter implementing IWatchProgressRepository */
export class PrismaWatchProgressRepository implements IWatchProgressRepository {
  async findByUser(userId: string, limit = 20): Promise<WatchProgressRecord[]> {
    const records = await prisma.watchProgress.findMany({
      where: { userId },
      orderBy: { lastWatched: "desc" },
      take: limit,
    });

    return records.map((r: any) => ({
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

  async findHistoryByUser(
    userId: string,
    options: { limit: number; cursor?: { lastWatched: Date; id: string } },
  ): Promise<WatchProgressRecord[]> {
    const cursorFilter = options.cursor
      ? {
          OR: [
            { lastWatched: { lt: options.cursor.lastWatched } },
            {
              lastWatched: options.cursor.lastWatched,
              id: { lt: options.cursor.id },
            },
          ],
        }
      : undefined;
    const records = await prisma.watchProgress.findMany({
      where: { userId, ...(cursorFilter ?? {}) },
      orderBy: [{ lastWatched: "desc" }, { id: "desc" }],
      take: options.limit,
    });

    return records.map((r: any) => ({
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
    type: ContentType;
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

  async deleteById(userId: string, historyId: string): Promise<boolean> {
    const result = await prisma.watchProgress.deleteMany({
      where: { userId, id: historyId },
    });
    return result.count === 1;
  }

  async deleteAll(userId: string): Promise<void> {
    await prisma.watchProgress.deleteMany({ where: { userId } });
  }
}
