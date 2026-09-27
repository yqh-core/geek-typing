# 离线能力（Offline）

> 状态：✅ 已有（实测）
> 实现：`public/sw.js`（实测 **178 行 / 7 619 B**）
> 审计：`tests/offline-audit.mjs`（**5 态**，含态 4b 主动注入探针）+ `tests/prod-smoke.mjs` Part B（3 组）
> 实测结果：**20/20 通过**

---

## 1. 为什么这一块做得好

因为**踩过真实的坑，并把坑固化成了代码与断言**。

`public/sw.js` 的 `sanitize()` 函数注释里逐条写明了**三类静默 `ERR_FAILED`**。这不是预先设计的理论，而是被线上问题打出来的经验——每一条都能从注释里读出"我们曾经因此白屏过"。

---

## 2. Service Worker 结构（实测）

### 2.1 常量

```js
const CACHE = 'gt-shell-v3'
const SHELL = ['/', '/index.html', '/favicon.svg', '/icons.svg',
               '/icon-192.png', '/icon-512.png', '/manifest.webmanifest']
```

**缓存版本号 `gt-shell-v3` 是全局唯一的版本标识。** `activate` 时会删掉所有非本版本的缓存（见 §2.5）。

> **📌 版本演进**：`v1` → `v2` 是历史上的缓存策略调整；**`v2` → `v3` 是本轮审计为修复 BUG-002（SW 缓存投毒）而必须做的升版** —— 详见 §2.2「背景 4」。升版是**清除存量中毒缓存的唯一有效机制**。

### 2.2 `sanitize(res)` —— 核心防御函数

实测原文（`public/sw.js` 前 20 行附近）：

```js
async function sanitize(res) {
  const body = await res.arrayBuffer()
  const headers = new Headers(res.headers)
  headers.delete('content-encoding')
  headers.delete('content-length')
  headers.delete('vary')
  return { body, status: res.status, headers }
}
```

**它剥离三个头，每一个都对应一类静默失败：**

#### 背景 1：`redirected` 毒条目（308 重定向）

> CDN 可能对 shell 条目返回 **308 重定向**，缓存一条 `redirected=true` 的响应后，**Fetch 规范禁止将其 `respondWith` 给 follow 模式的导航请求** → 断网导航 **`ERR_FAILED`**

**关键点**：这不是"缓存了错误的内容"，而是"缓存了一条**规范不允许回放**的响应"。用户的感受是：联网正常，一断网就白屏。

**`sanitize` 的对策**：用 `new Response(body, {status, headers})` **重建**一个新 Response —— 新构造的 Response 的 `redirected` 标志是 `false`。

#### 背景 2：body 二次解码（`content-encoding`）

> body 已解压，若保留 `content-encoding` 头，缓存命中后浏览器**二次解码** → `ERR_FAILED`

**机制**：`fetch()` 返回的 Response，其 `body` **已经被解压过了**（浏览器自动处理了 gzip/br）。但响应头里的 `content-encoding: gzip` **还在**。这条 Response 被存进 Cache Storage 后，下次命中时浏览器看到 `content-encoding: gzip`，会**再解压一次**已解压的数据 ⇒ 失败。

**这是最隐蔽的一类** —— 头是"正确的"（它确实是 gzip 来的），但**在缓存这个新的上下文里它变成了错的**。

**`sanitize` 的对策**：删掉 `content-encoding`。
**连带删 `content-length`**：因为 body 长度已经变了（解压后），保留旧长度会导致不一致。

#### 背景 3：`Vary: Origin` 静默 miss

> 源站可能返回 `Vary: Origin`，而 **SW fetch 与页面请求的 `Origin` 头不一致**会让 `caches.match(页面请求)` **静默 miss** → 断网回源失败；**单一源站缓存中 Vary 无意义**

**机制**：
1. SW 用某种上下文（可能带 `Origin`）发起 fetch，拿到带 `Vary: Origin` 的响应
2. 存进缓存
3. 页面发起请求，`Origin` 头与 SW fetch 时不同
4. `caches.match(pageRequest)` 会因为 Vary 不匹配而**返回 undefined**
5. **不报错、不抛异常，只是静默地没命中** ⇒ 断网回源失败

**"静默"是这三类里最危险的** —— 前两类会报 `ERR_FAILED`，至少能看见；这一类**看起来什么都没发生**，只是离线时白屏。

