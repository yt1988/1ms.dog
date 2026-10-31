#!/usr/bin/env node
// Builds the static site in public/ from src/:
//   index.html, <lang>/index.html                 home page per language
//   <id>/, <lang>/<id>/                           a landing page per searched-for service (land: true)
//   assets/app.<hash>.js, assets/app.<hash>.css   app code and styles, shared and cached by every page
//   sitemap.xml, robots.txt, llms.txt, _headers   SEO and security headers (CSP)
// Usage: node scripts/build.mjs          write the files
//        node scripts/build.mjs --check  exit 1 if anything is out of date, or the app code does not parse (CI)
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { CATS, SERVICES, PACKS, PACK_OF, SCALE, ZONES, pos } from "../src/services.mjs";

const SITE = (process.env.SITE_URL || "https://1ms.dog").replace(/\/+$/, "");
const pub = new URL("../public/", import.meta.url), src = new URL("../src/", import.meta.url);
// language, URL folder, og:locale, default local pack before the exit country is known; the first is the root
export const LANGS = [["en", "", "en_US", "na"], ["zh-CN", "zh-cn", "zh_CN", "cn"], ["zh-TW", "zh-tw", "zh_TW", "tw"], ["ja", "ja", "ja_JP", "jp"],
  ["ko", "ko", "ko_KR", "kr"], ["es", "es", "es_ES", "latam"], ["fr", "fr", "fr_FR", "eu"], ["de", "de", "de_DE", "eu"], ["pt", "pt", "pt_BR", "latam"],
  ["ru", "ru", "ru_RU", "ru"]];
// the other 1ms.dog tools (names, icons and tints as in 1ms-shell's src/sites.js)
const TOOLS = [
  { id: "m2c", host: "m2c.1ms.dog", name: "Me2Cloud", tint: "#3b82f6", icon: '<path d="M1.5 8.5h2.8l1.6-4.5 3.2 8 1.6-3.5h3.8"/>' },
  { id: "v2c", host: "v2c.1ms.dog", name: "VPS2Cloud", tint: "#10b981", icon: '<rect x="1.5" y="2.5" width="13" height="11" rx="2"/><path d="M4.5 6.5l2 1.5-2 1.5M8.5 10h3"/>' },
  { id: "ls", host: "ls.1ms.dog", name: "Lightsail Cost Saver", tint: "#f59e0b", icon: '<rect x="3" y="1.5" width="10" height="13" rx="2"/><path d="M5.5 4.5h5M5.5 8h0M8 8h0M10.5 8h0M5.5 11h0M8 11h0M10.5 11h0"/>' },
];
const TOOL_PATH = { m2c: { "zh-CN": "/zh-cn/", "zh-TW": "/zh-tw/" }, v2c: { "zh-CN": "/zh-cn/", "zh-TW": "/zh-tw/" }, ls: { "zh-CN": "/zh/", "zh-TW": "/zh-tw/" } };
const toolHome = (id, lang, slug) => (TOOL_PATH[id][lang] || (slug ? "/" + slug + "/" : "/"));

// Runs before first paint: apply the saved theme. On the English root, send visitors to their language's page
// (a saved choice first, then the browser languages); crawlers and English readers stay.
const PREPAINT = `(function(){var d=document.documentElement,th=null,s=null;try{th=localStorage.getItem("1ms:theme");s=localStorage.getItem("1ms:lang")}catch(e){}if(th==="light"||th==="dark")d.setAttribute("data-theme",th);if(!d.hasAttribute("data-root"))return;var P=JSON.parse(d.getAttribute("data-paths")||"{}"),l=null;try{var q=new URLSearchParams(location.search).get("lang");if(P[q])l=q}catch(e){}if(!l&&P[s])l=s;for(var ls=navigator.languages||[navigator.language||"en"],i=0;!l&&!s&&i<ls.length;i++){var x=String(ls[i]).toLowerCase(),b=x.split("-")[0];l=b==="zh"?(/tw|hk|mo|hant/.test(x)?"zh-TW":"zh-CN"):P[b]?b:null}if(l&&l!=="en")location.replace(P[l]+location.hash)})();`;

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fill = (s, v) => { for (const k in v) s = s.split("{" + k + "}").join(v[k]); return s; };
const hash = s => createHash("sha256").update(s).digest("hex").slice(0, 10);
const sha = s => createHash("sha256").update(s).digest("base64");

