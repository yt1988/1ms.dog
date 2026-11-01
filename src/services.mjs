// The services the dog plays fetch with. Every visitor gets the global groups; one local pack is added by the exit
// country (the visitor can switch it). Each url is a small, cacheable, same-host answer: no redirect, so the timing
// is one round trip on a reused connection, answered by the service's edge rather than its application server
// (otherwise the number includes the server's work: Gemini's favicon took 430 ms of Google server time). No Cross-Origin-Resource-Policy: same-origin/same-site either, or the
// browser blocks the answer and the service looks unreachable (claude.ai and Epic send it on every file,
// hence their /cdn-cgi/trace URLs: same host and edge, without the header).
// `npm run verify` checks all of this.
//
// id     stable key (results, landing pages /<id>/)
// name   brand name as the brand writes it
// cat    group key, see CATS
// url    what the browser requests (a random query string is added to skip caches)
// m      request method: GET (default), HEAD, or IMG (an <img> load, for hosts that reset fetch)
// origin set when the service is hosted in one region (DeepSeek: mainland China): the far-away daily check treats it like
//        a regional service
// via    the edge network that answers (from its response headers), where known: landing pages name it and list the
//        other services on the same network
// pop    how to read which edge node answered, for the badge beside the name: a response header (x-served-by,
//        x-amz-cf-pop), "trace" (a Cloudflare trace body) or "wmf" (Wikimedia's Server-Timing host). The host must allow
//        cors and expose that header, since the request then goes in cors mode
// popUrl read the node from this URL instead, when the timed one can't show it (same edge network)
// c      tile accent color

export const CATS = ["ai", "web", "video", "social", "dev", "game", "cdn"];

