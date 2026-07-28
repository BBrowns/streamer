import { ContentType } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  normalizeProgressCoordinate,
  normalizeProgressDuration,
} from "../library.service.js";
import type { WatchProgressRecord } from "../../ports/library.ports.js";

function existingProgress(
  overrides: Partial<WatchProgressRecord> = {},
): WatchProgressRecord {
  return {
    id: "progress-1",
    userId: "user-1",
    type: ContentType.movie,
    itemId: "movie-1",
    season: null,
    episode: null,
    currentTime: 120,
    duration: 7_200,
    durationSource: "metadata",
    title: "Movie",
    poster: null,
    lastWatched: new Date("2026-07-27T12:00:00.000Z"),
    ...overrides,
  };
}

describe("normalizeProgressDuration", () => {
  it("allows an unknown duration without turning player elapsed time into a total", () => {
    expect(
      normalizeProgressDuration({
        currentTime: 180,
        duration: 0,
        durationSource: "unknown",
      }),
    ).toEqual({
      currentTime: 180,
      duration: 0,
      durationSource: "unknown",
    });
  });

  it("keeps a known duration when a progressive source reports unknown", () => {
    expect(
      normalizeProgressDuration(
        {
          currentTime: 300,
          duration: 0,
          durationSource: "unknown",
        },
        existingProgress(),
      ),
    ).toEqual({
      currentTime: 300,
      duration: 7_200,
      durationSource: "metadata",
    });
  });

  it("clamps positions only when a trusted duration is known", () => {
    expect(
      normalizeProgressDuration({
        currentTime: 9_000,
        duration: 7_200,
        durationSource: "media",
      }),
    ).toEqual({
      currentTime: 7_200,
      duration: 7_200,
      durationSource: "media",
    });
    expect(
      normalizeProgressDuration({
        currentTime: 9_000,
        duration: 0,
        durationSource: "unknown",
      }),
    ).toEqual({
      currentTime: 9_000,
      duration: 0,
      durationSource: "unknown",
    });
  });

  it("does not downgrade media duration to metadata or legacy", () => {
    const existing = existingProgress({
      duration: 7_100,
      durationSource: "media",
    });

    expect(
      normalizeProgressDuration(
        {
          currentTime: 400,
          duration: 7_200,
          durationSource: "metadata",
        },
        existing,
      ),
    ).toEqual({
      currentTime: 400,
      duration: 7_100,
      durationSource: "media",
    });
  });
});

describe("normalizeProgressCoordinate", () => {
  it("keeps persistence sentinels out of playback-facing progress records", () => {
    expect(normalizeProgressCoordinate(0)).toBeNull();
    expect(normalizeProgressCoordinate(null)).toBeNull();
    expect(normalizeProgressCoordinate(undefined)).toBeNull();
    expect(normalizeProgressCoordinate(3)).toBe(3);
  });
});
