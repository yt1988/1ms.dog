// The page's pure logic: speed levels, the diagnosis, exit grouping and share links.
import { test } from "node:test";
import assert from "node:assert/strict";
import { median, fmt, tierOf, posOf, netOf, sameNet, groupExits, segmentOf, grade, diagnose, useStatus, encodeShare, parseShare } from "../src/lib.mjs";
import { PACKS, SCALE } from "../src/services.mjs";

test("median and number format", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([null, 5, null]), 5);
  assert.equal(median([null]), null);
  assert.equal(fmt(9.46), "9.5");
  assert.equal(fmt(123.6), "124");
});

test("dog speeds and field position", () => {
  assert.deepEqual(tierOf(1.5), ["legend", "c0"]);
  assert.deepEqual(tierOf(30), ["zoom", "c1"]);
  assert.deepEqual(tierOf(31), ["sprint", "c2"]);
  assert.deepEqual(tierOf(301), ["nap", "c5"]);
  assert.deepEqual(tierOf(null), ["lost", "cx"]);
  assert.equal(posOf(SCALE.min, SCALE), 0);
  assert.equal(posOf(SCALE.max, SCALE), 1);
  assert.equal(posOf(99999, SCALE), 1);
});

test("same network: /16 for IPv4, /64 for IPv6, never across families", () => {
  assert.ok(sameNet("114.254.73.157", "114.254.1.2"));
  assert.ok(!sameNet("114.254.73.157", "114.255.1.2"));
  assert.equal(netOf("2408:8207:265b:52d0:19c6:4c04:6862:f972"), "2408:8207:265b:52d0");
  assert.ok(sameNet("2408:8207:265b:52d0::1", "2408:8207:265b:52d0:aaaa::2"));
  assert.ok(!sameNet("2408::1", "10.0.0.1"));
});

test("exits group by network and put local before proxy", () => {
  const seen = [
    { ip: "3.115.99.91", by: "ip.sb" }, { ip: "114.254.73.157", by: "ipip.net" }, { ip: "114.254.73.157", by: "Cloudflare" },
    { ip: "2408:8207:265b:52d0::9", by: "IPv6" }, { ip: "3.115.99.91", by: "ipinfo.io" },
  ];
  const geo = {
    "3.115.99.91": { cc: "JP", city: "Tokyo", asn: 16509, org: "Amazon.com" },
    "114.254.73.157": { cc: "CN", city: "Beijing", asn: 4808, org: "China Unicom Beijing" },
    "2408:8207:265b:52d0::9": { cc: "CN", city: "Beijing", asn: 4808, org: "China Unicom" },
  };
  const g = groupExits(seen, geo, "off");
  assert.equal(g.length, 2);
  assert.equal(g[0].asn, 4808); assert.equal(g[0].proxy, false);
  assert.deepEqual(g[0].ips, ["114.254.73.157", "2408:8207:265b:52d0::9"]);
  assert.deepEqual(g[0].by, ["ipip.net", "Cloudflare", "IPv6"]);
  assert.equal(g[1].asn, 16509); assert.equal(g[1].proxy, true);
  // Cloudflare's network is a proxy only when WARP is on
  const cf = { "104.28.1.1": { cc: "US", city: "", asn: 13335, org: "" } };
  assert.equal(groupExits([{ ip: "104.28.1.1", by: "Cloudflare" }], cf, "off")[0].proxy, false);
  assert.equal(groupExits([{ ip: "104.28.1.1", by: "Cloudflare" }], cf, "on")[0].proxy, true);
});

test("the diagnosis says which side is slow", () => {
  const sg = (...meds) => segmentOf(meds, meds.map((_, i) => "s" + i));
  const near = sg(20, 30, 40, 25), far = sg(220, 250, 200, 300, null), farFast = sg(60, 70, 80), dead = sg(null, null, null);
  assert.equal(diagnose(near, far).key, "v_far");
  assert.equal(diagnose(near, far).mood, "far");
  assert.equal(diagnose(near, farFast).key, "v_allgood");
  assert.equal(diagnose(sg(200, 250), sg(300, 280)).key, "v_near_slow");
  assert.equal(diagnose(sg(200, 260), farFast).key, "v_odd");
  assert.equal(diagnose(dead, dead).key, "v_down");
  // a segment where most services didn't answer counts as blocked
  assert.equal(grade(sg(20, null, null)), "blocked");
  assert.deepEqual(far.lost, ["s4"]);
});

