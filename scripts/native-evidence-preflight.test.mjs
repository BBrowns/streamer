import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import {
  collectNativeEvidencePreflight,
  findAndroidAvd,
  formatNativeEvidencePreflight,
  nativeEvidenceStatus,
  parseDetoxTargets,
} from "./native-evidence-preflight.mjs";

function successful(stdout = "") {
  return { ok: true, status: 0, stdout, stderr: "", error: undefined };
}

function unavailable(error = "ENOENT") {
  return { ok: false, status: null, stdout: "", stderr: "", error };
}

function createRunner(responses) {
  return (command, args) => {
    const key = `${command} ${args.join(" ")}`;
    return responses[key] ?? unavailable();
  };
}

const targets = {
  iosDeviceName: "iPhone 15",
  androidAvdName: "Pixel_3a_API_34_extension_level_7_x86_64",
  configurationLoaded: true,
};

function committedDetoxTargets() {
  return {
    apps: {
      "ios.debug": {},
      "android.debug": {},
    },
    devices: {
      simulator: {
        type: "ios.simulator",
        device: { type: "iPhone 15" },
      },
      emulator: {
        type: "android.emulator",
        device: { avdName: "Pixel_3a_API_34_extension_level_7_x86_64" },
      },
    },
    configurations: {
      "ios.sim.debug": { device: "simulator", app: "ios.debug" },
      "android.emu.debug": { device: "emulator", app: "android.debug" },
    },
  };
}

test("requires a matching AVD descriptor and configuration instead of stale markers", () => {
  const root = "/deterministic/android-avd";
  const avdName = "Streamer_Test_Device";
  const descriptor = join(root, `${avdName}.ini`);
  const directory = join(root, `${avdName}.avd`);
  const configuration = join(directory, "config.ini");
  const avdExists = (paths) => (candidate) => paths.has(candidate);

  assert.equal(
    findAndroidAvd({}, avdName, {
      roots: [root],
      existsSyncImpl: avdExists(new Set([descriptor])),
    }),
    false,
    "a stale .ini cannot make Android Ready",
  );
  assert.equal(
    findAndroidAvd({}, avdName, {
      roots: [root],
      existsSyncImpl: avdExists(new Set([descriptor, directory])),
    }),
    false,
    "an empty .avd directory cannot make Android Ready",
  );
  assert.equal(
    findAndroidAvd({}, avdName, {
      roots: [root],
      existsSyncImpl: avdExists(
        new Set([descriptor, directory, configuration]),
      ),
    }),
    true,
  );
});

test("parses both required Detox targets before preflight can inspect platforms", () => {
  const parsed = parseDetoxTargets(committedDetoxTargets());

  assert.deepEqual(parsed, targets);
});

test("blocks both native targets without running commands for incomplete Detox targets", () => {
  const invalidTargets = parseDetoxTargets({
    apps: {},
    devices: {},
    configurations: {},
  });
  let commandsRun = 0;
  const report = collectNativeEvidencePreflight({
    targets: invalidTargets,
    env: {},
    androidAvailability: {
      adb: { available: true, source: "PATH" },
      emulator: { available: true, source: "PATH" },
      matchingAvd: true,
    },
    run() {
      commandsRun += 1;
      throw new Error(
        "preflight must not inspect platforms with invalid targets",
      );
    },
  });

  assert.equal(invalidTargets.configurationLoaded, false);
  assert.match(
    invalidTargets.configurationError,
    /Missing required Detox target "ios\.sim\.debug"/,
  );
  assert.match(
    invalidTargets.configurationError,
    /Missing required Detox target "android\.emu\.debug"/,
  );
  assert.equal(commandsRun, 0);
  assert.equal(report.ios.status, nativeEvidenceStatus.blocked);
  assert.equal(report.android.status, nativeEvidenceStatus.blocked);
  assert.match(
    report.ios.summary,
    /Platform prerequisite commands were not run/,
  );
  assert.match(
    formatNativeEvidencePreflight(report),
    /Detox configuration: Detox configuration is incomplete/,
  );
});

test("reports ready simulator and emulator prerequisites without claiming a native pass", () => {
  const report = collectNativeEvidencePreflight({
    targets,
    env: {},
    generatedIosProjectExists: true,
    androidAvailability: {
      adb: { available: true, source: "PATH" },
      emulator: { available: true, source: "PATH" },
      matchingAvd: true,
    },
    run: createRunner({
      "xcodebuild -version": successful("Xcode 26.6\nBuild version 17F113"),
      "xcrun --find simctl": successful("/usr/bin/simctl"),
      "xcrun simctl list runtimes --json": successful(
        JSON.stringify({
          runtimes: [{ name: "iOS 26.5", isAvailable: true }],
        }),
      ),
      "xcrun simctl list devices available --json": successful(
        JSON.stringify({
          devices: {
            "com.apple.CoreSimulator.SimRuntime.iOS-26-5": [
              { name: "Iphone 15", isAvailable: true, state: "Shutdown" },
            ],
          },
        }),
      ),
      "xcodebuild -showsdks": successful(
        "iOS Simulator SDKs:\n\tSimulator - iOS 26.5 -sdk iphonesimulator26.5",
      ),
    }),
  });

  assert.equal(report.mode, "read-only");
  assert.equal(report.ios.status, nativeEvidenceStatus.ready);
  assert.equal(report.android.status, nativeEvidenceStatus.ready);
  assert.equal(report.ios.matchingDeviceCount, 1);
  assert.equal(report.ios.bootableConfiguredDevice, true);
  assert.equal(report.android.matchingAvd, true);
  assert.match(
    report.conclusion,
    /Native test execution remains a separate, unrun evidence step/,
  );
});

