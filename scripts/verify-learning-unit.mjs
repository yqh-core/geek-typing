/* Stage 2 第一刀 · V1–V4 真机验收（CDP + 本机 Chrome，零 Playwright 依赖）
 *
 * 目的：把「学习单元最小闭环」从「代码写了」推到「真机上真的能用」。
 * 裁定依据：docs/p18/_generated/stage2/STAGE2-PHASE2-LEARNING-UNIT-PLAN-2026-10-02.md
 *
 * 验收项（V4 离线判据由 check-bundle + e2e 单独出，本脚本只管真机 V1–V3）：
 *   V1首页点进单元 → 看到 100 词 → 点「开始学习」后打字页吃的**正是**这 100 词
 *   V2  音频 / 字幕 / 练习三处都有**可见**「待接入」文案，且零 console error、零「点了没反应」
 *   V3  打字 → 背单词 → 复习 → 进度全链路走通，且进度**真的被记下来**（回读 localStorage）
 *
 * 用法：node scripts/verify-learning-unit.mjs [--base http://127.0.0.1:4173] [--keep-screens]
 *
 * 设计纪律（沿用本仓既有审计脚本口径）：
 *   - Chrome 必须 --no-proxy-server，否则本机 https_proxy 会拦127.0.0.1 抓出一堆错误页。
 *   - 每项判据都打印**实测值**（数字/文本），不接受「看起来对」。
 *   - 失败项不吞：任一 V 判红 ⇒ EXIT=1。
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const argOf = (name, dflt) => {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : dflt
}
const BASE = argOf('--base', 'http://127.0.0.1:4173')
const KEEP = process.argv.includes('--keep-screens')
const OUT = join(ROOT, '_evidence', 'stage2-unit')

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
]
const findChrome = () => {
  for (const p of CHROME_CANDIDATES) if (existsSync(p)) return p
  throw new Error('no chrome found')
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ------------------------------------------------------------------ *
 * 最小 CDP 客户端
 * ------------------------------------------------------------------ */
class Session {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    this.events = []
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        if (msg.error) reject(new Error(JSON.stringify(msg.error)))
        else resolve(msg.result)
      } else if (msg.method) {
        this.events.push(msg)
      }
    })
  }
  send(method, params = {}) {
    const id = ++this.id
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error(`timeout ${method}`))
        }
      }, 30000)
    })
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    })
    if (r.exceptionDetails) {
      throw new Error(`eval 抛错：${JSON.stringify(r.exceptionDetails.exception?.description ?? r.exceptionDetails)}`)
    }
    return r.result.value
  }
}

/* ------------------------------------------------------------------ *
 * 判定结果收集
 * ------------------------------------------------------------------ */
