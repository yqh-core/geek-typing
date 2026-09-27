# PRODUCTION_CHECKLIST.md · 生产环境运行检查单

> 状态：`🔄 混合` —— **标注 `【实测】` 的条目为本轮线上实跑结果**；标注 `【待执行】` 的条目给出了确切命令但未在本轮执行
> 环境：Windows 11 + Git Bash；Node `v22.22.2`；curl `8.21.0`（Schannel / brotli 1.2.0）
> 部署目标：**Cloudflare Pages，项目名 `geek-typing`**（来源：`.github/workflows/deploy.yml` 的 `--project-name=geek-typing`）
> 生产地址：`https://geek-typing.pages.dev/`
> 本文件用途：**上线后与运行期**逐项确认"线上是活的、是对的、是安全的"。区别于 `RELEASE_CHECKLIST.md` 的"发布前"。

---

## 0. 本机执行前提（重要，否则会得到假失败）

| 项 | 说明 |
|---|---|
| 本机代理 | `https_proxy=http://127.0.0.1:64500` 等 4 个变量**存在**。探测线上域名时**必须**加 `--noproxy '*'`，否则请求会被本机代理拦截（历史记录见 `FLAKY-002`） |
| 无 UA 会 403 | 用 `python urllib` 裸请求会被 Cloudflare 拒绝（`HTTP 403`）。**用 `curl`，或带浏览器 UA** |
| 证书告警 | 本机 `python` 的 CA 库报 `certificate has expired`，**`curl` 侧 TLS 握手正常**。这是**本机证书库问题，不是站点问题** —— 不要据此判定 HTTPS 异常 |
| 目录权限 | `curl -o <相对路径>` 在仓库根会静默失败，请写到 `$TMPDIR` 或用管道 `-` |

---

## 1. 部署产物完整性

### 1.1 本地 `dist/` 结构

| # | 检查 | 确切命令 | 期望结果 | 判定 |
|---|---|---|---|---|
| 1.1.1 | 产物目录存在 | `ls dist/` | 见下表 | ✅ |
| 1.1.2 | `dist/assets/` 存在且非空 | `ls dist/assets/` | 5 个文件（1 CSS + 4 JS） | ✅ |
| 1.1.3 | `dist` 缺失时**必须判失败**（不可假装通过） | `node scripts/check-bundle.mjs` | `[check-bundle] dist 不存在：请先 npm run build` 且 `exit 1` | ✅ |
| 1.1.4 | 产物结构是否与预期一致 | 对照下表逐项 | 逐项对齐 | 👤 |
| 1.1.5 | 是否有意外文件混入 | `ls -la dist/` | 无 `.map`、无临时文件（**当前实测无 sourcemap**） | 👤 |

**本轮实测的 `dist/` 结构**（`npm run build` 之后）：

```
dist/
├── index.html                     1.96 KiB raw        （来自 Vite 处理）
├── assets/
│   ├── index-DWqJDTkw.css        23.08 KiB raw
│   ├── index-Dw5EkkBq.js        381.09 KiB raw       ← 主 chunk
│   ├── words-Dfqbfxph.js        464.04 KiB raw       ← toefl
│   ├── words-DO8i2GAI.js        471.22 KiB raw       ← ielts
│   └── words-LP9e320F.js        471.76 KiB raw       ← kaoyan
├── sw.js                          4.03 KiB           （来自 public/ 原样拷贝）
├── _headers                       0.56 KiB           （来自 public/ 原样拷贝）
├── robots.txt                     4.07 KiB           （来自 public/ 原样拷贝）
├── sitemap.xml                    0.23 KiB           （来自 public/ 原样拷贝）
├── manifest.webmanifest           0.79 KiB           （来自 public/ 原样拷贝）
├── favicon.svg                    9.30 KiB
├── icons.svg                      4.91 KiB
├── icon-192.png                   0.71 KiB
└── icon-512.png                   2.63 KiB
```

> **口径提醒**：vite 输出用 **kB（十进制 1000）**，上表用 **KiB（二进制 1024）**。同一文件两个数字，都正确。

### 1.2 hash 命名

| # | 检查 | 确切命令 | 期望结果 | 判定 |
|---|---|---|---|---|
| 1.2.1 | 主 chunk 带内容 hash | `ls dist/assets/index-*.js` | 形如 `index-Dw5EkkBq.js`（`-[A-Za-z0-9_-]{8}\.js`） | ✅ |
| 1.2.2 | 懒加载 chunk 带 hash | `ls dist/assets/words-*.js` | 3 个，均带 hash | ✅ |
| 1.2.3 | CSS 带 hash | `ls dist/assets/*.css` | `index-DWqJDTkw.css` | ✅ |
| 1.2.4 | **不带 hash 的静态资源清单** | `ls dist/ \| grep -v assets` | `sw.js`/`_headers`/`manifest.webmanifest`/`robots.txt`/`sitemap.xml`/图标 —— 这些**故意不带 hash**，故不能长缓存 | 👤 |
| 1.2.5 | 本地与线上 hash 是否一致 | `curl -s --noproxy '*' https://geek-typing.pages.dev/ \| grep -o 'assets/index-[^"]*\.js'` vs `ls dist/assets/index-*.js` | **当前不一致**：线上 `index-Cawl4_-q.js` / 本地 `index-Dw5EkkBq.js` | 👤 🔴 |

> **1.2.5 是"部署漂移"探测器。** 不一致有两种合理解释：(a) 本地改了源码未部署；(b) 本地 `dist` 是旧构建。**两种都说明"你正在拿本地产物比对线上"，此时 `npm run test:smoke` 的 A3 必然失败。** 见 §9 与 `FLAKY-001`。

### 1.3 产物完整性小结（实测）