**`sanitize` 的对策**：删掉 `vary`。注释给出了理由：**单一源站缓存中 Vary 无意义**。这是个正确的判断——缓存里只存本站资源，不存在"同一 URL 不同源返回不同内容"的场景。

#### 🔴 背景 4（**本轮审计新增 · 尚未防御**）：`Content-Type` 未校验 ⇒ SPA fallback 投毒

> **`sanitize` 只处理了「响应头怎么存」，没有处理「这个响应该不该存」。** 这是当前 `public/sw.js` 唯一缺失的防御，且后果比上述三类都严重 —— 它**不是断网才暴露，而是联网状态下永久损坏应用**。

**机制**（四环，每环均已实测，详见 `13-acceptance/KNOWN_ISSUES.md#BUG-002`）：

1. **平台行为**：Cloudflare Pages 对不存在的 `/assets/*` **不做 404**，而是 SPA fallback
   → 返回 `200` + `Content-Type: text/html` + **2007 B 的 index.html**
   ```bash
   $ curl -sk -o /dev/null -w "%{http_code} %{content_type} %{size_download}\n" \
       https://geek-typing.pages.dev/assets/does-not-exist.js
   200 text/html; charset=utf-8 2007      # 应为 404
   $ curl -sk https://geek-typing.pages.dev/assets/index-Dw5EkkBq.js | head -c 40
   <!doctype html>                        # 返回的是首页 HTML，不是 JS
   ```
2. **代码缺陷**：`precacheShell()`（`:44-46`）与 `putClean()`（`:57-63`）**均只判 `res.ok`**，不校验 `Content-Type`
   → `res.ok === true`（因为是 200）⇒ **HTML 被当作合法资产写入缓存**
3. **策略放大**：`/assets/*` 走 **cache-first**（`:85-94`），`caches.match` 命中即返回、**永不回源**
   → 一旦写入，该 URL **永久返回 HTML**
4. **nosniff 放大器**：`public/_headers` 全局下发 `X-Content-Type-Options: nosniff`
   → 浏览器**必定拒绝执行** HTML 冒充的 JS，不会 sniff 纠正 ⇒ 后果从"可能白屏"升级为"**必定白屏**"

**为什么这不是理论风险**：`/assets/index-Dw5EkkBq.js` 正是**本地当前构建的主 chunk hash**，而线上不存在该文件（线上 index.html 引用 `index-Cawl4_-q.js`）——**漂移已经实际发生**。任何在漂移窗口访问过的用户都会被投毒。

**为什么升 `CACHE` 版本号是修复的必要部分**：`activate`（`:140-147`）实现了「删除所有 ≠ 当前 `CACHE` 的缓存」。升版（`gt-shell-v2` → `gt-shell-v3`）是**唯一**能清掉已中毒 v2 条目的机制 —— 不升版，已中毒用户因白屏收不到新 SW，永远卡死。

**修复方向**：在**两个写缓存入口**加 MIME 白名单校验（按扩展名 → 期望 MIME，比对**主类型**而非写死字符串，避免换 CDN 即误杀）；对 `/assets/*` 采用严格模式，类型不匹配则**不缓存且不把 HTML 交给页面**。

### 2.3 `makeResponse(parts)`

```js
function makeResponse(parts) {
  return new Response(parts.body, { status: parts.status, headers: parts.headers })
}
```

**为什么要单独一个函数**：因为 `sanitize` 返回的是 `{ body: ArrayBuffer, status, headers }` 这个**可复用的 parts 对象**，而 `put` 与 `respondWith` 需要**两个独立的 Response 实例**（一个 Response 的 body 只能被消费一次）。

`ArrayBuffer` 可以构造多个 `Response`，所以同一个 `parts` 能造出两个独立 Response。

### 2.4 `putClean(req, res)` —— 运行时写入

实测原文：

```js
async function putClean(req, res) {
  if (!res.ok) return res
  const parts = await sanitize(res)
  const cache = await caches.open(CACHE)
  await cache.put(req, makeResponse(parts))
  return makeResponse(parts)
}
```

**注释里有一句关键提醒**：

> 注意必须返回重建的干净 Response —— 原 `res` 的 body 已被 `sanitize` 消费，直接 `respondWith(原 res)` 会报 **`Body already consumed`** → 导航 **`ERR_FAILED`**

**这是第四类失败**（虽然注释里没编号，但同样真实）：`sanitize` 里做了 `await res.arrayBuffer()`，**原 `res.body` 的流已被读完**。此时如果 `respondWith(res)`，浏览器会报 "body already consumed"。

