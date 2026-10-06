#!/usr/bin/env node
/**
 * SEO Content Surface 第一阶段 · 静态词库页生成器（build-static-pages）
 *
 * 目的（为什么需要这道工序）：
 *   本项目是 React SPA，`dist/index.html` 的< body > 里只有 `<div id="root"></div>` ⇒
 *   **不执行 JS 的爬虫能读到的正文是 0 字符**（head 里只有 title 22 字符 + description 97 字符）。
 *   同时 `dist/sitemap.xml` 只有 1 条 `<url>`（首页）。⇒ 13 个词汇包 / 9438 条词条对索引零曝光。
 *   本脚本为每个 `type === 'vocabulary'` 的包生成 1 个**纯静态** HTML 页（真实词条正文在 HTML 里，
 *   不依赖任何 JS），并把 sitemap 扩到 1 + 13 = 14 条。
 *
 * 范围（严格裁定，不得扩大）：
 *   - 只处理 `content/vocabulary/*`，**不碰** reading / exercise / audio / listening /
 *     speaking / writing / collection / topic。
 *   - **不做分页**：每页只输出受控规模的首屏内容，SPA 才是完整内容承载。
 *     绝不生成 `/page/2/` 之类 URL —— 那会产生一串没有真实内容的薄页（thin content）。
 *   - **一个生成器、一个模板函数**，遍历目录得出页；**禁止按包写 13 个文件**
 *     （INV-6「类型契约唯一」在产物侧的延伸，见 gate-seo-pages.mjs 判据 10）。
 *
 * 三条硬约束（实测得出，违反即门禁红）：
 *   ① 必须排在 `vite build` **之后**：`vite.config.ts` 没配 outDir/emptyOutDir ⇒ vite 会清空 dist/。
 *   ② 页文件名绝不能叫 `index.html`：`scripts/check-bundle.mjs` 要求 `dist/assets/index-*.js`
 *      恰好 1 个，且多处枚举 `dist/assets`；输出目录用 `dist/pages/` 天然避开。
 *   ③ 输出目录不能是 `dist/assets/`（会污染 lazyChunks 语义与 chunk 计数）。
 *
 * ⭐ **URL 规范化（本次修复的核心）**：
 *   词库页的**规范 URL 不带 `.html`** —— 生产实测 `/pages/bank/ielts.html` 会 **308** 重定向到
 *   `/pages/bank/ielts`，`.html` 不是最终规范地址。canonical / og:url / sitemap `<loc>` / 门禁判据 5
 *   的期望值**四处必须全部来自 canonicalBankUrl() 这一个函数**；任何一处自己拼字符串都会分叉。
 *   ⚠️ 但**页文件名仍带 `.html`**（CF Pages 需静态文件才能响应）—— 文件名与 URL 是两件事。
 *
 * siteOrigin 的单一事实源（**不新造常量**）：
 *   依次读`index.html` 的 `<link rel="canonical">` → `public/sitemap.xml` 的首个 `<loc>`。
 *   两处本来就必须一致（docs/audit-package 8.2.3 已把「三处一致」列为既有事实），
 *   所以「读既有那个」不会引入新的漂移面；读不到则直接报错退出，不静默兜一个假域名。
 *
 * 用法：
 *   node scripts/seo/build-static-pages.mjs# 生成 dist/pages/bank/*.html + dist/sitemap.xml
 *
 * 设计约束：**import 本模块不得触发任何写盘**（CLI 段放在 `import.meta.url` 判定之后，
 * 见文件末尾）—— 这样 gate-seo-pages.mjs 可以 import 纯逻辑做判据计算与故障注入，
 * 而不会在 import 副作用里改产物。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { injectIntoIndexHtml, renderHomeLandingBlock } from './home-landing.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const VOCAB_DIR = join(ROOT, 'content', 'vocabulary')
const DIST = join(ROOT, 'dist')
/** 静态页输出根（**不是** dist/assets/ —— 那会污染 lazyChunks 语义与 chunk 计数，见头注③） */
export const PAGES_DIR = join(DIST, 'pages')
export const BANK_DIR = join(PAGES_DIR, 'bank')
export const SITE_SITEMAP = join(DIST, 'sitemap.xml')

