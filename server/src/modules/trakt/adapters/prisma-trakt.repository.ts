import { prisma } from "../../../prisma/client.js";
import type { ITraktRepository, TraktTokens } from "../ports/trakt.ports.js";

/** Prisma adapter for Trakt token persistence */
export class PrismaTraktRepository implements ITraktRepository {
  async findByUser(userId: string): Promise<TraktTokens | null> {
    const record = await prisma.traktToken.findUnique({
      where: { userId },
    });

    if (!record) return null;

    return {
      accessToken: record.accessToken,
      refreshToken: record.refreshToken,
      expiresAt: record.expiresAt,
    };
  }

  async upsert(userId: string, tokens: TraktTokens): Promise<void> {
    await prisma.traktToken.upsert({
      where: { userId },
      create: {
        userId,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
      },
      update: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
      },
    });
  }

  async delete(userId: string): Promise<void> {
    await prisma.traktToken.delete({
      where: { userId },
    });
  }
}
