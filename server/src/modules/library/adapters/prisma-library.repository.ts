import { prisma } from "../../../prisma/client.js";
import type {
  ILibraryRepository,
  LibraryItemRecord,
} from "../ports/library.ports.js";
import type { AddonManifest } from "@streamer/shared";

/** Prisma adapter implementing ILibraryRepository */
export class PrismaLibraryRepository implements ILibraryRepository {
  async findByUser(userId: string): Promise<LibraryItemRecord[]> {
    const items = await prisma.libraryItem.findMany({
      where: { userId },
      orderBy: { addedAt: "desc" },
    });

    return items.map((i) => ({
      id: i.id,
      userId: i.userId,
      type: i.type,
      itemId: i.itemId,
      title: i.title,
      poster: i.poster,
      addedAt: i.addedAt,
    }));
  }

  async findByUserAndItem(
    userId: string,
    itemId: string,
  ): Promise<LibraryItemRecord | null> {
    const item = await prisma.libraryItem.findUnique({
      where: { userId_itemId: { userId, itemId } },
    });

    if (!item) return null;

    return {
      id: item.id,
      userId: item.userId,
      type: item.type,
      itemId: item.itemId,
      title: item.title,
      poster: item.poster,
      addedAt: item.addedAt,
    };
  }

  async create(data: {
    userId: string;
    type: string;
    itemId: string;
    title: string;
    poster?: string | null;
  }): Promise<LibraryItemRecord> {
    const item = await prisma.libraryItem.create({
      data: {
        userId: data.userId,
        type: data.type,
        itemId: data.itemId,
        title: data.title,
        poster: data.poster ?? null,
      },
    });

    return {
      id: item.id,
      userId: item.userId,
      type: item.type,
      itemId: item.itemId,
      title: item.title,
      poster: item.poster,
      addedAt: item.addedAt,
    };
  }

  async delete(userId: string, itemId: string): Promise<void> {
    await prisma.libraryItem.delete({
      where: { userId_itemId: { userId, itemId } },
    });
  }
}
