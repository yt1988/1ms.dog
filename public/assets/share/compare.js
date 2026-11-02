// Compare mode every 1ms.dog tool can use: two results of the same tool side by side, each row's change and whether
// it got better or worse, the one-line summary a chat preview shows, and the share card's middle for the share
// dialog (share.js). Tools copy it to /assets/share/ with the rest of the folder and load it only on a compare link
// or when the visitor compares; 1ms-shell's check compares the copies with its own. Change it there, never in a tool.
// See docs/compare.md.
//
// The tool turns its two results into rows (its `diff(a, b)`); everything else is done here. Rows only one side
// measured are counted in the summary line, not listed: the view compares what both measured.
//
//   const { compare } = await import("/assets/share/compare.js");
//   const c = compare({
//     lang: "zh-CN",
//     a: { label: "10月30日 14:00", sub: show => "日本 · 代理" },   // the two sides: a before (or theirs), b after (or mine)
//     b: { label: "11月2日 09:12", sub: "美国 · 本地" },             // sub: text, or show => text (the share box)
//     stats: [row, …],          // up to 3 key numbers, shown as cards (optional)
//     rows: [row, …],           // one per measured thing; shown biggest change first
//     words: "speed",           // "speed": faster/slower (latency, bandwidth); "plain": better/worse
//   });
//   await c.render(el);         // the view, into el (loads compare.css first)
//   share({ …, text: () => c.text, height: c.height, draw: c.draw });   // the same view on the share card
//
// row: { id, name, a, b, unit: "ms", better: "lower" | "higher", fmt: v => "12.4", tol: { abs: 10, rel: 0.15 },
//        scale: v => 0…1 (where a value sits on the row's lane; no lane without it), text: [a text, b text] }
//   a, b: the value on each side; null = measured, no answer (✕); undefined = that side didn't measure it (–).
//   A change within tol (absolute, or relative to the smaller value) counts as the same.
//
// The pure parts (judge, rank, tally, headline) touch no DOM, so a tool's Worker can import this file to write the
// preview title of a compare link with the same words the page shows.

export const VERSION = 1;

