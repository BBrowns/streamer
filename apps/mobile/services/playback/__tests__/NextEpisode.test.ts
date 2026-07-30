import { findNextEpisode } from "../NextEpisode";

describe("findNextEpisode", () => {
  it("uses season/episode order instead of provider array order", () => {
    expect(
      findNextEpisode(
        [
          {
            id: "s2e1",
            title: "Season two",
            season: 2,
            episode: 1,
            released: "",
          },
          {
            id: "s1e3",
            title: "Third",
            season: 1,
            episode: 3,
            released: "",
          },
          {
            id: "s1e2",
            title: "Second",
            season: 1,
            episode: 2,
            released: "",
          },
        ],
        { season: 1, episode: 2 },
      )?.id,
    ).toBe("s1e3");
  });

  it("returns null after the final episode", () => {
    expect(
      findNextEpisode(
        [
          {
            id: "final",
            title: "Final",
            season: 1,
            episode: 8,
            released: "",
          },
        ],
        { season: 1, episode: 8 },
      ),
    ).toBeNull();
  });
});
