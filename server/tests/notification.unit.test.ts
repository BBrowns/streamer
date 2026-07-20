import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { AppError } from "../src/middleware/error.middleware.js";

vi.mock("../src/prisma/client.js", () => ({
  prisma: {
    notification: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("../src/config/logger.js", () => ({
  logger: { info: vi.fn() },
}));

const { prisma } = await import("../src/prisma/client.js");
const { NotificationService } =
  await import("../src/modules/notification/notification.service.js");

describe("NotificationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks all and only the signed-in user's unread notifications as read", async () => {
    (prisma.notification.updateMany as Mock).mockResolvedValue({ count: 3 });

    await expect(NotificationService.markAllAsRead("user-1")).resolves.toBe(3);
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", read: false },
      data: { read: true },
    });
  });

  it("does not let a user mark somebody else's notification as read", async () => {
    (prisma.notification.findUnique as Mock).mockResolvedValue({
      id: "notification-1",
      userId: "another-user",
    });

    await expect(
      NotificationService.markAsRead("user-1", "notification-1"),
    ).rejects.toMatchObject<AppError>({ statusCode: 404 });
    expect(prisma.notification.update).not.toHaveBeenCalled();
  });
});
