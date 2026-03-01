import { getClient } from './torrent.js';

export async function getStats() {
    const client = await getClient();
    let speed = client.downloadSpeed;
    let peers = 0;

    client.torrents.forEach((torrent: any) => {
        peers += torrent.numPeers;
    });

    return {
        speed,
        peers
    };
}
