# 集成架构（INTEGRATION_ARCHITECTURE）

> 状态：🔄 混合（本文分节标注）
>
> `【已有】` 第 1~4 节：Cloudflare Pages 部署、GitHub Actions CI、Service Worker 离线、
> PWA / 安全头 / 缓存策略 —— 全部为当前真实运行的集成。
> `【待建】` 📐 第 5 节：媒体域（音频/视频/字幕/CDN/R2）、后端与同步、外部内容源集成
> —— 当前**零实现**，仅给出设计模型与建议方向。
>
> 基线 commit：`4152eb2`　｜　实测日期：2026-09-27

---

## 1. 【已有】部署：Cloudflare Pages

### 1.1 配置

文件：`wrangler.toml`（全文 8 行）

```toml
name = "geek-typing"
compatibility_date = "2026-09-26"
pages_build_output_dir = "dist"
```

| 项 | 值 |
|---|---|
| 平台 | Cloudflare Pages |
| 项目名 | `geek-typing` |
| 生产域名 | `https://geek-typing.pages.dev`（`index.html` 的 `canonical` / `og:url`） |
| 产物目录 | `dist`（Vite 默认输出） |
| 构建命令 | `npm run build`（= `tsc -b && vite build`） |
| 部署方式 | GitHub Actions + `cloudflare/wrangler-action@v3` |
| 模式 | **纯静态托管** —— 无 Functions、无 Workers、无 KV、无 D1、无 R2 |

### 1.2 部署流水线

文件：`.github/workflows/deploy.yml`

| 步骤 | 内容 | 行 |
|---|---|---|
| 触发 | `push` 到 `main` / PR 到 `main` / `workflow_dispatch` | `:3-10` |
| 并发控制 | `group: ${{ github.workflow }}-${{ github.ref }}`，`cancel-in-progress: true` | `:12-14` |
| Node | `22` + `cache: npm` | `:24-28` |
| 安装 | `npm ci` | `:31` |
| 构建 | `npm run build` | `:34` |
| Secret 自检 | 校验 `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` 非空 | `:37-51` |
| 部署 | `pages deploy dist --project-name=geek-typing --commit-dirty=true` | `:57-61` |

**部署条件**：仅 `push` 到 `main` 才部署（`:56` 的 `if` 条件）；PR 只做构建校验。
部署命令**不带 `--branch`**，确保发布到生产环境（`:59` 注释）。

### 1.3 ⚠️ CI 只跑 build（实测缺口）

`deploy.yml` 与 `e2e.yml` 实际执行的命令：

| 工作流 | 执行 | 未执行 |
|---|---|---|
| `deploy.yml` | `npm ci` → `npm run build` | 全部测试与门禁 |
| `e2e.yml` | `npm ci` → `npm run build` → `npx playwright install chromium` → `node tests/e2e.mjs` | 内容门禁 / 体积门禁 / 契约测试 / offline |

**未接入 CI 的守护者清单**（`KNOWN_ISSUES.md#DEBT-002`）：

```
content:validate   (20 项门禁)      ← 内容结构被破坏仍可部署
check:bundle       (3 项体积门禁)   ← 首屏体积击穿阈值仍可部署
test:content       (契约测试)
test:offline       (离线套件)
test:smoke         (22 项生产冒烟)
```

该项在 `GAP_ANALYSIS.md#7` 的「🔴 立即」优先级表里，标注成本为「低」。

`e2e.yml` 仅在 PR 与手动触发时运行（`:5-10`），理由为「避免拖慢主部署流水线，
也保证 main 的部署徽章始终反映部署状态」。

---

## 2. 【已有】Service Worker 离线集成

### 2.1 注册

`src/main.tsx:19-25`：

```ts
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* 注册失败不影响使用 */ })
  })
}
```

仅生产环境注册。开发环境（`vite dev`）不注册 SW。

### 2.2 缓存策略

文件：`public/sw.js`（7 619 B）

