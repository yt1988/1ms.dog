#!/usr/bin/env node
// Renders the link-preview images with resvg (dev dependency), 1200 × 630: public/og/<lang>.png for each language and
// public/og/<lang>/<service>.png for each landing page.
// Run when the headline or the dog changes, and commit the output. Uses system fonts for the text
// (Windows: Segoe UI, Microsoft YaHei, Microsoft JhengHei, Yu Gothic UI, Malgun Gothic).
// The favicons in public/ are the shared 1ms.dog ones (same files as me2cloud).
// Usage: node scripts/assets.mjs
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { Resvg } from "@resvg/resvg-js";
import { SERVICES } from "../src/services.mjs";

const pub = new URL("../public/", import.meta.url), src = new URL("../src/", import.meta.url);
const HOST = new URL(process.env.SITE_URL || "https://1ms.dog").host;
const render = svg => new Resvg(svg, { fitTo: { mode: "width", value: 1200 }, font: { loadSystemFonts: true, defaultFontFamily: "Segoe UI" } }).render().asPng();
const b64 = async f => Buffer.from(await readFile(new URL(f, pub))).toString("base64");
const dog = await b64("assets/shiba-run.svg"), logo = await b64("assets/logo-dark.svg");
const FONTS = { "zh-CN": "Microsoft YaHei", "zh-TW": "Microsoft JhengHei", ja: "Yu Gothic UI", ko: "Malgun Gothic" };
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// a row of balls at their distances, the same picture the page draws
const BALLS = [[14, "#3ecf8e"], [26, "#3ecf8e"], [55, "#9fd356"], [110, "#f5c524"], [140, "#f5c524"], [240, "#f59e42"], [420, "#f56565"]];
const x = ms => 90 + 600 * Math.log(ms / 5) / Math.log(200);

// One card: the headline (wrapped onto two lines when long), a subtitle, the balls, the dog. `accent` marks a landing
// page's service: its name in the headline is drawn in its color, and one ball is.
function card(lang, title, sub, accent) {
  const ff = `${FONTS[lang] ? `'${FONTS[lang]}', ` : ""}'Segoe UI', 'Microsoft YaHei', sans-serif`;
  const cjk = /[　-鿿가-힯]/.test(title), max = cjk ? 13 : 26;
  let lines = [title];
  if (title.length > max) {
    let cut = [title.indexOf("，") + 1, title.indexOf("、") + 1, title.lastIndexOf(", ", max + 6) + 1, title.lastIndexOf(" ", max + 4)].find(i => i > 3) || Math.ceil(title.length / 2);
    // never inside the service name ("Docker | Hub"): break before it instead
    const at = accent ? title.indexOf(accent.name) : -1;
    if (at >= 0 && cut > at && cut < at + accent.name.length) cut = at;
    lines = [title.slice(0, cut).trim(), title.slice(cut).trim()];
  }
  const size = lines.some(l => l.length > (cjk ? 15 : 30)) ? 50 : 60;
  // the service name in its own color inside the headline
  const line = l => accent && l.includes(accent.name)
    ? l.split(accent.name).map(esc).join(`<tspan fill="${accent.c}">${esc(accent.name)}</tspan>`) : esc(l);
  const balls = accent ? [...BALLS.slice(0, 3), [90, accent.c], ...BALLS.slice(4)] : BALLS;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#1c1c1c"/>
  <image href="data:image/svg+xml;base64,${logo}" x="90" y="64" width="200" height="80"/>
  ${lines.map((l, i) => `<text x="90" y="${300 + i * (size + 18)}" font-size="${size}" font-weight="700" fill="#ffffff" font-family="${ff}">${line(l)}</text>`).join("")}
  <text x="90" y="${300 + lines.length * (size + 18) + 8}" font-size="28" fill="#a0a0a0" font-family="${ff}">${esc(sub)}</text>
  <line x1="90" y1="560" x2="690" y2="560" stroke="#363636" stroke-width="4" stroke-linecap="round"/>
  ${balls.map(([ms, c]) => `<circle cx="${x(ms).toFixed(0)}" cy="560" r="${c === (accent && accent.c) ? 15 : 11}" fill="${c}" stroke="#1c1c1c" stroke-width="4"/>`).join("")}
  <image href="data:image/svg+xml;base64,${dog}" x="740" y="10" width="440" height="248" preserveAspectRatio="xMidYMid meet"/>
  <text x="1110" y="585" text-anchor="end" font-size="28" font-weight="600" fill="#ffb63f" font-family="Consolas, monospace">${HOST}</text>
</svg>`;
}

// one card per language (og/<lang>.png), and one per landing page (og/<lang>/<service>.png)
const en = (await import(new URL("i18n/en.mjs", src).href)).default;
let n = 0;
for (const f of (await readdir(new URL("i18n/", src))).filter(f => f.endsWith(".mjs"))) {
  const lang = f.slice(0, -4), d = (await import(new URL("i18n/" + f, src).href)).default, T = k => d[k] ?? en[k];
  const dir = `og/${lang.toLowerCase()}/`;
  await mkdir(new URL(dir, pub), { recursive: true });
  await writeFile(new URL(`og/${lang.toLowerCase()}.png`, pub), render(card(lang, T("h1"), T("og_sub"))));
  for (const id of d.land || en.land) {
    const s = SERVICES.find(x => x.id === id);
    await writeFile(new URL(dir + id + ".png", pub), render(card(lang, T("lp_h1").split("{s}").join(s.name), T("og_sub"), s)));
    n++;
  }
  console.log(`wrote og/${lang.toLowerCase()}.png and ${(d.land || en.land).length} landing cards`);
}
console.log(n + " landing cards");
