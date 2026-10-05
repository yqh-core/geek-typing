/* Geek Typing Service Worker：离线可用 + 资源强缓存 */
/* v3：新增 Content-Type 校验（背景 4）。v2 曾把 SPA fallback 的 HTML 缓存进 /assets/*，
   导致该 URL 永久返回 HTML + nosniff ⇒ 用户白屏且无法自愈。
   升版是清除存量中毒条目的唯一机制（见 activate）。 */
const CACHE = 'gt-shell-v3'
const SHELL = ['/', '/index.html', '/favicon.svg', '/icons.svg', '/icon-192.png', '/icon-512.png', '/manifest.webmanifest']

/* 单条 precache fetch 的超时预算（毫秒）。
 *
 * 为什么必须有这个超时（CI run 37304973473 门禁③ e2e 169/171 的根因链，本机逐环复现过）：
 *   precacheShell 里每条 fetch 原本**没有任何超时**。只要有**一条**既不 resolve 也不 reject
 *   （弱网下连接半开、CDN 挂住），`Promise.all` 就**永不 settle** ⇒
 *   install 事件的 waitUntil 永不结束 ⇒ `self.skipWaiting()` 永不调用 ⇒ 永不 activate ⇒
 *   `clients.claim()` 永不执行 ⇒ `navigator.serviceWorker.controller` 恒为 false。
 *   而 words chunk 的动态 import 在接管前不经 fetch handler ⇒ 永不入 SW 缓存 ⇒ 预热 0 命中。
 *   注意 `caches.open` 是 precacheShell 的第一条语句，cache 会被**立刻建出来**，
 *   所以观测上会出现「gt-shell-v3 存在、但里面没有 words chunk」这个自相矛盾的现象。
 *   ⚠️ 这类挂住**不可能 reject**（caches.open 是裸语句且已成功；index 解析与每条 url 的 map
 *   回调各有 try/catch），所以没有任何路径能把错误抛回 install 让浏览器自己判 failed ——
 *   只能靠这里的超时主动结束等待。这也是为什么拉长任何外部等待时间都零效果（实测 100s 预算下
 *   controller 依然为 null）：Promise 永不 settle，等多久都一样。
 *
 * 为什么是 8000（取值依据，别拍脑袋改）：
 *   - 下界要盖住真实慢机：CI 慢机实测 precache 整段 install→claim 约 8.8s，而本机约 54ms。
 *     逐条 fetch 是并发的，整段耗时由**最慢那一条**决定，故单条预算需 ≥ 整段的慢机量级；
 *     8000ms 与 8.8s 同量级，能覆盖慢机而不至于把正常慢响应误判为挂住。
 *   - 上界要「有意义地短」：超时后还要留出 skipWaiting → activate → claim 的时间，
 *     而 e2e 探针的等接管预算是 30s。8000ms 远小于它 ⇒ 真挂住时探针仍能在预算内拿到 controller，
 *     install 由**挂住**降级为「那一条没进缓存」，其余 8 条照常写入（fail-closed 语义不变）。
 *   - 若把它调到接近 30s，真挂住时探针就会因为「等不到 controller」而红 —— 那是把超时
 *     换成了另一种挂死，达不到「终结挂起状态」的目的。
 *
 * ⚠️ 已知风险（改动者必须知道，故写在这里而不是只留在commit message）：
 *   **8s 略低于慢机实测的 8.8s 整段值。** 逐条并发时「整段 8.8s」与「最慢单条」的分布
 *   我**没有分项实测**，所以不能断言 8s 一定够。若 CI 上 install 确实需要> 8s，
 *   后果**不是 flaky 复发**，而是：那条 precache 走「跳过」路径⇒ 可见的
 *   `[sw] precache 超时…` warn + 其余 8 条照常写入 + **SW 仍会 activate、controller 仍会出现**
 *   ⇒ 探针仍绿，但 offline-audit 的「态4 缓存条目齐全」会少一条而判红。
 *   那种失败是**可诊断的**（有 warn、条目清单能指出缺哪条），不是静默劣化。
 *   ⇒ 若真发生，上调本常量即可。**上调的上界约束**：必须显著小于 e2e 探针 30s 等接管预算，
 *   否则真挂住时探针会因等不到 controller 而红，超时就退化成「另一种挂死」。
 *   ⚠️ 另注：把 8s 调**小**不会让 flaky 变多（挂起已由超时终结），只会让慢机更容易走跳过路径。 */
const PRECACHE_FETCH_TIMEOUT_MS = 8000

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

