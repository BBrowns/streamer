import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "../../prisma/client.js";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { AppError } from "../../middleware/error.middleware.js";
import type { AuthTokens, UserProfile } from "@streamer/shared";

/** Maximum failed login attempts before lockout */
const MAX_LOGIN_ATTEMPTS = 5;
/** Lockout duration in minutes */
const LOCKOUT_MINUTES = 15;
/** In-memory failed attempt tracker (simple — use Redis in production at scale) */
const failedAttempts = new Map<string, { count: number; lastAttempt: Date }>();

function checkLoginAttempts(email: string): void {
  const record = failedAttempts.get(email);
  if (!record) return;

  const lockoutExpiry = new Date(
    record.lastAttempt.getTime() + LOCKOUT_MINUTES * 60 * 1000,
  );
  if (record.count >= MAX_LOGIN_ATTEMPTS && new Date() < lockoutExpiry) {
    const remainingMs = lockoutExpiry.getTime() - Date.now();
    const remainingMin = Math.ceil(remainingMs / 60_000);
    throw new AppError(
      429,
      `Account locked. Try again in ${remainingMin} minute(s).`,
    );
  }

  // Reset if lockout has expired
  if (record.count >= MAX_LOGIN_ATTEMPTS && new Date() >= lockoutExpiry) {
    failedAttempts.delete(email);
  }
}

function recordFailedAttempt(email: string): void {
  const record = failedAttempts.get(email);
  if (record) {
    record.count++;
    record.lastAttempt = new Date();
  } else {
    failedAttempts.set(email, { count: 1, lastAttempt: new Date() });
  }
}

function clearFailedAttempts(email: string): void {
  failedAttempts.delete(email);
}

function generateTokens(userId: string, email: string): AuthTokens {
  const accessToken = jwt.sign(
    { userId, email, jti: uuidv4() },
    env.jwtSecret,
    { expiresIn: env.jwtAccessExpiry } as jwt.SignOptions,
  );

  const refreshToken = uuidv4();
  return { accessToken, refreshToken };
}

export class AuthService {
  async register(
    emailInput: string,
    password: string,
    displayName?: string,
  ): Promise<{ user: UserProfile; tokens: AuthTokens }> {
    const email = emailInput.toLowerCase().trim();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new AppError(409, "Email already registered");
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: { email, passwordHash, displayName },
    });

    const tokens = generateTokens(user.id, user.email);

    // Store refresh token
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.refreshToken.create({
      data: {
        token: tokens.refreshToken,
        userId: user.id,
        expiresAt,
      },
    });

    logger.info({ userId: user.id }, "User registered");

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName ?? undefined,
        createdAt: user.createdAt.toISOString(),
      },
      tokens,
    };
  }

  async login(
    emailInput: string,
    password: string,
  ): Promise<{ user: UserProfile; tokens: AuthTokens }> {
    const email = emailInput.toLowerCase().trim();
    // Check if the account is locked out
    checkLoginAttempts(email);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      recordFailedAttempt(email);
      throw new AppError(401, "Invalid email or password");
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      recordFailedAttempt(email);
      logger.warn(
        { email, attempts: failedAttempts.get(email)?.count },
        "Failed login attempt",
      );
      throw new AppError(401, "Invalid email or password");
    }

    // Clear failed attempts on successful login
    clearFailedAttempts(email);

    const tokens = generateTokens(user.id, user.email);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.refreshToken.create({
      data: {
        token: tokens.refreshToken,
        userId: user.id,
        expiresAt,
      },
    });

    logger.info({ userId: user.id }, "User logged in");

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName ?? undefined,
        createdAt: user.createdAt.toISOString(),
      },
      tokens,
    };
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const stored = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!stored || stored.expiresAt < new Date()) {
      // Clean up expired token if it exists
      if (stored) {
        await prisma.refreshToken.delete({ where: { id: stored.id } });
      }
      throw new AppError(401, "Invalid or expired refresh token");
    }

    // Rotate: delete old token, issue new pair
    await prisma.refreshToken.delete({ where: { id: stored.id } });

    const tokens = generateTokens(stored.user.id, stored.user.email);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.refreshToken.create({
      data: {
        token: tokens.refreshToken,
        userId: stored.user.id,
        expiresAt,
      },
    });

    logger.info({ userId: stored.user.id }, "Token refreshed");

    return tokens;
  }

  /**
   * Generate a password reset token.
   * In production, send this via email (SendGrid/Resend/SES).
   * For dev, the token is returned in the response and logged.
   */
  async forgotPassword(emailInput: string): Promise<{ resetToken: string }> {
    const email = emailInput.toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email } });

    // Always return success to avoid email enumeration
    if (!user) {
      logger.info({ email }, "Password reset requested for non-existent email");
      return { resetToken: "" };
    }

    // Delete any existing reset tokens for this user
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });

    const resetToken = uuidv4();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1); // 1 hour expiry

    await prisma.passwordResetToken.create({
      data: {
        token: resetToken,
        userId: user.id,
        expiresAt,
      },
    });

    logger.info(
      { userId: user.id, resetToken },
      "Password reset token generated",
    );

    return { resetToken };
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const stored = await prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!stored) {
      throw new AppError(400, "Invalid reset token");
    }

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
      // Invalidate all refresh tokens (force re-login)
      prisma.refreshToken.deleteMany({ where: { userId: stored.userId } }),
    ]);

    // Clear any failed login attempts
    clearFailedAttempts(stored.user.email);

    logger.info({ userId: stored.userId }, "Password reset successfully");
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AppError(404, "User not found");
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      throw new AppError(401, "Current password is incorrect");
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

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

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName ?? undefined,
      createdAt: user.createdAt.toISOString(),
    };
  }
}

export const authService = new AuthService();

/** Export for testing */
export function _resetFailedAttempts(): void {
  failedAttempts.clear();
}
