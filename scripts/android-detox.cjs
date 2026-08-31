"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { spawn, spawnSync } = require("node:child_process");

const repositoryRoot = path.resolve(__dirname, "..");
const mobileRoot = path.join(repositoryRoot, "apps", "mobile");

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function parseJavaMajor(output) {
  const match = String(output ?? "").match(/version\s+["']?([\d.]+)/i);
  if (!match) return null;

  const parts = match[1].split(".").map(Number);
  if (parts[0] === 1 && parts[1]) return parts[1];
  return parts[0] || null;
}

function defaultSdkCandidates(env, homeDir) {
  return unique([
    env.ANDROID_SDK_ROOT,
    env.ANDROID_HOME,
    path.join(homeDir, "Library", "Android", "sdk"),
    path.join(homeDir, "Android", "Sdk"),
  ]);
}

function hasAndroidTools(sdkRoot, exists) {
  return (
    exists(path.join(sdkRoot, "platform-tools", "adb")) &&
    exists(path.join(sdkRoot, "emulator", "emulator"))
  );
}

function findAndroidSdkRoot(options = {}) {
  const env = options.env ?? process.env;
  const homeDir = options.homeDir ?? os.homedir();
  const exists = options.exists ?? fs.existsSync;
  const candidates =
    options.sdkCandidates ?? defaultSdkCandidates(env, homeDir);

  return unique(candidates).find((candidate) =>
    hasAndroidTools(candidate, exists),
  );
}

function defaultJavaCandidates(env, homeDir, platform = process.platform) {
  const candidates = [env.JAVA_HOME];

  if (platform === "darwin") {
    candidates.push(
      "/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home",
      "/usr/local/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home",
      "/Library/Java/JavaVirtualMachines/jdk-17.jdk/Contents/Home",
    );
  } else {
    candidates.push(
      "/usr/lib/jvm/java-17-openjdk",
      "/usr/lib/jvm/java-17-openjdk-amd64",
      "/usr/lib/jvm/jdk-17",
    );
  }

  candidates.push(
    path.join(homeDir, ".sdkman", "candidates", "java", "17.0.0-tem"),
    path.join(homeDir, ".sdkman", "candidates", "java", "current"),
  );

  return unique(candidates);
}

function defaultAndroidArchitectures(architecture = process.arch) {
  return architecture === "arm64" ? "arm64-v8a" : "x86_64";
}

function findJavaHome(options = {}) {
  const env = options.env ?? process.env;
  const homeDir = options.homeDir ?? os.homedir();
  const platform = options.platform ?? process.platform;
  const exists = options.exists ?? fs.existsSync;
  const run =
    options.run ??
    ((command) =>
      spawnSync(command, ["-version"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }));
  const candidates =
    options.candidates ?? defaultJavaCandidates(env, homeDir, platform);

  for (const candidate of unique(candidates)) {
    const javaBinary = path.join(candidate, "bin", "java");
    if (!exists(javaBinary)) continue;

    const result = run(javaBinary);
    const versionOutput = `${result?.stdout ?? ""}\n${result?.stderr ?? ""}`;
    if (result?.status === 0 && (parseJavaMajor(versionOutput) ?? 0) >= 17) {
      return candidate;
    }
  }

  return undefined;
}

function createAndroidEnvironment(options = {}) {
  const baseEnvironment = { ...(options.env ?? process.env) };
  const sdkRoot = findAndroidSdkRoot({
    ...options,
    env: baseEnvironment,
  });
  if (!sdkRoot) {
    throw new Error(
      "Android SDK tools were not found. Set ANDROID_SDK_ROOT or ANDROID_HOME to an SDK containing platform-tools/adb and emulator/emulator.",
    );
  }

  const javaHome = findJavaHome({
    ...options,
    env: baseEnvironment,
    candidates: options.javaCandidates,
    run: options.javaRun,
  });
  if (!javaHome) {
    throw new Error(
      "Java 17 or later is required for Android builds. Set JAVA_HOME to a JDK 17+ installation.",
    );
  }

  const pathEntries = [
    path.join(sdkRoot, "platform-tools"),
    path.join(sdkRoot, "emulator"),
    path.join(javaHome, "bin"),
    baseEnvironment.PATH,
  ].filter(Boolean);

  return {
    ...baseEnvironment,
    ANDROID_HOME: sdkRoot,
    ANDROID_SDK_ROOT: sdkRoot,
    JAVA_HOME: javaHome,
    REACT_NATIVE_ARCHITECTURES:
      baseEnvironment.REACT_NATIVE_ARCHITECTURES ??
      options.nativeArchitectures ??
      defaultAndroidArchitectures(options.architecture),
    PATH: pathEntries.join(path.delimiter),
  };
}

function waitForMetro(options = {}) {
  const port = options.port ?? 8081;
  const host = options.host ?? "127.0.0.1";
  const timeoutMs = options.timeoutMs ?? 60_000;
  const request =
    options.request ??
    ((url) =>
      new Promise((resolve, reject) => {
        const req = http.get(url, (response) => {
          response.resume();
          response.once("end", () => resolve(response.statusCode === 200));
        });
        req.once("error", reject);
      }));

  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    let timer;

    const poll = async () => {
      try {
        if (await request(`http://${host}:${port}/status`)) {
          if (timer) clearTimeout(timer);
          resolve();
          return;
        }
      } catch {
        // Metro is still starting.
      }

      if (Date.now() >= deadline) {
        if (timer) clearTimeout(timer);
        reject(new Error(`Metro did not become ready on ${host}:${port}.`));
        return;
      }
      timer = setTimeout(poll, 500);
    };

    void poll();
  });
}

