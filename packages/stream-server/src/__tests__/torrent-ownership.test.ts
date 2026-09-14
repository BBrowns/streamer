import { describe, expect, it } from "vitest";
import {
  hasTorrentConsumers,
  retainTorrentConsumer,
  withTorrentOperation,
} from "../torrent-ownership.js";

describe("torrent runtime ownership", () => {
  it("does not release another consumer when a job is cancelled twice", () => {
    const torrent = {};
    const first = retainTorrentConsumer(torrent),
      second = retainTorrentConsumer(torrent);
    first();
    first();
    expect(hasTorrentConsumers(torrent)).toBe(true);
    second();
    expect(hasTorrentConsumers(torrent)).toBe(false);
  });
  it("serializes removal and subsequent add including cache cleanup", async () => {
    let finish!: () => void;
    const order: string[] = [];
    const first = withTorrentOperation("a".repeat(40), async () => {
      order.push("removing");
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      order.push("removed");
    });
    const second = withTorrentOperation(
      `magnet:?xt=urn:btih:${"a".repeat(40)}&tr=ignored`,
      async () => {
        order.push("added");
      },
    );
    await new Promise((resolve) => setImmediate(resolve));
    expect(order).toEqual(["removing"]);
    finish();
    await Promise.all([first, second]);
    expect(order).toEqual(["removing", "removed", "added"]);
  });
  it("does not let a failed operation poison future preparation", async () => {
    await expect(
      withTorrentOperation("identity", async () => {
        throw new Error("failure");
      }),
    ).rejects.toThrow("failure");
    await expect(
      withTorrentOperation("identity", async () => "ready"),
    ).resolves.toBe("ready");
  });
});
