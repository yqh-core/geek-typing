#!/usr/bin/env node
/**
 * P1.7 Wave 1-C · Field Compatibility Policy 测试（§8 八步决策算法）
 *
 * 每步独立断言 + 判红对照：
 *   1. no rule → FAIL（no-rule）        2/3. exact → PASS
 *   4. TRANSFORM_ALLOWED + 注册 transformer → TRANSFORM 回到比较
 *   5. OPTIONAL_PRESERVE 仅缺失可过      6. DROP_ALLOWED 仅 target 无键可过
 *   7. REQUIRED_PRESERVE / DROP_FORBIDDEN → FAIL
 *   8. TRANSFORM_ALLOWED 但 transformer 未注册 → FAIL
 *
 * 用法：node tests/field-policy.mjs
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
const mod = await server.ssrLoadModule('/src/core/persistence/field-policy.ts')
const { decideField, decideFields, exactDeepEqual, FIELD_MISSING: MISSING } = mod

const registry = {
  comparators: { 'version-lte': (s, t) => Number(s) <= Number(t) },
  transformers: {
    'num-to-string': (v) => String(v),
    'inc-forever': (v) => v + 1, // 永不收敛（target 固定）
  },
}

/* ---------------- 步骤 1：no rule → FAIL ---------------- */
console.log('== 步骤 1：no rule → FAIL ==')
{
  const d = decideField(1, 1, undefined, registry)
  ok('未登记字段 → FAIL no-rule', d.status === 'FAIL' && d.via === 'no-rule')
  ok('新增字段（target 有 source 无、无规则）→ FAIL', decideField(MISSING, 'x', undefined).status === 'FAIL')
}

/* ---------------- 步骤 2/3：exact ---------------- */
console.log('== 步骤 2/3：exact ==')
{
  const d = decideField({ a: 1, b: 2 }, { b: 2, a: 1 }, { path: 'obj', policy: 'REQUIRED_PRESERVE' })
  ok('缺省 comparator = exact-deep-equal（键序无关）→ PASS', d.status === 'PASS' && d.via === 'exact')
  const d2 = decideField(3, 3, { path: 'n', policy: 'REQUIRED_PRESERVE', comparator: 'version-lte' }, registry)
  ok('注册 comparator → PASS', d2.status === 'PASS')
  const d3 = decideField(5, 3, { path: 'n', policy: 'REQUIRED_PRESERVE', comparator: 'version-lte' }, registry)
  ok('自定义 comparator（5<=3 假）→ FAIL mismatch', d3.status === 'FAIL' && d3.via === 'mismatch')
  const d4 = decideField(1, 1, { path: 'n', policy: 'REQUIRED_PRESERVE', comparator: 'no-such' }, registry)
  ok('comparator 未注册 → FAIL transformer-missing', d4.status === 'FAIL' && d4.via === 'transformer-missing')
}

/* ---------------- 步骤 4：TRANSFORM ---------------- */
console.log('== 步骤 4：TRANSFORM ==')
{
  const d = decideField(42, '42', { path: 'v', policy: 'TRANSFORM_ALLOWED', transformer: 'num-to-string' }, registry)
  ok('transform 后 exact → PASS（via=transformed，value=变换后值）', d.status === 'PASS' && d.via === 'transformed' && d.value === '42')
  const d2 = decideField(1, 999, { path: 'v', policy: 'TRANSFORM_ALLOWED', transformer: 'inc-forever' }, registry)
  ok('transform 永不收敛 → FAIL transform-loop', d2.status === 'FAIL' && d2.via === 'transform-loop')
}

/* ---------------- 步骤 5：OPTIONAL_PRESERVE ---------------- */
console.log('== 步骤 5：OPTIONAL_PRESERVE ==')
{
  const rule = { path: 'opt', policy: 'OPTIONAL_PRESERVE' }
  ok('source 缺失 target 在 → PASS optional-missing', decideField(MISSING, 'v', rule).status === 'PASS')
  ok('source 在 target 缺失 → PASS optional-missing', decideField('v', MISSING, rule).status === 'PASS')
  ok('双侧存在但不等 → FAIL', decideField('a', 'b', rule).status === 'FAIL')
  ok('双侧缺失 → PASS', decideField(MISSING, MISSING, rule).status === 'PASS')
}

