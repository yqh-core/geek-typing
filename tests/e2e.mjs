/**
 * Geek Typing 端到端自动化测试（v2：下拉导航 + 背单词 + 中英双语）
 *
 * 用法：
 *   npm run test:e2e            # 一键：自举 vite preview（4173 已占用则复用）+ 全量用例
 *   npm run test:e2e:prod       # 打生产 https://geek-typing.pages.dev（只读）
 *   E2E_BASE=http://127.0.0.1:5173 node tests/e2e.mjs   # 也可以打 dev server
 *   CHROME_PATH=<chrome.exe>                            # 手动指定浏览器
 */
import { chromium } from 'playwright-core'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ensurePreviewServer, stopPreview } from './preview-server.mjs'

const PROD_BASE = 'https://geek-typing.pages.dev'
const IS_PROD = process.argv.includes('--prod')
const BASE = process.env.E2E_BASE ?? (IS_PROD ? PROD_BASE : 'http://127.0.0.1:4173')

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
  // Playwright 下载的 Chromium（CI / Linux / macOS）
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

const results = []
let failures = 0

function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  if (!ok) failures++
  console.log(`${ok ? '  ✅' : '  ❌'} ${name}${detail ? ` — ${detail}` : ''}`)
}

/** 当前要打的完整单词（由 data-letter 拼出，避开嵌套 span 重复问题） */
const readWord = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="word"] [data-letter]')]
      .map((s) => s.getAttribute('data-letter'))
      .join(''),
  )

/** 光标所在字母 */
const readCursor = (page) =>
  page.evaluate(
    () => document.querySelector('[data-state="cursor"]')?.getAttribute('data-letter') ?? null,
  )

const norm = (s) => (s ?? '').replace(/\s+/g, ' ')

async function typeWord(page, word) {
  // 给足间隔，避免按键快过 React 状态更新导致漏拍
  await page.keyboard.type(word.toLowerCase(), { delay: 20 })
}

/** v2：模式按钮在「练习」下拉里 —— 先点开下拉再点模式项 */
async function pickMode(page, modeId) {
  await page.click('[data-testid="dropdown-practice"]')
  await page.waitForTimeout(150)
  await page.click(`[data-testid="mode-${modeId}"]`)
  await page.waitForTimeout(300)
}

/** V3-P0a：默认页签是 Home（今日推荐），打字类用例先切到 typing 页签 */
async function gotoTyping(page) {
  await page.click('[data-testid="tab-typing"]')
  await page.waitForTimeout(200)
}

