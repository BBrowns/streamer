import {
  getBoundedRailOffset,
  getRailEdgeState,
  getRailScrollOptions,
} from "../MediaRail";

describe("MediaRail scroll bounds", () => {
  it("never scrolls before the first card or beyond the complete last card", () => {
    expect(getBoundedRailOffset(-80, 1200, 600)).toBe(0);
    expect(getBoundedRailOffset(320, 1200, 600)).toBe(320);
    expect(getBoundedRailOffset(900, 1200, 600)).toBe(600);
  });

  it("disables arrows at the exact rail edges", () => {
    expect(getRailEdgeState(0, 1200, 600)).toMatchObject({
      canScrollBack: false,
      canScrollForward: true,
    });
    expect(getRailEdgeState(600, 1200, 600)).toMatchObject({
      offset: 600,
      maxOffset: 600,
      canScrollBack: true,
      canScrollForward: false,
    });
  });

  it("keeps both arrows disabled when all content already fits", () => {
    expect(getRailEdgeState(200, 560, 600)).toEqual({
      offset: 0,
      maxOffset: 0,
      canScrollBack: false,
      canScrollForward: false,
    });
  });

  it("turns rail animation off when reduced motion is requested", () => {
    expect(getRailScrollOptions(420, true)).toEqual({
      offset: 420,
      animated: false,
    });
    expect(getRailScrollOptions(420, false)).toEqual({
      offset: 420,
      animated: true,
    });
  });
});
