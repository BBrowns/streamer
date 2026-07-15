import { fireEvent, render } from "@testing-library/react-native";
import { TechnicalSourceDisclosure } from "../TechnicalSourceDisclosure";

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({
    colors: {
      textSecondary: "#9da3ae",
      focus: "#6c79f5",
    },
  }),
}));

jest.mock("../SourceInspectorPanel", () => ({
  SourceInspectorPanel: () => {
    const { Text } = require("react-native");
    return <Text>Rank and codec diagnostics</Text>;
  },
}));

describe("TechnicalSourceDisclosure", () => {
  it("does not mount technical diagnostics until the viewer opens them", () => {
    const screen = render(
      <TechnicalSourceDisclosure contentType="movie" contentId="tt123" />,
    );

    expect(screen.queryByText("Rank and codec diagnostics")).toBeNull();

    fireEvent.press(screen.getByLabelText("Show technical details"));

    expect(screen.getByText("Rank and codec diagnostics")).toBeTruthy();
    expect(screen.getByLabelText("Hide technical details")).toBeTruthy();
  });
});
