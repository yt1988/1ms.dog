// The Worker's preview text for shared result links (src/worker.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { resultMeta, movedService } from "../src/worker.js";
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

test("counted lines take the language's plural form: one service on a service page, the plural elsewhere", () => {
  assert.ok(resultMeta("/chatgpt/r/" + code).desc.includes("fetched 1/1 service from"));
  assert.ok(resultMeta("/r/" + code).title.includes("2/3 services answered"));
  assert.ok(resultMeta("/fr/chatgpt/r/" + code).desc.includes("1/1 service depuis"));
  assert.ok(resultMeta("/ja/chatgpt/r/" + code).desc.includes("1/1 サービス"));
});

test("other paths are not result links; a code that can't be read is a 404", () => {
  assert.equal(resultMeta("/zh-cn/chatgpt/"), null);
  assert.equal(resultMeta("/a/b/r/" + code), null);
  assert.deepEqual(resultMeta("/r/nonsense"), { bad: true });
  assert.deepEqual(resultMeta("/zh-cn/r/zz"), { bad: true });
  assert.deepEqual(resultMeta("/zh-cn/r/" + code.slice(0, -4)), { bad: true });    // cut off inside an entry
  assert.deepEqual(resultMeta("/zh-cn/r/" + code.slice(0, code.lastIndexOf("."))), { bad: true });   // before the results
});

test("the three LINE pages are one service now: the old addresses redirect to /line/ in the same language", () => {
  assert.equal(movedService("/line-tw/"), "/line/");
  assert.equal(movedService("/line-tw"), "/line/");
  assert.equal(movedService("/line-sea/"), "/line/");
  assert.equal(movedService("/zh-tw/line-tw/"), "/zh-tw/line/");
  assert.equal(movedService("/ja/line-sea"), "/ja/line/");
  // the service's own page, a short page name and a result link are not moved
  assert.equal(movedService("/line/"), null);
  assert.equal(movedService("/vk/"), null);
  assert.equal(movedService("/zh-cn/r/abc"), null);
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

test("a GitHub 502 on the release ask is tried once more, so the weekly check no longer turns a whole run red", async () => {
  const { default: worker } = await import("../src/worker.js");
  let calls = 0;
  globalThis.caches = { default: { match: async () => null, put: async () => {} } };
  globalThis.fetch = async () => {
    calls++;
    if (calls === 1) return new Response("bad gateway", { status: 502 });
    return new Response(null, { status: 302, headers: { location: "https://github.com/yt1988/https-latency-test-cli/releases/tag/v0.2.0" } });
  };
  const env = { ASSETS: { fetch: async () => new Response("asset", { status: 404 }) } }, ctx = { waitUntil() {} };
  const res = await worker.fetch(new Request("https://1ms.dog/v"), env, ctx);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "0.2.0\n");
  assert.equal(calls, 2);
});

test("while GitHub stays down, the version it gave last still serves /v and the installers", async () => {
  const { default: worker } = await import("../src/worker.js");
  const store = { "/__latest-keep": "0.1.0", "/dl/v0.1.0/install.sh": "#!/bin/sh\n" };
  globalThis.caches = { default: {
    match: async k => { const p = new URL(typeof k === "string" ? k : k.url).pathname; return store[p] ? new Response(store[p]) : null; },
    put: async () => {},
  } };
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new TypeError("fetch failed"); };
  const env = { ASSETS: { fetch: async () => new Response("asset", { status: 404 }) } }, ctx = { waitUntil() {} };
  const get = p => worker.fetch(new Request("https://1ms.dog" + p), env, ctx);
  assert.equal(await (await get("/v")).text(), "0.1.0\n");
  const i = await get("/i");
  assert.equal(i.status, 200);
  assert.equal(await i.text(), "#!/bin/sh\n");
  const l = await get("/dl/latest/httpslatency-linux-amd64");
  assert.equal(l.status, 302);
  assert.equal(l.headers.get("location"), "/dl/v0.1.0/httpslatency-linux-amd64");
  assert.ok(calls >= 2, "the fallback is used only after GitHub was asked twice");
});

test("with no release ever seen, /v is a clear 503 while the installers answer a 200 script that stops", async () => {
  const { default: worker } = await import("../src/worker.js");
  globalThis.caches = { default: { match: async () => null, put: async () => {} } };
  globalThis.fetch = async () => new Response("bad gateway", { status: 502 });
  const env = { ASSETS: { fetch: async () => new Response("asset", { status: 404 }) } }, ctx = { waitUntil() {} };
  const get = p => worker.fetch(new Request("https://1ms.dog" + p), env, ctx);
  const v = await get("/v");
  assert.equal(v.status, 503);
  assert.equal(v.headers.get("retry-after"), "60");
  assert.match(await v.text(), /GitHub is not answering right now/);
  // `curl -fsSL … | sh`: a 5xx would make curl write nothing and sh then exit 0 on empty input, so the installer is
  // a script that says what happened and exits 1
  const i = await get("/i");
  assert.equal(i.status, 200);
  assert.equal(i.headers.get("content-type"), "text/plain; charset=utf-8");
  const sh = await i.text();
  assert.match(sh, /^#!\/bin\/sh\n/);
  assert.match(sh, /GitHub is not answering right now/);
  assert.match(sh, /exit 1/);
  const ps = await get("/i.ps1");
  assert.equal(ps.status, 200);
  const pwsh = await ps.text();
  assert.match(pwsh, /^throw "/);
  assert.match(pwsh, /GitHub is not answering right now/);
  // no tag at all: point at GitHub's own latest file rather than a dead end
  const l = await get("/dl/latest/httpslatency-linux-amd64");
  assert.equal(l.status, 302);
  assert.equal(l.headers.get("location"), "https://github.com/yt1988/https-latency-test-cli/releases/latest/download/httpslatency-linux-amd64");
});

test("an installer file GitHub never answers sends the client to GitHub's copy, not a dead end", async () => {
  const { default: worker } = await import("../src/worker.js");
  globalThis.caches = { default: { match: async () => null, put: async () => {} } };
  globalThis.fetch = async u => {
    if (String(u).endsWith("/releases/latest")) return new Response(null, { status: 302, headers: { location: "https://github.com/yt1988/https-latency-test-cli/releases/tag/v0.1.0" } });
    throw new TypeError("fetch failed");
  };
  const env = { ASSETS: { fetch: async () => new Response("asset", { status: 404 }) } }, ctx = { waitUntil() {} };
  const i = await worker.fetch(new Request("https://1ms.dog/i"), env, ctx);
  assert.equal(i.status, 302);
  assert.equal(i.headers.get("location"), "https://github.com/yt1988/https-latency-test-cli/releases/download/v0.1.0/install.sh");
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
