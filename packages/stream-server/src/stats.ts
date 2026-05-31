import { getClient } from "./torrent.js";

export async function getStats() {
  let client;
  try {
    client = await getClient();
  } catch (err: any) {
    return {
      speed: 0,
      peers: 0,
      available: false,
      error: err?.message ?? "Torrent engine unavailable",
    };
  }

  let speed = client.downloadSpeed;
  let peers = 0;

  client.torrents.forEach((torrent: any) => {
    peers += torrent.numPeers;
  });

  return {
    speed,
    peers,
    available: true,
  };
}
