#!/usr/bin/env node
/**
 * 首页落地页门禁（gate-home-landing）
 *
 * 为什么必须有这道门（它补的是哪个盲区 —— 以及为什么是 P0 而不是 SEO 装饰）：
 *   本轮实测确认13 个词库页是**彻底的孤岛页 —— 全站零入站链接**：
 *     · dist/index.html 含 `pages/bank` 0 次、含 `<a href` 0 个
 *     · dist/assets/index-*.js 含 `pages/bank` 0 次
 *     · 13 个 bank 页各自的出链各 1 条，**只有 href="/"**（链回首页）
 *   GSC 印证：首页已编入索引，三个 bank 页全部「尚未收录 · Google 无法识别此网址」。
 *   而 `gate-seo-pages` 的 13 条判据里**没有一条检查入站链接**（只查 bank → 首页的出站）
 *   ⇒ 孤岛能一路过CI，这正是它至今没被发现的原因。
 *
 * 判据（10 条，每条打印 PASS/FAIL + 实测值）：
 *    H1  落地块在 `#root` **之外**（剥离 `<div id="root">…</div>` 后仍能找到）
 *    H2  落地块去标签正文 ≥ 800 字符
 *    H3  9 个目标关键词全覆盖
 *    H4  落地块内 `<script` 出现 0 次（零运行时 JS 的机器自证）
 *    H5  **词数诚实**：每张卡片数字 == content/vocabulary/<id>/words.json 真实长度（⛔ 禁写死）
 *    H6  **内链规范**：href 全部 == canonicalBankUrl() 形态（⛔ 不含 .html），
 *        且**恰好覆盖 13 个包，零缺失零多余**（不是「≥10」）
 *    H7  落地块 raw ≤ 32 KiB
 *    H8  首页 <title> / description 与 13 个词库页**均不相同**
 *    H9  落地块不含任何 data-testid（不与 React 断言体系纠缠）
 *    H10 移动端安全：无固定px 宽度，使用 max-width + overflow-wrap
 *
 * 三态纪律：PASS / FAIL / UNKNOWN，**UNKNOWN 视为不通过**；脚本自身错误 exit 2；
 *   **产物缺失 = fatal exit 2**，绝不「文件不存在就跳过」降级成 PASS。
 *
 * 用法：
 *   node scripts/seo/gate-home-landing.mjs# 常规判定（CI / 本机）
 *   node scripts/seo/gate-home-landing.mjs --falsify        # 证伪自检
 *
 * ⚠️ **本门与生成器刻意不共谋判定逻辑**：判据 6 的期望 URL 由生成器的 canonicalBankUrl()
 *   给出（与 bank 页 canonical / sitemap <loc> 同源，这是**必须的**同源），
 *   但判据 1/2/4/7/9/10（位置 / 正文 / 零script / 体积 / 无 testid / 移动端）
 *   **全部自己读盘算** —— 门禁必须能独立发现生成器的错误。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { canonicalBankUrl } from './build-static-pages.mjs'
import { ROOT_ID, stripRootContainer } from './home-landing.mjs'
import { TARGET_KEYWORDS } from './home-landing.copy.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DIST = join(ROOT, 'dist')
const INDEX_HTML = join(DIST, 'index.html')
const BANK_DIR = join(DIST, 'pages', 'bank')
const VOCAB_DIR = join(ROOT, 'content', 'vocabulary')

/* ─────────────────────────── 阈值（单一事实源） ─────────────────────────── */

/** 落地块去标签正文下限（字符） */
export const MIN_TEXT_CHARS = 800
/** 落地块 raw 体积上限（字节） */
export const MAX_BLOCK_BYTES = 32 * 1024
/** 期望的词库真链接条数——⛔ 不是「≥10」，必须 13/13 全覆盖（防孤岛回归的核心） */
export const EXPECTED_BANK_LINKS = 13

/** --falsify 的注入条数（与下方 falsify() 的 injections 数组一一对应，收尾日志读它） */
const INJECTION_COUNT = 10

/* ───────────────────────────── 纯判定辅助 ───────────────────────────── */

/**
 * 剥掉 <style>/<script> 整块，再去标签、解实体、折叠空白。
 *
 * ⛔ 必须先整块剔除 <style>：否则 CSS 会被算成「正文」，
 *   判据 H2 就退化成「用样式表撑长度」的空转检查。
 *
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
 * 截出落地块（含首尾标记注释）。
 * 判据一律在这个切片上算 —— 绝不扫整份 index.html，否则会把React 应用自己的
 * `<script type="module">` 算进 H4（那会让判据恒红，且是错的方向）。
 *
 * @param {string} html 完整 index.html
 * @returns {string|null} 落地块；不存在返回 null（⇒ UNKNOWN，不降级 PASS）
 */
