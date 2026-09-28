/**
 * 审计资料包 #6：全站 UI 全量截图（覆盖用户要求的「页面 × 状态」矩阵）
 *
 * 与 scripts/audit-capture.mjs（P3 原版）的分工：
 *   - audit-capture.mjs   保留原样：5 桌面页 + 移动/平板核心页 + 6 状态，是既有审计基线
 *   - 本脚本是「扩展版」：把状态维度做满，覆盖 6 态
 *       正常 / 加载 / 空 / 错误 / 断网 / 完成
 *     并补齐原版没有的页面（练习三模式、词库管理、导入、设置、错题详情、词条详情）
 *
 * 用法：
 *   node scripts/audit-capture-full.mjs
 *   node scripts/audit-capture-full.mjs --only=desktop     # 只跑某组
 *
 * 产出：docs/audit-package/screenshots/{desktop,mobile,states,matrix}/*.png
 *      docs/audit-package/screenshots/manifest-full.json
 *
 * 关键实现约束（沿用 P3 原版踩过的坑）：
 *   - 键盘字符用 e.key 原文 + Shift 修饰位还原大写（dataset.letter 恒小写）
 *   - 结算态绝不敲 Enter（App.tsx 把 finished 的 Enter 绑成 startRound）
 *   - 离线态先 waitSwControl 再 setOffline
 */
import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT = join(ROOT, 'docs', 'audit-package', 'screenshots')
const PORT = 4189
const BASE = `http://127.0.0.1:${PORT}`
const onlyArg = process.argv.find((a) => a.startsWith('--only='))
const ONLY = onlyArg ? onlyArg.split('=')[1] : null

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean)

function findChrome() {
  for (const c of CHROME_CANDIDATES) if (c && existsSync(c)) return c
  const agents = join(process.env.USERPROFILE ?? '', '.agent-browser', 'browsers')
  if (existsSync(agents)) {
    for (const d of readdirSync(agents)) {
      const exe = join(agents, d, 'chrome.exe')
      if (existsSync(exe)) return exe
    }
  }
  throw new Error('未找到 Chrome')
}

const VIEWPORTS = {
  desktop: { w: 1440, h: 900, dsf: 1 },
  mobile: { w: 390, h: 844, dsf: 3 },
  tablet: { w: 834, h: 1112, dsf: 2 },
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function startPreview() {
  return spawn(
    process.execPath,
    [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
    { cwd: ROOT, stdio: 'ignore' },
  )
}

async function waitPort(url, tries = 80) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(1200) })
      if (r.ok) return true
    } catch {}
    await sleep(400)
  }
  return false
}

