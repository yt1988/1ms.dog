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
