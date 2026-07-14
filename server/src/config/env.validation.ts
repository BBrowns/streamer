import { z } from "zod";

const PLACEHOLDER_PATTERN =
  /change[-_ ]?me|placeholder|your[-_ ]|example[-_ ]?secret|dev[-_ ]?only/i;

const optionalString = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim().length === 0 ? undefined : value,
  z.string().trim().min(1).optional(),
);

const integer = (defaultValue: number, min: number, max: number) =>
  z.coerce.number().int().min(min).max(max).default(defaultValue);

export const serverEnvSchema = z
  .object({
    PORT: integer(3001, 0, 65535),
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    LOG_LEVEL: z.string().trim().min(1).default("info"),

    DATABASE_URL: z.string().trim().min(1, "DATABASE_URL is required"),

    JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
    JWT_SECRET_PREVIOUS: optionalString,
    JWT_ACCESS_EXPIRY: z.string().trim().min(1).default("15m"),
    JWT_REFRESH_EXPIRY: z.string().trim().min(1).default("7d"),

    CORS_ORIGINS: z.string().trim().min(1).default("http://localhost:8081"),
    TRUST_PROXY_HOPS: integer(0, 0, 16),
    SERVER_INSTANCE_MODE: z.enum(["single", "multi"]).optional(),
    SHUTDOWN_TIMEOUT_MS: integer(10000, 1000, 60000),
    RATE_LIMIT_GLOBAL_MAX: integer(1000, 100, 100000),

    MAX_CONCURRENT_SESSIONS: integer(2, 1, 100),
    REDIS_URL: optionalString,

    ADDON_TIMEOUT_MS: integer(5000, 250, 60000),
    ADDON_MAX_CONCURRENT: integer(10, 1, 100),

    RD_API_TOKEN: optionalString,
    TRAKT_CLIENT_ID: optionalString,
    TRAKT_CLIENT_SECRET: optionalString,

    EMAIL_DELIVERY_MODE: z.enum(["log", "smtp"]).optional(),
    SMTP_HOST: optionalString,
    SMTP_PORT: integer(587, 1, 65535),
    SMTP_USER: optionalString,
    SMTP_PASS: optionalString,
    SMTP_FROM: z.string().trim().email().default("noreply@streamer.app"),

    APP_URL_WEB: z.string().trim().default("http://localhost:8081"),
    APP_URL_DEEPLINK: z.string().trim().default("streamer://"),

    STREAMER_BRIDGE_SUPERVISOR: z.string().default("false"),

    SENTRY_DSN: optionalString,
    SENTRY_ENVIRONMENT: optionalString,
    SENTRY_RELEASE: optionalString,
    SENTRY_TRACES_SAMPLE_RATE: optionalString,
    SENTRY_ERROR_SAMPLE_RATE: optionalString,
    SENTRY_ENABLE_DEV: z.string().default("false"),
  })
  .superRefine((data, ctx) => {
    validateDatabaseUrl(data.DATABASE_URL, ctx);
    validateRedisUrl(data.REDIS_URL, ctx);
    validateCorsOrigins(data.CORS_ORIGINS, data.NODE_ENV, ctx);
    validateApplicationUrls(data, ctx);
    validateSmtp(data, ctx);

    if (data.NODE_ENV !== "production") return;

    if (!data.SERVER_INSTANCE_MODE) {
      addIssue(
        ctx,
        "SERVER_INSTANCE_MODE",
        "SERVER_INSTANCE_MODE must be explicitly set to single or multi in production.",
      );
    }

    if (data.PORT === 0) {
      addIssue(ctx, "PORT", "PORT must be between 1 and 65535 in production.");
    }

    if (data.SERVER_INSTANCE_MODE === "multi" && !data.REDIS_URL) {
      addIssue(
        ctx,
        "REDIS_URL",
        "REDIS_URL is required for multi-instance production deployments.",
      );
    }

    validateProductionSecret("JWT_SECRET", data.JWT_SECRET, ctx);
    if (data.JWT_SECRET_PREVIOUS) {
      validateProductionSecret(
        "JWT_SECRET_PREVIOUS",
        data.JWT_SECRET_PREVIOUS,
        ctx,
      );
      if (data.JWT_SECRET_PREVIOUS === data.JWT_SECRET) {
        addIssue(
          ctx,
          "JWT_SECRET_PREVIOUS",
          "JWT_SECRET_PREVIOUS must differ from JWT_SECRET.",
        );
      }
    }

    if ((data.EMAIL_DELIVERY_MODE || "log") !== "smtp") {
      addIssue(
        ctx,
        "EMAIL_DELIVERY_MODE",
        "EMAIL_DELIVERY_MODE must be smtp in production so verification and recovery emails are delivered.",
      );
    }
  });

export type ParsedServerEnvironment = z.infer<typeof serverEnvSchema>;

