#!/usr/bin/env node
/**
 * P1.7 Wave 3 · A-3 —— AST 版 Learning Boundary 判定的验收测试
 *
 * 断言三件事：
 *   1. **合成探针 6 例 → 5 红 1 放行**（tests/fixtures/boundary-probe/），并逐例校验命中的
 *      语法 kind 齐备 —— 这是「非恒真对照组」：一个永远返回「无违规」的实现必然在这里判失败；
 *   2. **真实 src/ 上 AST 版与正则版双跑 diff = 0**（Phase 1 双跑对照，正则版此刻是 oracle）；
 *      Phase 3 删除正则版后，本项改为断言 src 违规数快照（见 runProbeSuite 说明）；
 *   3. **AST 判定执行耗时 ≤ 3s**（src/ 全量扫描）。
 *
 * 用法：node tests/boundary-ast.mjs
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { checkBoundary, REPO_ROOT, DEFAULT_SCAN_ROOT } from '../scripts/ast/boundary-ast.mjs'
import { runDiff } from '../scripts/dual-run-boundary.mjs'

/** 合成探针目录（相对仓库根）。 */
export const PROBE_ROOT = 'tests/fixtures/boundary-probe'

/**
 * 探针期望表：**5 红 1 放行**（旧 4 探针 + 新 2 探针）。
 * red=true 者必须命中，且 expectKinds 里每种 kind 都要出现 —— 防止「只靠其中一种语法蒙对」。
 */
export const PROBES = [
  { id: 'P1 静态值导入', file: `${PROBE_ROOT}/p1-static-import.probe.ts`, red: true, expectKinds: ['static-import'] },
  { id: 'P2 动态 import() + require()', file: `${PROBE_ROOT}/p2-dynamic-import.probe.ts`, red: true, expectKinds: ['dynamic-import', 'require'] },
  { id: 'P3 学习键族字面量', file: `${PROBE_ROOT}/p3-key-literal.probe.ts`, red: true, expectKinds: ['key-literal'] },
  { id: 'P4 字符串常量折叠拼接路径', file: `${PROBE_ROOT}/p4-concat-path.probe.ts`, red: true, expectKinds: ['dynamic-import'] },
  { id: 'P5 export-from 再导出 + 再导出链', file: `${PROBE_ROOT}/p5-export-from.probe.ts`, red: true, expectKinds: ['export-from', 'export-from-chain'] },
  { id: 'P6 type-only 放行', file: `${PROBE_ROOT}/p6-type-only.probe.ts`, red: false, expectKinds: [] },
]

/** 真实 src/ 违规总数快照（**当前 = 0**；Phase 3 删除正则实现后它就是回归基线的一半）。 */
export const SRC_VIOLATION_SNAPSHOT = 0

let pass = 0
let fail = 0
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`) }
  else { fail++; console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`) }
  return cond
}

/** 一次 AST 扫描 → 按文件分组的命中表。 */
function scanByFile({ scanRoot, project } = {}) {
  const r = checkBoundary({ scanRoot, project })
  const byFile = new Map()
  const add = (file, hit) => {
    const list = byFile.get(file) ?? []
    list.push(hit)
    byFile.set(file, list)
  }
  for (const v of r.violations) add(v.file, v)
  for (const v of r.dynamicViolations) add(v.file, v)
  for (const v of r.keyViolations) add(v.file, v)
  return { ...r, byFile }
}

/* ---------------- 1. 探针 6 例：5 红 1 放行 ---------------- */
console.log('== 1. 合成探针 6 例（5 红 1 放行）==')
{
  const r = scanByFile({ scanRoot: PROBE_ROOT })
  let redCount = 0
  let passCount = 0
  for (const p of PROBES) {
    const hits = r.byFile.get(p.file) ?? []
    const kinds = new Set(hits.map((h) => h.kind))
    if (p.red) {
      const missing = p.expectKinds.filter((k) => !kinds.has(k))
      if (ok(`${p.id} → 判红`, hits.length > 0,
        hits.length ? `${hits.length} 条：${hits.map((h) => `${h.kind}(${h.mod ?? h.key})`).join(', ')}` : '未命中')) redCount++
      if (p.expectKinds.length > 0) {
        ok(`${p.id} → 命中的语法种类齐备`, missing.length === 0,
          missing.length ? `缺失 kind：${missing.join(', ')}` : p.expectKinds.join(', '))
      }
    } else {
      if (ok(`${p.id} → 放行（type-only）`, hits.length === 0,
        hits.length ? `误判：${hits.map((h) => h.kind).join(', ')}` : '零违规')) passCount++
    }
  }
  ok('汇总：恰好 5 红 1 放行', redCount === 5 && passCount === 1, `红 ${redCount} / 放行 ${passCount}`)

  // —— 对照组：证明上面的断言不是恒真 ——
  ok('对照组：探针目录确有 ≥6 个文件被判红（「恒放行」实现必失败）', r.byFile.size >= 6, `判红文件数 = ${r.byFile.size}`)
  const p4Text = readFileSync(resolve(REPO_ROOT, `${PROBE_ROOT}/p4-concat-path.probe.ts`), 'utf8')
  ok('对照组：P4 源码中无整字面量 import 路径（判红只能来自常量折叠）',
    !/import\s*\(\s*['"`][^'"`]*\/analytics['"`]\s*\)/.test(p4Text))
}

/* ---------------- 2. 真实 src/：双跑 diff = 0 ---------------- */
console.log('\n== 2. 真实 src/ 双跑对照（AST vs 正则 oracle）==')
{
  const { ast, regex, onlyAst, onlyRegex, diff } = runDiff({ scanRoot: DEFAULT_SCAN_ROOT })
  ok('AST 版与正则版违规集 diff = 0', diff === 0,
    diff === 0
      ? `AST ${ast.scanned} 文件 / 正则 ${regex.scanned} 文件，两边违规集一致（0 违规）`
      : `差异 ${diff} 条：仅 AST = ${onlyAst.join('; ')}｜仅正则 = ${onlyRegex.join('; ')}`)
  const total = ast.violations.length + ast.dynamicViolations.length + ast.keyViolations.length
  ok(`真实 src/ 违规总数 == 快照(${SRC_VIOLATION_SNAPSHOT})`, total === SRC_VIOLATION_SNAPSHOT, `实测 = ${total}`)
  ok('AST 判定执行耗时 ≤ 3s', ast.durationMs <= 3000, `${ast.durationMs.toFixed(0)}ms（含 29 个消费者文件的 parse + 遍历）`)
}

console.log('──────────────────────────────────────────────────────')
console.log(`共 ${pass + fail} 项，通过 ${pass}，失败 ${fail}`)
console.log('──────────────────────────────────────────────────────')
process.exit(fail > 0 ? 1 : 0)
