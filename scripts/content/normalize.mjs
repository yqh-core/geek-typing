/* V4.1-P0.5 · content:normalize —— Import Pipeline 第 0 阶段：Raw → Normalize。
 *
 * 位置：落数据（words.json）之后、content:build 之前。外来词表（ECDICT 导出、CSV、
 * 网页抓取）常带全角空格 / HTML 标签 / 实体 / 大小写与空白差异，直接入库会让
 * 「同一个词」在包里出现多次、或让 checksum 因无关空白而漂移。本脚本把文本
 * 收敛到规范形，并把「必须人工决策」的问题（重复词 / 空字段 / 非法字段）报出来。
 *
 * 规范化规则（作用于 word / translation / phonetic / definition 字符串）：
 *   NFC 归一 → 剥离 HTML 标签 `<[^>]*>` → 解码常见实体（&amp; &lt; &gt; &quot; &#39; &nbsp;）
 *   → 空白折叠（含 \u00A0 / \t / \r / \n，连续空白 → 单空格）→ 删除控制字符 → trim
 *   （顺序说明：实体解码后可能还原出新的空白与控制字符，所以解码放在折叠/删除之前，
 *     否则剥离标签留下的空白会残留在词形里。）
 *
 * ⚠️ 代码词库（ts-code / go-code）必须关掉 HTML 剥离：
 *   泛型 `type Handler<T> = ...`、JSX `<div className="app">`、`<List />` 会被 `<[^>]*>`
 *   当成标签删掉，词表直接被破坏（实测 5 条命中）。这类包在 manifest 里声明
 *   `"normalize": { "stripHtml": false }`，脚本据此跳过「标签剥离 + 实体解码」
 *   （代码行是字面量，HTML 语义不适用），其余规范化照做。
 *
 * 只检测、不自动修（交人工决策）：
 *   · 包内重复 normalized word（NFC + lowercase + 空白折叠后同 key ⇒ 大小写/空格差异会撞车）
 *   · 空 word / 空 translation（规范化后为空串）
 *   · 非法字段（白名单外的键，白名单 = word/translation/phonetic/definition/partOfSpeech）
 *
 * 退出码：存在「重复词 / 空字段 / 非法字段」→ exit 1（CI 可用）；
 *         仅格式差异不 exit 1，提示加 --write。
 * 幂等：规范化函数 f(f(x)) === f(x)，跑两次结果一致。
 *
 * ⚠️ 落盘必须与 checksum 计算同源：--write 一律用 canonical.mjs 的 canonicalFile()
 *   （canonicalize + 尾随换行），与 content:build / content:validate 的
 *   sha256Canonical 是同一份序列化实现。否则「改了哪里」与「算出来多少」会分叉，
 *   checksum 又会随排版漂移 —— 那正是本轮要修的问题。
 *
 * 用法：node scripts/content/normalize.mjs [包id...] [--write]
 *      不给包 id = 全部包；默认干跑，--write 才回写 words.json。
 */
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { canonicalFile } from './canonical.mjs'

const ROOT = path.resolve(process.cwd())
const VOCAB_DIR = path.join(ROOT, 'content', 'vocabulary')

/** 词条合法字段白名单（V4.1 契约：word / translation / phonetic? / definition? / partOfSpeech?） */
const FIELD_WHITELIST = ['word', 'translation', 'phonetic', 'definition', 'partOfSpeech']
/** 参与文本规范化的字段（partOfSpeech 是枚举型，不做文本清洗） */
const TEXT_FIELDS = ['word', 'translation', 'phonetic', 'definition']

