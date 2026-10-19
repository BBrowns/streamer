const { parseQueryParams } = jest.requireActual(
  "expo-router/build/fork/getStateFromPath-forks",
);

test("Expo Router parses encoded, repeated, and malformed query parameters", () => {
  expect(
    parseQueryParams(
      "/search?title=caf%C3%A9&tag=one&tag=two&bad=%ZZ",
      { name: "search" },
      undefined,
      undefined,
    ),
  ).toEqual({
    title: "café",
    tag: ["one", "two"],
    bad: "%ZZ",
  });
});
