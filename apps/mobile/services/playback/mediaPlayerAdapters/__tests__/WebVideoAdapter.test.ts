import { WebVideoAdapter } from "../WebVideoAdapter";
import type { ExpoVideoPlayerLike } from "../ExpoVideoAdapterBase";
import type { WebVideoElement } from "../WebVideoAdapter";

function createPlayer(duration = 10): ExpoVideoPlayerLike {
  return {
    status: "readyToPlay",
    currentTime: 0,
    duration,
    bufferedPosition: duration,
    playing: false,
    muted: false,
    volume: 1,
    playbackRate: 1,
    play: jest.fn(),
    pause: jest.fn(),
    seekBy: jest.fn(),
    replaceAsync: jest.fn(async () => undefined),
  };
}

describe("WebVideoAdapter media-element timeline", () => {
  it("uses the active media element's full duration and published ranges", () => {
    const video = {
      readyState: 4,
      currentTime: 120,
      duration: 7_200,
      buffered: {
        length: 2,
        start: (index: number) => (index === 0 ? 0 : 3_600),
        end: (index: number) => (index === 0 ? 60 : 3_660),
      },
      seekable: {
        length: 2,
        start: (index: number) => (index === 0 ? 0 : 3_000),
        end: (index: number) => (index === 0 ? 1_800 : 7_200),
      },
    } as unknown as WebVideoElement;
    const adapter = new WebVideoAdapter(createPlayer(10), {
      resolveVideoElement: () => video,
    });

    expect(adapter.snapshot()).toMatchObject({
      currentTime: 120,
      duration: 7_200,
      bufferedPosition: 3_660,
      bufferedRanges: [
        { start: 0, end: 60 },
        { start: 3_600, end: 3_660 },
      ],
      seekableRanges: [
        { start: 0, end: 1_800 },
        { start: 3_000, end: 7_200 },
      ],
      canSeek: true,
    });
  });

  it("treats an explicit empty media-element range list as empty", () => {
    const video = {
      readyState: 4,
      currentTime: 0,
      duration: 7_200,
      buffered: { length: 0 },
      seekable: { length: 0 },
    } as unknown as WebVideoElement;
    const adapter = new WebVideoAdapter(createPlayer(10), {
      resolveVideoElement: () => video,
    });

    expect(adapter.snapshot()).toMatchObject({
      duration: 7_200,
      bufferedPosition: 0,
      bufferedRanges: [],
      seekableRanges: [],
      canSeek: false,
    });
  });
});