const checks = []
function check(vId, name, ok, detail) {
  checks.push({ vId, name, ok: !!ok, detail: String(detail) })
  console.log(`  ${ok ? '✅' : '❌'} [${vId}] ${name}${detail ? ` — ${detail}` : ''}`)
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  const chrome = findChrome()
  const cdpPort = 9345
  const profile = join(ROOT, '.unit-chrome-profile')

  // 端口就绪探测（preview 由外部起好；没起就直接失败，不自己偷起一个避免测错实例）
  let up = false
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(BASE + '/')
      if (r.status > 0) { up = true; break }
    } catch {}
    await sleep(300)
  }
  if (!up) throw new Error(`preview 未就绪：${BASE}`)
  console.log(`preview 就绪 ${BASE}`)

  const proc = spawn(
    chrome,
    [
      `--remote-debugging-port=${cdpPort}`,
      `--user-data-dir=${profile}`,
      '--headless=new',
      '--no-first-run',
      '--no-default-browser-check',
      '--no-proxy-server',
      '--disable-gpu',
      '--window-size=1440,1000',
      'about:blank',
    ],
    { stdio: 'ignore' },
  )

  let version = null
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${cdpPort}/json/version`)
      if (r.ok) { version = await r.json(); break }
    } catch {}
    await sleep(300)
  }
  if (!version) throw new Error('CDP not ready')
  console.log('CDP:', version.Browser)

  const tab = await (await fetch(`http://127.0.0.1:${cdpPort}/json/new?about:blank`, { method: 'PUT' })).json()
  const ws = new WebSocket(tab.webSocketDebuggerUrl)
  await new Promise((res, rej) => {
    ws.addEventListener('open', res)
    ws.addEventListener('error', rej)
  })
  const s = new Session(ws)
  await s.send('Page.enable')
  await s.send('Runtime.enable')
  await s.send('Log.enable')

  /** console error / pageerror 收集（V2 的「零报错」判据靠它） */
  const consoleErrors = []
  const origPush = s.events.push.bind(s.events)
  s.events.push = (m) => {
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      consoleErrors.push(m.params.args.map((a) => a.value ?? a.description ?? a.type).join(' '))
    }
    if (m.method === 'Runtime.exceptionThrown') {
      consoleErrors.push('exceptionThrown: ' + (m.params.exceptionDetails?.exception?.description ?? ''))
    }
    if (m.method === 'Log.entryAdded' && m.params.entry?.level === 'error') {
      consoleErrors.push('log: ' + m.params.entry.text)
    }
    return origPush(m)
  }

  const shot = async (name) => {
    if (!KEEP) return
    const r = await s.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(join(OUT, `${name}.png`), Buffer.from(r.data, 'base64'))
  }

  const goto = async (url) => {
    await s.send('Page.navigate', { url })
    // 等首屏渲染：document.readyState complete + #root 有子节点
    for (let i = 0; i < 80; i++) {
      const ok = await s.eval(
        `document.readyState === 'complete' && !!document.querySelector('#root')?.children.length`,
      ).catch(() => false)
      if (ok) break
      await sleep(250)
    }
    await sleep(600)
  }

  const testid = (id) => `document.querySelector('[data-testid="${id}"]')`
  const textOf = (id) => s.eval(`(${testid(id)}?.textContent ?? '').trim()`)

/**
 * 按 `id` 选页签，**不按文案**。
 * 实测踩坑（本脚本第一版就栽在这）：Home 页签的中文文案是「今日」而不是「首页」，
 * 按 '首页' 找永远落空 —— 症状是「切回 Home 没生效、单元卡消失」，
 * 看起来像 App 的 sub-view 状态坏了，其实是选择器按错了文案。
 * `tab-*` 是 WAI-ARIA tablist 的稳定锚点，与 i18n 文案解耦。
 */
const clickTab = (id) =>
    s.eval(`(() => {
    const el = document.getElementById(${JSON.stringify(id)})
    if (!el) return 'no-tab'
    el.click()
    return 'clicked'
  })()`)

  /**
   * 用**真实输入通道**打字 —— `Input.dispatchKeyEvent`，与 Playwright 的
   * `page.keyboard.type()` 同一条路（tests/e2e.mjs:177 用的就是它）。
   *
   * 为什么不用 `new KeyboardEvent('keydown')` 合成事件：那种事件没有浏览器
   * 的真实按键语义（`isTrusted=false`、缺 keyCode/text），React 的
   * onKeyDown 收不到或按 isTrusted 过滤掉 —— 实测表现为「字打进去、词也不推进、
   * analytics 全空」，看起来像产品功能坏了，其实是注入方式不对。
   *
   * @param {string} text 要输入的文本
   * @param {boolean} enter 打完是否补一个Enter
   */
  const typeReal = async (text, enter = false) => {
    for (const ch of text) {
      await s.send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        text: ch,
        unmodifiedText: ch,
        key: ch,
        windowsVirtualKeyCode: ch.toUpperCase().charCodeAt(0),
      })
      await s.send('Input.dispatchKeyEvent', { type: 'char', text: ch, key: ch })
      await s.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch })
      await sleep(40)
    }
    if (enter) {
      await s.send('Input.dispatchKeyEvent', {
        type: 'rawKeyDown',
        key: 'Enter',
        windowsVirtualKeyCode: 13,
        nativeVirtualKeyCode: 13,
      })
      await s.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', windowsVirtualKeyCode: 13 })
    }
  }

