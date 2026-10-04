const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const FIXTURE_PORT = 18777;
const FIXTURE_ROOT = path.join(__dirname, "fixtures", "title-wide");
const requestedPaths = [];
let server;

function resolveFixture(pathname) {
  if (pathname === "/index.m3u8") {
    return {
      filePath: path.join(FIXTURE_ROOT, "index.m3u8"),
      type: "application/vnd.apple.mpegurl",
    };
  }
  if (pathname === "/init.mp4") {
    return { filePath: path.join(FIXTURE_ROOT, "init.mp4"), type: "video/mp4" };
  }
  if (/^\/segment-\d{3}\.m4s$/.test(pathname)) {
    return {
      filePath: path.join(FIXTURE_ROOT, pathname.slice(1)),
      type: "video/iso.segment",
    };
  }
  return null;
}

function startPlaybackFixtureServer() {
  if (server) return Promise.resolve();

  server = http.createServer((request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405).end();
      return;
    }

    const pathname = new URL(request.url || "/", "http://fixture.local")
      .pathname;
    const fixture = resolveFixture(pathname);
    if (!fixture) {
      response.writeHead(404).end();
      return;
    }

    let stat;
    try {
      stat = fs.statSync(fixture.filePath);
    } catch {
      response.writeHead(404).end();
      return;
    }

    if (pathname.startsWith("/segment-")) requestedPaths.push(pathname);
    response.setHeader("Accept-Ranges", "bytes");
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Type", fixture.type);

    const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    if (range) {
      const start = Number(range[1]);
      const end = range[2]
        ? Math.min(Number(range[2]), stat.size - 1)
        : stat.size - 1;
      if (start > end || start >= stat.size) {
        response
          .writeHead(416, { "Content-Range": `bytes */${stat.size}` })
          .end();
        return;
      }
      response.writeHead(206, {
        "Content-Length": end - start + 1,
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
      });
      if (request.method === "HEAD") response.end();
      else fs.createReadStream(fixture.filePath, { start, end }).pipe(response);
      return;
    }

    response.writeHead(200, { "Content-Length": stat.size });
    if (request.method === "HEAD") response.end();
    else fs.createReadStream(fixture.filePath).pipe(response);
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(FIXTURE_PORT, "0.0.0.0", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
}

function stopPlaybackFixtureServer() {
  if (!server) return Promise.resolve();
  const activeServer = server;
  server = undefined;
  return new Promise((resolve, reject) => {
    activeServer.close((error) => (error ? reject(error) : resolve()));
  });
}

function getRequestedSegmentIndices() {
  return requestedPaths.flatMap((pathname) => {
    const match = pathname.match(/segment-(\d{3})\.m4s$/);
    return match ? [Number(match[1])] : [];
  });
}

module.exports = {
  FIXTURE_PORT,
  getRequestedSegmentIndices,
  startPlaybackFixtureServer,
  stopPlaybackFixtureServer,
};
