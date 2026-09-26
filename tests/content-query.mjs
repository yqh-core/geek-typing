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

/* ---------- 新增模块：统一 Query API / Catalog / Index ---------- */
const cq = q.contentQuery
const cat = await server.ssrLoadModule('/src/core/content/catalog/catalog.ts')
const idx = await server.ssrLoadModule('/src/core/content/index/content-index.ts')
const idOf = (rows) => rows.map((h) => h.id).join('|')

console.log('\n【8】contentQuery 统一 API')
ok(
  'contentQuery 暴露 search/list/get/count',
  typeof cq?.search === 'function' && typeof cq?.list === 'function' && typeof cq?.get === 'function' && typeof cq?.count === 'function',
)
const legacy = await q.searchWords({ query: 'abandon', limit: 50 })
const uni = await cq.search({ type: 'word', query: 'abandon', pageSize: 50 })
ok('search({type:"word"}) 与 searchWords 结果一致', idOf(uni) === idOf(legacy), `${uni.length} 条`)
const uniAll = await cq.search({ type: 'all', query: 'abandon', pageSize: 50 })
ok("type:'all' 与 type:'word' 结果一致（当前仅 word 已接入）", idOf(uniAll) === idOf(uni), `${uniAll.length} 条`)
ok("type:'listening'（未接入）返回空数组", (await cq.search({ type: 'listening', query: 'abandon' })).length === 0)
ok("search 默认 type 为 word", idOf(await cq.search({ query: 'abandon', pageSize: 50 })) === idOf(uni))
ok('search 精确排序保持：首位为词形全等', uni[0]?.word.toLowerCase() === 'abandon', uni[0]?.word)
const uniPkg = await cq.search({ type: 'word', query: 'abandon', packageId: 'content:vocabulary:ecdict-ielts:ielts' })
ok('search 支持 4 段式 packageId', uniPkg.length === 1 && uniPkg[0].packageLocalId === 'ielts')
const got = await cq.get(sample.id)
ok('contentQuery.get(contentId) 命中', !!got && got.id === sample.id && got.word === sample.word, `${got?.id}`)
ok('contentQuery.get 未接入类型返回 null', (await cq.get('content:listening:ielts:test-01')) === null)
ok('contentQuery.get 非法 id 返回 null', (await cq.get('abandon')) === null)
ok('count({type:"word"}) = 全库合计', (await cq.count({ type: 'word' })) === manifestTotal, `${await cq.count({ type: 'word' })} vs ${manifestTotal}`)
ok('count({type:"listening"}) = 0', (await cq.count({ type: 'listening' })) === 0)
ok('count({packageId:"ielts"}) = 3000', (await cq.count({ type: 'word', packageId: 'ielts' })) === ieltsManifest.stats.items)
ok('count({tags:["ielts"]}) = 3000', (await cq.count({ type: 'word', tags: ['ielts'] })) === ieltsManifest.stats.items)
const lp1 = await cq.list({ type: 'word', packageId: 'ielts', page: 1, pageSize: 5 })
const lp2 = await cq.list({ type: 'word', packageId: 'ielts', page: 2, pageSize: 5 })
ok('list 分页生效（page1/page2 各 5 条且无交集）', lp1.length === 5 && lp2.length === 5 && !lp1.some((h) => lp2.some((x) => x.id === h.id)))
const tagged = await cq.list({ type: 'word', tags: ['ielts'], pageSize: 5 })
ok('list tags 过滤生效', tagged.length > 0 && tagged.every((h) => h.packageLocalId === 'ielts'), `${tagged.length} 条`)
ok('list 未知 tag 返回空', (await cq.list({ type: 'word', tags: ['nope-not-a-tag'] })).length === 0)
ok('list 未知包返回空', (await cq.list({ type: 'word', packageId: 'nope' })).length === 0)
ok('list 未接入类型返回空', (await cq.list({ type: 'listening', packageId: 'ielts' })).length === 0)
const phUni = await cq.list({ type: 'word', tags: ['ai'], pageSize: 200, hasPhonetic: true })
const phNone = await cq.list({ type: 'word', tags: ['ai'], pageSize: 200, hasPhonetic: false })
ok('list hasPhonetic 过滤生效', phUni.every((h) => !!h.phonetic) && phNone.length >= phUni.length, `${phUni.length}/${phNone.length}`)

console.log('\n【9】Catalog + Content Index')
const catalog = cat.getCatalog()
const voc = catalog.types.find((t) => t.type === 'vocabulary')
ok('catalog.types vocabulary = 10 包', voc?.packages === 10, `${voc?.packages}`)
ok('catalog.types vocabulary items = manifest 真值', voc?.items === manifestTotal, `${voc?.items} vs ${manifestTotal}`)
ok('catalog 未接入类型（listening）packages/items 均为 0', catalog.types.find((t) => t.type === 'listening')?.packages === 0 && catalog.types.find((t) => t.type === 'listening')?.items === 0)
ok('catalog 未接入类型（audio/reading/topic/exercise）全为 0', ['audio', 'reading', 'topic', 'exercise'].every((t) => { const e = catalog.types.find((x) => x.type === t); return e && e.packages === 0 && e.items === 0 }))
ok('catalog.totalItems = manifest 真值', catalog.totalItems === manifestTotal, `${catalog.totalItems}`)
ok('catalog.packages 覆盖 10 个包', catalog.packages.length === 10)
ok('catalog.schemaVersion 为数字', typeof catalog.schemaVersion === 'number', `${catalog.schemaVersion}`)
const pc = cat.getPackageCatalog('ielts')
ok(
  'getPackageCatalog("ielts") 字段正确',
  !!pc && pc.localId === 'ielts' && pc.contentId === 'content:vocabulary:ecdict-ielts:ielts' && pc.type === 'vocabulary' && pc.items === 3000 && pc.offline === 'lazy' && pc.tags.includes('ielts') && pc.features.includes('phonetic'),
  JSON.stringify(pc),
)
ok('getPackageCatalog 未知 id 返回 null', cat.getPackageCatalog('nope') === null)
ok('getCatalog 不加载词条（只读 manifest）', typeof cat.getCatalog().packages[0].items === 'number')

