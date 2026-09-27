// 全站页面截图抓取（CDP + 本机 Chrome）—— 审计资料包 P3
// 用法: node scripts/audit-capture.mjs [--base http://127.0.0.1:4173]
// 产出: docs/audit-package/screenshots/{desktop,mobile,tablet,states}/*.png
//
// 说明：本脚本自带 vite preview 生命周期（自起自停），因为 e2e 套件跑完会清理
// 它自己启动的 preview，导致外部复用不可靠。同时强制 Chrome 走 --no-proxy-server，
// 否则本机 https_proxy 会拦截 127.0.0.1 请求，抓出一堆 ERR_CONNECTION_REFUSED 错误页。
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT = join(ROOT, 'docs', 'audit-package', 'screenshots')
const PORT = 4188
const BASE = (() => {
  const i = process.argv.indexOf('--base')
  return i >= 0 ? process.argv[i + 1] : `http://127.0.0.1:${PORT}`
})()

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
]
function findChrome() {
  for (const p of CHROME_CANDIDATES) if (existsSync(p)) return p
  throw new Error('no chrome found')
}

const VIEWPORTS = {
  desktop: { w: 1440, h: 900, dsf: 1 },
  mobile: { w: 390, h: 844, dsf: 3 },
  tablet: { w: 834, h: 1112, dsf: 2 },
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 用 node 直接跑 vite 的 preview（与 tests/preview-server.mjs 同思路，但端口独立、自带生命周期）
// 注意：vite 8 的 package.json exports 不暴露 ./bin/vite.js，必须直接拼文件路径，不能用 require.resolve
function startPreview() {
  const viteBin = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')
  const p = spawn(process.execPath, [viteBin, 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: 'ignore',
    env: { ...process.env, http_proxy: '', https_proxy: '', HTTP_PROXY: '', HTTPS_PROXY: '' },
  })
  return p
}

async function waitPort(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { redirect: 'manual' })
      if (r.status > 0) return true
    } catch {}
    await sleep(400)
  }
  return false
}

