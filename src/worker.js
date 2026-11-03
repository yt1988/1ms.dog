// The Worker in front of public/. A request for a file there never reaches it (static assets are free and unmetered);
// it sees only what no file answers:
//   /<lang>/[<page>/]r/<code>   a shared result (src/lib.mjs): that page with the result in its title and description,
//                         so a chat app's link preview shows it
//   /<lang>/c/<a>/<b>     two results compared: the home page with the verdict as its title ("B is faster: 39 faster ·
//                         Claude answers again"), in the words of the shared compare mode the page itself uses
//                         (public/assets/share/compare.js, copied from 1ms-shell); before it is sent it also gets what
//                         keeps it from moving while the view is drawn: compare.css, the banner's verdict and sides,
//                         and the exact height of the groups
//   /i, /i.ps1            the command-line tool's installers (install.sh, install.ps1 of its latest release):
//                         curl -fsSL https://1ms.dog/i | sh   ·   irm https://1ms.dog/i.ps1 | iex
//   /v                    the tool's latest version, "0.1.0", asked of GitHub and kept for 10 minutes
//   /dl/<tag>/<file>      a file of that release, fetched from GitHub once and then kept (a tag's files never change);
//                         <tag> may be "latest", which redirects to the current tag
// The installer and the tool try these before GitHub, which is often slow or blocked in mainland China. A result or
// compare link whose code can't be read (mangled, cut off, an unknown version), and anything else: the plain 404 (the
// shell shows its 404 page).
import { parseShare, median, tierOf, fmt, fillIn, diffShares, exitsText, regionName } from "./lib.mjs";
import { compare } from "../public/assets/share/compare.js";
import { SERVICES, PACKS, CATS, USES } from "./services.mjs";
import en from "./i18n/en.mjs";
import zhCN from "./i18n/zh-CN.mjs";
import zhTW from "./i18n/zh-TW.mjs";
import ja from "./i18n/ja.mjs";
import ko from "./i18n/ko.mjs";
import es from "./i18n/es.mjs";
import fr from "./i18n/fr.mjs";
import de from "./i18n/de.mjs";
import pt from "./i18n/pt.mjs";
import ru from "./i18n/ru.mjs";

const I = { en, "zh-CN": zhCN, "zh-TW": zhTW, ja, ko, es, fr, de, pt, ru };
const DIR = Object.fromEntries(Object.keys(I).filter(l => l !== "en").map(l => [l.toLowerCase(), l]));   // folder → language
const ONE = Object.fromEntries([...SERVICES, ...Object.values(PACKS).flat()].map(s => [s.id, s.name]));

// What the preview says about a result link, or null when the path isn't one:
// { page: the page it shows the result on, title, desc }, or { bad: true } when the code can't be read
export function resultMeta(path) {
  const parts = path.split("/").filter(Boolean);
  if (parts.length >= 3 && parts[parts.length - 3] === "c") return compareMeta(parts);
  if (parts.length < 2 || parts[parts.length - 2] !== "r") return null;
  const code = parts.pop(); parts.pop();
  const lang = DIR[parts[0]] ? DIR[parts.shift()] : "en";
  if (parts.length > 1) return null;
  const page = "/" + (lang === "en" ? "" : lang.toLowerCase() + "/") + (parts[0] ? parts[0] + "/" : "");
  const S = parseShare(code, PACKS);
  if (!S) return { bad: true };
  const L = I[lang], t = (k, v) => fillIn(L[k] ?? en[k], v, L.josa_fin);
  const vals = Object.values(S.res), ok = vals.filter(v => v != null), spot = parts[0] && ONE[parts[0]] && parts[0] in S.res ? parts[0] : null;
  const md = spot ? S.res[spot] : median(ok), tier = t("tier_" + tierOf(md)[0]), ms = md != null ? fmt(md) : "–";
  let where = "";
  const g = S.groups[0];
  if (g) {
    let cn = g.cc;
    try { cn = g.cc && regionName(g.cc, lang); } catch (e) {}
    where = [g.city, cn].filter(Boolean).join(", ");
  }
  const title = (spot ? t("r_one", { s: ONE[spot], ms, tier }) : t("r_title", { ms, tier, ok: ok.length, n: vals.length })) + " · 1ms.dog";
  const desc = t("share_text", { ok: spot ? (md != null ? 1 : 0) : ok.length, n: spot ? 1 : vals.length, where: where || "?", ms, tier });
  return { page, title, desc };
}

