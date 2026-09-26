/**
 * 为 src/data/englishBanks.ts 中 CET4/CET6 现有词单补英文释义（definition）
 *
 * 数据源：skywind3000/ECDICT（MIT License）ecdict.csv
 * 规则：
 *   - 只补释义不扩词：CET4/CET6 词数与 word 键值保持不变
 *   - 按 word 大小写不敏感匹配 ECDICT
 *   - definition 取英文释义第一行，截 160 字符
 *   - 精准逐词替换 `translation: '...' }` → `translation: '...', definition: '...' }`
 *     保留文件头注释与其余结构原样；匹配不到的词保持原样
 *
 * 用法：node scripts/build-cet-defs.mjs [csv路径]
 */
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const CSV_PATH = process.argv[2] ?? 'D:/work/_ops/_ecdict/ecdict.csv'
const BANKS_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'englishBanks.ts')

const MAX_LEN = 160

/** 解析单行 CSV：处理引号包裹与 "" 转义（同 build-ielts.mjs） */
function parseCsvLine(line) {
  const out = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuote = false
        }
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQuote = true
    } else if (ch === ',') {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out
}

/** 生成可安全嵌入单引号字符串的 definition：取第一行（字面 \n 分隔）、截断、转义 */
function cleanDefinition(raw) {
  let d = (raw ?? '').split('\\n')[0].trim()
  if (d.length > MAX_LEN) d = d.slice(0, MAX_LEN).replace(/[\s,;.:]+\S*$/, '') // 去掉截断产生的残词
  return d.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

/* ---------- 1. 读取词单，确定需要补释义的词 ---------- */
const src = readFileSync(BANKS_PATH, 'utf8')
const lines = src.split('\n')

// word（小写）→ 所属 bank 列表；同名词条分属两个 bank 时两边都补
const wanted = new Map() // lower → [lineIndex, ...]
let bank = null
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^export const (CET[46]):/)
  if (m) {
    bank = m[1]
    continue
  }
  if (!bank) continue
  const w = lines[i].match(/^\s*\{\s*word:\s*'([^']+)',\s*translation:/)
  if (w) {
    const lower = w[1].toLowerCase()
    if (!wanted.has(lower)) wanted.set(lower, [])
    wanted.get(lower).push(i)
  }
}

const beforeWordCount = [...wanted.values()].reduce((n, arr) => n + arr.length, 0)
console.log(`词单词条总数（CET4+CET6）：${beforeWordCount}`)

/* ---------- 2. 流式扫 ECDICT，取目标词的 definition ---------- */
const defs = new Map() // lower → cleaned definition
const rl = createInterface({ input: createReadStream(CSV_PATH, { encoding: 'utf8' }), crlfDelay: Infinity })
let header = null
let csvLines = 0
for await (const line of rl) {
  if (header === null) {
    header = parseCsvLine(line)
    continue
  }
  const cols = parseCsvLine(line)
  if (cols.length < header.length) continue
  const row = {}
  header.forEach((h, i) => (row[h] = cols[i]))
  const lower = (row.word ?? '').toLowerCase()
  if (!lower || !wanted.has(lower) || defs.has(lower)) continue
  const cleaned = cleanDefinition(row.definition)
  if (cleaned) defs.set(lower, cleaned)
  if (++csvLines % 500000 === 0) console.log(`  已扫描 ${csvLines} 行…`)
}
console.log(`ECDICT 匹配到释义的词条数：${defs.size}`)

/* ---------- 3. 精准逐词替换：translation 行尾追加 definition ---------- */
let patched = 0
const missed = []
for (const [lower, idxList] of wanted) {
  const def = defs.get(lower)
  if (!def) {
    // 找原词大小写形式用于报告
    const original = idxList.map((i) => lines[i].match(/word:\s*'([^']+)'/)[1])
    missed.push(...new Set(original))
    continue
  }
  for (const i of idxList) {
    const line = lines[i]
    const replaced = line.replace(/^(\s*\{\s*word:\s*'[^']+',\s*translation:\s*'[^']*')(\s*\},?\s*)$/, `$1, definition: '${def}'$2`)
    if (replaced === line) {
      console.error(`  ⚠️ 行替换失败（格式不符）：${line.trim()}`)
      continue
    }
    lines[i] = replaced
    patched++
  }
}

writeFileSync(BANKS_PATH, lines.join('\n'), 'utf8')

/* ---------- 4. 统计报告 ---------- */
const afterWordCount = (lines.join('\n').match(/^\s*\{\s*word:/gm) ?? []).length
const cet4 = (lines.join('\n').match(/word:/g) ?? []).length
console.log(`\n========== 统计 ==========`)
console.log(`补上 definition 的词条数：${patched}`)
console.log(`匹配不到的词数：${missed.length}`)
console.log(`词数前后对比：${beforeWordCount} → ${afterWordCount}（${beforeWordCount === afterWordCount ? '一致 ✅' : '不一致 ❌'}）`)
if (missed.length) console.log(`未匹配词列表：${missed.join(', ')}`)
