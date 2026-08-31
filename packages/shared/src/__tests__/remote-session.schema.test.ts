import { describe, expect, it } from "vitest";
import {
  playbackSessionUpdateSchema,
  remoteSessionCommandSchema,
} from "../index";

describe("remote playback session schemas", () => {
  it("accepts bounded playback updates and rejects unknown fields", () => {
    expect(
      playbackSessionUpdateSchema.parse({
        status: "playing",
        itemId: "tt123",
        position: 42,
      }),
    ).toEqual({ status: "playing", itemId: "tt123", position: 42 });

    expect(() =>
      playbackSessionUpdateSchema.parse({ status: "playing", secret: "x" }),
    ).toThrow();
  });

  it("rejects unsafe device ids and oversized command payloads", () => {
    expect(() =>
      remoteSessionCommandSchema.parse({
        targetDeviceId: "../other-user",
        action: "pause",
      }),
    ).toThrow();

    expect(() =>
      remoteSessionCommandSchema.parse({
        targetDeviceId: "living-room",
        action: "pause",
        data: Object.fromEntries(
          Array.from({ length: 17 }, (_, index) => [`field-${index}`, true]),
        ),
      }),
    ).toThrow();
  });
});
