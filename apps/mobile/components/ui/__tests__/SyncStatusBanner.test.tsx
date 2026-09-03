import { fireEvent, render } from "@testing-library/react-native";
import { SyncStatusBanner } from "../SyncStatusBanner";
import { useSync } from "../../../hooks/useSync";
import { useAuthStore } from "../../../stores/authStore";

jest.mock("../../../hooks/useSync", () => ({
  useSync: jest.fn(),
}));

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({
    colors: {
      tint: "#8064e8",
      text: "#211c2b",
      textSecondary: "#6f687b",
      success: "#2b8a57",
      warning: "#b47700",
      error: "#c2413b",
      border: "#ded9e5",
      card: "#ffffff",
      surface: "#ffffff",
      surfaceElevated: "#ffffff",
      onSurface: "#211c2b",
    },
  }),
}));

const mockedUseSync = jest.mocked(useSync);

describe("SyncStatusBanner", () => {
  beforeEach(() => {
    useAuthStore.setState({
      isAuthenticated: true,
      sessionHealth: "ready",
      sessionIssue: null,
    });
  });

  afterEach(() => {
    useAuthStore.setState({
      isAuthenticated: false,
      sessionHealth: "invalid",
      sessionIssue: null,
    });
  });

  it("shows recoverable sync degradation without presenting a login action", async () => {
    const retry = jest.fn();
    mockedUseSync.mockReturnValue({
      status: {
        state: "degraded",
        reason: "transport",
        attempt: 1,
        retryAt: null,
        retryDelayMs: null,
      },
      retry,
      sendMessage: jest.fn(),
    });

    const screen = await render(<SyncStatusBanner />);

    expect(
      screen.getByTestId("sync-status-banner").props.accessibilityRole,
    ).toBe("alert");
    expect(
      screen.getByText("Sync connection temporarily unavailable"),
    ).toBeTruthy();
    expect(screen.queryByText("Sign in")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Retry sync" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("stays hidden while sync is connected or stopped", async () => {
    mockedUseSync.mockReturnValue({
      status: {
        state: "connected",
        reason: null,
        attempt: 0,
        retryAt: null,
        retryDelayMs: null,
      },
      retry: jest.fn(),
      sendMessage: jest.fn(),
    });

    const screen = await render(<SyncStatusBanner />);

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows refresh attention while keeping the account authenticated", async () => {
    useAuthStore.setState({
      isAuthenticated: true,
      sessionHealth: "needs-attention",
      sessionIssue: "storage",
    });
    mockedUseSync.mockReturnValue({
      status: {
        state: "connected",
        reason: null,
        attempt: 0,
        retryAt: null,
        retryDelayMs: null,
      },
      retry: jest.fn(),
      sendMessage: jest.fn(),
    });

    const screen = await render(<SyncStatusBanner />);

    expect(
      screen.getByText("Session refresh is temporarily unavailable"),
    ).toBeTruthy();
  });
});
