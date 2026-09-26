/* V4-P0 · content:validate —— 内容层门禁（CI 与 build 前置）。
 *
 * 检查项（V4.1 文档十三章的可实施版）：
 *  1. manifest.json / words.json 存在且 JSON 合法
 *  2. manifest 必填字段完整（id/type/version/title/source.license/offline.policy...）
 *  3. ContentId 规范：vocabulary 包 id 必须为 `bank:<目录名>`
 *  4. 包内 duplicate word 检测
 *  5. manifest.stats.items 与 words 实际词数一致（防清单与数据漂移）
 *  6. source.checksum 与 words.json 实际 sha256 一致
 *  7. License 门禁：license 必填；非 UNLICENSED 来源必须是已知开源协议（防不合规内容入库）
 *  8. 跨包 manifest.id 唯一
 *
 * 用法：node scripts/content/validate.mjs   → 全绿 exit 0，任一 FAIL exit 1
 */
import { readdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'

const ROOT = path.resolve(process.cwd())
const VOCAB_DIR = path.join(ROOT, 'content', 'vocabulary')

/** 外部来源允许的开源协议；仓库自维护内容用 UNLICENSED（须 origin 标注 curated） */
const OSS_LICENSES = new Set(['MIT', 'MIT-0', 'CC0-1.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'OFL-1.1', 'Unlicense'])
const REQUIRED_FIELDS = ['id', 'type', 'version', 'title', 'description', 'language', 'tags', 'icon', 'features', 'stats', 'source', 'offline']

let fails = 0
const fail = (msg) => { fails++; console.error(`  ✗ ${msg}`) }
const ok = (msg) => console.log(`  ✓ ${msg}`)

async function main() {
  if (!existsSync(VOCAB_DIR)) { console.error(`content/vocabulary 不存在`); process.exit(1) }
  const ids = (await readdir(VOCAB_DIR, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name)
  console.log(`[content:validate] ${ids.length} 个 vocabulary 包`)

  const seenIds = new Map()
  for (const id of ids) {
    const dir = path.join(VOCAB_DIR, id)
    console.log(`▸ ${id}`)
    let manifest
    try {
      manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'))
    } catch (e) { fail(`manifest.json 不可解析：${e.message}`); continue }
    let words
    try {
      words = JSON.parse(await readFile(path.join(dir, 'words.json'), 'utf8'))
    } catch (e) { fail(`words.json 不可解析：${e.message}`); continue }

    // 2. 必填字段
    const missing = REQUIRED_FIELDS.filter((f) => manifest[f] === undefined)
    if (missing.length === 0) ok(`必填字段完整`)
    else fail(`manifest 缺字段：${missing.join(', ')}`)

    // 3. ContentId 规范
    if (manifest.id === `bank:${id}`) ok(`ContentId 规范（${manifest.id}）`)
    else fail(`id 应为 "bank:${id}"，实际 "${manifest.id}"`)

    // 4. duplicate word
    const seen = new Set()
    const dup = words.filter((w) => { const k = w?.word; if (seen.has(k)) return true; seen.add(k); return false })
    if (dup.length === 0) ok(`无重复词条（${words.length} 词）`)
    else fail(`包内重复词条 ${dup.length} 个：${dup.slice(0, 5).map((w) => w.word).join(', ')}...`)

    // 5. stats 一致
    if (manifest.stats?.items === words.length) ok(`stats.items 与实际一致（${words.length}）`)
    else fail(`stats.items=${manifest.stats?.items} ≠ 实际 ${words.length}`)

    // 6. checksum
    const actual = 'sha256:' + createHash('sha256').update(JSON.stringify(words)).digest('hex').slice(0, 16)
    if (manifest.source?.checksum === actual) ok(`checksum 一致`)
    else fail(`checksum 漂移：manifest=${manifest.source?.checksum} 实际=${actual}（内容被改动未更新 manifest？）`)

    // 7. License 门禁
    const license = manifest.source?.license
    if (!license) fail(`source.license 缺失（外部来源内容无协议不得入库）`)
    else if (license === 'UNLICENSED') {
      if (String(manifest.source?.origin).includes('curated')) ok(`license=UNLICENSED（仓库自维护内容）`)
      else fail(`license=UNLICENSED 但 origin 未标注 curated：${manifest.source?.origin}`)
    } else if (OSS_LICENSES.has(license)) ok(`license=${license}（已知开源协议）`)
    else fail(`license="${license}" 不在已知开源协议清单：${[...OSS_LICENSES].join('/')}`)

    // 8. 跨包唯一
    if (seenIds.has(manifest.id)) fail(`manifest.id 与包 ${seenIds.get(manifest.id)} 重复`)
    else seenIds.set(manifest.id, id)
  }

  if (fails > 0) { console.error(`\n[content:validate] FAIL：${fails} 项`); process.exit(1) }
  console.log(`\n[content:validate] PASS：${ids.length} 包全部通过`)
}

main().catch((e) => { console.error('[content:validate] 异常：', e.message); process.exit(1) })