| 项 | 值 |
|---|---|
| `dist/` 全树文件数 | **15** |
| 全树 raw 合计 | **1840.40 KiB** |
| 全树 gzip 合计 | **629.05 KiB** |
| 全树压缩比 | **34.2%** |
| 首屏关键路径（`index.html` + 主 chunk + 主 CSS）gzip 合计 | **124.87 KiB**（0.96 + 118.57 + 5.34） |

---

## 2. `public/_headers` 安全头实际生效验证

### 2.1 `public/_headers` 源文件全文（实测，可读）

```
# 全局安全响应头
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: SAMEORIGIN
  Cross-Origin-Opener-Policy: same-origin

# Vite 带 hash 的静态资源：强缓存一年（内容变化 URL 就会变，安全）
/assets/*
  Cache-Control: public, max-age=31536000, immutable

# SW 自身禁止 HTTP 缓存：保证新版本 Service Worker 能被浏览器及时探测与更新
/sw.js
  Cache-Control: no-cache

# SVG 图标同样带指纹，可放心长缓存
/icons.svg
  Cache-Control: public, max-age=604800
```

### 2.2 逐条线上验证

| # | 检查 | 确切命令 | 期望结果 | 实测结果 | 判定 |
|---|---|---|---|---|---|
| 2.2.1 | `X-Content-Type-Options`（全局） | `curl -sSI --noproxy '*' $P/ \| grep -i x-content-type-options` | `nosniff` | ✅ `nosniff` | ✅ |
| 2.2.2 | `Referrer-Policy`（全局） | 同上，grep `referrer-policy` | `strict-origin-when-cross-origin` | ✅ 一致 | ✅ |
| 2.2.3 | `X-Frame-Options`（全局） | 同上，grep `x-frame-options` | `SAMEORIGIN` | ✅ 一致 | ✅ |
| 2.2.4 | `Cross-Origin-Opener-Policy`（全局） | 同上，grep `cross-origin-opener-policy` | `same-origin` | ✅ 一致 | ✅ |
| 2.2.5 | 4 条头在 `/assets/*` 上也生效 | `curl -sSI --noproxy '*' $P/assets/<live-main.js> \| grep -iE "x-content-type-options\|referrer-policy\|x-frame-options\|cross-origin-opener-policy"` | 4 条齐全 | ✅ 4 条齐全 | ✅ |
| 2.2.6 | `/assets/*` immutable 强缓存 | `curl -sSI --noproxy '*' $P/assets/<live-main.js> \| grep -i cache-control` | `public, max-age=31536000, immutable` | ✅ 一致 | ✅ |
| 2.2.7 | `/sw.js` 禁止 HTTP 缓存 | `curl -sSI --noproxy '*' $P/sw.js \| grep -i cache-control` | `no-cache` | ✅ `no-cache` | ✅ |
| 2.2.8 | `/icons.svg` 缓存一周 | `curl -sSI --noproxy '*' $P/icons.svg \| grep -i cache-control` | `public, max-age=604800` | 【待执行】 | 👤 |
| 2.2.9 | `/` 的缓存策略 | `curl -sSI --noproxy '*' $P/ \| grep -i cache-control` | `public, max-age=0, must-revalidate` | ✅ 一致 | ✅ |
| 2.2.10 | 🔴 有无 CSP | `curl -sSI --noproxy '*' $P/ \| grep -i content-security-policy` | ❌ **零命中** | ✅ 实测零命中 | 👤 |
| 2.2.11 | 🔴 有无 HSTS | `curl -sSI --noproxy '*' $P/ \| grep -i strict-transport-security` | ❌ **未下发** | ✅ 实测零命中 | 👤 |
| 2.2.12 | 🔴 有无 `Permissions-Policy` / `X-XSS-Protection` | 同上，grep 两项 | ❌ 均零命中 | ✅ 实测零命中 | 👤 |

> `$P` = `https://geek-typing.pages.dev`（下同）。
> **安全头清点结论（实测）**：`_headers` 声明的 **4 条全局头在生产全部生效**，且覆盖到 `/assets/*`。**缺 3 类**：CSP（`SECURITY-001`）、HSTS、`Permissions-Policy`。
> **为什么缺 CSP 值得单列**：本项目**无内联脚本、无外部 CDN、仅 4 个运行时依赖** —— 上严格 CSP 的条件已成熟。`Content-Security-Policy` 在 `public/_headers`、`index.html`、`vite.config.ts`、`src/` 中**零命中**。

### 2.3 安全头验证的一条实际约束

| 项 | 说明 |
|---|---|
| CF Pages 的 `_headers` 是否被平台读取 | 实测**是**（4 条头生效即为证据） |
| HSTS 是否可在 `_headers` 中配置 | **未能实测确认**。当前响应头未下发 HSTS；Cloudflare 面板侧是否已开启（面板 HSTS 会在边缘注入且可能不改回源 `_headers`）**无 API 凭据，未能核实** |

---

## 3. Service Worker 与离线能力

