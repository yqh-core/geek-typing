/* V4.1 · content:validate —— 内容层门禁（CI 与 build 前置）。
 *
 * 检查项：
 *  1. manifest.json / words.json 存在且 JSON 合法
 *  2. manifest 必填字段完整（id/type/version/title/sources/offline...）
 *  3. ContentId 4 段式规范：content:vocabulary:<namespace>:<目录名>
 *  4. 包内 duplicate word 检测（**跨包同词合法**：IELTS/CET/TOEFL 各有 abandon 是正常
 *     数据关系，是本平台刻意支持的能力，任何「跨包词唯一」规则都是错误的——见下方注释）
 *  5. stats.items 与 words 实际词数一致（漂移时跑 npm run content:build 自动同步）
 *  6. sources[].checksum 与 words.json 实际完整 SHA-256 一致
 *  7. License 门禁：每条 source 必须有结构化 license；外部来源须有 SPDX 标识
 *  8. 包 id 全局唯一（同一 ContentId 不得被两个包占用）
 *  9. namespace 每包唯一（词级 ContentId 全局唯一的充要条件，见代码内注释）
 *
 * 用法：node scripts/content/validate.mjs   → 全绿 exit 0，任一 FAIL exit 1
 */
import { readdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'

const ROOT = path.resolve(process.cwd())
const VOCAB_DIR = path.join(ROOT, 'content', 'vocabulary')

const REQUIRED_FIELDS = ['id', 'type', 'version', 'title', 'description', 'language', 'tags', 'icon', 'features', 'stats', 'sources', 'offline']

let fails = 0
const fail = (msg) => { fails++; console.error(`  ✗ ${msg}`) }
const ok = (msg) => console.log(`  ✓ ${msg}`)

async function main() {
  if (!existsSync(VOCAB_DIR)) { console.error('content/vocabulary 不存在'); process.exit(1) }
  const ids = (await readdir(VOCAB_DIR, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name)
  console.log(`[content:validate] ${ids.length} 个 vocabulary 包`)

  const seenIds = new Map()
  const seenNs = new Map()
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
    if (missing.length === 0) ok('必填字段完整')
    else fail(`manifest 缺字段：${missing.join(', ')}`)

    // 3. ContentId 4 段式（namespace 消歧：ecdict / curated / 未来导入源）
    const idOk = /^content:vocabulary:[a-z0-9-]+:.+$/.test(manifest.id ?? '') && manifest.id.endsWith(`:${id}`)
    if (idOk) ok(`ContentId 规范（${manifest.id}）`)
    else fail(`id 应为 content:vocabulary:<namespace>:${id}，实际 "${manifest.id}"`)

    // 4. 包内重复词（跨包同词刻意允许，不做任何跨包唯一性约束）
    const seen = new Set()
    const dup = words.filter((w) => { const k = w?.word; if (seen.has(k)) return true; seen.add(k); return false })
    if (dup.length === 0) ok(`无包内重复词条（${words.length} 词）`)
    else fail(`包内重复词条 ${dup.length} 个：${dup.slice(0, 5).map((w) => w.word).join(', ')}...`)

    // 5. stats 一致（漂移 → content:build 自动同步）
    if (manifest.stats?.items === words.length) ok(`stats.items 与实际一致（${words.length}）`)
    else fail(`stats.items=${manifest.stats?.items} ≠ 实际 ${words.length} → 运行 npm run content:build 同步`)

    // 6. checksum（完整 SHA-256）
    const actual = 'sha256:' + createHash('sha256').update(JSON.stringify(words)).digest('hex')
    const sources = manifest.sources ?? []
    if (sources.length === 0) fail('sources 为空（V4.1 起为数组，至少一条来源）')
    else if (sources.every((s) => s.checksum === actual)) ok('checksum 一致（完整 SHA-256）')
    else fail('checksum 漂移：sources[].checksum 与 words.json 不符 → 运行 npm run content:build')

    // 7. License 门禁（结构化 + 外部来源须有 SPDX）
    let licenseOk = true
    for (const s of sources) {
      const lic = s.license
      if (!lic || typeof lic !== 'object') { fail(`source(${s.origin}) license 非结构化对象（需 {spdx,name,attributionRequired}）`); licenseOk = false; continue }
      if (!lic.name) { fail(`source(${s.origin}) license.name 缺失`); licenseOk = false }
      if (typeof lic.attributionRequired !== 'boolean') { fail(`source(${s.origin}) license.attributionRequired 必须为布尔`); licenseOk = false }
      // 自维护内容无 SPDX 属正常；外部来源（含 ECDICT/GitHub 等）必须有 SPDX
      if (!lic.spdx && !String(s.origin).includes('curated')) {
        fail(`外部来源 ${s.origin} 缺 license.spdx（未知协议内容不得入库）`)
        licenseOk = false
      }
    }
    if (licenseOk && sources.length > 0) ok(`license 结构化（${sources.map((s) => s.license?.spdx ?? 'self').join(', ')}）`)

    // 8. 包 id 唯一（注意：这里校验的是包 ContentId，不是词——跨包同词合法）
    if (seenIds.has(manifest.id)) fail(`包 ContentId 与 ${seenIds.get(manifest.id)} 重复`)
    else seenIds.set(manifest.id, id)

    // 9. namespace 每包唯一 —— 词级 ContentId 全局唯一的**充要条件**。
    //    词级 id = content:word:<namespace>:<词形>，localId 只有词形，不含包 id；
    //    因此只要两个包共用 namespace，同名词的 ContentId 就必然撞车，无法作为学习记录主键。
    //    （曾踩坑：cet4/toefl/ielts 共用 namespace `ecdict` → abandon 三包同 id。
    //     由 V4.1 契约测试 tests/content-query.mjs 实测捕获，规则固化为 `${来源族}-${包 id}`。）
    const ns = /^content:vocabulary:([a-z0-9-]+):/.exec(manifest.id ?? '')?.[1]
    if (!ns) fail('无法从 id 解析 namespace')
    else if (seenNs.has(ns)) fail(`namespace "${ns}" 与包 ${seenNs.get(ns)} 重复：词级 ContentId 将撞车，namespace 必须每包唯一`)
    else { seenNs.set(ns, id); ok(`namespace 唯一（${ns}）`) }
  }

  if (fails > 0) { console.error(`\n[content:validate] FAIL：${fails} 项`); process.exit(1) }
  console.log(`\n[content:validate] PASS：${ids.length} 包全部通过`)
}

main().catch((e) => { console.error('[content:validate] 异常：', e.message); process.exit(1) })
