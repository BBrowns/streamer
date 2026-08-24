import { describe, expect, it } from "vitest";
import {
  catalogResponseSchema,
  metaDetailSchema,
  metaPreviewSchema,
} from "../schemas/meta.schema";

describe("Stremio metadata schemas", () => {
  it("keeps legacy previews valid when no landscape background is available", () => {
    const result = metaPreviewSchema.parse({
      id: "tt0133093",
      type: "movie",
      name: "The Matrix",
      poster: "https://images.example.test/matrix-poster.jpg",
    });

    expect(result).toMatchObject({
      id: "tt0133093",
      poster: "https://images.example.test/matrix-poster.jpg",
    });
    expect(result.background).toBeUndefined();
  });

  it("preserves a provider landscape background in catalog previews", () => {
    const result = metaPreviewSchema.parse({
      id: "tt0133093",
      type: "movie",
      name: "The Matrix",
      poster: "https://images.example.test/matrix-poster.jpg",
      background: "https://images.example.test/matrix-backdrop.jpg",
    });

    expect(result.background).toBe(
      "https://images.example.test/matrix-backdrop.jpg",
    );
  });

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
        background: undefined,
        genres: undefined,
        originalLanguage: undefined,
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

  it("normalizes provider original-language aliases", () => {
    expect(
      metaDetailSchema.parse({
        id: "tt0133093",
        type: "movie",
        name: "The Matrix",
        poster: "",
        original_language: "en",
      }),
    ).toMatchObject({
      originalLanguage: "en",
    });
  });
});
