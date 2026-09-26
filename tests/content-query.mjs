/* V4.1 · Content Query Layer 契约测试
 *
 * 背景：查询层（src/core/content/query/content-query.ts）是 V4.1-P0 的核心新增，
 * 但 UI 尚未接线，e2e 覆盖不到。本脚本用 vite 的 ssrLoadModule 在 Node 里加载
 * TS 模块（`?raw` 导入只有 vite 能解析），直接对契约做断言，防止接口漂移。
 *
 * 用法：node tests/content-query.mjs
 */
import { createServer } from 'vite'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

let pass = 0
let fail = 0
const failures = []

function ok(name, cond, detail = '') {
  if (cond) {
    pass++
    console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`)
  } else {
    fail++
    failures.push(name)
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const registry = await server.ssrLoadModule('/src/core/content/registry.ts')
const q = await server.ssrLoadModule('/src/core/content/query/content-query.ts')
const model = await server.ssrLoadModule('/src/core/content/model/content.ts')

/* ---------- 0. 基线：manifest 全量读取（不依赖被测代码，作为独立真值） ---------- */
const pkgDirs = registry.getVocabularyPackages().map((p) => p.localId)
const manifestTotal = pkgDirs.reduce((sum, id) => {
  const m = JSON.parse(readFileSync(resolve(root, `content/vocabulary/${id}/manifest.json`), 'utf8'))
  return sum + m.stats.items
}, 0)

console.log('\n【1】registry 契约')
ok('注册 10 个 vocabulary 包', pkgDirs.length === 10, pkgDirs.join(','))
ok('getPackage 支持裸 id', registry.getPackage('ielts')?.localId === 'ielts')
ok(
  'getPackage 支持 4 段式 ContentId',
  registry.getPackage('content:vocabulary:ecdict:ielts')?.localId === 'ielts',
)
ok('getPackage 未知 id 返回 undefined', registry.getPackage('content:vocabulary:ecdict:nope') === undefined)
ok('listContent("vocabulary") 返回全部 manifest', registry.listContent('vocabulary').length === 10)
ok('listContent("listening") 返回空（类型未接入）', registry.listContent('listening').length === 0)
ok('hasFeature 未知 feature 为 false 且不崩溃', registry.hasFeature('ai-core', 'nope') === false)
ok('getRelations 恒为数组（关系模型就位、无数据）', Array.isArray(registry.getRelations('content:vocabulary:ecdict-ielts:ielts')))
ok('getPackage 支持「来源族-包」namespace 反查', registry.getPackage('content:vocabulary:ecdict-cet4:cet4')?.localId === 'cet4')

console.log('\n【2】ContentId 规范（V4.1 4 段式 + namespace 每包唯一）')
const ieltsManifest = registry.getPackage('ielts').manifest
ok('ielts 包 id 为 content:vocabulary:ecdict-ielts:ielts', ieltsManifest.id === 'content:vocabulary:ecdict-ielts:ielts', ieltsManifest.id)
ok(
  'parseContentId 可逆解析',
  JSON.stringify(model.parseContentId('content:word:ecdict-ielts:abandon')) ===
    JSON.stringify({ type: 'word', namespace: 'ecdict-ielts', localId: 'abandon' }),
)
ok('wordId 生成 4 段式', model.wordId('ecdict-ielts', 'Abandon') === 'content:word:ecdict-ielts:abandon')
ok('非法 ContentId 解析为 null', model.parseContentId('ielts') === null)
// 关键契约：namespace 每包唯一 —— 这是词级 ContentId 全局唯一的充要条件
const namespaces = pkgDirs.map((id) => model.parseContentId(registry.getPackage(id).manifest.id)?.namespace)
ok(
  '10 个包 namespace 两两不同（词级 id 唯一性前提）',
  new Set(namespaces).size === namespaces.length,
  namespaces.join(','),
)

console.log('\n【3】加载缓存共享（兼容层与查询层同一份数据）')
const a = await registry.loadPackage('ielts')
const b = await registry.loadPackage('ielts')
ok('重复 loadPackage 返回同一引用（单份内存）', a === b)
ok('ielts 实际词条数 = manifest.stats.items', a.length === ieltsManifest.stats.items, `${a.length}`)

console.log('\n【4】countWords')
const total = await q.countWords()
ok('countWords() 全库合计 = manifest 真值', total === manifestTotal, `${total} vs ${manifestTotal}`)
ok('countWords("ielts") = 3000', (await q.countWords('ielts')) === ieltsManifest.stats.items)

console.log('\n【5】searchWords')
const hits = await q.searchWords({ query: 'abandon', limit: 50 })
ok('跨包检索 abandon 有多条来源', hits.length >= 2, hits.map((h) => h.packageLocalId).join(','))
const exactHits = hits.filter((h) => h.word.toLowerCase() === 'abandon')
ok(
  '精确命中 ContentId 落在自身包 namespace 下',
  exactHits.length > 0 && exactHits.every((h) => h.id === `content:word:${h.packageId.split(':')[2]}:abandon`),
  exactHits.map((h) => h.id).join(' | '),
)
// 核心回归：跨包同词合法，但每个包的 ContentId 必须不同（否则学习记录主键撞车）
ok(
  '跨包同词各自不同 ContentId（全局唯一）',
  new Set(hits.map((h) => h.id)).size === hits.length,
  `${hits.length} 条命中 ${new Set(hits.map((h) => h.id)).size} 个 id`,
)
ok('每条命中带包上下文', hits.every((h) => h.packageId && h.packageLocalId && h.packageTitle))
const ieltsOnly = await q.searchWords({ query: 'abandon', packageId: 'ielts' })
ok('限定包检索只返回该包', ieltsOnly.length === 1 && ieltsOnly[0].packageLocalId === 'ielts')
const byContentId = await q.searchWords({ query: 'abandon', packageId: 'content:vocabulary:ecdict-ielts:ielts' })
ok('packageId 支持 4 段式', byContentId.length === 1)
ok('精确优先：首位为词形全等命中', hits[0].word.toLowerCase() === 'abandon')
const exactOff = await q.searchWords({ query: 'aban', exact: true })
const exactOn = await q.searchWords({ query: 'aban', exact: false, limit: 5 })
ok('exact=true 不返回前缀命中', exactOff.length === 0, `${exactOff.length}`)
ok('exact=false 返回前缀命中', exactOn.length > 0 && exactOn[0].word.toLowerCase().startsWith('aban'), exactOn[0]?.word)
ok('空查询返回空数组', (await q.searchWords({ query: '   ' })).length === 0)
ok('limit 生效', (await q.searchWords({ query: 'a', limit: 7 })).length <= 7)
const zh = await q.searchWords({ query: '放弃', limit: 5 })
ok('中文按释义/翻译命中', zh.length > 0, zh[0] ? `${zh[0].word}=${zh[0].translation}` : 'none')

console.log('\n【6】getWord（Word Detail 前置接口）')
// 取样不写死词形：ielts 词表里不一定含 abandon，取第 1 页首词作为真值
const sample = (await q.listWords({ packageId: 'ielts', page: 1, pageSize: 1 }))[0]
const w = await q.getWord(sample.id)
ok('按 ContentId 取到词条', !!w && w.word === sample.word, `${sample.id} → ${w?.word ?? 'null'}`)
ok('词条带翻译', !!w?.translation, w?.translation)
ok('词条唯一归属 ielts 包', w?.packageId === 'content:vocabulary:ecdict-ielts:ielts', w?.packageId)
// 跨包同词：取一个同时存在于 ielts 与 cet4 的词形，两个 namespace 各自可寻址且互不污染
const cet4Words = new Set((await registry.loadPackage('cet4')).map((x) => x.word.toLowerCase()))
const shared = (await registry.loadPackage('ielts')).map((x) => x.word.toLowerCase()).find((x) => cet4Words.has(x))
if (shared) {
  const inIelts = await q.getWord(`content:word:ecdict-ielts:${shared}`)
  const inCet4 = await q.getWord(`content:word:ecdict-cet4:${shared}`)
  ok(
    `跨包同词 "${shared}" 各自可寻址且归属不同包`,
    inIelts?.packageId === 'content:vocabulary:ecdict-ielts:ielts' && inCet4?.packageId === 'content:vocabulary:ecdict-cet4:cet4',
    `${inIelts?.packageLocalId} / ${inCet4?.packageLocalId}`,
  )
} else {
  ok('跨包同词各自可寻址（未找到重叠词形，跳过）', true, 'ielts ∩ cet4 为空')
}
ok('不存在的词返回 null', (await q.getWord('content:word:ecdict-ielts:zzzznotaword')) === null)
ok('错误 type 返回 null', (await q.getWord('content:vocabulary:ecdict-ielts:ielts')) === null)
ok('非 ContentId 返回 null', (await q.getWord('abandon')) === null)

console.log('\n【7】listWords（分页 + 过滤）')
const page1 = await q.listWords({ packageId: 'ielts', page: 1, pageSize: 10 })
const page2 = await q.listWords({ packageId: 'ielts', page: 2, pageSize: 10 })
ok('第 1 页 10 条', page1.length === 10)
ok('第 2 页与第 1 页无交集', !page1.some((h) => page2.some((x) => x.word === h.word)))
ok('id 落在包 namespace 内', page1.every((h) => h.id.startsWith('content:word:ecdict-ielts:')))
ok('未知包返回空数组', (await q.listWords({ packageId: 'nope' })).length === 0)
const ph = await q.listWords({ packageId: 'cet4', page: 1, pageSize: 200, hasPhonetic: true })
ok('hasPhonetic 过滤生效', ph.length > 0 && ph.every((h) => !!h.phonetic), `${ph.length} 条带音标`)

await server.close()

console.log(`\n──────────────────────────────────────────────────────`)
console.log(`共 ${pass + fail} 项，通过 ${pass}，失败 ${fail}`)
console.log(`──────────────────────────────────────────────────────`)
if (fail > 0) {
  console.log('失败项：' + failures.join(' | '))
  process.exit(1)
}
