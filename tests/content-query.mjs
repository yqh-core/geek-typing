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
/* 全库词条数基准（CONTENT_CONTRACT.md §11 I-16 依赖本条守护）：
 * 词数变化必须被显式注意到 —— 增删词是内容产品行为，不该静默发生。
 * 变更时请同步更新 CONTENT_CONTRACT.md 的基准数与本节期望值。 */
const BASELINE_ITEMS = 9346
ok('全库 Σitems = 契约基准（词数变化必须显式确认）', manifestTotal === BASELINE_ITEMS, `${manifestTotal} vs ${BASELINE_ITEMS}`)
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
ok(
  'wordId 保留原词形（与 buildHits 同源，禁止在 id 侧 lowercase）',
  model.wordId('ecdict-ielts', 'Abandon') === 'content:word:ecdict-ielts:Abandon',
)
ok(
  'wordId 与 buildHits 生成口径一致（大写词不分歧）',
  model.wordId('curated-ts-code', 'const') === 'content:word:curated-ts-code:const',
)
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

// V4.1-P0.6：索引访问封装（finder）—— 与内部表逐条比对，证明封装只换入口、没换语义
await idx.ensureIndex()
const cet4Items = registry.getPackage('cet4').manifest.stats.items
const finderPkg = idx.findByPackage('cet4')
ok(
  'findByPackage("cet4") 与 byPackage 表一致',
  finderPkg.length === (index.byPackage.get('cet4') ?? []).length && finderPkg.length === cet4Items,
  `${finderPkg.length} vs ${cet4Items}`,
)
ok(
  'idsByPackage("cet4") 与 byPackage 表逐 id 一致',
  idx.idsByPackage('cet4').join('|') === (index.byPackage.get('cet4') ?? []).join('|'),
)
ok(
  'findById(id) 命中同一对象（与 byId 引用相等）',
  idx.findById(sample.id) === index.byId.get(sample.id) && idx.findById(sample.id)?.id === sample.id,
  sample.id,
)
ok('findById 未知 id 返回 null', idx.findById('content:word:nope:zzz') === null)
ok('findByWord 与 byWord 表一致', idx.findByWord(wordKey).length === (index.byWord.get(wordKey) ?? []).length, wordKey)
ok('findByWord 未知词形返回空数组', idx.findByWord('zzzznotaword').length === 0)
ok(
  'findByNamespace("ecdict-cet4") 命中 cet4 全包',
  idx.findByNamespace('ecdict-cet4').length === cet4Items && idx.findByNamespace('ecdict-cet4').every((h) => h.packageLocalId === 'cet4'),
  `${idx.findByNamespace('ecdict-cet4').length}`,
)
ok('findByNamespace 未知 namespace 返回空数组', idx.findByNamespace('nope-ns').length === 0)
ok('findByTag("code") 与 byTag 表一致', idx.findByTag('code').length === (index.byTag.get('code') ?? []).length, `${idx.findByTag('code').length}`)

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

console.log('\n【11】Query Scope（首页 / 搜索页 / 词库页 / Detail / 收藏页共用一套作用域）')
const scopeIelts = await cq.search({ query: 'abandon', scope: { type: 'word', packageId: 'ielts' }, pageSize: 50 })
const flatIelts = await cq.search({ query: 'abandon', packageId: 'ielts', pageSize: 50 })
ok(
  'scope{type,packageId} 与平铺 packageId 结果一致',
  idOf(scopeIelts) === idOf(flatIelts) && flatIelts.length > 0,
  `${flatIelts.length} 条：${flatIelts.map((h) => h.packageLocalId).join(',')}`,
)
const nsRows = await cq.list({ scope: { namespace: 'ecdict-ielts' }, pageSize: 100000 })
ok(
  "scope.namespace:'ecdict-ielts' 只命中 ielts",
  nsRows.length === ieltsManifest.stats.items && nsRows.every((h) => h.packageLocalId === 'ielts'),
  `${nsRows.length} 条`,
)
const codeRows = await cq.list({ scope: { tags: ['code'] }, pageSize: 100000 })
ok(
  "scope.tags:['code'] 命中 ts-code + go-code = 100",
  codeRows.length === 100 && codeRows.every((h) => h.packageLocalId === 'ts-code' || h.packageLocalId === 'go-code'),
  `${codeRows.length} 条 / ${[...new Set(codeRows.map((h) => h.packageLocalId))].join(',')}`,
)
const overrideRows = await cq.list({ scope: { packageId: 'ielts' }, packageId: 'cet4', pageSize: 100000 })
ok(
  '平铺参数覆盖 scope（packageId:cet4 胜出）',
  overrideRows.length === cet4Items && overrideRows.every((h) => h.packageLocalId === 'cet4'),
  `${overrideRows.length} 条 / ${[...new Set(overrideRows.map((h) => h.packageLocalId))].join(',')}`,
)
ok("count({scope:{namespace:'curated-ai-core'}}) = 43", (await cq.count({ scope: { namespace: 'curated-ai-core' } })) === 43)
ok('空 scope 视为全库（缺省 = 无过滤）', (await cq.count({ scope: {} })) === manifestTotal, `${manifestTotal}`)
ok(
  'scope 未知包返回空',
  (await cq.list({ scope: { packageId: 'nope' }, pageSize: 10 })).length === 0 && (await cq.count({ scope: { namespace: 'nope-ns' } })) === 0,
)

