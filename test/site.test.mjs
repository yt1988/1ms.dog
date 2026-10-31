// Checks the built site against the shell's tool contract and the SEO basics. Run `npm run build` first.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { LANGS } from "../scripts/build.mjs";
import { SERVICES, PACKS, PACK_OF } from "../src/services.mjs";

const pub = new URL("../public/", import.meta.url);
const page = p => readFile(new URL(p + "index.html", pub), "utf8");
const pages = [];
for (const [, slug] of LANGS) for (const sub of ["", ...SERVICES.filter(s => s.land).map(s => s.id)])
  pages.push((slug ? slug + "/" : "") + (sub ? sub + "/" : ""));

test("every language has every string", async () => {
  const en = (await import("../src/i18n/en.mjs")).default;
  for (const f of await readdir(new URL("../src/i18n/", import.meta.url))) {
    const d = (await import("../src/i18n/" + f)).default;
    const missing = Object.keys(en).filter(k => !(k in d));
    assert.deepEqual(missing, [], f + " is missing keys");
    assert.equal(d.docs.length, en.docs.length, f + " FAQ length");
  }
});

test("pages follow the shell contract", async () => {
  for (const p of pages) {
    const h = await page(p);
    assert.match(h, /^<!doctype html>\n<html lang="[a-zA-Z-]+"/, p);
    assert.match(h, /<head>\n<meta charset="utf-8">\n<script>/, p + ": charset first, pre-paint script right after");
    assert.ok(h.length < 30 * 1024, p + " is " + h.length + " bytes; the shell parses every byte");
    assert.doesNotMatch(h, /\{\{\w+\}\}/, p);
  }
});

test("pages carry SEO tags", async () => {
  for (const p of pages) {
    const h = await page(p);
    assert.match(h, new RegExp(`<link rel="canonical" href="https://1ms\.dog/${p.replace(/\//g, "\/")}">`), p);
    assert.equal((h.match(/hreflang=/g) || []).length, LANGS.length + 1, p + " hreflang");
    assert.match(h, /<meta property="og:image" content="https:\/\/1ms\.dog\/og\/[a-z-]+\.png">/, p);
    assert.match(h, /<script type="application\/ld\+json">/, p);
    assert.equal((h.match(/<h1>/g) || []).length, 1, p + " one h1");
  }
});

test("every service and pack is in the page and the local packs cover their countries", async () => {
  const h = await page("");
  for (const s of SERVICES) assert.ok(h.includes(`id="t-${s.id}"`), s.id);
  for (const p of Object.values(PACK_OF)) assert.ok(PACKS[p], p);
  const ids = [...SERVICES, ...Object.values(PACKS).flat()].map(s => s.id);
  assert.equal(new Set(ids).size, ids.length, "service ids are unique");
});
