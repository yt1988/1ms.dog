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
        `<span class="ips">${ips}</span>${g.by.length ? `<span class="by">${esc(t("seen_by", { list: g.by.join(", ") }))}</span>` : ""}</li>`;
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
    if (!run) return;
    $("#sumBack").textContent = t("running", { d: run.d, n: run.n });
    // the median so far, so the big number moves while the balls come back
    const ok = allServices().map(s => R.get(s.id)).filter(r => r && r.st === "done").map(r => median(r.s)).filter(v => v != null);
    if (!ok.length) return;
    const md = median(ok), [tk, cls] = tierOf(md);
    $("#sumMs").textContent = fmt(md); $("#sumMs").className = cls;
    $("#sumTier").textContent = t("tier_" + tk); $("#sumTier").className = "tier " + cls;
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
  $("#run").onclick = () => { if (RUN) { RUN.ctl.abort(); return; } leaveShared(); start(3); };
  $("#deep").title = t("deep_t");
  $("#deep").onclick = () => { leaveShared(); start(10); };

  /* ---------- dialogs ---------- */
  const $$ = s => [...document.querySelectorAll(s)];
  function openDlg(id) { $("#" + id).hidden = false; document.documentElement.style.overflow = "hidden"; $("#" + id + " [data-close]").focus(); }
  function closeDlg() { $$(".scrim").forEach(s => { s.hidden = true; }); document.documentElement.style.overflow = ""; }
  $$("[data-close]").forEach(b => { b.onclick = closeDlg; });
  $$(".scrim").forEach(s => s.addEventListener("click", e => { if (e.target === s) closeDlg(); }));
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeDlg(); });
  // help: one answer at a time; a picker with previous / next on phones
  let helpIdx = 0;
  const helpN = $$("#helpNav [data-hq]").length;
  $("#helpSel").innerHTML = $$("#helpNav [data-hq]").map((b, i) => `<option value="${i}">${i + 1} / ${helpN} · ${esc(b.textContent)}</option>`).join("");
  function showHelp(i) {
    helpIdx = Math.max(0, Math.min(helpN - 1, i));
    $$("#helpNav [data-hq]").forEach(b => b.setAttribute("aria-selected", +b.dataset.hq === helpIdx));
    $$("#helpC [data-hqb]").forEach(a => { a.hidden = +a.dataset.hqb !== helpIdx; });
    $("#helpSel").value = helpIdx;
    $$("[data-hstep]").forEach(b => { b.disabled = helpIdx + +b.dataset.hstep < 0 || helpIdx + +b.dataset.hstep >= helpN; });
    $("#helpC").scrollTop = 0;
  }
  $("#helpBtn").onclick = () => { showHelp(helpIdx); openDlg("help"); };
  $$("#helpNav [data-hq]").forEach(b => { b.onclick = () => showHelp(+b.dataset.hq); });
  $("#helpSel").onchange = e => showHelp(+e.target.value);
  $$("[data-hstep]").forEach(b => { b.onclick = () => showHelp(helpIdx + +b.dataset.hstep); });

  /* ---------- share: a link that carries the result, and an image drawn here ---------- */
  // The link holds no IP address: per exit only country, city, network and local/proxy; per service its median.
  // #r=1|<unix time base36>|<pack>|<exits>|<results>   exits: cc~city~org~asn~p|l joined by ","; results: id:ms×10 base36, "x" = lost
  const enc = v => encodeURIComponent(String(v ?? "")).replace(/[~,|:]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase());
  function shareHash() {
    const ex = NET.groups.map(g => [g.cc, g.city, g.org, g.asn || "", g.proxy ? "p" : "l"].map(enc).join("~")).join(",");
    const res = allServices().filter(s => R.get(s.id) && R.get(s.id).st === "done").map(s => { const m = median(R.get(s.id).s); return s.id + ":" + (m == null ? "x" : Math.round(m * 10).toString(36)); }).join(",");
    return "#r=1|" + Math.floor(Date.now() / 1000).toString(36) + "|" + pack + "|" + ex + "|" + res;
  }
  function parseHash(h) {
    const m = /^#r=1\|([0-9a-z]+)\|(\w+)\|([^|]*)\|(.*)$/.exec(h || "");
    if (!m || !PACKS[m[2]]) return null;
    const dec = v => { try { return decodeURIComponent(v); } catch (e) { return ""; } };
    const groups = m[3] ? m[3].split(",").map(x => { const [cc, city, org, asn, k] = x.split("~").map(dec); return { cc: /^[A-Z]{2}$/.test(cc) ? cc : "", city, org, asn: +asn || null, proxy: k === "p", ips: [], by: [] }; }) : [];
    const res = {};
    for (const p of m[4].split(",")) { const [id, v] = p.split(":"); if (id && v) res[id] = v === "x" ? null : parseInt(v, 36) / 10; }
    return { ts: parseInt(m[1], 36) * 1000, pack: m[2], groups, res };
  }
  let shortFor = null;
  async function shortLink(long) {
    const meta = document.querySelector('meta[name="shortener"]');          // announced by the 1ms.dog shell
    if (!meta) return long;
    if (shortFor && shortFor[0] === long) return shortFor[1];
    try {
      const r = await fetch(meta.content, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: long }), signal: AbortSignal.timeout(5000) });
      const j = await r.json(); if (j.url) { shortFor = [long, j.url]; return j.url; }
    } catch (e) {}
    return long;
  }
  const whereOf = g => g ? [g.city, g.cc && country(g.cc)].filter(Boolean).join(", ") : "";
  let shareBlob = null;
  $("#share").title = t("share");
  $("#share").onclick = async () => {
    if (!lastSum) return;
    const long = location.origin + location.pathname + shareHash();
    $("#shareUrl").value = long; $("#shareImg").removeAttribute("src");
    $("#nativeShare").hidden = !navigator.share;
    openDlg("shareDlg");
    shareBlob = null;
    drawCard().then(c => { $("#shareImg").src = c.toDataURL("image/png"); c.toBlob(b => { shareBlob = b; }, "image/png"); }).catch(() => {});
    $("#shareUrl").value = await shortLink(long);
  };
  const flash = (btn, k) => { const o = btn.textContent; btn.textContent = t(k); setTimeout(() => { btn.textContent = o; }, 1500); };
  $("#copyLink").onclick = async e => { try { await navigator.clipboard.writeText($("#shareUrl").value); flash(e.target, "copied"); } catch (x) { $("#shareUrl").select(); } };
  $("#copyImg").onclick = async e => { try { await navigator.clipboard.write([new ClipboardItem({ "image/png": shareBlob })]); flash(e.target, "copied"); } catch (x) {} };
  $("#dlImg").onclick = () => { const a = document.createElement("a"); a.href = $("#shareImg").src; a.download = "1ms-dog.png"; a.click(); };
  $("#nativeShare").onclick = async () => {
    const s = lastSum, text = t("share_text", { ok: s.ok, n: s.n, where: whereOf(NET.groups[0]) || "?", ms: s.md != null ? fmt(s.md) : "–", tier: t("tier_" + s.tier) });
    const file = shareBlob && new File([shareBlob], "1ms-dog.png", { type: "image/png" });
    try { await navigator.share(file && navigator.canShare && navigator.canShare({ files: [file] }) ? { text, url: $("#shareUrl").value, files: [file] } : { text, url: $("#shareUrl").value }); } catch (e) {}
  };

  // The card: the same picture as the page (dog, median, exits, every ball at its distance), always in the dark theme
  const img = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  async function drawCard() {
    const W = 1200, P = 56, list = allServices().filter(s => R.get(s.id) && R.get(s.id).st === "done");
    const groups = [{ name: t("cat_local"), items: PACKS[pack] }, ...SVC.cats.map(c => ({ name: t("cat_" + c), items: SVC.list.filter(s => s.cat === c) }))]
      .map(g => ({ name: g.name, items: g.items.filter(s => list.includes(s)) })).filter(g => g.items.length);
    // three columns, filled in order, about equally tall
    const RH = 30, GH = 40, total = groups.reduce((a, g) => a + GH + g.items.length * RH, 0), cols = [[], [], []];
    let ci = 0, hcol = 0;
    for (const g of groups) { const h = GH + g.items.length * RH; if (hcol && hcol + h / 2 > total / 3 && ci < 2) { ci++; hcol = 0; } cols[ci].push(g); hcol += h; }
    const colH = Math.max(...cols.map(c => c.reduce((a, g) => a + GH + g.items.length * RH, 0)));
    const exits = NET.groups.slice(0, 3), top = 300 + exits.length * 40, H = top + colH + 90;
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const x = c.getContext("2d"), F = "Geist, 'PingFang SC', 'Microsoft YaHei', 'Hiragino Sans', 'Malgun Gothic', sans-serif", M = "'Geist Mono', Consolas, monospace";
    const C = { bg: "#1c1c1c", panel: "#232323", line: "#363636", fg: "#ededed", muted: "#a0a0a0", c0: "#c4a7ff", c1: "#3ecf8e", c2: "#9fd356", c3: "#f5c524", c4: "#f59e42", c5: "#f56565", cx: "#a0a0a0", gold: "#ffb63f", warn: "#f5a524" };
    x.fillStyle = C.bg; x.fillRect(0, 0, W, H);
    const [logo, dog] = await Promise.all([img("/assets/logo-dark.svg"), img("/assets/shiba-run.svg")]);
    x.drawImage(logo, P, 44, 150, 60);
    x.drawImage(dog, 150, 20, 700, 420, W - P - 330, 24, 330, 198);
    const s = lastSum, [, cls] = tierOf(s.md);
    x.fillStyle = C[cls]; x.font = `600 96px ${M}`; x.textBaseline = "alphabetic";
    const big = s.md != null ? fmt(s.md) : "–"; x.fillText(big, P, 228);
    const bw = x.measureText(big).width;
    x.fillStyle = C.muted; x.font = `500 26px ${F}`; x.fillText("ms " + t("med"), P + bw + 14, 228);
    x.fillStyle = C[cls]; x.font = `700 30px ${F}`; x.fillText(t("tier_" + s.tier), P, 272);
    const tw = x.measureText(t("tier_" + s.tier)).width;
    x.fillStyle = C.muted; x.font = `400 22px ${F}`; x.fillText(t("back", { ok: s.ok, n: s.n }), P + tw + 20, 272);
    // exits, without IPs
    let y = 318;
    for (const g of exits) {
      const k = t(g.proxy ? "k_proxy" : "k_local");
      x.font = `600 18px ${F}`; const kw = x.measureText(k).width + 20;
      x.fillStyle = g.proxy ? "#f5a52430" : "#3ecf8e2a"; roundRect(x, P, y - 22, kw, 30, 7); x.fill();
      x.fillStyle = g.proxy ? C.warn : C.c1; x.fillText(k, P + 10, y);
      let xx = P + kw + 12;
      if (g.cc) { try { const f = await img(`/flags/${g.cc.toLowerCase()}.svg`); x.drawImage(f, xx, y - 19, 32, 24); xx += 42; } catch (e) {} }
      x.fillStyle = C.fg; x.font = `600 22px ${F}`; const w = whereOf(g) || "?"; x.fillText(w, xx, y);
      xx += x.measureText(w).width + 14;
      x.fillStyle = C.muted; x.font = `400 20px ${F}`; x.fillText(g.org + (g.asn ? " · AS" + g.asn : ""), xx, y);
      y += 40;
    }
    // the field
    const cw = (W - P * 2 - 40 * 2) / 3, laneX = 128, msW = 60;
    cols.forEach((col, i) => {
      let yy = top + 20; const x0 = P + i * (cw + 40);
      for (const g of col) {
        x.fillStyle = C.muted; x.font = `600 15px ${F}`; x.fillText(g.name.toUpperCase(), x0, yy + 6); yy += GH - 10;
        for (const sv of g.items) {
          const md = median(R.get(sv.id).s), [, k] = tierOf(md), l0 = x0 + laneX, l1 = x0 + cw - msW - 10, cy = yy + 6;
          x.fillStyle = C.fg; x.font = `400 18px ${F}`; x.fillText(clip(x, sv.name, laneX - 12), x0, yy + 12);
          x.fillStyle = C.line; x.fillRect(l0, cy - 1.5, l1 - l0, 3);
          const px = md == null ? l1 : l0 + (l1 - l0) * pos(md);
          if (md != null) { x.fillStyle = C[k] + "99"; x.fillRect(l0, cy - 1.5, px - l0, 3); }
          x.beginPath(); x.arc(px, cy, 7, 0, Math.PI * 2);
          if (md == null) { x.strokeStyle = C.muted; x.lineWidth = 2; x.stroke(); } else { x.fillStyle = C[k]; x.fill(); }
          x.fillStyle = md == null ? C.muted : C[k]; x.font = `600 18px ${M}`; x.textAlign = "right"; x.fillText(md == null ? "✕" : fmt(md), x0 + cw, yy + 12); x.textAlign = "left";
          yy += RH;
        }
      }
    });
    x.fillStyle = C.line; x.fillRect(P, H - 70, W - P * 2, 1);
    x.fillStyle = C.gold; x.font = `600 24px ${M}`; x.fillText("1ms.dog", P, H - 30);
    x.fillStyle = C.muted; x.font = `400 18px ${F}`; x.textAlign = "right";
    x.fillText(new Date(SHARED ? SHARED.ts : Date.now()).toLocaleString(LANG, { dateStyle: "medium", timeStyle: "short" }), W - P, H - 30); x.textAlign = "left";
    return c;
  }
  function roundRect(x, l, t0, w, h, r) { x.beginPath(); x.moveTo(l + r, t0); x.arcTo(l + w, t0, l + w, t0 + h, r); x.arcTo(l + w, t0 + h, l, t0 + h, r); x.arcTo(l, t0 + h, l, t0, r); x.arcTo(l, t0, l + w, t0, r); x.closePath(); }
  function clip(x, s, w) { if (x.measureText(s).width <= w) return s; while (s.length > 1 && x.measureText(s + "…").width > w) s = s.slice(0, -1); return s + "…"; }

  /* ---------- a shared result ---------- */
  // Opening a shared link shows that result and doesn't test until the visitor asks for their own
  const SHARED = parseHash(location.hash);
  function showShared(S) {
    if (S.pack !== pack) showPack(S.pack);
    NET.groups = S.groups; NET.done = true; renderExits(); $("#eye").hidden = true;
    for (const s of allServices()) if (s.id in S.res) { R.set(s.id, { w: null, s: S.res[s.id] == null ? [] : [S.res[s.id]], st: "done" }); paintRow(s); }
    summarize(false);
    $("#sharedTxt").textContent = t("shared_from", { where: whereOf(S.groups[0]) || "?", date: new Date(S.ts).toLocaleString(LANG, { dateStyle: "medium", timeStyle: "short" }) });
    $("#shared").hidden = false;
  }
  let sharedOn = false;
  function leaveShared() {
    if (!sharedOn) return;
    sharedOn = false; $("#shared").hidden = true; $("#eye").hidden = false;
    history.replaceState(null, "", location.pathname + location.search);
    NET.groups = []; NET.seen = []; NET.geo = {}; NET.done = false; NET.hidden = null; renderExits();
    checkExits().catch(() => {});
  }
  $("#testMine").onclick = () => { leaveShared(); start(3); };

  /* ---------- go ---------- */
  setMood("sniff");
  if (SHARED) { sharedOn = true; showShared(SHARED); }
  else {
    const exitP = checkExits().catch(() => {});
    // the exits pick the local pack; give them a moment, then the dog starts fetching either way
    Promise.race([exitP, sleep(1500)]).then(() => start(3));
  }
})();
