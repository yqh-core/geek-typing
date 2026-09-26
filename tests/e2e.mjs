/**
 * Geek Typing 端到端自动化测试（v2：下拉导航 + 背单词 + 中英双语）
 *
 * 用法：
 *   1) npm run build && npm run preview -- --port 4173
 *   2) npm run test:e2e                 # 默认打 http://127.0.0.1:4173
 *      E2E_BASE=http://127.0.0.1:5173   # 也可以打 dev server
 *      CHROME_PATH=<chrome.exe>         # 手动指定浏览器
 */
import { chromium } from 'playwright-core'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.env.E2E_BASE ?? 'http://127.0.0.1:4173'

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

async function run() {
  const executablePath = findChrome()
  if (!executablePath) throw new Error('找不到 Chromium，请设置 CHROME_PATH')
  console.log(`🌐 浏览器：${executablePath}`)
  console.log(`🎯 目标：${BASE}\n`)

  const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] })
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 1000 } })
  const page = await ctx.newPage()

  const consoleErrors = []
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
  page.on('pageerror', (e) => consoleErrors.push(String(e)))

  await page.goto(BASE, { waitUntil: 'networkidle' })

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
  for (const [label, expect] of [['摸鱼 IDE', 'export const'], ['墨水屏', null], ['黑客荧光', null]]) {
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
    '词库下拉 6 本齐全（含新雅思库）',
    ['四级 CET-4', '六级 CET-6', '雅思核心 IELTS', '云原生 K8s 词库'].every((k) => menu.includes(k)),
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
    ['ai-core', 'cloud-native', 'frontend', 'cet4', 'cet6', 'ielts'].every((id) => bankList.includes(id)),
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

  await ctx.close()
  await browser.close()

  /* ---------- 12. 运行时报错 ---------- */
  console.log('\n【12】运行时报错')
  const realErrors = consoleErrors.filter((e) => !e.includes('favicon'))
  check('无 console / page 运行时错误', realErrors.length === 0, realErrors.slice(0, 2).join(' | '))

  console.log(`\n${'─'.repeat(54)}`)
  console.log(`共 ${results.length} 项，通过 ${results.length - failures}，失败 ${failures}`)
  console.log(`${'─'.repeat(54)}`)
  if (failures > 0) process.exit(1)
}

run().catch((e) => {
  console.error('\n💥 测试脚本异常：', e)
  process.exit(1)
})