const openUnitPanel = async () => {
  const clicked = await clickTab('tab-home')
  if (clicked !== 'clicked') return `no-home-tab(${clicked})`
  await sleep(900)
  if (await s.eval(`!!(${testid('unit-panel')})`)) return 'already-open'
  const has = await s.eval(`!!(${testid('unit-card-open')})`)
  if (!has) {
    const diag = await s.eval(`(() => {
      const active = [...document.querySelectorAll('[role="tab"]')].filter((b) => b.getAttribute('aria-selected') === 'true').map((b) => (b.textContent || '').trim()).join('|')
      return 'active=' + (active || '(none)') + ' panel=' + (document.querySelector('[data-testid="unit-panel"]') ? 'y' : 'n') + ' card=' + (document.querySelector('[data-testid="unit-card-open"]') ? 'y' : 'n') + ' bodyLen=' + document.body.innerText.trim().length
    })()`)
    console.log(`    [诊断] ${diag} | console errors=${consoleErrors.length ? consoleErrors.slice(0, 3).join(' || ') : '0'}`)
    return 'no-entry-card'
  }
  await s.eval(`(${testid('unit-card-open')}).click()`)
  await sleep(900)
  return 'opened'
}

  try {
    /* ================= V1：首页 → 单元 → 100 词 → 开轮 ================= */
    console.log('\n【V1】首页单元区 → 单元展开视图 → 100 词 → 开轮吃的是这 100 词')
    await goto(BASE + '/')

    // V1-a 首页必须能看到单元入口卡（5 个页签不变，入口在 Home 内）
    await clickTab('tab-home')
    await sleep(700)

    const cardTitle = await textOf('unit-card-title')
    const cardWords = await textOf('unit-card-words')
    check('V1-a', 'Home 页出现当前学习单元入口卡', cardTitle.length > 0, `title="${cardTitle}" / words="${cardWords}"`)
    check('V1-a', '单元卡显示 100 词', /100/.test(cardWords), `unit-card-words="${cardWords}"`)
    await shot('v1-home-card')

    // V1-b 点开单元 → 展开视图渲染
    await s.eval(`(${testid('unit-card-open')}).click()`)
    await sleep(900)
    const panelTitle = await textOf('unit-title')
    const wordsCount = await textOf('unit-words-count')
    const wordCount = await s.eval(`document.querySelectorAll('[data-testid="unit-word"]').length`)
    check('V1-b', '单元展开视图渲染出标题', panelTitle.length > 0, `unit-title="${panelTitle}"`)
    check('V1-b', '词段计数显示 100', wordsCount === '100', `unit-words-count="${wordsCount}"`)
    check('V1-b', '词表实际渲染 100 个词形', wordCount === 100, `unit-word 节点数=${wordCount}`)
    await shot('v1-unit-panel')

    // V1-c「开始学习」→ 切到打字页；首词取 data-testid="word"（PracticePanel.tsx:35）
    // 白名单从**单元视图 DOM 里已渲染的 100 个 unit-word 节点**取 —— 不 import 源码
    // （preview 服务的是构建产物，没有 /src/*.ts 可动态 import；那是个静默失败的坑）。
    const lexemes = await s.eval(
      `[...document.querySelectorAll('[data-testid="unit-word"]')].map((n) => n.textContent.trim()).filter(Boolean)`,
    )
    await s.eval(`(${testid('unit-start')}).click()`)
    await sleep(1500)
    const typingWord = await s.eval(`(${testid('word')})?.textContent?.trim() ?? ''`)
    check('V1-c', '点「开始学习」后进入打字页并渲染目标词', typingWord.length > 0, `word testid="${typingWord}"`)
    await shot('v1-typing')

    // V1-d 打字页首词必须落在单元白名单内（真机断言「学的正是这 100 词」）
    check(
      'V1-d',
      '打字页首词 ∈ 单元 100 词白名单',
      Array.isArray(lexemes) && lexemes.length === 100 && lexemes.includes(typingWord.toLowerCase()),
      `首词="${typingWord}"；白名单 ${Array.isArray(lexemes) ? lexemes.length : 'null'} 词（首=${lexemes?.[0]}，末=${lexemes?.[lexemes.length - 1]}）`,
    )

    /* ================= V2：三处「待接入」可见 + 零报错 ================= */
    console.log('\n【V2】音频 / 字幕 / 练习 三处「待接入」可见，且零 console error')
    const panelState = await openUnitPanel()
    check('V2-a', '单元展开视图可进入', panelState !== 'no-entry-card', `openUnitPanel → ${panelState}`)

    const pend = {
      audio: await textOf('unit-audio-pending'),
      subtitle: await textOf('unit-subtitle-pending'),
      exercise: await textOf('unit-exercise-pending'),
    }
    for (const [k, v] of Object.entries(pend)) {
      // 文案口径：i18n unit.status.* / unit.subtitleReasonKey 里实际存在四种措辞 ——
      //   音频「尚未接入」/ 练习「尚未接入」/ 听力（listed，无占位）/ 字幕「尚未存在」（内容层连包都没有）。
      // 判据锚定的是「**显式说明了为什么没接入**」这一语义，不是逐字锁死某一种措辞；
      // 但仍然是封闭集合：出现一个不在这四种里的新措辞会判红（要显式承认，而不是默默放过）。
      check('V2-a', `${k} 位显式「待接入」可见`, v.length > 0 && /尚未接入|待接入|尚未存在|没有接入/.test(v), `${k}-pending="${v}"`)
    }
    const audioRows = await s.eval(`(${testid('unit-audio')})?.querySelectorAll('span').length ?? 0`)
    const listenRows = await s.eval(`(${testid('unit-listening')})?.querySelectorAll('span').length ?? 0`)
    check('V2-b', '音频/听力条目已列出（可见性而非空壳）', audioRows > 0 && listenRows > 0,
      `audio 区块 span=${audioRows} / listening 区块 span=${listenRows}`)
    // 「点了没反应」判据：三处待接入位里不允许出现任何可点按钮
    const fakeButtons = await s.eval(`(() => {
      const ids = ['unit-audio','unit-subtitle','unit-exercise']
      return ids.flatMap((id) => [...(document.querySelector('[data-testid="'+id+'"]')?.querySelectorAll('button') ?? [])].map((b)=>id+':'+(b.textContent||'').trim())).join('|') || '(none)'
    })()`)
    check('V2-b', '三处待接入位内零可点按钮（不做假播放器/假作答）', fakeButtons === '(none)', fakeButtons)
    await shot('v2-pending')

    /* ================= V3：打字 → 背单词 → 复习 → 进度，progress 真被记下 ================= */
    console.log('\n【V3】打字 → 背单词 → 复习 → 进度：链路通 + progress 真被记下')
    const progBefore = await textOf('unit-progress')
    const st = await openUnitPanel()
    check('V3-a', '单元展开视图可回到并开轮', st !== 'no-entry-card', `openUnitPanel → ${st}`)
    await s.eval(`(${testid('unit-start')}).click()`)
    await sleep(1800)
    const targetWord = await s.eval(`(${testid('word')})?.textContent?.trim() ?? ''`)
    check('V3-a', '开轮后打字页有目标词', targetWord.length > 0, `word="${targetWord}"`)
    // 真实输入通道打字（合成 KeyboardEvent 不带 isTrusted，React 收不到）
    await typeReal(targetWord, true)
    await sleep(2000)
    const afterWord = await s.eval(`(${testid('word')})?.textContent?.trim() ?? ''`)
    check('V3-a', '打字页吃键后推进到下一个词', targetWord.length > 0 && afterWord !== targetWord,
      `输入="${targetWord}" → 当前="${afterWord}"（已推进=${afterWord !== targetWord}）`)

    const ls = await s.eval(`(() => {
      const out = {}
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        out[k] = (localStorage.getItem(k) || '').slice(0, 600)
      }
      return out
    })()`)
    const lsKeys = Object.keys(ls)
    const lsHit = lsKeys.find((k) => targetWord && ls[k].includes(targetWord))
    check('V3-b', 'analytics 落盘且包含刚打的词', !!lsHit,
      lsHit
        ? `命中 key="${lsHit}" 含 "${targetWord}"`
        : `localStorage keys=[${lsKeys.join(', ')}]（无一个含 "${targetWord}"）`)

    // 回到单元视图看完成度是否动了
    await openUnitPanel()
    const progAfter = await textOf('unit-progress')
    const progPct = Number((progAfter.match(/(\d+)\s*%/) ?? [])[1] ?? NaN)
    check(
      'V3-c',
      '本单元完成度在打词之后真的涨了',
      Number.isFinite(progPct) && progPct > 0 && progAfter !== progBefore,
      `before="${progBefore}" → after="${progAfter}"（>0=${progPct > 0}）`,
    )

    /* 复习页/进度页可达（链路存在性，不做深度断言）：按 `tab-*` id 断言，与 i18n 文案解耦 */
    const tabIds = await s.eval(`[...document.querySelectorAll('[role="tab"]')].map((b) => b.id).join('|')`)
    const EXPECTED_TABS = ['tab-home', 'tab-typing', 'tab-memorize', 'tab-review', 'tab-progress']
    check(
      'V3-d',
      '5 个页签契约未变（home/typing/memorize/review/progress 都在）',
      EXPECTED_TABS.every((id) => tabIds.split('|').includes(id)),
      `tabs=[${tabIds}]`,
    )

    // 背单词/复习/进度三页都能真的切过去并渲染出内容（链路走通，不是空壳）
    for (const [tabId, probe] of [
      ['tab-memorize', '背单词'],
      ['tab-review', '复习'],
      ['tab-progress', '进度'],
    ]) {
      const ok = await clickTab(tabId)
      await sleep(900)
      const rendered = await s.eval(`(() => {
        const panel = document.querySelector('[role="tabpanel"]:not([hidden])') || document.querySelector('[role="tabpanel"]')
        return (panel?.textContent ?? '').trim().length
      })()`)
      check('V3-e', `${probe} 页可切入且有内容`, ok === 'clicked' && rendered > 40, `clicked=${ok}，tabpanel 文本长度=${rendered}`)
    }

    // Home 单元卡进度同步 —— 单元卡只在 Home 且**不在 sub-view** 时渲染，
    // 所以这一步必须「回 Home → 若还在单元视图则先点返回」，否则拿到空串误判红。
    await openUnitPanel()
    const backHome = await s.eval(`(() => {
      const b = document.querySelector('[data-testid="unit-back"]')
      if (b) { b.click(); return 'clicked-back' }
      return 'already-home'
    })()`)
    await sleep(800)
    const cardProgAfter = await textOf('unit-card-progress')
    check('V3-c', 'Home 单元卡进度同步', cardProgAfter.length > 0, `${backHome}；unit-card-progress="${cardProgAfter}"`)

    /* ================= console 零报错 ================= */
    console.log('\n【零报错】全程 console error / pageerror')
    check('ERR', '全程零 console error / pageerror', consoleErrors.length === 0,
      consoleErrors.length ? consoleErrors.slice(0, 5).join(' || ') : '0 条')

  } finally {
    try { ws.close() } catch {}
    proc.kill()
  }

  const pass = checks.filter((c) => c.ok).length
  const fail = checks.length - pass
  console.log('\n──────────────────────────────────────────────────────')
  console.log(`共 ${checks.length} 项，通过 ${pass}，失败 ${fail}`)
  console.log('──────────────────────────────────────────────────────')
  for (const c of checks.filter((x) => !x.ok)) console.log(`  ❌ [${c.vId}] ${c.name} — ${c.detail}`)
  writeFileSync(join(OUT, 'verify-report.json'), JSON.stringify({ base: BASE, checks }, null, 2))
  console.log(`证据：${join(OUT, 'verify-report.json')}`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('验收失败：', e.message)
  process.exit(1)
})