/**
 * Evidence 聚合校验器（第二层独立校验 · P1.7-Wave6）
 *
 * 职责：不信任 W6-MASTER-MANIFEST.md 里手写的「1340 / 1340 CLOSED」汇总数字，
 * 而是从每个 Wave 的规范产物 evidence-matrix.json（机器唯一事实）重新计算：
 *
 *   每 Wave 链路检查数 = 任务数 × 8 + 1（orphan）
 *   全量合计           = Σ(任务数 × 8 + 1)
 *
 * 并交叉验证（**以下即实现实际所做，不多不少**）：
 *   1) 每个 Wave 的任务数取自 matrix.summary.total（HASH-MANIFEST 未单独声明任务数，故不与之对账）；
 *   2) 每个有 HASH-MANIFEST 的 Wave，其「CLOSED N/M」的 N、M 均 == 重算值；
 *   3) W6-MASTER-MANIFEST.md 声明的合计（从文件动态读取，非硬编码）== 重算合计；
 *   4) 每个 Wave 的 pass == total（0 FAIL）；
 *   5) 重算合计 == 既定口径 1340。
 *
 * 任一不一致即 exit 1（fail-closed），供最终 Release Gate 复跑判红。
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const EVIDENCE = join(ROOT, 'docs', 'audit-package', '_generated', 'evidence')
const AUDIT = join(ROOT, 'docs', 'audit-package')
const WAVES = ['W0', 'W1A', 'W1B', 'W1C', 'W1D', 'W2A', 'W2B', 'W2C', 'W3', 'W4', 'W5C', 'W5D']

let failures = 0
const rows = []
for (const w of WAVES) {
  const mj = join(EVIDENCE, w, 'evidence-matrix.json')
  if (!existsSync(mj)) {
    console.log(`  ❌ ${w}: 缺少 evidence-matrix.json`)
    failures++
    continue
  }
  const m = JSON.parse(readFileSync(mj, 'utf8'))
  const s = m.summary || {}
  const tasks = s.total || 0
  const pass = s.pass || 0
  const fail = s.fail || 0
  const expected = tasks * 8 + 1

  // HASH-MANIFEST 里的 CLOSED 声明（若有）
  let declaredClosed = null
  const hm = join(AUDIT, `${w}-HASH-MANIFEST.md`)
  if (existsSync(hm)) {
    const txt = readFileSync(hm, 'utf8')
    const mm = txt.match(/CLOSED\s+(\d+)\s*\/\s*(\d+)/)
    if (mm) declaredClosed = `${mm[1]}/${mm[2]}`
  }

  let rowOk = true
  if (pass !== tasks) {
    rowOk = false
    failures++
    console.log(`  ❌ ${w}: pass(${pass}) != total(${tasks})`)
  }
  if (declaredClosed) {
    const [n, d] = declaredClosed.split('/').map(Number)
    if (n !== expected || d !== expected) {
      rowOk = false
      failures++
      console.log(`  ❌ ${w}: HASH-MANIFEST CLOSED ${declaredClosed} != 重算 ${expected}/${expected}`)
    }
  }
  rows.push({ w, tasks, pass, fail, expected, declaredClosed, ok: rowOk })
}

const totalTasks = rows.reduce((a, r) => a + r.tasks, 0)
const totalPass = rows.reduce((a, r) => a + r.pass, 0)
const totalFail = rows.reduce((a, r) => a + r.fail, 0)
const totalChecks = rows.reduce((a, r) => a + r.expected, 0)

// 从 W6-MASTER-MANIFEST.md 动态读取声明的合计（不硬编码）
const w6 = join(AUDIT, 'W6-MASTER-MANIFEST.md')
let declaredTotal = null
if (existsSync(w6)) {
  const txt = readFileSync(w6, 'utf8')
  const mm = txt.match(/CLOSED\s+(\d+)\s*\/\s*(\d+)/)
  if (mm) declaredTotal = Number(mm[1])
}

console.log('\n逐 Wave 重算：')
console.log('  Wave | tasks | pass/fail | 重算链路检查(×8+1) | HASH-MANIFEST CLOSED | 一致')
for (const r of rows) {
  console.log(
    `  ${r.w.padEnd(5)} | ${String(r.tasks).padStart(5)} | ${r.pass}/${r.fail}     | ${String(r.expected).padStart(18)}      | ${r.declaredClosed ?? '— (无 manifest)'}`.padEnd(8) +
      ` | ${r.ok ? '✅' : '❌'}`,
  )
}

console.log('\n聚合：')
console.log(`  任务合计     = ${totalTasks}`)
console.log(`  PASS/FAIL    = ${totalPass}/${totalFail}`)
console.log(`  链路检查重算 = ${totalChecks}`)
console.log(`  W6 声明合计   = ${declaredTotal ?? '未读到'}`)

let aggOk = true
if (totalFail !== 0) {
  aggOk = false
  failures++
  console.log('  ❌ 存在 FAIL 任务')
}
if (declaredTotal !== null && declaredTotal !== totalChecks) {
  aggOk = false
  failures++
  console.log(`  ❌ W6 声明合计(${declaredTotal}) != 重算合计(${totalChecks})`)
}
if (totalChecks !== 1340) {
  aggOk = false
  failures++
  console.log(`  ❌ 重算合计(${totalChecks}) != 1340（与 P1.7 既定口径不符）`)
}

console.log(`\n聚合校验：${aggOk && failures === 0 ? '✅ PASS —— 1340/1340 由 evidence-matrix.json 独立重算确认' : `❌ FAIL（${failures} 项不一致）`}`)
console.log(`AGGREGATE_TASKS=${totalTasks} AGGREGATE_CHECKS=${totalChecks} AGGREGATE_FAIL=${totalFail}`)
if (!aggOk || failures > 0) process.exitCode = 1