/* ---------------- 步骤 6：DROP_ALLOWED ---------------- */
console.log('== 步骤 6：DROP_ALLOWED ==')
{
  const rule = { path: 'gone', policy: 'DROP_ALLOWED' }
  ok('target 无此键（显式移除）→ PASS dropped', decideField('old', MISSING, rule).status === 'PASS' && decideField('old', MISSING, rule).via === 'dropped')
  ok('source 缺失 target 在（新增）→ FAIL', decideField(MISSING, 'new', rule).status === 'FAIL')
  ok('双侧存在不等 → FAIL', decideField('a', 'b', rule).status === 'FAIL')
}

/* ---------------- 步骤 7：REQUIRED_PRESERVE / DROP_FORBIDDEN ---------------- */
console.log('== 步骤 7：终端 FAIL 策略 ==')
{
  ok('REQUIRED_PRESERVE 值变 → FAIL', decideField(1, 2, { path: 'r', policy: 'REQUIRED_PRESERVE' }).status === 'FAIL')
  ok('REQUIRED_PRESERVE target 缺失 → FAIL', decideField(1, MISSING, { path: 'r', policy: 'REQUIRED_PRESERVE' }).status === 'FAIL')
  ok('DROP_FORBIDDEN target 缺失 → FAIL', decideField(1, MISSING, { path: 'r', policy: 'DROP_FORBIDDEN' }).status === 'FAIL')
  ok('DROP_FORBIDDEN 双侧缺失 → PASS（无移除行为）', decideField(MISSING, MISSING, { path: 'r', policy: 'DROP_FORBIDDEN' }).status === 'PASS')
}

/* ---------------- 步骤 8：transformer 未注册 ---------------- */
console.log('== 步骤 8：transformer 缺失 ==')
{
  const d = decideField(1, '1', { path: 'v', policy: 'TRANSFORM_ALLOWED', transformer: 'not-registered' }, registry)
  ok('TRANSFORM_ALLOWED 但 transformer 未注册 → FAIL', d.status === 'FAIL' && d.via === 'transformer-missing')
  const d2 = decideField(1, '1', { path: 'v', policy: 'TRANSFORM_ALLOWED' }, registry)
  ok('TRANSFORM_ALLOWED 无 transformer 声明 → FAIL', d2.status === 'FAIL' && d2.via === 'transformer-missing')
}

/* ---------------- 全字段批量 ---------------- */
console.log('== decideFields 批量 ==')
{
  const rules = [
    { path: 'id', policy: 'REQUIRED_PRESERVE' },
    { path: 'score', policy: 'TRANSFORM_ALLOWED', transformer: 'num-to-string' },
    { path: 'legacy', policy: 'DROP_ALLOWED' },
  ]
  const r1 = decideFields({ id: 'a', score: 90, legacy: 'x' }, { id: 'a', score: '90' }, rules, registry)
  ok('混合策略全过 → ok=true', r1.ok === true, JSON.stringify(r1.decisions.map((d) => d.via)))
  const r2 = decideFields({ id: 'a', extra: 1 }, { id: 'a' }, rules, registry)
  ok('未登记字段 extra → ok=false（no-rule）', r2.ok === false && r2.decisions.some((d) => d.status === 'FAIL' && d.via === 'no-rule'))
}

/* ---------------- exactDeepEqual 独立断言 ---------------- */
console.log('== exactDeepEqual ==')
ok('deep equal：嵌套 + 数组', exactDeepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] }))
ok('不等：数组顺序', !exactDeepEqual([1, 2], [2, 1]))
ok('不等：类型', !exactDeepEqual(1, '1'))

console.log('──────────────────────────────────────────────────────')
console.log(`共 ${pass + fail} 项，通过 ${pass}，失败 ${fail}`)
console.log('──────────────────────────────────────────────────────')
process.exit(fail > 0 ? 1 : 0)
