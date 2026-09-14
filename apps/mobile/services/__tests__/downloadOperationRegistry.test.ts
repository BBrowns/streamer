import {
  DownloadOperationRegistry,
  getDownloadOperationKey,
} from "../downloadOperationRegistry";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("DownloadOperationRegistry", () => {
  it("builds an identity without including source URLs or magnets", () => {
    expect(
      getDownloadOperationKey({
        type: "series",
        id: "show-1",
        season: 2,
        episode: 3,
      }),
    ).toBe(JSON.stringify(["download", "series", "show-1", 2, 3]));
  });

  it("coalesces concurrent preparation for one logical download", async () => {
    const registry = new DownloadOperationRegistry();
    const gate = deferred<string>();
    const operation = jest.fn(() => gate.promise);

    const first = registry.run("movie:tt123:download", operation);
    const second = registry.run("movie:tt123:download", operation);

    expect(second).toBe(first);
    await Promise.resolve();
    expect(operation).toHaveBeenCalledTimes(1);

    gate.resolve("prepared");
    await expect(first).resolves.toBe("prepared");
  });

  it("releases a key after completion so a later retry can run", async () => {
    const registry = new DownloadOperationRegistry();
    const operation = jest
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("first")
      .mockResolvedValueOnce("second");

    await expect(registry.run("movie:tt123:download", operation)).resolves.toBe(
      "first",
    );
    await expect(registry.run("movie:tt123:download", operation)).resolves.toBe(
      "second",
    );
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("does not coalesce different logical downloads", async () => {
    const registry = new DownloadOperationRegistry();
    const operation = jest.fn(async (value: string) => value);

    const first = registry.run("movie:tt123:download", () =>
      operation("first"),
    );
    const second = registry.run("movie:tt456:download", () =>
      operation("second"),
    );

    await expect(first).resolves.toBe("first");
    await expect(second).resolves.toBe("second");
    expect(operation).toHaveBeenCalledTimes(2);
  });
});
