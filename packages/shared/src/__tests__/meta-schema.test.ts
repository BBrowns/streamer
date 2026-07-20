import { describe, expect, it } from "vitest";
import { catalogResponseSchema } from "../schemas/meta.schema";

describe("Stremio metadata schemas", () => {
  it("normalizes nullable metadata and drops one malformed catalog entry", () => {
    const result = catalogResponseSchema.parse({
      metas: [
        {
          id: "tt0133093",
          type: "movie",
          name: "The Matrix",
          poster: null,
          description: null,
          releaseInfo: null,
          released: null,
          imdbRating: null,
          aliases: null,
          alternativeTitles: null,
        },
        {
          id: "tt-bad",
          type: "movie",
          name: null,
        },
      ],
    });

    expect(result.metas).toEqual([
      {
        id: "tt0133093",
        type: "movie",
        name: "The Matrix",
        poster: "",
        description: undefined,
        releaseInfo: undefined,
        released: undefined,
        imdbRating: undefined,
        aliases: undefined,
        alternativeTitles: undefined,
      },
    ]);
  });

  it("rejects a non-empty catalog when every entry is malformed", () => {
    expect(
      catalogResponseSchema.safeParse({
        metas: [{ id: "tt0133093", type: "movie", name: null }],
      }).success,
    ).toBe(false);
  });
});
