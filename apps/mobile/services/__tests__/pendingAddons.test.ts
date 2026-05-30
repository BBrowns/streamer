import {
  flushPendingAddonUrls,
  isAlreadyInstalledAddonError,
} from "../pendingAddons";

const axiosError = (status: number) =>
  ({
    isAxiosError: true,
    response: { status },
  }) as any;

describe("pending add-on flushing", () => {
  it("treats already-installed add-ons as successful", async () => {
    const installAddon = jest
      .fn()
      .mockResolvedValueOnce({ id: "cinemeta" })
      .mockRejectedValueOnce(axiosError(409));

    const result = await flushPendingAddonUrls(
      [
        "https://cinemeta.test/manifest.json",
        "https://dupe.test/manifest.json",
      ],
      installAddon,
    );

    expect(result).toEqual({
      installed: ["https://cinemeta.test/manifest.json"],
      alreadyInstalled: ["https://dupe.test/manifest.json"],
      failed: [],
    });
  });

  it("keeps non-duplicate failures pending", async () => {
    const installAddon = jest
      .fn()
      .mockRejectedValueOnce(axiosError(500))
      .mockRejectedValueOnce(new Error("network"));

    const result = await flushPendingAddonUrls(
      ["https://bad.test/manifest.json", "https://offline.test/manifest.json"],
      installAddon,
    );

    expect(result.failed).toEqual([
      "https://bad.test/manifest.json",
      "https://offline.test/manifest.json",
    ]);
  });

  it("recognizes duplicate add-on install errors", () => {
    expect(isAlreadyInstalledAddonError(axiosError(409))).toBe(true);
    expect(isAlreadyInstalledAddonError(axiosError(400))).toBe(false);
    expect(isAlreadyInstalledAddonError(new Error("nope"))).toBe(false);
  });
});
