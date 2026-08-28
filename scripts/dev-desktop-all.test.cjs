"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const test = require("node:test");
const { run, terminateChildren } = require("./dev-desktop-all.cjs");

function createChild(pid) {
  const child = new EventEmitter();
  child.pid = pid;
  child.exitCode = null;
  child.signalCode = null;
  return child;
}

test("one SIGINT coordinates shutdown for every desktop-all child", async () => {
  const signalSource = new EventEmitter();
  const children = [createChild(101), createChild(102), createChild(103)];
  const spawnedScripts = [];
  let terminatedChildren = [];

  const result = run({
    signalSource,
    spawnScript(script) {
      spawnedScripts.push(script);
      return children[spawnedScripts.length - 1];
    },
    waitForService: async () => true,
    terminateChildren: async (value) => {
      terminatedChildren = value.slice();
      return true;
    },
  });

  await new Promise((resolve) => setImmediate(resolve));
  signalSource.emit("SIGINT");

  assert.equal(await result, 130);
  assert.deepEqual(spawnedScripts, [
    "dev:server",
    "dev:mobile:web",
    "dev:desktop",
  ]);
  assert.deepEqual(terminatedChildren, children);
  assert.equal(signalSource.listenerCount("SIGINT"), 0);
  assert.equal(signalSource.listenerCount("SIGTERM"), 0);
});

test("shutdown escalates only child processes that ignore SIGTERM", async () => {
  const running = createChild(201);
  const exited = createChild(202);
  exited.exitCode = 0;
  const signals = [];
  let waits = 0;

  await terminateChildren([running, exited], {
    isChildRunning: (child) => child.exitCode === null,
    signalChild: (child, signal) => signals.push([child.pid, signal]),
    waitForChildren: async () => {
      waits += 1;
      return waits > 1;
    },
  });

  assert.deepEqual(signals, [
    [201, "SIGTERM"],
    [201, "SIGKILL"],
  ]);
});
