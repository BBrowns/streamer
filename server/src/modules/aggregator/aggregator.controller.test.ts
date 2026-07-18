import { beforeEach, describe, expect, it, vi } from "vitest";
import { AggregatorController } from "./aggregator.controller";
import {
  aggregatorService,
  InvalidSearchCursorError,
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

describe("AggregatorController.search", () => {
  const controller = new AggregatorController();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("passes validated mode, type, pagination and cancellation to the service", async () => {
    const signal = new AbortController().signal;
    const json = vi.fn((body: unknown) => body);
    const context = {
      req: {
        raw: { signal },
        valid: () => ({
          q: "Matrix",
          type: "movie",
          mode: "suggestions",
          limit: 6,
          cursor: 12,
        }),
      },
      get: (key: string) => {
        if (key === "user") return { userId: "user-1" };
        if (key === "requestId") return "req-search-controller";
        return undefined;
      },
      json,
    } as any;
    const response = {
      metas: [],
      providers: [],
      providersByContent: {},
      attemptedProviders: 0,
      successfulProviders: 0,
      failedProviderIds: [],
      partial: false,
      truncated: false,
      total: 0,
    };
    const search = vi
      .spyOn(aggregatorService, "searchWithProvenance")
      .mockResolvedValue(response);

    await controller.search(context);

    expect(search).toHaveBeenCalledWith(
      "user-1",
      "Matrix",
      "req-search-controller",
      {
        type: "movie",
        mode: "suggestions",
        limit: 6,
        cursor: 12,
        signal,
      },
    );
    expect(json).toHaveBeenCalledWith(response);
  });

  it("maps an invalid opaque cursor to a consumer-safe 400", async () => {
    const signal = new AbortController().signal;
    const json = vi.fn((body: unknown, status = 200) => ({ body, status }));
    const context = {
      req: {
        raw: { signal },
        valid: () => ({
          q: "Matrix",
          type: "all",
          mode: "results",
          cursor: "opaque-but-invalid",
        }),
      },
      get: (key: string) => {
        if (key === "user") return { userId: "user-1" };
        if (key === "requestId") return "req-invalid-cursor";
        return undefined;
      },
      json,
    } as any;
    vi.spyOn(aggregatorService, "searchWithProvenance").mockRejectedValue(
      new InvalidSearchCursorError(),
    );

    await controller.search(context);

    expect(json).toHaveBeenCalledWith(
      { error: "Search cursor is invalid.", code: "INVALID_SEARCH_CURSOR" },
      400,
    );
  });
});