export function extractLandingBlock(html) {
  const s = String(html).indexOf('<!-- seo-home:start -->')
  const e = String(html).indexOf('<!-- seo-home:end -->')
  if (s === -1 || e === -1 || e < s) return null
  return String(html).slice(s, e + '<!-- seo-home:end -->'.length)
}

/**
 * 提取落地块里指向词库页的 `<a href>`（只取 `/pages/bank/` 的，⛔ 不含 .html 形态另行判定）。
 * @param {string} block
 * @returns {Array<{href: string, pkgId: string, count: number|null}>}
 */
export function extractBankLinks(block) {
  const out = []
  const re = /<a\s+class="gh-card"\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g
  let m
  while ((m = re.exec(String(block))) !== null) {
    const href = m[1]
    const inner = m[2]
    const pkg = href.match(/\/pages\/bank\/([^/?#]+)/)
    // 卡片上的词数：<span class="gh-card-count">43 词</span>
    const c = inner.match(/class="gh-card-count">\s*(\d+)\s*词/)
    out.push({ href, pkgId: pkg ? decodeURIComponent(pkg[1]) : null, count: c ? Number(c[1]) : null })
  }
  return out
}

/** 取 <title> / description（属性顺序不固定，两种都试） */
export function extractTitle(html) {
  const m = String(html).match(/<title>([\s\S]*?)<\/title>/i)
  return m ? m[1].trim() : null
}
export function extractDescription(html) {
  const a = String(html).match(/<meta[^>]+name="description"[^>]+content="([^"]*)"/i)
  if (a) return a[1].trim()
  const b = String(html).match(/<meta[^>]+content="([^"]*)"[^>]+name="description"/i)
  return b ? b[1].trim() : null
}

/**
 * 落地块 CSS 里的**固定 px 宽度**声明（`width: <n>px`）。
 *
 * ⛔ `max-width` / `min-width` **不算** —— 它们是移动端安全的正确写法。
 *   所以正则要求 `width` 前面不是 `-`（`max-` / `min-` 都以 `-` +字母开头，
 *   用`(?<![-\w])width` 排除掉 `max-width` / `min-width` / `border-width` 等）。
 * @param {string} block
 * @returns {string[]} 命中的声明原文
 */
export function findFixedPxWidths(block) {
  const css = String(block).match(/<style[^>]*>([\s\S]*?)<\/style>/i)
  if (!css) return []
  const hits = []
  const re = /(?<![-\w])width\s*:\s*\d+(?:\.\d+)?px/g
  let m
  while ((m = re.exec(css[1])) !== null) hits.push(m[0])
  return hits
}

/**
 * 读 content/vocabulary 得到「包真实总词数」（判据 H5 的期望值）。
 * 刻意**独立读盘**而不问生成器：门禁不能相信被它检查的那个组件的自述。
 * @returns {Map<string, number>} packageId → words.json 真实长度
 */
export function readPackageTotals(vocabDir = VOCAB_DIR) {
  const out = new Map()
  if (!existsSync(vocabDir)) return out
  for (const name of readdirSync(vocabDir).sort()) {
    const mp = join(vocabDir, name, 'manifest.json')
    const wp = join(vocabDir, name, 'words.json')
    if (!existsSync(mp)) continue
    try {
      const m = JSON.parse(readFileSync(mp, 'utf8'))
      if (m?.type !== 'vocabulary') continue
      out.set(m.packageId, existsSync(wp) ? JSON.parse(readFileSync(wp, 'utf8')).length : null)
    } catch {
      /* 读不动的包不在本门越权判红（内容侧另有 content:validate fail-closed） */
    }
  }
  return out
}

/* ─────────────────────────────── 判定 ─────────────────────────────── */

/**
 * 纯判定：给定 inputs → 10 条判据结果。不打印、不退出（打印在gate，注入在 falsify，
 * 三者共用这一份判定 ⇒ 门不会与自证漂移）。
 *
 * @param {object} inp
 * @returns {{rows: Array<{no:number,name:string,status:'PASS'|'FAIL'|'UNKNOWN',msg:string}>, fatal: string|null}}
 */
export function evaluate(inp) {
  // 产物缺失 = fatal（exit 2），绝不降级成 PASS —— fail-closed。
  const fatal = []
  if (inp.indexHtml == null) fatal.push(`${INDEX_HTML} 不存在或不可读（先 npm run build）`)
  if (!existsSync(inp.bankDir)) fatal.push(`${inp.bankDir} 不存在（先 npm run build）`)
  if (fatal.length > 0) return { rows: [], fatal: fatal.join('；') }

  const rows = []
  const add = (no, name, status, msg) => rows.push({ no, name, status, msg })

  const html = inp.indexHtml
  const block = extractLandingBlock(html)

  // 落地块整体缺失 ⇒ 后续判据全部 UNKNOWN（三态纪律：UNKNOWN 视为不通过）
  if (block == null) {
    for (let no = 1; no <= 10; no++) {
      add(no, CRITERIA_NAMES[no], 'UNKNOWN', '落地块标记 <!-- seo-home:start --> 未找到（判据无从计算，按三态纪律视为不通过）')
    }
    return { rows, fatal: null }
  }

  const blockBytes = Buffer.byteLength(block, 'utf8')

  /* H1 · 落地块在 #root 之外（剥离 #root 后仍能找到） */
  {
    const stripped = stripRootContainer(html)
    const afterStrip = stripped.includes(`id="${ROOT_ID}"`)
    const blockAt = html.indexOf(`id="${ROOT_ID}"`)
    const rootAt = html.indexOf('<div id="root">')
    const beforeRoot = blockAt !== -1 && rootAt !== -1 && blockAt < rootAt
    add(
      1,
      '落地块位于 #root 之外（React 清不掉）',
      afterStrip && beforeRoot ? 'PASS' : 'FAIL',
      afterStrip && beforeRoot
        ? `剥离 <div id="root">…</div> 后仍能找到 id="${ROOT_ID}"（偏移 ${blockAt} < #root ${rootAt}）⇒ 确在root 外，不是「恰好没被清」`
        : `剥离 #root 后${afterStrip ? '仍能找到但' : '找不到'}；块在 root ${beforeRoot ? '之前 ✅' : '之内或缺失 ❌'} ⇒React 19 createRoot 会清掉它`,
    )
  }

  /* H2 · 去标签正文 ≥ 800 字符 */
  {
    const text = extractVisibleText(block)
    add(
      2,
      `落地块去标签正文 ≥ ${MIN_TEXT_CHARS} 字符`,
      text.length >= MIN_TEXT_CHARS ? 'PASS' : 'FAIL',
      `实测 ${text.length} 字符（占阈值 ${((text.length / MIN_TEXT_CHARS) * 100).toFixed(1)}%）`,
    )
  }

  /* H3 · 9 个目标关键词全覆盖 */
  {
    const text = extractVisibleText(block)
    const missing = TARGET_KEYWORDS.filter((k) => !text.includes(k))
    add(
      3,
      '目标关键词全覆盖',
      missing.length === 0 ? 'PASS' : 'FAIL',
      missing.length === 0
        ? `${TARGET_KEYWORDS.length}/${TARGET_KEYWORDS.length} 全覆盖：${TARGET_KEYWORDS.join('、')}`
        : `❌ 缺 ${missing.length} 个：${missing.join('、')}`,
    )
  }

  /* H4 · 落地块内 <script 0 次 */
  {
    const n = (block.match(/<script/gi) || []).length
    add(
      4,
      '落地块零 <script（零运行时 JS）',
      n === 0 ? 'PASS' : 'FAIL',
      n === 0 ? '实测 0 次 ⇒ 爬虫无需执行 JS 即可读到全部正文' : `❌ 实测 ${n} 次`,
    )
  }

  /* H5 · 词数诚实（⛔ 期望值来自 content/ 现算，不是门里写死的数字） */
  {
    const totals = readPackageTotals()
    const links = extractBankLinks(block)
    const bad = []
    let checked = 0
    for (const l of links) {
      if (l.pkgId == null) {
        bad.push(`${l.href}: href 里解析不出 packageId`)
        continue
      }
      const real = totals.get(l.pkgId)
      if (real == null) {
        bad.push(`${l.pkgId}: content/ 里找不到该包（数字无从核对）`)
        continue
      }
      if (l.count == null) {
        bad.push(`${l.pkgId}: 卡片上没有词数`)
        continue
      }
      checked++
      if (l.count !== real) bad.push(`${l.pkgId}: 卡片写 ${l.count} 词 ≠ words.json 真实 ${real} 词`)
    }
    add(
      5,
      '词数诚实（卡片数字 == words.json 真实长度）',
      bad.length === 0 && checked > 0 ? 'PASS' : 'FAIL',
      bad.length === 0
        ? `${checked}/${links.length} 张卡片逐包核对通过（期望值取自 content/vocabulary/*/words.json，非写死）`
        : `❌ ${bad.length} 处不诚实：${bad.join(' | ')}`,
    )
  }

  /* H6 · 内链规范：形态正确 + 恰好 13/13 全覆盖（零缺失零多余） */
  {
    const links = extractBankLinks(block)
    const origin = inp.siteOrigin
    const withHtml = links.filter((l) => l.href.includes('.html')).map((l) => l.href)
    const wrongShape = []
    const seen = []
    for (const l of links) {
      const expected = l.pkgId && origin ? canonicalBankUrl(origin, l.pkgId) : null
      if (expected == null) wrongShape.push(`${l.href}: 读不到 siteOrigin 或 packageId`)
      else if (l.href !== expected) wrongShape.push(`${l.href} ≠ 规范形态 ${expected}`)
      else seen.push(l.pkgId)
    }
    // 覆盖度：以 **content/ 的真实包集合**为期望值（⛔ 不写死 13 这个数字）
    const expectedPkgs = [...readPackageTotals().keys()].sort()
    const seenSorted = [...new Set(seen)].sort()
    const missing = expectedPkgs.filter((p) => !seenSorted.includes(p))
    const extra = seenSorted.filter((p) => !expectedPkgs.includes(p))

    const problems = []
    if (withHtml.length > 0) problems.push(`${withHtml.length} 条 href 含 .html（会 308 的地址）：${withHtml.join(' ')}`)
    if (wrongShape.length > 0) problems.push(`${wrongShape.length} 条形态不符：${wrongShape.join(' | ')}`)
    if (missing.length > 0) problems.push(`❌ 缺失 ${missing.length} 个包：${missing.join(' ')}`)
    if (extra.length > 0) problems.push(`多余 ${extra.length} 个：${extra.join(' ')}`)
    if (links.length !== EXPECTED_BANK_LINKS) problems.push(`链接总数 ${links.length} ≠ ${EXPECTED_BANK_LINKS}`)

    add(
      6,
      '内链规范且13/13 全覆盖（零缺失零多余）',
      problems.length === 0 ? 'PASS' : 'FAIL',
      problems.length === 0
        ? `${links.length} 条 href 全部 == canonicalBankUrl() 形态（不含 .html），恰好覆盖 ${expectedPkgs.length} 个包：零缺失、零多余`
        : `❌ ${problems.join('；')}`,
    )
  }

  /* H7 · 落地块 raw ≤ 32 KiB */
  {
    add(
      7,
      `落地块 raw ≤ ${MAX_BLOCK_BYTES} B`,
      blockBytes <= MAX_BLOCK_BYTES ? 'PASS' : 'FAIL',
      `实测 ${blockBytes} B（${(blockBytes / 1024).toFixed(2)} KiB，占上限 ${((blockBytes / MAX_BLOCK_BYTES) * 100).toFixed(1)}%）`,
    )
  }

  /* H8 · 首页 title/description 与 13 个词库页均不相同（防与 gate-seo-pages 判据 6/7 语义重叠时互相掩盖） */
  {
    const t = extractTitle(html)
    const d = extractDescription(html)
    const clashes = []
    if (!t) clashes.push('首页无 <title>')
    if (!d) clashes.push('首页无 description')
    let compared = 0
    if (existsSync(inp.bankDir)) {
      for (const f of readdirSync(inp.bankDir).filter((x) => x.endsWith('.html')).sort()) {
        const bh = readFileSync(join(inp.bankDir, f), 'utf8')
        const bt = extractTitle(bh)
        const bd = extractDescription(bh)
        compared++
        if (t && bt === t) clashes.push(`${f}: title 与首页相同`)
        if (d && bd === d) clashes.push(`${f}: description 与首页相同`)
      }
    }
    add(
      8,
      '首页 title/description 与 13 个词库页均不同',
      clashes.length === 0 && compared > 0 ? 'PASS' : 'FAIL',
      clashes.length === 0
        ? `与${compared} 个词库页逐页比对：title「${(t ?? '').slice(0, 28)}…」、description ${(d ?? '').length} 字符，均不相同`
        : `❌ ${clashes.join(' | ')}`,
    )
  }

  /* H9 · 不含 data-testid（不与 React 断言体系纠缠） */
  {
    const n = (block.match(/data-testid/gi) || []).length
    add(
      9,
      '落地块不含 data-testid',
      n === 0 ? 'PASS' : 'FAIL',
      n === 0 ? '实测 0 处⇒ 落地块与 React 断言体系不共享生命周期' : `❌ 实测 ${n} 处`,
    )
  }

  /* H10 · 移动端安全：无固定 px 宽度，用 max-width + overflow-wrap */
  {
    const fixed = findFixedPxWidths(block)
    const hasMax = /max-width\s*:/.test(block)
    const hasWrap = /overflow-wrap\s*:/.test(block)
    const ok = fixed.length === 0 && hasMax && hasWrap
    add(
      10,
      '移动端安全（无固定 px 宽，用 max-width + overflow-wrap）',
      ok ? 'PASS' : 'FAIL',
      ok
        ? `固定 px 宽声明 ${fixed.length} 处；max-width ${hasMax ? '有' : '❌无'}；overflow-wrap ${hasWrap ? '有' : '❌无'}`
        : `❌ 固定 px 宽 ${fixed.length} 处${fixed.length ? `（${fixed.join(' ')}）` : ''}；max-width ${hasMax ? '有' : '缺'}；overflow-wrap ${hasWrap ? '有' : '缺'}`,
    )
  }

  return { rows, fatal: null }
}

/** 判据名表（UNKNOWN 分支与 --falsify 输出共用，避免在两处各写一份） */
const CRITERIA_NAMES = {
  1: '落地块位于 #root 之外（React 清不掉）',
  2: `落地块去标签正文 ≥ ${MIN_TEXT_CHARS} 字符`,
  3: '目标关键词全覆盖',
  4: '落地块零 <script（零运行时 JS）',
  5: '词数诚实（卡片数字 == words.json 真实长度）',
  6: '内链规范且 13/13 全覆盖（零缺失零多余）',
  7: `落地块 raw ≤ ${MAX_BLOCK_BYTES} B`,
  8: '首页 title/description 与 13 个词库页均不同',
  9: '落地块不含 data-testid',
  10: '移动端安全（无固定 px 宽，用 max-width + overflow-wrap）',
}

/* ───────────────────────────输入收集（可注入） ─────────────────────────── */

export function collectInputs(o = {}) {
  const indexPath = o.indexPath ?? INDEX_HTML
  return {
    indexHtml: existsSync(indexPath) ? readFileSync(indexPath, 'utf8') : null,
    bankDir: o.bankDir ?? BANK_DIR,
    siteOrigin: o.siteOrigin ?? readOriginFromIndex(existsSync(indexPath) ? readFileSync(indexPath, 'utf8') : ''),
  }
}

/** 从 index.html 的 canonical 解析 origin（⛔ 不在本门另写域名常量） */
function readOriginFromIndex(html) {
  const m = String(html).match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i)
  if (!m) return null
  try {
    return new URL(m[1]).origin
  } catch {
    return null
  }
}

