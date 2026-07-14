const english = require("../en.json") as Record<string, unknown>;
const dutch = require("../nl.json") as Record<string, unknown>;
const spanish = require("../es.json") as Record<string, unknown>;

function leafKeys(value: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === "object" && !Array.isArray(child)) {
      return leafKeys(child as Record<string, unknown>, path);
    }
    return [path];
  });
}

describe("locale key parity", () => {
  it.each([
    ["Dutch", dutch],
    ["Spanish", spanish],
  ])("keeps %s in sync with the English product contract", (_name, locale) => {
    expect(leafKeys(locale).sort()).toEqual(leafKeys(english).sort());
  });
});
