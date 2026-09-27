/**
 * P0.7 / P1.5 前置：Learning 键迁移审计（只读，不改任何 src/ 源码）
 *
 * 数据来源：content/vocabulary/<pkg>/words.json（词表真值）
 *          content/vocabulary/<pkg>/manifest.json（namespace / ContentId 真值）
 *
 * 复现命令：
 *   node scripts/migration-audit.mjs
 *   node scripts/migration-audit.mjs --json > docs/audit-package/_generated/migration-audit.json
 *   node scripts/migration-audit.mjs --user-store=<旧存储快照.json>
 *
 * 产出三档分级：
 *   resolved  —— word 全局只出现在 1 个包，裸 word 可唯一映射到 ContentId
 *   ambiguous —— word 出现在 >=2 个包，裸 word 无法反推用户当时学的是哪个包
 *   orphan    —— 旧记录里的 word 在当前 10 个包中完全不存在（词库变更后消失）
 *
 * 注意：orphan 无法从词表本身得出（词表只含现存词），必须用旧的用户存储快照
 * 作为输入。见 --user-store=<file>。不传时 orphan 记 N/A。
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const VOCAB = join(ROOT, 'content', 'vocabulary')
const argv = process.argv.slice(2)
const asJson = argv.includes('--json')
const userStoreArg = argv.find((a) => a.startsWith('--user-store='))

/** 1. 载入 10 个包 */
const pkgs = readdirSync(VOCAB, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort()

const data = new Map()
for (const p of pkgs) {
  const words = JSON.parse(readFileSync(join(VOCAB, p, 'words.json'), 'utf8'))
  const mf = JSON.parse(readFileSync(join(VOCAB, p, 'manifest.json'), 'utf8'))
  const ns = mf.namespace
  // 词表内自查重复：同包同 word 出现两次会导致包内 ContentId 撞车（门禁外的红线）
  const seen = new Map()
  const dupInPkg = []
  for (const row of words) {
    const w = row.word
    if (seen.has(w)) dupInPkg.push(w)
    else seen.set(w, true)
  }
  data.set(p, {
    pkg: p,
    namespace: ns,
    manifestId: mf.id,
    // ContentId 形如 content:word:<namespace>:<word>（与 tests/content-query.mjs:107 门禁一致）
    words: [...seen.keys()],
    rawCount: words.length,
    dupInPkg,
  })
}

/** 2. word -> 出现它的包列表（区分大小写：go-code / ts-code manifest 声明 case-sensitive） */
const wordToPkgs = new Map()
for (const [p, d] of data) {
  for (const w of d.words) {
    if (!wordToPkgs.has(w)) wordToPkgs.set(w, [])
    wordToPkgs.get(w).push(p)
  }
}

/** 2b. 小写归并视角（analytics 键是 lowercase —— 单独统计，用于口径分析） */
const lowerToPkgs = new Map()
for (const [p, d] of data) {
  for (const w of d.words) {
    const k = w.toLowerCase()
    if (!lowerToPkgs.has(k)) lowerToPkgs.set(k, new Set())
    lowerToPkgs.get(k).add(p)
  }
}

/** 3. 三档分级（基于词表：resolved / ambiguous） */
const resolved = []
const ambiguous = []
for (const [w, ps] of wordToPkgs) {
  if (ps.length === 1) resolved.push({ word: w, pkg: ps[0] })
  else ambiguous.push({ word: w, pkgs: ps.slice().sort() })
}

/** 4. orphan：需要旧用户存储快照 */
let orphan = null
let orphanSource = 'N/A（未提供 --user-store，词表本身无法反映历史消失词汇）'
if (userStoreArg) {
  const file = userStoreArg.split('=')[1]
  const raw = JSON.parse(readFileSync(file, 'utf8'))
  const oldWords = new Set()
  for (const [key, val] of Object.entries(raw)) {
    if (val && typeof val === 'object' && !Array.isArray(val)) oldWords.add(key)
  }
  orphan = [...oldWords]
    .filter((w) => !wordToPkgs.has(w) && !lowerToPkgs.has(w.toLowerCase()))
    .map((w) => ({ word: w }))
  orphanSource = `来自用户存储快照 ${file}（键数 ${oldWords.size}）`
}

/** 5. 10x10 交集矩阵（按包内裸 word 精确集合） */
const matrix = {}
for (const a of pkgs) {
  matrix[a] = {}
  for (const b of pkgs) {
    if (a === b) {
      matrix[a][b] = data.get(a).words.length
      continue
    }
    const sb = new Set(data.get(b).words)
    matrix[a][b] = data.get(a).words.filter((w) => sb.has(w)).length
  }
}

/** 6. 同名分布直方图 */
const hist = {}
for (const [, ps] of wordToPkgs) {
  const n = ps.length
  hist[n] = (hist[n] ?? 0) + 1
}

/** 7. 输出 */
const report = {
  generatedBy: 'scripts/migration-audit.mjs',
  generatedAt: new Date().toISOString(),
  packages: pkgs.map((p) => ({
    pkg: p,
    namespace: data.get(p).namespace,
    manifestId: data.get(p).manifestId,
    rawCount: data.get(p).rawCount,
    uniqueCount: data.get(p).words.length,
    dupInPkg: data.get(p).dupInPkg,
    contentIdSample: `content:word:${data.get(p).namespace}:${data.get(p).words[0]}`,
  })),
  totalWordsRaw: pkgs.reduce((s, p) => s + data.get(p).rawCount, 0),
  totalDistinctWords: wordToPkgs.size,
  totalDistinctLower: lowerToPkgs.size,
  histogram: hist,
  tiers: {
    resolved: resolved.length,
    ambiguous: ambiguous.length,
    orphan: orphan === null ? null : orphan.length,
    orphanSource,
  },
  ambiguousSample: ambiguous
    .slice()
    .sort((a, b) => b.pkgs.length - a.pkgs.length)
    .slice(0, 10)
    .map((x) => ({ word: x.word, pkgs: x.pkgs, count: x.pkgs.length })),
  matrix,
}

if (asJson) {
  console.log(JSON.stringify(report, null, 2))
} else {
  const L = console.log
  L('='.repeat(78))
  L('Learning 键迁移审计 —— 真实数据（source: content/vocabulary/*/words.json）')
  L('='.repeat(78))
  L('')
  L('【1】各包词数（raw = words.json 数组长度；unique = 包内去重后）')
  L('pkg'.padEnd(14) + 'namespace'.padEnd(22) + 'raw'.padStart(6) + 'unique'.padStart(8) + 'dupInPkg'.padStart(10))
  for (const p of pkgs) {
    const d = data.get(p)
    L(
      d.pkg.padEnd(14) +
        d.namespace.padEnd(22) +
        String(d.rawCount).padStart(6) +
        String(d.words.length).padStart(8) +
        String(d.dupInPkg.length).padStart(10),
    )
  }
  L(''.padEnd(14) + 'TOTAL'.padEnd(22) + String(report.totalWordsRaw).padStart(6))
  L('')
  L(`全库去重后不同 word 数（区分大小写）= ${report.totalDistinctWords}`)
  L(`全库去重后不同 word 数（小写归并）  = ${report.totalDistinctLower}`)
  L('')
  L('【2】同名分布直方图（出现在 N 个包的 word 有多少个）')
  Object.keys(hist)
    .map(Number)
    .sort((a, b) => a - b)
    .forEach((n) => L(`  出现在 ${String(n).padStart(2)} 个包: ${String(hist[n]).padStart(5)} 个 word`))
  L('')
  L('【3】三档分级（resolved / ambiguous / orphan）')
  L(`  resolved  = ${resolved.length}`)
  L(`  ambiguous = ${ambiguous.length}`)
  L(`  orphan    = ${orphan === null ? 'N/A（未提供用户存储快照）' : orphan.length}`)
  L(`     orphan 来源: ${orphanSource}`)
  L('')
  L('【4】ambiguous 中交叉最多的前 10 个 word')
  for (const x of report.ambiguousSample) {
    L(`  ${x.word.padEnd(20)} ${x.count} 包: ${x.pkgs.join(', ')}`)
  }
  L('')
  L('【5】10x10 交集矩阵（行∩列，行列相同 = 包自身去重词数）')
  const short = pkgs.map((p) => p.slice(0, 6))
  L(''.padEnd(14) + short.map((s) => s.padStart(7)).join(''))
  for (const a of pkgs) {
    L(a.padEnd(14) + pkgs.map((b) => String(matrix[a][b]).padStart(7)).join(''))
  }
  L('')
  L('【6】用户指定的关键交集核验')
  L(`  ielts∩kaoyan = ${matrix.ielts.kaoyan}`)
  L(`  ielts∩toefl  = ${matrix.ielts.toefl}`)
  L(`  kaoyan∩toefl = ${matrix.kaoyan.toefl}`)
  const s1 = new Set(data.get('ielts').words)
  const s2 = new Set(data.get('kaoyan').words)
  const s3 = new Set(data.get('toefl').words)
  const inter3 = [...s1].filter((w) => s2.has(w) && s3.has(w)).length
  const union3 = new Set([...s1, ...s2, ...s3]).size
  L(`  三者交集      = ${inter3}`)
  L(`  三包并集      = ${union3}`)
  L('')
  L('【7】ContentId 唯一映射判定')
  const uniq = [...wordToPkgs.values()].every((ps) => new Set(ps).size === ps.length)
  L(`  所有 cross-pkg 同名 word 在各自包 namespace 下 ContentId 均唯一: ${uniq}`)
  L('  ContentId 构造 = content:word:<namespace>:<word>，namespace 见【1】')
  L('')
}

/** 8. 写 out 文件（供报告引用） */
const outDir = join(ROOT, 'docs', 'audit-package', '_generated')
if (existsSync(outDir)) {
  writeFileSync(join(outDir, 'migration-audit.json'), JSON.stringify(report, null, 2))
  writeFileSync(
    join(outDir, 'migration-resolved-words.jsonl'),
    resolved
      .map((x) => JSON.stringify({ word: x.word, contentId: `content:word:${data.get(x.pkg).namespace}:${x.word}`, tier: 'resolved' }))
      .join('\n') + '\n',
  )
  if (ambiguous.length) {
    writeFileSync(
      join(outDir, 'migration-ambiguous-words.jsonl'),
      ambiguous
        .map((x) =>
          JSON.stringify({
            word: x.word,
            candidates: x.pkgs.map((p) => `content:word:${data.get(p).namespace}:${x.word}`),
            tier: 'ambiguous',
          }),
        )
        .join('\n') + '\n',
    )
  }
  if (!asJson) {
    console.log('[写盘] docs/audit-package/_generated/migration-audit.json')
    console.log(`[写盘] docs/audit-package/_generated/migration-resolved-words.jsonl (${resolved.length} 行)`)
    console.log(`[写盘] docs/audit-package/_generated/migration-ambiguous-words.jsonl (${ambiguous.length} 行)`)
  }
}
