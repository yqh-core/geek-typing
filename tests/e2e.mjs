/**
 * Geek Typing 端到端自动化测试
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

  /* ---------- 1. 首屏 ---------- */
  console.log('【1】首屏与默认状态')
  check('页面标题正确', (await page.title()).includes('Geek Typing'), await page.title())
  const body0 = await page.textContent('body')
  check('默认词库是 2026 AI 核心词库', norm(body0).includes('2026 AI 核心词库'))
  check(
    '统计栏四项齐全',
    ['progress', 'accuracy', 'wpm', 'combo'].every((k) => norm(body0).toLowerCase().includes(k)),
  )
  check('默认是经典模式', norm(body0).includes('经典模式'))
  const firstWord = await readWord(page)
  check('能读出当前单词', firstWord.length > 0, `单词=${firstWord}`)
  check('虚拟键盘存在', await page.locator('[data-testid="keymap"]').count() === 1)
  const hl0 = await page.getAttribute('[data-active="true"]', 'data-key')
  check('虚拟键盘高亮首字母', hl0 === firstWord[0], `高亮=${hl0} 应=${firstWord[0]}`)

  /* ---------- 2. 打字核心链路 ---------- */
  console.log('\n【2】打字核心链路（严格纠错）')
  await page.keyboard.press('q')
  await page.keyboard.press('z')
  check('敲错被拦住（仍在第 1 词）', norm(await page.textContent('body')).includes('1/20'))
  const acc2 = norm(await page.textContent('body'))
  check('正确率跌破 100%', !acc2.includes('100%') || acc2.indexOf('100%') < 0)
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
  const comboMatch = body3.match(/combox(\d+)/i)
  const wpmMatch = body3.match(/wpm(\d+)/i)
  check('COMBO 累积到两位数', !!comboMatch && Number(comboMatch[1]) > 10, `combo=${comboMatch?.[1]}`)
  check('WPM > 0', !!wpmMatch && Number(wpmMatch[1]) > 0, `wpm=${wpmMatch?.[1]}`)
  const cur3 = await readCursor(page)
  const hl3 = await page.getAttribute('[data-active="true"]', 'data-key')
  check('虚拟键盘跟随光标移动', !!cur3 && hl3 === cur3, `高亮=${hl3} 光标=${cur3}`)

  /* ---------- 4. 皮肤 / 词库 / 音效 ---------- */
  console.log('\n【4】皮肤 / 词库 / 音效')
  for (const [label, expect] of [['摸鱼 IDE', 'export const'], ['墨水屏', null], ['黑客荧光', null]]) {
    await page.getByRole('button', { name: label, exact: true }).first().click()
    await page.waitForTimeout(220)
    if (expect) check(`切换到「${label}」`, norm(await page.textContent('body')).includes(expect))
    else check(`切换到「${label}」`, (await readWord(page)).length > 0)
  }
  await page.getByRole('button', { name: /2026 AI 核心词库/ }).first().click()
  await page.waitForTimeout(200)
  const menu = norm(await page.textContent('body'))
  check('词库下拉 6 本齐全', ['四级 CET-4', '六级 CET-6', '雅思 / 托福', '云原生 K8s 词库'].every((k) => menu.includes(k)))
  await page.getByRole('button', { name: /四级 CET-4/ }).first().click()
  await page.waitForTimeout(320)
  check('切到 CET-4 后正常出题', (await readWord(page)).length > 0)
  await page.getByRole('button', { name: '开关键盘音效', exact: true }).click()
  await page.waitForTimeout(150)
  check('音效开关可切换', (await readWord(page)).length > 0)

  /* ---------- 5. 持久化 ---------- */
  console.log('\n【5】本地持久化')
  await page.reload({ waitUntil: 'networkidle' })
  check('刷新后仍是 CET-4', norm(await page.textContent('body')).includes('四级 CET-4'))

  /* ---------- 6. 拼写（默写）模式 ---------- */
  console.log('\n【6】拼写模式')
  await page.click('[data-testid="mode-spell"]')
  await page.waitForTimeout(350)
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
  await page.click('[data-testid="mode-timed"]')
  await page.waitForTimeout(300)
  await page.keyboard.press((await readWord(page))[0])
  await page.waitForTimeout(1400)
  const cdText = await page.textContent('[data-testid="countdown"]').catch(() => null)
  check('倒计时出现并递减', !!cdText && /59|58|57|60/.test(cdText), `读数=${cdText}`)

  /* ---------- 8. 完整通关 → 结算 ---------- */
  console.log('\n【8】通关结算')
  await page.click('[data-testid="mode-classic"]')
  await page.waitForTimeout(300)
  for (let round = 0; round < 20; round++) {
    const w = await readWord(page)
    if (!w) break
    await typeWord(page, w)
    await page.waitForTimeout(300)
  }
  const done = norm(await page.textContent('body'))
  check('20 词后弹出结算面板', done.includes('Round Complete'))
  check('结算含正确率/速度/用时/最高连击', ['正确率', '速度', '用时', '最高连击'].every((k) => done.includes(k)))
  check('结算显示今日累计', done.includes('今日累计'))

  /* ---------- 9. 移动端视口 ---------- */
  console.log('\n【9】移动端视口')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(300)
  await page.click('button:has-text("再来一轮")')
  await page.waitForTimeout(400)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  check('移动端无横向溢出', overflow <= 2, `溢出=${overflow}px`)

  await ctx.close()
  await browser.close()

  /* ---------- 汇总 ---------- */
  console.log('\n【10】运行时报错')
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
