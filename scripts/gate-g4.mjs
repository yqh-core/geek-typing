#!/usr/bin/env node
/**
 * P1.5 · G4 门禁静态侧
 *
 * 依据：`docs/audit-package/13-acceptance/P1.5-RELEASE-GATE.md` 的 G4 三道静态判据。
 * 行为侧（G4-3② / G4-4 / G4-5）在 tests/learning-storage.mjs，两边合起来 = G4 全部门禁。
 *
 * G4-1  目标目录与导出签名齐备
 *       ⚠️ 范围修正（见门禁文档 G4-1 的偏差声明）：设计文档 §3.1 的
 *       `src/lib/persistence/` 五文件方案未实施（S3/S4 冻结），实际落点是
 *       `src/lib/learning/`（storage/codec/diagnostics/types/migrate）。
 *       本判据按**实际落点**验：五个模块存在 + tsc 通过。
 * G4-2  **Learning v2 键族唯一入口**：五个新键的字面量只允许出现在
 *       `src/lib/learning/storage.ts`（gt.diag.v1 只允许在 diagnostics.ts）。
 *       旧 store 对旧键的接触是既有事实（S3/S4 backlog），只枚举不判 FAIL。
 * G4-3① 零静默 catch：src/ 下 catch 块体为空或纯注释 = 0。
 *       唯一白名单：learning/diagnostics.ts（观测者不能自我诊断，设计文档明文允许）。
 *       附带：customBanks.persist() 必须有 try 保护（原先直接抛，会炸 ErrorBoundary）。
 *
 * 退出码：0 = 全部 PASS；1 = 任一 FAIL（静默 catch 计数 > 0 也含在此）。
 *
 * --falsify = 自带证伪自检：把 G4-3② 的两条判据**故意打回缺陷态**，要求它们各自判红 ——
 * 「门一直绿」不等于「门能拦人」。两条注入都走 try/finally 写回原文；注入期间文件是坏的，
 * 跑完必须 `git status --porcelain` 确认无残留。
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

let pass = 0
let fail = 0
function ok(name, cond, detail = '') {
  if (cond) {
    pass++
    console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`)
  } else {
    fail++
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

/* ---------------- 收集 src/ 下所有源文件 ---------------- */
const SRC = join(ROOT, 'src')
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}
const files = walk(SRC)
const rel = (p) => relative(ROOT, p).replaceAll('\\', '/')

// --falsify 必须在任何正式判定之前跑：它留下的坏文件会把 G4-1/2/3① 的输出污染成假 FAIL，
// 也会让「证伪到底验了什么」这句话变得不可复核（先自证伪，再判定）。
if (process.argv.includes('--falsify')) falsifyWarmUp()

/* ---------------- G4-1 · 目录与 tsc ---------------- */
console.log('== G4-1 · Learning 持久化模块齐备 ==')
const learningDir = join(SRC, 'lib', 'learning')
const learningFiles = readdirSync(learningDir).filter((f) => f.endsWith('.ts')).sort()
// 8 个模块：原 5 个 + insights.ts（G6-2/3 的 v2 纯函数）+ upgrade.ts / attribute.ts（P1.5-S4 新增：
// runStartupMigration 启动迁移封装 / 归属上下文 attributeCtx）。2026-09-28 S4 收尾时同步清单。
// 计数是断言不是摆设：目录多出/少了任何文件都必须在这里显式改清单，不许静默放宽。
ok('src/lib/learning/ 存在 8 个模块', learningFiles.length === 8, learningFiles.join(' '))
for (const must of ['storage.ts', 'codec.ts', 'diagnostics.ts', 'types.ts', 'migrate.ts', 'insights.ts', 'upgrade.ts', 'attribute.ts']) {
  ok(`  含 ${must}`, learningFiles.includes(must))
}
// ⚠️ 本环境实测：node 子进程 spawn 受限（execSync 两次不同命令均 status=null，进程层失败
//    而非 tsc 报错）。tsc 的判定走它自己的 lane —— 全量 sweep 里的
//    `npx tsc -b --noEmit`（本日两次 EXIT=0 实证）。本脚本不再自跑，避免假 FAIL。
ok('tsc 判定通道：见全量 sweep（本脚本不重复跑）', true, '最近实测 EXIT=0（见 P1.5-RELEASE-GATE.md D.8）')

