#!/usr/bin/env node
// Checks every service URL the way the page uses it. A URL fails when:
//   - it redirects: two round trips (or another host) in the browser; point at the final address instead
//   - it answers with Cross-Origin-Resource-Policy same-origin / same-site: the browser rejects the cross-site
//     answer, so the service would always look unreachable
//   - the server takes long to answer (srv): the page should time a round trip to the service's edge, not the work
//     of its application server. srv ≈ the fastest of three warm requests on the open connection (one slow request
//     is network noise; an application server is slow every time) minus one round trip, taken from the
//     TLS 1.3 handshake (one round trip to the remote end, even behind a transparent proxy). Prefer what an edge
//     answers by itself: /cdn-cgi/trace on Cloudflare hosts, /generate_204 on Google's, static files with a cache HIT.
// Run from a few networks before changing the list; a service that is blocked where you are shows as "fail" there.
// Usage: node scripts/verify.mjs [id …] [id=url …]   (id=url tries another URL for that service)
import https from "node:https";
import { SERVICES, PACKS } from "../src/services.mjs";

const SRV_MAX = 120;            // ms of server time that still counts as an edge answer
const all = [...SERVICES, ...Object.values(PACKS).flat()];
const args = process.argv.slice(2), tries = args.filter(a => a.includes("=")).map(a => { const i = a.indexOf("="); return [a.slice(0, i), a.slice(i + 1)]; });
const pick = args.filter(a => !a.includes("="));
const list = tries.length ? tries.map(([id, url]) => ({ ...(all.find(s => s.id === id) || { id }), url, m: undefined }))
  : pick.length ? all.filter(s => pick.includes(s.id)) : all;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";
let bad = 0;
const ids = new Set();
for (const s of all) { if (ids.has(s.id)) { console.log(`duplicate id ${s.id}`); bad++; } ids.add(s.id); }

// one request on the given agent: status, headers, body size, and timings in ms (tcp, tls when a new socket opened)
function get(s, agent) {
  return new Promise((resolve, reject) => {
    const t0 = performance.now(), tm = {};
    const req = https.request(s.url + (s.url.includes("?") ? "&" : "?") + "_v=" + Math.random().toString(36).slice(2), {
      method: s.m === "HEAD" ? "HEAD" : "GET", agent, headers: { "user-agent": UA, accept: "*/*" }, timeout: 8000 }, res => {
      tm.ttfb = performance.now() - t0;
      let n = 0; res.on("data", c => { n += c.length; }); res.on("end", () => resolve({ res, n, tm }));
    });
    req.on("socket", sock => {
      if (sock.connecting === false && !sock.pending) return;      // reused connection
      sock.once("connect", () => { tm.tcp = performance.now() - t0; });
      sock.once("secureConnect", () => { tm.tls = performance.now() - t0 - (tm.tcp || 0); });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

async function one(s) {
  const agent = new https.Agent({ keepAlive: true, maxSockets: 1 });
  try {
    const a = await get(s, agent);                                 // opens the connection (like the page's warm-up)
    const warm = [];                                               // timed on the reused connection
    for (let i = 0; i < 3; i++) warm.push(await get(s, agent));
    const b = warm.reduce((x, y) => y.tm.ttfb < x.tm.ttfb ? y : x);
    const r = a.res, loc = r.headers.location, corp = String(r.headers["cross-origin-resource-policy"] || "").toLowerCase();
    const rtt = a.tm.tls, srv = rtt ? Math.max(0, Math.round(b.tm.ttfb - rtt)) : null;
    const why = r.statusCode >= 500 ? "status" : r.statusCode >= 300 && r.statusCode < 400 ? "redirect" : /same-(origin|site)/.test(corp) ? "corp"
      : srv != null && srv > SRV_MAX ? "slow server" : "";
    return { s, ok: !why, line: `${r.statusCode} rtt≈${String(Math.round(rtt || 0)).padStart(4)} warm=${String(Math.round(b.tm.ttfb)).padStart(4)} srv≈${String(srv ?? "?").padStart(4)}ms ${String(a.n).padStart(7)}B ${r.headers.server || ""}${loc ? " → " + loc : ""}${corp ? " CORP=" + corp : ""}${why ? "  ← " + why : ""}` };
  } catch (e) { return { s, ok: false, line: `fail ${e.code || e.message}` }; }
  finally { agent.destroy(); }
}
const out = [];
for (let i = 0; i < list.length; i += 8) out.push(...await Promise.all(list.slice(i, i + 8).map(one)));
// a failure gets one more try a few seconds later: a single reset or slow answer is network noise, not a broken URL
for (const [i, o] of out.entries()) if (!o.ok) { await new Promise(r => setTimeout(r, 2000)); const again = await one(o.s); if (again.ok) out[i] = again; }
for (const { s, ok, line } of out) { if (!ok) bad++; console.log(`${ok ? "ok  " : "BAD "} ${s.id.padEnd(14)} ${line}`); }
console.log(`\n${out.length - out.filter(o => !o.ok).length}/${out.length} ok`);
process.exit(bad ? 1 : 0);