**所以必须返回 `makeResponse(parts)` 造的新实例**。这也是为什么 `sanitize` 的返回值设计成 parts 而不是 Response —— 就是为了支持"一个 buffer 造两个 Response"。

**第 5 类防御：`if (!res.ok) return res`** —— 非 2xx 响应不入缓存（避免缓存 404 / 500 页面）。

### 2.5 生命周期

#### `install`

```js
self.addEventListener('install', (event) => {
  event.waitUntil(precacheShell().then(() => self.skipWaiting()))
})
```

- 先 `precacheShell()` **完成**，再 `skipWaiting()`
- **顺序是有意的**：保证新 SW 接管时，缓存已经就位。如果先 `skipWaiting` 再预缓存，会有短暂窗口期缓存为空
- `skipWaiting()` 含义：**不等旧 SW 释放控制权，立即进入 activating 状态**

#### `activate`

```js
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})
```

- **删掉所有非 `gt-shell-v3` 的缓存** —— 这就是版本升级时的清理机制
- `clients.claim()` 含义：**立即接管已打开的页面**，不等下次导航

#### `precacheShell()` —— 预缓存

实测功能：

```js
const urls = new Set(SHELL)
try {
  const indexRes = await fetch('/index.html', { cache: 'no-cache' })
  if (indexRes.ok) {
    const html = await indexRes.text()
    for (const m of html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)) urls.add(m[1])
  }
} catch { /* 解析失败时退化为仅预缓存 SHELL */ }
```

**关键机制：解析首页 HTML，把构建产物 assets 一并纳入预缓存。**

**为什么必须要这一步**（注释原文）：

> 首访时 SW 尚未接管，页面资源请求不经过 fetch handler，**仅缓存 SHELL 会导致断网 reload 白屏**

**这是一个非常容易踩的坑**：

| 时序 | 会发生什么 |
|---|---|
| 用户首次访问 | 页面加载 HTML → 加载 JS/CSS（**此时 SW 还没接管，请求不经过 fetch handler**）→ SW 安装完成 |
| 用户断网刷新 | `caches.match('/index.html')` 命中 ✅，但 JS/CSS **从来没被缓存过** ❌ ⇒ **白屏** |

**对策**：在 `install` 阶段主动解析 HTML，找出 `/assets/*` 引用，逐条拉取并缓存。

**其余细节**：
- `cache: 'no-cache'` —— **绕过 HTTP 缓存**拿权威副本（避免拿到过期的 CDN 边缘缓存）
- 逐条 `ok` 校验 + `sanitize` 重建后再 `put`
- **单条失败跳过，不阻塞 `install`**（`catch {}`）—— 这是正确的取舍：一个资源拉不到不应该让整个 SW 装不上
- 解析失败时**退化为仅预缓存 SHELL**（`catch {}`）—— 优雅降级

**这个正则的局限**：
```js
/(?:src|href)="(\/assets\/[^"]+)"/g
```
- 只匹配**双引号**
- 只匹配**根路径 `/assets/`**（不支持相对路径或 CDN 绝对 URL）
- **只解析首页 HTML** —— 运行时动态请求的资源不会进预缓存

### 2.6 `fetch` 双策略（实测）

```js
self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // 策略 A：/assets/* → cache-first
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then((hit) =>
        hit || fetch(req).then((res) => putClean(req, res))))
    return
  }

  // 策略 B：其余 → network-first，断网回落
  event.respondWith(
    fetch(req)
      .then((res) => putClean(req, res))
      .catch(async () =>
        (await caches.match(req))
        || (await caches.match('/index.html'))
        || (await caches.match('/'))),
  )
})
```

#### 前置守卫

| 守卫 | 作用 |
|---|---|
| `req.method !== 'GET'` → return | 不拦截非 GET（POST 等交给网络） |
| `url.origin !== self.location.origin` → return | **不拦截跨 origin** |

**跨 origin 守卫是安全相关的**（见 `09-testing/SECURITY_TEST.md` S-1）：SW 有能力看到并改写所有经过它的请求，只处理同源是正确的最小权限原则。

#### 策略 A：`/assets/*` → cache-first

```
命中缓存 → 直接返回（不发起网络请求）
未命中   → fetch → putClean（存缓存 + 返回重建的干净 Response）
```

