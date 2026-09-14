import { describe, expect, it } from "vitest";
import {
  getUpstreamStatus,
  isExplicitMetadataNotFound,
} from "./upstream-status.js";

describe("upstream status classification", () => {
  it.each([
    [{ response: { status: 403 } }, 403],
    [{ status: 500 }, 500],
    [{ cause: { cause: { response: { status: 404 } } } }, 404],
    [{ status: "403" }, undefined],
    [{ cause: { cause: { cause: { status: 403 } } } }, undefined],
    [null, undefined],
  ])("reads only a bounded numeric status from %j", (error, expected) => {
    expect(getUpstreamStatus(error)).toBe(expected);
  });

  it("does not infer status from sensitive or untrusted error text", () => {
    const error = new Error("404 not found; 403 forbidden");
    expect(getUpstreamStatus(error)).toBeUndefined();
    expect(isExplicitMetadataNotFound(error)).toBe(false);
    expect(isExplicitMetadataNotFound({ cause: { status: 404 } })).toBe(true);
  });

  it("bounds a cyclic cause without mutation", () => {
    const error: { cause?: unknown } = {};
    error.cause = error;
    expect(getUpstreamStatus(error)).toBeUndefined();
    expect(error.cause).toBe(error);
  });
});
