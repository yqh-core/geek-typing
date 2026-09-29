#!/usr/bin/env node
/**
 * P1.7 Wave 2-A · Persistence Boundary 测试（v2.3.2 §1 A-1）
 *
 * 覆盖：StorageAdapter（Memory 语义）/ namespace 注册表（19 键 owner 归属、
 * 未注册判红、动态键族）/ codec（JSON 兼容 + canonical JCS+NFC + 判红）/
 * Repository（跨域写判红、读跨域放行、REMOVE OLD 约束、keys 域过滤）。
 *
 * 用法：node tests/persistence-boundary.mjs
 */
import { createServer } from 'vite'
import { readFileSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

let pass = 0
let fail = 0
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`) }
  else { fail++; console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`) }
}
function throws(fn, ErrClass) {
  try { fn(); return false } catch (e) { return e instanceof ErrClass }
}

const server = await createServer({ root: ROOT, logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
const adapterMod = await server.ssrLoadModule('/src/core/persistence/adapter.ts')
const nsMod = await server.ssrLoadModule('/src/core/persistence/namespace.ts')
const codecMod = await server.ssrLoadModule('/src/core/persistence/codec.ts')
const repoMod = await server.ssrLoadModule('/src/core/persistence/repository.ts')
const { MemoryStorageAdapter, LocalStorageAdapter } = adapterMod
const { resolveKey, registeredKeys, assertWritable, NamespaceError } = nsMod
const { jsonCodec, canonicalJsonCodec, CodecError } = codecMod
const { KeyFamilyRepository, createRepository } = repoMod

/* ---------------- 1. StorageAdapter ---------------- */
console.log('== 1. StorageAdapter ==')
{
  const a = new MemoryStorageAdapter()
  ok('空读 → null', a.get('x') === null)
  a.set('x', '1')
  ok('set/get round-trip', a.get('x') === '1')
  ok('has', a.has('x') === true && a.has('y') === false)
  a.set('z', '2')
  ok('keys 枚举', a.keys().sort().join(',') === 'x,z')
  a.remove('x')
  ok('remove 后 null', a.get('x') === null && a.has('x') === false)
  // LocalStorageAdapter 走全局桩
  const lsBacking = new Map()
  globalThis.localStorage = {
    getItem: (k) => (lsBacking.has(k) ? lsBacking.get(k) : null),
    setItem: (k, v) => lsBacking.set(k, String(v)),
    removeItem: (k) => lsBacking.delete(k),
    clear: () => lsBacking.clear(),
    key: (i) => [...lsBacking.keys()][i] ?? null,
    get length() { return lsBacking.size },
  }
  const la = new LocalStorageAdapter()
  la.set('gt.theme', 'ide')
  ok('LocalStorageAdapter set/get', la.get('gt.theme') === 'ide')
  ok('LocalStorageAdapter keys/has/remove', la.keys().length === 1 && la.has('gt.theme') && (la.remove('gt.theme'), la.get('gt.theme') === null))
}

/* ---------------- 2. namespace 注册表 ---------------- */
console.log('== 2. namespace 注册表 ==')
{
  const cases = [
    ['gt.learning.v2', 'learning', 'versioned'],
    ['gt.learning.v2.backup', 'learning', 'versioned'],
    ['gt.review.v1', 'learning', 'versioned'],
    ['gt.memorize.v1', 'learning', 'versioned'],
    ['gt.totals.v1', 'learning', 'versioned'],
    ['gt.letterStats.v1', 'learning', 'versioned'],
    ['gt.streak.v1', 'learning', 'versioned'],
    ['gt.analytics.v1', 'analytics', 'versioned'],
    ['gt.migration.v1', 'migration', 'versioned'],
    ['gt.diag.v1', 'diagnostics', 'versioned'],
    ['gt.customBanks.v1', 'content', 'versioned'],
    ['gt.bank', 'settings', 'simple'],
    ['gt.mode', 'settings', 'simple'],
    ['gt.theme', 'settings', 'simple'],
    ['gt.shuffle', 'settings', 'simple'],
    ['gt.sound', 'settings', 'simple'],
    ['gt.soundTheme', 'settings', 'simple'],
    ['gt.autoSpeak', 'settings', 'simple'],
    ['gt.voice', 'settings', 'simple'],
    ['gt.lang', 'settings', 'simple'],
  ]
  for (const [key, owner, kind] of cases) {
    const reg = resolveKey(key)
    ok(`${key} → ${owner}/${kind}`, reg !== null && reg.owner === owner && reg.kind === kind)
  }
  ok('动态键族 gt.learning.v3:<contentId> 可解析', resolveKey('gt.learning.v3:content:word:curated-ai-core:attention')?.owner === 'learning')
  ok('注册表总量 = 21（20 实测键 + v3 动态族）', registeredKeys().length === 21, `len=${registeredKeys().length}`)
  ok('未注册 gt 键 → null', resolveKey('gt.unknown.v9') === null)
  ok('非 gt 键 → null', resolveKey('localStorage.other') === null)
  ok('assertWritable 合法键通过', assertWritable('gt.learning.v2').owner === 'learning')
  ok('assertWritable 未注册 → NamespaceError', throws(() => assertWritable('gt.unknown.v9'), NamespaceError))
  ok('assertWritable 非 gt → NamespaceError', throws(() => assertWritable('myKey'), NamespaceError))
}

/* ---------------- 3. codec ---------------- */
console.log('== 3. codec ==')
{
  const v = { a: 1, b: ['x', { c: true }], d: null }
  ok('jsonCodec round-trip 与原生 JSON 逐字节一致', jsonCodec.encode(v) === JSON.stringify(v) && JSON.stringify(jsonCodec.decode(jsonCodec.encode(v))) === JSON.stringify(v))
  ok('canonicalCodec：键序置换 encode 相同（JCS）', canonicalJsonCodec.encode({ b: 1, a: 2 }) === canonicalJsonCodec.encode({ a: 2, b: 1 }))
  ok('canonicalCodec：é 组合字符等值（NFC）', canonicalJsonCodec.encode({ w: '\u00E9' }) === canonicalJsonCodec.encode({ w: 'e\u0301' }))
  ok('canonicalCodec decode 兼容存量 JSON 格式', JSON.stringify(canonicalJsonCodec.decode('{"a":1}')) === '{"a":1}')
  ok('jsonCodec decode 损坏数据 → CodecError', throws(() => jsonCodec.decode('{oops'), CodecError))
  ok('canonicalCodec encode NaN → CodecError（§7 判红透传）', throws(() => canonicalJsonCodec.encode({ x: NaN }), CodecError))
}

/* ---------------- 4. Repository ---------------- */
console.log('== 4. Repository ==')
{
  const a = new MemoryStorageAdapter()
  const learning = createRepository(a, 'learning')
  const settings = createRepository(a, 'settings')
  learning.set('gt.learning.v2', { contentId: 'x', memorize: { status: 'known' } })
  ok('同域写读 round-trip', learning.get('gt.learning.v2').memorize.status === 'known')
  ok('跨域读放行（迁移批次需要）', settings.get('gt.learning.v2') !== null)
  ok('跨域写判红', throws(() => settings.set('gt.learning.v2', {}), NamespaceError))
  ok('未注册键写判红', throws(() => learning.set('gt.foo.bar', 1), NamespaceError))
  ok('非 gt 键写判红', throws(() => learning.set('other', 1), NamespaceError))
  ok('跨域删判红', throws(() => settings.remove('gt.learning.v2'), NamespaceError))
  learning.setRaw('gt.review.v1', '{"legacy":true}')
  ok('setRaw 过 namespace 但不经 codec', learning.getRaw('gt.review.v1') === '{"legacy":true}')
  ok('跨域 setRaw 判红', throws(() => settings.setRaw('gt.review.v1', '{}'), NamespaceError))
  learning.set('gt.memorize.v1', { a: 1 }, { codec: canonicalJsonCodec })
  ok('按次 codec 注入（canonical 写入）', a.get('gt.memorize.v1') === canonicalJsonCodec.encode({ a: 1 }))
  learning.remove('gt.memorize.v1')
  ok('remove 同域放行', learning.has('gt.memorize.v1') === false)
  // keys 域过滤
  learning.set('gt.totals.v1', {})
  settings.set('gt.mode', 'classic')
  ok('keys() 只返回本域键', JSON.stringify(learning.keys().sort()) === JSON.stringify(['gt.learning.v2', 'gt.review.v1', 'gt.totals.v1']))
  ok('settings keys() 域过滤', JSON.stringify(settings.keys()) === JSON.stringify(['gt.mode']))
}

/* ---------------- 5. 与真实快照兼容 ---------------- */
console.log('== 5. 真实快照键全部可解析 ==')
{
  const snapshot = JSON.parse(readFileSync(join(ROOT, '_user-snapshot/real-user-localStorage.json'), 'utf8'))
  const unresolved = Object.keys(snapshot).filter((k) => resolveKey(k) === null)
  ok(`真实快照 ${Object.keys(snapshot).length} 键全部在注册表内`, unresolved.length === 0, unresolved.length ? `未注册: ${unresolved.join(',')}` : '')
}

console.log('──────────────────────────────────────────────────────')
console.log(`共 ${pass + fail} 项，通过 ${pass}，失败 ${fail}`)
console.log('──────────────────────────────────────────────────────')
process.exit(fail > 0 ? 1 : 0)
