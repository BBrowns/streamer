import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddonController } from "./addon.controller";
import { addonService } from "./addon.service";
import { aggregatorService } from "../aggregator/aggregator.service";

describe("AddonController.install", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("invalidates discovery state after adding an add-on", async () => {
    vi.spyOn(addonService, "install").mockResolvedValue({
      id: "addon-row",
      userId: "user-1",
      transportUrl: "https://provider.example/manifest.json",
      manifest: {
        id: "com.example.provider",
        version: "1.0.0",
        name: "Provider",
        description: "Provider",
        resources: ["stream"],
        types: ["movie"],
        catalogs: [],
      },
      installedAt: new Date().toISOString(),
    });
    const invalidateSearch = vi
      .spyOn(aggregatorService, "invalidateSearchCacheForUser")
      .mockImplementation(() => undefined);
    const invalidateStreams = vi
      .spyOn(aggregatorService, "invalidateStreamDiscoveryCacheForUser")
      .mockImplementation(() => undefined);
    const context = {
      req: {
        valid: () => ({
          transportUrl: "https://provider.example/manifest.json",
        }),
      },
      get: (key: string) => (key === "user" ? { userId: "user-1" } : undefined),
      json: (value: unknown, status: number) => ({ value, status }),
    } as any;

    const response = await new AddonController().install(context);

    expect(invalidateSearch).toHaveBeenCalledWith("user-1");
    expect(invalidateStreams).toHaveBeenCalledWith("user-1");
    expect(response.status).toBe(201);
  });
});

describe("AddonController.uninstall", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("removes resilience and search state for the deleted installation", async () => {
    vi.spyOn(addonService, "uninstall").mockResolvedValue({
      id: "addon-row",
      transportUrl: "https://provider.example/manifest.json",
    });
    const removeState = vi
      .spyOn(aggregatorService, "removeAddonStateForUser")
      .mockImplementation(() => undefined);
    const context = {
      req: { param: () => "addon-row" },
      get: (key: string) => (key === "user" ? { userId: "user-1" } : undefined),
    } as any;

    const response = await new AddonController().uninstall(context);

    expect(removeState).toHaveBeenCalledWith(
      "user-1",
      "addon-row",
      "https://provider.example/manifest.json",
    );
    expect(response.status).toBe(204);
  });
});
