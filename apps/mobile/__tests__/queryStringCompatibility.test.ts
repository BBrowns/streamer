const queryString = jest.requireActual("query-string");

test("Expo query parsing loads the real ESM decoder in Jest", () => {
  expect({
    ...queryString.parse("title=caf%C3%A9&tag=one&tag=two&bad=%ZZ"),
  }).toEqual({
    title: "café",
    tag: ["one", "two"],
    bad: "%ZZ",
  });
});
