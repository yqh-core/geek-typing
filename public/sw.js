/* Geek Typing Service Worker：离线可用 + 资源强缓存 */
const CACHE = 'gt-shell-v2'
const SHELL = ['/', '/index.html', '/favicon.svg', '/icons.svg', '/icon-192.png', '/icon-512.png', '/manifest.webmanifest']

/* 重建干净 Response：剥离 redirected 标记 + 规范化响应头。
   背景 1：CDN 可能对 shell 条目返回 308 重定向，缓存一条 redirected=true 的响应后，
   Fetch 规范禁止将其 respondWith 给 follow 模式的导航请求 → 断网导航 ERR_FAILED。
   背景 2：body 已解压，若保留 content-encoding 头，缓存命中后浏览器二次解码 → ERR_FAILED。
   背景 3：源站可能返回 Vary: Origin，而 SW fetch 与页面请求的 Origin 头不一致会让
   caches.match(页面请求) 静默 miss → 断网回源失败；单一源站缓存中 Vary 无意义。
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
   ok 校验 + sanitize 重建后再写入；单条失败跳过，不阻塞 install。 */
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
        await cache.put(url, makeResponse(await sanitize(res)))
      } catch {
        /* 单条 precache 失败不影响其余 shell 条目 */
      }
    }),
  )
}

/* 运行时缓存写入：统一 sanitize 后再 put，防毒条目入库。
   注意必须返回重建的干净 Response——原 res 的 body 已被 sanitize 消费，
   直接 respondWith(原 res) 会报 Body already consumed → 导航 ERR_FAILED。 */
async function putClean(req, res) {
  if (!res.ok) return res
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
            .then((res) => putClean(req, res)),
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