/**
 * 单页词条数上限（受控规模；SPA 才是完整内容承载）。
 *
 * 取300 的依据（实测推导，不是拍脑袋）：
 *   - 上界来自体积：把 ielts 的 3000 词全部渲成 `<li>` 实测约 198 KiB（题面实测值）。
 *     单词条 HTML 均值 ≈ 198KiB / 3000 ≈ 67.6 B ⇒300 条约 20 KiB，距 200 KiB 上限有一个数量级余量；
 *     而 2000 条会到约 132 KiB，虽仍在上限内但**首屏 HTML 已过大**（爬虫抓取预算、
 *     Cloudflare Pages 单文件体积、移动网络下首字节体验都不该为此付代价）。
 *   - 下界来自价值：判据 3 要求每页去标签正文 ≥ 500 字符、判据 4 要求 ≥ 3 组word+translation。
 *     实测最小的包 frontend 只有 20 词（全部列出也只有 347 字符纯词条文本）⇒ 必须靠
 *     「简介段落 + 计数说明 + 词条列表」三层叠加才可能过 500 字符。
 *   - 300 是「词条本身就是页面主体」的量级：词条文本在页内占比高，页面不会被导航/说明文字稀释。
 * **不做分页**（范围裁定）：300 之后的内容不进静态页，也不生成 /page/2/ —— 那些页没有真实内容。
 * 截取是**确定性**的：按 words.json 原顺序取前 N（见 selectWords）。
 */
export const WORDS_PER_PAGE = 300

/** 站点名（与 index.html / manifest.webmanifest 一致，用于 title 后缀） */
const SITE_NAME = 'Geek Typing'

/**
 * 页内链回 SPA 的地址。
 *
 * ⚠️ **刻意不是 canonicalBankUrl**：它指向的是 SPA 首页，不是本页自己，
 *所以不适用「本页规范 URL」那套去后缀逻辑。用根相对 `/` 而非绝对地址，
 *   是为了换域名/换 origin 时不必重跑生成器（少一个需要同步的常量）。
 *
 * 之所以仍然把它收进导出面（而不是继续当裸字面量写在模板里）：本次缺陷的教训是
 *   「同一个 URL 在多处各写一遍 ⇒ 整齐地一起写错」。凡是会被搜索引擎读到的 href，
 *   都必须有名有姓地暴露出来，门禁判据 13 才能对它断言「不含 .html」。
 */
export const APP_HOME_HREF = '/'

/* ──────────────────────────纯逻辑（可注入 / 可测试） ────────────────────────── */

/**
 * ⭐ 词库页的**规范 URL**（canonical URL）—— 全站唯一事实源。
 *
 * ⛔ **不带 `.html` 后缀**，这是本函数存在的全部理由：
 *   生产实测（geek-typing.pages.dev，Cloudflare Pages 托管层行为）：
 *     /pages/bank/ielts.html → **308永久重定向** → /pages/bank/ielts → 200
 *   也就是说 `.html` 地址**会 308**，它不是最终规范 URL；而 canonical 指向一个会重定向的地址，
 *   等于告诉搜索引擎「权威版本是那个会被 308 的地址」⇒ 规范信号与真实索引地址不一致。
 *   本地任何静态检查都发现不了这一点，因为 308 是**托管层**行为，不是产物属性。
 *
 *⚠️ **页文件名仍带 `.html`**（dist/pages/bank/<id>.html）：Cloudflare Pages 需要真实静态文件
 *   才能响应；去掉文件名后缀会破坏部署。**文件名与 URL 是两件事** —— 本函数只管 URL 层面。
 *
 * 三处必须同源（本次缺陷的教训：`.html` 曾整齐地写在三个地方）：
 *   ① `<link rel="canonical">`与 `og:url`（renderBankPage）
 *   ② sitemap的 `<loc>`（main）
 *   ③ 门禁判据 5 的期望值（gate-seo-pages import 本函数）
 * 任何一处自己拼字符串都会再次分叉 ⇒ **只允许调用本函数**。
 *
 * @param {string} siteOrigin 站点绝对 origin（无尾斜杠，如 https://geek-typing.pages.dev）
 * @param {string} packageId 包 id（来自 manifest.packageId）
 * @returns {string} 规范 URL，如 https://geek-typing.pages.dev/pages/bank/ielts
 */
