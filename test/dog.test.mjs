import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
const scheduling = app.slice(app.indexOf('  const dogImg = $("#dogImg");'), app.indexOf("  function inlineDog()"));

test("the first dog image is high priority, async decoded and keeps its reserved size", async () => {
  const html = await readFile(new URL("../src/page.html", import.meta.url), "utf8");
  const image = html.match(/<img[^>]*id="dogImg"[^>]*>/)[0];
  for (const attr of ['width="960"', 'height="540"', 'fetchpriority="high"', 'decoding="async"']) assert.ok(image.includes(attr));
});

for (const complete of [false, true]) test(`dog rig is queued once after load/error or an already complete image (${complete})`, () => {
  const events = {}, frames = [], timers = [];
  let calls = 0;
  vm.runInNewContext(scheduling, {
    $: () => ({ complete, addEventListener: (name, fn) => { events[name] = fn; } }),
    requestAnimationFrame: fn => frames.push(fn), setTimeout: fn => timers.push(fn), inlineDog: () => calls++,
  });
  assert.equal(frames.length, complete ? 1 : 0);
  events.load(); events.error(); events.load();
  assert.equal(frames.length, 1);
  assert.equal(calls, 0);
  frames[0](); assert.equal(calls, 0);
  assert.equal(timers.length, 1); timers[0](); assert.equal(calls, 1);
});

test("failed dog fetch leaves the existing image in place", async () => {
  const inline = app.slice(app.indexOf("  function inlineDog()"), app.indexOf("  function dogSpeed(f)"));
  for (const fetch of [async () => { throw new Error("offline"); }, async () => ({ ok: false })]) {
    let replaced = false;
    vm.runInNewContext(inline + "\ninlineDog();", { fetch, $: () => ({ replaceWith: () => { replaced = true; } }) });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(replaced, false);
  }
});
