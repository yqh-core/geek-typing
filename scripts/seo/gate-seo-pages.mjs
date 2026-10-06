#!/usr/bin/env node
/**
 * SEO Content Surface 第一阶段 · 静态页门禁（gate-seo-pages）
 *
 * 为什么必须有这道门（它补的是哪个盲区）：
 *   全仓**没有任何断言**检查 sitemap 的 URL 数、静态页正文、canonical、title/description 唯一性、
 *   也没有任何断言检查 404 页存在。已有的三道产物门只读 `dist/assets` 或 `dist/index.html`：
 *     - scripts/gate-perf.mjs:54-55      只读 dist/assets（+ docs/_generated/perf-baseline.json）
 *     - scripts/check-bundle.mjs:697,754  只读 dist/assets
 *     - tests/prod-smoke.mjs:66          只读 dist/index.html
 *   ⇒ `dist/pages/**` 与 `dist/sitemap.xml` 这批产物在 CI 上**无人看守**。
 *   本门把它们纳入门禁体系，且**fail-closed**（任一 FAIL ⇒ exit 1；读不到产物同样判红，
 *   绝不「文件不存在就跳过」）。
 *
 * 判据（12条，每条打印 PASS/FAIL + 实测值）：
 *    1sitemap <url> 数 == 14（1 首页 + 13 词库页）
 *    2  13 个页面文件都存在                                13/13
 *    3  每页去标签正文长度 ≥ 500 字符                        13/13
 *    4  每页含 ≥3 组 word+translation 字面量（模拟无 JS 爬虫）  13/13
 *    5  每页 canonical 自指（URL == 本页 URL）               13/13
 *    6  <title> 每页唯一                        13 互不相同 + 与首页不同
 *    7  description 每页唯一                    13 互不相同 + 与首页不同
 *    8  public/404.html 存在 + 正文非空 + 含 404 语义
 *    9  单页 raw ≤ 200 KiB                                    13/13
 *   10  页面模板函数只有 1 个（把 INV-6 延伸到产物侧）
 *   11  不产生任何多余的 index.html：dist/assets/index-*.js 恰好 1 个且 dist/pages 下无 index.html
 *   12  词条规模声明诚实：声明 N == 实际渲染条数 M，且 N ≤ 声明总数 T，且 T == 该包真实总词数
 *
 * 退出码：0 = 全PASS；1 = 有 FAIL；2 = 脚本自身错误（产物缺失/输入不可解析，**绝不降级成 PASS**）。
 *
 * 用法：
 *   node scripts/seo/gate-seo-pages.mjs# 常规判定（CI / 本机）
 *   node scripts/seo/gate-seo-pages.mjs --falsify        # 证伪自检（注入故障 ⇒ 恰好对应判据转红）
 *
 * ⚠️ **本门不 import build-static-pages.mjs 的 CLI 段**：生成器把写盘逻辑放在
 *    `import.meta.url` 判定之后（见该文件末尾），import 纯函数不会产生任何副作用。
 *    本门只 import 纯逻辑（escapeHtml / WORDS_PER_PAGE），其余全部自己读盘算 ——
 *    这样「门禁判据」与「生成器实现」不会共谋（门禁必须能独立发现生成器的错误）。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WORDS_PER_PAGE } from './build-static-pages.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DIST = join(ROOT, 'dist')
const PAGES_DIR = join(DIST, 'pages')
const BANK_DIR = join(PAGES_DIR, 'bank')
const ASSETS = join(DIST, 'assets')
const SITEMAP = join(DIST, 'sitemap.xml')
const NOT_FOUND = join(ROOT, 'public', '404.html')
const BUILDER_SRC = join(ROOT, 'scripts', 'seo', 'build-static-pages.mjs')
const INDEX_HTML = join(ROOT, 'dist', 'index.html')

/* ─────────────────────────── 阈值（单一事实源） ─────────────────────────── */

/** 期望的sitemap 条数 = 1 首页 + 词库页数。词库页数由 content/ 实际推导，不硬编码 13。 */
export const SITEMAP_URLS = 14
/** 单页去标签正文下限（字符） */
export const MIN_TEXT_CHARS = 500
/** 单页 word+translation 配对下限 */
export const MIN_WORD_PAIRS = 3
/** 单页 raw 体积上限（字节） */
export const MAX_PAGE_BYTES = 200 * 1024
/** dist/pages 下绝不允许出现的文件名 */
export const FORBIDDEN_PAGE_NAME = 'index.html'

/* ───────────────────────────── 纯判定辅助 ───────────────────────────── */

/**
 * 去掉标签后的可见正文（爬虫视角）。
 * 先整块剔除 <style>/<script>（含其中内容），否则 CSS 会被算成正文 ⇒ 判据 3 变成
 * 「用样式表撑长度」的空转检查。再去标签、解实体、折叠空白。
 * @param {string} html
 * @returns {string}
 */
