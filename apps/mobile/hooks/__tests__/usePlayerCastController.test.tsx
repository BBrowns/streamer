import { act, renderHook } from "@testing-library/react-native";
import type { Stream } from "@streamer/shared";

import { goBackOrReplace } from "../../lib/navigation";
import { stopCastSession } from "../../services/playback/PlaybackSessionCastService";
import { useCastStore, type ActiveCastSession } from "../../stores/castStore";
import { usePlayerCastController } from "../usePlayerCastController";

jest.mock("../../lib/navigation", () => ({
  goBackOrReplace: jest.fn(),
}));

jest.mock("../../services/playback/PlaybackSessionCastService", () => ({
  stopCastSession: jest.fn(),
}));

const mockedGoBackOrReplace = jest.mocked(goBackOrReplace);
const mockedStopCastSession = jest.mocked(stopCastSession);

const router = {
  back: jest.fn(),
  canGoBack: jest.fn(() => true),
  push: jest.fn(),
  replace: jest.fn(),
} as any;

const stream: Stream = { url: "https://media.example/movie.mp4" };
const activeCast: ActiveCastSession = {
  device: {
    id: "living-room",
    name: "Living room",
    type: "chromecast",
  },
  mediaInfo: {
    type: "movie",
    itemId: "movie-1",
    title: "Example movie",
  },
  sessionId: "session-1",
};

describe("usePlayerCastController", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedStopCastSession.mockResolvedValue(undefined);
    useCastStore.setState({ activeCast: null });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("owns modal visibility and closes it when casting starts", () => {
    const { result } = renderHook(() =>
      usePlayerCastController({ router, currentStream: stream }),
    );

    expect(result.current.castModalOpen).toBe(false);
    expect(result.current.canOpenCastModal).toBe(true);
    expect(result.current.shouldClosePlayerAfterStop).toBe(false);

    act(() => result.current.openCastModal());
    expect(result.current.castModalOpen).toBe(true);

    act(() => result.current.handleCastStarted(activeCast));
    expect(result.current.activeCast).toEqual(activeCast);
    expect(result.current.castModalOpen).toBe(false);
    expect(result.current.canOpenCastModal).toBe(false);

    act(() => result.current.openCastModal());
    expect(result.current.castModalOpen).toBe(false);
  });

  it("stops and clears a cast without closing a local player", async () => {
    useCastStore.setState({ activeCast });
    const { result } = renderHook(() =>
      usePlayerCastController({ router, currentStream: stream }),
    );

    await act(async () => {
      await result.current.stopCasting();
    });

    expect(mockedStopCastSession).toHaveBeenCalledWith(
      "living-room",
      "session-1",
    );
    expect(useCastStore.getState().activeCast).toBeNull();
    expect(mockedGoBackOrReplace).not.toHaveBeenCalled();
  });

  it("clears and closes a remote-only player when stopping fails", async () => {
    const error = new Error("bridge unavailable");
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    mockedStopCastSession.mockRejectedValueOnce(error);
    useCastStore.setState({ activeCast });
    const { result } = renderHook(() =>
      usePlayerCastController({ router, currentStream: null }),
    );

    expect(result.current.shouldClosePlayerAfterStop).toBe(true);
    await act(async () => {
      await result.current.stopCasting();
    });

    expect(consoleError).toHaveBeenCalledWith("Failed to stop cast", error);
    expect(useCastStore.getState().activeCast).toBeNull();
    expect(mockedGoBackOrReplace).toHaveBeenCalledWith(router);
  });

  it("starts stop cleanup and clears cast state immediately on player close", () => {
    useCastStore.setState({ activeCast });
    const { result } = renderHook(() =>
      usePlayerCastController({ router, currentStream: stream }),
    );

    act(() => result.current.stopCastingOnPlayerClose());

    expect(mockedStopCastSession).toHaveBeenCalledWith(
      "living-room",
      "session-1",
    );
    expect(useCastStore.getState().activeCast).toBeNull();
    expect(mockedGoBackOrReplace).not.toHaveBeenCalled();
  });
});
