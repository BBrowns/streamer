import { confirmMediaSeek, SeekSupersededError } from "../ConfirmedMediaSeek";

describe("confirmMediaSeek", () => {
  it("does not treat a seek discontinuity as confirmation before the target is buffered", async () => {
    let bufferedRanges = [{ start: 0, end: 12 }];
    let currentTime = 0;
    const seek = confirmMediaSeek({
      target: 90,
      request: () => {
        currentTime = 90;
      },
      observe: () => ({ currentTime, status: "ready", bufferedRanges }),
      isCurrent: () => true,
      timeoutMs: 1_000,
      pollIntervalMs: 5,
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    let settled = false;
    void seek.then(() => {
      settled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(settled).toBe(false);

    bufferedRanges = [{ start: 89.5, end: 95 }];
    await expect(seek).resolves.toBe(90);
  });

  it("confirms an exact VOD endpoint when the player has reached its duration", async () => {
    const seek = confirmMediaSeek({
      target: 120,
      request: () => undefined,
      observe: () => ({
        currentTime: 120,
        duration: 120,
        status: "ready",
        bufferedRanges: [],
      }),
      isCurrent: () => true,
      timeoutMs: 30,
      pollIntervalMs: 5,
    });

    await expect(seek).resolves.toBe(120);
  });

  it("still requires loaded media when seeking before the VOD endpoint", async () => {
    const seek = confirmMediaSeek({
      target: 90,
      request: () => undefined,
      observe: () => ({
        currentTime: 90,
        duration: 120,
        status: "ready",
        bufferedRanges: [],
      }),
      isCurrent: () => true,
      timeoutMs: 20,
      pollIntervalMs: 5,
    });

    await expect(seek).rejects.toThrow("Timed out");
  });

  it("rejects a late result after a newer seek or source takes ownership", async () => {
    let current = true;
    const seek = confirmMediaSeek({
      target: 30,
      request: () => undefined,
      observe: () => ({
        currentTime: 30,
        status: "ready",
        bufferedRanges: [],
      }),
      isCurrent: () => current,
      timeoutMs: 1_000,
      pollIntervalMs: 10,
    });
    current = false;
    await expect(seek).rejects.toBeInstanceOf(SeekSupersededError);
  });

  it("cancels when its caller aborts", async () => {
    const controller = new AbortController();
    const seek = confirmMediaSeek({
      target: 30,
      request: () => undefined,
      observe: () => ({ currentTime: 0, status: "ready", bufferedRanges: [] }),
      isCurrent: () => true,
      signal: controller.signal,
      timeoutMs: 1_000,
    });
    controller.abort();
    await expect(seek).rejects.toMatchObject({ name: "AbortError" });
  });
});
