import { prisma } from "../../../prisma/client.js";
import { ContentType } from "@prisma/client";
import type {
  IWatchProgressRepository,
  WatchProgressRecord,
} from "../ports/library.ports.js";
import type { WatchProgressDurationSource } from "@streamer/shared";

function toRecord(record: any): WatchProgressRecord {
  return {
    id: record.id,
    userId: record.userId,
    type: record.type,
    itemId: record.itemId,
    season: record.season,
    episode: record.episode,
    currentTime: record.currentTime,
    duration: record.duration,
    durationSource: record.durationSource as WatchProgressDurationSource,
    title: record.title,
    poster: record.poster,
    lastWatched: record.lastWatched,
  };
}

/** Prisma adapter implementing IWatchProgressRepository */
export class PrismaWatchProgressRepository implements IWatchProgressRepository {
  async findByUser(userId: string, limit = 20): Promise<WatchProgressRecord[]> {
    const records = await prisma.watchProgress.findMany({
      where: { userId },
      orderBy: { lastWatched: "desc" },
      take: limit,
    });

    return records.map(toRecord);
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

    return records.map(toRecord);
  }

  async findByIdentity(
    userId: string,
    itemId: string,
    season?: number | null,
    episode?: number | null,
  ): Promise<WatchProgressRecord | null> {
    const record = await prisma.watchProgress.findUnique({
      where: {
        userId_itemId_season_episode: {
          userId,
          itemId,
          season: season ?? 0,
          episode: episode ?? 0,
        },
      },
    });
    return record ? toRecord(record) : null;
  }

  async upsert(data: {
    userId: string;
    type: ContentType;
    itemId: string;
    season?: number | null;
    episode?: number | null;
    currentTime: number;
    duration: number;
    durationSource: WatchProgressDurationSource;
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
        durationSource: data.durationSource,
        title: data.title,
        poster: data.poster ?? null,
      },
      update: {
        currentTime: data.currentTime,
        duration: data.duration,
        durationSource: data.durationSource,
        title: data.title,
        poster: data.poster ?? null,
        lastWatched: new Date(),
      },
    });

    return toRecord(record);
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
