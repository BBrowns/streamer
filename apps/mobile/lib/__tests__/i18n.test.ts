import i18n from "../i18n";

const EMPTY_TRANSLATION_KEY = "__i18n_empty_translation_regression__";

describe("mobile i18n configuration", () => {
  it("returns an empty translation as empty", () => {
    i18n.addResource("en", "translation", EMPTY_TRANSLATION_KEY, "");

    expect(i18n.t(EMPTY_TRANSLATION_KEY)).toBe("");
  });
});
