/**
 * Geek Typing 端到端自动化测试（v2：下拉导航 + 背单词 + 中英双语）
 *
 * 用法：
 *   npm run test:e2e            # 一键：自举 vite preview（4173 空闲则新起；非本项目占用则报错）+ 全量用例
 *   npm run test:e2e:prod       # 打生产 https://geek-typing.pages.dev（只读）
 *   E2E_BASE=http://127.0.0.1:5173 node tests/e2e.mjs   # 也可以打 dev server
 *   CHROME_PATH=<chrome.exe>                            # 手动指定浏览器
 */
import { chromium } from 'playwright-core'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ensurePreviewServer, stopPreview } from './preview-server.mjs'
// 预热清单的解析实现与 check-bundle 判据 3/6 共用（scripts/content/warmup-ids.mjs）：
// 事实源只有 registry.ts 一个，这里不再自己写一遍正则 —— 两套口径迟早漂移。
import { readWarmUpIds } from '../scripts/content/warmup-ids.mjs'

const PROD_BASE = 'https://geek-typing.pages.dev'
const IS_PROD = process.argv.includes('--prod')
// 本地自举端口：e2e 固定 4173；offline-audit 用 4174。两套件端口隔离，
// 避免连跑时第一条命令的 preview 拆除窗口污染第二条（EVIDENCE-INDEX §9.4）。
const LOCAL_PORT = 4173
const BASE = process.env.E2E_BASE ?? (IS_PROD ? PROD_BASE : `http://127.0.0.1:${LOCAL_PORT}`)

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

/* ---------------- 导航策略：为什么不用 'networkidle' ----------------
 * CI run 36308273299 实测：16 处 waitUntil:'networkidle' 让 test:e2e 卡死 25 分钟未完成。
 * 根因是页面自身的后台流量：
 *   - public/sw.js 注册后，install 阶段 precacheShell() 会把首页 HTML 里所有 /assets/* 逐个拉一遍；
 *   - src/main.tsx 的 warmUpVocabulary() 在 window load 后经 requestIdleCallback 预拉
 *     registry.ts 的 WARMUP_IDS 清单内的 words-*.js（P18-B 遗留项 9.2 从写死三库收敛为清单驱动，
 *     当前 [kaoyan, toefl]，合计约 1 MB）。
 * networkidle 要求「500ms 内无任何进行中的网络请求」；CI runner 首次无缓存、跨公网拉这
 * 1.4 MB 时，这个窗口长时间无法出现 → page.goto/reload 一直等到 Playwright 默认 30s 超时，
 * 16 次累积即卡死。本地 chunk 已在磁盘缓存里，网络瞬间 idle，所以从未暴露。
 *
 * 改为 'load'（HTML 与同步资源已就绪，含首屏 index-*.js），后台预热/precache 仍在跑也没关系 ——
 * 各用例真正依赖的元素由下面的 NAV_TIMEOUT + waitForTestId 保证，不依赖「网络静默」这个假信号。
 */
const NAV_TIMEOUT = 30000

/** 锁定 UI 语言为中文。
 *  应用按 navigator.language 探测默认语言（src/i18n/index.tsx:24，以 'zh' 前缀判断），
 *  而 CI runner 的 navigator.language 是 en-US ⇒ 本文件里大量按中文文案写的断言
 *  （102 条）会在 CI 上全数假失败，且「等文案就位」会一路等到超时、把 job 拖死。
 *  语言不是这些用例的变量，故显式钉死为默认值。
 *
 *  注意**只作默认值、不覆盖已有选择**：addInitScript 在每次导航（含 reload）都会执行，
 *  若无条件写入，会把「用户切到 en 后刷新应保持 en」这条正确行为一起改掉（§10 用例会失败）。
 *  因此仅在 key 不存在时写入 —— 首次进入消除环境依赖，显式切换仍可持久化。
 *  语言切换用例（点 lang-en / lang-zh）走显式点击，不受影响。 */
const lockLangZh = (ctx) =>
  ctx.addInitScript(() => {
    try {
      if (window.localStorage.getItem('gt.lang') === null) {
        window.localStorage.setItem('gt.lang', 'zh')
      }
    } catch {
      /* localStorage 不可用时忽略，回落到 navigator 探测 */
    }
  })

/** 导航（goto/reload）统一入口：load 事件就绪 + 显式超时，严禁再退回 networkidle */
const reloadPage = (page) => page.reload({ waitUntil: 'load', timeout: NAV_TIMEOUT })
const gotoPage = (page) => page.goto(BASE, { waitUntil: 'load', timeout: NAV_TIMEOUT })

/** 轮询等待 body 文本包含全部 needle（带超时）。替代「固定 waitForTimeout + 一次性抓 body」
 *  的竞态写法：React 分帧渲染下，慢 runner 会在渲染中途被采样而假失败。 */
async function waitForBodyText(page, needles, timeoutMs = 8000) {
  const read = async () => (await page.textContent('body').catch(() => '')) ?? ''
  const deadline = Date.now() + timeoutMs
  let body = await read()
  while (Date.now() < deadline) {
    if (needles.every((n) => body.includes(n))) return body
    await page.waitForTimeout(100)
    body = await read()
  }
  return body
}

/** 轮询等待某 testid 元素挂载（带超时）。返回是否命中，供断言组合使用。 */
async function waitForTestId(page, testId, timeoutMs = 8000) {
  try {
    await page.waitForSelector(`[data-testid="${testId}"]`, { state: 'attached', timeout: timeoutMs })
    return true
  } catch {
    return false
  }
}

