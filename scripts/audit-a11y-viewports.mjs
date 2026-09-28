/**
 * R6 · UI-A11y 五视口验收（S9 自动层）
 *
 * 用法：
 *   npm run audit:a11y                  # 打本地 preview（端口 4181，自举）
 *   A11Y_BASE=http://127.0.0.1:5173 node scripts/audit-a11y-viewports.mjs
 *   CHROME_PATH=<chrome.exe>            # 手动指定浏览器
 *
 * 判据（每个 视口 × 页签）：
 *   A. 无横向溢出（documentElement.scrollWidth <= innerWidth + 1 + 越界元素明细）
 *   B. 文本对比度达标（自实现 WCAG 2.1 相对亮度 / 对比比；普通 ≥4.5，大文本 ≥3.0）
 *   C. 无 console error / page error
 * 跨视口（每个视口一次）：
 *   D. 明暗主题切换后底色确实变化，且切换后当前页签对比度仍达标
 *   E. 移动端命令面板可达且输入框 font-size ≥ 16px（防 iOS 聚焦缩放）
 *
 * 防假通过：每个判据配「必须判红的合成对照组」，在【对照组】小节单独打印。
 * 任何一个对照组「该红没红」⇒ 整个脚本 exit 1（检测器坏了比被测对象坏了更严重）。
 *
 * 结论三态：FAIL > UNDECIDED > PASS。有 FAIL 或有 UNDECIDED ⇒ exit 1。
 *
 * 端口：4181（e2e=4173、offline-audit=4174、4180 亦已被占用，必须错开）。
 */
import { chromium } from 'playwright-core'
import { existsSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensurePreviewServer, stopPreview } from '../tests/preview-server.mjs'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const LOCAL_PORT = 4181
const BASE = process.env.A11Y_BASE ?? `http://127.0.0.1:${LOCAL_PORT}`
const NAV_TIMEOUT = 30000

const SHOT_DIR = join(ROOT, 'docs', 'audit-package', 'screenshots', 'a11y')
const REPORT_PATH = join(ROOT, 'docs', 'audit-package', '_generated', 'a11y-viewport-report.json')

/** 阈值集中在此：反向验证（把阈值改坏）只需改这里 */
const THRESHOLDS = {
  contrastNormal: 4.5,
  contrastLarge: 3.0,
  largeTextPx: 24,
  largeBoldPx: 18.66,
  largeBoldWeight: 700,
  maxTextElements: 300,
  overflowTolerancePx: 1,
  mobileInputMinPx: 16,
}

const VIEWPORTS = [
  { id: 'desktop-1440', label: 'desktop 大', width: 1440, height: 900, mobile: false },
  { id: 'desktop-1280', label: 'desktop', width: 1280, height: 800, mobile: false },
  { id: 'tablet-1024', label: 'tablet', width: 1024, height: 768, mobile: false },
  { id: 'mobile-390', label: 'mobile iPhone 12', width: 390, height: 844, mobile: true },
  { id: 'mobile-412', label: 'mobile Android', width: 412, height: 915, mobile: true },
]

const TABS = ['home', 'typing', 'memorize', 'review', 'progress']

/** src/lib/theme.ts 的 THEMES —— 三个主题，其中只有 ink 是浅色（root: bg-[#f5f3ec]） */
const THEMES = [
  { id: 'matrix', label: '黑客荧光', light: false },
  { id: 'ide', label: '专注 IDE', light: false },
  { id: 'ink', label: '墨水屏', light: true },
]
const LIGHT_THEME_ID = 'ink'
const DEFAULT_THEME_ID = 'matrix'

