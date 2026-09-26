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
 * 10. schemaVersion 存在且 === SCHEMA_VERSION（结构版本，由 content:build 写入）
 * 11. contentVersion 存在且为正整数（对外学习契约版本，同一 checksum 复用同一 version）
 * 12. Duplicate Detection（分级，见代码内注释）：
 *     (a) 包内 duplicate localId —— 第 4 项已覆盖，此处只回显，不重复报错
 *     (b) 包内 duplicate normalized word（大小写/空白差异撞车）
 *     (c) 跨包 duplicate ContentId —— 全库兜底回归检测
 *     (d) duplicate source —— 同一 origin 在 sources[] 出现两次
 *     (e) invalid / orphan relation —— 仅当 relations.json 存在时校验，否则打印跳过
 *     (f) broken asset —— 仅当 manifest.assets 存在时校验，否则打印跳过
 *     (g) orphan learning record —— 运行时检查，由 Learning 层负责，脚本不校验
 * 13. packageId 存在且 === 目录名（一词三表：manifest.packageId / 目录 / ContentId 第 4 段）
 * 14. namespace 存在，且与从 manifest.id 解析出的第 3 段严格相等（两者必须同源；
 *     「每包唯一」由第 9 项兜底）
 * 15. contentChecksum === sha256Canonical(words)（**必须走 canonical**，不得用文件原文
 *     或 JSON.stringify 直算，否则文件排版一变就误判漂移）
 * 16. contentRevision / contentVersion 均为正整数；contentHistory 中存在
 *     checksum === contentChecksum 的条目，且该条目 version === contentVersion、
 *     revision <= contentRevision（回滚场景：version 回到历史值，revision 只增不减）
 * 17. build 存在且 toolVersion 非空、builtAt 为合法时间、sourceChecksum === contentChecksum
 *
 * 用法：node scripts/content/validate.mjs   → 全绿 exit 0，任一 FAIL exit 1
 */
import { readdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { sha256Canonical } from './canonical.mjs'

const ROOT = path.resolve(process.cwd())
const VOCAB_DIR = path.join(ROOT, 'content', 'vocabulary')

const REQUIRED_FIELDS = ['id', 'type', 'version', 'title', 'description', 'language', 'tags', 'icon', 'features', 'stats', 'sources', 'offline']

/** manifest 结构版本，须与 content:build 的 SCHEMA_VERSION 一致（结构破坏性变更时才递增） */
const SCHEMA_VERSION = 4

/** 重复检测 key：NFC + lowercase + 空白折叠（含 \u00A0）。
 *  与第 4 项（精确词形）互补：大小写 / 空格差异在这里会撞车。 */
const WS_RE = /[\s\u00A0]+/g
const normKey = (raw) => String(raw ?? '').normalize('NFC').toLowerCase().replace(WS_RE, ' ').trim()

/** 端点 ContentId 解析：content:<type>:<namespace>:<localId> */
const CONTENT_ID_RE = /^content:([a-z]+):([a-z0-9-]+):(.+)$/

let fails = 0
const fail = (msg) => { fails++; console.error(`  ✗ ${msg}`) }
const ok = (msg) => console.log(`  ✓ ${msg}`)

async function main() {
  if (!existsSync(VOCAB_DIR)) { console.error('content/vocabulary 不存在'); process.exit(1) }
  const ids = (await readdir(VOCAB_DIR, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name)
  console.log(`[content:validate] ${ids.length} 个 vocabulary 包`)

  // —— 预扫描：第 12 项 (c) 跨包 ContentId、(e) relation 端点存在性都需要「全库视角」，
  //     单包循环内部看不到其它包，故先静默建一次索引（不可解析的包由主循环报错）。——
  const registry = new Map() // 包目录 id → { ns, contentId, normWords:Set }
  for (const id of ids) {
    try {
      const mf = JSON.parse(await readFile(path.join(VOCAB_DIR, id, 'manifest.json'), 'utf8'))
      const ws = JSON.parse(await readFile(path.join(VOCAB_DIR, id, 'words.json'), 'utf8'))
      const ns = /^content:vocabulary:([a-z0-9-]+):/.exec(mf.id ?? '')?.[1] ?? '?'
      registry.set(id, { ns, contentId: mf.id, normWords: new Set(ws.map((w) => normKey(w?.word))) })
    } catch { /* 主循环会 FAIL，这里跳过 */ }
  }

  const seenIds = new Map()
  const seenNs = new Map()
  const globalIds = new Map() // `${namespace}|${normalized word}` → Set<包 id>（12c 跨包兜底）
  let totalWords = 0
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

    // 内容指纹（第 6/15 项共用）：必须走 canonical —— 只取决于数据语义，与文件排版无关
    const canonicalSum = sha256Canonical(words)

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

    // 6. checksum（第 6 项 = 来源原始数据指纹，走 canonical 序列化而非文件原文）
    const sources = manifest.sources ?? []
    if (sources.length === 0) fail('sources 为空（V4.1 起为数组，至少一条来源）')
    else if (sources.every((s) => s.checksum === canonicalSum)) ok('checksum 一致（canonical SHA-256）')
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

    // 13. packageId —— 必须与目录名同名（UI / 持久化 / 目录三处指的是同一个包）
    if (manifest.packageId === id) ok(`packageId=${manifest.packageId}（与目录名一致）`)
    else fail(`packageId 应等于目录名 "${id}"，实际 ${manifest.packageId ?? '缺失'} → 运行 npm run content:build`)

    // 14. namespace —— 必须与 manifest.id 第 3 段同源（build 是从最终 ContentId 反解写入的）
    if (typeof manifest.namespace !== 'string' || !manifest.namespace) {
      fail(`namespace 缺失或非法（${manifest.namespace ?? 'undefined'}）→ 运行 npm run content:build`)
    } else if (!ns) {
      // 第 9 项已判 FAIL，此处不重复计数
    } else if (manifest.namespace !== ns) {
      fail(`namespace="${manifest.namespace}" ≠ id 解析出的 "${ns}"：两者必须同源 → 运行 npm run content:build`)
    } else ok(`namespace 与 id 同源（${manifest.namespace}）`)

    totalWords += words.length

    // 10. schemaVersion —— 结构版本，由 content:build 写入，改结构才递增
    if (manifest.schemaVersion === SCHEMA_VERSION) ok(`schemaVersion=${manifest.schemaVersion}`)
    else fail(`schemaVersion 应为 ${SCHEMA_VERSION}，实际 ${manifest.schemaVersion ?? '缺失'} → 运行 npm run content:build`)

    // 11. contentVersion —— 内容版本，正整数，由 content:build 按 checksum 变化自增
    if (Number.isInteger(manifest.contentVersion) && manifest.contentVersion > 0) ok(`contentVersion=${manifest.contentVersion}`)
    else fail(`contentVersion 必须为正整数，实际 ${manifest.contentVersion ?? '缺失'} → 运行 npm run content:build`)

    // 15. contentChecksum —— 入库内容的 canonical 指纹（与文件排版无关）
    if (manifest.contentChecksum === canonicalSum) ok(`contentChecksum 一致（${canonicalSum.slice(7, 15)}…）`)
    else fail(`contentChecksum 漂移：manifest=${manifest.contentChecksum ?? '缺失'} ≠ 实际 ${canonicalSum} → 运行 npm run content:build`)

    // 16. 版本三元组自洽：revision / version 正整数，且能在 contentHistory 里找到
    //     checksum 命中的那条记录（取最近一条，与 build 的复用口径一致）。
    //     回滚场景：version 回到历史值 ⇒ 允许 revision > 命中条目的 revision（审计号只增不减）。
    const rev = manifest.contentRevision
    const ver = manifest.contentVersion
    const revOk = Number.isInteger(rev) && rev > 0
    const verOk = Number.isInteger(ver) && ver > 0
    if (!revOk) fail(`contentRevision 必须为正整数，实际 ${rev ?? '缺失'} → 运行 npm run content:build`)
    if (!verOk) fail(`contentVersion 必须为正整数，实际 ${ver ?? '缺失'} → 运行 npm run content:build`)
    const history = Array.isArray(manifest.contentHistory) ? manifest.contentHistory : []
    if (history.length === 0) {
      fail('contentHistory 缺失或为空 → 运行 npm run content:build')
    } else {
      const hitEntry = [...history].reverse().find((e) => e?.checksum === manifest.contentChecksum)
      if (!hitEntry) fail(`contentHistory 中不存在 checksum === contentChecksum 的条目 → 运行 npm run content:build`)
      else if (hitEntry.version !== ver) fail(`contentHistory 命中条目 version=${hitEntry.version} ≠ contentVersion=${ver} → 运行 npm run content:build`)
      else if (!(Number.isInteger(hitEntry.revision) && hitEntry.revision > 0 && hitEntry.revision <= rev)) fail(`contentHistory 命中条目 revision=${hitEntry.revision} 应 ≤ contentRevision=${rev}`)
      else if (revOk && verOk) ok(`版本三元组自洽（revision=${rev} version=${ver} history=${history.length} 条，命中 revision=${hitEntry.revision}）`)
    }

    // 17. build 溯源：谁、什么时候、用哪份源数据产出了这份 manifest
    const b = manifest.build
    if (!b || typeof b !== 'object') fail(`build 字段缺失（应为 {toolVersion,builtAt,sourceChecksum}）→ 运行 npm run content:build`)
    else {
      let buildOk = true
      if (typeof b.toolVersion !== 'string' || !b.toolVersion) { fail('build.toolVersion 缺失或为空'); buildOk = false }
      if (typeof b.builtAt !== 'string' || !b.builtAt || Number.isNaN(Date.parse(b.builtAt))) { fail(`build.builtAt 不是合法时间：${b.builtAt ?? '缺失'}`); buildOk = false }
      if (b.sourceChecksum !== manifest.contentChecksum) { fail(`build.sourceChecksum(${b.sourceChecksum ?? '缺失'}) ≠ contentChecksum(${manifest.contentChecksum ?? '缺失'})`); buildOk = false }
      if (buildOk) ok(`build 溯源完整（${b.toolVersion} @ ${b.builtAt}）`)
    }

    // 12. Duplicate Detection —— 按「可判定性」分级：能判的判死，判不了的如实说跳过，
    //     绝不用「假装通过」凑绿。
    //   (a) 包内 duplicate localId（精确词形）：第 4 项已覆盖并报错，此处只回显，避免重复计数
    //   (g) orphan learning record：学习记录挂在 ContentId 上、随用户练习产生，
    //       属运行时一致性问题，由 Learning 层（src/core/review/*）负责，脚本不校验。
    if (dup.length === 0) ok('duplicate localId：无（第 4 项已判定）')

    //   (b) 包内 duplicate normalized word：NFC+lowercase+空白折叠后同 key 即撞车
    const normSeen = new Map()
    const normDup = []
    words.forEach((w, i) => {
      const k = normKey(w?.word)
      if (!k) return
      if (normSeen.has(k)) normDup.push(`"${w?.word}"（#${normSeen.get(k)} ↔ #${i}）`)
      else normSeen.set(k, i)
    })
    if (normDup.length === 0) ok('无 duplicate normalized word（大小写/空白差异已并入 key）')
    else fail(`duplicate normalized word ${normDup.length} 个：${normDup.slice(0, 5).join('；')}`)

    //   (c) 跨包 duplicate ContentId：key = namespace + normalized localId。
    //       只统计「同一个 key 出现在 ≥2 个包」，包内重复由 12(b) 负责，不在这里重复计数。
    //       namespace 每包唯一（第 9 项）后理论上不可能撞车，这里作兜底回归检测，
    //       结果在所有包循环结束后统一判定。
    for (const w of words) {
      const k = normKey(w?.word)
      if (!k) continue
      const gk = `${ns ?? '?'}|${k}`
      if (!globalIds.has(gk)) globalIds.set(gk, new Set())
      globalIds.get(gk).add(id)
    }

    //   (d) duplicate source：同一 origin 在 sources[] 里出现两次
    const origins = sources.map((s) => s?.origin)
    const dupOrigin = [...new Set(origins.filter((o, i) => origins.indexOf(o) !== i))]
    if (dupOrigin.length === 0) ok(`无 duplicate source（${origins.length} 条来源）`)
    else fail(`duplicate source origin：${dupOrigin.join(', ')}`)

    //   (e) invalid / orphan relation —— 只有 relations.json 存在才校验
    const relPath = path.join(dir, 'relations.json')
    if (!existsSync(relPath)) {
      console.log('  · 无 relations.json，跳过 relation 校验（V4.1-P0 尚不产出该文件）')
    } else {
      let raw
      try { raw = JSON.parse(await readFile(relPath, 'utf8')) } catch (e) { fail(`relations.json 不可解析：${e.message}`) }
      if (raw !== undefined) {
        const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.relations) ? raw.relations : null)
        if (!list) fail('relations.json 结构无法识别（期望数组或 { relations: [...] }）')
        else {
          const problems = []
          list.forEach((r, i) => {
            const ends = Array.isArray(r?.endpoints) ? r.endpoints : [r?.from ?? r?.source, r?.to ?? r?.target]
            for (const e of ends) {
              const m2 = typeof e === 'string' ? CONTENT_ID_RE.exec(e) : null
              if (!m2) { problems.push(`#${i} 端点非法：${JSON.stringify(e)}`); continue }
              const [, type, ns2, local] = m2
              const reachable = [...registry.values()].some(
                (p) => p.contentId === e || (type === 'word' && p.ns === ns2 && p.normWords.has(normKey(local))),
              )
              if (!reachable) problems.push(`#${i} 孤儿端点：${e}`)
            }
          })
          if (problems.length === 0) ok(`relations.json ${list.length} 条：端点合法且可达`)
          else fail(`relation 校验失败 ${problems.length} 处：${problems.slice(0, 3).join('；')}`)
        }
      }
    }

    //   (f) broken asset —— 只有 manifest 存在 assets 字段才校验
    if (manifest.assets === undefined) {
      console.log('  · manifest 无 assets 字段，跳过 asset 校验')
    } else if (!Array.isArray(manifest.assets)) {
      fail('manifest.assets 必须为数组')
    } else {
      const broken = manifest.assets.filter((a) => !a?.url || !/^(https?:\/\/|\/)/.test(a.url))
      if (broken.length === 0) ok(`assets ${manifest.assets.length} 项 url 合法`)
      else fail(`broken asset ${broken.length} 项：${broken.slice(0, 3).map((a) => a?.url).join(', ')}`)
    }
  }

  // 12(c) 跨包结论（全库扫描后统一判定）
  const crossDups = [...globalIds.entries()].filter(([, packs]) => packs.size > 1)
    .map(([k, packs]) => `${k.split('|')[1]}（${[...packs].join(' ↔ ')}）`)
  if (crossDups.length > 0) fail(`跨包 duplicate ContentId ${crossDups.length} 处：${crossDups.slice(0, 5).join('；')}`)
  else ok(`跨包无 duplicate ContentId（全库 ${totalWords} 词扫描，namespace 唯一 ⇒ 兜底回归）`)

  if (fails > 0) { console.error(`\n[content:validate] FAIL：${fails} 项`); process.exit(1) }
  console.log(`\n[content:validate] PASS：${ids.length} 包全部通过`)
}

main().catch((e) => { console.error('[content:validate] 异常：', e.message); process.exit(1) })
