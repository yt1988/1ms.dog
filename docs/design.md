# Design notes and their technical reasons

What isn't obvious from the code: why things work the way they do, and what was measured to get there.

## The Tokyo baseline

`httpslatency baseline` (the CLI repository) measures every service from a server in Tokyo, the same way the page
does: one request to connect, then timed requests on the same connection, median. The page uses its `summary.json`
(`BASELINE` in `src/worker.js`, served as `/baseline.json`) in three places:

- **A mark on each lane** at the server's 24-hour median: a fixed point to read the ball against. Far right of the
  mark means the delay is on the visitor's route; slow from Tokyo too means the service.
- **The status page** (`/status/`): every service's latency now, a 24-hour line, uptime over 24 hours and 7 days,
  outages.
- **Route links**: a slow service is compared with its Tokyo time (below).

Why a server and not the Worker: a Worker can't split DNS, TCP and TLS times, its requests to services on Cloudflare
take Cloudflare's own network, and it runs near the visitor, so it is no fixed point.

The server needs no credentials for the site: it publishes static files read-only and the Worker fetches them (fresh
for a minute, the last good copy kept a week), so a dead server only means numbers that stop updating. Writing into
the site's storage (D1, KV) would have needed a Cloudflare token on the server.

## The round trip to a fixed place