test("does not treat a case-insensitive iPhone name on a different runtime as a matching SDK target", () => {
  const report = collectNativeEvidencePreflight({
    targets,
    env: {},
    generatedIosProjectExists: true,
    androidAvailability: {
      adb: { available: false },
      emulator: { available: false },
      matchingAvd: false,
    },
    run: createRunner({
      "xcodebuild -version": successful("Xcode 26.6"),
      "xcrun --find simctl": successful("/usr/bin/simctl"),
      "xcrun simctl list runtimes --json": successful(
        JSON.stringify({
          runtimes: [
            {
              identifier: "com.apple.CoreSimulator.SimRuntime.iOS-17-2",
              name: "iOS 17.2",
              isAvailable: true,
            },
          ],
        }),
      ),
      "xcrun simctl list devices available --json": successful(
        JSON.stringify({
          devices: {
            "com.apple.CoreSimulator.SimRuntime.iOS-17-2": [
              { name: "Iphone 15", isAvailable: true },
            ],
          },
        }),
      ),
      "xcodebuild -showsdks": successful(
        "iOS Simulator SDKs:\n\tSimulator - iOS 26.5 -sdk iphonesimulator26.5",
      ),
    }),
  });

  assert.equal(report.ios.configuredDeviceCount, 1);
  assert.equal(report.ios.matchingDeviceCount, 0);
  assert.equal(report.ios.requiredRuntime, "iOS 26.5");
  assert.equal(report.ios.status, nativeEvidenceStatus.blocked);
});

test("blocks iOS when the requested runtime or bootable Detox device is absent", () => {
  const report = collectNativeEvidencePreflight({
    targets,
    env: { STREAMER_IOS_SIMULATOR_RUNTIME: "iOS 26.5" },
    generatedIosProjectExists: true,
    androidAvailability: {
      adb: { available: false },
      emulator: { available: false },
      matchingAvd: false,
    },
    run: createRunner({
      "xcodebuild -version": successful("Xcode 26.6"),
      "xcrun --find simctl": successful("/usr/bin/simctl"),
      "xcrun simctl list runtimes --json": successful(
        JSON.stringify({
          runtimes: [{ name: "iOS 26.2", isAvailable: true }],
        }),
      ),
      "xcrun simctl list devices available --json": successful(
        JSON.stringify({ devices: {} }),
      ),
      "xcodebuild -showsdks": successful(
        "iOS Simulator SDKs:\n\tSimulator - iOS 26.2",
      ),
    }),
  });

  assert.equal(report.ios.status, nativeEvidenceStatus.blocked);
  assert.equal(report.ios.requiredRuntime, "iOS 26.5");
  assert.equal(report.ios.matchingDeviceCount, 0);
  assert.match(
    report.ios.actions.join("\n"),
    /Install the requested iOS 26\.5/,
  );
  assert.match(
    report.ios.actions.join("\n"),
    /Create or download an available iPhone 15/,
  );
});

test("marks Android not run when its SDK tools are absent and keeps physical targets untouched", () => {
  const report = collectNativeEvidencePreflight({
    targets,
    env: {},
    androidAvailability: {
      adb: { available: false },
      emulator: { available: false },
      matchingAvd: false,
    },
    run: createRunner({
      "xcodebuild -version": unavailable(),
      "xcrun --find simctl": unavailable(),
    }),
  });

  assert.equal(report.android.status, nativeEvidenceStatus.notRun);
  assert.equal(report.android.matchingAvd, false);
  assert.match(report.android.actions.join("\n"), /platform-tools/);
  assert.match(report.android.actions.join("\n"), /Android Emulator/);
  assert.equal(report.physicalDevices[0].status, nativeEvidenceStatus.notRun);
  assert.match(report.physicalDevices[1].summary, /does not call adb devices/);
  assert.match(
    formatNativeEvidencePreflight(report),
    /Android Emulator: Not run/,
  );
});

test("never executes Android tooling while collecting a read-only preflight", () => {
  const commands = [];
  collectNativeEvidencePreflight({
    targets,
    env: {},
    androidAvailability: {
      adb: { available: true, source: "Android SDK" },
      emulator: { available: true, source: "Android SDK" },
      matchingAvd: true,
    },
    run(command, args) {
      commands.push([command, ...args].join(" "));
      return unavailable();
    },
  });

  assert.equal(
    commands.some((command) => /(^|\s)(adb|emulator)(\s|$)/.test(command)),
    false,
  );
});