| 项 | 值 | 行 |
|---|---|---|
| 缓存名 | `gt-shell-v3` | 顶部 |
| SHELL 预缓存 | `/`、`/index.html`、`/favicon.svg`、`/icons.svg`、`/icon-192.png`、`/icon-512.png`、`/manifest.webmanifest` | 顶部 |
| install 扩展 | `precacheShell()` —— 解析首页 HTML，把 `/assets/*` 一并纳入 | `precacheShell` |
| fetch 策略 | 静态资源缓存优先；页面与其它文件网络优先，断网回落 `/index.html` / `/` | `:78-103` |
| 响应净化 | `sanitize()` 剥离 `content-encoding` / `content-length` / `vary` | `sanitize` |

**三个必须 sanitize 的理由**（`sw.js` 头部注释原文）：

1. CDN 可能对 shell 条目返回 308 重定向，缓存一条 `redirected=true` 的响应后，
   Fetch 规范禁止将其 `respondWith` 给 follow 模式的导航请求 → 断网导航 `ERR_FAILED`。
2. body 已解压，若保留 `content-encoding` 头，缓存命中后浏览器二次解码 → `ERR_FAILED`。
3. 源站可能返回 `Vary: Origin`，而 SW fetch 与页面请求的 `Origin` 头不一致会让
   `caches.match(页面请求)` 静默 miss → 断网回源失败。

### 2.3 大词库预热集成

`src/main.tsx:27-58`：

```
window load
  → requestIdleCallback（timeout 4000）／ fallback setTimeout 2000
  → 慢网检查（saveData / slow-2g / 2g / 3g）→ 跳过
  → navigator.serviceWorker.ready
  → 轮询 navigator.serviceWorker.controller（最多 50 × 100ms = 5s）
  → warmUpVocabulary()  ← registry.ts:139-141
```

`warmUpVocabulary()` 内部（`registry.ts:139-141`）：

```ts
export function warmUpVocabulary(): Promise<unknown> {
  return Promise.allSettled([loadIelts(), loadKaoyan(), loadToefl()]).catch(() => {})
}
```

**为什么必须等 SW 接管**（`main.tsx:34-35` 注释）：

> 保证预热请求经过 fetch handler 进缓存，否则首访用户预热发生在控制前 →
> chunk 不入库 → 首次离线仍切不了大词库

### 2.4 已知限制

| # | 限制 | 事实 | 依据 |
|---|---|---|---|
| I-1 | **预热名单硬编码** | 3 个包写死在 `registry.ts:139`；加包时不会自动加入 | `GAP_ANALYSIS.md#A-3` |
| I-2 | **预热预算吃紧** | 实测 497.03 KiB gzip / 600 KiB 预算 = **83%**，余量 17.2% | `content/README.md:587` |
| I-3 | **无离线状态 UI** | SW 缓存可用，但应用层零 `navigator.onLine` 监听 | `KNOWN_ISSUES.md#UX-001` |
| I-4 | **加载失败无反馈** | lazy chunk 失败仅 `console.warn` | `KNOWN_ISSUES.md#UX-002` |

`content/README.md:607-611` 把 I-1/I-2 标为「🔴 预热预算是最薄弱的一环（本轮未解决，属待办）」，
并提出约束：「在新增 GRE / Oxford 之前，必须先把它从『全量 allSettled』改成『按需 + 限量』」。

---

## 3. 【已有】PWA 集成

文件：`public/manifest.webmanifest`

| 字段 | 值 |
|---|---|
| `name` | `Geek Typing · 极客打字背单词` |
| `short_name` | `Geek Typing` |
| `lang` | `zh-CN` |
| `start_url` / `scope` | `/` |
| `display` | `standalone` |
| `orientation` | `portrait-primary` |
| `background_color` / `theme_color` | `#0b1120` |
| `categories` | `["education", "productivity"]` |
| `icons` | `/icon-192.png`（192×192）、`/icon-512.png`（512×512），均 `purpose: any maskable` |

HTML 侧声明（`index.html`）：`<link rel="manifest">`、`<link rel="icon">`、
`apple-touch-icon`、`apple-mobile-web-app-capable`、`apple-mobile-web-app-status-bar-style`、
`apple-mobile-web-app-title`。

---

## 4. 【已有】HTTP 层与其他集成

### 4.1 安全响应头

文件：`public/_headers`

```
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: SAMEORIGIN
  Cross-Origin-Opener-Policy: same-origin
```

