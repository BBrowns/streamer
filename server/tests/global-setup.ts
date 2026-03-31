import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";

let container: StartedPostgreSqlContainer;

export async function setup() {
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL === "") {
    console.log("[Testcontainers] Booting ephemeral PostgreSQL instance...");
    container = await new PostgreSqlContainer("postgres:17-alpine")
      .withDatabase("streamer_test")
      .withUsername("streamer")
      .withPassword("streamer_dev")
      .start();

    const uri = container.getConnectionUri() + "?schema=public";
    process.env.DATABASE_URL = uri;
    console.log(`[Testcontainers] Ready: ${uri}`);
  }
}

export async function teardown() {
  if (container) {
    console.log(
      "[Testcontainers] Tearing down ephemeral PostgreSQL instance...",
    );
    await container.stop();
  }
}
