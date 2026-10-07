#!/usr/bin/env node
/**
 * 首页落地块 · 真实渲染视觉自证（3 视口）
 *
 * 目的：门禁只能证明「结构合规」，证明不了「好看 / 没布局错位」。所以这里用本机
 *   Chrome 真渲染 dist/index.html，在 375 / 768 / 1440 三个宽度下各截一张全页图，
 *   并**实测**横向溢出、网格折行、CTA 可见性、SVG 是否真的画出来了（不是空白/裂图）。
 *
 * ⛔ 截图目录在仓库外（D:\work\_ops\landing-visual），保持 git working tree clean。
 * ⛔ 不 spawn 子进程起静态服务：直接用 file:// 打开 dist/index.html（落地块是纯静态
 *   内联 HTML，file:// 足以验证它的布局与渲染；只有 React 应用本体需要 HTTP）。
 */
import { chromium } from 'playwright-core'
import { mkdirSync, existsSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DIST_INDEX = join(ROOT, 'dist', 'index.html')
const OUT_DIR = 'D:\\work\\_ops\\landing-visual'

const VIEWPORTS = [
  { name: '375-mobile', width: 375, height: 900 },
  { name: '768-tablet', width: 768, height: 1000 },
  { name: '1440-desktop', width: 1440, height: 1000 },
]

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean)
  return candidates.find((p) => existsSync(p)) ?? null
}

if (!existsSync(DIST_INDEX)) {
  console.error(`[visual] ${DIST_INDEX} 不存在：先 npm run build`)
  process.exit(2)
}
const executablePath = findChrome()
if (!executablePath) {
  console.error('[visual] 找不到 Chrome，请设置 CHROME_PATH')
  process.exit(2)
}
mkdirSync(OUT_DIR, { recursive: true })

const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] })
const report = []

for (const vp of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } })
  await page.goto(pathToFileURL(DIST_INDEX).href, { waitUntil: 'load' })

  const m = await page.evaluate(() => {
    const el = document.querySelector('#seo-home')
    const doc = document.documentElement
    // SVG 是否真的画出了东西：取几个关键图元的 getBoundingClientRect + getComputedStyle
    const svg = document.querySelector('#seo-home .gh-shot-svg')
    const svgBox = svg ? svg.getBoundingClientRect() : null
    const greenTexts = [...document.querySelectorAll('#seo-home .gh-shot-svg text')]
      .filter((t) => (t.getAttribute('fill') || '').toLowerCase() === '#4ade80')
    const redTexts = [...document.querySelectorAll('#seo-home .gh-shot-svg text')]
      .filter((t) => (t.getAttribute('fill') || '').toLowerCase() === '#f87171')
    const caret = svg ? svg.querySelector('rect[fill="#38bdf8"]') : null
    const caretBox = caret ? caret.getBoundingClientRect() : null
    const progress = svg ? svg.querySelector('rect[fill="url(#ghShotGrad)"]') : null

    // 网格实际列数：读 computed 的 grid-template-columns（而非量top ——
    //   卡片高度不等时top 法不可靠，computed 是声明值，与断点一一对应）
    const grid = document.querySelector('#gh-banks-grid')
    const cards = grid ? [...grid.querySelectorAll('a.gh-card')] : []
    const bankCols = grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0

    const whyGrid = document.querySelector('#gh-why .gh-grid')
    const whyCols = whyGrid ? getComputedStyle(whyGrid).gridTemplateColumns.split(' ').length : 0

    const demo = document.querySelector('#gh-demo .gh-demo')
    const demoCols = demo ? getComputedStyle(demo).gridTemplateColumns.split(' ').length : 0

    const cta = document.querySelector('#gh-hero .gh-btn-primary')
    const ctaBox = cta ? cta.getBoundingClientRect() : null
    const ctaStyle = cta ? getComputedStyle(cta) : null

    // 文字重叠检测：同一 section 内相邻块级子元素的矩形是否相交
    const overlaps = []
    for (const sec of document.querySelectorAll('#seo-home .gh-sec')) {
      const kids = [...sec.children].filter((n) => n.tagName !== 'STYLE')
      for (let i = 0; i < kids.length; i++) {
        for (let j = i + 1; j < kids.length; j++) {
          const a = kids[i].getBoundingClientRect()
          const b = kids[j].getBoundingClientRect()
          if (a.width === 0 || b.width === 0) continue
          const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left)
          const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
          if (ox > 2 && oy > 2) {
            overlaps.push(`${sec.id}: ${kids[i].className || kids[i].tagName} × ${kids[j].className || kids[j].tagName} (${ox.toFixed(0)}×${oy.toFixed(0)}px)`)
          }
        }
      }
    }

    return {
      scrollWidth: doc.scrollWidth,
      innerWidth: window.innerWidth,
      overflow: doc.scrollWidth - window.innerWidth,
      blockWidth: el ? Math.round(el.getBoundingClientRect().width) : null,
      sectionIds: [...document.querySelectorAll('#seo-home section.gh-sec')].map((s) => s.id),
      scriptCount: el ? el.querySelectorAll('script').length : -1,
      bankLinks: el ? el.querySelectorAll('a[href*="/pages/bank/"]').length : -1,
      bankCards: cards.length,
      bankCols,
      whyCols,
      demoCols,
      svg: {
        present: !!svg,
        w: svgBox ? Math.round(svgBox.width) : 0,
        h: svgBox ? Math.round(svgBox.height) : 0,
        rendered: svgBox ? svgBox.width > 20 && svgBox.height > 20 : false,
        greenChars: greenTexts.length,
        redChars: redTexts.length,
        caretW: caretBox ? Math.round(caretBox.width) : 0,
        caretH: caretBox ? Math.round(caretBox.height) : 0,
        progressW: progress ? Math.round(progress.getBoundingClientRect().width) : 0,
        viewBox: svg ? svg.getAttribute('viewBox') : null,
        preserveAR: svg ? svg.getAttribute('preserveAspectRatio') : null,
      },
      cta: {
        present: !!cta,
        w: ctaBox ? Math.round(ctaBox.width) : 0,
        h: ctaBox ? Math.round(ctaBox.height) : 0,
        visible: ctaBox ? ctaBox.width > 40 && ctaBox.height > 20 : false,
        bgImage: ctaStyle ? ctaStyle.backgroundImage.slice(0, 60) : '',
        shadow: ctaStyle ? ctaStyle.boxShadow.slice(0, 60) : '',
      },
      overlaps,
    }
  })

  const file = join(OUT_DIR, `landing-${vp.name}.png`)
  await page.screenshot({ path: file, fullPage: true })
  report.push({ viewport: `${vp.width}px`, file, ...m })
  console.log(
    `✅ ${vp.width}px → ${file}\n` +
      `   横向溢出=${m.overflow}px（scrollWidth ${m.scrollWidth} / innerWidth ${m.innerWidth}）\n` +
      `   词库网格=${m.bankCols}列/${m.bankCards}卡能力卡=${m.whyCols}列 展示区=${m.demoCols}栏\n` +
      `   SVG: ${m.svg.w}×${m.svg.h}px rendered=${m.svg.rendered} 绿字${m.svg.greenChars} 红字${m.svg.redChars} 光标${m.svg.caretW}×${m.svg.caretH} 进度条${m.svg.progressW}px\n` +
      `   CTA: visible=${m.cta.visible} ${m.cta.w}×${m.cta.h} bg=${m.cta.bgImage}...\n` +
      `   块内<script>=${m.scriptCount} 词库链接=${m.bankLinks} 区块=[${m.sectionIds.join(',')}]\n` +
      `   文字重叠=${m.overlaps.length} 处${m.overlaps.length ? ' → ' + m.overlaps.join(' | ') : ''}`,
  )
  await page.close()
}