**未设置**：`Content-Security-Policy`、`Strict-Transport-Security`、`Permissions-Policy`。

### 4.2 缓存策略

| 路径 | 策略 | 理由（文件中注释） |
|---|---|---|
| `/assets/*` | `public, max-age=31536000, immutable` | Vite 带 hash，内容变化 URL 就会变 |
| `/sw.js` | `no-cache` | 保证新版本 SW 能被浏览器及时探测与更新 |
| `/icons.svg` | `public, max-age=604800` | 图标带指纹，可放心长缓存 |

### 4.3 SEO 集成

| 文件 | 大小 | 内容 |
|---|---|---|
| `public/robots.txt` | 4 171 B | 爬虫规则 |
| `public/sitemap.xml` | 238 B | 站点地图 |
| `index.html` | — | `<meta name="description">`、`keywords`、`author`、`theme-color`、Open Graph 6 项、`twitter:card`、`canonical` |

⚠️ **`sitemap.xml` 只能列出 `/` 一个 URL** —— 因为无路由（见 `FRONTEND_ARCHITECTURE.md#2`）。
`index.html` 的 `<div id="root">` 为空，标注为纯 CSR，正文全由 JS 注入。

### 4.4 第三方运行时依赖（全部本地打包，无 CDN 外链）

| 包 | 版本 | 用途 |
|---|---|---|
| `react` / `react-dom` | `^19.2.8` | UI |
| `lucide-react` | `^1.48.0` | 图标 |
| `canvas-confetti` | `^1.9.4` | 结算动效 |

**无**：无分析埋点、无错误上报 SDK、无广告、无字体 CDN、无外部 API 调用。
全部资源同源，无跨域请求（`Cross-Origin-Opener-Policy: same-origin` 可安全设置）。

### 4.5 浏览器原生 API 集成

| API | 位置 | 用途 |
|---|---|---|
| Web Speech API（`speechSynthesis`） | `src/lib/speech.ts`（82 行） | 单词发音，口音偏好存 `gt.voice` |
| Web Audio API | `src/lib/sound.ts`（204 行） | 机械键盘音效 |
| `localStorage` | 见 `DATA_ARCHITECTURE.md` | 全部用户状态 |
| Service Worker + Cache Storage | `public/sw.js` | 离线 |
| `navigator.connection` | `main.tsx:38-39` | 慢网检测（决定是否预热） |
| `requestIdleCallback` | `main.tsx:52` | 空闲预热 |

⚠️ Web Speech / Web Audio 是**浏览器合成**，不是音频内容 ——
`07-media/AUDIO.md` 标为 📐 待建：「仅 Web Audio 音效 + Web Speech 发音，无音频内容体系」。

---

## 5. 📐 待建：媒体域集成

> 本节全部为**规划**，项目当前**零实现**。以下内容标注为设计模型与建议方向，
> 不得当作已完成能力。

### 5.1 设计模型（已定义，未实现）

文件：`src/core/content/model/asset.ts`（37 行）

核心原则（`asset.ts:3-6` 原文）：

> **Content ≠ File**。一条内容（word / audio / document …）可以有 0..n 个资产文件，
> 且这些文件的存放位置会随部署演进而变：本地 `public/` → R2 → CDN → GitHub Releases。
> Asset 层把「文件在哪」单独建模，这样搬运/换 CDN 时 **Content 模型不用动**。

```ts
// :17
export type AssetKind = 'audio' | 'image' | 'document' | 'subtitle' | 'other'

// :20
export interface AssetRef {
  assetId: string        // 建议 asset:<kind>:<namespace>:<localId>
  kind: AssetKind
  url: string            // 相对路径 或 https URL
  mime?: string
  bytes?: number
  checksum?: string      // 建议完整 SHA-256，不截断
  license?: ContentLicense   // 资产可自带许可证
}

// :35
export function makeAssetId(kind: AssetKind, namespace: string, localId: string): string {
  return `asset:${kind}:${namespace}:${localId}`
}
```

⚠️ **`asset:` 前缀而不是 `content:`**（`asset.ts:12-13`）：

