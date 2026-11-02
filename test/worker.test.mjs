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

test("other paths are not result links; a bad code still opens the page", () => {
  assert.equal(resultMeta("/zh-cn/chatgpt/"), null);
  assert.equal(resultMeta("/a/b/r/" + code), null);
  assert.deepEqual(resultMeta("/r/nonsense"), { page: "/", title: null, desc: null });
});

test("a compare link gets what changed as its preview title; an unreadable one is not a page", async () => {
  const before = encodeShare({ ts: 1793433600000, pack: "na", groups: [{ cc: "JP", city: "", org: "", asn: null, proxy: true }],
    res: { google: 180, github: 159, chatgpt: 300, youtube: 190 } });
  const after = encodeShare({ ts: 1793520000000, pack: "na", groups: [{ cc: "US", city: "", org: "", asn: null, proxy: false }],
    res: { google: 12.4, github: 31.8, chatgpt: 44.1, youtube: 13.2 } });
  const zh = resultMeta(`/zh-cn/c/${before}/${after}`);
  assert.equal(zh.page, "/zh-cn/");
  assert.equal(zh.title, "Google 180→12 ms，YouTube 快 14 倍 · 1ms.dog");
  assert.equal(zh.desc, "4 项变快 · 综合中位数 185→23 ms");
  const en = resultMeta(`/c/${before}/${after}/`);
  assert.equal(en.page, "/");
  assert.match(en.title, /^Google 180→12 ms, YouTube 14× faster · 1ms\.dog$/);
  // either side unreadable, or a compare link under a service page: no such page
  assert.equal(resultMeta(`/c/${before}/zz`), null);
  assert.equal(resultMeta(`/chatgpt/c/${before}/${after}`), null);
});