| # | 检查 | 确切命令 | 期望结果 | 实测结果 | 判定 |
|---|---|---|---|---|---|
| 3.1 | `/sw.js` 可达 | `curl -sS -o /dev/null -w "%{http_code}\n" --noproxy '*' $P/sw.js` | `200` | ✅ 200 | ✅ |
| 3.2 | `/sw.js` 内容类型正确 | `curl -sSI --noproxy '*' $P/sw.js \| grep -i content-type` | `application/javascript` | ✅ 一致 | ✅ |
| 3.3 | 版本串唯一且正确 | `curl -s --noproxy '*' $P/sw.js \| grep -o "gt-shell-v[0-9]*" \| sort -u` | 唯一值 `gt-shell-v3` | ✅ 唯一值 `gt-shell-v3` | ✅ |
| 3.4 | SW 生命周期自检（安装→激活→接管→缓存） | `npm run test:prod`（`node tests/offline-audit.mjs --prod`） | `结论：✅ 全部通过` | 【待执行】 | ✅ |
| 3.5 | 全新访客立即接管 + 缓存仅 `gt-shell-v3` | `npm run test:smoke` Part B1 | `✅` | 【待执行】 | ✅ |
| 3.6 | 断网 reload 走缓存 | `npm run test:smoke` Part B2 | `✅` | 【待执行】 | ✅ |
| 3.7 | 升级路径：注入 `gt-shell-v1` 残留 → 被清理 → 断网可用 | `npm run test:smoke` Part B3 | `✅` | 【待执行】 | ✅ |
| 3.8 | 缓存中无 `redirected=true` 毒条目 | 见 `3.4` 态 4 | `✅` | 【待执行】 | ✅ |
| 3.9 | 浏览器端确认 SW 已接管 | DevTools → Application → Service Workers | 状态 `activated and is running`；`/` 出现在 "controlled" | 【待执行】 | 👤 |
| 3.10 | 缓存条目清点 | DevTools → Application → Cache Storage → `gt-shell-v3` | 含 `/`、`/index.html`、`/assets/*`（install 阶段解析 HTML 补入）、图标、manifest | 【待执行】 | 👤 |
| 3.11 | 🔴 SW 更新提示 | — | **不存在**（缺口 O-2）。`skipWaiting()` + `clients.claim()` 为**立即接管**，用户无感知版本变更 | ✅ 已确认代码行为（`public/sw.js`） | 👤 |
| 3.12 | 🔴 离线状态 UI | Grep `navigator.onLine` / `offline` 于 `src/components/` | **零命中**（`UX-001`）—— 离线可用但应用层零提示 | ✅ 已确认零命中 | 👤 |
| 3.13 | 🔴 无"清理缓存"用户入口 | — | **不存在**（缺口 O-4） | ✅ 已确认 | 👤 |

**关键设计依赖（实测确认）**：`/sw.js` 的 `Cache-Control: no-cache` 是**整套升级链路的启动条件**。若 `sw.js` 自己被长时间缓存，浏览器永远发现不了新版本，`activate` 里的旧缓存清理逻辑永远不会执行。`test:smoke` 的 **A2** 正是守这一点。**本轮实测该项通过。**

---

## 4. SPA fallback 路由

| # | 检查 | 确切命令 | 期望结果 | 实测结果 | 判定 |
|---|---|---|---|---|---|
| 4.1 | `/index.html` 重定向到 `/` | `curl -sSI --noproxy '*' $P/index.html \| head -3` | `HTTP/1.1 308` + `location: https://geek-typing.pages.dev/` | ✅ 308 | ✅ |
| 4.2 | 深层路径回落到首页（由前端处理路由） | `curl -sS -o /dev/null -w "%{http_code} %{content_type}\n" --noproxy '*' $P/review` | `200 text/html` | ✅ `200 text/html; charset=utf-8` | ✅ |
| 4.3 | 另一深层路径同样回落 | 同上，`$P/progress` | `200 text/html` | ✅ `200 text/html; charset=utf-8` | ✅ |
| 4.4 | 任意不存在路径回落（不 404） | 同上，`$P/nonexistent-xyz` | `200 text/html` | ✅ `200 text/html; charset=utf-8`（2007 B） | ✅ |
| 4.5 | 回落内容确实是首页 | `curl -s --noproxy '*' $P/review \| grep -o "<title>[^<]*</title>"` | `<title>Geek Typing · 极客打字背单词</title>` | 【待执行】 | ✅ |
| 4.6 | 🔴 **缺失静态资源也返回 HTML（软 404）** | `curl -sS -o /dev/null -w "%{http_code} %{content_type} %{size_download}\n" --noproxy '*' $P/assets/does-not-exist.js` | **实测 `200 text/html; charset=utf-8 2007`** | ✅ 已复现 | 👤 🔴 |
| 4.7 | 浏览器地址栏深链可用 | 浏览器打开 `https://geek-typing.pages.dev/review` 后刷新 | 页面正常渲染，URL 保持 `/review` | 【待执行】 | 👤 |

> **4.6 值得单独说明（实测发现）**：`/assets/does-not-exist.js` 返回 **200 + `text/html`（首页 2007 B）**，而不是 404。
> **机制**：这是 Cloudflare Pages 的 SPA fallback 行为 —— 它**优先匹配 HTML 回落，然后再看 `public/404.html`**（本项目无 `404.html`）。
> **三个后果**（⚠️ **第 ③ 条最严重，是一个高危缺陷，不是"信息质量"问题**）：
> ① **对 SEO**：任意乱写的 URL 都返回 200 首页，可能产生"软 404"与重复内容（`canonical` 已指向 `/`，缓解但不消除）。
> ② **对调试**：**引用错文件名时不会 404，而是拿到 HTML 并被解析为脚本 ⇒ 报 `Unexpected token '<'`**。排查者容易误以为是构建或 SW 问题，实际是文件名写错。
> ③ 🔴 **对 SW 缓存（最严重）**：`public/sw.js` 写入缓存时**不校验 Content-Type**，而 `/assets/*` 又是**缓存优先**。
> 当线上/本地出现 hash 漂移时，SW 会把这份 **2007 B 的 HTML 缓存进 `/assets/<hash>.js`**，此后该 URL **永久返回 HTML**；
> 叠加 `public/_headers` 的 `X-Content-Type-Options: nosniff`，浏览器**必定拒绝执行** ⇒ **用户永久白屏，且无法自动恢复**。
> **完整链路、原始证据与修复方案见 `KNOWN_ISSUES.md#BUG-002`。** 本项 4.6 是那条链路的第一环。
> **`canonical` 缓解**：`index.html:35` 的 `<link rel="canonical" href="https://geek-typing.pages.dev/" />` 会把所有回落页面归一到 `/`。