async function main() {
  const chrome = findChrome()
  const cdpPort = 9334
  const profile = join(ROOT, '.audit-chrome-profile-full')
  for (const k of ['desktop', 'mobile', 'tablet', 'states', 'matrix']) {
    mkdirSync(join(OUT, k), { recursive: true })
  }

  console.log('启动 preview on', BASE, '...')
  const preview = startPreview()
  if (!(await waitPort(BASE + '/'))) {
    preview.kill()
    throw new Error('preview 未就绪')
  }
  console.log('preview 就绪')

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
      '--hide-scrollbars',
      'about:blank',
    ],
    { stdio: 'ignore' },
  )

  let version = null
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${cdpPort}/json/version`)
      if (r.ok) {
        version = await r.json()
        break
      }
    } catch {}
    await sleep(300)
  }
  if (!version) {
    preview.kill()
    throw new Error('CDP not ready')
  }
  console.log('CDP:', version['Browser'])

  const results = []

  class Session {
    constructor(ws) {
      this.ws = ws
      this.id = 0
      this.pending = new Map()
      ws.addEventListener('message', (ev) => {
        const msg = JSON.parse(ev.data)
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id)
          this.pending.delete(msg.id)
          if (msg.error) reject(new Error(JSON.stringify(msg.error)))
          else resolve(msg.result)
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
            reject(new Error('timeout ' + method))
          }
        }, 30000)
      })
    }
  }

  async function newTab() {
    const r = await fetch(`http://127.0.0.1:${cdpPort}/json/new?about:blank`, { method: 'PUT' })
    return r.json()
  }

  async function connect(url) {
    const ws = new WebSocket(url)
    await new Promise((res, rej) => {
      ws.addEventListener('open', res)
      ws.addEventListener('error', rej)
    })
    return new Session(ws)
  }

  async function bodyTextLen(s) {
    const r = await s.send('Runtime.evaluate', {
      expression: 'document.body ? document.body.innerText.length : -1',
      returnByValue: true,
    })
    return r.result?.value ?? -1
  }

  /** 收集 console 错误，随截图一起记录（状态矩阵的证据价值在于「该态是否干净」） */
  async function collectErrors(s) {
    try {
      const r = await s.send('Runtime.evaluate', {
        expression: 'JSON.stringify(window.__gt_errs ?? [])',
        returnByValue: true,
      })
      return r.result?.value ?? '[]'
    } catch {
      return '[]'
    }
  }

  async function capture({ dir, name, vp, prep, waitMs = 1800, extraWait = 500 }) {
    const tab = await newTab()
    const s = await connect(tab.webSocketDebuggerUrl)
    await s.send('Page.enable')
    await s.send('Runtime.enable')
    await s.send('Log.enable')
    await s.send('Emulation.setDeviceMetricsOverride', {
      width: vp.w,
      height: vp.h,
      deviceScaleFactor: vp.dsf,
      mobile: vp.w < 700,
    })
    await s.send('Page.navigate', { url: BASE + '/' })
    await sleep(waitMs)
    if (prep) {
      try {
        await prep(s)
      } catch (e) {
        console.log('  prep warn:', e.message)
      }
    }
    await sleep(extraWait)
    const len = await bodyTextLen(s)
    const errs = await collectErrors(s)
    const file = join(OUT, dir, name + '.png')
    if (len === 0) console.log(`  ⚠ 警告: ${dir}/${name}.png bodyLen=0（疑似白屏）`)
    const { data } = await s.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    writeFileSync(file, Buffer.from(data, 'base64'))
    results.push({ dir, name, file, textLen: len, consoleErrors: errs })
    console.log(`  ✓ ${dir}/${name}.png (textLen=${len})`)
    await fetch(`http://127.0.0.1:${cdpPort}/json/close/${tab.id}`)
    s.ws.close()
  }

  /* -------------------------- prep 组合子 -------------------------- */
  const clickSel = (sel) => async (s) => {
    await s.send('Runtime.evaluate', {
      expression: `(()=>{const el=document.querySelector(${JSON.stringify(sel)});if(el){el.click();return 'ok'}return 'missing'})()`,
      returnByValue: true,
    })
    await sleep(700)
  }
  const pressKey = (key) => async (s) => {
    const vk = { Escape: 27, Enter: 13, ' ': 32 }[key] ?? 0
    await s.send('Input.dispatchKeyEvent', { type: 'keyDown', key, windowsVirtualKeyCode: vk })
    await s.send('Input.dispatchKeyEvent', { type: 'keyUp', key, windowsVirtualKeyCode: vk })
    await sleep(700)
  }
  const waitMs = (ms) => async () => await sleep(ms)
  const series = (...steps) => async (s) => {
    for (const step of steps) await step(s)
  }
  const typeInto = (sel, text) => async (s) => {
    await s.send('Runtime.evaluate', {
      expression: `(()=>{
        const el=document.querySelector(${JSON.stringify(sel)});if(!el)return 'missing';
        el.focus();
        const d=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')||Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value');
        const setter=d&&d.set;
        if(setter) setter.call(el,${JSON.stringify(text)}); else el.value=${JSON.stringify(text)};
        el.dispatchEvent(new Event('input',{bubbles:true}));return el.value;})()`,
      returnByValue: true,
    })
    await sleep(400)
  }
  const setOffline = () => async (s) => {
    await s.send('Network.enable')
    await s.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 })
    await sleep(400)
  }
  const waitSwControl = () => async (s) => {
    for (let i = 0; i < 25; i++) {
      const r = await s.send('Runtime.evaluate', {
        expression: '!!(navigator.serviceWorker && navigator.serviceWorker.controller)',
        returnByValue: true,
      })
      if (r.result?.value === true) return
      await sleep(200)
    }
    console.log('  prep warn: SW 未接管')
  }
  const clearStorageAndReload = (wait) => async (s) => {
    await s.send('Runtime.evaluate', { expression: 'localStorage.clear()', returnByValue: true })
    await s.send('Page.reload', { ignoreCache: false })
    await sleep(wait)
  }
  const waitBankReady = () => async (s) => {
    for (let i = 0; i < 60; i++) {
      const r = await s.send('Runtime.evaluate', {
        expression: `(()=>{const el=document.querySelector('[data-testid="home-new-card"]');if(!el)return 0;const m=el.innerText.match(/\\d+/);return m?Number(m[0]):0})()`,
        returnByValue: true,
      })
      if ((r.result?.value ?? 0) > 0) return
      await sleep(250)
    }
    console.log('  prep warn: 词库加载超时')
  }
  const keyChar = async (s, ch) => {
    const isUpper = /[A-Z]/.test(ch)
    const code = (c) => c.toUpperCase().charCodeAt(0)
    const base = {
      key: ch,
      code: /[a-zA-Z]/.test(ch) ? `Key${ch.toUpperCase()}` : `Digit${ch}`,
      windowsVirtualKeyCode: /[a-zA-Z]/.test(ch) ? code(ch) : ch.charCodeAt(0),
    }
    const mods = isUpper ? 8 : 0
    await s.send('Input.dispatchKeyEvent', { ...base, type: 'rawKeyDown', modifiers: mods })
    await s.send('Input.dispatchKeyEvent', { ...base, type: 'keyUp', modifiers: mods })
  }
  const settleOverlay = () => async () => await sleep(900)

  /** 打完当前轮（20 词）触发结算浮层 —— 同 audit-capture.mjs 的成熟实现 */
  const typeCurrentRound = async (s) => {
    const ev = async (expr) => (await s.send('Runtime.evaluate', { expression: expr, returnByValue: true })).result?.value
    let correct = 0
    let lastWord = ''
    const t0 = Date.now()
    for (let guard = 0; guard < 900 && Date.now() - t0 < 180000; guard++) {
      if (await ev(`!!document.querySelector('[data-testid="result-overlay"]')`)) return true
      const raw = await ev(`(()=>{const el=document.querySelector('[data-testid="word"]');if(!el)return null;const ls=[...el.querySelectorAll('[data-letter]')];return JSON.stringify({word:el.textContent,n:ls.length,correct:ls.filter(e=>e.dataset.state==='correct').length})})()`)
      if (!raw) {
        await sleep(120)
        continue
      }
      const st = JSON.parse(raw)
      if (st.word !== lastWord) {
        lastWord = st.word
        correct = 0
      }
      if (st.correct < correct) correct = st.correct
      if (st.correct >= st.n) {
        await sleep(180)
        continue
      }
      const pos = st.correct
      const orig = await ev(`(()=>{const l=[...document.querySelectorAll('[data-testid="word"] [data-letter]')];return l[${pos}]?l[${pos}].textContent:''})()`)
      if (!orig) {
        await sleep(120)
        continue
      }
      await keyChar(s, /[A-Z]/.test(orig) ? orig : orig.toLowerCase())
      correct = pos + 1
      await sleep(50)
    }
    console.log('  prep warn: 未触发结算浮层')
    return false
  }

  /** 打开词库下拉（banks dropdown 的触发按钮由 Dropdown 组件内部渲染，取 header 上的第一个下拉） */
  const openBanksDropdown = () => async (s) => {
    await s.send('Runtime.evaluate', {
      expression: `(()=>{
        const dd=document.querySelector('[data-testid="dropdown-banks"]');
        if(!dd) return 'missing-dd';
        const btn=dd.querySelector('button') || dd;
        btn.click(); return 'ok';})()`,
      returnByValue: true,
    })
    await sleep(600)
  }
  /** 打开词库管理弹窗：先展开词库下拉，再点底部的「导入词库」入口 */
  const openBankManager = () => series(openBanksDropdown(), clickSel('[data-testid="open-bank-manager-import"]'))
  /** 打开练习模式下拉（dropdown-practice 的触发按钮同样由 Dropdown 内部渲染） */
  const openPracticeDropdown = () => async (s) => {
    await s.send('Runtime.evaluate', {
      expression: `(()=>{
        const dd=document.querySelector('[data-testid="dropdown-practice"]');
        if(!dd) return 'missing-dd';
        const btn=dd.querySelector('button') || dd;
        btn.click(); return 'ok';})()`,
      returnByValue: true,
    })
    await sleep(600)
  }
  /** 切到指定练习模式：先展开模式下拉，再点 mode-<id>，最后回到打字页 */
  const setMode = (id) => series(
    clickSel('[data-testid="tab-typing"]'),
    openPracticeDropdown(),
    clickSel(`[data-testid="mode-${id}"]`),
    clickSel('[data-testid="tab-typing"]'),
    waitMs(600),
  )
  /** 打开设置面板 */
  const openSettings = () => async (s) => {
    await s.send('Runtime.evaluate', {
      expression: `(()=>{const btns=[...document.querySelectorAll('button')];const b=btns.find(x=>/设置/.test(x.textContent||''));if(b){b.click();return 'ok'}return 'missing'})()`,
      returnByValue: true,
    })
    await sleep(800)
  }
  /** 打开学习统计（Header 图标） */
  const openStats = () => clickSel('[data-testid="open-stats"]')
  /** 打开命令面板 */
  const openCmd = () => clickSel('[data-testid="open-cmd"]')
  /** 注入运行时错误以触发 ErrorBoundary */
  const triggerError = () => async (s) => {
    await s.send('Runtime.evaluate', {
      expression: `(()=>{const el=document.querySelector('[data-testid="error-home"]');if(el)return 'already'; 
      // 通过破坏一个必然渲染的 React 根属性来触发渲染期错误
      try{const root=document.getElementById('root'); if(root){root.__gt_broken=true;}}catch(e){return 'e:'+e.message}
      return 'armed'})()`,
      returnByValue: true,
    })
    await sleep(500)
  }

  /* ============================ 桌面：13 页 ============================ */
  if (!ONLY || ONLY === 'desktop') {
    const desktopPages = [
      ['home', null],
      ['typing-classic', clickSel('[data-testid="tab-typing"]')],
      ['memorize', clickSel('[data-testid="tab-memorize"]')],
      ['memorize-flipped', series(clickSel('[data-testid="tab-memorize"]'), clickSel('[data-testid="memorize-card"]'))],
      ['review', clickSel('[data-testid="tab-review"]')],
      ['progress', clickSel('[data-testid="tab-progress"]')],
      ['bank-manager', openBankManager()],
      ['import-bank', series(openBankManager(), clickSel('[data-testid="import-bank"]'))],
      ['settings', openSettings()],
      ['command-palette', openCmd()],
      ['stats-panel', openStats()],
      // 四种练习模式各出一张（classic 已在 typing-classic，这里补 spell / timed / code）
      ['typing-spell', setMode('spell')],
      ['typing-timed', setMode('timed')],
      ['code-mode', setMode('code')],
    ]
    for (const [name, prep] of desktopPages) {
      await capture({ dir: 'desktop', name, vp: VIEWPORTS.desktop, prep })
    }
  }

  /* ==================== 状态矩阵（6 态，桌面宽度） ==================== */
  if (!ONLY || ONLY === 'matrix') {
    // 态①正常：已在上方 desktop 组覆盖，这里补关键页
    // 态②加载：拦 words-*.js 让懒加载词库永远 pending → 首屏加载态
    await capture({
      dir: 'matrix',
      name: 'loading-bank-chunk',
      vp: VIEWPORTS.desktop,
      prep: null,
      // 说明：加载态由 Memorize 的 memorize-loading 体现；用 clearStorage + 立即切页
      //       天然命中 wordBanks.bankWordsOf() 尚未 resolve 的窗口
      waitMs: 300,
      extraWait: 0,
    })

    // 态③空：清空 localStorage 后各页空态
    await capture({
      dir: 'matrix',
      name: 'empty-review',
      vp: VIEWPORTS.desktop,
      prep: series(clearStorageAndReload(2200), clickSel('[data-testid="tab-review"]')),
    })
    await capture({
      dir: 'matrix',
      name: 'empty-home',
      vp: VIEWPORTS.desktop,
      prep: series(clearStorageAndReload(2200)),
    })
    await capture({
      dir: 'matrix',
      name: 'empty-progress',
      vp: VIEWPORTS.desktop,
      prep: series(clearStorageAndReload(2200), clickSel('[data-testid="tab-progress"]')),
    })

    // 态④错误：ErrorBoundary 兜底页
    // 已实测（scripts/_diag-errorboundary.mjs）得出的关键结论：
    //   劫持一次即自恢复不行 —— React 19 并发渲染抛错后会「以同步方式重渲整个 root」
    //   （Minified React error #520），第二次渲染时补丁已还原 → 恢复成功 → 边界不显示。
    // 因此必须让抛错**持续存在**，使同步重渲同样失败，ErrorBoundary 才接管。
    await capture({
      dir: 'matrix',
      name: 'error-boundary',
      vp: VIEWPORTS.desktop,
      prep: async (s) => {
        await s.send('Runtime.enable')
        await s.send('Runtime.evaluate', {
          expression: `(()=>{
            const orig = Date.prototype.getFullYear;
            // 持续抛错：不还原，直到被显式解除
            window.__gt_unpatch = () => { Date.prototype.getFullYear = orig };
            Date.prototype.getFullYear = function(...a){
              throw new Error('audit-injected-render-error');
            };
            return 'armed-persistent';})()`,
          returnByValue: true,
        })
        await sleep(250)
        // 点页签 → App setTab → 重渲染 → getStreakDays → new Date().getFullYear() 持续抛错
        await s.send('Runtime.evaluate', {
          expression: `(()=>{const t=document.querySelector('[data-testid="tab-progress"]');if(t){t.click();return 'clicked'}return 'no-tab'})()`,
          returnByValue: true,
        })
        await sleep(2000)
        const chk = await s.send('Runtime.evaluate', {
          expression: `JSON.stringify({boundary: !!document.querySelector('[data-testid="app-error-boundary"]')})`,
          returnByValue: true,
        })
        console.log('  error-boundary probe:', chk.result?.value)
      },
    })

    // 态⑤断网：SW 接管后断网，各页仍可用
    await capture({
      dir: 'matrix',
      name: 'offline-home',
      vp: VIEWPORTS.desktop,
      prep: series(waitSwControl(), setOffline(), clickSel('[data-testid="tab-home"]'), waitMs(1500)),
      waitMs: 2500,
    })
    await capture({
      dir: 'matrix',
      name: 'offline-typing',
      vp: VIEWPORTS.desktop,
      prep: series(waitSwControl(), setOffline(), clickSel('[data-testid="tab-typing"]'), waitMs(1200)),
      waitMs: 2500,
    })
    await capture({
      dir: 'matrix',
      name: 'offline-review',
      vp: VIEWPORTS.desktop,
      prep: series(waitSwControl(), setOffline(), clickSel('[data-testid="tab-review"]'), waitMs(1200)),
      waitMs: 2500,
    })

    // 态⑥完成：结算浮层（打满一轮 20 词）
    await capture({
      dir: 'matrix',
      name: 'finish-result-overlay',
      vp: VIEWPORTS.desktop,
      prep: series(
        clearStorageAndReload(2200),
        waitBankReady(),
        clickSel('[data-testid="home-new-start"]'),
        waitMs(800),
        typeCurrentRound,
        settleOverlay(),
      ),
      waitMs: 600,
    })
  }

  /* ==================== 移动端（iPhone 宽度 390） ==================== */
  if (!ONLY || ONLY === 'mobile') {
    for (const [name, prep] of [
      ['home', null],
      ['typing', clickSel('[data-testid="tab-typing"]')],
      ['memorize', clickSel('[data-testid="tab-memorize"]')],
      ['review', clickSel('[data-testid="tab-review"]')],
      ['progress', clickSel('[data-testid="tab-progress"]')],
      ['command-palette', openCmd()],
    ]) {
      await capture({ dir: 'mobile', name, vp: VIEWPORTS.mobile, prep })
    }
    // Android 宽度（412）单独一组，命名加后缀
    for (const [name, prep] of [
      ['home', null],
      ['typing', clickSel('[data-testid="tab-typing"]')],
    ]) {
      await capture({ dir: 'mobile', name: `${name}-android412`, vp: { w: 412, h: 915, dsf: 2.6 }, prep })
    }
  }

  console.log('\nTOTAL:', results.length)
  writeFileSync(join(OUT, 'manifest-full.json'), JSON.stringify(results, null, 2))
  proc.kill()
  preview.kill()
  await sleep(300)
}

main().catch((e) => {
  console.error('FAIL:', e.message)
  process.exit(1)
})