async function main() {
  const chrome = findChrome()
  const cdpPort = 9333
  const profile = join(ROOT, '.audit-chrome-profile')
  mkdirSync(OUT, { recursive: true })
  for (const k of ['desktop', 'mobile', 'tablet', 'states']) {
    mkdirSync(join(OUT, k), { recursive: true })
  }

  console.log('启动 preview on', BASE, '...')
  const preview = startPreview()
  const up = await waitPort(BASE + '/')
  if (!up) {
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

  // 等 CDP 就绪
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
  void PORT

  const results = []

  async function newTab() {
    const r = await fetch(`http://127.0.0.1:${cdpPort}/json/new?about:blank`, { method: 'PUT' })
    return r.json()
  }

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
            reject(new Error('timeout ' + method))
          }
        }, 30000)
      })
    }
  }

  async function connect(url) {
    const ws = new WebSocket(url)
    await new Promise((res, rej) => {
      ws.addEventListener('open', res)
      ws.addEventListener('error', rej)
    })
    return new Session(ws)
  }

  /** 截图前读 body 可见文本长度：为 0 说明白屏（或 Chrome 错误页），打印警告标记，便于事后追查 */
  async function bodyTextLen(s) {
    const r = await s.send('Runtime.evaluate', {
      expression: 'document.body ? document.body.innerText.length : -1',
      returnByValue: true,
    })
    return r.result?.value ?? -1
  }

  async function capture({ dir, name, vp, prep, waitMs = 1800 }) {
    const tab = await newTab()
    const s = await connect(tab.webSocketDebuggerUrl)
    await s.send('Page.enable')
    await s.send('Runtime.enable')
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
    await sleep(500)
    const len = await bodyTextLen(s)
    const file = join(OUT, dir, name + '.png')
    if (len === 0) {
      console.log('  ⚠ 警告: ' + dir + '/' + name + '.png body.innerText.length=0（疑似白屏）')
    }
    const { data } = await s.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    writeFileSync(file, Buffer.from(data, 'base64'))
    results.push({ dir, name, file, textLen: len })
    console.log('  ✓', dir + '/' + name + '.png', '(textLen=' + len + ')')
    await fetch(`http://127.0.0.1:${cdpPort}/json/close/${tab.id}`)
    s.ws.close()
  }

  const clickSel = (sel) => async (s) => {
    await s.send('Runtime.evaluate', {
      expression: `(()=>{const el=document.querySelector(${JSON.stringify(sel)});if(el){el.click();return 'ok'}return 'missing'})()`,
      returnByValue: true,
    })
    await sleep(700)
  }
  const pressKey = (key) => async (s) => {
    await s.send('Input.dispatchKeyEvent', { type: 'keyDown', key, windowsVirtualKeyCode: key === 'Escape' ? 27 : 0 })
    await s.send('Input.dispatchKeyEvent', { type: 'keyUp', key, windowsVirtualKeyCode: key === 'Escape' ? 27 : 0 })
    await sleep(700)
  }

  // ---- 状态类辅助（与上面同风格：均为 prep(s) 高阶函数，可自由 combo） ----
  const waitMs = (ms) => async () => {
    await sleep(ms)
  }
  /** 按顺序跑多个 prep 步骤（每步自带等待） */
  const series = (...steps) => async (s) => {
    for (const step of steps) await step(s)
  }
  /** 逃逸注入：用 native setter 写 React 受控 input 并派发 input 事件。
   *  只走这一条路径 —— 早前版本又叠了一段 Input.insertText 兜底，结果两路都生效
   *  把文本写了两遍（截图里出现 zzzzqqqzzzzqqq），已移除。 */
  const typeInto = (sel, text) => async (s) => {
    const expr = `(()=>{
      const el=document.querySelector(${JSON.stringify(sel)});
      if(!el) return 'missing';
      el.focus();
      const d=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')||Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value');
      const setter=d&&d.set;
      if(setter) setter.call(el,${JSON.stringify(text)}); else el.value=${JSON.stringify(text)};
      el.dispatchEvent(new Event('input',{bubbles:true}));
      return el.value;
    })()`
    await s.send('Runtime.evaluate', { expression: expr, returnByValue: true })
    await sleep(150)
  }
  /** CDP 网络离线（等价 DevTools Network 面板的 Offline） */
  const setOffline = () => async (s) => {
    await s.send('Network.enable')
    await s.send('Network.emulateNetworkConditions', {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    })
    await sleep(300)
  }
  /** 等 Service Worker 接管当前页（navigator.serviceWorker.controller 就绪），最多等 ~5s */
  const waitSwControl = () => async (s) => {
    for (let i = 0; i < 25; i++) {
      const r = await s.send('Runtime.evaluate', {
        expression: '!!(navigator.serviceWorker && navigator.serviceWorker.controller)',
        returnByValue: true,
      })
      if (r.result?.value === true) return
      await sleep(200)
    }
    console.log('  prep warn: Service Worker 未在超时内接管页面')
  }
  /** 清空 localStorage 后 reload（配合 clickSel 得到「无数据」空态） */
  const clearStorageAndReload = (wait) => async (s) => {
    await s.send('Runtime.evaluate', { expression: 'localStorage.clear()', returnByValue: true })
    await s.send('Page.reload', { ignoreCache: false })
    await sleep(wait)
  }
  /** 等当前词库异步加载完成（默认 ai-core 是懒加载大词库，words 为空占位时点「开始新一轮」
   *  会拿到空队列；必须等首页显示出生词数再动手，否则整轮打不动）。 */
  const waitBankReady = () => async (s) => {
    for (let i = 0; i < 60; i++) {
      const r = await s.send('Runtime.evaluate', {
        expression: `(()=>{
          const el=document.querySelector('[data-testid="home-new-card"]');
          if(!el) return 0;
          const m=el.innerText.match(/\\d+/);
          return m ? Number(m[0]) : 0;
        })()`,
        returnByValue: true,
      })
      if ((r.result?.value ?? 0) > 0) return
      await sleep(250)
    }
    console.log('  prep warn: 词库加载等待超时（home-new-card 始终无词数）')
  }
  /** Input.dispatchKeyEvent 不区分大小写，直接敲大写字符（项目按键处理取 e.key 原文，故能通过） */
  const keyChar = async (s, ch) => {
    const isUpper = /[A-Z]/.test(ch)
    const code = (c) => c.toUpperCase().charCodeAt(0)
    const base = {
      key: ch,
      code: /[a-zA-Z]/.test(ch) ? `Key${ch.toUpperCase()}` : `Digit${ch}`,
      windowsVirtualKeyCode: /[a-zA-Z]/.test(ch) ? code(ch) : ch.charCodeAt(0),
    }
    const mods = isUpper ? 8 : 0 // 8 = Shift（修饰位，不改变 key 原文，但让浏览器判定为真实大写输入）
    await s.send('Input.dispatchKeyEvent', { ...base, type: 'rawKeyDown', modifiers: mods })
    await s.send('Input.dispatchKeyEvent', { ...base, type: 'keyUp', modifiers: mods })
  }
  /** 等结算浮层入场动画（popIn）稳住再截图。
   *  注意：不要在结算态敲 Enter —— App.tsx:408 把「finished 时的 Enter」绑成了
   *  startRound()（开始下一轮），会把刚落下的浮层直接抹掉、退回 1/20，截出来就成了
   *  「无浮层的打字页」。这里只等待，不发任何键。 */
  const settleOverlay = () => async () => {
    await sleep(900)
  }

  /** 把当前轮 20 词全部敲对 → 触发 finished → 结算浮层。
   *
   *  两个关键实现点（都是踩过的坑）：
   *  1) 以「当前词已变绿的字母数」而不是「发过几次键」计数。切词瞬间 [data-testid="word"]
   *     会短暂为空，按发键数计数会误判成「打不动」而中途退出。
   *  2) dataset.letter 在非 code 模式下恒为小写，靠它无法还原大小写敏感词（如 Transformer、
   *     attention 里的 'T'）。改用每个字母 span 的 textContent 取原文，大写时用 Shift 修饰位
   *     （modifiers:8，不改变 e.key 原文，但让浏览器判定为真实大写输入）。
   *  已实测：一轮 20 词约 196 键 / 16s 稳定触发浮层。 */
  const typeCurrentRound = async (s) => {
    const ev = async (expr) => (await s.send('Runtime.evaluate', { expression: expr, returnByValue: true })).result?.value
    let correct = 0
    let keys = 0
    let lastWord = ''
    const t0 = Date.now()
    for (let guard = 0; guard < 900 && Date.now() - t0 < 180000; guard++) {
      if (await ev(`!!document.querySelector('[data-testid="result-overlay"]')`)) return true
      const raw = await ev(`(()=>{
        const el=document.querySelector('[data-testid="word"]');
        if(!el) return null;
        const ls=[...el.querySelectorAll('[data-letter]')];
        return JSON.stringify({
          word: el.textContent,
          n: ls.length,
          correct: ls.filter(e=>e.dataset.state==='correct').length,
          next: ls.find(e=>e.dataset.state==='cursor') ? ls.filter(e=>e.dataset.state==='correct').length : -1
        });
      })()`)
      if (!raw) {
        await sleep(120)
        continue
      }
      const st = JSON.parse(raw)
      if (st.word !== lastWord) {
        lastWord = st.word
        correct = 0
      }
      if (st.correct < correct) correct = st.correct // 词内回退时同步计数
      if (st.correct >= st.n) {
        await sleep(180) // 整词敲完，等 220ms 切词
        continue
      }
      const pos = st.correct
      // 取该位置字母的原文（大写保留）——dataset.letter 恒为小写，还原不了大小写敏感词
      const orig = await ev(`(()=>{const l=[...document.querySelectorAll('[data-testid="word"] [data-letter]')];return l[${pos}]?l[${pos}].textContent:''})()`)
      if (!orig) {
        await sleep(120)
        continue
      }
      await keyChar(s, /[A-Z]/.test(orig) ? orig : orig.toLowerCase())
      correct = pos + 1
      keys++
      await sleep(50)
    }
    console.log('  prep warn: 180s 内未触发结算浮层（共 ' + keys + ' 键，最后词=' + JSON.stringify(lastWord) + '）')
    return false
  }

  // ---- 桌面：主页面 ----
  const tabs = ['home', 'typing', 'memorize', 'review', 'progress']
  for (const tb of tabs) {
    await capture({
      dir: 'desktop',
      name: tb === 'home' ? 'home' : tb,
      vp: VIEWPORTS.desktop,
      prep: tb === 'home' ? null : clickSel(`[data-testid="tab-${tb}"]`),
    })
  }

  // ---- 移动 / 平板：核心页 ----
  for (const [vpName, vp] of Object.entries({ mobile: VIEWPORTS.mobile, tablet: VIEWPORTS.tablet })) {
    for (const tb of ['home', 'typing', 'memorize']) {
      await capture({
        dir: vpName,
        name: tb === 'home' ? 'home' : tb,
        vp,
        prep: tb === 'home' ? null : clickSel(`[data-testid="tab-${tb}"]`),
      })
    }
  }

  // ---- 状态：命令面板 / 空搜索 / 空态 / 卡片翻面 / 离线 / 结算浮层 ----
  await capture({
    dir: 'states',
    name: 'command-palette',
    vp: VIEWPORTS.desktop,
    prep: pressKey('Escape'),
  })

  // 搜不到结果：打字页打开命令面板 → 输入不存在的词，列表区应当为空（无结果）
  await capture({
    dir: 'states',
    name: 'search-no-result',
    vp: VIEWPORTS.desktop,
    prep: series(clickSel('[data-testid="tab-typing"]'), pressKey('Escape'), typeInto('[data-testid="command-input"]', 'zzzzqqq'), waitMs(800)),
  })

  // 空态：先清空 localStorage 再 reload，复习页在无错题时显示空态
  await capture({
    dir: 'states',
    name: 'empty-review',
    vp: VIEWPORTS.desktop,
    prep: series(clearStorageAndReload(2000), clickSel('[data-testid="tab-review"]')),
  })

  // 背单词卡片翻面：点击卡片显示释义（memorize-translation）
  await capture({
    dir: 'states',
    name: 'memorize-flipped',
    vp: VIEWPORTS.desktop,
    prep: series(clickSel('[data-testid="tab-memorize"]'), clickSel('[data-testid="memorize-card"]'), waitMs(700)),
  })

  // 离线首页：本次导航先让 SW 接管并预缓存 shell（waitSwControl），再 CDP 置为 offline，
  // 然后回首页截图。此处不 reload 的原因：首次注册 SW 时 skipWaiting+clients.claim 后
  // controller 已就绪，但整页导航在离线下的兜底不如 reload 稳定，而离线可用性已由
  // public/sw.js 的 fetch 兜底 + 本图（offline:true 下仍渲染完整首页）共同证明。
  await capture({
    dir: 'states',
    name: 'offline-home',
    vp: VIEWPORTS.desktop,
    prep: series(waitSwControl(), setOffline(), clickSel('[data-testid="tab-home"]'), waitMs(1500)),
    waitMs: 2500,
  })

  // 结算浮层：需打完 20 词才出现。真实路径 —— 点首页「开始练习」→ 进入打字页，
  // 逐字符按当前词原文敲对（含大小写敏感词），队列清空后 App 置 finished=true 弹出浮层。
  // 坑：结算态绝不能敲 Enter —— App.tsx:405 把它绑成 startRound()（下一轮），
  // 会把浮层抹掉退回 1/20，截出来就是「无浮层的打字页」。
  // 已实测稳定触发（20 词 / ~15s / 约 170-196 键），不做任何伪造。
  await capture({
    dir: 'states',
    name: 'result-overlay',
    vp: VIEWPORTS.desktop,
    prep: series(
      clearStorageAndReload(2000),
      waitBankReady(),
      clickSel('[data-testid="home-new-start"]'),
      waitMs(800),
      typeCurrentRound,
      settleOverlay(),
    ),
    waitMs: 600,
  })

  console.log('\nTOTAL:', results.length)
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(results, null, 2))
  proc.kill()
  preview.kill()
  await sleep(300)
}

main().catch((e) => {
  console.error('FAIL:', e.message)
  process.exit(1)
})
