import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";

let container: StartedPostgreSqlContainer | undefined;
let originalDatabaseUrl: string | undefined;
let originalNodeEnv: string | undefined;
let originalLogLevel: string | undefined;

function isPostgresUrl(value: string): boolean {
  return value.startsWith("postgresql://") || value.startsWith("postgres://");
}

function redactDatabaseUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.password) {
      url.password = "***";
    }
    return url.toString();
  } catch {
    return "<invalid connection URL>";
  }
}

function restoreEnvironmentValue(
  key: "DATABASE_URL" | "NODE_ENV" | "LOG_LEVEL",
  value?: string,
) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

export async function setup() {
  originalDatabaseUrl = process.env.DATABASE_URL;
  originalNodeEnv = process.env.NODE_ENV;
  originalLogLevel = process.env.LOG_LEVEL;
  process.env.NODE_ENV = "test";
  process.env.LOG_LEVEL = process.env.STREAMER_TEST_LOG_LEVEL || "silent";

  // A developer's DATABASE_URL is intentionally ignored. Local tests must not
  // touch the development database by accident. CI can opt into its service
  // explicitly and a developer can do the same with a disposable database.
  const explicitDatabaseUrl =
    process.env.STREAMER_TEST_DATABASE_URL ||
    (process.env.CI ? process.env.DATABASE_URL : undefined);

  if (explicitDatabaseUrl) {
    if (!isPostgresUrl(explicitDatabaseUrl)) {
      throw new Error(
        "STREAMER_TEST_DATABASE_URL must be a postgresql:// or postgres:// URL.",
      );
    }

    process.env.DATABASE_URL = explicitDatabaseUrl;
    console.log(
      `[Test database] Using explicitly configured database: ${redactDatabaseUrl(explicitDatabaseUrl)}`,
    );
    return;
  }

  // Do not let individual integration suites fall back to the app's local
  // development database while the container is starting.
  delete process.env.DATABASE_URL;

  try {
    console.log("[Test database] Booting ephemeral PostgreSQL container...");
    container = await new PostgreSqlContainer("postgres:17-alpine")
      .withDatabase("streamer_test")
      .withUsername("streamer")
      .withPassword("streamer_dev")
      .start();

    const url = new URL(container.getConnectionUri());
    url.searchParams.set("schema", "public");
    const uri = url.toString();
    process.env.DATABASE_URL = uri;
    console.log(
      `[Test database] Ephemeral PostgreSQL ready: ${redactDatabaseUrl(uri)}`,
    );
  } catch (error) {
    restoreEnvironmentValue("DATABASE_URL", originalDatabaseUrl);
    restoreEnvironmentValue("NODE_ENV", originalNodeEnv);
    restoreEnvironmentValue("LOG_LEVEL", originalLogLevel);
    const detail = error instanceof Error ? ` ${error.message}` : "";
    throw new Error(
      "Unable to start the isolated PostgreSQL test database. Start Docker Desktop (or another Docker-compatible daemon), then rerun the test. " +
        "For a deliberately managed disposable database, set STREAMER_TEST_DATABASE_URL instead. " +
        "Your normal DATABASE_URL is never used for local tests." +
        detail,
      { cause: error },
    );
  }
}

export async function teardown() {
  if (container) {
    console.log(
      "[Test database] Tearing down ephemeral PostgreSQL container...",
    );
    await container.stop();
  }

  restoreEnvironmentValue("DATABASE_URL", originalDatabaseUrl);
  restoreEnvironmentValue("NODE_ENV", originalNodeEnv);
  restoreEnvironmentValue("LOG_LEVEL", originalLogLevel);
}
