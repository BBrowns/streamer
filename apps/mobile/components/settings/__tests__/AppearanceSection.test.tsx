import { fireEvent, render } from "@testing-library/react-native";
import { AppearanceSection } from "../AppearanceSection";

const mockSetDynamicArtworkColor = jest.fn();
const mockSetForceReducedMotion = jest.fn();

jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue || _key,
  }),
}));
jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: { tint: "#fff", textSecondary: "#aaa" } }),
}));
jest.mock("../../../stores/authStore", () => ({
  useAuthStore: () => ({
    theme: "system",
    setTheme: jest.fn(),
    dynamicArtworkColor: true,
    setDynamicArtworkColor: mockSetDynamicArtworkColor,
    forceReducedMotion: false,
    setForceReducedMotion: mockSetForceReducedMotion,
  }),
}));
jest.mock("../../ui/SegmentedControl", () => ({
  SegmentedControl: () => null,
}));

describe("AppearanceSection", () => {
  it("exposes persisted dynamic-colour and reduced-motion preferences", async () => {
    const screen = await render(<AppearanceSection />);

    await fireEvent(
      screen.getByLabelText("Dynamic artwork colour"),
      "valueChange",
      false,
    );
    await fireEvent(
      screen.getByLabelText("Always reduce motion"),
      "valueChange",
      true,
    );

    expect(mockSetDynamicArtworkColor).toHaveBeenCalledWith(false);
    expect(mockSetForceReducedMotion).toHaveBeenCalledWith(true);
  });
});
