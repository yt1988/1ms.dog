// 1ms.dog home: finds every exit the visitor's traffic leaves from (local and proxy), then times HTTPS round trips to
// the services in src/services.mjs, all from the browser. Nothing is sent to 1ms.dog. The build prepends `const SVC`.
(function () {
  "use strict";
  const $ = s => document.querySelector(s);
  const D = JSON.parse($("#data").textContent);
  const L = window.L1MS || {}, LANG = D.lang;                  // strings: /assets/l.<lang>.<hash>.js, loaded first
  const t = (k, v) => v ? fillIn(L[k] ?? k, v, L.josa_fin) : L[k] ?? k;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  const K = { theme: "1ms:theme", lang: "1ms:lang", pack: "1ms:pack", mask: "1ms:mask", auto: "1ms:auto" };
  const country = cc => { try { return new Intl.DisplayNames([LANG], { type: "region" }).of(cc); } catch (e) { return cc; } };
  const flag = cc => /^[A-Z]{2}$/.test(cc || "") ? `<img class="flag" src="/flags/${cc.toLowerCase()}.svg" alt="" width="20" height="15">` : "";
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
  $("#lang").onchange = e => { const l = e.target.value; store.set(K.lang, l); location.href = D.paths[l] + location.hash; };

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
  // each exit address links to its quality check on IPQS (same 1ms.dog site; it opens in the saved language)
  const ipLink = ip => `<a class="q" href="https://ipqs.1ms.dog/?ip=${encodeURIComponent(ip)}" target="_blank" rel="noopener" title="${esc(t("ipqs_t"))}">${esc(ip)}</a>`;
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
      const org = g.org ? esc(g.org) + (g.asn ? " · AS" + g.asn : "") : "";
      // which checks saw this exit: a small "!" after the network, hovering (or focusing) it shows the list
      const by = g.by.length ? `<span class="src" tabindex="0" role="img" aria-label="${esc(t("seen_by", { list: g.by.join(", ") }))}">!</span>` : "";
      return `<li class="ex"><span class="kind ${g.proxy ? "proxy" : "local"}">${esc(t(g.proxy ? "k_proxy" : "k_local"))}</span>` +
        `<span class="where">${flag(g.cc)}<b>${esc(where || "?")}</b>${org ? `<span class="m">${org}</span>` : ""}${by}</span>` +
        `<span class="ips">${ips}</span></li>`;
    }).join("");
    ul.querySelectorAll(".src").forEach(tip);
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
    const worker = async () => { while (q.length && !ctl.signal.aborted) { const s = q.shift(); await runOne(s, SUBS.includes(s) ? GRP_N : n, ctl.signal); run.d++; progress(run); } };
    await Promise.all(Array.from({ length: CONC }, worker));
    if (RUN !== run) return;
    RUN = null; LAST_DONE = true; setBusy(false); progress(null);
    summarize(!ctl.signal.aborted);
  }
  function progress(run) {
    $("#prog i").style.width = run && !ONE ? (100 * run.d / run.n).toFixed(1) + "%" : "0";
    if (!run || ONE) return;
    $("#vHead").textContent = t("running", { d: run.d, n: run.n });
    paintStats();                                             // the three numbers move while the balls come back
  }
  function setBusy(b) { $("#run span").textContent = t(b ? "stop" : "run"); if ($("#deep")) $("#deep").disabled = b; }
  let lastSum = null;
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
    lastSum = { md: all.md, ok: all.ok, n: all.n, tier: tierOf(all.md)[0], mood: v.mood, v };
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
    lastSum = { md: sg.md, ok: sg.ok, n: sg.n, tier: tk, mood };
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
    lastSum = { md, ok: ok.length ? 1 : 0, n: 1, tier: tk, mood };
    setMood(mood); say("mood_" + mood);
    $("#prog i").style.width = "0";
  }

  /* ---------- controls ---------- */
  const start = n => { if (ONE) n = ONE_N; if (GRP) n = GRP_N; for (const s of allServices()) { R.delete(s.id); paintRow(s); } lastSum = null; renderVerdict(null); paintStats(); runList(allServices(), n, true); };
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
  $$("#helpNav [data-hq]").forEach(b => { b.onclick = () => showHelp(+b.dataset.hq); });
  $("#helpSel").onchange = e => showHelp(+e.target.value);
  $$("[data-hstep]").forEach(b => { b.onclick = () => showHelp(helpIdx + +b.dataset.hstep); });

  /* ---------- share: a link that carries the result, and an image drawn here ---------- */
  // the link carries no IP addresses (format and parsing: src/lib.mjs)
  const shareHash = () => encodeShare({ ts: Date.now(), pack, groups: NET.groups,
    res: Object.fromEntries(allServices().filter(s => R.get(s.id) && R.get(s.id).st === "done").map(s => [s.id, median(R.get(s.id).s)])) });
  const parseHash = h => parseShare(h, PACKS);
  let shortFor = null;
  async function shortLink(long) {
    const meta = document.querySelector('meta[name="shortener"]');          // present on 1ms.dog; absent when self-hosted
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
  if ($("#share")) $("#share").title = t("share");
  if ($("#share")) $("#share").onclick = async () => {
    if (!lastSum) return;
    const long = location.origin + location.pathname + shareHash();
    $("#shareUrl").value = long; $("#shareImg").removeAttribute("src");
    $("#nativeShare").hidden = !navigator.share;
    openDlg("shareDlg");
    shareBlob = null;
    loadQR().catch(() => {});
    const url = await shortLink(long);
    $("#shareUrl").value = url;
    // the QR code carries the short link; without one, a long result link would make it too dense to scan, so it points at the page
    drawCard(url.length <= 300 ? url : location.origin + location.pathname)
      .then(c => { $("#shareImg").src = c.toDataURL("image/png"); c.toBlob(b => { shareBlob = b; }, "image/png"); }).catch(() => {});
  };
  let qrP = null;
  const loadQR = () => qrP ||= new Promise((res, rej) => {
    const el = document.createElement("script"); el.src = QR_JS;
    el.onload = () => res(self.QR1MS); el.onerror = () => { qrP = null; rej(); };
    document.head.appendChild(el);
  });
  const flash = (btn, k) => { const o = btn.textContent; btn.textContent = t(k); setTimeout(() => { btn.textContent = o; }, 1500); };
  $("#copyLink").onclick = async e => { try { await navigator.clipboard.writeText($("#shareUrl").value); flash(e.target, "copied"); } catch (x) { $("#shareUrl").select(); } };
  $("#copyImg").onclick = async e => { try { await navigator.clipboard.write([new ClipboardItem({ "image/png": shareBlob })]); flash(e.target, "copied"); } catch (x) {} };
  $("#dlImg").onclick = () => { const a = document.createElement("a"); a.href = $("#shareImg").src; a.download = "1ms-dog.png"; a.click(); };
  $("#nativeShare").onclick = async () => {
    const s = lastSum, text = t("share_text", { ok: s.ok, n: s.n, where: whereOf(NET.groups[0]) || "?", ms: s.md != null ? fmt(s.md) : "–", tier: t("tier_" + s.tier) });
    const file = shareBlob && new File([shareBlob], "1ms-dog.png", { type: "image/png" });
    try { await navigator.share(file && navigator.canShare && navigator.canShare({ files: [file] }) ? { text, url: $("#shareUrl").value, files: [file] } : { text, url: $("#shareUrl").value }); } catch (e) {}
  };

  // The card: the same picture as the page (dog, headline, the three numbers, exits, every ball at its distance), in
  // the page's theme, with a QR code for the link. A group page draws its one group full width, a single service its samples.
  const img = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  async function drawCard(link) {
    const W = 1200, P = 56, list = allServices().filter(s => R.get(s.id) && R.get(s.id).st === "done");
    const groups = (ONE ? (SUBS.length ? [{ name: t("sub_" + ONE.id), items: SUBS }] : []) : GRP ? [{ name: GRP.name, items: GRP.list }] : [{ name: t("cat_local"), items: PACKS[pack] }, ...SVC.cats.map(c => ({ name: t("cat_" + c), items: SVC.list.filter(s => s.cat === c) }))])
      .map(g => ({ name: g.name, items: g.items.filter(s => list.includes(s)) })).filter(g => g.items.length);
    // three columns (one on a group page), filled in order, about equally tall
    const NC = GRP || ONE ? 1 : 3, RH = 30, GH = 40, total = groups.reduce((a, g) => a + GH + g.items.length * RH, 0), cols = Array.from({ length: NC }, () => []);
    let ci = 0, hcol = 0;
    for (const g of groups) { const h = GH + g.items.length * RH; if (hcol && hcol + h / 2 > total / NC && ci < NC - 1) { ci++; hcol = 0; } cols[ci].push(g); hcol += h; }
    const oneH = ONE ? 80 : 0, colH = oneH + Math.max(0, ...cols.map(c => c.reduce((a, g) => a + GH + g.items.length * RH, 0)));
    const qr = link && await loadQR().then(Q => { const q = Q(0, "M"); q.addData(link); q.make(); return q; }).catch(() => null), FH = qr ? 160 : 70;
    const F = "Geist, 'PingFang SC', 'Microsoft YaHei', 'Hiragino Sans', 'Malgun Gothic', sans-serif", M = "'Geist Mono', Consolas, monospace";
    // Same order as the page: headline, what it means, the three numbers, exits, then every ball.
    // Text is wrapped before the canvas size is known; the headline stays clear of the dog.
    const m = document.createElement("canvas").getContext("2d");
    const lines = (s0, font, w) => { m.font = font; return wrap(m, s0, w); };
    // the headline and its detail: the home page's verdict, or what a group or service page says
    const head = lastSum.v ? verdictHead(lastSum.v) : $("#vHead").textContent, detail = lastSum.v ? verdictText(lastSum.v) : $("#vText").textContent;
    const hLines = head ? lines(head, `700 44px ${F}`, W - P * 2 - 360) : [];
    const dLines = detail ? lines(detail, `400 24px ${F}`, W - P * 2) : [];
    const hTop = 190, dTop = hTop + (hLines.length - 1) * 54 + 48, sTop = dTop + dLines.length * 34 + 10, SH = 108;
    const exits = NET.groups.slice(0, 3), eTop = sTop + SH + 46, top = eTop + exits.length * 40 - 18, H = top + colH + 40 + FH;
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const x = c.getContext("2d");
    // the page's own theme colors, so the card matches what the visitor sees (light or dark)
    const css = getComputedStyle(document.documentElement), v = n => css.getPropertyValue("--" + n).trim();
    const dark = css.colorScheme === "dark";
    const C = { bg: v("bg"), panel: v("panel"), line: v("line"), fg: v("fg"), muted: v("muted"), c0: v("t0"), c1: v("t1"), c2: v("t2"), c3: v("t3"), c4: v("t4"), c5: v("t5"), cx: v("muted"), gold: v("ink"), warn: v("warn") };
    x.fillStyle = C.bg; x.fillRect(0, 0, W, H);
    const [logo, dog] = await Promise.all([img(dark ? "/assets/logo-dark.svg" : "/assets/logo-light.svg"), img("/assets/shiba-run.svg")]);
    x.drawImage(logo, P, 44, 150, 60);
    x.drawImage(dog, 150, 20, 700, 420, W - P - 330, 24, 330, 198);
    x.textBaseline = "alphabetic";
    x.fillStyle = C.fg; x.font = `700 44px ${F}`; hLines.forEach((l, i) => x.fillText(l, P, hTop + i * 54));
    x.fillStyle = C.muted; x.font = `400 24px ${F}`; dLines.forEach((l, i) => x.fillText(l, P, dTop + i * 34));
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
      x.fillStyle = C.muted; x.font = `400 20px ${F}`; x.fillText(cl.label, cx0 + 20, sTop + 34);
      x.fillStyle = C[cl.k]; x.font = `600 46px ${M}`; x.fillText(cl.num, cx0 + 20, sTop + 86);
      const nw = x.measureText(cl.num).width;
      x.fillStyle = C.muted; x.font = `400 20px ${F}`;
      x.fillText(clip(x, (cl.ms ? "ms  " : "") + cl.sub, cw3 - 50 - nw), cx0 + 20 + nw + 10, sTop + 86);
    });
    // exits, without IPs
    let y = eTop;
    for (const g of exits) {
      const k = t(g.proxy ? "k_proxy" : "k_local");
      x.font = `600 18px ${F}`; const kw = x.measureText(k).width + 20;
      x.fillStyle = (g.proxy ? C.warn : C.c1) + "30"; roundRect(x, P, y - 22, kw, 30, 7); x.fill();
      x.fillStyle = g.proxy ? C.warn : C.c1; x.fillText(k, P + 10, y);
      let xx = P + kw + 12;
      if (g.cc) { try { const f = await img(`/flags/${g.cc.toLowerCase()}.svg`); x.drawImage(f, xx, y - 19, 32, 24); xx += 42; } catch (e) {} }
      x.fillStyle = C.fg; x.font = `600 22px ${F}`; const w = whereOf(g) || "?"; x.fillText(w, xx, y);
      xx += x.measureText(w).width + 14;
      x.fillStyle = C.muted; x.font = `400 20px ${F}`; x.fillText(g.org + (g.asn ? " · AS" + g.asn : ""), xx, y);
      y += 40;
    }
    // the field: a single service's samples on one lane, the median the big ball
    if (ONE) {
      const r = R.get(ONE.id), ok = r ? r.s.filter(v => v != null) : [], md = median(ok), [, k] = tierOf(md), l0 = P + 200, l1 = W - P - 90, cy = top + 40;
      x.fillStyle = C.fg; x.font = `600 22px ${F}`; x.fillText(clip(x, ONE.name, 180), P, cy + 8);
      x.fillStyle = C.line; x.fillRect(l0, cy - 2, l1 - l0, 4);
      for (const v of ok) { x.beginPath(); x.arc(l0 + (l1 - l0) * pos(v), cy, 7, 0, Math.PI * 2); x.fillStyle = C[tierOf(v)[1]] + "88"; x.fill(); }
      if (md != null) { x.beginPath(); x.arc(l0 + (l1 - l0) * pos(md), cy, 12, 0, Math.PI * 2); x.fillStyle = C[k]; x.fill(); }
      x.fillStyle = md == null ? C.muted : C[k]; x.font = `600 24px ${M}`; x.textAlign = "right"; x.fillText(md == null ? "✕" : fmt(md), W - P, cy + 8); x.textAlign = "left";
    }
    const cw = (W - P * 2 - 40 * (NC - 1)) / NC, laneX = NC === 1 ? 200 : 128, msW = 60;
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
    x.fillStyle = C.line; x.fillRect(P, H - FH, W - P * 2, 1);
    const when = new Date(SHARED ? SHARED.ts : Date.now()).toLocaleString(LANG, { dateStyle: "medium", timeStyle: "short" });
    if (qr) {
      // dark modules on a white tile in either theme (scanners expect that), with a two-module quiet zone
      const n = qr.getModuleCount(), S = 116, m0 = S / (n + 4), qx = W - P - S, qy = H - FH + 22;
      x.fillStyle = "#fff"; roundRect(x, qx, qy, S, S, 10); x.fill();
      x.fillStyle = "#111";
      for (let r0 = 0; r0 < n; r0++) for (let c0 = 0; c0 < n; c0++) if (qr.isDark(r0, c0)) x.fillRect(qx + (c0 + 2) * m0, qy + (r0 + 2) * m0, m0 + 0.3, m0 + 0.3);
      x.fillStyle = C.gold; x.font = `600 28px ${M}`; x.fillText("1ms.dog", P, H - FH + 62);
      x.fillStyle = C.fg; x.font = `400 20px ${F}`; x.fillText(t("qr_hint"), P, H - FH + 98);
      x.fillStyle = C.muted; x.font = `400 18px ${F}`; x.fillText(when, P, H - FH + 130);
    } else {
      x.fillStyle = C.gold; x.font = `600 24px ${M}`; x.fillText("1ms.dog", P, H - 30);
      x.fillStyle = C.muted; x.font = `400 18px ${F}`; x.textAlign = "right"; x.fillText(when, W - P, H - 30); x.textAlign = "left";
    }
    return c;
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
  function clip(x, s, w) { if (x.measureText(s).width <= w) return s; while (s.length > 1 && x.measureText(s + "…").width > w) s = s.slice(0, -1); return s + "…"; }

  /* ---------- a shared result ---------- */
  // Opening a shared link shows that result and doesn't test until the visitor asks for their own
  const SHARED = parseHash(location.hash);
  function showShared(S) {
    if (!ONE && !GRP && S.pack !== pack) showPack(S.pack);
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

  /* ---------- go ---------- */
  setMood("sniff");
  if (SHARED) { sharedOn = true; showShared(SHARED); }
  else {
    const exitP = checkExits().catch(() => {});
    // the exits pick the local pack; give them a moment, then the dog starts fetching either way
    if (autoBox.checked) Promise.race([exitP, sleep(1500)]).then(() => start(3));
    else exitP.then(waitForClick);
  }
})();