**为什么静态资源用 cache-first**：
- Vite 产物带 hash（如 `index-Cawl4_-q.js`）—— **内容变化 URL 就变**
- 所以不存在"缓存了旧版本"的问题：URL 一变就是新资源
- 配合 `public/_headers` 的 `/assets/*` → `Cache-Control: public, max-age=31536000, immutable`（**一年 + 不可变**）
- 结果：静态资源**零网络请求**，且永远不会因为缓存而拿到过期内容

**这是"带指纹的静态资源"的标准最优策略。**

#### 策略 B：其余 → network-first

```
fetch 成功 → putClean（更新缓存 + 返回）
fetch 失败 → 回落链：caches.match(req) || caches.match('/index.html') || caches.match('/')
```

**为什么页面用 network-first**：
- 页面 HTML 是**不带 hash** 的（`/` 或 `/index.html`）
- 如果 cache-first，用户会永远看到旧版本（除非 SW 版本号变了）
- network-first 保证在线时总是拿到最新页面

**回落链是三级兜底**（注释称"导航兜底 `/index.html` 与 `/` 双保险"）：

1. `caches.match(req)` — 这个具体 URL 的缓存
2. `caches.match('/index.html')` — 首页 HTML
3. `caches.match('/')` — 根路径

**为什么要三级**：SPA 里任意路径（如 `/review`、`/progress`）都应回落到首页（由前端路由处理）。如果只缓存了 `/` 而请求的是 `/review`，第二级和第三级能兜住。

---

## 3. 离线套件（`tests/offline-audit.mjs`，348 行）

### 3.1 五态内容

| 态 | 检查内容 |
|---|---|
| **态 1** | SW `ready` + `active` + **`controller` 存在** |
| **态 1.5** | 在线 reload（验证 SW 不破坏在线路径） |
| **态 2** | 断网 reload：**无 `ERR_FAILED`**、落 Home、切 typing、敲字母**光标前进** |
| **态 3** | 背单词：`Space` 翻面 + 打 `1` 推进 + **零 console error** |
| **态 4** | 缓存探针：`gt-shell-v3` 内**无 `redirected=true` 毒条目** + index 已缓存 |
| **态 4b** | **MIME 投毒探针（主动注入）**：用 `context.route` 伪造「软 404」（`status:200` + `text/html`）→ 断言 SW **不把它写进 `/assets/*.js` 缓存**、**不把 HTML 交给页面** |

### 3.2 几个设计亮点

**态 1 检查 `controller`**：
- `registration.active` 只说明 SW 已激活
- **`navigator.serviceWorker.controller` 非空**才说明**这个页面真的被 SW 接管了**
- 两者可以不同步（首次访问时 SW 刚 active 但当前页面还没被接管）—— **只检查 `active` 会得到假通过**

**态 1.5 先测在线**：
- 在测断网之前，先确认**在线路径没被 SW 破坏**
- 这是一个"对照组"设计：如果在线就坏了，测断网没有意义

**态 2 检查"光标前进"而不是"页面渲染"**：
- 只测"页面能打开"太弱（白屏也可能 DOM 里有东西）
- **"敲字母光标前进"证明交互链路真的活着**

**态 4 检查"无毒条目"**：
- 这是 `sanitize()` 存在意义的**直接验证**
- 遍历 `gt-shell-v3` 里所有条目，检查**没有 `redirected === true`**

**态 4b 是"主动注入"而非"被动等待"**：
- 病态输入（`200` + `text/html` 冒充 `*.js`）**只在 Cloudflare 上自然发生**，本地 `vite preview` 对缺失资源返回 404/502
- 若只写被动探针（"检查缓存里有没有中毒条目"），本地产物**永远不会有中毒条目** → 测试**恒绿，是空转测试（air test）**
- 因此改用 `context.route` **主动伪造软 404**，让病态输入在本地也出现；再用**反证实验**（摘除 `typeMatches()` 守卫）确认探针会**变红**，证明断言真的有判别力
- **技术要点**：SW 发起的 fetch 运行在独立 worker target，**页面级 CDP `Fetch.enable` 拦截不到**（实测 `routeHits=0`）；必须用 Playwright 的 `context.route`（实测 `routeHits=1`）

**态 3 检查"零 console error"**：
- 离线状态下最容易出现隐藏异常（资源拉不到、API 不可用）
- **零 console error 是比"页面能显示"更强的判据**

