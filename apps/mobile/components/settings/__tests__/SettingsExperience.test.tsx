import { render } from "@testing-library/react-native";
import {
  resolveSettingsColumnCount,
  resolveSettingsPresentation,
  SettingsExperience,
} from "../SettingsExperience";

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ clear: jest.fn() }),
}));
jest.mock("expo-local-authentication", () => ({}));
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({
    colors: {
      background: "#000",
      card: "#111",
      surfaceElevated: "#222",
      text: "#fff",
      textSecondary: "#aaa",
      tint: "#77f",
      border: "#333",
      success: "#0a0",
      warning: "#fa0",
      error: "#f00",
    },
  }),
}));
jest.mock("../../../hooks/useWindowClass", () => ({
  useWindowClass: () => ({
    isCompact: true,
    isLarge: false,
    windowClass: "compact",
    width: 390,
  }),
}));
jest.mock("../../../hooks/usePlaybackEnvironmentStatus", () => ({
  usePlaybackEnvironmentStatus: () => ({
    bridgeReady: false,
  }),
}));
jest.mock("../../../hooks/useTrakt", () => ({ useTrakt: () => ({}) }));
jest.mock("../../../hooks/useRealDebrid", () => ({
  useRealDebrid: () => ({
    status: { connected: false },
    isLoading: false,
    isError: false,
    connect: jest.fn(),
    disconnect: jest.fn(),
  }),
}));
jest.mock("../../../hooks/useSessions", () => ({
  useSessions: () => ({
    sessions: [],
    isLoading: false,
    revokeSession: jest.fn(),
  }),
}));
jest.mock("../../../hooks/useAccount", () => ({
  useAccount: () => ({
    exportData: { isPending: false, mutate: jest.fn() },
    deleteAccount: { isPending: false, mutate: jest.fn() },
  }),
}));
jest.mock("../../../stores/authStore", () => ({
  useAuthStore: (selector: any) =>
    selector({
      user: { displayName: "Ari", email: "ari@example.com" },
      isAuthenticated: true,
      logout: jest.fn(),
      biometricEnabled: false,
      setBiometricEnabled: jest.fn(),
      deviceId: "device-1",
    }),
}));
jest.mock("../../../services/queryPersister", () => ({
  clearQueryCache: jest.fn(),
}));
jest.mock("../../../services/streamEngine/StreamEngineManager", () => ({
  streamEngineManager: {
    bridgeStatus: "ready",
    detectBridge: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock("../../../services/streamEngine/bridgeStatusPresentation", () => ({
  getBridgeStatusPresentation: () => ({ tone: "success" }),
}));
jest.mock("../../../lib/haptics", () => ({
  hapticSelection: jest.fn(),
  hapticWarning: jest.fn(),
}));
jest.mock("../../ui/PageLayout", () => {
  const { View } = require("react-native");
  return {
    PageLayout: ({ children, testID, scroll }: any) => (
      <View testID={testID} accessibilityLabel={`scroll:${String(scroll)}`}>
        {children}
      </View>
    ),
  };
});
jest.mock("../../ui/ContentBoundary", () => {
  const { View } = require("react-native");
  return {
    ContentBoundary: ({ children, size, maxWidth }: any) => (
      <View testID={`content-boundary-${size}-${maxWidth}`}>{children}</View>
    ),
  };
});
jest.mock("../../ui/PageHeader", () => {
  const { Text } = require("react-native");
  return {
    PageHeader: ({ title, titleVisibility, testID }: any) => (
      <Text
        testID={testID ?? "settings-page-header"}
        accessibilityLabel={titleVisibility}
      >
        {titleVisibility === "visible" ? title : null}
      </Text>
    ),
  };
});
jest.mock("../../ui/ErrorBoundary", () => ({
  ErrorBoundary: ({ children }: any) => children,
}));
jest.mock("../../ui/EmptyState", () => ({ EmptyState: () => null }));
jest.mock("../../ui/AppButton", () => ({ AppButton: () => null }));
jest.mock("../AppearanceSection", () => ({ AppearanceSection: () => null }));
jest.mock("../LanguageSection", () => ({ LanguageSection: () => null }));
jest.mock("../SourcesSection", () => ({
  AdvancedSourcesSection: () => null,
  SourcesSection: () => null,
}));
jest.mock("../PersonalizationSection", () => ({
  PersonalizationSection: () => null,
}));
jest.mock("../DownloadsSettingsSection", () => ({
  DownloadsSettingsSection: () => null,
}));
jest.mock("../ChangePasswordModal", () => ({
  ChangePasswordModal: () => null,
}));
jest.mock("../EditProfileModal", () => ({ EditProfileModal: () => null }));
jest.mock("../ActiveSessionsModal", () => ({
  ActiveSessionsModal: () => null,
}));
jest.mock("../SettingsRows", () => {
  const { View } = require("react-native");
  return {
    SettingsActionRow: () => null,
    SettingsInfoRow: () => null,
    SettingsNavRow: () => null,
    SettingsRowGroup: ({ children }: any) => <View>{children}</View>,
    SettingsToggleRow: () => null,
  };
});

describe("SettingsExperience boundary contract", () => {
  it("uses overview/detail and resolves dashboard columns from content width", () => {
    expect(resolveSettingsPresentation("compact", false)).toBe("overview");
    expect(resolveSettingsPresentation("compact", true)).toBe("detail");
    expect(resolveSettingsPresentation("medium", false, 672)).toBe(
      "dashboard-one-column",
    );
    expect(resolveSettingsPresentation("expanded", false, 864)).toBe(
      "dashboard-two-column",
    );
    expect(resolveSettingsPresentation("large", false, 1008)).toBe(
      "dashboard-two-column",
    );
    expect(resolveSettingsPresentation("expanded", false, 672)).toBe(
      "dashboard-one-column",
    );
    expect(resolveSettingsPresentation("large", true, 1008)).toBe("detail");
  });

  it("keeps the two-column threshold pure and readable at its boundary", () => {
    expect(resolveSettingsColumnCount(751)).toBe(1);
    expect(resolveSettingsColumnCount(752)).toBe(2);
  });

  it("keeps compact overview titles navigation-owned in one utility-narrow scroller", async () => {
    const screen = await render(<SettingsExperience />);

    expect(screen.getByTestId("settings-screen").props.accessibilityLabel).toBe(
      "scroll:undefined",
    );
    expect(
      screen.getByTestId("content-boundary-utilityNarrow-720"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("settings-page-header").props.accessibilityLabel,
    ).toBe("navigation-owned");
    expect(
      screen.root?.queryAll((node) => node.type === "RCTScrollView"),
    ).toHaveLength(1);
  });

  it("shows setup attention when the bridge requires client pairing", async () => {
    const screen = await render(<SettingsExperience />);

    expect(screen.getByText("settings.readiness.attentionTitle")).toBeTruthy();
    expect(screen.queryByText("settings.readiness.readyTitle")).toBeNull();
  });
});
