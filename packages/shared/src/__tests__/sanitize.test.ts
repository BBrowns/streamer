import { describe, expect, it } from "vitest";
import {
  decodeHtmlEntities,
  stripMarkup,
  stripSubtitleMarkup,
} from "../sanitize";

describe("shared sanitization", () => {
  it("decodes bounded entity layers without regex replacement chaining", () => {
    expect(decodeHtmlEntities("&amp;lt;script&amp;gt;")).toBe("<script>");
    expect(decodeHtmlEntities("&#60;script&#62;")).toBe("<script>");
  });

  it("removes raw-text blocks with whitespace-tolerant closing tags", () => {
    expect(
      stripMarkup("before<script>bad()</script >after", {
        removeRawTextContent: true,
      }),
    ).toBe("beforeafter");
    expect(
      stripMarkup("before<style>.bad{display:none}</style >after", {
        removeRawTextContent: true,
      }),
    ).toBe("beforeafter");
  });

  it("normalizes encoded subtitle markup and preserves line breaks", () => {
    expect(
      stripSubtitleMarkup(
        "{\\an8}&lt;script&gt;alert(1)&lt;/script&gt;&lt;br/&gt;Hello",
      ),
    ).toBe("alert(1)\nHello");
  });
});