### 3.3 证据落盘

`tests/_evidence/offline-audit-result.json`

收尾（`tests/offline-audit.mjs`）：打印「结论：✅ 全部通过」后 `process.exit(...)`。

### 3.4 `--prod` 模式

```
npm run test:prod   →  node tests/offline-audit.mjs --prod
```

同一套断言，打线上域名。这让"本地 preview 的 SW 行为"与"线上 CDN 后的 SW 行为"能用同一标准比对。

---

## 4. 生产 SW 升级测试（`tests/prod-smoke.mjs` Part B）

| 断言 | 内容 | 验证的能力 |
|---|---|---|
| **B1** | 新访客 `skipWaiting` + `clients.claim()` **立即接管**、缓存中**仅 `gt-shell-v3`** | 首次访问即被接管 + 无残留 |
| **B2** | 连续 reload，**第二次断网走缓存** | 缓存确实建立并可回放 |
| **B3** | 注入 `gt-shell-v1` 残留 → 重新安装 → `activate` 清理 → **断网可用** | **版本升级 + 旧缓存清理全链路** |

**B3 是最有价值的**：它**主动注入**旧版本缓存残留，然后验证：
1. 新 SW 安装时 `activate` 删掉了 `gt-shell-v1`
2. 删除之后断网仍可用（说明新缓存已建立）

**这是一个"升级路径"测试**，而不是"全新安装"测试。真实用户绝大多数是升级场景，不是全新安装。**很多项目只测全新安装，升级路径的 bug 上线才发现。**

---

## 5. 缺口清单

### 5.1 功能层

| # | 缺口 | 对应编号 |
|---|---|---|
| **O-0** | 🔴 **写缓存不校验 `Content-Type` ⇒ SPA fallback 可投毒 `/assets/*`（"背景 4"）** | `KNOWN_ISSUES.md#BUG-002` |
| O-1 | **无离线状态 UI** | `UX-001` |
| O-2 | **无 SW 更新提示** —— `skipWaiting()` 是立即接管，用户无感知，不知道页面刚换了版本 | — |
| O-3 | **无缓存容量上限处理** —— 浏览器 Cache Storage 配额耗尽时无降级策略 | — |
| O-4 | **无"清理缓存"的用户入口** | — |
| O-5 | `precacheShell()` 只解析首页 HTML ⇒ **运行时动态请求的资源不进预缓存** | — |

**O-0 是本节最严重的缺口**（因此编号置于 O-1 之前）：它不是"体验不好"或"断网不可用"，而是**联网状态下永久损坏应用且用户无法自愈**。完整链路见 §2.2「背景 4」。

**O-1 值得展开**：功能上离线可用，但**用户看不到任何提示**。用户在断网时可能误以为"网站坏了"，而不是"当前离线但可以用"。这是一个明确的体验缺口。

**O-2 是一个常见的误区**：`skipWaiting()` + `clients.claim()` 让更新"立即生效"，听起来很好，但代价是：
- 用户正在输入的内容可能因为页面资源被替换而异常
- 用户不知道"版本变了"

**标准做法**：不调 `skipWaiting()`，而是通过 `postMessage` 通知页面"有新版本可用"，让用户选时机刷新。**当前实现选择了激进路径。**

**O-5 的影响**：如果未来引入音频（`/audio/*`）或媒体资源，它们**不在 `/assets/*` 的 cache-first 规则内**，也不在 `precacheShell` 的正则匹配内 ⇒ 断网不可用（详见 `09-testing/MEDIA_TEST.md` §4）。

### 5.2 测试层

| # | 缺口 |
|---|---|
| T-1 | **弱网（非断网）无测试** —— `FLAKY-002` 记录了预热探针预算从 18s 放宽到 30s 的抖动 |
| T-2 | **多 tab 场景无测试** —— 两个标签页同时开着时 `clients.claim()` 的行为 |
| T-3 | **`Vary: Origin` 场景无直接断言** —— 态 4 只查了 `redirected=true`，没查"缓存条目是否还带 `vary` 头" |
| T-4 | **`content-encoding` 残留无直接断言** —— 同上 |
| T-5 | **跨 origin 不拦截无断言**（`SECURITY_TEST.md` S-1） |
| T-6 | **非 GET 不拦截无断言**（S-2） |
| T-7 | **`!res.ok` 不入缓存无断言**（S-3） |
| T-8 | **`precacheShell` 单条失败跳过的容错无断言** |
| T-9 | **HTML 解析失败退化为 SHELL 的分支无断言** |
| T-10 | **配额耗尽时 SW 的行为无断言** |
| **T-11** | 🔴 **`Content-Type` 校验无断言，且防御本身缺失**（`BUG-002`）—— 需新增：给定「200 + text/html」响应的 `/assets/*` 请求，断言其**不进入缓存**，且不把 HTML 交给页面 |