// ===== P1.5-S4 State B 存储夹具助手 =====
const V2_KEYS = ['gt.learning.v2', 'gt.migration.v1', 'gt.learning.v2.backup', 'gt.letterStats.v1', 'gt.totals.v1', 'gt.review.v1', 'gt.memorize.v1']
// 清空 Learning 存储家族（含迁移标记）：下次 reload 必然重跑迁移（若有 v1 种子）
const clearLearningStorage = (page) => page.evaluate((keys) => { for (const k of keys) localStorage.removeItem(k) }, V2_KEYS)
const readV2Store = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('gt.learning.v2') || '{}'))
// 按词形取复习条目（contentId 第 4 段 = 原词形；legacy:* 天然排除；无 review 子记录 = null）
const readReviewEntry = async (page, word) => {
  const store = await readV2Store(page)
  const hit = Object.entries(store).find(([k, v]) => k.startsWith('content:word:') && k.split(':')[3] === word && v && v.review)
  return hit ? hit[1].review : null
}
// 轮询等 v2 出现任意带 review 的记录（打分落盘有 UI 动画后置延迟，固定 sleep 偶发读空）
const waitForV2Review = async (page, timeoutMs = 4000) => {
  for (let i = 0; i < timeoutMs / 200; i++) {
    const has = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('gt.learning.v2') || '{}')
      return Object.values(s).some((v) => v && v.review)
    })
    if (has) return true
    await page.waitForTimeout(200)
  }
  return false
}
// 轮询等指定词形的 review 条目出现（返回条目或 null）
const waitForReviewEntry = async (page, word, timeoutMs = 4000) => {
  for (let i = 0; i < timeoutMs / 200; i++) {
    const e = await readReviewEntry(page, word)
    if (e) return e
    await page.waitForTimeout(200)
  }
  return null
}
// v1 形状种子（字段与旧夹具逐字一致）→ reload 后由启动迁移转成 v2 正式记录
const seedReviewV1 = (page, entries) => page.evaluate((e) => { localStorage.setItem('gt.review.v1', JSON.stringify(e)) }, entries)

async function typeWord(page, word) {
  // 给足间隔，避免按键快过 React 状态更新导致漏拍
  await page.keyboard.type(word.toLowerCase(), { delay: 20 })
}

/** v2：模式按钮在「练习」下拉里 —— 先点开下拉再点模式项 */
async function pickMode(page, modeId) {
  await page.click('[data-testid="dropdown-practice"]')
  await page.waitForTimeout(150)
  await page.click(`[data-testid="mode-${modeId}"]`)
  await waitForTestId(page, 'word') // 模式切换后等练习面板按新模式重渲染就位
  await page.waitForTimeout(300)
}

/** V3-P0a：默认页签是 Home（今日推荐），打字类用例先切到 typing 页签。
 *  必须用 waitForSelector 等页签真正可点：reload 后改为 waitUntil:'load'，页签的
 *  点击监听可能在 load 之后才由 React 挂上（CI 慢 runner 上更明显），
 *  固定 200ms 会让 click 打在「尚未激活的页签」上（静默不改页签，后续断言全错）。 */
async function gotoTyping(page) {
  const tab = page.locator('[data-testid="tab-typing"]')
  await tab.waitFor({ state: 'visible', timeout: NAV_TIMEOUT })
  await tab.click({ timeout: NAV_TIMEOUT })
  // 优先等练习面板出现；代码模式下 word 存在但无 keymap，故 word 就位即可返回
  await waitForTestId(page, 'word', 5000)
}