const T = {
  en: { change: "Change", same: "About the same", lost: "No answer", back: "Answers",
    faster: "{x}× faster", slower: "{x}× slower", better: "better", worse: "worse",
    n_faster: "{n} faster", n_slower: "{n} slower", n_better: "{n} better", n_worse: "{n} worse", n_same: "{n} about the same", n_none: "{n} measured on one side only",
    all_same: "About the same both times", lost_h: "{s} stopped answering", back_h: "{s} answers again", join: ", " },
  "zh-CN": { change: "变化", same: "差不多", lost: "连不上了", back: "能连上了",
    faster: "快 {x} 倍", slower: "慢 {x} 倍", better: "变好", worse: "变差",
    n_faster: "{n} 项变快", n_slower: "{n} 项变慢", n_better: "{n} 项变好", n_worse: "{n} 项变差", n_same: "{n} 项差不多", n_none: "{n} 项只有一边测了",
    all_same: "两次结果差不多", lost_h: "{s} 连不上了", back_h: "{s} 能连上了", join: "，" },
  "zh-TW": { change: "變化", same: "差不多", lost: "連不上了", back: "能連上了",
    faster: "快 {x} 倍", slower: "慢 {x} 倍", better: "變好", worse: "變差",
    n_faster: "{n} 項變快", n_slower: "{n} 項變慢", n_better: "{n} 項變好", n_worse: "{n} 項變差", n_same: "{n} 項差不多", n_none: "{n} 項只有一邊測了",
    all_same: "兩次結果差不多", lost_h: "{s} 連不上了", back_h: "{s} 能連上了", join: "，" },
  ja: { change: "変化", same: "ほぼ同じ", lost: "応答なし", back: "応答あり",
    faster: "{x} 倍速い", slower: "{x} 倍遅い", better: "改善", worse: "悪化",
    n_faster: "{n} 件速く", n_slower: "{n} 件遅く", n_better: "{n} 件改善", n_worse: "{n} 件悪化", n_same: "{n} 件ほぼ同じ", n_none: "{n} 件は片方のみ",
    all_same: "2 回ともほぼ同じ", lost_h: "{s} が応答しなくなった", back_h: "{s} が応答するようになった", join: "、" },
  ko: { change: "변화", same: "비슷함", lost: "응답 없음", back: "응답함",
    faster: "{x}배 빠름", slower: "{x}배 느림", better: "좋아짐", worse: "나빠짐",
    n_faster: "{n}개 빨라짐", n_slower: "{n}개 느려짐", n_better: "{n}개 좋아짐", n_worse: "{n}개 나빠짐", n_same: "{n}개 비슷함", n_none: "{n}개는 한쪽만 측정",
    all_same: "두 결과가 비슷함", lost_h: "{s} 응답 없음", back_h: "{s} 다시 응답", join: ", " },
  es: { change: "Cambio", same: "Casi igual", lost: "Sin respuesta", back: "Responde",
    faster: "{x}× más rápido", slower: "{x}× más lento", better: "mejor", worse: "peor",
    n_faster: "{n} más rápidos", n_slower: "{n} más lentos", n_better: "{n} mejor", n_worse: "{n} peor", n_same: "{n} casi igual", n_none: "{n} solo en un lado",
    all_same: "Casi igual las dos veces", lost_h: "{s} dejó de responder", back_h: "{s} vuelve a responder", join: ", " },
  fr: { change: "Écart", same: "Quasi identique", lost: "Plus de réponse", back: "Répond",
    faster: "{x}× plus rapide", slower: "{x}× plus lent", better: "mieux", worse: "moins bien",
    n_faster: "{n} plus rapides", n_slower: "{n} plus lents", n_better: "{n} mieux", n_worse: "{n} moins bien", n_same: "{n} quasi identiques", n_none: "{n} d’un seul côté",
    all_same: "Quasi identique les deux fois", lost_h: "{s} ne répond plus", back_h: "{s} répond de nouveau", join: ", " },
  de: { change: "Änderung", same: "Etwa gleich", lost: "Keine Antwort", back: "Antwortet",
    faster: "{x}× schneller", slower: "{x}× langsamer", better: "besser", worse: "schlechter",
    n_faster: "{n} schneller", n_slower: "{n} langsamer", n_better: "{n} besser", n_worse: "{n} schlechter", n_same: "{n} etwa gleich", n_none: "{n} nur auf einer Seite",
    all_same: "Beide Male etwa gleich", lost_h: "{s} antwortet nicht mehr", back_h: "{s} antwortet wieder", join: ", " },
  pt: { change: "Mudança", same: "Quase igual", lost: "Sem resposta", back: "Responde",
    faster: "{x}× mais rápido", slower: "{x}× mais lento", better: "melhor", worse: "pior",
    n_faster: "{n} mais rápidos", n_slower: "{n} mais lentos", n_better: "{n} melhor", n_worse: "{n} pior", n_same: "{n} quase iguais", n_none: "{n} só de um lado",
    all_same: "Quase igual nas duas vezes", lost_h: "{s} parou de responder", back_h: "{s} voltou a responder", join: ", " },
  ru: { change: "Изменение", same: "Почти так же", lost: "Нет ответа", back: "Отвечает",
    faster: "в {x} {raz} быстрее", slower: "в {x} {raz} медленнее", better: "лучше", worse: "хуже",
    n_faster: "быстрее: {n}", n_slower: "медленнее: {n}", n_better: "лучше: {n}", n_worse: "хуже: {n}", n_same: "почти так же: {n}", n_none: "только с одной стороны: {n}",
    all_same: "Оба раза почти одинаково", lost_h: "{s} перестал отвечать", back_h: "{s} снова отвечает", join: ", " },
};
export const STRINGS = T, LANGS = Object.keys(T);