/* 带超时的 fetch：超时即 abort，**必定 settle**（resolve 或 reject），
   这是让 Promise.all 必然结束的唯一手段（见 PRECACHE_FETCH_TIMEOUT_MS 处的根因说明）。

   ⚠️ 兼容层必须**自证可用**，不能静默退化。
   `AbortSignal.timeout` 在旧内核上不存在 ⇒ 若只 `return undefined`，本函数就退化成
   「无超时」—— 也就是**把本次修掉的根因原样放回去**：任一条 precache fetch 挂住 ⇒
   Promise.all 永不 settle ⇒ skipWaiting 永不调用 ⇒ controller 恒 false。
   而这种退化**在 CI 上测不出来**（本地 Chromium 支持该 API，只有老内核才走退化分支），
   属于典型的「静默失效 = 下次还得从头取证」。

   所以降级路径不是「无声地没有超时」，而是：
     ① 用 AbortController + setTimeout 自己实现一条等价的超时（不依赖 AbortSignal.timeout）；
     ② 若连 AbortController 都不可用 ⇒ **明确 warn 一条**，让「本环境没有超时保护」这件事
        在日志里可见，而不是消失在 undefined 里。 */
function timeoutSignal(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms)
  }
  //降级实现：自己拿 AbortController + 定时器，语义与 AbortSignal.timeout 等价
  if (typeof AbortController === 'function') {
    const ctrl = new AbortController()
    setTimeout(() => ctrl.abort(), ms)
    return ctrl.signal
  }
  console.warn(
    `[sw] 本环境既无 AbortSignal.timeout 也无 AbortController（ms=${ms}）：` +
      'precache 单条 fetch 将**没有超时保护**——若某条请求挂住，install 不会结束、SW 不会接管。',
  )
  return undefined
}

/* install 预缓存：解析首页 HTML 把构建产物 assets 一并纳入（首访时 SW 尚未接管，
   页面资源请求不经过 fetch handler，仅缓存 SHELL 会导致断网 reload 白屏），
   逐条显式拉取（cache: no-cache 绕过 HTTP 缓存拿权威副本），
   ok 校验 + Content-Type 校验 + sanitize 重建后再写入；单条失败跳过，不阻塞 install。
   Content-Type 校验放在 sanitize 之前读取（sanitize 保留 headers，两者皆可，
   但先校验可避免为一条注定不缓存的响应白读 arrayBuffer）。
   每条 fetch 都带 PRECACHE_FETCH_TIMEOUT_MS 超时：这是「install 必然能结束」的唯一保证。 */
async function precacheShell() {
  const cache = await caches.open(CACHE)
  const urls = new Set(SHELL)
  /* 超时计数：单独统计是刻意设计 —— 见下方「超时必须可观测」的说明。 */
  let timedOut = 0
  try {
    const indexRes = await fetch('/index.html', { cache: 'no-cache', signal: timeoutSignal(PRECACHE_FETCH_TIMEOUT_MS) })
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
        const res = await fetch(url, { cache: 'no-cache', signal: timeoutSignal(PRECACHE_FETCH_TIMEOUT_MS) })
        if (!res.ok) return
        if (!typeMatches(new URL(url, self.location.origin), res)) return
        await cache.put(url, makeResponse(await sanitize(res)))
      } catch (err) {
        /* 单条 precache 失败不影响其余 shell 条目 —— 失败语义与改动前完全一致（跳过该条）。
         * ⚠️ 但**超时必须留下可观测信号**，不能与「网络抖动导致的普通失败」一样静默：
         * 超时是「对端挂住」这类会重复发生的故障，若照样静默跳过，线上就只剩
         * 「首次离线切大词库失败」这一个远端症状，下次还得从头取证 ——
         * 这正是 CI run 37304973473 那次事故的教训：静默失效 = 下次还得重新取证。
         * 故这里显式计数 + console 报警，语义仍是「跳过」（不阻塞 install、不影响其余条目）。 */
        if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
          timedOut++
          console.warn(`[sw] precache 超时（${PRECACHE_FETCH_TIMEOUT_MS}ms），已跳过：${url}`)
        }
      }
    }),
  )
  /* 汇总一次：即便每条都已逐条报警，再给一条总计，便于在 DevTools/日志里一眼看到量级。 */
  if (timedOut > 0) {
    console.warn(`[sw] precache 共 ${timedOut} 条超时未入缓存（预算 ${PRECACHE_FETCH_TIMEOUT_MS}ms/条），其余条目正常`)
  }
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
  /* 有了 PRECACHE_FETCH_TIMEOUT_MS 后，precacheShell() **必然 settle**（每条 fetch 都带超时），
     故 skipWaiting 必然被调用 ⇒ 必然 activate ⇒ clients.claim() 必然执行 ⇒ controller 会出现。
     改动前这里是无保护的：任一条 fetch 挂住 ⇒ Promise.all 永不 settle ⇒ skipWaiting 永不调用，
     SW 永远停在 installing，页面被降级到「无 controller」（CI run 37304973473 的根因）。
     保持 .then(() => skipWaiting()) 而非 waitUntil(precacheShell()) + 独立 skipWaiting：
     后者在 precache 挂住时同样会 activate，但没有缓存内容 —— 语义不如现在这条明确。 */
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
