import React from "react";
import { render } from "@testing-library/react-native";
import { ActiveSessionsModal } from "../ActiveSessionsModal";
import { ChangePasswordModal } from "../ChangePasswordModal";
import { EditProfileModal } from "../EditProfileModal";

jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("../../../hooks/useReducedMotion", () => ({
  useReducedMotion: () => true,
}));
jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({
    colors: {
      border: "#222",
      borderSubtle: "#222",
      error: "#f66",
      focus: "#88f",
      onTint: "#000",
      scrim: "rgba(0,0,0,.7)",
      success: "#6f8",
      surfaceElevated: "#181818",
      surfaceOverlay: "#111",
      text: "#fff",
      textSecondary: "#aaa",
      tint: "#c96",
    },
  }),
}));
jest.mock("../../../stores/authStore", () => {
  const state = {
    user: { displayName: "Julian", email: "julian@example.test" },
    setAuth: jest.fn(),
  };
  const useAuthStore = () => state;
  useAuthStore.getState = () => ({
    ...state,
    accessToken: "token",
    refreshToken: "refresh",
  });
  return { useAuthStore };
});
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("../../ui/AdaptiveOverlay", () => ({
  AdaptiveOverlay: ({ visible, children, testID, size, placement }: any) => {
    const { View } = require("react-native");
    return visible ? (
      <View
        testID={testID}
        accessibilityLabel={`${String(size)}:${String(placement)}`}
      >
        {children}
      </View>
    ) : null;
  },
}));

describe("account modal presentation", () => {
  it.each([
    [
      "edit profile",
      <EditProfileModal key="profile" visible onClose={jest.fn()} />,
      "edit-profile-overlay",
    ],
    [
      "change password",
      <ChangePasswordModal key="password" visible onClose={jest.fn()} />,
      "change-password-overlay",
    ],
    [
      "active sessions",
      <ActiveSessionsModal
        key="sessions"
        visible
        onClose={jest.fn()}
        sessions={[]}
        isSessionsLoading={false}
        revokeSession={jest.fn()}
      />,
      "active-sessions-overlay",
    ],
  ])(
    "renders %s as a centered adaptive form surface",
    async (_, element, id) => {
      const screen = await render(element);

      expect(screen.getByTestId(id).props.accessibilityLabel).toBe(
        "form:center",
      );
    },
  );
});
