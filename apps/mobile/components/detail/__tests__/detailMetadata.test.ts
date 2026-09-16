import { describe, expect, it } from "@jest/globals";
import { getDetailCountMetadataKey } from "../detailMetadata";

describe("detail count metadata", () => {
  it("labels a series count as episodes instead of sources", () => {
    expect(getDetailCountMetadataKey("series")).toBe("episodes");
  });

  it("labels a movie count as sources", () => {
    expect(getDetailCountMetadataKey("movie")).toBe("sources");
  });
});
