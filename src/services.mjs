// The services the dog plays fetch with. Every visitor gets the global groups; one local pack is added by the exit
// country (the visitor can switch it). Each url is a small, cacheable, same-host answer: no redirect, so the timing
// is one round trip on a reused connection. `npm run verify` checks them all.
//
// id     stable key (results, landing pages /<id>/)
// name   brand name as the brand writes it
// cat    group key, see CATS
// url    what the browser requests (a random query string is added to skip caches)
// m      request method: GET (default), HEAD, or IMG (an <img> load, for hosts that reset fetch)
// c      tile accent color
// land   true → gets its own landing page (/<id>/), for the services people search latency for

export const CATS = ["ai", "web", "video", "social", "dev", "game", "cdn"];

export const SERVICES = [
  // AI
  { id: "chatgpt", name: "ChatGPT", cat: "ai", url: "https://chatgpt.com/favicon.ico", c: "#10a37f", land: true },
  { id: "claude", name: "Claude", cat: "ai", url: "https://claude.ai/favicon.ico", c: "#d97757", land: true },
  { id: "gemini", name: "Gemini", cat: "ai", url: "https://gemini.google.com/favicon.ico", c: "#4f7cf5", land: true },
  { id: "copilot", name: "Copilot", cat: "ai", url: "https://copilot.microsoft.com/favicon.ico", c: "#2a84e8" },
  { id: "grok", name: "Grok", cat: "ai", url: "https://grok.com/robots.txt", c: "#8b8b8b" },
  { id: "deepseek", name: "DeepSeek", cat: "ai", url: "https://chat.deepseek.com/favicon.svg", c: "#4d6bfe", land: true },

  // Search & everyday web
  { id: "google", name: "Google", cat: "web", url: "https://www.google.com/generate_204", c: "#4285f4", land: true },
  { id: "apple", name: "Apple", cat: "web", url: "https://www.apple.com/favicon.ico", c: "#8e8e93" },
  { id: "microsoft", name: "Microsoft", cat: "web", url: "https://www.microsoft.com/favicon.ico", c: "#00a4ef" },
  { id: "wikipedia", name: "Wikipedia", cat: "web", url: "https://www.wikipedia.org/static/favicon/wikipedia.ico", c: "#9a9a9a" },
  { id: "amazon", name: "Amazon", cat: "web", url: "https://www.amazon.com/favicon.ico", c: "#ff9900" },
  { id: "zoom", name: "Zoom", cat: "web", url: "https://zoom.us/favicon.ico", c: "#0b5cff" },

  // Video & music
  { id: "youtube", name: "YouTube", cat: "video", url: "https://www.youtube.com/generate_204", c: "#ff0033", land: true },
  { id: "netflix", name: "Netflix", cat: "video", url: "https://www.netflix.com/favicon.ico", c: "#e50914", land: true },
  { id: "tiktok", name: "TikTok", cat: "video", url: "https://www.tiktok.com/favicon.ico", c: "#25f4ee", land: true },
  { id: "twitch", name: "Twitch", cat: "video", url: "https://www.twitch.tv/favicon.ico", c: "#9146ff" },
  { id: "spotify", name: "Spotify", cat: "video", url: "https://open.spotify.com/favicon.ico", c: "#1ed760" },

  // Social & messaging
  { id: "x", name: "X", cat: "social", url: "https://abs.twimg.com/favicons/twitter.3.ico", c: "#8b8b8b", land: true },
  { id: "instagram", name: "Instagram", cat: "social", url: "https://www.instagram.com/favicon.ico", m: "HEAD", c: "#e1306c" },
  { id: "facebook", name: "Facebook", cat: "social", url: "https://www.facebook.com/favicon.ico", c: "#1877f2" },
  { id: "whatsapp", name: "WhatsApp", cat: "social", url: "https://web.whatsapp.com/favicon.ico", c: "#25d366" },
  { id: "telegram", name: "Telegram", cat: "social", url: "https://web.telegram.org/favicon.ico", c: "#26a5e4", land: true },
  { id: "discord", name: "Discord", cat: "social", url: "https://discord.com/favicon.ico", c: "#5865f2", land: true },
  { id: "reddit", name: "Reddit", cat: "social", url: "https://www.reddit.com/favicon.ico", c: "#ff4500" },

  // Developers
  { id: "github", name: "GitHub", cat: "dev", url: "https://github.com/favicon.ico", c: "#8b8b8b", land: true },
  { id: "npm", name: "npm", cat: "dev", url: "https://registry.npmjs.org/-/ping", c: "#cb3837" },
  { id: "dockerhub", name: "Docker Hub", cat: "dev", url: "https://registry-1.docker.io/v2/", c: "#1d63ed" },
  { id: "pypi", name: "PyPI", cat: "dev", url: "https://pypi.org/static/images/favicon.35549fe8.ico", c: "#3775a9" },
  { id: "huggingface", name: "Hugging Face", cat: "dev", url: "https://huggingface.co/robots.txt", c: "#ffbd45" },

  // Gaming
  { id: "steam", name: "Steam", cat: "game", url: "https://store.steampowered.com/favicon.ico", c: "#66c0f4", land: true },
  { id: "playstation", name: "PlayStation", cat: "game", url: "https://www.playstation.com/favicon.ico", c: "#0070d1" },
  { id: "xbox", name: "Xbox", cat: "game", url: "https://www.xbox.com/favicon.ico", c: "#107c10" },
  { id: "epic", name: "Epic Games", cat: "game", url: "https://store.epicgames.com/favicon.ico", c: "#8b8b8b" },

  // CDN backbones: most sites above sit on one of these
  { id: "cloudflare", name: "Cloudflare", cat: "cdn", url: "https://speed.cloudflare.com/__down?bytes=0", c: "#f38020" },
  { id: "fastly", name: "Fastly", cat: "cdn", url: "https://www.fastly.com/favicon.ico", c: "#ff282d" },
  { id: "akamai", name: "Akamai", cat: "cdn", url: "https://www.akamai.com/favicon.ico", c: "#0096d6" },
  { id: "cloudfront", name: "CloudFront", cat: "cdn", url: "https://d1.awsstatic.com/favicon.ico", c: "#8c4fff" },
];

