import WebTorrent from "webtorrent";
const client = new WebTorrent({ dht: true });
const hash = "eb2cfe8a13bb3cde1316f5a506cd089904d3e817";
// Testing with HTTP trackers instead of UDP
let magnet = `magnet:?xt=urn:btih:${hash}&tr=http%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce&tr=udp%3A%2F%2Ftracker.openbittorrent.com%3A6969%2Fannounce`;
console.log("Adding torrent...");
const t = client.add(magnet);
t.on("warning", (err) => console.log("Warn:", err.message));
t.on("wire", () => console.log("Wire connected, total peers:", t.numPeers));
setTimeout(() => { console.log("10s passed. Peers:", t.numPeers); process.exit(0); }, 10000);
