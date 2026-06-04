import type { DownloadTask } from "../../../stores/downloadStore";
import {
  formatBytes,
  getDownloadPrimaryAction,
  getDownloadQueueGroup,
  getDownloadQueueSummary,
  getDownloadStatusKey,
  sortDownloadTasks,
} from "../downloadPresentation";

function makeTask(
  id: string,
  overrides: Partial<DownloadTask> = {},
): DownloadTask {
  return {
    id,
    mediaInfo: {
      type: "movie",
      itemId: `tt-${id}`,
      title: `Movie ${id}`,
      downloadUrl: `https://cdn.example.test/${id}.mp4`,
    },
    progress: 0,
    status: "Pending",
    totalBytesWritten: 0,
    totalBytesExpectedToWrite: 0,
    createdAt: "2026-06-04T10:00:00.000Z",
    updatedAt: "2026-06-04T10:00:00.000Z",
    ...overrides,
  };
}

describe("downloadPresentation", () => {
  it("groups verified completions separately from unverified completions", () => {
    const unverified = makeTask("unverified", {
      status: "Completed",
      localUri: "file:///downloads/unverified.mp4",
    });
    const verified = makeTask("verified", {
      status: "Completed",
      localUri: "file:///downloads/verified.mp4",
      offlineVerifiedAt: "2026-06-04T10:05:00.000Z",
    });

    expect(getDownloadQueueGroup(unverified)).toBe("active");
    expect(getDownloadStatusKey(unverified)).toBe("checking");
    expect(getDownloadQueueGroup(verified)).toBe("ready");
    expect(getDownloadStatusKey(verified)).toBe("readyOffline");
  });

  it("maps visible primary actions from queue state", () => {
    expect(
      getDownloadPrimaryAction(
        makeTask("downloading", { status: "Downloading" }),
      ),
    ).toBe("pause");
    expect(
      getDownloadPrimaryAction(makeTask("paused", { status: "Paused" })),
    ).toBe("resume");
    expect(
      getDownloadPrimaryAction(makeTask("error", { status: "Error" })),
    ).toBe("retry");
    expect(
      getDownloadPrimaryAction(
        makeTask("ready", {
          status: "Completed",
          localUri: "file:///downloads/ready.mp4",
          offlineVerifiedAt: "2026-06-04T10:05:00.000Z",
        }),
      ),
    ).toBe("play");
  });

  it("formats storage sizes and summarizes ready bytes", () => {
    const tasks = [
      makeTask("active", {
        status: "Downloading",
        totalBytesExpectedToWrite: 1024 ** 3,
      }),
      makeTask("ready", {
        status: "Completed",
        localUri: "file:///downloads/ready.mp4",
        offlineVerifiedAt: "2026-06-04T10:05:00.000Z",
        totalBytesExpectedToWrite: 2 * 1024 ** 3,
      }),
      makeTask("error", { status: "Error" }),
    ];

    expect(formatBytes(2 * 1024 ** 3)).toBe("2 GB");
    expect(getDownloadQueueSummary(tasks)).toEqual({
      active: 1,
      attention: 1,
      ready: 1,
      readyBytes: 2 * 1024 ** 3,
    });
  });

  it("sorts active, attention, and ready groups in queue order", () => {
    const tasks = [
      makeTask("ready", {
        status: "Completed",
        localUri: "file:///downloads/ready.mp4",
        offlineVerifiedAt: "2026-06-04T10:05:00.000Z",
      }),
      makeTask("error", { status: "Error" }),
      makeTask("active", { status: "Downloading" }),
    ];

    expect(sortDownloadTasks(tasks).map((task) => task.id)).toEqual([
      "active",
      "error",
      "ready",
    ]);
  });
});
