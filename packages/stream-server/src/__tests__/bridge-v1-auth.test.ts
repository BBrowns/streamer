import type { NextFunction, Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetBridgeV1AccessSessionsForTests,
  createBridgeV1AccessSession,
  requireBridgeV1MasterAuth,
  requireBridgeV1Scope,
  revokeBridgeV1AccessSession,
} from "../security.js";

const previousBridgeToken = process.env.STREAMER_BRIDGE_TOKEN;

type Middleware = (req: Request, res: Response, next: NextFunction) => void;

function runMiddleware(
  middleware: Middleware,
  options: {
    bearer?: string;
    bridgeHeader?: string;
    remoteAddress?: string;
  } = {},
) {
  let status = 200;
  let body: unknown;
  let continued = false;
  const headers = new Map<string, string>();
  if (options.bearer) {
    headers.set("authorization", `Bearer ${options.bearer}`);
  }
  if (options.bridgeHeader) {
    headers.set("x-streamer-bridge-token", options.bridgeHeader);
  }

  const req = {
    get(name: string) {
      return headers.get(name.toLowerCase());
    },
    socket: {
      remoteAddress: options.remoteAddress ?? "127.0.0.1",
    },
  } as unknown as Request;
  const res = {
    locals: {},
    status(code: number) {
      status = code;
      return this;
    },
    json(value: unknown) {
      body = value;
      return this;
    },
  } as unknown as Response;
  const next = () => {
    continued = true;
  };

  middleware(req, res, next);
  return { status, body, continued, locals: res.locals };
}

describe("bridge v1 authentication", () => {
  beforeEach(() => {
    process.env.STREAMER_BRIDGE_TOKEN = "master-pairing-token";
    __resetBridgeV1AccessSessionsForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    __resetBridgeV1AccessSessionsForTests();
    if (previousBridgeToken === undefined) {
      delete process.env.STREAMER_BRIDGE_TOKEN;
    } else {
      process.env.STREAMER_BRIDGE_TOKEN = previousBridgeToken;
    }
  });

  it("returns stable protocol errors for missing configuration and auth", () => {
    delete process.env.STREAMER_BRIDGE_TOKEN;
    const notConfigured = runMiddleware(requireBridgeV1Scope("jobs:read"));

    expect(notConfigured.status).toBe(503);
    expect(notConfigured.body).toEqual({
      protocolVersion: 1,
      error: {
        code: "AUTH_NOT_CONFIGURED",
        message: "Bridge authentication is not configured.",
        retryable: false,
      },
    });

    process.env.STREAMER_BRIDGE_TOKEN = "master-pairing-token";
    const missing = runMiddleware(requireBridgeV1Scope("jobs:read"));
    expect(missing.status).toBe(401);
    expect(missing.body).toMatchObject({
      error: { code: "AUTH_REQUIRED" },
    });
  });

  it("lets the master token access every bridge v1 scope", () => {
    const read = runMiddleware(requireBridgeV1Scope("jobs:read"), {
      bearer: "master-pairing-token",
    });
    const write = runMiddleware(requireBridgeV1Scope("jobs:write"), {
      bridgeHeader: "master-pairing-token",
    });

    expect(read.continued).toBe(true);
    expect(write.continued).toBe(true);
  });

  it("issues short-lived tokens that cannot exceed their scopes", () => {
    const master = runMiddleware(requireBridgeV1MasterAuth, {
      bearer: "master-pairing-token",
    });
    expect(master.continued).toBe(true);

    const created = createBridgeV1AccessSession({
      scopes: ["jobs:read"],
      ttlSeconds: 60,
    });

    expect(created).toMatchObject({
      protocolVersion: 1,
      sessionId: expect.any(String),
      accessToken: expect.any(String),
      expiresAt: expect.any(String),
    });

    const read = runMiddleware(requireBridgeV1Scope("jobs:read"), {
      bearer: created.accessToken,
    });
    const write = runMiddleware(requireBridgeV1Scope("jobs:write"), {
      bearer: created.accessToken,
    });

    expect(read.continued).toBe(true);
    expect(write.status).toBe(403);
    expect(write.body).toMatchObject({
      error: { code: "FORBIDDEN" },
    });
  });

  it("rejects expired scoped tokens", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-01T00:00:00.000Z"));
    const created = createBridgeV1AccessSession({
      scopes: ["jobs:read"],
      ttlSeconds: 60,
    });

    vi.setSystemTime(new Date("2030-01-01T00:01:01.000Z"));
    const expired = runMiddleware(requireBridgeV1Scope("jobs:read"), {
      bearer: created.accessToken,
    });

    expect(expired.status).toBe(401);
    expect(expired.body).toMatchObject({
      error: { code: "AUTH_REQUIRED" },
    });
  });

  it("revokes a scoped session without exposing session existence", () => {
    const created = createBridgeV1AccessSession({
      scopes: ["jobs:read"],
      ttlSeconds: 60,
    });

    expect(revokeBridgeV1AccessSession(created.sessionId)).toBe(true);
    expect(revokeBridgeV1AccessSession(created.sessionId)).toBe(false);

    const revoked = runMiddleware(requireBridgeV1Scope("jobs:read"), {
      bearer: created.accessToken,
    });
    expect(revoked.status).toBe(401);
    expect(revoked.body).toMatchObject({
      error: { code: "AUTH_REQUIRED" },
    });
  });
});
