/**
 * P1.7 Wave 3 · A-3 Phase 1 —— **正则实现（回归对照 oracle，Phase 3 后删除，git 历史留档）**
 *
 * 这是 scripts/gate-learning-boundary.mjs 原先的「正则 + 文件系统遍历」实现，原样搬移到此，
 * 仅用于 Phase 1 的双跑对照（AST 版 vs 正则版 diff = 0 即证明 AST 版未改变既有判定语义）。
 * Phase 2 起 `gate:learning-boundary` 已指向 AST 实现；本文件**不再参与任何门禁**。
 *
 * 相对原实现唯一的改动：新增 `--scan-root=<dir>` 可选参数（默认仍为 src/），
 * 使合成探针目录也能被扫描对照；默认行为不变。
 *
 * ⚠️ Phase 3 已完成后本文件删除；届时 oracle 由 tests/fixtures/boundary-probe 的 6 例探针
 * + 真实 src 违规数快照接替（见 scripts/dual-run-boundary.mjs 与 tests/boundary-ast.mjs）。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { FORBIDDEN, FORBIDDEN_KEY_LITERALS, WHITELIST, DEFAULT_SCAN_ROOT, REPO_ROOT, isConsumerPath } from './ast/boundary-ast.mjs'

const ROOT = REPO_ROOT

/** @typedef {{violations: Array, dynamicViolations: Array, keyViolations: Array, scanned: number, scanRoot: string}} RegexResult */

/**
 * 正则版判定（旧语义，oracle）。
 * @param {object} [opts]
 * @param {string} [opts.scanRoot]
 * @returns {RegexResult}
 */
export function checkBoundaryRegex({ scanRoot = DEFAULT_SCAN_ROOT } = {}) {
  const t0 = performance.now()
  const absScanRoot = resolve(ROOT, scanRoot)

  function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      const st = statSync(p)
      if (st.isDirectory()) walk(p, out)
      else if (/\.(ts|tsx)$/.test(name)) out.push(p)
    }
    return out
  }

  const files = walk(absScanRoot)
  const rel = (p) => relative(ROOT, p).replaceAll('\\', '/')

  // 仅扫描消费者文件：跳过 /core/（桥接/领域层）与 /lib/（内部互引）
  const consumers = files.filter((f) => isConsumerPath(rel(f)))

  // 匹配模块片段
  const modOf = (spec) => {
    for (const f of FORBIDDEN) if (spec.includes(`/${f}`)) return f
    return null
  }

  /** 判断一条 import/export 语句是否「仅类型」（无运行时耦合） */
  function isTypeOnly(clause) {
    if (/^import\s+type\b/.test(clause.trim()) || /^export\s+type\b/.test(clause.trim())) return true
    const open = clause.indexOf('{')
    const close = clause.lastIndexOf('}')
    if (open >= 0 && close > open) {
      const inner = clause.slice(open + 1, close)
      const parts = inner.split(',').map((s) => s.trim()).filter(Boolean)
      if (parts.length > 0 && parts.every((p) => p.startsWith('type '))) return true
    }
    return false
  }

  const STMT_RE = /(import|export)([^;]*?)\s+from\s+['"]([^'"]+)['"]/g
  const DYNAMIC_RE = /\b(?:import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g

  const violations = []
  const dynamicViolations = []
  const keyViolations = []

  for (const f of consumers) {
    const text = readFileSync(f, 'utf8')
    const r = rel(f)
    for (const m of text.matchAll(STMT_RE)) {
      const clause = `${m[1]}${m[2]}`
      const spec = m[3]
      const mod = modOf(spec)
      if (!mod) continue
      if (isTypeOnly(clause)) continue
      violations.push({ file: r, mod, kind: 'regex-static', spec })
    }
    for (const m of text.matchAll(DYNAMIC_RE)) {
      const mod = modOf(m[1])
      if (mod) dynamicViolations.push({ file: r, mod, kind: 'regex-dynamic', spec: m[1] })
    }
    for (const key of FORBIDDEN_KEY_LITERALS) {
      if (text.includes(`'${key}'`) || text.includes(`"${key}"`) || text.includes('`' + key)) {
        keyViolations.push({ file: r, key })
      }
    }
  }

  return {
    violations,
    dynamicViolations,
    keyViolations,
    scanned: consumers.length,
    scanRoot: absScanRoot,
    durationMs: performance.now() - t0,
    whitelist: WHITELIST,
  }
}

/** 违规集归一化：`桶|文件|目标`，用于双跑逐条比对。 */
export function normalize(result) {
  const set = []
  for (const v of result.violations) set.push(`mod|${v.file}|${v.mod}`)
  for (const v of result.dynamicViolations) set.push(`dyn|${v.file}|${v.mod}`)
  for (const v of result.keyViolations) set.push(`key|${v.file}|${v.key}`)
  return [...set].sort()
}

const isDirectRun = process.argv[1] && /boundary-regex-legacy\.mjs$/.test(process.argv[1])
if (isDirectRun) {
  let target = DEFAULT_SCAN_ROOT
  for (const a of process.argv.slice(2)) {
    const m = /^--scan-root=(.*)$/.exec(a)
    if (m && m[1]) target = resolve(m[1])
  }
  const r = checkBoundaryRegex({ scanRoot: target })
  const all = [...r.violations, ...r.dynamicViolations, ...r.keyViolations]
  console.log(`正则版：扫描 ${r.scanned} 个消费者文件，违规 ${all.length} 条（ ${r.durationMs.toFixed(0)}ms）`)
  for (const v of all) console.log(`  [${v.kind}] ${v.file} → ${v.mod ?? v.key}`)
  process.exit(all.length > 0 ? 1 : 0)
}