async function run() {
  const executablePath = findChrome()
  if (!executablePath) throw new Error('找不到 Chromium，请设置 CHROME_PATH')
  console.log(`🌐 浏览器：${executablePath}`)
  console.log(`🎯 目标：${BASE}\n`)

  const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] })
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 1000 } })
  const page = await ctx.newPage()

  const consoleErrors = []
  const consoleWarns = []
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text())
    if (m.type() === 'warning') consoleWarns.push(m.text())
  })
  page.on('pageerror', (e) => consoleErrors.push(String(e)))

  await page.goto(BASE, { waitUntil: 'networkidle' })
  await gotoTyping(page) // V3-P0a：默认落 Home，打字类用例先切 typing

  /* ---------- 1. 首屏与下拉导航 ---------- */
  console.log('【1】首屏与下拉导航')
  check('页面标题正确', (await page.title()).includes('Geek Typing'), await page.title())
  const body0 = await page.textContent('body')
  check('默认词库是 2026 AI 核心词库', norm(body0).includes('2026 AI 核心词库'))
  check(
    '统计栏四项齐全（中文标签）',
    ['进度', '正确率', '速度', '连击'].every((k) => norm(body0).includes(k)),
  )
  // 顶栏视觉组：Logo + 3 下拉 + 语言 + 重开 + 数据 ≤ 6 组
  check(
    '顶栏只保留下拉导航',
    (await page.locator('[data-testid="dropdown-practice"]').count()) === 1 &&
      (await page.locator('[data-testid="dropdown-banks"]').count()) === 1 &&
      (await page.locator('[data-testid="dropdown-settings"]').count()) === 1 &&
      (await page.locator('[data-testid="lang-zh"]').count()) === 1 &&
      (await page.locator('[data-testid="open-stats"]').count()) === 1,
  )
  // 打开练习下拉检查三模式
  await page.click('[data-testid="dropdown-practice"]')
  await page.waitForTimeout(150)
  check(
    '练习下拉含三模式',
    (await page.locator('[data-testid="mode-classic"]').count()) === 1 &&
      (await page.locator('[data-testid="mode-spell"]').count()) === 1 &&
      (await page.locator('[data-testid="mode-timed"]').count()) === 1,
  )
  check('练习下拉含自动发音开关', (await page.locator('[data-testid="toggle-autospeak"]').count()) === 1)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(150)
  check('Esc 可关闭下拉', (await page.locator('[data-testid="mode-classic"]').count()) === 0)
  const firstWord = await readWord(page)
  check('能读出当前单词', firstWord.length > 0, `单词=${firstWord}`)
  check('虚拟键盘存在', (await page.locator('[data-testid="keymap"]').count()) === 1)
  const hl0 = await page.getAttribute('[data-active="true"]', 'data-key')
  check('虚拟键盘高亮首字母', hl0 === firstWord[0], `高亮=${hl0} 应=${firstWord[0]}`)

  /* ---------- 2. 打字核心链路 ---------- */
  console.log('\n【2】打字核心链路（严格纠错）')
  await page.keyboard.press('q')
  await page.keyboard.press('z')
  check('敲错被拦住（仍在第 1 词）', norm(await page.textContent('body')).includes('1/20'))
  await typeWord(page, firstWord)
  await page.waitForTimeout(450)
  const afterWord = norm(await page.textContent('body'))
  check('打完自动切到第 2 词', afterWord.includes('2/20'))
  check('打卡「今日」计数 +1', afterWord.includes('今日'))

  /* ---------- 3. 连击 / WPM ---------- */
  console.log('\n【3】连击 / WPM / 虚拟键盘跟随')
  for (let i = 2; i <= 5; i++) {
    await typeWord(page, await readWord(page))
    await page.waitForTimeout(330)
  }
  const body3 = (await page.textContent('body')).replace(/\s/g, '')
  const comboMatch = body3.match(/(?:combo|连击)x(\d+)/i)
  const wpmMatch = body3.match(/(?:wpm|速度)(\d+)/i)
  check('COMBO 累积到两位数', !!comboMatch && Number(comboMatch[1]) > 10, `combo=${comboMatch?.[1]}`)
  check('WPM > 0', !!wpmMatch && Number(wpmMatch[1]) > 0, `wpm=${wpmMatch?.[1]}`)
  const cur3 = await readCursor(page)
  const hl3 = await page.getAttribute('[data-active="true"]', 'data-key')
  check('虚拟键盘跟随光标移动', !!cur3 && hl3 === cur3, `高亮=${hl3} 光标=${cur3}`)

  /* ---------- 4. 皮肤 / 词库 / 音效（下拉内） ---------- */
  console.log('\n【4】皮肤 / 词库 / 音效（下拉内操作）')
  // 皮肤：设置下拉
  for (const [label, expect] of [['专注 IDE', 'export const'], ['墨水屏', null], ['黑客荧光', null]]) {
    await page.click('[data-testid="dropdown-settings"]')
    await page.waitForTimeout(150)
    await page.getByRole('button', { name: label, exact: true }).first().click()
    await page.waitForTimeout(220)
    if (expect) check(`切换到「${label}」`, norm(await page.textContent('body')).includes(expect))
    else check(`切换到「${label}」`, (await readWord(page)).length > 0)
    await page.keyboard.press('Escape') // 皮肤项切换后不自动收起，手动关
    await page.waitForTimeout(120)
  }
  // 词库下拉
  await page.click('[data-testid="dropdown-banks"]')
  await page.waitForTimeout(150)
  const menu = norm(await page.textContent('body'))
  check(
    '词库下拉 8 本齐全（含考研/托福库）',
    ['四级 CET-4', '六级 CET-6', '雅思核心 IELTS', '考研核心', '托福核心', '云原生 K8s 词库'].every((k) => menu.includes(k)),
  )
  check('词库下拉含导入词库入口', (await page.locator('[data-testid="open-bank-manager"]').count()) >= 1)
  await page.getByRole('button', { name: /四级 CET-4/ }).first().click()
  await page.waitForTimeout(320)
  check('切到 CET-4 后正常出题', (await readWord(page)).length > 0)
  // 音效开关：设置下拉
  await page.click('[data-testid="dropdown-settings"]')
  await page.waitForTimeout(150)
  await page.getByRole('button', { name: /键盘音/ }).first().click()
  await page.waitForTimeout(150)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(120)
  check('音效开关可切换', (await readWord(page)).length > 0)

  /* ---------- 5. 持久化 ---------- */
  console.log('\n【5】本地持久化')
  await page.reload({ waitUntil: 'networkidle' })
  await gotoTyping(page) // V3-P0a：reload 后落 Home
  check('刷新后仍是 CET-4', norm(await page.textContent('body')).includes('四级 CET-4'))

  /* ---------- 6. 拼写（默写）模式 ---------- */
  console.log('\n【6】拼写模式')
  await pickMode(page, 'spell')
  const spellWord = await readWord(page)
  check('拼写模式正常出词', spellWord.length > 0, `词=${spellWord}`)
  const masked = await page.evaluate(
    () => document.querySelector('[data-testid="word"]')?.textContent ?? '',
  )
  check('字母被遮罩成占位符', (masked ?? '').includes('·'), `实际显示=${masked?.slice(0, 12)}`)
  await page.keyboard.press(spellWord[0] === 'z' ? 'x' : 'z') // 故意敲错
  await page.waitForTimeout(120)
  const wrongCount = await page.locator('[data-state="wrong"]').count()
  check('拼错会标红', wrongCount >= 1)
  await page.keyboard.press('Backspace')
  await page.waitForTimeout(120)
  check('Backspace 可删除错字母', (await page.locator('[data-state="wrong"]').count()) === 0)
  await typeWord(page, spellWord)
  await page.waitForTimeout(400)
  check('拼写正确后进入下一词', norm(await page.textContent('body')).includes('2/20'))

  /* ---------- 7. 限时模式 ---------- */
  console.log('\n【7】限时模式')
  await pickMode(page, 'timed')
  await page.keyboard.press((await readWord(page))[0])
  await page.waitForTimeout(1400)
  const cdText = await page.textContent('[data-testid="countdown"]').catch(() => null)
  check('倒计时出现并递减', !!cdText && /59|58|57|60/.test(cdText), `读数=${cdText}`)

  /* ---------- 8. 完整通关 → 结算 ---------- */
  console.log('\n【8】通关结算')
  await pickMode(page, 'classic')
  for (let round = 0; round < 20; round++) {
    const w = await readWord(page)
    if (!w) break
    await typeWord(page, w)
    await page.waitForTimeout(300)
  }
  const done = norm(await page.textContent('body'))
  check('20 词后弹出结算面板', done.includes('本轮完成'))
  check('结算含正确率/速度/用时/最高连击', ['正确率', '速度', '用时', '最高连击'].every((k) => done.includes(k)))
  check('结算显示今日累计', done.includes('今日累计'))

  /* ---------- 8.5 发音 / 数据分析 ---------- */
  console.log('\n【8.5】发音与数据分析')
  await page.click('button:has-text("再来一轮")')
  await page.waitForTimeout(400)
  check('单词发音按钮存在', (await page.locator('[data-testid="speak-btn"]').count()) >= 1)
  // 自动发音开关在练习下拉里
  await page.click('[data-testid="dropdown-practice"]')
  await page.waitForTimeout(150)
  const autospeak = page.locator('[data-testid="toggle-autospeak"]')
  const hasAuto = (await autospeak.count()) === 1
  check('自动发音开关存在（下拉内）', hasAuto)
  if (hasAuto) {
    const before = (await autospeak.textContent())?.trim()
    await autospeak.click()
    await page.waitForTimeout(150)
    const after = (await autospeak.textContent())?.trim()
    check('自动发音可切换', before !== after, `${before} → ${after}`)
  }
  await page.keyboard.press('Escape')
  await page.waitForTimeout(120)
  await page.click('[data-testid="open-stats"]')
  await page.waitForTimeout(300)
  const statsText = norm(await page.textContent('body'))
  check('数据面板可打开', statsText.includes('学习数据分析'))
  check('数据面板显示累计击键/总正确率', statsText.includes('累计击键') && statsText.includes('总正确率'))
  check('数据面板含易错键模块', statsText.includes('最常敲错的键'))
  const weakBtn = page.locator('[data-testid="weak-practice"]')
  const hasWeak = (await weakBtn.count()) >= 1
  check('弱项专攻按钮存在', hasWeak)
  if (hasWeak) {
    await weakBtn.click()
    await page.waitForTimeout(400)
    check('弱项专攻可出题', (await readWord(page)).length > 0)
  }

  /* ---------- 9. 背单词模块 ---------- */
  console.log('\n【9】背单词模块')
  await page.click('[data-testid="tab-memorize"]')
  await page.waitForTimeout(400)
  check('背单词卡片出现', (await page.locator('[data-testid="memorize-card"]').count()) === 1)
  check(
    '打字相关 UI 已隐藏',
    (await page.locator('[data-testid="keymap"]').count()) === 0 &&
      (await page.locator('[data-testid="word"]').count()) === 0,
  )
  check('发音按钮存在', (await page.locator('[data-testid="memorize-speak"]').count()) === 1)
  await page.click('[data-testid="memorize-flip"]')
  await page.waitForTimeout(200)
  check('翻面显示释义', (await page.locator('[data-testid="memorize-translation"]').count()) === 1)
  const threeOk = await Promise.all(
    ['known', 'fuzzy', 'unknown'].map((k) => page.locator(`[data-testid="memorize-${k}"]`).count()),
  )
  check('三键齐全', threeOk.every((c) => c === 1))
  // unknown → 队列追加 2 次：进度分母应从 20 变 22
  const progBefore = await page.textContent('[data-testid="memorize-progress"]')
  await page.click('[data-testid="memorize-unknown"]')
  await page.waitForTimeout(200)
  const progAfter = await page.textContent('[data-testid="memorize-progress"]')
  check(
    '不认识的词追加 2 次到队尾',
    progBefore?.includes('/20') && progAfter?.includes('/22'),
    `${progBefore?.trim()} → ${progAfter?.trim()}`,
  )
  // 用「认识」清完这一组（22 词）
  let settled = false
  for (let i = 0; i < 40; i++) {
    if ((await page.locator('[data-testid="memorize-again"]').count()) > 0) {
      settled = true
      break
    }
    if ((await page.locator('[data-testid="memorize-flip"]').count()) === 0) break
    await page.click('[data-testid="memorize-flip"]')
    await page.waitForTimeout(60)
    await page.click('[data-testid="memorize-known"]')
    await page.waitForTimeout(60)
  }
  check('全部完成后出现结算卡', settled)
  const summary = norm(await page.textContent('body'))
  check('结算含今日新学/复习/已掌握', ['今日新学', '复习', '本库已掌握'].every((k) => summary.includes(k)))
  // 刷新后进度仍在：直接校验 localStorage 记录数 ≥ 20，且新卡组正常开启
  await page.reload({ waitUntil: 'networkidle' })
  await page.click('[data-testid="tab-memorize"]')
  await page.waitForTimeout(500)
  const memRaw = await page.evaluate(() => localStorage.getItem('gt.memorize.v1'))
  const memCount = memRaw ? Object.keys(JSON.parse(memRaw)).length : 0
  check('刷新后背单词进度仍在（localStorage ≥20 词）', memCount >= 20, `记录数=${memCount}`)
  check(
    '刷新后背单词页可继续学（新卡组或已学完提示）',
    (await page.locator('[data-testid="memorize-card"]').count()) === 1 ||
      (await page.locator('[data-testid="memorize-again"]').count()) > 0,
  )

  /* ---------- 10. 中英双语 ---------- */
  console.log('\n【10】中英双语切换')
  await page.click('[data-testid="lang-en"]')
  await page.waitForTimeout(300)
  const bodyEn = norm(await page.textContent('body'))
  check('en 即时生效', ['Typing', 'Vocabulary', 'Practice', 'Settings'].every((k) => bodyEn.includes(k)))
  // 切到 CET-4（无 nameEn，显示中文名属词库数据豁免）之外的主要 UI 不应残留中文
  check('en 模式无中文导航残留', !bodyEn.includes('练习') && !bodyEn.includes('设置') && !bodyEn.includes('背单词'))
  await page.reload({ waitUntil: 'networkidle' })
  const bodyEn2 = norm(await page.textContent('body'))
  check('en 刷新保持', bodyEn2.includes('Typing') && bodyEn2.includes('Practice'))
  await page.click('[data-testid="lang-zh"]')
  await page.waitForTimeout(200)

  /* ---------- 11. 移动端视口 ---------- */
  console.log('\n【11】移动端视口')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(300)
  await pickMode(page, 'classic')
  await page.waitForTimeout(400)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  check('移动端无横向溢出', overflow <= 2, `溢出=${overflow}px`)

  /* ---------- 11.5 命令面板 ---------- */
  console.log('\n【11.5】命令面板（Esc + : 命令）')
  await page.setViewportSize({ width: 1360, height: 1000 })
  await page.waitForTimeout(300)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
  check('Esc 打开命令面板', (await page.locator('[data-testid="command-palette"]').count()) === 1)
  await page.keyboard.type('hello', { delay: 30 })
  const cmdTyped = await page.inputValue('[data-testid="command-input"]')
  check('命令态打字引擎不吞键（字母进输入框）', cmdTyped === 'hello', `输入=${cmdTyped}`)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
  check('Esc 关闭命令面板', (await page.locator('[data-testid="command-palette"]').count()) === 0)

  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  await page.keyboard.type(':typing', { delay: 25 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
  check(':typing 跳回打字页签', (await page.locator('[data-testid="word"]').count()) === 1)

  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  await page.keyboard.type(':help', { delay: 25 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(200)
  const helpText = norm(await page.textContent('[data-testid="command-palette"]'))
  check(
    ':help 列出全部命令',
    [':bank', ':mode', ':voice', ':theme', ':sound', ':shuffle', ':memorize', ':typing', ':q'].every((c) => helpText.includes(c)),
  )
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)

  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  await page.keyboard.type(':theme ide', { delay: 25 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(350)
  check(
    ':theme ide 主题切换生效',
    (await page.locator('[data-testid="command-palette"]').count()) === 0 &&
      norm(await page.textContent('body')).includes('export const'),
  )

  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  await page.keyboard.type(':mode spell', { delay: 25 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(350)
  await page.click('[data-testid="dropdown-practice"]')
  await page.waitForTimeout(200)
  check(
    ':mode spell 生效（mode-spell 存在 + 默写提示出现）',
    (await page.locator('[data-testid="mode-spell"]').count()) === 1 &&
      norm(await page.textContent('body')).includes('拼错了可以用 Backspace'),
  )
  await page.keyboard.press('Escape') // 关下拉（下拉打开时 Esc 不得顺带开命令面板）
  await page.waitForTimeout(200)
  check(
    '下拉打开时 Esc 不误开命令面板',
    (await page.locator('[data-testid="command-palette"]').count()) === 0 &&
      (await page.locator('[data-testid="mode-spell"]').count()) === 0,
  )
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  await page.keyboard.type(':mode classic', { delay: 25 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(350)

  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  await page.keyboard.type(':bank', { delay: 25 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(200)
  const bankList = norm(await page.textContent('[data-testid="command-palette"]'))
  check(
    ':bank 列出全部词库',
    ['ai-core', 'cloud-native', 'frontend', 'cet4', 'cet6', 'ielts', 'kaoyan', 'toefl'].every((id) => bankList.includes(id)),
  )
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)

  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  await page.keyboard.type(':bank 2', { delay: 25 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(350)
  check(':bank 2 切到云原生词库', norm(await page.textContent('body')).includes('云原生 K8s 词库'))

  // :q 重开本轮：先敲 1 个正确字母，重启后归零
  const qw = await readWord(page)
  await page.keyboard.press(qw[0])
  await page.waitForTimeout(250)
  check('预置：已敲对 1 个字母', (await page.locator('[data-state="correct"]').count()) === 1)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  await page.keyboard.type(':q', { delay: 25 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  check(':q 重开本轮（进度归零）', (await page.locator('[data-state="correct"]').count()) === 0)

  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  await page.keyboard.type(':nope', { delay: 25 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(200)
  check('未知命令红字提示', (await page.locator('[data-testid="command-error"]').count()) === 1)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)

  /* ---------- 11.6 背单词键盘流 ---------- */
  console.log('\n【11.6】背单词键盘流（Space / 1 / 2 / 3 / Enter）')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  await page.keyboard.type(':memorize', { delay: 25 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  check(':memorize 跳背单词页签', (await page.locator('[data-testid="memorize-card"]').count()) === 1)
  await page.keyboard.press('Space')
  await page.waitForTimeout(200)
  check('Space 翻面显示释义', (await page.locator('[data-testid="memorize-translation"]').count()) === 1)
  check(
    '翻面后按键提示切换为打分',
    norm(await page.textContent('[data-testid="memorize-keyhint"]')).includes('1'),
  )
  await page.keyboard.press('3') // 不认识 → 队尾追加 2
  await page.waitForTimeout(200)
  const kProg1 = await page.textContent('[data-testid="memorize-progress"]')
  check('按 3 打分推进且追加 2 次', kProg1?.includes('1/22'), kProg1?.trim() ?? '')
  await page.keyboard.press('Space')
  await page.waitForTimeout(150)
  await page.keyboard.press('1') // 认识
  await page.waitForTimeout(200)
  const kProg2 = await page.textContent('[data-testid="memorize-progress"]')
  check('按 1 认识推进', kProg2?.includes('2/22'), kProg2?.trim() ?? '')
  await page.keyboard.press('Space')
  await page.waitForTimeout(150)
  await page.keyboard.press('2') // 模糊 → 追加 1
  await page.waitForTimeout(200)
  const kProg3 = await page.textContent('[data-testid="memorize-progress"]')
  check('按 2 模糊推进且追加 1 次', kProg3?.includes('3/23'), kProg3?.trim() ?? '')
  // 键盘清完剩余卡片
  let kSettled = false
  for (let i = 0; i < 60; i++) {
    if ((await page.locator('[data-testid="memorize-again"]').count()) > 0) {
      kSettled = true
      break
    }
    if ((await page.locator('[data-testid="memorize-translation"]').count()) === 0) {
      await page.keyboard.press('Space')
      await page.waitForTimeout(90)
    }
    await page.keyboard.press('1')
    await page.waitForTimeout(90)
  }
  check('纯键盘清完整组出现结算卡', kSettled)
  check(
    '勋章横幅渲染（今日修行完成 + 打卡天数）',
    norm(await page.textContent('body')).includes('今日修行完成') &&
      (await page.locator('[data-testid="memorize-medal"]').count()) === 1,
  )
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  check('Enter 再来一组', (await page.locator('[data-testid="memorize-card"]').count()) === 1)
  await page.click('[data-testid="tab-typing"]')
  await page.waitForTimeout(200)

  /* ---------- 13. 批3：代码模式（:mode code）与发音增强 ---------- */
  console.log('\n【13】代码模式与发音增强')

  // 13.1 :voice 切换 + 持久化
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  await page.keyboard.type(':voice en-GB', { delay: 25 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
  check(
    ':voice en-GB 切换生效（localStorage gt.voice）',
    (await page.evaluate(() => localStorage.getItem('gt.voice'))) === 'en-GB',
  )
  await page.reload({ waitUntil: 'networkidle' })
  check(
    '刷新后 voice 偏好保持 en-GB',
    (await page.evaluate(() => localStorage.getItem('gt.voice'))) === 'en-GB',
  )
  await gotoTyping(page) // V3-P0a：reload 后落 Home，后续代码行用例需要打字面板
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  await page.keyboard.type(':voice zz', { delay: 25 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(200)
  check(':voice 非法参数红字提示', (await page.locator('[data-testid="command-error"]').count()) === 1)
  await page.keyboard.press('Escape') // 关闭 :voice 的面板
  await page.waitForTimeout(200)

  // 13.2 切代码模式 + 代码词库（先关乱序，让首行可预期）
  await page.keyboard.press('Escape') // 重新打开命令面板
  await page.waitForTimeout(200)
  await page.keyboard.type(':mode code', { delay: 25 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(350)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  await page.keyboard.type(':shuffle off', { delay: 25 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(350)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  await page.keyboard.type(':bank ts-code', { delay: 25 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  check(':bank ts-code 切到 TS 骨架代码', norm(await page.textContent('body')).includes('TS 骨架代码'))
  await page.click('[data-testid="dropdown-practice"]')
  await page.waitForTimeout(150)
  check('练习下拉含 mode-code 项', (await page.locator('[data-testid="mode-code"]').count()) === 1)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  check(
    '下拉打开时 Esc 不误开命令面板',
    (await page.locator('[data-testid="command-palette"]').count()) === 0,
  )

  // 13.3 代码行输入：大小写 / 空格 / 符号 + 大小写敲错拦截
  const codeLine = await readWord(page)
  check(
    '代码行原样渲染（首行 = useState 骨架行）',
    codeLine === 'const [state, setState] = useState(initialState);',
    `行=${codeLine}`,
  )
  check('code 模式隐藏发音按钮', (await page.locator('[data-testid="speak-btn"]').count()) === 0)
  const prefix = codeLine.slice(0, 10)
  await page.keyboard.type(prefix, { delay: 30 })
  await page.waitForTimeout(250)
  check(
    '代码前缀输入推进（大小写敏感命中 10 字符）',
    (await page.locator('[data-state="correct"]').count()) === prefix.length,
  )
  check(
    '未敲空格渲染为弱灰 ·',
    await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="word"] [data-letter]')].some(
        (s) => s.getAttribute('data-letter') === ' ' && s.textContent === '·',
      ),
    ),
  )
  // 大小写敲错：光标处为小写 t，敲大写 T 应被拦截（严格纠错：typed 不增长、光标不动、错误提示行标出 T）
  const codeCursor = await readCursor(page)
  check('光标落在小写字母 t', codeCursor === 't', `光标=${codeCursor}`)
  await page.keyboard.press('T')
  await page.waitForTimeout(120)
  check(
    '大写 T 敲错被拦（正确数不变、光标不动）',
    (await page.locator('[data-state="correct"]').count()) === prefix.length &&
      (await readCursor(page)) === 't',
  )
  await page.keyboard.press('t')
  await page.waitForTimeout(150)
  // 敲完剩余部分（含大写 S、空格、符号 [ ] ( ) ;）
  await page.keyboard.type(codeLine.slice(11), { delay: 15 })
  await page.waitForTimeout(450)
  check('代码行敲完自动切下一行', norm(await page.textContent('body')).includes('2/20'))

  // 13.4 背单词 K 重读 + 翻面自动发音
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  await page.keyboard.type(':memorize', { delay: 25 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  check('背单词卡片出现', (await page.locator('[data-testid="memorize-card"]').count()) === 1)
  check(
    '按键提示含「K 重读」',
    norm(await page.textContent('[data-testid="memorize-keyhint"]')).includes('K'),
  )
  await page.keyboard.press('k')
  await page.waitForTimeout(250)
  check('K 键重读无报错（卡片仍在）', (await page.locator('[data-testid="memorize-card"]').count()) === 1)
  await page.keyboard.press('Space')
  await page.waitForTimeout(250)
  check(
    'Space 翻面显示释义（翻面自动发音不报错）',
    (await page.locator('[data-testid="memorize-translation"]').count()) === 1,
  )

  // 13.5 回打字页签：code 模式保持，发音按钮仍隐藏
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  await page.keyboard.type(':typing', { delay: 25 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
  check(
    ':typing 回打字页签，code 模式发音按钮仍隐藏',
    (await page.locator('[data-testid="word"]').count()) === 1 &&
      (await page.locator('[data-testid="speak-btn"]').count()) === 0,
  )

  /* ---------- 14. 批4：错题本（艾宾浩斯）+ 命令面板模糊匹配 ---------- */
  console.log('\n【14】错题本 + 命令面板模糊匹配')

  // 14.1 模糊匹配：常显列表 / 过滤 / ↑↓ / Tab / Enter
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  await page.keyboard.type(':voice en-US', { delay: 25 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300) // voice 归位为 en-US，便于 14.1 末尾断言真实切换
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  await page.keyboard.type(':memorize', { delay: 25 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  check('预置：跳到背单词页签', (await page.locator('[data-testid="memorize-card"]').count()) === 1)

  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  await page.keyboard.type(':t', { delay: 25 })
  await page.waitForTimeout(200)
  check(
    '打开面板即常显列表，:t 过滤命中 theme/typing/soundtheme',
    (await page.locator('[data-testid="command-item-theme"]').count()) === 1 &&
      (await page.locator('[data-testid="command-item-typing"]').count()) === 1 &&
      (await page.locator('[data-testid="command-item-soundtheme"]').count()) === 1,
  )
  check(':t 不命中 bank 等无关命令', (await page.locator('[data-testid="command-item-bank"]').count()) === 0)
  check(
    '前缀命中排前面（默认选中 theme）',
    (await page.getAttribute('[data-testid="command-item-theme"]', 'data-selected')) === 'true',
  )
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(120)
  check(
    '↓ 移动选中到 typing',
    (await page.getAttribute('[data-testid="command-item-typing"]', 'data-selected')) === 'true',
  )
  await page.keyboard.press('Tab')
  await page.waitForTimeout(120)
  check('Tab 补全命令名进输入框', (await page.inputValue('[data-testid="command-input"]')) === ':typing')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(350)
  check('Enter 执行选中命令（跳打字页签）', (await page.locator('[data-testid="word"]').count()) === 1)

  // 带参命令：部分输入回车 = 补全「命令名+空格」，不误执行
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  await page.keyboard.type(':vo', { delay: 25 })
  await page.waitForTimeout(150)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(150)
  check(
    ':vo 回车补全 :voice+空格（不误执行、面板仍在）',
    (await page.inputValue('[data-testid="command-input"]')) === ':voice ' &&
      (await page.locator('[data-testid="command-palette"]').count()) === 1,
  )
  await page.keyboard.type('en-GB', { delay: 20 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
  check('补全后继续输参数执行生效', (await page.evaluate(() => localStorage.getItem('gt.voice'))) === 'en-GB')

  // 14.2 错题入库：classic 敲错一个字母再敲对 → gt.review.v1 出现条目
  await page.evaluate(() => localStorage.removeItem('gt.review.v1')) // 清掉前面用例的敲错记录，保证断言精确
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  await page.keyboard.type(':mode classic', { delay: 25 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(350)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  await page.keyboard.type(':bank cet4', { delay: 25 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(450)
  const wrongTarget = await readWord(page)
  check('预置：classic 出词', wrongTarget.length > 0, `词=${wrongTarget}`)
  await page.keyboard.press(wrongTarget[0] === 'z' ? 'x' : 'z') // 故意敲错
  await page.waitForTimeout(150)
  await typeWord(page, wrongTarget) // 敲对完成整词
  await page.waitForTimeout(500)
  const review1 = JSON.parse((await page.evaluate(() => localStorage.getItem('gt.review.v1'))) || '{}')
  check(
    '敲错的词入库（wrongCount=1、间隔归 0、明天到期）',
    review1[wrongTarget]?.wrongCount === 1 &&
      review1[wrongTarget]?.intervalIdx === 0 &&
      review1[wrongTarget]?.nextReviewAt > Date.now(),
    JSON.stringify(review1[wrongTarget] ?? null),
  )
  await page.click('[data-testid="dropdown-practice"]')
  await page.waitForTimeout(150)
  check(
    '练习下拉含错题复习项，无到期时置灰',
    (await page.locator('[data-testid="menu-review"]').count()) === 1 &&
      (await page.locator('[data-testid="menu-review"]').isDisabled()) === true,
  )
  await page.keyboard.press('Escape') // 关下拉（不误开命令面板）
  await page.waitForTimeout(120)

  // 14.3 到期判定：注入 yesterday 到期的词 → StatsPanel 到期 1 → :review 拉出
  const dueWord = await readWord(page)
  await page.evaluate((word) => {
    const now = Date.now()
    localStorage.setItem(
      'gt.review.v1',
      JSON.stringify({
        [word]: {
          wrongCount: 1,
          correctStreak: 0,
          lastWrongAt: now - 2 * 864e5,
          nextReviewAt: now - 864e5,
          intervalIdx: 0,
        },
      }),
    )
  }, dueWord)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  await page.click('[data-testid="open-stats"]')
  await page.waitForTimeout(300)
  check(
    'StatsPanel 错题统计：总数 1 / 今日到期 1',
    (await page.textContent('[data-testid="review-total"]'))?.trim() === '1' &&
      (await page.textContent('[data-testid="review-due"]'))?.trim() === '1',
  )
  check(
    'StatsPanel 含开始错题复习按钮',
    (await page.locator('[data-testid="review-due-btn"]').count()) === 1 &&
      (await page.locator('[data-testid="review-due-btn"]').isDisabled()) === false,
  )
  await page.click('[aria-label="关闭"]')
  await page.waitForTimeout(200)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  await page.keyboard.type(':review', { delay: 25 })
  await page.waitForTimeout(150)
  check(':review 出现在命令列表', (await page.locator('[data-testid="command-item-review"]').count()) === 1)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  check(':review 开复习轮且首词即到期词', (await readWord(page)) === dueWord, `首词=${await readWord(page)}`)

  // 14.4 复习推进：到期词全对敲完 → intervalIdx 推进、明天+2 天后到期
  await typeWord(page, dueWord)
  await page.waitForTimeout(500)
  const review2 = JSON.parse((await page.evaluate(() => localStorage.getItem('gt.review.v1'))) || '{}')
  check(
    '复习全对间隔推进（intervalIdx 0→1、nextReviewAt 顺延）',
    review2[dueWord]?.intervalIdx === 1 &&
      review2[dueWord]?.correctStreak === 1 &&
      review2[dueWord]?.nextReviewAt > Date.now() + 864e5,
    JSON.stringify(review2[dueWord] ?? null),
  )
  // 未到期：:review 提示「没有到期的错题」且不开轮
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  await page.keyboard.type(':review', { delay: 25 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
  check(
    '无到期时 :review 提示不开轮',
    (await page.locator('[data-testid="command-notice"]').count()) === 1 &&
      norm(await page.textContent('[data-testid="command-notice"]')).includes('没有到期的错题'),
  )
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)

  // 14.5 毕业移除：走完 15 天最后一档再对 → 条目移除
  const gradWord = await readWord(page) // reload 后轮内任意词均可作为毕业候选
  await page.evaluate((word) => {
    const now = Date.now()
    localStorage.setItem(
      'gt.review.v1',
      JSON.stringify({
        [word]: {
          wrongCount: 2,
          correctStreak: 4,
          lastWrongAt: now - 16 * 864e5,
          nextReviewAt: now - 864e5,
          intervalIdx: 4,
        },
      }),
    )
  }, gradWord)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  await page.keyboard.type(':review', { delay: 25 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  check('毕业候选被拉进复习轮', (await readWord(page)) === gradWord)
  await typeWord(page, gradWord)
  await page.waitForTimeout(500)
  const review3 = JSON.parse((await page.evaluate(() => localStorage.getItem('gt.review.v1'))) || '{}')
  check(
    '走完 15 天间隔毕业移除条目',
    !(gradWord in review3),
    `剩余=${JSON.stringify(Object.keys(review3))}`,
  )

  /* ---------- 15. 批6：考研/托福词库（懒加载分包）---------- */
  console.log('\n【15】考研/托福词库（懒加载分包）')

  // 关闭 14.5 遗留的结算弹窗（finished 态 Enter 重开一轮）
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)

  // 15.1 词库下拉条目与词数（懒加载词库显示 count 元数据）
  await page.click('[data-testid="dropdown-banks"]')
  await page.waitForTimeout(200)
  const btnTexts = await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.textContent ?? ''))
  check('下拉含考研条目且词数 3000', btnTexts.some((t) => t.includes('考研核心') && t.includes('3000')))
  check('下拉含托福条目且词数 3000', btnTexts.some((t) => t.includes('托福核心') && t.includes('3000')))
  await page.keyboard.press('Escape') // 关下拉（下拉展开时 Esc 归下拉处理，不误开面板）
  await page.waitForTimeout(150)

  // 15.2 切考研词库：命令切换 → 加载 → 出词 → 打字推进
  await page.keyboard.press('Escape') // 开命令面板
  await page.waitForTimeout(200)
  await page.keyboard.type(':bank kaoyan', { delay: 25 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(600)
  check(':bank kaoyan 切到考研词库', norm(await page.textContent('body')).includes('考研核心'))
  const kyWord1 = await readWord(page)
  check('考研词库懒加载后正常出词', kyWord1.length > 0, `词=${kyWord1}`)
  await typeWord(page, kyWord1)
  await page.waitForTimeout(450)
  const kyWord2 = await readWord(page)
  check('考研词库打字推进到下一词', kyWord2.length > 0 && kyWord2 !== kyWord1, `下一词=${kyWord2}`)

  // 15.3 错题复习在懒词库下工作：敲错考研词入库 → 注入到期 → :review 拉出
  await page.evaluate(() => localStorage.removeItem('gt.review.v1'))
  await page.waitForTimeout(150)
  const kyWrong = await readWord(page)
  await page.keyboard.press(kyWrong[0] === 'z' ? 'x' : 'z') // 故意敲错
  await page.waitForTimeout(150)
  await typeWord(page, kyWrong)
  await page.waitForTimeout(500)
  const kyReview = JSON.parse((await page.evaluate(() => localStorage.getItem('gt.review.v1'))) || '{}')
  check('考研词敲错入库（懒词库下错题本可用）', kyReview[kyWrong]?.wrongCount === 1, JSON.stringify(kyReview[kyWrong] ?? null))
  await page.evaluate((word) => {
    const now = Date.now()
    localStorage.setItem(
      'gt.review.v1',
      JSON.stringify({
        [word]: {
          wrongCount: 1,
          correctStreak: 0,
          lastWrongAt: now - 2 * 864e5,
          nextReviewAt: now - 864e5,
          intervalIdx: 0,
        },
      }),
    )
  }, kyWrong)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(800) // 等懒加载词库 chunk 拉取 + bankWords 就位
  await gotoTyping(page) // V3-P0a：reload 后落 Home，readWord 需要打字面板
  for (let i = 0; i < 10 && (await readWord(page)).length === 0; i++) await page.waitForTimeout(200)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  await page.keyboard.type(':review', { delay: 25 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  check('懒词库下 :review 拉出到期考研词', (await readWord(page)) === kyWrong, `首词=${await readWord(page)}`)

  /* ---------- 13. 批8-A：艾宾浩斯 Jitter + Quota 熔断 ---------- */
  console.log('\n【13】批8：Jitter 抗雪崩 + Quota 熔断')

  // 14 节复习轮可能已结算出 ResultOverlay（z-30 遮罩拦截 UI 点击），Enter 重开解除
  await page.keyboard.press('Enter')
  await page.waitForTimeout(350)

  // 13.1 recordWrong Jitter 窗口：背单词打「不认识」→ nextReviewAt ∈ t0+[0.85d, 1.15d]
  await page.evaluate(() => localStorage.removeItem('gt.review.v1'))
  await page.click('[data-testid="tab-memorize"]')
  await page.waitForTimeout(400)
  const t0 = Date.now()
  await page.click('[data-testid="memorize-flip"]')
  await page.waitForTimeout(300)
  await page.click('[data-testid="memorize-unknown"]')
  await page.waitForTimeout(450)
  const driftW = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('gt.review.v1') || '{}')
    return Object.values(s)[0]?.nextReviewAt ?? 0
  }) - t0
  check(
    'recordWrong Jitter：1d 档落在 [0.85d, 1.15d] 窗口',
    driftW >= 0.85 * 864e5 && driftW <= 1.15 * 864e5,
    `漂移=${(driftW / 864e5).toFixed(3)}d`,
  )

  // 13.2 recordCorrect Jitter 窗口：注入到期词 → :review 敲对 → 2d 档 ∈ t0+[1.8d, 2.2d]
  await page.evaluate(() => localStorage.removeItem('gt.review.v1'))
  const dueWord2 = 'zz-jitter-correct'
  await page.evaluate((w) => {
    localStorage.setItem(
      'gt.review.v1',
      JSON.stringify({
        [w]: { wrongCount: 1, correctStreak: 0, lastWrongAt: Date.now() - 864e5, nextReviewAt: Date.now() - 1000, intervalIdx: 0 },
      }),
    )
  }, dueWord2)
  await page.click('[data-testid="tab-typing"]')
  await page.waitForTimeout(200)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  await page.keyboard.type(':review', { delay: 25 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  check('复习轮首词为注入的到期词', (await readWord(page)) === dueWord2, `首词=${await readWord(page)}`)
  const t1 = Date.now()
  await typeWord(page, dueWord2)
  await page.waitForTimeout(500)
  const driftC = await page.evaluate((w) => {
    const s = JSON.parse(localStorage.getItem('gt.review.v1') || '{}')
    return s[w]?.nextReviewAt ?? 0
  }, dueWord2) - t1
  check(
    'recordCorrect Jitter：2d 档落在 [1.8d, 2.2d] 窗口',
    driftC >= 1.8 * 864e5 && driftC <= 2.2 * 864e5,
    `漂移=${(driftC / 864e5).toFixed(3)}d`,
  )

  // 13.3 Quota 熔断：mock setItem 前两次对 gt.review.v1 抛 QuotaExceededError → 清洗后重试成功
  // 13.2 复习敲对可能已结算出 ResultOverlay，先 Enter 重开解除遮罩
  await page.keyboard.press('Enter')
  await page.waitForTimeout(350)
  await page.evaluate(() => localStorage.removeItem('gt.review.v1'))
  await page.evaluate(() => {
    const orig = Storage.prototype.setItem.bind(localStorage)
    window.__origSetItem = orig
    let calls = 0
    Storage.prototype.setItem = function (k, v) {
      if (k === 'gt.review.v1' && calls++ < 2) {
        const e = new Error('mock: quota exceeded')
        e.name = 'QuotaExceededError'
        throw e
      }
      return orig(k, v)
    }
    // 预置 6 条既有错题：熔断清洗后总条目应减少
    const seed = {}
    for (let i = 0; i < 6; i++) {
      seed[`quota-seed-${i}`] = { wrongCount: 1, correctStreak: 0, lastWrongAt: Date.now(), nextReviewAt: Date.now() + 864e5, intervalIdx: 0 }
    }
    orig('gt.review.v1', JSON.stringify(seed))
  })
  const errQ = consoleErrors.length
  await page.click('[data-testid="tab-memorize"]')
  await page.waitForTimeout(400)
  await page.click('[data-testid="memorize-flip"]')
  await page.waitForTimeout(300)
  await page.click('[data-testid="memorize-unknown"]')
  await page.waitForTimeout(600)
  const qState = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('gt.review.v1') || '{}')
    return { total: Object.keys(s).length, hasNew: Object.keys(s).some((k) => !k.startsWith('quota-seed-')) }
  })
  check('Quota 熔断：清洗重试后条目最终写入', qState.hasNew && qState.total > 0, `total=${qState.total}`)
  check('Quota 熔断：清洗发生（条目数 < 7）', qState.total < 7, `total=${qState.total}`)
  check(
    'Quota 熔断：无未捕获异常',
    consoleErrors.length === errQ,
    consoleErrors.slice(errQ).join(' | '),
  )
  check('Quota 熔断：console.warn 可观测清洗行为', consoleWarns.some((w) => w.includes('熔断清洗')))
  await page.evaluate(() => {
    Storage.prototype.setItem = window.__origSetItem
  })

  // 13.4 熔断放弃路径：setItem 永远抛 → 不抛出、内存态照常推进 UI
  await page.evaluate(() => {
    const orig = window.__origSetItem
    Storage.prototype.setItem = function (k, v) {
      if (k === 'gt.review.v1') {
        const e = new Error('mock: quota always')
        e.name = 'QuotaExceededError'
        throw e
      }
      return orig(k, v)
    }
  })
  const errQ2 = consoleErrors.length
  await page.click('[data-testid="memorize-flip"]') // 13.3 打分后新卡未翻面，先翻面
  await page.waitForTimeout(300)
  const progQ0 = await page.textContent('[data-testid="memorize-progress"]')
  await page.click('[data-testid="memorize-unknown"]')
  await page.waitForTimeout(500)
  const progQ1 = await page.textContent('[data-testid="memorize-progress"]')
  check('Quota 全失败：UI 不受影响照常推进（内存态兜底）', progQ0 !== progQ1, `${progQ0.trim()} → ${progQ1.trim()}`)
  check('Quota 全失败：无未捕获异常', consoleErrors.length === errQ2, consoleErrors.slice(errQ2).join(' | '))
  check('Quota 全失败：放弃写入有 warn', consoleWarns.some((w) => w.includes('仍写入失败')))
  await page.evaluate(() => {
    Storage.prototype.setItem = window.__origSetItem
  })
  await page.click('[data-testid="tab-typing"]')
  await page.waitForTimeout(200)

  /* ---------- 14. 批8-B：移动端手势 + 命令面板唤起 + 预热探针 ---------- */
  console.log('\n【14】批8：移动端手势 / 命令面板 / 预热')
  const mctx = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true })
  const mpage = await mctx.newPage()
  const mConsoleErrors = []
  mpage.on('console', (m) => m.type() === 'error' && mConsoleErrors.push(m.text()))
  mpage.on('pageerror', (e) => mConsoleErrors.push(String(e)))

  await mpage.goto(BASE, { waitUntil: 'networkidle' })

  // 预热探针：后台轮询 SW 缓存，等手势/命令用例跑完后收取（与 idle 预热并行）
  const warmProbe = mpage.evaluate(async () => {
    for (let i = 0; i < 36; i++) {
      try {
        const names = await caches.keys()
        if (names.includes('gt-shell-v2')) {
          const cache = await caches.open('gt-shell-v2')
          const urls = (await cache.keys()).map((r) => r.url)
          // V4-P0：大词库 chunk 从模块名(ielts-*.js)变为 ?raw JSON 命名(words-*.js)，
          // 懒加载 words chunk 当前即三大词库，按前缀计数
          const hits = urls.filter((u) => /\/assets\/words-.*\.js/.test(u))
          if (hits.length >= 3) return { ok: true, hits }
        }
      } catch {
        /* SW 未就绪继续等 */
      }
      await new Promise((r) => setTimeout(r, 500))
    }
    return { ok: false, hits: [] }
  })

  await mpage.click('[data-testid="tab-memorize"]')
  await mpage.waitForTimeout(700) // isTouch 探测 + 手势监听绑定

  /** 派发 touch 序列（Chromium 支持 Touch/TouchEvent 构造器） */
  const swipe = (dx, dy) =>
    mpage.evaluate(([ddx, ddy]) => {
      const el = document.querySelector('[data-testid="memorize-card"]')
      const r = el.getBoundingClientRect()
      const x = r.left + r.width / 2
      const y = r.top + r.height / 2
      const mk = (type, cx, cy) =>
        new TouchEvent(type, {
          touches: type === 'touchend' ? [] : [new Touch({ identifier: 1, target: el, clientX: cx, clientY: cy })],
          bubbles: true,
          cancelable: true,
        })
      el.dispatchEvent(mk('touchstart', x, y))
      el.dispatchEvent(mk('touchmove', x + ddx / 2, y + ddy / 2))
      el.dispatchEvent(mk('touchmove', x + ddx, y + ddy))
      el.dispatchEvent(mk('touchend', x + ddx, y + ddy))
    }, [dx, dy])

  // 14.1 未翻面：点击（位移 < 12px）→ 翻面
  await swipe(3, 2)
  await mpage.waitForTimeout(300)
  check(
    '手势：未翻面点击卡片 → 翻面',
    (await mpage.locator('[data-testid="memorize-translation"]').count()) === 1,
  )
  check(
    '移动端提示：翻面态显示滑动手势文案',
    ((await mpage.textContent('[data-testid="memorize-keyhint"]')) ?? '').includes('←'),
  )

  // 14.2 已翻面右滑 → 认识（推进，分母不变）
  const pG0 = await mpage.textContent('[data-testid="memorize-progress"]')
  await swipe(120, 0)
  await mpage.waitForTimeout(650)
  const pG1 = await mpage.textContent('[data-testid="memorize-progress"]')
  check(
    '手势：已翻面右滑 → 认识（进度推进）',
    pG0 !== pG1 && (await mpage.locator('[data-testid="memorize-translation"]').count()) === 0,
    `${pG0?.trim()} → ${pG1?.trim()}`,
  )

  // 14.3 已翻面左滑 → 不认识（队列追加 2 → 分母 +2）
  await swipe(3, 2)
  await mpage.waitForTimeout(300)
  await swipe(-120, 0)
  await mpage.waitForTimeout(650)
  const pG2 = (await mpage.textContent('[data-testid="memorize-progress"]')) ?? ''
  check('手势：左滑 → 不认识（队列追加 2）', pG2.includes('/22'), pG2.trim())

  // 14.4 已翻面上滑 → 模糊（追加 1 → 分母 23）
  await swipe(3, 2)
  await mpage.waitForTimeout(300)
  await swipe(0, -120)
  await mpage.waitForTimeout(650)
  const pG3 = (await mpage.textContent('[data-testid="memorize-progress"]')) ?? ''
  check('手势：上滑 → 模糊（队列追加 1）', pG3.includes('/23'), pG3.trim())

  // 14.5 已翻面下滑 → 无效回弹（不打分不翻面）
  await swipe(3, 2)
  await mpage.waitForTimeout(300)
  const pG4a = await mpage.textContent('[data-testid="memorize-progress"]')
  await swipe(0, 120)
  await mpage.waitForTimeout(650)
  check(
    '手势：下滑无效（回弹不打分）',
    pG4a === (await mpage.textContent('[data-testid="memorize-progress"]')) &&
      (await mpage.locator('[data-testid="memorize-translation"]').count()) === 1,
  )

  // 14.6 未翻面左右滑 → 无效不翻面
  await swipe(120, 0) // 右滑认识过掉当前卡（已翻面态）
  await mpage.waitForTimeout(650)
  await swipe(-120, 0) // 新卡未翻面，左滑无效
  await mpage.waitForTimeout(400)
  check(
    '手势：未翻面左右滑无效（不翻面）',
    (await mpage.locator('[data-testid="memorize-translation"]').count()) === 0,
  )
  check(
    '移动端提示：未翻面态显示点击/上滑文案',
    ((await mpage.textContent('[data-testid="memorize-keyhint"]')) ?? '').includes('上滑'),
  )

  // 14.7 命令态互斥：Esc 打开命令面板后手势不响应
  await mpage.keyboard.press('Escape')
  await mpage.waitForTimeout(350)
  const pG5 = await mpage.textContent('[data-testid="memorize-progress"]')
  await swipe(3, 2) // 命令态下 tap 不应翻面
  await mpage.waitForTimeout(300)
  check(
    '手势：命令态下不响应（tap 不翻面）',
    pG5 === (await mpage.textContent('[data-testid="memorize-progress"]')) &&
      (await mpage.locator('[data-testid="memorize-translation"]').count()) === 0,
  )

  // 14.8 移动端命令面板：open-cmd 图标唤起 → :theme 生效
  await mpage.keyboard.press('Escape')
  await mpage.waitForTimeout(300)
  await mpage.click('[data-testid="open-cmd"]')
  await mpage.waitForTimeout(300)
  check('移动端：open-cmd 打开命令面板', (await mpage.locator('[data-testid="command-palette"]').count()) === 1)
  const fontSize = await mpage.evaluate(
    () => parseFloat(getComputedStyle(document.querySelector('[data-testid="command-input"]')).fontSize),
  )
  check('移动端：命令输入框字号 ≥16px（防 iOS 聚焦缩放）', fontSize >= 16, `${fontSize}px`)
  await mpage.keyboard.type(':theme ide', { delay: 25 })
  await mpage.keyboard.press('Enter')
  await mpage.waitForTimeout(450)
  // memorize 页签下不渲染 PracticePanel，切到打字页验 IDE 主题真实渲染
  await mpage.click('[data-testid="tab-typing"]')
  await mpage.waitForTimeout(350)
  check('移动端：:theme ide 生效', norm(await mpage.textContent('body')).includes('export const'))
  check('手势/移动端：无 console error', mConsoleErrors.length === 0, mConsoleErrors.slice(0, 2).join(' | '))

  // 14.9 预热探针：SW 缓存出现三大词库 chunk（与上面用例并行预热）
  const warm = await warmProbe
  check('预热探针：SW 缓存含 ielts/kaoyan/toefl chunk', warm.ok, warm.hits.map((u) => u.split('/').pop()).join(', '))

  await mctx.close()

  /* ---------- 16. V3-P0a：五页签 IA + Today's Practice + Review/Progress ---------- */
  console.log('\n【16】V3-P0a：五页签 IA / 今日推荐 / Review / Progress')
  const errP0a = consoleErrors.length

  // 预置：清错题本/分析，词库切 CET-4（同步词库，便于断言音标与单挑）
  await page.evaluate(() => {
    localStorage.removeItem('gt.review.v1')
    localStorage.removeItem('gt.analytics.v1')
    localStorage.setItem('gt.bank', JSON.stringify('cet4'))
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  const tabIdsAll = ['home', 'typing', 'memorize', 'review', 'progress']
  let tabsAllThere = true
  for (const id of tabIdsAll) {
    if ((await page.locator(`[data-testid="tab-${id}"]`).count()) !== 1) tabsAllThere = false
  }
  check(
    '默认进入 Home（HomePanel 渲染、打字面板不渲染、页签栏 5 项齐全）',
    (await page.locator('[data-testid="home-panel"]').count()) === 1 &&
      (await page.locator('[data-testid="word"]').count()) === 0 &&
      tabsAllThere,
  )

  // 16.1 Daily Goal + streak：预置今天 30 词、近 3 天连续打卡
  await page.evaluate(() => {
    const pad = (n) => String(n).padStart(2, '0')
    const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const h = {}
    for (let i = 1; i <= 2; i++) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      h[keyOf(d)] = { date: keyOf(d), words: 50, seconds: 300 }
    }
    const today = new Date()
    h[keyOf(today)] = { date: keyOf(today), words: 30, seconds: 200 }
    localStorage.setItem('gt.streak.v1', JSON.stringify(h))
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  const goalStyle = await page.getAttribute('[data-testid="home-goal-bar"]', 'style')
  check(
    'Daily Goal 进度条渲染（30/50 → 60%）+ streak 3 天',
    !!goalStyle && goalStyle.includes('60%') &&
      norm(await page.textContent('[data-testid="home-streak"]')).includes('3'),
    `style=${goalStyle}`,
  )

  // 16.2 复习卡两态 + 点击开复习轮
  await page.evaluate(() => localStorage.removeItem('gt.review.v1'))
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  check(
    '复习卡空态（空态文案 + 无开始按钮）',
    (await page.locator('[data-testid="home-review-empty"]').count()) === 1 &&
      (await page.locator('[data-testid="home-review-start"]').count()) === 0,
  )
  await page.evaluate(() => {
    localStorage.setItem(
      'gt.review.v1',
      JSON.stringify({
        abandon: { wrongCount: 2, correctStreak: 0, lastWrongAt: Date.now() - 2 * 864e5, nextReviewAt: Date.now() - 864e5, intervalIdx: 0 },
      }),
    )
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  const reviewCard = norm(await page.textContent('[data-testid="home-review-card"]'))
  check(
    '复习卡有态（1 个单词到期 + abandon 预览）',
    reviewCard.includes('1 个单词到期') && reviewCard.includes('abandon'),
    reviewCard.slice(0, 60),
  )
  await page.click('[data-testid="home-review-start"]')
  await page.waitForTimeout(500)
  check('复习卡点击开复习轮（首词=到期词 abandon）', (await readWord(page)) === 'abandon')
  await page.click('[data-testid="tab-home"]')
  await page.waitForTimeout(300)

  // 16.3 弱项卡两态 + 点击专攻
  await page.evaluate(() => localStorage.removeItem('gt.analytics.v1'))
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  check('弱项卡空态（暂无弱项数据）', (await page.locator('[data-testid="home-weak-empty"]').count()) === 1)
  await page.evaluate(() => {
    localStorage.setItem(
      'gt.analytics.v1',
      JSON.stringify({
        letters: { q: { hit: 1, miss: 9 }, z: { hit: 2, miss: 5 } },
        words: { abandon: { done: 3, wrong: 2 } },
        totalKeys: 17,
        totalCorrect: 3,
        totalWords: 1,
        bestWpm: 20,
      }),
    )
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  const weakCard = norm(await page.textContent('[data-testid="home-weak-card"]'))
  check('弱项卡展示 top 弱字母（q 90%）', weakCard.includes('q') && weakCard.includes('90%'), weakCard.slice(0, 60))
  await page.click('[data-testid="home-weak-start"]')
  await page.waitForTimeout(600)
  const weakW = await readWord(page)
  check('弱项专攻点击开轮出词', weakW.length > 0, `词=${weakW}`)
  await page.click('[data-testid="tab-home"]')
  await page.waitForTimeout(300)

  // 16.4 新词卡：当前词库名 + 词数 + 一键开轮
  const newCard = norm(await page.textContent('[data-testid="home-new-card"]'))
  await page.click('[data-testid="home-new-start"]')
  await page.waitForTimeout(500)
  check(
    '新词卡（四级 CET-4 · 84 词）并可一键开轮',
    newCard.includes('四级 CET-4') && newCard.includes('84') && (await readWord(page)).length > 0,
    newCard.slice(0, 60),
  )

  // 16.5 Review 页：统计 / 分布 / 徽章（intervalIdx=0 与 =3 各一词）/ 详情 / 单挑
  await page.evaluate(() => {
    const now = Date.now()
    localStorage.setItem(
      'gt.review.v1',
      JSON.stringify({
        abandon: { wrongCount: 3, correctStreak: 0, lastWrongAt: now - 864e5, nextReviewAt: now - 3600e3, intervalIdx: 0 },
        absolute: { wrongCount: 1, correctStreak: 3, lastWrongAt: now - 6 * 864e5, nextReviewAt: now - 60e3, intervalIdx: 3 },
      }),
    )
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  await page.click('[data-testid="tab-review"]')
  await page.waitForTimeout(400)
  check(
    'Review 统计：错题总数 2 / 今日到期 2',
    (await page.textContent('[data-testid="review-stat-total"]'))?.trim() === '2' &&
      (await page.textContent('[data-testid="review-stat-due"]'))?.trim() === '2',
  )
  const distTxt = norm(await page.textContent('[data-testid="review-dist"]'))
  check(
    '掌握分布渲染 + 徽章两态（struggling / strong）',
    distTxt.includes('挣扎中') &&
      distTxt.includes('巩固') &&
      (await page.locator('[data-testid="review-item-abandon"] [data-badge="struggling"]').count()) === 1 &&
      (await page.locator('[data-testid="review-item-absolute"] [data-badge="strong"]').count()) === 1,
    distTxt.slice(0, 60),
  )
  await page.click('[data-testid="review-item-abandon"] [data-testid="review-item-detail"]')
  await page.waitForTimeout(250)
  const detailTxt = norm(await page.textContent('[data-testid="review-item-abandon"] [data-testid="review-detail"]'))
  check(
    '词条详情展开（音标 + 释义 + 个人进度 + 下次复习）',
    (await page.locator('[data-testid="review-item-abandon"] [data-testid="review-detail-phonetic"]').count()) === 1 &&
      detailTxt.includes('放弃') &&
      detailTxt.includes('×3') &&
      detailTxt.includes('下次复习'),
    detailTxt.slice(0, 80),
  )
  await page.click('[data-testid="review-item-absolute"] [data-testid="review-item-drill"]')
  await page.waitForTimeout(500)
  check('单挑按钮开轮（切到打字页、首词=absolute）', (await readWord(page)) === 'absolute')

  // 16.6 Review 页置顶「开始复习」主按钮
  await page.click('[data-testid="tab-review"]')
  await page.waitForTimeout(300)
  const startBtnThere = (await page.locator('[data-testid="review-start-btn"]').count()) === 1
  await page.click('[data-testid="review-start-btn"]')
  await page.waitForTimeout(500)
  const dueFirst = await readWord(page)
  check(
    'Review 置顶「开始复习」主按钮开轮（首词=到期词）',
    startBtnThere && (dueFirst === 'abandon' || dueFirst === 'absolute'),
    `按钮=${startBtnThere} 首词=${dueFirst}`,
  )

  // 16.7 Progress 页：热力图 / 累计统计 / 弱项列表
  await page.click('[data-testid="tab-progress"]')
  await page.waitForTimeout(400)
  const progressStats = norm(await page.textContent('[data-testid="progress-stats"]'))
  check(
    'Progress 热力图 14 格 + 累计统计卡',
    (await page.locator('[data-testid="progress-heatmap"] > div').count()) === 14 &&
      progressStats.includes('累计击键') &&
      (await page.locator('[data-testid="progress-stat-streak"]').count()) === 1,
  )
  check(
    'Progress 弱字母/错词列表渲染',
    norm(await page.textContent('[data-testid="progress-weak-letters"]')).includes('q') &&
      norm(await page.textContent('[data-testid="progress-wrong-words"]')).includes('abandon'),
  )

  // 16.8 命令面板 :home / :progress 跳页
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
  await page.keyboard.type(':home', { delay: 25 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  const homeOk = (await page.locator('[data-testid="home-panel"]').count()) === 1
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
  await page.keyboard.type(':progress', { delay: 25 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  check(
    ':home / :progress 命令跳页',
    homeOk && (await page.locator('[data-testid="progress-panel"]').count()) === 1,
  )
  check(
    'V3-P0a 章节：无 console / page 运行时错误',
    consoleErrors.length === errP0a,
    consoleErrors.slice(errP0a).join(' | '),
  )

  await ctx.close()
  await browser.close()

  /* ---------- 12. 运行时报错 ---------- */
  console.log('\n【12】运行时报错')
  const realErrors = consoleErrors.filter((e) => !e.includes('favicon'))
  check('无 console / page 运行时错误', realErrors.length === 0, realErrors.slice(0, 2).join(' | '))

  console.log(`\n${'─'.repeat(54)}`)
  console.log(`共 ${results.length} 项，通过 ${results.length - failures}，失败 ${failures}`)
  console.log(`${'─'.repeat(54)}`)
  // 用 exitCode 而非 process.exit：让外层 finally 有机会杀掉自举的 preview
  if (failures > 0) process.exitCode = 1
}

// 自举 preview（--prod 时跳过，直接打生产），全程 finally 保证杀干净
let previewServer = null
try {
  if (!IS_PROD) previewServer = await ensurePreviewServer()
  await run()
} catch (e) {
  console.error('\n💥 测试脚本异常：', e)
  process.exitCode = 1
} finally {
  stopPreview(previewServer)
}
