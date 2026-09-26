/**
 * 从 ECDICT CSV 生成雅思词库 src/data/ielts.ts
 *
 * 数据源：skywind3000/ECDICT（MIT License）仓库根目录 ecdict.csv
 * 逻辑：筛选 tag 含 "IELTS" 的词 → 按 frq（zipf 词频，缺失排后）降序 → 取前 3000
 * 产物为脚本生成，不要手工编辑。
 * 注意（V3-P0a）：ielts.ts 的 phonetic 字段由 scripts/build-bank.mjs ielts 提供；
 * 直接重跑本脚本会丢掉音标列，请改用 `node scripts/build-bank.mjs ielts`。
 *
 * 用法：node scripts/build-ielts.mjs [csv路径]
 */
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const CSV_PATH = process.argv[2] ?? 'D:/work/_ops/_ecdict/ecdict.csv'
const OUT_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'ielts.ts')

const LIMIT = 3000

/** 解析单行 CSV：处理引号包裹与 "" 转义（ECDICT 的多行内容以字面 \n 存储于行内） */
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

/** 按字面 "\n"（反斜杠+n）与真实换行拆分，取第一行 */
function firstLine(raw) {
  if (!raw) return ''
  return raw.split('\\n')[0].split('\n')[0].trim()
}

async function main() {
  const rl = createInterface({ input: createReadStream(CSV_PATH, 'utf8'), crlfDelay: Infinity })

  let header = null
  const rows = []
  let lineNo = 0

  for await (const line of rl) {
    lineNo++
    const cells = parseCsvLine(line)
    if (!header) {
      header = cells
      continue
    }
    const get = (col) => cells[header.indexOf(col)] ?? ''
    const word = get('word')
    if (!/^[a-zA-Z-]+$/.test(word)) continue
    const tag = get('tag').toLowerCase()
    if (!tag.split(/\s+/).includes('ielts')) continue

    rows.push({
      word,
      translation: firstLine(get('translation')).slice(0, 40),
      definition: firstLine(get('definition')).slice(0, 160),
      frq: Number.parseFloat(get('frq')) || 0,
    })
  }

  // 按 zipf 频率降序（V8 sort 稳定，缺失 frq 的自然排到后面）
  rows.sort((a, b) => b.frq - a.frq)
  const picked = rows.slice(0, LIMIT)

  const body = picked
    .map(
      (r) =>
        `  { word: ${JSON.stringify(r.word)}, translation: ${JSON.stringify(r.translation)}, definition: ${JSON.stringify(r.definition)} },`,
    )
    .join('\n')

  const ts = `/**
 * 雅思核心词库（脚本生成，勿手工编辑）
 * 来源：ECDICT (https://github.com/skywind3000/ECDICT) MIT License
 * 规则：tag 含 IELTS 的词，按 frq 词频降序取前 ${picked.length}
 * 重新生成：node scripts/build-ielts.mjs
 */
import type { WordItem } from './wordBanks'

export const IELTS: WordItem[] = [
${body}
]
`

  writeFileSync(OUT_PATH, ts, 'utf8')
  console.log(`OK 共扫描 ${lineNo} 行，IELTS 候选 ${rows.length} 词，写出 ${picked.length} 词到 ${OUT_PATH}`)
  console.log('样例前5：', picked.slice(0, 5).map((r) => r.word).join(', '))
}

main().catch((e) => {
  console.error('构建失败：', e)
  process.exit(1)
})