export const SERVICES = [
  // AI
  { id: "chatgpt", name: "ChatGPT", cat: "ai", url: "https://chatgpt.com/favicon.ico", via: "Cloudflare", c: "#10a37f" },
  { id: "claude", name: "Claude", cat: "ai", url: "https://claude.ai/cdn-cgi/trace", via: "Cloudflare", c: "#d97757" },
  { id: "gemini", name: "Gemini", cat: "ai", url: "https://gemini.google.com/generate_204", via: "Google", c: "#4f7cf5" },
  { id: "copilot", name: "Copilot", cat: "ai", url: "https://copilot.microsoft.com/cdn-cgi/trace", via: "Cloudflare", c: "#2a84e8" },
  { id: "grok", name: "Grok", cat: "ai", url: "https://grok.com/cdn-cgi/trace", via: "Cloudflare", c: "#8b8b8b" },
  { id: "deepseek", name: "DeepSeek", cat: "ai", url: "https://chat.deepseek.com/favicon.svg", origin: "CN", c: "#4d6bfe" },

  // Search & everyday web
  { id: "google", name: "Google", cat: "web", url: "https://www.google.com/generate_204", via: "Google", c: "#4285f4" },
  { id: "apple", name: "Apple", cat: "web", url: "https://www.apple.com/favicon.ico", via: "Apple", c: "#8e8e93" },
  { id: "microsoft", name: "Microsoft", cat: "web", url: "https://www.microsoft.com/favicon.ico", c: "#00a4ef" },
  { id: "wikipedia", name: "Wikipedia", cat: "web", url: "https://upload.wikimedia.org/favicon.ico", pop: "wmf", via: "Wikimedia", c: "#9a9a9a" },
  { id: "amazon", name: "Amazon", cat: "web", url: "https://www.amazon.com/favicon.ico", via: "Amazon CloudFront", c: "#ff9900" },
  { id: "zoom", name: "Zoom", cat: "web", url: "https://zoom.us/cdn-cgi/trace", via: "Cloudflare", c: "#0b5cff" },

  // Video & music
  { id: "youtube", name: "YouTube", cat: "video", url: "https://www.youtube.com/generate_204", via: "Google", c: "#ff0033" },
  { id: "netflix", name: "Netflix", cat: "video", url: "https://www.netflix.com/favicon.ico", c: "#e50914" },
  { id: "tiktok", name: "TikTok", cat: "video", url: "https://www.tiktok.com/favicon.ico", c: "#25f4ee" },
  { id: "twitch", name: "Twitch", cat: "video", url: "https://www.twitch.tv/favicon.ico", c: "#9146ff" },
  { id: "spotify", name: "Spotify", cat: "video", url: "https://open.spotify.com/favicon.ico", c: "#1ed760" },

  // Social & messaging
  { id: "x", name: "X", cat: "social", url: "https://abs.twimg.com/favicons/twitter.3.ico", c: "#8b8b8b" },
  { id: "instagram", name: "Instagram", cat: "social", url: "https://scontent.cdninstagram.com/", via: "Meta", c: "#e1306c" },
  { id: "facebook", name: "Facebook", cat: "social", url: "https://www.facebook.com/favicon.ico", via: "Meta", c: "#1877f2" },
  { id: "whatsapp", name: "WhatsApp", cat: "social", url: "https://web.whatsapp.com/favicon.ico", via: "Meta", c: "#25d366" },
  { id: "telegram", name: "Telegram", cat: "social", url: "https://venus.web.telegram.org/apiw1", c: "#26a5e4" },
  { id: "discord", name: "Discord", cat: "social", url: "https://discord.com/cdn-cgi/trace", via: "Cloudflare", c: "#5865f2" },
  { id: "reddit", name: "Reddit", cat: "social", url: "https://www.reddit.com/robots.txt", via: "Fastly", c: "#ff4500" },

  // Developers
  { id: "github", name: "GitHub", cat: "dev", url: "https://github.com/favicon.ico", c: "#8b8b8b" },
  { id: "npm", name: "npm", cat: "dev", url: "https://registry.npmjs.org/-/ping", via: "Cloudflare", c: "#cb3837" },
  { id: "dockerhub", name: "Docker Hub", cat: "dev", url: "https://registry-1.docker.io/v2/", c: "#1d63ed" },
  { id: "pypi", name: "PyPI", cat: "dev", url: "https://pypi.org/static/images/favicon.35549fe8.ico", via: "Fastly", c: "#3775a9" },
  { id: "huggingface", name: "Hugging Face", cat: "dev", url: "https://huggingface.co/favicon.ico", m: "HEAD", pop: "x-amz-cf-pop", via: "Amazon CloudFront", c: "#ffbd45" },

  // Gaming
  { id: "steam", name: "Steam", cat: "game", url: "https://store.steampowered.com/favicon.ico", c: "#66c0f4" },
  { id: "playstation", name: "PlayStation", cat: "game", url: "https://www.playstation.com/favicon.ico", via: "Akamai", c: "#0070d1" },
  { id: "xbox", name: "Xbox", cat: "game", url: "https://www.xbox.com/favicon.ico", c: "#107c10" },
  { id: "nintendo", name: "Nintendo", cat: "game", url: "https://www.nintendo.com/favicon.ico", via: "Fastly", c: "#e60012" },
  { id: "epic", name: "Epic Games", cat: "game", url: "https://store.epicgames.com/cdn-cgi/trace", via: "Cloudflare", c: "#8b8b8b" },

  // CDN backbones: most sites above sit on one of these
  // CDN rows follow the list shared with me2cloud and vps2cloud (1ms.dog docs: CDN list). raw: no cache-busting query;
  // Akamai and Azure go back to origin with one. cache: "no-store" still keeps the browser cache out.
  // short: the label in the field, whose name column is 86px; pages and titles use the full name.
  { id: "cloudflare", name: "Cloudflare", cat: "cdn", url: "https://www.cloudflare.com/cdn-cgi/trace", raw: true, pop: "trace", via: "Cloudflare", c: "#f38020" },
  { id: "akamai", name: "Akamai", cat: "cdn", url: "https://store.akamai.steamstatic.com/favicon.ico", raw: true, via: "Akamai", c: "#0096d6" },
  { id: "cloudfront", name: "Amazon CloudFront", short: "CloudFront", cat: "cdn", url: "https://a0.awsstatic.com/libra-css/images/site/fav/favicon.ico", raw: true, pop: "x-amz-cf-pop",
    popUrl: "https://huggingface.co/front/assets/huggingface_logo-noborder.svg", via: "Amazon CloudFront", c: "#8c4fff" },
  { id: "google-cdn", name: "Google Cloud CDN", short: "Google CDN", cat: "cdn", url: "https://www.gstatic.com/generate_204", raw: true, via: "Google", c: "#4285f4" },
  { id: "fastly", name: "Fastly", cat: "cdn", url: "https://fastly.jsdelivr.net/npm/jquery@3.7.1/package.json", raw: true, pop: "x-served-by", via: "Fastly", c: "#ff282d" },
  { id: "azure", name: "Azure Front Door", short: "Front Door", cat: "cdn", url: "https://assets.xboxservices.com/assets/f8/67/f86740d7-eedd-4d9c-a963-76af7e36c4b2.svg?n=Xbox-Follow-Footer_Image-0_Mail_32x32_02.svg", raw: true, via: "Azure Front Door", c: "#0078d4" },
];