**T-3 / T-4 特别值得注意**：这是两个"防御已经写好了，但没有断言证明它有效"的案例。

`sanitize` 剥离了 `content-encoding` / `content-length` / `vary`，**但态 4 只检查了 `redirected === true`**。也就是说：

> 如果某天有人误删了 `headers.delete('vary')` 这一行，**现有测试不会失败**。

**修复建议**：态 4 的探针扩展为逐条检查缓存条目：

```js
// 概念示意
for (const entry of cachedEntries) {
  assert(!entry.redirected)                       // 已有
  assert(!entry.headers.has('content-encoding'))  // 待加
  assert(!entry.headers.has('content-length'))    // 待加
  assert(!entry.headers.has('vary'))              // 待加
}
```

**这是成本极低、价值很高的一处补充**——直接守护了三类最隐蔽的静默失败。

---

## 6. CI 中的位置

| Workflow | 是否跑离线审计 |
|---|---|
| `deploy.yml` | ❌ 未跑 |
| `e2e.yml` | ❌ **未跑**（只跑了 `node tests/e2e.mjs`） |

即：**这一块做得最好的 SW 逻辑，唯一跑它的地方是开发者的本机。**

⇒ `DEBT-002`。修复：在 `e2e.yml` 加一行 `node tests/offline-audit.mjs`。

---

## 7. 与 `public/_headers` 的配合

两层缓存策略是**协同设计**的：

| 层 | 规则 | 效果 |
|---|---|---|
| **HTTP 缓存**（`public/_headers`） | `/assets/*` → `max-age=31536000, immutable` | 浏览器原生缓存一年 |
| **HTTP 缓存** | `/sw.js` → `no-cache` | **保证新 SW 能被及时探测** |
| **Cache Storage**（`sw.js`） | `/assets/*` → cache-first | SW 层零网络请求 |
| **Cache Storage** | 其余 → network-first | 在线拿最新，断网回落 |

**`/sw.js` 的 `no-cache` 是这套设计的启动条件**：如果 `sw.js` 自己被长时间缓存，浏览器永远发现不了新版本，`activate` 里的清理逻辑就永远不会执行，整个升级链路失效。

`tests/prod-smoke.mjs` 的 **A2** 正是验证这一点（检查 `sw.js` 响应 `no-cache` 且内容含 `gt-shell-v3`）。**这是全套离线测试里守得最紧的一个关键点。**

---

## 8. 一句话总结给审计方

**离线是本项目做得最扎实的一块：SW 双策略（静态资源 cache-first + 页面 network-first）、`install` 阶段主动解析 HTML 补预缓存（避免首次访问后断网白屏）、`skipWaiting`+`clients.claim` 立即接管、`activate` 清理旧版本，另有 5 态离线审计 + 3 组生产升级测试（含主动注入 `gt-shell-v1` 残留的升级路径验证）。最有价值的是 `sanitize()` 对应的三类静默 `ERR_FAILED`（308 毒条目 / body 二次解码 / `Vary: Origin` 静默 miss），每条都是踩坑得来。**

**但本轮审计发现它缺了第四类防御，且后果远重于前三类：写缓存时不校验 `Content-Type`（§2.2 背景 4）。**
Cloudflare Pages 对不存在的 `/assets/*` 返回 `200 + text/html`（软 404，已实测），而 `/assets/*` 是 cache-first，
叠加 `nosniff` ⇒ **SW 会把首页 HTML 当 JS 永久缓存，用户白屏且无法自愈**。
线上 hash 漂移（本地 `index-Dw5EkkBq.js` vs 线上 `index-Cawl4_-q.js`）**已经实际发生**，故这不是理论风险。
见 `13-acceptance/KNOWN_ISSUES.md#BUG-002`。**这是本文件最需要被读到的一段。**

其余缺口：① 三类既有防御缺少对应的缓存条目断言（只查了 `redirected`，T-3/T-4/T-11）；② 无离线状态 UI（`UX-001`）与版本更新提示。
