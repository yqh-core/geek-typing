#!/usr/bin/env node
/**
 * P1.5 · Release Gate 机器判定器 —— 两层口径（2026-09-28 口径纠偏，yqh 审计指令）
 *
 * 旧版把「G1..G6 全 PASS」直接译成 RELEASE=APPROVED，但六门判据全部是代码/架构层的
 * 机器判定 —— 真实用户数据、UI 全量截图、UI-A11y 五视口这些产品层的发布前提根本
 * 不在六门里。「工程上就绪」≠「产品上可发布」。本版拆两层：
 *
 *   层一 CODE/ARCHITECTURE GATE   G1..G6（每门 4~6 条判据）→ ENGINEERING READY
 *   层二 PRODUCT RELEASE GATE     R1..R6（每条一判据）      → RELEASE READY
 *
 * RELEASE=APPROVED 当且仅当两层全绿。
 *
 * 事实源与解析（原则不变：标题行是唯一事实源，总览靠机器交叉核对）：
 *   1. 扫描 `### Gx-y · ...` / `### Rn · ...` 标题行中的状态标记（**PASS** / **FAIL** / **PENDING**）
 *   2. 解析 §0.1 / §0.2 总览表每行声明的 PASS/FAIL/PENDING 计数
 *   3. 交叉验证：逐节实际计数 vs 总览声明 —— 不一致 ⇒ EXIT=1（主判据）
 *   4. 层级判定：层内全 PASS → 层 🟢；含 FAIL/PENDING → 层未就绪
 *   5. RELEASE 判定：两层全绿 → RELEASE=APPROVED，否则 RELEASE=BLOCKED
 *
 * 退出码（防假通过，语义对齐 learning-consistency）：
 *   0 = RELEASE=APPROVED（两层全绿且总览一致）
 *   1 = RELEASE=BLOCKED（任一层含 FAIL/PENDING，或总览与逐节不一致）
 *   2 = 脚本自身错误（文档缺失 / 标题解析失败 / 总览行格式不认识 —— 解析失败绝不允许降级成 PASS）
 *
 * 用法：npm run release:gate   （或 node scripts/verify-release-gate.mjs）
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DOC = resolve(ROOT, 'docs/audit-package/13-acceptance/P1.5-RELEASE-GATE.md')

const ENGINEERING_GATES = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6']

let doc
try {
  doc = readFileSync(DOC, 'utf8')
} catch (e) {
  console.error(`❌ EXIT=2：门禁文档读取失败：${DOC} — ${e.message}`)
  process.exit(2)
}

/* ---------- 1. 逐节判据状态（标题行是唯一事实源） ---------- */
/** @type {Map<string, {id:string,title:string,status:string,line:number}>} */
const criteria = new Map()
const parseErrors = []

