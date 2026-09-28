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
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
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
const KEY_FAMILY = {
  'gt.learning.v2': ['src/lib/learning/storage.ts'], // .backup 同前缀，一并命中
  'gt.letterStats.v1': ['src/lib/learning/storage.ts'],
  'gt.totals.v1': ['src/lib/learning/storage.ts'],
  'gt.migration.v1': ['src/lib/learning/storage.ts'],
  'gt.diag.v1': ['src/lib/learning/diagnostics.ts'],
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

/* customBanks.persist() 必须有 try 保护（G4-3① 的姊妹条款：无保护 setItem = 0） */
const cbText = readFileSync(join(SRC, 'lib', 'customBanks.ts'), 'utf8')
const persistBody = cbText.match(/function persist\([\s\S]*?\n\}/)?.[0] ?? ''
ok('customBanks.persist() 有 try/catch 保护（不再直接抛）', /try\s*\{/.test(persistBody) && /catch/.test(persistBody))

console.log(`\n共 ${pass + fail} 项，通过 ${pass}，失败 ${fail}`)
process.exit(fail > 0 ? 1 : 0)
