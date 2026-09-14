/** Process-local ownership. Keys and source objects never leave this module. */
const operations = new Map<string, Promise<unknown>>();
const consumers = new WeakMap<object, number>();

function identity(value: string) {
  const hash = decodeURIComponent(
    value.match(/btih:([^&]+)/i)?.[1] ?? value,
  ).toLowerCase();
  if (!/^[a-z2-7]{32}$/.test(hash)) return hash;
  let bits = 0,
    accumulator = 0;
  const bytes: number[] = [];
  for (const char of hash) {
    accumulator =
      (accumulator << 5) | "abcdefghijklmnopqrstuvwxyz234567".indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((accumulator >>> bits) & 255);
    }
  }
  return Buffer.from(bytes).toString("hex");
}

/** Queue add/remove for one torrent, including async cache cleanup. */
export function withTorrentOperation<T>(
  source: string,
  operation: () => Promise<T>,
): Promise<T> {
  const key = identity(source);
  const next = (operations.get(key) ?? Promise.resolve())
    .catch(() => undefined)
    .then(operation);
  operations.set(key, next);
  void next
    .finally(() => {
      if (operations.get(key) === next) operations.delete(key);
    })
    .catch(() => undefined);
  return next;
}

export function retainTorrentConsumer(torrent: object) {
  consumers.set(torrent, (consumers.get(torrent) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const remaining = (consumers.get(torrent) ?? 1) - 1;
    if (remaining > 0) consumers.set(torrent, remaining);
    else consumers.delete(torrent);
  };
}

export function hasTorrentConsumers(torrent: object) {
  return (consumers.get(torrent) ?? 0) > 0;
}