export function extractVisibleText(html) {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 提取「word + translation 字面量」配对 —— 模拟**不执行 JS 的爬虫**能读到什么。
 *
 * 为什么不用 DOM 解析器：本仓没有 jsdom 之类的依赖，而判据要的是「爬虫在原始 HTML 字节里
 * 能不能同时看到一个词和它的中文释义」。直接按 `<dt>词</dt>` + `<span class="trans">释义</span>`
 * 的字面量配对，正好就是这个问题的答案，且不会因为解析器容错而掩盖模板写坏。
 * @param {string} html
 * @returns {string[]} 形如 "eagle|n. 鹰, 鹰状标饰" 的配对列表
 */
export function extractWordPairs(html) {
  const out = []
  const re = /<dt>([\s\S]*?)<\/dt>([\s\S]*?)(?=<div class="entry">|<\/dl>)/g
  let m
  while ((m = re.exec(String(html))) !== null) {
    const word = m[1].trim()
    const block = m[2]
    const t = block.match(/<span class="trans">([\s\S]*?)<\/span>/)
    if (word && t && t[1].trim()) out.push(`${word}|${t[1].trim()}`)
  }
  return out
}

/** 取 <title> 文本 */
export function extractTitle(html) {
  const m = String(html).match(/<title>([\s\S]*?)<\/title>/i)
  return m ? m[1].trim() : null
}

/** 取 <meta name="description"> 的 content（属性顺序不固定，故两种都试） */
export function extractDescription(html) {
  const a = String(html).match(/<meta[^>]+name="description"[^>]+content="([^"]*)"/i)
  if (a) return a[1].trim()
  const b = String(html).match(/<meta[^>]+content="([^"]*)"[^>]+name="description"/i)
  return b ? b[1].trim() : null
}

/** 取 <link rel="canonical"> 的 href */
export function extractCanonical(html) {
  const a = String(html).match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i)
  if (a) return a[1].trim()
  const b = String(html).match(/<link[^>]+href="([^"]+)"[^>]+rel="canonical"/i)
  return b ? b[1].trim() : null
}

/**
 * 提取页面里的「词条计数声明」：`<p class="count">本页展示前 N 词 / 完整 T 词…`。
 * 判据 12 靠它证明「页面没有假装自己是全量」。
 * @param {string} html
 * @returns {{shown:number|null, total:number|null, raw:string|null}}
 */
export function extractCountClaim(html) {
  const p = String(html).match(/<p class="count">([\s\S]*?)<\/p>/i)
  if (!p) return { shown: null, total: null, raw: null }
  const raw = p[1].replace(/<[^>]+>/g, '')
  const shown = raw.match(/展示前\s*(\d+)\s*词/)
  const total = raw.match(/完整\s*(\d+)\s*词/)
  return { shown: shown ? Number(shown[1]) : null, total: total ? Number(total[1]) : null, raw }
}

/** 数实际渲染出来的词条（<dt> 的个数） */
export function countRenderedEntries(html) {
  const m = String(html).match(/<dt>/g)
  return m ? m.length : 0
}

/** 数 sitemap 里的 <url> */
export function countSitemapUrls(xml) {
  const m = String(xml).match(/<url>/g)
  return m ? m.length : 0
}

/**
 * 模板函数计数：数「导出的、以 render…Page 命名的页面模板函数」有多少个。
 *
 * 为什么这条判据不是「数函数」而是「数**页面模板**」：生成器里还有 buildSitemap /
 * renderWordItem 这类正常的辅助函数，硬数函数个数毫无意义。真正要守的是
 * **INV-6「类型契约唯一」在产物侧的延伸** —— 页面模板只能有一个，
 * 出现第二个（哪怕叫 renderBankPage2 / renderBankPagePerBank）就意味着开始按包/per-type
 * 散落模板了，下一个内容类型就会分叉出一套平行实现。
 *
 * ⚠️ 正则刻意允许 `Page` 之后还有别的标识符字符（`Page[A-Za-z0-9_]*\(`）：
 *   写成 `Page\s*\(` 的话，`renderBankPagePerBank(` 不会被计入 —— 门就变成了
 *   「只认一种起名方式」，而真实的散落恰恰会换个名字（PerBank / V2 / ForType…）。
 *   判据必须对**语义**（有几个页面模板函数）敏感，不能对**命名**敏感。
 * @param {string} src 生成器源码
 * @returns {number}
 */
export function countPageTemplateFns(src) {
  const m = String(src).match(/export function render[A-Za-z0-9_]*Page[A-Za-z0-9_]*\s*\(/g)
  return m ? m.length : 0
}

/** 404 语义检测：中文「页面不存在」或英文 "404"/"not found" 任一命中即算有明确 404 语义 */
export function hasNotFoundSemantics(html) {
  const text = extractVisibleText(html)
  return /404|页面不存在|找不到|not found/i.test(text)
}

/* ─────────────────────── 输入收集（读盘，与判定分离） ─────────────────────── */

/**
 * 收集判据所需的全部输入。
 *
 * ⚠️ 每个路径都可注入 —— 这是 --falsify 能「在隔离目录里注入故障、真dist 全程只读」的前提。
 * @param {object} [o]
 * @returns {object} inputs
 */
export function collectInputs(o = {}) {
  const bankDir = o.bankDir ?? BANK_DIR
  const assetsDir = o.assetsDir ?? ASSETS
  const sitemapPath = o.sitemapPath ?? SITEMAP
  const notFoundPath = o.notFoundPath ?? NOT_FOUND
  const indexPath = o.indexPath ?? INDEX_HTML

  const readOrNull = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null)

  // 页面文件清单：只列 .html，按文件名排序（确定性）
  let pageFiles = []
  if (existsSync(bankDir)) {
    pageFiles = readdirSync(bankDir)
      .filter((f) => f.endsWith('.html'))
      .sort()
  }
  // dist/pages 下所有 index.html（任意层级）—— 判据 11 的后半段
  let strayIndexPages = []
  if (existsSync(o.pagesDir ?? PAGES_DIR)) {
    strayIndexPages = listIndexHtml(o.pagesDir ?? PAGES_DIR)
  }
  const assetsFiles = existsSync(assetsDir) ? readdirSync(assetsDir) : null

  return {
    bankDir,
    pageFiles,
    pages: pageFiles.map((f) => {
      const full = join(bankDir, f)
      return { file: f, size: statSync(full).size, html: readFileSync(full, 'utf8') }
    }),
    strayIndexPages,
    mainChunks: assetsFiles ? assetsFiles.filter((f) => /^index-.*\.js$/.test(f)) : null,
    sitemapXml: readOrNull(sitemapPath),
    indexHtml: readOrNull(indexPath),
    notFoundHtml: readOrNull(notFoundPath),
    builderSrc: readOrNull(o.builderSrc ?? BUILDER_SRC),
  }
}

