import { beforeEach, describe, expect, it, vi } from "vitest";
import { AggregatorController } from "./aggregator.controller";
import {
  aggregatorService,
  MetadataProvidersUnavailableError,
} from "./aggregator.service";

function createContext() {
  const json = vi.fn((body: unknown, status = 200) => ({ body, status }));
  return {
    context: {
      req: { valid: () => ({ type: "movie", id: "tt-test" }) },
      get: (key: string) => {
        if (key === "user") return { userId: "user-1" };
        if (key === "requestId") return "req-controller";
        return undefined;
      },
      json,
    } as any,
    json,
  };
}

describe("AggregatorController.getMeta", () => {
  const controller = new AggregatorController();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps confirmed absence as 404", async () => {
    vi.spyOn(aggregatorService, "getMeta").mockResolvedValue(null);
    const { context, json } = createContext();

    await controller.getMeta(context);

    expect(json).toHaveBeenCalledWith({ error: "Metadata not found" }, 404);
  });

  it("maps total provider failure to consumer-safe 503 copy", async () => {
    vi.spyOn(aggregatorService, "getMeta").mockRejectedValue(
      new MetadataProvidersUnavailableError(),
    );
    const { context, json } = createContext();

    await controller.getMeta(context);

    expect(json).toHaveBeenCalledWith(
      {
        error: "This title could not be loaded right now. Please try again.",
        code: "METADATA_TEMPORARILY_UNAVAILABLE",
      },
      503,
    );
    expect(JSON.stringify(json.mock.calls[0][0])).not.toContain("provider");
  });

  it("does not hide unexpected service failures", async () => {
    const unexpected = new Error("unexpected");
    vi.spyOn(aggregatorService, "getMeta").mockRejectedValue(unexpected);
    const { context } = createContext();

    await expect(controller.getMeta(context)).rejects.toBe(unexpected);
  });
});
