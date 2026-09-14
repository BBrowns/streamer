/**
 * Real, local-only native integration. No WebTorrent/media-server/FFmpeg mocks.
 * Run from the repository root through scripts/dev-runtime.cjs (see QA receipt).
 * Native imports and fixture generation do not run without the explicit opt-in.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
} from "node:fs/promises";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import express from "express";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type WebTorrent from "webtorrent";
import type { Options, Torrent, TorrentOptions } from "webtorrent";
import type { GatewayJob } from "../gateway.js";

type BrowserSnapshot = {
  supported: boolean;
  firstFrameMs: number | null;
  frames: number;
  mediaTime: number;
  width: number;
  height: number;
  currentTime: number;
  paused: boolean;
  seeking: boolean;
  seeked: number;
  fatalErrors: number;
  mediaError: number;
  windowStart: number;
  windowEnd: number;
  seekable: Array<[number, number]>;
  hlsVersion: string;
};
type HarnessWindow = Window & {
  fixture: {
    start(source: string): void;
    seek(target: number): void;
    stop(): void;
    snapshot(): BrowserSnapshot;
  };
};

// Intentionally a browser harness, not the Expo app's HlsWebVideoAdapter.
// hls.js is served from the installed package; all media remains on this origin.
const browserHarness = `<!doctype html><html lang="en"><meta charset="utf-8">
<title>Local playback fixture</title>
<video id="video" controls muted playsinline width="640" height="360"></video>
<button id="play" type="button">Play fixture</button>
<script src="/fixture/hls.js"></script><script>
const video = document.getElementById('video');
let hls, started = 0, firstFrameMs = null, frames = 0, mediaTime = 0;
let fatalErrors = 0, seeked = 0, windowStart = 0, windowEnd = 0, callback;
const supported = Hls.isSupported() && typeof video.requestVideoFrameCallback === 'function';
const frame = (now, metadata) => {
  if (firstFrameMs === null) firstFrameMs = Math.round(performance.now() - started);
  frames += 1;
  mediaTime = metadata.mediaTime;
  callback = video.requestVideoFrameCallback(frame);
};
video.addEventListener('seeked', () => seeked += 1);
document.getElementById('play').onclick = () => video.play().catch(() => fatalErrors += 1);
window.fixture = {
  start(source) {
    started = performance.now();
    if (!supported) { fatalErrors += 1; return; }
    callback = video.requestVideoFrameCallback(frame);
    hls = new Hls({ startPosition: 0, lowLatencyMode: false });
    hls.on(Hls.Events.ERROR, (_, data) => { if (data.fatal) fatalErrors += 1; });
    hls.on(Hls.Events.LEVEL_UPDATED, (_, data) => {
      const fragments = data.details.fragments;
      if (fragments.length) {
        windowStart = fragments[0].start;
        const last = fragments[fragments.length - 1];
        windowEnd = last.start + last.duration;
      }
    });
    hls.attachMedia(video);
    hls.loadSource(source);
  },
  seek(target) { video.currentTime = target; },
  stop() {
    video.pause();
    if (callback !== undefined) video.cancelVideoFrameCallback(callback);
    if (hls) hls.destroy();
    video.removeAttribute('src');
    video.load();
  },
  snapshot() {
    return { supported, firstFrameMs, frames, mediaTime,
      width: video.videoWidth, height: video.videoHeight,
      currentTime: video.currentTime, paused: video.paused, seeking: video.seeking,
      seeked, fatalErrors, mediaError: video.error ? video.error.code : 0,
      windowStart, windowEnd, hlsVersion: Hls.version,
      seekable: Array.from({ length: video.seekable.length }, (_, i) =>
        [video.seekable.start(i), video.seekable.end(i)]) };
  }
};
</script></html>`;

const localOnly: Options = {
  dht: false,
  tracker: false,
  lsd: false,
  utPex: false,
  natUpnp: false,
  natPmp: false,
  webSeeds: false,
  utp: false,
  seedOutgoingConnections: false,
  torrentPort: 0,
};

// Never attach a cause, command, source object, URL, or raw subprocess output
// to a failure: test reporters otherwise serialize those values verbatim.
function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

async function bounded<T>(work: Promise<T>, label: string, ms = 15_000) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work.catch((error: unknown) => {
        const kind = error instanceof TypeError ? "TypeError" : "Error";
        const frames =
          error instanceof Error
            ? error.stack
                ?.match(
                  /(?:torrent|gateway|torrent-failure|real-playback-runtime\.test)\.ts:\d+:\d+/g,
                )
                ?.slice(0, 4)
                .join(",")
            : undefined;
        throw new Error(
          `${label} failed: ${kind}; locations=${frames ?? "unavailable"} (sensitive diagnostics withheld)`,
        );
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function until(
  predicate: () => boolean | Promise<boolean>,
  label: string,
  ms = 15_000,
) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await delay(50);
  }
  throw new Error(`${label} timed out`);
}

function mediaCommand(
  binary: string,
  args: string[],
  input?: Buffer,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ["pipe", "pipe", "ignore"] });
    const chunks: Buffer[] = [];
    let bytes = 0;
    let exceeded = false;
    const timer = setTimeout(() => child.kill("SIGKILL"), 20_000);
    child.on("error", () => {
      clearTimeout(timer);
      reject(new Error("Fixture media executable could not start"));
    });
    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 2 * 1024 * 1024) {
        exceeded = true;
        child.kill("SIGKILL");
      } else chunks.push(chunk);
    });
    child.stdin.on("error", () => {});
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0 || exceeded)
        reject(new Error("Fixture media command failed"));
      else resolve(Buffer.concat(chunks));
    });
    child.stdin.end(input);
  });
}

describe.skipIf(process.env.STREAMER_TEST_REAL_TORRENT !== "1")(
  "real local playback runtime",
  () => {
    let root: string;
    let seed: WebTorrent;
    let seeded: Torrent;
    let downloader: WebTorrent | undefined;
    let server: Server;
    let origin: string;
    let gateway: typeof import("../gateway.js");
    let runtime: typeof import("../torrent.js");
    let security: typeof import("../security.js");
    let jobs: GatewayJob[] = [];
    let childrenBefore = 0;
    let runtimeErrors = 0;
    const mkvName = "Fixture.S01E02.mkv";
    const mp4Name = "Fixture.S01E03.mp4";
    const ffmpeg = process.env.STREAMER_FFMPEG_PATH?.trim() || "ffmpeg";
    const ffprobe = process.env.STREAMER_FFPROBE_PATH?.trim() || "ffprobe";

    beforeAll(async () => {
      childrenBefore = process
        .getActiveResourcesInfo()
        .filter((name) => name === "ProcessWrap").length;
      root = await mkdtemp(path.join(tmpdir(), "streamer-real-playback-"));
      await Promise.all(
        ["seed", "torrent", "remux", "hls"].map((name) =>
          mkdir(path.join(root, name)),
        ),
      );
      vi.stubEnv("STREAMER_TORRENT_CACHE_DIR", path.join(root, "torrent"));
      vi.stubEnv("STREAMER_REMUX_CACHE_DIR", path.join(root, "remux"));
      vi.stubEnv("TMPDIR", path.join(root, "hls"));
      vi.stubEnv("DEBUG", "");
      vi.stubEnv("STREAMER_STREAM_SERVER_CONSOLE_BREADCRUMBS", "0");
      vi.stubEnv(
        "STREAMER_GATEWAY_STREAM_SECRET",
        randomBytes(32).toString("hex"),
      );
      // Suppress production diagnostics only; every runtime component stays real.
      for (const method of ["log", "warn", "error"] as const) {
        vi.spyOn(console, method).mockImplementation(() => {
          if (method === "error") runtimeErrors += 1;
        });
      }
      const mkvPath = path.join(root, "seed", mkvName);
      await mediaCommand(ffmpeg, [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=size=160x90:rate=24",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:sample_rate=48000",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=880:sample_rate=48000",
        "-t",
        "48",
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-map",
        "2:a:0",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-pix_fmt",
        "yuv420p",
        "-g",
        "48",
        "-keyint_min",
        "48",
        "-sc_threshold",
        "0",
        "-c:a",
        "aac",
        "-b:a",
        "64k",
        "-metadata:s:a:0",
        "language=eng",
        "-metadata:s:a:0",
        "title=English",
        "-metadata:s:a:1",
        "language=spa",
        "-metadata:s:a:1",
        "title=Spanish",
        "-disposition:a:0",
        "0",
        "-disposition:a:1",
        "default",
        mkvPath,
      ]);
      await mediaCommand(ffmpeg, [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        mkvPath,
        "-map",
        "0:v:0",
        "-map",
        "0:a:0",
        "-c",
        "copy",
        "-disposition:a:0",
        "default",
        "-movflags",
        "+faststart",
        path.join(root, "seed", mp4Name),
      ]);
      const { default: RealWebTorrent } = await bounded(
        import("webtorrent"),
        "Native WebTorrent import",
      );
      const versionOutput = await mediaCommand(ffmpeg, ["-version"]);
      const mediaVersion =
        /^ffmpeg version ([0-9]+(?:\.[0-9]+)+)/.exec(
          versionOutput.toString(),
        )?.[1] ?? "unreported";
      process.stdout.write(
        `[real-fixture] node=${process.version}; platform=${process.platform}/${process.arch}; webtorrent=${RealWebTorrent.VERSION}; ffmpeg=${mediaVersion}\n`,
      );
      seed = new RealWebTorrent(localOnly);
      seed.on("error", () => {
        runtimeErrors += 1;
      });
      seeded = await bounded(
        new Promise<Torrent>((resolve) => {
          seed.seed(
            path.join(root, "seed"),
            { announce: [], urlList: [], private: true },
            resolve,
          );
        }),
        "Local seed readiness",
      );
      await until(() => seed.listening, "Local seed listener");
      check(seed.torrentPort > 0, "Local seed did not bind a port");

      class LocalWebTorrent extends RealWebTorrent {
        constructor(options: Record<string, unknown>) {
          super({ ...options, ...localOnly });
          downloader = this;
        }

        override add(
          torrentId: Parameters<WebTorrent["add"]>[0],
          options?: TorrentOptions | ((torrent: Torrent) => void),
          callback?: (torrent: Torrent) => void,
        ): Torrent {
          check(
            typeof torrentId === "string",
            "Gateway must add a magnet for metadata exchange",
          );
          // Production adds public tracker hints; remove those and retain only
          // the identity. Metadata and pieces must come from the real local peer.
          const identity = new URL(torrentId).searchParams.get("xt");
          check(
            identity && /^urn:btih:[a-f0-9]{40}$/i.test(identity),
            "Gateway torrent identity missing",
          );
          const torrent = super.add(
            `magnet:?xt=${identity}`,
            {
              ...(typeof options === "object" ? options : {}),
              announce: [],
              urlList: [],
              private: true,
            },
            typeof options === "function" ? options : callback,
          );
          const connect = () => {
            if (!(torrent as Torrent & { destroyed: boolean }).destroyed) {
              torrent.addPeer(`127.0.0.1:${seed.torrentPort}`);
            }
          };
          if (torrent.infoHash) connect();
          else torrent.once("infoHash", connect);
          return torrent;
        }
      }

      runtime = await import("../torrent.js");
      gateway = await import("../gateway.js");
      security = await import("../security.js");
      runtime.__setWebTorrentImporterForTests(async () => ({
        default: LocalWebTorrent,
      }));
      const app = express();
      app.get("/fixture", (_req, res) => res.type("html").send(browserHarness));
      const hlsBundle = createRequire(import.meta.url).resolve(
        "hls.js/dist/hls.js",
      );
      app.get("/fixture/hls.js", (_req, res) => res.sendFile(hlsBundle));
      app.get("/api/gateway/jobs/:id/stream", gateway.serveGatewayJobStream);
      app.get(
        "/api/bridge/v1/jobs/:id/segments/:segment",
        gateway.serveGatewayJobSegment,
      );
      server = app.listen(0, "127.0.0.1");
      await bounded(
        new Promise<void>((resolve, reject) => {
          server.once("listening", resolve);
          server.once("error", reject);
        }),
        "Fixture HTTP listener",
      );
      const address = server.address();
      check(
        address && typeof address !== "string",
        "Fixture HTTP listener has no address",
      );
      origin = `http://127.0.0.1:${address.port}`;
    }, 60_000);

    async function readyJob(episode: number) {
      const started = Date.now();
      const job = await bounded(
        gateway.createGatewayJob({
          magnet: seeded.magnetURI,
          hints: { season: 1, episode },
          audioLanguage: "en",
          mode: "remux",
          remuxStrategy: "hls",
          requestedDelivery: "hls",
        }),
        "Gateway creation",
      );
      jobs.push(job);
      await until(
        () => {
          const current = gateway.getGatewayJob(job.id);
          check(current, "Created gateway job disappeared");
          if (current.state !== "preparing" && current.state !== "ready") {
            throw new Error(
              `Gateway readiness failed: state=${current.state}; reason=${current.failureReason ?? "unknown"}; code=${current.failureCode ?? "none"}`,
            );
          }
          return current.state === "ready";
        },
        "Gateway readiness",
        45_000,
      );
      check(downloader, "Production downloader was not constructed");
      for (const client of [seed, downloader]) {
        expect([
          client.dht,
          client.tracker,
          client.lsd,
          client.utPex,
          client.natUpnp,
          client.natPmp,
          client.enableWebSeeds,
          client.utp,
        ]).toEqual(Array(8).fill(false));
      }
      const torrent = downloader.torrents.find(
        (item) => item.infoHash === job.infoHash,
      );
      check(torrent, "Gateway downloader lost its torrent");
      check(torrent.downloaded > 0, "Gateway did not download real peer bytes");
      expect(job.audioTrackId).toBe("audio:1");
      expect(torrent.files[job.fileIdx!].name).toBe(
        episode === 2 ? mkvName : mp4Name,
      );
      expect(runtime.getRemuxCacheStatus().entryCount).toBe(0);
      expect((await readdir(path.join(root, "remux"))).length).toBe(0);
      process.stdout.write(
        `[real-fixture] episode=${episode}; readyMs=${Date.now() - started}; receivedBytes=${torrent.downloaded}; seekableCacheEntries=0\n`,
      );
      return { job, torrent };
    }

    async function http(relative: string, init?: RequestInit) {
      const target = new URL(relative, origin);
      check(
        target.origin === origin,
        "Fixture HTTP request escaped its loopback origin",
      );
      return bounded(
        fetch(target, { ...init, signal: AbortSignal.timeout(15_000) }),
        "Gateway HTTP request",
      );
    }

    async function bytes(response: globalThis.Response) {
      return Buffer.from(
        await bounded(response.arrayBuffer(), "Gateway HTTP body"),
      );
    }

    async function probe(input: string) {
      const result = await mediaCommand(ffprobe, [
        "-v",
        "error",
        "-show_streams",
        "-of",
        "json",
        input,
      ]);
      return JSON.parse(result.toString()) as {
        streams: Array<{
          codec_type: string;
          codec_name: string;
          tags?: { language?: string };
          disposition: { default: number };
        }>;
      };
    }

    async function hlsFragment(job: GatewayJob, audioIndex?: number) {
      const streamPath =
        security.createSignedGatewayStreamPath(job.id) +
        (audioIndex === undefined ? "" : `&audioTrack=${audioIndex}`);
      const response = await http(streamPath);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")?.includes("mpegurl")).toBe(
        true,
      );
      const manifest = (await bytes(response)).toString();
      check(
        manifest.startsWith("#EXTM3U"),
        "Gateway did not return an HLS manifest",
      );
      const init = /#EXT-X-MAP:.*URI="([^"]+)"/.exec(manifest)?.[1];
      const fragment = manifest
        .split(/\r?\n/)
        .find((line) => line && !line.startsWith("#"));
      check(
        init && fragment,
        "HLS manifest lacks an initialization segment or first fragment",
      );
      const initResponse = await http(init);
      const fragmentResponse = await http(fragment);
      expect([initResponse.status, fragmentResponse.status]).toEqual([
        200, 200,
      ]);
      const initBytes = await bytes(initResponse);
      const fragmentBytes = await bytes(fragmentResponse);
      check(
        initBytes.includes(Buffer.from("ftyp")) &&
          initBytes.includes(Buffer.from("moov")),
        "HLS initialization lacks MP4 headers",
      );
      check(
        fragmentBytes.includes(Buffer.from("moof")) &&
          fragmentBytes.includes(Buffer.from("mdat")),
        "HLS fragment lacks media payload",
      );
      expect(runtime.getRemuxCacheStatus().entryCount).toBe(0);
      check(!job.seekableCacheStartedAt, "HLS required a full seekable cache");
      const pcm = await mediaCommand(
        ffmpeg,
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-i",
          "pipe:0",
          "-map",
          "0:a:0",
          "-t",
          "1",
          "-ac",
          "1",
          "-ar",
          "8000",
          "-f",
          "s16le",
          "pipe:1",
        ],
        Buffer.concat([initBytes, fragmentBytes]),
      );
      check(
        pcm.length >= 15_000,
        "HLS fragment did not decode one second of audio",
      );
      let crossings = 0;
      for (let offset = 2; offset < pcm.length; offset += 2) {
        if (pcm.readInt16LE(offset - 2) <= 0 && pcm.readInt16LE(offset) > 0)
          crossings += 1;
      }
      const frequency = crossings / (pcm.length / 2 / 8000);
      const expected = audioIndex === 2 ? 880 : 440;
      check(
        Math.abs(frequency - expected) < 12,
        "HLS decoded audio does not match the selected language tone",
      );
      process.stdout.write(
        `[real-fixture] selectedAudio=${audioIndex === 2 ? "es" : "en"}; firstFragmentBytes=${fragmentBytes.length}; decodedToneHz=${Math.round(frequency)}; seekableCacheEntries=0\n`,
      );
    }

    it("serves real HLS fragments with English over Spanish-default audio before a seekable cache", async () => {
      const source = await probe(path.join(root, "seed", mkvName));
      const audio = source.streams.filter(
        (stream) => stream.codec_type === "audio",
      );
      expect(
        audio.map((stream) => [
          stream.tags?.language,
          stream.disposition.default,
        ]),
      ).toEqual([
        ["eng", 0],
        ["spa", 1],
      ]);
      const { job, torrent } = await readyJob(2);
      expect(job.mode).toBe("remux");
      const catalog = await bounded(
        gateway.buildGatewayTrackCatalog(job),
        "Gateway track catalog",
      );
      expect(catalog.selectedFileIndex).toBe(job.fileIdx);
      expect(
        catalog.tracks
          .filter((track) => track.kind === "audio")
          .map((track) => [track.language, track.default]),
      ).toEqual([
        ["en", true],
        ["es", false],
      ]);
      // This traverses the owned createServer return; no client.server shim.
      const mediaSource = await bounded(
        runtime.getTorrentMediaSource(torrent, torrent.files[job.fileIdx!]),
        "Owned media source",
      );
      const sourceProbe = await probe(mediaSource);
      expect(
        sourceProbe.streams.filter((stream) => stream.codec_type === "audio")
          .length,
      ).toBe(2);
      await hlsFragment(job);
      await hlsFragment(job, 2);
    }, 60_000);

    it("downgrades compatible MP4 to real direct delivery with correct HEAD and byte ranges", async () => {
      const { job } = await readyJob(3);
      expect(job.mode).toBe("bridge");
      expect(job.hlsSessions?.size ?? 0).toBe(0);
      const original = await readFile(path.join(root, "seed", mp4Name));
      const streamPath = security.createSignedGatewayStreamPath(job.id);
      const head = await http(streamPath, { method: "HEAD" });
      expect(head.status).toBe(200);
      expect(head.headers.get("content-length")).toBe(String(original.length));
      expect(head.headers.get("accept-ranges")).toBe("bytes");
      expect((await bytes(head)).length).toBe(0);
      for (const [range, start, end] of [
        ["bytes=0-1023", 0, 1024],
        ["bytes=2048-4095", 2048, 4096],
        ["bytes=-512", original.length - 512, original.length],
      ] as const) {
        const response = await http(streamPath, { headers: { Range: range } });
        expect(response.status).toBe(206);
        expect(response.headers.get("content-range")).toBe(
          `bytes ${start}-${end - 1}/${original.length}`,
        );
        check(
          (await bytes(response)).equals(original.subarray(start, end)),
          "Direct range bytes differ from the synthetic seed",
        );
      }
      expect(runtime.getRemuxCacheStatus().entryCount).toBe(0);
      process.stdout.write(
        "[real-fixture] directMP4=passed; HEAD=200; exactRanges=3; remuxJobs=0\n",
      );
    }, 60_000);

    it("keeps a shared torrent usable when one of two ready jobs is cancelled", async () => {
      const first = await readyJob(3);
      const second = await readyJob(3);
      expect(first.torrent).toBe(second.torrent);
      expect(first.job.id).not.toBe(second.job.id);
      expect(downloader!.torrents).toHaveLength(1);

      await bounded(
        gateway.cancelGatewayJob(first.job),
        "First consumer cancellation",
      );
      expect(downloader!.torrents).toHaveLength(1);
      expect(second.torrent).toHaveProperty("destroyed", false);
      expect(gateway.getGatewayJob(second.job.id)?.state).toBe("ready");
      const response = await http(
        security.createSignedGatewayStreamPath(second.job.id),
        {
          headers: { Range: "bytes=0-1023" },
        },
      );
      expect(response.status).toBe(206);
      const original = await readFile(path.join(root, "seed", mp4Name));
      check(
        (await bytes(response)).equals(original.subarray(0, 1024)),
        "Surviving consumer returned incorrect media",
      );
      process.stdout.write(
        "[real-fixture] sharedTorrentJobs=2; firstCancelled=true; survivingConsumerRange=passed\n",
      );
    }, 60_000);

    it("presents a Chromium video frame before download completion and seeks inside the published HLS window", async () => {
      const { chromium } = await bounded(
        import("playwright"),
        "Installed Playwright import",
      );
      const browser = await bounded(
        chromium.launch({ headless: true, timeout: 15_000 }),
        "Installed Chromium launch",
        20_000,
      );
      let stage = "browser setup";
      let last: BrowserSnapshot | undefined;
      try {
        const context = await browser.newContext({
          viewport: { width: 800, height: 600 },
          serviceWorkers: "block",
        });
        context.setDefaultTimeout(12_000);
        let externalRequests = 0;
        await context.route("**/*", (route) => {
          if (new URL(route.request().url()).origin === origin)
            return route.continue();
          externalRequests += 1;
          return route.abort();
        });
        const page = await context.newPage();
        let pageErrors = 0;
        page.on("pageerror", () => {
          pageErrors += 1;
        });
        await page.goto(`${origin}/fixture`, { waitUntil: "load" });
        check(
          await page.getByRole("button", { name: "Play fixture" }).isVisible(),
          "Browser harness did not load",
        );
        stage = "throttled gateway readiness";
        const uploadBytesPerSecond = 192 * 1024;
        seed.throttleUpload(uploadBytesPerSecond);
        const { job, torrent } = await readyJob(2);
        const selected = torrent.files[job.fileIdx!];
        const readyDownloaded = torrent.downloaded;
        check(
          readyDownloaded < torrent.length,
          "Throttled torrent completed before gateway readiness",
        );
        const readyWindow = job.hlsSessions
          ?.get(job.audioTrackId!)
          ?.getPublishedWindow();
        check(
          readyWindow && readyWindow.segmentCount > 0,
          "Ready gateway did not publish an HLS fragment",
        );
        let fragmentDownloaded: number | undefined;
        let fragmentFileDownloaded: number | undefined;
        let fragmentResponseErrors = 0;
        page.on("response", (response) => {
          if (!/\/segment-\d{6}\.m4s$/.test(new URL(response.url()).pathname))
            return;
          void response
            .finished()
            .then((error) => {
              if (error || response.status() !== 200) {
                fragmentResponseErrors += 1;
                return;
              }
              if (fragmentDownloaded === undefined) {
                fragmentDownloaded = torrent.downloaded;
                fragmentFileDownloaded = selected.downloaded;
              }
            })
            .catch(() => {
              fragmentResponseErrors += 1;
            });
        });
        const snapshot = async () => {
          last = await page.evaluate(() =>
            (window as unknown as HarnessWindow).fixture.snapshot(),
          );
          check(
            last.fatalErrors === 0 && last.mediaError === 0 && pageErrors === 0,
            "Browser media reported an error",
          );
          return last;
        };
        stage = "first presented video frame";
        await page.evaluate(
          (source) =>
            (window as unknown as HarnessWindow).fixture.start(source),
          security.createSignedGatewayStreamPath(job.id),
        );
        await page.getByRole("button", { name: "Play fixture" }).click();
        await until(
          async () => {
            const state = await snapshot();
            return (
              state.firstFrameMs !== null &&
              state.frames > 0 &&
              state.width === 160 &&
              state.height === 90 &&
              !state.paused
            );
          },
          "Chromium first presented frame",
          12_000,
        );
        const firstFrame = await snapshot();
        const firstFrameDownloaded = torrent.downloaded;
        check(
          firstFrameDownloaded < torrent.length &&
            selected.downloaded < selected.length,
          "First presented frame followed full source download",
        );
        check(
          fragmentDownloaded !== undefined &&
            fragmentDownloaded < torrent.length,
          "First HLS fragment followed full torrent download",
        );
        check(
          fragmentFileDownloaded !== undefined &&
            fragmentFileDownloaded < selected.length,
          "First HLS fragment followed full selected-file download",
        );
        expect(runtime.getRemuxCacheStatus().entryCount).toBe(0);
        process.stdout.write(
          `[real-fixture] chromium=${browser.version()}; hls=${firstFrame.hlsVersion}; harnessFirstFrameMs=${firstFrame.firstFrameMs}; decodedSize=${firstFrame.width}x${firstFrame.height}; uploadBytesPerSecond=${uploadBytesPerSecond}; torrentBytes=${torrent.length}; readyDownloaded=${readyDownloaded}; firstFragmentDownloaded=${fragmentDownloaded}; firstFrameDownloaded=${firstFrameDownloaded}; selectedFileIncomplete=true\n`,
        );

        stage = "published seek window";
        let target = 0;
        await until(
          async () => {
            const state = await snapshot();
            target = state.windowStart + 0.75;
            return (
              state.windowEnd - state.windowStart >= 6 &&
              state.currentTime - target >= 1.5 &&
              state.seekable.some(
                ([start, end]) => target >= start && target < end,
              )
            );
          },
          "Published HLS seek window",
          12_000,
        );
        const beforeSeek = await snapshot();
        check(
          target >= beforeSeek.windowStart && target < beforeSeek.windowEnd,
          "Seek target lies outside the published HLS window",
        );
        stage = "bounded HLS seek";
        const seekStarted = Date.now();
        await page.evaluate(
          (position) =>
            (window as unknown as HarnessWindow).fixture.seek(position),
          target,
        );
        await until(
          async () => {
            const state = await snapshot();
            return (
              state.seeked > beforeSeek.seeked &&
              !state.seeking &&
              state.frames > beforeSeek.frames &&
              Math.abs(state.mediaTime - target) < 0.5
            );
          },
          "Presented video frame after HLS seek",
          5_000,
        );
        const afterSeek = await snapshot();
        const seekMs = Date.now() - seekStarted;
        await until(
          async () => {
            const state = await snapshot();
            return (
              !state.paused &&
              state.frames > afterSeek.frames &&
              state.currentTime >= target + 0.4
            );
          },
          "Playback advances after HLS seek",
          5_000,
        );
        expect([externalRequests, pageErrors, fragmentResponseErrors]).toEqual([
          0, 0, 0,
        ]);
        expect(runtime.getRemuxCacheStatus().entryCount).toBe(0);
        process.stdout.write(
          `[real-fixture] harnessSeekMs=${seekMs}; fromSeconds=${beforeSeek.currentTime.toFixed(2)}; targetSeconds=${target.toFixed(2)}; presentedSeconds=${afterSeek.mediaTime.toFixed(2)}; publishedWindow=${beforeSeek.windowStart.toFixed(2)}-${beforeSeek.windowEnd.toFixed(2)}; resumed=true; seekableCacheEntries=0\n`,
        );
        stage = "browser media cleanup";
        await page.evaluate(() =>
          (window as unknown as HarnessWindow).fixture.stop(),
        );
        await context.close();
      } catch {
        // Playwright errors can include the signed media address or page source.
        throw new Error(
          `Chromium fixture failed at ${stage}; safeState=${JSON.stringify(last ?? {})}`,
        );
      } finally {
        try {
          await bounded(browser.close(), "Chromium shutdown", 10_000);
        } finally {
          seed.throttleUpload(-1);
        }
      }
      expect(browser.isConnected()).toBe(false);
    }, 75_000);

    afterEach(async () => {
      for (const job of jobs) {
        const streamPath = security.createSignedGatewayStreamPath(job.id);
        await bounded(gateway.cancelGatewayJob(job), "Gateway cancellation");
        expect((await http(streamPath)).status).toBe(410);
        expect(job.hlsSessions?.size ?? 0).toBe(0);
        expect(job.operationAbortControllers.size).toBe(0);
        expect(job.activeStreamCount).toBe(0);
      }
      if (downloader)
        await until(
          () => downloader!.torrents.length === 0,
          "Gateway torrent release",
        );
      await until(
        async () => (await readdir(path.join(root, "hls"))).length === 0,
        "HLS process directory cleanup",
      );
      await until(
        async () => (await readdir(path.join(root, "torrent"))).length === 0,
        "Torrent cache cleanup",
      );
      gateway?.__resetGatewayJobsForTests();
      jobs = [];
      expect(runtimeErrors).toBe(0);
      process.stdout.write(
        "[real-fixture] cancellation=410; activeConsumers=0; torrents=0; hlsDirectories=0; torrentCacheDirectories=0\n",
      );
    }, 25_000);

    afterAll(async () => {
      const failures: string[] = [];
      const clean = async (
        label: string,
        operation: () => Promise<unknown> | void,
      ) => {
        try {
          await bounded(Promise.resolve().then(operation), label, 10_000);
        } catch {
          failures.push(label);
        }
      };
      try {
        await clean("Gateway cancellation", async () => {
          for (const job of jobs) await gateway?.cancelGatewayJob(job);
          gateway?.__resetGatewayJobsForTests();
        });
        if (server) {
          await clean("Gateway HTTP shutdown", async () => {
            server.closeAllConnections();
            await new Promise<void>((resolve) => server.close(() => resolve()));
            check(!server.listening, "Gateway HTTP listener survived cleanup");
          });
        }
        if (runtime)
          await clean("Production client shutdown", () =>
            runtime.destroyClient(),
          );
        // Continue releasing the independent seed even if production shutdown fails.
        if (seed && !seed.destroyed)
          await clean(
            "Seed shutdown",
            () =>
              new Promise<void>((resolve, reject) =>
                seed.destroy((error) => (error ? reject(error) : resolve())),
              ),
          );
        if (downloader) expect(downloader.destroyed).toBe(true);
        if (seed) expect(seed.destroyed).toBe(true);
        await until(
          () =>
            process
              .getActiveResourcesInfo()
              .filter((name) => name === "ProcessWrap").length <=
            childrenBefore,
          "Native child-process exit",
        );
      } finally {
        runtime?.__resetTorrentEngineForTests();
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
        if (root) {
          await rm(root, { recursive: true, force: true });
          expect(
            await access(root).then(
              () => true,
              () => false,
            ),
          ).toBe(false);
        }
      }
      check(
        failures.length === 0,
        `Fixture cleanup failed: ${failures.join(", ")}`,
      );
      process.stdout.write(
        "[real-fixture] HTTPListener=closed; nativeClients=destroyed; childProcesses=exited; temporaryRoot=removed\n",
      );
    }, 45_000);
  },
);
