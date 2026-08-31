import { prisma } from "../../../prisma/client.js";
import type {
  ITraktRepository,
  TraktTokens,
  TraktSyncQueueItem,
} from "../ports/trakt.ports.js";
import { decryptSecret, encryptSecret } from "../../../utils/secret-box.js";

/** Prisma adapter for Trakt token persistence */
export class PrismaTraktRepository implements ITraktRepository {
  async findByUser(userId: string): Promise<TraktTokens | null> {
    const record = await prisma.traktToken.findUnique({
      where: { userId },
    });

    if (!record) return null;

    return {
      accessToken: decryptSecret(record.accessTokenCiphertext),
      refreshToken: decryptSecret(record.refreshTokenCiphertext),
      expiresAt: record.expiresAt,
    };
  }

  async upsert(userId: string, tokens: TraktTokens): Promise<void> {
    await prisma.traktToken.upsert({
      where: { userId },
      create: {
        userId,
        accessTokenCiphertext: encryptSecret(tokens.accessToken),
        refreshTokenCiphertext: encryptSecret(tokens.refreshToken),
        expiresAt: tokens.expiresAt,
      },
      update: {
        accessTokenCiphertext: encryptSecret(tokens.accessToken),
        refreshTokenCiphertext: encryptSecret(tokens.refreshToken),
        expiresAt: tokens.expiresAt,
      },
    });
  }

  async delete(userId: string): Promise<void> {
    await prisma.traktToken.delete({
      where: { userId },
    });
  }

  async addToQueue(
    userId: string,
    item: Omit<TraktSyncQueueItem, "id" | "attempts">,
  ): Promise<void> {
    await prisma.traktSyncQueue.create({
      data: {
        userId,
        type: item.type,
        imdbId: item.imdbId,
        title: item.title,
        season: item.season,
        episode: item.episode,
        watchedAt: item.watchedAt,
      },
    });
  }

  async getQueue(limit = 10): Promise<TraktSyncQueueItem[]> {
    const records = await prisma.traktSyncQueue.findMany({
      take: limit,
      orderBy: { createdAt: "asc" },
    });

    return records.map((r: any) => ({
      id: r.id,
      userId: r.userId,
      type: r.type as "movie" | "episode",
      imdbId: r.imdbId || undefined,
      title: r.title,
      season: r.season || undefined,
      episode: r.episode || undefined,
      watchedAt: r.watchedAt,
      attempts: r.attempts,
    }));
  }

  async updateQueueAttempt(id: string, error: string): Promise<void> {
    await prisma.traktSyncQueue.update({
      where: { id },
      data: {
        attempts: { increment: 1 },
        lastError: error,
      },
    });
  }

  async removeFromQueue(id: string): Promise<void> {
    await prisma.traktSyncQueue.delete({
      where: { id },
    });
  }
}
