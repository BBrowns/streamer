import { afterEach, describe, expect, it } from "vitest";
import {
  __setCastDevicesForTests,
  getBridgeCastDeviceSnapshot,
} from "../cast.js";

describe("bridge v1 cast device identity", () => {
  afterEach(() => {
    __setCastDevicesForTests([]);
  });

  it("returns only opaque process-local ids", () => {
    const opaqueId = "00000000-0000-4000-8000-000000000091";
    __setCastDevicesForTests([
      {
        bridgeV1Id: opaqueId,
        host: "192.168.1.75",
        port: 8009,
        name: "Living room",
      },
    ]);

    const devices = getBridgeCastDeviceSnapshot();

    expect(devices).toEqual([
      {
        id: opaqueId,
        name: "Living room",
        type: "chromecast",
      },
    ]);
    expect(JSON.stringify(devices)).not.toContain("192.168.1.75");
    expect(JSON.stringify(devices)).not.toContain("8009");
  });
});
