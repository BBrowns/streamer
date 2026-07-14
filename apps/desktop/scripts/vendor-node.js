const fs = require("fs");
const path = require("path");
const https = require("https");
const { execFileSync, execSync } = require("child_process");

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

function extractTarGz(tarPath, destDir) {
  // Use system tar for simplicity and to avoid dependencies
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  execSync(`tar -xzf "${tarPath}" -C "${destDir}" --strip-components=1`);
}

function inspectNodeBinary(binaryPath, execute = execFileSync) {
  try {
    const output = execute(
      binaryPath,
      [
        "-p",
        "JSON.stringify({ version: process.versions.node, arch: process.arch })",
      ],
      { encoding: "utf8" },
    );
    return JSON.parse(String(output).trim());
  } catch {
    return null;
  }
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
  for (const arch of ARCHITECTURES) {
    const fileName = `node-v${NODE_VERSION}-${PLATFORM}-${arch}`;
    const tarName = `${fileName}.tar.gz`;
    const url = `https://nodejs.org/dist/v${NODE_VERSION}/${tarName}`;
    const destDir = path.join(VENDOR_ROOT, `${PLATFORM}-${arch}`);
    const tarPath = path.join(VENDOR_ROOT, tarName);
    const tempDir = `${destDir}.tmp-${process.pid}`;
    const binaryPath = path.join(destDir, "bin/node");
    const installedRuntime = inspectNodeBinary(binaryPath);

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
      console.log(`[vendor-node] Extracting ${arch}...`);
      extractTarGz(tarPath, tempDir);

      const downloadedRuntime = inspectNodeBinary(
        path.join(tempDir, "bin/node"),
      );
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
  inspectNodeBinary,
  isExpectedNodeRuntime,
  vendorNode,
};