doc.split('\n').forEach((line, idx) => {
  const m = line.match(/^### ((?:G\d-\d)|(?:R\d+)) ·(.*)$/)
  if (!m) return
  const id = m[1]
  if (criteria.has(id)) parseErrors.push(`:${idx + 1} 判据 ${id} 标题重复出现`)
  const s = line.match(/\*\*(PASS|FAIL|PENDING)\b/)
  if (!s) {
    parseErrors.push(`:${idx + 1} 判据 ${id} 标题中找不到状态标记（**PASS**/**FAIL**/**PENDING**）—— 不允许无状态的判据标题`)
    return
  }
  criteria.set(id, { id, title: m[2].trim().slice(0, 46), status: s[1], line: idx + 1 })
})

/* 分组：G 按门聚合（4~6 条/门），R 每条自成一个判定单元 */
const gateOfG = (id) => (id.startsWith('G') ? `G${id[1]}` : null)
/** @type {Map<string, string[]>} */
const byUnit = new Map(ENGINEERING_GATES.map((g) => [g, []]))
for (const id of criteria.keys()) {
  const g = gateOfG(id)
  if (g) {
    if (!byUnit.has(g)) parseErrors.push(`判据 ${id} 不属于任何已知工程门（${ENGINEERING_GATES.join('/')}）`)
    else byUnit.get(g).push(id)
  } else {
    byUnit.set(id, [id]) // R 系列：一判据一单元
  }
}
for (const g of ENGINEERING_GATES) {
  const n = (byUnit.get(g) ?? []).length
  if (n === 0) parseErrors.push(`门 ${g} 一条判据都没扫到 —— 文档结构可能被改坏`)
  else if (n < 4 || n > 6) parseErrors.push(`门 ${g} 判据数 ${n} 超出 4~6 的预期范围（文档可能被改坏）`)
}
const rIds = [...criteria.keys()].filter((id) => id.startsWith('R'))
if (rIds.length > 0 && rIds.length < 4) parseErrors.push(`R 系列仅扫到 ${rIds.length} 条（<4）—— 产品层判据可能被误删`)
if (rIds.length > 12) parseErrors.push(`R 系列扫到 ${rIds.length} 条（>12）—— 文档可能被改坏`)

if (parseErrors.length > 0) {
  console.error('❌ EXIT=2：门禁文档解析失败（先修文档，再谈判定）：')
  for (const e of parseErrors) console.error(`   ${e}`)
  process.exit(2)
}

/* ---------- 2. §0 总览声明计数 ---------- */
/** @type {Map<string, {pass:number, fail:number, pending:number, line:number}>} */
const declared = new Map()
const overviewErrors = []
doc.split('\n').forEach((line, idx) => {
  const m = line.match(/^\|\s*\*\*((?:G|R)\d)\*\*\s*\|/)
  if (!m) return
  const unit = m[1]
  // 状态列 = 第 5 列（| 单元 | 名称 | 判据数 | 状态 | 说明 |）
  const cols = line.split('|').map((c) => c.trim())
  if (cols.length < 5) {
    overviewErrors.push(`:${idx + 1} 判定单元 ${unit} 总览行列数不足（期望 ≥5 列）`)
    return
  }
  const cell = cols[4] ?? ''
  // 兼容三种写法：「N PASS」「N FAIL [/ N PENDING]」「N PENDING」（R5/R6 的 PENDING-only 行）
  const any = cell.match(/\d+\s*(?:PASS|FAIL|PENDING)\b/)
  if (!any) {
    overviewErrors.push(`:${idx + 1} 判定单元 ${unit} 总览状态列解析不出「N PASS / N FAIL / N PENDING」：\`${cell}\``)
    return
  }
  if (declared.has(unit)) overviewErrors.push(`:${idx + 1} 判定单元 ${unit} 总览行重复出现`)
  declared.set(unit, {
    pass: Number(cell.match(/(\d+)\s*PASS\b/)?.[1] ?? 0),
    fail: Number(cell.match(/(\d+)\s*FAIL\b/)?.[1] ?? 0),
    pending: Number(cell.match(/(\d+)\s*PENDING\b/)?.[1] ?? 0),
    line: idx + 1,
  })
})
for (const g of ENGINEERING_GATES) {
  if (!declared.has(g)) overviewErrors.push(`§0.1 总览缺工程门 ${g} 的声明行`)
}
for (const id of rIds) {
  if (!declared.has(id)) overviewErrors.push(`§0.2 总览缺产品判据 ${id} 的声明行`)
}
for (const unit of declared.keys()) {
  if (!byUnit.has(unit)) overviewErrors.push(`§0 总览声明了不存在的判定单元 ${unit}`)
}

/* ---------- 3. 交叉验证 + 层级判定 ---------- */
const rows = []
const mismatches = [...overviewErrors] // 总览结构性错误同样意味着「总览不可信」→ BLOCKED
const totals = {
  eng: { p: 0, f: 0, q: 0, n: 0 },
  rel: { p: 0, f: 0, q: 0, n: 0 },
}

for (const unit of [...ENGINEERING_GATES, ...rIds]) {
  const ids = byUnit.get(unit) ?? []
  const actual = { PASS: 0, FAIL: 0, PENDING: 0 }
  for (const id of ids) actual[criteria.get(id).status]++
  const d = declared.get(unit) ?? { pass: -1, fail: -1, pending: -1, line: 0 }
  const match = d.pass === actual.PASS && d.fail === actual.FAIL && d.pending === actual.PENDING
  if (!match) {
    mismatches.push(
      `${unit}：总览声明 ${d.pass}/${d.fail}/${d.pending}（行 ${d.line}） vs 逐节实际 ${actual.PASS}/${actual.FAIL}/${actual.PENDING}`,
    )
  }
  const bucket = unit.startsWith('G') ? totals.eng : totals.rel
  bucket.p += actual.PASS
  bucket.f += actual.FAIL
  bucket.q += actual.PENDING
  bucket.n += ids.length
  rows.push({ unit, count: ids.length, ...actual, d, match })
}

/* ---------- 4. 输出 ---------- */
console.log('======================================================================')
console.log(' P1.5 RELEASE GATE — 两层机器判定（verify-release-gate.mjs）')
console.log(' 事实源：docs/audit-package/13-acceptance/P1.5-RELEASE-GATE.md 的逐节标题')
console.log('======================================================================')
console.log('Unit    判据  PASS  FAIL  PENDING   总览声明(行)      一致')
for (const r of rows) {
  const decl = `${r.d.pass}/${r.d.fail}/${r.d.pending}`
  console.log(
    `${r.unit.padEnd(7)} ${String(r.count).padEnd(5)} ${String(r.PASS).padEnd(5)} ${String(r.FAIL).padEnd(5)} ${String(r.PENDING).padEnd(8)} ${decl.padEnd(16)} ${r.match ? '✅' : '❌ 不一致'}`,
  )
}
console.log('──────────────────────────────────────────────────────────────────────')
console.log(
  `层一（工程 G1..G6）合计 ${totals.eng.n} 项判据：${totals.eng.p} PASS / ${totals.eng.f} FAIL / ${totals.eng.q} PENDING`,
)
console.log(
  `层二（产品 R 系列）合计 ${totals.rel.n} 项判据：${totals.rel.p} PASS / ${totals.rel.f} FAIL / ${totals.rel.q} PENDING`,
)

for (const mm of mismatches) console.log(`\n⚠️  总览与逐节不一致：${mm}`)

const engOK = totals.eng.f === 0 && totals.eng.q === 0
const relOK = totals.rel.f === 0 && totals.rel.q === 0

console.log('\n层级判定：')
console.log(
  `  层一 CODE/ARCHITECTURE GATE: ${engOK ? '🟢 ENGINEERING READY' : '🔴 NOT READY'}（G1..G6，${totals.eng.p}/${totals.eng.n} PASS）`,
)
console.log(
  `  层二 PRODUCT RELEASE GATE:  ${relOK ? '🟢 RELEASE READY' : '🔴 RELEASE READY=BLOCKED'}（${rIds[0]}..${rIds[rIds.length - 1]}，${totals.rel.p}/${totals.rel.n} PASS）`,
)
if (!relOK) {
  for (const id of rIds.filter((x) => criteria.get(x).status !== 'PASS')) {
    const c = criteria.get(id)
    console.log(`    ⏳ ${id}=${c.status} —— ${c.title}`)
  }
}

console.log('──────────────────────────────────────────────────────────────────────')

if (mismatches.length > 0) {
  console.log('\nRELEASE=BLOCKED —— 总览数字与逐节判据不一致（手工维护的总览不被信任，以逐节为准修文档）')
  process.exit(1)
}
if (engOK && relOK) {
  console.log(`\nRELEASE=APPROVED —— 两层全绿（工程 ${totals.eng.n} 项 + 产品 ${totals.rel.n} 项判据逐节核实，总览数字机器核对一致）`)
  console.log('⚠️ 这只代表门禁文档自洽；发布前仍需：未提交改动清点（git status）+ FINAL-TEST-OUTPUT 全量复跑留档。')
  process.exit(0)
}
const reasons = []
if (!engOK) reasons.push(`层一含 FAIL/PENDING（工程门 ${totals.eng.f} FAIL / ${totals.eng.q} PENDING）`)
if (!relOK) reasons.push(`层二含 FAIL/PENDING（产品判据 ${totals.rel.f} FAIL / ${totals.rel.q} PENDING）`)
console.log(`\nRELEASE=BLOCKED —— ${reasons.join('；')}`)
console.log('（PENDING 的语义是「产物还不存在」，不得记作 PASS；FAIL 必须先修根因）')
process.exit(1)
