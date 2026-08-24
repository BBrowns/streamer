import { describe, expect, it } from "vitest";
import {
  updateProgressSchema,
  watchProgressSchema,
} from "../schemas/library.schema";

const persistedProgress = {
  id: "00000000-0000-4000-8000-000000000001",
  userId: "00000000-0000-4000-8000-000000000002",
  type: "movie" as const,
  itemId: "tt0133093",
  currentTime: 120,
  duration: 8_160,
  durationSource: "media" as const,
  title: "The Matrix",
  poster: "https://images.example.test/matrix-poster.jpg",
  lastWatched: "2026-08-14T12:00:00.000Z",
};

describe("watch progress artwork compatibility", () => {
  it("accepts legacy persisted progress without a background", () => {
    const result = watchProgressSchema.parse(persistedProgress);

    expect(result.itemId).toBe("tt0133093");
    expect(result.background).toBeUndefined();
  });

  it("round-trips a nullable landscape background", () => {
    expect(
      watchProgressSchema.parse({
        ...persistedProgress,
        background: "https://images.example.test/matrix-backdrop.jpg",
      }).background,
    ).toBe("https://images.example.test/matrix-backdrop.jpg");

    expect(
      watchProgressSchema.parse({
        ...persistedProgress,
        background: null,
      }).background,
    ).toBeNull();
  });

  it("preserves a landscape background in progress updates", () => {
    const result = updateProgressSchema.parse({
      type: "movie",
      itemId: "tt0133093",
      currentTime: 120,
      duration: 8_160,
      durationSource: "media",
      title: "The Matrix",
      poster: "https://images.example.test/matrix-poster.jpg",
      background: "https://images.example.test/matrix-backdrop.jpg",
    });

    expect(result.background).toBe(
      "https://images.example.test/matrix-backdrop.jpg",
    );
  });
});
