import {
  isTaskOfflinePlayable,
  migrateDownloadTasks,
  sanitizeDownloadTaskForPersistence,
  useDownloadStore,
} from "../downloadStore";

describe("downloadStore", () => {
  beforeEach(() => {
    useDownloadStore.getState().clearAll();
  });

  afterEach(() => {
    useDownloadStore.getState().clearAll();
  });

  it("updates a prepared task with the resolved download URL", () => {
    const store = useDownloadStore.getState();
    const playbackSession = {
      sessionId: "00000000-0000-4000-8000-000000000001",
      candidateId: "00000000-0000-4000-8000-000000000002",
      attemptId: "00000000-0000-4000-8000-000000000003",
    };

    store.addTask(
      "source-1",
      {
        type: "movie",
        itemId: "tt123",
        title: "Example Movie",
        downloadUrl: "",
        sourceId: "source-1",
      },
      playbackSession,
    );
    store.setStatus("source-1", "Preparing");
    store.setDownloadUrl("source-1", "https://cdn.example.test/movie.mp4");

    expect(useDownloadStore.getState().tasks["source-1"]).toMatchObject({
      status: "Preparing",
      mediaInfo: {
        downloadUrl: "https://cdn.example.test/movie.mp4",
      },
      playbackSession,
    });
  });

  it("does not treat a completed task as offline-playable until verified", () => {
    const store = useDownloadStore.getState();
    store.addTask("source-1", {
      type: "movie",
      itemId: "tt123",
      title: "Example Movie",
      downloadUrl: "https://cdn.example.test/movie.mp4",
      sourceId: "source-1",
    });
    store.setStatus("source-1", "Completed", "file:///downloads/movie.mp4");

    expect(store.isDownloaded("source-1")).toBe(false);
    expect(
      isTaskOfflinePlayable(useDownloadStore.getState().tasks["source-1"]),
    ).toBe(false);

    store.markVerified(
      "source-1",
      "file:///downloads/movie.mp4",
      2 * 1024 ** 2,
    );

    expect(useDownloadStore.getState().isDownloaded("source-1")).toBe(true);
    expect(
      useDownloadStore.getState().tasks["source-1"].offlineVerifiedAt,
    ).toBeTruthy();
  });

  it("clears offline verification when a local file goes missing", () => {
    const store = useDownloadStore.getState();
    store.addTask("source-1", {
      type: "movie",
      itemId: "tt123",
      title: "Example Movie",
      downloadUrl: "https://cdn.example.test/movie.mp4",
      sourceId: "source-1",
    });
    store.markVerified(
      "source-1",
      "file:///downloads/movie.mp4",
      2 * 1024 ** 2,
    );

    store.markFileMissing("source-1", "Downloaded file could not be found.");

    expect(useDownloadStore.getState().tasks["source-1"]).toMatchObject({
      status: "Error",
      error: "Downloaded file could not be found.",
      offlineVerifiedAt: undefined,
    });
    expect(useDownloadStore.getState().isDownloaded("source-1")).toBe(false);
  });

  it("defensively refuses to mark a 206 KB file verified", () => {
    const store = useDownloadStore.getState();
    store.addTask("source-1", {
      type: "movie",
      itemId: "tt123",
      title: "Example Movie",
      downloadUrl: "https://cdn.example.test/movie.mp4",
      sourceId: "source-1",
    });

    store.markVerified(
      "source-1",
      "file:///downloads/placeholder.mp4",
      206 * 1024,
    );

    expect(useDownloadStore.getState().tasks["source-1"]).toMatchObject({
      status: "Error",
      failureReason: "invalid_media",
      verificationState: "incomplete",
      playableState: "unplayable",
      offlineVerifiedAt: undefined,
    });
    expect(useDownloadStore.getState().isDownloaded("source-1")).toBe(false);
  });

  it("stores only a typed failure reason for recovery presentation", () => {
    const store = useDownloadStore.getState();
    store.addTask("source-1", {
      type: "movie",
      itemId: "tt123",
      title: "Example Movie",
      sourceId: "source-1",
    });

    store.markFailed(
      "source-1",
      "The desktop bridge is unavailable.",
      "bridge_unavailable",
    );

    expect(useDownloadStore.getState().tasks["source-1"]).toMatchObject({
      status: "Error",
      failureReason: "bridge_unavailable",
      offlineVerifiedAt: undefined,
    });
  });

  it("requires old persisted completions to be verified after migration", () => {
    const migrated = migrateDownloadTasks({
      tasks: {
        "source-1": {
          id: "source-1",
          mediaInfo: {
            type: "movie",
            itemId: "tt123",
            title: "Example Movie",
            downloadUrl: "https://cdn.example.test/movie.mp4",
          },
          localUri: "file:///downloads/movie.mp4",
          progress: 1,
          status: "Completed",
          totalBytesWritten: 1000,
          totalBytesExpectedToWrite: 1000,
        },
      },
    });

    expect(migrated?.tasks?.["source-1"]).toMatchObject({
      status: "Completed",
      offlineVerifiedAt: undefined,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  });

  it("requires legacy verification markers to pass the stricter v5 checks", () => {
    const migrated = migrateDownloadTasks(
      {
        tasks: {
          "source-1": {
            id: "source-1",
            mediaInfo: {
              type: "movie",
              itemId: "tt123",
              title: "Example Movie",
              downloadUrl: "https://cdn.example.test/movie.mp4",
            },
            localUri: "file:///downloads/movie.mp4",
            progress: 1,
            status: "Completed",
            totalBytesWritten: 1000,
            totalBytesExpectedToWrite: 1000,
            createdAt: "2026-06-04T10:00:00.000Z",
            updatedAt: "2026-06-04T10:05:00.000Z",
            offlineVerifiedAt: "2026-06-04T10:05:00.000Z",
          },
        },
      },
      2,
    );

    expect(migrated?.tasks?.["source-1"]).toMatchObject({
      offlineVerifiedAt: undefined,
      verifiedFileSizeBytes: undefined,
      verificationState: "pending",
      playableState: "unknown",
    });
  });

  it("never migrates a 206 KB response into an offline-playable item", () => {
    const migrated = migrateDownloadTasks(
      {
        tasks: {
          "source-1": {
            id: "source-1",
            mediaInfo: {
              type: "movie",
              itemId: "tt123",
              title: "Example Movie",
              downloadUrl: "",
            },
            localUri: "file:///downloads/error-response.mp4",
            progress: 1,
            status: "Completed",
            downloadedBytes: 206 * 1024,
            metadataBytes: 206 * 1024,
            expectedMediaBytes: 206 * 1024,
            verifiedFileSizeBytes: 206 * 1024,
            verificationState: "verified",
            playableState: "playable",
            offlineVerifiedAt: "2026-06-04T10:05:00.000Z",
            createdAt: "2026-06-04T10:00:00.000Z",
            updatedAt: "2026-06-04T10:05:00.000Z",
          },
        },
      },
      5,
    );

    expect(isTaskOfflinePlayable(migrated?.tasks?.["source-1"])).toBe(false);
  });

  it("strips sensitive download runtime data during migration", () => {
    const migrated = migrateDownloadTasks(
      {
        tasks: {
          "https://signed.example.test/movie.mp4?token=secret": {
            id: "https://signed.example.test/movie.mp4?token=secret",
            mediaInfo: {
              type: "movie",
              itemId: "tt123",
              title: "Example Movie",
              downloadUrl: "https://signed.example.test/movie.mp4?token=secret",
            },
            resumeData: JSON.stringify({
              url: "https://signed.example.test/movie.mp4?token=secret",
            }),
            originalStream: {
              url: "https://signed.example.test/movie.mp4?token=secret",
            },
            localUri: "file:///downloads/movie.mp4",
            progress: 0.5,
            status: "Paused",
            totalBytesWritten: 500,
            totalBytesExpectedToWrite: 1000,
          },
        },
      },
      2,
    );

    const task = Object.values(migrated?.tasks ?? {})[0];
    expect(Object.keys(migrated?.tasks ?? {})[0]).not.toContain("https://");
    expect(task).toMatchObject({
      mediaInfo: {
        downloadUrl: "",
      },
      replanContext: {
        type: "movie",
        id: "tt123",
      },
    });
    expect(task?.resumeData).toBeUndefined();
    expect(task?.originalStream).toBeUndefined();
  });

  it("strips sensitive runtime fields before persistence", () => {
    const safeTask = sanitizeDownloadTaskForPersistence({
      id: "source-1",
      mediaInfo: {
        type: "movie",
        itemId: "tt123",
        title: "Example Movie",
        downloadUrl: "https://signed.example.test/movie.mp4?token=secret",
      },
      resumeData: JSON.stringify({
        url: "https://signed.example.test/movie.mp4?token=secret",
      }),
      originalStream: {
        url: "https://signed.example.test/movie.mp4?token=secret",
      },
      progress: 0.5,
      status: "Paused",
      downloadedBytes: 500,
      metadataBytes: 0,
      expectedMediaBytes: 1000,
      verificationState: "pending",
      playableState: "unknown",
      createdAt: "2026-06-04T10:00:00.000Z",
      updatedAt: "2026-06-04T10:05:00.000Z",
    });

    expect(safeTask.mediaInfo.downloadUrl).toBe("");
    expect("resumeData" in safeTask).toBe(false);
    expect("originalStream" in safeTask).toBe(false);
    expect(safeTask.replanContext).toMatchObject({
      type: "movie",
      id: "tt123",
    });
  });

  it("keeps catalog estimates separate from replaceable transport lengths", () => {
    const store = useDownloadStore.getState();
    store.addTask("source-size", {
      type: "movie",
      itemId: "tt-size",
      title: "Sized Movie",
    });
    store.setDownloadMetadata("source-size", {
      metadataBytes: 2 * 1024 ** 3,
    });
    store.setDownloadMetadata("source-size", {
      metadataBytes: 0,
    });
    store.setDownloadMetadata("source-size", {
      metadataBytes: undefined,
    });
    store.updateProgress("source-size", 0.5, 1_000_000_000, 2_000_000_000);
    store.setDownloadMetadata("source-size", {
      expectedMediaBytes: 1_999_999_999,
    });
    store.setDownloadMetadata("source-size", {
      expectedMediaBytes: undefined,
    });

    expect(useDownloadStore.getState().tasks["source-size"]).toMatchObject({
      metadataBytes: 2 * 1024 ** 3,
      expectedMediaBytes: 1_999_999_999,
    });
  });
});