---

## 5. 资源缓存策略（三层协同）

| 层 | 规则 | 作用域 | 实测确认 |
|---|---|---|---|
| **HTTP 缓存**（`public/_headers` → CF Pages） | `/assets/*` → `public, max-age=31536000, immutable` | 带 hash 的 JS/CSS | ✅ 实测生效 |
| **HTTP 缓存** | `/sw.js` → `no-cache` | SW 自身 | ✅ 实测生效 |
| **HTTP 缓存** | `/icons.svg` → `public, max-age=604800` | 图标 | 【待执行】 |
| **HTTP 缓存**（平台默认） | `/` → `public, max-age=0, must-revalidate` | 首页 HTML（**不带 hash**） | ✅ 实测生效 |
| **Cache Storage**（`public/sw.js` 策略 A） | `/assets/*` → **cache-first** | 带 hash 静态资源 | ✅ 代码 + `test:offline` 态 4 |
| **Cache Storage**（策略 B） | 其余 → **network-first**，断网回落 `req` → `/index.html` → `/`（三级兜底） | 页面 | ✅ 代码 + `test:offline` 态 2 |

### 5.1 逐条验证

| # | 检查 | 确切命令 | 期望结果 | 判定 |
|---|---|---|---|---|
| 5.1.1 | 带 hash 资源一年强缓存 | 见 `2.2.6` | `max-age=31536000, immutable` | ✅ |
| 5.1.2 | 不带 hash 的首页不长效缓存 | 见 `2.2.9` | `max-age=0, must-revalidate` | ✅ |
| 5.1.3 | `sw.js` 不被缓存（升级链路前提） | 见 `2.2.7` | `no-cache` | ✅ |
| 5.1.4 | 边缘压缩生效（实测传输量） | 见 §6 | 见 §6 表 | ✅ |
| 5.1.5 | 二次访问命中缓存（DevTools 验证） | DevTools → Network → 勾 Disable cache **取消** → 刷新首页 | 主 chunk / CSS 显示 `(disk cache)` 或 `(memory cache)`，`Size` 列显示 `0 B` / 极小 | 【待执行】 👤 |
| 5.1.6 | 断网后 `/assets/*` 走 Cache Storage 不出网络请求 | DevTools → Application → Service Workers 勾 Offline → 刷新 | 页面正常；Network 面板中 `/assets/*` 来源为 `ServiceWorker` | 【待执行】 👤 |
| 5.1.7 | 三级兜底生效（深链断网） | 离线状态下访问 `/review` 并刷新 | 页面正常（回落到 `/index.html`） | 【待执行】 👤 |
| 5.1.8 | ⚪ 无缓存容量上限处理 | — | **无降级策略**（缺口 O-3） | 👤 |
| 5.1.9 | ⚪ 运行时动态请求资源不进预缓存 | — | `precacheShell()` 只解析首页 HTML（缺口 O-5）—— 未来引入 `/audio/*` 时断网不可用 | 👤 |

---

## 6. 边缘压缩与传输实测

| 资源 | 无压缩（identity） | gzip | brotli | br 相对 raw | 判定 |
|---|---|---|---|---|---|
| `/`（首页 HTML） | 2007 B | 985 B | **912 B** | 54.6% | ✅ |
| `/assets/index-Cawl4_-q.js`（线上主 chunk） | 390201 B | 121283 B | **121375 B** | 68.9% | ✅ |
| `/assets/index-DWqJDTkw.css` | 23632 B | 5472 B | **5495 B** | 76.7% | ✅ |
| `/sw.js` | 7619 B | 3441 B | **4178 B** | 54.9% | ✅ |

**判定命令**（对任一资源）：

```bash
for enc in br gzip identity; do
  printf "%-8s " "$enc"
  curl -sS -o /dev/null --noproxy '*' -H "Accept-Encoding: $enc" \
    -w "transferred=%{size_download}\n" https://geek-typing.pages.dev/
done
```

| # | 检查 | 期望结果 | 实测 | 判定 |
|---|---|---|---|---|
| 6.1 | 发送 `Accept-Encoding: br` 时响应带 `Content-Encoding: br` | 头存在 | ✅ 存在 | ✅ |
| 6.2 | 发送 `Accept-Encoding: br, gzip` 时边缘选择 br | `Content-Encoding: br` | ✅ 选择 br | ✅ |
| 6.3 | 不发送 `Accept-Encoding` 时**不压缩** | 无 `Content-Encoding` | ✅ 无（2007 B 原样） | ✅ |
| 6.4 | ⚪ 主 chunk 的 br 与 gzip 体积差异 | 期望 br 更小 | **实测 br 121375 B > gzip 121283 B**（差 92 B）—— JS 上两者几乎等价，**不构成异常** | 👤 |

> **6.4 值得记一笔**：主 chunk（390 KB JS）的 brotli 输出**略大于** gzip。这是 CF 边缘默认 brotli 参数下的正常现象（zlib level 9 对已高度重复的 JSON-in-JS 词表压缩得很好）。**不要因此判定"边缘压缩配错了"。**

---

## 7. Cloudflare Pages 项目配置核实

### 7.1 仓库侧可核实的事实（实测自 `.github/workflows/deploy.yml`）