/* ---------------- 浏览器探测（与 tests/e2e.mjs findChrome 同顺序） ---------------- */
function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ]
  const agents = join(process.env.USERPROFILE ?? '', '.agent-browser', 'browsers')
  if (existsSync(agents)) {
    for (const dir of readdirSync(agents)) {
      const exe = join(agents, dir, 'chrome.exe')
      if (existsSync(exe)) candidates.unshift(exe)
    }
  }
  const pwRoot = process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(process.env.HOME ?? '', '.cache', 'ms-playwright')
  if (existsSync(pwRoot)) {
    for (const dir of readdirSync(pwRoot)) {
      if (!dir.startsWith('chromium')) continue
      const exe = join(pwRoot, dir, 'chrome-linux', 'chrome')
      if (existsSync(exe)) candidates.unshift(exe)
    }
  }
  return candidates.find((p) => existsSync(p))
}

/* ---------------- 结果收集（三态） ---------------- */
const results = []
let failCount = 0
let undecidedCount = 0
let controlBrokenCount = 0

function push(name, status, detail = '') {
  results.push({ name, status, detail })
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️'
  console.log(`  ${icon} ${name}${detail ? ` — ${detail}` : ''}`)
  if (status === 'FAIL') failCount++
  if (status === 'UNDECIDED') undecidedCount++
}

/** 与 tests/e2e.mjs 的 check(name, cond, detail) 打印风格保持一致 */
const check = (name, ok, detail = '') => push(name, ok ? 'PASS' : 'FAIL', detail)
const undecided = (name, detail = '') => push(name, 'UNDECIDED', detail)

/**
 * 合成对照组专用登记：**判红不算被测对象的失败**，只有「该红没红」才算。
 * 若误用 check()，对照组正确判红会把 failCount 顶上去、让脚本永远 exit 1 —— 这正是
 * 必须把对照组与正式判据分开计数的原因。
 */
