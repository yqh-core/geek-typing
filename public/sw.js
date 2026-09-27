/* Geek Typing Service Worker：离线可用 + 资源强缓存 */
/* v3：新增 Content-Type 校验（背景 4）。v2 曾把 SPA fallback 的 HTML 缓存进 /assets/*，
   导致该 URL 永久返回 HTML + nosniff ⇒ 用户白屏且无法自愈。
   升版是清除存量中毒条目的唯一机制（见 activate）。 */
const CACHE = 'gt-shell-v3'
const SHELL = ['/', '/index.html', '/favicon.svg', '/icons.svg', '/icon-192.png', '/icon-512.png', '/manifest.webmanifest']

/* 扩展名 → 期望 MIME 主类型。只比主类型（如 application/javascript 与 text/javascript 都算 js），
   避免 CDN 更换时把合法资源误杀。未知扩展名返回 null ⇒ 不做类型校验（保持宽容）。 */
const MIME_BY_EXT = {
  js: 'javascript',
  mjs: 'javascript',
  css: 'text/css',
  html: 'text/html',
  json: 'json',
  webmanifest: 'json',
  svg: 'image/svg+xml',
  png: 'image/',
  jpg: 'image/',
  jpeg: 'image/',
  webp: 'image/',
  avif: 'image/',
  gif: 'image/',
  ico: 'image/',
  woff: 'font/',
  woff2: 'font/',
  ttf: 'font/',
  mp3: 'audio/',
  m4a: 'audio/',
  wav: 'audio/',
  ogg: 'audio/',
  mp4: 'video/',
  webm: 'video/',
  vtt: 'text/vtt',
  srt: 'text/plain',
  txt: 'text/plain',
  xml: 'xml',
}

/* 取 URL 的扩展名（小写，不带点）。无扩展名返回 ''。 */
function extOf(url) {
  const path = url.pathname
  const dot = path.lastIndexOf('.')
  const slash = path.lastIndexOf('/')
  if (dot <= slash) return ''
  return path.slice(dot + 1).toLowerCase()
}

/* 校验响应的 Content-Type 是否与 URL 扩展名相符。
   background 4：Cloudflare Pages 对不存在的 /assets/* 返回 200 + text/html（SPA fallback，
   已实测 2007 B 的 index.html），若仅凭 res.ok 就写入缓存，会把 HTML 当 JS 永久缓存。
   返回 true = 类型相符（或扩展名未知，无从校验）；false = 明确不符，不得缓存。 */
function typeMatches(url, res) {
  const expected = MIME_BY_EXT[extOf(url)]
  if (!expected) return true
  const actual = (res.headers.get('content-type') || '').toLowerCase()
  if (!actual) return false
  return actual.includes(expected)
}

/* 重建干净 Response：剥离 redirected 标记 + 规范化响应头。
   背景 1：CDN 可能对 shell 条目返回 308 重定向，缓存一条 redirected=true 的响应后，
   Fetch 规范禁止将其 respondWith 给 follow 模式的导航请求 → 断网导航 ERR_FAILED。
   背景 2：body 已解压，若保留 content-encoding 头，缓存命中后浏览器二次解码 → ERR_FAILED。
   背景 3：源站可能返回 Vary: Origin，而 SW fetch 与页面请求的 Origin 头不一致会让
   caches.match(页面请求) 静默 miss → 断网回源失败；单一源站缓存中 Vary 无意义。
   背景 4：源站可能对不存在的资源返回 200 + text/html（SPA fallback），凭 res.ok 就缓存
   会把 HTML 当 JS 存进 /assets/*；缓存优先策略下该 URL 将永久损坏（见 typeMatches）。
   返回 { body, status, headers }：同一 buffer 可构造多个独立 Response（供 put + respondWith）。 */
async function sanitize(res) {
  const body = await res.arrayBuffer()
  const headers = new Headers(res.headers)
  headers.delete('content-encoding')
  headers.delete('content-length')
  headers.delete('vary')
  return { body, status: res.status, headers }
}

function makeResponse(parts) {
  return new Response(parts.body, { status: parts.status, headers: parts.headers })
}

/* install 预缓存：解析首页 HTML 把构建产物 assets 一并纳入（首访时 SW 尚未接管，
   页面资源请求不经过 fetch handler，仅缓存 SHELL 会导致断网 reload 白屏），
   逐条显式拉取（cache: no-cache 绕过 HTTP 缓存拿权威副本），
   ok 校验 + Content-Type 校验 + sanitize 重建后再写入；单条失败跳过，不阻塞 install。
   Content-Type 校验放在 sanitize 之前读取（sanitize 保留 headers，两者皆可，
   但先校验可避免为一条注定不缓存的响应白读 arrayBuffer）。 */
async function precacheShell() {
  const cache = await caches.open(CACHE)
  const urls = new Set(SHELL)
  try {
    const indexRes = await fetch('/index.html', { cache: 'no-cache' })
    if (indexRes.ok) {
      const html = await indexRes.text()
      for (const m of html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)) urls.add(m[1])
    }
  } catch {
    /* 解析失败时退化为仅预缓存 SHELL */
  }
  await Promise.all(
    [...urls].map(async (url) => {
      try {
        const res = await fetch(url, { cache: 'no-cache' })
        if (!res.ok) return
        if (!typeMatches(new URL(url, self.location.origin), res)) return
        await cache.put(url, makeResponse(await sanitize(res)))
      } catch {
        /* 单条 precache 失败不影响其余 shell 条目 */
      }
    }),
  )
}

/* 运行时缓存写入：先做 Content-Type 校验，再 sanitize 后 put，防毒条目入库。
   Content-Type 不符时的降级语义（关键，勿改）：
   - 不写缓存（否则 cache-first 会永久毒化该 URL）；
   - 对 /assets/* 额外返回 504 错误响应，而不是把 HTML 原样交给页面。
     原样返回会让浏览器在 HTML 上执行 <script src>.js 的解析并报 Unexpected token '<'，
     看似"能跑到报错"，实则掩埋了根因；返回 504 让调用方拿到明确的网络失败信号。
   - 其它路径（页面等）保持原样返回：页面本就允许 text/html，无投毒风险。
   注意必须返回重建的干净 Response——原 res 的 body 已被 sanitize 消费，
   直接 respondWith(原 res) 会报 Body already consumed → 导航 ERR_FAILED。 */
async function putClean(req, res) {
  if (!res.ok) return res
  const isAsset = new URL(req.url).pathname.startsWith('/assets/')
  if (!typeMatches(new URL(req.url), res)) {
    return isAsset ? new Response(null, { status: 504, statusText: 'Asset MIME mismatch' }) : res
  }
  const parts = await sanitize(res)
  const cache = await caches.open(CACHE)
  await cache.put(req, makeResponse(parts))
  return makeResponse(parts)
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheShell().then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // 带 hash 的静态资源：缓存优先（内容变 URL 就变，可放心长期缓存）
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req)
            .then((res) => putClean(req, res))
            .catch(() => new Response(null, { status: 504, statusText: 'Asset fetch failed' })),
      ),
    )
    return
  }

  // 页面与其它文件：网络优先，断网回落缓存（导航兜底 /index.html 与 / 双保险）
  event.respondWith(
    fetch(req)
      .then((res) => putClean(req, res))
      .catch(
        async () =>
          (await caches.match(req)) || (await caches.match('/index.html')) || (await caches.match('/')),
      ),
  )
})
