#!/usr/bin/env node
/**
 * 首页落地块 · 纯逻辑（home-landing）
 *
 * 目的（这是本轮 P0 的全部理由，不是 SEO 装饰）：
 *   实测确认13 个词库页是**彻底的孤岛页 —— 全站零入站链接**，Google 因此从未抓取过它们：
 *     - `dist/index.html` 含 `pages/bank` **0 次**
 *     - `dist/index.html` 含 `<a href` **0 个**
 *     - `dist/assets/index-*.js` 含 `pages/bank` **0 次**
 *     - 13 个 bank 页各自的出链各 1 条，**只有 `href="/"`**（链回首页）
 *   GSC 印证：首页已收录，三个 bank 页全部「尚未收录 · Google 无法识别此网址」。
 *   本模块把**真 `<a href>` 内链**注入首页 ⇒ 13 个词库页第一次有了入站链接。
 *   ⛔ 所以词库卡片**必须是真链接**，不是纯文字展示 —— 纯文字对本问题零收益。
 *
 * 为什么注入点在 `vite build` **之后**（硬约束，沿用 build-static-pages.mjs 头注①）：
 *   `vite.config.ts` 没配 emptyOutDir ⇒ vite 会清空 `dist/`。
 *
 * 为什么落地块必须在 `<div id="root">` **之外**（实测结论，不是从 React 源码推的）：
 *   React 19 `createRoot` 会 `clearContainerSparingly(#root)` 清空 `#root` 内既有子节点。
 *   真机探针实测：同一份产物，标记块放 `#root` 内 → `insideExists:false`（被清）；
 *   放 `#root` 外 → `outsideExists:true`（存活）。
 *   第二个否决「放内侧」的理由：`scripts/verify-learning-unit.mjs:280` 用
 *   `#root?.children.length` 当「React 已挂载」信号 ⇒ 落地块放内侧会污染该探针。
 *
 * 三条实现纪律：
 *   1. ⛔ **函数名一律不含 `Page` 子串**（renderHomeLandingBlock，不是 renderHomeLandingPage）。
 *      `gate-seo-pages.mjs` 判据 10 用 `render[A-Za-z0-9_]*Page[A-Za-z0-9_]*\s*\(` 数页面模板函数，
 *      含 `Page` 会被计成第二个页面模板 ⇒ 当场判红。
 *   2. ⛔ **import 本模块不得触发任何写盘**（CLI 段不存在，写盘只在 build-static-pages 的
 *      main() 里调用本模块的纯函数）—— 与 build-static-pages.mjs 的 `import.meta.url` 纪律一致。
 *   3. ⛔ **零运行时 JS**：落地块内 `<script` 出现 0 次；一切 CSS 自带内联 `<style>`
 *      （`tailwind.config.js` 的 content 只扫 `./index.html` 与 `./src/**`，
 *      注入发生在 vite build 之后，那时 Tailwind 已编译完 ⇒ 用 utility class 会静默无样式）。
 */
import { canonicalBankUrl, escapeHtml } from './build-static-pages.mjs'
import {
  APP_ANCHOR,
  LANDING_CSS,
  LANDING_END_COMMENT,
  LANDING_FOOTER,
  LANDING_PLACEMENT,
  LANDING_ROOT_ID,
  LANDING_START_COMMENT,
  SECTIONS,
  SKIP_LINK_TEXT,
} from './home-landing.copy.mjs'

/**
 * 落地块 CSS 文本（单一事实源在 copy 模块，这里只做转发，导出是为了让门禁能独立断言）。
 * @type {string}
 */
export const LANDING_STYLE_TEXT = LANDING_CSS

/**
 * 落地块根元素 id 的单一事实源。
 * @type {string}
 */
export const ROOT_ID = LANDING_ROOT_ID

/**
 * 注入位置（`before-root` / `after-root`，见 copy 模块的 LANDING_PLACEMENT 注释）。
 * @type {string}
 */
export const PLACEMENT = LANDING_PLACEMENT

/**
 * 从 `#root` 容器里剥掉全部内容，得到「应用挂载前」的骨架文本。
 *
 * 用途有二，都是**防假通过**：
 *   ① 门禁 H1 用它证明落地块在 `#root` **之外** —— 若只查「index.html 含锚点」，
 *      一块被 React 清掉的、恰好还留在源码里的标记也能通过；
 *   ② 定位注入点：真正要插入的位置是 `<div id="root">` 这个**开标签之前**，
 *      而开标签本身在 React 挂载后仍然存在（React 只清它的子节点）。
 *
 * @param {string} html 完整 index.html
 * @returns {string} 剥掉 `<div id="root">…</div>` 整段（含换行）后的文本
 */
export function stripRootContainer(html) {
  return String(html).replace(/<div id="root">[\s\S]*?<\/div>/g, ' ')
}