test("everyday use status", () => {
  const sg = (...meds) => segmentOf(meds, meds.map(String));
  assert.equal(useStatus(sg(50, 60), 80, 150), "great");
  assert.equal(useStatus(sg(120), 80, 150), "ok");
  assert.equal(useStatus(sg(200), 80, 150), "slow");
  assert.equal(useStatus(sg(null, null, 20), 80, 150), "blocked");
});

test("share links round-trip and carry no IP addresses", () => {
  const data = { ts: 1793433600000, pack: "cn",
    groups: [{ cc: "CN", city: "Beijing", org: "China Unicom, Beijing|net", asn: 4808, proxy: false, ips: ["114.254.73.157"] },
             { cc: "JP", city: "Tokyo", org: "Amazon.com", asn: 16509, proxy: true, ips: ["3.115.99.91"] }],
    res: { baidu: 21.3, chatgpt: 188, claude: null } };
  const h = encodeShare(data);
  assert.ok(!h.includes("114.254") && !h.includes("3.115"), "no IPs in the link");
  const back = parseShare(h, PACKS);
  assert.equal(back.ts, data.ts);
  assert.equal(back.pack, "cn");
  assert.equal(back.groups[0].org, "China Unicom, Beijing|net");
  assert.equal(back.groups[1].proxy, true);
  assert.deepEqual(back.res, { baidu: 21.3, chatgpt: 188, claude: null });
  assert.match(h, /^2\.[0-9a-z]+\.cn\.[\w%~,-]*\.[\w%:,-]*$/, "one plain path segment");
  // links from before the /r/ path put the result after #, and still open
  const old = parseShare("#r=1|tbvhs0|cn|CN~Beijing~China%20Unicom%2C%20Beijing%7Cnet~4808~l|baidu:5x,claude:x", PACKS);
  assert.equal(old.groups[0].org, "China Unicom, Beijing|net");
  assert.deepEqual(old.res, { baidu: 21.3, claude: null });
  assert.equal(parseShare("#r=1|abc|nopack||", PACKS), null);
  assert.equal(parseShare("2.abc.nopack..", PACKS), null);
  assert.equal(parseShare("#nothing", PACKS), null);
});

test("Korean particles follow how the name is read", async () => {
  const { fillIn } = await import("../src/lib.mjs");
  const fin = (await import("../src/i18n/ko.mjs")).default.josa_fin;
  const h = g => fillIn("내 네트워크에서 {g}는 얼마나 빠를까?", { g }, fin);
  assert.equal(h("CDN"), "내 네트워크에서 CDN은 얼마나 빠를까?");
  assert.equal(h("AI"), "내 네트워크에서 AI는 얼마나 빠를까?");
  assert.equal(h("게임"), "내 네트워크에서 게임은 얼마나 빠를까?");
  assert.equal(h("개발 도구"), "내 네트워크에서 개발 도구는 얼마나 빠를까?");
  assert.equal(fillIn("{s}가 차단됐거나 {s}와 {s}를", { s: "Steam" }, fin), "Steam이 차단됐거나 Steam과 Steam을");
  assert.equal(fillIn("{s}은 {s}가", { s: "GitHub" }, fin), "GitHub는 GitHub가");
  assert.equal(fillIn("{list}은(는) 보통", { list: "A, B" }, fin), "A, B은(는) 보통");
  assert.equal(fillIn("{s} 延迟", { s: "Steam" }, fin), "Steam 延迟");
});

