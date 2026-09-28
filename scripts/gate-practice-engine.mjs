#!/usr/bin/env node
/**
 * P1.6-C · Practice Engine Gate（防倒退：UI 不得直调「完成三连」）
 *
 * 依据：P1.6-C 设计 —— 打字/复习完成的「3 连调用语义中枢」（learningService.applyWordDone +
 * recordWordDoneV2 + recordReview）已收拢到 src/core/practice/engine.ts（completeTypingWord），
 * UI（含 App / Memorize / 各 Panel）一律经 practiceEngine，不得自行戳这三个门面方法。
 *
 * 判定：
 *   - 全 src/ 下，除白名单文件外，任何文件出现 learningService.recordWordDoneV2 /
 *     learningService.recordReview / learningService.applyWordDone 的运行时调用（非 import type、
 *     非注释）→ FAIL；
 *   - 白名单（唯一权威调用点 + 定义层，允许直接出现这些符号）：
 *       src/core/practice/engine.ts        （权威编排：completeTypingWord 内部调用）
 *       src/core/learning/service.ts       （方法定义/桥接层，自身定义这些 API）
 *   - 其它任何文件（含未来新增的 Panel）一旦直调 → FAIL，防语义中枢再次散落。
 *
 * 退出码：0 = 通过；1 = 任一 FAIL。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'src')

/** 唯一允许直接出现「完成三连」符号的文件（basename 无关，按相对路径精确匹配） */
const ALLOWED = new Set(['src/core/practice/engine.ts', 'src/core/learning/service.ts'])

/** 禁止 UI 直调的门面方法（运行时调用） */
const FORBIDDEN_CALLS = [
  'learningService.recordWordDoneV2',
  'learningService.recordReview',
  'learningService.applyWordDone',
]

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

const violations = [] // { file, call }
for (const f of files) {
  const r = rel(f)
  if (ALLOWED.has(r)) continue
  const text = readFileSync(f, 'utf8')
  for (const call of FORBIDDEN_CALLS) {
    if (!text.includes(call)) continue
    // 逐行确认是运行时调用（排除类型位置 / 注释 / 字符串字面量里恰好出现）
    const lines = text.split('\n')
    for (const ln of lines) {
      const t = ln.trimStart()
      if (!ln.includes(call)) continue
      if (t.startsWith('//')) continue
      if (/^(import|export)\s+type\b/.test(t)) continue
      // 类型位置：`import { type X } from` 或 `: SomeType` 等不在此列；本门禁只拦方法调用，
      // 而 `learningService.xxx(` 的调用形态极难误中类型位置；这里只额外放行显式 import type 整句。
      violations.push({ file: r, call })
      break
    }
  }
}

console.log('== P1.6-C · Practice Engine Gate ==')
ok('非白名单文件无「完成三连」直调（防倒退）', violations.length === 0,
  violations.length ? `违规 = ${violations.map((v) => `${v.file} → ${v.call}`).join('; ')}` : '无')

console.log(`\n共 ${pass + fail} 项，通过 ${pass}，失败 ${fail}`)
process.exit(fail > 0 ? 1 : 0)
