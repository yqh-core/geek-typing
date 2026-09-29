#!/usr/bin/env node
/**
 * P1.7 Wave 3 · A-3 **Phase 3 —— 正则实现已删除后的边界回归 Runner**
 *
 * 历史三阶段：
 *   Phase 1：AST 版 vs 正则版**双跑对照**，diff = 0（c9a4d50：REGEX 当时的 src 违规集 == AST）
 *   Phase 2：`gate:learning-boundary` 转正指向 AST 实现（同上 commit）
 *   Phase 3：**删除正则实现** scripts/boundary-regex-legacy.mjs（git 历史留档，本 commit 删除）
 *
 * ⚠️ Phase 3 之后**双跑已不可运行**（无 second oracle 可比），本脚本因此改为：
 *     「合成探针 6 例（5 红 1 放行）+ 真实 src 违规数快照」回归。
 *     这不是把 diff=0 悄悄降级 —— oracle 换了，且更硬，理由见文末「为什么这样够」。
 *
 * **为什么这样够（替代 oracle 的说明）**
 *   1. 探针 6 例是**非恒真对照组**：P1~P5 必须判红（且各自命中的语法 kind 要齐备），
 *      P6 必须放行。「恒放行」的实现会让 P1~P5 与对照组（≥6 个文件判红）失败；
 *      「见啥都判红」的实现会让 P6（type-only 放行）失败 —— 两个方向都被钳死。
 *   2. src 违规数快照（当前 0 / 0 / 0）钉住**真实代码**：任何把越界导入写回消费者文件的改动
 *      都会让数字从 0 变正并立刻判红 —— 这是「防倒退」而非等价性证明，但盯的是真实仓状态。
 *   3. 键族 8 键 / FORBIDDEN 6 片段 / type-only 口径由本链路直接引用 boundary-ast.mjs 的导出，
 *      不存在「两份名单各改一半」的漂移空间。
 *   4. 唯一的损失：失去「两种实现逐 vendor 语义等价」的自动对照。但等价性已在 Phase 1 用
 *      diff = 0 证明并留在 git 历史里；此后 AST 是**唯一实现**，不存在第二个实现可漂移。
 *
 * 用法：node scripts/dual-run-boundary.mjs [--scan-root=<dir>]（默认 src/）
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkBoundary, DEFAULT_SCAN_ROOT, REPO_ROOT } from './ast/boundary-ast.mjs'

export const SCRIPT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
/** 合成探针目录（相对仓库根）。 */
export const PROBE_ROOT = 'tests/fixtures/boundary-probe'

/**
 * 探针期望表：**5 红 1 放行**（旧 4 探针 + 新 2 探针）。
 * red=true 的文件必须命中，且 expectKinds 里的每种 kind 都要出现 —— 防止「换一种语法也能蒙对」。
 */
export const PROBES = [
  { id: 'P1 静态值导入', file: `${PROBE_ROOT}/p1-static-import.probe.ts`, red: true, expectKinds: ['static-import'] },
  { id: 'P2 动态 import() + require()', file: `${PROBE_ROOT}/p2-dynamic-import.probe.ts`, red: true, expectKinds: ['dynamic-import', 'require'] },
  { id: 'P3 学习键族字面量', file: `${PROBE_ROOT}/p3-key-literal.probe.ts`, red: true, expectKinds: ['key-literal'] },
  { id: 'P4 字符串常量折叠拼接路径', file: `${PROBE_ROOT}/p4-concat-path.probe.ts`, red: true, expectKinds: ['dynamic-import'] },
  { id: 'P5 export-from 再导出 + 再导出链', file: `${PROBE_ROOT}/p5-export-from.probe.ts`, red: true, expectKinds: ['export-from', 'export-from-chain'] },
  { id: 'P6 type-only 放行', file: `${PROBE_ROOT}/p6-type-only.probe.ts`, red: false, expectKinds: [] },
]

/**
 * 真实 src/ 的违规数快照：**删除正则实现前实测 = 0 / 0 / 0**（静态 / 动态 / 键族）。
 * 它是 Phase 3 之后的回归基线之一；另一半是上面的探针对照组（二者互补，缺一则出现恒真断言）。
 */
