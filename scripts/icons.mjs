#!/usr/bin/env node
// Downloads each service's icon once into public/assets/svc/<id>.<ext> and lists them in src/icons.json, so the status
// page shows them from this site: no request to the services or to a favicon service when someone opens the page.
// Run when a service is added and commit the output. Source: Google's favicon service at build time, by the brand's
// own domain (the timed URL is often a CDN host whose icon isn't the brand's); an icon it doesn't know comes back as
// its generic 16 px globe, which is refused. A service with no icon keeps the space empty (Careem). Copilot's icon is
// the one the unlock check has (the favicon service gives Bing's); rerunning keeps an icon it can't fetch again.
// Usage: node scripts/icons.mjs [id …]
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { SERVICES, PACKS } from "../src/services.mjs";

const out = new URL("../public/assets/svc/", import.meta.url), list = new URL("../src/icons.json", import.meta.url);
await mkdir(out, { recursive: true });
// the brand's domain, where the timed host isn't it
const DOMAIN = {
  gemini: "gemini.google.com", wikipedia: "wikipedia.org", spotify: "spotify.com", x: "x.com", instagram: "instagram.com", whatsapp: "whatsapp.com",
  telegram: "telegram.org", npm: "npmjs.com", dockerhub: "hub.docker.com", steam: "store.steampowered.com", epic: "epicgames.com",
  akamai: "akamai.com", cloudfront: "aws.amazon.com", "google-cdn": "cloud.google.com", fastly: "fastly.com", azure: "azure.microsoft.com",
  kakao: "kakaocorp.com", coupang: "coupang.com", flipkart: "flipkart.com", deepseek: "deepseek.com", "yahoo-tw": "tw.yahoo.com",
  "line-tw": "line.me", playstation: "playstation.com", zalando: "zalando.de", careem: "careem.com", "line-sea": "line.me", line: "line.me",
};
function kind(b) {
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return { ext: "png", w: b.readUInt32BE(16) };
  if (b.length > 8 && b.readUInt32BE(0) === 0x00000100) return { ext: "ico", w: b[6] || 256 };
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8) return { ext: "jpg", w: 64 };
  if (b.length > 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return { ext: "webp", w: 64 };
  if (b.length > 6 && b.toString("latin1", 0, 3) === "GIF") return { ext: "gif", w: b.readUInt16LE(6) };
  return null;
}
const ALL = [...SERVICES, ...Object.values(PACKS).flat()].filter((x, i, a) => a.findIndex(y => y.id === x.id) === i);
const icons = JSON.parse(await readFile(list, "utf8").catch(() => "{}"));
const only = process.argv.slice(2);
let bad = 0;
for (const s of ALL.filter(s => !only.length || only.includes(s.id))) {
  const domain = DOMAIN[s.id] || new URL(s.url).host;
  let got = null, why = "";
  try {
    const r = await fetch(`https://www.google.com/s2/favicons?domain=${domain}&sz=64`, { signal: AbortSignal.timeout(15000) });
    const b = Buffer.from(await r.arrayBuffer()), k = kind(b);
    if (r.ok && k && k.w > 16) got = { b, k };
    else why = `${r.status}, ${k ? k.w + " px " + k.ext : "not an image"}`;
  } catch (e) { why = e.message; }
  if (!got) { console.log(`✖ ${s.id} (${domain}) ${why}`); bad++; continue; }
  if (icons[s.id] && icons[s.id] !== `${s.id}.${got.k.ext}`) await rm(new URL(icons[s.id], out)).catch(() => {});
  icons[s.id] = `${s.id}.${got.k.ext}`;
  await writeFile(new URL(icons[s.id], out), got.b);
  console.log(`✓ ${s.id} (${domain}) ${got.k.w}px ${got.k.ext} ${got.b.length} B`);
}
await writeFile(list, JSON.stringify(Object.fromEntries(ALL.filter(s => icons[s.id]).map(s => [s.id, icons[s.id]])), null, 1) + "\n");
if (bad) process.exitCode = 1;
