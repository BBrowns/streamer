import { render } from "@testing-library/react-native";
import { EmptyState } from "../EmptyState";

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      tint: "#8064e8",
      text: "#211c2b",
      textSecondary: "#6f687b",
    },
  }),
}));

describe("EmptyState", () => {
  it("can render without filling its parent when followed by more content", () => {
    const screen = render(
      <EmptyState
        testID="downloads-empty-state"
        fill={false}
        icon="cloud-download-outline"
        title="No downloads"
        description="Saved items appear here."
        actionLabel="Browse"
        onAction={jest.fn()}
      />,
    );

    expect(screen.getByTestId("downloads-empty-state").props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ flex: 0 })]),
    );
  });
});
