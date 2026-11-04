// 1ms.dog home: finds every exit the visitor's traffic leaves from (local and proxy), then times HTTPS round trips to
// the services in src/services.mjs, all from the browser. Nothing is sent to 1ms.dog. The build prepends `const SVC`.
(function () {
  "use strict";
  const $ = s => document.querySelector(s);
  const D = JSON.parse($("#data").textContent);
  // a shared result opens at <page>r/<code>, two compared at <page>c/<a>/<b> (src/lib.mjs); the page itself is the path before it
  const RLINK = /\/r\/([^/]+)\/?$/.exec(location.pathname), CLINK = /\/c\/([^/]+)\/([^/]+)\/?$/.exec(location.pathname), XLINK = RLINK || CLINK;
  const PAGE = XLINK ? location.pathname.slice(0, XLINK.index + 1) : location.pathname.replace(/\/?$/, "/");
  const L = window.L1MS || {}, LANG = D.lang;                  // strings: /assets/l.<lang>.<hash>.js, loaded first
  const t = (k, v) => v ? fillIn(L[k] ?? k, v, L.josa_fin) : L[k] ?? k;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  // Connection Checkup (check.1ms.dog; 1ms-shell docs/checkup.md) frames the home page with ?embed=checkup. Only when
  // the framing page is the one the shell names in <meta name="check">: anything else opens as the normal page.
  const CHECK = (() => {
    const m = document.querySelector('meta[name="check"]');
    if (D.spot || D.set || !m || window.parent === window || new URLSearchParams(location.search).get("embed") !== "checkup") return null;
    try { const o = new URL(m.content).origin; return new URL(document.referrer).origin === o ? o : null; } catch (e) { return null; }
  })();
  const post = msg => { if (CHECK) window.parent.postMessage({ ms: "checkup", v: 1, tool: "home", ...msg }, CHECK); };
  if (CHECK) {
    document.documentElement.classList.add("embed");          // layout.css hides all but the exits, numbers and services
    const b = document.createElement("base"); b.target = "_blank"; document.head.append(b);   // links leave the frame
  }
  // embedded, the page changes no preference (the checkup's run isn't the visitor choosing anything)
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { if (!CHECK) try { localStorage.setItem(k, v); } catch (e) {} } };
  const K = { theme: "1ms:theme", lang: "1ms:lang", pack: "1ms:pack", mask: "1ms:mask", auto: "1ms:auto", hist: "1ms:hist" };
  const country = cc => { try { return regionName(cc, LANG); } catch (e) { return cc; } };
  const flag = cc => /^[A-Z]{2}$/.test(cc || "") ? `<img class="flag" src="/flags/${flagCode(cc)}.svg" alt="" width="20" height="15">` : "";
  /* @lib */
  const bust = u => u + (u.includes("?") ? "&" : "?") + "_1ms=" + Math.random().toString(36).slice(2, 10);

  /* ---------- theme and language (synced across the 1ms.dog tools) ---------- */
  const thBtn = $("#theme"), TH = ["system", "light", "dark"];
  const applyTheme = th => {
    if (th === "light" || th === "dark") document.documentElement.setAttribute("data-theme", th); else document.documentElement.removeAttribute("data-theme");
    thBtn.dataset.th = th; thBtn.title = t("th_" + th); thBtn.setAttribute("aria-label", t("th_" + th));
  };
  applyTheme(TH.includes(store.get(K.theme)) ? store.get(K.theme) : "system");
  thBtn.onclick = () => { const n = TH[(TH.indexOf(thBtn.dataset.th) + 1) % 3]; store.set(K.theme, n); applyTheme(n); };
  $("#lang").onchange = e => { const l = e.target.value; store.set(K.lang, l); location.href = D.paths[l] + (RLINK ? "r/" + RLINK[1] : CLINK ? "c/" + CLINK[1] + "/" + CLINK[2] : location.hash); };

  /* ---------- speed zones (tiers and helpers: src/lib.mjs) ---------- */
  const pos = ms => posOf(ms, SVC.scale);

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
  const SPEED = { sniff: 0.6, idle: 0.35, run: 1.15, legend: 2.6, zoom: 1.7, sprint: 1.25, trot: 0.85, stroll: 0.5, nap: 0, lost: 0, far: 1, odd: 0.85 };
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
  const getJ = (u, ms = 5000) => fetch(bust(u), { cache: "no-store", credentials: "omit", signal: AbortSignal.timeout(ms) }).then(r => r.ok ? r.json() : Promise.reject());
  const firstIp = (list, f) => Promise.any(list.map(([u, k]) => getJ(u).then(j => j[k] && fam(j[k]) === f ? { ip: j[k] } : Promise.reject())));
  // each check → { ip, geo? }, geo = { cc, city, asn, org }
  // The shell answers /_ms/me on every 1ms.dog host from what Cloudflare knows of this connection (no third party, not
  // cached; 1ms-shell docs/tool-contract.md), so the direct exit and its network come from there first. Self-hosted
  // copies get a 404 and rely on the others. The others still run: each is another site, and a proxy that routes by
  // site shows up as a different exit there, as does the other address family.
  const CHECKS = [
    ["1ms.dog", () => fetch("/_ms/me", { cache: "no-store", signal: AbortSignal.timeout(3000) }).then(r => r.ok ? r.json() : Promise.reject())
      .then(j => j.ip ? { ip: j.ip, geo: j.country ? { cc: j.country, city: j.city, asn: j.asn, org: j.org } : null } : Promise.reject())],
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
    // An address only a geo-less check saw (ipip.net, IPv4/IPv6-only hosts, WebRTC) is looked up right away; until
    // its network is known it isn't shown, so it never appears as an exit of its own and then merges into another.
    const lookups = [], looked = new Set();
    // progress: checks and lookups answered, out of those started
    const prog = NET.prog = { d: 0, n: CHECKS.length }, tick = () => { prog.d++; renderExits(); };
    const lookup = ip => {
      if (looked.has(ip) || looked.size >= 5) return;
      looked.add(ip); prog.n++;
      lookups.push(getJ("https://api.ip.sb/geoip/" + encodeURIComponent(ip)).then(j => {
        NET.geo[ip] = { cc: j.country_code, city: j.city, asn: j.asn, org: j.isp || j.asn_organization };
        group();
      }).catch(() => {}).finally(tick));
    };
    renderExits();
    await Promise.allSettled(CHECKS.map(([name, f]) => f().finally(tick).then(res => {
      for (const r of [].concat(res)) {
        if (!r || !r.ip) continue;
        NET.seen.push({ ip: r.ip, by: name });
        if (r.geo && r.geo.cc) NET.geo[r.ip] = r.geo;
      }
      for (const { ip } of NET.seen) if (!geoOf(NET.geo, ip)) lookup(ip);
      group(); renderExits();
    })));
    await Promise.allSettled(lookups);
    NET.done = true; group(); renderExits();
    if (NET.groups[0] && NET.groups[0].cc) pickPack(NET.groups[0].cc);
  }
  const group = () => { NET.groups = groupExits(NET.seen, NET.geo, NET.warp); };
  let tipEl;
  function tip(el) {
    const show = () => {
      if (!tipEl) {
        tipEl = document.body.appendChild(Object.assign(document.createElement("div"), { className: "tip" }));
        addEventListener("scroll", () => tipEl.classList.remove("on"), { passive: true });
      }
      tipEl.textContent = el.getAttribute("aria-label");
      const r = el.getBoundingClientRect(), w = tipEl.offsetWidth;
      tipEl.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + "px";
      tipEl.style.top = r.bottom + 6 + "px";
      tipEl.classList.add("on");
    };
    const hide = () => tipEl && tipEl.classList.remove("on");
    el.addEventListener("mouseenter", show); el.addEventListener("focus", show);
    el.addEventListener("mouseleave", hide); el.addEventListener("blur", hide);
  }
  // Links to the other 1ms.dog tools, in this page's language. The shell names each tool's address in
  // <meta name="<id>">; without it (a copy hosted elsewhere) there is no link.
  const LANG_DIR = LANG === "en" ? "/" : "/" + LANG.toLowerCase() + "/";     // every tool uses the same language folders
  const toolHref = (id, p = "") => { const m = document.querySelector(`meta[name="${id}"]`), h = m && m.content.replace(/\/+$/, ""); return h ? h + LANG_DIR + p : ""; };
  // a sentence link to another tool ends in the external-link icon (the shared one, docs/tool-contract.md in 1ms-shell)
  const EXT = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5M12 10v3.5H2.5V4H6"/></svg>';
  const toolA = (id, p, txt, cls, title) => { const h = toolHref(id, p); return h ? `<a${cls ? ` class="${cls}"` : ""} href="${esc(h)}" target="_blank" rel="noopener"${title ? ` title="${esc(title)}"` : ""}>${esc(txt)}</a>` : esc(txt); };
  for (const a of document.querySelectorAll("a[data-tool]")) { const h = toolHref(a.dataset.tool); if (h) { a.href = h; a.hidden = false; } }
  const ext = (id, p, txt) => `<a class="ext" href="${esc(toolHref(id, p))}" target="_blank" rel="noopener">${esc(txt)}${EXT}</a>`;
  // each exit address links to its quality check (IP quality test), its AS number to the AS lookup
  const ipLink = ip => toolA("ipqs", "?ip=" + encodeURIComponent(ip), ip, "q", t("ipqs_t"));
  const asLink = n => toolA("asn", "AS" + n, "AS" + n, "q", t("asn_t"));
  // under the exits: the IPv6 test (worded by whether an IPv6 exit showed up) and what else sites can see
  function renderExLinks() {
    const v6 = NET.groups.some(g => g.ips.some(ip => fam(ip) === 6));
    const l = [toolHref("ipv6") && ext("ipv6", "", t(v6 ? "l_v6" : "l_v6_none")), toolHref("who") && ext("who", "", t("l_who"))].filter(Boolean);
    const el = $("#exLinks"); el.innerHTML = l.join(""); el.hidden = !l.length;
  }
  // under the verdict: every page to the full checkup (not inside the checkup's own frame), an AI service's page to
  // the IP that AI services see (EgressLens checks these), a service the unlock check covers to its page there, every
  // page to the speed test
  const EGRESS_AI = ["chatgpt", "claude", "grok", "copilot"];
  {
    const l = [!CHECK && toolHref("check") && ext("check", "", t("l_check")),
      D.spot && EGRESS_AI.includes(D.spot) && toolHref("egress") && ext("egress", "chatgpt-ip/", t("l_ai", { s: SVC.list.find(s => s.id === D.spot).name })),
      D.spot && SVC.unlock[D.spot] && toolHref("unlock") && ext("unlock", SVC.unlock[D.spot] + "/", t("unlock_one", { s: SVC.list.find(s => s.id === D.spot).name })),
      toolHref("speed") && ext("speed", "", t("l_speed"))].filter(Boolean);
    const el = $("#vLinks"); el.innerHTML = l.join(""); el.hidden = !l.length;
  }
  function renderExits() {
    // Answers show as they arrive, but only in the one row drawn from the start: the first exit found fills it right
    // away (the placeholder is a real row's height). Further rows, merging and ordering wait for every check and
    // lookup, so the list changes height at most once (adding a row per answer pushed the page down several times).
    const pg = $("#exProg"), P = NET.prog;
    if (pg) pg.textContent = !NET.done && P ? `${P.d}/${P.n}` : "";
    const G = NET.done ? NET.groups : NET.groups.slice(0, 1), ul = $("#exList");
    if (!NET.done && !G.length) return;
    if (!G.length) { ul.innerHTML = `<li class="ex sk-row">${NET.done ? esc(t("no_net")) : `<span class="sk-t">${esc(t("sniff"))}</span>`}</li>`; return; }
    ul.innerHTML = G.map(g => {
      const where = [g.city, g.cc && country(g.cc)].filter(Boolean).join(", ");
      const ips = [4, 6].map(f => [f, g.ips.filter(ip => fam(ip) === f)]).map(([f, l]) => l.length ? `<span><em>IPv${f}</em>${l.map(ipLink).join(" · ")}</span>` : "").join("");
      const org = g.org ? `<span class="o">${esc(g.org)}</span>` + (g.asn ? "<span>·</span>" + asLink(g.asn) : "") : "";
      // which checks saw this exit: a small "!" after the network, hovering (or focusing) it shows the list
      const by = g.by.length ? `<span class="src" tabindex="0" role="img" aria-label="${esc(t("seen_by", { list: g.by.join(", ") }))}">!</span>` : "";
      return `<li class="ex"><span class="kind ${g.proxy ? "proxy" : "local"}">${esc(t(g.proxy ? "k_proxy" : "k_local"))}</span>` +
        `<span class="where">${flag(g.cc)}<b>${esc(where || "?")}</b>${org ? `<span class="m">${org}</span>` : ""}${by}</span>` +
        `<span class="ips">${ips}</span></li>`;
    }).join("");
    ul.querySelectorAll(".src").forEach(tip);
    if (NET.done) renderExLinks();
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
  const rowHtml = s => `<li class="row" id="t-${s.id}"><a class="nm" href="${D.paths[LANG]}${s.id}/">${esc(s.name)}</a><span class="trk"><i class="tail"></i><i class="b"></i></span><b class="ms">–</b></li>`;
  // a single-service page (/chatgpt/, /zh-cn/dockerhub/…) tests only that service, more thoroughly
  const ONE = D.spot ? [...SVC.list, ...Object.values(SVC.packs).flat()].find(s => s.id === D.spot) : null, ONE_N = 10;
  // a group page (/ai/, /region/jp/…) tests just that category's or region's services
  const GRP = D.set ? { ...D.set, list: D.set.kind === "cat" ? SVC.list.filter(s => s.cat === D.set.id) : PACKS[D.set.id] } : null, GRP_N = 5;
  const SUBS = ONE && SVC.subs[ONE.id] || [];                  // a service page's parts: Telegram's data centers
  const allServices = () => ONE ? [ONE, ...SUBS] : GRP ? GRP.list : [...(PACKS[pack] || []), ...SVC.list];
  function showPack(p) { pack = p; $("#localRows").innerHTML = PACKS[p].map(rowHtml).join(""); $("#pack").value = p; }
  if (!ONE && !GRP) { const saved = store.get(K.pack); if (saved && PACKS[saved] && saved !== pack) showPack(saved); }
  function pickPack(cc) { const p = PACK_OF[cc]; if (!ONE && !GRP && !store.get(K.pack) && p && p !== pack) setPack(p, false); }
  function setPack(p, user) {
    if (!PACKS[p]) return;
    if (user) store.set(K.pack, p);
    showPack(p);
    for (const s of PACKS[p]) R.delete(s.id);
    if (RUN && RUN.full) { RUN.q.unshift(...PACKS[p]); RUN.n += PACKS[p].length; }   // joins the run in progress
    else if (!RUN && LAST_DONE) runList(PACKS[p], 3, false);
  }
  if ($("#pack")) $("#pack").onchange = e => setPack(e.target.value, true);

  /* ---------- probing ---------- */
  // Same method as Me2Cloud: one uncounted request opens DNS + TCP + TLS, then each timed request reuses that
  // connection. no-cors with no custom headers is a simple request: no preflight, no cookies, no referrer.
  const R = new Map();          // id → { w, s: [], st }
  const TIMEOUT = 4000, WARM_TIMEOUT = 5000, GAP = 120, CONC = 8;
  // The edge node that answered, as each network writes it (src/services.mjs: pop), down to its airport code; Wikimedia
  // names a cache host whose first digit is the data center
  try { performance.setResourceTimingBufferSize(3000); } catch (e) {}   // the default 250 fills up during a full test
  const WMF = { cp1: "IAD", cp2: "DFW", cp3: "AMS", cp4: "SFO", cp5: "SIN", cp6: "MRS", cp7: "GRU" };
  const POP = {
    trace: async r => /\bcolo=([A-Z]{3})\b/.exec(await r.text())?.[1],
    wmf: async (r, u) => { await r.blob(); const e = performance.getEntriesByName(u).pop(), h = e && e.serverTiming.find(x => x.name === "host"); return h && WMF[h.description.slice(0, 3)]; },
    "x-served-by": async r => /([A-Z]{3})\s*$/.exec(r.headers.get("x-served-by") || "")?.[1],
    "x-amz-cf-pop": async r => /^[A-Z]{3}/.exec(r.headers.get("x-amz-cf-pop") || "")?.[0],
  };
  // where each code is, for the badge's hint (unknown codes show without a country)
  const POP_CC = {};
  for (const g of ("JP:NRT,HND,TYO,OSA,KIX,ITM,FUK,OKA,CTS,NGO TW:TPE,KHH,TSA HK:HKG MO:MFM KR:ICN,SEL,GMP,PUS CN:PEK,PKX,SHA,PVG,CAN,SZX,CTU,CKG,HGH,NKG,TSN,WUH,XIY,CGO,TAO,SJW,FOC,XMN,KMG,NNG,CSX,HFE,SHE,DLC,TNA,TYN,LHW,HAK " +
    "SG:SIN,QPG MY:KUL,JHB,PEN TH:BKK,CNX ID:CGK,SUB,DPS PH:MNL,CEB VN:SGN,HAN,DAD KH:PNH MM:RGN IN:BOM,DEL,MAA,BLR,HYD,CCU,AMD,COK,NAG,PNQ,KNU BD:DAC PK:KHI,LHE,ISB LK:CMB NP:KTM " +
    "AU:SYD,MEL,BNE,PER,ADL,CBR NZ:AKL,CHC GU:GUM AE:DXB,AUH,FJR QA:DOH SA:RUH,JED,DMM BH:BAH KW:KWI OM:MCT IL:TLV,HFA TR:IST,ADB,ESB JO:AMM IQ:BGW,EBL IR:THR KZ:ALA,NQZ UZ:TAS GE:TBS AM:EVN AZ:GYD " +
    "US:IAD,DCA,IAH,DFW,DAL,LAX,SJC,SFO,SEA,ORD,ATL,MIA,EWR,JFK,LGA,BOS,DEN,PHX,MSP,DTW,PHL,PDX,SLC,LAS,SAN,MCI,STL,CLT,BNA,AUS,TPA,MCO,JAX,IND,CMH,CLE,PIT,RIC,RDU,BUF,OMA,OKC,MEM,SMF,BWI,HNL,ANC,SAT,ABQ,FSD,BGR,ORF " +
    "CA:YYZ,YUL,YVR,YYC,YEG,YOW,YWG,YHZ,YXE MX:MEX,QRO,GDL,MTY BR:GRU,GIG,FOR,POA,CWB,BSB,SSA,REC,BEL,CNF,VCP AR:EZE,COR CL:SCL CO:BOG,MDE PE:LIM EC:UIO,GYE UY:MVD PY:ASU BO:LPB VE:CCS CR:SJO PA:PTY GT:GUA DO:SDQ PR:SJU " +
    "GB:LHR,LGW,LCY,MAN,EDI,LON IE:DUB,ORK FR:CDG,ORY,PAR,MRS,LYS,BOD NL:AMS DE:FRA,MUC,TXL,BER,HAM,DUS,STR,CGN,HHN BE:BRU LU:LUX CH:ZRH,GVA AT:VIE IT:MXP,LIN,FCO,PMO ES:MAD,BCN,AGP PT:LIS,OPO " +
    "DK:CPH SE:ARN,GOT NO:OSL FI:HEL IS:KEF PL:WAW,KRK CZ:PRG SK:BTS HU:BUD RO:OTP,CLJ BG:SOF GR:ATH,SKG HR:ZAG RS:BEG SI:LJU UA:KBP,HRK,ODS LT:VNO LV:RIX EE:TLL MD:KIV CY:LCA MT:MLA " +
    "RU:SVO,DME,LED,KJA,VVO,OVB,SVX,KZN ZA:JNB,CPT,DUR EG:CAI NG:LOS,ABV KE:NBO MA:CMN,RAK TN:TUN DZ:ALG GH:ACC SN:DKR ET:ADD TZ:DAR UG:EBB RW:KGL MU:MRU AO:LAD MZ:MPM").split(" ")) {
    const [cc, codes] = g.split(":"); for (const c of codes.split(",")) POP_CC[c] = cc;
  }
  async function probe(s, timeout, signal, cors) {
    const t0 = performance.now();
    if (s.m === "IMG") return new Promise(res => {
      const img = new Image(); let done = false;
      const fin = v => { if (done) return; done = true; clearTimeout(tm); img.onload = img.onerror = null; res(v); };
      img.onload = img.onerror = () => fin(performance.now() - t0);
      const tm = setTimeout(() => fin(null), timeout);
      signal.addEventListener("abort", () => fin(null), { once: true });
      img.referrerPolicy = "no-referrer"; img.src = s.raw ? s.url : bust(s.url);
    });
    const ctl = new AbortController(), stop = () => ctl.abort(), tm = setTimeout(stop, timeout);
    signal.addEventListener("abort", stop);
    let ms = null, pop = null;
    try {
      // a service whose node can be read goes in cors mode: still a simple request (GET or HEAD, no custom
      // headers), so no preflight and the same single round trip
      const u = s.raw ? s.url : bust(s.url);
      const r = await fetch(u, { method: s.m || "GET", mode: cors ? "cors" : "no-cors", cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", signal: ctl.signal });
      ms = performance.now() - t0;
      if (cors) pop = await POP[s.pop](r, u).catch(() => null);
    } catch (e) {}
    clearTimeout(tm); signal.removeEventListener("abort", stop);
    return cors ? { ms, pop } : ms;
  }
  // one sample: the time, and the node when this service can show it (when the host stops allowing cors, the
  // service is timed as before and just loses its badge)
  async function sample(s, r, timeout, signal) {
    if (!s.pop || s.popUrl || r.noPop) return probe(s, timeout, signal);
    const v = await probe(s, timeout, signal, true);
    if (v.ms == null && !signal.aborted) { const w = await probe(s, timeout, signal); if (w != null) r.noPop = true; return w; }
    if (v.pop) { r.pop = v.pop; paintPop(s); }
    return v.ms;
  }
  // the node from a sibling URL on the same edge network, once, while the timed requests run
  async function sidePop(s, r) {
    try {
      const u = s.popUrl, x = await fetch(u, { mode: "cors", cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", signal: AbortSignal.timeout(WARM_TIMEOUT) });
      const p = await POP[s.pop](x, u);
      if (p && R.get(s.id) === r) { r.pop = p; paintPop(s); }
    } catch (e) {}
  }
  function paintPop(s) {
    const r = R.get(s.id), nm = document.querySelector(`#t-${s.id} .nm`);
    if (nm) {
      let b = nm.querySelector(".pop");
      if (!r || !r.pop) { if (b) b.remove(); }
      else {
        if (!b) { b = document.createElement("span"); b.className = "dc pop"; b.tabIndex = 0; b.setAttribute("role", "img"); nm.prepend(b); tip(b); }
        b.textContent = r.pop; b.setAttribute("aria-label", t("pop_t", { pop: r.pop + (POP_CC[r.pop] ? " · " + country(POP_CC[r.pop]) : "") }));
      }
    }
    if (ONE && s === ONE) paintOne();
  }
  // Telegram: the data center most accounts in the visitor's region are on (src/services.mjs: TG_DC), chosen when
  // the probe starts and named next to the result
  const TG = SVC.list.find(s => s.id === "telegram");
  // where each data center is, in the page's language (English keeps the city)
  const dcPlace = d => LANG === "en" ? d.city : country(d.cc);
  for (const d of SVC.subs.telegram) { d.name = `DC${d.dc} · ${dcPlace(d)}`; const el = document.querySelector(`#t-${d.id} .nm`); if (el) el.textContent = d.name; }
  function tgDc() {
    const d = SVC.subs.telegram.find(x => x.dc === (SVC.tgDcOf[pack] || 2));
    TG.url = d.url;
    const nm = document.querySelector("#t-telegram .nm"); if (!nm) return;
    let b = nm.querySelector(".dc");
    if (!b) { b = document.createElement("span"); b.className = "dc"; b.tabIndex = 0; b.setAttribute("role", "img"); nm.appendChild(b); tip(b); }
    b.textContent = "DC" + d.dc; b.setAttribute("aria-label", t("tg_dc_t", { dc: "DC" + d.dc, city: dcPlace(d) }));
  }
  async function runOne(s, n, signal) {
    if (s === TG) tgDc();
    const r = { w: null, s: [], st: "run" }; R.set(s.id, r); paintRow(s); paintPop(s);
    if (s.popUrl) sidePop(s, r);
    r.w = await sample(s, r, WARM_TIMEOUT, signal);
    let fails = r.w == null ? 2 : 0;                          // no connection at all: lost, no second wait
    while (r.s.length < n && !signal.aborted && fails < 2) {
      await sleep(GAP + Math.random() * 80);
      if (signal.aborted) break;
      const v = await sample(s, r, TIMEOUT, signal);
      if (signal.aborted) break;
      r.s.push(v == null ? null : Math.round(v * 10) / 10);
      fails = v == null ? fails + 1 : 0;
      if (ONE) paintOne();                                    // a single service shows every sample as it lands
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
      el.className = "row" + (r ? " run" : "") + hot; b.style.transform = ""; tail.style.transform = ""; ms.textContent = r ? "…" : "–"; el.title = ""; return;
    }
    const md = median(r.s), [tk, cls] = tierOf(md);
    el.className = "row " + (md == null ? "lost" : "done " + cls) + hot;
    const p = md == null ? 100 : pos(md) * 100;
    b.style.transform = `translateX(${p}%)`; tail.style.transform = md == null ? "" : `scaleX(${p / 100})`;
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
    const worker = async () => { while (q.length && !ctl.signal.aborted) { const s = q.shift(); await runOne(s, SUBS.includes(s) ? GRP_N : n, ctl.signal); run.d++; if (median(R.get(s.id).s) != null) run.ok = true; progress(run); blocked(run); } };
    await Promise.all(Array.from({ length: CONC }, worker));
    if (RUN !== run) return;
    RUN = null; LAST_DONE = true; setBusy(false); progress(null);
    summarize(!ctl.signal.aborted);
    if (full && !ctl.signal.aborted) saveRun();
    if (CHECK && full && !ctl.signal.aborted) EXITS.then(checkupResult);
  }
  // Embedded in the checkup: when the first services all fail (an ad blocker stopping every probe, or no network at
  // all), say so at once instead of running out the timeouts; an error means no result follows (docs/checkup.md)
  const BLOCKED_AFTER = 10;
  function blocked(run) {
    if (!CHECK || !run.full || run.ok || run.d < BLOCKED_AFTER || run.ctl.signal.aborted) return;
    post({ type: "error", text: t("e_blocked") });
    run.ctl.abort();
  }
  function progress(run) {
    $("#prog i").style.width = run && !ONE ? (100 * run.d / run.n).toFixed(1) + "%" : "0";
    if (!run || ONE) return;
    $("#vHead").textContent = t("running", { d: run.d, n: run.n });
    if (run.full && !run.ctl.signal.aborted) post({ type: "progress", done: run.d, total: run.n, text: $("#vHead").textContent });
    paintStats();                                             // the three numbers move while the balls come back
  }
  function setBusy(b) { $("#run span").textContent = t(b ? "stop" : "run"); if ($("#deep")) $("#deep").disabled = b; paintCmpBtn(); }
  let lastSum = null;
  // the share button next to the verdict works once there is a result to share
  const paintShare = () => { if ($("#share")) $("#share").disabled = !lastSum; };
  const moodKey = () => lastSum ? "mood_" + lastSum.mood : RUN ? "mood_run" : "mood_sniff";
  // the stats row: local favorites, global services, and the overall median with how many came back
  function paintStats() {
    if (ONE) return paintOne();
    if (GRP) return paintGroup();
    const cell = (id, sg) => {
      const el = $(id), [tk, cls] = tierOf(sg.md);
      el.querySelector("b").innerHTML = sg.md != null ? `${fmt(sg.md)}<small>ms</small>` : sg.n ? "✕" : "–";
      el.querySelector("b").className = sg.md != null ? cls : "cx";
      return [el, tk, sg];
    };
    for (const [el, tk, sg] of [cell("#stLocal", segment(PACKS[pack] || [])), cell("#stGlobal", segment(SVC.list))])
      el.querySelector("i").textContent = sg.md != null ? t("tier_" + tk) : sg.n ? t("tier_lost") : "";
    const [el, , all] = cell("#stAll", segment(allServices()));
    el.querySelector("i").textContent = all.n ? t("back", { ok: all.ok, n: all.n }) : "";
    return all;
  }
  function summarize() {
    if (ONE) return summarizeOne();
    if (GRP) return summarizeGroup();
    // The overall median only describes this sample of services. The verdict, which splits local favorites,
    // global services and failures, decides the headline and what the dog says.
    const all = paintStats(), v = verdict();
    lastSum = { md: all.md, ok: all.ok, n: all.n, tier: tierOf(all.md)[0], mood: v.mood, v }; paintShare();
    setMood(v.mood); say("mood_" + v.mood);
    hiddenExit();
    renderVerdict(v);
  }

  /* ---------- verdict: where it's fast, where it's slow, what that means ---------- */
  const USES = SVC.uses;                                      // see src/services.mjs
  // the finished services among a list, as a segment (median, how many answered, which didn't)
  function segment(list) {
    const svcs = list.filter(s => s && R.get(s.id) && R.get(s.id).st === "done");
    return segmentOf(svcs.map(s => median(R.get(s.id).s)), svcs.map(s => s.name));
  }
  // which side the slowness is on (src/lib.mjs: diagnose), plus each everyday use
  function verdict() {
    const local = segment(PACKS[pack] || []), global = segment(SVC.list);
    const uses = USES.map(([k, ids, good, ok]) => {
      const sg = segment(ids.map(id => SVC.list.find(s => s.id === id)));
      return sg.n ? { k, ids, md: sg.md, lost: sg.lost, st: useStatus(sg, good, ok) } : null;
    }).filter(Boolean);
    return { ...diagnose(local, global), local, global, lost: [...local.lost, ...global.lost], uses };
  }
  // headline: the diagnosis in a few words; detail: what it means, plus what didn't answer (numbers are in the stats)
  const verdictHead = v => t(v.key.replace("v_", "vh_"));
  function verdictText(v) {
    let s = t(v.key);
    if (v.lost.length) s += " " + t("v_fail", { list: v.lost.slice(0, 4).join(t("v_join")) + (v.lost.length > 4 ? "…" : "") });
    return s;
  }
  function renderVerdict(v) {
    if (ONE) { $("#vHead").textContent = t("running_one", { s: ONE.name, d: 0, n: ONE_N }); $("#vText").textContent = t("v_one_wait", { s: ONE.name }); return; }
    if (GRP) { $("#vHead").textContent = t("running", { d: 0, n: GRP.list.length }); $("#vText").textContent = t("v_grp_wait", { g: GRP.name }); return; }
    $("#vHead").textContent = v ? verdictHead(v) : t("running", { d: 0, n: allServices().length });
    // while testing, the same lines hold placeholders, so nothing moves when the verdict arrives
    $("#vText").textContent = v ? verdictText(v) : t("v_wait");
    // each use names the services it is judged on, and points at them in the field (hover, focus or tap)
    const based = u => u.ids.map(id => SVC.list.find(s => s.id === id).name).join(t("v_join")) + (u.md != null ? ` · ${fmt(u.md)} ms` : "") +
      (u.lost.length ? ` · ${t("tier_lost")}: ${u.lost.join(t("v_join"))}` : "");
    $("#vUses").innerHTML = v ? v.uses.map(u => `<button type="button" class="use s-${u.st}" data-ids="${u.ids.join(",")}" title="${esc(based(u))}" aria-label="${esc(t("use_" + u.k) + " " + t("st_" + u.st) + ": " + based(u))}">${esc(t("use_" + u.k))}<b>${esc(t("st_" + u.st))}</b></button>`).join("")
      : USES.map(([k]) => `<span class="use">${esc(t("use_" + k))}<b>…</b></span>`).join("");
  }
  let pinned = null;
  const mark = ids => document.querySelectorAll(".row").forEach(r => r.classList.toggle("hl", !!ids && ids.includes(r.id.slice(2))));
  const useOf = e => e.target.closest && e.target.closest("button.use");
  const usesEl = $("#vUses") || document.createElement("div");   // absent on a single-service page
  usesEl.addEventListener("mouseover", e => { const b = useOf(e); if (b) mark(b.dataset.ids.split(",")); });
  usesEl.addEventListener("mouseout", e => { if (useOf(e)) mark(pinned); });
  usesEl.addEventListener("focusin", e => { const b = useOf(e); if (b) mark(b.dataset.ids.split(",")); });
  usesEl.addEventListener("focusout", () => mark(pinned));
  usesEl.addEventListener("click", e => {                     // a tap pins the highlight (phones have no hover)
    const b = useOf(e); if (!b) return;
    const ids = b.dataset.ids.split(",");
    pinned = pinned && pinned.join() === ids.join() ? null : ids;
    document.querySelectorAll("button.use").forEach(x => x.setAttribute("aria-pressed", x === b && !!pinned));
    mark(pinned || ids);
  });

  /* ---------- a group (category or region) ---------- */
  // the group's median, and its fastest and slowest service
  function paintGroup() {
    const sg = segment(GRP.list), done = GRP.list.filter(s => R.get(s.id) && R.get(s.id).st === "done");
    const meds = done.map(s => [s, median(R.get(s.id).s)]).filter(([, m]) => m != null).sort((a, b) => a[1] - b[1]);
    const cell = (id, v, sub) => {
      const b = $(id + " b"), [, c] = tierOf(v);
      b.innerHTML = v != null ? `${fmt(v)}<small>ms</small>` : sg.n ? "✕" : "–"; b.className = v != null ? c : "cx";
      $(id + " i").textContent = sub;
    };
    cell("#stMed", sg.md, sg.n ? t("back", { ok: sg.ok, n: sg.n }) : "");
    cell("#stBest", meds.length ? meds[0][1] : null, meds.length ? meds[0][0].name : "");
    cell("#stWorst", meds.length > 1 ? meds[meds.length - 1][1] : null, meds.length > 1 ? meds[meds.length - 1][0].name : "");
    return sg;
  }
  function summarizeGroup() {
    const sg = paintGroup(), gr = grade(sg), [tk] = tierOf(sg.md);
    $("#vHead").textContent = gr === "blocked" ? t("vh_grp_lost", { g: GRP.name }) : t("vh_grp", { g: GRP.name, tier: t("tier_" + tk) });
    let text = t("v_grp_" + gr, { g: GRP.name });
    if (sg.lost.length && gr !== "blocked") text += " " + t("v_fail", { list: sg.lost.join(t("v_join")) });
    $("#vText").textContent = text;
    const mood = gr === "blocked" ? "lost" : tk;
    lastSum = { md: sg.md, ok: sg.ok, n: sg.n, tier: tk, mood }; paintShare();
    setMood(mood); say("mood_" + mood);
  }

  /* ---------- a single service ---------- */
  function paintOne() {
    const r = R.get(ONE.id) || { s: [], w: null, st: "" }, ok = r.s.filter(v => v != null), md = median(ok), [tk, cls] = tierOf(md);
    const cell = (id, v, sub, c, pre = "") => {
      const b = $(id + " b");
      b.innerHTML = v != null ? `${pre}${fmt(v)}<small>ms</small>` : r.st === "done" ? "✕" : "–"; b.className = v != null ? c || "" : "cx";
      $(id + " i").textContent = sub;
    };
    cell("#stMed", md, (md != null ? t("tier_" + tk) : r.st === "done" ? t("tier_lost") : "") + (r.pop ? " · " + t("pop_s", { pop: r.pop }) : ""), cls);
    cell("#stCold", r.w, r.w != null ? "DNS + TCP + TLS" : "");
    cell("#stJit", ok.length > 1 ? jitter(ok) : null, ok.length ? t("one_samples", { n: ok.length }) : "", "", "±");
    // every sample is a ball on the lane, the median a bigger one
    const at = v => (pos(v) * 100).toFixed(1) + "%";
    $("#dots").innerHTML = ok.map(v => `<i class="${tierOf(v)[1]}" style="left:${at(v)}"></i>`).join("") + (md != null ? `<b class="${cls}" style="left:${at(md)}"></b>` : "");
    if (r.st === "run") { $("#vHead").textContent = t("running_one", { s: ONE.name, d: r.s.length, n: ONE_N }); $("#prog i").style.width = (100 * r.s.length / ONE_N) + "%"; }
    return { md, ok: ok.length ? 1 : 0, n: 1 };
  }
  function summarizeOne() {
    const r = R.get(ONE.id), ok = r ? r.s.filter(v => v != null) : [], md = median(ok), [tk] = tierOf(md);
    paintOne();
    const key = md == null ? "lost" : md <= 80 ? "fast" : md <= 150 ? "ok" : md <= 300 ? "slow" : "far";
    $("#vHead").textContent = md == null ? t("vh_one_lost", { s: ONE.name }) : t("vh_one", { s: ONE.name, tier: t("tier_" + tk) });
    $("#vText").textContent = t("v_one_" + key, { s: ONE.name });
    const mood = md == null ? "lost" : tk;
    lastSum = { md, ok: ok.length ? 1 : 0, n: 1, tier: tk, mood }; paintShare();
    setMood(mood); say("mood_" + mood);
    $("#prog i").style.width = "0";
  }

  /* ---------- controls ---------- */
  const start = n => { if (ONE) n = ONE_N; if (GRP) n = GRP_N; for (const s of allServices()) { R.delete(s.id); paintRow(s); } lastSum = null; paintShare(); renderVerdict(null); paintStats(); runList(allServices(), n, true); };
  $("#run").onclick = () => { if (RUN) { RUN.ctl.abort(); return; } leaveShared(); start(3); };
  if ($("#deep")) { $("#deep").title = t("deep_t"); $("#deep").onclick = () => { leaveShared(); start(10); }; }

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
  // the command-line card (home page): its dialog, filled in on first open with every way to run the tool (the site
  // comes from the card's install line, so a self-hosted copy hands out its own). Each command line is its own copy
  // button: a click copies it, and its mark turns to a tick for a moment
  function cliBody() {
    const site = /^curl -fsSL (\S+)\/i/.exec($(".cli code").textContent)[1], ext = EXT.replace("<svg ", '<svg class="ext" ');
    const marks = [...$$(".cli .cmdline svg")].map(x => x.outerHTML).join("");
    const line = (cmd, note) => `<button class="cmdline" type="button" data-copy title="${esc(t("copy"))}"><code>${esc(cmd)}</code>${marks}</button>` + (note ? `<span class="note">${esc(t(note))}</span>` : "");
    const sec = (h, body) => `<section class="rblk"><b>${esc(t(h))}</b>${body}</section>`, win = `${site}/dl/latest/httpslatency-windows-amd64.exe`;
    return sec("cli_install", line(`curl -fsSL ${site}/i | sh`, "cli_install_s")) + sec("cli_once", line(`curl -fsSL ${site}/i | sh -s -- run`)) +
      sec("cli_wget", line(`wget -qO- ${site}/i | sh`)) +
      sec("cli_opts", line("httpslatency -c ai,video,game", "cli_o_cat") + line("httpslatency -s chatgpt,github -n 10", "cli_o_svc") +
        line("httpslatency -6", "cli_o_v6") + line("httpslatency --json > latency.json", "cli_o_json")) +
      sec("cli_win", line(`irm ${site}/i.ps1 | iex`, "cli_win_s") + `<a class="dl" href="${esc(win)}">httpslatency-windows-amd64.exe ↓</a>`) +
      `<a class="cli-gh" href="${esc($(".cli-gh").href)}" target="_blank" rel="noopener noreferrer"><svg class="gh-ic" viewBox="0 0 16 16" aria-hidden="true"><use href="#ghMark"/></svg>${esc(t("cli_src"))}${ext}</a>`;
  }
  $$("[data-cli]").forEach(b => { b.onclick = () => { if (!$("#cliB").firstChild) $("#cliB").innerHTML = cliBody(); openDlg("cli"); }; });
  document.addEventListener("click", e => {
    const b = e.target.closest && e.target.closest("[data-copy]");
    if (!b || !navigator.clipboard) return;
    navigator.clipboard.writeText(b.querySelector("code").textContent).then(() => {
      b.classList.add("done"); b.title = t("copied");
      setTimeout(() => { b.classList.remove("done"); b.title = t("copy"); }, 1200);
    }, () => {});
  });
  $$("#helpNav [data-hq]").forEach(b => { b.onclick = () => showHelp(+b.dataset.hq); });
  $("#helpSel").onchange = e => showHelp(+e.target.value);
  $$("[data-hstep]").forEach(b => { b.onclick = () => showHelp(helpIdx + +b.dataset.hstep); });

  /* ---------- share: the shared dialog (/assets/share/, from 1ms-shell), a link that carries the result ---------- */
  // The link carries no IP address (format and parsing: src/lib.mjs). City and network go in only when the visitor
  // ticks the dialog's box; the country always does, since it says which sites were local.
  const whereOf = g => g ? [g.city, g.cc && country(g.cc)].filter(Boolean).join(", ") : "";
  const exitsFor = show => show ? NET.groups : NET.groups.map(g => ({ ...g, city: "", org: "", asn: null }));
  const resultCode = show => encodeShare({ ts: SHARED && sharedOn ? SHARED.ts : Date.now(), pack, groups: exitsFor(show),
    res: Object.fromEntries(allServices().filter(s => R.get(s.id) && R.get(s.id).st === "done").map(s => [s.id, median(R.get(s.id).s)])) });
  if ($("#share")) $("#share").onclick = async () => {
    if (!lastSum) return;
    const { share } = await import("/assets/share/share.js?v=7");
    const s = lastSum, card = cardLayout();
    share({
      // the header names what was tested (a group or one service); the home page's name is 1ms.dog, already the host there
      lang: LANG, name: ONE ? ONE.name : GRP ? GRP.name : "", file: "1ms-dog",
      show: ["city", "isp"], never: ["ip", "colo"], canShow: NET.groups.some(g => g.city || g.org || g.asn),
      link: show => location.origin + PAGE + "r/" + resultCode(show),
      home: location.origin + PAGE,
      text: show => t("share_text", { ok: s.ok, n: s.n, where: whereOf(exitsFor(show)[0]) || "?", ms: s.md != null ? fmt(s.md) : "–", tier: t("tier_" + s.tier) }),
      height: card.height, draw: card.draw,
      ts: SHARED && sharedOn ? SHARED.ts : Date.now(),
    }).open();
  };

  // "Report a problem" (the shell's dialog, opened from the footer) attaches what the visitor saw, the same way a
  // share link holds it: country and local/proxy per exit, no address, city or network; each service's samples
  window.msReport = () => {
    const s = lastSum, done = allServices().filter(x => R.get(x.id) && R.get(x.id).st !== "run");
    return {
      summary: s ? t("share_text", { ok: s.ok, n: s.n, where: whereOf(exitsFor(false)[0]) || "?", ms: s.md != null ? fmt(s.md) : "–", tier: t("tier_" + s.tier) })
        : $("#vHead").textContent,
      data: { page: PAGE, lang: LANG, pack, shared: !!(SHARED && sharedOn), link: done.length ? location.origin + PAGE + "r/" + resultCode(false) : null,
        exits: NET.groups.map(g => ({ cc: g.cc, proxy: g.proxy })),
        results: Object.fromEntries(done.map(x => { const r = R.get(x.id); return [x.id, { md: median(r.s), cold: r.w == null ? null : Math.round(r.w), s: r.s, pop: r.pop || undefined }]; })) },
    };
  };

  // The card's middle: the same picture as the page (dog, headline, the three numbers, exits, every ball at its
  // distance), in the page's theme. A group page draws its one group full width, a single service its samples.
  // The dialog draws the frame (logo, QR code, date) around it, between kit.top and kit.bottom.
  const img = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  function cardLayout() {
    let L = null;
    // measured first, for the card's height; the exits depend on the share box (city and network, or not)
    const height = (m, kit) => {
      const { W, P, top: T, F } = kit, list = allServices().filter(s => R.get(s.id) && R.get(s.id).st === "done");
      const groups = (ONE ? (SUBS.length ? [{ name: t("sub_" + ONE.id), items: SUBS }] : []) : GRP ? [{ name: GRP.name, items: GRP.list }] : [{ name: t("cat_local"), items: PACKS[pack] }, ...SVC.cats.map(c => ({ name: t("cat_" + c), items: SVC.list.filter(s => s.cat === c) }))])
        .map(g => ({ name: g.name, items: g.items.filter(s => list.includes(s)) })).filter(g => g.items.length);
      // three columns (one on a group page), filled in order, about equally tall
      const NC = GRP || ONE ? 1 : 3, RH = 26, GH = 34, total = groups.reduce((a, g) => a + GH + g.items.length * RH, 0), cols = Array.from({ length: NC }, () => []);
      let ci = 0, hcol = 0;
      for (const g of groups) { const h = GH + g.items.length * RH; if (hcol && hcol + h / 2 > total / NC && ci < NC - 1) { ci++; hcol = 0; } cols[ci].push(g); hcol += h; }
      const oneH = ONE ? 80 : 0, colH = oneH + Math.max(0, ...cols.map(c => c.reduce((a, g) => a + GH + g.items.length * RH, 0)));
      // Same order as the page: headline, what it means, the three numbers, exits, then every ball.
      // The headline and its detail stay clear of the dog on the right. The card is also the link preview, shrunk to
      // about half into 1200×630, so the headline and the three numbers are drawn big enough to read there.
      const lines = (s0, font, w) => { m.font = font; return wrap(m, s0, w); };
      const head = lastSum.v ? verdictHead(lastSum.v) : $("#vHead").textContent, detail = lastSum.v ? verdictText(lastSum.v) : $("#vText").textContent;
      const hLines = head ? lines(head, `700 60px ${F}`, W - P * 2 - 250) : [];
      const dLines = detail ? lines(detail, `400 28px ${F}`, W - P * 2 - 250) : [];
      const hTop = T + 58, dTop = hTop + (hLines.length - 1) * 70 + 56, sTop = Math.max(dTop + dLines.length * 40 + 14, T + 170), SH = 144;
      const exits = exitsFor(kit.show).slice(0, 3), eTop = sTop + SH + 46, top = eTop + exits.length * 40 - 18;
      L = { groups, cols, NC, RH, GH, oneH, hLines, dLines, hTop, dTop, sTop, SH, exits, eTop, top };
      return top + colH + 30 + 70;
    };
    const draw = async (x, kit) => {
      const { W, P, F, M, v, clip, fit } = kit, { cols, NC, RH, GH, oneH, hLines, dLines, hTop, dTop, sTop, SH, exits, eTop, top } = L;
      const C = { bg: v("bg"), panel: v("panel"), line: v("line"), fg: v("fg"), muted: v("muted"), c0: v("t0"), c1: v("t1"), c2: v("t2"), c3: v("t3"), c4: v("t4"), c5: v("t5"), cx: v("muted"), gold: v("ink"), warn: v("warn") };
      try { x.drawImage(await img("/assets/shiba-run.svg"), 150, 20, 700, 420, W - P - 220, kit.top, 220, 132); } catch (e) {}
      x.textBaseline = "alphabetic";
      x.fillStyle = C.fg; x.font = `700 60px ${F}`; hLines.forEach((l, i) => x.fillText(l, P, hTop + i * 70));
      x.fillStyle = C.muted; x.font = `400 28px ${F}`; dLines.forEach((l, i) => x.fillText(l, P, dTop + i * 40));
      // the three numbers
      const s = lastSum, v0 = s.v, cw3 = (W - P * 2 - 2 * 16) / 3;
      const cells = v0 ? [[t("seg_local"), v0.local, ""], [t("seg_global"), v0.global, ""], [t("med"), { md: s.md }, t("back", { ok: s.ok, n: s.n })]].map(([label, sg, sub]) => {
        const md = sg ? sg.md : null, [tk, k] = tierOf(md);
        return { label, num: md != null ? fmt(md) : "✕", ms: md != null, k, sub: sub || (md != null ? t("tier_" + tk) : t("tier_lost")) };
      }) : [...document.querySelectorAll("#sum .stat")].map(el => {          // group and service pages: their stats as shown
        const b = el.querySelector("b");
        return { label: el.querySelector("em").textContent, num: b.firstChild ? b.firstChild.textContent : "–", ms: !!b.querySelector("small"), k: C[b.className] ? b.className : "fg", sub: el.querySelector("i").textContent };
      });
      cells.forEach((cl, i) => {
        const cx0 = P + i * (cw3 + 16);
        x.fillStyle = C.panel === C.bg ? C.line + "55" : C.panel; roundRect(x, cx0, sTop, cw3, SH, 14); x.fill();
        x.fillStyle = C.muted; x.font = `400 24px ${F}`; x.fillText(cl.label, cx0 + 22, sTop + 40);
        x.fillStyle = C[cl.k]; x.font = `600 70px ${M}`; x.fillText(cl.num, cx0 + 22, sTop + 116);
        const nw = x.measureText(cl.num).width;
        // the line after the number: a smaller font first, then two lines, never "…" (kit.fit)
        const sub = (cl.ms ? "ms  " : "") + cl.sub, sw = cw3 - 54 - nw;
        x.fillStyle = C.muted; fit(x, sub, sw, 24, 16, 400);
        if (x.measureText(sub).width <= sw) x.fillText(sub, cx0 + 22 + nw + 10, sTop + 116);
        else wrap(x, sub, sw).slice(0, 2).forEach((l, j, a) => x.fillText(l, cx0 + 22 + nw + 10, sTop + 116 - (a.length - 1 - j) * 20));
      });
      // exits, without IPs
      let y = eTop;
      for (const g of exits) {
        const k = t(g.proxy ? "k_proxy" : "k_local");
        x.font = `600 18px ${F}`; const kw = x.measureText(k).width + 20;
        x.fillStyle = (g.proxy ? C.warn : C.c1) + "30"; roundRect(x, P, y - 22, kw, 30, 7); x.fill();
        x.fillStyle = g.proxy ? C.warn : C.c1; x.fillText(k, P + 10, y);
        let xx = P + kw + 12;
        if (g.cc) { try { const f = await img(`/flags/${flagCode(g.cc)}.svg`); x.drawImage(f, xx, y - 19, 32, 24); xx += 42; } catch (e) {} }
        // the place in full (smaller if it must be), then the network: by its number alone if the name doesn't fit
        const w = whereOf(g) || "?"; x.fillStyle = C.fg; fit(x, w, W - P - xx, 22, 16, 600); x.fillText(w, xx, y);
        xx += x.measureText(w).width + 14;
        const net = [g.org, g.asn && "AS" + g.asn].filter(Boolean).join(" · "), room = W - P - xx;
        x.fillStyle = C.muted; x.font = `400 20px ${F}`;
        if (x.measureText(net).width <= room) x.fillText(net, xx, y); else if (g.asn) x.fillText(clip(x, "AS" + g.asn, room), xx, y);
        y += 40;
      }
      // the field: a single service's samples on one lane, the median the big ball
      if (ONE) {
        const r = R.get(ONE.id), ok = r ? r.s.filter(v => v != null) : [], md = median(ok), [, k] = tierOf(md), l0 = P + 200, l1 = W - P - 90, cy = top + 40;
        x.fillStyle = C.fg; fit(x, ONE.name, 188, 22, 16, 600); x.fillText(clip(x, ONE.name, 188), P, cy + 8);
        x.fillStyle = C.line; x.fillRect(l0, cy - 2, l1 - l0, 4);
        for (const v of ok) { x.beginPath(); x.arc(l0 + (l1 - l0) * pos(v), cy, 7, 0, Math.PI * 2); x.fillStyle = C[tierOf(v)[1]] + "88"; x.fill(); }
        if (md != null) { x.beginPath(); x.arc(l0 + (l1 - l0) * pos(md), cy, 12, 0, Math.PI * 2); x.fillStyle = C[k]; x.fill(); }
        x.fillStyle = md == null ? C.muted : C[k]; x.font = `600 24px ${M}`; x.textAlign = "right"; x.fillText(md == null ? "✕" : fmt(md), W - P, cy + 8); x.textAlign = "left";
      }
      const cw = (W - P * 2 - 40 * (NC - 1)) / NC, laneX = NC === 1 ? 200 : 136, msW = 60;
      cols.forEach((col, i) => {
        let yy = top + oneH + 20; const x0 = P + i * (cw + 40);
        for (const g of col) {
          x.fillStyle = C.muted; x.font = `600 15px ${F}`; x.fillText(g.name.toUpperCase(), x0, yy + 22); yy += GH;   // the title sits clear of the row above
          for (const sv of g.items) {
            const md = median(R.get(sv.id).s), [, k] = tierOf(md), l0 = x0 + laneX, l1 = x0 + cw - msW - 10, cy = yy + 6;
            x.fillStyle = C.fg; x.font = `400 18px ${F}`; x.fillText(clip(x, sv.short || sv.name, laneX - 12), x0, yy + 12);
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
    };
    return { height, draw };
  }
  function roundRect(x, l, t0, w, h, r) { x.beginPath(); x.moveTo(l + r, t0); x.arcTo(l + w, t0, l + w, t0 + h, r); x.arcTo(l + w, t0 + h, l, t0 + h, r); x.arcTo(l, t0 + h, l, t0, r); x.arcTo(l, t0, l + w, t0, r); x.closePath(); }
  // lines that fit width w: break at spaces, or anywhere in CJK text
  function wrap(x, s, w) {
    const out = []; let line = "";
    for (const tok of s.match(/[　-鿿가-힯＀-￯]|[^\s　-鿿가-힯＀-￯]+\s*|\s+/g) || []) {
      if (line && x.measureText(line + tok).width > w) { out.push(line.trimEnd()); line = tok.trimStart(); } else line += tok;
    }
    if (line.trim()) out.push(line.trimEnd());
    return out;
  }

  /* ---------- a shared result ---------- */
  // Opening a shared link shows that result and doesn't test until the visitor asks for their own. The banner above
  // it is the shared one (/assets/share/share.js: received); the visitor's own test, once done, offers the comparison
  // of the two in that banner (compare mode below)
  const SHARED = parseShare(RLINK ? RLINK[1] : location.hash, PACKS);
  let RCV = null;
  async function showShared(S) {
    if (!ONE && !GRP && S.pack !== pack) showPack(S.pack);
    NET.groups = S.groups; NET.done = true; renderExits(); $("#eye").hidden = true;
    for (const s of allServices()) if (s.id in S.res) { R.set(s.id, { w: null, s: S.res[s.id] == null ? [] : [S.res[s.id]], st: "done" }); paintRow(s); }
    summarize(false);
    const { received } = await import("/assets/share/share.js?v=7");
    RCV = received({ lang: LANG, ts: S.ts, at: $(".hero"), test: () => { VS = encodeShare(SHARED); leaveShared(); start(3); } });
  }
  let sharedOn = false;
  function leaveShared() {
    if (!sharedOn) return;
    sharedOn = false; $("#shared").hidden = true; $("#eye").hidden = false;
    history.replaceState(null, "", PAGE + location.search);
    NET.groups = []; NET.seen = []; NET.geo = {}; NET.done = false; NET.hidden = null; renderExits();
    checkExits().catch(() => {});
  }
  $("#testMine").onclick = () => { leaveCompare(); leaveShared(); start(3); };

  /* ---------- compare mode: two results side by side (/c/<a>/<b>) ---------- */
  // The view, each row's change and the headline are the shared compare mode (/assets/share/compare.js, from
  // 1ms-shell; the Worker writes the preview title with the same words); this page gives it the rows (src/lib.mjs:
  // diffShares). The second result comes from this browser's own earlier run, or from testing right after opening
  // someone else's result. Links carry what the share box allows (city and network only when ticked).
  let HIST = ONE || GRP ? [] : parseHist(store.get(K.hist)), VS = null;
  const cmpBtn = $("#cmpBtn");
  const bareCode = c => { const S = parseShare(c, PACKS); return S ? encodeShare(bare(S)) : c; };
  const cmpLink = (a, b) => PAGE + "c/" + a + "/" + b;
  // each finished home run is kept in this browser (newest first): the newest and the one before it can be compared
  function saveRun() {
    if (ONE || GRP || CHECK || sharedOn || !lastSum) return;
    const code = resultCode(true);
    HIST = addHist(HIST, code); store.set(K.hist, JSON.stringify(HIST));
    if (VS) { const a = VS; VS = null; if (RCV) RCV.done(cmpLink(a, bareCode(code))); }   // after testing beside a shared result
    paintCmpBtn();
  }
  function paintCmpBtn() {
    if (!cmpBtn) return;
    cmpBtn.disabled = !!RUN || sharedOn || HIST.length < 2;
    cmpBtn.title = t(HIST.length < 2 ? "cmp_none" : "cmp");
  }
  if (cmpBtn) cmpBtn.onclick = () => { if (HIST.length >= 2) location.href = cmpLink(bareCode(HIST[1]), bareCode(HIST[0])); };

  const CMPS = CLINK && !CHECK && $("#cmpBox") ? [parseShare(CLINK[1], PACKS), parseShare(CLINK[2], PACKS)] : null;
  let cmpOn = false, CV = null, CS = null;
  const names = Object.fromEntries([...SVC.list, ...Object.values(PACKS).flat()].map(s => [s.id, s.name]));
  // the same input the Worker gives it (src/worker.js compareView)
  const cmpView = compare => {
    const side = S => ({ ts: S.ts, sub: show => exitsText(show ? S.groups : bare(S).groups, country, t) });
    const d = diffShares(CS[0], CS[1], { names, services: SVC.list, packs: PACKS, cats: SVC.cats, uses: SVC.uses, label: t });
    return compare({ lang: LANG, a: side(CS[0]), b: side(CS[1]), ...d, words: "speed" });
  };
  async function showCompare() {
    cmpOn = true;
    // a side that is this visitor's own result has its city and network in this browser: shown here, and the share
    // box can add them to the link
    CS = CMPS.map(S => ownOf(HIST, S, PACKS) || S);
    const { compare } = await import("/assets/share/compare.js?v=7");
    CV = cmpView(compare);
    if ($("#cmpHead")) CV.renderHead($("#cmpHead"));          // in the visitor's time zone, with their own side's city
    await CV.render($("#cmpView"));
  }
  // the head and the share button are in the banner only on a compare page: the Worker puts them there (src/worker.js)
  if ($("#cmpShare")) $("#cmpShare").onclick = async () => {
    if (!CV) return;
    const { share } = await import("/assets/share/share.js?v=7");
    const code = (S, show) => encodeShare(show ? S : bare(S));
    share({
      lang: LANG, name: $("h1").textContent, file: "1ms-dog-compare",
      show: ["city", "isp"], never: ["ip", "colo"], canShow: CS.some(S => S.groups.some(g => g.city || g.org || g.asn)),
      link: show => location.origin + cmpLink(code(CS[0], show), code(CS[1], show)),
      home: location.origin + PAGE, text: () => CV.text, height: CV.height, draw: CV.draw,
      foot: () => [t("cmp_h")], ts: CS[1].ts,
    }).open();
  };
  // back to the test: the page as it is without a compare link
  function leaveCompare() {
    if (!cmpOn && !document.documentElement.classList.contains("cmp")) return;
    cmpOn = false; document.documentElement.classList.remove("cmp");
    if (CLINK) history.replaceState(null, "", PAGE + location.search);
    if (!NET.done && !NET.prog) checkExits().catch(() => {});
  }

  /* ---------- run on open, or wait for a click (the choice is remembered in this browser) ---------- */
  const autoBox = $("#auto");
  // home tests 40+ services at once, so it waits for a click unless the visitor turned auto-run on; a service or group page is a few requests and runs unless turned off
  autoBox.checked = ONE || GRP ? store.get(K.auto) !== "0" : store.get(K.auto) === "1";
  autoBox.onchange = () => store.set(K.auto, autoBox.checked ? "1" : "0");
  // with the switch off, the exit check still runs (a few small requests); the 40-service test waits for "Start"
  function waitForClick() {
    if (RUN || lastSum) return;
    $("#vHead").textContent = t("vh_manual"); $("#vText").textContent = ONE ? t("v_one_wait", { s: ONE.name }) : GRP ? t("v_grp_wait", { g: GRP.name }) : t("v_manual");
    setMood("idle"); say("mood_idle");
  }

  /* ---------- Connection Checkup: the result, for the report (fields and facts: 1ms-shell docs/checkup.md) ---------- */
  let EXITS = Promise.resolve();
  const KEY_MS = ["google", "youtube", "netflix", "chatgpt", "claude", "gemini", "github", "telegram", "discord", "steam", "cloudflare"];
  function checkupResult() {
    const v = lastSum.v, r1 = x => x == null ? null : Math.round(x * 10) / 10, ms = x => x != null ? fmt(x) + " ms" : "✕";
    const done = allServices().filter(s => R.get(s.id) && R.get(s.id).st === "done"), med = s => median(R.get(s.id).s);
    // what didn't answer first, then the everyday uses that are blocked or slow, then the ones that are fine
    const findings = [...(v.lost.length ? [{ level: "bad", text: t("v_fail", { list: v.lost.slice(0, 4).join(t("v_join")) + (v.lost.length > 4 ? "…" : "") }) }] : []),
      ...v.uses.filter(u => u.st === "blocked").map(u => ({ level: "bad", text: t("use_" + u.k) + " · " + t("st_" + u.st) })),
      ...v.uses.filter(u => u.st === "slow").map(u => ({ level: "warn", text: t("use_" + u.k) + " · " + t("st_" + u.st) })),
      ...v.uses.filter(u => u.st === "great" || u.st === "ok").map(u => ({ level: "ok", text: t("use_" + u.k) + " · " + t("st_" + u.st) }))].slice(0, 4);
    post({ type: "result", lang: LANG, path: PAGE + "r/" + resultCode(false), grade: null, score: null, headline: verdictHead(v),
      stats: [{ label: t("seg_local"), value: ms(v.local.md) }, { label: t("seg_global"), value: ms(v.global.md) },
        { label: t("med"), value: ms(lastSum.md) }, { label: t("e_back"), value: lastSum.ok + "/" + lastSum.n }],
      findings,
      facts: { median: r1(lastSum.md), localMedian: r1(v.local.md), globalMedian: r1(v.global.md),
        unreachable: done.filter(s => med(s) == null).map(s => s.id),
        ms: Object.fromEntries(KEY_MS.map(id => done.find(s => s.id === id)).filter(Boolean).map(s => [s.id, r1(med(s))])) } });
  }
  // the report sizes the frame to the content
  if (CHECK && window.ResizeObserver) {
    let last = 0;
    new ResizeObserver(() => { const h = Math.ceil($(".app").getBoundingClientRect().height); if (h !== last) post({ type: "size", height: last = h }); }).observe($(".app"));
  }

  /* ---------- go ---------- */
  setMood("sniff");
  paintCmpBtn();
  if (CMPS && CMPS[0] && CMPS[1]) showCompare();
  else if (SHARED && !CHECK) { leaveCompare(); sharedOn = true; showShared(SHARED).catch(() => {}); }
  else {
    leaveCompare();                                           // a compare link that doesn't read: the plain page
    const exitP = EXITS = checkExits().catch(() => {});
    // the exits pick the local pack; give them a moment, then the dog starts fetching either way (the checkup always runs)
    if (autoBox.checked || CHECK) Promise.race([exitP, sleep(1500)]).then(() => start(3));
    else exitP.then(waitForClick);
  }
})();
