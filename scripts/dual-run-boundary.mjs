#!/usr/bin/env node
/**
 * P1.7 Wave 3 · A-3 **Phase 1 —— 双跑对照**（AST 版 vs 正则版，diff 必须 = 0）
 *
 * 同一次扫描：
 *   - AST 版（scripts/ast/boundary-ast.mjs，Phase 2 起转正）
 *   - 正则版（scripts/boundary-regex-legacy.mjs，此刻仍是 **oracle**）
 * 逐条比对「归一化违规集」：两边集合差必须为空。diff ≠ 0 → EXIT=1 并打印差异条目。
 *
 * Phase 3 起正则版删除，本脚本改为「探针 6 例 + src 违规数快照」回归。
 *
 * 用法：node scripts/dual-run-boundary.mjs [--scan-root=<dir>]（默认 src/）
 */
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkBoundary, DEFAULT_SCAN_ROOT } from './ast/boundary-ast.mjs'
import { checkBoundaryRegex, normalize as normalizeRegex } from './boundary-regex-legacy.mjs'

export const SCRIPT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** AST 结果归一化：`桶|文件|目标`（与正则版口径对齐后逐条比对）。 */
export function normalizeAst(r) {
  const set = []
  for (const v of r.violations) set.push(`mod|${v.file}|${v.mod}`)
  for (const v of r.dynamicViolations) set.push(`dyn|${v.file}|${v.mod}`)
  for (const v of r.keyViolations) set.push(`key|${v.file}|${v.key}`)
  return [...set].sort()
}

/** 双跑：同一 scanRoot 上 AST 版 vs 正则版的违规集差。 */
export function runDiff({ scanRoot = DEFAULT_SCAN_ROOT, project } = {}) {
  const ast = checkBoundary({ scanRoot, project })
  const regex = checkBoundaryRegex({ scanRoot })
  const a = normalizeAst(ast)
  const b = normalizeRegex(regex)
  const onlyAst = a.filter((x) => !b.includes(x))
  const onlyRegex = b.filter((x) => !a.includes(x))
  return { ast, regex, onlyAst, onlyRegex, diff: onlyAst.length + onlyRegex.length }
}

function parseScanRoot(argv) {
  for (const a of argv) {
    const m = /^--scan-root=(.*)$/.exec(a)
    if (m && m[1]) return resolve(m[1])
  }
  return null
}

const isDirectRun = process.argv[1] && /dual-run-boundary\.mjs$/.test(process.argv[1])
if (isDirectRun) {
  const scanRoot = parseScanRoot(process.argv.slice(2)) ?? DEFAULT_SCAN_ROOT
  console.log('== A-3 Phase 1 · 双跑对照（AST vs 正则）==')
  const { ast, regex, onlyAst, onlyRegex, diff } = runDiff({ scanRoot })
  console.log(`  AST 版：扫描 ${ast.scanned} 个消费者文件，违规 ${normalizeAst(ast).length} 条（${ast.durationMs.toFixed(0)}ms）`)
  console.log(`  正则版：扫描 ${regex.scanned} 个消费者文件，违规 ${normalizeRegex(regex).length} 条（${regex.durationMs.toFixed(0)}ms）`)
  if (diff === 0) {
    console.log(`  ✅ 双跑违规集 diff = 0（AST 版未改变既有判定语义）`)
    process.exit(0)
  }
  console.log(`  ❌ 双跑违规集 diff ≠ 0（${diff} 条差异）`)
  for (const x of onlyAst.slice(0, 2)) console.log(`    仅 AST 版判红：${x}`)
  for (const x of onlyRegex.slice(0, 2)) console.log(`    仅正则版判红：${x}`)
  process.exit(1)
}