/* ─────────────────────────────── 输出 / 退出 ─────────────────────────────── */

function gate(opts = {}) {
  const { rows, fatal } = evaluate(collectInputs(opts))
  if (fatal) {
    console.error(`[gate-home-landing] ❌ 产物不完整，拒绝放行：${fatal}`)
    process.exit(2)
  }
  console.log('== 首页落地页门禁（gate-home-landing）==')
  console.log('本门补的是「孤岛页」盲区：gate-seo-pages 只查 bank → 首页的出站，从无一条判据查入站链接\n')
  const bad = []
  for (const r of rows) {
    if (r.status === 'PASS') console.log(`  ✅ ${String(r.no).padStart(2)}. ${r.name} —— ${r.msg}`)
    else {
      console.log(`  ❌ ${r.status} ${String(r.no).padStart(2)}. ${r.name}`)
      console.log(`         ${r.msg}`)
      bad.push(r.no)
    }
  }
  if (bad.length > 0) {
    console.error(`\n❌ gate-home-landing 未通过：第 ${bad.join('、')} 项（UNKNOWN 视为不通过；产物退化必须判红，不允许静默放行）`)
    process.exit(1)
  }
  console.log(`\n✅ gate-home-landing PASS：${rows.length} 条判据全部通过`)
  return rows
}

