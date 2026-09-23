import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

test("off-screen scenes pause, resume queued frames, and reject unrelated messages", async () => {
  const nativeFrames = new Map();
  const listeners = {};
  let frameId = 0;
  let cancellations = 0;
  const parent = {};
  const document = {
    hidden: false,
    documentElement: { dataset: {} },
    addEventListener: (name, callback) => (listeners[name] = callback),
  };
  const window = {
    parent,
    requestAnimationFrame: (fn) => {
      nativeFrames.set(++frameId, fn);
      return frameId;
    },
    cancelAnimationFrame: (id) => nativeFrames.delete(id),
    dispatchEvent: () => cancellations++,
    addEventListener: document.addEventListener,
  };
  const context = vm.createContext({
    window,
    document,
    location: { origin: "https://example.test" },
    Event,
    reportError: (error) => {
      throw error;
    },
  });
  const source = (
    await readFile(
      new URL("../../src/shared/animation.js", import.meta.url),
      "utf8",
    )
  ).replaceAll("export function", "function");
  vm.runInContext(source, context);
  let calls = 0;
  context.requestSceneFrame(() => calls++);
  assert.equal(nativeFrames.size, 0);
  const message = {
    source: parent,
    origin: "https://example.test",
    data: { type: "spectrum-feed:active", active: true },
  };
  listeners.message({ ...message, origin: "https://untrusted.test" });
  assert.equal(nativeFrames.size, 0);
  listeners.message(message);
  assert.equal(nativeFrames.size, 1);
  const tick = () => {
    const callbacks = [...nativeFrames.values()];
    nativeFrames.clear();
    callbacks.forEach((fn) => fn(100));
  };
  tick();
  assert.equal(calls, 1);
  const cancelled = context.requestSceneFrame(() => calls++);
  context.cancelSceneFrame(cancelled);
  tick();
  assert.equal(calls, 1);
  context.requestSceneFrame(() => calls++);
  document.hidden = true;
  listeners.visibilitychange();
  assert.equal(nativeFrames.size, 0);
  document.hidden = false;
  listeners.visibilitychange();
  tick();
  assert.equal(calls, 2);
  assert.ok(cancellations > 0);
});
