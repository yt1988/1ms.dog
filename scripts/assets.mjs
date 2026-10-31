#!/usr/bin/env node
// Renders the link-preview images with resvg (dev dependency): public/og/<lang>.png, 1200 × 630, one per language.
// Run when the headline or the dog changes, and commit the output. Uses system fonts for the text
// (Windows: Segoe UI, Microsoft YaHei, Microsoft JhengHei, Yu Gothic UI, Malgun Gothic).
// The favicons in public/ are the shared 1ms.dog ones (same files as me2cloud).
// Usage: node scripts/assets.mjs
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { Resvg } from "@resvg/resvg-js";

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

await mkdir(new URL("og/", pub), { recursive: true });
for (const f of (await readdir(new URL("i18n/", src))).filter(f => f.endsWith(".mjs"))) {
  const lang = f.slice(0, -4), d = (await import(new URL("i18n/" + f, src).href)).default;
  const en = (await import(new URL("i18n/en.mjs", src).href)).default, T = k => d[k] ?? en[k];
  const ff = `${FONTS[lang] ? `'${FONTS[lang]}', ` : ""}'Segoe UI', 'Microsoft YaHei', sans-serif`;
  // the headline wraps onto two lines when it is long
  const title = T("h1"), cjk = /[　-鿿가-힯]/.test(title), max = cjk ? 13 : 26;
  let lines = [title];
  if (title.length > max) {
    const cut = [title.indexOf("，") + 1, title.indexOf("、") + 1, title.lastIndexOf(", ", max + 6) + 1, title.lastIndexOf(" ", max + 4)].find(i => i > 3) || Math.ceil(title.length / 2);
    lines = [title.slice(0, cut).trim(), title.slice(cut).trim()];
  }
  const size = lines.some(l => l.length > (cjk ? 15 : 30)) ? 50 : 60;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#1c1c1c"/>
  <image href="data:image/svg+xml;base64,${logo}" x="90" y="64" width="200" height="80"/>
  ${lines.map((l, i) => `<text x="90" y="${300 + i * (size + 18)}" font-size="${size}" font-weight="700" fill="#ffffff" font-family="${ff}">${esc(l)}</text>`).join("")}
  <text x="90" y="${300 + lines.length * (size + 18) + 8}" font-size="28" fill="#a0a0a0" font-family="${ff}">${esc(T("og_sub"))}</text>
  <line x1="90" y1="560" x2="690" y2="560" stroke="#363636" stroke-width="4" stroke-linecap="round"/>
  ${BALLS.map(([ms, c]) => `<circle cx="${x(ms).toFixed(0)}" cy="560" r="11" fill="${c}" stroke="#1c1c1c" stroke-width="4"/>`).join("")}
  <image href="data:image/svg+xml;base64,${dog}" x="740" y="10" width="440" height="248" preserveAspectRatio="xMidYMid meet"/>
  <text x="1110" y="585" text-anchor="end" font-size="28" font-weight="600" fill="#ffb63f" font-family="Consolas, monospace">${HOST}</text>
</svg>`;
  await writeFile(new URL(`og/${lang.toLowerCase()}.png`, pub), render(svg));
  console.log("wrote og/" + lang.toLowerCase() + ".png");
}