async function run() {
  const executablePath = findChrome()
  if (!executablePath) throw new Error('找不到 Chromium，请设置 CHROME_PATH')
  console.log(`🌐 浏览器：${executablePath}`)
  console.log(`🎯 目标：${BASE}\n`)

  const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] })
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 1000 } })
  await lockLangZh(ctx)
  const page = await ctx.newPage()

  const consoleErrors = []
  const consoleWarns = []
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text())
    if (m.type() === 'warning') consoleWarns.push(m.text())
  })
  page.on('pageerror', (e) => consoleErrors.push(String(e)))

  await gotoPage(page)
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
  check(
    '词库下拉含导入词库入口',
    (await page.locator('[data-testid="open-bank-manager-import"]').count()) === 1,
  )
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
  await reloadPage(page)
  await gotoTyping(page) // V3-P0a：reload 后落 Home
  // 词库名经 localStorage 恢复后由 React effect 读回，等文案就位再断言
  await waitForBodyText(page, ['四级 CET-4'])
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

  /* 回归锁定（P1.6-D）：拼错后**不退格**、继续敲对下一个字母，红闪必须即时消退。
   * 背景：拼写模式允许自由输入。P1.6-D 把打字状态机搬进 src/hooks/useTypingRound.ts 时
   * 漏抄了旧 App.tsx:519 的 `setErrorFlash(false)`，导致红闪要等满 280ms 定时器才消失。
   * 原有用例走的是 Backspace 分支（该分支自带清红闪），故零覆盖、静默漏过。
   *
   * 判据不是「最终会消失」（两种实现都会被定时器归位），而是**多久消失**：
   *   有修复 ≈ 1 帧（<60ms）；无修复 = 等满 280ms 定时器（此处已先行等待 120ms，缺口 ≈160ms）。
   * 阈值取 120ms，两侧各留约 2 倍余量。红闪的 DOM 表现 = 光标格 animate-shake。 */
  await page.keyboard.press(spellWord[0] === 'z' ? 'x' : 'z') // 再敲一个错字母
  await page.waitForTimeout(120)
  check('拼错 120ms 时红闪仍在（用例前置条件成立）', (await page.locator('.animate-shake').count()) >= 1)
  const shakeClearWatch = page.evaluate(
    () =>
      new Promise((resolve) => {
        const t0 = performance.now()
        const tick = () => {
          if (document.querySelectorAll('.animate-shake').length === 0) return resolve(Math.round(performance.now() - t0))
          if (performance.now() - t0 > 2000) return resolve(-1)
          requestAnimationFrame(tick)
        }
        tick()
      }),
  )
  await page.keyboard.press(spellWord.toLowerCase()[1]) // 不退格，直接敲对下一个字母
  const shakeClearMs = await shakeClearWatch
  check(
    '拼错后不退格继续敲对 → 红闪即时消退（<120ms，非 280ms 定时器兜底）',
    shakeClearMs >= 0 && shakeClearMs < 120,
    `敲对后 ${shakeClearMs}ms 消退；漏抄修复时应 ≈160ms`,
  )
  // 复原：清掉这两个字母，回到空输入再走完整拼写流程
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Backspace')
  await page.waitForTimeout(120)

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
  await reloadPage(page)
  await waitForTestId(page, 'tab-memorize') // 等应用壳挂载，页签可点
  await page.click('[data-testid="tab-memorize"]')
  await waitForTestId(page, 'memorize-card', 10000)
  await page.waitForTimeout(500)
  // P1.5-S4 State B：背单词进度写 gt.learning.v2 的 memorize 子记录，不再写 gt.memorize.v1
  const memCount = Object.values(await readV2Store(page)).filter((v) => v && v.memorize).length
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
  await reloadPage(page)
  // 语言偏好经 localStorage 恢复后由 React 渲染 → 轮询等英文导航就位
  await waitForBodyText(page, ['Typing', 'Practice'])
  const bodyEn2 = norm(await page.textContent('body'))
  check('en 刷新保持', bodyEn2.includes('Typing') && bodyEn2.includes('Practice'))
  await waitForTestId(page, 'lang-zh')
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
  // B 步 9.5：cloud-native 改 lazy ⇒ 切库后词表是异步就位的，bankWords 为空时
  // [data-testid="word"] 根本不渲染（PracticePanel.tsx），readWord 的一次性快照会拿到 ''
  // ⇒ 先轮询等 word 挂载再读词（waitForTestId，本文件同款写法）。
  // ⚠️ 不许用「加长 waitForTimeout」糊过去：那是把竞态藏起来，CI runner 比本地慢一个量级，
  // tests/offline-audit.mjs:114 注释记着同款坑（固定 waitForTimeout + 一次性抓 body 会随机变红）。
  await waitForTestId(page, 'word')
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
  await reloadPage(page)
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

  // 14.2 错题入库：classic 敲错一个字母再敲对 → gt.learning.v2 出现 review 子记录
  await clearLearningStorage(page) // 清掉前面用例的学习记录（含迁移标记），保证断言精确
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
  // 3c：cet4 由 inline 改 lazy ⇒ 切库后词表是异步就位的，bankWords 为空时 [data-testid="word"]
  // 根本不渲染（PracticePanel.tsx），readWord 的一次性快照会拿到 ''。先等 word 挂载再读词。
  await waitForTestId(page, 'word')
  const wrongTarget = await readWord(page)
  check('预置：classic 出词', wrongTarget.length > 0, `词=${wrongTarget}`)
  await page.keyboard.press(wrongTarget[0] === 'z' ? 'x' : 'z') // 故意敲错
  await page.waitForTimeout(150)
  await typeWord(page, wrongTarget) // 敲对完成整词
  await page.waitForTimeout(500)
  const review1 = await readReviewEntry(page, wrongTarget)
  check(
    '敲错的词入库（wrongCount=1、间隔归 0、明天到期）',
    review1?.wrongCount === 1 &&
      review1?.intervalIdx === 0 &&
      review1?.nextReviewAt > Date.now(),
    JSON.stringify(review1 ?? null),
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
  // P1.5-S4：v1 形状种子 + reload → 启动迁移把种子转成 v2 正式记录
  await clearLearningStorage(page)
  await seedReviewV1(page, {
    [dueWord]: {
      wrongCount: 1,
      correctStreak: 0,
      lastWrongAt: Date.now() - 2 * 864e5,
      nextReviewAt: Date.now() - 864e5,
      intervalIdx: 0,
    },
  })
  await reloadPage(page)
  await page.waitForTimeout(500)
  await waitForTestId(page, 'open-stats')
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
  const review2 = await readReviewEntry(page, dueWord)
  check(
    '复习全对间隔推进（intervalIdx 0→1、nextReviewAt 顺延）',
    review2?.intervalIdx === 1 &&
      review2?.correctStreak === 1 &&
      review2?.nextReviewAt > Date.now() + 864e5,
    JSON.stringify(review2 ?? null),
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
  // P1.5-S4：v1 形状种子 + reload → 启动迁移转成 v2 正式记录
  await clearLearningStorage(page)
  await seedReviewV1(page, {
    [gradWord]: {
      wrongCount: 2,
      correctStreak: 4,
      lastWrongAt: Date.now() - 16 * 864e5,
      nextReviewAt: Date.now() - 864e5,
      intervalIdx: 4,
    },
  })
  await reloadPage(page)
  await page.waitForTimeout(500)
  await waitForTestId(page, 'tab-typing') // 等应用壳挂载后再按 Esc（面板仅在有监听时打开）
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  await page.keyboard.type(':review', { delay: 25 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  check('毕业候选被拉进复习轮', (await readWord(page)) === gradWord)
  await typeWord(page, gradWord)
  await page.waitForTimeout(500)
  // P1.5-S4：v2 毕业语义 = 摘除 review 子记录（同条记录可能残留 analytics 子记录，
  // 因打字完成会写 recordWordDoneV2），锁的语义是「review 条目移除」，不是整条记录消失。
  const v2AfterGrad = await readV2Store(page)
  check(
    '走完 15 天间隔毕业移除条目',
    (await readReviewEntry(page, gradWord)) === null,
    `剩余=${JSON.stringify(Object.keys(v2AfterGrad))}`,
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
  await clearLearningStorage(page)
  await page.waitForTimeout(150)
  const kyWrong = await readWord(page)
  await page.keyboard.press(kyWrong[0] === 'z' ? 'x' : 'z') // 故意敲错
  await page.waitForTimeout(150)
  await typeWord(page, kyWrong)
  await page.waitForTimeout(500)
  const kyReview = await readReviewEntry(page, kyWrong)
  check('考研词敲错入库（懒词库下错题本可用）', kyReview?.wrongCount === 1, JSON.stringify(kyReview ?? null))
  // P1.5-S4：clear + v1 种子 → 下方 reload 触发启动迁移，种子进 v2。
  //    夹具修复：注入词改用 kaoyan 独有词 overpass —— kyWrong 这类屏幕词可能同属多包
  //    （pearl∈kaoyan+toefl），种子迁移判 ambiguous 归入 legacy → :review 不开轮。
  //    （打字敲错写入带归属上下文不受多包影响，「敲错入库」已由上方 readReviewEntry(kyWrong) 验证。）
  await clearLearningStorage(page)
  await seedReviewV1(page, {
    overpass: {
      wrongCount: 1,
      correctStreak: 0,
      lastWrongAt: Date.now() - 2 * 864e5,
      nextReviewAt: Date.now() - 864e5,
      intervalIdx: 0,
    },
  })
  await reloadPage(page)
  await page.waitForTimeout(800) // 等懒加载词库 chunk 拉取 + bankWords 就位
  await gotoTyping(page) // V3-P0a：reload 后落 Home，readWord 需要打字面板
  for (let i = 0; i < 15 && (await readWord(page)).length === 0; i++) await page.waitForTimeout(200)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  await page.keyboard.type(':review', { delay: 25 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  check('懒词库下 :review 拉出到期考研词', (await readWord(page)) === 'overpass', `首词=${await readWord(page)}`)

  /* ---------- 13. 批8-A：艾宾浩斯 Jitter + Quota 熔断 ---------- */
  console.log('\n【13】批8：Jitter 抗雪崩 + Quota 熔断')

  // 14 节复习轮可能已结算出 ResultOverlay（z-30 遮罩拦截 UI 点击），Enter 重开解除
  await page.keyboard.press('Enter')
  await page.waitForTimeout(350)

  // 13.1 recordWrong Jitter 窗口：背单词打「不认识」→ nextReviewAt ∈ t0+[0.85d, 1.15d]
  await clearLearningStorage(page)
  await page.click('[data-testid="tab-memorize"]')
  await page.waitForTimeout(400)
  const t0 = Date.now()
  await page.click('[data-testid="memorize-flip"]')
  await page.waitForTimeout(300)
  await page.click('[data-testid="memorize-unknown"]')
  await page.waitForTimeout(450)
  // State B：清空后 v2 里唯一的 review 记录就是刚写入的这条。
  // P1.5-S4 夹具修复：打分落盘存在 >450ms 的 UI 动画后置延迟，固定 sleep 会偶发读空
  // —— 改成轮询等写入落地（下方 1d 档 Jitter 窗口断言不变）。
  await waitForV2Review(page)
  const reviewsW = Object.values(await readV2Store(page)).filter((v) => v && v.review)
  // ⚠️ v2 记录的 nextReviewAt 在 review 子记录里（v1 store 的值才是扁平 ReviewEntry），
  //    取值必须下钻一层 —— 窗口断言本身不变。
  const driftW = (reviewsW[0]?.review?.nextReviewAt ?? 0) - t0
  check(
    'recordWrong Jitter：1d 档落在 [0.85d, 1.15d] 窗口',
    driftW >= 0.85 * 864e5 && driftW <= 1.15 * 864e5,
    `漂移=${(driftW / 864e5).toFixed(3)}d`,
  )

  // 13.2 recordCorrect Jitter 窗口：注入到期词 → :review 敲对 → 2d 档 ∈ t0+[1.8d, 2.2d]
  await clearLearningStorage(page)
  // ⚠️ 注入词必须是**真实存在于已加载词库**的词。执行计划第 ⑧ 步之后，复习轮不再为
  //    取不到释义的词塞 `?? { word, translation: '' }` 空释义占位（那正是 CONTENT_CONTRACT
  //    §735-739 点名的 🔴 缺陷），取不到就**显式跳过**；原先这里用的合成词
  //    `zz-jitter-correct` 在新语义下理所当然开不了轮。
  //    这里换成从屏幕取真词 —— **断言一字未改**（仍要求首词 === 注入的到期词），
  //    改的只是夹具；被移走的那个语义由下面 13.2b 单独接管。
  await page.click('[data-testid="tab-typing"]')
  await page.waitForTimeout(300)
  for (let i = 0; i < 15 && (await readWord(page)).length === 0; i++) await page.waitForTimeout(200)
  // P1.5-S4 夹具修复：注入词改用 **kaoyan 独有词**（单包归属）。旧的「从屏幕取词」会取到
  // 多包共有词（eagle∈ielts+kaoyan、pearl∈kaoyan+toefl）——v1 种子迁移对多包词判
  // ambiguous 归入 legacy:unattributed:*，:review 按 G6-3 排除 legacy → 不开轮
  //（旧的「首词=eagle 通过」实为练习轮重置首词恰好同名的假阳性）。
  // 注入词仍须是真实存在于已加载词库的词（:review 对取不到释义的词显式跳过，见 13.2b）。
  const dueWord2 = 'overpass' // kaoyan 独有（content/vocabulary/kaoyan/words.json，他包均无）
  // P1.5-S4：State B 下不 reload 读不到 v1 种子 —— clear + v1 种子后 reload 触发启动迁移
  await clearLearningStorage(page)
  await seedReviewV1(page, {
    [dueWord2]: { wrongCount: 1, correctStreak: 0, lastWrongAt: Date.now() - 864e5, nextReviewAt: Date.now() - 1000, intervalIdx: 0 },
  })
  await reloadPage(page)
  await page.waitForTimeout(800)
  await gotoTyping(page) // reload 后落 Home，readWord 需要打字面板
  for (let i = 0; i < 15 && (await readWord(page)).length === 0; i++) await page.waitForTimeout(200)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  await page.keyboard.type(':review', { delay: 25 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  check('复习轮首词为注入的到期词', (await readWord(page)) === dueWord2, `首词=${await readWord(page)}`)
  const t1 = Date.now()
  await typeWord(page, dueWord2)
  await page.waitForTimeout(500)
  // P1.5-S4 夹具修复：复习轮敲对的落盘同样存在 UI 后置延迟，轮询等条目出现（2d 档窗口断言不变）
  const entryC = await waitForReviewEntry(page, dueWord2)
  const driftC = (entryC?.nextReviewAt ?? 0) - t1
  check(
    'recordCorrect Jitter：2d 档落在 [1.8d, 2.2d] 窗口',
    driftC >= 1.8 * 864e5 && driftC <= 2.2 * 864e5,
    `漂移=${(driftC / 864e5).toFixed(3)}d`,
  )

  /* ---------- 13.2b 行为锁：取不到释义的词**不再**用空释义占位开轮 ---------- */
  // 这是执行计划第 ⑧ 步的核心语义变更。旧实现用 `?? { word, translation: '' }` 让任意
  // 合成词都能拉动复习轮（用户看到一个没有释义的「假词条」）；新实现显式跳过 + 告警。
  // 没有这条锁，上面 13.2 换成真词之后就再没人盯着这个语义了。
  await page.keyboard.press('Enter')
  await page.waitForTimeout(350)
  // P1.5-S4：clear + ghost v1 种子 + reload 触发启动迁移 —— ghost 词不在内容包，
  // 迁移后成 legacy:* 到期记录，reviewItemViews 排除 legacy:* → :review 不开轮
  //（比「读不到」更强：锁的是 G6-3 的排除语义本身）。
  await clearLearningStorage(page)
  await seedReviewV1(page, {
    '__gt_ghost_word__': {
      wrongCount: 1, correctStreak: 0, lastWrongAt: Date.now() - 864e5, nextReviewAt: Date.now() - 1000, intervalIdx: 0,
    },
  })
  await reloadPage(page)
  await page.waitForTimeout(800)
  await gotoTyping(page) // reload 后落 Home，beforeGhost 的 readWord 需要打字面板
  for (let i = 0; i < 15 && (await readWord(page)).length === 0; i++) await page.waitForTimeout(200)
  // ⚠️ 本组断言的**自校验**：必须确认命令面板真的被拉起并回车了，否则「练习轮没变」无法区分
  //    「未命中 ⇒ 显式跳过（期望行为）」与「`:review` 压根没执行（假通过）」。
  //    第一版缺这一步时，对照组直接 FAIL 把这层猫腻顶了出来 —— 这正是它存在的意义。
  const runReview = async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      await page.keyboard.press('Escape')
      await page.waitForTimeout(250)
      await page.keyboard.type(':review', { delay: 25 })
      let opened = false
      for (let i = 0; i < 20; i++) {
        if ((await page.locator('[data-testid="command-item-review"]').count()) === 1) {
          opened = true
          break
        }
        await page.waitForTimeout(100)
      }
      if (opened) {
        await page.keyboard.press('Enter')
        await page.waitForTimeout(500)
        return true
      }
    }
    return false
  }
  const beforeGhost = await readWord(page)
  const ghostRan = await runReview()
  check(
    '无释义的合成词不再靠空释义占位开轮：练习轮未被替换',
    ghostRan && beforeGhost.length > 0 && (await readWord(page)) === beforeGhost,
    `命令已执行=${ghostRan}；轮首词 ${beforeGhost} → ${await readWord(page)}`,
  )
  // 对照组：换成**真实**到期词 ⇒ 立刻能开轮。缺了这一条，一个「永远返回 false」的实现
  // 会把上面的「不开轮」判成绿 —— 必须证明不开轮是**未命中**导致的，不是入口整体失效。
  // P1.5-S4：对照组同样 clear + v1 种子 + reload（启动迁移把种子转成 v2 到期记录）
  await clearLearningStorage(page)
  await seedReviewV1(page, {
    [dueWord2]: { wrongCount: 1, correctStreak: 0, lastWrongAt: Date.now() - 864e5, nextReviewAt: Date.now() - 1000, intervalIdx: 0 },
  })
  await reloadPage(page)
  await page.waitForTimeout(800)
  await gotoTyping(page)
  for (let i = 0; i < 15 && (await readWord(page)).length === 0; i++) await page.waitForTimeout(200)
  const realRan = await runReview()
  check(
    '对照组：换成真实到期词立刻能开轮（证明上面「不开轮」源于未命中，而非复习入口整体失效）',
    realRan && (await readWord(page)) === dueWord2,
    `命令已执行=${realRan}；首词=${await readWord(page)}`,
  )
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)

  // 13.3 Quota 熔断：mock setItem 前两次对 gt.learning.v2 抛 QuotaExceededError → 清洗后重试成功
  // 13.2 复习敲对可能已结算出 ResultOverlay，先 Enter 重开解除遮罩
  await page.keyboard.press('Enter')
  await page.waitForTimeout(350)
  await clearLearningStorage(page)
  await page.evaluate(() => {
    const orig = Storage.prototype.setItem.bind(localStorage)
    window.__origSetItem = orig
    let calls = 0
    Storage.prototype.setItem = function (k, v) {
      if (k === 'gt.learning.v2' && calls++ < 2) {
        const e = new Error('mock: quota exceeded')
        e.name = 'QuotaExceededError'
        throw e
      }
      return orig(k, v)
    }
    // 预置 6 条合法 v2 错题记录：熔断清洗后 review 总条目应减少
    const seed = {}
    for (let i = 0; i < 6; i++) {
      seed[`content:word:quota-seed:${i}`] = {
        contentId: `content:word:quota-seed:${i}`,
        review: { wrongCount: 1, correctStreak: 0, lastWrongAt: Date.now(), nextReviewAt: Date.now() + 864e5, intervalIdx: 0 },
      }
    }
    orig('gt.learning.v2', JSON.stringify(seed))
  })
  const errQ = consoleErrors.length
  await page.click('[data-testid="tab-memorize"]')
  await page.waitForTimeout(400)
  await page.click('[data-testid="memorize-flip"]')
  await page.waitForTimeout(300)
  await page.click('[data-testid="memorize-unknown"]')
  await page.waitForTimeout(600)
  const qState = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('gt.learning.v2') || '{}')
    const reviews = Object.values(s).filter((v) => v && v.review)
    return {
      total: reviews.length,
      hasNew: reviews.some((r) => typeof r.contentId === 'string' && !r.contentId.startsWith('content:word:quota-seed:')),
    }
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
      if (k === 'gt.learning.v2') {
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
  // P1.5-S4：放弃路径 warn 文案对齐 src/lib/learning/storage.ts failWrite 实际输出
  //（`[learning/storage] gt.learning.v2 写入失败（reason=quota...）`），断言语义不变。
  check('Quota 全失败：放弃写入有 warn', consoleWarns.some((w) => w.includes('写入失败')))
  await page.evaluate(() => {
    Storage.prototype.setItem = window.__origSetItem
  })
  await page.click('[data-testid="tab-typing"]')
  await page.waitForTimeout(200)

  /* ---------- 14. 批8-B：移动端手势 + 命令面板唤起 + 预热探针 ---------- */
  console.log('\n【14】批8：移动端手势 / 命令面板 / 预热')
  const mctx = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true })
  await lockLangZh(mctx)
  const mpage = await mctx.newPage()
  const mConsoleErrors = []
  mpage.on('console', (m) => m.type() === 'error' && mConsoleErrors.push(m.text()))
  mpage.on('pageerror', (e) => mConsoleErrors.push(String(e)))

  await gotoPage(mpage)
  await waitForTestId(mpage, 'tab-memorize') // 等应用壳挂载

  // 预热探针（P18-B 遗留项 9.2 收口）：验证「registry.ts 的 WARMUP_IDS 清单里的包，
  // 真的被 idle 预热拉进 SW 缓存」—— 期望值从清单派生，不写死包数。
  //
  // 四个必须说清的点：
  //  ① 期望值从哪来：readWarmUpIds() 解析 registry.ts 的 WARMUP_IDS，与
  //     scripts/check-bundle.mjs 判据 3/6 共用 scripts/content/warmup-ids.mjs 的同一份解析实现。
  //     清单变长/变短 ⇒ 期望值跟着变；清单解析不到 ⇒ 期望值 0 ⇒ 立刻判红（绝不放行）。
  //  ② 判据为什么仍然成立（**不再清缓存 + 重新加载**，这是本轮改的重点）：
  //     words chunk 的文件名是 `words-<hash>.js`，**不带包名**，所以只能按数量判、没法按名字判归属。
  //     本探针跑在 mctx 这个**新开浏览器上下文**（tests/e2e.mjs:1320，独立 profile ⇒ 独立 SW 缓存），
  //     而这个上下文只服务【14】的移动端手势用例、**从不切词库** ⇒ 缓存里的 words chunk
  //     只可能来自 idle 预热本身 —— 也就是说「清空缓存防污染」那层保险在**当前顺序下是多余的**
  //     （套件【15】用的是主上下文 tests/e2e.mjs:208，两边根本共享不到）。
  //     证伪性质不因此削弱：把 main.tsx 的 warmUpVocabulary 整个删掉 ⇒ 这个上下文再也不会
  //     拉 words chunk ⇒ 0 hits ⇒ 照样判红。本探针验的仍是「清单内的包真的被 idle 预热拉进缓存」。
  //  ③ 预算 240×500ms=120s：CI runner 首次无缓存、拉清单内的 words-*.js（合计约 1 MB）时，
  //     「下载 + SW 写入缓存」可能远超本地；原 30s 预算在 CI 上被判定为下一个红灯风险
  //     （见 CI run 36308273299 复盘）。提到 4 倍余量：仍能在合理时间内失败，不会无限等待。
  //     生产环境即使并发抢带宽 >18s 也远在预算内。
  //  ④ 为什么先按状态等 SW 接管、以及为什么不再 reload：
  //     CI 上本探针 flaky（同一份 src 三笔：绿 515941c / 红 e4b6674 / 绿 1f46ab9，
  //     红的那次 09:09:50 起跑、09:11:50 报错，整 120s 跑满、0 个 words chunk、其余 169 项全过）。
  //     ⚠️ 根因**没有**定死，下面两条都是实测到的，不要当成已证：
  //       - 「不等接管就 reload ⇒ 未接管页面的动态 import 不经过 SW fetch handler ⇒ chunk 永不入缓存」
  //         这条机制是真的（`src/main.tsx` 的 warmBanks 那段注释本就在防它），但**不是唯一原因**：
  //          改成「先按状态等接管（上限 30s）再 reload」之后，独立证伪脚本仍然稳定复现 0 hits，
  //          且诊断显示那时 `navigator.serviceWorker.controller` 恒为 false、`gt-shell-v3` 全程没建出来。
  //       - 于是本轮不再去追那个 reload 竞态，而是**直接把 reload 这一步删掉**（见 ②）：
  //         它既没在防假通过（② 已证），本身又是唯一能让 SW 控制丢失的操作。
  //         按状态等接管 ≠ 按时间干等：接管了立刻往下走，慢机器上也不白等；等不到走「前提不成立」分支。
  const warmIds = readWarmUpIds(process.cwd())
  const waitForSwControl = async () => {
    const t0 = Date.now()
    for (;;) {
      const st = await mpage
        .evaluate(() => ({ has: 'serviceWorker' in navigator, ctrl: !!navigator.serviceWorker.controller }))
        .catch(() => ({ has: false, ctrl: false }))
      if (st.ctrl) return { ok: true, ms: Date.now() - t0 }
      if (Date.now() - t0 > 30000) return { ok: false, ms: Date.now() - t0, has: st.has }
      await mpage.waitForTimeout(250)
    }
  }
  await gotoPage(mpage)
  await waitForTestId(mpage, 'tab-memorize')
  // 只等状态、不做第二次 goto（原因见上面 ②/④）；warmup 会在 load → requestIdleCallback 之后自行起跑
  const swCtrl = await waitForSwControl()
  const warmProbe =
    warmIds === null
      ? // 清单解析不到 ⇒ 期望包数无法确定 ⇒ 直接判红（与 check-bundle 判据 3/6 的 UNKNOWN 同口径：测不出来 ≠ 通过）
        Promise.resolve({ ok: false, hits: [], why: 'registry.ts 的 WARMUP_IDS 解析不到' })
      : mpage.evaluate(async (need) => {
          // 诊断字段：失败时必须能区分「SW 没接管 / 缓存没建出来」这类**测不到**，
          // 和「预热真没把 chunk 写进缓存」这类**测到没通过** —— 混成一句「超时」就又变回不可复核的红灯。
          const diag = { sawCache: false, ctrl: false }
          for (let i = 0; i < 240; i++) {
            try {
              diag.ctrl = !!navigator.serviceWorker.controller
              const names = await caches.keys()
              if (names.includes('gt-shell-v3')) {
                diag.sawCache = true
                const cache = await caches.open('gt-shell-v3')
                const urls = (await cache.keys()).map((r) => r.url)
                // V4-P0：大词库 chunk 从模块名(ielts-*.js)变为 ?raw JSON 命名(words-*.js)
                const hits = urls.filter((u) => /\/assets\/words-.*\.js/.test(u))
                if (hits.length >= need) return { ok: true, hits }
              }
            } catch {
              /* SW 未就绪继续等 */
            }
            await new Promise((r) => setTimeout(r, 500))
          }
          return { ok: false, hits: [], diag, why: '轮询 120s 超时' }
        }, warmIds.length)

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

  // 14.9 预热探针：SW 缓存出现 WARMUP_IDS 清单内的 chunk（期望值 = 清单长度，与上面用例并行预热）
  const warm = await warmProbe
  const warmIdsTxt = warmIds === null ? '（清单解析不到）' : `[${warmIds.join(', ')}]`
  check(
    '预热探针前提：SW 已接管页面（controller 存在，预热的 chunk 才会经 fetch handler 入库）',
    swCtrl.ok,
    `等接管 ${swCtrl.ms}ms${swCtrl.ok ? '' : `（30s 内没等到，serviceWorker 存在=${swCtrl.has} ⇒ 探针前提不成立，下面的预热结论也不作数）`}`,
  )
  check(
    `预热探针：SW 缓存含 WARMUP_IDS 全部 chunk（${warmIdsTxt}）`,
    warm.ok,
    [
      warm.why,
      `${warm.hits.length} 个 words chunk：${warm.hits.map((u) => u.split('/').pop()).join(', ')}`,
      warm.diag ? `观测：SW 接管=${warm.diag.ctrl} / gt-shell-v3 出现过=${warm.diag.sawCache}` : '',
    ]
      .filter(Boolean)
      .join(' — '),
  )

  await mctx.close()

  /* ---------- 16. V3-P0a：五页签 IA + Today's Practice + Review/Progress ---------- */
  console.log('\n【16】V3-P0a：五页签 IA / 今日推荐 / Review / Progress')
  const errP0a = consoleErrors.length

  // 预置：清学习存储家族（P1.5-S4 State B）+ 旧分析键，词库切 CET-4（同步词库，便于断言音标与单挑）
  await clearLearningStorage(page)
  await page.evaluate(() => {
    localStorage.removeItem('gt.analytics.v1')
    localStorage.setItem('gt.bank', JSON.stringify('cet4'))
  })
  await reloadPage(page)
  await page.waitForTimeout(500)
  await waitForTestId(page, 'home-panel') // 等默认 Home 页签渲染后再数页签
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

  // 16.0a P1.7-W5C：Home 组合展示内容目录汇总（仅组合、零新键，复用 nav.banks / bank.wordsUnit）
  await waitForTestId(page, 'home-catalog-summary')
  const catText = norm(await page.textContent('[data-testid="home-catalog-summary"]'))
  check(
    'Home 组合：内容目录汇总渲染（18 词库 · 9388 词，复用 nav.banks / bank.wordsUnit，零新键）',
    (await page.locator('[data-testid="home-catalog-summary"]').count()) === 1 &&
      catText.includes('18') &&
      catText.includes('9388') &&
      catText.includes('词库') &&
      catText.includes('词'),
    `text=${catText}`,
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
  await reloadPage(page)
  await page.waitForTimeout(400)
  await waitForTestId(page, 'home-goal-bar')
  await waitForTestId(page, 'home-streak')
  const goalStyle = await page.getAttribute('[data-testid="home-goal-bar"]', 'style')
  check(
    'Daily Goal 进度条渲染（30/50 → 60%）+ streak 3 天',
    !!goalStyle && goalStyle.includes('60%') &&
      norm(await page.textContent('[data-testid="home-streak"]')).includes('3'),
    `style=${goalStyle}`,
  )

  // 16.2 复习卡两态 + 点击开复习轮（P1.5-S4：清 v2 键族后空态）
  await clearLearningStorage(page)
  await reloadPage(page)
  await page.waitForTimeout(400)
  await waitForTestId(page, 'home-review-empty') // 空态卡挂载后再断言（避免渲染中途采样）
  check(
    '复习卡空态（空态文案 + 无开始按钮）',
    (await page.locator('[data-testid="home-review-empty"]').count()) === 1 &&
      (await page.locator('[data-testid="home-review-start"]').count()) === 0,
  )
  // P1.5-S4：v1 种子 + reload（启动迁移转成 v2 到期记录）
  await clearLearningStorage(page)
  await seedReviewV1(page, {
    abandon: { wrongCount: 2, correctStreak: 0, lastWrongAt: Date.now() - 2 * 864e5, nextReviewAt: Date.now() - 864e5, intervalIdx: 0 },
  })
  await reloadPage(page)
  await page.waitForTimeout(400)
  await waitForTestId(page, 'home-review-card') // 有态卡挂载
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
  // P1.5-S4：State B 弱项数据来自 gt.letterStats.v1 / gt.totals.v1（gt.analytics.v1 在 State B 不被读）
  await page.evaluate(() => {
    localStorage.removeItem('gt.letterStats.v1')
    localStorage.removeItem('gt.totals.v1')
  })
  await reloadPage(page)
  await page.waitForTimeout(400)
  await waitForTestId(page, 'home-weak-empty')
  check('弱项卡空态（暂无弱项数据）', (await page.locator('[data-testid="home-weak-empty"]').count()) === 1)
  // P1.5-S4：有态种子改写 State B 实际读取的两键（字段等价平移自旧 gt.analytics.v1 种子）
  await page.evaluate(() => {
    localStorage.setItem('gt.letterStats.v1', JSON.stringify({ letters: { q: { hit: 1, miss: 9 }, z: { hit: 2, miss: 5 } } }))
    localStorage.setItem('gt.totals.v1', JSON.stringify({ totalKeys: 17, totalCorrect: 3, totalWords: 1, bestWpm: 20 }))
  })
  await reloadPage(page)
  await page.waitForTimeout(400)
  await waitForTestId(page, 'home-weak-card') // 弱项数据卡挂载
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
  // P1.5-S4：clear + v1 种子 + reload（启动迁移转成 v2 正式记录，分布走 insights.masteryDistributionV2）。
  //    夹具修复：迁移器会把 gt.analytics.v1 的 letters/totals **平移并覆盖写入**
  //    gt.letterStats.v1 / gt.totals.v1（migrate.ts ④「两个全局聚合独自搬走」，writtenKeys
  //    含这两键）—— 直种两键会被迁移覆盖成空表。弱项种子必须种在 gt.analytics.v1（迁移
  //    正路，与旧夹具字段逐字一致），由迁移器平移落位；words.abandon 随 analytics 分片
  //    进 v2 记录，供 Progress 错词列表读取。
  await clearLearningStorage(page)
  await seedReviewV1(page, {
    abandon: { wrongCount: 3, correctStreak: 0, lastWrongAt: Date.now() - 864e5, nextReviewAt: Date.now() - 3600e3, intervalIdx: 0 },
    absolute: { wrongCount: 1, correctStreak: 3, lastWrongAt: Date.now() - 6 * 864e5, nextReviewAt: Date.now() - 60e3, intervalIdx: 3 },
  })
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
  await reloadPage(page)
  await page.waitForTimeout(400)
  await waitForTestId(page, 'tab-review') // 等应用壳挂载后再切 Review 页签
  await page.click('[data-testid="tab-review"]')
  await waitForTestId(page, 'review-stat-total') // 等 Review 页数据卡挂载
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

  // P1.5-S4 夹具修复：Progress 错词列表（State B）读 v2 记录的 **analytics 子记录**（打字
  // 维度，对应旧 gt.analytics.v1 的 words —— ProgressPanel 仍消费 wrongWords(analytics)）。
  // 种子只带 review 子记录，这里按词形补齐打字维度（迁移已完成、marker 已在，直接改 v2
  // 安全），再 reload 让 loadAnalyticsV2 聚合出 words.abandon。字段平移自旧 analytics.v1 种子。
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('gt.learning.v2') || '{}')
    for (const [k, v] of Object.entries(s)) {
      const w = k.startsWith('content:word:') ? k.split(':')[3] : null
      if (w === 'abandon' && v) v.analytics = { done: 3, wrong: 2 }
      if (w === 'absolute' && v) v.analytics = { done: 1, wrong: 0 }
    }
    localStorage.setItem('gt.learning.v2', JSON.stringify(s))
  })
  await reloadPage(page)

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

  /* ---------------- 用例数锁死（以前只有文档纪律，没有机器断言） ----------------
   * 项目纪律「e2e 用例数锁死 171，不许增减一条」原先只活在文档陈述里：
   * 代码里没有任何 ===171 的断言，加减一条 check() 让 CI 照样绿。
   * 这里把纪律钉成机器判据：断言**实际执行到的 check 总数** == 期望值（不符 ⇒ exit 1）。
   * 期望值 = `npm run test:e2e` 输出「共 N 项」的实测值（当前 171），不是拍脑袋抄来的。
   * 想加/减用例 ⇒ 连同这个常量一起改，并在提交里说清为什么 —— 这是刻意的棘轮。 */
  const E2E_CASES_EXPECTED = 171
  if (results.length !== E2E_CASES_EXPECTED) {
    console.error(
      `\n✗ e2e 用例数漂移：实际执行 ${results.length} 项，期望 ${E2E_CASES_EXPECTED} 项` +
        `（增减用例必须同时改 tests/e2e.mjs 的 E2E_CASES_EXPECTED，不许静默加减让 CI 变绿）`,
    )
    failures++
  }

  console.log(`\n${'─'.repeat(54)}`)
  console.log(`共 ${results.length} 项，通过 ${results.length - failures}，失败 ${failures}`)
  console.log(`${'─'.repeat(54)}`)
  // 用 exitCode 而非 process.exit：让外层 finally 有机会杀掉自举的 preview
  if (failures > 0) process.exitCode = 1
}

// 自举 preview（--prod / E2E_BASE 覆盖时跳过，直接打外部目标），全程 finally 保证杀干净
let previewServer = null
try {
  if (!IS_PROD && !process.env.E2E_BASE) previewServer = await ensurePreviewServer({ port: LOCAL_PORT })
  await run()
} catch (e) {
  console.error('\n💥 测试脚本异常：', e)
  process.exitCode = 1
} finally {
  stopPreview(previewServer)
}
