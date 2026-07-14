import { describe, expect, it } from "vitest";
import { parseServerEnvironment } from "../src/config/env.validation.js";

const validProductionEnvironment = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://streamer:secret@db:5432/streamer",
  JWT_SECRET: "a-secure-production-secret-with-32-chars",
  CORS_ORIGINS: "https://app.streamer.example",
  SERVER_INSTANCE_MODE: "single",
  EMAIL_DELIVERY_MODE: "smtp",
  SMTP_HOST: "smtp.streamer.example",
  SMTP_USER: "streamer",
  SMTP_PASS: "mail-secret",
  SMTP_FROM: "noreply@streamer.example",
  APP_URL_WEB: "https://app.streamer.example",
  APP_URL_DEEPLINK: "streamer://",
} as const;

function issueMessages(environment: Record<string, string | undefined>) {
  const result = parseServerEnvironmentSafe(environment);
  return result.success
    ? []
    : result.error.issues.map((issue) => issue.message);
}

function parseServerEnvironmentSafe(
  environment: Record<string, string | undefined>,
) {
  try {
    return {
      success: true as const,
      data: parseServerEnvironment(environment),
    };
  } catch (error: any) {
    return { success: false as const, error };
  }
}

describe("server production environment validation", () => {
  it("accepts an explicit single-instance production configuration", () => {
    const parsed = parseServerEnvironment(validProductionEnvironment);

    expect(parsed.NODE_ENV).toBe("production");
    expect(parsed.SERVER_INSTANCE_MODE).toBe("single");
    expect(parsed.REDIS_URL).toBeUndefined();
    expect(parsed.EMAIL_DELIVERY_MODE).toBe("smtp");
  });

  it("requires operators to choose an instance mode", () => {
    const messages = issueMessages({
      ...validProductionEnvironment,
      SERVER_INSTANCE_MODE: undefined,
    });

    expect(messages).toContain(
      "SERVER_INSTANCE_MODE must be explicitly set to single or multi in production.",
    );
  });

  it("requires Redis for multi-instance production", () => {
    const messages = issueMessages({
      ...validProductionEnvironment,
      SERVER_INSTANCE_MODE: "multi",
    });

    expect(messages).toContain(
      "REDIS_URL is required for multi-instance production deployments.",
    );
  });

  it("accepts Redis-backed multi-instance production", () => {
    const parsed = parseServerEnvironment({
      ...validProductionEnvironment,
      SERVER_INSTANCE_MODE: "multi",
      REDIS_URL: "rediss://cache.streamer.example:6379",
    });

    expect(parsed.SERVER_INSTANCE_MODE).toBe("multi");
    expect(parsed.REDIS_URL).toMatch(/^rediss:/);
  });

  it("rejects weak and placeholder production JWT secrets", () => {
    expect(
      issueMessages({
        ...validProductionEnvironment,
        JWT_SECRET: "change-me-in-production",
      }),
    ).toEqual(
      expect.arrayContaining([
        "JWT_SECRET must contain at least 32 characters.",
        "JWT_SECRET contains a placeholder value.",
      ]),
    );
  });

  it("rejects long but obviously low-entropy production JWT secrets", () => {
    expect(
      issueMessages({
        ...validProductionEnvironment,
        JWT_SECRET: "a".repeat(64),
      }),
    ).toContain("JWT_SECRET appears to have insufficient entropy.");
  });

  it("rejects wildcard and insecure remote production origins", () => {
    expect(
      issueMessages({
        ...validProductionEnvironment,
        CORS_ORIGINS: "*",
      }),
    ).toContain(
      "CORS_ORIGINS must contain explicit origins and cannot use a wildcard.",
    );
    expect(
      issueMessages({
        ...validProductionEnvironment,
        CORS_ORIGINS: "http://app.streamer.example",
      }),
    ).toContain(
      "CORS_ORIGINS entries must be exact HTTP(S) origins; production permits HTTPS or loopback origins only.",
    );
  });

  it("allows an explicit loopback desktop renderer origin in production", () => {
    const parsed = parseServerEnvironment({
      ...validProductionEnvironment,
      CORS_ORIGINS: "https://app.streamer.example,http://localhost:8081",
    });

    expect(parsed.CORS_ORIGINS).toContain("http://localhost:8081");
  });

  it("requires real SMTP delivery and a public HTTPS web URL", () => {
    const messages = issueMessages({
      ...validProductionEnvironment,
      EMAIL_DELIVERY_MODE: "log",
      SMTP_HOST: undefined,
      SMTP_USER: undefined,
      SMTP_PASS: undefined,
      APP_URL_WEB: "http://localhost:8081",
    });

    expect(messages).toEqual(
      expect.arrayContaining([
        "EMAIL_DELIVERY_MODE must be smtp in production so verification and recovery emails are delivered.",
        "APP_URL_WEB must be a valid URL and must use HTTPS in production.",
      ]),
    );
  });

  it("keeps local development defaults permissive and bounded", () => {
    const parsed = parseServerEnvironment({
      DATABASE_URL: "postgresql://localhost:5432/streamer",
      JWT_SECRET: "dev-secret",
    });

    expect(parsed.NODE_ENV).toBe("development");
    expect(parsed.PORT).toBe(3001);
    expect(parsed.TRUST_PROXY_HOPS).toBe(0);
    expect(parsed.EMAIL_DELIVERY_MODE).toBeUndefined();
  });

  it("rejects invalid numeric configuration instead of producing NaN", () => {
    const messages = issueMessages({
      DATABASE_URL: "postgresql://localhost:5432/streamer",
      JWT_SECRET: "dev-secret",
      PORT: "not-a-number",
    });

    expect(messages.length).toBeGreaterThan(0);
  });

  it("allows an ephemeral test port but rejects port zero in production", () => {
    expect(
      parseServerEnvironment({
        DATABASE_URL: "postgresql://localhost:5432/streamer",
        JWT_SECRET: "test-secret",
        NODE_ENV: "test",
        PORT: "0",
      }).PORT,
    ).toBe(0);
    expect(
      issueMessages({ ...validProductionEnvironment, PORT: "0" }),
    ).toContain("PORT must be between 1 and 65535 in production.");
  });
});