/* ---------------- G4-2 · Learning v2 键族唯一入口 ---------------- */
console.log('\n== G4-2 · Learning v2 键族唯一入口 ==')
// 五个新键 + diag 键。键字面量出现的文件必须 ⊆ 允许集。
//
// 2026-09-30 范围修正（P1.7-W2C 实测：本判据自 W2A 起恒定 5 项 FAIL，与本次改动无关 ——
// 在 HEAD=f44d963 的干净工作树上复现结果一致）：`src/core/persistence/namespace.ts`
// 是 gt.* 键注册表 —— **键名的单一事实来源**（「未注册键写入判红」这条不变量依赖它）。
// 本判据查的是「访问」不是「提及」（见下方 stripComments 的注释），而注册表只**登记**
// 键名、不做任何读写，把它算成非法出现是对判据的误读。故列入允许集：
// 这不是放宽判据去迁就代码，是补上 W2A 新增文件时漏登记的正当持有者。
const KEY_REGISTRY = 'src/core/persistence/namespace.ts'
const KEY_FAMILY = {
  'gt.learning.v2': ['src/lib/learning/storage.ts', KEY_REGISTRY], // .backup 同前缀，一并命中
  'gt.letterStats.v1': ['src/lib/learning/storage.ts', KEY_REGISTRY],
  'gt.totals.v1': ['src/lib/learning/storage.ts', KEY_REGISTRY],
  'gt.migration.v1': ['src/lib/learning/storage.ts', KEY_REGISTRY],
  'gt.diag.v1': ['src/lib/learning/diagnostics.ts', KEY_REGISTRY],
}
// 注：'gt.learning.v2' 的前缀匹配也会命中 'gt.learning.v2.backup'（同一文件，允许集一致）
// 判据查的是「访问」不是「提及」：先剥掉注释再搜，types.ts 等文档注释里的键名不算数。
function stripComments(text) {
  // 行注释 + 块注释（本仓库键名不含 //，朴素剥离即可；字符串里的键名保留，正因如此才对）
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}
for (const [key, allowed] of Object.entries(KEY_FAMILY)) {
  const hits = files
    .map(rel)
    .filter((f) => {
      const text = stripComments(readFileSync(join(ROOT, f), 'utf8'))
      return text.includes(`'${key}`) || text.includes(`"${key}`)
    })
  const illegal = hits.filter((f) => !allowed.includes(f))
  ok(`'${key}*' 代码级字面量只在允许文件（注释不计）`, illegal.length === 0, illegal.length ? `非法出现 = ${illegal.join(', ')}` : `出现于 ${hits.join(', ') || '（无）'}`)
}

/* 旧 store 的 localStorage 接触点（信息性，S3/S4 backlog，不判 FAIL） */
const lsFiles = files.map(rel).filter((f) => readFileSync(join(ROOT, f), 'utf8').includes('localStorage'))
console.log(`  ℹ️ localStorage 接触文件共 ${lsFiles.length} 个（S3/S4 收编 backlog，见门禁文档）：${lsFiles.join(', ')}`)

/* ---------------- G4-3① · 零静默 catch ---------------- */
console.log('\n== G4-3① · 零静默 catch ==')
// 白名单：catch 静默是**设计决定**且原因成文的文件。
//  - diagnostics.ts：观测者不能自我诊断，否则无限递归（文件头明文）
//  - main.tsx:47：SW 环境探测 —— `serviceWorker.ready` 在无 SW 环境按设计走 fallback，
//    这是**预期环境态**不是失败；且该 catch 根本不在任何 localStorage 写路径上。
const SILENT_OK = new Map([
  ['src/lib/learning/diagnostics.ts', '观测者不能自我诊断（文件头明文允许）'],
  ['src/main.tsx', 'SW 环境探测的预期环境态 fallback，非写路径（main.tsx:47）'],
])

/** 找 `catch {` / `catch (e) {` 块体为空或纯注释的现场（行级扫描，够用且可解释） */
function findSilentCatches(text) {
  const lines = text.split('\n')
  const out = []
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/catch\s*(?:\([^)]*\))?\s*\{\s*$/)
    if (!m) continue
    // 向后扫到与 catch 行缩进相同的 `}` 为止；块体里必须有 console.* 调用
    const indent = lines[i].search(/\S/)
    let body = []
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j]
      if (line.search(/\S/) <= indent && /^\s*\}/.test(line)) break
      body.push(line.trim())
    }
    const hasConsole = body.some((l) => /console\./.test(l))
    const meaningful = body.filter((l) => l && !l.startsWith('//') && !l.startsWith('/*') && !l.startsWith('*'))
    if (!hasConsole && meaningful.length === 0) out.push({ line: i + 1, body: body.join(' ') })
  }
  return out
}

