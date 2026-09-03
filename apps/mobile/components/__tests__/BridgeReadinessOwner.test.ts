import type { AppStateStatus } from "react-native";
import { shouldPollBridgeReadiness } from "../BridgeReadinessOwner";

const activeState: AppStateStatus = "active";

describe("shouldPollBridgeReadiness", () => {
  const readyState = {
    isHydrated: true,
    credentialsHydrated: true,
    isAuthenticated: true,
    appState: activeState,
    documentVisible: true,
  };

  it("allows polling only for an authenticated visible active shell", () => {
    expect(shouldPollBridgeReadiness(readyState)).toBe(true);
  });

  it.each([
    ["state hydration", { isHydrated: false }],
    ["credential hydration", { credentialsHydrated: false }],
    ["authentication", { isAuthenticated: false }],
    ["inactive app", { appState: "background" as AppStateStatus }],
    ["hidden document", { documentVisible: false }],
  ])("pauses polling during %s", (_reason, override) => {
    expect(shouldPollBridgeReadiness({ ...readyState, ...override })).toBe(
      false,
    );
  });
});
