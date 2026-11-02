#!/usr/bin/env node
// Builds the static site in public/ from src/:
//   index.html, <lang>/index.html                 home page per language
//   <id>/, <lang>/<id>/                           a landing page per searched-for service (land: true)
//   assets/app.<hash>.js, assets/app.<hash>.css   app code and styles, shared and cached by every page
//   assets/share/                                 the shared share dialog, copied verbatim from 1ms-shell (not built)
//   sitemap.xml, robots.txt, llms.txt, _headers   SEO and security headers (CSP)
//   services.json                                 the list for the command-line tool (github.com/yt1988/https-latency-test-cli)
// Usage: node scripts/build.mjs          write the files
//        node scripts/build.mjs --check  exit 1 if anything is out of date, or the app code does not parse (CI)
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { transform } from "esbuild";
import { fillIn } from "../src/lib.mjs";
import KO from "../src/i18n/ko.mjs";
import { CATS, SERVICES, PACKS, PACK_OF, SCALE, ZONES, USES, SUBS, TG_DC_OF, UNLOCK, pos } from "../src/services.mjs";

const SITE = (process.env.SITE_URL || "https://1ms.dog").replace(/\/+$/, "");
const pub = new URL("../public/", import.meta.url), src = new URL("../src/", import.meta.url);
// language, URL folder, og:locale, default local pack before the exit country is known; the first is the root
export const LANGS = [["en", "", "en_US", "na"], ["zh-CN", "zh-cn", "zh_CN", "cn"], ["zh-TW", "zh-tw", "zh_TW", "tw"], ["ja", "ja", "ja_JP", "jp"],
  ["ko", "ko", "ko_KR", "kr"], ["es", "es", "es_ES", "latam"], ["fr", "fr", "fr_FR", "eu"], ["de", "de", "de_DE", "eu"], ["pt", "pt", "pt_BR", "latam"],
  ["ru", "ru", "ru_RU", "ru"]];
// Runs before first paint: apply the saved theme. On the English root, send visitors to their language's page
// (a saved choice first, then the browser languages); crawlers and English readers stay.
const PREPAINT = `(function(){var d=document.documentElement,th=null,s=null;try{th=localStorage.getItem("1ms:theme");s=localStorage.getItem("1ms:lang")}catch(e){}if(th==="light"||th==="dark")d.setAttribute("data-theme",th);if(!d.hasAttribute("data-root"))return;var P=JSON.parse(d.getAttribute("data-paths")||"{}"),l=null;try{var q=new URLSearchParams(location.search).get("lang");if(P[q])l=q}catch(e){}if(!l&&P[s])l=s;for(var ls=navigator.languages||[navigator.language||"en"],i=0;!l&&!s&&i<ls.length;i++){var x=String(ls[i]).toLowerCase(),b=x.split("-")[0];l=b==="zh"?(/tw|hk|mo|hant/.test(x)?"zh-TW":"zh-CN"):P[b]?b:null}if(l&&l!=="en"){var r=location.pathname.match(/[/]r[/][^/]+[/]?$/);location.replace(P[l]+(r?r[0].slice(1):"")+location.hash)}})();`;

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fill = (s, v) => fillIn(s, v, KO.josa_fin);
// a group name can start or end in Latin ("CDN", "AI") inside Chinese or Japanese text: put a space at that boundary
const CJK = "\u3040-\u30ff\u3400-\u9fff";
const spaced = s => s.replace(new RegExp(`([${CJK}])([A-Za-z0-9])`, "g"), "$1 $2").replace(new RegExp(`([A-Za-z0-9])([${CJK}])`, "g"), "$1 $2");
const hash = s => createHash("sha256").update(s).digest("hex").slice(0, 10);
const sha = s => createHash("sha256").update(s).digest("base64");

// Windows sometimes holds a just-written file for a moment (antivirus, the preview server): retry before failing
async function writeRetry(url, text) {
  for (let i = 0; ; i++) {
    try { return await writeFile(url, text); }
    catch (e) { if (i >= 4 || !["UNKNOWN", "EBUSY", "EPERM"].includes(e.code)) throw e; await new Promise(r => setTimeout(r, 150 * (i + 1))); }
  }
}

