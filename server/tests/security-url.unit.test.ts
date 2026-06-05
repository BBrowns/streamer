import axios from "axios";
import dns from "dns/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validateSafeUrl } from "../src/utils/security.js";
import { AddonService } from "../src/modules/addon/addon.service.js";

vi.mock("dns/promises", () => ({
  default: {
    lookup: vi.fn(),
  },
  lookup: vi.fn(),
}));

vi.mock("axios", () => ({
  default: {
    get: vi.fn(),
  },
}));

vi.mock("../src/prisma/client.js", () => ({
  prisma: {
    installedAddon: {
      findUnique: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("../src/config/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const lookup = vi.mocked(dns.lookup);
const axiosGet = vi.mocked(axios.get);
const previousAllowPrivate = process.env.ADDON_ALLOW_PRIVATE_NETWORKS;

describe("validateSafeUrl", () => {
  beforeEach(() => {
    delete process.env.ADDON_ALLOW_PRIVATE_NETWORKS;
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (previousAllowPrivate === undefined) {
      delete process.env.ADDON_ALLOW_PRIVATE_NETWORKS;
    } else {
      process.env.ADDON_ALLOW_PRIVATE_NETWORKS = previousAllowPrivate;
    }
  });

  it("blocks metadata, loopback, and LAN IP literals by default", async () => {
    await expect(
      validateSafeUrl("https://169.254.169.254/manifest.json"),
    ).rejects.toThrow("SSRF Blocked");
    await expect(
      validateSafeUrl("https://127.0.0.1/manifest.json"),
    ).rejects.toThrow("SSRF Blocked");
    await expect(
      validateSafeUrl("https://192.168.1.10/manifest.json"),
    ).rejects.toThrow("SSRF Blocked");
  });

  it("blocks hostnames when any resolved address is private", async () => {
    lookup.mockResolvedValueOnce([
      { address: "203.0.113.10", family: 4 },
      { address: "10.0.0.8", family: 4 },
    ] as any);

    await expect(
      validateSafeUrl("https://addon.example.test/manifest.json"),
    ).rejects.toThrow("SSRF Blocked");
  });

  it("requires HTTPS unless explicitly allowed for local development tests", async () => {
    await expect(
      validateSafeUrl("http://example.com/manifest.json"),
    ).rejects.toThrow("HTTPS required");

    lookup.mockResolvedValueOnce([
      { address: "93.184.216.34", family: 4 },
    ] as any);
    await expect(
      validateSafeUrl("http://example.com/manifest.json", {
        allowHttp: true,
      }),
    ).resolves.toBeUndefined();
  });

  it("allows local network targets only with explicit opt-in", async () => {
    await expect(
      validateSafeUrl("http://localhost:8080/manifest.json", {
        allowHttp: true,
      }),
    ).rejects.toThrow("local hostname");

    await expect(
      validateSafeUrl("http://localhost:8080/manifest.json", {
        allowHttp: true,
        allowPrivateNetworks: true,
      }),
    ).resolves.toBeUndefined();
  });

  it("does not let the private add-on opt-in allow public HTTP add-ons", async () => {
    process.env.ADDON_ALLOW_PRIVATE_NETWORKS = "true";
    lookup.mockResolvedValueOnce([
      { address: "93.184.216.34", family: 4 },
    ] as any);

    await expect(
      validateSafeUrl("http://example.com/manifest.json"),
    ).rejects.toThrow("HTTPS required");
  });
});

describe("AddonService fetchManifest trust boundary", () => {
  beforeEach(() => {
    delete process.env.ADDON_ALLOW_PRIVATE_NETWORKS;
    vi.clearAllMocks();
    lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as any);
  });

  it("validates every redirect target instead of blindly following redirects", async () => {
    axiosGet.mockResolvedValueOnce({
      status: 302,
      headers: { location: "http://169.254.169.254/manifest.json" },
      data: "",
    });

    const service = new AddonService();

    await expect(
      service.fetchManifest("https://addon.example.test/manifest.json"),
    ).rejects.toThrow("Could not reach add-on");
    expect(axiosGet).toHaveBeenCalledTimes(1);
  });

  it("accepts a same-origin safe redirect to a valid manifest", async () => {
    axiosGet
      .mockResolvedValueOnce({
        status: 302,
        headers: { location: "/real-manifest.json" },
        data: "",
      })
      .mockResolvedValueOnce({
        status: 200,
        headers: {},
        data: {
          id: "safe.addon",
          version: "1.0.0",
          name: "Safe Addon",
          description: "Safe test add-on",
          resources: ["catalog"],
          types: ["movie"],
          catalogs: [{ type: "movie", id: "top", name: "Top" }],
        },
      });

    const service = new AddonService();
    const manifest = await service.fetchManifest(
      "https://addon.example.test/manifest.json",
    );

    expect(manifest.id).toBe("safe.addon");
    expect(axiosGet).toHaveBeenCalledTimes(2);
    expect(axiosGet).toHaveBeenNthCalledWith(
      2,
      "https://addon.example.test/real-manifest.json",
      expect.objectContaining({ maxRedirects: 0 }),
    );
  });
});
