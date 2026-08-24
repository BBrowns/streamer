import assert from "node:assert/strict";
import test from "node:test";

import { playerControlsViewModel } from "./src/player-controls.mjs";

test("phone controls remain compact and labelled", () => {
  assert.deepEqual(playerControlsViewModel({ width: 390 }), {
    layout: "phone",
    controls: [
      { id: "play", label: "Play" },
      { id: "seek", label: "Seek" },
      { id: "captions", label: "Captions" },
    ],
    transition: "fade",
  });
});

test("desktop exposes pointer-oriented controls without losing labels", () => {
  assert.deepEqual(playerControlsViewModel({ width: 1280 }), {
    layout: "desktop",
    controls: [
      { id: "play", label: "Play" },
      { id: "seek", label: "Seek" },
      { id: "captions", label: "Captions" },
      { id: "volume", label: "Volume" },
      { id: "fullscreen", label: "Fullscreen" },
    ],
    transition: "fade",
  });
});

test("reduced motion removes the animated transition", () => {
  assert.equal(
    playerControlsViewModel({ width: 1280, reducedMotion: true }).transition,
    "none",
  );
});
