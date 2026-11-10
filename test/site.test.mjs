// Checks the built site against the page contract (structure the 1ms.dog site relies on) and the SEO basics. Run `npm run build` first.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { LANGS } from "../scripts/build.mjs";
import { CATS, SERVICES, PACKS, PACK_OF } from "../src/services.mjs";
import { fillIn, isPlural } from "../src/lib.mjs";

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

test("home, service and group pages each get their own layout; every footer links the pages of its language", async () => {
  const en = (await import("../src/i18n/en.mjs")).default, langOfSlug = new Map(LANGS.map(([l, s]) => [s, l])), landCache = new Map();
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
    // the footer sitemap: this language's home, the status page, every category, every region and the services that
    // language searches for (the whole service list would push every page past its size budget; the pages are
    // discoverable through sitemap.xml and, for local favorites, their region's page); every link opens a page that exists
    const lang = (p.match(/^(zh-cn|zh-tw|ja|ko|es|fr|de|pt|ru)\//) || ["", ""])[1], prefix = lang ? lang + "/" : "";
    const langName = langOfSlug.get(lang);
    if (!landCache.has(langName)) landCache.set(langName, (await import(`../src/i18n/${langName}.mjs`)).default.land || en.land);
    const nav = /<nav class="sitemap"[^>]*>([\s\S]*?)<\/nav>/.exec(h)[1];
    const required = ["", "status/", ...CATS.map(c => c + "/"), ...Object.keys(PACKS).map(r => "region/" + r + "/"), ...landCache.get(langName).map(id => id + "/")];
    for (const q of required) assert.ok(nav.includes(`href="/${prefix}${q}"`), p + ": footer misses /" + prefix + q);
    for (const [, href] of nav.matchAll(/href="([^"]+)"/g))
      assert.ok([...pages, ...statusPages].includes(href.slice(1)), p + ": footer links " + href + ", which is not a page");
  }
});

test("every service has its own indexed page in every language, with its own title and h1, in the sitemap and llms.txt", async () => {
  const all = [...SERVICES, ...Object.values(PACKS).flat()].map(s => s.id).filter((x, i, a) => a.indexOf(x) === i);
  const nameOf = Object.fromEntries([...SERVICES, ...Object.values(PACKS).flat()].map(s => [s.id, s.name]));
  const en = (await import("../src/i18n/en.mjs")).default, ko = (await import("../src/i18n/ko.mjs")).default;
  const fill = (s, v) => fillIn(s, v, ko.josa_fin);                       // the same fill the build uses
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const distinct = new Set(Object.values(nameOf));
  const llms = await readFile(new URL("llms.txt", pub), "utf8");
  for (const id of all) assert.ok(llms.includes(`https://1ms.dog/${id}/`), "llms.txt misses " + id);
  for (const [lang, slug] of LANGS) {
    const d = (await import(`../src/i18n/${lang}.mjs`)).default, T = k => d[k] ?? en[k];
    const titles = new Map(), h1s = new Map();
    for (const id of all) {
      const p = (slug ? slug + "/" : "") + id + "/", h = await page(p);
      assert.match(h, /<meta name="robots" content="index, follow, max-image-preview:large">/, p + ": indexed");
      assert.ok(pages.includes(p), p + ": in the sitemap");
      const title = fill(T("lp_title"), { s: nameOf[id] }), h1 = fill(T("lp_h1"), { s: nameOf[id] });
      assert.ok(h.includes(`<title>${esc(title)}</title>`), p + ": its own title");
      assert.ok(h.includes(`<h1>${esc(h1)}</h1>`), p + ": its own h1");
      assert.ok(title.includes(nameOf[id]), p + ": its title names its service");
      // the title and h1 are the only thing that tells two service pages apart: two services must not share one. Three
      // services are all called "LINE" (line, line-tw, line-sea), so their pages do share the name; only that is allowed.
      for (const [seen, map] of [[title, titles], [h1, h1s]]) {
        const other = map.get(seen);
        if (other) assert.equal(nameOf[other], nameOf[id], p + ": its title/h1 repeats " + other + "'s");
        map.set(seen, id);
      }
    }
    assert.equal(titles.size, distinct.size, lang + ": one title per service name");
    assert.equal(h1s.size, distinct.size, lang + ": one h1 per service name");
  }
});

test("the field links every global service and this language's local pack; a region page links its whole pack", async () => {
  for (const [lang, slug, , defPack] of LANGS) {
    const prefix = slug ? slug + "/" : "";
    const home = await page(prefix);
    for (const s of SERVICES) assert.ok(home.includes(`href="/${prefix}${s.id}/"`), lang + ": the field misses " + s.id);
    for (const s of PACKS[defPack]) assert.ok(home.includes(`href="/${prefix}${s.id}/"`), lang + ": the field misses local " + s.id);
    for (const pack of Object.keys(PACKS)) {
      const region = await page(prefix + "region/" + pack + "/");
      for (const s of PACKS[pack]) assert.ok(region.includes(`href="/${prefix}${s.id}/"`), lang + "/region/" + pack + " misses " + s.id);
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

test("the built scripts parse in older browsers: no optional chaining or nullish coalescing (ES2019)", async () => {
  const dir = new URL("assets/", pub);
  for (const f of (await readdir(dir)).filter(f => /^(app|status|l\.[a-z-]+)\.[0-9a-f]+\.js$/.test(f))) {
    const s = await readFile(new URL(f, dir), "utf8");
    assert.doesNotMatch(s, /\?\?|\?\.(?![0-9])/, f + " has ?. or ??");
    // syntax is rewritten by the build, missing functions aren't: these throw before Safari 16 / 14, Chrome 103 / 85
    assert.doesNotMatch(s, /AbortSignal\.timeout|Promise\.any/, f + " calls a function older browsers lack");
  }
});