test("compare mode: the page's groups, its three numbers and the everyday uses, before and after", async () => {
  const { diffShares, bare, CMP_RE, TOL } = await import("../src/lib.mjs");
  const { SERVICES, CATS, USES } = await import("../src/services.mjs");
  const names = Object.fromEntries([...SERVICES, ...Object.values(PACKS).flat()].map(s => [s.id, s.name]));
  const A = { ts: 1, pack: "cn", groups: [{ cc: "CN", city: "Beijing", org: "China Unicom", asn: 4808, proxy: false }], res: { baidu: 20, chatgpt: 300, claude: null, youtube: 450, github: 30 } };
  const B = { ts: 2, pack: "na", groups: [], res: { chatgpt: 44.1, claude: 50, google: 12, youtube: 60, github: 31 } };
  const d = diffShares(A, B, { names, services: SERVICES, packs: PACKS, cats: CATS, uses: USES, label: k => k });
  assert.deepEqual(d.groups.map(g => g.id), ["local", ...CATS], "the page's order, local favorites first");
  assert.ok(d.groups[0].rows.some(r => r.id === "baidu"), "either side's local pack");
  const ai = d.groups.find(g => g.id === "ai").rows;
  assert.deepEqual(ai.map(r => [r.id, r.name, r.a, r.b]), [["chatgpt", "ChatGPT", 300, 44.1], ["claude", "Claude", null, 50]]);
  assert.equal(ai[0].tol, TOL); assert.equal(ai[0].tier(44.1), "t2"); assert.equal(ai[0].tier(null), "muted");
  assert.deepEqual(d.stats.map(s => [s.name, s.a, s.b]), [["seg_local", null, null], ["seg_global", 300, 47.05], ["med", 300, 47.05]]);
  // uses: video went from slow to great; dev tools moved 1 ms, so they didn't change whatever their status says
  const use = id => d.uses.find(u => u.id === id);
  assert.deepEqual([use("stream").a, use("stream").b, use("stream").text], [1, 3, ["st_slow", "st_great"]]);
  assert.equal(use("dev").a, use("dev").b);
  assert.deepEqual(bare(A).groups[0], { cc: "CN", city: "", org: "", asn: null, proxy: false });
  const m = CMP_RE.exec("/zh-cn/c/2.a.cn.x.y/2.b.na.x.z/");
  assert.deepEqual([m[1], m[2]], ["2.a.cn.x.y", "2.b.na.x.z"]);
});

test("calibration: ten real runs a minute apart on one line all compare as almost identical", async () => {
  const { diffShares } = await import("../src/lib.mjs");
  const { SERVICES, CATS, USES } = await import("../src/services.mjs");
  const { verdict, judge } = await import("../public/assets/share/compare.js");
  const { readFile } = await import("node:fs/promises");
  const runs = (await readFile(new URL("fixtures/runs.txt", import.meta.url), "utf8")).trim().split(/\r?\n/).map(c => parseShare(c, PACKS));
  assert.equal(runs.length, 10);
  let pairs = 0, flagged = 0, rows = 0;
  for (let i = 0; i < runs.length; i++) for (let j = i + 1; j < runs.length; j++) {
    const d = diffShares(runs[i], runs[j], { names: {}, services: SERVICES, packs: PACKS, cats: CATS, uses: USES, label: k => k });
    const v = verdict(d, "en"), all = d.groups.flatMap(g => g.rows).map(judge);
    pairs++; rows += all.length; flagged += all.filter(r => r.score > 0).length;
    assert.equal(v.mood, "same", `runs ${i} and ${j}: ${v.head} / ${v.detail}`);
  }
  assert.equal(pairs, 45);
  assert.ok(flagged / rows < 0.025, `${(100 * flagged / rows).toFixed(1)} % of rows past the tolerance`);
});

test("this browser's own results: newest first, no duplicates, only well-formed codes", async () => {
  const { parseHist, addHist, ownOf } = await import("../src/lib.mjs");
  const c1 = encodeShare({ ts: 1793433600000, pack: "cn", groups: [{ cc: "CN", city: "Beijing", org: "China Unicom", asn: 4808, proxy: false }], res: { baidu: 21.3 } });
  const c2 = encodeShare({ ts: 1793437200000, pack: "cn", groups: [], res: { baidu: 30 } });
  assert.deepEqual(parseHist(JSON.stringify([c2, c1, 5, "#r=1|x", "nonsense"])), [c2, c1]);
  assert.deepEqual(parseHist("{"), []);
  assert.deepEqual(parseHist(null), []);
  assert.deepEqual(addHist([c1], c2), [c2, c1]);
  assert.deepEqual(addHist([c2, c1], c1), [c1, c2]);
  assert.equal(addHist(Array.from({ length: 10 }, (_, i) => "2.x" + i), c1).length, 10);
  // a link's side that is this visitor's own result is found again by time and numbers, city and network included
  const shared = parseShare(encodeShare({ ...parseShare(c1, PACKS), groups: [{ cc: "CN", city: "", org: "", asn: null, proxy: false }] }), PACKS);
  assert.equal(ownOf([c2, c1], shared, PACKS).groups[0].city, "Beijing");
  assert.equal(ownOf([c2], shared, PACKS), null);
});
