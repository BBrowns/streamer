const fs = require("fs");
const path = require("path");
const https = require("https");
const crypto = require("crypto");
const { execSync } = require("child_process");

const NODE_VERSION = "24.18.0";
const ARCHITECTURES = ["arm64", "x64"];
const PLATFORM = "darwin"; // Focused on macOS for this fix, easy to expand

const VENDOR_ROOT = path.resolve(__dirname, "../vendor/node");

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: ${response.statusCode}`));
          return;
        }
        response.pipe(file);
        file.on("finish", () => {
          file.close(resolve);
        });
      })
      .on("error", (err) => {
        fs.unlink(dest, () => reject(err));
      });
  });
}

async function downloadText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`Failed to download: ${response.statusCode}`));
          return;
        }

        response.setEncoding("utf8");
        let body = "";
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => resolve(body));
      })
      .on("error", reject);
  });
}

function extractTarGz(tarPath, destDir) {
  // Use system tar for simplicity and to avoid dependencies
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  execSync(`tar -xzf "${tarPath}" -C "${destDir}" --strip-components=1`);
}

function parseNodeVersionHeader(contents) {
  const readPart = (name) => {
    const match = contents.match(
      new RegExp(`^#define NODE_${name}_VERSION (\\d+)$`, "m"),
    );
    return match?.[1] ?? null;
  };
  const parts = [readPart("MAJOR"), readPart("MINOR"), readPart("PATCH")];
  return parts.every(Boolean) ? parts.join(".") : null;
}

function parseMachOArchitecture(header) {
  if (header.length < 8 || header.readUInt32LE(0) !== 0xfeedfacf) {
    return null;
  }

  const cpuType = header.readInt32LE(4);
  if (cpuType === 0x0100000c) return "arm64";
  if (cpuType === 0x01000007) return "x64";
  return null;
}

function inspectVendoredNodeRuntime(runtimeRoot, readFile = fs.readFileSync) {
  try {
    const versionHeader = readFile(
      path.join(runtimeRoot, "include/node/node_version.h"),
      "utf8",
    );
    const binaryHeader = readFile(path.join(runtimeRoot, "bin/node")).subarray(
      0,
      8,
    );
    const version = parseNodeVersionHeader(versionHeader);
    const arch = parseMachOArchitecture(binaryHeader);
    return version && arch ? { version, arch } : null;
  } catch {
    return null;
  }
}

function getExpectedChecksum(manifest, fileName) {
  for (const line of manifest.split(/\r?\n/)) {
    const [checksum, name] = line.trim().split(/\s+/);
    if (name === fileName && /^[a-f0-9]{64}$/i.test(checksum)) {
      return checksum.toLowerCase();
    }
  }
  return null;
}

async function calculateSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const input = fs.createReadStream(filePath);
    input.on("error", reject);
    input.on("data", (chunk) => hash.update(chunk));
    input.on("end", () => resolve(hash.digest("hex")));
  });
}

function isExpectedNodeRuntime(runtime, expectedVersion, expectedArch) {
  return runtime?.version === expectedVersion && runtime?.arch === expectedArch;
}

async function vendorNode() {
  console.log(
    `[vendor-node] Starting download of Node ${NODE_VERSION} for ${PLATFORM}...`,
  );

  if (!fs.existsSync(VENDOR_ROOT)) {
    fs.mkdirSync(VENDOR_ROOT, { recursive: true });
  }

  let failed = false;
  let checksumManifest;
  for (const arch of ARCHITECTURES) {
    const fileName = `node-v${NODE_VERSION}-${PLATFORM}-${arch}`;
    const tarName = `${fileName}.tar.gz`;
    const url = `https://nodejs.org/dist/v${NODE_VERSION}/${tarName}`;
    const destDir = path.join(VENDOR_ROOT, `${PLATFORM}-${arch}`);
    const tarPath = path.join(VENDOR_ROOT, tarName);
    const tempDir = `${destDir}.tmp-${process.pid}`;
    const installedRuntime = inspectVendoredNodeRuntime(destDir);

    if (isExpectedNodeRuntime(installedRuntime, NODE_VERSION, arch)) {
      console.log(
        `[vendor-node] ${PLATFORM}-${arch} ${NODE_VERSION} already exists, skipping.`,
      );
      continue;
    }

    try {
      if (installedRuntime) {
        console.log(
          `[vendor-node] Replacing ${PLATFORM}-${arch} ${installedRuntime.version}/${installedRuntime.arch}.`,
        );
      }
      fs.rmSync(tempDir, { recursive: true, force: true });
      console.log(`[vendor-node] Downloading ${arch} from ${url}...`);
      await downloadFile(url, tarPath);
      checksumManifest ??= await downloadText(
        `https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt`,
      );
      const expectedChecksum = getExpectedChecksum(checksumManifest, tarName);
      const actualChecksum = await calculateSha256(tarPath);
      if (!expectedChecksum || actualChecksum !== expectedChecksum) {
        throw new Error(`Checksum verification failed for ${tarName}`);
      }
      console.log(`[vendor-node] Extracting ${arch}...`);
      extractTarGz(tarPath, tempDir);

      const downloadedRuntime = inspectVendoredNodeRuntime(tempDir);
      if (!isExpectedNodeRuntime(downloadedRuntime, NODE_VERSION, arch)) {
        throw new Error(
          `Downloaded runtime mismatch: expected ${NODE_VERSION}/${arch}, received ${downloadedRuntime?.version ?? "unknown"}/${downloadedRuntime?.arch ?? "unknown"}`,
        );
      }

      fs.rmSync(destDir, { recursive: true, force: true });
      fs.renameSync(tempDir, destDir);
      console.log(`[vendor-node] ${arch} ready at ${destDir}`);
    } catch (error) {
      failed = true;
      console.error(`[vendor-node] Failed for ${arch}:`, error.message);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
      fs.rmSync(tarPath, { force: true });
    }
  }

  if (failed) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  vendorNode().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  calculateSha256,
  getExpectedChecksum,
  inspectVendoredNodeRuntime,
  isExpectedNodeRuntime,
  parseMachOArchitecture,
  parseNodeVersionHeader,
  vendorNode,
};
