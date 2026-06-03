const fs = require("fs");
const path = require("path");
const https = require("https");
const { execSync } = require("child_process");

const NODE_VERSION = "24.2.0";
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

    if (fs.existsSync(path.join(destDir, "bin/node"))) {
      console.log(
        `[vendor-node] ${PLATFORM}-${arch} already exists, skipping.`,
      );
      continue;
    }

    try {
      console.log(`[vendor-node] Downloading ${arch} from ${url}...`);
      await downloadFile(url, tarPath);
      console.log(`[vendor-node] Extracting ${arch}...`);
      extractTarGz(tarPath, destDir);
      fs.unlinkSync(tarPath);
      console.log(`[vendor-node] ${arch} ready at ${destDir}`);
    } catch (error) {
      failed = true;
      console.error(`[vendor-node] Failed for ${arch}:`, error.message);
    }
  }

  if (failed) {
    process.exitCode = 1;
  }
}

vendorNode().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