function control(name, didFail, detail = '') {
  results.push({ name, status: didFail ? 'CONTROL_RED' : 'CONTROL_BROKEN', detail, control: true })
  console.log(`  ${didFail ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!didFail) controlBrokenCount++
}

/* ---------------- 页内探针：整段注入 window.__a11y，供后续 evaluate 复用 ---------------- */
/** 以 addInitScript 注入页内；thresholds 由 Node 侧显式传入（页内没有闭包） */
function installA11yHelpers(THRESHOLDS) {
  /** 'rgb(1, 2, 3)' / 'rgba(1, 2, 3, 0.5)' → { r,g,b,a }；transparent / 其他 → null */
  const parseColor = (str) => {
    if (!str) return null
    const s = String(str).trim()
    if (!s || s === 'transparent' || s === 'none') return null
    const m = s.match(/^rgba?\(([^)]+)\)$/i)
    if (!m) return null
    const parts = m[1].split(',').map((p) => parseFloat(p.trim()))
    if (parts.length < 3) return null
    const [r, g, b] = parts
    if ([r, g, b].some((v) => !Number.isFinite(v))) return null
    const a = parts.length > 3 && Number.isFinite(parts[3]) ? parts[3] : 1
    return { r, g, b, a }
  }

  const srgb = (v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  const luminance = (c) => 0.2126 * srgb(c.r) + 0.7152 * srgb(c.g) + 0.0722 * srgb(c.b)
  const contrastRatio = (a, b) => {
    const la = luminance(a)
    const lb = luminance(b)
    const hi = Math.max(la, lb)
    const lo = Math.min(la, lb)
    return (hi + 0.05) / (lo + 0.05)
  }

  /** 累积不透明度（祖先链相乘） */
  const effOpacity = (el) => {
    let o = 1
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const v = parseFloat(getComputedStyle(n).opacity)
      if (Number.isFinite(v)) o *= v
    }
    return o
  }

  /**
   * 有效背景色：向上遍历祖先收集所有非 transparent 背景，再由外向内做 alpha 合成。
   * （比「取第一个非透明背景」更准：本项目卡片底色普遍是半透明的 bg-slate-900/60，
   *   直接拿它当不透明底色会算出错的对比度。）
   */
  const effBg = (el) => {
    const stack = []
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const c = parseColor(getComputedStyle(n).backgroundColor)
      if (c && c.a > 0) stack.push(c)
    }
    let base = { r: 255, g: 255, b: 255 } // 浏览器画布底色
    for (let i = stack.length - 1; i >= 0; i--) {
      const t = stack[i]
      base = {
        r: t.r * t.a + base.r * (1 - t.a),
        g: t.g * t.a + base.g * (1 - t.a),
        b: t.b * t.a + base.b * (1 - t.a),
      }
    }
    return base
  }

  const selectorOf = (el) => {
    const parts = []
    let n = el
    for (let i = 0; n && n.nodeType === 1 && i < 3; i++) {
      let s = n.tagName.toLowerCase()
      if (n.id) {
        parts.unshift(s + '#' + n.id)
        break
      }
      const cls = (n.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 2)
      if (cls.length) s += '.' + cls.join('.')
      const testid = n.getAttribute('data-testid')
      if (testid) s += '[data-testid="' + testid + '"]'
      parts.unshift(s)
      n = n.parentElement
    }
    return parts.join(' > ')
  }

  const isRendered = (el) => {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse') return false
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) return false
    if (effOpacity(el) < 0.05) return false
    return true
  }

  /** 可见文本元素：自身有非空直接子文本节点（避免容器被重复计入） */
  const visibleTextElements = (limit) => {
    const out = []
    for (const el of document.querySelectorAll('body *')) {
      if (out.length >= limit) break
      const tag = el.tagName.toLowerCase()
      if (tag === 'script' || tag === 'style' || tag === 'noscript' || tag === 'option' || tag === 'canvas') continue
      if (el.closest('svg')) continue
      if (el.getAttribute('aria-hidden') === 'true') continue
      if (!isRendered(el)) continue
      let text = ''
      for (const n of el.childNodes) if (n.nodeType === 3) text += n.textContent
      if (!text.trim()) continue
      out.push(el)
    }
    return out
  }

  /** 被 overflow-x 裁剪或 fixed 定位的元素不会造成文档横向溢出，跳过 */
  const isContainedHorizontally = (el) => {
    const cs = getComputedStyle(el)
    if (cs.position === 'fixed') return true
    for (let n = el.parentElement; n && n.nodeType === 1; n = n.parentElement) {
      const ox = getComputedStyle(n).overflowX
      if (ox !== 'visible') return true
    }
    return false
  }

  const scanOverflow = () => {
    const vw = window.innerWidth
    const docW = document.documentElement.scrollWidth
    const offenders = []
    for (const el of document.querySelectorAll('body *')) {
      if (offenders.length >= 20) break
      if (!isRendered(el)) continue
      if (isContainedHorizontally(el)) continue
      const r = el.getBoundingClientRect()
      if (r.right > vw + THRESHOLDS.overflowTolerancePx) {
        offenders.push({
          selector: selectorOf(el),
          right: Math.round(r.right * 10) / 10,
          width: Math.round(r.width * 10) / 10,
          overflowBy: Math.round((r.right - vw) * 10) / 10,
        })
      }
    }
    return { viewportWidth: vw, documentScrollWidth: docW, offenders }
  }

  /**
   * WCAG 1.4.3 明确豁免「非激活的用户界面组件」—— 例如背单词未翻面前的三键
   * （Memorize.tsx:430 的 `opacity-40 pointer-events-none`），此时它们点不动也没有
   * 对比度要求。不豁免会把「禁用态」误报成正文缺陷。
   */
  const isInactive = (el) => {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      if (n.disabled === true) return true
      if (n.getAttribute('aria-disabled') === 'true') return true
      if (getComputedStyle(n).pointerEvents === 'none') return true
    }
    return false
  }

  const scanContrast = (limit) => {
    const els = visibleTextElements(limit)
    const violations = []
    let skippedInactive = 0
    for (const el of els) {
      if (isInactive(el)) {
        skippedInactive++
        continue
      }
      const cs = getComputedStyle(el)
      const fontSize = parseFloat(cs.fontSize)
      const weight = parseInt(cs.fontWeight, 10) || 400
      const isLarge =
        fontSize >= THRESHOLDS.largeTextPx ||
        (fontSize >= THRESHOLDS.largeBoldPx && weight >= THRESHOLDS.largeBoldWeight)
      const required = isLarge ? THRESHOLDS.contrastLarge : THRESHOLDS.contrastNormal

      const bg = effBg(el)
      const fg = parseColor(cs.color) ?? { r: 0, g: 0, b: 0, a: 1 }
      const opacity = effOpacity(el)
      const alpha = fg.a * opacity
      const cmp = {
        r: fg.r * alpha + bg.r * (1 - alpha),
        g: fg.g * alpha + bg.g * (1 - alpha),
        b: fg.b * alpha + bg.b * (1 - alpha),
      }
      const ratio = contrastRatio(cmp, bg)
      if (ratio < required) {
        let text = ''
        for (const n of el.childNodes) if (n.nodeType === 3) text += n.textContent
        violations.push({
          selector: selectorOf(el),
          text: text.trim().slice(0, 40),
          ratio: Math.round(ratio * 100) / 100,
          required,
          fontSize: Math.round(fontSize * 10) / 10,
          fontWeight: weight,
          large: isLarge,
          opacity: Math.round(opacity * 1000) / 1000,
          color: cs.color,
          background: 'rgb(' + Math.round(bg.r) + ', ' + Math.round(bg.g) + ', ' + Math.round(bg.b) + ')',
        })
      }
    }
    return { scanned: els.length, skippedInactive, violations }
  }

  /** 根容器底色：src/App.tsx:182 的 div.min-h-screen 承载着 theme.root */
  const probeBg = () => {
    const bodyBg = getComputedStyle(document.body).backgroundColor
    const rootEl = document.querySelector('#root > div') ?? document.querySelector('#root')
    const rootBg = rootEl ? getComputedStyle(rootEl).backgroundColor : null
    return { body: bodyBg, root: rootBg, rootSelector: rootEl ? selectorOf(rootEl) : null }
  }

  /** 合成对照组注入/移除 */
  const injectControl = (kind) => {
    const remove = () => {
      const old = document.getElementById('a11y-control')
      if (old) old.remove()
    }
    remove()
    const wrap = document.createElement('div')
    wrap.id = 'a11y-control'
    if (kind === 'overflow') {
      // 200vw 的实块，插到 body 首个子节点 ⇒ 必然把 documentElement.scrollWidth 撑宽
      wrap.style.cssText = 'width:200vw;height:40px;background:#ff00ff;'
    } else if (kind === 'contrast') {
      // #777777 字 + #ffffff 底 ⇒ 对比度 ≈4.48 < 4.5，必然判红
      const span = document.createElement('span')
      span.textContent = 'a11y-control-bad-contrast'
      span.style.cssText = 'color:#777777;background:#ffffff;font-size:14px;font-weight:400;'
      wrap.appendChild(span)
      wrap.style.cssText = 'position:static;width:auto;height:auto;'
    }
    document.body.insertBefore(wrap, document.body.firstChild)
    return true
  }
  const removeControl = () => {
    const old = document.getElementById('a11y-control')
    if (old) old.remove()
    return true
  }

  window.__a11y = {
    parseColor,
    contrastRatio,
    scanOverflow,
    scanContrast,
    probeBg,
    injectControl,
    removeControl,
    thresholds: THRESHOLDS,
  }
}

/* ---------------- 页内动作 ---------------- */
const waitForTab = async (page, tabId) => {
  const tab = page.locator(`[data-testid="tab-${tabId}"]`)
  await tab.waitFor({ state: 'visible', timeout: NAV_TIMEOUT })
  await tab.click({ timeout: NAV_TIMEOUT })
  try {
    await page.waitForSelector(`[data-testid="tab-${tabId}"][aria-selected="true"]`, { timeout: 8000 })
  } catch {
    /* 交给上层按 UNDECIDED 处理 */
  }
  await page.waitForTimeout(350) // 主题 transition-colors duration-300 + React 分帧渲染
}

/** 打开设置下拉并点选主题（THEME_LIST 顺序即下拉里主题按钮的顺序） */
async function pickTheme(page, themeId) {
  const theme = THEMES.find((t) => t.id === themeId)
  await page.click('[data-testid="dropdown-settings"]')
  await page.waitForTimeout(250)
  const idx = await page.evaluate((label) => {
    const btn = document.querySelector('[data-testid="dropdown-settings"]')
    const panel = btn?.parentElement?.querySelector(':scope > div')
    if (!panel) return -1
    const bs = [...panel.querySelectorAll('button')]
    return bs.findIndex((b) => (b.textContent || '').trim().includes(label))
  }, theme.label)
  if (idx < 0) return { ok: false, reason: `下拉里找不到主题按钮「${theme.label}」` }
  const panelButtons = page
    .locator('[data-testid="dropdown-settings"]')
    .locator('xpath=..')
    .locator('xpath=./div[1]')
    .locator('button')
  await panelButtons.nth(idx).click({ timeout: 8000 })
  await page.waitForTimeout(600) // 等 transition-colors duration-300 走完
  return { ok: true }
}

const realErrors = (list) => list.filter((e) => !/favicon/i.test(e))

/* ---------------- 主流程 ---------------- */
async function run(browser) {
  const report = {
    meta: {
      generatedAt: new Date().toISOString(),
      base: BASE,
      thresholds: THRESHOLDS,
      viewports: VIEWPORTS.map(({ id, label, width, height }) => ({ id, label, width, height })),
      tabs: TABS,
      themes: THEMES,
      chrome: browser.version?.() ?? null,
    },
    combos: [],
    crossViewport: [],
    controlGroups: [],
  }

  for (const vp of VIEWPORTS) {
    console.log(`\n【视口 ${vp.id}】${vp.width}×${vp.height}（${vp.label}）`)
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
    })
    // 钉死语言与默认主题，消除环境依赖（与 tests/e2e.mjs lockLangZh 同口径：仅在缺失时写入）
    await ctx.addInitScript(() => {
      try {
        if (window.localStorage.getItem('gt.lang') === null) window.localStorage.setItem('gt.lang', 'zh')
        if (window.localStorage.getItem('gt.theme') === null) window.localStorage.setItem('gt.theme', 'matrix')
      } catch {
        /* localStorage 不可用时忽略 */
      }
    })
    await ctx.addInitScript(installA11yHelpers, THRESHOLDS)

    const page = await ctx.newPage()
    const errors = []
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })
    page.on('pageerror', (e) => errors.push('pageerror: ' + (e?.message ?? String(e))))

    await page.goto(BASE, { waitUntil: 'load', timeout: NAV_TIMEOUT })
    await page.waitForSelector('[data-testid="tab-home"]', { state: 'visible', timeout: NAV_TIMEOUT })
    await page.waitForTimeout(500)

    let errCursor = 0
    for (const tabId of TABS) {
      await waitForTab(page, tabId)

      const overflow = await page.evaluate(() => window.__a11y.scanOverflow())
      const docOk = overflow.documentScrollWidth <= overflow.viewportWidth + THRESHOLDS.overflowTolerancePx
      const offenders = overflow.offenders
      const overflowOk = docOk && offenders.length === 0
      const overflowDetail = docOk
        ? offenders.length
          ? `scrollWidth ${overflow.documentScrollWidth} ≤ ${overflow.viewportWidth}，但有 ${offenders.length} 个越界元素：${offenders[0].selector} right=${offenders[0].right}`
          : `scrollWidth ${overflow.documentScrollWidth} ≤ ${overflow.viewportWidth}，无越界元素`
        : `scrollWidth ${overflow.documentScrollWidth} > innerWidth ${overflow.viewportWidth}；越界元素 ${offenders.length} 个${offenders.length ? `：${offenders[0].selector} right=${offenders[0].right}（超出 ${offenders[0].overflowBy}px）` : ''}`
      check(`${vp.id}/${tabId} · A 无横向溢出`, overflowOk, overflowDetail)

      const contrast = await page.evaluate((n) => window.__a11y.scanContrast(n), THRESHOLDS.maxTextElements)
      const vio = contrast.violations
      const scanned = contrast.scanned - contrast.skippedInactive
      check(
        `${vp.id}/${tabId} · B 文本对比度达标`,
        vio.length === 0,
        vio.length === 0
          ? `扫描 ${scanned} 个可见文本元素，全部达标`
          : `${vio.length}/${scanned} 不达标，最低 ${vio[0].ratio}（要求 ${vio[0].required}）@ ${vio[0].selector} "${vio[0].text}" color=${vio[0].color} opacity=${vio[0].opacity} bg=${vio[0].background} font=${vio[0].fontSize}px/${vio[0].fontWeight}`,
      )

      const newErrors = realErrors(errors.slice(errCursor))
      errCursor = errors.length
      check(
        `${vp.id}/${tabId} · C 无 console / page error`,
        newErrors.length === 0,
        newErrors.length === 0 ? '无' : newErrors.slice(0, 2).join(' | '),
      )

      const shotPath = join(SHOT_DIR, `${vp.id}__${tabId}.png`)
      await page.screenshot({ path: shotPath })

      report.combos.push({
        viewport: vp.id,
        tab: tabId,
        overflow: { ...overflow, ok: overflowOk, docOk },
        contrast: {
          scanned,
          skippedInactive: contrast.skippedInactive,
          violationCount: vio.length,
          violations: vio,
        },
        consoleErrors: newErrors,
        screenshot: `docs/audit-package/screenshots/a11y/${vp.id}__${tabId}.png`,
      })
    }

    /* ---- D 明暗主题切换（每视口一次） ---- */
    await waitForTab(page, 'home')
    const bgBefore = await page.evaluate(() => window.__a11y.probeBg())
    const picked = await pickTheme(page, LIGHT_THEME_ID)
    if (!picked.ok) {
      undecided(`${vp.id} · D 明暗主题切换`, picked.reason)
      report.crossViewport.push({ viewport: vp.id, kind: 'theme', status: 'UNDECIDED', detail: picked.reason })
    } else {
      const bgAfter = await page.evaluate(() => window.__a11y.probeBg())
      const changed =
        bgBefore.body !== bgAfter.body || bgBefore.root !== bgAfter.root
      check(
        `${vp.id} · D 主题切换底色确实变化（matrix → ${LIGHT_THEME_ID}）`,
        changed,
        changed
          ? `root ${bgBefore.root} → ${bgAfter.root}`
          : `点了没反应：root 始终 ${bgAfter.root}、body 始终 ${bgAfter.body}`,
      )
      const c2 = await page.evaluate((n) => window.__a11y.scanContrast(n), THRESHOLDS.maxTextElements)
      const scanned2 = c2.scanned - c2.skippedInactive
      check(
        `${vp.id} · D 切换后对比度仍达标`,
        c2.violations.length === 0,
        c2.violations.length === 0
          ? `扫描 ${scanned2} 个，全部达标`
          : `${c2.violations.length}/${scanned2} 不达标，最低 ${c2.violations[0].ratio}（要求 ${c2.violations[0].required}）@ ${c2.violations[0].selector} "${c2.violations[0].text}" color=${c2.violations[0].color} opacity=${c2.violations[0].opacity} bg=${c2.violations[0].background}`,
      )
      const shotPath = join(SHOT_DIR, `${vp.id}__theme-${LIGHT_THEME_ID}.png`)
      await page.screenshot({ path: shotPath })
      report.crossViewport.push({
        viewport: vp.id,
        kind: 'theme',
        from: DEFAULT_THEME_ID,
        to: LIGHT_THEME_ID,
        bgBefore,
        bgAfter,
        changed,
        contrast: {
          scanned: scanned2,
          skippedInactive: c2.skippedInactive,
          violationCount: c2.violations.length,
          violations: c2.violations,
        },
        screenshot: `docs/audit-package/screenshots/a11y/${vp.id}__theme-${LIGHT_THEME_ID}.png`,
      })
      // 还原默认主题，避免污染同视口后续用例
      await pickTheme(page, DEFAULT_THEME_ID)
    }

    /* ---- E 移动端命令面板可达（仅 390 / 412） ---- */
    if (vp.mobile) {
      await page.click('[data-testid="open-cmd"]')
      await page.waitForTimeout(400)
      const paletteCount = await page.locator('[data-testid="command-palette"]').count()
      if (paletteCount === 0) {
        undecided(`${vp.id} · E 移动端命令面板可达`, 'command-palette 未渲染，无法判定')
        report.crossViewport.push({ viewport: vp.id, kind: 'command-palette', status: 'UNDECIDED' })
      } else {
        const fontSize = await page.evaluate(() =>
          parseFloat(getComputedStyle(document.querySelector('[data-testid="command-input"]')).fontSize),
        )
        check(`${vp.id} · E 移动端命令面板输入框 ≥${THRESHOLDS.mobileInputMinPx}px`, fontSize >= THRESHOLDS.mobileInputMinPx, `${fontSize}px`)
        const shotPath = join(SHOT_DIR, `${vp.id}__command-palette.png`)
        await page.screenshot({ path: shotPath })
        report.crossViewport.push({
          viewport: vp.id,
          kind: 'command-palette',
          inputFontSize: fontSize,
          screenshot: `docs/audit-package/screenshots/a11y/${vp.id}__command-palette.png`,
        })
        await page.keyboard.press('Escape')
        await page.waitForTimeout(300)
      }
    }

    /* ---- 合成对照组：检测器必须判红 ---- */
    await page.evaluate(() => window.__a11y.injectControl('overflow'))
    await page.waitForTimeout(150)
    const ctrlOverflow = await page.evaluate(() => window.__a11y.scanOverflow())
    const ctrlOverflowShouldFail =
      ctrlOverflow.documentScrollWidth > ctrlOverflow.viewportWidth + THRESHOLDS.overflowTolerancePx ||
      ctrlOverflow.offenders.length > 0
    control(
      `${vp.id} ·【对照组】注入 200vw 后溢出检测必须判红`,
      ctrlOverflowShouldFail,
      ctrlOverflowShouldFail
        ? `已判红（scrollWidth ${ctrlOverflow.documentScrollWidth} > ${ctrlOverflow.viewportWidth}）`
        : `❗该红没红：scrollWidth 仍为 ${ctrlOverflow.documentScrollWidth}`,
    )
    await page.evaluate(() => window.__a11y.removeControl())
    await page.waitForTimeout(150)
    const afterRemove = await page.evaluate(() => window.__a11y.scanOverflow())
    check(
      `${vp.id} · 对照组：移除注入后溢出恢复`,
      afterRemove.documentScrollWidth <= afterRemove.viewportWidth + THRESHOLDS.overflowTolerancePx,
      `scrollWidth ${afterRemove.documentScrollWidth} ≤ ${afterRemove.viewportWidth}`,
    )
    report.controlGroups.push({
      viewport: vp.id,
      kind: 'overflow',
      mustFail: true,
      didFail: ctrlOverflowShouldFail,
      scrollWidth: ctrlOverflow.documentScrollWidth,
      viewportWidth: ctrlOverflow.viewportWidth,
      afterRemoveScrollWidth: afterRemove.documentScrollWidth,
    })

    await page.evaluate(() => window.__a11y.injectControl('contrast'))
    await page.waitForTimeout(150)
    const ctrlContrast = await page.evaluate((n) => window.__a11y.scanContrast(n), THRESHOLDS.maxTextElements)
    const hit = ctrlContrast.violations.find((v) => v.text.includes('a11y-control-bad-contrast'))
    control(
      `${vp.id} ·【对照组】注入 #777777/#ffffff 后对比度检测必须判红`,
      Boolean(hit),
      hit
        ? `已判红（比值 ${hit.ratio} < ${hit.required}）`
        : `❗该红没红：扫描 ${ctrlContrast.scanned} 个元素都没判出来（注入元素可能没被扫到）`,
    )
    await page.evaluate(() => window.__a11y.removeControl())
    report.controlGroups.push({
      viewport: vp.id,
      kind: 'contrast',
      mustFail: true,
      didFail: Boolean(hit),
      measuredRatio: hit?.ratio ?? null,
      scanned: ctrlContrast.scanned,
    })

    await ctx.close()
  }

  return report
}

