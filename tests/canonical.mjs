#!/usr/bin/env node
/**
 * P1.7 Wave 1-C · Canonical JSON（JCS + NFC）测试（§7 / §19-6）
 *
 * 强制测试（冻结）：
 *   - "\u00E9"（é 单码元）与 "e\u0301"（e+组合符）canonical 后 hash 相同（NFC 附加规范化）；
 *   - -0 / 大整数 / NaN / BigInt / undefined / symbol / function 各判红对照。
 * 加 JCS 基础：键按 code unit 序排序、键序置换 hash 不变、数组保序、Date→ISO。
 *
 * 用法：node tests/canonical.mjs
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
async function throws(fn, what) {
  try { await fn(); return false } catch (e) { return e.name === 'CanonicalizationError' || !!what && e instanceof Error }
}

const server = await createServer({ root: ROOT, logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
const mod = await server.ssrLoadModule('/src/core/persistence/canonical.ts')
const { canonicalize, canonicalHash, canonicalEqual, CanonicalizationError } = mod

/* ---------------- 1. NFC 附加规范化（强制测试） ---------------- */
console.log('== 1. NFC（é 组合字符等值） ==')
const h1 = await canonicalHash({ word: '\u00E9' }) // é 单码元
const h2 = await canonicalHash({ word: 'e\u0301' }) // e + U+0301 组合符
ok('é 单码元与 e+组合符 hash 相同（NFC）', h1 === h2, `${h1.slice(0, 12)} vs ${h2.slice(0, 12)}`)
ok('canonical 串本身已 NFC', canonicalize({ w: '\u00E9' }) === canonicalize({ w: 'e\u0301' }))
ok('NFC 作用于键', canonicalize({ '\u00E9': 1 }) === canonicalize({ 'e\u0301': 1 }))

/* ---------------- 2. JCS：键排序 / 键序置换 / 数组保序 ---------------- */
console.log('== 2. JCS 基础 ==')
ok('键按 code unit 序排序（b,a → a,b）', canonicalize({ b: 1, a: 2 }) === '{"a":2,"b":1}')
ok('键序置换 hash 不变', (await canonicalHash({ b: 1, a: 2, c: { y: 1, x: 2 } })) === (await canonicalHash({ c: { x: 2, y: 1 }, a: 2, b: 1 })))
ok('数组保序（不排序）', canonicalize([3, 1, 2]) === '[3,1,2]')
ok('嵌套对象键也排序', canonicalize({ o: { z: 1, a: 2 } }) === '{"o":{"a":2,"z":1}}')
ok('数值序列化 = JSON 数字格式', canonicalize({ n: 1.5 }) === '{"n":1.5}')

/* ---------------- 3. -0 → 0 与判红对照 ---------------- */
console.log('== 3. -0 与判红 ==')
ok('-0 → 0', canonicalize({ z: -0 }) === '{"z":0}')
ok('-0 与 0 hash 相同', (await canonicalHash({ z: -0 })) === (await canonicalHash({ z: 0 })))
ok('NaN → 判红', await throws(() => canonicalize({ x: NaN })))
ok('Infinity → 判红', await throws(() => canonicalize({ x: Infinity })))
ok('-Infinity → 判红', await throws(() => canonicalize({ x: -Infinity })))
ok('BigInt → 判红', await throws(() => canonicalize({ x: 1n })))
ok('undefined → 判红', await throws(() => canonicalize({ x: undefined })))
ok('symbol → 判红', await throws(() => canonicalize({ x: Symbol('s') })))
ok('function → 判红', await throws(() => canonicalize({ x: () => 1 })))
ok('unsafe integer（2**53）→ 判红', await throws(() => canonicalize({ x: 2 ** 53 })))
ok('safe integer 边界内（2**53-1）→ 通过', canonicalize({ x: 2 ** 53 - 1 }) === `{"x":${2 ** 53 - 1}}`)
ok('判红抛的是 CanonicalizationError', (() => { try { canonicalize({ x: NaN }); return false } catch (e) { return e instanceof CanonicalizationError } })())

/* ---------------- 4. Date → ISO ---------------- */
console.log('== 4. Date ==')
const d = new Date('2026-09-29T12:00:00.000Z')
ok('Date → ISO 字符串', canonicalize({ at: d }) === '{"at":"2026-09-29T12:00:00.000Z"}')
ok('Date 与其 ISO 串 hash 相同', (await canonicalHash({ at: d })) === (await canonicalHash({ at: '2026-09-29T12:00:00.000Z' })))

/* ---------------- 5. hash 确定性与等值 ---------------- */
console.log('== 5. hash 确定性 ==')
const v = { user: 'yqh', stats: { words: 9346, reviews: [1, 2, 3] }, tags: ['a', 'b'] }
ok('同值重复 hash 一致', (await canonicalHash(v)) === (await canonicalHash(v)))
ok('canonicalEqual 真', await canonicalEqual(v, JSON.parse(JSON.stringify(v))))
ok('canonicalEqual 假', !(await canonicalEqual(v, { ...v, stats: { ...v.stats, words: 9347 } })))
ok('hash 是 64 位 hex', /^[0-9a-f]{64}$/.test(await canonicalHash(v)))

console.log('──────────────────────────────────────────────────────')
console.log(`共 ${pass + fail} 项，通过 ${pass}，失败 ${fail}`)
console.log('──────────────────────────────────────────────────────')
process.exit(fail > 0 ? 1 : 0)
