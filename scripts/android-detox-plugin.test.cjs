"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  androidDetoxTestSource,
  detoxAppGradleBlock,
  detoxGradleMavenBlock,
} = require("../apps/mobile/plugins/withAndroidLibraryNativePackaging.js");

test("generates a Detox Android test for the configured application package", () => {
  const source = androidDetoxTestSource("com.example.streamer");

  assert.match(source, /package com\.example\.streamer;/);
  assert.match(source, /import com\.example\.streamer\.MainActivity;/);
  assert.match(source, /@RunWith\(AndroidJUnit4\.class\)/);
  assert.match(source, /Detox\.runTests\(activityRule, detoxConfig\)/);
});

test("configures the Android instrumentation runner and pinned Detox version", () => {
  const block = detoxAppGradleBlock();

  assert.match(
    block,
    /testBuildType System\.getProperty\("testBuildType", "debug"\)/,
  );
  assert.match(
    block,
    /testInstrumentationRunner "androidx\.test\.runner\.AndroidJUnitRunner"/,
  );
  assert.match(
    block,
    /androidTestImplementation\("com\.wix:detox:20\.51\.4"\)/,
  );
});

test("resolves Detox native artifacts from the installed npm package", () => {
  const block = detoxGradleMavenBlock();

  assert.match(block, /require\.resolve\('detox\/package\.json'\)/);
  assert.match(block, /Detox-android/);
});