// Local packs: what people in a region open every day. PACK_OF maps exit country → pack. Every pack has the same
// length: the pack switches once the exit country is known, and a longer one would push the page down.
export const PACKS = {
  cn: [
    { id: "baidu", name: "百度", cat: "local", url: "https://www.baidu.com/favicon.ico", c: "#2932e1" },
    { id: "bilibili", name: "哔哩哔哩", cat: "local", url: "https://www.bilibili.com/favicon.ico", c: "#fb7299" },
    { id: "wechat", name: "微信", cat: "local", url: "https://weixin.qq.com/favicon.ico", c: "#07c160" },
    { id: "douyin", name: "抖音", cat: "local", url: "https://www.douyin.com/robots.txt", c: "#fe2c55" },
  ],
  tw: [
    { id: "yahoo-tw", name: "Yahoo奇摩", cat: "local", url: "https://tw.yahoo.com/favicon.ico", c: "#6001d2" },
    { id: "line-tw", name: "LINE", cat: "local", url: "https://line.me/favicon.ico", c: "#06c755" },
    { id: "ettoday", name: "ETtoday", cat: "local", url: "https://www.ettoday.net/favicon.ico", c: "#e60012" },
    { id: "ptt", name: "PTT", cat: "local", url: "https://www.ptt.cc/cdn-cgi/trace", c: "#8b8b8b" },
  ],
  jp: [
    { id: "yahoo-jp", name: "Yahoo! JAPAN", cat: "local", url: "https://www.yahoo.co.jp/favicon.ico", c: "#ff0033" },
    { id: "line", name: "LINE", cat: "local", url: "https://line.me/favicon.ico", c: "#06c755" },
    { id: "rakuten", name: "楽天", cat: "local", url: "https://www.rakuten.co.jp/favicon.ico", c: "#bf0000" },
    { id: "niconico", name: "ニコニコ", cat: "local", url: "https://www.nicovideo.jp/favicon.ico", c: "#8b8b8b" },
  ],
  kr: [
    { id: "naver", name: "NAVER", cat: "local", url: "https://www.naver.com/robots.txt", c: "#03c75a" },
    { id: "kakao", name: "Kakao", cat: "local", url: "https://www.kakaocorp.com/robots.txt", c: "#fee500" },
    { id: "coupang", name: "Coupang", cat: "local", url: "https://image7.coupangcdn.com/image/coupang/favicon/v2/favicon.ico", c: "#e52528" },
    { id: "daum", name: "Daum", cat: "local", url: "https://www.daum.net/favicon.ico", c: "#4a7cf6" },
  ],
  ru: [
    { id: "yandex", name: "Яндекс", cat: "local", url: "https://yandex.ru/favicon.ico", c: "#fc3f1d" },
    { id: "vk", name: "VK", cat: "local", url: "https://vk.com/favicon.ico", c: "#0077ff" },
    { id: "wildberries", name: "Wildberries", cat: "local", url: "https://www.wildberries.ru/favicon.ico", c: "#cb11ab" },
    { id: "mailru", name: "Mail.ru", cat: "local", url: "https://mail.ru/favicon.ico", c: "#005ff9" },
  ],
  in: [
    { id: "flipkart", name: "Flipkart", cat: "local", url: "https://static-assets-web.flixcart.com/favicon.ico", c: "#2874f0" },
    { id: "hotstar", name: "JioHotstar", cat: "local", url: "https://www.hotstar.com/robots.txt", m: "HEAD", c: "#1f80e0" },
    { id: "paytm", name: "Paytm", cat: "local", url: "https://paytm.com/favicon.ico", c: "#00baf2" },
    { id: "amazon-in", name: "Amazon.in", cat: "local", url: "https://www.amazon.in/favicon.ico", c: "#ff9900" },
  ],
  sea: [
    { id: "shopee", name: "Shopee", cat: "local", url: "https://shopee.sg/favicon.ico", c: "#ee4d2d" },
    { id: "lazada", name: "Lazada", cat: "local", url: "https://www.lazada.sg/favicon.ico", c: "#0f146d" },
    { id: "grab", name: "Grab", cat: "local", url: "https://www.grab.com/robots.txt", c: "#00b14f" },
    { id: "line-sea", name: "LINE", cat: "local", url: "https://line.me/favicon.ico", c: "#06c755" },
  ],
  eu: [
    { id: "bbc", name: "BBC", cat: "local", url: "https://www.bbc.co.uk/favicon.ico", c: "#bb1919" },
    { id: "booking", name: "Booking.com", cat: "local", url: "https://www.booking.com/robots.txt", m: "HEAD", c: "#003b95" },
    { id: "zalando", name: "Zalando", cat: "local", url: "https://www.zalando.com/favicon.ico", c: "#ff6900" },
    { id: "allegro", name: "Allegro", cat: "local", url: "https://allegro.pl/favicon.ico", c: "#ff5a00" },
  ],
  latam: [
    { id: "mercadolibre", name: "Mercado Libre", cat: "local", url: "https://www.mercadolibre.com/favicon.ico", c: "#ffe600" },
    { id: "globo", name: "Globo", cat: "local", url: "https://www.globo.com/favicon.ico", c: "#f15a24" },
    { id: "nubank", name: "Nubank", cat: "local", url: "https://nubank.com.br/favicon.ico", m: "HEAD", c: "#820ad1" },
    { id: "ifood", name: "iFood", cat: "local", url: "https://www.ifood.com.br/cdn-cgi/trace", c: "#ea1d2c" },
  ],
  na: [
    { id: "espn", name: "ESPN", cat: "local", url: "https://www.espn.com/favicon.ico", c: "#d00" },
    { id: "disneyplus", name: "Disney+", cat: "local", url: "https://www.disneyplus.com/favicon.ico", c: "#113ccf" },
    { id: "yahoo", name: "Yahoo", cat: "local", url: "https://www.yahoo.com/favicon.ico", c: "#6001d2" },
    { id: "target", name: "Target", cat: "local", url: "https://www.target.com/favicon.ico", c: "#cc0000" },
  ],
  me: [
    { id: "talabat", name: "talabat", cat: "local", url: "https://www.talabat.com/cdn-cgi/trace", c: "#ff5a00" },
    { id: "careem", name: "Careem", cat: "local", url: "https://www.careem.com/favicon.ico", c: "#00e784" },
    { id: "aljazeera", name: "Al Jazeera", cat: "local", url: "https://www.aljazeera.com/favicon_aje.ico", c: "#fa9000" },
    { id: "trendyol", name: "Trendyol", cat: "local", url: "https://www.trendyol.com/cdn-cgi/trace", c: "#f27a1a" },
  ],
};