| 项 | 值 | 证据 |
|---|---|---|
| 平台 | Cloudflare Pages | `deploy.yml` 使用 `cloudflare/wrangler-action@v3` |
| 项目名 | `geek-typing` | `command: pages deploy dist --project-name=geek-typing --commit-dirty=true` |
| 生产分支 | `main` | `on.push.branches: [main]` + `if: github.ref == 'refs/heads/main'` |
| 发布分支参数 | **不带 `--branch`** | 注释原文：`不带 --branch，确保发布到生产环境（https://geek-typing.pages.dev）` |
| 脏工作区 | **允许** | `--commit-dirty=true` ⇒ 部署产物可能与 git 提交不一致 |
| 环境数 | **1**（只有生产） | 无 staging / preview 分支配置 |
| 并发控制 | `cancel-in-progress: true` | `concurrency.group: ${{ github.workflow }}-${{ github.ref }}` |
| 权限 | `contents: read` / `deployments: write` | `permissions:` 段 |
| Secrets 前置自检 | **有**（值得称赞的设计） | 第 5 步校验 `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` 非空 |
| 部署后自动验证 | **无** | `test:smoke` 需手动跑 |

### 7.2 需在 Cloudflare 面板人工核实的项

| # | 检查 | 操作路径 | 期望 | 判定 |
|---|---|---|---|---|
| 7.2.1 | 项目名与仓库一致 | CF Dashboard → Workers & Pages → 项目列表 | 存在名为 `geek-typing` 的 Pages 项目 | 👤 |
| 7.2.2 | 生产域名 | 项目 → Custom domains / Deployments | `geek-typing.pages.dev` 为 Production | 👤 |
| 7.2.3 | 是否为 Git 集成还是 Direct Upload | 项目 → Settings → Builds & deployments | 需确认：本仓库走 **Wrangler Direct Upload**（CI 侧），而非 Git 集成 | 👤 |
| 7.2.4 | 构建配置（若为 Git 集成） | Settings → Build configuration | 本仓库并非 Git 集成部署，**该面板项应不生效**；需确认不影响 CI 上传 | 👤 |
| 7.2.5 | 最近一次部署的时间与 commit | 项目 → Deployments | 与线上 bundle hash 对应（当前应为产出 `index-Cawl4_-q.js` 的那次） | 👤 |
| 7.2.6 | 是否有 Preview 部署能力但未使用 | 项目 → Deployments 列表 | **有能力但未使用**（`--commit-dirty=true` 且不带 `--branch` 主动绕过） | 👤 |
| 7.2.7 | HSTS 是否已开启 | SSL/TLS → Edge Certificates → HSTS | **响应头未下发 HSTS ⇒ 推断未开启**，需面板确认 | 👤 |
| 7.2.8 | Always Use HTTPS | SSL/TLS → Edge Certificates | 【未能实测 —— 需面板核实】 | 👤 |
| 7.2.9 | 回滚流程是否可用 | Deployments → 某次部署 → Rollback | CF 平台提供历史部署回滚 → **项目内无回滚文档**（`DISASTER_RECOVERY.md`） | 👤 |
| 7.2.10 | ⚪ 缓存规则 / Cache Rules | Caching → Cache Rules | 【未能实测 —— CF 缓存规则规则集在面板侧，无法从响应头完整推断】 | 👤 |

> **7.2 整节的限制**：本轮**无 Cloudflare API 凭据**，面板侧配置**全部未能实测**。以上均为"人工核实清单"，不是实测结论。

---

## 8. 域名与 HTTPS

### 8.1 已知约束：主域名未备案（必须明确写明的现状）

| 项 | 值 | 性质 |
|---|---|---|
| 当前生产域名 | `https://geek-typing.pages.dev/` | 【实测】`curl` 可达，`canonical` / `og:url` / `sitemap.xml` 三处均写此域名 |
| 域名归属 | **`pages.dev` 是 Cloudflare 拥有的平台子域**，项目**没有自有域名** | 【实测】仓库内 `grep` 自定义域名 / `CNAME` **零命中**；`DISASTER_RECOVERY.md` §"结构性弱点"亦确认 |
| 备案状态 | **无自有域名** ⇒ **不存在以本项目为主体的 ICP 备案** | 【实测】仓库内**零证据**支持存在自有域名或备案主体 |
| 备案对 CDN 的影响 | **本项目不受影响** —— 未使用中国大陆境内 CDN 与境内服务器，Cloudflare 边缘在境外（实测 `CF-RAY ... -LAX`，洛杉矶节点） | 【实测·响应头证据】 |
| 若未来改用自有域名 + 境内 CDN | **则必须完成 ICP 备案**，否则境内 CDN 会拒绝回源/中断服务 | 【主观】合规常识推断 |

### 8.2 索引与元数据

| # | 检查 | 确切命令 | 期望结果 | 实测结果 | 判定 |
|---|---|---|---|---|---|
| 8.2.1 | `canonical` 指向正确域名 | `grep canonical index.html` | `https://geek-typing.pages.dev/` | ✅ 一致 | ✅ |
| 8.2.2 | `og:url` 一致 | `grep 'og:url' index.html` | 同上 | ✅ 一致 | ✅ |
| 8.2.3 | `sitemap.xml` 可读且条目正确 | `cat public/sitemap.xml` | 单一 `<loc>https://geek-typing.pages.dev/</loc>`；`changefreq=weekly`；`priority=1.0` | ✅ 一致（238 B） | ✅ |
| 8.2.4 | `sitemap.xml` 线上可达 | `curl -sS -o /dev/null -w "%{http_code} %{content_type}\n" --noproxy '*' $P/sitemap.xml` | `200 application/xml` | ✅ `200 application/xml` | ✅ |
| 8.2.5 | `manifest.webmanifest` 线上可达 | 同上，`$P/manifest.webmanifest` | `200 application/manifest+json` | ✅ `200 application/manifest+json` | ✅ |
| 8.2.6 | `start_url` / `scope` / 图标路径有效 | `cat public/manifest.webmanifest` | `start_url:"/"`、`scope:"/"`、icons 指向 `/icon-192.png`、`/icon-512.png` | ✅ 一致 | ✅ |
| 8.2.7 | 🔴 `robots.txt` 正文规则 | `cat public/robots.txt` 或 `curl -s --noproxy '*' $P/robots.txt` | **未能读取** —— 见 §11 | ❌ 密文 | 👤 |
| 8.2.8 | `robots.txt` 是否声明 `Sitemap:` | 见 `8.2.7` | **未能核实** | ❌ 密文 | 👤 |
| 8.2.9 | `robots.txt` 线上可达 | `curl -sS -o /dev/null -w "%{http_code} %{content_type}\n" --noproxy '*' $P/robots.txt` | `200 text/plain` | ✅ `200 text/plain; charset=utf-8`（4171 B） | ✅ |