function startMetro(environment, options = {}) {
  const port = options.port ?? 8081;
  const expoCli = require.resolve("expo/bin/cli", { paths: [mobileRoot] });
  const metroEnvironment = {
    ...environment,
    NODE_ENV: "development",
    EXPO_PUBLIC_STREAMER_E2E: "true",
    REACT_NATIVE_PACKAGER_HOSTNAME: "10.0.2.2",
  };
  const metro = spawn(
    process.execPath,
    [expoCli, "start", "--dev-client", "--port", String(port), "--host", "lan"],
    {
      cwd: mobileRoot,
      env: metroEnvironment,
      stdio: "inherit",
    },
  );

  let startupError;
  const onError = (error) => {
    startupError = error;
  };
  const onExit = (code) => {
    if (code !== null && code !== 0) {
      startupError = new Error(
        `Metro exited before Detox started (code ${code}).`,
      );
    }
  };
  metro.once("error", onError);
  metro.once("exit", onExit);

  return waitForMetro({ port }).then(
    () => {
      metro.off("error", onError);
      metro.off("exit", onExit);
      if (startupError) throw startupError;
      return metro;
    },
    async (error) => {
      await stopChild(metro);
      throw startupError || error;
    },
  );
}

function stopChild(child) {
  if (!child || child.exitCode !== null) return Promise.resolve();
  child.kill("SIGINT");
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve();
    }, 2_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function runDetox(args) {
  const androidGradle = path.join(mobileRoot, "android", "gradlew");
  if (!fs.existsSync(androidGradle)) {
    throw new Error(
      "The Android native project is missing. Run `npx expo prebuild --platform android --no-install` from apps/mobile first.",
    );
  }

  const environment = createAndroidEnvironment();
  const detoxCli = require.resolve("detox/local-cli/cli.js", {
    paths: [mobileRoot],
  });

  console.log(
    "[android-detox] Android toolchain ready (Java 17+ and Android SDK tools found)",
  );

  const metro = args[0] === "test" ? await startMetro(environment) : null;
  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [detoxCli, ...args], {
        cwd: mobileRoot,
        env: {
          ...environment,
          ...(metro ? { EXPO_PUBLIC_STREAMER_E2E: "true" } : {}),
        },
        stdio: "inherit",
      });

      child.once("error", reject);
      child.once("exit", (code, signal) => {
        if (signal) {
          resolve(128);
        } else {
          resolve(code ?? 1);
        }
      });
    });
  } finally {
    await stopChild(metro);
  }
}

if (require.main === module) {
  runDetox(process.argv.slice(2))
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error(`[android-detox] ${error.message || error}`);
      process.exitCode = 1;
    });
}

module.exports = {
  createAndroidEnvironment,
  defaultJavaCandidates,
  defaultAndroidArchitectures,
  defaultSdkCandidates,
  findAndroidSdkRoot,
  findJavaHome,
  parseJavaMajor,
  startMetro,
  stopChild,
  waitForMetro,
  runDetox,
};