export function canonicalBankUrl(siteOrigin, packageId) {
  const origin = String(siteOrigin ?? '').replace(/\/+$/, '')
  const id = String(packageId ?? '').trim()
  return `${origin}/pages/bank/${encodeURIComponent(id)}`
}

/**
 * HTML 转义。词条里实测出现 `'`、`&`、`<`（definition 字段来自 ECDICT 英文释义），
 * 不转义就会破坏 HTML 结构 ⇒ 所有动态位置必须过这里。
 *
 * 注意顺序：先 `&` 再 `<`/`>`，否则 `&amp;` 里的 `&` 会被二次转义成 `&amp;amp;`。
 * @param {unknown} value 任意值（null/undefined 走空串，避免渲染出 "undefined"）
 * @returns {string} 转义后的 HTML 文本
 */
export function escapeHtml(value) {
  if (value == null) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * 该目录是否应被生成为静态页 —— **只用类型契约判断**，不硬编码 13 个包名。
 *
 * 为什么必须这样：13 个包名硬编码进去，下一个新增词汇包（PM 侧随时会加）就会被静默漏掉，
 * 而「漏掉」在这条链路上是**零告警**的 —— 没有任何门禁会告诉你「有个包没出页」。
 * 判据 10（模板函数只有 1 个）与判据 2（13/13 页面存在）共同保证新增包**必然**出页。
 *
 * @param {string} _dirName 目录名（仅用于日志，不参与判定 —— 身份以 manifest 为准）
 * @param {{type?:string}|null} manifest 包 manifest
 * @returns {boolean} true = 应生成
 */
export function shouldInclude(_dirName, manifest) {
  return manifest != null && manifest.type === 'vocabulary'
}

/**
 * 确定性截取：按 words.json 原顺序取前 N 条。
 * 确定性很重要 —— 同一份内容每次 build 必须产出**逐字节相同**的门禁输入，
 * 否则「还原后逐字节一致」这类自证就失去了对照意义。
 * @param {Array<object>} words 全量词条
 * @param {number} limit 上限
 * @returns {Array<object>} 至多 limit 条
 */
export function selectWords(words, limit = WORDS_PER_PAGE) {
  if (!Array.isArray(words)) return []
  return words.slice(0, Math.max(0, limit))
}

/**
 * 单个词条的 `<li>`。
 *
 * 字段策略（真实字段实测只有 4 个：word / translation / phonetic / definition）：
 *   - `word` 永远有（词条主键），作为 `<dt>`；
 *   - `translation` / `phonetic` 挂在 `<dd class="meta">`，**缺了就跳过该字段，不留空、不写占位符**
 *     （实测 ai-core / frontend / cloud-native / go-code / ts-code 只有 word+translation；
 *      ielts-*-vocab 三包没有 phonetic）。
 *   - `definition` 单独一个 `<dd>`，同样缺则不输出。
 *   - 词性信息**已内嵌在 translation 前缀**（`n. 鹰` / `a. 不适当的`）⇒ 照实展示，
 *     **不额外解析、不推断**（题面裁定；解析会引入一层没有事实依据的加工）。
 *
 * 用 `<dl>/<dt>/<dd>` 而不是 `<ul>/<li>`：词条本质是「词条 → 释义」的definition list，
 * 语义标签与内容类型一致，爬虫据此判断「这是一份词表」而非「一段导航」。
 * 每个词条用 `<div>` 包一层是 HTML5 允许的（dl 的子元素可以是 div 分组）。
 *
 * @param {{word?:string, translation?:string, phonetic?:string, definition?:string}} item
 * @returns {string} HTML 片段
 */
export function renderWordItem(item) {
  const meta = []
  if (item?.translation) meta.push(`<span class="trans">${escapeHtml(item.translation)}</span>`)
  if (item?.phonetic) meta.push(`<span class="ph">/${escapeHtml(item.phonetic)}/</span>`)
  const ddMeta = meta.length > 0 ? `<dd class="meta">${meta.join('')}</dd>` : ''
  const ddDef = item?.definition ? `<dd class="def">${escapeHtml(item.definition)}</dd>` : ''
  return `<div class="entry"><dt>${escapeHtml(item?.word)}</dt>${ddMeta}${ddDef}</div>`
}

/**
 * 从包 manifest + words 渲染整页 HTML（**全站唯一的词库页模板函数** —— 判据 10 守的就是它）。
 *
 * @param {object} input
 * @param {object} input.manifest 包 manifest（title / description / stats.items 均来自它）
 * @param {Array<object>} input.words 该包**全量**词条（截取在本函数内做，保证调用方无法漏）
 * @param {string} input.siteOrigin 站点绝对 origin（如 https://geek-typing.pages.dev）
 * @param {number} [input.wordsPerPage] 单页词条上限
 * @returns {string} 完整 HTML 文档
 */
export function renderBankPage({ manifest, words, siteOrigin, wordsPerPage = WORDS_PER_PAGE }) {
  const title = String(manifest?.title ?? '').trim()
  const description = String(manifest?.description ?? '').trim()
  const packageId = String(manifest?.packageId ?? '').trim()
  const all = Array.isArray(words) ? words : []
  const shown = selectWords(all, wordsPerPage)
  const total = all.length
  // ⭐ 规范 URL 来自唯一事实源（⛔ 不带 .html）—— 见 canonicalBankUrl 的注释。
  const url = canonicalBankUrl(siteOrigin, packageId)
  const homeUrl = APP_HOME_HREF
  const pageTitle = `${title} · ${SITE_NAME}`
  const truncated = shown.length < total

  // description 用该包 manifest 的真实 description；再补一句「展示 N / 完整 M」让每页唯一且内容相关。
  // ⛔ 不编造：只拼manifest 里真实存在的字段 + 可从 words.json 精确算出的计数。
  const metaDescription = `${description}（本页展示前 ${shown.length} 词 / 完整 ${total} 词，完整词库与应用内练习见 ${SITE_NAME}）`

  const items = shown.map(renderWordItem).join('\n')

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(pageTitle)}</title>
    <meta name="description" content="${escapeHtml(metaDescription)}" />
    <link rel="canonical" href="${escapeHtml(url)}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />
    <meta property="og:title" content="${escapeHtml(pageTitle)}" />
    <meta property="og:description" content="${escapeHtml(metaDescription)}" />
    <meta property="og:url" content="${escapeHtml(url)}" />
    <meta property="og:locale" content="zh_CN" />
    <meta name="twitter:card" content="summary" />
    <style>
      :root { color-scheme: dark; }
      body { margin: 0; padding: 2rem 1.25rem 4rem; background: #0b1120; color: #e2e8f0;
             font-family: system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
             line-height: 1.7; }
      main { max-width: 52rem; margin: 0 auto; }
      h1 { font-size: 1.75rem; margin: 0 0 .5rem; }
      h2 { font-size: 1.1rem; margin: 2rem 0 .5rem; color: #93c5fd; }
      .desc { color: #cbd5e1; }
      .count { color: #94a3b8; font-size: .9rem; }
      ul, dl { list-style: none; padding: 0; margin: 0; }
      .entry { padding: .4rem 0; border-bottom: 1px solid #1e293b; }
      dt { font-weight: 600; color: #f8fafc; }
      dd { margin: 0; }
      dd.meta { color: #cbd5e1; }
      .ph { color: #7dd3fc; margin-left: .5rem; }
      dd.def { color: #94a3b8; font-size: .9rem; }
      .cta { display: inline-block; margin-top: 1.5rem; padding: .6rem 1.1rem; border-radius: .5rem;
             background: #2563eb; color: #fff; text-decoration: none; font-weight: 600; }
      footer { margin-top: 3rem; color: #64748b; font-size: .85rem; }
    </style>
  </head>
  <body>
    <main>
      <article>
        <h1>${escapeHtml(title)}</h1>
        <p class="desc">${escapeHtml(description)}</p>

        <h2>词条计数说明</h2>
        <p class="count">本页展示前 ${shown.length} 词 / 完整 ${total} 词。${truncated
          ? '受单页体积控制，本页只渲染前 ' + shown.length + ' 条；完整词库与练习模式请进入应用。'
          : '该词库全部 ' + total + ' 条已完整列出。'}</p>

        <h2>词汇列表</h2>
        <dl>
${items}
        </dl>

        <h2>使用说明</h2>
        <p>以上词条与释义直接来自本词库的内容包（${escapeHtml(packageId)}），未做改写。
        本页是静态索引页，只列出词条与释义，不提供练习；完整词库、打字练习与复习调度请进入应用。</p>
        <a class="cta" href="${escapeHtml(homeUrl)}">进入完整词库 →</a>

        <footer>${escapeHtml(SITE_NAME)} · 词库包 ${escapeHtml(packageId)} · 本页为静态索引，完整内容承载在应用内</footer>
      </article>
    </main>
  </body>
</html>
`
}

/**
 * 生成 sitemap XML。
 * 首页 priority 1.0，词库页 0.8；changefreq 首页 weekly（沿用既有 public/sitemap.xml 的值）、
 * 词库页 monthly（内容随包版本变更，不按天变）。
 *
 * ⭐ **F2 · `<lastmod>`**：本条改动的原因是 sitemap 的 14 条 `<loc>` **全部缺 `<lastmod>`**，
 *   而 sitemap 协议里 `<lastmod>` 是搜索引擎判断「这个 URL 的内容有没有变过」的主要信号 ——
 *   缺它就等于告诉 Google「这批页面从建站至今一次都没动过」，直接削弱变更通知能力。
 *   **值取各 URL 的「内容源」文件 mtime**（见 sourceLastmod），⛔ 不写死字符串。
 *
 * ⛔⛔ **v2 修正（语义回归修复）——`<lastmod>` 必须取「内容源」，绝不能取「产物」**：
 *   v1 传的是**产物路径**（`dist/index.html`、`dist/pages/bank/<pkgId>.html`），
 *   而产物每次 build 都会被重新写盘 ⇒ `<lastmod>` 恒等于「本次构建时刻」。实测后果：
 *   只改一句无关文案触发 rebuild，14 条时间戳**整体平移**（`13:24:39 → 13:46:02`），
 *   而这期间词库内容一个字符都没变—— 等于对 Google 谎报「14 个页面此刻全部刚刚变更」。
 *   Google 官方口径是「页面**内容**最后一次修改时间」，不是「站点最后一次部署时间」；
 *   反复声称内容变更却不影响排名，会被读作低质量变更信号，反而削弱 sitemap 作用。
 *   ⇒ 现在改为：词库页取 `content/vocabulary/<pkgId>/{words,manifest}.json` 的较新者，
 *     首页取**仓库根 `index.html` 源模板**（⛔ 绝不是 `dist/index.html`，那是产物，会重现同一 bug）。
 *
 * @param {Array<{loc:string, changefreq?:string, priority?:string, lastmod?:string}>} entries
 * @returns {string} XML 文本
 */
export function buildSitemap(entries) {
  const body = entries
    .map((e) => {
      //⏎ 缺 lastmod 时不输出该标签（而不是编一个假日期）—— 与「不许编造数字」同源纪律。
      const lastmod = String(e.lastmod ?? '').trim()
      const lastmodLine = lastmod ? `\n    <lastmod>${escapeHtml(lastmod)}</lastmod>` : ''
      return `  <url>
    <loc>${escapeHtml(e.loc)}</loc>${lastmodLine}
    <changefreq>${escapeHtml(e.changefreq ?? 'monthly')}</changefreq>
    <priority>${escapeHtml(e.priority ?? '0.8')}</priority>
  </url>`
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`
}

/**
 * 站点 origin 的单一事实源：index.html 的 canonical → public/sitemap.xml 首个 loc。
 * 读不到就返回 null（由调用方报错退出，不静默兜假域名）。
 * @returns {string|null}
 */
export function readSiteOrigin() {
  const idx = join(ROOT, 'index.html')
  if (existsSync(idx)) {
    const m = readFileSync(idx, 'utf8').match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/)
    if (m) return new URL(m[1]).origin
  }
  const sm = join(ROOT, 'public', 'sitemap.xml')
  if (existsSync(sm)) {
    const m = readFileSync(sm, 'utf8').match(/<loc>([^<]*)<\/loc>/)
    if (m) return new URL(m[1]).origin
  }
  return null
}

/**
 * 单个文件的 mtime → sitemap `<lastmod>`（W3C Datetime，UTC，秒精度）。
 *
 * ⛔ **只允许传「内容源」路径，绝不允许传产物路径**。
 *   产物（`dist/**`）每次 build 都会重新写盘 ⇒ 传产物等于把「本次构建时刻」当成内容变更时刻，
 *   使 `<lastmod>` 退化成「站点最后部署时间」，与 Google 口径（页面**内容**最后修改时间）冲突。
 *   正确用法见 sourceLastmod()。
 *
 * @param {string} filePath **内容源**文件路径
 * @returns {string} 形如 2026-01-01T00:00:00+00:00；文件不存在/不可stat 返回空串（调用方据此省略该标签）
 */
export function fileLastmod(filePath) {
  try {
    if (!existsSync(filePath)) return ''
    return statSync(filePath).mtime.toISOString().replace(/\.\d{3}Z$/, '+00:00')
  } catch {
    return ''
  }
}

/**
 * 一组内容源文件 → sitemap `<lastmod>`（取**较新者**）。
 *
 * 为什么取较新者而不是某一个：某个URL 的「内容」由多个源文件共同决定
 * （词库页 = words.json + manifest.json）。只取其中一个会漏掉另一个的变更 ⇒ 又变成谎报（往少了说）。
 * 取较新者 =「这批源文件里最后一次被改动的时间」，与「该URL 内容最后一次修改时间」同义。
 *
 * ⛔ 不写死字符串 —— 写死的 `<lastmod>` 等于对 Google 撒谎「这页从某年起就没变过」。
 * ⛔ 全部源文件都拿不到 mtime 时返回空串，由 buildSitemap **省略该标签**而不是编假日期。
 *
 * @param {Array<string>} sourcePaths 该 URL 对应的**内容源**文件路径列表
 * @returns {string} W3C Datetime 字符串，或空串（无可用 mtime）
 */
export function sourceLastmod(sourcePaths) {
  let newestMs = Number.NEGATIVE_INFINITY
  for (const p of sourcePaths ?? []) {
    try {
      if (!existsSync(p)) continue
      const ms = statSync(p).mtimeMs
      if (Number.isFinite(ms) && ms > newestMs) newestMs = ms
    } catch {
      // 单个源不可stat 不影响其余源；全不可用时自然落到下面的空串分支。
    }
  }
  if (!Number.isFinite(newestMs)) return ''
  return new Date(newestMs).toISOString().replace(/\.\d{3}Z$/, '+00:00')
}

/**
 * 扫描 content/vocabulary/*，挑出所有 type==='vocabulary' 的包（读盘部分，纯函数边界清晰）。
 *
 * 每项带 `sourceFiles`（该包的内容源文件，供 `<lastmod>` 取值）—— 见sourceLastmod。
 * @returns {Array<{dirName:string, manifest:object, words:Array<object>, sourceFiles:string[]}>} 按目录名排序（确定性）
 */
export function collectBanks(vocabDir = VOCAB_DIR) {
  if (!existsSync(vocabDir)) return []
  const out = []
  for (const dirName of readdirSync(vocabDir).sort()) {
    const manifestPath = join(vocabDir, dirName, 'manifest.json')
    if (!existsSync(manifestPath)) continue
    let manifest
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    } catch {
      console.error(`[seo-pages]跳过 ${dirName}：manifest.json 解析失败`)
      continue
    }
    if (!shouldInclude(dirName, manifest)) continue
    const wordsPath = join(vocabDir, dirName, 'words.json')
    let words = []
    if (existsSync(wordsPath)) {
      try {
        words = JSON.parse(readFileSync(wordsPath, 'utf8'))
      } catch (e) {
        console.error(`[seo-pages] 跳过 ${dirName}：words.json 解析失败（${e.message}）`)
        continue
      }
    }
    // ⭐ 该包的内容源 = manifest.json + words.json（⛔ 不含任何 dist/ 产物，见 sourceLastmod 注）。
    //   words.json 可能不存在（允许空包），但仍列进去：sourceLastmod 会跳过不存在的项。
    out.push({ dirName, manifest, words, sourceFiles: [manifestPath, wordsPath] })
  }
  return out
}

/* ──────────────────────────────── CLI 段 ──────────────────────────────── */

/**
 * 写盘：生成 13 个静态页 + 重写 dist/sitemap.xml + 注入首页落地块。
 * @param {object} [opts] 注入点（falsify / 测试用；真跑全默认）
 * @returns {{pages:number, totalWords:number, sitemapUrls:number, origin:string, landing:{injected:boolean,bytes:number,bankLinks:number}}}
 */
export function main(opts = {}) {
  const dist = opts.dist ?? DIST
  const bankDir = opts.bankDir ?? join(dist, 'pages', 'bank')
  const sitemapPath = opts.sitemapPath ?? join(dist, 'sitemap.xml')
  const indexPath = opts.indexPath ?? join(dist, 'index.html')
  /**
   * 首页**内容源** =仓库根 `index.html`（Vite 读它做入口的那份**源码模板**）。
   * ⛔⛔ 不是 `indexPath`（= `dist/index.html`，**产物**）：产物每次 build 重写盘，
   *拿它的 mtime 会让首页 `<lastmod>` 恒等于「本次构建时刻」，把「内容变更信号」退化成
   * 「部署时刻信号」—— 这正是本次要修的缺陷本身。
   */
  const indexSourcePath = opts.indexSourcePath ?? join(ROOT, 'index.html')
  const origin = opts.siteOrigin ?? readSiteOrigin()
  if (!origin) {
    console.error('[seo-pages] 读不到 siteOrigin（index.html canonical 与 public/sitemap.xml 都不可解析）：拒绝生成')
    process.exit(1)
  }

  const banks = collectBanks(opts.vocabDir ?? VOCAB_DIR)
  if (banks.length === 0) {
    console.error('[seo-pages] content/vocabulary 下没有 type==="vocabulary" 的包：拒绝生成空产物')
    process.exit(1)
  }

  mkdirSync(bankDir, { recursive: true })

  let totalWords = 0
  // ⭐ F2 · v2：首页 <lastmod> 取**内容源**（仓库根 index.html）的 mtime（⛔ 不写死字符串、⛔ 不取 dist/ 产物）。
  //   注意本 entry 在落地块注入**之前**构造，而注入会在末尾覆写 index.html —— 那也是不能取产物 mtime 的另一个理由。
  const entries = [
    { loc: `${origin}/`, changefreq: 'weekly', priority: '1.0', lastmod: fileLastmod(indexSourcePath) },
  ]
  for (const bank of banks) {
    const { manifest, words } = bank
    const html = renderBankPage({ manifest, words, siteOrigin: origin, wordsPerPage: opts.wordsPerPage })
    // 页文件名 = packageId + .html。⛔ 绝不用 index.html（见头注②）。
    // ⚠️ **文件名带 .html，URL 不带** —— 文件名是 CF Pages 的部署要求，URL 是规范地址（见 canonicalBankUrl）。
    const file = join(bankDir, `${manifest.packageId}.html`)
    writeFileSync(file, html, 'utf8')
    const shown = Math.min(Array.isArray(words) ? words.length : 0, opts.wordsPerPage ?? WORDS_PER_PAGE)
    totalWords += shown
    // ⭐ 与 canonical / 门禁判据 5 同源（⛔ 不带 .html）—— 三处曾各写一遍 .html，是本次缺陷的直接成因。
    entries.push({
      loc: canonicalBankUrl(origin, manifest.packageId),
      changefreq: 'monthly',
      priority: '0.8',
      // ⭐ F2 · v2：该页**内容源**（words.json + manifest.json，取较新者）的真实 mtime。
      //   ⛔ 不再取 `file`（产物）—— 产物每次 build 重写盘，会让 14 条时间戳整体平移。
      lastmod: sourceLastmod(bank.sourceFiles),
    })
  }

  const xml = buildSitemap(entries)
  // dist/sitemap.xml 是 vite 从 public/拷来的**产物**；生成器排在 vite build 之后 ⇒ 直接重写产物。
  // 同时也写回 public/sitemap.xml 作为下次 vite build 的输入（见文件末尾「为什么两边都写」）。
  writeFileSync(sitemapPath, xml, 'utf8')
  const pubSitemap = join(ROOT, 'public', 'sitemap.xml')
  writeFileSync(pubSitemap, xml, 'utf8')

  /*
   * ── 首页落地块注入（本轮 P0：让13 个孤岛词库页第一次有入站链接）────────
   *
   * 实测前提（不要再重测）：13 个 bank 页是**彻底的孤岛页 —— 全站零入站链接**，
   *   Google 因此从未抓取过它们：
   *     · dist/index.html含 `pages/bank` 0 次、含 `<a href` 0 个
   *     · dist/assets/index-*.js 含 `pages/bank` 0 次
   *     · 13 个 bank 页各自的出链各 1 条，**只有 href="/"**（链回首页）
   *   GSC 印证：首页已收录；三个 bank 页全部「尚未收录 · Google 无法识别此网址」。
   *
   * 两条不可让步的性质：
   *   ① 词库卡片必须是**真 `<a href>`**（不是纯文字展示）—— 纯文字对本问题零收益；
   *   ② 块必须落在 `#root` **之外** —— React 19 createRoot 会清空 #root 内子节点（真机实测）。
   *
   * 排在 sitemap 之后：注入会覆写 dist/index.html，而 entries 里首页的 lastmod 已取过。
   */
  let landing = { injected: false, bytes: 0, bankLinks: 0 }
  if (opts.injectLanding !== false && existsSync(indexPath)) {
    // 词数一律**现算**（⛔ 不写死 —— 项目历史上写死的两处已腐坏成 18/9388）
    const bankRows = banks.map((b) => ({
      packageId: String(b.manifest?.packageId ?? '').trim(),
      title: String(b.manifest?.title ?? '').trim(),
      wordCount: Array.isArray(b.words) ? b.words.length : 0,
    }))
    const allWords = banks.reduce((sum, b) => sum + (Array.isArray(b.words) ? b.words.length : 0), 0)
    const block = renderHomeLandingBlock({ bankRows, origin, totalWords: allWords })
    writeFileSync(indexPath, injectIntoIndexHtml(readFileSync(indexPath, 'utf8'), block), 'utf8')
    landing = {
      injected: true,
      bytes: Buffer.byteLength(block, 'utf8'),
      bankLinks: (block.match(/class="gh-card" href="/g) || []).length,
    }
  }

  const stats = { pages: banks.length, totalWords, sitemapUrls: entries.length, origin, landing }
  console.log(`[seo-pages] 已生成 ${stats.pages} 个静态页→ ${bankDir.replace(ROOT, '.')}`)
  console.log(`[seo-pages]   词条渲染合计 ${stats.totalWords} 条（单页上限 ${opts.wordsPerPage ?? WORDS_PER_PAGE}）`)
  console.log(`[seo-pages]   sitemap ${stats.sitemapUrls} 条 → ${sitemapPath.replace(ROOT, '.')} + public/sitemap.xml（同步，含 <lastmod>）`)
  if (landing.injected) {
    console.log(
      `[seo-pages]   首页落地块已注入 → ${indexPath.replace(ROOT, '.')}（${landing.bytes} B，${landing.bankLinks} 个词库真链接）`,
    )
  }
  return stats
}

/*
 * 为什么 sitemap 两边都写（public/ 与 dist/）—— 这是本脚本最需要解释的一处设计：
 *   `public/sitemap.xml` 是 vite的**输入**，`dist/sitemap.xml` 是它的**产物**。
 *   本生成器按硬约束① 排在 `vite build` **之后**，所以：
 *     - 只写 dist/  ⇒ 本次 build 的 dist/sitemap.xml 正确，但下次任何人单独跑 `vite build`
 *                    （不跑本脚本）就会用旧的 1 条 public/sitemap.xml 覆盖回去 ⇒ 静默回退到 1 条。
 *     - 只写 public/ ⇒ 本次 dist/sitemap.xml 仍是旧拷贝 ⇒ **判据 1 在本次 build 后立刻判红**。
 *   两个都写，两个问题一起消失：dist 立刻正确（判据 1 绿），且下次 vite build 会把
 *   14 条版本原样拷进 dist（不会回退）。public/ 那份是 git 跟踪的源，团队改域名时改它即可。
 *   ⚠️ public/sitemap.xml 因此从「手工维护」变成「生成产物 + 可手改源」——
 *      改完跑一次 `npm run build:seo-pages` 即可对齐，门禁判据 1 会守住它不被改漏。
 */
const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invoked) main()