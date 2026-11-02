// The Worker's preview text for shared result links (src/worker.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { resultMeta } from "../src/worker.js";
import { encodeShare } from "../src/lib.mjs";

const code = encodeShare({ ts: 1793433600000, pack: "cn",
  groups: [{ cc: "CN", city: "", org: "", asn: null, proxy: false }], res: { baidu: 21.3, chatgpt: 188, claude: null } });

test("a result link gets the result as its preview title, on the page it was shared from", () => {
  const home = resultMeta("/zh-cn/r/" + code);
  assert.equal(home.page, "/zh-cn/");
  assert.match(home.title, /^中位延迟 105 ms（.+），2\/3 个服务有响应 · 1ms\.dog$/);
  assert.match(home.desc, /中国/);
  const one = resultMeta("/chatgpt/r/" + code);
  assert.equal(one.page, "/chatgpt/");
  assert.match(one.title, /^ChatGPT: 188 ms \(.+\) · 1ms\.dog$/);
  assert.equal(resultMeta("/ja/game/r/" + code).page, "/ja/game/");
  assert.equal(resultMeta("/vk/r/" + code).page, "/vk/");              // a two-letter page, not a language
});

test("other paths are not result links; a code that can't be read is a 404", () => {
  assert.equal(resultMeta("/zh-cn/chatgpt/"), null);
  assert.equal(resultMeta("/a/b/r/" + code), null);
  assert.deepEqual(resultMeta("/r/nonsense"), { bad: true });
  assert.deepEqual(resultMeta("/zh-cn/r/zz"), { bad: true });
  assert.deepEqual(resultMeta("/zh-cn/r/" + code.slice(0, -4)), { bad: true });    // cut off inside an entry
  assert.deepEqual(resultMeta("/zh-cn/r/" + code.slice(0, code.lastIndexOf("."))), { bad: true });   // before the results
});

test("the command-line tool's installers and release files come from GitHub's latest release", async () => {
  const { default: worker } = await import("../src/worker.js");
  const asked = [];
  globalThis.caches = { default: { match: async () => null, put: async () => {} } };
  globalThis.fetch = async (u, o = {}) => {
    asked.push(String(u));
    if (String(u).endsWith("/releases/latest")) return new Response(null, { status: 302, headers: { location: "https://github.com/yt1988/https-latency-test-cli/releases/tag/v0.1.0" } });
    return new Response("#!/bin/sh\n", { status: 200 });
  };
  const env = { ASSETS: { fetch: async () => new Response("asset", { status: 404 }) } }, ctx = { waitUntil() {} };
  const get = p => worker.fetch(new Request("https://1ms.dog" + p), env, ctx);
  assert.equal(await (await get("/v")).text(), "0.1.0\n");
  const i = await get("/i");
  assert.equal(await i.text(), "#!/bin/sh\n");
  assert.ok(asked.includes("https://github.com/yt1988/https-latency-test-cli/releases/download/v0.1.0/install.sh"));
  const l = await get("/dl/latest/httpslatency-linux-amd64");
  assert.equal(l.status, 302);
  assert.equal(l.headers.get("location"), "/dl/v0.1.0/httpslatency-linux-amd64");
  assert.equal((await get("/dl/v0.1.0/other-file")).status, 404);              // only the tool's own files
  assert.equal(await (await get("/dl/v0.1.0/other-file")).text(), "asset");
});