/**
 * 单个词库卡片。
 *
 * ⛔ **必须是 `<a href>`**（本轮成败关键）：词库卡片是给 Google 爬到的**入站链接**载体，
 *   纯文字展示对本问题零收益。
 * ⛔ **href 来自 canonicalBankUrl()**（⛔ 不带 `.html`，且不在本文件另造 URL 构造逻辑）——
 *   与 bank 页自己的 canonical、sitemap 的 `<loc>`、门禁判据 5/13 **四处同源**。
 * ⛔ **词数是参数，不写死**：由调用方从 `content/vocabulary/<id>/words.json` 现算传入。
 *   （项目历史上写过死的两处已腐坏成 18/9388。）
 *
 * @param {{packageId: string, title: string, wordCount: number}} row 词库行
 * @param {string} origin 站点绝对 origin
 * @returns {string} HTML 片段
 */
export function renderBankCard(row, origin) {
  const packageId = String(row?.packageId ?? '').trim()
  const title = String(row?.title ?? '').trim()
  const count = Number(row?.wordCount ?? 0)
  const href = canonicalBankUrl(origin, packageId)
  return `<a class="gh-card" href="${escapeHtml(href)}"><span class="gh-card-title">${escapeHtml(title)}</span><span class="gh-card-count">${count} 词</span><span class="gh-card-id">${escapeHtml(packageId)}</span></a>`
}

/**
 * 渲染整个落地块（纯函数，无副作用、无写盘）。
 *
 * @param {object} input
 * @param {Array<{packageId:string,title:string,wordCount:number}>} input.bankRows 13 个词库行（词数现算）
 * @param {string} input.origin 站点绝对 origin（如 https://geek-typing.pages.dev）
 * @param {number} [input.totalWords] 全部词条总数（现算，用于 Hero 与 banks 标题）
 * @returns {string} 落地块 HTML（含首尾标记注释）
 */
export function renderHomeLandingBlock({ bankRows, origin, totalWords } = {}) {
  const rows = Array.isArray(bankRows) ? bankRows : []
  const total = Number.isFinite(totalWords) ? Number(totalWords) : rows.reduce((a, r) => a + (Number(r?.wordCount) || 0), 0)
  const totalPackages = rows.length

  /** {total}/{totalWords} 占位替换 —— 唯一允许数字进入文案的位置，且数字是参数 */
  const fill = (s) =>
    String(s).replace(/\{total\}/g, String(totalPackages)).replace(/\{totalWords\}/g, String(total))

  const renderCtas = (ctas) =>
    `<div class="gh-cta">${(ctas ?? [])
      .map(
        (c) =>
          `<a class="gh-btn${c.primary ? ' gh-btn-primary' : ''}" href="${escapeHtml(c.href)}">${escapeHtml(c.text)}</a>`,
      )
      .join('')}</div>`

  const sections = SECTIONS.map((sec) => {
    const parts = [`<section class="gh-sec" id="${escapeHtml(sec.id)}">`]

    // 标题：hero 用 h1（页面唯一主标题），其余用 h2
    const tag = sec.id === 'gh-hero' ? 'h1' : 'h2'
    parts.push(`<${tag} class="${tag === 'h1' ? 'gh-h1' : 'gh-h2'}">${escapeHtml(sec.heading)}</${tag}>`)

    for (const p of sec.body ?? []) parts.push(`<p class="gh-p">${escapeHtml(fill(p))}</p>`)

    // Hero 徽标条：可从代码验证的事实标签，⛔ 零数字（⛔ 不是「用户怎么说」，也不是战绩）
    if (sec.chips) {
      parts.push(
        `<ul class="gh-chips">${sec.chips.map((c) => `<li class="gh-chip">${escapeHtml(c)}</li>`).join('')}</ul>`,
      )
    }

    // gh-demo：产品界面示意图（**纯内联 SVG，零 <script>、零外部资源**）
    //   ⚠️ figure.svg 是**受信任的静态常量**（来自 home-landing.copy.mjs，不是用户输入），
    //   所以这里刻意不过 escapeHtml ——  escapeHtml 会把 `<rect>`/`<text>` 变成字面文本，示意图就没了。
    //   门禁判据 4（<script 计数 = 0）与判据 9（无 data-testid）保证它带不进这两样东西。
    if (sec.figure) {
      parts.push(
        `<div class="gh-demo"><figure class="gh-shot">${sec.figure.svg}` +
          `<figcaption class="gh-shot-cap">${escapeHtml(sec.figure.caption)}</figcaption></figure>` +
          (sec.key
            ? `<ul class="gh-key">${sec.key
                .map(
                  (k) =>
                    `<li class="gh-key-item"><span class="gh-key-k">${escapeHtml(k.k)}</span><span class="gh-key-v">${escapeHtml(k.v)}</span></li>`,
                )
                .join('')}</ul>`
            : '') +
          `</div>`,
      )
    }

    if (sec.cards) {
      parts.push(
        `<div class="gh-grid">${sec.cards.map((c) => `<div class="gh-card"><span class="gh-card-title">${escapeHtml(c.title)}</span><span class="gh-card-count">${escapeHtml(c.text)}</span></div>`).join('')}</div>`,
      )
    }

    // ⭐ 词库区块：13 个**真链接**卡片（不是文字展示）
    if (sec.id === 'gh-banks') {
      parts.push(
        `<div class="gh-grid" id="gh-banks-grid">${rows.map((r) => renderBankCard(r, origin)).join('')}</div>`,
      )
      parts.push(
        `<p class="gh-note">以上 ${totalPackages} 个词库共 ${total} 条词条，每个数字都取自本站内容包 content/vocabulary/&lt;包&gt;/words.json 的真实长度。</p>`,
      )
    }

    if (sec.comparisons) {
      parts.push(
        `<ul class="gh-cmp">${sec.comparisons
          .map(
            (c) =>
              `<li class="gh-cmp-item"><span class="gh-cmp-kind">${escapeHtml(c.kind)}</span><span class="gh-cmp-arrow">→</span><span class="gh-cmp-res">${escapeHtml(c.result)}</span></li>`,
          )
          .join('')}</ul>`,
      )
    }

    // gh-facts：可从代码验证的事实陈述（⛔ 不是「用户怎么说」，⛔ 不含任何评价）
    if (sec.facts) {
      parts.push(
        sec.facts
          .map(
            (f) =>
              `<p class="gh-fact"><span class="gh-fact-q">${escapeHtml(f.q)}</span><span class="gh-fact-a">${escapeHtml(f.a)}</span></p>`,
          )
          .join(''),
      )
    }

    // gh-faq：原生 `<details>`，零 JS 交互
    if (sec.faq) {
      parts.push(
        sec.faq
          .map(
            (f) =>
              `<details class="gh-faq-item"><summary class="gh-faq-q">${escapeHtml(f.q)}</summary><p class="gh-faq-a">${escapeHtml(f.a)}</p></details>`,
          )
          .join(''),
      )
    }

    if (sec.ctas) parts.push(renderCtas(sec.ctas))

    parts.push('</section>')
    return parts.join('')
  }).join('\n')

  return [
    LANDING_START_COMMENT,
    `<div id="${LANDING_ROOT_ID}">`,
    // 跳过介绍链接（落地块放 #root 之前的代价缓解，指向应用锚点）
    `<div class="gh-wrap"><a class="gh-skip" href="${escapeHtml(APP_ANCHOR)}">${escapeHtml(SKIP_LINK_TEXT)}</a>`,
    `<style>${LANDING_CSS}</style>`,
    sections,
    `<p class="gh-foot">${escapeHtml(LANDING_FOOTER)}</p>`,
    '</div>',
    LANDING_END_COMMENT,
  ].join('\n')
}

