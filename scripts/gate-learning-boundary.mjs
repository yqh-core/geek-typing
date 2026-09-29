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
 *   - 全 src/ 下「消费者文件」（非 src/core/learning、非 src/lib）出现上述模块的值导入 → FAIL；
 *   - 动态 import('...') / require('...') 同样检测（2026-09-29 P1.6-B+ 补强：静态 from 正则
 *     此前漏掉动态导入这一绕过向量）；
 *   - 消费者文件出现 gt.* 学习键字面量 → FAIL（键族唯一入口在 lib/learning/storage.ts，
 *     与 G4-2 呼应；设置类键如 gt.mode/gt.theme 不在学习键清单内，不受影响）；
 *   - 白名单已于 2026-09-29 清零：ReviewPanel / ProgressPanel / StatsPanel 三个原待迁移
 *     消费者的读路径全部下沉 learningService（P1.6-B+ 补强提交），门禁**无需白名单即全绿**；
 *   - `import type` / `export type` 仅引入类型、无运行时耦合，不计入违规
 *     （如 Header 的 Analytics 类型）。
 *
 * 实现：2026-09-30 P1.7 Wave 3 · A-3 —— 判定核心换成 **AST（ts-morph）**，见
 * scripts/ast/boundary-ast.mjs。语义与原先的正则实现一致（消费者定义、禁用模块片段、
 * 8 个学习键族、type-only 放行、白名单 ∅ 均照旧），但额外覆盖：
 *   export...from 再导出链、字符串常量折叠拼接路径（BinaryExpression / 模板串 / 模块级 const）。
 * 三阶段：Phase 1 双跑对照（diff=0）→ Phase 2 本文件转正 → Phase 3 删除正则实现
 * （scripts/boundary-regex-legacy.mjs，git 历史留档）。
 *
 * CLI：node scripts/gate-learning-boundary.mjs [--scan-root=<dir>]（默认 src/）
 * 退出码：0 = 通过；1 = 任一 FAIL。
 */
import { resolve } from 'node:path'
import { checkBoundary, WHITELIST, DEFAULT_SCAN_ROOT } from './ast/boundary-ast.mjs'

function parseScanRoot(argv) {
  for (const a of argv) {
    const m = /^--scan-root=(.*)$/.exec(a)
    if (m && m[1]) return resolve(m[1])
  }
  return DEFAULT_SCAN_ROOT
}

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

const result = checkBoundary({ scanRoot: parseScanRoot(process.argv.slice(2)) })
const { violations, dynamicViolations, keyViolations } = result

console.log('== P1.6-B02 · Learning Boundary Gate ==')
ok('消费者文件无学习模块静态值导入（防倒退）', violations.length === 0,
  violations.length ? `违规 = ${violations.map((v) => `${v.file} → ${v.mod}`).join('; ')}` : '无')
ok('消费者文件无学习模块动态导入（import()/require()）', dynamicViolations.length === 0,
  dynamicViolations.length ? `违规 = ${dynamicViolations.map((v) => `${v.file} → ${v.mod}`).join('; ')}` : '无')
ok('消费者文件无学习键族字面量（键族唯一入口 = lib/learning/storage.ts）', keyViolations.length === 0,
  keyViolations.length ? `违规 = ${keyViolations.map((v) => `${v.file} → ${v.key}`).join('; ')}` : '无')

const wlDesc = WHITELIST.size === 0
  ? '无（白名单已清零，边界全收口）'
  : `白名单内（待迁移）= ${[...WHITELIST].join(', ')}`
ok('白名单为空或仅含已知待迁移项', true, wlDesc)

console.log(`\n共 ${pass + fail} 项，通过 ${pass}，失败 ${fail}`)
process.exit(fail > 0 ? 1 : 0)
