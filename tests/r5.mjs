#!/usr/bin/env node
/**
 * P1.7 Wave 1-C · R5 数据不变量验收测试（§9）
 *
 * 五零 + identity set 集合相等（set 相等而非仅 size，防 A,B,C → A,B,D）；
 * 每个违规类型独立判红；allowedLoss 显式豁免；大小相等但集合不等的判红。
 *
 * 用法：node tests/r5.mjs
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
const mod = await server.ssrLoadModule('/src/core/persistence/r5.ts')
const { r5Check, setEqual } = mod

const rec = (id, extra = {}) => ({ id, ...extra })
const VALID_ENUMS = { status: ['new', 'learning', 'mastered'] }

/* ---------------- 集合相等工具 ---------------- */
console.log('== setEqual ==')
ok('同集不同序 → true', setEqual(['a', 'b', 'c'], ['c', 'a', 'b']))
ok('size 相同元素不同 → false', !setEqual(['a', 'b', 'c'], ['a', 'b', 'd']))
ok('size 不同 → false', !setEqual(['a'], ['a', 'b']))
ok('重复元素不影响集合语义（["a","a","a"] 的集合就是 {"a"}）', setEqual(['a'], ['a', 'a']))

/* ---------------- 五零 happy path ---------------- */
console.log('== 五零 happy path ==')
{
  const before = [rec('w1'), rec('w2', { refs: ['w1'] }), rec('w3', { requiredRelations: ['deck'], relations: { deck: 'd1' } })]
  const after = [rec('w1'), rec('w2', { refs: ['w1'] }), rec('w3', { requiredRelations: ['deck'], relations: { deck: 'd1' } })]
  const r = r5Check(before, after, { validEnums: VALID_ENUMS })
  ok('R5 ok=true', r.ok === true)
  ok('五零全 0', Object.values(r.counts).every((c) => c === 0), JSON.stringify(r.counts))
  ok('identitySetEqual=true', r.identitySetEqual === true)
  ok('identityDiff 空', r.identityDiff.lost.length === 0 && r.identityDiff.gained.length === 0)
}

/* ---------------- 各违规类型判红 ---------------- */
console.log('== 违规判红 ==')
{
  // identity set：A,B,C → A,B,D（size 相等但集合不等 —— §9 关键判红）
  const r = r5Check([rec('A'), rec('B'), rec('C')], [rec('A'), rec('B'), rec('D')])
  ok('A,B,C → A,B,D：identitySetEqual=false（size 相等也抓）', r.identitySetEqual === false)
  ok('同例：unexpectedLoss=1（C 丢）+ gained=D', r.counts.unexpectedLossCount === 1 && r.identityDiff.lost.includes('C') && r.identityDiff.gained.includes('D'))
  ok('同例：ok=false', r.ok === false)

  const dup = r5Check([rec('a')], [rec('a'), rec('a')])
  ok('duplicateCount=1', dup.counts.duplicateCount === 1 && dup.ok === false)

  const dang = r5Check([rec('a', { refs: ['ghost'] })], [rec('a', { refs: ['ghost'] })])
  ok('danglingReferenceCount=1', dang.counts.danglingReferenceCount === 1)

  const rel = r5Check([rec('a', { requiredRelations: ['deck'], relations: { deck: null } })], [rec('a', { requiredRelations: ['deck'], relations: { deck: null } })])
  ok('brokenRequiredRelationCount=1（null 关系）', rel.counts.brokenRequiredRelationCount === 1)

  const rel2 = r5Check([rec('a', { requiredRelations: ['deck'] })], [rec('a', { requiredRelations: ['deck'] })])
  ok('required relation 字段缺失也判红', rel2.counts.brokenRequiredRelationCount === 1)

  const en = r5Check([rec('a', { enums: { status: 'frozen' } })], [rec('a', { enums: { status: 'frozen' } })], { validEnums: VALID_ENUMS })
  ok('invalidEnumCount=1（status=frozen 不在合法集）', en.counts.invalidEnumCount === 1)

  const loss = r5Check([rec('a'), rec('b')], [rec('a')])
  ok('unexpectedLossCount=1', loss.counts.unexpectedLossCount === 1 && loss.identitySetEqual === false)
}

/* ---------------- allowedLoss 豁免 ---------------- */
console.log('== allowedLoss ==')
{
  const r = r5Check([rec('a'), rec('deprecated')], [rec('a')], { allowedLoss: ['deprecated'] })
  ok('显式豁免的丢失不计 unexpectedLoss', r.counts.unexpectedLossCount === 0)
  ok('豁免后 identity set 相等', r.identitySetEqual === true && r.ok === true)
  const r2 = r5Check([rec('a'), rec('b')], [rec('a')], { allowedLoss: ['other'] })
  ok('豁免名单外的丢失仍判红', r2.counts.unexpectedLossCount === 1)
}

/* ---------------- 顺序扰动不影响判定 ---------------- */
console.log('== 顺序扰动 ==')
{
  const before = [rec('x'), rec('y'), rec('z')]
  const after = [rec('z'), rec('x'), rec('y')]
  const r = r5Check(before, after)
  ok('迁移后顺序变化不判红（集合语义）', r.ok === true)
}

console.log('──────────────────────────────────────────────────────')
console.log(`共 ${pass + fail} 项，通过 ${pass}，失败 ${fail}`)
console.log('──────────────────────────────────────────────────────')
process.exit(fail > 0 ? 1 : 0)
