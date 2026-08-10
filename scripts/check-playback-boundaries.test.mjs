import test from "node:test";
import assert from "node:assert/strict";
import {
  checkPlaybackBoundary,
  extractModuleSpecifiers,
} from "./check-playback-boundaries.mjs";

test("extracts static, exported, required and dynamic module specifiers", () => {
  assert.deepEqual(
    extractModuleSpecifiers(`
      import type { Route } from "@streamer/shared";
      export { value } from "./value";
      const legacy = require("./legacy");
      const lazy = import("./lazy");
    `),
    ["@streamer/shared", "./value", "./legacy", "./lazy"],
  );
});

test("keeps source preparation independent from presentation and platform UI", () => {
  assert.deepEqual(
    checkPlaybackBoundary(
      "apps/mobile/services/sourcePreparation/Unsafe.ts",
      'import { View } from "react-native"; import Player from "../../components/player/Player";',
    ),
    [
      "apps/mobile/services/sourcePreparation/Unsafe.ts: media/application boundary imports react-native",
      "apps/mobile/services/sourcePreparation/Unsafe.ts: media/application boundary imports ../../components/player/Player",
    ],
  );
});

test("prevents PlayerScreen from importing concrete preparation implementations", () => {
  assert.deepEqual(
    checkPlaybackBoundary(
      "apps/mobile/app/player.tsx",
      'import { BridgeClient } from "../services/bridge/BridgeClient";',
    ),
    [
      "apps/mobile/app/player.tsx: presentation imports media implementation ../services/bridge/BridgeClient",
    ],
  );
});

test("allows ports to depend on shared contracts and infrastructure to stay isolated", () => {
  assert.deepEqual(
    checkPlaybackBoundary(
      "apps/mobile/services/bridge/Safe.ts",
      'import type { BridgeJobV1 } from "@streamer/shared";',
    ),
    [],
  );
  assert.deepEqual(
    checkPlaybackBoundary(
      "packages/stream-server/src/unsafe.ts",
      'import Player from "../../../apps/mobile/app/player";',
    ),
    [
      "packages/stream-server/src/unsafe.ts: media service imports control-plane application code ../../../apps/mobile/app/player",
    ],
  );
});