export const SRC_SNAPSHOT = { violations: 0, dynamicViolations: 0, keyViolations: 0 }

/** 一次 AST 扫描 → 按文件分组的命中表。 */
export function scanByFile({ scanRoot, project } = {}) {
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

/**
 * 跑全套回归：探针 6 例 + src 违规数快照。
 * @returns {{pass: number, fail: number, probeResult: object, srcResult: object}}
 */
export function runBoundaryRegression({ srcScanRoot = DEFAULT_SCAN_ROOT, verbose = true } = {}) {
  const rows = []
  const ok = (name, cond, detail = '') => {
    rows.push({ name, ok: !!cond, detail })
    return !!cond
  }

  /* ---- 探针 6 例：5 红 1 放行 ---- */
  const probeResult = scanByFile({ scanRoot: PROBE_ROOT })
  let redCount = 0
  let passCount = 0
  for (const p of PROBES) {
    const hits = probeResult.byFile.get(p.file) ?? []
    const kinds = new Set(hits.map((h) => h.kind))
    if (p.red) {
      const missing = p.expectKinds.filter((k) => !kinds.has(k))
      if (ok(`${p.id} → 判红`, hits.length > 0,
        hits.length ? `${hits.length} 条：${hits.map((h) => `${h.kind}(${h.mod ?? h.key})`).join(', ')}` : '未命中')) redCount++
      if (p.expectKinds.length > 0) {
        ok(`${p.id} → 命中的语法种类齐备`, missing.length === 0,
          missing.length ? `缺失 kind：${missing.join(', ')}` : p.expectKinds.join(', '))
      }
    } else if (ok(`${p.id} → 放行（type-only）`, hits.length === 0,
      hits.length ? `误判：${hits.map((h) => h.kind).join(', ')}` : '零违规')) passCount++
  }
  ok('汇总：恰好 5 红 1 放行', redCount === 5 && passCount === 1, `红 ${redCount} / 放行 ${passCount}`)

  /* ---- 对照组：证明上面不是恒真断言 ---- */
  ok('对照组：探针目录确有 ≥6 个文件被判红（「恒放行」实现必失败）',
    probeResult.byFile.size >= 6, `判红文件数 = ${probeResult.byFile.size}`)
  const p4Text = readFileSync(resolve(REPO_ROOT, `${PROBE_ROOT}/p4-concat-path.probe.ts`), 'utf8')
  ok('对照组：P4 源码中无整字面量 import 路径（判红只能来自常量折叠）',
    !/import\s*\(\s*['"`][^'"`]*\/analytics['"`]\s*\)/.test(p4Text))

  /* ---- 真实 src/：违规数快照 ---- */
  const srcResult = checkBoundary({ scanRoot: srcScanRoot })
  const total = srcResult.violations.length + srcResult.dynamicViolations.length + srcResult.keyViolations.length
  ok(`真实 src/ 违规总数 == 快照(0)`, total === SRC_SNAPSHOT.violations + SRC_SNAPSHOT.dynamicViolations + SRC_SNAPSHOT.keyViolations,
    `实测 = ${total}（静态 ${srcResult.violations.length} / 动态 ${srcResult.dynamicViolations.length} / 键族 ${srcResult.keyViolations.length}）`)
  ok('扫描到消费者文件 > 0（扫描口径未被改坏）', srcResult.scanned > 0, `消费者文件数 = ${srcResult.scanned}`)

  const pass = rows.filter((r) => r.ok).length
  const fail = rows.length - pass
  if (verbose) {
    console.log('== A-3 Phase 3 · Learning Boundary 回归（探针 6 例 + src 违规数快照）==')
    console.log('  ℹ️ 正则 oracle 已按 Phase 3 删除；oracle = 探针对照组 + src 快照（见本文件头说明）')
    for (const r of rows) console.log(`  ${r.ok ? '✅' : '❌'} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
  }
  return { pass, fail, rows, probeResult, srcResult }
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
  const { pass, fail } = runBoundaryRegression({ srcScanRoot: parseScanRoot(process.argv.slice(2)) ?? DEFAULT_SCAN_ROOT })
  console.log(`\n共 ${pass + fail} 项，通过 ${pass}，失败 ${fail}`)
  process.exit(fail > 0 ? 1 : 0)
}