function addIssue(
  ctx: z.RefinementCtx,
  path: keyof ParsedServerEnvironment,
  message: string,
) {
  ctx.addIssue({ code: "custom", path: [path], message });
}

function validateDatabaseUrl(value: string, ctx: z.RefinementCtx) {
  try {
    const parsed = new URL(value);
    if (!new Set(["postgres:", "postgresql:"]).has(parsed.protocol)) {
      throw new Error("unsupported protocol");
    }
  } catch {
    addIssue(
      ctx,
      "DATABASE_URL",
      "DATABASE_URL must be a valid PostgreSQL URL.",
    );
  }
}

function validateRedisUrl(value: string | undefined, ctx: z.RefinementCtx) {
  if (!value) return;
  try {
    const parsed = new URL(value);
    if (!new Set(["redis:", "rediss:"]).has(parsed.protocol)) {
      throw new Error("unsupported protocol");
    }
  } catch {
    addIssue(ctx, "REDIS_URL", "REDIS_URL must be a valid Redis URL.");
  }
}

function isLoopbackHostname(hostname: string) {
  return new Set(["localhost", "127.0.0.1", "[::1]", "::1"]).has(
    hostname.toLowerCase(),
  );
}

function validateCorsOrigins(
  value: string,
  nodeEnv: ParsedServerEnvironment["NODE_ENV"],
  ctx: z.RefinementCtx,
) {
  for (const origin of value.split(",").map((entry) => entry.trim())) {
    if (!origin || origin === "*") {
      addIssue(
        ctx,
        "CORS_ORIGINS",
        "CORS_ORIGINS must contain explicit origins and cannot use a wildcard.",
      );
      continue;
    }

    try {
      const parsed = new URL(origin);
      const hasOriginOnly =
        (parsed.pathname === "/" || parsed.pathname === "") &&
        !parsed.search &&
        !parsed.hash &&
        !parsed.username &&
        !parsed.password;
      if (
        !new Set(["http:", "https:"]).has(parsed.protocol) ||
        !hasOriginOnly
      ) {
        throw new Error("invalid origin");
      }
      if (
        nodeEnv === "production" &&
        parsed.protocol !== "https:" &&
        !isLoopbackHostname(parsed.hostname)
      ) {
        throw new Error("insecure production origin");
      }
    } catch {
      addIssue(
        ctx,
        "CORS_ORIGINS",
        "CORS_ORIGINS entries must be exact HTTP(S) origins; production permits HTTPS or loopback origins only.",
      );
    }
  }
}

function validateApplicationUrls(
  data: ParsedServerEnvironment,
  ctx: z.RefinementCtx,
) {
  try {
    const webUrl = new URL(data.APP_URL_WEB);
    if (
      !new Set(["http:", "https:"]).has(webUrl.protocol) ||
      webUrl.username ||
      webUrl.password
    ) {
      throw new Error("invalid web URL");
    }
    if (data.NODE_ENV === "production" && webUrl.protocol !== "https:") {
      throw new Error("insecure production web URL");
    }
  } catch {
    addIssue(
      ctx,
      "APP_URL_WEB",
      "APP_URL_WEB must be a valid URL and must use HTTPS in production.",
    );
  }

  try {
    const deepLink = new URL(data.APP_URL_DEEPLINK);
    if (deepLink.protocol !== "streamer:") {
      throw new Error("unexpected deep-link scheme");
    }
  } catch {
    addIssue(
      ctx,
      "APP_URL_DEEPLINK",
      "APP_URL_DEEPLINK must use the streamer:// scheme.",
    );
  }
}

function validateSmtp(data: ParsedServerEnvironment, ctx: z.RefinementCtx) {
  const mode = data.EMAIL_DELIVERY_MODE || "log";
  const fields = [data.SMTP_HOST, data.SMTP_USER, data.SMTP_PASS];
  const hasAny = fields.some(Boolean);
  const hasAll = fields.every(Boolean);

  if ((mode === "smtp" || hasAny) && !hasAll) {
    for (const path of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"] as const) {
      if (!data[path]) {
        addIssue(
          ctx,
          path,
          `${path} is required when SMTP delivery is configured.`,
        );
      }
    }
  }
}

function validateProductionSecret(
  path: "JWT_SECRET" | "JWT_SECRET_PREVIOUS",
  value: string,
  ctx: z.RefinementCtx,
) {
  if (value.length < 32) {
    addIssue(ctx, path, `${path} must contain at least 32 characters.`);
  }
  if (new Set(value).size < 8) {
    addIssue(ctx, path, `${path} appears to have insufficient entropy.`);
  }
  if (PLACEHOLDER_PATTERN.test(value)) {
    addIssue(ctx, path, `${path} contains a placeholder value.`);
  }
}

export function parseServerEnvironment(
  source: NodeJS.ProcessEnv | Record<string, string | undefined>,
) {
  return serverEnvSchema.parse(source);
}
