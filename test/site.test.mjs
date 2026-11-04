// Checks the built site against the page contract (structure the 1ms.dog site relies on) and the SEO basics. Run `npm run build` first.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { LANGS } from "../scripts/build.mjs";
import { SERVICES, PACKS, PACK_OF } from "../src/services.mjs";
import { isPlural } from "../src/lib.mjs";

const pub = new URL("../public/", import.meta.url);
const page = p => readFile(new URL(p + "index.html", pub), "utf8");
// every page the sitemap lists, as a path relative to the site root
const sitemap = await readFile(new URL("sitemap.xml", pub), "utf8");
const locs = [...sitemap.matchAll(/<loc>https:\/\/1ms\.dog\/([^<]*)<\/loc>/g)].map(m => m[1]);
const isStatus = p => /(^|\/)status\/$/.test(p);
const pages = locs.filter(p => !isStatus(p)), statusPages = locs.filter(isStatus);
const altsOf = p => [...sitemap.split("<url>").find(u => u.includes(`<loc>https://1ms.dog/${p}</loc>`)).matchAll(/hreflang="([^"]+)"/g)].map(m => m[1]);

test("every language has every string", async () => {
  const en = (await import("../src/i18n/en.mjs")).default;
  for (const f of await readdir(new URL("../src/i18n/", import.meta.url))) {
    const d = (await import("../src/i18n/" + f)).default;
    const missing = Object.keys(en).filter(k => !(k in d) && !isPlural(k, en));   // plural forms only where the language has them
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

test("home, service and group pages each get their own layout; every page's footer links all indexed pages", async () => {
  for (const p of pages) {
    const h = await page(p), data = JSON.parse(/<script type="application\/json" id="data">([^<]*)<\/script>/.exec(h)[1]);
    const one = !!data.spot, grp = !!data.set;
    assert.equal(h.includes('id="stMed"'), one || grp, p + ": service or group result");
    assert.equal(h.includes('id="slane"'), one, p + ": the samples lane only on service pages");
    assert.equal(h.includes('id="groups"'), !one || data.spot === "telegram", p + ": the field on home and group pages, and on a service page with parts (Telegram's data centers)");
    assert.equal(h.includes('id="stLocal"'), !one && !grp, p + ": local/global split only on home pages");
    assert.doesNotMatch(h, /<!--\/?v[:-]/, p + ": variant markers left in the page");
    assert.doesNotMatch(h, /class="about"/, p + ": background text lives in the help dialog, not under the field");
    assert.match(h, /<meta name="robots" content="index, follow/, p + ": indexed pages say index");
    // the footer sitemap links every page of the same language
    const lang = (p.match(/^(zh-cn|zh-tw|ja|ko|es|fr|de|pt|ru)\//) || ["", ""])[1], prefix = lang ? lang + "/" : "";
    const same = pages.filter(q => lang ? q.startsWith(prefix) : !/^(zh-cn|zh-tw|ja|ko|es|fr|de|pt|ru)\//.test(q));
    const nav = /<nav class="sitemap"[^>]*>([\s\S]*?)<\/nav>/.exec(h)[1];
    for (const q of same) assert.ok(nav.includes(`href="/${q}"`), p + ": footer misses /" + q);
  }
});

test("every service has a page; the ones a language doesn't search for are noindex and out of the sitemap", async () => {
  const all = [...SERVICES, ...Object.values(PACKS).flat()].map(s => s.id);
  for (const [lang, slug] of LANGS) {
    const d = (await import(`../src/i18n/${lang}.mjs`)).default, en = (await import("../src/i18n/en.mjs")).default, land = d.land || en.land;
    for (const id of all) {
      const p = (slug ? slug + "/" : "") + id + "/", h = await page(p);
      const idx = land.includes(id);
      assert.match(h, new RegExp(`<meta name="robots" content="${idx ? "index" : "noindex"}, follow`), p);
      assert.equal(pages.includes(p), idx, p + ": in the sitemap only when indexed");
    }
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

test("the status page: one per language, every service listed, its script and data, linked from every page's footer", async () => {
  assert.equal(statusPages.length, LANGS.length);
  const all = [...SERVICES, ...Object.values(PACKS).flat()].map(s => s.id).filter((x, i, a) => a.indexOf(x) === i);
  for (const p of statusPages) {
    const h = await page(p);
    for (const id of all) assert.ok(h.includes(`data-id="${id}"`), p + ": lists " + id);
    assert.match(h, /<script src="\/assets\/status\.[0-9a-f]+\.js" defer><\/script>/, p + ": its script");
    const st = JSON.parse(/<script type="application\/json" id="st">([^<]*)<\/script>/.exec(h)[1]);
    assert.ok(st.L.ss_outrow && st.scale, p + ": strings and scale for the script");
    assert.equal((h.match(/hreflang=/g) || []).length >= LANGS.length + 1, true, p + ": alternates");
    assert.equal((h.match(/<h1>/g) || []).length, 1, p + " one h1");
    // the site's header (language, help, GitHub, theme, in that order) and its help dialog, as on every page
    assert.match(h, /<select id="lang">[\s\S]*?id="helpBtn"[\s\S]*?github\.com\/yt1988\/1ms\.dog[\s\S]*?id="theme"/, p + ": header controls");
    assert.ok(h.includes('id="help" hidden') && h.includes('data-hq="1"'), p + ": help dialog");
    assert.ok(h.length < 40 * 1024, p + " is " + h.length + " bytes");
    assert.match(h, /<img src="\/assets\/svc\/chatgpt\.png" width="16" height="16" alt="" loading="lazy">/, p + ": service icons");
  }
  const home = await page("");
  assert.ok(/<nav class="sitemap"[^>]*>[\s\S]*?href="\/status\/"/.test(home), "home footer links the status page");
  const csp = await readFile(new URL("../public/_headers", import.meta.url), "utf8");
  assert.match(csp, /connect-src 'self' https: wss:\/\/echo\.1ms\.dog:8443/, "the CSP lets the page reach the echo server");
});
