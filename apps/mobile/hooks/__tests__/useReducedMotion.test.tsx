import { act, renderHook } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";
import { useReducedMotion } from "../useReducedMotion";
import { useAuthStore } from "../../stores/authStore";

describe("useReducedMotion", () => {
  beforeEach(() => {
    useAuthStore.setState({ forceReducedMotion: false });
    jest
      .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
      .mockResolvedValue(false);
    jest
      .spyOn(AccessibilityInfo, "addEventListener")
      .mockReturnValue({ remove: jest.fn() } as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("combines the platform preference with the persisted override", async () => {
    const { result } = await renderHook(() => useReducedMotion());

    expect(result.current).toBe(false);

    await act(async () => {
      useAuthStore.getState().setForceReducedMotion(true);
    });

    expect(result.current).toBe(true);
  });
});