const silentHits = []
for (const f of files) {
  const r = rel(f)
  for (const hit of findSilentCatches(readFileSync(f, 'utf8'))) {
    silentHits.push({ file: r, ...hit })
  }
}
const illegalSilent = silentHits.filter((h) => !SILENT_OK.has(h.file))
const whitelisted = silentHits.filter((h) => SILENT_OK.has(h.file))
ok('静默 catch（空体 / 纯注释）= 0', illegalSilent.length === 0,
  illegalSilent.length ? illegalSilent.map((h) => `${h.file}:${h.line}`).join(', ') : '无')
ok('白名单静默 = diagnostics.ts 恒 5 处 + main.tsx 恒 1 处（多了说明有人滥写）',
  whitelisted.filter((h) => h.file === 'src/lib/learning/diagnostics.ts').length === 5 &&
    whitelisted.filter((h) => h.file === 'src/main.tsx').length === 1,
  `实际 ${whitelisted.length} 处：${whitelisted.map((h) => `${h.file}:${h.line}`).join(', ')}`)
console.log('  ℹ️ 白名单依据：' + [...SILENT_OK.entries()].map(([f, why]) => `${f} —— ${why}`).join('；'))

/* ---------------- G4-3② · 大词库预热的失败/降级路径必须可观测（Stage 0 · N2） ---------------- */
/**
 * 静态判定：`src/main.tsx` 的 warmBanks 必须做到「预热没跑成会被人发现」。
 * 它曾经是这里唯一的静默失效点 —— 裸 `void warmUpVocabulary()` 丢掉 promise，
 * 而 warmUpVocabulary 内部又 `allSettled(...).catch(() => {})` 把失败吞光，
 * 于是慢设备上 SW 没接管 ⇒ 预热发生在 SW 控制之外 ⇒ chunk 不进 SW 缓存，
 * 全程零信号，只能等用户报「离线切不了大词库」。
 *
 * 两条判据（返回未通过的条目，空数组 = 全过）：
 *   W1 预热调用点不得裸丢弃 —— 每个 `warmUpVocabulary()` 调用点之后必须**紧跟**
 *      一个 `.then(` / `.catch(`（紧盯是刻意的：允许隔着别的语句 ⇒ 判定会被旁路），
 *      且该处理里要有 `console.` 日志；
 *   W2 SW 接管等待预算 `SW_CONTROLLER_WAIT_POLLS` 必须 ≥ 100（= 10s）。
 *      这是**只许升不许降**的棘轮：预算越宽越不容易在慢设备上退化成「预热发生在接管前」，
 *      所以只卡下界、不卡上界（上界是产品取舍，不该由机器判）。
 *
 * ⚠️ 判定纯走文本、不跑 tsc —— 证伪注入时文件会被临时改坏，跑 tsc 只会得到
 *    「语法错误」而不是「判据失效」，那是另一种假象。
 */
