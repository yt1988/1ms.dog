// The status page (/status/, /<lang>/status/): fills the table the build wrote with the Tokyo baseline from
// /baseline.json (the Worker's copy of what 1ms.dog's server in Tokyo measures every hour). The page's own
// strings, language and scale are in its #st JSON; the build inlines src/lib.mjs at the marker.
(() => {
  /* @lib */
  const $ = s => document.querySelector(s), ST = JSON.parse($("#st").textContent);
  const t = (k, v) => v ? fillIn(ST.L[k] ?? k, v, ST.L.josa_fin) : ST.L[k] ?? k;
  const $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  // the header, as on the home page (src/app.js): theme and language synced across the 1ms.dog tools, the help dialog
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  const thBtn = $("#theme"), TH = ["system", "light", "dark"];
  const applyTheme = th => {
    if (th === "light" || th === "dark") document.documentElement.setAttribute("data-theme", th); else document.documentElement.removeAttribute("data-theme");
    thBtn.dataset.th = th; thBtn.title = t("th_" + th); thBtn.setAttribute("aria-label", t("th_" + th));
  };
  applyTheme(TH.includes(store.get("1ms:theme")) ? store.get("1ms:theme") : "system");
  thBtn.onclick = () => { const n = TH[(TH.indexOf(thBtn.dataset.th) + 1) % 3]; store.set("1ms:theme", n); applyTheme(n); };
  $("#lang").onchange = e => { const l = e.target.value; store.set("1ms:lang", l); location.href = ST.paths[l]; };
  const closeDlg = () => { $("#help").hidden = true; document.documentElement.style.overflow = ""; };
  $$("[data-close]").forEach(b => { b.onclick = closeDlg; });
  $("#help").addEventListener("click", e => { if (e.target === $("#help")) closeDlg(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeDlg(); });
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
  $("#helpBtn").onclick = () => { showHelp(helpIdx); $("#help").hidden = false; document.documentElement.style.overflow = "hidden"; $("#help [data-close]").focus(); };
  $$("#helpNav [data-hq]").forEach(b => { b.onclick = () => showHelp(+b.dataset.hq); });
  $("#helpSel").onchange = e => showHelp(+e.target.value);
  $$("[data-hstep]").forEach(b => { b.onclick = () => showHelp(helpIdx + +b.dataset.hstep); });
  const when = s => new Intl.DateTimeFormat(ST.lang, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(s));
  const clock = s => new Intl.DateTimeFormat(ST.lang, { hour: "2-digit", minute: "2-digit" }).format(new Date(s));
  // an outage: one time when it was one check, the end as a time of day when it ended the same day
  const span = (a, b) => a === b ? [when(a), ""] : [when(a), new Date(a).toDateString() === new Date(b).toDateString() ? clock(b) : when(b)];
  const pct = v => v == null ? "–" : (v >= 99.95 ? "100" : v.toFixed(1)) + "%";
  const upCls = v => v == null ? "cx" : v >= 99.5 ? "c1" : v >= 95 ? "c3" : "c5";
  // 24 hourly medians as a line, a gap where an hour had no answer. Each line is scaled to its own range (at least
  // 10 ms or a fifth of its median tall), so a steady service is a flat line and a jump stands out.
  function spark(h) {
    const v = h.filter(x => x != null), lo = Math.min(...v), md = median(v) || 0, span = Math.max(Math.max(...v) - lo, 10, md / 5);
    const W = 96, H = 20, pts = h.map((x, i) => x == null ? null : [(i / (h.length - 1)) * W, H - 2 - ((x - lo) / span) * (H - 4)]);
    let d = "", pen = false;
    for (const p of pts) { if (!p) { pen = false; continue; } d += (pen ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); pen = true; }
    const last = [...pts].reverse().find(Boolean);
    // a faint dotted base under it, so the column reads as a chart before a day of hours has filled it
    return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true"><line class="bl" x1="0" y1="${H - 1}" x2="${W}" y2="${H - 1}"/><path d="${d}"/>${last ? `<circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="2"/>` : ""}</svg>`;
  }

  fetch("/baseline.json").then(r => r.json()).then(j => {
    const S = j.services || {};
    if (!j.at || !Object.keys(S).length) throw new Error("empty");
    const old = Date.now() - Date.parse(j.at) > 3 * (j.every || 600) * 1000;
    $("#stMeta").textContent = old ? t("ss_stale", { t: when(j.at) }) : t("ss_updated", { t: when(j.at) });
    $("#stMeta").classList.toggle("warn", old);
    const outs = [];
    for (const tr of document.querySelectorAll("#stTable tr[data-id]")) {
      const b = S[tr.dataset.id];
      if (!b) continue;
      const now = b.last && !b.last.err ? b.last.ms : null, [, cls] = tierOf(now);
      const c = tr.querySelector(".now");
      c.innerHTML = now != null ? `${fmt(now)}<small>ms</small>` : "✕";
      c.className = "now " + cls;
      if (now == null) c.title = t("ss_down", { err: b.last ? b.last.err : "?" });
      tr.querySelector(".sp").innerHTML = spark(b.h24 || []);
      const u24 = tr.querySelector(".u24"), u7 = tr.querySelector(".u7");
      u24.textContent = pct(b.up24); u24.className = "u24 " + upCls(b.up24);
      u7.textContent = pct(b.up7); u7.className = "u7 " + upCls(b.up7);
      for (const o of b.out || []) outs.push({ ...o, s: b.name });
    }
    outs.sort((a, b) => b.to - a.to);
    $("#stOut").innerHTML = outs.length
      ? outs.slice(0, 30).map(o => { const [f, e] = span(o.from * 1000, o.to * 1000);
          return `<li>${esc(t("ss_outrow", { s: o.s, from: f, to: e, err: o.err || "?" }).replace(/ – (?=（)/, "").replace(/ – (?=\()/, " "))}</li>`; }).join("")
      : `<li class="none">${esc(t("ss_none"))}</li>`;
  }).catch(() => { $("#stMeta").textContent = t("ss_err"); $("#stMeta").classList.add("warn"); });
})();