async function loadI18n() {
  const out = {};
  for (const f of (await readdir(new URL("i18n/", src))).filter(f => f.endsWith(".mjs")))
    out[f.slice(0, -4)] = (await import(new URL("i18n/" + f, src).href + "?" + Date.now())).default;
  return out;
}

export async function build({ check = false } = {}) {
  const I = await loadI18n(), en = I.en;
  const langs = LANGS.filter(([l]) => I[l]);
  const tpl = await readFile(new URL("page.html", src), "utf8");

  const svc = { list: SERVICES.map(({ land, ...s }) => s), packs: PACKS, packOf: PACK_OF, scale: SCALE };
  const app = `const SVC = ${JSON.stringify(svc)};\n` + await readFile(new URL("app.js", src), "utf8");
  new Function(app);                                                    // must parse
  // the lanes are colored by speed zone, at the same log-scale positions the page puts the balls
  const pct = ms => (pos(ms) * 100).toFixed(1) + "%", Z = ZONES.map(pct);
  const bands = `linear-gradient(90deg, var(--t1) 0 ${Z[0]}, var(--t2) ${Z[0]} ${Z[1]}, var(--t3) ${Z[1]} ${Z[2]}, var(--t4) ${Z[2]} ${Z[3]}, var(--t5) ${Z[3]} 100%)`;
  const css = (await Promise.all(["fonts.css", "style.css", "layout.css"].map(f => readFile(new URL(f, src), "utf8")))).join("\n") + `\n.field { --bands: ${bands}; }\n`;
  const jsName = `app.${hash(app)}.js`, cssName = `app.${hash(css)}.css`;

  const landIds = SERVICES.filter(s => s.land).map(s => s.id);
  const path = (slug, sub) => "/" + (slug ? slug + "/" : "") + (sub ? sub + "/" : "");
  const RUNTIME_SKIP = new Set(["docs", "seo_title", "seo_desc", "seo_kw", "og_sub", "lede", "lp_title", "lp_desc", "lp_intro", "lp_h1", "tool_m2c", "tool_v2c", "tool_ls", "faq_h", "foot", "tools_h"]);
  const pages = [];
  for (const [lang, slug, locale, defPack] of langs) {
    const d = I[lang], T = k => d[k] ?? en[k] ?? k;
    const strings = Object.fromEntries(Object.keys(en).filter(k => !RUNTIME_SKIP.has(k)).map(k => [k, T(k)]));
    for (const sub of ["", ...landIds]) {
      const s = sub ? SERVICES.find(x => x.id === sub) : null;
      const url = SITE + path(slug, sub);
      const title = s ? fill(T("lp_title"), { s: s.name }) : T("seo_title");
      const desc = s ? fill(T("lp_desc"), { s: s.name }) : T("seo_desc");
      const h1 = s ? fill(T("lp_h1"), { s: s.name }) : T("h1");
      const alts = langs.map(([l, sl]) => `<link rel="alternate" hreflang="${l}" href="${SITE + path(sl, sub)}">`).join("\n") +
        `\n<link rel="alternate" hreflang="x-default" href="${SITE + path("", sub)}">`;
      const docs = d.docs || en.docs;
      const og = `${SITE}/og/${lang.toLowerCase()}.png`;
      const graph = [
        { "@type": "WebSite", "@id": SITE + "/#site", name: "1ms.dog", url: SITE + "/", inLanguage: langs.map(([l]) => l) },
        { "@type": "WebApplication", name: s ? fill(T("lp_h1"), { s: s.name }) : "1ms.dog", url, applicationCategory: "UtilitiesApplication",
          operatingSystem: "Any", browserRequirements: "Requires JavaScript", description: desc, inLanguage: lang, isAccessibleForFree: true,
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }, isPartOf: { "@id": SITE + "/#site" } },
      ];
      if (!s) graph.push({ "@type": "FAQPage", mainEntity: docs.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) });
      else graph.push({ "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "1ms.dog", item: SITE + path(slug, "") },
        { "@type": "ListItem", position: 2, name: s.name, item: url }] });
      const head = [
        `<title>${esc(title)}</title>`,
        `<meta name="description" content="${esc(desc)}">`,
        `<meta name="keywords" content="${esc(s ? `${s.name} latency, ${s.name} ping, ${s.name} slow, ` + T("seo_kw") : T("seo_kw"))}">`,
        `<meta name="robots" content="index, follow, max-image-preview:large">`,
        `<meta name="application-name" content="1ms.dog">`,
        `<meta name="theme-color" content="#f6f6f7" media="(prefers-color-scheme: light)">`,
        `<meta name="theme-color" content="#1c1c1c" media="(prefers-color-scheme: dark)">`,
        `<link rel="canonical" href="${url}">`, alts,
        `<link rel="icon" href="/favicon.ico" sizes="any">`, `<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">`, `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`,
        `<meta property="og:type" content="website">`, `<meta property="og:site_name" content="1ms.dog">`,
        `<meta property="og:title" content="${esc(title)}">`, `<meta property="og:description" content="${esc(desc)}">`, `<meta property="og:url" content="${url}">`,
        `<meta property="og:image" content="${og}">`, `<meta property="og:image:width" content="1200">`, `<meta property="og:image:height" content="630">`,
        `<meta property="og:locale" content="${locale}">`,
        `<meta name="twitter:card" content="summary_large_image">`, `<meta name="twitter:title" content="${esc(title)}">`, `<meta name="twitter:description" content="${esc(desc)}">`,
        `<meta name="twitter:image" content="${og}">`,
        `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c")}</script>`,
      ].join("\n");

      // every service is in the HTML, so crawlers and no-JS readers see what is tested. Local favorites come first.
      const row = x => `<li class="row${s && x.id === s.id ? " hot" : ""}" id="t-${x.id}"><span class="nm">${esc(x.name)}</span><span class="trk"><i class="tail"></i><i class="b"></i></span><b class="ms">–</b></li>`;
      const order = s ? [s.cat, ...CATS.filter(c => c !== s.cat)] : CATS;
      const packOpts = Object.keys(PACKS).map(p => `<option value="${p}"${p === defPack ? " selected" : ""}>${esc(T("pk_" + p))}</option>`).join("");
      const local = `<div class="grp"><h2>${esc(T("cat_local"))}<label class="sel"><span class="sr">${esc(T("pack"))}</span><select id="pack">${packOpts}</select></label></h2><ul id="localRows">${PACKS[defPack].map(row).join("")}</ul></div>`;
      const cats = order.map(c => `<div class="grp"><h2>${esc(T("cat_" + c))}</h2><ul>${SERVICES.filter(x => x.cat === c).map(row).join("")}</ul></div>`);
      // a landing page puts its own service's group first
      const groups = (s ? [cats[0], local, ...cats.slice(1)] : [local, ...cats]).join("\n");
      const axis = ["zoom", "sprint", "trot", "stroll", "nap"].map((k, i) => `<span class="c${i + 1}"><i></i><b>${esc(T("tier_" + k))}</b>${i < 4 ? "≤ " + ZONES[i] : "> " + ZONES[3]} ms</span>`).join("") +
        `<span class="cx"><i></i><b>${esc(T("tier_lost"))}</b></span>`;
      const tools = TOOLS.map(x => `<a href="https://${x.host}${toolHome(x.id, lang, slug)}" style="--tint:${x.tint}" title="${esc(T("tool_" + x.id))}"><svg viewBox="0 0 16 16" aria-hidden="true">${x.icon}</svg>${esc(x.name)}</a>`).join("");
      const faq = docs.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join("\n");
      const intro = s ? `<p class="intro">${esc(fill(T("lp_intro"), { s: s.name }))}</p>` : "";
      const langOpts = langs.map(([l]) => `<option value="${l}"${l === lang ? " selected" : ""}>${esc(I[l].name)}</option>`).join("");
      const paths = Object.fromEntries(langs.map(([l, sl]) => [l, path(sl, sub)]));
      const data = { lang, paths, pack: defPack, spot: s ? s.id : null, i18n: strings };

      let html = tpl
        .replace(/(<(\w+)\b[^>]*\sdata-i="(\w+)"[^>]*>)([^<]*)(<\/\2>)/g, (m, open, tag, k, inner, close) => open + esc(T(k)) + close)
        .replace("{{lang}}", lang).replace("{{pathsAttr}}", esc(JSON.stringify(paths))).replace("{{rootAttr}}", slug || sub ? "" : " data-root")
        .replace("{{prepaint}}", PREPAINT).replace("{{head}}", head).replace("{{css}}", cssName).replace("{{js}}", jsName)
        .replace("{{homeHref}}", path(slug, "")).replace("{{langOpts}}", langOpts)
        .replace("{{h1}}", esc(h1)).replace("{{intro}}", intro)
        .replace("{{axis}}", axis).replace("{{groups}}", groups).replace("{{tools}}", tools).replace("{{faq}}", faq)
        .replace("{{data}}", JSON.stringify(data).replace(/</g, "\\u003c"));
      if (/\{\{\w+\}\}/.test(html)) throw new Error("unfilled placeholder in " + path(slug, sub) + ": " + /\{\{\w+\}\}/.exec(html)[0]);
      pages.push({ file: (slug ? slug + "/" : "") + (sub ? sub + "/" : "") + "index.html", url, sub, html });
    }
  }

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
    pages.map(p => `  <url>\n    <loc>${p.url}</loc>\n    <priority>${p.sub ? "0.7" : "1.0"}</priority>\n` +
      langs.map(([l, s]) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${SITE + path(s, p.sub)}"/>`).join("\n") +
      `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE + path("", p.sub)}"/>\n  </url>`).join("\n") + "\n</urlset>\n";
  const robots = `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`;
  const llms = `# 1ms.dog

> Free browser tool: shows the visitor's exit IP (IPv4, IPv6, ISP/ASN, city, nearest Cloudflare edge, proxy/VPN/WebRTC
> hints) and times real HTTPS round trips from their browser to ${SERVICES.length} major services plus a local pack
> chosen by exit country. Everything runs client-side; no results are sent to 1ms.dog.

- Home: ${SITE}/ (also ${langs.slice(1).map(([, s]) => "/" + s + "/").join(", ")})
- Service pages: ${landIds.map(id => `${SITE}/${id}/`).join(", ")}
- Services tested: ${SERVICES.map(s => s.name).join(", ")}
- Speed grades (median HTTPS round trip): 1ms dog < 2 ms, Zoomies ≤ 30, Sprint ≤ 80, Trot ≤ 150, Stroll ≤ 300, Nap > 300, Not back = no connection in 5 s

## Other 1ms.dog tools
${TOOLS.map(x => `- ${x.name}: https://${x.host}/ (${en["tool_" + x.id]})`).join("\n")}
`;

  // The only inline script is the pre-paint snippet, identical on every page: one hash covers the site.
  // connect-src / img-src allow any https host: the test fetches the services from the browser.
  // style-src needs 'unsafe-inline' for the tile colors (style="--c") and the inlined shiba's own <style>.
  const csp = ["default-src 'self'", `script-src 'self' 'sha256-${sha(PREPAINT)}'`, "style-src 'self' 'unsafe-inline'",
    "font-src 'self'", "img-src 'self' data: https:", "connect-src 'self' https:", "manifest-src 'self'",
    "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'"].join("; ");
  const headers = `# Generated by scripts/build.mjs
/*
  Content-Security-Policy: ${csp}
  Referrer-Policy: strict-origin-when-cross-origin
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Cross-Origin-Opener-Policy: same-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()
/assets/*
  Cache-Control: public, max-age=604800
/assets/app.*
  ! Cache-Control
  Cache-Control: public, max-age=31536000, immutable
/assets/fonts/*
  ! Cache-Control
  Cache-Control: public, max-age=31536000, immutable
/flags/*
  Cache-Control: public, max-age=2592000
/og/*
  Cache-Control: public, max-age=604800
/llms.txt
  Access-Control-Allow-Origin: *
  Content-Type: text/plain; charset=utf-8
`;

  const files = { ["assets/" + jsName]: app, ["assets/" + cssName]: css, "sitemap.xml": sitemap, "robots.txt": robots, "llms.txt": llms, "_headers": headers };
  for (const p of pages) files[p.file] = p.html;

  const stale = [];
  for (const [name, text] of Object.entries(files)) {
    const url = new URL(name, pub);
    const current = await readFile(url, "utf8").catch(() => null);
    if (current === text) continue;
    if (check) { stale.push(name); continue; }
    await mkdir(new URL(".", url), { recursive: true });
    await writeFile(url, text);
  }
  // old bundles
  const old = (await readdir(new URL("assets/", pub))).filter(f => /^app\.[0-9a-f]+\.(js|css)$/.test(f) && f !== jsName && f !== cssName);
  if (check && old.length) stale.push(...old.map(f => f + " (old)"));
  else for (const f of old) await rm(new URL("assets/" + f, pub));
  return { stale, pages: pages.length, sizes: { html: Math.max(...pages.map(p => p.html.length)), js: app.length, css: css.length } };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  const r = await build({ check });
  if (check && r.stale.length) { console.error("out of date (run npm run build):\n  " + r.stale.join("\n  ")); process.exit(1); }
  console.log(`${r.pages} pages · largest HTML ${(r.sizes.html / 1024).toFixed(1)} KB · JS ${(r.sizes.js / 1024).toFixed(1)} KB · CSS ${(r.sizes.css / 1024).toFixed(1)} KB`);
}
