import { describe, it, expect } from "vitest";
import { streamResponseSchema } from "@streamer/shared";

describe("Stream Schema Validation", () => {
  it("should pass validation if stream object has infoHash but no url", () => {
    const data = {
      streams: [
        {
          infoHash: "hash123",
          title: "Test Stream",
        },
      ],
    };

    const result = streamResponseSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("should pass validation if stream object has a valid url", () => {
    const data = {
      streams: [
        {
          url: "https://example.com/file.mp4",
          title: "Test Stream",
        },
      ],
    };

    const result = streamResponseSchema.safeParse(data);
    expect(result.success).toBe(true);
  });
});
