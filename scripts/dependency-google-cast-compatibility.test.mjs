import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { withPlugins } from "expo/config-plugins";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const mobileProjectRoot = resolve(repoRoot, "apps/mobile");
const expectedCastFrameworkVersion = "22.3.1";

function readMobileAppConfig() {
  return JSON.parse(
    readFileSync(resolve(mobileProjectRoot, "app.json"), "utf8"),
  ).expo;
}

async function renderAndroidGradleMod(config, modName, contents) {
  const mod = config.mods?.android?.[modName];
  assert.equal(typeof mod, "function", `Android ${modName} mod must exist`);

  const modRequest = {
    projectRoot: mobileProjectRoot,
    platformProjectRoot: resolve(mobileProjectRoot, "android"),
    platform: "android",
    modName,
    introspect: true,
    ignoreExistingNativeFiles: false,
  };
  const result = await mod({
    ...config,
    modResults: { language: "groovy", contents },
    modRequest,
    modRawConfig: config,
  });

  return result.modResults.contents;
}

test("Google Cast emits its pinned version into both Android Gradle files", async () => {
  const mobileConfig = readMobileAppConfig();
  const googleCastPlugin = mobileConfig.plugins.find(
    (plugin) =>
      Array.isArray(plugin) && plugin[0] === "react-native-google-cast",
  );

  assert.ok(googleCastPlugin, "Android Google Cast plugin must be configured");
  assert.equal(
    googleCastPlugin[1]?.androidPlayServicesCastFrameworkVersion,
    expectedCastFrameworkVersion,
  );

  const config = withPlugins(
    {
      name: mobileConfig.name,
      slug: mobileConfig.slug,
      _internal: { projectRoot: mobileProjectRoot },
    },
    [googleCastPlugin],
  );
  const projectGradle = await renderAndroidGradleMod(
    config,
    "projectBuildGradle",
    "buildscript {\n}\n",
  );
  const appGradle = await renderAndroidGradleMod(
    config,
    "appBuildGradle",
    "apply plugin: 'com.android.application'\n\ndependencies {\n}\n",
  );

  assert.match(projectGradle, /castFrameworkVersion = "22\.3\.1"/);
  assert.match(
    appGradle,
    /implementation "com\.google\.android\.gms:play-services-cast-framework:\$\{safeExtGet\('castFrameworkVersion', '22\.3\.1'\)\}"/,
  );
});
