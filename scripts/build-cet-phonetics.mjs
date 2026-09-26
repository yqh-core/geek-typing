/**
 * 为 src/data/englishBanks.ts 中 CET4/CET6 现有词单补 phonetic（音标）（V3-P0a）
 *
 * 数据源：skywind3000/ECDICT（MIT License）ecdict.csv
 * 规则：
 *   - 只补音标不扩词：CET4/CET6 词数与 word 键值保持不变
 *   - 按 word 大小写不敏感匹配 ECDICT phonetic 列，原样保留
 *   - phonetic 为空 / ''（ECDICT 无音标占位）则跳过该词
 *   - 精准逐词在 `word: '...'` 后插入 `phonetic: '...'`，
 *     保留文件头注释与其余结构原样；已含 phonetic 的行跳过（可重复执行）
 *
 * 用法：node scripts/build-cet-phonetics.mjs [csv路径]
 */
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const CSV_PATH = process.argv[2] ?? 'D:/work/_ops/_ecdict/ecdict.csv'
const BANKS_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'englishBanks.ts')

/** 解析单行 CSV：处理引号包裹与 "" 转义（同 build-cet-defs.mjs） */
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

/** phonetic 清洗：原样保留；空 / '' 视为无音标；转义后可安全嵌入单引号字符串 */
function cleanPhonetic(raw) {
  const p = (raw ?? '').trim()
  if (!p || p === "''") return ''
  return p.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

/* ---------- 1. 读取词单，确定需要补音标的词 ---------- */
const src = readFileSync(BANKS_PATH, 'utf8')
const lines = src.split('\n')

// word（小写）→ 所属 bank 列表；同名词条分属两个 bank 时两边都补
const wanted = new Map() // lower → [lineIndex, ...]
let bank = null
let already = 0
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^export const (CET[46]):/)
  if (m) {
    bank = m[1]
    continue
  }
  if (!bank) continue
  const w = lines[i].match(/^\s*\{\s*word:\s*'([^']+)',/)
  if (w) {
    if (lines[i].includes('phonetic:')) {
      already++
      continue
    }
    const lower = w[1].toLowerCase()
    if (!wanted.has(lower)) wanted.set(lower, [])
    wanted.get(lower).push(i)
  }
}

const beforeWordCount = [...wanted.values()].reduce((n, arr) => n + arr.length, 0)
console.log(`词单词条总数（CET4+CET6）：${beforeWordCount}（已含 phonetic 跳过：${already}）`)

/* ---------- 2. 流式扫 ECDICT，取目标词的 phonetic ---------- */
const phonetics = new Map() // lower → cleaned phonetic
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
  const lower = (cols[header.indexOf('word')] ?? '').toLowerCase()
  if (!lower || !wanted.has(lower) || phonetics.has(lower)) continue
  const cleaned = cleanPhonetic(cols[header.indexOf('phonetic')])
  if (cleaned) phonetics.set(lower, cleaned)
  if (++csvLines % 500000 === 0) console.log(`  已扫描 ${csvLines} 行…`)
}
console.log(`ECDICT 匹配到音标的词条数：${phonetics.size}`)

/* ---------- 3. 精准逐词替换：word: 'xxx', 后插入 phonetic ---------- */
let patched = 0
const missed = []
for (const [lower, idxList] of wanted) {
  const ph = phonetics.get(lower)
  if (!ph) {
    const original = idxList.map((i) => lines[i].match(/word:\s*'([^']+)'/)[1])
    missed.push(...new Set(original))
    continue
  }
  for (const i of idxList) {
    const line = lines[i]
    const replaced = line.replace(/^(\s*\{\s*word:\s*'[^']+',)/, `$1 phonetic: '${ph}',`)
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
console.log(`\n========== 统计 ==========`)
console.log(`补上 phonetic 的词条数：${patched}`)
console.log(`匹配不到音标的词数：${missed.length}`)
console.log(`词数前后对比：${beforeWordCount + already} → ${afterWordCount}（${beforeWordCount + already === afterWordCount ? '一致 ✅' : '不一致 ❌'}）`)
if (missed.length) console.log(`未匹配词列表：${missed.join(', ')}`)