await browser.close()

//汇总判据（任一不满足即 exit 1 —— 「截图看起来 ok」不算通过，要有数值）
const problems = []
for (const r of report) {
  if (r.overflow > 0) problems.push(`${r.viewport}: 横向溢出 ${r.overflow}px`)
  if (!r.svg.rendered) problems.push(`${r.viewport}: SVG 未渲染`)
  if (r.svg.greenChars < 3) problems.push(`${r.viewport}: SVG 绿色字符不足（${r.svg.greenChars}）—— 看不出「敲对变绿」`)
  if (r.svg.redChars < 1) problems.push(`${r.viewport}: SVG 无红色字符 —— 看不出「敲错标红」`)
  if (r.svg.caretW < 1 || r.svg.caretH < 1) problems.push(`${r.viewport}: SVG 光标未渲染`)
  if (r.svg.progressW < 10) problems.push(`${r.viewport}: SVG 进度条未渲染`)
  if (!r.cta.visible) problems.push(`${r.viewport}: CTA 不可见`)
  if (!/gradient/.test(r.cta.bgImage)) problems.push(`${r.viewport}: CTA 无渐变`)
  if (!/rgb/.test(r.cta.shadow)) problems.push(`${r.viewport}: CTA 无阴影`)
  if (r.bankLinks !== 13) problems.push(`${r.viewport}: 词库链接 ${r.bankLinks} ≠ 13`)
  if (r.scriptCount !== 0) problems.push(`${r.viewport}: 块内 <script> = ${r.scriptCount}`)
  if (r.overlaps.length > 0) problems.push(`${r.viewport}: 文字重叠 ${r.overlaps.join(' | ')}`)
  // 窄屏必须单列、宽屏必须多列（证明断点真的生效，而不是碰巧没溢出）
  const w = Number(r.viewport.replace('px', ''))
  if (w === 375 && (r.bankCols !== 1 || r.whyCols !== 1 || r.demoCols !== 1)) {
    problems.push(`375px 应全单列，实测 词库${r.bankCols}/能力${r.whyCols}/展示${r.demoCols}`)
  }
  if (w === 1440 && (r.bankCols < 3 || r.whyCols < 3 || r.demoCols < 2)) {
    problems.push(`1440px 应多列，实测 词库${r.bankCols}/能力${r.whyCols}/展示${r.demoCols}`)
  }
  if (w === 768 && (r.bankCols < 2 || r.whyCols < 2)) {
    problems.push(`768px 应 2 列，实测 词库${r.bankCols}/能力${r.whyCols}`)
  }
}

console.log(`\n截图目录：${OUT_DIR}`)
if (problems.length > 0) {
  console.error('\n❌ 视觉自证未通过：')
  for (const p of problems) console.error('   · ' + p)
  process.exit(1)
}
console.log('✅ 视觉自证通过：3 视口零横向溢出、SVG 真实渲染（绿字/红字/光标/进度条齐全）、CTA 可见且带渐变与阴影、断点按预期降列、无文字重叠')
