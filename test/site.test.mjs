// Checks the built site against the page contract (structure the 1ms.dog site relies on) and the SEO basics. Run `npm run build` first.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { LANGS } from "../scripts/build.mjs";
import { SERVICES, PACKS, PACK_OF } from "../src/services.mjs";

const pub = new URL("../public/", import.meta.url);
const page = p => readFile(new URL(p + "index.html", pub), "utf8");
// every page the sitemap lists, as a path relative to the site root
const sitemap = await readFile(new URL("sitemap.xml", pub), "utf8");
const pages = [...sitemap.matchAll(/<loc>https:\/\/1ms\.dog\/([^<]*)<\/loc>/g)].map(m => m[1]);
const altsOf = p => [...sitemap.split("<url>").find(u => u.includes(`<loc>https://1ms.dog/${p}</loc>`)).matchAll(/hreflang="([^"]+)"/g)].map(m => m[1]);

test("every language has every string", async () => {
  const en = (await import("../src/i18n/en.mjs")).default;
  for (const f of await readdir(new URL("../src/i18n/", import.meta.url))) {
    const d = (await import("../src/i18n/" + f)).default;
    const missing = Object.keys(en).filter(k => !(k in d));
    for (const id of d.land) assert.ok(SERVICES.some(s => s.id === id), f + ": no service " + id);
    assert.deepEqual(missing, [], f + " is missing keys");
    assert.equal(d.docs.length, en.docs.length, f + " FAQ length");
  }
});

test("pages follow the page contract", async () => {
  for (const p of pages) {
    const h = await page(p);
    assert.match(h, /^<!doctype html>\n<html lang="[a-zA-Z-]+"/, p);
    assert.match(h, /<head>\n<meta charset="utf-8">\n<script>/, p + ": charset first, pre-paint script right after");
    assert.ok(h.length < 30 * 1024, p + " is " + h.length + " bytes; HTML is parsed at the edge on every visit");
    assert.doesNotMatch(h, /\{\{\w+\}\}/, p);
  }
});

test("pages carry SEO tags", async () => {
  for (const p of pages) {
    const h = await page(p);
    assert.match(h, new RegExp(`<link rel="canonical" href="https://1ms\.dog/${p.replace(/\//g, "\/")}">`), p);
    // hreflang in the page matches the sitemap, and every listed alternate exists
    const alts = [...h.matchAll(/hreflang="([^"]+)" href="https:\/\/1ms\.dog\/([^"]*)"/g)];
    assert.deepEqual(alts.map(m => m[1]), altsOf(p), p + " hreflang");
    for (const [, , path] of alts) assert.ok(pages.includes(path), p + " → missing alternate " + path);
    // every page's preview image exists (landing pages have their own: og/<lang>/<service>.png)
    const img = /<meta property="og:image" content="https:\/\/1ms\.dog\/(og\/[a-z-]+(?:\/[a-z-]+)?\.png)">/.exec(h);
    assert.ok(img, p + ": og:image");
    assert.ok(await readFile(new URL(img[1], pub)).catch(() => null), p + ": missing " + img[1]);
    assert.match(h, /<script type="application\/ld\+json">/, p);
    assert.equal((h.match(/<h1>/g) || []).length, 1, p + " one h1");
  }
});

test("single-service pages test one service; every page's footer links them all", async () => {
  for (const p of pages) {
    const h = await page(p), one = p.split("/").filter(Boolean).length > (p.match(/^(zh-cn|zh-tw|ja|ko|es|fr|de|pt|ru)\//) ? 1 : 0);
    assert.equal(h.includes('id="stMed"'), one, p + ": single-service result");
    assert.equal(h.includes('id="groups"'), !one, p + ": the 40-service field only on home pages");
    assert.doesNotMatch(h, /<!--\/?(full|one)-->/, p + ": variant markers left in the page");
    // the footer sitemap links every page of the same language
    const lang = (p.match(/^(zh-cn|zh-tw|ja|ko|es|fr|de|pt|ru)\//) || ["", ""])[1], prefix = lang ? lang + "/" : "";
    const same = pages.filter(q => lang ? q.startsWith(prefix) : !/^(zh-cn|zh-tw|ja|ko|es|fr|de|pt|ru)\//.test(q));
    const nav = /<nav class="sitemap"[^>]*>([\s\S]*?)<\/nav>/.exec(h)[1];
    for (const q of same) assert.ok(nav.includes(`href="/${q}"`), p + ": footer misses /" + q);
  }
});

test("every service and pack is in the page and the local packs cover their countries", async () => {
  const h = await page("");
  for (const s of SERVICES) assert.ok(h.includes(`id="t-${s.id}"`), s.id);
  for (const p of Object.values(PACK_OF)) assert.ok(PACKS[p], p);
  // the pack switches once the exit country is known; a different length would move the page
  assert.equal(new Set(Object.values(PACKS).map(p => p.length)).size, 1, "every local pack has the same length");
  const ids = [...SERVICES, ...Object.values(PACKS).flat()].map(s => s.id);
  assert.equal(new Set(ids).size, ids.length, "service ids are unique");
});
