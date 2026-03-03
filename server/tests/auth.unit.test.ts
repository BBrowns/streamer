import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import {
  AuthService,
  _resetFailedAttempts,
} from "../src/modules/auth/auth.service.js";
import { AppError } from "../src/middleware/error.middleware.js";

// Mock Prisma
vi.mock("../src/prisma/client.js", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    refreshToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    passwordResetToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

// Mock logger
vi.mock("../src/config/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock env
vi.mock("../src/config/env.js", () => ({
  env: {
    jwtSecret: "test-secret-key-for-testing-only",
    jwtAccessExpiry: "15m",
  },
}));

const { prisma } = await import("../src/prisma/client.js");

describe("AuthService", () => {
  let service: AuthService;

  beforeEach(() => {
    service = new AuthService();
    _resetFailedAttempts();
    vi.clearAllMocks();
  });

  describe("register", () => {
    it("should register a new user and return tokens", async () => {
      const mockUser = {
        id: "user-1",
        email: "test@example.com",
        passwordHash: "hashed",
        displayName: "Test User",
        createdAt: new Date(),
      };

      (prisma.user.findUnique as Mock).mockResolvedValue(null);
      (prisma.user.create as Mock).mockResolvedValue(mockUser);
      (prisma.refreshToken.create as Mock).mockResolvedValue({});

      const result = await service.register(
        "test@example.com",
        "Password1",
        "Test User",
      );

      expect(result.user.email).toBe("test@example.com");
      expect(result.user.displayName).toBe("Test User");
      expect(result.tokens.accessToken).toBeDefined();
      expect(result.tokens.refreshToken).toBeDefined();
    });

    it("should throw 409 if email already registered", async () => {
      (prisma.user.findUnique as Mock).mockResolvedValue({ id: "existing" });

      await expect(
        service.register("taken@example.com", "Password1"),
      ).rejects.toThrow(AppError);

      try {
        await service.register("taken@example.com", "Password1");
      } catch (err) {
        expect((err as AppError).statusCode).toBe(409);
      }
    });
  });

  describe("login", () => {
    const mockUser = {
      id: "user-1",
      email: "test@example.com",
      passwordHash: bcrypt.hashSync("Password1", 12),
      displayName: null,
      createdAt: new Date(),
    };

    it("should login with valid credentials", async () => {
      (prisma.user.findUnique as Mock).mockResolvedValue(mockUser);
      (prisma.refreshToken.create as Mock).mockResolvedValue({});

      const result = await service.login("test@example.com", "Password1");

      expect(result.user.email).toBe("test@example.com");
      expect(result.tokens.accessToken).toBeDefined();
    });

    it("should throw 401 for wrong password", async () => {
      (prisma.user.findUnique as Mock).mockResolvedValue(mockUser);

      await expect(
        service.login("test@example.com", "WrongPass1"),
      ).rejects.toThrow(AppError);
    });

    it("should throw 401 for non-existent email", async () => {
      (prisma.user.findUnique as Mock).mockResolvedValue(null);

      await expect(
        service.login("nobody@example.com", "Password1"),
      ).rejects.toThrow(AppError);
    });

    it("should lock account after 5 failed attempts", async () => {
      (prisma.user.findUnique as Mock).mockResolvedValue(mockUser);

      // Fail 5 times
      for (let i = 0; i < 5; i++) {
        await expect(
          service.login("test@example.com", "WrongPass1"),
        ).rejects.toThrow();
      }

      // 6th attempt should be locked out (even with correct password)
      try {
        await service.login("test@example.com", "Password1");
        expect.fail("Should have thrown");
      } catch (err) {
        expect((err as AppError).statusCode).toBe(429);
        expect((err as AppError).message).toContain("locked");
      }
    });

    it("should clear failed attempts on successful login", async () => {
      (prisma.user.findUnique as Mock).mockResolvedValue(mockUser);
      (prisma.refreshToken.create as Mock).mockResolvedValue({});

      // Fail 3 times
      for (let i = 0; i < 3; i++) {
        await expect(
          service.login("test@example.com", "WrongPass1"),
        ).rejects.toThrow();
      }

      // Login successfully
      const result = await service.login("test@example.com", "Password1");
      expect(result.user.email).toBe("test@example.com");

      // Should not be locked after clearing
      const result2 = await service.login("test@example.com", "Password1");
      expect(result2.tokens.accessToken).toBeDefined();
    });
  });

  describe("generateTokens (JWT)", () => {
    it("should generate a JWT with jti claim", async () => {
      const mockUser = {
        id: "user-1",
        email: "test@example.com",
        passwordHash: bcrypt.hashSync("Password1", 12),
        displayName: null,
        createdAt: new Date(),
      };

      (prisma.user.findUnique as Mock).mockResolvedValue(mockUser);
      (prisma.refreshToken.create as Mock).mockResolvedValue({});

      const result = await service.login("test@example.com", "Password1");
      const decoded = jwt.decode(result.tokens.accessToken) as Record<
        string,
        unknown
      >;

      expect(decoded).toBeDefined();
      expect(decoded.userId).toBe("user-1");
      expect(decoded.email).toBe("test@example.com");
      expect(decoded.jti).toBeDefined(); // Unique token ID
      expect(decoded.iat).toBeDefined();
      expect(decoded.exp).toBeDefined();
    });
  });

  describe("changePassword", () => {
    it("should change password with correct current password", async () => {
      const mockUser = {
        id: "user-1",
        email: "test@example.com",
        passwordHash: bcrypt.hashSync("OldPassword1", 12),
      };

      (prisma.user.findUnique as Mock).mockResolvedValue(mockUser);
      (prisma.user.update as Mock).mockResolvedValue({});

      await expect(
        service.changePassword("user-1", "OldPassword1", "NewPassword1"),
      ).resolves.not.toThrow();
    });

    it("should reject with wrong current password", async () => {
      const mockUser = {
        id: "user-1",
        passwordHash: bcrypt.hashSync("OldPassword1", 12),
      };

      (prisma.user.findUnique as Mock).mockResolvedValue(mockUser);

      await expect(
        service.changePassword("user-1", "WrongPassword", "NewPassword1"),
      ).rejects.toThrow(AppError);
    });
  });
});