const ENTITIES = [
  [/&lt;/g, '<'], [/&gt;/g, '>'], [/&quot;/g, '"'], [/&#39;/g, "'"], [/&nbsp;/g, ' '],
  // &amp; 最后解：先解 &lt; 等，避免 &amp;lt; 被还原成裸 '<'
  [/&amp;/g, '&'],
]
const WS_RE = /[\s\u00A0]+/g // \s 已含空格 / \t / \r / \n / \v / \f
const CONTROL_RE = /[\u0000-\u001F\u007F]/g

/** 单条字符串的规范形。幂等：normalize(normalize(x)) === normalize(x)
 *  stripHtml=false 时跳过标签剥离与实体解码（代码词库专用，见文件头注释） */
function normalizeText(raw, stripHtml = true) {
  if (typeof raw !== 'string') return raw
  let s = raw.normalize('NFC')
  if (stripHtml) {
    s = s.replace(/<[^>]*>/g, '')
    for (const [re, to] of ENTITIES) s = s.replace(re, to)
  }
  s = s.replace(WS_RE, ' ').replace(CONTROL_RE, '').trim()
  return s
}

/** 重复检测 key：NFC + lowercase + 空白折叠。大小写/空格差异 ⇒ 同一词 */
function dupKey(raw) {
  return String(raw ?? '').normalize('NFC').toLowerCase().replace(WS_RE, ' ').trim()
}

function parseArgs(argv) {
  const write = argv.includes('--write')
  const ids = argv.filter((a) => !a.startsWith('--'))
  return { write, ids }
}

async function main() {
  const { write, ids: wanted } = parseArgs(process.argv.slice(2))
  if (!existsSync(VOCAB_DIR)) { console.error('content/vocabulary 不存在'); process.exit(1) }
  const all = (await readdir(VOCAB_DIR, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name)

  for (const id of wanted) {
    if (!all.includes(id)) { console.error(`未知包 id：${id}（可选：${all.join(', ')}）`); process.exit(1) }
  }
  const targets = wanted.length > 0 ? wanted : all
  console.log(`[content:normalize] ${targets.length} 包（${write ? '--write 落盘' : '干跑，不落盘'}）`)

  let blocked = 0 // 重复 / 空字段 / 非法字段的包数
  let dirty = 0 // 有格式差异的包数
  let written = 0

  for (const id of targets) {
    const file = path.join(VOCAB_DIR, id, 'words.json')
    let words
    try {
      words = JSON.parse(await readFile(file, 'utf8'))
    } catch (e) { console.error(`▸ ${id}: words.json 不可解析：${e.message}`); blocked++; continue }
    if (!Array.isArray(words)) { console.error(`▸ ${id}: words.json 不是数组`); blocked++; continue }

    // 包级规范化开关：代码词库关掉 HTML 剥离，避免泛型/JSX 被当标签删掉
    let stripHtml = true
    try {
      const m = JSON.parse(await readFile(path.join(VOCAB_DIR, id, 'manifest.json'), 'utf8'))
      if (m?.normalize?.stripHtml === false) stripHtml = false
    } catch { /* manifest 缺失/不可解析时按默认（剥离）处理，validate 会另行报错 */ }
    if (!stripHtml) console.log(`   · ${id}: manifest.normalize.stripHtml=false → 跳过 HTML 剥离与实体解码（代码词库）`)

    const dups = []
    const empties = []
    const illegals = []
    const samples = []
    const seen = new Map()
    let changedItems = 0

    const next = words.map((item, i) => {
      const out = { ...item }
      for (const f of TEXT_FIELDS) {
        if (typeof out[f] !== 'string') continue
        const v = normalizeText(out[f], stripHtml)
        if (v !== out[f]) {
          samples.push(`${f}: ${JSON.stringify(out[f]).slice(0, 70)} → ${JSON.stringify(v).slice(0, 70)}`)
          out[f] = v
          changedItems++
        }
      }
      // 非法字段（白名单外）
      for (const k of Object.keys(item)) {
        if (!FIELD_WHITELIST.includes(k)) illegals.push(`#${i} 字段 "${k}"`)
      }
      // 空字段（规范化后为空串，含原值缺失/纯空白/纯标签）
      if (!out.word) empties.push(`#${i} word 为空（原值："${String(item?.word ?? '').slice(0, 20)}"）`)
      if (!out.translation) empties.push(`#${i} translation 为空（word=${out.word || '?'}）`)
      // 重复词（大小写/空格差异视为同一词）
      const key = dupKey(out.word)
      if (key) {
        if (seen.has(key)) dups.push(`${out.word}（首次出现 #${seen.get(key)}，重复于 #${i}）`)
        else seen.set(key, i)
      }
      return out
    })

    const dirtyItems = JSON.stringify(next) !== JSON.stringify(words)
    if (dirtyItems || dups.length || empties.length || illegals.length) {
      console.log(`▸ ${id}: 规范化 ${changedItems} 条 / 重复 ${dups.length} / 空字段 ${empties.length} / 非法字段 ${illegals.length}`)
    } else {
      console.log(`▸ ${id}: 规范化 0 条 / 重复 0 / 空字段 0 / 非法字段 0（已规范）`)
    }
    if (dups.length) console.log(`   ✗ 重复词（需人工合并/去重，脚本不代改）：${dups.slice(0, 5).join('；')}${dups.length > 5 ? ` …共 ${dups.length}` : ''}`)
    if (empties.length) console.log(`   ✗ 空字段（需人工补数据）：${empties.slice(0, 5).join('；')}${empties.length > 5 ? ` …共 ${empties.length}` : ''}`)
    if (illegals.length) console.log(`   ✗ 非法字段（不在白名单 ${FIELD_WHITELIST.join('/')}）：${illegals.slice(0, 5).join('；')}${illegals.length > 5 ? ` …共 ${illegals.length}` : ''}`)
    if (dirtyItems) {
      console.log(`   · 格式差异 ${changedItems} 条${write ? ' → 已回写' : ' → 需加 --write 落盘'}`)
      for (const s of samples.slice(0, 3)) console.log(`     - ${s}`)
      if (samples.length > 3) console.log(`     - …共 ${samples.length} 处`)
    }

    if (dups.length || empties.length || illegals.length) blocked++
    if (dirtyItems) dirty++

    if (write && dirtyItems) {
      await writeFile(file, canonicalFile(next), 'utf8') // 紧凑单行 + 尾随换行，与 sha256Canonical 同源
      written++
    }
  }

  if (write && written > 0) {
    console.log(`\n[content:normalize] 已回写 ${written} 个 words.json`)
    console.log('⚠ words.json 已变更，请重跑 node scripts/content/build.mjs 同步 stats/checksum')
  } else if (!write && dirty > 0) {
    console.log(`\n[content:normalize] ${dirty} 包存在格式差异 → 加 --write 落盘后重跑 content:build`)
  } else {
    console.log(`\n[content:normalize] 无需落盘（${targets.length} 包均已规范）`)
  }

  if (blocked > 0) {
    console.error(`[content:normalize] FAIL：${blocked} 包存在需人工决策的问题（重复词 / 空字段 / 非法字段）`)
    process.exit(1)
  }
}

main().catch((e) => { console.error('[content:normalize] 异常：', e.message); process.exit(1) })
