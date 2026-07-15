import { fireEvent, render } from "@testing-library/react-native";
import { SelectionActionBar } from "../SelectionActionBar";

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      surfaceElevated: "#ffffff",
      border: "#dddddd",
      text: "#111111",
    },
  }),
}));

describe("SelectionActionBar", () => {
  it("stays hidden until at least one item is selected", () => {
    const { queryByText } = render(
      <SelectionActionBar
        selectedCount={0}
        selectedLabel="0 selected"
        actionLabel="Delete"
        onAction={jest.fn()}
      />,
    );

    expect(queryByText("0 selected")).toBeNull();
    expect(queryByText("Delete")).toBeNull();
  });

  it("shows the shared count and destructive action for a selection", () => {
    const onAction = jest.fn();
    const { getByText, getByLabelText } = render(
      <SelectionActionBar
        selectedCount={2}
        selectedLabel="2 selected"
        actionLabel="Delete"
        actionAccessibilityLabel="Delete selected downloads"
        onAction={onAction}
      />,
    );

    expect(getByText("2 selected")).toBeTruthy();
    fireEvent.press(getByLabelText("Delete selected downloads"));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