const strings = lang => T[lang] || T.en;
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => k in v ? v[k] : m);
const fmt0 = v => v < 10 ? v.toFixed(1) : String(Math.round(v));
const isNum = v => typeof v === "number" && isFinite(v);
// how many times faster, in the language's own digits ("6.8", "6,8"); 10 and up as a whole number
const times = (x, lang) => new Intl.NumberFormat(T[lang] ? lang : "en", { maximumFractionDigits: x >= 10 ? 0 : 1 }).format(x);
// Russian counts "раза" after 2–4 and fractions, "раз" after the rest
const raz = x => { const n = Math.round(x * 10) / 10; if (n % 1) return "раза"; const d = n % 10, h = n % 100; return d >= 2 && d <= 4 && (h < 12 || h > 14) ? "раза" : "раз"; };
const ratioText = (t, st, x, lang) => fill(t[st === "better" ? "faster" : "slower"], { x: times(x, lang), raz: raz(x) });

// A row's change from a to b → the row plus st: better | worse | same | lost (b doesn't answer, a did) | back (b
// answers, a didn't) | none (only one side measured it); d = b − a; x = how many times bigger the larger value is;
// score = how much it changed (lost and back most, then the ratio's log), for the order.
export function judge(r) {
  const { a, b } = r, tol = { abs: 0, rel: 0.1, ...r.tol };
  if (a === undefined || b === undefined) return { ...r, st: "none", score: -1 };
  if (a === null && b === null) return { ...r, st: "same", score: 0 };
  if (b === null) return { ...r, st: "lost", score: 99 };
  if (a === null) return { ...r, st: "back", score: 99 };
  const d = b - a, hi = Math.max(a, b), lo = Math.min(a, b), x = lo > 0 ? hi / lo : hi > 0 ? 50 : 1;
  if (Math.abs(d) <= tol.abs || x - 1 <= tol.rel) return { ...r, d, x, st: "same", score: 0 };
  return { ...r, d, x, st: (r.better === "higher" ? d > 0 : d < 0) ? "better" : "worse", score: Math.log(Math.min(x, 50)) };
}
// every row judged, biggest change first; equal ones keep the tool's order
export const rank = rows => rows.map((r, i) => [judge(r), i]).sort((p, q) => q[0].score - p[0].score || p[1] - q[1]).map(p => p[0]);
// how many got better (back included), worse (lost included), stayed the same, or were measured on one side only
export function tally(rows) {
  const n = { better: 0, worse: 0, same: 0, none: 0 };
  for (const r of rows.map(judge)) n[r.st === "back" ? "better" : r.st === "lost" ? "worse" : r.st]++;
  return n;
}
export function tallyText(rows, lang, words = "speed") {
  const t = strings(lang), n = tally(rows), sp = words !== "plain";
  return [n.better && fill(t[sp ? "n_faster" : "n_better"], { n: n.better }), n.worse && fill(t[sp ? "n_slower" : "n_worse"], { n: n.worse }),
    n.same && fill(t.n_same, { n: n.same }), n.none && fill(t.n_none, { n: n.none })].filter(Boolean).join(" · ");
}
// The one line that says what changed, for the page, the share card and the chat preview: the biggest change as
// "ChatGPT 300→44 ms", the next ones as "GitHub 5× faster" when that is at least double (else the same arrow form).
export function headline(rows, lang, n = 2) {
  const t = strings(lang), out = [];
  for (const r of rank(rows)) {
    if (out.length >= n || r.score <= 0) break;
    const f = r.fmt || fmt0;
    if (r.st === "lost" || r.st === "back") out.push(fill(t[r.st + "_h"], { s: r.name }));
    else if (out.length && r.unit && r.x >= 2) out.push(r.name + " " + ratioText(t, r.st, r.x, lang));
    else out.push(`${r.name} ${f(r.a)}→${f(r.b)}${r.unit ? " " + r.unit : ""}`);
  }
  return out.length ? out.join(t.join) : t.all_same;
}
// better, worse or same overall: what colors the headline
export const tone = rows => { const n = tally(rows); return n.better > n.worse ? "better" : n.worse > n.better ? "worse" : "same"; };

