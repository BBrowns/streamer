import { describe, expect, it } from "vitest";
import {
  aggregatorSearchResponseSchema,
  aggregatorSearchSchema,
} from "../schemas/aggregator.schema";

describe("aggregatorSearchSchema", () => {
  it("applies stable search defaults and parses pagination", () => {
    expect(
      aggregatorSearchSchema.parse({
        q: " matrix ",
        limit: "20",
        cursor: "40",
      }),
    ).toEqual({
      q: "matrix",
      type: "all",
      mode: "results",
      limit: 20,
      cursor: 40,
    });
  });

  it("accepts an opaque base64url pagination cursor", () => {
    const cursor = "MTo0M2Y5NjYwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDA6NDA";
    expect(aggregatorSearchSchema.parse({ q: "matrix", cursor }).cursor).toBe(
      cursor,
    );
  });

  it.each([
    { q: "x" },
    { q: "matrix", type: "documentary" },
    { q: "matrix", mode: "quick" },
    { q: "matrix", limit: "0" },
    { q: "matrix", limit: "101" },
    { q: "matrix", cursor: "not-a-cursor" },
  ])("rejects invalid search parameters: %j", (input) => {
    expect(aggregatorSearchSchema.safeParse(input).success).toBe(false);
  });
});

describe("aggregatorSearchResponseSchema", () => {
  const response = {
    metas: [
      {
        id: "tt0133093",
        type: "movie",
        name: "The Matrix",
        poster: "https://example.test/matrix.jpg",
      },
    ],
    providers: [{ id: "addon-1", name: "Search add-on" }],
    providersByContent: { "movie:tt0133093": ["addon-1"] },
    attemptedProviders: 1,
    successfulProviders: 1,
    failedProviderIds: [],
    partial: false,
    truncated: true,
    total: 1,
  };

  it("requires an explicit truncation signal", () => {
    expect(aggregatorSearchResponseSchema.parse(response).truncated).toBe(true);

    const withoutTruncated: Record<string, unknown> = { ...response };
    delete withoutTruncated.truncated;
    expect(
      aggregatorSearchResponseSchema.safeParse(withoutTruncated).success,
    ).toBe(false);
  });

  it("rejects a non-boolean truncation signal", () => {
    expect(
      aggregatorSearchResponseSchema.safeParse({
        ...response,
        truncated: "true",
      }).success,
    ).toBe(false);
  });
});
