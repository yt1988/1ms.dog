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
  assert.equal(parseShare("#r=1|abc|nopack||", PACKS), null);
  assert.equal(parseShare("#nothing", PACKS), null);
});
