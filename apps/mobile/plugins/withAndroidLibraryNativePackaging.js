const { withProjectBuildGradle } = require("@expo/config-plugins");

// Expo SDK 57's aggregate :expo library is also assembled for the Android
// instrumentation-test variant. Several Expo/RN modules contribute the same
// native runtime libraries there, so Gradle needs a deterministic winner.
// Keep this list aligned with expo-modules-core's test packaging rules and
// remove the plugin once Expo no longer exposes duplicate native libraries.
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

module.exports = function withAndroidLibraryNativePackaging(config) {
  return withProjectBuildGradle(config, (config) => {
    if (config.modResults.language !== "groovy") {
      return config;
    }

    const marker = "// streamer: android library native packaging";
    if (config.modResults.contents.includes(marker)) {
      return config;
    }

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

    return config;
  });
};
