import dotenv from "dotenv";
import path from "path";
import {
  parseServerEnvironment,
  type ParsedServerEnvironment,
} from "./env.validation.js";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

let envData: ParsedServerEnvironment;
try {
  envData = parseServerEnvironment(process.env);
} catch (error) {
  console.error("Invalid server environment configuration.");
  throw error;
}

const parseBoolean = (value: string) =>
  ["1", "true", "yes", "on"].includes(value.toLowerCase());

export const env = {
  port: envData.PORT,
  nodeEnv: envData.NODE_ENV,
  logLevel: envData.LOG_LEVEL,

  databaseUrl: envData.DATABASE_URL,

  jwtSecret: envData.JWT_SECRET,
  jwtSecretPrevious: envData.JWT_SECRET_PREVIOUS,
  jwtAccessExpiry: envData.JWT_ACCESS_EXPIRY,
  jwtRefreshExpiry: envData.JWT_REFRESH_EXPIRY,

  corsOrigins: Array.from(
    new Set(
      envData.CORS_ORIGINS.split(",")
        .map((origin) => origin.trim().replace(/\/$/, ""))
        .filter(Boolean),
    ),
  ),
  trustProxyHops: envData.TRUST_PROXY_HOPS,
  instanceMode: envData.SERVER_INSTANCE_MODE || "single",
  shutdownTimeoutMs: envData.SHUTDOWN_TIMEOUT_MS,
  rateLimitGlobalMax: envData.RATE_LIMIT_GLOBAL_MAX,

  maxConcurrentSessions: envData.MAX_CONCURRENT_SESSIONS,
  redisUrl: envData.REDIS_URL,

  addonTimeoutMs: envData.ADDON_TIMEOUT_MS,
  addonMaxConcurrent: envData.ADDON_MAX_CONCURRENT,

  rdApiToken: envData.RD_API_TOKEN,

  traktClientId: envData.TRAKT_CLIENT_ID,
  traktClientSecret: envData.TRAKT_CLIENT_SECRET,

  emailDeliveryMode: envData.EMAIL_DELIVERY_MODE || "log",
  smtp: {
    host: envData.SMTP_HOST,
    port: envData.SMTP_PORT,
    user: envData.SMTP_USER,
    pass: envData.SMTP_PASS,
    from: envData.SMTP_FROM,
  },

  appUrlWeb: envData.APP_URL_WEB.replace(/\/$/, ""),
  appUrlDeepLink: envData.APP_URL_DEEPLINK,

  bridgeSupervisorEnabled: parseBoolean(envData.STREAMER_BRIDGE_SUPERVISOR),

  sentry: {
    dsn: envData.SENTRY_DSN,
    environment: envData.SENTRY_ENVIRONMENT,
    release: envData.SENTRY_RELEASE,
    tracesSampleRate: envData.SENTRY_TRACES_SAMPLE_RATE,
    errorSampleRate: envData.SENTRY_ERROR_SAMPLE_RATE,
    enableDev: parseBoolean(envData.SENTRY_ENABLE_DEV),
  },
} as const;
