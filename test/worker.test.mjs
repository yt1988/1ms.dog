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
  assert.match(home.title, /^中位延迟 105 ms（.+），2\/3 个服务有回应 · 1ms\.dog$/);
  assert.match(home.desc, /中国/);
  const one = resultMeta("/chatgpt/r/" + code);
  assert.equal(one.page, "/chatgpt/");
  assert.match(one.title, /^ChatGPT: 188 ms \(.+\) · 1ms\.dog$/);
  assert.equal(resultMeta("/ja/game/r/" + code).page, "/ja/game/");
  assert.equal(resultMeta("/vk/r/" + code).page, "/vk/");              // a two-letter page, not a language
});

test("a result from TW names it by the fixed name in the preview text", () => {
  const tw = encodeShare({ ts: 1793433600000, pack: "cn", groups: [{ cc: "TW", city: "", org: "", asn: null, proxy: false }], res: { baidu: 21.3 } });
  assert.match(resultMeta("/zh-cn/r/" + tw).desc, /中国台湾/);
  assert.match(resultMeta("/r/" + tw).desc, /Taiwan, China/);
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

test("a compare link gets what changed as its preview title, its banner and its height before it is sent", async () => {
  const before = encodeShare({ ts: 1793433600000, pack: "na", groups: [{ cc: "JP", city: "", org: "", asn: null, proxy: true }],
    res: { google: 180, github: 159, chatgpt: 300, youtube: 190 } });
  const after = encodeShare({ ts: 1793520000000, pack: "na", groups: [{ cc: "US", city: "", org: "", asn: null, proxy: false }],
    res: { google: 12.4, github: 31.8, chatgpt: 44.1, youtube: 13.2 } });
  const zh = resultMeta(`/zh-cn/c/${before}/${after}`);
  assert.equal(zh.page, "/zh-cn/");
  // the verdict first, then the biggest change; the detail (uses that changed, the biggest changes) in the description
  assert.equal(zh.title, "B 更快：4 项变快 · Google 180→12 ms · 1ms.dog");
  assert.equal(zh.desc, "AI 工具 够用→流畅，开发工具 够用→流畅 · Google 180→12 ms，YouTube 快 14 倍 · 整体中位延迟 185→23 ms");
  assert.match(zh.cmp.head, /<p class="msc-h msc-better"[^>]*>B 更快：4 项变快<\/p>/);
  assert.match(zh.cmp.head, /日本 · 代理/);
  // groups: AI (ChatGPT), web (Google), video (YouTube), dev (GitHub); two columns of two
  assert.equal(zh.cmp.style, "--cmp-h1:298px;--cmp-h2:142px");
  assert.match(resultMeta(`/c/${before}/${after}/`).title, /^B is faster: 4 faster · Google 180→12 ms · 1ms\.dog$/);
  // the same line twice, a minute apart: almost identical, and the title says so
  const again = encodeShare({ ts: 1793520060000, pack: "na", groups: [{ cc: "US", city: "", org: "", asn: null, proxy: false }],
    res: { google: 14, github: 30, chatgpt: 50, youtube: 12 } });
  assert.equal(resultMeta(`/zh-cn/c/${after}/${again}`).title, "两次几乎一样：4 项的差别都在误差内 · 1ms.dog");
  assert.match(resultMeta(`/zh-cn/c/${after}/${again}`).cmp.head, /同一出口 · 相隔 60秒/);
  // either side unreadable, or a compare link under a service page: no such page
  assert.deepEqual(resultMeta(`/c/${before}/zz`), { bad: true });
  assert.equal(resultMeta(`/chatgpt/c/${before}/${after}`), null);
});
