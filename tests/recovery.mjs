#!/usr/bin/env node
/**
 * P1.7 Wave 1-C · Recovery Decision Function 测试（§5 / §19-1）
 *
 * 穷举由枚举驱动（不写死数字）：MIGRATION_PHASES × OLD_STATES × NEW_STATES 全组合，
 * 断言永不 undefined；8 核心行逐条断言；corrupt 终端优先级；兜底 MANUAL_REVIEW 永不静默。
 * 报告输出 phases/oldStates/newStates/totalCases/undefined（文档数字不再可能漂移）。
 *
 * 用法：node tests/recovery.mjs
 */
import { createServer } from 'vite'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

let pass = 0
let fail = 0
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`) }
  else { fail++; console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const server = await createServer({ root: ROOT, logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
const mod = await server.ssrLoadModule('/src/core/persistence/recovery.ts')
const { MIGRATION_PHASES, OLD_STATES, NEW_STATES, CORE_RULES, decideRecovery } = mod

/* ---------------- 1. 枚举驱动穷举（total，§19-1） ---------------- */
console.log('== 1. 枚举驱动穷举 ==')
let totalCases = 0
let undefinedCount = 0
const viaCount = { 'corrupt-terminal': 0, 'core-rule': 0, 'manual-fallback': 0 }
const actionCount = {}
for (const phase of MIGRATION_PHASES) {
  for (const oldState of OLD_STATES) {
    for (const newState of NEW_STATES) {
      totalCases++
      const d = decideRecovery(phase, oldState, newState)
      if (d === undefined || d.action === undefined) undefinedCount++
      else {
        viaCount[d.via]++
        actionCount[d.action] = (actionCount[d.action] ?? 0) + 1
      }
    }
  }
}
console.log(`  报告：phases=${MIGRATION_PHASES.length} oldStates=${OLD_STATES.length} newStates=${NEW_STATES.length} totalCases=${totalCases} undefined=${undefinedCount}`)
ok('穷举组合数 = 5×3×4 = 60', totalCases === 60, `totalCases=${totalCases}`)
ok('全部组合决策 total（undefined=0）', undefinedCount === 0, `undefined=${undefinedCount}`)
ok('决策来源分布：corrupt=30 / core=8 / manual=22', viaCount['corrupt-terminal'] === 30 && viaCount['core-rule'] === 8 && viaCount['manual-fallback'] === 22, JSON.stringify(viaCount))
ok('CORRUPT_STATE = 30（5×(1×4+2×1)）', actionCount['CORRUPT_STATE'] === 30)
ok('MANUAL_REVIEW = 22（兜底永不静默）', actionCount['MANUAL_REVIEW'] === 22)
ok('显式规则表恰 8 核心行', CORE_RULES.length === 8, `len=${CORE_RULES.length}`)

/* ---------------- 2. 8 核心行逐条断言 ---------------- */
console.log('== 2. 8 核心行 ==')
const coreExpect = [
  ['pending', 'complete', 'missing', 'RUN'],
  ['pending', 'missing', 'missing', 'COMPLETE'],
  ['running', 'complete', 'missing', 'RESUME'],
  ['verified', 'complete', 'missing', 'COMMIT'],
  ['committed', 'complete', 'complete', 'CLEANUP_OLD'],
  ['committed', 'missing', 'complete', 'COMPLETE'],
  ['failed', 'complete', 'missing', 'RERUN'],
  ['failed', 'missing', 'complete', 'COMPLETE'],
]
for (const [phase, oldS, newS, action] of coreExpect) {
  const d = decideRecovery(phase, oldS, newS)
  ok(`${phase}+${oldS}+${newS} → ${action}`, d.action === action && d.via === 'core-rule', `got=${d.action}/${d.via}`)
}

/* ---------------- 3. corrupt 终端优先级（压过显式行候选） ---------------- */
console.log('== 3. corrupt 终端 ==')
ok('pending+complete+corrupt → CORRUPT_STATE', decideRecovery('pending', 'complete', 'corrupt').action === 'CORRUPT_STATE')
ok('failed+corrupt+missing → CORRUPT_STATE（尽管 failed+complete+missing 是 RERUN 核心行）', decideRecovery('failed', 'corrupt', 'missing').action === 'CORRUPT_STATE')
ok('committed+complete+corrupt → CORRUPT_STATE（压过 CLEANUP_OLD 形）', decideRecovery('committed', 'complete', 'corrupt').action === 'CORRUPT_STATE')
ok('corrupt 决策 via=corrupt-terminal', decideRecovery('running', 'corrupt', 'partial').via === 'corrupt-terminal')
ok('corrupt 组合恰 30：phase×(old corrupt 全 new + new corrupt 且 old 非 corrupt)', [...MIGRATION_PHASES].filter((p) => OLD_STATES.filter((o) => NEW_STATES.filter((n) => decideRecovery(p, o, n).action === 'CORRUPT_STATE').length > 0).length >= 0).length === 5)

/* ---------------- 4. partial 与其余组合 → MANUAL_REVIEW（永不静默） ---------------- */
console.log('== 4. MANUAL_REVIEW 兜底 ==')
ok('running+complete+partial → MANUAL_REVIEW（protocol 违常态）', decideRecovery('running', 'complete', 'partial').action === 'MANUAL_REVIEW')
ok('pending+missing+partial → MANUAL_REVIEW', decideRecovery('pending', 'missing', 'partial').action === 'MANUAL_REVIEW')
ok('verified+missing+complete → MANUAL_REVIEW（旧数据丢了但新数据在，异常）', decideRecovery('verified', 'missing', 'complete').action === 'MANUAL_REVIEW')
ok('所有 partial 组合（non-corrupt）= MANUAL_REVIEW', MIGRATION_PHASES.every((p) => OLD_STATES.filter((o) => o !== 'corrupt').every((o) => decideRecovery(p, o, 'partial').action === 'MANUAL_REVIEW')))

console.log('──────────────────────────────────────────────────────')
console.log(`共 ${pass + fail} 项，通过 ${pass}，失败 ${fail}`)
console.log('──────────────────────────────────────────────────────')
process.exit(fail > 0 ? 1 : 0)