### 8.3 HTTPS 实测

| # | 检查 | 确切命令 | 期望结果 | 实测结果 | 判定 |
|---|---|---|---|---|---|
| 8.3.1 | TLS 握手成功 | `curl -sS -o /dev/null -w "%{http_code}\n" --noproxy '*' $P/` | `200` | ✅ `200` | ✅ |
| 8.3.2 | 证书链有效 | `curl -sSI --noproxy '*' $P/`（无证书告警） | 无 SSL 错误 | ✅ 无告警 | ✅ |
| 8.3.3 | HTTP/2 或 HTTP/3 是否可用 | `curl -sSI --noproxy '*' --http2 $P/`；`--http3` | 期望 `HTTP/2` / `HTTP/3` | ⚠️ **未能实测**：本机 libcurl `8.21.0` **不支持 `--http2`**（编译未含），`--http3` 亦不支持。响应头 `alt-svc: h3=":443"` 为**弱证据**：只能证明边缘**声明**支持 h3 | 👤 |
| 8.3.4 | HTTP/1.1 可用（兜底） | `curl -sSI --noproxy '*' --http1.1 $P/ \| head -1` | `HTTP/1.1 200 OK` | ✅ `HTTP/1.1 200 OK` | ✅ |
| 8.3.5 | 边缘节点位置 | `curl -sSI --noproxy '*' $P/ \| grep -i cf-ray` | 形如 `CF-RAY: ...-XXX` | ✅ `a417f9883c74f7cd-LAX` ⇒ 洛杉矶 | ✅ |
| 8.3.6 | HTTP → HTTPS 跳转 | `curl -sSI --noproxy '*' http://geek-typing.pages.dev/ \| head -3` | 301/308 → https | 【待执行】 | 👤 |
| 8.3.7 | 🔴 `Strict-Transport-Security` | 见 `2.2.11` | ❌ 未下发 | ✅ 已确认 | 👤 |

### 8.4 🧩 备案约束的实操含义（需人工决策）

| 场景 | 影响 | 是否阻塞当前发布 |
|---|---|---|
| 继续用 `*.pages.dev`（Cloudflare 边缘，境外） | **无备案要求**。代价：URL 不受项目控制、无法做 DNS 级故障切换、`canonical` 随平台变化 | **不阻塞** |
| 改用自有域名 + **境外**托管 | **无需备案**；需自行管理 DNS 与证书 | 不阻塞 |
| 改用自有域名 + **中国大陆境内 CDN/服务器** | **必须完成 ICP 备案**；未备案域名境内 CDN 会拒绝服务 | **不阻塞当前发布**（当前未使用境内 CDN），但**会阻塞**该迁移 |
| 面向中国大陆用户、使用境内 CDN（合规要求） | 此为**合规前置条件**，不是本项目当前约束 | 👤 需人工确认是否有此需求 |

> **一句话**：**"未备案"在当前架构下不构成阻断**（项目仅使用 Cloudflare 境外边缘 + `*.pages.dev` 平台子域）。它是一枚**未来约束**：一旦引入自有域名与境内 CDN，备案即成为硬前提。**本清单不假设项目已备案，也不假设需要备案** —— 现状是"无自有域名"。

---

## 9. 部署漂移监控（`FLAKY-001` 的实操口径）

| # | 检查 | 确切命令 | 期望结果 | 实测结果 | 判定 |
|---|---|---|---|---|---|
| 9.1 | 线上引用的主 chunk | `curl -s --noproxy '*' $P/ \| grep -o 'assets/index-[^"]*\.js'` | — | `assets/index-Cawl4_-q.js` | ✅ |
| 9.2 | 本地 `dist` 的主 chunk | `ls dist/assets/index-*.js` | — | `dist/assets/index-Dw5EkkBq.js` | ✅ |
| 9.3 | 两者是否一致（A3 的核心断言） | 对比 `9.1` 与 `9.2` | **一致** | ❌ **不一致** → 部署漂移 | 👤 🔴 |
| 9.4 | 线上 3 个懒加载 chunk 是否可达 | 见 §9.6 命令 | 全部 `200` | ✅ 全部 `200` | ✅ |
| 9.5 | 线上旧版本 chunk 是否仍可达 | `curl -sS -o /dev/null -w "%{http_code}\n" --noproxy '*' $P/assets/index-Cawl4_-q.js` | `200` | ✅ `200` | ✅ |

**9.6 实测的懒加载 chunk 可达性**（用本地 hash 探测线上）：

