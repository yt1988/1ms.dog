#!/usr/bin/env node
// Checks every service URL the way the page uses it: one request, no redirect followed. A redirect means two round
// trips (or another host) in the browser, so the URL should point at the final address instead.
// Run from a few networks before changing the list; a service that is blocked where you are shows as "fail" there.
// Usage: node scripts/verify.mjs [id …]
import { SERVICES, PACKS } from "../src/services.mjs";

const all = [...SERVICES, ...Object.values(PACKS).flat()];
const pick = process.argv.slice(2), list = pick.length ? all.filter(s => pick.includes(s.id)) : all;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";
let bad = 0;
const ids = new Set();
for (const s of all) { if (ids.has(s.id)) { console.log(`duplicate id ${s.id}`); bad++; } ids.add(s.id); }

async function one(s) {
  const t0 = performance.now();
  try {
    const r = await fetch(s.url + (s.url.includes("?") ? "&" : "?") + "_v=1", { method: s.m === "HEAD" ? "HEAD" : "GET", redirect: "manual",
      headers: { "user-agent": UA, accept: "*/*" }, signal: AbortSignal.timeout(8000) });
    const body = s.m === "HEAD" ? new ArrayBuffer(0) : await r.arrayBuffer();
    const ms = Math.round(performance.now() - t0), loc = r.headers.get("location");
    const ok = r.status < 500 && !(r.status >= 300 && r.status < 400);
    return { s, ok, line: `${r.status} ${String(ms).padStart(5)}ms ${String(body.byteLength).padStart(7)}B ${r.headers.get("server") || ""}${loc ? " → " + loc : ""}` };
  } catch (e) { return { s, ok: false, line: `fail ${e.cause?.code || e.name}` }; }
}
const out = [];
for (let i = 0; i < list.length; i += 8) out.push(...await Promise.all(list.slice(i, i + 8).map(one)));
for (const { s, ok, line } of out) { if (!ok) bad++; console.log(`${ok ? "ok  " : "BAD "} ${s.id.padEnd(14)} ${line}`); }
console.log(`\n${out.length - out.filter(o => !o.ok).length}/${out.length} ok`);
process.exit(bad ? 1 : 0);