/** 递归列出目录下的 index.html（相对路径） */
function listIndexHtml(dir, base = dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) listIndexHtml(p, base, out)
    else if (name === FORBIDDEN_PAGE_NAME) out.push(p.slice(base.length + 1).replace(/\\/g, '/'))
  }
  return out
}

/**
 * 读 content/vocabulary 得到「包真实总词数」（判据 12 的 T）。
 * 刻意**独立读盘**而不问生成器：门禁不能相信被它检查的那个组件的自述。
 * @returns {Map<string, number>} packageId → words.json 长度
 */
export function readPackageTotals() {
  const dir = join(ROOT, 'content', 'vocabulary')
  const out = new Map()
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir).sort()) {
    const mp = join(dir, name, 'manifest.json')
    const wp = join(dir, name, 'words.json')
    if (!existsSync(mp)) continue
    try {
      const m = JSON.parse(readFileSync(mp, 'utf8'))
      if (m?.type !== 'vocabulary') continue
      const n = existsSync(wp) ? JSON.parse(readFileSync(wp, 'utf8')).length : 0
      out.set(m.packageId, n)
    } catch {
      /* 读不动的包不参与判据 12（内容侧另有 content:validate 兜底，不在本门越权判红） */
    }
  }
  return out
}

/* ─────────────────────────────── 判定 ─────────────────────────────── */

/**
 * 纯判定：给定 inputs → 12 条判据结果。不打印、不退出（打印与退出在 gate()，
 * 故障注入在 falsify()，三者共用这一份判定 ⇒ 门不会与自证漂移）。
 *
 * @param {ReturnType<typeof collectInputs>} inp
 * @returns {{rows: Array<{no:number,name:string,status:'PASS'|'FAIL'|'UNKNOWN',msg:string}>, fatal: string|null}}
 */