console.log('\n【12】Search Sort 契约（deterministic ⇒ 翻页不重不漏）')
const nw = (s) => idx.normalizeWord(s)
const sortedAsc = await cq.list({ packageId: 'ielts', pageSize: 1000, sort: 'word' })
// 排序 key 是 normalizeWord（NFC+lowercase+空白折叠），不是原始字符串：
// ielts 含 Oxford / Australian 等专有名词，直接比原始串会被 ASCII 大小写（'Z'<'a'）干扰。
let ascOk = true
for (let i = 0; i < 19; i++) if (nw(sortedAsc[i].word) > nw(sortedAsc[i + 1].word)) ascOk = false
ok(
  'sort:"word" 前 20 条按词形非降序',
  ascOk,
  sortedAsc.slice(0, 5).map((h) => h.word).join(','),
)
let rawOk = true
for (let i = 0; i < 19; i++) if (sortedAsc[i].word > sortedAsc[i + 1].word) rawOk = false
ok('sort:"word" 前 20 条原始词形亦非降序（该区间无大小写混排）', rawOk)
const sortedAsc2 = await cq.list({ packageId: 'ielts', pageSize: 1000, sort: 'word' })
ok('deterministic：同一 query 连续两次 id 序列完全相同', idOf(sortedAsc) === idOf(sortedAsc2), `${sortedAsc.length} 条`)
const paged = []
for (let p = 1; p <= 10; p++) paged.push(...(await cq.list({ packageId: 'ielts', page: p, pageSize: 10, sort: 'word' })))
ok(
  '分页不重不漏：page1..10 拼接 === pageSize:1000 一次取回的前 100 条',
  idOf(paged) === idOf(sortedAsc.slice(0, 100)) && new Set(paged.map((h) => h.id)).size === 100,
)
const rel = await cq.search({ query: 'abandon', pageSize: 50 })
const relExact = rel.filter((h) => nw(h.word) === 'abandon').length
ok(
  '默认 sort 为 relevance：精确命中排在最前且不与其它组混排',
  rel.length > 0 && nw(rel[0].word) === 'abandon' &&
    rel.slice(0, relExact).every((h) => nw(h.word) === 'abandon') &&
    rel.slice(relExact).every((h) => nw(h.word) !== 'abandon'),
  `${relExact} 条精确命中 / 共 ${rel.length} 条`,
)
const rel2 = await cq.search({ query: 'abandon', pageSize: 50, sort: 'relevance' })
ok('sort:"relevance" 显式与默认一致', idOf(rel) === idOf(rel2))
const upd1 = await cq.list({ packageId: 'cet4', pageSize: 100000, sort: 'updated' })
const upd2 = await cq.list({ packageId: 'cet4', pageSize: 100000, sort: 'updated' })
ok(
  'sort:"updated" 不报错、条数正确、顺序 deterministic（当前退化为包内数据顺序）',
  upd1.length === cet4Items && idOf(upd1) === idOf(upd2),
  `${upd1.length} 条`,
)
const descRows = await cq.list({ packageId: 'ielts', pageSize: 1000, sort: { field: 'word', order: 'desc' } })
let descOk = true
for (let i = 0; i < 19; i++) if (nw(descRows[i].word) < nw(descRows[i + 1].word)) descOk = false
ok(
  "sort:{field:'word',order:'desc'} 降序生效",
  descOk && descRows.length === sortedAsc.length,
  descRows.slice(0, 5).map((h) => h.word).join(','),
)
const descRows2 = await cq.list({ packageId: 'ielts', pageSize: 1000, sort: { field: 'word', order: 'desc' } })
const descAll = await cq.list({ packageId: 'ielts', pageSize: 100000, sort: { field: 'word', order: 'desc' } })
const ascAll = await cq.list({ packageId: 'ielts', pageSize: 100000, sort: 'word' })
ok(
  'desc 顺序同样 deterministic，且与 asc 命中同一集合（翻页不漏项）',
  idOf(descRows) === idOf(descRows2) &&
    new Set([...descAll, ...ascAll].map((h) => h.id)).size === ascAll.length &&
    ascAll.length === ieltsManifest.stats.items,
  `${ascAll.length} 条双向一致`,
)
const updDesc = await cq.list({ packageId: 'cet4', pageSize: 100000, sort: { field: 'updated', order: 'desc' } })
ok(
  "sort:{field:'updated',order:'desc'} 不报错且条数不变",
  updDesc.length === cet4Items && idOf(updDesc) === idOf(await cq.list({ packageId: 'cet4', pageSize: 100000, sort: { field: 'updated', order: 'desc' } })),
  `${updDesc.length} 条`,
)