async function main() {
  if (!existsSync(join(ROOT, 'dist', 'index.html'))) {
    console.error('❌ dist/index.html 不存在 —— preview 打的是 dist，请先执行：CODEBUDDY_SAFE_DELETE_ENABLED=0 npx vite build')
    process.exitCode = 1
    return
  }
  mkdirSync(SHOT_DIR, { recursive: true })
  mkdirSync(dirname(REPORT_PATH), { recursive: true })

  const executablePath = findChrome()
  if (!executablePath) throw new Error('找不到 Chromium，请设置 CHROME_PATH')
  console.log(`🌐 浏览器：${executablePath}`)
  console.log(`🎯 目标：${BASE}`)

  const browser = await chromium.launch({ executablePath })
  let report
  try {
    report = await run(browser)
  } finally {
    await browser.close()
  }

  /* ---- 汇总 ---- */
  const passCount = results.filter((r) => r.status === 'PASS').length
  const controlTotal = report.controlGroups.length
  const controlRed = controlTotal - controlBrokenCount

  console.log('\n【对照组】')
  console.log(`  ${controlBrokenCount === 0 ? '✅' : '❌'} 合成对照组：${controlRed}/${controlTotal} 该红已红`)
  // 主题切换的「切换前 vs 切换后底色必须不同」本身就是非恒真对照组，单列一行
  const themeChecks = report.crossViewport.filter((c) => c.kind === 'theme')
  const themeChanged = themeChecks.filter((c) => c.changed).length
  const themeControlOk = themeChecks.length > 0 && themeChanged === themeChecks.length
  console.log(
    `  ${themeControlOk ? '✅' : '❌'} 主题切换非恒真对照组：${themeChanged}/${themeChecks.length} 个视口底色确实变化`,
  )
  if (!themeControlOk) controlBrokenCount++

  report.summary = {
    total: results.length,
    pass: passCount,
    fail: failCount,
    undecided: undecidedCount,
    controlGroups: { total: controlTotal, didFail: controlRed, broken: controlBrokenCount },
  }
  report.verdict = failCount > 0 ? 'FAIL' : undecidedCount > 0 ? 'UNDECIDED' : 'PASS'
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n', 'utf8')

  console.log(`\n${'─'.repeat(54)}`)
  console.log(
    `共 ${results.length} 项（正式判据 ${passCount + failCount + undecidedCount}，对照组 ${controlTotal}）：` +
      `通过 ${passCount}，失败 ${failCount}，无法判定 ${undecidedCount}`,
  )
  console.log(`判定：${report.verdict}`)
  console.log(`${'─'.repeat(54)}`)
  console.log('\n【产物】')
  console.log(`  报告：${resolve(REPORT_PATH)}`)
  console.log(`  截图：${resolve(SHOT_DIR)}（${VIEWPORTS.length * TABS.length} 张页签 + 主题/命令面板）`)

  // 有 FAIL / UNDECIDED / 对照组该红没红 ⇒ 一律 exit 1
  if (failCount > 0 || undecidedCount > 0 || controlBrokenCount > 0) process.exitCode = 1
}

let previewServer = null
try {
  if (!process.env.A11Y_BASE) previewServer = await ensurePreviewServer({ port: LOCAL_PORT })
  await main()
} catch (e) {
  console.error('\n💥 脚本异常：', e)
  process.exitCode = 1
} finally {
  if (previewServer) stopPreview(previewServer)
}
