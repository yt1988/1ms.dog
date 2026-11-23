// The page's pure logic: no DOM, no network. test/lib.test.mjs imports it as a module; scripts/build.mjs drops the
// `export` keywords and inlines it into the page bundle at the /* @lib */ marker in src/app.js.
import { classify, tzCountry } from "./egress.js";

/* ---------- numbers ---------- */
export const fmt = ms => ms < 10 ? ms.toFixed(1) : String(Math.round(ms));
export const median = a => {
  const b = a.filter(v => v != null).sort((x, y) => x - y);
  return b.length ? (b.length % 2 ? b[b.length >> 1] : (b[b.length / 2 - 1] + b[b.length / 2]) / 2) : null;
};
// dog speeds: [max ms, key, color class]; under 2 ms is the legendary 1ms dog
export const TIERS = [[2, "legend", "c0"], [30, "zoom", "c1"], [80, "sprint", "c2"], [150, "trot", "c3"], [300, "stroll", "c4"], [Infinity, "nap", "c5"]];
export const tierOf = ms => ms == null ? ["lost", "cx"] : TIERS.find(x => ms <= x[0]).slice(1);
// log-scale distance of a latency on the field, 0…1
export const posOf = (ms, scale) => Math.max(0, Math.min(1, Math.log(ms / scale.min) / Math.log(scale.max / scale.min)));

/* ---------- addresses ---------- */
export const fam = x => x.includes(":") ? 6 : 4;
const v6g = a => {
  const [h, tl = ""] = a.toLowerCase().split("::"), H = h ? h.split(":") : [], T = tl ? tl.split(":") : [];
  return [...H, ...Array(Math.max(0, 8 - H.length - T.length)).fill("0"), ...T].map(g => g.padStart(4, "0"));
};
// CGNAT pools and temporary IPv6 addresses move around inside a /16 or /64: same network
export const net16 = x => fam(x) === 6 ? v6g(x).slice(0, 4).join(":") : x.split(".").slice(0, 2).join(".");
export const sameNet = (a, b) => fam(a) === fam(b) && net16(a) === net16(b);
export const asnNum = v => { const m = /(\d+)/.exec(String(v || "")); return m ? +m[1] : null; };

/* ---------- exits ---------- */
// country names and flags: TW has a fixed name in every language and the CN flag (the same rule in every 1ms.dog tool)
export const TW = { "zh-CN": "中国台湾", "zh-TW": "中國台灣", en: "Taiwan, China", ja: "中国台湾", ko: "중국 대만", es: "Taiwán, China", fr: "Taïwan, Chine", de: "Taiwan, China", pt: "Taiwan, China", ru: "Тайвань, Китай" };
export const regionName = (cc, lang) => cc === "TW" ? (TW[lang] || TW.en) : new Intl.DisplayNames([lang], { type: "region" }).of(cc);
export const flagCode = cc => cc === "TW" ? "cn" : cc.toLowerCase();
// A service's name in the page's language: most brands write themselves the same way everywhere; the ones in another
// script carry `names` for all 10 languages (npm test checks every one is there).
export const serviceName = (s, lang) => (s.names && s.names[lang]) || s.name;
// geo for an address: its own, or that of an address on the same network
export function geoOf(geo, ip) {
  if (geo[ip]) return geo[ip];
  const y = Object.keys(geo).find(x => sameNet(x, ip));
  return y ? geo[y] : null;
}
// The mainland anchor is only worth asking when the visitor is likely in mainland China: the site's edge says so,
// or the device's timezone is China's (a proxy can hide the first, but not the clock). Elsewhere the request would
// only be a cross-border wait.
export const cnVisitor = (country, tz) => country === "CN" || tzCountry(tz) === "CN";
// Which route each check asks through, for the shared core's path comparison (docs/egress-contract.md §1–2):
// ipip.net is a mainland destination, the two probes are our anchors, WebRTC is UDP evidence, the rest are abroad.
const CHECK_GROUP = { "probe cn": "cn", "probe intl": "intl", "ipip.net": "cn", WebRTC: "udp" };
const groupOf = name => CHECK_GROUP[name] || "intl";
// seen: [{ ip, by }] from the checks; geo: ip → { cc, city, asn, org }; warp: Cloudflare trace's warp field;
// anchors: { cn, intl } the addresses the two probes saw.
// The grouping and the direct/proxy/unknown verdict come from src/egress.js (vendored core): one group per ASN (or
// /16, /64), direct before proxy. `path` is kept beside `proxy`: an exit can be direct on its own network and still
// follow neither anchor, which is why the two are separate.
export function exitGroups(seen, geo, warp, anchors = {}) {
  const answers = [], same = (a, b) => {
    const ga = geoOf(geo, a), gb = geoOf(geo, b);
    if (ga && gb && ga.asn && gb.asn) return ga.asn === gb.asn;
    if ((ga && ga.asn) || (gb && gb.asn)) return false;
    return sameNet(a, b);
  };
  for (const { ip, by } of seen) {
    const g0 = geoOf(geo, ip);
    // The IPv4-only and IPv6-only checks are single-stack probes: the core compares each with the reference exit of
    // its own family, so a dual-stack line is not counted as split just because its two addresses differ.
    answers.push({ id: by, group: groupOf(by), ip, org: g0 && g0.org, asn: g0 && g0.asn, family: fam(ip), stack: by === "IPv4" || by === "IPv6" });
  }
  const { exits } = classify({ answers, anchors, warp });
  return exits.map(e => {
    const ips = [e.v4, e.v6].filter(Boolean);
    for (const { ip } of seen) if (!ips.includes(ip) && ips.some(x => same(x, ip))) ips.push(ip);
    const g0 = ips.map(ip => geoOf(geo, ip)).find(Boolean) || {};
    return { key: e.key, ips, by: e.seenBy, cc: g0.cc || "", city: g0.city || "", asn: e.asn, org: e.org,
      proxy: e.kind === "proxy", kind: e.kind, path: e.path };
  });
}

