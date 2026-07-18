import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddonController } from "./addon.controller";
import { addonService } from "./addon.service";
import { aggregatorService } from "../aggregator/aggregator.service";

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
