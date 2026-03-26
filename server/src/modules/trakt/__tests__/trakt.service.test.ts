import { describe, it, expect, vi, beforeEach } from "vitest";
import { TraktService } from "../trakt.service.js";
import type { ITraktClient, ITraktRepository } from "../ports/trakt.ports.js";

describe("TraktService", () => {
  let traktService: TraktService;
  let mockClient: any;
  let mockRepo: any;

  beforeEach(() => {
    mockClient = {
      exchangeCode: vi.fn(),
      refreshTokens: vi.fn(),
      syncWatchHistory: vi.fn(),
      getWatchlist: vi.fn(),
    } as any;

    mockRepo = {
      findByUser: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    } as any;

    traktService = new TraktService(mockClient, mockRepo);
  });

  it("should sync watch progress if user has valid token", async () => {
    mockRepo.findByUser.mockResolvedValue({
      accessToken: "valid-token",
      refreshToken: "refresh",
      expiresAt: new Date(Date.now() + 3600000),
    });

    await traktService.syncWatchProgress("user-1", {
      type: "movie",
      itemId: "tt1234567",
      title: "Test Movie",
    });

    expect(mockClient.syncWatchHistory).toHaveBeenCalledWith(
      "valid-token",
      expect.arrayContaining([
        expect.objectContaining({
          imdbId: "tt1234567",
          title: "Test Movie",
        }),
      ]),
    );
  });

  it("should refresh tokens if expired", async () => {
    mockRepo.findByUser.mockResolvedValue({
      accessToken: "old-token",
      refreshToken: "refresh",
      expiresAt: new Date(Date.now() - 1000), // Expired
    });

    mockClient.refreshTokens.mockResolvedValue({
      accessToken: "new-token",
      refreshToken: "new-refresh",
      expiresAt: new Date(Date.now() + 3600000),
    });

    const token = await traktService.getValidToken("user-1");

    expect(mockClient.refreshTokens).toHaveBeenCalledWith("refresh");
    expect(mockRepo.upsert).toHaveBeenCalled();
    expect(token).toBe("new-token");
  });

  it("should not sync if user has no Trakt token", async () => {
    mockRepo.findByUser.mockResolvedValue(null);

    await traktService.syncWatchProgress("user-1", {
      type: "movie",
      itemId: "tt1234567",
      title: "Test Movie",
    });

    expect(mockClient.syncWatchHistory).not.toHaveBeenCalled();
  });
});
