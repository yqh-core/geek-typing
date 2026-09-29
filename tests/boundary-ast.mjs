#!/usr/bin/env node
/**
 * P1.7 Wave 3 · A-3 —— AST 版 Learning Boundary 判定的验收测试
 *
 * 断言三件事：
 *   1. **合成探针 6 例 → 5 红 1 放行**（tests/fixtures/boundary-probe/，旧 4 探针 + 新 2 探针），
 *      逐例校验命中的语法 kind 齐备 —— 这是非恒真对照组：「恒放行」与「恒判红」两种坏实现都过不去；
 *   2. **真实 src/ 违规数快照不变**（当前 = 0）—— Phase 3 删除正则实现后的回归基线之一，
 *      断言实现见 scripts/dual-run-boundary.mjs（那里也写清了它为什么足以接替原双跑 oracle）；
 *   3. **AST 判定执行耗时 ≤ 3s**（src/ 全量：parse + 遍历 29 个消费者文件）。
 *
 * 用法：node tests/boundary-ast.mjs（npm run test:boundary-ast）
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runBoundaryRegression, PROBES, SRC_SNAPSHOT } from '../scripts/dual-run-boundary.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const { rows, probeResult, srcResult, pass: basePass, fail: baseFail } = runBoundaryRegression({ verbose: false })

console.log('== A-3 · Learning Boundary AST 判定验收（npm test:boundary-ast）==')
console.log(`  ℹ️ 探针目录 = tests/fixtures/boundary-probe（${PROBES.length} 例：5 红 1 放行）；src 快照 = ${SRC_SNAPSHOT.violations}/${SRC_SNAPSHOT.dynamicViolations}/${SRC_SNAPSHOT.keyViolations}`)
for (const r of rows) {
  console.log(`  ${r.ok ? '✅' : '❌'} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
}

let extra = 0
let extraFail = 0
function ok(name, cond, detail = '') {
  const good = !!cond
  extra++
  if (!good) extraFail++
  console.log(`  ${good ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`)
}

console.log('\n== 附加判据 ==')
const totalMs = probeResult.durationMs + srcResult.durationMs
ok('AST 判定执行耗时 ≤ 3s', srcResult.durationMs <= 3000,
  `真实 src/ 扫描 ${srcResult.scanned} 个消费者文件，判定耗时 ${srcResult.durationMs.toFixed(0)}ms（探针 ${probeResult.durationMs.toFixed(0)}ms，合计 ${totalMs.toFixed(0)}ms）`)
const pkg = JSON.parse(readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8'))
ok('package.json：gate:learning-boundary 仍指向 scripts/gate-learning-boundary.mjs（CLI 名不变）',
  pkg.scripts['gate:learning-boundary'] === 'node scripts/gate-learning-boundary.mjs'
  && existsSync(resolve(REPO_ROOT, 'scripts/gate-learning-boundary.mjs')),
  `实测 = ${pkg.scripts['gate:learning-boundary']}`)
ok('package.json：test:boundary-ast 已注册', pkg.scripts['test:boundary-ast'] === 'node tests/boundary-ast.mjs',
  `实测 = ${pkg.scripts['test:boundary-ast']}`)
ok('Phase 3：正则实现已删除（repo 内无 boundary-regex-legacy.mjs）',
  !existsSync(resolve(REPO_ROOT, 'scripts/boundary-regex-legacy.mjs')),
  existsSync(resolve(REPO_ROOT, 'scripts/boundary-regex-legacy.mjs')) ? '仍存在，未按要求删除' : '已删除（git 历史留档）')

const pass = basePass + extra - extraFail
const fail = baseFail + extraFail
console.log('──────────────────────────────────────────────────────')
console.log(`共 ${pass + fail} 项，通过 ${pass}，失败 ${fail}`)
console.log('──────────────────────────────────────────────────────')
process.exit(fail > 0 ? 1 : 0)