/* ────────────────────────── --falsify：判据能判红吗？ ──────────────────────────
 *
 * 形态对齐 gate-seo-pages.mjs / gate-perf.mjs 的 falsify()：
 *   注入故障 ⇒ 断言**恰好该判据**转红 ⇒ 还原 ⇒ 真产物逐字节一致 ⇒ 对照组复绿。
 *
 * ⛔ **防假通过纪律（两条硬约束）**：
 *   1. **隔离副本**：所有注入都在 `node_modules/.tmp/`（已 gitignore）下的副本上做，
 *      真 `dist/index.html` 全程**只读**（跑前存 sha256，跑后逐字节比对）。
 *   2. **0 次删除**：本机预加载 safe-delete shim，按「本轮累计删除条目数」计费，
 *      超阈值（默认 50）fail-closed ⇒ 抛 SAFE_DELETE_BULK_CONFIRM_REQUIRED。
 *      所以还原一律用 `writeFileSync` **覆写**（0 删除），临时目录只在开头建一次、
 *      结尾删一次（本门只建1 个文件 ⇒ 删除数= 1，稳定在阈值内）。
 *   ⛔ **不 spawn 子进程**：本机预加载 safe-delete / brokered-fs shim，spawn 一律 EBUSY。
 */
function falsify() {
  const fail = []
  const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex')
  const TMP_DIR = join(ROOT, 'node_modules', '.tmp')
  const TMP = join(TMP_DIR, 'gate-home-landing-falsify')
  const TMP_INDEX = join(TMP, 'index.html')

  if (!existsSync(INDEX_HTML)) {
    console.error('[gate-home-landing] --falsify 需要真实 dist/index.html 作为对照基准：先 npm run build')
    process.exit(1)
  }

  const realSha = sha(INDEX_HTML)
  const pristine = readFileSync(INDEX_HTML, 'utf8')

  /** 铺一份干净副本（只写不删；重复调用即「还原」） */
  function stageCopy() {
    mkdirSync(TMP_DIR, { recursive: true })
    mkdirSync(TMP, { recursive: true })
    writeFileSync(TMP_INDEX, pristine)
  }

  /** 在隔离副本上跑判定（bankDir 仍指真 dist/pages/bank —— H5/H8 要逐包核对，不该被副本影响） */
  function evalCopy() {
    return evaluate(collectInputs({ indexPath: TMP_INDEX }))
  }

  const redNos = (r) => r.rows.filter((x) => x.status !== 'PASS').map((x) => x.no)

  /** 在副本上做一次字符串替换 */
  const mutate = (fn) => {
    const cur = readFileSync(TMP_INDEX, 'utf8')
    writeFileSync(TMP_INDEX, fn(cur), 'utf8')
  }

  try {
    const before = evaluate(collectInputs())
    if (before.fatal) {
      console.error(`[gate-home-landing] --falsify 无法开始：${before.fatal}`)
      process.exit(1)
    }
    if (redNos(before).length > 0) {
      console.error(`[gate-home-landing] --falsify 无法开始：注入前判据 ${redNos(before).join('、')} 已红，对照组不成立`)
      process.exit(1)
    }
    console.log(`\n[gate-home-landing] 注入前：常规判定 PASS（${before.rows.length} 条判据）`)

    // 注：injections 声明在 try 块内，收尾日志在 finally 之后 —— 故此处用 hoisted 的INJECTION_COUNT。
    const injections = [
      {
        no: 1,
        what: '把落地块整块搬进 <div id="root"> 内部（React 会清掉它的那条路）',
        expect: '剥离 #root 后找不到落地块 ⇒ 在 root 内',
        mutate() {
          mutate((html) => {
            const s = html.indexOf('<!-- seo-home:start -->')
            const e = html.indexOf('<!-- seo-home:end -->') + '<!-- seo-home:end -->'.length
            const block = html.slice(s, e)
            const rest = html.slice(0, s) + html.slice(e)
            return rest.replace('<div id="root"></div>', `<div id="root">${block}</div>`)
          })
        },
      },
      {
        no: 2,
        what: '把落地块抽薄到只剩词库卡片与关键词（正文 2331 → 约 540 字符）',
        expect: '去标签正文 < 800 字符，而 H3/H5/H6 仍绿（证明只打红「太薄」这一条）',
        // ⚠️ **注入必须精准**：若把正文整段掏空，判据 3（关键词）与 5/6（词库卡片）
        //   会跟着转红 ⇒ 一次注入打红四条，无法归因到H2（与 gate-seo-pages 注入 3 同一类教训：
        //   「打不红不永远是判据恒真」—— 也可能是注入选错了对象）。
        //   所以这里**只抽 prose**：抹掉全部 <p class="gh-p"> 正文段、gh-why/gh-diff/gh-facts/gh-faq
        //   的卡片与条目，然后补一行含全部 9 个关键词的短句 ——
        //   于是判据 3（关键词在）与 5/6（13 张卡片与真链接在）保持绿，
        //   只有判据 2 的「去标签正文长度」掉到 800 以下。
        //
        // ⚠️⚠️ **本注入必须随落地块结构同步维护（它是一条「白名单式」的抽薄刀）**：
        //   它只抽「它显式列出的那几类」prose，**新增的文案载体若不在名单里就会漏网**。
        //   本轮新增了 gh-hero 的 `.gh-chips` 徽标与 gh-demo 的 `.gh-demo` 展示区
        //   （示意图 figcaption + 要点清单 + SVG 内的 <text>），初版没把它们列进来 ⇒
        //   抽薄后仍剩 1106 字符 > 800 ⇒ 判据 2 根本不红 ⇒ falsify 报「该判据恒真，没在守」。
        //   ⛔ 这是**真实的证伪自检价值**：它证明「加区块」与「门的注入」必须同改，
        //   否则门会在无人察觉的情况下失去对判据 2 的守护。
        //   ⇒ 下方 ③b 就是为此存在；**再加任何文案载体，必须同步加一条删除**。
        mutate() {
          mutate((html) => {
            let out = html
            // ① 抽掉全部 prose 正文段
            out = out.replace(/<p class="gh-p">[\s\S]*?<\/p>/g, '')
            // ② 抽掉 gh-why 的能力卡（保留 gh-banks 的词库网格 —— 判据 5/6 靠它）
            out = out.replace(/(<section class="gh-sec" id="gh-why">[\s\S]*?)(<div class="gh-grid">[\s\S]*?<\/div>)(<\/section>)/, '$1$3')
            // ③ 抽掉差异对比、事实条目、FAQ 条目（结构留着，只掏内容）
            out = out.replace(/<ul class="gh-cmp">[\s\S]*?<\/ul>/g, '')
            out = out.replace(/<p class="gh-fact">[\s\S]*?<\/p>/g, '')
            out = out.replace(/<details class="gh-faq-item">[\s\S]*?<\/details>/g, '')
            // ③b 抽掉本轮新增的两个文案载体（⛔ 见上方「必须随结构同步维护」）：
            //   · gh-chips：Hero 徽标条（4 条事实标签）
            //   · gh-demo  ：整个展示区 —— 含 figcaption、要点清单，以及 **SVG 内的 <text>**
            //     （extractVisibleText 会把 SVG 文字算进正文，所以必须整块删而不是只删 figcaption）
            out = out.replace(/<ul class="gh-chips">[\s\S]*?<\/ul>/g, '')
            out = out.replace(/<div class="gh-demo">[\s\S]*?<\/ul><\/div>/g, '')
            // ④ 补一行 9 个关键词，让判据 3 保持绿（证明这刀只砍长度）
            const kw = '英语打字练习 背单词 打字练习 程序员背单词 前端英语词汇 Go 词汇 云原生词汇 K8s 词汇 AI 大模型词汇'
            out = out.replace('<section class="gh-sec" id="gh-cta">', `<p class="gh-p">${kw}</p><section class="gh-sec" id="gh-cta">`)
            return out
          })
        },
      },
      {
        no: 3,
        what: '把 9 个目标关键词里的「云原生词汇」从正文里抹掉',
        expect: '关键词覆盖缺 1 个',
        mutate() {
          mutate((html) => html.replace(/云原生词汇/g, '云原生相关词'))
        },
      },
      {
        no: 4,
        what: '往落地块里塞一个 <script>（模拟有人为了交互加了运行时 JS）',
        expect: '落地块内 <script 计数 > 0',
        mutate() {
          mutate((html) => html.replace('</div>\n<!-- seo-home:end -->', '<script>void 0</script></div>\n<!-- seo-home:end -->'))
        },
      },
      {
        no: 5,
        what: '谎报某个词库卡片的词数（把真实 43 改成 999）',
        expect: '卡片数字 ≠ words.json 真实长度',
        mutate() {
          mutate((html) => {
            const m = html.match(/(class="gh-card-count">)(\d+)( 词)/)
            if (!m) return html
            return html.replace(m[0], `${m[1]}999${m[3]}`)
          })
        },
      },
      {
        no: 6,
        what: '删掉 3 个词库卡片（模拟新增包漏渲染 / 卡片条件渲染漏了）',
        expect: '内链覆盖出现缺失 ⇒ 孤岛回归',
        mutate() {
          mutate((html) => {
            let out = html
            for (const id of ['ts-code', 'toefl', 'kaoyan']) {
              out = out.replace(new RegExp(`<a class="gh-card" href="[^"]*${id}">[\\s\\S]*?<\\/a>`), '')
            }
            return out
          })
        },
      },
      {
        no: 7,
        what: '把落地块灌到超过 32 KiB',
        expect: '落地块 raw > 32 KiB',
        mutate() {
          mutate((html) => html.replace('</div>\n<!-- seo-home:end -->', `<p>${'x'.repeat(33 * 1024)}</p></div>\n<!-- seo-home:end -->`))
        },
      },
      {
        no: 8,
        what: '把首页 <title> 改成与某个词库页完全相同',
        expect: '首页 title 与词库页撞车',
        mutate() {
          mutate((html) => {
            const first = readdirSync(BANK_DIR).filter((f) => f.endsWith('.html')).sort()[0]
            const bt = extractTitle(readFileSync(join(BANK_DIR, first), 'utf8'))
            return html.replace(/<title>[\s\S]*?<\/title>/, `<title>${bt}</title>`)
          })
        },
      },
      {
        no: 9,
        what: '给落地块加一个 data-testid（与 React 断言体系纠缠）',
        expect: '落地块内出现 data-testid',
        mutate() {
          mutate((html) => html.replace('<section class="gh-sec" id="gh-faq">', '<section data-testid="faq" class="gh-sec" id="gh-faq">'))
        },
      },
      {
        no: 10,
        what: '把落地块里所有 max-width 换成固定 px 宽度（移动端溢出）',
        expect: '检出固定 px 宽声明',
        mutate() {
          mutate((html) => html.replace(/#seo-home \.gh-wrap\{max-width:52rem;/g, '#seo-home .gh-wrap{width:900px;'))
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
      const wantKey = String(inj.no)
      const gotKey = reds.sort((a, b) => a - b).join('、')
      if (reds.length === 0) {
        fail.push(`注入判据 ${inj.no}（${inj.what}）后仍全绿 —— 该判据恒真，没在守`)
      } else if (gotKey !== wantKey) {
        fail.push(`注入判据 ${inj.no}（${inj.what}）后转红的是 ${gotKey || '无'}，期望 ${wantKey} —— 注入未落到目标判据`)
      } else {
        console.log(`[gate-home-landing] 注入判据 ${String(inj.no).padStart(2)}：${inj.what} ⇒ ${wantKey} 转红 ✅（${inj.expect}）`)
      }
    }
  } finally {
    /*
     * 隔离副本清理 —— **best-effort，且刻意不是判据**。
     *
     * ⚠️ 为什么删除失败不算失败：本机预加载 safe-delete shim，按「本轮累计删除条目数」
     *   计费、超阈值 fail-closed。本门为了「0 次删除」已经把还原全部改成 writeFileSync覆写，
     *   但**收尾那一次 unlink 仍可能被同一轮里别处的删除累计顶过阈值**（实测：本轮别处已用掉
     *   56 个额度，剩下 1 次unlink 直接抛 SAFE_DELETE_BULK_CONFIRM_REQUIRED）。
     *
     *   而「临时文件删掉了」**不是本门要守的不变量**。真正要守的是两条：
     *     ① 真产物 dist/index.html 全程未被污染 → 下面用 sha256 逐字节断言（硬判据）；
     *     ② 隔离副本已还原为原始字节 → 同样用 sha256 断言（硬判据）。
     *   临时目录残留只落在 node_modules/.tmp/（已 gitignore），零正确性影响。
     *   所以这里 try/catch 吞掉删除异常并**如实打印**，不把环境配额问题伪装成门禁结论。
     */
    let cleanupNote = '临时文件已删除'
    try {
      if (existsSync(TMP_INDEX)) unlinkSync(TMP_INDEX)
      if (existsSync(TMP)) rmdirSync(TMP)
    } catch (e) {
      cleanupNote = `临时文件删除被 safe-delete shim 拦下（${String(e.message).slice(0, 60)}…）—— 残留落在 node_modules/.tmp/（已 gitignore），不影响判定`
    }
    console.log(`[gate-home-landing] ${cleanupNote}`)
  }

  /* ── 还原后断言（这两条才是真不变量） ── */
  // ① 真产物逐字节一致（证伪全程只读）
  if (!existsSync(INDEX_HTML) || sha(INDEX_HTML) !== realSha) {
    fail.push('真产物 dist/index.html 未逐字节还原 —— 证伪污染了真产物')
  }
  console.log('[gate-home-landing] 还原后：真产物逐字节一致 ✅（dist/index.html，全程只读）')
  // ② 隔离副本逐字节还原为注入前的原始字节（重新铺一次干净副本再比）
  stageCopy()
  if (!existsSync(TMP_INDEX) || sha(TMP_INDEX) !== createHash('sha256').update(pristine).digest('hex')) {
    fail.push('隔离副本未还原为原始字节 —— 证伪的还原逻辑有问题')
  } else {
    console.log('[gate-home-landing] 还原后：隔离副本逐字节一致 ✅（stageCopy 可重复铺出同一份字节）')
  }

  const after = evaluate(collectInputs())
  if (after.fatal) fail.push(`还原后判定 fatal：${after.fatal}`)
  else if (redNos(after).length > 0) fail.push(`还原后判据 ${redNos(after).join('、')} 仍红 —— 证伪没恢复干净，或判据本来就红`)
  else console.log(`[gate-home-landing] 还原后：常规判定复绿 ✅ PASS（${after.rows.length} 条判据）—— 判据不是恒真，也不是恒红`)

  if (fail.length > 0) {
    console.error('\n[gate-home-landing] ❌ 证伪自检失败：')
    for (const f of fail) console.error(`   · ${f}`)
    process.exit(1)
  }
  console.log(`\n[gate-home-landing] ✅ 证伪自检通过：${INJECTION_COUNT} 条注入逐条「注入即红、且恰好红那一条」，还原后逐字节一致 + 复绿`)
  process.exit(0)
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invoked) {
  if (process.argv.includes('--falsify')) falsify()
  else gate()
}