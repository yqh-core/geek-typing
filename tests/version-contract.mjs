#!/usr/bin/env node
/**
 * P1.7 Wave 1-C · Version System 测试（§6）
 *
 * 裸 string 类型层拒绝由 tsc（矩阵 TSC 任务）强制；本套件测运行时契约：
 * 解析 / 同 kind 数值比较 / 注册表单调性断言（contract gate）。
 *
 * 用法：node tests/version-contract.mjs
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
const mod = await server.ssrLoadModule('/src/core/persistence/version.ts')
const {
  parseVersion, compareVersions, assertMonotonic,
  migrationVersion, schemaVersion, formatVersion, contentVersion, licensePolicyVersion,
} = mod

/* ---------------- 解析 ---------------- */
console.log('== 解析 ==')
ok('migration-1 → kind=migration num=1', (() => { const p = parseVersion(migrationVersion(1)); return p.kind === 'migration' && p.num === 1 })())
ok('schema-3 → kind=schema', parseVersion(schemaVersion(3)).kind === 'schema')
ok('format-2 → kind=format', parseVersion(formatVersion(2)).kind === 'format')
ok('license-policy-1 → kind=license-policy（在 content 前匹配，不被吞）', parseVersion(licensePolicyVersion(1)).kind === 'license-policy')
ok('content-cet4-v2 → kind=content id=cet4-v2', (() => { const p = parseVersion(contentVersion('cet4-v2')); return p.kind === 'content' && p.id === 'cet4-v2' && p.num === null })())
ok('裸垃圾串 → null', parseVersion('garbage') === null)
ok('migration-x（非数字尾）→ null', parseVersion('migration-x') === null)
ok('migration-（空尾）→ null', parseVersion('migration-') === null)
ok('content- 前缀任意 id 均解析', parseVersion('content-anything-goes').kind === 'content')

/* ---------------- 比较 ---------------- */
console.log('== 比较 ==')
ok('migration-1 < migration-2', compareVersions(migrationVersion(1), migrationVersion(2)) === -1)
ok('migration-2 > migration-1', compareVersions(migrationVersion(2), migrationVersion(1)) === 1)
ok('migration-2 === migration-2', compareVersions(migrationVersion(2), migrationVersion(2)) === 0)
ok('跨 kind 比较 → null（不可比）', compareVersions(migrationVersion(1), schemaVersion(1)) === null)
ok('content（非数值）比较 → null', compareVersions(contentVersion('a'), contentVersion('b')) === null)
ok('schema-10 > schema-9（数值序而非字典序）', compareVersions(schemaVersion(10), schemaVersion(9)) === 1)

/* ---------------- 单调性 contract gate ---------------- */
console.log('== 单调性 ==')
ok('递增注册表 → null（无违例）', assertMonotonic([migrationVersion(1), migrationVersion(2), schemaVersion(1), schemaVersion(2), licensePolicyVersion(1)]) === null)
ok('乱序混入同 kind 递减 → 报违例', (() => { const r = assertMonotonic([migrationVersion(2), migrationVersion(1)]); return typeof r === 'string' && r.includes('non-monotonic') })())
ok('相等序号也算违例（严格递增）', (() => { const r = assertMonotonic([formatVersion(1), formatVersion(1)]); return typeof r === 'string' })())
ok('无法解析的版本 → 报违例', (() => { const r = assertMonotonic(['bogus']); return typeof r === 'string' && r.includes('unparseable') })())
ok('content 版本（非数值）不参与单调断言', assertMonotonic([contentVersion('a'), contentVersion('b')]) === null)
// 模拟真实注册表：learning 域版本
const registry = [migrationVersion(1), migrationVersion(2), migrationVersion(3), schemaVersion(1), schemaVersion(2), formatVersion(1), licensePolicyVersion(1)]
ok('项目注册表示例 → 无违例', assertMonotonic(registry) === null)

console.log('──────────────────────────────────────────────────────')
console.log(`共 ${pass + fail} 项，通过 ${pass}，失败 ${fail}`)
console.log('──────────────────────────────────────────────────────')
process.exit(fail > 0 ? 1 : 0)