> 避免与 4 段式 ContentId 混淆（`parseContentId` 只认 `content:` 前缀，
> assetId 不该被当成内容实体解析）。

### 5.2 已存在的门禁钩子（未触发）

`scripts/content/validate.mjs:342-351` 第 12(f) 项：

```
无 manifest.assets 字段 → console.log('· manifest 无 assets 字段，跳过 asset 校验')
有 → 校验每个 a.url 匹配 /^(https?:\/\/|\/)/
```

**实测**：当前 10 个包**全部无 `manifest.assets` 字段** ⇒ 该项恒跳过。
`content/README.md:515` 明确提醒：「别当成『已校验通过』」。

### 5.3 资产数据流（设计意向）

```
内容包 manifest.json
  │
  ├─ content:word:ecdict-ielts:abandon     ← 内容（是什么）
  │
  └─ assets: [                             ← 资产（文件在哪）   📐 字段尚未出现在任何 manifest
       { assetId: "asset:audio:ecdict-ielts:abandon-uk",
         kind: "audio", url: "https://<R2/CDN>/audio/abandon-uk.mp3",
         mime: "audio/mpeg", bytes: 12345, checksum: "sha256:…" }
     ]
```

外部存储候选（`asset.ts:5` 列出）：本地 `public/` → Cloudflare R2 → CDN → GitHub Releases。
**均未接入**。

### 5.4 契约中的相关限制

| # | 限制 | 契约位置 |
|---|---|---|
| L-3 | `relations.json` / `assets/` 尚无数据，门禁相应项打印「跳过」 | 契约 §10 |
| L-4 | 近似重复只在 for-review 层，绝不自动删除 | 契约 §10 |
| L-5 | **AssetManifest 未做** —— `assets/manifest.json`（checksum / mime / bytes / duration / language / source / license / storage）尚未建模，推到 **P3** | 契约 §10 |

`content/README.md:68-75` 明确：

> ⚠️ `content/assets/` 目前**并不存在**（目录下只有 `README.md` 与 `vocabulary/`）。
> 上面那棵是规划形态。

### 5.5 媒体域集成的主要缺口（据 `GAP_ANALYSIS.md#D` 与 `07-media/*`）

| # | 能力 | 现状 |
|---|---|---|
| 1 | 音频播放器 | 零实现 |
| 2 | 字幕解析（SRT / VTT / LRC） | 零实现 |
| 3 | 音频/视频内容类型接入（`audio` / `listening` / `reading`） | 零数据；`ContentType` 有类型定义，`SUPPORTED_TYPES` 只有 `word`（`content-query.ts:133`） |
| 4 | 媒体资产托管（R2 / CDN） | 零实现 |
| 5 | 媒体流水线（转码 / 切片 / 校验） | 零实现 |
| 6 | 媒体测试 | 零实现（`09-testing/MEDIA_TEST.md` 📐） |

### 5.6 建议方向（标注为「建议」）

> 以下为审计建议，**不是项目已承诺的路线**。

1. **先建目录、后建流水线**：`content/assets/manifest.json` + `assets.json` 的字段定义
   是流水线的前置；没有契约，脚本无从校验。
2. **资产 checksum 与内容 checksum 分开**：`model/asset.ts:29` 已建议完整 SHA-256，
   与 `contentChecksum` 同一算法（canonical SHA-256）可复用 `canonical.mjs`。
3. **`AssetRef.license` 应比内容许可更严**：`asset.ts:30-31` 已设计
   「资产可自带许可证：与所属内容的许可证不同时以此为准」——
   这在混用多来源音频时是必要的合规闸门（见 `04-content/CONTENT_LICENSE.md`）。
4. **门禁 (f) 需从「跳过」升级为「数据存在即强制校验」**：
   当前恒跳过，接入首个资产包时必须同时补断言（契约 §10 L-3 已要求）。

---

## 6. 📐 待建：后端与同步

### 6.1 现状

| 项 | 现状 |
|---|---|
| 后端服务 | **无** |
| 用户账号 | **无** |
| 跨设备同步 | **无** |
| 云数据库 | **无** |
| 服务端 API | **无** |

应用是**纯静态 SPA**，全部状态在用户本机 `localStorage`。
UI 已如实告知用户（`src/i18n/zh.ts:89`）：

