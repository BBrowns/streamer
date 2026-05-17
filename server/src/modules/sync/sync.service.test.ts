import { describe, it, expect, vi, beforeEach } from "vitest";
import { syncService } from "./sync.service.js";

describe("SyncService", () => {
  const userId = "user-123";
  const device1 = "device-1";
  const device2 = "device-2";

  const mockWS1 = { send: vi.fn() } as any;
  const mockWS2 = { send: vi.fn() } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    // @ts-ignore: reset private connections for test isolation
    syncService.connections.clear();
  });

  it("should register and broadcast to all user connections", () => {
    syncService.addConnection(userId, {
      id: "c1",
      deviceId: device1,
      ws: mockWS1,
    });
    syncService.addConnection(userId, {
      id: "c2",
      deviceId: device2,
      ws: mockWS2,
    });

    const payload = { test: "data" };
    syncService.broadcast(userId, "test_event", payload);

    expect(mockWS1.send).toHaveBeenCalledWith(
      JSON.stringify({ event: "test_event", data: payload }),
    );
    expect(mockWS2.send).toHaveBeenCalledWith(
      JSON.stringify({ event: "test_event", data: payload }),
    );
  });

  it("should skip a specific device during broadcast", () => {
    syncService.addConnection(userId, {
      id: "c1",
      deviceId: device1,
      ws: mockWS1,
    });
    syncService.addConnection(userId, {
      id: "c2",
      deviceId: device2,
      ws: mockWS2,
    });

    syncService.broadcast(userId, "update", { foo: "bar" }, device1);

    expect(mockWS1.send).not.toHaveBeenCalled();
    expect(mockWS2.send).toHaveBeenCalled();
  });

  it("should send to a specific device", () => {
    syncService.addConnection(userId, {
      id: "c1",
      deviceId: device1,
      ws: mockWS1,
    });
    syncService.addConnection(userId, {
      id: "c2",
      deviceId: device2,
      ws: mockWS2,
    });

    syncService.sendToDevice(userId, device2, "private", { secret: 42 });

    expect(mockWS1.send).not.toHaveBeenCalled();
    expect(mockWS2.send).toHaveBeenCalledWith(
      JSON.stringify({ event: "private", data: { secret: 42 } }),
    );
  });

  it("should remove connections correctly", () => {
    syncService.addConnection(userId, {
      id: "c1",
      deviceId: device1,
      ws: mockWS1,
    });
    syncService.removeConnection(userId, "c1");

    syncService.broadcast(userId, "lost", {});
    expect(mockWS1.send).not.toHaveBeenCalled();
  });
});