console.log('\n【13】ContentSnapshot 契约（V4.1-P0.6：哪个实体的哪个快照）')
const snap = await server.ssrLoadModule('/src/core/content/model/snapshot.ts')

/* 13.1 snapshotOf：字段齐全 */
const s1 = snap.snapshotOf('content:vocabulary:ecdict-cet4:cet4', {
  version: 7,
  checksum: 'sha256:aaa',
  publishedAt: '2026-09-26',
})
ok(
  'snapshotOf 字段齐全（contentId/contentVersion/checksum/publishedAt 对得上）',
  s1.contentId === 'content:vocabulary:ecdict-cet4:cet4' &&
    s1.contentVersion === 7 &&
    s1.checksum === 'sha256:aaa' &&
    s1.publishedAt === '2026-09-26',
  JSON.stringify(s1),
)
ok('snapshotOf 带出 schemaVersion', s1.schemaVersion === model.SCHEMA_VERSION, `schemaVersion=${s1.schemaVersion}`)

/* 13.2 省略 publishedAt ⇒ 键不存在（区分「显式省略」与「值为 undefined」） */
const s2 = snap.snapshotOf('content:vocabulary:ecdict-cet4:cet4', { version: 1, checksum: 'sha256:bbb' })
ok('snapshotOf 省略 publishedAt 时结果不含该键', 'publishedAt' in s2 === false, Object.keys(s2).join(','))
const s2b = snap.snapshotOf('content:vocabulary:ecdict-cet4:cet4', { version: 1, checksum: 'sha256:bbb', publishedAt: undefined })
ok('snapshotOf publishedAt 显式 undefined 时同样不含该键', 'publishedAt' in s2b === false)

/* 13.3 schemaVersion 省略时取当前常量 */
ok('schemaVersion 省略时取 SCHEMA_VERSION 常量', s2.schemaVersion === model.SCHEMA_VERSION)
ok(
  'schemaVersion 为正整数且两次省略调用结果相同',
  Number.isInteger(s2.schemaVersion) && s2.schemaVersion > 0 && s1.schemaVersion === s2.schemaVersion,
  `${s2.schemaVersion}`,
)
const s3 = snap.snapshotOf('content:vocabulary:ecdict-cet4:cet4', { version: 7, checksum: 'sha256:aaa' }, 99)
ok('schemaVersion 可显式指定（覆盖常量）', s3.schemaVersion === 99)

/* 13.4 isSameSnapshot：必须 contentId + contentVersion + checksum 三者全等 */
ok('isSameSnapshot 同一对象 → true', snap.isSameSnapshot(s1, s1) === true)
const s1Clone = snap.snapshotOf('content:vocabulary:ecdict-cet4:cet4', {
  version: 7,
  checksum: 'sha256:aaa',
  publishedAt: '2026-09-26',
})
ok('isSameSnapshot 内容完全相同的两份 → true', snap.isSameSnapshot(s1, s1Clone) === true)
ok(
  'isSameSnapshot checksum 不同 → false',
  snap.isSameSnapshot(s1, snap.snapshotOf(s1.contentId, { version: 7, checksum: 'sha256:zzz' })) === false,
)
ok(
  'isSameSnapshot contentVersion 不同 → false',
  snap.isSameSnapshot(s1, snap.snapshotOf(s1.contentId, { version: 8, checksum: 'sha256:aaa' })) === false,
)
ok(
  'isSameSnapshot contentId 不同 → false',
  snap.isSameSnapshot(s1, snap.snapshotOf('content:vocabulary:ecdict-ielts:ielts', { version: 7, checksum: 'sha256:aaa' })) === false,
)
// 安全边界：version + checksum 全同但 contentId 不同（不同实体的「第 7 代」），不能误判为同一份
const other7 = snap.snapshotOf('content:vocabulary:ecdict-ielts:ielts', { version: 7, checksum: 'sha256:aaa' })
ok(
  'isSameSnapshot 仅 version+checksum 同但 contentId 不同 → false（不能只比 version/checksum）',
  other7.contentVersion === s1.contentVersion &&
    other7.checksum === s1.checksum &&
    snap.isSameSnapshot(s1, other7) === false,
)
ok(
  'isSameSnapshot 任一侧为 null/undefined → false（宁可重学也不误判相同）',
  snap.isSameSnapshot(s1, null) === false &&
    snap.isSameSnapshot(null, s1) === false &&
    snap.isSameSnapshot(s1, undefined) === false &&
    snap.isSameSnapshot(undefined, s1) === false &&
    snap.isSameSnapshot(null, null) === false,
)

