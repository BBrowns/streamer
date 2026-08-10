import type { BridgeJobV1 } from "@streamer/shared";
import { bindBridgeV1StreamUri } from "../BridgeV1StreamGuard";

const JOB_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_JOB_ID = "22222222-2222-4222-8222-222222222222";
const EXPIRES = 4_102_444_800_000;

function job(path: string, expiresAt = "2100-01-01T00:00:00.000Z") {
  return {
    id: JOB_ID,
    state: "ready",
    phase: "ready",
    delivery: "range-http",
    peerCount: 1,
    readinessProgress: 1,
    elapsedMs: 100,
    readyTimeoutMs: 45_000,
    media: {
      container: "mp4",
      remuxed: false,
      seek: "immediate",
    },
    stream: { path, expiresAt },
  } satisfies BridgeJobV1;
}

describe("bindBridgeV1StreamUri", () => {
  it("binds the exact signed job path to the approved runtime origin", () => {
    expect(
      bindBridgeV1StreamUri({
        baseOrigin: "http://192.168.1.25:11470",
        job: job(
          `/api/bridge/v1/jobs/${JOB_ID}/stream?expires=${EXPIRES}&signature=signed`,
        ),
        now: 1_000,
      }),
    ).toBe(
      `http://192.168.1.25:11470/api/bridge/v1/jobs/${JOB_ID}/stream?expires=${EXPIRES}&signature=signed`,
    );
  });

  it.each([
    `//other.test/api/bridge/v1/jobs/${JOB_ID}/stream?expires=${EXPIRES}&signature=signed`,
    `/api/bridge/v1/jobs/${OTHER_JOB_ID}/stream?expires=${EXPIRES}&signature=signed`,
    `/api/bridge/v1/jobs/${JOB_ID}/stream?expires=${EXPIRES}&expires=${EXPIRES}&signature=signed`,
    `/api/bridge/v1/jobs/${JOB_ID}/stream?expires=${EXPIRES}&signature=signed&source=private`,
    `/api/bridge/v1/jobs/${JOB_ID}/stream?expires=${EXPIRES}&signature=`,
  ])("rejects an unbound or ambiguous signed path", (path) => {
    expect(() =>
      bindBridgeV1StreamUri({
        baseOrigin: "http://192.168.1.25:11470",
        job: job(path),
        now: 1_000,
      }),
    ).toThrow("invalid stream path");
  });

  it("rejects an expired path even when its signature fields are present", () => {
    expect(() =>
      bindBridgeV1StreamUri({
        baseOrigin: "http://192.168.1.25:11470",
        job: job(
          `/api/bridge/v1/jobs/${JOB_ID}/stream?expires=1000&signature=signed`,
          "1970-01-01T00:00:01.000Z",
        ),
        now: 1_001,
      }),
    ).toThrow("invalid stream path");
  });
});
