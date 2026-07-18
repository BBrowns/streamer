#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const mobileRoot = join(repoRoot, "apps", "mobile");
const require = createRequire(import.meta.url);

export const nativeEvidenceStatus = Object.freeze({
  ready: "Ready",
  blocked: "Blocked",
  notRun: "Not run",
});

const commandTimeoutMs = 10_000;

function cleanText(value) {
  return String(value ?? "").trim();
}

function isAvailableSimulatorRecord(record) {
  if (!record || record.isAvailable === false) return false;
  return !/unavailable/i.test(String(record.availability ?? ""));
}

function normalizeSimulatorDeviceName(name) {
  return String(name ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en-US");
}

function availableSimulatorDevices(payload) {
  return Object.entries(payload?.devices ?? {}).flatMap(
    ([runtimeIdentifier, devices]) =>
      Array.isArray(devices)
        ? devices
            .filter(isAvailableSimulatorRecord)
            .map((device) => ({ ...device, runtimeIdentifier }))
        : [],
  );
}

function availableIosRuntimes(payload) {
  return (payload?.runtimes ?? []).filter(
    (runtime) =>
      isAvailableSimulatorRecord(runtime) &&
      /\bios\b/i.test(runtime.name ?? ""),
  );
}

function parseJson(output) {
  try {
    return JSON.parse(output);
  } catch {
    return undefined;
  }
}

function iosSimulatorSdkVersion(output) {
  const matches = [
    ...String(output ?? "").matchAll(/-sdk\s+iphonesimulator([\d.]+)/gi),
  ];
  return matches.at(-1)?.[1];
}

function runtimeMatchesName(runtime, runtimeName) {
  return (
    normalizeSimulatorDeviceName(runtime?.name) ===
    normalizeSimulatorDeviceName(runtimeName)
  );
}

function findExistingPath(candidates) {
  return candidates.find((candidate) => candidate && existsSync(candidate));
}

function androidToolCandidates(env, tool) {
  const sdkRoots = [
    env.ANDROID_SDK_ROOT,
    env.ANDROID_HOME,
    join(homedir(), "Library", "Android", "sdk"),
    join(homedir(), "Android", "Sdk"),
  ];
  const relativeToolPath =
    tool === "adb" ? ["platform-tools", "adb"] : ["emulator", "emulator"];

  return sdkRoots.map((sdkRoot) =>
    sdkRoot ? join(sdkRoot, ...relativeToolPath) : undefined,
  );
}

function pathToolCandidates(env, tool) {
  return String(env.PATH ?? "")
    .split(process.platform === "win32" ? ";" : ":")
    .filter(Boolean)
    .map((directory) => join(directory, tool));
}

function findAndroidTool(env, tool) {
  const fromSdk = findExistingPath(androidToolCandidates(env, tool));
  if (fromSdk) return { available: true, source: "Android SDK" };

  const fromPath = findExistingPath(pathToolCandidates(env, tool));
  return fromPath
    ? { available: true, source: "PATH" }
    : { available: false, source: undefined };
}

/**
 * An AVD's `.ini` file alone is not enough evidence that the configured
 * emulator can start. It is commonly left behind after an AVD is deleted.
 * Likewise, an empty `.avd` directory is only a partial creation. Require the
 * descriptor and the actual device configuration, without invoking any
 * Android tooling.
 */
export function findAndroidAvd(env, avdName, options = {}) {
  const roots =
    options.roots ??
    [env.ANDROID_AVD_HOME, join(homedir(), ".android", "avd")].filter(Boolean);
  const pathExists = options.existsSyncImpl ?? existsSync;

  return roots.some((root) => {
    const descriptor = join(root, `${avdName}.ini`);
    const configuration = join(root, `${avdName}.avd`, "config.ini");
    return pathExists(descriptor) && pathExists(configuration);
  });
}

export function runReadOnlyCommand(command, args, options = {}) {
  const spawn = options.spawnSyncImpl ?? spawnSync;
  const result = spawn(command, args, {
    cwd: options.cwd ?? repoRoot,
    encoding: "utf8",
    timeout: options.timeoutMs ?? commandTimeoutMs,
    windowsHide: true,
  });

  return {
    command: [command, ...args],
    ok: result.status === 0 && !result.error,
    status: result.status,
    stdout: cleanText(result.stdout),
    stderr: cleanText(result.stderr),
    error: result.error?.code ?? result.error?.message,
  };
}

const fallbackDetoxTargets = Object.freeze({
  iosDeviceName: "iPhone 15",
  androidAvdName: "Pixel_3a_API_34_extension_level_7_x86_64",
  configurationLoaded: false,
});

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function invalidDetoxTargets(errors) {
  return {
    ...fallbackDetoxTargets,
    configurationError: `Detox configuration is incomplete: ${errors.join(" ")}`,
  };
}

/**
 * Parse only the two committed Detox targets we can meaningfully preflight.
 * A successful `require()` is not enough: optional chaining previously made a
 * missing target look configured and allowed a false Ready result.
 */
export function parseDetoxTargets(detoxConfig) {
  const errors = [];
  const configurations = detoxConfig?.configurations;
  const devices = detoxConfig?.devices;
  const apps = detoxConfig?.apps;
  const iosConfiguration = configurations?.["ios.sim.debug"];
  const androidConfiguration = configurations?.["android.emu.debug"];

  if (!iosConfiguration || typeof iosConfiguration !== "object") {
    errors.push('Missing required Detox target "ios.sim.debug".');
  }
  if (!androidConfiguration || typeof androidConfiguration !== "object") {
    errors.push('Missing required Detox target "android.emu.debug".');
  }

  const iosDeviceKey = iosConfiguration?.device;
  const androidDeviceKey = androidConfiguration?.device;
  const iosAppKey = iosConfiguration?.app;
  const androidAppKey = androidConfiguration?.app;
  const iosDevice = isNonEmptyString(iosDeviceKey)
    ? devices?.[iosDeviceKey]
    : undefined;
  const androidDevice = isNonEmptyString(androidDeviceKey)
    ? devices?.[androidDeviceKey]
    : undefined;

  if (iosConfiguration && !isNonEmptyString(iosDeviceKey)) {
    errors.push('Detox target "ios.sim.debug" must name a device.');
  }
  if (androidConfiguration && !isNonEmptyString(androidDeviceKey)) {
    errors.push('Detox target "android.emu.debug" must name a device.');
  }
  if (iosConfiguration && !isNonEmptyString(iosAppKey)) {
    errors.push('Detox target "ios.sim.debug" must name an app.');
  }
  if (androidConfiguration && !isNonEmptyString(androidAppKey)) {
    errors.push('Detox target "android.emu.debug" must name an app.');
  }
  if (isNonEmptyString(iosAppKey) && !apps?.[iosAppKey]) {
    errors.push(
      `Detox target "ios.sim.debug" references missing app "${iosAppKey}".`,
    );
  }
  if (isNonEmptyString(androidAppKey) && !apps?.[androidAppKey]) {
    errors.push(
      `Detox target "android.emu.debug" references missing app "${androidAppKey}".`,
    );
  }
  if (!iosDevice || iosDevice.type !== "ios.simulator") {
    errors.push(
      'Detox target "ios.sim.debug" must reference an ios.simulator device.',
    );
  }
  if (!androidDevice || androidDevice.type !== "android.emulator") {
    errors.push(
      'Detox target "android.emu.debug" must reference an android.emulator device.',
    );
  }

  const iosDeviceName = iosDevice?.device?.type;
  const androidAvdName = androidDevice?.device?.avdName;
  if (!isNonEmptyString(iosDeviceName)) {
    errors.push(
      "Detox ios.sim.debug device must provide a simulator device type.",
    );
  }
  if (!isNonEmptyString(androidAvdName)) {
    errors.push("Detox android.emu.debug device must provide an AVD name.");
  }

  if (errors.length > 0) return invalidDetoxTargets(errors);

  return {
    iosDeviceName,
    androidAvdName,
    configurationLoaded: true,
  };
}

export function loadDetoxTargets() {
  try {
    return parseDetoxTargets(require(join(mobileRoot, ".detoxrc.js")));
  } catch {
    return {
      ...fallbackDetoxTargets,
      configurationError: "Unable to read the committed Detox configuration.",
    };
  }
}

function detoxTargetConfigurationError(targets) {
  if (targets?.configurationLoaded !== true) {
    return (
      targets.configurationError ??
      "The committed Detox configuration did not provide both required targets."
    );
  }

  if (
    !isNonEmptyString(targets?.iosDeviceName) ||
    !isNonEmptyString(targets?.androidAvdName)
  ) {
    return "The Detox target names are missing or invalid.";
  }

  return undefined;
}

function describeCommand(result) {
  if (result.ok) return undefined;
  return result.error === "ENOENT" ? "not installed" : "did not complete";
}

function commandEvidence(result) {
  return {
    command: Array.isArray(result.command)
      ? result.command.join(" ")
      : "command result supplied by test runner",
    ok: result.ok,
    exitCode: result.status ?? undefined,
    failure: result.ok ? undefined : "Command failed or was unavailable.",
  };
}

function blockedForDetoxConfiguration(targets, configurationError) {
  const skippedSummary = `Blocked: ${configurationError} Platform prerequisite commands were not run.`;

  return {
    ios: {
      status: nativeEvidenceStatus.blocked,
      target: "iOS Simulator",
      configuredDevice:
        targets?.iosDeviceName ?? fallbackDetoxTargets.iosDeviceName,
      generatedProjectExists: undefined,
      summary: skippedSummary,
      configurationError,
      availableRuntimes: [],
      configuredDeviceCount: 0,
      matchingDeviceCount: 0,
      bootableConfiguredDevice: false,
      simulatorPrerequisitesReady: false,
      iphonesimulatorSdkAvailable: undefined,
      actions: [
        "Repair the committed Detox ios.sim.debug and android.emu.debug target definitions, then rerun this preflight.",
      ],
      checks: {},
    },
    android: {
      status: nativeEvidenceStatus.blocked,
      target: "Android Emulator",
      configuredAvd:
        targets?.androidAvdName ?? fallbackDetoxTargets.androidAvdName,
      sdkConfigured: undefined,
      matchingAvd: false,
      summary: skippedSummary,
      configurationError,
      actions: [
        "Repair the committed Detox ios.sim.debug and android.emu.debug target definitions, then rerun this preflight.",
      ],
      checks: {},
    },
  };
}

function checkIos({ run, targets, env, generatedProjectExists }) {
  const xcode = run("xcodebuild", ["-version"]);
  const simctl = run("xcrun", ["--find", "simctl"]);
  const hasGeneratedProject =
    generatedProjectExists ?? existsSync(join(mobileRoot, "ios"));

  if (!xcode.ok || !simctl.ok) {
    const missing = [
      !xcode.ok ? `xcodebuild (${describeCommand(xcode)})` : undefined,
      !simctl.ok ? `xcrun simctl (${describeCommand(simctl)})` : undefined,
    ].filter(Boolean);

    return {
      status: nativeEvidenceStatus.blocked,
      target: "iOS Simulator",
      configuredDevice: targets.iosDeviceName,
      generatedProjectExists: hasGeneratedProject,
      summary: `Blocked: ${missing.join("; ")}.`,
      actions: [
        "Install or select a complete Xcode installation, then rerun this preflight.",
      ],
      checks: {
        xcode: commandEvidence(xcode),
        simctl: commandEvidence(simctl),
      },
    };
  }

  const runtimes = run("xcrun", ["simctl", "list", "runtimes", "--json"]);
  const devices = run("xcrun", [
    "simctl",
    "list",
    "devices",
    "available",
    "--json",
  ]);
  const sdk = run("xcodebuild", ["-showsdks"]);
  const runtimePayload = runtimes.ok ? parseJson(runtimes.stdout) : undefined;
  const devicePayload = devices.ok ? parseJson(devices.stdout) : undefined;
  const iosRuntimes = availableIosRuntimes(runtimePayload);
  const configuredDevices = availableSimulatorDevices(devicePayload).filter(
    (device) =>
      normalizeSimulatorDeviceName(device.name) ===
      normalizeSimulatorDeviceName(targets.iosDeviceName),
  );
  const iphonesimulatorSdkAvailable = /iphonesimulator|ios simulator/i.test(
    sdk.stdout,
  );
  const requestedRuntime = cleanText(env.STREAMER_IOS_SIMULATOR_RUNTIME);
  const sdkRuntimeVersion = iosSimulatorSdkVersion(sdk.stdout);
  const requiredRuntime =
    requestedRuntime ||
    (sdkRuntimeVersion ? `iOS ${sdkRuntimeVersion}` : undefined);
  const matchingRuntime = requiredRuntime
    ? iosRuntimes.find((runtime) =>
        runtimeMatchesName(runtime, requiredRuntime),
      )
    : iosRuntimes[0];
  const matchingDevices = matchingRuntime
    ? configuredDevices.filter(
        (device) =>
          !matchingRuntime.identifier ||
          device.runtimeIdentifier === matchingRuntime.identifier,
      )
    : [];
  const simulatorPrerequisitesReady = Boolean(
    runtimes.ok &&
    devices.ok &&
    sdk.ok &&
    matchingRuntime &&
    matchingDevices.length > 0 &&
    iphonesimulatorSdkAvailable,
  );
  const preflightReady = simulatorPrerequisitesReady && hasGeneratedProject;
  const actions = [];

  if (!runtimes.ok || !runtimePayload) {
    actions.push(
      "Repair the CoreSimulator runtime list, then rerun this preflight.",
    );
  } else if (!matchingRuntime) {
    actions.push(
      requiredRuntime
        ? `Install the requested ${requiredRuntime} simulator runtime in Xcode.`
        : sdkRuntimeVersion
          ? `Install the iOS ${sdkRuntimeVersion} simulator runtime that matches the installed iPhoneSimulator SDK.`
          : "Install an available iOS simulator runtime in Xcode.",
    );
  }
  if (!devices.ok || !devicePayload || matchingDevices.length === 0) {
    actions.push(
      `Create or download an available ${targets.iosDeviceName} simulator${requiredRuntime ? ` for ${requiredRuntime}` : ""}.`,
    );
  }
  if (!sdk.ok || !iphonesimulatorSdkAvailable) {
    actions.push("Install an iPhoneSimulator SDK through Xcode.");
  }
  if (!hasGeneratedProject) {
    actions.push(
      "The committed Expo project has no generated ios/ directory, so this preflight cannot validate Xcode deployment settings. Use a disposable prebuild before a native smoke; do not infer a pass from this check.",
    );
  }

  return {
    status: preflightReady
      ? nativeEvidenceStatus.ready
      : nativeEvidenceStatus.blocked,
    target: "iOS Simulator",
    configuredDevice: targets.iosDeviceName,
    requiredRuntime: requiredRuntime || undefined,
    requiredRuntimeSource: requestedRuntime
      ? "STREAMER_IOS_SIMULATOR_RUNTIME"
      : sdkRuntimeVersion
        ? "installed iPhoneSimulator SDK"
        : undefined,
    generatedProjectExists: hasGeneratedProject,
    summary: preflightReady
      ? `Ready to attempt the configured ${targets.iosDeviceName} Detox simulator target. No native test has run.`
      : simulatorPrerequisitesReady
        ? `Blocked: the configured ${targets.iosDeviceName} simulator and SDK are available, but the generated Expo ios/ project is absent so deployment-setting compatibility is unverified.`
        : `Blocked: the configured ${targets.iosDeviceName} simulator cannot be proven bootable with the installed SDK/runtime.`,
    availableRuntimes: iosRuntimes.map((runtime) => runtime.name),
    configuredDeviceCount: configuredDevices.length,
    matchingDeviceCount: matchingDevices.length,
    bootableConfiguredDevice: matchingDevices.length > 0,
    simulatorPrerequisitesReady,
    iphonesimulatorSdkAvailable,
    actions,
    checks: {
      xcode: commandEvidence(xcode),
      simctl: commandEvidence(simctl),
      runtimes: commandEvidence(runtimes),
      devices: commandEvidence(devices),
      sdk: commandEvidence(sdk),
    },
  };
}

function checkAndroid({ targets, env, availability = {} }) {
  // Do not execute `emulator -version` or `emulator -list-avds` here. On some
  // hosts the emulator binary may attempt self-replacement/downloads before it
  // answers, which would violate this preflight's read-only contract.
  const adb = availability.adb ?? findAndroidTool(env, "adb");
  const emulator = availability.emulator ?? findAndroidTool(env, "emulator");
  const matchingAvd =
    availability.matchingAvd ?? findAndroidAvd(env, targets.androidAvdName);
  const sdkConfigured =
    availability.sdkConfigured ??
    Boolean(
      env.ANDROID_SDK_ROOT ||
      env.ANDROID_HOME ||
      adb.available ||
      emulator.available,
    );
  const ready = adb.available && emulator.available && matchingAvd;
  const actions = [];

  if (!adb.available) {
    actions.push(
      "Install Android platform-tools and make adb available through ANDROID_SDK_ROOT, ANDROID_HOME, or PATH.",
    );
  }
  if (!emulator.available) {
    actions.push(
      "Install Android Emulator tools and make emulator available through ANDROID_SDK_ROOT, ANDROID_HOME, or PATH.",
    );
  } else if (!matchingAvd) {
    actions.push(
      `Create the configured ${targets.androidAvdName} AVD (or update Detox deliberately) before attempting Android native tests.`,
    );
  }

  return {
    status: ready ? nativeEvidenceStatus.ready : nativeEvidenceStatus.notRun,
    target: "Android Emulator",
    configuredAvd: targets.androidAvdName,
    sdkConfigured,
    matchingAvd,
    summary: ready
      ? `Ready to attempt the configured ${targets.androidAvdName} Detox emulator target. No native test has run.`
      : "Not run: Android SDK, emulator, adb, or the configured AVD is unavailable for a native test.",
    actions,
    checks: {
      adb,
      emulator,
      avd: { available: matchingAvd },
    },
  };
}

export function collectNativeEvidencePreflight(input = {}) {
  const run =
    input.run ?? ((command, args) => runReadOnlyCommand(command, args));
  const env = input.env ?? process.env;
  const targets = input.targets ?? loadDetoxTargets();
  const configurationError = detoxTargetConfigurationError(targets);
  const blocked = configurationError
    ? blockedForDetoxConfiguration(targets, configurationError)
    : undefined;
  const ios =
    blocked?.ios ??
    checkIos({
      run,
      targets,
      env,
      generatedProjectExists: input.generatedIosProjectExists,
    });
  const android =
    blocked?.android ??
    checkAndroid({
      targets,
      env,
      availability: input.androidAvailability,
    });

  return {
    schemaVersion: 1,
    mode: "read-only",
    targets,
    ios,
    android,
    physicalDevices: [
      {
        target: "iPhone physical device",
        status: nativeEvidenceStatus.notRun,
        summary:
          "Not run: this preflight does not pair, query, or modify physical iOS devices.",
      },
      {
        target: "Android physical device",
        status: nativeEvidenceStatus.notRun,
        summary:
          "Not run: this preflight intentionally does not call adb devices or start an adb daemon.",
      },
    ],
    conclusion:
      ios.status === nativeEvidenceStatus.ready &&
      android.status === nativeEvidenceStatus.ready
        ? "Simulator/emulator prerequisites are present. Native test execution remains a separate, unrun evidence step."
        : "Native evidence is incomplete. This preflight reports prerequisites only and never changes a simulator, emulator, SDK, daemon, or physical device.",
  };
}

function formatBoolean(value) {
  if (value === undefined) return "not checked";
  return value ? "yes" : "no";
}

function formatActions(actions) {
  return actions?.length
    ? actions.map((action) => `  - ${action}`).join("\n")
    : "  - None. Execute the target-specific Detox smoke to produce native evidence.";
}

export function formatNativeEvidencePreflight(report) {
  const lines = [
    "Native evidence preflight (read-only)",
    "No simulator, emulator, adb daemon, SDK, or physical device was started or changed.",
    "",
    `${report.ios.target}: ${report.ios.status}`,
    `  ${report.ios.summary}`,
    `  Configured Detox device: ${report.ios.configuredDevice}`,
    report.ios.configurationError
      ? `  Detox configuration: ${report.ios.configurationError}`
      : undefined,
    `  Required runtime: ${report.ios.requiredRuntime ?? "not determined"}${report.ios.requiredRuntimeSource ? ` (${report.ios.requiredRuntimeSource})` : ""}`,
    `  Available iOS runtimes: ${report.ios.availableRuntimes?.join(", ") || "none detected"}`,
    `  Configured device count on any runtime: ${report.ios.configuredDeviceCount ?? 0}`,
    `  Matching available device count: ${report.ios.matchingDeviceCount ?? 0}`,
    `  Bootable configured device: ${formatBoolean(report.ios.bootableConfiguredDevice)}`,
    `  Simulator prerequisites: ${report.ios.simulatorPrerequisitesReady ? "present" : "incomplete"}`,
    `  iPhoneSimulator SDK available: ${formatBoolean(report.ios.iphonesimulatorSdkAvailable)}`,
    `  Generated ios/ project: ${formatBoolean(report.ios.generatedProjectExists)}`,
    "  Next actions:",
    formatActions(report.ios.actions),
    "",
    `${report.android.target}: ${report.android.status}`,
    `  ${report.android.summary}`,
    `  Configured Detox AVD: ${report.android.configuredAvd}`,
    report.android.configurationError
      ? `  Detox configuration: ${report.android.configurationError}`
      : undefined,
    `  Android SDK environment configured: ${formatBoolean(report.android.sdkConfigured)}`,
    `  Matching AVD available: ${formatBoolean(report.android.matchingAvd)}`,
    "  Next actions:",
    formatActions(report.android.actions),
    "",
    "Physical targets:",
    ...report.physicalDevices.map(
      (target) => `  - ${target.target}: ${target.status}. ${target.summary}`,
    ),
    "",
    `Conclusion: ${report.conclusion}`,
  ];

  return lines.filter(Boolean).join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = collectNativeEvidencePreflight();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatNativeEvidencePreflight(report));
  }
  // Missing native prerequisites are evidence findings, not a script failure.
  process.exitCode = 0;
}