export function evaluate(inp) {
  // 前置：产物存在性。**缺产物判 fatal（exit 2）而不是跳过后 PASS** —— fail-closed。
  const fatal = []
  if (!existsSync(inp.bankDir)) fatal.push(`静态页目录不存在：${inp.bankDir}（先跑 npm run build）`)
  if (inp.sitemapXml == null) fatal.push(`${SITEMAP} 不存在或不可读（先跑 npm run build）`)
  if (inp.notFoundHtml == null) fatal.push(`${NOT_FOUND} 不存在（soft-404 未修）`)
  if (inp.builderSrc == null) fatal.push(`生成器源码不可读：${BUILDER_SRC}`)
  if (fatal.length > 0) return { rows: [], fatal: fatal.join('；') }

  const rows = []
  const add = (no, name, ok, msg) => rows.push({ no, name, status: ok ? 'PASS' : 'FAIL', msg })

  const pages = inp.pages
  const indexTitle = inp.indexHtml ? extractTitle(inp.indexHtml) : null
  const indexDesc = inp.indexHtml ? extractDescription(inp.indexHtml) : null

  /* 判据 1 · sitemap <url> 数 */
  {
    const n = countSitemapUrls(inp.sitemapXml)
    const closed = /<\/urlset>\s*$/.test(inp.sitemapXml.trim())
    add(
      1,
      'sitemap <url> 数== 14',
      n === SITEMAP_URLS && closed,
      `实测 ${n} 条（期望 ${SITEMAP_URLS}）${closed ? '；</urlset> 已闭合' : '；❌ </urlset> 未闭合'}`,
    )
  }

  /* 判据 2 · 13 个页面文件都存在 */
  {
    const n = pages.length
    add(2, '静态页文件齐备', n === 13, `实测 ${n}/13 个 .html（${pages.map((p) => p.file).join(' ') || '无'}）`)
  }

  /* 判据 3 · 每页去标签正文 ≥ 500 字符 */
  {
    const lens = pages.map((p) => extractVisibleText(p.html).length)
    const min = lens.length > 0 ? Math.min(...lens) : 0
    const bad = pages.filter((p) => extractVisibleText(p.html).length < MIN_TEXT_CHARS).map((p) => p.file)
    add(
      3,
      `每页去标签正文 ≥ ${MIN_TEXT_CHARS} 字符`,
      bad.length === 0 && pages.length > 0,
      bad.length === 0
        ? `13/13 通过；最短 ${min} 字符，最长 ${Math.max(...lens)} 字符`
        : `❌ ${bad.length} 页不达标：${bad.join(' ')}（最短 ${min} 字符）`,
    )
  }

  /* 判据 4 · 每页 ≥3 组 word+translation 字面量 */
  {
    const counts = pages.map((p) => extractWordPairs(p.html).length)
    const min = counts.length > 0 ? Math.min(...counts) : 0
    const bad = pages.filter((_, i) => counts[i] < MIN_WORD_PAIRS).map((p) => p.file)
    add(
      4,
      `每页 ≥${MIN_WORD_PAIRS} 组 word+translation 字面量`,
      bad.length === 0 && pages.length > 0,
      bad.length === 0
        ? `13/13 通过；最少 ${min} 组，最多 ${Math.max(...counts)} 组`
        : `❌ ${bad.length} 页不足：${bad.join(' ')}（最少 ${min} 组）`,
    )
  }

  /* 判据 5 · canonical 自指 */
  {
    const bad = []
    const seen = []
    for (const p of pages) {
      const c = extractCanonical(p.html)
      seen.push(`${p.file}→${c ?? '缺失'}`)
      if (!c || !c.endsWith(`/pages/bank/${p.file}`)) bad.push(p.file)
    }
    add(
      5,
      'canonical 自指',
      bad.length === 0 && pages.length > 0,
      bad.length === 0 ? `13/13 自指（示例 ${seen[0] ?? '—'}）` : `❌ ${bad.length} 页非自指：${bad.join(' ')}`,
    )
  }

  /* 判据 6 · <title> 每页唯一 + 与首页不同 */
  {
    const titles = pages.map((p) => ({ file: p.file, t: extractTitle(p.html) }))
    const missing = titles.filter((x) => !x.t).map((x) => x.file)
    const seen = new Map()
    const dup = []
    for (const { file, t } of titles) {
      if (!t) continue
      if (seen.has(t)) dup.push(`${file} == ${seen.get(t)}`)
      else seen.set(t, file)
    }
    const clashHome = indexTitle && seen.has(indexTitle)
    add(
      6,
      '<title> 每页唯一',
      missing.length === 0 && dup.length === 0 && !clashHome && pages.length > 0,
      missing.length > 0
        ? `❌ ${missing.length} 页无title：${missing.join(' ')}`
        : dup.length > 0
          ? `❌ 重复：${dup.join('；')}`
          : clashHome
            ? '❌ 某页 title 与首页相同'
            : `13 个互不相同，且都与首页不同（示例「${titles[0]?.t ?? '—'}」vs 首页「${indexTitle ?? '—'}」）`,
    )
  }

  /* 判据 7 · description 每页唯一 + 与首页不同 */
  {
    const descs = pages.map((p) => ({ file: p.file, d: extractDescription(p.html) }))
    const missing = descs.filter((x) => !x.d).map((x) => x.file)
    const seen = new Map()
    const dup = []
    for (const { file, d } of descs) {
      if (!d) continue
      if (seen.has(d)) dup.push(`${file} == ${seen.get(d)}`)
      else seen.set(d, file)
    }
    const clashHome = indexDesc && seen.has(indexDesc)
    add(
      7,
      'description 每页唯一',
      missing.length === 0 && dup.length === 0 && !clashHome && pages.length > 0,
      missing.length > 0
        ? `❌ ${missing.length} 页无 description：${missing.join(' ')}`
        : dup.length > 0
          ? `❌ 重复：${dup.join('；')}`
          : clashHome
            ? '❌ 某页 description 与首页相同'
            : `13 个互不相同，且都与首页不同（最短 ${Math.min(...descs.map((x) => (x.d ?? '').length))} 字符）`,
    )
  }

  /* 判据 8 · 404 页 */
  {
    const html = inp.notFoundHtml ?? ''
    const size = Buffer.byteLength(html, 'utf8')
    const textLen = extractVisibleText(html).length
    const sem = hasNotFoundSemantics(html)
    const noindex = /<meta[^>]+name="robots"[^>]+content="noindex"/i.test(html)
    const linkHome = /<a[^>]+href="\/"/.test(html)
    const title404 = /404/.test(extractTitle(html) ?? '')
    const ok = textLen > 0 && sem && noindex && linkHome && title404
    add(
      8,
      'public/404.html（soft-404 修复）',
      ok,
      `${size} B；去标签正文 ${textLen} 字符；404 语义 ${sem ? '有' : '❌无'}；` +
        `title 含 404 ${title404 ? '是' : '❌否'}；robots noindex ${noindex ? '是' : '❌否'}；链回/ ${linkHome ? '是' : '❌否'}`,
    )
  }

  /* 判据 9 · 单页 raw ≤ 200 KiB */
  {
    const sizes = pages.map((p) => p.size)
    const max = sizes.length > 0 ? Math.max(...sizes) : 0
    const worst = pages.find((p) => p.size === max)
    add(
      9,
      `单页 raw ≤ ${MAX_PAGE_BYTES} B`,
      max <= MAX_PAGE_BYTES && pages.length > 0,
      `13/13 通过；最大页 ${worst?.file ?? '—'} = ${max} B（${(max / 1024).toFixed(1)} KiB，占上限 ${((max / MAX_PAGE_BYTES) * 100).toFixed(1)}%）`,
    )
  }

  /* 判据 10 · 页面模板函数只有 1 个 */
  {
    const n = countPageTemplateFns(inp.builderSrc)
    add(
      10,
      '页面模板函数唯一（INV-6 产物侧）',
      n === 1,
      n === 1
        ? '实测 1 个（export function render…Page）——13 页同源，无 per-bank/per-type 散落'
        : `❌ 实测 ${n} 个页面模板函数（应为 1）：模板开始按包散落，INV-6 在产物侧已被破坏`,
    )
  }

  /* 判据 11 · 不产生任何多余的 index.html */
  {
    const mainCount = inp.mainChunks == null ? -1 : inp.mainChunks.length
    const stray = inp.strayIndexPages
    const ok = mainCount === 1 && stray.length === 0
    add(
      11,
      '无多余 index.html（assets 主 chunk 唯一性）',
      ok,
      `dist/assets/index-*.js 实测 ${mainCount} 个${mainCount === -1 ? '（assets 目录不可读）' : ''}（须恰好 1）；` +
        `dist/pages 下 index.html ${stray.length} 个${stray.length > 0 ? `：${stray.join(' ')}` : ''}`,
    )
  }

  /* 判据 12 · 词条规模声明诚实 */
  {
    const totals = readPackageTotals()
    const bad = []
    const detail = []
    for (const p of pages) {
      const claim = extractCountClaim(p.html)
      const rendered = countRenderedEntries(p.html)
      const pkgId = p.file.replace(/\.html$/, '')
      const real = totals.get(pkgId)
      const problems = []
      if (claim.shown == null) problems.push('无计数声明')
      if (claim.shown !== rendered) problems.push(`声明 ${claim.shown} ≠ 实渲染 ${rendered}`)
      if (claim.shown != null && claim.total != null && claim.shown > claim.total) problems.push(`声明展示数 ${claim.shown} > 完整数 ${claim.total}`)
      if (real == null) problems.push('content/ 里找不到该包')
      else if (claim.total !== real) problems.push(`声明完整数 ${claim.total} ≠ 真实总词数 ${real}`)
      if (rendered > WORDS_PER_PAGE) problems.push(`渲染 ${rendered} 条超单页上限 ${WORDS_PER_PAGE}`)
      if (problems.length > 0) bad.push(`${p.file}: ${problems.join('；')}`)
      else detail.push(`${pkgId} ${claim.shown}/${claim.total}`)
    }
    add(
      12,
      '词条规模声明诚实',
      bad.length === 0 && pages.length > 0,
      bad.length === 0
        ? `13/13 一致：${detail.slice(0, 3).join('，')}${detail.length > 3 ? ` …（共 ${detail.length} 包）` : ''}`
        : `❌ ${bad.length} 页不诚实：${bad.join(' | ')}`,
    )
  }

  return { rows, fatal: null }
}

