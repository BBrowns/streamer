import AsyncStorage from "@react-native-async-storage/async-storage";
import { SearchService } from "../SearchService";

describe("SearchService", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it("deduplicates recent searches case-insensitively and keeps newest first", async () => {
    await SearchService.addRecentSearch("Dune");
    await SearchService.addRecentSearch("Alien");
    await SearchService.addRecentSearch("dune");

    await expect(SearchService.getRecentSearches()).resolves.toEqual([
      "dune",
      "Alien",
    ]);
  });

  it("limits recent searches to the newest ten entries", async () => {
    for (let i = 0; i < 12; i += 1) {
      await SearchService.addRecentSearch(`Title ${i}`);
    }

    const searches = await SearchService.getRecentSearches();

    expect(searches).toHaveLength(10);
    expect(searches[0]).toBe("Title 11");
    expect(searches[9]).toBe("Title 2");
  });

  it("migrates legacy command palette search history", async () => {
    await AsyncStorage.setItem(
      "@search_history",
      JSON.stringify(["Blade Runner", "Severance"]),
    );

    await expect(SearchService.getRecentSearches()).resolves.toEqual([
      "Blade Runner",
      "Severance",
    ]);
    await expect(AsyncStorage.getItem("@search_history")).resolves.toBeNull();
  });
});