| chunk | 线上 status | 线上字节数 | 与本地对比 |
|---|---|---|---|
| `words-Dfqbfxph.js` | `200` | **475181** | 与本地**完全一致** |
| `words-DO8i2GAI.js` | `200` | **482531** | 与本地**完全一致** |
| `words-LP9e320F.js` | `200` | **483087** | 与本地**完全一致** |
| `index-Dw5EkkBq.js` | `200`（**2007 B**） | 2007 | ⚠️ **拿到的是 SPA 回落首页**，该 hash 线上**不存在**（软 404，见 §4.6） |

> **9.6 是一处重要的观察**：**3 个 `words-*` chunk 的线上字节数与本地逐字节一致**，说明**词库内容与本地构建完全相同**；**唯一漂移的是主 chunk**（因为源码改了 `ResultOverlay.tsx`，词库 JSON 未变）。这精确印证了 A3 失败的根因，也说明**线上产物的漂移范围仅限于主 chunk**。

### 9.7 漂移的三种解释与处置

| 现象 | 解释 | 处置 |
|---|---|---|
| 线上 ≠ 本地，且本地源码有未提交改动 | **最可能**：本地改了源码未部署 | 部署，或回退源码改动 |
| 线上 ≠ 本地，且本地 `dist` 陈旧 | 本地忘了重新 build | `rm -rf dist && npm run build` |
| 线上 ≠ 本地，且 git 干净、刚 build | `--commit-dirty=true` 允许脏部署 ⇒ 线上产物可能不对应任何 commit | 去掉 `--commit-dirty=true`（`DEPLOYMENT.md` §8 建议 P2） |

---

## 10. 运行期例行检查（建议周期）

| 频率 | 检查 | 命令 | 判定 |
|---|---|---|---|
| 每次部署后 | 生产冒烟 22 项 | `npm run test:smoke` | ✅ |
| 每次部署后 | 生产离线套件 | `npm run test:prod` | ✅ |
| 每次部署后 | A3 漂移比对 | 见 §9.1–9.3 | 👤 |
| 每次部署后 | 部署时间与 commit 对应 | CF 面板 Deployments | 👤 |
| 每周 | `/sw.js` 版本串未被意外回退 | 见 §3.3 | ✅ |
| 每周 | 安全头 4 条仍生效 | 见 §2.2.1–2.2.4 | ✅ |
| 每月 | `robots.txt` / `sitemap.xml` 一致性 | 见 §8.2 | 👤 |
| 每月 | 证书有效期 | CF 面板 SSL/TLS → Edge Certificates | 👤 |
| ⚪ 当前**无** | 可用性/错误率监控 | — | ❌ 无任何监控（`MONITORING.md` 状态 `📐 待建`） |
| ⚪ 当前**无** | 部署后自动验证 | — | ❌ 部署完即结束（`DEPLOYMENT.md` §7） |
| ⚪ 当前**无** | 回滚流程文档 | — | ❌ 无（`DISASTER_RECOVERY.md` 状态 `📐 待建`） |

---

## 11. 已知缺口清单（本清单覆盖范围内）

| # | 缺口 | 影响 | 编号 | 判定 |
|---|---|---|---|---|
| P-1 | **无 CSP** | 缺一道纵深防御。有利条件：无内联脚本、无外部 CDN、仅 4 个运行时依赖 ⇒ 条件已成熟 | `SECURITY-001` | 👤 |
| P-2 | **无 HSTS** | 首次明文请求存在降级窗口（**注意**：`*.pages.dev` 在 CF HSTS preload 列表内，实际风险被平台缓解） | — | 👤 |
| P-3 | 🔴 **缺失静态资源返回 200 HTML（软 404）** | **不只是调试/SEO 问题**：它是 `BUG-002` 缓存投毒链路的**第一环** —— SW 会把这个 HTML 当 JS 缓存进 `/assets/*` 且永久不更新 ⇒ **用户白屏且无法自愈**。另附调试误导（`Unexpected token '<'`）与潜在 SEO 软 404 | `KNOWN_ISSUES.md#BUG-002` | 🔴 **必须修** |
| P-4 | **无离线状态 UI** | 用户断网时不知自己处于离线态 | `UX-001` | 👤 |
| P-5 | **无 SW 更新提示** | `skipWaiting` 立即接管，用户无感知版本变更 | 缺口 O-2 | 👤 |
| P-6 | **无缓存容量上限处理** | Cache Storage 配额耗尽时无降级策略 | 缺口 O-3 | 👤 |
| P-7 | **无"清理缓存"入口** | 用户无法自救 | 缺口 O-4 | 👤 |
| P-8 | **无监控 / 无告警 / 无回滚文档** | 线上故障无自动发现、应急无流程 | `MONITORING.md` / `DISASTER_RECOVERY.md` | 👤 |
| P-9 | **无 staging 环境** | 验收只能在生产做 ⇒ A3 天然脆弱 | `DEPLOYMENT.md` §5 | 👤 |
| P-10 | **`--commit-dirty=true`** | 线上产物与 git 提交不对应 | `DEPLOYMENT.md` §2.5 | 👤 |
| P-11 | **无自有域名** | URL 不受控，无法 DNS 级切换 | `DISASTER_RECOVERY.md` | 👤 |
| P-12 | **`robots.txt` 内容不可读** | 无法确认 `Disallow` / `Sitemap` 规则是否正确 | 见 §8.2.7 | 👤 |

---

## 12. 一页速查（复制即用）