// /<lang>/c/<a>/<b>: on the home page only (null elsewhere); { bad: true } (a 404) unless both sides read. cmp: the
// compare view's head as HTML
// (times in UTC; the page redraws it in the visitor's own time zone) and the CSS variables that reserve its height.
export function compareView(A, B, lang) {
  const L = I[lang], label = k => L[k] ?? en[k];
  const country = cc => { try { return regionName(cc, lang); } catch (e) { return cc; } };
  const d = diffShares(A, B, { names: ONE, services: SERVICES, packs: PACKS, cats: CATS, uses: USES, label });
  return compare({ lang, a: { ts: A.ts, sub: exitsText(A.groups, country, label) }, b: { ts: B.ts, sub: exitsText(B.groups, country, label) }, ...d });
}
function compareMeta(parts) {
  const b = parts.pop(), a = parts.pop(); parts.pop();
  const lang = DIR[parts[0]] ? DIR[parts.shift()] : "en";
  const A = parseShare(a, PACKS), B = parseShare(b, PACKS);
  if (parts.length) return null;
  if (!A || !B) return { bad: true };
  const c = compareView(A, B, lang), v = c.verdict, [, , all] = c.stats, ms = x => x != null ? fmt(x) : "✕";
  const share = esc(I[lang].share ?? en.share);
  // the banner's parts only a compare page has, so the other pages don't carry them (every page's HTML counts)
  return { page: "/" + (lang === "en" ? "" : lang.toLowerCase() + "/"), title: v.title + " · 1ms.dog",
    desc: [v.detail, `${all.name} ${ms(all.a)}→${ms(all.b)} ms`].filter(Boolean).join(" · "),
    cmp: { head: `<div class="cmp-head" id="cmpHead">${c.headHTML()}</div>`, style: `--cmp-h1:${c.layout.one}px;--cmp-h2:${c.layout.two}px`,
      share: `<button class="btn icon" id="cmpShare" type="button" title="${share}"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 10V2M5 4.5 8 1.5l3 3M3 8v5.5h10V8"/></svg><span class="sr">${share}</span></button>` } };
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const REPO = "yt1988/https-latency-test-cli";
const FILE = /^(httpslatency-[a-z0-9]+-[a-z0-9]+(\.exe)?|checksums\.txt|install\.sh|install\.ps1)$/;
const INSTALLER = { "/i": "install.sh", "/i.ps1": "install.ps1" };

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url), get = req.method === "GET" || req.method === "HEAD";
    if (get && (url.pathname === "/v" || INSTALLER[url.pathname])) {
      const v = await latest(url, ctx);
      if (!v) return new Response("GitHub did not answer\n", { status: 502 });
      if (INSTALLER[url.pathname]) return release(`v${v}`, INSTALLER[url.pathname], req, ctx);
      return new Response(v + "\n", { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=300" } });
    }
    const dl = get && /^\/dl\/(latest|v\d+\.\d+\.\d+)\/([^/]+)$/.exec(url.pathname);
    if (dl && FILE.test(dl[2])) {
      if (dl[1] !== "latest") return release(dl[1], dl[2], req, ctx);
      const v = await latest(url, ctx);
      if (!v) return new Response("GitHub did not answer\n", { status: 502 });
      return new Response(null, { status: 302, headers: { location: `/dl/v${v}/${dl[2]}`, "cache-control": "public, max-age=300" } });
    }

    const meta = get && resultMeta(url.pathname);
    if (!meta || meta.bad) return env.ASSETS.fetch(req);
    const res = await env.ASSETS.fetch(new Request(new URL(meta.page, url), req));
    if (res.status !== 200) return res;
    // never indexed (canonical still points at the page); the result in the title and description
    const set = v => ({ element(e) { if (v) e.setAttribute("content", v); } });
    const out = new HTMLRewriter()
      .on('meta[name="robots"]', set("noindex, follow"))
      .on("title", { element(e) { if (meta.title) e.setInnerContent(meta.title); } })
      .on('meta[property="og:title"], meta[name="twitter:title"]', set(meta.title))
      .on('meta[name="description"], meta[property="og:description"], meta[name="twitter:description"]', set(meta.desc))
      .on('meta[property="og:url"]', set(url.origin + url.pathname))
      .on("head", { element(e) { if (meta.cmp) e.append('<link rel="stylesheet" href="/assets/share/compare.css">', { html: true }); } })
      .on("#sharedTxt", { element(e) { if (meta.cmp) e.after(meta.cmp.head, { html: true }); } })
      .on("#testMine", { element(e) { if (meta.cmp) e.before(meta.cmp.share, { html: true }); } })
      .on("#cmpBox", { element(e) { if (meta.cmp) e.setAttribute("style", meta.cmp.style); } })
      .transform(res);
    const h = new Headers(out.headers);
    h.delete("etag");
    return new Response(out.body, { status: 200, headers: h });
  },
};

// the newest release's version, from the redirect GitHub gives for /releases/latest
async function latest(url, ctx) {
  const cache = caches.default, key = new URL("/__latest", url).toString();
  const hit = await cache.match(key);
  if (hit) return (await hit.text()).trim();
  const res = await fetch(`https://github.com/${REPO}/releases/latest`, { method: "HEAD", redirect: "manual" });
  const tag = (res.headers.get("location") || "").split("/").pop();
  if (!/^v\d+\.\d+\.\d+$/.test(tag)) return null;
  const v = tag.slice(1);
  ctx.waitUntil(cache.put(key, new Response(v, { headers: { "cache-control": "public, max-age=600" } })));
  return v;
}

async function release(tag, file, req, ctx) {
  const cache = caches.default;
  const key = new Request(new URL(`/dl/${tag}/${file}`, req.url).toString());
  let res = await cache.match(key);
  if (!res) {
    const up = await fetch(`https://github.com/${REPO}/releases/download/${tag}/${file}`, { redirect: "follow" });
    if (!up.ok) return new Response(`${tag}/${file}: GitHub answered ${up.status}\n`, { status: up.status === 404 ? 404 : 502 });
    const text = /\.(txt|sh|ps1)$/.test(file);
    // no content-length: GitHub may send the file compressed, and the body here is already decompressed
    res = new Response(up.body, {
      headers: {
        "content-type": text ? "text/plain; charset=utf-8" : "application/octet-stream",
        "cache-control": "public, max-age=31536000, immutable",
        ...(text ? {} : { "content-disposition": `attachment; filename="${file}"` }),
      },
    });
    ctx.waitUntil(cache.put(key, res.clone()));
  }
  return req.method === "HEAD" ? new Response(null, { headers: res.headers }) : res;
}
