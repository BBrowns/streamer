import { act, renderHook } from "@testing-library/react-native";
import { useEpisodeStreams } from "../useEpisodeStreams";
import { useStreams } from "../useStreams";

const mockUseQuery = jest.fn();

jest.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));
jest.mock("../../stores/authStore", () => ({
  useAuthStore: (selector: (state: { isAuthenticated: boolean }) => unknown) =>
    selector({ isAuthenticated: true }),
}));
jest.mock("../../services/api", () => ({ api: { get: jest.fn() } }));

describe("partial stream discovery refresh", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockUseQuery.mockReturnValue({
      data: { streams: [], sourceDiscovery: { status: "partial" } },
      refetch: jest.fn(),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it.each([
    ["title", () => useStreams("movie", "tt-partial")],
    ["episode", () => useEpisodeStreams("tt-partial", 1, 2)],
  ])(
    "rechecks one partial %s response after the server cache can complete",
    (_name, hook) => {
      const { unmount } = renderHook(hook);
      const refetch = mockUseQuery.mock.results[0].value.refetch as jest.Mock;

      act(() => {
        jest.advanceTimersByTime(5_999);
      });
      expect(refetch).not.toHaveBeenCalled();

      act(() => {
        jest.advanceTimersByTime(1);
      });
      expect(refetch).toHaveBeenCalledTimes(1);
      unmount();
    },
  );
});