const P = (pack, ccs) => Object.fromEntries(ccs.split(" ").map(cc => [cc, pack]));
export const PACK_OF = {
  ...P("cn", "CN"), ...P("tw", "TW HK MO"), ...P("jp", "JP"), ...P("kr", "KR"), ...P("ru", "RU BY KZ"),
  ...P("in", "IN BD PK LK NP"), ...P("sea", "SG MY TH VN ID PH"),
  ...P("eu", "GB IE DE FR NL BE LU AT CH IT ES PT PL CZ SK HU RO BG GR SE NO DK FI IS EE LV LT SI HR UA"),
  ...P("latam", "BR AR MX CL CO PE UY VE EC BO PY CR PA DO GT"), ...P("na", "US CA"),
  ...P("me", "AE SA QA KW BH OM EG TR IL JO"),
};
export const PACK_IDS = Object.keys(PACKS);

// The field's distance scale, shared by the build (lane colors) and the page (ball positions): log scale from MIN to
// MAX ms; ZONES are the dog-speed limits (zoomies, sprint, trot, stroll; above that is nap).
export const SCALE = { min: 5, max: 1000 };
export const ZONES = [30, 80, 150, 300];
export const pos = ms => Math.max(0, Math.min(1, Math.log(ms / SCALE.min) / Math.log(SCALE.max / SCALE.min)));

