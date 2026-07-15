import { fireEvent, render } from "@testing-library/react-native";
import { DetailLoadState } from "../DetailLoadState";

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

const translations: Record<string, string> = {
  "detail.back": "Back",
  "detail.loadState.eyebrow": "Title details",
  "detail.loadState.loadingTitle": "Loading title details",
  "detail.loadState.loadingDescription": "Getting title details.",
  "detail.loadState.notFoundTitle": "This title isn’t available",
  "detail.loadState.notFoundDescription": "No add-on has this title.",
  "detail.loadState.networkTitle": "You’re offline",
  "detail.loadState.networkDescription": "Reconnect and try again.",
  "detail.loadState.temporaryTitle": "This title couldn’t load",
  "detail.loadState.temporaryDescription": "Try again in a moment.",
  "detail.loadState.retry": "Try again",
  "detail.loadState.reviewAddons": "Review add-ons",
  "detail.loadState.sourcesDevices": "Sources & Devices",
};

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => translations[key] ?? key,
  }),
}));

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({
    isDark: true,
    colors: {
      background: "#08090C",
      card: "#111318",
      surfaceElevated: "#181B21",
      surfaceSubtle: "#0D0F13",
      surfaceOverlay: "#111318",
      text: "#F4F5F7",
      textSecondary: "#9DA3AE",
      header: "#08090C",
      border: "#24272D",
      tint: "#6C79F5",
      onTint: "#08090C",
      primary: "#F4F5F7",
      onPrimary: "#08090C",
      focus: "#8792FF",
      scrim: "#000000",
      disabled: "#5E646E",
      opaqueGlassFallback: "#111318",
      tabBar: "#08090C",
      error: "#FF7087",
      success: "#4EC98B",
      warning: "#E7B86A",
    },
  }),
}));

describe("DetailLoadState", () => {
  it("shows a calm loading state with an immediately available Back action", () => {
    const onBack = jest.fn();
    const screen = render(<DetailLoadState kind="loading" onBack={onBack} />);

    expect(screen.getByTestId("detail-load-spinner")).toBeTruthy();
    expect(screen.getByRole("header").props.children).toBe(
      "Loading title details",
    );
    expect(screen.queryByTestId("detail-load-retry")).toBeNull();

    fireEvent.press(screen.getByTestId("detail-load-back"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("directs a confirmed missing title to add-ons and still allows retry", () => {
    const onRetry = jest.fn();
    const onSupport = jest.fn();
    const screen = render(
      <DetailLoadState
        kind="notFound"
        onBack={jest.fn()}
        onRetry={onRetry}
        onSupport={onSupport}
      />,
    );

    expect(screen.getByRole("header").props.children).toBe(
      "This title isn’t available",
    );
    expect(screen.getByText("Review add-ons")).toBeTruthy();

    fireEvent.press(screen.getByTestId("detail-load-retry"));
    fireEvent.press(screen.getByTestId("detail-load-support"));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onSupport).toHaveBeenCalledTimes(1);
  });

  it.each(["network", "temporary"] as const)(
    "offers Sources & Devices recovery for a %s failure",
    (kind) => {
      const onSupport = jest.fn();
      const screen = render(
        <DetailLoadState
          kind={kind}
          onBack={jest.fn()}
          onRetry={jest.fn()}
          onSupport={onSupport}
        />,
      );

      expect(screen.getByText("Sources & Devices")).toBeTruthy();
      fireEvent.press(screen.getByTestId("detail-load-support"));
      expect(onSupport).toHaveBeenCalledTimes(1);
    },
  );

  it("announces an active manual retry and prevents duplicate presses", () => {
    const onRetry = jest.fn();
    const screen = render(
      <DetailLoadState
        kind="temporary"
        retrying
        onBack={jest.fn()}
        onRetry={onRetry}
        onSupport={jest.fn()}
      />,
    );

    expect(
      screen.getByTestId("detail-load-retry").props.accessibilityState,
    ).toEqual(expect.objectContaining({ busy: true, disabled: true }));
    fireEvent.press(screen.getByTestId("detail-load-retry"));
    expect(onRetry).not.toHaveBeenCalled();
  });
});
