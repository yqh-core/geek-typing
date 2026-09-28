#!/usr/bin/env node
/**
 * P1.6-B02 · Learning Boundary Gate（学习层边界门禁）
 *
 * 依据：用户 P1.6-B「Learning Boundary Closure」—— UI / Feature 层不得直接 import
 * 学习态写/读模块，一律经 LearningService 门面（src/core/learning）。
 *
 * 禁止 UI 层直接 import 的模块（与用户 B02 清单一致）：
 *   - memorizeStore      （memorize 写/读）
 *   - reviewStore        （错题本写/读）
 *   - analytics          （analytics v1/v2 写 + 纯展示助手）
 *   - learning/storage   （gt.learning.v2 键族，仅 storage.ts 可写）
 *   - learning/insights  （掌握度分布等派生读数）
 *
 * 允许：src/core/learning（桥接层，门面在此 import 上述模块），以及 src/lib 内部互引。
 *
 * 判定：
 *   - 全 src/ 下「消费者文件」（非 src/core/learning、非 src/lib）出现上述模块的值导入 → 必须落在白名单；
 *   - 白名单外的任何文件（含新增模块）一旦值导入 → FAIL（防倒退，与 A03 同思路）；
 *   - 白名单内文件（ReviewPanel / ProgressPanel / StatsPanel）为待迁移消费者，门禁放行但记录，
 *     随 P1.6-C/D/E 逐步从白名单移除，直至门禁无需白名单即全绿；
 *   - `import type` / `export type` 仅引入类型、无运行时耦合，不计入违规（如 Header 的 Analytics 类型）。
 *
 * 退出码：0 = 通过；1 = 任一 FAIL。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'src')

/** 待迁移消费者白名单（basename）。这些文件当前仍值导入学习模块，随后续阶段移除。 */
const WHITELIST = new Set(['ReviewPanel.tsx', 'ProgressPanel.tsx', 'StatsPanel.tsx'])

/** 禁止 UI 直连的模块（import 路径片段）。 */
const FORBIDDEN = ['memorizeStore', 'reviewStore', 'analytics', 'learning/storage', 'learning/insights']

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

// 仅扫描消费者文件：跳过 src/core（桥接/领域层，含 core/learning 与 core/practice）与 src/lib（内部互引）
const consumers = files.filter((f) => {
  const r = rel(f)
  return !r.includes('/core/') && !r.includes('/lib/')
})

// 匹配模块片段
const modOf = (spec) => {
  for (const f of FORBIDDEN) if (spec.includes(`/${f}`)) return f
  return null
}

/** 判断一条 import/export 语句是否「仅类型」（无运行时耦合）：
 *  - `import type { ... } from` / `export type { ... } from` → 是；
 *  - `import { type A, type B } from` 全部绑定带 `type` 前缀 → 是；
 *  - 其余（含混合 `import { a, type B }`）→ 否（存在运行时绑定）。 */
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

// 捕获 import/export 整句（含绑定区与 from 子句）
const STMT_RE = /(import|export)([^;]*?)\s+from\s+['"]([^'"]+)['"]/g

const violations = [] // { file, mod }
const whitelisted = [] // { file, mod }

for (const f of consumers) {
  const text = readFileSync(f, 'utf8')
  const r = rel(f)
  for (const m of text.matchAll(STMT_RE)) {
    const clause = `${m[1]}${m[2]}` // import/export + 绑定区（不含 from 'mod'）
    const spec = m[3]
    const mod = modOf(spec)
    if (!mod) continue
    if (isTypeOnly(clause)) continue // 类型导入放行（无运行时耦合）
    const base = r.split('/').pop()
    if (WHITELIST.has(base)) whitelisted.push({ file: r, mod })
    else violations.push({ file: r, mod })
  }
}

console.log('== P1.6-B02 · Learning Boundary Gate ==')
ok('消费者文件无白名单外的学习模块直连（防倒退）', violations.length === 0,
  violations.length ? `违规 = ${violations.map((v) => `${v.file} → ${v.mod}`).join('; ')}` : '无')

const wlDesc = whitelisted.length
  ? `白名单内（待迁移）= ${[...new Set(whitelisted.map((w) => w.file))].join(', ')}`
  : '无（边界已全收口）'
ok('白名单消费者为已知待迁移项（不计入失败）', true, wlDesc)

console.log(`\n共 ${pass + fail} 项，通过 ${pass}，失败 ${fail}`)
process.exit(fail > 0 ? 1 : 0)
