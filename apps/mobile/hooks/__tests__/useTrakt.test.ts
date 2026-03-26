import { renderHook, act } from "@testing-library/react-native";
import { useTrakt } from "../useTrakt";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { api } from "../../services/api";
import { useQuery, useMutation } from "@tanstack/react-query";

// Mock dependencies
jest.mock("expo-web-browser");
jest.mock("expo-linking");
jest.mock("../../services/api");
jest.mock("@tanstack/react-query");

describe("useTrakt", () => {
  const mockRevise = jest.fn();
  const mockMutateAsync = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useQuery as jest.Mock).mockReturnValue({
      data: { connected: false },
      isLoading: false,
    });
    (useMutation as jest.Mock).mockReturnValue({
      mutateAsync: mockMutateAsync,
      mutate: jest.fn(),
      isPending: false,
    });
    (Linking.createURL as jest.Mock).mockReturnValue("mobile://trakt-callback");
  });

  it("should return initial connection status", () => {
    const { result } = renderHook(() => useTrakt());
    expect(result.current.connected).toBe(false);
  });

  it("should initiate OAuth flow on connect", async () => {
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
      type: "success",
      url: "mobile://trakt-callback?code=test-code",
    });
    (Linking.parse as jest.Mock).mockReturnValue({
      queryParams: { code: "test-code" },
    });

    const { result } = renderHook(() => useTrakt());

    await act(async () => {
      await result.current.connect();
    });

    const [url, redirect] = (WebBrowser.openAuthSessionAsync as jest.Mock).mock
      .calls[0];

    expect(url).toContain("https://trakt.tv/oauth/authorize");
    expect(redirect).toBe("mobile://trakt-callback");

    expect(mockMutateAsync).toHaveBeenCalledWith("test-code");
  });

  it("should handle OAuth cancellation", async () => {
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
      type: "cancel",
    });

    const { result } = renderHook(() => useTrakt());

    await act(async () => {
      await result.current.connect();
    });

    expect(mockMutateAsync).not.toHaveBeenCalled();
  });
});