// The command-line tool (github.com/yt1988/https-latency-test-cli): the install line on the home page's card. Its
// installers and release files come through this site's Worker (src/worker.js: /i, /i.ps1, /dl/*); the dialog with
// every way to run it is filled in by src/app.js when it opens (the HTML stays under its size budget).
const cliCmd = `curl -fsSL ${SITE}/i | sh`;

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

  const svc = { list: SERVICES.map(({ via, origin, ...s }) => s), packs: PACKS, packOf: PACK_OF, scale: SCALE, cats: CATS, uses: USES, subs: SUBS, tgDcOf: TG_DC_OF, unlock: UNLOCK };
  // src/lib.mjs (the pure logic the tests import) goes inside the app's scope, at its /* @lib */ marker
  const lib = (await readFile(new URL("lib.mjs", src), "utf8")).replace(/^export /gm, "");
  const appSrc = await readFile(new URL("app.js", src), "utf8");
  if (!appSrc.includes("/* @lib */")) throw new Error("src/app.js has no /* @lib */ marker");
  const appFull = `const SVC = ${JSON.stringify(svc)};\n` + appSrc.replace("/* @lib */", () => lib);
  new Function(appFull);                                                // must parse
  // the lanes are colored by speed zone, at the same log-scale positions the page puts the balls
  const pct = ms => (pos(ms) * 100).toFixed(1) + "%", Z = ZONES.map(pct);
  const bands = `linear-gradient(90deg, var(--t1) 0 ${Z[0]}, var(--t2) ${Z[0]} ${Z[1]}, var(--t3) ${Z[1]} ${Z[2]}, var(--t4) ${Z[2]} ${Z[3]}, var(--t5) ${Z[3]} 100%)`;
  const cssFull = (await Promise.all(["fonts.css", "style.css", "layout.css"].map(f => readFile(new URL(f, src), "utf8")))).join("\n") + `\n.field, .slane { --bands: ${bands}; }\n`;
  // minified with esbuild (pinned version, so the output, and its hash, only changes when the source does)
  const js = (await transform(appFull, { loader: "js", minify: true, target: "es2020", legalComments: "none" })).code;
  const css = (await transform(cssFull, { loader: "css", minify: true, legalComments: "none" })).code;
  const app = js;
  const jsName = `app.${hash(app)}.js`, cssName = `app.${hash(css)}.css`;

  // Landing pages per language: each market searches latency for different services (GitHub and Docker Hub in
  // China, YouTube and Discord in Russia, WhatsApp and console gaming in Latin America…), set by `land` in its strings.
  const landOf = l => (I[l].land || en.land).filter(id => SERVICES.some(x => x.id === id));
  // Group pages: one per category (/ai/, /video/…) and one per region (/region/jp/…), in every language. They test
  // just that group, and the home page's category headings and every footer link to them.
  const GROUP_SUBS = [...CATS, ...Object.keys(PACKS).map(p => "region/" + p)];
  const groupOf = sub => {
    if (CATS.includes(sub)) return { kind: "cat", id: sub, members: SERVICES.filter(x => x.cat === sub) };
    const m = /^region\/(\w+)$/.exec(sub || "");
    return m && PACKS[m[1]] ? { kind: "region", id: m[1], members: PACKS[m[1]] } : null;
  };
  // Every service has its own page (the field links each name to it), local packs included. Only the services a
  // language searches for (`land`) are indexed: hundreds of near-identical pages would read as thin content.
  const ALL = [...SERVICES, ...Object.values(PACKS).flat()].filter((x, i, a) => a.findIndex(y => y.id === x.id) === i);
  const packOfService = id => Object.keys(PACKS).find(p => PACKS[p].some(x => x.id === id));
  const has = (l, sub) => !sub || GROUP_SUBS.includes(sub) || ALL.some(x => x.id === sub);
  const indexed = (l, sub) => !sub || GROUP_SUBS.includes(sub) || landOf(l).includes(sub);
  // hreflang and sitemap alternates point only at indexed versions (an alternate that is noindex is a search error)
  const altsOf = sub => langs.filter(([l]) => indexed(l, sub));
  const path = (slug, sub) => "/" + (slug ? slug + "/" : "") + (sub ? sub + "/" : "");
  const RUNTIME_SKIP = new Set(["docs", "egress_link", "seo_title", "seo_desc", "seo_kw", "og_sub", "lede", "lp_title", "lp_desc", "lp_intro", "lp_h1", "lp_kw", "lp_peers", "lp_via", "lp_via_same", "land", "lg_title", "lg_desc", "lg_h1", "lg_kw", "lg_intro", "lg_about", "lg_region", "sm_cats", "sm_regions", "grp_best", "grp_worst", "sitemap_h", "sm_item", "cta_h", "cta_d", "cta_btn", "one_med", "one_cold", "one_jit", "foot",
    "name", "h1", "lang_label", "faq_h", "pack", "exit_h", "test_mine", "r_title", "r_one"]);
  // static text the page already shows, and region names (only the server-rendered picker uses them)
  const runtimeKey = k => !RUNTIME_SKIP.has(k) && !k.startsWith("pk_") && !k.startsWith("a_");
  const pages = [], stringFiles = {};
  for (const [lang, slug, locale, defPack] of langs) {
    const d = I[lang], T = k => d[k] ?? en[k] ?? k;
    // The strings the browser code needs live in a small per-language script under /assets/ (cached for a year,
    // served without passing through the site's HTML rewriting), not inline in every page.
    const strings = Object.fromEntries(Object.keys(en).filter(runtimeKey).map(k => [k, T(k)]));
    const sjs = `window.L1MS=${JSON.stringify(strings).replace(/</g, "\\u003c")};\n`;
    const sName = `l.${lang.toLowerCase()}.${hash(sjs)}.js`;
    stringFiles["assets/" + sName] = sjs;
    // a group's name in this language: the category's, or "popular sites in <region>"
    const gName = g => g.kind === "cat" ? T("cat_" + g.id) : fill(T("lg_region"), { r: T("pk_" + g.id) });
    for (const sub of ["", ...ALL.map(x => x.id), ...GROUP_SUBS]) {
      const s = sub ? ALL.find(x => x.id === sub) || null : null, g = s ? null : groupOf(sub), idx = indexed(lang, sub);
      const gn = g ? gName(g) : "", gList = g ? g.members.map(x => x.name) : [];
      const url = SITE + path(slug, sub);
      const title = s ? fill(T("lp_title"), { s: s.name }) : g ? spaced(fill(T("lg_title"), { g: gn, list: gList.slice(0, 4).join(T("v_join")) })) : T("seo_title");
      const desc = s ? fill(T("lp_desc"), { s: s.name }) : g ? spaced(fill(T("lg_desc"), { g: gn, list: gList.join(T("v_join")) })) : T("seo_desc");
      const h1 = s ? fill(T("lp_h1"), { s: s.name }) : g ? spaced(fill(T("lg_h1"), { g: gn })) : T("h1");
      // hreflang lists the languages where this page is indexed; x-default is the English one when it is
      const alts = altsOf(sub).map(([l, sl]) => `<link rel="alternate" hreflang="${l}" href="${SITE + path(sl, sub)}">`).join("\n") +
        (indexed("en", sub) ?`\n<link rel="alternate" hreflang="x-default" href="${SITE + path("", sub)}">` : "");
      const docs = d.docs || en.docs;
      const og = `${SITE}/og/${lang.toLowerCase()}${s && idx ? "/" + sub : ""}.png`;   // indexed service pages have their own card
      const graph = [
        { "@type": "WebSite", "@id": SITE + "/#site", name: "1ms.dog", url: SITE + "/", inLanguage: langs.map(([l]) => l) },
        { "@type": "WebApplication", name: s || g ? h1 : "1ms.dog", url, applicationCategory: "UtilitiesApplication",
          operatingSystem: "Any", browserRequirements: "Requires JavaScript", description: desc, inLanguage: lang, isAccessibleForFree: true,
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }, isPartOf: { "@id": SITE + "/#site" } },
      ];
      // No FAQPage markup: Google shows FAQ rich results only for government and health sites since 2023, and the
      // answers are already in the page (help dialog); a second copy would only make every page bigger.
      if (s || g) graph.push({ "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "1ms.dog", item: SITE + path(slug, "") },
        { "@type": "ListItem", position: 2, name: s ? s.name : gn, item: url }] });
      const head = [
        `<title>${esc(title)}</title>`,
        `<meta name="description" content="${esc(desc)}">`,
        `<meta name="keywords" content="${esc(s ? fill(T("lp_kw"), { s: s.name }) : g ? fill(T("lg_kw"), { g: gn, list: gList.join(", ") }) : T("seo_kw"))}">`,
        // Baidu: don't transcode the page for mobile; it serves phones and desktops alike
        ...(lang === "zh-CN" ? [`<meta http-equiv="Cache-Control" content="no-transform">`, `<meta http-equiv="Cache-Control" content="no-siteapp">`, `<meta name="applicable-device" content="pc,mobile">`] : []),
        `<meta name="robots" content="${idx ? "index" : "noindex"}, follow, max-image-preview:large">`,
        `<meta name="application-name" content="1ms.dog">`,
        `<meta name="theme-color" content="#f6f6f7" media="(prefers-color-scheme: light)">`,
        `<meta name="theme-color" content="#1c1c1c" media="(prefers-color-scheme: dark)">`,
        `<link rel="canonical" href="${url}">`, alts,
        `<link rel="icon" href="/favicon.ico" sizes="any">`, `<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">`, `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`,
        `<meta property="og:type" content="website">`, `<meta property="og:site_name" content="1ms.dog">`,
        `<meta property="og:title" content="${esc(title)}">`, `<meta property="og:description" content="${esc(desc)}">`, `<meta property="og:url" content="${url}">`,
        `<meta property="og:image" content="${og}">`, `<meta property="og:image:width" content="1200">`, `<meta property="og:image:height" content="630">`,
        `<meta property="og:locale" content="${locale}">`, ...altsOf(sub).filter(([l]) => l !== lang).map(([, , loc]) => `<meta property="og:locale:alternate" content="${loc}">`),
        `<meta name="twitter:card" content="summary_large_image">`, `<meta name="twitter:title" content="${esc(title)}">`, `<meta name="twitter:description" content="${esc(desc)}">`,
        `<meta name="twitter:image" content="${og}">`,
        `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c")}</script>`,
      ].join("\n");

      // every service is in the HTML, so crawlers and no-JS readers see what is tested. Local favorites come first.
      const row = x => `<li class="row${s && x.id === s.id ? " hot" : ""}" id="t-${x.id}">${x.dc ? `<span class="nm">${esc(x.name)}</span>` : `<a class="nm" href="${path(slug, x.id)}"${x.short ? ` title="${esc(x.name)}"` : ""}>${esc(x.short || x.name)}</a>`}<span class="trk"><i class="tail"></i><i class="b"></i></span><b class="ms">–</b></li>`;
      const order = s ? [s.cat, ...CATS.filter(c => c !== s.cat)] : CATS;
      const packOpts = Object.keys(PACKS).map(p => `<option value="${p}"${p === defPack ? " selected" : ""}>${esc(T("pk_" + p))}</option>`).join("");
      const local = `<div class="grp"><h2>${esc(T("cat_local"))}<label class="sel"><span class="sr">${esc(T("pack"))}</span><select id="pack">${packOpts}</select></label></h2><ul id="localRows">${PACKS[defPack].map(row).join("")}</ul></div>`;
      // on the home page each category heading links to that category's own page
      const cats = order.map(c => `<div class="grp"><h2><a href="${path(slug, c)}">${esc(T("cat_" + c))}</a></h2><ul>${SERVICES.filter(x => x.cat === c).map(row).join("")}</ul></div>`);
      // a group page shows only its own services
      // A group page has one short list: it takes the full width (longer lanes, easier to compare), with the
      // speed-zone limits marked under it at the same log-scale positions as the balls.
      const scale = `<div class="scale" aria-hidden="true">${ZONES.map((z, i) => `<span style="left:${(pos(z) * 100).toFixed(1)}%">${z}${i === ZONES.length - 1 ? " ms" : ""}</span>`).join("")}</div>`;
      // a service page with parts (Telegram's data centers) lists them the same way
      const subs = s && SUBS[s.id];
      const groups = g ? `<div class="grp solo"><h2>${esc(gn)}</h2><ul>${g.members.map(row).join("")}</ul>${scale}</div>`
        : subs ? `<div class="grp solo"><h2>${esc(T("sub_" + s.id))}</h2><ul>${subs.map(row).join("")}</ul>${scale}</div>` : [local, ...cats].join("\n");
      const axis = ["zoom", "sprint", "trot", "stroll", "nap"].map((k, i) => `<span class="c${i + 1}"><i></i><b>${esc(T("tier_" + k))}</b>${i < 4 ? "≤ " + ZONES[i] : "> " + ZONES[3]} ms</span>`).join("") +
        `<span class="cx"><i></i><b>${esc(T("tier_lost"))}</b></span>`;
      // the uses row is in the HTML from the start, so it already takes its space while the test runs
      const uses = USES.map(([k]) => `<span class="use">${esc(T("use_" + k))}<b>…</b></span>`).join("");
      // A landing page's own facts: what it is compared with, and which edge network answers (with the other services on
      // it: slow there too means the route to that network, not this service). That makes every landing page different.
      // The intro stays in the hero; the facts are the first answer in the "?" dialog (background stays off the page,
      // and the dialog is in the HTML, so crawlers still read it). [question, answer as HTML]
      let intro = "", about = null;
      if (s) {
        const join = list => list.join(T("v_join"));
        // compared with the same category, or for a local favorite, the rest of its region's pack
        const peers = (s.cat === "local" ? PACKS[packOfService(s.id)] : SERVICES.filter(x => x.cat === s.cat)).filter(x => x.id !== s.id).map(x => x.name);
        const same = s.via ? SERVICES.filter(x => x.via === s.via && x.id !== s.id).map(x => x.name) : [];
        const facts = [fill(T("lp_peers"), { s: s.name, cat: T("cat_" + s.cat), list: join(peers) })];
        if (s.via) facts.push(fill(T(same.length ? "lp_via_same" : "lp_via"), { s: s.name, via: s.via, list: join(same) }));
        intro = `<p class="intro">${esc(fill(T("lp_intro"), { s: s.name }))}</p>`;
        about = [fill(T("lp_h1"), { s: s.name }), facts.map(esc).join(" ")];
      }
      if (g) {
        intro = `<p class="intro">${esc(fill(T("lg_intro"), { n: g.members.length, g: gn, list: gList.join(T("v_join")) }))}</p>`;
        // links to the members' own pages, where this language has one
        const own = g.members.filter(x => landOf(lang).includes(x.id));
        if (own.length) about = [h1, `${esc(T("lg_about"))} ${own.map(x => `<a href="${path(slug, x.id)}">${esc(fill(T("sm_item"), { s: x.name }))}</a>`).join(T("v_join"))}`];
      }
      // help dialog: in the HTML (crawlers read it), one answer shown at a time; a landing page's facts come first
      const qa = [...(about ? [about] : []), ...docs.map(([q, a]) => [q, esc(a)])];
      const helpNav = qa.map(([q], i) => `<button type="button" role="tab" data-hq="${i}" aria-selected="${i === 0}">${esc(q)}</button>`).join("");
      const helpC = qa.map(([q, a], i) => `<article data-hqb="${i}"${i ? " hidden" : ""}><h3>${esc(q)}</h3><p>${a}</p></article>`).join("");
      const langOpts = langs.map(([l]) => `<option value="${l}"${l === lang ? " selected" : ""}>${esc(I[l].name)}</option>`).join("");
      const paths = Object.fromEntries(langs.map(([l, sl]) => [l, path(sl, sub)]));
      const data = { lang, paths, pack: defPack, spot: s ? s.id : null, set: g ? { kind: g.kind, id: g.id, name: gn } : null };
      // footer sitemap: this language's home and every single-service page, with anchor texts people search for
      const sitemapNav = `<b>${esc(T("sitemap_h"))}</b><a href="${path(slug, "")}"${sub ? "" : ' aria-current="page"'}>${esc(T("cta_btn"))}</a>` +
        landOf(lang).map(id => { const x = SERVICES.find(v => v.id === id);
          return `<a href="${path(slug, id)}"${id === sub ? ' aria-current="page"' : ""}>${esc(fill(T("sm_item"), { s: x.name }))}</a>`; }).join("") +
        `<i class="br"></i><b>${esc(T("sm_cats"))}</b>` + CATS.map(c => `<a href="${path(slug, c)}"${c === sub ? ' aria-current="page"' : ""}>${esc(T("cat_" + c))}</a>`).join("") +
        `<i class="br"></i><b>${esc(T("sm_regions"))}</b>` + Object.keys(PACKS).map(p => `<a href="${path(slug, "region/" + p)}"${"region/" + p === sub ? ' aria-current="page"' : ""}>${esc(T("pk_" + p))}</a>`).join("");

      // <!--v:full,grp--> … <!--/v-->: kept on the pages whose variant is listed (home: full, service: one, group: grp)
      // "sub": a service page that also lists the service's parts, so it keeps the field
      const modes = [s ? "one" : g ? "grp" : "full", ...(subs ? ["sub"] : [])];
      const variant = t0 => t0.replace(/<!--v:([\w,]+)-->\n?([\s\S]*?)<!--\/v-->\n?/g, (m, list, body) => list.split(",").some(v => modes.includes(v)) ? body : "");
      let html = variant(tpl)
        .replace(/(<(\w+)\b[^>]*\sdata-i="(\w+)"[^>]*>)([^<]*)(<\/\2>)/g, (m, open, tag, k, inner, close) => open + esc(T(k)) + close)
        .replace("{{waitText}}", esc(s ? fill(T("v_one_wait"), { s: s.name }) : g ? fill(T("v_grp_wait"), { g: gn }) : T("v_wait"))).replace("{{sitemap}}", sitemapNav).replace("{{autoOn}}", s || g ? " checked" : "")
        .replace("{{lang}}", lang).replace("{{pathsAttr}}", esc(JSON.stringify(paths))).replace("{{rootAttr}}", slug || sub ? "" : " data-root")
        .replace("{{prepaint}}", PREPAINT).replace("{{head}}", head).replace("{{css}}", cssName).replace("{{js}}", jsName).replace("{{strings}}", sName)
        .split("{{homeHref}}").join(path(slug, "")).replace("{{langOpts}}", langOpts)
        // the exit list links to EgressLens (which IP each site sees), in the same language
        .replace("{{h1}}", esc(h1)).replace("{{intro}}", intro).replace("{{uses}}", uses)
        .replace("{{cliCmd}}", esc(cliCmd))
        .replace("{{axis}}", axis).replace("{{groups}}", groups).replace("{{helpNav}}", helpNav).replace("{{helpC}}", helpC)
        .replace(/\{\{a:(\w+)\}\}/g, (_, k) => esc(T(k))).replace("{{data}}", JSON.stringify(data).replace(/</g, "\\u003c"));
      if (/\{\{\w+\}\}/.test(html)) throw new Error("unfilled placeholder in " + path(slug, sub) + ": " + /\{\{\w+\}\}/.exec(html)[0]);
      pages.push({ file: (slug ? slug + "/" : "") + (sub ? sub + "/" : "") + "index.html", url, lang, sub, html, idx });
    }
  }

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
    pages.filter(p => p.idx).map(p => `  <url>\n    <loc>${p.url}</loc>\n    <priority>${!p.sub ? "1.0" : groupOf(p.sub) ? "0.8" : "0.7"}</priority>\n` +
      altsOf(p.sub).map(([l, s]) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${SITE + path(s, p.sub)}"/>`).join("\n") +
      (indexed("en", p.sub) ? `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE + path("", p.sub)}"/>` : "") + `\n  </url>`).join("\n") + "\n</urlset>\n";
  const robots = `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`;
  const llms = `# 1ms.dog

> Free browser tool: shows the visitor's exit IP (IPv4, IPv6, ISP/ASN, city, nearest Cloudflare edge, proxy/VPN/WebRTC
> hints) and times real HTTPS round trips from their browser to ${SERVICES.length} major services plus a local pack
> chosen by exit country. Everything runs client-side; no results are sent to 1ms.dog.

- Home: ${SITE}/ (also ${langs.slice(1).map(([, s]) => "/" + s + "/").join(", ")})
- Service pages: ${landOf("en").map(id => `${SITE}/${id}/`).join(", ")}
- Group pages: ${GROUP_SUBS.map(g => `${SITE}/${g}/`).join(", ")}
- Services tested: ${SERVICES.map(s => s.name).join(", ")}
- Speed grades (median HTTPS round trip): 1ms dog < 2 ms, Zoomies ≤ 30, Sprint ≤ 80, Trot ≤ 150, Stroll ≤ 300, Nap > 300, Not back = no connection in 5 s
`;

  // The command-line tool measures the same URLs: it reads this list on every run (and keeps a copy built in)
  const strip = ({ id, name, cat, url, m, raw, origin }) => ({ id, name, cat, url, ...(m && { m }), ...(raw && { raw }), ...(origin && { origin }) });
  const cliList = JSON.stringify({
    version: 1, services: SERVICES.map(strip), packs: Object.fromEntries(Object.entries(PACKS).map(([k, v]) => [k, v.map(strip)])),
    packOf: PACK_OF, langPack: Object.fromEntries(LANGS.map(([l, , , p]) => [l, p])),
    uses: USES.map(([use, ids, good, ok]) => ({ use, ids, good, ok })),
    telegram: SUBS.telegram.map(({ dc, city, cc, url }) => ({ dc, city, cc, url })), telegramOf: TG_DC_OF,
  }, null, 1) + "\n";

  // The only inline script is the pre-paint snippet, identical on every page: one hash covers the site.
  // connect-src / img-src allow any https host: the test fetches the services from the browser.
  // style-src needs 'unsafe-inline' for the tile colors (style="--c") and the inlined shiba's own <style>.
  const csp = ["default-src 'self'", `script-src 'self' 'sha256-${sha(PREPAINT)}'`, "style-src 'self' 'unsafe-inline'",
    "font-src 'self'", "img-src 'self' data: blob: https:", "connect-src 'self' https:", "manifest-src 'self'",
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
/assets/l.*
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
/services.json
  Access-Control-Allow-Origin: *
  Cache-Control: public, max-age=3600
`;

  const files = { ["assets/" + jsName]: app, ["assets/" + cssName]: css, ...stringFiles, "sitemap.xml": sitemap, "robots.txt": robots, "llms.txt": llms, "services.json": cliList, "_headers": headers };
  for (const p of pages) files[p.file] = p.html;

  const stale = [];
  for (const [name, text] of Object.entries(files)) {
    const url = new URL(name, pub);
    const current = await readFile(url, "utf8").catch(() => null);
    if (current === text) continue;
    if (check) { stale.push(name); continue; }
    await mkdir(new URL(".", url), { recursive: true });
    await writeRetry(url, text);
  }
  // pages no longer built (a landing page a language dropped, say): only index.html files, never assets
  const walk = async dir => (await readdir(new URL(dir, pub), { withFileTypes: true })).flatMap(e => e.isDirectory() ? [dir + e.name + "/"] : []);
  const dirs = [""];
  for (let i = 0; i < dirs.length; i++) if (!/^(assets|flags|og)\//.test(dirs[i])) dirs.push(...await walk(dirs[i]));
  for (const d of dirs) {
    const f = d + "index.html";
    if (files[f] || !(await readFile(new URL(f, pub)).catch(() => null))) continue;
    if (check) stale.push(f + " (old)"); else await rm(new URL(f, pub));
  }
  // old bundles
  const old = (await readdir(new URL("assets/", pub))).filter(f => /^(app|qr|l\.[a-z-]+)\.[0-9a-f]+\.(js|css)$/.test(f) && !files["assets/" + f]);
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
