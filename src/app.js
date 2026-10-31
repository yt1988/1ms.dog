// 1ms.dog home: finds every exit the visitor's traffic leaves from (local and proxy), then times HTTPS round trips to
// the services in src/services.mjs, all from the browser. Nothing is sent to 1ms.dog. The build prepends `const SVC`.
(function () {
  "use strict";
  const $ = s => document.querySelector(s);
  const D = JSON.parse($("#data").textContent);
  const L = D.i18n, LANG = D.lang;
  const t = (k, v) => { let s = L[k] ?? k; if (v) for (const x in v) s = s.split("{" + x + "}").join(v[x]); return s; };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  const K = { theme: "1ms:theme", lang: "1ms:lang", last: "1ms:last", pack: "1ms:pack", mask: "1ms:mask" };
  const country = cc => { try { return new Intl.DisplayNames([LANG], { type: "region" }).of(cc); } catch (e) { return cc; } };
  const flag = cc => /^[A-Z]{2}$/.test(cc || "") ? `<img class="flag" src="/flags/${cc.toLowerCase()}.svg" alt="" width="20" height="15">` : "";
  const fmt = ms => ms < 10 ? ms.toFixed(1) : String(Math.round(ms));
  const median = a => { const b = a.filter(v => v != null).sort((x, y) => x - y); return b.length ? (b.length % 2 ? b[b.length >> 1] : (b[b.length / 2 - 1] + b[b.length / 2]) / 2) : null; };
  const bust = u => u + (u.includes("?") ? "&" : "?") + "_1ms=" + Math.random().toString(36).slice(2, 10);

  /* ---------- theme and language (synced across the 1ms.dog tools by the shell) ---------- */
  const thBtn = $("#theme"), TH = ["system", "light", "dark"];
  const applyTheme = th => {
    if (th === "light" || th === "dark") document.documentElement.setAttribute("data-theme", th); else document.documentElement.removeAttribute("data-theme");
    thBtn.dataset.th = th; thBtn.title = t("th_" + th); thBtn.setAttribute("aria-label", t("th_" + th));
  };
  applyTheme(TH.includes(store.get(K.theme)) ? store.get(K.theme) : "system");
  thBtn.onclick = () => { const n = TH[(TH.indexOf(thBtn.dataset.th) + 1) % 3]; store.set(K.theme, n); applyTheme(n); };
  $("#lang").onchange = e => { const l = e.target.value; store.set(K.lang, l); location.href = D.paths[l] + location.hash; };

  /* ---------- speed zones ---------- */
  // [max ms, key, color class]; under 2 ms is the legendary 1ms dog
  const TIERS = [[2, "legend", "c0"], [30, "zoom", "c1"], [80, "sprint", "c2"], [150, "trot", "c3"], [300, "stroll", "c4"], [Infinity, "nap", "c5"]];
  const tierOf = ms => ms == null ? ["lost", "cx"] : TIERS.find(x => ms <= x[0]).slice(1);
  const pos = ms => Math.max(0, Math.min(1, Math.log(ms / SVC.scale.min) / Math.log(SVC.scale.max / SVC.scale.min)));

  /* ---------- the dog ---------- */
  const stage = $("#stage"), bubble = $("#bubble");
  let dogSvg = null, durs = [];
  const say = (k, v) => { bubble.textContent = t(k, v); bubble.classList.remove("pop"); void bubble.offsetWidth; bubble.classList.add("pop"); };
  // The running shiba is a SMIL animation. Inlined (instead of the <img>) it can run faster, slower or stop to match
  // the mood. If anything fails the <img> stays: the dog still runs, at one speed.
  fetch("/assets/shiba-run.svg").then(r => r.text()).then(x => {
    const svg = new DOMParser().parseFromString(x, "image/svg+xml").documentElement;
    if (svg.nodeName !== "svg") return;
    svg.setAttribute("viewBox", "150 20 700 420");
    svg.removeAttribute("width"); svg.removeAttribute("height"); svg.setAttribute("aria-hidden", "true");
    const node = document.importNode(svg, true);
    $("#dogImg").replaceWith(node);
    dogSvg = node;
    durs = [...node.querySelectorAll("animate, animateTransform, animateMotion")].map(a => [a, parseFloat(a.getAttribute("dur")) || 0.76]);
    setMood(stage.dataset.mood);
  }).catch(() => {});
  function dogSpeed(f) {                                     // 1 = the drawing's own gallop
    stage.style.setProperty("--spd", (0.76 / (f || 1)).toFixed(3) + "s");
    if (!dogSvg) return;
    if (!f) { dogSvg.pauseAnimations(); return; }
    for (const [a, d] of durs) a.setAttribute("dur", (d / f).toFixed(3) + "s");
    dogSvg.unpauseAnimations();
  }
  const SPEED = { sniff: 0.6, run: 1.15, legend: 2.6, zoom: 1.7, sprint: 1.25, trot: 0.85, stroll: 0.5, nap: 0, lost: 0 };
  function setMood(m) { stage.dataset.mood = m; dogSpeed(SPEED[m] ?? 1); }
  let pets = 0, petT = 0;
  $("#dog").onclick = () => {
    const now = Date.now(); pets = now - petT < 600 ? pets + 1 : 1; petT = now;
    stage.classList.remove("pet"); void stage.offsetWidth; stage.classList.add("pet");
    if (pets >= 5) {                                           // five quick pets: 1ms mode
      pets = 0; stage.classList.add("turbo"); say("mood_turbo"); dogSpeed(4);
      setTimeout(() => { stage.classList.remove("turbo"); setMood(stage.dataset.mood); say(moodKey()); }, 2600);
    } else if (!RUN) say("mood_pet");
  };

  /* ---------- exits ---------- */
  // A rule-based proxy picks the route by destination, so one IP check only shows the exit for its own host. We ask
  // checks in different places at once (a site in mainland China, Cloudflare, two independent geo services, IPv4-only
  // and IPv6-only hosts, WebRTC over UDP) and group what they see by network: usually one exit, often a local one
  // plus a proxy. Every check answers CORS, so this works from the static page.
  const DC_RE = /amazon|google|microsoft|azure|digitalocean|vultr|choopa|constant company|linode|akamai|ovh|hetzner|oracle|alibaba|aliyun|tencent|huawei|m247|datacamp|cloudflare|leaseweb|contabo|hostinger|it7|racknerd|colocrossing|psychz|zenlayer|g-core|gcore|hostwinds|scaleway|ionos|kamatera|upcloud|bandwagon|dmit|cogent|quadranet|servers\.com|packet|equinix|fastly|cdn77|datapacket|tzulo|hostdare|greencloud|nexeon|frantech|buyvm|hosting|vps|data ?cent/i;
  const TZ_CC = Object.fromEntries(("Asia/Shanghai:CN Asia/Chongqing:CN Asia/Harbin:CN Asia/Urumqi:CN Asia/Hong_Kong:HK Asia/Macau:MO Asia/Taipei:TW Asia/Tokyo:JP " +
    "Asia/Seoul:KR Asia/Singapore:SG Asia/Kuala_Lumpur:MY Asia/Bangkok:TH Asia/Jakarta:ID Asia/Manila:PH Asia/Ho_Chi_Minh:VN Asia/Saigon:VN " +
    "Asia/Kolkata:IN Asia/Calcutta:IN Asia/Dubai:AE Asia/Riyadh:SA Asia/Qatar:QA Asia/Jerusalem:IL Asia/Tel_Aviv:IL Asia/Karachi:PK Asia/Tehran:IR " +
    "Europe/London:GB Europe/Dublin:IE Europe/Paris:FR Europe/Berlin:DE Europe/Amsterdam:NL Europe/Brussels:BE Europe/Zurich:CH Europe/Rome:IT " +
    "Europe/Madrid:ES Europe/Lisbon:PT Europe/Stockholm:SE Europe/Oslo:NO Europe/Helsinki:FI Europe/Copenhagen:DK Europe/Warsaw:PL Europe/Vienna:AT " +
    "Europe/Prague:CZ Europe/Moscow:RU Europe/Istanbul:TR Europe/Kiev:UA Europe/Kyiv:UA Europe/Athens:GR Europe/Bucharest:RO Europe/Budapest:HU " +
    "Australia/Sydney:AU Australia/Melbourne:AU Australia/Brisbane:AU Australia/Perth:AU Australia/Adelaide:AU Pacific/Auckland:NZ " +
    "America/New_York:US America/Chicago:US America/Denver:US America/Los_Angeles:US America/Phoenix:US America/Anchorage:US Pacific/Honolulu:US " +
    "America/Toronto:CA America/Vancouver:CA America/Montreal:CA America/Edmonton:CA America/Mexico_City:MX America/Sao_Paulo:BR America/Santiago:CL " +
    "America/Bogota:CO America/Lima:PE America/Argentina/Buenos_Aires:AR Africa/Johannesburg:ZA Africa/Cairo:EG Africa/Lagos:NG Africa/Nairobi:KE")
    .split(" ").map(p => p.split(":")));
  const fam = x => x.includes(":") ? 6 : 4;
  const v6g = a => { const [h, tl = ""] = a.toLowerCase().split("::"), H = h ? h.split(":") : [], T = tl ? tl.split(":") : []; return [...H, ...Array(Math.max(0, 8 - H.length - T.length)).fill("0"), ...T].map(g => g.padStart(4, "0")); };
  // CGNAT pools and temporary IPv6 addresses move around inside a /16 or /64: same network
  const netOf = x => fam(x) === 6 ? v6g(x).slice(0, 4).join(":") : x.split(".").slice(0, 2).join(".");
  const sameNet = (a, b) => fam(a) === fam(b) && netOf(a) === netOf(b);
  const getJ = (u, ms = 5000) => fetch(bust(u), { cache: "no-store", credentials: "omit", signal: AbortSignal.timeout(ms) }).then(r => r.ok ? r.json() : Promise.reject());
  const asnNum = v => { const m = /(\d+)/.exec(String(v || "")); return m ? +m[1] : null; };
  const firstIp = (list, f) => Promise.any(list.map(([u, k]) => getJ(u).then(j => j[k] && fam(j[k]) === f ? { ip: j[k] } : Promise.reject())));
  // each check → { ip, geo? }, geo = { cc, city, asn, org }
  const CHECKS = [
    ["ipip.net", () => getJ("https://myip.ipip.net/json").then(j => ({ ip: j.data.ip }))],
    ["Cloudflare", () => getJ("https://speed.cloudflare.com/meta", 6000).then(j => ({ ip: j.clientIp, geo: { cc: j.country, city: j.city, asn: j.asn, org: j.asOrganization } }))],
    ["ip.sb", () => getJ("https://api.ip.sb/geoip").then(j => ({ ip: j.ip, geo: { cc: j.country_code, city: j.city, asn: j.asn, org: j.isp || j.asn_organization } }))],
    ["ipinfo.io", () => getJ("https://ipinfo.io/json").then(j => ({ ip: j.ip, geo: { cc: j.country, city: j.city, asn: asnNum(j.org), org: String(j.org || "").replace(/^AS\d+\s*/, "") } }))],
    ["IPv4", () => firstIp([["https://ipv4-check-perf.radar.cloudflare.com/", "ip_address"], ["https://api4.ipify.org/?format=json", "ip"], ["https://v4.ident.me/json", "ip"]], 4)],
    ["IPv6", () => firstIp([["https://ipv6-check-perf.radar.cloudflare.com/", "ip_address"], ["https://api6.ipify.org/?format=json", "ip"], ["https://v6.ident.me/json", "ip"]], 6)],
    ["WebRTC", () => stunIPs().then(ips => ips.length ? ips.map(ip => ({ ip })) : Promise.reject())],
  ];
  async function stunIPs() {
    if (!window.RTCPeerConnection) return [];
    let pc;
    try {
      pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }] });
      pc.createDataChannel("x");
      const ips = new Set();
      const done = new Promise(res => {
        pc.onicecandidate = e => {
          if (!e.candidate) return res();
          const c = e.candidate.candidate || "", p = c.split(" ");
          if (/ typ srflx /.test(c) && p[4]) ips.add(p[4]);
        };
        setTimeout(res, 3000);
      });
      await pc.setLocalDescription(await pc.createOffer());
      await done;
      return [...ips];
    } catch (e) { return []; } finally { try { pc && pc.close(); } catch (e) {} }
  }

  const NET = { seen: [], geo: {}, warp: "off", done: false, groups: [] };
  const masked = () => store.get(K.mask) === "1";
  const eye = $("#eye");
  const applyMask = () => { $("#exits").classList.toggle("masked", masked()); eye.textContent = t(masked() ? "show" : "hide"); };
  eye.onclick = () => { store.set(K.mask, masked() ? "0" : "1"); applyMask(); };
  applyMask();

  async function checkExits() {
    // this site's own Cloudflare trace says whether WARP carries the traffic
    fetch("/cdn-cgi/trace", { cache: "no-store", signal: AbortSignal.timeout(5000) }).then(r => r.ok ? r.text() : "")
      .then(x => { NET.warp = (/^warp=(\w+)/m.exec(x) || [])[1] || "off"; }).catch(() => {});
    await Promise.allSettled(CHECKS.map(([name, f]) => f().then(res => {
      for (const r of [].concat(res)) {
        if (!r || !r.ip) continue;
        NET.seen.push({ ip: r.ip, by: name });
        if (r.geo && r.geo.cc) NET.geo[r.ip] = r.geo;
      }
      group(); renderExits();
    })));
    // addresses only geo-less checks saw (ipip.net, IPv4/IPv6-only hosts, WebRTC): look up their network
    const need = [...new Set(NET.seen.map(x => x.ip))].filter(ip => !geoOf(ip));
    await Promise.allSettled(need.slice(0, 5).map(ip => getJ("https://api.ip.sb/geoip/" + encodeURIComponent(ip)).then(j => {
      NET.geo[ip] = { cc: j.country_code, city: j.city, asn: j.asn, org: j.isp || j.asn_organization };
    })));
    NET.done = true; group(); renderExits();
    if (NET.groups[0] && NET.groups[0].cc) pickPack(NET.groups[0].cc);
  }
  // geo for an address: its own, or that of an address on the same network
  function geoOf(ip) {
    if (NET.geo[ip]) return NET.geo[ip];
    const y = Object.keys(NET.geo).find(x => sameNet(x, ip));
    return y ? NET.geo[y] : null;
  }
  // one group per network (ASN when known), so an ISP's IPv4 and IPv6 addresses are one exit
  function group() {
    const G = [];
    for (const { ip, by } of NET.seen) {
      const g0 = geoOf(ip), key = g0 && g0.asn ? "as" + g0.asn : "net" + netOf(ip);
      let g = G.find(x => x.key === key);
      if (!g) { g = { key, ips: [], by: [], cc: "", city: "", asn: null, org: "" }; G.push(g); }
      if (!g.ips.includes(ip)) g.ips.push(ip);
      if (!g.by.includes(by)) g.by.push(by);
      if (g0) { g.cc = g.cc || g0.cc || ""; g.city = g.city || g0.city || ""; g.asn = g.asn || g0.asn || null; g.org = g.org || g0.org || ""; }
    }
    for (const g of G) g.proxy = !!(g.org && DC_RE.test(g.org)) || (g.asn === 13335 && NET.warp !== "off");
    // the network most checks agree on first; local before proxy when tied
    G.sort((a, b) => b.by.length - a.by.length || a.proxy - b.proxy);
    NET.groups = G;
  }
  function renderExits() {
    const G = NET.groups, ul = $("#exList");
    if (!G.length) { ul.innerHTML = `<li class="ex sk-row">${NET.done ? esc(t("no_net")) : `<span class="sk-t">${esc(t("sniff"))}</span>`}</li>`; return; }
    ul.innerHTML = G.map(g => {
      const where = [g.city, g.cc && country(g.cc)].filter(Boolean).join(", ");
      const ips = [4, 6].map(f => [f, g.ips.filter(ip => fam(ip) === f)]).map(([f, l]) => l.length ? `<span><em>IPv${f}</em>${l.map(esc).join(" · ")}</span>` : "").join("");
      const org = g.org ? esc(g.org) + (g.asn ? " · AS" + g.asn : "") : "";
      return `<li class="ex"><span class="kind ${g.proxy ? "proxy" : "local"}">${esc(t(g.proxy ? "k_proxy" : "k_local"))}</span>` +
        `<span class="where">${flag(g.cc)}<b>${esc(where || "?")}</b>${org ? `<span class="m">${org}</span>` : ""}</span>` +
        `<span class="ips">${ips}</span><span class="by">${esc(t("seen_by", { list: g.by.join(", ") }))}</span></li>`;
    }).join("");
    renderNote();
  }
  function renderNote() {
    const G = NET.groups, main = G[0], notes = [];
    if (!NET.done || !main) return;
    const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return ""; } })(), tzc = TZ_CC[tz];
    if (tzc && main.cc && tzc !== main.cc && !G.some(g => g.cc === tzc) && !(tzc === "CN" && ["HK", "MO"].includes(main.cc))) notes.push(t("r_tz", { a: esc(country(tzc)), b: esc(country(main.cc)) }));
    if (NET.hidden) notes.push(NET.hidden);
    const el = $("#exNote"); el.innerHTML = notes.join("<br>"); el.hidden = !notes.length;
  }
  // Services normally unreachable from these countries answering means that traffic takes an exit none of the checks
  // saw (a proxy rule for those hosts only)
  const WALLED = { CN: ["google", "youtube", "x", "facebook", "instagram", "telegram", "discord", "wikipedia", "chatgpt", "reddit"], IR: ["youtube", "x", "facebook", "instagram", "telegram"] };
  function hiddenExit() {
    if (!NET.done || NET.hidden || NET.groups.some(g => g.proxy)) return;   // a proxy exit is already shown
    const cc = (NET.groups[0] || {}).cc;
    if (!WALLED[cc]) return;
    const got = WALLED[cc].filter(id => { const r = R.get(id); return r && median(r.s) != null; }).map(id => SVC.list.find(s => s.id === id).name);
    if (got.length < 2) return;
    NET.hidden = t("r_proxied", { list: esc(got.slice(0, 4).join(", ")), c: esc(country(cc)) });
    renderNote();
  }

  /* ---------- the field ---------- */
  const PACKS = SVC.packs, PACK_OF = SVC.packOf;
  let pack = D.pack;
  const rowHtml = s => `<li class="row" id="t-${s.id}"><span class="nm">${esc(s.name)}</span><span class="trk"><i class="tail"></i><i class="b"></i></span><b class="ms">–</b></li>`;
  const allServices = () => [...(PACKS[pack] || []), ...SVC.list];
  function showPack(p) { pack = p; $("#localRows").innerHTML = PACKS[p].map(rowHtml).join(""); $("#pack").value = p; }
  { const saved = store.get(K.pack); if (saved && PACKS[saved] && saved !== pack) showPack(saved); }
  function pickPack(cc) { const p = PACK_OF[cc]; if (!store.get(K.pack) && p && p !== pack) setPack(p, false); }
  function setPack(p, user) {
    if (!PACKS[p]) return;
    if (user) store.set(K.pack, p);
    showPack(p);
    for (const s of PACKS[p]) R.delete(s.id);
    if (RUN && RUN.full) { RUN.q.unshift(...PACKS[p]); RUN.n += PACKS[p].length; }   // joins the run in progress
    else if (!RUN && LAST_DONE) runList(PACKS[p], 3, false);
  }
  $("#pack").onchange = e => setPack(e.target.value, true);

  /* ---------- probing ---------- */
  // Same method as Me2Cloud: one uncounted request opens DNS + TCP + TLS, then each timed request reuses that
  // connection. no-cors with no custom headers is a simple request: no preflight, no cookies, no referrer.
  const R = new Map();          // id → { w, s: [], st }
  const TIMEOUT = 4000, WARM_TIMEOUT = 5000, GAP = 120, CONC = 8;
  async function probe(s, timeout, signal) {
    const t0 = performance.now();
    if (s.m === "IMG") return new Promise(res => {
      const img = new Image(); let done = false;
      const fin = v => { if (done) return; done = true; clearTimeout(tm); img.onload = img.onerror = null; res(v); };
      img.onload = img.onerror = () => fin(performance.now() - t0);
      const tm = setTimeout(() => fin(null), timeout);
      signal.addEventListener("abort", () => fin(null), { once: true });
      img.referrerPolicy = "no-referrer"; img.src = bust(s.url);
    });
    const ctl = new AbortController(), stop = () => ctl.abort(), tm = setTimeout(stop, timeout);
    signal.addEventListener("abort", stop);
    let ms = null;
    try {
      await fetch(bust(s.url), { method: s.m || "GET", mode: "no-cors", cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", signal: ctl.signal });
      ms = performance.now() - t0;
    } catch (e) {}
    clearTimeout(tm); signal.removeEventListener("abort", stop);
    return ms;
  }
  async function runOne(s, n, signal) {
    const r = { w: null, s: [], st: "run" }; R.set(s.id, r); paintRow(s);
    r.w = await probe(s, WARM_TIMEOUT, signal);
    let fails = r.w == null ? 2 : 0;                          // no connection at all: lost, no second wait
    while (r.s.length < n && !signal.aborted && fails < 2) {
      await sleep(GAP + Math.random() * 80);
      if (signal.aborted) break;
      const v = await probe(s, TIMEOUT, signal);
      if (signal.aborted) break;
      r.s.push(v == null ? null : Math.round(v * 10) / 10);
      fails = v == null ? fails + 1 : 0;
    }
    r.st = signal.aborted ? "stop" : "done";
    paintRow(s);                                              // the ball flies out once, when the result is in
  }
  const jitter = a => { let d = 0; for (let i = 1; i < a.length; i++) d += Math.abs(a[i] - a[i - 1]); return d / (a.length - 1); };
  function paintRow(s) {
    const el = document.getElementById("t-" + s.id); if (!el) return;
    const r = R.get(s.id), hot = D.spot === s.id ? " hot" : "";
    const b = el.querySelector(".b"), tail = el.querySelector(".tail"), ms = el.querySelector(".ms");
    if (!r || r.st === "run") {
      el.className = "row" + (r ? " run" : "") + hot; b.style.left = "0"; tail.style.width = "0"; ms.textContent = r ? "…" : "–"; el.title = ""; return;
    }
    const md = median(r.s), [tk, cls] = tierOf(md);
    el.className = "row " + (md == null ? "lost" : "done " + cls) + hot;
    const p = md == null ? 100 : pos(md) * 100;
    b.style.left = p + "%"; tail.style.width = md == null ? "0" : p + "%";
    ms.textContent = md == null ? "✕" : fmt(md);
    const ok = r.s.filter(x => x != null);
    el.title = [s.name + " · " + t("tier_" + tk), r.w != null ? `${t("d_cold")} ${fmt(r.w)} ms` : "",
      ok.length ? `${t("d_samples")}: ${ok.map(fmt).join(" · ")} ms` : "", ok.length > 1 ? `${t("d_jit")} ±${fmt(jitter(ok))} ms` : ""].filter(Boolean).join("\n");
  }

  let RUN = null, LAST_DONE = false;
  async function runList(list, n, full) {
    if (RUN) RUN.ctl.abort();
    const q = list.slice(), ctl = new AbortController(), run = RUN = { ctl, q, full, n: list.length, d: 0 };
    if (D.spot) q.sort((a, b) => (b.id === D.spot) - (a.id === D.spot));
    if (full) { setMood("run"); say("mood_run"); setBusy(true); }
    const worker = async () => { while (q.length && !ctl.signal.aborted) { const s = q.shift(); await runOne(s, n, ctl.signal); run.d++; progress(run); } };
    await Promise.all(Array.from({ length: CONC }, worker));
    if (RUN !== run) return;
    RUN = null; LAST_DONE = true; setBusy(false); progress(null);
    summarize(!ctl.signal.aborted);
  }
  function progress(run) {
    $("#prog i").style.width = run ? (100 * run.d / run.n).toFixed(1) + "%" : "0";
    if (run) $("#sumBack").textContent = t("running", { d: run.d, n: run.n });
  }
  function setBusy(b) { $("#run span").textContent = t(b ? "stop" : "run"); $("#deep").disabled = b; }
  let lastSum = null;
  const moodKey = () => lastSum ? "mood_" + lastSum.mood : RUN ? "mood_run" : "mood_sniff";
  function summarize(complete) {
    const meds = allServices().map(s => R.get(s.id)).filter(Boolean).map(r => median(r.s));
    const ok = meds.filter(v => v != null), n = meds.length;
    const md = median(ok), [tk, cls] = tierOf(md);
    const mood = !ok.length || 1 - ok.length / n > 0.4 ? "lost" : tk;
    lastSum = { md, ok: ok.length, n, tier: tk, mood };
    $("#sumMs").textContent = md != null ? fmt(md) : "–"; $("#sumMs").className = cls;
    $("#sumTier").textContent = t("tier_" + tk); $("#sumTier").className = "tier " + cls;
    $("#sumBack").textContent = t("back", { ok: ok.length, n }) + (n - ok.length ? " · " + t("lost_n", { n: n - ok.length }) : "");
    setMood(mood); say("mood_" + mood);
    hiddenExit();
    if (complete) remember(md);
  }
  // the dog remembers the last visit (in this browser only) and notices changes
  function remember(md) {
    let prev = null; try { prev = JSON.parse(store.get(K.last) || "null"); } catch (e) {}
    const main = NET.groups[0], ip = main ? main.ips[0] : "", cc = main ? main.cc : "";
    let msg = "";
    if (prev && prev.cc && cc && prev.cc !== cc) msg = t("new_exit", { a: prev.cc, b: cc });
    else if (prev && prev.md != null && md != null && Math.abs(md - prev.md) >= 5) msg = t(md < prev.md ? "faster" : "slower", { d: Math.round(Math.abs(md - prev.md)) });
    $("#sumHist").textContent = msg;
    store.set(K.last, JSON.stringify({ ts: Date.now(), md, ip, cc }));
  }

  /* ---------- controls ---------- */
  const start = n => { for (const s of allServices()) { R.delete(s.id); paintRow(s); } lastSum = null; runList(allServices(), n, true); };
  $("#run").onclick = () => { if (RUN) { RUN.ctl.abort(); return; } start(3); };
  $("#deep").title = t("deep_t");
  $("#deep").onclick = () => start(10);
  $("#share").title = t("share");
  $("#share").onclick = async () => {
    const s = lastSum, main = NET.groups[0], where = main ? [main.city, main.cc && country(main.cc)].filter(Boolean).join(", ") : "";
    const text = s && s.md != null ? t("share_text", { ok: s.ok, n: s.n, where: where || "?", ms: fmt(s.md), tier: t("tier_" + s.tier) }) : document.title;
    const url = location.origin + location.pathname;
    try { if (navigator.share) { await navigator.share({ text, url }); return; } } catch (e) { if (e.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(text + " " + url); say("copied"); } catch (e) {}
  };

  /* ---------- go ---------- */
  setMood("sniff");
  const exitP = checkExits().catch(() => {});
  // the exits pick the local pack; give them a moment, then the dog starts fetching either way
  Promise.race([exitP, sleep(1500)]).then(() => start(3));
})();
