const {
  withAppBuildGradle,
  withDangerousMod,
  withProjectBuildGradle,
} = require("@expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

// Expo SDK 57's aggregate :expo library is also assembled for the Android
// instrumentation-test variant. Several Expo/RN modules contribute the same
// native runtime libraries there, so Gradle needs a deterministic winner.
const sharedNativeLibraries = [
  "**/libc++_shared.so",
  "**/libfabricjni.so",
  "**/libfbjni.so",
  "**/libfolly_json.so",
  "**/libfolly_runtime.so",
  "**/libglog.so",
  "**/libhermesvm.so",
  "**/libjscexecutor.so",
  "**/libjsi.so",
  "**/libreactnative.so",
  "**/libreactnativejni.so",
  "**/libreact_debug.so",
  "**/libreact_nativemodule_core.so",
  "**/libreact_utils.so",
  "**/libreact_render_debug.so",
  "**/libreact_render_graphics.so",
  "**/libreact_render_core.so",
  "**/libreact_render_componentregistry.so",
  "**/libreact_render_mapbuffer.so",
  "**/librrc_view.so",
  "**/libruntimeexecutor.so",
  "**/libyoga.so",
];

const detoxVersion = "20.51.4";

function androidDetoxTestSource(packageName) {
  return `// streamer: generated Detox Android test
package ${packageName};

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.filters.LargeTest;
import androidx.test.rule.ActivityTestRule;

import ${packageName}.MainActivity;
import com.wix.detox.Detox;
import com.wix.detox.config.DetoxConfig;

import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
@LargeTest
public class DetoxTest {
  @Rule
  public ActivityTestRule<MainActivity> activityRule =
      new ActivityTestRule<>(MainActivity.class, false, false);

  @Test
  public void runDetoxTests() {
    DetoxConfig detoxConfig = new DetoxConfig();
    detoxConfig.idlePolicyConfig.masterTimeoutSec = 90;
    detoxConfig.idlePolicyConfig.idleResourceTimeoutSec = 60;
    detoxConfig.rnContextLoadTimeoutSec = BuildConfig.DEBUG ? 180 : 60;
    Detox.runTests(activityRule, detoxConfig);
  }
}
`;
}

function detoxGradleMavenBlock() {
  return `// streamer: Detox Android Maven repository
// Resolve the native AAR from the installed npm package so the JS and native
// Detox versions remain aligned in this workspace and in CI.
def detoxPackageJson = ["node", "--print", "require.resolve('detox/package.json')"]
    .execute(null, rootDir).text.trim()
def detoxPackageDir = new File(detoxPackageJson).parentFile
allprojects {
  repositories {
    maven { url = uri(new File(detoxPackageDir, "Detox-android")) }
  }
}
`;
}

function detoxAppGradleBlock() {
  return `// streamer: Detox Android test setup
android {
  defaultConfig {
    testBuildType System.getProperty("testBuildType", "debug")
    testInstrumentationRunner "androidx.test.runner.AndroidJUnitRunner"
  }
}

dependencies {
  androidTestImplementation("com.wix:detox:${detoxVersion}")
}
`;
}

function writeDetoxTestSource(config) {
  const packageName = config.android?.package;
  if (!packageName) {
    throw new Error(
      "The Android package name is required to generate the Detox test source.",
    );
  }

  const packagePath = packageName.replace(/\./g, path.sep);
  const testPath = path.join(
    config.modRequest.platformProjectRoot,
    "app",
    "src",
    "androidTest",
    "java",
    packagePath,
    "DetoxTest.java",
  );

  fs.mkdirSync(path.dirname(testPath), { recursive: true });
  const source = androidDetoxTestSource(packageName);
  if (
    !fs.existsSync(testPath) ||
    fs.readFileSync(testPath, "utf8") !== source
  ) {
    fs.writeFileSync(testPath, source);
  }

  return config;
}

module.exports = function withAndroidLibraryNativePackaging(config) {
  config = withProjectBuildGradle(config, (config) => {
    if (config.modResults.language !== "groovy") {
      return config;
    }

    const marker = "// streamer: android library native packaging";
    if (!config.modResults.contents.includes(marker)) {
      const groovyLibraries = JSON.stringify(sharedNativeLibraries);
      config.modResults.contents += `
${marker}
// Android library test variants can receive the same native runtime from
// multiple Expo/RN modules. Pick one copy consistently during packaging.
subprojects { subproject ->
  subproject.plugins.withId("com.android.library") {
    subproject.android {
      packagingOptions {
        jniLibs {
          pickFirsts += ${groovyLibraries}
        }
      }
    }
  }
}
`;
    }

    const detoxMarker = "// streamer: Detox Android Maven repository";
    if (!config.modResults.contents.includes(detoxMarker)) {
      config.modResults.contents += `\n${detoxGradleMavenBlock()}`;
    }
    return config;
  });

  config = withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== "groovy") {
      return config;
    }

    if (
      !config.modResults.contents.includes(
        "// streamer: Detox Android test setup",
      )
    ) {
      config.modResults.contents += `\n${detoxAppGradleBlock()}`;
    }
    return config;
  });

  return withDangerousMod(config, ["android", writeDetoxTestSource]);
};

module.exports.androidDetoxTestSource = androidDetoxTestSource;
module.exports.detoxAppGradleBlock = detoxAppGradleBlock;
module.exports.detoxGradleMavenBlock = detoxGradleMavenBlock;