/* ---------- verdict ---------- */
// a segment's median → good (zoomies, sprint), ok (trot) or slow (stroll, nap); blocked when most didn't answer
export const grade = sg => sg.ok < sg.n / 2 ? "blocked" : sg.md <= 80 ? "good" : sg.md <= 150 ? "ok" : "slow";
// meds: each service's median (null = didn't answer); names: the same services' names
export function segmentOf(meds, names) {
  const ok = meds.filter(v => v != null);
  return { n: meds.length, ok: ok.length, md: median(ok), lost: names.filter((n, i) => meds[i] == null) };
}
// Which side the slowness is on: local favorites vs. global services. The overall median never decides this alone.
export function diagnose(local, global) {
  const lg = grade(local), gg = grade(global), fine = g => g === "good" || g === "ok";
  if (lg === "blocked" && gg === "blocked") return { key: "v_down", mood: "lost", lg, gg };
  if (fine(lg) && fine(gg)) return { key: "v_allgood", mood: tierOf(median([local.md, global.md]))[0], lg, gg };
  if (fine(lg)) return { key: "v_far", mood: "far", lg, gg };            // near is fast, far is slow or walled off
  if (fine(gg)) return { key: "v_odd", mood: "odd", lg, gg };            // far faster than near: everything proxied
  return { key: "v_near_slow", mood: tierOf(local.md)[0], lg, gg };      // even nearby is slow: the local network
}
// an everyday use, from its services' segment and its thresholds (smooth up to `good`, fine up to `ok` ms)
export const useStatus = (sg, good, ok) => sg.ok < sg.n / 2 ? "blocked" : sg.md <= good ? "great" : sg.md <= ok ? "ok" : "slow";