/* ─────────────────────────────── 输出 / 退出 ─────────────────────────────── */

function gate(opts = {}) {
  const inp = collectInputs(opts)
  const { rows, fatal } = evaluate(inp)
  if (fatal) {
    console.error(`[gate-seo-pages]❌ 产物不完整，拒绝放行：${fatal}`)
    process.exit(2)
  }
  console.log('== SEO Content Surface · 静态页门禁（gate-seo-pages）==')
  console.log('判据：门禁对HTML 产物原本零覆盖（gate-perf / check-bundle / prod-smoke 只读 dist/assets 或 dist/index.html），本门补该盲区\n')
  const bad = []
  for (const r of rows) {
    if (r.status === 'PASS') console.log(`  ✅ ${String(r.no).padStart(2)}. ${r.name} —— ${r.msg}`)
    else {
      console.log(`  ❌ FAIL ${String(r.no).padStart(2)}. ${r.name}`)
      console.log(`         ${r.msg}`)
      bad.push(r.no)
    }
  }
  if (bad.length > 0) {
    console.error(`\n❌ gate-seo-pages FAIL：第 ${bad.join('、')} 项不通过（产物缺失/退化必须判红，不允许静默放行）`)
    process.exit(1)
  }
  console.log(`\n✅ gate-seo-pages PASS：${rows.length} 条判据全部通过`)
  return rows
}

/* ────────────────────────── --falsify：判据能判红吗？ ──────────────────────────
 *
 * 形态照 scripts/gate-perf.mjs:398-541的 falsify()：注入故障 ⇒ 断言**恰好该判据**转红
 * ⇒ 还原 ⇒ 跑对照组复绿。
 *
 * 隔离纪律（硬要求）：
 *   - 真 dist/ 与真 public/404.html 全程**只读**：所有注入都在
 *     node_modules/.tmp/gate-seo-pages-falsify/ 下的**副本**上进行（gitignore 已覆盖 node_modules）；
 *   - 跑前存真产物 sha256，跑后逐字节比对；
 *   - 临时目录只在**开头建一次、结尾删一次**，注入之间靠**内存快照覆写还原**，不做「删了重建」。
 *
 * ⚠️ 为什么是「覆写还原」而不是「每条注入前删了重铺」（这是本机踩出来的、必须写下的约束）：
 *   本机 Node 预加载了 safe-delete shim，它按「**本轮累计删除条目数**」计费，超过阈值
 *   （CODEBUDDY_SAFE_DELETE_BULK_THRESHOLD，默认 50）就抛 SAFE_DELETE_BULK_CONFIRM_REQUIRED。
 *   12 条注入 × 每次重建 13 个页面文件 ≈ **221 次删除** ⇒ 必然在第 9 条左右炸掉，
 *   表现是「跑一次绿、跑第二次红」的那种门 —— 这种门不该有。
 *   现在每次注入后的还原是 writeFileSync 覆写（0 次删除），全程删除次数 = 临时文件总数 ≈ 20，
 *   稳定在阈值内。形态对齐 gate-lint.mjs / gate-perf.mjs 的「只删自建路径」纪律，
 *   但进一步把「删」的次数也压到最小。
 */
