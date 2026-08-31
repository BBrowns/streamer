import { randomUUID } from "node:crypto";
import { prisma } from "../../prisma/client.js";
import { env } from "../../config/env.js";
import { AppError } from "../../middleware/error.middleware.js";
import { redis } from "../../services/redis.js";
import {
  CREDENTIAL_KEY_VERSION,
  decryptSecret,
  encryptSecret,
} from "../../utils/secret-box.js";
import { RealDebridResolver } from "./adapters/real-debrid.resolver.js";
import type {
  RealDebridDeviceFlow,
  RealDebridDevicePollResult,
  RealDebridStatus,
} from "@streamer/shared";

const RD_API_ORIGIN = "https://api.real-debrid.com";
const RD_DEVICE_TTL_SECONDS = 600;
const RD_PENDING_PREFIX = "real-debrid:device-flow:";
const RD_USER_FLOW_PREFIX = "real-debrid:user-device-flows:";
const MAX_PENDING_FLOWS_PER_USER = 4;
const DEFAULT_POLL_INTERVAL_SECONDS = 5;
const RD_VERIFICATION_HOSTS = new Set([
  "real-debrid.com",
  "www.real-debrid.com",
]);

type PendingDeviceFlow = {
  userId: string;
  deviceCode: string;
  expiresAt: number;
  intervalSeconds: number;
};

type DeviceCodeResponse = {
  device_code?: string;
  user_code?: string;
  interval?: number;
  expires_in?: number;
  verification_url?: string;
  verification_url_complete?: string;
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_code?: number;
};

function pendingKey(flowId: string) {
  return `${RD_PENDING_PREFIX}${flowId}`;
}

function userFlowIndexKey(userId: string) {
  return `${RD_USER_FLOW_PREFIX}${userId}`;
}

function clientIsConfigured() {
  return Boolean(env.rdClientId && env.rdClientSecret);
}

function requireConfigured() {
  if (!clientIsConfigured()) {
    throw new AppError(
      503,
      "Real-Debrid integration is not configured.",
      "REAL_DEBRID_NOT_CONFIGURED",
    );
  }
}

async function parseJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new AppError(
      503,
      "Real-Debrid returned an invalid response.",
      "REAL_DEBRID_UNAVAILABLE",
    );
  }
}

function safeVerificationUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      !RD_VERIFICATION_HOSTS.has(parsed.hostname.toLowerCase())
    ) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function parsePendingDeviceFlow(raw: string): PendingDeviceFlow | null {
  try {
    const value = JSON.parse(raw) as Partial<PendingDeviceFlow>;
    if (
      typeof value.userId !== "string" ||
      value.userId.length === 0 ||
      value.userId.length > 256 ||
      typeof value.deviceCode !== "string" ||
      value.deviceCode.length === 0 ||
      value.deviceCode.length > 512 ||
      !/^[A-Za-z0-9._~-]+$/.test(value.deviceCode) ||
      typeof value.expiresAt !== "number" ||
      !Number.isFinite(value.expiresAt) ||
      typeof value.intervalSeconds !== "number" ||
      !Number.isInteger(value.intervalSeconds) ||
      value.intervalSeconds < 1 ||
      value.intervalSeconds > 60
    ) {
      return null;
    }
    return value as PendingDeviceFlow;
  } catch {
    return null;
  }
}

export class RealDebridService {
  async getStatus(userId: string): Promise<RealDebridStatus> {
    if (!clientIsConfigured()) {
      return { configured: false, connected: false };
    }

    const stored = await prisma.realDebridToken.findUnique({
      where: { userId },
    });
    if (!stored) return { configured: true, connected: false };

    try {
      const accessToken = await this.getAccessToken(userId);
      const resolver = new RealDebridResolver(accessToken);
      const account = await resolver.getAccountStatus();
      return {
        configured: true,
        connected: account.isActive,
        isPremium: account.isPremium,
        expiresAt: stored.expiresAt.toISOString(),
      };
    } catch {
      return { configured: true, connected: false };
    }
  }

