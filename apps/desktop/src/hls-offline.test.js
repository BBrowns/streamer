"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  HLS_LIMITS,
  isHlsUrl,
  isRejectedHlsContentType,
  parseHlsMediaPlaylist,
} = require("./hls-offline");

const playlistUrl = "https://cdn.example.test/vod/movie/index.m3u8";

test("recognizes only playlist URLs", () => {
  assert.equal(isHlsUrl(playlistUrl), true);
  assert.equal(isHlsUrl("https://cdn.example.test/movie.mp4"), false);
  assert.equal(isHlsUrl("not-a-url"), false);
});

test("rewrites a finite media playlist to managed relative resources", () => {
  const result = parseHlsMediaPlaylist(
    [
      "#EXTM3U",
      "#EXT-X-VERSION:3",
      "#EXT-X-TARGETDURATION:10",
      "#EXTINF:8.0,",
      "../segments/one.ts",
      "#EXTINF:7.5,",
      "two.ts?token=opaque",
      "#EXT-X-ENDLIST",
    ].join("\n"),
    playlistUrl,
    "movie.mp4.segments",
  );

  assert.equal(result.segmentCount, 2);
  assert.equal(result.durationSeconds, 15.5);
  assert.deepEqual(
    result.resources.map(({ kind, url, localPath }) => ({
      kind,
      url,
      localPath,
    })),
    [
      {
        kind: "segment",
        url: "https://cdn.example.test/vod/segments/one.ts",
        localPath: "movie.mp4.segments/segment-0001.bin",
      },
      {
        kind: "segment",
        url: "https://cdn.example.test/vod/movie/two.ts?token=opaque",
        localPath: "movie.mp4.segments/segment-0002.bin",
      },
    ],
  );
  assert.match(result.manifest, /movie\.mp4\.segments\/segment-0001\.bin/);
  assert.doesNotMatch(result.manifest, /https?:\/\//);
});

test("rewrites an initialization map and keeps it in the resource plan", () => {
  const result = parseHlsMediaPlaylist(
    [
      "#EXTM3U",
      '#EXT-X-MAP:URI="init.mp4"',
      "#EXTINF:2,",
      "segment.m4s",
      "#EXT-X-ENDLIST",
    ].join("\n"),
    playlistUrl,
    "episode.m3u8.segments",
  );

  assert.deepEqual(result.resources, [
    {
      kind: "init",
      url: "https://cdn.example.test/vod/movie/init.mp4",
      localPath: "episode.m3u8.segments/init-0000.bin",
    },
    {
      kind: "segment",
      url: "https://cdn.example.test/vod/movie/segment.m4s",
      localPath: "episode.m3u8.segments/segment-0001.bin",
    },
  ]);
  assert.match(
    result.manifest,
    /URI="episode\.m3u8\.segments\/init-0000\.bin"/,
  );
});

test("rejects master, live, encrypted, and byte-range playlists", () => {
  assert.throws(
    () =>
      parseHlsMediaPlaylist(
        "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nvariant.m3u8",
        playlistUrl,
      ),
    /master playlists/,
  );
  assert.throws(
    () => parseHlsMediaPlaylist("#EXTM3U\n#EXTINF:2,\nsegment.ts", playlistUrl),
    /Live HLS/,
  );
  assert.throws(
    () =>
      parseHlsMediaPlaylist(
        '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key"\n#EXTINF:2,\nsegment.ts\n#EXT-X-ENDLIST',
        playlistUrl,
      ),
    /Encrypted HLS/,
  );
  assert.throws(
    () =>
      parseHlsMediaPlaylist(
        "#EXTM3U\n#EXT-X-BYTERANGE:100@0\n#EXTINF:2,\nsegment.ts\n#EXT-X-ENDLIST",
        playlistUrl,
      ),
    /byte-range/,
  );
  assert.throws(
    () =>
      parseHlsMediaPlaylist(
        '#EXTM3U\n#EXT-X-MAP:URI="init.mp4",BYTERANGE="100@0"\n#EXTINF:2,\nsegment.ts\n#EXT-X-ENDLIST',
        playlistUrl,
      ),
    /initialization byte-ranges/,
  );
  assert.throws(
    () =>
      parseHlsMediaPlaylist(
        '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,URI="audio.m3u8"\n#EXTINF:2,\nsegment.ts\n#EXT-X-ENDLIST',
        playlistUrl,
      ),
    /auxiliary resources/,
  );
});

test("enforces segment and playlist bounds", () => {
  const tooMany = ["#EXTM3U"];
  for (let index = 0; index <= HLS_LIMITS.maxSegments; index += 1) {
    tooMany.push("#EXTINF:1,", `segment-${index}.ts`);
  }
  tooMany.push("#EXT-X-ENDLIST");
  assert.throws(
    () => parseHlsMediaPlaylist(tooMany.join("\n"), playlistUrl),
    /too many segments/,
  );
});

test("rejects metadata responses as HLS media resources", () => {
  assert.equal(isRejectedHlsContentType("text/html; charset=utf-8"), true);
  assert.equal(isRejectedHlsContentType("application/json"), true);
  assert.equal(
    isRejectedHlsContentType("application/vnd.apple.mpegurl", {
      allowPlaylist: true,
    }),
    false,
  );
  assert.equal(
    isRejectedHlsContentType("text/vnd.apple.mpegurl", {
      allowPlaylist: true,
    }),
    false,
  );
  assert.equal(isRejectedHlsContentType("application/vnd.apple.mpegurl"), true);
  assert.equal(isRejectedHlsContentType("video/mp4"), false);
  assert.equal(isRejectedHlsContentType("video/mp2t"), false);
});
