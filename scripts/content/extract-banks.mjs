/* V4-P0 · 词库一次性提取：TS 数据源 → content/vocabulary/<id>/{words.json,manifest.json}
 *
 * 用 Vite SSR（ssrLoadModule）加载 src/data/wordBanks.ts 拿到运行时全量 WORD_BANKS，
 * 避免 TS 语法解析风险；写出后用「正则独立通道」校验词序（与 SSR 通道互为对照）。
 *
 * 运行：node scripts/content/extract-banks.mjs
 * 幂等：重复运行覆盖输出；校验失败 exit 1 不写文件（先写临时目录，全绿后落盘）。
 */
import { createServer } from 'vite'
import { createHash } from 'node:crypto'
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(process.cwd())
const OUT = path.join(ROOT, 'content', 'vocabulary')

/** 各库 manifest 元数据：source 溯源 + exam/tags（手写库 source 标记自有内容） */
const META = {
  'ai-core': { exam: null, tags: ['ai', 'llm', 'vocabulary'], source: { origin: 'curated in-repo (2026 AI 核心词库)', license: 'UNLICENSED' } },
  'cloud-native': { exam: null, tags: ['cloud', 'devops', 'vocabulary'], source: { origin: 'curated in-repo (云原生词库)', license: 'UNLICENSED' } },
  frontend: { exam: null, tags: ['frontend', 'vocabulary'], source: { origin: 'curated in-repo (前端词库)', license: 'UNLICENSED' } },
  cet4: { exam: 'CET-4', tags: ['cet', 'vocabulary'], source: { origin: 'ECDICT', license: 'MIT' } },
  cet6: { exam: 'CET-6', tags: ['cet', 'vocabulary'], source: { origin: 'ECDICT', license: 'MIT' } },
  ielts: { exam: 'IELTS', tags: ['ielts', 'vocabulary'], source: { origin: 'ECDICT', license: 'MIT' } },
  kaoyan: { exam: '考研', tags: ['kaoyan', 'vocabulary'], source: { origin: 'ECDICT', license: 'MIT' } },
  toefl: { exam: 'TOEFL', tags: ['toefl', 'vocabulary'], source: { origin: 'ECDICT', license: 'MIT' } },
  'ts-code': { exam: null, tags: ['code', 'typescript', 'vocabulary'], source: { origin: 'curated in-repo (TS 代码词库)', license: 'UNLICENSED' } },
  'go-code': { exam: null, tags: ['code', 'golang', 'vocabulary'], source: { origin: 'curated in-repo (Go 代码词库)', license: 'UNLICENSED' } },
}

/** 正则独立通道：源文件 → word 序列（校验用，与 SSR 通道互为对照） */
const REGEX_SOURCES = {
  ielts: ['src/data/ielts.ts'],
  kaoyan: ['src/data/kaoyan.ts'],
  toefl: ['src/data/toefl.ts'],
  cet4: null, // englishBanks.ts，CET4/CET6 同文件，拆分校验见下
  cet6: null,
  'ai-core': ['src/data/wordBanks.ts', 'src/data/code/ts.ts', 'src/data/code/go.ts'], // 拼接序校验见下
}

/** 按文件内出现顺序的拼接校验组：组内各库 JSON words 首尾相接 === 文件正则序列。
 *  - englishBanks.ts 含死代码数组 IELTS_TOEFL（61 词，全仓库零引用，2026-09-26 核实），
 *    前缀匹配通过即可，尾部多余条目计入 deadTail 报告（JSON 化后自然清除）。
 *  - code 词库（ts-code/go-code）词条内容本身是代码（含 word:/引号字面量），正则会
 *    跨字符串误捕 → 对这两组降级为「数量一致 + 首尾各 3 词采样一致」。 */
const REGEX_GROUPS = [
  { files: ['src/data/ielts.ts'], ids: ['ielts'] },
  { files: ['src/data/kaoyan.ts'], ids: ['kaoyan'] },
  { files: ['src/data/toefl.ts'], ids: ['toefl'] },
  { files: ['src/data/englishBanks.ts'], ids: ['cet4', 'cet6'], allowDeadTail: true },
  { files: ['src/data/wordBanks.ts'], ids: ['ai-core', 'cloud-native', 'frontend'] },
  { files: ['src/data/code/ts.ts'], ids: ['ts-code'], sampling: true, mode: 'line' },
  { files: ['src/data/code/go.ts'], ids: ['go-code'], sampling: true, mode: 'line' },
]

function sha256(s) {
  return 'sha256:' + createHash('sha256').update(s).digest('hex').slice(0, 16)
}

/** 正则独立通道：源文件 → word 序列（校验用，与 SSR 通道互为对照）。
 *  mode: literal=常规词库（值不含引号）；line=code 词库行级锚点（值含引号） */