/* ---------- share links ---------- */
// The link holds no IP address: per exit only country, city, network and local/proxy (city and network only when the
// visitor ticks the share box); per service its median.
// The result is the last path segment, /<lang>/[<page>/]r/<code>, so the Worker can read it for the preview title:
//   2.<unix time base36>.<pack>.<exits>.<results>
// exits: cc~city~org~asn~p|l joined by ","; results: id:ms×10 base36 joined by ",", "x" = lost. Every value is
// percent-encoded, dots and the characters chat apps end a link at included, so the code stays one plain path segment.
// Links before it put the result after #, and still open: #r=1|<time>|<pack>|<exits>|<results>, same fields.
const enc = v => encodeURIComponent(String(v ?? "")).replace(/[.~!'()*]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase());
export function encodeShare({ ts, pack, groups, res }) {
  const ex = groups.map(g => [g.cc, g.city, g.org, g.asn || "", g.proxy ? "p" : "l"].map(enc).join("~")).join(",");
  const rs = Object.entries(res).map(([id, m]) => id + ":" + (m == null ? "x" : Math.round(m * 10).toString(36))).join(",");
  return ["2", Math.floor(ts / 1000).toString(36), pack, ex, rs].join(".");
}
export function parseShare(code, packs) {
  const m = /^2\.([0-9a-z]+)\.(\w+)\.([^.]*)\.([^.]*)$/.exec(code || "") || /^#r=1\|([0-9a-z]+)\|(\w+)\|([^|]*)\|(.*)$/.exec(code || "");
  if (!m || !packs[m[2]]) return null;
  const dec = v => { try { return decodeURIComponent(v); } catch (e) { return ""; } };
  const groups = m[3] ? m[3].split(",").map(x => {
    const [cc, city, org, asn, k] = x.split("~").map(dec);
    return { cc: /^[A-Z]{2}$/.test(cc) ? cc : "", city, org, asn: +asn || null, proxy: k === "p", ips: [], by: [] };
  }) : [];
  const res = {};
  // every entry must be whole: a link cut off inside one is broken, not a shorter result
  for (const p of m[4] ? m[4].split(",") : []) {
    const e = /^([\w-]+):([0-9a-z]+|x)$/.exec(p);
    if (!e) return null;
    res[e[1]] = e[2] === "x" ? null : parseInt(e[2], 36) / 10;
  }
  // LINE was three ids (line, line-tw, line-sea) for one endpoint until 2026-11-10: a link from before then still
  // opens, and its value becomes the one service's result.
  for (const old of ["line-tw", "line-sea"]) if (old in res) {
    if (res.line == null && res[old] != null) res.line = res[old];
    delete res[old];
  }
  return { ts: parseInt(m[1], 36) * 1000, pack: m[2], groups, res };
}

/* ---------- compare mode ---------- */
// Two results side by side: /<lang>/c/<a>/<b>, each a share code as above (a: before, or theirs; b: after, or mine).
// Each side keeps its own version prefix, so a compare link opens whatever versions parseShare reads.
// The view, the change per row and the headline are the shared compare mode (/assets/share/compare.js, from 1ms-shell);
// this page only turns two results into its rows.
export const CMP_RE = /\/c\/([^/]+)\/([^/]+)\/?$/;
// a result without what only the share box adds (city, network): what a link carries unless the visitor ticks it
export const bare = S => ({ ...S, groups: S.groups.map(g => ({ ...g, city: "", org: "", asn: null })) });
// The compare view's input (assets/share/compare.js): two results as the home page shows one. Groups in the page's
// order (local favorites of either side's pack, then each category) with every service either side measured; the
// three numbers of the page (local, global, overall median, over the services both measured); the everyday uses
// before and after. B in the key numbers and uses takes the page's speed colors (t0…t5).
// TOL is the home page's measured noise: two full runs a minute apart on the same line move about 1.8 % of rows by
// more than 20 ms and 30 % (docs/compare.md in 1ms-shell; test/fixtures/runs.txt).
export const TOL = { abs: 20, rel: 0.3 };
const USE_RANK = { blocked: 0, slow: 1, ok: 2, great: 3 }, USE_TIER = ["muted", "t5", "t3", "t1"];
export const tierVar = v => v == null ? "muted" : "t" + tierOf(v)[1].slice(1);
// o: { names: id → name, services, packs, cats, uses (src/services.mjs), label: key → text in the page's language }
export function diffShares(A, B, o) {
  const L = o.label, ms = { unit: "ms", better: "lower", fmt, tol: TOL, tier: tierVar };
  const row = id => ({ id, name: o.names[id] || id, a: A.res[id], b: B.res[id], ...ms });
  const has = id => id in A.res || id in B.res, both = ids => ids.filter(id => id in A.res && id in B.res);
  const local = [...new Set([...(o.packs[A.pack] || []), ...(o.packs[B.pack] || [])].map(s => s.id))];
  const groups = [{ id: "local", name: L("cat_local"), rows: local.filter(has).map(row) },
    ...o.cats.map(c => ({ id: c, name: L("cat_" + c), rows: o.services.filter(s => s.cat === c && has(s.id)).map(s => row(s.id)) }))];
  const med = (id, name, ids) => ({ id, name, a: median(both(ids).map(x => A.res[x])), b: median(both(ids).map(x => B.res[x])), ...ms });
  const stats = [med("local", L("seg_local"), local), med("global", L("seg_global"), o.services.map(s => s.id)),
    med("all", L("med"), [...new Set([...Object.keys(A.res), ...Object.keys(B.res)])])];
  // A use counts as changed only when its own median moved past the tolerance too: a median sitting on a threshold
  // would flip its status between two runs of the same line.
  const uses = o.uses.map(([k, ids, good, ok]) => {
    const ids2 = both(ids);
    if (!ids2.length) return null;
    const sg = S => segmentOf(ids2.map(id => S.res[id]), ids2), sa = sg(A), sb = sg(B);
    const st = [useStatus(sa, good, ok), useStatus(sb, good, ok)], ra = USE_RANK[st[0]];
    let rb = USE_RANK[st[1]];
    const moved = sa.md == null || sb.md == null || Math.abs(sb.md - sa.md) > TOL.abs && Math.max(sa.md, sb.md) / Math.min(sa.md, sb.md) - 1 > TOL.rel;
    if (!moved) rb = ra;
    return { id: k, name: L("use_" + k), a: ra, b: rb, better: "higher", tol: { abs: 0, rel: 0 }, text: [L("st_" + st[0]), L("st_" + st[1])], tier: v => USE_TIER[v] };
  }).filter(Boolean);
  return { groups, stats, uses };
}
// a side's exits in one line, as the exit list words them (no IPs: links never have them)
export const exitsText = (groups, country, L) => groups.slice(0, 2).map(g => [[g.city, g.cc && country(g.cc)].filter(Boolean).join(", "), L(g.proxy ? "k_proxy" : "k_local"), g.org].filter(Boolean).join(" · ")).join(" / ");

// This browser's own results (localStorage, never sent anywhere), newest first, as share codes with city and network:
// "compare with your last result" and the visitor's own side of a compare link read them.
export const HIST_MAX = 10;
export function parseHist(text) {
  let a;
  try { a = JSON.parse(text || "[]"); } catch (e) { return []; }
  return Array.isArray(a) ? a.filter(c => typeof c === "string" && /^2\.[0-9a-z]+\.\w+\.[^.]*\.[^.]*$/.test(c)).slice(0, HIST_MAX) : [];
}
export const addHist = (list, code) => [code, ...list.filter(c => c !== code)].slice(0, HIST_MAX);
// the stored version of a result in a link: same time and same numbers
export const ownOf = (hist, S, packs) => {
  for (const c of hist) { const H = parseShare(c, packs); if (H && H.ts === S.ts && JSON.stringify(H.res) === JSON.stringify(S.res)) return H; }
  return null;
};

// Fills {name} placeholders. In Korean a particle right after a name goes by how the name ends when read aloud:
// 은/이/을/과 after a final consonant, 는/가/를/와 after a vowel. Hangul shows it; a Latin or CJK name is in `fin`
// (the Korean strings' josa_fin) when it is read with a final consonant, e.g. CDN (씨디엔), Steam (스팀).
const JOSA = [["은", "는"], ["이", "가"], ["을", "를"], ["과", "와"]];
// Counted lines: key_one, key_few… beside key_other, picked by the language's plural rules; a form the language
// doesn't have falls back to key_other (Chinese, Japanese and Korean only have key_other). L: that language's own texts.
export const PLURAL_RE = /_(zero|one|two|few|many)$/;
// a plural form, not a key that merely ends in "_one" (running_one is the single-service page): it has a key_other
export const isPlural = (k, en) => PLURAL_RE.test(k) && k.replace(PLURAL_RE, "_other") in en;
export const pluralKey = (L, k, n, lang) => { const f = k + "_" + new Intl.PluralRules(lang).select(n); return f in L ? f : k + "_other"; };
export function fillIn(s, v, fin = []) {
  for (const k in v) {
    const val = String(v[k]);
    s = s.split("{" + k + "}").map((rest, i) => {
      const p = i && !/^.\(.\)/.test(rest) && JOSA.find(x => x.includes(rest[0]));
      if (!p) return rest;
      const c = val.charCodeAt(val.length - 1), hangul = c >= 0xac00 && c <= 0xd7a3;
      return p[(hangul ? (c - 0xac00) % 28 : fin.includes(val)) ? 0 : 1] + rest.slice(1);
    }).join(val);
  }
  return s;
}
