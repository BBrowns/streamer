import assert from "node:assert/strict";
import test from "node:test";

import { parsePlaybackEvent } from "./src/playback-event.mjs";

test("old producers may omit playbackSessionId", () => {
  assert.deepEqual(parsePlaybackEvent({ type: "started" }), {
    type: "started",
  });
});

test("new producers preserve a valid playbackSessionId", () => {
  assert.deepEqual(
    parsePlaybackEvent({ type: "started", playbackSessionId: "session-1" }),
    { type: "started", playbackSessionId: "session-1" },
  );
});

test("malformed playbackSessionId values are rejected", () => {
  assert.throws(
    () => parsePlaybackEvent({ type: "started", playbackSessionId: 42 }),
    /playbackSessionId/,
  );
});