```
'panel.localOnly': '数据只保存在本机 localStorage'
'src/i18n/zh.ts:202': 'streak.localOnly': '数据保存在本机 localStorage'
```

### 6.2 已识别的迁移路径（代码注释中的意向，非实现）

`src/lib/streak.ts:3`：

> 全部落在 localStorage，纯前端零后端；后续想同步可以平滑迁移到 **Cloudflare D1**。

`content/README.md:60` 把 Learning 层存储标注为「LocalStorage / **未来 IndexedDB**」。

→ 两处给出的是**两个不同方向**（D1 服务端 vs IndexedDB 本地）。
当前均未动工，也无 RFC / 设计文档。这是一个**尚未收敛的技术选型**。

### 6.3 建议方向（标注为「建议」）

> 若产品要求跨设备学习进度，D1 与 IndexedDB 解决的是不同问题，
> 需先明确需求再选型：

| 需求 | 对应方案 |
|---|---|
| 学习记录不丢（换设备/清缓存） | 需要服务端（D1 + 用户体系） |
| 本机容量与写入性能 | IndexedDB（仍是单机） |
| 两者都要 | IndexedDB 作本地缓存层 + D1 作同步后端 |

另需注意：一旦引入用户体系，`Content` / `Learning` / `User` 三层边界的
「User data never enters `content/`」（契约 §1）会从**约定**变成**需要服务端强制的约束**
—— 当前无任何服务端代码可以承担这个职责。

---

## 7. 集成总表

| # | 集成对象 | 方向 | 状态 | 关键文件 |
|---|---|---|---|---|
| 1 | Cloudflare Pages | 部署 | ✅ 已有 | `wrangler.toml`、`.github/workflows/deploy.yml` |
| 2 | GitHub Actions | CI | ✅ 已有（**仅 build + e2e**） | `.github/workflows/{deploy,e2e}.yml` |
| 3 | Service Worker | 离线 | ✅ 已有 | `public/sw.js`、`src/main.tsx:19-58` |
| 4 | PWA Manifest | 安装 | ✅ 已有 | `public/manifest.webmanifest` |
| 5 | HTTP 安全头 / 缓存 | 传输 | ✅ 已有 | `public/_headers` |
| 6 | Web Speech API | 发音 | ✅ 已有（合成，非内容） | `src/lib/speech.ts` |
| 7 | Web Audio API | 音效 | ✅ 已有（合成，非内容） | `src/lib/sound.ts` |
| 8 | 第三方运行时依赖 | 构建 | ✅ 已有（3 个包，全本地） | `package.json` |
| 9 | SEO（robots / sitemap） | 抓取 | ✅ 已有（受无路由限制） | `public/{robots.txt,sitemap.xml}` |
| 10 | 媒体资产托管（R2 / CDN） | 内容 | 📐 **待建** | `src/core/content/model/asset.ts`（仅模型） |
| 11 | 音频/字幕内容源 | 内容 | 📐 **待建** | 无 |
| 12 | 后端服务 / 用户体系 | 同步 | 📐 **待建** | 无 |
| 13 | 云数据库（D1 / IndexedDB） | 存储 | 📐 **待建** | 无 |
| 14 | 错误上报 / 性能监控 | 观测 | 📐 **待建** | 无（`KNOWN_ISSUES.md#E-3`） |
| 15 | 外部内容源（GitHub / ECDICT 数据集） | 导入 | 📐 **待建** | 当前只有脚本侧手工 JSON（`05-import/*`） |

---

## 8. 一句话结论

> 集成层当前**只有静态托管这一条链路**：Cloudflare Pages + GitHub Actions（只跑 build）
> + Service Worker（离线）+ PWA + 安全头，全部为真实运行的单向、无后端集成。
> 媒体域（音频/视频/字幕 + R2/CDN）、后端与同步、监控上报**全部为零**，
> 其中媒体域已有 `AssetRef` 模型（`model/asset.ts`）与门禁钩子位置（`validate.mjs:342-351`），
> 后端与存储则连技术方向都尚未收敛（`streak.ts:3` 说 D1，`content/README.md:60` 说 IndexedDB）。