/* ---------- the view ---------- */
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const here = name => new URL(name, import.meta.url).href;
let cssP = null;
const loadCSS = () => cssP ||= new Promise(res => {
  const l = document.createElement("link"); l.rel = "stylesheet"; l.href = here("compare.css");
  l.onload = l.onerror = res; document.head.appendChild(l);
});
const W = 1200;
const roundRect = (x, a, b, w, h, r) => { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); };
const clip = (x, s, w) => { s = String(s); if (x.measureText(s).width <= w) return s; while (s.length > 1 && x.measureText(s + "…").width > w) s = s.slice(0, -1); return s + "…"; };
// lines that fit width w: break at spaces, or anywhere in CJK text
function wrap(x, s, w) {
  const out = []; let line = "";
  for (const tok of s.match(/[　-鿿가-힯＀-￯]|[^\s　-鿿가-힯＀-￯]+\s*|\s+/g) || []) {
    if (line && x.measureText(line + tok).width > w) { out.push(line.trimEnd()); line = tok.trimStart(); } else line += tok;
  }
  if (line.trim()) out.push(line.trimEnd());
  return out;
}

export function compare(o) {
  const lang = T[o.lang] ? o.lang : "en", t = T[lang], words = o.words === "plain" ? "plain" : "speed";
  const rows = rank(o.rows || []).filter(r => r.st !== "none"), stats = (o.stats || []).slice(0, 3).map(judge);
  const head = headline(o.rows || [], lang), sum = tallyText(o.rows || [], lang, words), mood = tone(o.rows || []);
  const subOf = (side, show) => typeof side.sub === "function" ? side.sub(show) : side.sub || "";
  const val = (r, k) => { const v = r[k]; return r.text ? r.text[k === "a" ? 0 : 1] : v === undefined ? "–" : v === null ? "✕" : (r.fmt || fmt0)(v); };
  // the change column: −256 ms, and how many times when that says more (at least 1.5×)
  const change = r => {
    if (r.st === "better" || r.st === "worse") {
      const f = r.fmt || fmt0, d = r.text ? "" : (r.d > 0 ? "+" : "−") + f(Math.abs(r.d)) + (r.unit ? " " + r.unit : "");
      return [d || t[r.st], r.unit && r.x >= 1.5 && words !== "plain" ? ratioText(t, r.st, r.x, lang) : ""];
    }
    return [t[r.st], ""];
  };

  async function render(el) {
    await loadCSS();
    const side = (k, s) => `<span class="msc-side"><i class="msc-k msc-${k}" aria-hidden="true"></i><b>${k.toUpperCase()}</b><span>${esc(s.label || "")}</span>${subOf(s, true) ? `<span class="msc-sub">${esc(subOf(s, true))}</span>` : ""}</span>`;
    const stat = r => { const [c, x] = change(r);
      return `<div class="msc-stat msc-${r.st}"><em>${esc(r.name)}</em><b>${esc(val(r, "a"))}<small class="msc-ar">→</small>${esc(val(r, "b"))}${r.unit ? `<small>${esc(r.unit)}</small>` : ""}</b><i>${esc(x || c)}</i></div>`; };
    const row = r => { const [c, x] = change(r);
      return `<div class="msc-r msc-${r.st}" role="row"><span class="msc-n" role="cell" title="${esc(r.name)}">${esc(r.name)}</span><b role="cell">${esc(val(r, "a"))}</b>` +
        `<span class="msc-l" aria-hidden="true"><i class="msc-seg"></i><i class="msc-pa"></i><i class="msc-pb"></i></span><b role="cell">${esc(val(r, "b"))}</b>` +
        `<span class="msc-c" role="cell">${esc(c)}${x ? `<small>${esc(x)}</small>` : ""}</span></div>`; };
    const hd = `<div class="msc-r msc-hd" role="row"><span role="columnheader"></span><b role="columnheader">A</b><span></span><b role="columnheader">B</b><span class="msc-c" role="columnheader">${esc(t.change)}</span></div>`;
    el.innerHTML = `<div class="msc" lang="${lang}"><div class="msc-top"><p class="msc-h msc-${mood}">${esc(head)}</p><p class="msc-d">${esc(sum)}</p></div>` +
      `<div class="msc-sides">${side("a", o.a || {})}${side("b", o.b || {})}</div>` +
      (stats.length ? `<div class="msc-stats">${stats.map(stat).join("")}</div>` : "") +
      `<div class="msc-hds">${hd}${hd}</div><div class="msc-t" role="table">${rows.map(row).join("")}</div></div>`;
    // the lane: a hollow dot at a, a filled one at b, the line between them in the row's color. Positions are set
    // here, not as style="" in the markup, which a strict CSP would block.
    const tb = el.querySelector(".msc-t"); tb.style.setProperty("--k", Math.ceil(rows.length / 2));
    tb.querySelectorAll(".msc-r").forEach((e, i) => {
      const r = rows[i], pa = r.scale && isNum(r.a) ? r.scale(r.a) : null, pb = r.scale && isNum(r.b) ? r.scale(r.b) : null;
      const [seg, a, b] = e.querySelectorAll(".msc-l i");
      if (pa == null && pb == null) { e.querySelector(".msc-l").remove(); e.classList.add("msc-nolane"); return; }
      if (pa != null) a.style.left = (pa * 100).toFixed(1) + "%"; else a.remove();
      if (pb != null) b.style.left = (pb * 100).toFixed(1) + "%"; else b.remove();
      if (pa != null && pb != null) { seg.style.left = (Math.min(pa, pb) * 100).toFixed(1) + "%"; seg.style.width = (Math.abs(pb - pa) * 100).toFixed(1) + "%"; } else seg.remove();
    });
  }

  // the share card's middle, laid out once for its height and drawn the same way
  let L = null;
  function height(m, kit) {
    const { P, top, F } = kit;
    m.font = `700 40px ${F}`;
    const hl = wrap(m, head, W - P * 2), hTop = top + 44, dTop = hTop + (hl.length - 1) * 50 + 44, sTop = dTop + 50;
    const stTop = sTop + 2 * 36 + 8, SH = stats.length ? 104 : 0, NC = rows.length > 8 ? 2 : 1, per = Math.ceil(rows.length / NC), RH = 32;
    const rTop = stTop + SH + (SH ? 40 : 0);
    L = { hl, hTop, dTop, sTop, stTop, SH, NC, per, RH, rTop };
    return rTop + 34 + per * RH + 16 + 70;
  }
  async function draw(x, kit) {
    const { P, F, M, v, dark, show } = kit, { hl, hTop, dTop, sTop, stTop, SH, NC, per, RH, rTop } = L;
    const C = { fg: v("fg"), muted: v("muted"), line: v("line"), bg: v("bg"), panel: v("panel") || v("bg"),
      better: v("good") || (dark ? "#3ecf8e" : "#1a8a5a"), worse: v("bad") || (dark ? "#f56565" : "#d23a2f") };
    C.back = C.better; C.lost = C.worse; C.same = C.muted; C.none = C.muted;
    x.textBaseline = "alphabetic";
    x.fillStyle = C[mood] === C.muted ? C.fg : C[mood]; x.font = `700 40px ${F}`; hl.forEach((l, i) => x.fillText(l, P, hTop + i * 50));
    x.fillStyle = C.muted; x.font = `400 24px ${F}`; x.fillText(clip(x, sum, W - P * 2), P, dTop);
    // the two sides, with the dots the lanes use
    [["a", o.a || {}], ["b", o.b || {}]].forEach(([k, s], i) => {
      const y = sTop + i * 36, cx = P + 9;
      x.beginPath(); x.arc(cx, y - 8, 8, 0, Math.PI * 2);
      if (k === "a") { x.strokeStyle = C.muted; x.lineWidth = 3; x.stroke(); } else { x.fillStyle = C.fg; x.fill(); }
      x.fillStyle = C.fg; x.font = `700 22px ${F}`; x.fillText(k.toUpperCase(), P + 28, y);
      x.font = `600 22px ${F}`; const lb = s.label || ""; x.fillText(lb, P + 56, y);
      x.fillStyle = C.muted; x.font = `400 22px ${F}`; x.fillText(clip(x, subOf(s, show), W - P * 2 - 80 - x.measureText(lb).width), P + 56 + x.measureText(lb).width + 16, y);
    });
    // key numbers
    const cw3 = (W - P * 2 - 2 * 16) / 3;
    stats.forEach((r, i) => {
      const x0 = P + i * (cw3 + 16), [c, xr] = change(r);
      x.fillStyle = C.panel === C.bg ? C.line + "55" : C.panel; roundRect(x, x0, stTop, cw3, SH, 14); x.fill();
      x.fillStyle = C.muted; x.font = `400 20px ${F}`; x.fillText(clip(x, r.name, cw3 - 40), x0 + 20, stTop + 32);
      x.font = `600 38px ${M}`; const av = val(r, "a"), bv = val(r, "b");
      x.fillStyle = C.muted; x.fillText(av, x0 + 20, stTop + 80); let xx = x0 + 20 + x.measureText(av).width + 8;
      x.font = `400 26px ${F}`; x.fillText("→", xx, stTop + 78); xx += x.measureText("→").width + 8;
      x.fillStyle = C[r.st]; x.font = `600 38px ${M}`; x.fillText(bv, xx, stTop + 80); xx += x.measureText(bv).width + 8;
      x.font = `400 18px ${F}`; x.fillStyle = C.muted; x.fillText(clip(x, (r.unit ? r.unit + "  " : "") + (xr || c), x0 + cw3 - 14 - xx), xx, stTop + 80);
    });
    // the rows, in one or two columns, biggest change first
    const cw = (W - P * 2 - 48 * (NC - 1)) / NC, nameW = NC > 1 ? 128 : 200, valW = 64, chW = NC > 1 ? 112 : 300;
    for (let ci = 0; ci < NC; ci++) {
      const x0 = P + ci * (cw + 48), aR = x0 + nameW + valW, l0 = aR + 18, bR = x0 + cw - chW - 8, l1 = bR - valW - 14;
      x.fillStyle = C.muted; x.font = `600 16px ${F}`;
      x.textAlign = "right"; x.fillText("A", aR, rTop + 18); x.fillText("B", bR, rTop + 18); x.fillText(t.change.toUpperCase(), x0 + cw, rTop + 18); x.textAlign = "left";
      rows.slice(ci * per, (ci + 1) * per).forEach((r, i) => {
        const y = rTop + 34 + i * RH + 20, cy = y - 6, col = C[r.st];
        x.fillStyle = C.fg; x.font = `400 19px ${F}`; x.fillText(clip(x, r.name, nameW - 10), x0, y);
        x.font = `500 19px ${M}`; x.textAlign = "right";
        x.fillStyle = C.muted; x.fillText(val(r, "a"), aR, y);
        x.fillStyle = r.st === "same" || r.st === "none" ? C.fg : col; x.fillText(val(r, "b"), bR, y);
        const [c, xr] = change(r);
        x.font = `500 17px ${r.st === "better" || r.st === "worse" ? M : F}`; x.fillStyle = col;
        x.fillText(clip(x, NC > 1 || !xr ? c : c + "  ·  " + xr, chW), x0 + cw, y); x.textAlign = "left";
        if (!r.scale) return;
        x.fillStyle = C.line; x.fillRect(l0, cy - 1.5, l1 - l0, 3);
        const at = p => l0 + (l1 - l0) * p, pa = isNum(r.a) ? at(r.scale(r.a)) : null, pb = isNum(r.b) ? at(r.scale(r.b)) : null;
        if (pa != null && pb != null) { x.fillStyle = col + "aa"; x.fillRect(Math.min(pa, pb), cy - 2, Math.abs(pb - pa), 4); }
        if (pa != null) { x.beginPath(); x.arc(pa, cy, 6, 0, Math.PI * 2); x.fillStyle = C.bg; x.fill(); x.strokeStyle = C.muted; x.lineWidth = 2.5; x.stroke(); }
        if (pb != null) { x.beginPath(); x.arc(pb, cy, 7, 0, Math.PI * 2); x.fillStyle = r.st === "same" ? C.fg : col; x.fill(); }
      });
    }
  }

  return { rows, stats, head, sum, mood, text: head + (sum ? " · " + sum : ""), render, height, draw };
}
