import React from "react";
import { Alert } from "react-native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AddonsScreen from "../index";
import { api } from "../../../services/api";
import { useAuthStore } from "../../../stores/authStore";

jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("../../../services/api", () => ({
  api: { get: jest.fn(), post: jest.fn(), delete: jest.fn() },
}));

const installedAddon = {
  id: "addon-1",
  userId: "user-1",
  transportUrl: "https://example.com/manifest.json",
  installedAt: "2026-07-15T00:00:00.000Z",
  manifest: {
    id: "example",
    version: "1.0.0",
    name: "Example Provider",
    description: "Example catalog provider",
    resources: ["catalog"],
    types: ["movie"],
    catalogs: [],
  },
};

describe("Add-ons removal", () => {
  beforeEach(() => {
    useAuthStore.setState({ isAuthenticated: true });
    (api.get as jest.Mock).mockResolvedValue({
      data: { addons: [installedAddon] },
    });
    jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it("keeps a failed removal visible and offers a recoverable retry", async () => {
    (api.delete as jest.Mock)
      .mockRejectedValueOnce(new Error("Service unavailable"))
      .mockResolvedValueOnce({});
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const screen = render(
      <QueryClientProvider client={queryClient}>
        <AddonsScreen />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(screen.getByText("Example Provider")).toBeTruthy(),
    );
    fireEvent.press(screen.getByLabelText("addons.installed.confirmRemove"));
    const confirmationButtons = (Alert.alert as jest.Mock).mock.calls[0][2];
    confirmationButtons[1].onPress();

    await waitFor(() => {
      expect(screen.getByText("Service unavailable")).toBeTruthy();
      expect(screen.getByText("Example Provider")).toBeTruthy();
    });

    fireEvent.press(screen.getByText("common.retry"));
    await waitFor(() => expect(api.delete).toHaveBeenCalledTimes(2));
    screen.unmount();
    queryClient.clear();
  });

  it("invalidates title search after installing an add-on", async () => {
    (api.post as jest.Mock).mockResolvedValue({ data: installedAddon });
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidateQueries = jest
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);
    const screen = render(
      <QueryClientProvider client={queryClient}>
        <AddonsScreen />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(screen.getByText("Example Provider")).toBeTruthy(),
    );
    fireEvent.changeText(
      screen.getByLabelText("Manifest URL"),
      "https://new-addon.test/manifest.json",
    );
    fireEvent.press(screen.getByLabelText("addons.install.button"));

    await waitFor(() =>
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: ["search"],
      }),
    );
    screen.unmount();
    queryClient.clear();
  });

  it("invalidates title search after removing an add-on", async () => {
    (api.delete as jest.Mock).mockResolvedValue({});
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidateQueries = jest
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);
    const screen = render(
      <QueryClientProvider client={queryClient}>
        <AddonsScreen />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(screen.getByText("Example Provider")).toBeTruthy(),
    );
    fireEvent.press(screen.getByLabelText("addons.installed.confirmRemove"));
    const confirmationButtons = (Alert.alert as jest.Mock).mock.calls[0][2];
    confirmationButtons[1].onPress();

    await waitFor(() =>
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: ["search"],
      }),
    );
    screen.unmount();
    queryClient.clear();
  });
});
