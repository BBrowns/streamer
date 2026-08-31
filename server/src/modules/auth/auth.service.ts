import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createHash } from "node:crypto";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "../../prisma/client.js";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { AppError } from "../../middleware/error.middleware.js";
import { emailService } from "../../services/email.service.js";
import { createOpaqueToken, hashOpaqueToken } from "../../utils/token-hash.js";
import { SessionService } from "./session.service.js";
import type {
  AuthTokens,
  UserProfile,
  RegisterResponse,
} from "@streamer/shared";

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_TRACKED_LOGIN_IDENTITIES = 10_000;
const MAX_SOURCE_FAILURES = 10;
const SOURCE_THROTTLE_MS = 15 * 60 * 1000;
const MAX_PROGRESSIVE_DELAY_MS = 5_000;
const DUMMY_PASSWORD_HASH =
  "$2b$12$C6UzMDM.H6dfI/f/IKcEe.1K1D1m2mZfS6M9q4f7VjD0z2mW8LqK2";

type LoginAttemptRecord = {
  count: number;
  lastAttempt: number;
  blockedUntil?: number;
};

/** Bounded process-local fallback; Redis-backed edge limiting remains primary. */
const failedAttempts = new Map<string, LoginAttemptRecord>();

function normalizeEmail(emailInput: string) {
  return emailInput.toLowerCase().trim();
}

function sourceIdentity(source: string) {
  return createHash("sha256")
    .update(source || "unknown")
    .digest("hex");
}

function attemptKey(kind: "account" | "source", value: string) {
  return `${kind}:${value}`;
}

function pruneFailedAttempts(now = Date.now()) {
  for (const [key, record] of failedAttempts) {
    if (now - record.lastAttempt > LOGIN_WINDOW_MS) {
      failedAttempts.delete(key);
    }
  }

  while (failedAttempts.size > MAX_TRACKED_LOGIN_IDENTITIES) {
    const oldest = failedAttempts.keys().next().value;
    if (!oldest) break;
    failedAttempts.delete(oldest);
  }
}

function getAttempt(key: string) {
  const record = failedAttempts.get(key);
  if (!record) return undefined;
  if (Date.now() - record.lastAttempt > LOGIN_WINDOW_MS) {
    failedAttempts.delete(key);
    return undefined;
  }
  return record;
}

async function enforceLoginThrottle(email: string, source: string) {
  const now = Date.now();
  pruneFailedAttempts(now);
  const account = getAttempt(attemptKey("account", email));
  const sourceRecord = getAttempt(attemptKey("source", sourceIdentity(source)));

  if (sourceRecord?.blockedUntil && sourceRecord.blockedUntil > now) {
    throw new AppError(
      429,
      "Too many login attempts. Please try again later.",
      "LOGIN_THROTTLED",
    );
  }

  const attempts = Math.max(account?.count ?? 0, sourceRecord?.count ?? 0);
  if (attempts > 0) {
    const delay = Math.min(
      MAX_PROGRESSIVE_DELAY_MS,
      250 * 2 ** Math.min(attempts - 1, 5),
    );
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

function recordFailedAttempt(email: string, source: string) {
  const now = Date.now();
  const keys = [
    attemptKey("account", email),
    attemptKey("source", sourceIdentity(source)),
  ];
  for (const key of keys) {
    const existing = getAttempt(key);
    const count = (existing?.count ?? 0) + 1;
    failedAttempts.set(key, {
      count,
      lastAttempt: now,
      ...(key.startsWith("source:") && count >= MAX_SOURCE_FAILURES
        ? { blockedUntil: now + SOURCE_THROTTLE_MS }
        : {}),
    });
  }
  pruneFailedAttempts(now);
}

function clearFailedAttempts(email: string, source?: string) {
  failedAttempts.delete(attemptKey("account", email));
  if (source) {
    failedAttempts.delete(attemptKey("source", sourceIdentity(source)));
  }
}

function generateTokens(
  userId: string,
  email: string,
  sessionId: string,
): AuthTokens {
  const accessToken = jwt.sign(
    { userId, email, sid: sessionId, jti: uuidv4() },
    env.jwtSecret,
    { expiresIn: env.jwtAccessExpiry } as jwt.SignOptions,
  );

  return { accessToken, refreshToken: createOpaqueToken() };
}

async function storeRefreshToken(
  userId: string,
  sessionId: string,
  refreshToken: string,
  client: any = prisma,
) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);
  await client.refreshToken.create({
    data: {
      token: hashOpaqueToken(refreshToken),
      userId,
      sessionId,
      expiresAt,
    },
  });
}