const index = await idx.ensureIndex()
const stats0 = idx.getIndexStats()
ok('ensureIndex() 后 entries = 全库合计', stats0.entries === manifestTotal, `${stats0.entries} vs ${manifestTotal}`)
ok('ensureIndex() 后 packages = 10', stats0.packages === 10, `${stats0.packages}`)
ok('ensureIndex 幂等（二次调用 entries 不变）', (await idx.ensureIndex(), idx.getIndexStats().entries) === manifestTotal)
const wordKey = idx.normalizeWord(sample.word)
ok('byWord 收录词条的归一化 key', (index.byWord.get(wordKey) ?? []).includes(sample.id), wordKey)
ok(
  'byWord 归一：大写 / 首尾空格落到同一 key',
  idx.normalizeWord(`  ${sample.word.toUpperCase()}  `) === wordKey && idx.normalizeWord('ABANDON') === idx.normalizeWord('abandon'),
)
ok('byPackage 按包聚合', (index.byPackage.get('ielts') ?? []).length === ieltsManifest.stats.items)
ok('byTag 收录包级 tag', (index.byTag.get('ielts') ?? []).length === ieltsManifest.stats.items)
idx.invalidateIndex('ielts')
const stats1 = idx.getIndexStats()
ok('invalidateIndex("ielts") 后 entries 降 3000', stats1.entries === manifestTotal - ieltsManifest.stats.items, `${stats1.entries} vs ${manifestTotal - ieltsManifest.stats.items}`)
ok('invalidateIndex("ielts") 后 packages = 9', stats1.packages === 9, `${stats1.packages}`)
ok('失效后 byPackage 不再含 ielts', index.byPackage.get('ielts') === undefined)
ok('失效后 byWord 不再含 ielts 词条', !(index.byWord.get(wordKey) ?? []).some((id2) => id2.startsWith('content:word:ecdict-ielts:')))
ok('失效后 byTag 不再含 ielts 词条', !(index.byTag.get('ielts') ?? []).length)
const rebuilt = await idx.ensureIndex()
ok('重新 ensureIndex 恢复全量', idx.getIndexStats().entries === manifestTotal, `${idx.getIndexStats().entries}`)
ok('重建后 byWord 恢复 ielts 词条', (rebuilt.byWord.get(wordKey) ?? []).includes(sample.id))
idx.invalidateIndex()
ok('invalidateIndex() 全清', idx.getIndexStats().entries === 0 && idx.getIndexStats().packages === 0)
await idx.ensureIndex(['ielts'])
ok('ensureIndex(["ielts"]) 只建目标包', idx.getIndexStats().packages === 1 && idx.getIndexStats().entries === ieltsManifest.stats.items)
ok('查询在部分索引下仍可用', (await cq.count({ type: 'word' })) === manifestTotal)

console.log('\n【10】id 自洽性（生成侧 vs 寻址侧大小写口径）')
console.log('   —— V4.1-P0.5 独立复核实测捕获：id 生成保留原词形大小写，若 get 用 lowercase 反查，')
console.log('      9346 条里 93 条会「search 查得到、get 取不回」（go-code 41/50、ts-code 34/50）')
const allHits = await q.contentQuery.list({ type: 'word', pageSize: 100000 })
const missAll = []
for (const h of allHits) {
  const back = await q.contentQuery.get(h.id)
  if (!back || back.id !== h.id) missAll.push(h.id)
}
ok(
  `全库 ${allHits.length} 条 id 均可按自身 id 取回（get ⇄ list 自洽）`,
  missAll.length === 0,
  missAll.length === 0 ? '零漏取' : `漏 ${missAll.length} 条，样例：${missAll.slice(0, 3).join(' | ')}`,
)
for (const pid of ['ts-code', 'go-code', 'ielts']) {
  const rows = await q.contentQuery.list({ type: 'word', packageId: pid, pageSize: 100000 })
  let miss = 0
  for (const h of rows) if (!(await q.contentQuery.get(h.id))) miss++
  ok(`${pid}（大小写敏感）${rows.length} 条全部可按自身 id 取回`, miss === 0, `漏 ${miss}`)
}
const oxford = await q.searchWords({ query: 'Oxford', packageId: 'ielts', exact: true })
if (oxford.length > 0) {
  ok('大写词条按自身 id 命中（Oxford）', (await q.contentQuery.get(oxford[0].id))?.word === 'Oxford', oxford[0].id)
  ok('lowercase id 走兜底仍可命中（兼容历史/手写 id）', !!(await q.contentQuery.get('content:word:ecdict-ielts:oxford')))
}

await server.close()

console.log(`\n──────────────────────────────────────────────────────`)
console.log(`共 ${pass + fail} 项，通过 ${pass}，失败 ${fail}`)
console.log(`──────────────────────────────────────────────────────`)
if (fail > 0) {
  console.log('失败项：' + failures.join(' | '))
  process.exit(1)
}
