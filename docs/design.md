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

## Route links

A route icon after a slow service's time links to Route Trace (`<meta name="trace">`) with the host the page timed
filled in. Shown when the service didn't answer, or is past 150 ms **and** over twice the Tokyo median and 50 ms
more (the line `httpslatency --compare` also marks): slow here, not slow everywhere. Without the baseline, past
150 ms is enough. It sits inside the time's column, so the field's lanes keep their width.

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

## Words

- Counted lines use the language's plural forms (`key_one`, `key_few`, `key_many`, `key_other`, picked with
  `Intl.PluralRules`); the build ships a form only to the languages that have it.
