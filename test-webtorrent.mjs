import WebTorrent from "webtorrent";
const client = new WebTorrent();
const hash = "70d301b27695d50c48235dc31708011cd47f76f6";
let magnet = `magnet:?xt=urn:btih:${hash}&tr=udp://tracker.opentrackr.org:1337/announce`;
const t = client.add(magnet, { announce: ["wss://tracker.openwebtorrent.com"] });
console.log(t.announce);
process.exit(0);