async function regexWordsOf(file, mode = 'literal') {
  const text = await readFile(path.join(ROOT, file), 'utf8')
  const seq = []
  if (mode === 'line') {
    // code 词库：词条单行；值含单引号时 TS 源会改用双引号包裹 → 两种都要锚
    for (const m of text.matchAll(/^\s*\{ word: (?:'(.*)'|"(.*)"), translation: /gm)) seq.push(m[1] ?? m[2])
    return seq
  }
  for (const m of text.matchAll(/\bword:\s*['"]([^'"]+)['"]/g)) seq.push(m[1])
  return seq
}

async function main() {
  if (!existsSync(path.join(ROOT, 'package.json'))) throw new Error('请在项目根目录运行')
  const vite = await createServer({
    root: ROOT,
    server: { middlewareMode: true },
    logLevel: 'error',
    appType: 'custom',
  })
  try {
    const mod = await vite.ssrLoadModule('/src/data/wordBanks.ts')
    const banks = mod.WORD_BANKS
    if (!Array.isArray(banks) || banks.length !== 10) throw new Error(`SSR 加载异常：期望 10 库，实际 ${banks?.length}`)
    console.log(`[extract] SSR 加载 ${banks.length} 库：${banks.map((b) => b.id).join(', ')}`)

    const staged = []
    for (const bank of banks) {
      const meta = META[bank.id]
      if (!meta) throw new Error(`未知词库 id：${bank.id}（META 未登记）`)
      const words = bank.load ? await bank.load() : bank.words
      if (!Array.isArray(words) || words.length === 0) throw new Error(`${bank.id}：词条为空`)
      staged.push({ bank, words, meta })
    }

    // 内存 staging：构建 manifest；校验全绿后才落盘（Windows rename 会 EPERM，不走 tmp→rename）
    const manifests = []
    for (const { bank, words, meta } of staged) {
      const wordsJson = JSON.stringify(words) // 单行紧凑：与既有 chunk 体积风格一致
      const manifest = {
        id: `bank:${bank.id}`,
        type: 'vocabulary',
        version: '1.0.0',
        title: bank.name,
        titleEn: bank.nameEn ?? bank.name,
        description: bank.description,
        descriptionEn: bank.descriptionEn ?? bank.description,
        language: 'en',
        exam: meta.exam,
        tags: meta.tags,
        icon: bank.icon,
        features: {
          phonetic: words.some((w) => w.phonetic),
          definition: words.some((w) => w.definition),
        },
        stats: {
          items: words.length,
          phonetic: words.filter((w) => w.phonetic).length,
          definition: words.filter((w) => w.definition).length,
        },
        source: {
          ...meta.source,
          importedAt: new Date().toISOString().slice(0, 10),
          checksum: sha256(wordsJson),
        },
        offline: { supported: true, policy: bank.load ? 'lazy' : 'inline' },
      }
      manifests.push(manifest)
      console.log(`[extract] ${bank.id}: ${words.length} 词`)
    }

    // ---- 独立正则通道校验（V4.1 要求：SSR 与正则双通道对照）----
    let fails = 0
    for (const group of REGEX_GROUPS) {
      const expected = []
      for (const f of group.files) expected.push(...(await regexWordsOf(f, group.mode)))
      const actual = []
      for (const id of group.ids) {
        const s = staged.find((x) => x.bank.id === id)
        actual.push(...s.words.map((w) => w.word))
      }
      if (group.sampling) {
        // 代码词库：正则通道被词条内容污染，只校验数量 + 首尾采样
        const head = actual.slice(0, 3).every((w, i) => w === expected[i])
        const tail = actual.slice(-3).every((w, i) => w === expected.slice(-3)[i])
        if (expected.length === actual.length && head && tail) {
          console.log(`[verify] ✓ ${group.ids.join('+')}: ${actual.length} 词（采样：首/尾 3 词一致）`)
          continue
        }
        fails++
        console.error(`[verify] ✗ ${group.ids.join('+')}: 采样校验失败（正则 ${expected.length} vs JSON ${actual.length}）`)
        continue
      }
      const prefix = group.allowDeadTail ? expected.length >= actual.length : expected.length === actual.length
      const seqOk = prefix && actual.every((w, i) => w === expected[i])
      if (seqOk) {
        const dead = group.allowDeadTail ? expected.length - actual.length : 0
        console.log(`[verify] ✓ ${group.ids.join('+')}: ${actual.length} 词词序一致${dead ? `（源文件尾部 ${dead} 死条目，未导出，JSON 化清除）` : ''}`)
      } else {
        fails++
        const i = prefix ? actual.findIndex((w, j) => w !== expected[j]) : -1
        console.error(`[verify] ✗ ${group.ids.join('+')}: 正则通道 ${expected.length} 词 vs JSON ${actual.length} 词${i >= 0 ? `，首个差异 @${i}: "${expected[i]}" vs "${actual[i]}"` : ''}`)
      }
    }
    if (fails > 0) throw new Error(`正则通道校验失败 ${fails} 组，不落盘`)

    // ---- 校验全绿 → 直接写最终目录（先清旧输出）----
    await rm(OUT, { recursive: true, force: true })
    await mkdir(OUT, { recursive: true })
    for (const { bank, words, meta } of staged) {
      const dir = path.join(OUT, bank.id)
      await mkdir(dir, { recursive: true })
      const wordsJson = JSON.stringify(words)
      await writeFile(path.join(dir, 'words.json'), wordsJson, 'utf8')
      // manifest 与 staged 一致（上面已构建），从 manifests 取
      const manifest = manifests.find((m) => m.id === `bank:${bank.id}`)
      await writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8')
    }
    console.log(`[extract] 完成：${manifests.length} 包落盘 ${path.relative(ROOT, OUT)}`)
  } finally {
    await vite.close()
  }
}

main().catch((e) => {
  console.error('[extract] FAILED:', e.message)
  process.exit(1)
})
