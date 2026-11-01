# 1ms.dog

**English** · [简体中文](README.zh-CN.md)

Where does your internet really exit, and how far is the world from there? [1ms.dog](https://1ms.dog) finds every exit your traffic uses (your local line and any proxy or VPN), then a shiba plays fetch with 40 services worldwide plus a local pack, right from your browser. Each service is a ball thrown as far as its latency.

**Live:** https://1ms.dog

## What it does

- **Every exit, local and proxy.** A rule-based proxy picks the route by destination, so a single "what is my IP" check only sees its own route. The page asks checks in different places at once: a site in mainland China, Cloudflare, ip.sb, ipinfo.io, IPv4-only and IPv6-only hosts, and WebRTC over UDP. It groups their answers by network and marks each exit as local or proxy. When services that are usually unreachable from your country answer anyway, it points out the exit none of the checks could see.
- **Latency to 40 services, measured at their edge.** Covers AI, everyday web, video and music, social, developer tools, gaming and CDNs, plus a local pack picked by exit country (mainland China, Japan, Korea, Russia, Europe, Latin America…).
- **A verdict, not just a median.** Local favorites and global services are judged separately, so the page tells you *where* it's slow: international routes or the proxy server, your own line, or everything going through a proxy. It also translates the numbers into everyday uses: gaming, video calls, streaming, AI tools and dev tools.
- **Share a result** as an image drawn in your browser, or as a link that carries the result itself. Links hold the country and timings, plus city and network only if you tick the box; never IP addresses.
- **10 languages**, all pre-rendered, plus landing pages chosen per language for the services people search latency for there (`/chatgpt/`, `/zh-cn/dockerhub/`, `/ru/discord/`…).
- **Private by design:** every request goes straight from your browser to the service being tested. The site is static files; it never receives your results. A shared link carries its result in the path (`/r/…`), and a small Worker reads it to put the result in the link preview.

## How latency is measured

Your browser opens a real HTTPS connection to each service. The first request only sets the connection up (DNS, TCP, TLS) and isn't counted. Timed requests then reuse that connection, and the page shows the median. The result is one round trip from your device to the service's nearest server, through your Wi-Fi, ISP and any proxy.

Each test URL has to be **answered by the service's edge**. Otherwise the number includes the application server's work: Gemini's favicon, for example, took 430 ms of Google server time before redirecting to a captcha. So the list uses `/cdn-cgi/trace` on Cloudflare hosts, `/generate_204` on Google's, and static files or CDN hosts elsewhere. `npm run verify` checks every URL for redirects, for a blocking `Cross-Origin-Resource-Policy`, and for server time (the fastest of three warm requests minus one round trip). A GitHub Action runs it daily.

## Self-hosting

The page is static: `public/` is committed, so you don't need to build anything unless you change the code.

```bash
git clone https://github.com/yt1988/1ms.dog
cd 1ms.dog
npx wrangler login
npx wrangler deploy        # static assets (free and unmetered) and src/worker.js, which only runs for /r/ links
```

`wrangler.toml` turns off `*.workers.dev` and preview URLs. Bind your own domain under **Workers & Pages → 1ms-index → Settings → Domains & Routes**, or set `workers_dev = true` for a quick test. Any static host works too, without the result-link previews (`/r/` links then need a rewrite to their page); `public/_headers` holds the security headers (CSP) in Cloudflare's format.

To put your own domain into canonical tags, the sitemap and preview images, rebuild with `SITE_URL`:

```bash
npm install
SITE_URL=https://ping.example.com node scripts/build.mjs
SITE_URL=https://ping.example.com node scripts/assets.mjs
```

On 1ms.dog the page also gets the site's shared top bar, analytics and theme/language sync. When the page carries a link shortener (`<meta name="shortener">`), share links are shortened; without it they stay as full links.

## Development

```bash
npm install
npm run dev        # http://localhost:8787, with the production headers
npm run build      # regenerate public/ after changing src/ (commit public/)
npm test           # public/ up to date, page contract, SEO, and the logic tests
npm run verify     # check every service URL; try another one with id=url
npm run assets     # re-render the preview images (Windows system fonts)
```

On 1ms.dog, every push to `main` deploys automatically (Cloudflare Workers Builds runs `npm ci && npm test` first, so a stale `public/` or a failing test stops the deploy).

```
src/page.html        page template
src/app.js           browser code: exit checks, timing, the dog, the verdict, sharing
src/lib.mjs          pure logic (medians, speed levels, diagnosis, exit grouping, share links), unit-tested
src/worker.js        the Worker for shared result links (/r/…): the page with the result in its preview title
src/services.mjs     services, local packs, country → pack, the distance scale and everyday uses
src/i18n/*.mjs       strings for 10 languages; en is the reference, other languages fall back key by key
src/*.css            design tokens (shared with the other 1ms.dog tools) and the layout
scripts/build.mjs    builds public/: pages per language, landing pages, sitemap, robots, llms.txt, _headers
scripts/verify.mjs   checks the service URLs
scripts/assets.mjs   renders the link-preview images
test/                site and logic tests
```

### Changing the service list

- A URL must answer in **one request with no redirect**, from the service's edge, with a small body (use `m: "HEAD"` for large ones). It must not send `Cross-Origin-Resource-Policy: same-origin` or `same-site`. Run `npm run verify`, ideally from more than one network.
- A service that is blocked somewhere shows as "not back" there. That's an honest result, so don't remove it for that reason.
- Every local pack has the same number of services, so the page doesn't move when the pack switches. The tests check this.
- Each language lists its landing pages in `land` in its strings file, chosen by what people search for in that market.

## License

[MIT](LICENSE). The shiba artwork and the 1ms.dog logo are the project's branding: please use your own if you run a public copy under another name.
