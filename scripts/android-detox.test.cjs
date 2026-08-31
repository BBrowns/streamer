"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const detoxConfig = require("../apps/mobile/.detoxrc.js");
const {
  createAndroidEnvironment,
  defaultAndroidArchitectures,
  findAndroidSdkRoot,
  findJavaHome,
  parseJavaMajor,
} = require("./android-detox.cjs");

test("parses modern and legacy Java version output", () => {
  assert.equal(parseJavaMajor('openjdk version "17.0.20.1"'), 17);
  assert.equal(parseJavaMajor('java version "12.0.1"'), 12);
  assert.equal(parseJavaMajor('java version "1.8.0_402"'), 8);
  assert.equal(parseJavaMajor("not Java output"), null);
});

test("selects the native ABI that matches the host emulator", () => {
  assert.equal(defaultAndroidArchitectures("arm64"), "arm64-v8a");
  assert.equal(defaultAndroidArchitectures("x64"), "x86_64");
});

test("prefers a configured Android SDK with both required tools", () => {
  const sdkRoot = path.resolve("/sdk/configured");
  const fallbackRoot = path.resolve("/sdk/fallback");
  const existing = new Set([
    path.join(sdkRoot, "platform-tools", "adb"),
    path.join(sdkRoot, "emulator", "emulator"),
    path.join(fallbackRoot, "platform-tools", "adb"),
    path.join(fallbackRoot, "emulator", "emulator"),
  ]);

  assert.equal(
    findAndroidSdkRoot({
      env: { ANDROID_SDK_ROOT: sdkRoot },
      homeDir: "/Users/tester",
      exists: (candidate) => existing.has(candidate),
    }),
    sdkRoot,
  );
});

test("selects a Java 17 installation when the active JVM is too old", () => {
  const oldHome = path.resolve("/java/12");
  const modernHome = path.resolve("/usr/local/opt/openjdk@17");
  const versions = new Map([
    [path.join(oldHome, "bin", "java"), 'java version "12.0.1"'],
    [path.join(modernHome, "bin", "java"), 'openjdk version "17.0.20.1"'],
  ]);

  assert.equal(
    findJavaHome({
      env: { JAVA_HOME: oldHome },
      platform: "darwin",
      exists: (candidate) => versions.has(candidate),
      run: (command) => ({
        status: 0,
        stdout: versions.get(command) || "",
        stderr: "",
      }),
      candidates: [oldHome, modernHome],
    }),
    modernHome,
  );
});

test("exports both Android SDK variables and prepends toolchain paths", () => {
  const sdkRoot = path.resolve("/sdk");
  const javaHome = path.resolve("/java/17");
  const existing = new Set([
    path.join(sdkRoot, "platform-tools", "adb"),
    path.join(sdkRoot, "emulator", "emulator"),
    path.join(javaHome, "bin", "java"),
  ]);

  const environment = createAndroidEnvironment({
    env: { PATH: "/usr/bin" },
    homeDir: "/Users/tester",
    exists: (candidate) => existing.has(candidate),
    javaCandidates: [javaHome],
    architecture: "x64",
    javaRun: () => ({
      status: 0,
      stdout: 'openjdk version "17.0.20.1"',
      stderr: "",
    }),
    sdkCandidates: [sdkRoot],
  });

  assert.equal(environment.ANDROID_HOME, sdkRoot);
  assert.equal(environment.ANDROID_SDK_ROOT, sdkRoot);
  assert.equal(environment.JAVA_HOME, javaHome);
  assert.equal(environment.REACT_NATIVE_ARCHITECTURES, "x86_64");
  assert.equal(
    environment.PATH,
    [
      path.join(sdkRoot, "platform-tools"),
      path.join(sdkRoot, "emulator"),
      path.join(javaHome, "bin"),
      "/usr/bin",
    ].join(path.delimiter),
  );
});

test("keeps the Android Detox build focused on the configured emulator", () => {
  const buildCommand = detoxConfig.apps["android.debug"].build;

  assert.match(
    buildCommand,
    /-PreactNativeArchitectures=\$\{REACT_NATIVE_ARCHITECTURES:-x86_64\}/,
  );
  assert.match(
    buildCommand,
    /:app:assembleDebug :app:assembleDebugAndroidTest/,
  );
  assert.doesNotMatch(buildCommand, /(^|\s)assembleAndroidTest(\s|$)/);
  assert.match(buildCommand, /-Xmx4096m/);
  assert.match(buildCommand, /--max-workers=2/);
});
