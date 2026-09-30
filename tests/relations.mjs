/* V4.1 / P18-G0 · relations 端点可达性契约测试
 *
 * 背景（P1.8-DESIGN-RULINGS §⑪）：三处 relations 端点可达性判定历史上**只认 type === 'word'** ——
 *   scripts/gate-content-contract.mjs:47 · scripts/content/ingest.mjs:124（前两处是逐字复制）
 *   · scripts/content/validate.mjs:516（第三份，结构不同）。
 * P18-G 会产出第一个含 reading / listening / audio **条目**端点的 relations.json，
 * 届时所有非 word 端点会被判成孤儿端点（**假红**）；而为了「不红」把端点删掉则变漏判（**假绿**）。
 * ⇒ 本波把可达性扩展到非 word，并抽成共享模块 scripts/content/relations.mjs（唯一实现）。
 *
 * ★ 形态必须可证伪（本仓已有两次「恒真断言 = 没断言」的教训，见裁定 ⑨-11）：
 *   本测试的**核心是第 ② 条**「reading 条目端点可达」。实施前，共享模块里放的是与现网等价的
 *   「只认 word」实现，实测第 ② 条**判红 ❌**；扩展为非 word 后转绿 ✅。
 *   若一条断言在任何实现下都绿，它就不是判据 —— 故第 ③ ④ 两条反例与第 ② 条必须成对存在：
 *   ② 证明「该可达的能可达」不是空转，③ ④ 证明「可达」不是「一律可达」。
 *
 * 数据：全部用**真实** loadPackages() 的结果构造，不造假包名 / 假词形 ——
 *   假的包名会让「可达」永远为真，那才是真正的恒真测试。
 *
 * 用法：node tests/relations.mjs        （exit 0 = 全过 / 1 = 有失败）
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { loadPackages, CONTENT_ID_RE } from '../scripts/content/license-policy.mjs'
import { buildReachability, isReachable } from '../scripts/content/relations.mjs'

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

console.log('──────────────────────────────────────────────────────')
console.log('relations 端点可达性契约（P18-G0 · 共享模块 scripts/content/relations.mjs）')
console.log('──────────────────────────────────────────────────────')

/* ---------- 0. 真实数据：直接读 content/，不经任何门 ---------- */
const pkgs = await loadPackages(resolve(root, 'content'))
ok('对照组：真实 content/ 至少发现 1 个包（否则下面全是空转）', pkgs.length > 0, `${pkgs.length} 个包`)
if (pkgs.length === 0) {
  console.log(`\n共 ${pass + fail} 项，通过 ${pass}，失败 ${fail}`)
  process.exit(1)
}

const byDirId = new Map(pkgs.map((p) => [`${p.type}/${p.id}`, p]))

/* 词库取样：ai-core（inline 包，43 词）。ns 从该包 manifest.id 的第 2 段取，不写死。 */
const vocabPkg = byDirId.get('vocabulary/ai-core')
const vocabNs = CONTENT_ID_RE.exec(vocabPkg?.manifest?.id ?? '')?.[2] ?? ''
const vocabWord = Array.isArray(vocabPkg?.payload)
  ? (vocabPkg.payload.find((w) => w?.word === 'transformer')?.word ?? vocabPkg.payload[0]?.word)
  : ''
/* 条目取样：reading/demo-reading-01（6 条 {id,title}）。ns 同样从 manifest.id 取。 */
const readingPkg = byDirId.get('reading/demo-reading-01')
const readingNs = CONTENT_ID_RE.exec(readingPkg?.manifest?.id ?? '')?.[2] ?? ''
const readingItemId = Array.isArray(readingPkg?.payload) ? readingPkg.payload[0]?.id : ''

ok(
  '取样点存在（vocabulary/ai-core 与 reading/demo-reading-01 均已加载且带载荷）',
  !!(vocabNs && vocabWord && readingNs && readingItemId),
  `vocab ns=${vocabNs || '?'} word=${vocabWord || '?'} / reading ns=${readingNs || '?'} item=${readingItemId || '?'}`,
)

const reach = buildReachability(pkgs)

/* ---------- ① 词库端点可达（既有能力，防本次改动把 word 也搞坏） ---------- */
const wordEndpoint = `content:word:${vocabNs}:${vocabWord}`
ok('① 词库端点可达：content:word:<ns>:<词形>', isReachable(reach, wordEndpoint), wordEndpoint)

/* ---------- ② 非 word 条目端点可达（本波要修的那条；未修时判红） ---------- */
const readingEndpoint = `content:reading:${readingNs}:${readingItemId}`
ok(
  '② reading 条目端点可达：content:reading:<ns>:<条目 id>（本波修复目标 —— 未修时此条判红）',
  isReachable(reach, readingEndpoint),
  readingEndpoint,
)

/* ---------- ③ 不存在的 local 不可达（防「一律可达」式假绿） ---------- */
const bogusEndpoint = `content:reading:${readingNs}:reading-item-99`
ok('③ 不存在的 local 不可达（防可达性被写成恒真）', !isReachable(reach, bogusEndpoint), bogusEndpoint)

/* ---------- ④ 跨族不可达（词桶与条目桶物理隔离） ---------- */
const crossEndpoint = `content:word:${readingNs}:${readingItemId}`
ok(
  '④ 跨族不可达：把 reading 条目 id 放进 content:word:<同 ns> 下（词桶 ⇄ 条目桶不得串）',
  !isReachable(reach, crossEndpoint),
  crossEndpoint,
)

/* ---------- ⑤ 包级 ContentId 可达 ---------- */
ok(
  '⑤ 包级 ContentId 可达（整包端点，先于条目桶命中）',
  !!vocabPkg?.manifest?.id && isReachable(reach, vocabPkg.manifest.id),
  vocabPkg?.manifest?.id ?? '(缺失)',
)
/* ⑤ 的对照组：reading 的包级 ContentId 也必须可达 —— 否则「包级命中」只对词库成立 */
ok(
  '⑤b 对照组：非词库的包级 ContentId 同样可达',
  !!readingPkg?.manifest?.id && isReachable(reach, readingPkg.manifest.id),
  readingPkg?.manifest?.id ?? '(缺失)',
)

/* ---------- ⑥ 静态断言：三处调用点都引用共享模块（防「改一份漏两份」的复制漂移） ----------
 * 这是 P18-A「12→14 白名单漂移」同型事故的防线：两处逐字复制的 reachable() 之所以能漂，
 * 正因为「必须同步」只写在注释里。这里把它变成机器判据。 */
const CALL_SITES = [
  ['scripts/gate-content-contract.mjs', 'scripts/gate-content-contract.mjs'],
  ['scripts/content/ingest.mjs', 'scripts/content/ingest.mjs'],
  ['scripts/content/validate.mjs', 'scripts/content/validate.mjs'],
]
for (const [rel, label] of CALL_SITES) {
  let src = ''
  try { src = readFileSync(resolve(root, rel), 'utf8') } catch (e) { src = `__READ_ERROR__${e.message}` }
  ok(
    `⑥ 静态断言：${label} 引用共享模块 relations.mjs（防复制漂移）`,
    src.includes('relations.mjs'),
    src.startsWith('__READ_ERROR__') ? src : '',
  )
}

console.log(`\n──────────────────────────────────────────────────────`)
console.log(`共 ${pass + fail} 项，通过 ${pass}，失败 ${fail}`)
console.log(`──────────────────────────────────────────────────────`)
if (fail > 0) {
  console.log('失败项：' + failures.join(' | '))
  process.exit(1)
}
