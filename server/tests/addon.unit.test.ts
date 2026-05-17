import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import axios from "axios";
import { AddonService } from "../src/modules/addon/addon.service.js";
import { AppError } from "../src/middleware/error.middleware.js";

// Mock axios
vi.mock("axios");

// Mock Prisma
vi.mock("../src/prisma/client.js", () => ({
  prisma: {
    installedAddon: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

// Mock logger
vi.mock("../src/config/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock security
vi.mock("../src/utils/security.js", () => ({
  validateSafeUrl: vi.fn().mockResolvedValue(true),
}));

const { prisma } = await import("../src/prisma/client.js");

describe("AddonService", () => {
  let service: AddonService;

  beforeEach(() => {
    service = new AddonService();
    vi.clearAllMocks();
  });

  describe("list", () => {
    it("should trigger revalidate if manifest is stale", async () => {
      const staleDate = new Date(Date.now() - 13 * 60 * 60 * 1000); // 13 hours ago
      const mockAddon = {
        id: "addon-1",
        userId: "user-1",
        transportUrl: "http://example.com/manifest.json",
        manifest: { id: "test-addon", name: "Test" },
        installedAt: new Date(),
        lastValidatedAt: staleDate,
      };

      (prisma.installedAddon.findMany as Mock).mockResolvedValue([mockAddon]);
      (prisma.installedAddon.findUnique as Mock).mockResolvedValue(mockAddon);
      (axios.get as Mock).mockResolvedValue({
        data: {
          id: "test-addon",
          name: "Updated Test",
          version: "1.0.0",
          description: "Updated desc",
          resources: ["stream"],
          types: ["movie"],
          catalogs: [],
        },
      });

      // We need to wait for background revalidate or mock it
      const revalidateSpy = vi.spyOn(service, "revalidate");

      const result = await service.list("user-1");

      expect(result.length).toBe(1);
      expect(revalidateSpy).toHaveBeenCalledWith("addon-1");
    });

    it("should NOT trigger revalidate if manifest is fresh", async () => {
      const freshDate = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1 hour ago
      const mockAddon = {
        id: "addon-1",
        userId: "user-1",
        transportUrl: "http://example.com/manifest.json",
        manifest: { id: "test-addon", name: "Test" },
        installedAt: new Date(),
        lastValidatedAt: freshDate,
      };

      (prisma.installedAddon.findMany as Mock).mockResolvedValue([mockAddon]);
      const revalidateSpy = vi.spyOn(service, "revalidate");

      await service.list("user-1");

      expect(revalidateSpy).not.toHaveBeenCalled();
    });
  });

  describe("revalidate", () => {
    it("should update manifest and lastValidatedAt on success", async () => {
      const mockAddon = {
        id: "addon-1",
        transportUrl: "http://example.com/manifest.json",
      };

      (prisma.installedAddon.findUnique as Mock).mockResolvedValue(mockAddon);
      (axios.get as Mock).mockResolvedValue({
        data: {
          id: "test",
          name: "Updated",
          version: "1.1.0",
          description: "Updated desc",
          resources: ["stream"],
          types: ["movie"],
          catalogs: [],
        },
      });

      await service.revalidate("addon-1");

      expect(prisma.installedAddon.update).toHaveBeenCalledWith({
        where: { id: "addon-1" },
        data: {
          manifest: expect.any(Object),
          lastValidatedAt: expect.any(Date),
        },
      });
    });

    it("should update lastValidatedAt even on fetch failure to prevent hammering", async () => {
      const mockAddon = {
        id: "addon-1",
        transportUrl: "http://example.com/manifest.json",
      };

      (prisma.installedAddon.findUnique as Mock).mockResolvedValue(mockAddon);
      (axios.get as Mock).mockRejectedValue(new Error("Network Error"));

      await expect(service.revalidate("addon-1")).rejects.toThrow(
        "Could not reach add-on",
      );

      expect(prisma.installedAddon.update).toHaveBeenCalledWith({
        where: { id: "addon-1" },
        data: {
          lastValidatedAt: expect.any(Date),
        },
      });
    });
  });
});