  async startDeviceFlow(userId: string): Promise<RealDebridDeviceFlow> {
    requireConfigured();
    if (!redis) {
      throw new AppError(
        503,
        "Real-Debrid connection is temporarily unavailable.",
        "REAL_DEBRID_FLOW_UNAVAILABLE",
      );
    }

    const flowIndexKey = userFlowIndexKey(userId);
    const flowIds = await redis.smembers(flowIndexKey);
    const activeFlowIds: string[] = [];
    for (const existingFlowId of flowIds) {
      if (await redis.exists(pendingKey(existingFlowId))) {
        activeFlowIds.push(existingFlowId);
      } else {
        await redis.srem(flowIndexKey, existingFlowId);
      }
    }
    if (activeFlowIds.length >= MAX_PENDING_FLOWS_PER_USER) {
      throw new AppError(
        429,
        "Too many pending Real-Debrid authorizations.",
        "REAL_DEBRID_FLOW_LIMIT",
      );
    }

    const response = await fetch(
      `${RD_API_ORIGIN}/oauth/v2/device/code?client_id=${encodeURIComponent(env.rdClientId!)}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!response.ok) {
      throw new AppError(
        503,
        "Real-Debrid device authorization is temporarily unavailable.",
        "REAL_DEBRID_UNAVAILABLE",
      );
    }

    const data = await parseJson<DeviceCodeResponse>(response);
    const verificationUrl = safeVerificationUrl(
      data.verification_url_complete || data.verification_url,
    );
    const deviceCode = data.device_code?.trim();
    const userCode = data.user_code?.trim();
    const expiresIn = Math.max(
      60,
      Math.min(RD_DEVICE_TTL_SECONDS, Number(data.expires_in) || 600),
    );
    const intervalSeconds = Math.max(
      1,
      Math.min(60, Number(data.interval) || DEFAULT_POLL_INTERVAL_SECONDS),
    );

    if (
      !deviceCode ||
      !userCode ||
      userCode.length > 128 ||
      !/^[A-Za-z0-9._~-]+$/.test(deviceCode) ||
      deviceCode.length > 512 ||
      !verificationUrl
    ) {
      throw new AppError(
        503,
        "Real-Debrid returned an incomplete device authorization.",
        "REAL_DEBRID_UNAVAILABLE",
      );
    }

    const flowId = randomUUID();
    const expiresAt = Date.now() + expiresIn * 1000;
    const pending: PendingDeviceFlow = {
      userId,
      deviceCode,
      expiresAt,
      intervalSeconds,
    };
    await redis
      .multi()
      .set(pendingKey(flowId), JSON.stringify(pending), "EX", expiresIn)
      .sadd(flowIndexKey, flowId)
      .expire(flowIndexKey, RD_DEVICE_TTL_SECONDS * 2)
      .exec();

    return {
      flowId,
      userCode,
      verificationUrl,
      expiresAt: new Date(expiresAt).toISOString(),
      intervalSeconds,
    };
  }

  async pollDeviceFlow(
    userId: string,
    flowId: string,
  ): Promise<RealDebridDevicePollResult> {
    requireConfigured();
    if (!redis) {
      throw new AppError(
        503,
        "Real-Debrid connection is temporarily unavailable.",
        "REAL_DEBRID_FLOW_UNAVAILABLE",
      );
    }

    const raw = await redis.get(pendingKey(flowId));
    if (!raw) return { status: "expired" };

    const pending = parsePendingDeviceFlow(raw);
    if (!pending) {
      await redis.del(pendingKey(flowId));
      return { status: "expired" };
    }
    if (pending.userId !== userId) {
      throw new AppError(404, "Real-Debrid device flow not found.");
    }
    if (pending.expiresAt <= Date.now()) {
      await redis
        .multi()
        .del(pendingKey(flowId))
        .srem(userFlowIndexKey(userId), flowId)
        .exec();
      return { status: "expired" };
    }

    const body = new URLSearchParams({
      client_id: env.rdClientId!,
      client_secret: env.rdClientSecret!,
      code: pending.deviceCode,
      grant_type: "http://oauth.net/grant_type/device/1.0",
    });
    const response = await fetch(`${RD_API_ORIGIN}/oauth/v2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    const data = await parseJson<TokenResponse>(response);

    if (!response.ok || !data.access_token || !data.refresh_token) {
      const pendingError =
        data.error === "authorization_pending" ||
        data.error === "slow_down" ||
        data.error_code === 11 ||
        data.error_code === 5;
      if (pendingError) {
        const retryAfterSeconds = Math.min(
          60,
          Math.max(
            pending.intervalSeconds,
            data.error === "slow_down" ? pending.intervalSeconds + 5 : 1,
          ),
        );
        if (data.error === "slow_down") {
          pending.intervalSeconds = retryAfterSeconds;
          const remainingSeconds = Math.max(
            1,
            Math.ceil((pending.expiresAt - Date.now()) / 1000),
          );
          await redis.set(
            pendingKey(flowId),
            JSON.stringify(pending),
            "EX",
            remainingSeconds,
          );
        }
        return { status: "pending", retryAfterSeconds };
      }

      throw new AppError(
        503,
        "Real-Debrid authorization could not be completed.",
        "REAL_DEBRID_AUTH_FAILED",
      );
    }

    const expiresAt = new Date(
      Date.now() + Math.max(60, Number(data.expires_in) || 3600) * 1000,
    );
    await prisma.realDebridToken.upsert({
      where: { userId },
      create: {
        userId,
        accessTokenCiphertext: encryptSecret(data.access_token),
        refreshTokenCiphertext: encryptSecret(data.refresh_token),
        expiresAt,
        keyVersion: CREDENTIAL_KEY_VERSION,
      },
      update: {
        accessTokenCiphertext: encryptSecret(data.access_token),
        refreshTokenCiphertext: encryptSecret(data.refresh_token),
        expiresAt,
        keyVersion: CREDENTIAL_KEY_VERSION,
      },
    });
    await redis
      .multi()
      .del(pendingKey(flowId))
      .srem(userFlowIndexKey(userId), flowId)
      .exec();
    return { status: "connected", expiresAt: expiresAt.toISOString() };
  }

  async disconnect(userId: string) {
    await prisma.realDebridToken.deleteMany({ where: { userId } });
  }

  async getAccessToken(userId: string): Promise<string> {
    const stored = await prisma.realDebridToken.findUnique({
      where: { userId },
    });
    if (!stored) throw new AppError(404, "Real-Debrid is not connected.");

    const accessToken = decryptSecret(stored.accessTokenCiphertext);
    if (stored.expiresAt.getTime() - Date.now() > 60_000) return accessToken;

    const refreshToken = decryptSecret(stored.refreshTokenCiphertext);
    const body = new URLSearchParams({
      client_id: env.rdClientId || "",
      client_secret: env.rdClientSecret || "",
      code: refreshToken,
      grant_type: "http://oauth.net/grant_type/device/1.0",
    });
    const response = await fetch(`${RD_API_ORIGIN}/oauth/v2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    const data = await parseJson<TokenResponse>(response);
    if (!response.ok || !data.access_token || !data.refresh_token) {
      throw new AppError(401, "Real-Debrid authorization has expired.");
    }

    const refreshedExpiresAt = new Date(
      Date.now() + Math.max(60, Number(data.expires_in) || 3600) * 1000,
    );
    await prisma.realDebridToken.update({
      where: { userId },
      data: {
        accessTokenCiphertext: encryptSecret(data.access_token),
        refreshTokenCiphertext: encryptSecret(data.refresh_token),
        expiresAt: refreshedExpiresAt,
        keyVersion: CREDENTIAL_KEY_VERSION,
      },
    });
    return data.access_token;
  }

  async getResolver(userId: string) {
    if (!clientIsConfigured()) return null;
    try {
      return new RealDebridResolver(await this.getAccessToken(userId));
    } catch {
      return null;
    }
  }
}

export const realDebridService = new RealDebridService();
