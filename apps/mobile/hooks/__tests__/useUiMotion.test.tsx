import { renderHook } from "@testing-library/react-native";
import { useUiMotion } from "../useUiMotion";

const mockUseReducedMotion = jest.fn(() => false);

jest.mock("../useReducedMotion", () => ({
  useReducedMotion: () => mockUseReducedMotion(),
}));

describe("useUiMotion", () => {
  it("exposes semantic durations and spatial-motion policy", async () => {
    const { result } = await renderHook(() => useUiMotion());

    expect(result.current.reducedMotion).toBe(false);
    expect(result.current.duration("content")).toBe(140);
    expect(result.current.allowSpatialMotion).toBe(true);
    expect(result.current.allowContinuousMotion).toBe(true);
  });

  it("disables spatial and continuous motion while preserving instant state changes", async () => {
    mockUseReducedMotion.mockReturnValue(true);

    const { result } = await renderHook(() => useUiMotion());

    expect(result.current.duration("overlay")).toBe(0);
    expect(result.current.allowSpatialMotion).toBe(false);
    expect(result.current.allowContinuousMotion).toBe(false);
  });
});