```bash
P=https://geek-typing.pages.dev

# —— 安全头（4 条全局 + /assets 覆盖）——
curl -sSI --noproxy '*' $P/ | grep -iE "x-content-type-options|referrer-policy|x-frame-options|cross-origin-opener-policy"
curl -sSI --noproxy '*' $P/ | grep -icE "content-security-policy|strict-transport-security|permissions-policy"   # 期望 0（缺口）

# —— 缓存策略 ——
curl -sSI --noproxy '*' $P/sw.js | grep -i cache-control                    # 期望 no-cache
curl -sSI --noproxy '*' $P/ | grep -i cache-control                         # 期望 max-age=0, must-revalidate

# —— SW ——
curl -s --noproxy '*' $P/sw.js | grep -o "gt-shell-v[0-9]*" | sort -u       # 期望 gt-shell-v3

# —— SPA 与重定向 ——
curl -sSI --noproxy '*' $P/index.html | head -3                             # 期望 308 → /
curl -sS -o /dev/null -w "%{http_code} %{content_type}\n" --noproxy '*' $P/review    # 期望 200 text/html

# —— 部署漂移 ——
curl -s --noproxy '*' $P/ | grep -o 'assets/index-[^"]*\.js'                # 与 ls dist/assets/index-*.js 比对

# —— 压缩实测 ——
for enc in br gzip identity; do curl -sS -o /dev/null --noproxy '*' -H "Accept-Encoding: $enc" -w "$enc %{size_download}\n" $P/; done

# —— 完整门禁（需本地服务/产物）——
npm run content:validate && npm run test:content && npm run build && npm run check:bundle
npm run test:smoke && npm run test:prod
```

---

## 13. 客观实测 vs 主观判断（分离声明）

### 客观实测（可直接采信）

- §2.2 全部 4 条安全头在生产**生效**、§2.2.10–2.2.12 的 3 类头**零命中**。
- §3.1–3.3 的 `/sw.js` 状态码、`Content-Type`、唯一版本串 `gt-shell-v3`。
- §4.1–4.4、4.6 的全部状态码 / `Content-Type` / 字节数（含 `/index.html` 308、`/review` 200 text/html 2007 B、`/assets/does-not-exist.js` 200 text/html）。
- §5 **左侧两层策略表**（HTTP 缓存与 Cache Storage 的规则）取自 `public/_headers` 与 `public/sw.js` 源码；`/assets/*` 与 `/sw.js` 两条已在生产实测确认。
- §6 全部传输字节数（`curl -w %{size_download}`）。
- §8.1 域名事实（`canonical`/`og:url`/`sitemap` 三处一致；自定义域名 `grep` 零命中；`CF-RAY ... -LAX`）。
- §8.2.1–8.2.6、8.2.9 的元数据与可达性。
- §8.3.1、8.3.2、8.3.4、8.3.5。
- §9.1、9.2、9.5、9.6 的 hash、状态码与字节数（3 个 `words-*` 与本地逐字节一致）。
- §10 中"无监控 / 无部署后自动验证 / 无回滚文档"（依据 `MONITORING.md`、`DISASTER_RECOVERY.md` 的状态标注与 `DEPLOYMENT.md` §7）。

### 主观判断（仅供参考，需你决策）

- **"未备案在当前架构下不构成阻断"** —— 基于"仅用 Cloudflare 境外边缘 + `*.pages.dev`"这一实测事实的推断；**如有面向中国大陆的合规要求，此判断不适用**。
- §8.4 场景表中"境内 CDN 必须备案"的合规结论。
- §9.7 三种漂移解释的**可能性排序**。
- §11 缺口的优先级与影响评估。
- §6.4 "br 略大于 gzip 属正常现象"的机理解释。

### 未能实测 / 无法核实（不编数字）

| 项 | 原因 |
|---|---|
| §7.2 **整节**（CF 面板配置：项目名、Custom domains、构建配置、HSTS、Cache Rules、回滚可用性） | **无 Cloudflare API 凭据**，面板侧配置无法从响应头完整推断 |
| §8.3.3 HTTP/2 / HTTP/3 | 本机 libcurl `8.21.0` **未编译 `--http2` 与 `--http3`**；`alt-svc: h3=":443"` 仅为边缘**声明**，不等于本轮实测到 h3 |
| §8.2.7 / 8.2.8 `robots.txt` 正文与 `Sitemap:` 声明 | **本地与线上两份副本均为密文**（本机 Esafenet 透明加密驱动：本地 `cat` 2446 行仅 3 行可读，线上 4171 B 含加密头 + 二进制）⇒ 未能读取 |
| §8.3.6 HTTP→HTTPS 跳转 | 本轮未执行该命令 |
| §2.2.8 `/icons.svg` 缓存头 | 本轮未执行该命令 |
| §5.1.5–5.1.7 浏览器 DevTools 层验证 | 需人工操作浏览器；本轮以 curl + 源码 + `test:offline` 既有结果替代 |
| §3.4–3.8 生产离线套件 / 冒烟 Part B | 本轮未复跑（会与 `FINAL_ACCEPTANCE.md` 既有结果重复）；表内已标注【待执行】 |
| 证书签发者与到期日明细 | 本机 `python` CA 库报错无法取链；`curl` 未开 `-v` 输出证书详情 |

---

## 14. 关联文档

| 文档 | 关系 |
|---|---|
| `13-acceptance/RELEASE_CHECKLIST.md` | **发布前**检查单（区别于本文件） |
| `13-acceptance/FINAL_ACCEPTANCE.md` | 生产冒烟 21/22 的完整记录与 A3 根因 |
| `13-acceptance/KNOWN_ISSUES.md` | `SECURITY-001` / `UX-001` / `FLAKY-001` 等编号定义 |
| `12-infrastructure/DEPLOYMENT.md` | CF Pages 配置、CI 缺口、无 staging、A3 根因链 |
| `12-infrastructure/OFFLINE.md` | SW 双策略与 `sanitize()` 三类静默失败 |
| `12-infrastructure/DISASTER_RECOVERY.md` | 域名与 URL 控制权风险 |
| `12-infrastructure/MONITORING.md` | 监控缺口 |
| `10-security/` | 威胁模型（状态 `📐 待建`） |
