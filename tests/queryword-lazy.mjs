/* queryWord 对 lazy 包的「无需调用方预加载」证明 —— 必须独立进程。
 *
 * 为什么不能并入 tests/content-query.mjs：
 *   那个脚本要在同一个进程里跑 163 项断言，前面的段落必然已经调过 `queryWord` /
 *   `q.search`，等价地已经把 lazy 包装进索引。要想证明「queryWord 自己会把 lazy 包
 *   拉起来」，取样词必须来自**磁盘真值**（`content/vocabulary/<id>/words.json`），
 *   且整个进程在断言之前**一次都不能碰** `registry.loadPackage` / 任何 Query 入口。
 *   Shared state 无法在同一个进程里清零，只能换进程。
 *
 * 用法：node tests/queryword-lazy.mjs
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

console.log('【lazy】queryWord 是否会自己把 lazy 包拉起来')

// ① 确认 lazy 包存在，且它们**没有**被同步内联到 registry（words 为空 + 有 load）
const lazyPkgs = registry.getVocabularyPackages().filter((p) => !!p.load && !p.words)
ok('对照组：仓库确有 lazy 包（否则本脚本无事可做）', lazyPkgs.length > 0, lazyPkgs.map((p) => p.localId).join(','))

// ② 取样词只从磁盘读，**绝不**调用 loadPackage
const target = lazyPkgs[0]
const raw = JSON.parse(readFileSync(resolve(root, `content/vocabulary/${target.localId}/words.json`), 'utf8'))
const diskWords = Array.isArray(raw) ? raw : raw.words
const sample = [diskWords[0], diskWords[Math.floor(diskWords.length / 2)], diskWords[diskWords.length - 1]]
ok(
  '取样词来自磁盘真值（未经 registry.loadPackage）',
  sample.every((x) => !!x && typeof x.word === 'string' && x.word.length > 0),
  sample.map((x) => x.word).join(' / '),
)

// ③ 关键断言：这是本进程第一次触碰 Query 层 —— lazy 包的载入只能发生在 queryWord 内部
const hits = []
for (const s of sample) hits.push(await q.queryWord(target.localId, s.word))

hits.forEach((h, i) => {
  ok(
    `lazy 包 ${target.localId}：queryWord 首碰即取回 "${sample[i].word}"`,
    h !== null && h.word === sample[i].word && h.packageLocalId === target.localId,
    h ? h.id : 'null',
  )
})
ok(
  '命中内容与磁盘真值逐字段一致（id / word / translation / phonetic）',
  hits.every((h, i) => !!h && h.translation === sample[i].translation && (h.phonetic ?? undefined) === sample[i].phonetic),
)

// ④ 对照组：包不存在的 id ⇒ null（证明上面三个非 null 不是「恒返回非空」）
ok('对照组：换成不存在的包名 ⇒ null', (await q.queryWord('__gt_no_pkg__', sample[0].word)) === null)

await server.close()

console.log(`\n──────────────────────────────────────────────────────`)
console.log(`共 ${pass + fail} 项，通过 ${pass}，失败 ${fail}`)
console.log(`──────────────────────────────────────────────────────`)
if (fail > 0) {
  console.log('失败项：' + failures.join(' | '))
  process.exit(1)
}
