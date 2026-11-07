# AGENTS.md

For anyone, person or AI agent, who picks up this repository. The user-facing description is in README.md; designs
and their technical reasons are in [docs/design.md](docs/design.md). 1ms.dog's operating notes (accounts, who
maintains what, the shared server) are in its private repository, 1ms-shell.

## What this is

**1ms.dog**, the home page of the 1ms.dog tools: where the visitor's traffic exits (IPv4, IPv6, network, city, proxy
hints) and how fast the world's main services answer, timed from the visitor's own browser. 40 global services in 7
groups plus a pack of local favorites picked by the exit country (11 regions, 44 more services). A Shiba runs the
errand: one ball per service, on a log-scale lane colored by speed zone. 10 languages, a page per service and per
group, shareable result links and a compare view, and a status page fed by a server in Tokyo.

| Part | Where | Runs on |
| --- | --- | --- |
| The pages | `src/page.html`, `src/app.js` (with `src/lib.mjs` inlined), `src/layout.css`, `src/style.css`, `src/i18n/`, `src/services.mjs`, built into `public/` by `scripts/build.mjs` | Cloudflare Workers static assets |
| The status page | `src/status.js`, built into `public/status/` and `public/<lang>/status/` | static assets, data from `/baseline.json` |
| The Worker | `src/worker.js`: share-link previews (`/r/…`, `/c/…/…`), the command-line tool's installers and release mirror (`/i`, `/i.ps1`, `/v`, `/dl/…`), `/baseline.json` | Cloudflare Workers |
| The Tokyo baseline | `httpslatency baseline` in github.com/yt1988/https-latency-test-cli, run hourly on a server in Tokyo; it publishes `summary.json`, which the Worker serves as `/baseline.json` | a Linux server (see that repository's AGENTS.md) |

Rules the code keeps, and any change must too:

- Latency is measured in the visitor's browser and never sent to 1ms.dog. A shared link carries the country and the
  times, the city and network only if the visitor ticks the box, never an IP address. The privacy answer in the help
  dialog says exactly what leaves the browser; change it with the behavior.
- Each service URL is answered by the service's edge in one round trip on a reused connection: no redirect, no
  blocking `Cross-Origin-Resource-Policy`, no slow application server. `npm run verify` checks this.
- The page doesn't jump: every row and number has its place in the HTML before results arrive.
- Every visible string is in all 10 languages (`src/i18n/*.mjs`), written per language, not translated word for
  word; `npm test` fails on a missing key. Plural forms are `key_one` / `key_few` / `key_many` / `key_other`, picked
  with `Intl.PluralRules`.
- Taiwan is named "中国台湾 / Taiwan, China" in every language and flagged with cn.svg (`regionName`, `flagCode` in
  `src/lib.mjs`); other regions use `Intl.DisplayNames`.
- A page's HTML stays under 30 KB (the status page under 40 KB): it is parsed at the edge on every visit. The test
  checks it.
- `public/` is generated and committed: run `npm run build` after any change in `src/` or `scripts/`, and commit the
  new files too (a new `app.<hash>.css` left out of a commit takes the styles off the live site).
- `public/assets/share/` is the shared share dialog of the 1ms.dog tools, copied verbatim; don't edit it here.

## Run it locally

Needs Node 20 or later.

```bash
npm ci
npm run build        # src/ → public/: 1040 pages, CSP, sitemap, llms.txt, services.json
npm run dev          # node scripts/dev.mjs on http://localhost:8787 (a port as argument picks another)
```

The dev server serves `public/` with the production headers (CSP included) and stands in for the Worker's share
previews. `/baseline.json` comes from `.baseline.json` when there is one (copy a `summary.json` written by
`httpslatency baseline --out DIR` there), otherwise from the live site. `SITE_URL=https://your.domain npm run build`
builds for another domain.

A front Worker can add a `<meta name="<tool id>">` for each sister tool (on 1ms.dog its shell does); locally there is none, so the links to
other tools (egress, ASN lookup, Route Trace …) don't show. Add one in the console to try them.

## Test: pick by what changed

| Change | Run |
| --- | --- |
| Anything | `npm test`: public/ matches src/ (`build --check`), the unit tests in `test/` (pages, Worker, lib), every key in every language, page sizes |
| A service URL (`src/services.mjs`) | `npm run verify -- <id>` (or `<id>=<url>` to try another URL); `npm run verify -- --far` as the daily check runs it |
| The page's look or behavior | open it in the dev server at phone (375 px) and desktop width, light and dark, in Chinese and Russian (the longest) |
| Words the command-line tool shows too (grades, groups, regions, uses, the verdict) | `node scripts/cli-texts.mjs ../https-latency-test-cli/webtexts.go`, and commit it there |
| The headline or the dog | `npm run assets` (link-preview images in `public/og/`) |
| A new service | `node scripts/icons.mjs <id>` (its icon for the status page, into `public/assets/svc/`) |

GitHub Actions: `test.yml` runs `npm test` on every push; `endpoints.yml` runs `verify --far` daily from US runners
(regional services only fail there on what breaks everywhere). A failed daily run means a service URL needs replacing.

## Deploy

`wrangler.toml` defines the Worker `1ms-index`: static assets from `public/` and `src/worker.js`. It needs no
secrets. Deploy with `npx wrangler deploy` (a Cloudflare account logged in with `npx wrangler login`) and bind your
domain to the Worker in the dashboard, or connect the repository through Cloudflare Workers Builds so a push to
`main` deploys within about a minute. After deploying, open the site and check that the new `assets/app.<hash>.js`
and `.css` are served and the page works.

What the page uses outside this repository, each optional (the page works without it). Point them at your own or
leave them out:

- `BASELINE` in `src/worker.js`: the URL of a `summary.json` written by `httpslatency baseline` (the CLI
  repository's AGENTS.md says how to run it). The Worker serves it as `/baseline.json`, fresh for a minute, the last
  good copy kept a week. Without it the lane marks, the route links' comparison and the status page stay empty.
- `ECHO` in `src/app.js`: a WebSocket echo server (greets with `{"v":1,"pop":"…"}`, then echoes text frames); after a
  full run the page times 15 round trips to it. Its origin must be in the CSP's `connect-src` (`scripts/build.mjs`).
  Without it the line doesn't show.
- `/_ms/me` on the page's own origin: the visitor's IP and location as the edge sees the connection, when a front
  Worker answers it; otherwise the page falls back to public lookup services.
- `<meta name="<tool>">` tags (egress, asn, trace, …): links to sister tools, shown only when a front Worker adds them.
- GitHub releases of https-latency-test-cli, which `/i`, `/v` and `/dl/…` mirror.

## Related repositories

- github.com/yt1988/https-latency-test-cli: the same measurement in a terminal (`httpslatency`). It reads this site's
  `/services.json` on every run, keeps a built-in copy updated daily, and shows the page's words from `webtexts.go`.
  Its `baseline` command is what the Tokyo server runs.
