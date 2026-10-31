# 1ms-index

1ms.dog 的首页。私有仓库，不开源。回答两个问题：

1. **网络从哪出去？** 同时询问多组检测点（国内站点 ipip.net、Cloudflare、ip.sb、ipinfo.io、仅 IPv4 和仅 IPv6 的检测、WebRTC），按网络（ASN）归并后列出每个出口，并标成「本地」或「代理」。分流代理按目的地选路，所以单个检测点只能看到它自己那条路。如果出口在中国或伊朗，而通常连不上的服务却能连上，页面会提示有一个检测点看不到的出口。
2. **到各大服务多快？** 在浏览器里对 40 个全球服务和一个按出口国家选的本地服务包计时。方法和 Me2Cloud 一样：第一个请求只用来建立连接，之后复用这条连接计时，取中位数。每个服务是一个球，延迟越高扔得越远（对数刻度），颜色就是狗狗的速度档位。

所有请求都由访问者的浏览器直接发出，1ms.dog 不接收任何结果。站点是纯静态资源，没有 Worker 脚本。

## 文件

```
src/page.html        页面模板
src/app.js           浏览器端：出口检测、计时、狗狗心情（构建时在前面加上服务清单 SVC）
src/services.mjs     服务清单、本地服务包、国家到服务包的映射、距离刻度：唯一的数据来源
src/i18n/*.mjs       10 种语言，en 是基准，缺的键回退到英文
src/style.css        设计变量和顶栏（与各工具一致）
src/layout.css       首页布局
src/fonts.css        自托管 Geist 字体
src/brand/source/    狗狗原图（public/assets/shiba-run.svg 由它压缩生成）
scripts/build.mjs    生成 public/：每种语言的首页、每个热门服务的落地页、sitemap、robots、llms.txt、_headers
scripts/assets.mjs   生成链接预览图 public/og/<lang>.png
scripts/verify.mjs   检查每个服务地址：一次请求、不跳转
scripts/dev.mjs      本地预览，带线上同样的响应头
```

## 常用命令

```bash
npm run build      # 改了 src/ 之后重新生成 public/（public/ 要提交）
npm test           # public/ 是否最新 + 接入约定和 SEO 检查
npm run dev        # http://localhost:8787
npm run verify     # 检查服务地址；换网络多跑几次
npm run assets     # 改了标题或狗狗之后重新生成预览图
```

狗狗 SVG 改了以后，用 1ms-shell 的 svgo 配置压缩（一位小数精度，原因见 1ms-shell 的 docs/lessons.md）：

```bash
npx svgo --config src/brand/svgo.config.cjs -i src/brand/source/1ms_shiba_running_refined.svg -o public/assets/shiba-run.svg
```

## 服务清单

- 每个地址必须**一次请求就有响应、不跳转**，响应体尽量小（favicon、`generate_204`、`robots.txt`）。响应体大时用 `m: "HEAD"`。改动后运行 `npm run verify`。
- 某些地区访问不到的服务在当地显示「没叼回来」，这是如实的结果，不要删掉。
- `land: true` 的服务有自己的落地页（`/chatgpt/`、`/zh-cn/chatgpt/`……），用于搜索「ChatGPT 延迟」这类词。

## 部署

按 1ms-shell 的 `docs/tool-contract.md` 接入：

- 纯静态资源 Worker（`wrangler.toml` 只有 `[assets]`），`workers_dev = false`，不绑自定义域。
- `1ms.dog` 由 1ms-shell 的路由接管：注入导航条、统计、跨站主题和语言同步、统一 404。
- 静态资源走直达路由（`/assets/*`、`/flags/*`、`/og/*`、favicon、robots、sitemap、llms.txt），不经过 shell。
- 主题和语言的 localStorage 键：`1ms:theme`、`1ms:lang`。