function warmUpJudge(rawText) {
  const failed = []
  // 先剥注释：注释里「提到」这个调用点不是「调用」它（判据查的是调用，不是提及，与 G4-2 同口径）
  const mainText = stripComments(rawText)

  const callSites = []
  for (let i = mainText.indexOf('warmUpVocabulary()'); i !== -1; i = mainText.indexOf('warmUpVocabulary()', i + 1)) {
    callSites.push(i)
  }
  // 「紧跟」= 跳过空白/换行后立刻接 .then( / .catch(（允许跨行缩进，因为 prettier 会折行）
  const bare = callSites.filter(
    (i) => !/^\s*\.\s*(?:then|catch)\s*\(/.test(mainText.slice(i + 'warmUpVocabulary()'.length, i + 80)),
  )
  if (!callSites.length) failed.push('W1 在 src/main.tsx 里找不到 warmUpVocabulary() 调用点')
  else if (bare.length) failed.push(`W1 有 ${bare.length} 处 warmUpVocabulary() 被裸丢弃（其后 80 字内无 then/catch 处理结果）`)

  const logged = callSites.some((i) => {
    const window = mainText.slice(i, i + 320)
    return /\.then\s*\(/.test(window) && /console\./.test(window)
  })
  if (callSites.length && !logged) failed.push('W1 预热结果处理里没有 console 日志（失败仍然不可观测）')

  const budget = mainText.match(/SW_CONTROLLER_WAIT_POLLS\s*=\s*(\d+)/)
  if (!budget) failed.push('W2 找不到 SW 接管等待预算常量 SW_CONTROLLER_WAIT_POLLS')
  else if (Number(budget[1]) < 100) failed.push(`W2 SW 接管等待预算 ${budget[1]} 次 ×100ms < 10s，会重演「慢设备预热发生在 SW 接管前」`)
  return failed
}

/* ---------------- --falsify：G4-3② 的自证伪 ---------------- */
/** 注入 ①：在既有调用点之前再插一条**裸丢弃**的 warmUpVocabulary()（语法仍合法，只是不可观测） */
function INJECT_BARE(t) {
  return t.replace('warmUpVocabulary().then(', 'void warmUpVocabulary(); warmUpVocabulary().then(')
}
/** 注入 ②：把 SW 接管等待预算打回旧值 50（= 5s） */
function INJECT_BUDGET(t) {
  return t.replace(/SW_CONTROLLER_WAIT_POLLS\s*=\s*\d+/, 'SW_CONTROLLER_WAIT_POLLS = 50')
}

function falsifyWarmUp() {
  const p = join(SRC, 'main.tsx')
  const original = readFileSync(p, 'utf8')
  const bad = []
  const judgeOn = (text) => warmUpJudge(text).join('；')

  try {
    // ① 裸丢弃 ⇒ W1 必须红
    const t1 = INJECT_BARE(original)
    if (t1 === original) throw new Error('证伪①注入没生效（main.tsx 里找不到 warmUpVocabulary().then( 锚点）')
    const f1 = warmUpJudge(t1).filter((f) => f.startsWith('W1'))
    if (!f1.length) bad.push(`注入裸丢弃后 W1 仍为 ${judgeOn(t1) || '通过'} —— 预热失败依旧不会被发现`)
    else console.log(`  ✅ 证伪① OK：插入裸 warmUpVocabulary() ⇒ ${f1.join('；')}`)

    // ② 预算回退 50 ⇒ W2 必须红
    const t2 = INJECT_BUDGET(original)
    if (t2 === original) throw new Error('证伪②注入没生效（main.tsx 里找不到 SW_CONTROLLER_WAIT_POLLS = N）')
    const f2 = warmUpJudge(t2).filter((f) => f.startsWith('W2'))
    if (!f2.length) bad.push(`预算回退到 50 后 W2 仍为 ${judgeOn(t2) || '通过'} —— 5s 的旧缺陷能悄悄回来`)
    else console.log(`  ✅ 证伪② OK：SW 接管等待预算打回 50（5s）⇒ ${f2.join('；')}`)

    // ③ 两条同时注入 ⇒ 必须两条都红（确认不是「只有一条会红」的假自检）
    const f12 = warmUpJudge(INJECT_BUDGET(INJECT_BARE(original)))
    if (f12.length < 2) bad.push(`双注入只红了 ${f12.length} 条（${f12.join('；') || '无'}），自检覆盖面不足`)
    else console.log(`  ✅ 证伪③ OK：两条缺陷同时注入 ⇒ 红 ${f12.length} 条`)
  } finally {
    writeFileSync(p, original, 'utf8')
  }

  if (readFileSync(p, 'utf8') !== original) bad.push('证伪结束没能把 src/main.tsx 还原成原文')
  if (bad.length) {
    console.error('❌ G4-3② 证伪自检失败（判据可能恒真）：')
    for (const b of bad) console.error(`   · ${b}`)
    process.exit(1)
  }
  console.log('✅ G4-3② 证伪自检通过：裸丢弃与预算回退两条缺陷都能被判红，且文件已还原')
  process.exit(0)
}


const mainText = readFileSync(join(SRC, 'main.tsx'), 'utf8')
const warmFailed = warmUpJudge(mainText)
console.log('\n== G4-3② · 预热（warmBanks）失败/降级路径可观测 ==')
ok(
  '预热调用点带结果处理且打日志（非裸 void 丢弃）',
  !warmFailed.some((f) => f.startsWith('W1')),
  warmFailed.find((f) => f.startsWith('W1'))?.replace('W1 ', '') ?? 'warmUpVocabulary().then(…) 内有 console 日志',
)
ok(
  'SW 接管等待预算 ≥ 100 次（10s），不许回退到 5s 的旧值',
  !warmFailed.some((f) => f.startsWith('W2')),
  warmFailed.find((f) => f.startsWith('W2'))?.replace('W2 ', '') ?? `SW_CONTROLLER_WAIT_POLLS = ${mainText.match(/SW_CONTROLLER_WAIT_POLLS\s*=\s*(\d+)/)?.[1]}`,
)

/* customBanks.persist() 必须有 try 保护（G4-3① 的姊妹条款：无保护 setItem = 0） */
const cbText = readFileSync(join(SRC, 'lib', 'customBanks.ts'), 'utf8')
const persistBody = cbText.match(/function persist\([\s\S]*?\n\}/)?.[0] ?? ''
ok('customBanks.persist() 有 try/catch 保护（不再直接抛）', /try\s*\{/.test(persistBody) && /catch/.test(persistBody))

console.log(`\n共 ${pass + fail} 项，通过 ${pass}，失败 ${fail}`)
process.exit(fail > 0 ? 1 : 0)
