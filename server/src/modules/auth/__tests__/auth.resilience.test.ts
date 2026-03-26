import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { AuthService } from "../auth.service.js";
import { AppError } from "../../../middleware/error.middleware.js";

// Mock Prisma
vi.mock("../../../prisma/client.js", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    passwordResetToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    refreshToken: {
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn((input) =>
      Array.isArray(input) ? Promise.all(input) : input(),
    ),
  },
}));

const { prisma } = await import("../../../prisma/client.js");

describe("Auth Resilience (Normalization & Reset)", () => {
  let service: AuthService;

  beforeEach(() => {
    service = new AuthService();
    vi.clearAllMocks();
  });

  describe("Email Normalization", () => {
    it("should normalize email to lowercase in register", async () => {
      (prisma.user.findUnique as Mock).mockResolvedValue(null);
      (prisma.user.create as Mock).mockResolvedValue({
        id: "u1",
        email: "user@example.com",
        createdAt: new Date(),
      });
      (prisma.refreshToken.create as Mock).mockResolvedValue({});

      await service.register("  User@Example.Com  ", "Password123!");

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: "user@example.com" },
      });
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ email: "user@example.com" }),
      });
    });

    it("should normalize email to lowercase in login", async () => {
      (prisma.user.findUnique as Mock).mockResolvedValue({
        id: "u1",
        email: "user@example.com",
        passwordHash: "$2a$12$something", // mock hash
      });
      (prisma.refreshToken.create as Mock).mockResolvedValue({});

      // We don't need to verify password here, just the email lookup
      try {
        await service.login("  USER@example.com  ", "any");
      } catch {}

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: "user@example.com" },
      });
    });

    it("should normalize email in forgotPassword", async () => {
      (prisma.user.findUnique as Mock).mockResolvedValue({
        id: "u1",
        email: "user@example.com",
      });

      await service.forgotPassword("  uSeR@ExAmPlE.cOm  ");

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: "user@example.com" },
      });
    });
  });

  describe("Password Reset Flow", () => {
    it("should generate a valid token for an existing user", async () => {
      (prisma.user.findUnique as Mock).mockResolvedValue({
        id: "u1",
        email: "a@b.com",
      });
      (prisma.passwordResetToken.create as Mock).mockResolvedValue({});

      const result = await service.forgotPassword("a@b.com");

      expect(result.resetToken).toBeDefined();
      expect(prisma.passwordResetToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: "u1",
          token: result.resetToken,
        }),
      });
    });

    it("should return empty token for non-existent user but not throw", async () => {
      (prisma.user.findUnique as Mock).mockResolvedValue(null);

      const result = await service.forgotPassword("ghost@example.com");

      expect(result.resetToken).toBe("");
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    });

    it("should reject expired tokens in resetPassword", async () => {
      (prisma.passwordResetToken.findUnique as Mock).mockResolvedValue({
        id: "t1",
        token: "expired-token",
        expiresAt: new Date(Date.now() - 1000), // 1 second ago
        userId: "u1",
      });

      await expect(
        service.resetPassword("expired-token", "NewPass123!"),
      ).rejects.toThrow(/expired/);
    });

    it("should successfully reset password and invalidate old tokens", async () => {
      const mockUser = { id: "u1", email: "a@b.com" };
      (prisma.passwordResetToken.findUnique as Mock).mockResolvedValue({
        id: "t1",
        token: "valid-token",
        expiresAt: new Date(Date.now() + 3600000),
        userId: "u1",
        user: mockUser,
      });

      await service.resetPassword("valid-token", "NewPass123!");

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "u1" },
        data: expect.objectContaining({ passwordHash: expect.any(String) }),
      });
      expect(prisma.passwordResetToken.delete).toHaveBeenCalledWith({
        where: { id: "t1" },
      });
      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: "u1" },
      });
    });
  });
});