// Everyday uses the verdict reports on: [use, services, smooth up to, fine up to] in ms. Streaming buffers and AI
// answers take seconds anyway, so they tolerate more; games and calls feel every round trip.
export const USES = [["game", ["steam", "playstation", "xbox", "nintendo", "epic"], 80, 150], ["call", ["zoom", "whatsapp", "discord", "telegram"], 150, 250],
  ["stream", ["youtube", "netflix", "twitch", "tiktok", "spotify"], 200, 400], ["ai", ["chatgpt", "claude", "gemini", "copilot", "grok", "deepseek"], 200, 400],
  ["dev", ["github", "npm", "dockerhub", "pypi", "huggingface"], 150, 300]];

// Telegram keeps each account in one of five data centers, by the region of its phone number, and each data center
// answers on its own web host (Telegram Web's names for them). The home page measures the one most accounts in the
// visitor's region use (TG_DC_OF, by local pack) and labels it; Telegram's own page tests all five (SUBS).
export const TG_DC = [[1, "pluto", "Miami", "US"], [2, "venus", "Amsterdam", "NL"], [3, "aurora", "Miami", "US"], [4, "vesta", "Amsterdam", "NL"], [5, "flora", "Singapore", "SG"]]
  .map(([dc, host, city, cc]) => ({ id: "tg-dc" + dc, name: `DC${dc} · ${city}`, dc, city, cc, url: `https://${host}.web.telegram.org/apiw1`, c: "#26a5e4" }));
export const TG_DC_OF = { cn: 5, tw: 5, jp: 5, kr: 5, sea: 5, in: 5, eu: 2, ru: 2, me: 2, na: 1, latam: 1 };
// a service page that also tests the service's parts
export const SUBS = { telegram: TG_DC };
// services the Streaming & AI Unlock Check (unlock.1ms.dog) has a page for: id → its slug there. A service page links
// to it when the host announces the check with <meta name="unlock">
export const UNLOCK = { chatgpt: "chatgpt", claude: "claude", gemini: "gemini", copilot: "copilot", grok: "grok", youtube: "youtube",
  netflix: "netflix", tiktok: "tiktok", twitch: "twitch", x: "x-twitter", instagram: "instagram", whatsapp: "whatsapp", telegram: "telegram",
  discord: "discord", reddit: "reddit", disneyplus: "disney-plus" };