After a full run the page sends 15 tiny text frames, one at a time, to an echo server over a WebSocket (`ECHO` in
`src/app.js`) and shows their median and jitter, the first frame not counted. It runs after the services so it never
shares the connection with their timing. The server greets with `{"v":1,"pop":"…"}` and echoes text frames verbatim
(up to 64 bytes, 60 messages or 30 seconds a connection, only from the site's origins). The privacy answer says that
this happens.

## First paint: the font preload is on trial (2026-11-19)

The page preloads `geist-latin.woff2` (29 KB). A lab A/B said removing it was faster: cold cache, 1440×900, 4× CPU,
variants interleaved, at Slow 4G (150 ms RTT, 200 KB/s) FCP was 964 ms with the preload and 756 ms without it, LCP
964 → 904 ms; at a 3G-like profile (400 ms RTT, 50 KB/s) 1,840 → 1,556 ms FCP and 2,156 → 1,748 ms LCP. The reason:
the preload runs at high priority beside the 12 KB render-blocking stylesheet, and with `font-display: swap` first
paint does not need the font. The dog image is not the bottleneck in the lab either: blocking it moves LCP to the h1
at about the same time.

It was removed on 2026-11-17 (`058e3f369`), and the field's p75 LCP then rose for three days: 2,164 ms before the
change → 2,512 → 2,720 ms (2026-11-19), with `#dogImg` the LCP element in 77% of desktop loads. The lab and the field
disagree, so the preload is back from 2026-11-19 to read 48 hours of p75 before deciding anything else (#132 item 1).
Meanwhile the dog animation, the image and its `fetchpriority` stay as they are: the site owner has ruled that out.

## Which exit is the proxy

The label comes from the network's name, not from the route: an exit whose organization matches the hosting/VPS/cloud
list in `src/lib.mjs` (`DC_RE`) reads as Proxy, anything else as Direct. Nothing in the browser proves which line is
the visitor's own, so the list is the evidence used. Fastnet Data, a US hoster, was missing (2026-11-17): a visitor
whose split-tunnel proxy exits there saw two "Direct" exits. Add a provider when a report shows the same. The device
timezone is deliberately not part of the label (it is not proof of location); it only adds the note under the list
when no exit is in the timezone's country.

## Route and ping links

A slow service's time is followed by two icons: a route icon links to Route Trace (`<meta name="trace">`) and a ping
icon to Global Ping (`<meta name="ping">`, 18 locations, packet loss included), each with the host the page timed
filled in. Shown when the service didn't answer, or is past 150 ms **and** over twice the Tokyo median and 50 ms
more (the line `httpslatency --compare` also marks): slow here, not slow everywhere. Without the baseline, past
150 ms is enough. Both sit inside the time's column, which is wide enough for the number and both links, so the
field's lanes keep their width.

## The installer and release mirror

`/i`, `/i.ps1` and `/dl/…` serve the command-line tool's releases from GitHub: `curl -fsSL https://1ms.dog/i | sh`
works where GitHub is slow or blocked, and the installers and the tool's self-update ask the mirror before GitHub.
GitHub itself answers 5xx or drops a connection for a minute now and then (2026-11-09 07:39 UTC: five 502s in 90
seconds turned the weekly `check` red on every install route). So these routes are not allowed to fail just because
GitHub did:

- the ask for the newest release (`/releases/latest`, a HEAD) is tried twice, a second apart; a 4xx is not retried;
- the version is kept for 10 minutes, and the last version GitHub gave is kept for a week: when both asks fail, that
  older tag is served, and `/i` still installs that release from GitHub;
- a release file is fetched once and kept immutable; if that fetch fails while the tag is known, the client is sent
  to GitHub's copy of the same file (the documented installers follow redirects);
- with no tag ever seen, `/v` answers 503 with a sentence saying GitHub is the problem (the outage the weekly
  `check` must see), while `/i` and `/i.ps1` answer 200 with a short script that says so and exits 1 (or throws):
  a 5xx would make `curl -fsSL … | sh` write nothing, and `sh` would then exit 0 on empty input, looking like a
  successful install that installed nothing. `/dl/latest/<file>` points at GitHub's own `latest/download/` (which
  needs no tag).

## The status page

- Same header and help dialog as every page. Its HTML is about 36 KB (84 rows plus the help), so its own budget is
  40 KB; the other pages keep 30 KB (the help dialog's answers are the biggest part).
- Service icons are downloaded once at build time (`scripts/icons.mjs`, Google's favicon service, by the brand's own
  domain; the generic 16 px globe is refused) and served from the site: opening the page asks nothing of the
  services or a favicon service. Copilot's icon comes from elsewhere (the favicon service gives Bing's).
- The 24-hour line is scaled to each service's own range (at least 10 ms or a fifth of its median tall), so a steady
  service is flat and a jump shows; a dotted base line keeps the column readable before a day has filled it.

## Service URLs

- A URL must be answered by the service's edge: favicons, `generate_204`, `/cdn-cgi/trace` for services on
  Cloudflare, robots.txt. A URL answered by the application server adds its work to the time (Gemini's favicon took
  430 ms of server time).
- `raw: true` drops the cache-busting query where it makes the CDN go back to its origin every time (Nintendo's
  favicon on Fastly: about 200 ms of S3 time until it was made raw).
- Services change headers without notice: Careem's favicon started sending `Cross-Origin-Resource-Policy:
  same-origin`, so the browser dropped it and the page showed it as not back; it is timed on its Cloudflare trace
  instead. The daily `verify --far` catches these.

## Exit checks

- The rules are not this repository's: `src/egress.js` is a verbatim copy of the shell's `src/egress.js` (VERSION 7,
  commit `414073e`), and the shell's `docs/egress-contract.md` is the source. Change the rules there and re-vendor;
  do not edit the tables here.
- Two anchors answer which route an exit takes (`path`: `cn`, `intl`, `both`, `other`, `unknown-path`). Whether the
  exit itself is direct or a proxy (`kind`) comes from its own network (organization, ASN, VPN name, WARP). The two
  are kept apart on purpose: a direct exit can still follow neither anchor, and an anchor matching does not make a
  proxy direct. The page shows only `kind` (直连 / 代理); `path` stays on the group as evidence. An exit with no
  organization or ASN is `unknown` and gets no label, never 直连.
- Where the anchors live is deploy-time data, not repository content (the shell's `docs/tool-contract.md` §2): the
  page reads `<meta name="ms-anchors" content="cn=…;intl=…">`, which `src/worker.js` writes from `env.MS_ANCHORS`
  (HTMLRewriter, skipped when unset) and `scripts/build.mjs` writes from a `MS_ANCHORS` build parameter. The repo
  holds no probe address. With no meta both probe checks reject at once: the panel still shows every exit the other
  checks saw, with no path evidence. CI and local builds run that fallback, and the tests cover it. When the
  Worker injects, it derives the page's ETag from the asset's own ETag and a digest of the injected line, so a
  revalidation still answers 304 and the page's `no-cache` contract is unchanged.
- The third-party checks (`ip.sb`, `ipinfo.io`, `ipip.net`, Cloudflare, the IPv4-only and IPv6-only hosts, WebRTC)
  still run and feed the same grouping, so the panel keeps showing every exit it can see.
- The mainland anchor is requested only when the visitor is likely in mainland China: the site's edge (`/_ms/me`)
  says CN, or the device's timezone is CN (a proxy can hide the first but not the clock). For anyone else the
  request would be a cross-border wait that usually cannot answer, so it is skipped and the panel is not held for
  its timeout (2.5 s when it is asked). Measured on a simulated US visitor: no request to the probe, panel filled in
  about a second instead of waiting for it.
- Cloudflare's network is a proxy exit whether WARP is on or off (its ASN 13335 is in the shared table, and an
  organization named Cloudflare matches the list too); WARP only changes the reason, `warp` instead of `dc`.
- VERSION 7 (`414073e`) carries the IANA timezone table (each zone keeps the country of its place, not of its link target) and the rules the page relies on: the IPv4-only and IPv6-only checks are marked
  `stack: true` so the core compares them with the reference exit of their own family (a dual-stack line is not
  "split" just because its two addresses differ), WebRTC is compared by network rather than by exact address, and
  the page keeps no tables of its own.

## The dog

- An inline SVG animated with SMIL; its speed follows the result (`dogSpeed()` changes the animations' durations).
  Moods are classes on the stage, and its colors stay the same in every mood.
- Motion comes from a rig of nested groups (body, flip, head, tail, shadow; ears cut out of the head with a mask and
  redrawn from it) with squash and stretch, rolls, belly up, tilts, chomps, sniffs, eyes that follow the pointer.
- Pivots use `transform-box: view-box` with origins in the part's own coordinates; `fill-box` drifted.
- The SVG shows past its own frame (`overflow: visible`) so a roll or belly up isn't cut off.
- On phones the road is as wide as the dog and under its feet; `touch-action: manipulation` on the dog keeps repeated
  taps from zooming iOS Safari.
- The dog's element is looked up once: an ad blocker can take it off the page, and the pointer-following must then do
  nothing instead of throwing.
- The balls that come back are squares built from `width` + `padding-bottom`, not `aspect-ratio`: in Safari 27 an
  absolutely positioned element whose `left` and `bottom` animate and whose height is `auto` ignores the ratio and
  stretches to the container's height, so the balls became tall ellipses flying over the dog (seen on 2026-11-23).
  The padding percentage resolves against the container's width, so the box stays square in every browser.

## Words

- A local brand whose name is written in another script carries `names` in `src/services.mjs` for all 10 languages
  (百度 / Baidu / ビリビリ), and every place that prints a service's name reads it through `serviceName`
  (`src/lib.mjs`): pages and titles, the status page, share previews, the share card and the compare view. `npm test`
  fails if a non-Latin name has no `names`, or if any language is missing. The Chinese and Japanese pages keep the
  brands' own writing.

- Counted lines use the language's plural forms (`key_one`, `key_few`, `key_many`, `key_other`, picked with
  `Intl.PluralRules`); the build ships a form only to the languages that have it.