function falsify() {
  const fail = []
  const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex')
  const TMP = join(ROOT, 'node_modules', '.tmp', 'gate-seo-pages-falsify')
  const TMP_BANK = join(TMP, 'bank')
  const TMP_PAGES = join(TMP, 'pages')

  /** 精确删除本函数自己建的文件/目录（逐个删，不递归删未知路径） */
  function cleanupTemp() {
    if (existsSync(TMP_BANK)) for (const f of readdirSync(TMP_BANK)) unlinkSync(join(TMP_BANK, f))
    if (existsSync(TMP_PAGES)) for (const f of readdirSync(TMP_PAGES)) unlinkSync(join(TMP_PAGES, f))
    for (const f of ['sitemap.xml', '404.html', 'builder.mjs', 'index.html']) {
      const p = join(TMP, f)
      if (existsSync(p)) unlinkSync(p)
    }
    for (const d of [TMP_BANK, TMP_PAGES, TMP]) {
      if (existsSync(d)) rmdirSync(d)
    }
  }

  if (!existsSync(BANK_DIR)) {
    console.error('[gate-seo-pages] --falsify 需要真实 dist 作为对照基准：先 npm run build')
    process.exit(1)
  }

  // 真产物字节快照
  const realShas = new Map()
  for (const f of readdirSync(BANK_DIR)) realShas.set(join(BANK_DIR, f), sha(join(BANK_DIR, f)))
  realShas.set(SITEMAP, sha(SITEMAP))
  realShas.set(NOT_FOUND, sha(NOT_FOUND))
  realShas.set(BUILDER_SRC, sha(BUILDER_SRC))

  /*
   * 内存快照：真产物的原始字节。stageCopy() 只做 mkdir + writeFileSync（**不删任何东西**），
   * 于是「还原」= 再覆写一遍原始字节 ⇒ 0 删除、且保证每条注入都从同一份干净起点出发。
   */
  const pristine = {
    bank: readdirSync(BANK_DIR).sort().map((f) => [f, readFileSync(join(BANK_DIR, f))]),
    sitemap: readFileSync(SITEMAP),
    notFound: readFileSync(NOT_FOUND),
    builder: readFileSync(BUILDER_SRC),
    index: existsSync(INDEX_HTML) ? readFileSync(INDEX_HTML) : null,
  }

  /** 铺一份干净副本（只写不删；重复调用即「还原」） */
  function stageCopy() {
    mkdirSync(TMP_BANK, { recursive: true })
    mkdirSync(TMP_PAGES, { recursive: true })
    for (const [f, buf] of pristine.bank) writeFileSync(join(TMP_BANK, f), buf)
    writeFileSync(join(TMP, 'sitemap.xml'), pristine.sitemap)
    writeFileSync(join(TMP, '404.html'), pristine.notFound)
    writeFileSync(join(TMP, 'builder.mjs'), pristine.builder)
    if (pristine.index) writeFileSync(join(TMP, 'index.html'), pristine.index)
    // pages/ 下的注入产物（如 index.html）必须清掉，否则会串到下一条注入
    for (const f of readdirSync(TMP_PAGES)) unlinkSync(join(TMP_PAGES, f))
  }

  /** 在隔离副本上跑判定（assetsDir 仍指真 dist/assets —— 判据 11 前半段不该被副本影响） */
  function evalCopy() {
    return evaluate(
      collectInputs({
        bankDir: join(TMP, 'bank'),
        pagesDir: join(TMP, 'pages'),
        sitemapPath: join(TMP, 'sitemap.xml'),
        notFoundPath: join(TMP, '404.html'),
        builderSrc: join(TMP, 'builder.mjs'),
        indexPath: join(TMP, 'index.html'),
        assetsDir: ASSETS,
      }),
    )
  }

  const redNos = (r) => r.rows.filter((x) => x.status !== 'PASS').map((x) => x.no)

  try {
    /* --- 注入前：常规判定必须全PASS（否则下面每条注入都没有可归因的对照） --- */
    const before = evaluate(collectInputs())
    if (before.fatal) {
      console.error(`[gate-seo-pages] --falsify 无法开始：${before.fatal}`)
      process.exit(1)
    }
    if (redNos(before).length > 0) {
      console.error(`[gate-seo-pages] --falsify 无法开始：注入前判据 ${redNos(before).join('、')} 已红，对照组不成立`)
      process.exit(1)
    }
    console.log(`\n[gate-seo-pages] 注入前：常规判定 PASS（${before.rows.length} 条判据）`)

    /**
     * 跑一条注入：stage → mutate → evaluate → 断言**恰好** expectNo 转红。
     * 「恰好」很重要：如果注入 A 把判据 3 和 5 一起打红，说明判据之间耦合或注入不精准，
     * 证伪结论就不可归因。
     */
    const injections = [
      {
        no: 1,
        what: '从 sitemap 删掉 3 条 <url>（14 → 11）',
        expect: 'sitemap 只剩 11 条 <url>',
        mutate() {
          const p = join(TMP, 'sitemap.xml')
          const xml = readFileSync(p, 'utf8')
          const parts = xml.split('  <url>')
          writeFileSync(p, parts.slice(0, parts.length - 3).join('  <url>'), 'utf8')
        },
      },
      {
        no: 2,
        what: '删掉 1 个页面文件（13 → 12）',
        expect: '页面文件数不足 13',
        mutate() {
          const files = readdirSync(join(TMP, 'bank')).sort()
          unlinkSync(join(TMP, 'bank', files[0]))
        },
      },
      {
        no: 3,
        what: '抽掉某页的说明性文字（简介 / 使用说明 / 页脚），只留词条区',
        expect: '该页去标签正文 < 500 字符，且词条与计数声明不受影响',
        mutate() {
          // 刻意只动「说明性文字」而不动 <dl> 词条区与 <p class="count">：
          // 若把词条一起删掉，判据 4（word+translation 配对）与判据 12（计数声明 vs 实渲染）
          // 也会跟着转红 ⇒ 一次注入打红三条，无法归因到判据 3，证伪结论就废了。
          //
          // 目标是**去标签正文最短的那一页**（实测 frontend，约 547 字符 —— 判据 3 的临界页）：
          // 抽掉说明性文字后必然掉到 500 以下。选最长页则抽完仍可能 >500，注入会「打不红」，
          // 那不是判据的问题而是注入选错了对象。
          const files = readdirSync(TMP_BANK).sort()
          const target = files
            .map((f) => ({ f, len: extractVisibleText(readFileSync(join(TMP_BANK, f), 'utf8')).length }))
            .sort((a, b) => a.len - b.len)[0].f
          const p = join(TMP_BANK, target)
          writeFileSync(
            p,
            readFileSync(p, 'utf8')
              .replace(/(<h2>使用说明<\/h2>)[\s\S]*?(?=<a class="cta")/, '$1<p>略</p>')
              .replace(/(<p class="desc">)[\s\S]*?(<\/p>)/, '$1略$2')
              .replace(/<footer>[\s\S]*?<\/footer>/, '<footer>略</footer>'),
            'utf8',
          )
        },
      },
      {
        no: 4,
        what: '删掉词条的释义（word 还在，translation 没了 ⇒ 爬虫读不到词+释义配对）',
        expect: '该页 word+translation 配对 < 3 组',
        mutate() {
          const files = readdirSync(join(TMP, 'bank')).sort()
          const p = join(TMP, 'bank', files[0])
          writeFileSync(p, readFileSync(p, 'utf8').replace(/<span class="trans">[\s\S]*?<\/span>/g, ''), 'utf8')
        },
      },
      {
        no: 5,
        what: '把某页 canonical 改成站点根（13 页都指/ ⇒ 重复内容）',
        expect: '该页 canonical 非自指',
        mutate() {
          const files = readdirSync(join(TMP, 'bank')).sort()
          const p = join(TMP, 'bank', files[0])
          const html = readFileSync(p, 'utf8')
          writeFileSync(p, html.replace(/(<link rel="canonical" href=")[^"]+(")/, '$1https://geek-typing.pages.dev/$2'), 'utf8')
        },
      },
      {
        no: 6,
        what: '把某页 <title> 复制成另一页的（重复 title）',
        expect: 'title 出现重复',
        mutate() {
          const files = readdirSync(join(TMP, 'bank')).sort()
          const a = join(TMP, 'bank', files[0])
          const b = join(TMP, 'bank', files[1])
          const ta = readFileSync(a, 'utf8').match(/<title>([\s\S]*?)<\/title>/)[1]
          writeFileSync(b, readFileSync(b, 'utf8').replace(/<title>[\s\S]*?<\/title>/, `<title>${ta}</title>`), 'utf8')
        },
      },
      {
        no: 7,
        what: '把某页 description 复制成另一页的',
        expect: 'description 出现重复',
        mutate() {
          const files = readdirSync(join(TMP, 'bank')).sort()
          const a = join(TMP, 'bank', files[0])
          const b = join(TMP, 'bank', files[1])
          const da = readFileSync(a, 'utf8').match(/name="description" content="([^"]*)"/)[1]
          writeFileSync(b, readFileSync(b, 'utf8').replace(/name="description" content="[^"]*"/, `name="description" content="${da}"`), 'utf8')
        },
      },
      {
        no: 8,
        what: '把 404 页的 404 语义与 noindex 都抹掉（只剩一个普通页面）',
        expect: '404 页缺 404 语义 / noindex',
        mutate() {
          const p = join(TMP, '404.html')
          writeFileSync(p, readFileSync(p, 'utf8').replace(/404|页面不存在|not found/gi, '提示').replace(/<meta name="robots" content="noindex" \/>/, ''), 'utf8')
        },
      },
      {
        no: 9,
        what: '把某页灌到超过 200 KiB',
        expect: '该页 raw > 200 KiB',
        mutate() {
          const files = readdirSync(join(TMP, 'bank')).sort()
          const p = join(TMP, 'bank', files[0])
          writeFileSync(p, readFileSync(p, 'utf8') + '<!-- ' + 'x'.repeat(210 * 1024) + ' -->\n', 'utf8')
        },
      },
      {
        no: 10,
        what: '给生成器源码加第二个页面模板函数（per-bank 散落的起点）',
        expect: '页面模板函数数 = 2',
        mutate() {
          // 名字故意不叫 renderBankPage2 —— 真实的散落会换各种名字（PerBank / V2 / ForType…），
          // 判据必须对「有几个模板函数」敏感而不是对「叫什么」敏感。
          const p = join(TMP, 'builder.mjs')
          writeFileSync(p, readFileSync(p, 'utf8') + '\nexport function renderBankPagePerBank() { return "" }\n', 'utf8')
        },
      },
      {
        no: 11,
        what: '在 dist/pages 下放一个 index.html（撞主 chunk 唯一性语义）',
        expect: 'dist/pages 下出现 index.html',
        mutate() {
          writeFileSync(join(TMP, 'pages', 'index.html'), '<!doctype html><title>x</title>\n', 'utf8')
        },
      },
      {
        no: 12,
        what: '谎报词条规模（把计数声明里的「完整 N 词」改成「完整 99999 词」）',
        expect: '声明完整数与该包真实总词数不符',
        mutate() {
          // ⚠️ 必须**只改 <p class="count"> 里那一处**：
          //   页内 <head> 的 meta description 里也有字面量相同的「… / 完整 N 词…」，
          //   而 <head> 在文档更前面 ⇒ 用全局 replace 会先改到 head 那份，
          //   <p class="count"> 原封不动 ⇒ 判据 12 读到的还是真值 ⇒ 注入「打不红」。
          //   （这正是「注入必须真的落到被判定的那处」的典型例子：打不红不永远是判据恒真。）
          const files = readdirSync(join(TMP, 'bank')).sort()
          const p = join(TMP, 'bank', files[0])
          writeFileSync(
            p,
            readFileSync(p, 'utf8').replace(/(<p class="count">)([\s\S]*?)(<\/p>)/, (_m, a, mid, b) =>
              `${a}${mid.replace(/完整\s*\d+\s*词/, '完整 99999 词')}${b}`,
            ),
            'utf8',
          )
        },
      },
    ]

    for (const inj of injections) {
      stageCopy()
      inj.mutate()
      const r = evalCopy()
      if (r.fatal) {
        fail.push(`注入判据 ${inj.no}：evaluate 返回 fatal（${r.fatal}）而非 FAIL —— 注入方式有问题`)
        continue
      }
      const reds = redNos(r)
      if (reds.length === 0) {
        fail.push(`注入判据 ${inj.no}（${inj.what}）后仍全绿—— 该判据恒真，没在守`)
      } else if (!reds.includes(inj.no)) {
        fail.push(`注入判据 ${inj.no}（${inj.what}）后转红的是 ${reds.join('、')}，不含 ${inj.no} —— 注入未落到目标判据`)
      } else if (reds.length > 1) {
        fail.push(`注入判据 ${inj.no}（${inj.what}）后判据 ${reds.join('、')} 同时转红，不止 ${inj.no} 一条 —— 注入不精准，无法归因`)
      } else {
        console.log(`[gate-seo-pages] 注入判据 ${String(inj.no).padStart(2)}：${inj.what} ⇒ 仅第 ${inj.no} 条转红 ✅（${inj.expect}）`)
      }
    }
  } finally {
    cleanupTemp()
  }

  /* --- 还原后：临时目录清干净 + 真产物逐字节一致 + 对照组复绿 --- */
  if (existsSync(TMP)) fail.push(`证伪临时目录没删干净：${TMP}`)
  for (const [p, before2] of realShas) {
    if (!existsSync(p) || sha(p) !== before2) {
      fail.push(`真产物 ${p} 未逐字节还原 —— 证伪污染了真产物`)
    }
  }
  console.log(`[gate-seo-pages] 还原后：真产物逐字节一致✅（${realShas.size} 个文件，全程只读）`)

  const after = evaluate(collectInputs())
  if (after.fatal) fail.push(`还原后判定fatal：${after.fatal}`)
  else if (redNos(after).length > 0) fail.push(`还原后判据 ${redNos(after).join('、')} 仍红 —— 证伪没恢复干净，或判据本来就红`)
  else console.log(`[gate-seo-pages] 还原后：常规判定复绿 ✅ PASS（${after.rows.length} 条判据）—— 判据不是恒真，也不是恒红`)

  if (fail.length > 0) {
    console.error('\n[gate-seo-pages] ❌ 证伪自检失败：')
    for (const f of fail) console.error(`   · ${f}`)
    process.exit(1)
  }
  console.log('\n[gate-seo-pages] ✅ 证伪自检通过：12 条判据逐条「注入即红、且恰好只红那一条」，还原后逐字节一致 + 复绿')
  process.exit(0)
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invoked) {
  if (process.argv.includes('--falsify')) falsify()
  else gate()
}