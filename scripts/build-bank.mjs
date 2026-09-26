/**
 * 从 ECDICT CSV 参数化生成词库（雅思 / 考研 / 托福）
 *
 * 数据源：skywind3000/ECDICT（MIT License）仓库根目录 ecdict.csv
 * 逻辑：tag 含指定 token 的词 → 按 frq（zipf 词频，缺失排后）降序 → 取前 LIMIT
 *       word 只留 /^[a-zA-Z-]+$/，translation 取首行截 40 字符，definition 取首行截 160 字符
 *       phonetic 原样保留（V3-P0a 起），空 / '' 则省略该字段
 * 产物为脚本生成，不要手工编辑。
 *
 * 用法：
 *   node scripts/build-bank.mjs scan [csv路径]          # 打印 tag token 分布（探测用）
 *   node scripts/build-bank.mjs ielts  [csv路径]        # 生成 src/data/ielts.ts
 *   node scripts/build-bank.mjs kaoyan [csv路径]        # 生成 src/data/kaoyan.ts
 *   node scripts/build-bank.mjs toefl  [csv路径]        # 生成 src/data/toefl.ts
 */
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const CSV_PATH = process.argv[3] ?? 'D:/work/_ops/_ecdict/ecdict.csv'
const MODE = process.argv[2] ?? 'scan'

const LIMIT = 3000

/** 各词库配置：tagTokens 按 ECDICT 实际 tag token 匹配（小写、按空白分词） */
const BANKS = {
  ielts: {
    tagTokens: ['ielts'],
    // 头注释显示与历史 build-ielts.mjs 产物保持一致（tag 大写 IELTS / 重新生成入口）
    tagLabel: 'IELTS',
    regen: 'node scripts/build-ielts.mjs',
    exportName: 'IELTS',
    title: '雅思核心词库',
    outFile: 'ielts.ts',
  },
  kaoyan: {
    tagTokens: ['ky', 'kaoyan'], // ECDICT 考研 tag 为 ky（兼容 kaoyan 写法）
    exportName: 'KAoyan',
    title: '考研核心词库',
    outFile: 'kaoyan.ts',
  },
  toefl: {
    tagTokens: ['toefl'],
    exportName: 'TOEFL',
    title: '托福核心词库',
    outFile: 'toefl.ts',
  },
}

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

/** phonetic 清洗：原样字符串，空 / '' 返回 ''（写行时省略该字段） */
function cleanPhonetic(raw) {
  const p = (raw ?? '').trim()
  if (!p || p === "''") return ''
  return p
}

async function main() {
  const rl = createInterface({ input: createReadStream(CSV_PATH, 'utf8'), crlfDelay: Infinity })

  let header = null
  const rows = []
  const tagCount = new Map()
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
    const tag = get('tag').toLowerCase()

    if (MODE === 'scan') {
      for (const token of tag.split(/\s+/)) {
        if (token) tagCount.set(token, (tagCount.get(token) ?? 0) + 1)
      }
      continue
    }

    if (!/^[a-zA-Z-]+$/.test(word)) continue
    const conf = BANKS[MODE]
    if (!conf) {
      console.error(`未知词库：${MODE}（可选：${Object.keys(BANKS).join(' / ')} / scan）`)
      process.exit(1)
    }
    const tokens = tag.split(/\s+/)
    if (!conf.tagTokens.some((t) => tokens.includes(t))) continue

    rows.push({
      word,
      translation: firstLine(get('translation')).slice(0, 40),
      definition: firstLine(get('definition')).slice(0, 160),
      // phonetic 原样保留；空 / ''（ECDICT 无音标占位）则省略字段
      phonetic: cleanPhonetic(get('phonetic')),
      frq: Number.parseFloat(get('frq')) || 0,
    })
  }

  if (MODE === 'scan') {
    const sorted = [...tagCount.entries()].sort((a, b) => b[1] - a[1])
    console.log(`共扫描 ${lineNo} 行，tag token 分布（token 数量）：`)
    for (const [token, n] of sorted) console.log(`  ${token}: ${n}`)
    return
  }

  const conf = BANKS[MODE]
  // 按 zipf 频率降序（V8 sort 稳定，缺失 frq 的自然排到后面）
  rows.sort((a, b) => b.frq - a.frq)
  const picked = rows.slice(0, LIMIT)

  const body = picked
    .map((r) => {
      const ph = r.phonetic ? ` phonetic: ${JSON.stringify(r.phonetic)},` : ''
      return `  { word: ${JSON.stringify(r.word)},${ph} translation: ${JSON.stringify(r.translation)}, definition: ${JSON.stringify(r.definition)} },`
    })
    .join('\n')

  const ts = `/**
 * ${conf.title}（脚本生成，勿手工编辑）
 * 来源：ECDICT (https://github.com/skywind3000/ECDICT) MIT License
 * 规则：tag 含 ${conf.tagLabel ?? conf.tagTokens.join('/')} 的词，按 frq 词频降序取前 ${picked.length}
 * 重新生成：${conf.regen ?? `node scripts/build-bank.mjs ${MODE}`}
 */
import type { WordItem } from './wordBanks'

export const ${conf.exportName}: WordItem[] = [
${body}
]
`

  const outPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', conf.outFile)
  writeFileSync(outPath, ts, 'utf8')
  console.log(`OK 共扫描 ${lineNo} 行，${MODE.toUpperCase()} 候选 ${rows.length} 词，写出 ${picked.length} 词到 ${outPath}`)
  console.log('样例前5：', picked.slice(0, 5).map((r) => r.word).join(', '))
}

main().catch((e) => {
  console.error('构建失败：', e)
  process.exit(1)
})
