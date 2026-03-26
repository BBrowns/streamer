import { describe, it, expect, vi, beforeEach } from "vitest";
import { TraktService } from "../trakt.service.js";
import type { ITraktClient, ITraktRepository } from "../ports/trakt.ports.js";

describe("TraktService Resilience", () => {
  let traktService: TraktService;
  let mockTraktClient: ITraktClient;
  let mockTraktRepo: ITraktRepository;

  beforeEach(() => {
    mockTraktClient = {
      exchangeCode: vi.fn(),
      refreshTokens: vi.fn(),
      syncWatchHistory: vi.fn(),
      scrobble: vi.fn(),
    } as any;

    mockTraktRepo = {
      findByUser: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      addToQueue: vi.fn(),
      getQueue: vi.fn(),
      updateQueueAttempt: vi.fn(),
      removeFromQueue: vi.fn(),
    } as any;

    traktService = new TraktService(mockTraktClient, mockTraktRepo);
  });

  it("should add to queue if syncWatchProgress fails", async () => {
    vi.mocked(mockTraktRepo.findByUser).mockResolvedValue({
      accessToken: "valid-token",
      refreshToken: "refresh",
      expiresAt: new Date(Date.now() + 3600000),
    });
    vi.mocked(mockTraktClient.syncWatchHistory).mockRejectedValue(
      new Error("Network error"),
    );

    await traktService.syncWatchProgress("user-1", {
      type: "movie",
      itemId: "tt123",
      title: "Movie",
    });

    expect(mockTraktRepo.addToQueue).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        title: "Movie",
        type: "movie",
      }),
    );
  });

  it("should call traktClient.scrobble", async () => {
    vi.mocked(mockTraktRepo.findByUser).mockResolvedValue({
      accessToken: "valid-token",
      refreshToken: "refresh",
      expiresAt: new Date(Date.now() + 3600000),
    });

    await traktService.scrobble("user-1", "start", {
      type: "movie",
      itemId: "tt123",
      title: "Movie",
      progress: 50,
    });

    expect(mockTraktClient.scrobble).toHaveBeenCalledWith(
      "valid-token",
      "start",
      expect.objectContaining({
        title: "Movie",
        progress: 50,
      }),
    );
  });

  it("should process items in queue and remove on success", async () => {
    const queueItem = {
      id: "q1",
      userId: "user-1",
      type: "movie" as const,
      imdbId: "tt123",
      title: "Movie",
      watchedAt: new Date(),
      attempts: 0,
    };
    vi.mocked(mockTraktRepo.getQueue).mockResolvedValue([queueItem]);
    vi.mocked(mockTraktRepo.findByUser).mockResolvedValue({
      accessToken: "valid-token",
      refreshToken: "refresh",
      expiresAt: new Date(Date.now() + 3600000),
    });
    vi.mocked(mockTraktClient.syncWatchHistory).mockResolvedValue();

    await traktService.processQueue();

    expect(mockTraktClient.syncWatchHistory).toHaveBeenCalled();
    expect(mockTraktRepo.removeFromQueue).toHaveBeenCalledWith("q1");
  });

  it("should increment attempts if processing fails", async () => {
    const queueItem = {
      id: "q1",
      userId: "user-1",
      type: "movie" as const,
      imdbId: "tt123",
      title: "Movie",
      watchedAt: new Date(),
      attempts: 0,
    };
    vi.mocked(mockTraktRepo.getQueue).mockResolvedValue([queueItem]);
    vi.mocked(mockTraktRepo.findByUser).mockResolvedValue({
      accessToken: "valid-token",
      refreshToken: "refresh",
      expiresAt: new Date(Date.now() + 3600000),
    });
    vi.mocked(mockTraktClient.syncWatchHistory).mockRejectedValue(
      new Error("API Down"),
    );

    await traktService.processQueue();

    expect(mockTraktRepo.updateQueueAttempt).toHaveBeenCalledWith(
      "q1",
      "API Down",
    );
    expect(mockTraktRepo.removeFromQueue).not.toHaveBeenCalled();
  });

  it("should remove item if max attempts exceeded", async () => {
    const queueItem = {
      id: "q1",
      userId: "user-1",
      type: "movie" as const,
      imdbId: "tt123",
      title: "Movie",
      watchedAt: new Date(),
      attempts: 5,
    };
    vi.mocked(mockTraktRepo.getQueue).mockResolvedValue([queueItem]);

    await traktService.processQueue();

    expect(mockTraktRepo.removeFromQueue).toHaveBeenCalledWith("q1");
    expect(mockTraktClient.syncWatchHistory).not.toHaveBeenCalled();
  });
});
