import { useAuthStore } from "../authStore";

describe("appearance preferences", () => {
  beforeEach(() => {
    useAuthStore.setState({
      dynamicArtworkColor: true,
      forceReducedMotion: false,
    });
  });

  it("keeps dynamic artwork colour enabled by default and makes it configurable", () => {
    expect(useAuthStore.getState().dynamicArtworkColor).toBe(true);

    useAuthStore.getState().setDynamicArtworkColor(false);

    expect(useAuthStore.getState().dynamicArtworkColor).toBe(false);
  });

  it("persists an explicit reduced-motion override", () => {
    expect(useAuthStore.getState().forceReducedMotion).toBe(false);

    useAuthStore.getState().setForceReducedMotion(true);

    expect(useAuthStore.getState().forceReducedMotion).toBe(true);
  });
});