/**
 * 把落地块注入 index.html（**幂等**：已注入过则原地替换，不重复堆叠）。
 *
 * 注入点：`<div id="root">` 开标签之前（PLACEMENT='before-root'）或
 *   `</body>` 之前（'after-root'）。两种都在 `#root` **之外**。
 *
 * ⚠️ **`<div id="root"></div>` 必须逐字保留**：`tests/preview-server.mjs:116` 用
 *   `body.includes('<div id="root">')` 判活 —— 给它加任何属性或改写都会让预览服务器误判。
 *   本函数只做「在它前面插入字符串」，从不改写它。
 *
 * @param {string} html 原 index.html
 * @param {string} block 落地块 HTML（renderHomeLandingBlock 的产物）
 * @param {string} [placement] before-root | after-root
 * @returns {string} 新的 index.html
 */
export function injectIntoIndexHtml(html, block, placement = LANDING_PLACEMENT) {
  let out = String(html)

  // 幂等：先剥掉可能已存在的旧块（含标记注释），避免重复注入堆叠
  const startIdx = out.indexOf(LANDING_START_COMMENT)
  if (startIdx !== -1) {
    const endIdx = out.indexOf(LANDING_END_COMMENT, startIdx)
    if (endIdx !== -1) {
      out = out.slice(0, startIdx) + out.slice(endIdx + LANDING_END_COMMENT.length)
    }
  }

  if (placement === 'after-root') {
    // `</body>` 之前 —— 仍在 #root 之外（React 只清 #root 的子节点）
    if (!/<\/body>/i.test(out)) throw new Error('injectIntoIndexHtml: index.html 里找不到 </body>')
    return out.replace(/<\/body>/i, `${block}\n  </body>`)
  }

  // before-root（默认）：紧贴 <div id="root"> 开标签之前插入
  const anchor = '<div id="root">'
  const at = out.indexOf(anchor)
  if (at === -1) throw new Error(`injectIntoIndexHtml: index.html 里找不到 ${anchor}（逐字必须保留该标签）`)
  return out.slice(0, at) + block + '\n    ' + out.slice(at)
}