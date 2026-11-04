#!/usr/bin/env node
// Local preview of ./public with the same headers as production (public/_headers, including the CSP). Shared result
// and compare links (/r/…, /c/…/…) get the page with the preview title the Worker gives them (src/worker.js), so
// they open here too; the Worker's HTMLRewriter is stood in for by a few replacements. /baseline.json: .baseline.json
// when there is one, else the live copy.
// Usage: node scripts/dev.mjs [port]
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { resultMeta } from "../src/worker.js";

const root = fileURLToPath(new URL("../public/", import.meta.url));
const port = +process.argv[2] || 8787;
const TYPES = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".js": "text/javascript", ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".yaml": "text/plain; charset=utf-8", ".list": "text/plain; charset=utf-8", ".css": "text/css", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json" };

// Cloudflare-style _headers: a path pattern line, then indented "Name: value" lines; * matches anything
async function rules() {
  const text = await readFile(root + "_headers", "utf8").catch(() => "");
  const out = []; let cur = null;
  for (const line of text.split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (!/^\s/.test(line)) { cur = { re: new RegExp("^" + line.trim().replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$"), h: {} }; out.push(cur); }
    else if (cur && line.includes(":") && !line.trim().startsWith("!")) { const i = line.indexOf(":"); cur.h[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
  }
  return out;
}

const escAttr = v => String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
function preview(html, meta, url) {
  const set = (re, v) => { if (v) html = html.replace(re, (m, a) => a + escAttr(v) + '"'); };
  set(/(<meta name="robots" content=")[^"]*"/, "noindex, follow");
  if (meta.title) html = html.replace(/<title>[^<]*<\/title>/,"<title>" + escAttr(meta.title) + "</title>");
  for (const k of ['property="og:title"', 'name="twitter:title"']) set(new RegExp(`(<meta ${k} content=")[^"]*"`), meta.title);
  for (const k of ['name="description"', 'property="og:description"', 'name="twitter:description"']) set(new RegExp(`(<meta ${k} content=")[^"]*"`), meta.desc);
  set(/(<meta property="og:url" content=")[^"]*"/, url);
  if (meta.cmp) html = html.replace("</head>", '<link rel="stylesheet" href="/assets/share/compare.css"></head>')
    .replace('<span id="sharedTxt"></span>', m => m + meta.cmp.head)
    .replace('<button class="btn pri" id="testMine"', m => meta.cmp.share + m)
    .replace('id="cmpBox"', () => `id="cmpBox" style="${meta.cmp.style}"`);
  return html;
}

createServer(async (req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
  // the Tokyo baseline the Worker serves (src/worker.js): a local file when there is one (httpslatency baseline --out
  // writes summary.json; copy it to .baseline.json), otherwise the live one
  if (urlPath === "/baseline.json") {
    const local = await readFile(new URL("../.baseline.json", import.meta.url)).catch(() => null);
    const body = local || await fetch("https://1ms.dog/baseline.json").then(r => r.ok ? r.text() : null).catch(() => null);
    res.writeHead(body ? 200 : 503, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-cache" }).end(body || '{"v":1,"services":{}}');
    return;
  }
  const found = resultMeta(new URL(req.url, "http://x").pathname), meta = found && !found.bad ? found : null;   // unreadable: 404
  let path = meta ? meta.page : urlPath;
  if (path.endsWith("/")) path += "index.html";
  const file = normalize(root + path);
  if (!file.startsWith(normalize(root))) { res.writeHead(403).end(); return; }
  try {
    let body = await readFile(file);
    if (meta) body = preview(body.toString("utf8"), meta, `http://localhost:${port}${new URL(req.url, "http://x").pathname}`);
    const headers = { "Content-Type": TYPES[extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" };
    for (const r of await rules()) if (r.re.test(urlPath)) Object.assign(headers, r.h);
    headers["Cache-Control"] = "no-cache";
    res.writeHead(200, headers).end(body);
  } catch { res.writeHead(404, { "Content-Type": "text/plain" }).end("not found"); }
}).listen(port, () => console.log(`1ms.dog: http://localhost:${port}/`));
