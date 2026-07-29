import {
  type SeekableHandoffVideoPlayer,
  replaceWithSeekableSource,
} from "../seekablePlaybackHandoff";

type PlayerEvent = "sourceLoad" | "statusChange";
type PlayerEventPayload = { status?: string } | undefined;

function createPlayer({
  currentTime = 18,
  playing = true,
  status,
  replaceAsync = jest.fn().mockResolvedValue(undefined),
}: {
  currentTime?: number;
  playing?: boolean;
  status?: string;
  replaceAsync?: jest.Mock<Promise<void>, [string]>;
} = {}) {
  const listeners = new Map<
    PlayerEvent,
    Set<(payload?: PlayerEventPayload) => void>
  >();
  const removals: jest.Mock[] = [];
  const player: SeekableHandoffVideoPlayer = {
    currentTime,
    playing,
    status,
    playbackRate: 1.25,
    muted: true,
    volume: 0.4,
    play: jest.fn(),
    pause: jest.fn(),
    replaceAsync,
    addListener: jest.fn((event, listener) => {
      const callbacks = listeners.get(event) ?? new Set();
      callbacks.add(listener);
      listeners.set(event, callbacks);
      const remove = jest.fn(() => callbacks.delete(listener));
      removals.push(remove);
      return { remove };
    }),
  };

  return {
    player,
    removals,
    emit(event: PlayerEvent, payload?: PlayerEventPayload) {
      for (const listener of listeners.get(event) ?? []) {
        listener(payload);
      }
    },
  };
}

describe("replaceWithSeekableSource", () => {
  const source = "http://bridge.local/jobs/job-1/stream?token=runtime-only";

  it("waits for sourceLoad, restores the saved position, and resumes playback", async () => {
    const { player, emit, removals } = createPlayer();
    const controller = new AbortController();

    const handoff = replaceWithSeekableSource({
      player,
      source,
      resumeAt: 96.5,
      shouldResume: true,
      signal: controller.signal,
    });

    expect(player.replaceAsync).toHaveBeenCalledWith(source);
    expect(player.currentTime).toBe(18);
    emit("sourceLoad");

    await handoff;

    expect(player.currentTime).toBe(96.5);
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(removals).toHaveLength(2);
    expect(removals.every((remove) => remove.mock.calls.length > 0)).toBe(true);
  });

  it("accepts readyToPlay status and preserves an intentionally paused player", async () => {
    const { player, emit } = createPlayer({ playing: false });
    const controller = new AbortController();

    const handoff = replaceWithSeekableSource({
      player,
      source,
      resumeAt: 42,
      shouldResume: false,
      signal: controller.signal,
    });

    emit("statusChange", { status: "readyToPlay" });
    await handoff;

    expect(player.currentTime).toBe(42);
    expect(player.play).not.toHaveBeenCalled();
    expect(player.pause).toHaveBeenCalledTimes(1);
  });

  it("restores playback rate, mute, and volume after replacement", async () => {
    const { player, emit } = createPlayer();
    player.replaceAsync = jest.fn().mockImplementation(async () => {
      player.playbackRate = 1;
      player.muted = false;
      player.volume = 1;
    });
    const controller = new AbortController();

    const handoff = replaceWithSeekableSource({
      player,
      source,
      resumeAt: 52,
      shouldResume: true,
      signal: controller.signal,
    });
    emit("sourceLoad");
    await handoff;

    expect(player.playbackRate).toBe(1.25);
    expect(player.muted).toBe(true);
    expect(player.volume).toBe(0.4);
  });

  it("uses an already-ready player status when no event is dispatched", async () => {
    const { player } = createPlayer({ status: "idle" });
    player.replaceAsync = jest.fn().mockImplementation(async () => {
      player.status = "readyToPlay";
    });
    const controller = new AbortController();

    await replaceWithSeekableSource({
      player,
      source,
      resumeAt: 24,
      shouldResume: true,
      signal: controller.signal,
    });

    expect(player.currentTime).toBe(24);
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it("does not mistake the live source's ready status for the replacement", async () => {
    const { player, emit } = createPlayer({ status: "readyToPlay" });
    const controller = new AbortController();

    const handoff = replaceWithSeekableSource({
      player,
      source,
      resumeAt: 24,
      shouldResume: true,
      signal: controller.signal,
    });

    await Promise.resolve();
    expect(player.currentTime).toBe(18);
    expect(player.play).not.toHaveBeenCalled();

    emit("sourceLoad");
    await handoff;

    expect(player.currentTime).toBe(24);
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it("rejects cleanly when the handoff is aborted before the replacement becomes ready", async () => {
    const { player, removals } = createPlayer();
    const controller = new AbortController();
    const handoff = replaceWithSeekableSource({
      player,
      source,
      resumeAt: 66,
      shouldResume: true,
      signal: controller.signal,
    });

    controller.abort();

    await expect(handoff).rejects.toMatchObject({ name: "AbortError" });
    expect(player.currentTime).toBe(18);
    expect(player.play).not.toHaveBeenCalled();
    expect(removals.every((remove) => remove.mock.calls.length > 0)).toBe(true);
  });

  it("times out and removes readiness listeners when the replacement never becomes ready", async () => {
    jest.useFakeTimers();
    try {
      const { player, removals } = createPlayer();
      const controller = new AbortController();
      const handoff = replaceWithSeekableSource({
        player,
        source,
        resumeAt: 66,
        shouldResume: true,
        signal: controller.signal,
        timeoutMs: 20,
      });
      const rejection = expect(handoff).rejects.toThrow(
        "Seekable playback handoff timed out.",
      );

      await jest.advanceTimersByTimeAsync(20);

      await rejection;
      expect(player.currentTime).toBe(18);
      expect(player.play).not.toHaveBeenCalled();
      expect(removals.every((remove) => remove.mock.calls.length > 0)).toBe(
        true,
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it("cleans up listeners and leaves playback untouched when source replacement fails", async () => {
    const failure = new Error("replacement failed");
    const { player, removals } = createPlayer({
      replaceAsync: jest.fn().mockRejectedValue(failure),
    });
    const controller = new AbortController();

    await expect(
      replaceWithSeekableSource({
        player,
        source,
        resumeAt: 77,
        shouldResume: true,
        signal: controller.signal,
      }),
    ).rejects.toBe(failure);

    expect(player.currentTime).toBe(18);
    expect(player.play).not.toHaveBeenCalled();
    expect(removals.every((remove) => remove.mock.calls.length > 0)).toBe(true);
  });
});