function publicUser(user: {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: Date;
}): UserProfile {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName ?? undefined,
    createdAt: user.createdAt.toISOString(),
  };
}

export class AuthService {
  async register(
    emailInput: string,
    password: string,
    displayName?: string,
  ): Promise<RegisterResponse> {
    const email = normalizeEmail(emailInput);
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new AppError(409, "Email already registered");

    const passwordHash = await bcrypt.hash(password, 12);
    const isTest = env.nodeEnv === "test";
    const user = await prisma.user.create({
      data: { email, passwordHash, displayName, emailVerified: isTest },
    });

    const verificationToken = createOpaqueToken();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);
    await prisma.emailVerificationToken.create({
      data: {
        token: hashOpaqueToken(verificationToken),
        userId: user.id,
        expiresAt,
      },
    });

    if (!isTest) {
      await emailService.sendVerificationEmail(user.email, verificationToken);
    }

    logger.info({ userId: user.id, isTest }, "User registered");
    const baseResponse: RegisterResponse = {
      user: publicUser(user),
    };

    if (!isTest) {
      return { ...baseResponse, verificationRequired: true };
    }

    const sessionId = uuidv4();
    const tokens = generateTokens(user.id, user.email, sessionId);
    await storeRefreshToken(user.id, sessionId, tokens.refreshToken);
    return { ...baseResponse, tokens, verificationRequired: false };
  }

  async login(
    emailInput: string,
    password: string,
    deviceId = "unknown-browser",
    source = "unknown",
  ): Promise<{ user: UserProfile; tokens: AuthTokens }> {
    const email = normalizeEmail(emailInput);
    await enforceLoginThrottle(email, source);

    const user = await prisma.user.findUnique({ where: { email } });
    const valid = await bcrypt.compare(
      password,
      user?.passwordHash || DUMMY_PASSWORD_HASH,
    );
    if (!user || !valid) {
      recordFailedAttempt(email, source);
      throw new AppError(401, "Invalid email or password");
    }

    if (
      !user.emailVerified &&
      env.nodeEnv === "development" &&
      !env.smtp.host
    ) {
      await prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: true },
      });
      user.emailVerified = true;
    }

    if (!user.emailVerified) {
      throw new AppError(
        403,
        "Email not verified. Please check your inbox.",
        "EMAIL_NOT_VERIFIED",
      );
    }

    clearFailedAttempts(email, source);
    const sessionId = uuidv4();
    const tokens = generateTokens(user.id, user.email, sessionId);
    await storeRefreshToken(user.id, sessionId, tokens.refreshToken);
    logger.info({ userId: user.id, deviceId }, "User logged in");

    return { user: publicUser(user), tokens };
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const stored = await prisma.refreshToken.findUnique({
      where: { token: hashOpaqueToken(refreshToken) },
      include: { user: true },
    });

    if (!stored || stored.expiresAt < new Date()) {
      if (stored)
        await prisma.refreshToken.delete({ where: { id: stored.id } });
      throw new AppError(401, "Invalid or expired refresh token");
    }

    const result = await prisma.$transaction(async (client: any = prisma) => {
      const consumed = await client.refreshToken.updateMany({
        where: { id: stored.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (consumed.count !== 1) return null;

      const tokens = generateTokens(
        stored.user.id,
        stored.user.email,
        stored.sessionId,
      );
      await storeRefreshToken(
        stored.user.id,
        stored.sessionId,
        tokens.refreshToken,
        client,
      );
      return tokens;
    });

    if (!result) {
      logger.warn({ userId: stored.user.id }, "Refresh token replay detected");
      await SessionService.revokeAll(stored.user.id);
      throw new AppError(
        401,
        "Security violation: invalid token usage detected. Please log in again.",
        "REFRESH_REPLAY",
      );
    }

    logger.info({ userId: stored.user.id }, "Token refreshed");
    return result;
  }

  async forgotPassword(emailInput: string): Promise<{ resetToken: string }> {
    const email = normalizeEmail(emailInput);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return { resetToken: "" };

    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
    const resetToken = createOpaqueToken();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);
    await prisma.passwordResetToken.create({
      data: {
        token: hashOpaqueToken(resetToken),
        userId: user.id,
        expiresAt,
      },
    });
    await emailService.sendPasswordResetEmail(user.email, resetToken);
    logger.info({ userId: user.id }, "Password reset email sent");
    return { resetToken };
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const stored = await prisma.passwordResetToken.findUnique({
      where: { token: hashOpaqueToken(token) },
      include: { user: true },
    });
    if (!stored) throw new AppError(400, "Invalid reset token");
    if (stored.expiresAt < new Date()) {
      await prisma.passwordResetToken.delete({ where: { id: stored.id } });
      throw new AppError(400, "Reset token has expired");
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: stored.userId },
        data: { passwordHash },
      }),
      prisma.passwordResetToken.delete({ where: { id: stored.id } }),
      prisma.refreshToken.deleteMany({ where: { userId: stored.userId } }),
    ]);
    await SessionService.revokeAll(stored.userId);
    clearFailedAttempts(stored.user.email);
    logger.info({ userId: stored.userId }, "Password reset successfully");
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError(404, "User not found");
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new AppError(401, "Current password is incorrect");
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    await SessionService.revokeAll(userId);
    logger.info({ userId }, "Password changed");
  }

  async updateProfile(
    userId: string,
    data: { displayName?: string },
  ): Promise<UserProfile> {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { displayName: data.displayName },
    });
    logger.info({ userId }, "Profile updated");
    return publicUser(user);
  }

  async verifyEmail(token: string): Promise<void> {
    const stored = await prisma.emailVerificationToken.findUnique({
      where: { token: hashOpaqueToken(token) },
      include: { user: true },
    });
    if (!stored) throw new AppError(400, "Invalid verification token");
    if (stored.expiresAt < new Date()) {
      await prisma.emailVerificationToken.delete({ where: { id: stored.id } });
      throw new AppError(400, "Verification token has expired");
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: stored.userId },
        data: { emailVerified: true } as any,
      }),
      prisma.emailVerificationToken.delete({ where: { id: stored.id } }),
    ]);
    logger.info({ userId: stored.userId }, "Email verified successfully");
  }

  async resendVerification(emailInput: string): Promise<void> {
    const email = normalizeEmail(emailInput);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.emailVerified) return;

    await prisma.emailVerificationToken.deleteMany({
      where: { userId: user.id },
    });
    const verificationToken = createOpaqueToken();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);
    await prisma.emailVerificationToken.create({
      data: {
        token: hashOpaqueToken(verificationToken),
        userId: user.id,
        expiresAt,
      },
    });
    await emailService.sendVerificationEmail(user.email, verificationToken);
    logger.info({ userId: user.id }, "Verification email resent");
  }

  async deleteAccount(userId: string): Promise<void> {
    await SessionService.revokeAll(userId);
    await prisma.user.delete({ where: { id: userId } });
    logger.info({ userId }, "User account and all associated data deleted");
  }

  async exportData(userId: string): Promise<any> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        libraryItems: true,
        watchProgress: true,
        addons: true,
        notifications: true,
      },
    });
    if (!user) throw new AppError(404, "User not found");

    const safeUser = Object.fromEntries(
      Object.entries(user).filter(([key]) => key !== "passwordHash"),
    );
    return { exportedAt: new Date().toISOString(), user: safeUser };
  }
}

export const authService = new AuthService();

/** Export for bounded-throttle tests. */
export function _resetFailedAttempts(): void {
  failedAttempts.clear();
}
