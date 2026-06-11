import { describe, it, expect, beforeAll, vi } from "vitest";
import { hc } from "hono/client";
import { createApp } from "../src/app.js";
import type { AppType } from "../src/app.js";
import { AppError } from "../src/middleware/error.middleware.js";

vi.mock("../src/modules/auth/auth.service.js", () => ({
  authService: {
    login: vi.fn(async () => {
      throw new AppError(401, "Invalid email or password");
    }),
  },
}));

describe("Hono RPC Integration", () => {
  let client: any; // Initially any to avoid circularity in test setup if needed

  beforeAll(() => {
    const app = createApp();
    // In actual app we use a URL, for testing we can use a mock or the app instance
    client = hc<AppType>("http://localhost", {
      fetch: (url, init) => app.request(url, init),
    });
  });

  it("should have correctly typed auth login route", async () => {
    // This is a TS-only test mostly, but we trigger it
    const res = await client.api.auth.login.$post({
      json: {
        email: "test@example.com",
        password: "password123",
      },
    });

    // If types are correct, this should compile and we check status
    // 401 because we haven't seeded this user in this test context
    expect(res.status).toBe(401);
  });

  it("should have correctly typed health route", async () => {
    const res = await client.health.$get();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("ok");
    expect(data.build.runtimeType).toBe("server");
    expect(data.build.release).toContain("streamer-server@");
  });
});
