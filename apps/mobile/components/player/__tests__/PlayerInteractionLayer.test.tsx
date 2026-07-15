import { fireEvent, render } from "@testing-library/react-native";
import { PlayerInteractionLayer } from "../PlayerInteractionLayer";

describe("PlayerInteractionLayer", () => {
  it("keeps pointer hit zones out of the keyboard and accessibility order", () => {
    const onTapSide = jest.fn();
    const onToggleControls = jest.fn();
    const screen = render(
      <PlayerInteractionLayer
        onTapSide={onTapSide}
        onToggleControls={onToggleControls}
      />,
    );

    const zones = [
      screen.getByTestId("player-hit-zone-left"),
      screen.getByTestId("player-hit-zone-center"),
      screen.getByTestId("player-hit-zone-right"),
    ];
    for (const zone of zones) {
      expect(zone.props.focusable).toBe(false);
      expect(zone.props.tabIndex).toBe(-1);
      expect(zone.props.accessible).toBe(false);
      expect(zone.props.importantForAccessibility).toBe("no");
    }

    fireEvent.press(zones[0]);
    fireEvent.press(zones[1]);
    fireEvent.press(zones[2]);
    expect(onTapSide).toHaveBeenNthCalledWith(1, "left");
    expect(onTapSide).toHaveBeenNthCalledWith(2, "right");
    expect(onToggleControls).toHaveBeenCalledTimes(1);
  });
});
