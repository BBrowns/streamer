import { describe, expect, it } from "vitest";
import { playbackPlanRequestSchema } from "../schemas/playback.schema";
import { playbackSessionContentSchema } from "../schemas/playback-session.schema";
import { streamSchema } from "../schemas/stream.schema";

describe("series episode coordinates across boundaries", () => {
  const schemas = [
    playbackPlanRequestSchema.pick({ season: true, episode: true }),
    playbackSessionContentSchema.pick({ season: true, episode: true }),
    streamSchema.shape.fileSelectionHints.unwrap(),
  ];

  it.each(schemas)(
    "accepts Specials while keeping episode one-based",
    (schema) => {
      expect(schema.parse({ season: 0, episode: 1 })).toMatchObject({
        season: 0,
        episode: 1,
      });
      expect(schema.safeParse({ season: -1, episode: 1 }).success).toBe(false);
      expect(schema.safeParse({ season: 0, episode: 0 }).success).toBe(false);
      expect(schema.safeParse({ season: 0.5, episode: 1 }).success).toBe(false);
    },
  );
});