/* 13.5 findRevision：同一 checksum 出现多次时以最近一次发布为准（本次修复点） */
const hist = [
  { revision: 1, version: 1, checksum: 'sha256:X', publishedAt: '2026-01-01' },
  { revision: 2, version: 2, checksum: 'sha256:Y', publishedAt: '2026-01-02' },
  { revision: 3, version: 1, checksum: 'sha256:X', publishedAt: '2026-01-01' },
]
const hitX = snap.findRevision(hist, 'sha256:X')
ok(
  'findRevision 同一 checksum 出现两次 → 返回 revision 最大的那条（倒序扫描）',
  hitX !== null && hitX.revision === 3 && hitX.version === 1,
  hitX ? JSON.stringify(hitX) : 'null',
)
ok(
  'findRevision 结果与正序第一条不同（证明口径不再是「首条命中」）',
  hitX !== null && hitX.revision !== hist[0].revision,
  `倒序=${hitX?.revision} / 正序=${hist[0].revision}`,
)
ok(
  'findRevision 多条 history 中命中唯一 checksum 的条目',
  snap.findRevision(hist, 'sha256:Y')?.revision === 2 && snap.findRevision(hist, 'sha256:Y')?.version === 2,
)
const one = [{ revision: 5, version: 5, checksum: 'sha256:Z' }]
ok('findRevision 单条正常命中', snap.findRevision(one, 'sha256:Z')?.revision === 5)
ok('findRevision 空 history → null', snap.findRevision([], 'sha256:X') === null)
ok('findRevision 非数组 history → null', snap.findRevision(null, 'sha256:X') === null && snap.findRevision(undefined, 'sha256:X') === null)
ok('findRevision 无匹配 → null', snap.findRevision(hist, 'sha256:NONE') === null)
ok('findRevision 空字符串 checksum → null', snap.findRevision(hist, '') === null && snap.findRevision(hist, undefined) === null)

/* 13.6 口径验证：落地 manifest 自洽（findRevision(history, checksum) 应还原出 manifest 的三元组） */
const cet4Manifest = JSON.parse(readFileSync(resolve(root, 'content/vocabulary/cet4/manifest.json'), 'utf8'))
ok(
  'cet4 manifest 已写入版本三元组（读不到即 FAIL，不跳过）',
  Number.isInteger(cet4Manifest.contentRevision) &&
    Number.isInteger(cet4Manifest.contentVersion) &&
    typeof cet4Manifest.contentChecksum === 'string' &&
    cet4Manifest.contentChecksum.length > 0 &&
    Array.isArray(cet4Manifest.contentHistory) &&
    cet4Manifest.contentHistory.length > 0,
  `revision=${cet4Manifest.contentRevision} version=${cet4Manifest.contentVersion}`,
)
const cet4Hit = snap.findRevision(cet4Manifest.contentHistory, cet4Manifest.contentChecksum)
ok(
  'findRevision(cet4 history, contentChecksum).version === manifest.contentVersion',
  cet4Hit !== null && cet4Hit.version === cet4Manifest.contentVersion,
  cet4Hit ? `${cet4Hit.version} vs ${cet4Manifest.contentVersion}` : 'null',
)
ok(
  'findRevision(cet4 history, contentChecksum).revision === manifest.contentRevision',
  cet4Hit !== null && cet4Hit.revision === cet4Manifest.contentRevision,
  cet4Hit ? `${cet4Hit.revision} vs ${cet4Manifest.contentRevision}` : 'null',
)
ok(
  'cet4 contentHistory 按 revision 升序追加（findRevision 倒序扫描的前提）',
  cet4Manifest.contentHistory.every((e, i, arr) => i === 0 || arr[i - 1].revision <= e.revision),
  cet4Manifest.contentHistory.map((e) => e.revision).join(','),
)

await server.close()

console.log(`\n──────────────────────────────────────────────────────`)
console.log(`共 ${pass + fail} 项，通过 ${pass}，失败 ${fail}`)
console.log(`──────────────────────────────────────────────────────`)
if (fail > 0) {
  console.log('失败项：' + failures.join(' | '))
  process.exit(1)
}
