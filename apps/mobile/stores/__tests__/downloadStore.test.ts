import { useDownloadStore } from "../downloadStore";

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
});
