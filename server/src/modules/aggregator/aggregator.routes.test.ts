import { describe, expect, it } from "vitest";
import { aggregatorRouter } from "./aggregator.routes";
import { systemRouter } from "../system/system.routes";

describe("aggregator diagnostics routes", () => {
  it("does not expose canonical resilience diagnostics anonymously", async () => {
    const response = await aggregatorRouter.request("/resilience");

    expect(response.status).toBe(401);
  });

  it("protects the legacy documented resilience diagnostics path too", async () => {
    const response = await systemRouter.request("/api/aggregator/resilience");

    expect(response.status).toBe(401);
  });

  it("does not expose subtitle catalogs or documents anonymously", async () => {
    await expect(
      aggregatorRouter.request("/subtitles/movie/tt123"),
    ).resolves.toMatchObject({ status: 401 });
    await expect(
      aggregatorRouter.request(
        "/subtitles/document/123e4567-e89b-42d3-a456-426614174000",
      ),
    ).resolves.toMatchObject({ status: 401 });
  });
});