// Local packs: what people in a region open every day. PACK_OF maps exit country → pack.
export const PACKS = {
  cn: [
    { id: "baidu", name: "百度", cat: "local", url: "https://www.baidu.com/favicon.ico", c: "#2932e1" },
    { id: "bilibili", name: "哔哩哔哩", cat: "local", url: "https://www.bilibili.com/favicon.ico", c: "#fb7299" },
    { id: "wechat", name: "微信", cat: "local", url: "https://weixin.qq.com/favicon.ico", c: "#07c160" },
    { id: "taobao", name: "淘宝", cat: "local", url: "https://www.taobao.com/robots.txt", c: "#ff5000" },
    { id: "douyin", name: "抖音", cat: "local", url: "https://www.douyin.com/robots.txt", c: "#fe2c55" },
  ],
  tw: [
    { id: "yahoo-tw", name: "Yahoo奇摩", cat: "local", url: "https://tw.yahoo.com/favicon.ico", c: "#6001d2" },
    { id: "line-tw", name: "LINE", cat: "local", url: "https://line.me/favicon.ico", c: "#06c755" },
    { id: "ettoday", name: "ETtoday", cat: "local", url: "https://www.ettoday.net/favicon.ico", c: "#e60012" },
    { id: "ptt", name: "PTT", cat: "local", url: "https://www.ptt.cc/favicon.ico", c: "#8b8b8b" },
  ],
  jp: [
    { id: "yahoo-jp", name: "Yahoo! JAPAN", cat: "local", url: "https://www.yahoo.co.jp/favicon.ico", c: "#ff0033" },
    { id: "line", name: "LINE", cat: "local", url: "https://line.me/favicon.ico", c: "#06c755" },
    { id: "rakuten", name: "楽天", cat: "local", url: "https://www.rakuten.co.jp/favicon.ico", c: "#bf0000" },
    { id: "niconico", name: "ニコニコ", cat: "local", url: "https://www.nicovideo.jp/favicon.ico", c: "#8b8b8b" },
  ],
  kr: [
    { id: "naver", name: "NAVER", cat: "local", url: "https://www.naver.com/favicon.ico", c: "#03c75a" },
    { id: "kakao", name: "Kakao", cat: "local", url: "https://www.kakaocorp.com/robots.txt", c: "#fee500" },
    { id: "coupang", name: "Coupang", cat: "local", url: "https://www.coupang.com/favicon.ico", c: "#e52528" },
    { id: "daum", name: "Daum", cat: "local", url: "https://www.daum.net/favicon.ico", c: "#4a7cf6" },
  ],
  ru: [
    { id: "yandex", name: "Яндекс", cat: "local", url: "https://yandex.ru/favicon.ico", c: "#fc3f1d" },
    { id: "vk", name: "VK", cat: "local", url: "https://vk.com/favicon.ico", c: "#0077ff" },
    { id: "wildberries", name: "Wildberries", cat: "local", url: "https://www.wildberries.ru/favicon.ico", c: "#cb11ab" },
    { id: "mailru", name: "Mail.ru", cat: "local", url: "https://mail.ru/favicon.ico", c: "#005ff9" },
  ],
  in: [
    { id: "flipkart", name: "Flipkart", cat: "local", url: "https://www.flipkart.com/favicon.ico", c: "#2874f0" },
    { id: "hotstar", name: "JioHotstar", cat: "local", url: "https://www.hotstar.com/favicon.ico", m: "HEAD", c: "#1f80e0" },
    { id: "paytm", name: "Paytm", cat: "local", url: "https://paytm.com/favicon.ico", c: "#00baf2" },
    { id: "amazon-in", name: "Amazon.in", cat: "local", url: "https://www.amazon.in/favicon.ico", c: "#ff9900" },
  ],
  sea: [
    { id: "shopee", name: "Shopee", cat: "local", url: "https://shopee.sg/favicon.ico", c: "#ee4d2d" },
    { id: "lazada", name: "Lazada", cat: "local", url: "https://www.lazada.sg/favicon.ico", c: "#0f146d" },
    { id: "grab", name: "Grab", cat: "local", url: "https://www.grab.com/favicon.ico", c: "#00b14f" },
    { id: "line-sea", name: "LINE", cat: "local", url: "https://line.me/favicon.ico", c: "#06c755" },
  ],
  eu: [
    { id: "bbc", name: "BBC", cat: "local", url: "https://www.bbc.co.uk/favicon.ico", c: "#bb1919" },
    { id: "booking", name: "Booking.com", cat: "local", url: "https://www.booking.com/favicon.ico", c: "#003b95" },
    { id: "zalando", name: "Zalando", cat: "local", url: "https://www.zalando.com/favicon.ico", c: "#ff6900" },
    { id: "allegro", name: "Allegro", cat: "local", url: "https://allegro.pl/favicon.ico", c: "#ff5a00" },
  ],
  latam: [
    { id: "mercadolibre", name: "Mercado Libre", cat: "local", url: "https://www.mercadolibre.com/favicon.ico", c: "#ffe600" },
    { id: "globo", name: "Globo", cat: "local", url: "https://www.globo.com/favicon.ico", c: "#f15a24" },
    { id: "nubank", name: "Nubank", cat: "local", url: "https://nubank.com.br/favicon.ico", m: "HEAD", c: "#820ad1" },
    { id: "uol", name: "UOL", cat: "local", url: "https://www.uol.com.br/favicon.ico", c: "#f6a500" },
  ],
  na: [
    { id: "espn", name: "ESPN", cat: "local", url: "https://www.espn.com/favicon.ico", c: "#d00" },
    { id: "hulu", name: "Hulu", cat: "local", url: "https://www.hulu.com/favicon.ico", c: "#1ce783" },
    { id: "walmart", name: "Walmart", cat: "local", url: "https://www.walmart.com/favicon.ico", c: "#0071dc" },
    { id: "target", name: "Target", cat: "local", url: "https://www.target.com/favicon.ico", c: "#cc0000" },
  ],
  me: [
    { id: "noon", name: "noon", cat: "local", url: "https://www.noon.com/favicon.ico", c: "#feee00" },
    { id: "careem", name: "Careem", cat: "local", url: "https://www.careem.com/favicon.ico", c: "#00e784" },
    { id: "aljazeera", name: "Al Jazeera", cat: "local", url: "https://www.aljazeera.com/favicon_aje.ico", c: "#fa9000" },
    { id: "trendyol", name: "Trendyol", cat: "local", url: "https://www.trendyol.com/favicon.ico", c: "#f27a1a" },
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
