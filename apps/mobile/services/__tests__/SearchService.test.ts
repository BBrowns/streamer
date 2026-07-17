import AsyncStorage from "@react-native-async-storage/async-storage";
import { SearchService } from "../SearchService";

describe("SearchService", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it("deduplicates recent searches case-insensitively and keeps newest first", async () => {
    await SearchService.addRecentSearch("Dune", "profile-a");
    await SearchService.addRecentSearch("Alien", "profile-a");
    await SearchService.addRecentSearch("dune", "profile-a");

    await expect(SearchService.getRecentSearches("profile-a")).resolves.toEqual(
      ["dune", "Alien"],
    );
  });

  it("limits recent searches to the newest ten entries", async () => {
    for (let i = 0; i < 12; i += 1) {
      await SearchService.addRecentSearch(`Title ${i}`, "profile-a");
    }

    const searches = await SearchService.getRecentSearches("profile-a");

    expect(searches).toHaveLength(10);
    expect(searches[0]).toBe("Title 11");
    expect(searches[9]).toBe("Title 2");
  });

  it("migrates legacy command palette search history", async () => {
    await AsyncStorage.setItem(
      "@search_history",
      JSON.stringify(["Blade Runner", "Severance"]),
    );

    await expect(SearchService.getRecentSearches("profile-a")).resolves.toEqual(
      ["Blade Runner", "Severance"],
    );
    await expect(AsyncStorage.getItem("@search_history")).resolves.toBeNull();
  });

  it("keeps recent searches isolated between profiles on shared devices", async () => {
    await SearchService.addRecentSearch("Dune", "profile-a");
    await SearchService.addRecentSearch("Alien", "profile-b");

    await expect(SearchService.getRecentSearches("profile-a")).resolves.toEqual(
      ["Dune"],
    );
    await expect(SearchService.getRecentSearches("profile-b")).resolves.toEqual(
      ["Alien"],
    );
  });

  it("migrates the previous unscoped recent-search key once", async () => {
    await AsyncStorage.setItem(
      "RECENT_SEARCHES",
      JSON.stringify(["The Matrix"]),
    );

    await expect(SearchService.getRecentSearches("profile-a")).resolves.toEqual(
      ["The Matrix"],
    );
    await expect(AsyncStorage.getItem("RECENT_SEARCHES")).resolves.toBeNull();
    await expect(SearchService.getRecentSearches("profile-b")).resolves.toEqual(
      [],
    );
  });
});
