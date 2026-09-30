/* V4.1 · content:ingest —— 内容接入八段流水线（P1.7-Wave4 B-3）。
 *
 * 职责：把 content/ 下的包接入「可审计数据产品」流程，并产出 License Policy Matrix
 * 表（版本化 license-policy-1，禁止手填）。八段：
 *   1. DISCOVER   发现 content/<type>/<id>/ 全部包
 *   2. PARSE      解析 manifest + 载荷
 *   3. CONTRACT   必填字段 + license 结构化 + 来源可追溯
 *   4. CHECKSUM   载荷 canonical 指纹 vs manifest.contentChecksum（漂移检测）
 *   5. PROVENANCE 解析每条 source 的 provider / repository
 *   6. LICENSE    应用 License Policy Matrix（decideLicense）→ 包级决策
 *   7. REFERENCE  坏引用检测（载荷缺失 / relation 孤儿端点 / asset URL 非法）
 *   8. EMIT       落盘 content/license-policy-1.json + 打印报告；rejected ⇒ exit 1
 *
 * 与 validate.mjs 的关系：validate 是「全量门禁」；本流水线聚焦于「接入 + 溯源 + 许可
 * 决策 + 引用完整性」，产出机器可读的 License Policy Matrix 供 gate-content-contract 复核。
 * 两处 SPDX→决策口径共用 scripts/content/license-policy.mjs，禁止各写一份。
 *
 * 用法：node scripts/content/ingest.mjs
 */
import { writeFile, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import {
  LICENSE_POLICY_VERSION, PROVIDER_ORIGINAL, CONTENT_TYPES, CONTENT_ID_RE,
  loadPackages, decidePackage, decideLicense, checksumPayload,
} from './license-policy.mjs'

const ROOT = path.resolve(process.cwd())
const OUT = path.join(ROOT, 'content', `${LICENSE_POLICY_VERSION}.json`)

const normKey = (raw) => String(raw ?? '').normalize('NFC').toLowerCase().replace(/[\s\u00A0]+/g, ' ').trim()
const stage = (n, name) => console.log(`\n[ingest] 阶段 ${n}/8 · ${name}`)
let failures = 0
const fail = (msg) => { failures++; console.error(`  ✗ ${msg}`) }
const ok = (msg) => console.log(`  ✓ ${msg}`)

async function main() {
  /* —— 1. DISCOVER —— */
  stage(1, 'DISCOVER')
  const pkgs = await loadPackages()
  if (pkgs.length === 0) { console.error('未发现任何内容包（content/ 为空？）'); process.exit(1) }
  const byType = new Map()
  for (const p of pkgs) byType.set(p.type, (byType.get(p.type) ?? 0) + 1)
  ok(`${pkgs.length} 个包：${[...byType.entries()].map(([t, n]) => `${t}×${n}`).join(' ')}`)

  /* —— 2. PARSE —— */
  stage(2, 'PARSE')
  for (const p of pkgs) {
    if (!p.manifest) { fail(`${p.type}/${p.id} manifest.json 不可解析`); continue }
    if (p.payloadExists && !Array.isArray(p.payload)) fail(`${p.type}/${p.id} ${p.payloadName} 非数组`)
  }
  ok(`manifest 全部解析（载荷：${pkgs.filter((p) => p.payloadExists).length}/${pkgs.length} 有）`)

  /* —— 3. CONTRACT —— */
  stage(3, 'CONTRACT')
  const REQUIRED = ['id', 'type', 'version', 'title', 'sources', 'offline', 'packageId', 'namespace', 'contentChecksum']
  for (const p of pkgs) {
    const m = p.manifest
    const miss = REQUIRED.filter((f) => m?.[f] === undefined)
    if (miss.length) { fail(`${p.type}/${p.id} 缺字段：${miss.join(', ')}`); continue }
    const sources = m.sources ?? []
    if (!Array.isArray(sources) || sources.length === 0) { fail(`${p.type}/${p.id} sources 为空/非数组`); continue }
    let licOk = true
    for (const s of sources) {
      const lic = s?.license
      if (!lic || typeof lic !== 'object') { fail(`${p.type}/${p.id} source(${s?.origin}) license 非结构化`); licOk = false; continue }
      if (!lic.name) { fail(`${p.type}/${p.id} source(${s?.origin}) license.name 缺失`); licOk = false }
      const isSelf = s.provider === PROVIDER_ORIGINAL
      if (!isSelf && !lic.spdx) { fail(`${p.type}/${p.id} 外部来源 ${s.origin} 缺 license.spdx`); licOk = false }
    }
    if (licOk) ok(`${p.type}/${p.id} 契约字段完整 + license 结构化`)
  }

  /* —— 4. CHECKSUM —— */
  stage(4, 'CHECKSUM')
  for (const p of pkgs) {
    const m = p.manifest
    if (!p.payloadExists) { console.log(`  · ${p.type}/${p.id} 无载荷，跳过 checksum 比对`); continue }
    const sum = checksumPayload(p.payload)
    if (sum === m?.contentChecksum) ok(`${p.type}/${p.id} contentChecksum 一致`)
    else fail(`${p.type}/${p.id} contentChecksum 漂移：manifest=${m?.contentChecksum ?? '缺失'} ≠ 实际 ${sum}`)
  }

  /* —— 5. PROVENANCE —— */
  stage(5, 'PROVENANCE')
  for (const p of pkgs) {
    const sources = p.manifest?.sources ?? []
    const prov = sources.map((s) => ({ origin: s.origin, provider: s.provider ?? null, repository: s.repository ?? null }))
    const selfCount = prov.filter((x) => x.provider === PROVIDER_ORIGINAL).length
    const extCount = prov.length - selfCount
    ok(`${p.type}/${p.id} 溯源：${selfCount} 自有 / ${extCount} 外部`)
  }

  /* —— 6. LICENSE（License Policy Matrix） —— */
  stage(6, 'LICENSE-MATRIX')
  const decisions = new Map()
  for (const p of pkgs) {
    const d = decidePackage(p.manifest?.sources ?? [])
    decisions.set(p.id, d)
    if (d.decision === 'rejected') fail(`${p.type}/${p.id} 许可决策 rejected：${d.reason}`)
    else if (d.decision === 'review_required') console.log(`  ⚠ ${p.type}/${p.id} 许可决策 review_required：${d.reason}`)
    else ok(`${p.type}/${p.id} 许可决策 ${d.decision}`)
  }

  /* —— 7. REFERENCE（坏引用检测） —— */
  stage(7, 'REFERENCE')
  // 可达性索引：全部包 ContentId + vocabulary 词级 key
  const pkgIds = new Set(pkgs.map((p) => p.manifest?.id).filter(Boolean))
  const vocabWords = new Map() // namespace → Set<normKey>
  for (const p of pkgs) {
    if (p.type === 'vocabulary' && Array.isArray(p.payload)) {
      const ns = CONTENT_ID_RE.exec(p.manifest?.id ?? '')?.[2]
      if (ns) {
        if (!vocabWords.has(ns)) vocabWords.set(ns, new Set())
        for (const w of p.payload) vocabWords.get(ns).add(normKey(w?.word))
      }
    }
  }
  const reachable = (cid) => {
    if (pkgIds.has(cid)) return true
    const m = CONTENT_ID_RE.exec(cid)
    if (!m) return false
    const [, type, ns, local] = m
    if (type === 'word') return vocabWords.get(ns)?.has(normKey(local)) ?? false
    return false
  }
  for (const p of pkgs) {
    const m = p.manifest
    // 7a. 载荷引用：stats.items>0 但无载荷文件 ⇒ 坏引用
    const items = Number(m?.stats?.items ?? 0)
    if (items > 0 && !p.payloadExists) fail(`${p.type}/${p.id} stats.items=${items} 但 ${p.payloadName} 缺失（坏引用）`)
    // 7b. relations.json 孤儿端点
    const relPath = path.join(p.dir, 'relations.json')
    if (existsSync(relPath)) {
      try {
        const raw = JSON.parse(await readFile(relPath, 'utf8'))
        const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.relations) ? raw.relations : null)
        if (!list) fail(`${p.type}/${p.id} relations.json 结构无法识别`)
        else {
          const probs = []
          list.forEach((r, i) => {
            const ends = Array.isArray(r?.endpoints) ? r.endpoints : [r?.from ?? r?.source, r?.to ?? r?.target]
            for (const e of ends) {
              if (typeof e === 'string' && !reachable(e)) probs.push(`#${i} 孤儿端点：${e}`)
            }
          })
          if (probs.length) fail(`${p.type}/${p.id} relation 孤儿端点 ${probs.length} 处：${probs.slice(0, 3).join('；')}`)
          else ok(`${p.type}/${p.id} relations.json ${list.length} 条端点全部可达`)
        }
      } catch (e) { fail(`${p.type}/${p.id} relations.json 不可解析：${e.message}`) }
    }
    // 7c. assets URL 合法性
    if (Array.isArray(m?.assets)) {
      const broken = m.assets.filter((a) => !a?.url || !/^(https?:\/\/|\/)/.test(a.url))
      if (broken.length) fail(`${p.type}/${p.id} broken asset ${broken.length} 处`)
      else ok(`${p.type}/${p.id} assets ${m.assets.length} 项 url 合法`)
    }
  }

  /* —— 8. EMIT —— */
  stage(8, 'EMIT')
  const summary = { total: pkgs.length, allowed: 0, allowedAttribution: 0, reviewRequired: 0, rejected: 0 }
  const packagesOut = pkgs.map((p) => {
    const d = decisions.get(p.id)
    if (d.decision === 'allowed') summary.allowed++
    else if (d.decision === 'allowed+attribution') summary.allowedAttribution++
    else if (d.decision === 'review_required') summary.reviewRequired++
    else summary.rejected++
    return {
      type: p.type, id: p.manifest?.id, packageId: p.id, namespace: p.manifest?.namespace,
      sources: d.perSource, decision: d.decision, reason: d.reason,
    }
  })
  const artifact = {
    policyVersion: LICENSE_POLICY_VERSION,
    generatedAt: new Date().toISOString(),
    summary,
    matrix: {
      'MIT / Apache*': 'allowed',
      'CC-BY-* (non-SA/NC)': 'allowed+attribution',
      'CC-BY-SA* / GPL*': 'review_required',
      'CC-BY-NC*': 'rejected',
      NOASSERTION: 'review_required',
      'external w/o SPDX (unknown)': 'rejected',
      'original (provider sentinel)': 'allowed',
    },
    packages: packagesOut,
  }
  await writeFile(OUT, JSON.stringify(artifact, null, 2) + '\n', 'utf8')
  ok(`License Policy Matrix 已落盘：${OUT}`)
  console.log(`  · 汇总：allowed=${summary.allowed} allowed+attribution=${summary.allowedAttribution} review_required=${summary.reviewRequired} rejected=${summary.rejected}`)

  console.log(`\n[ingest] ${failures === 0 ? 'PASS' : `FAIL：${failures} 项`}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => { console.error('[ingest] 异常：', e.message); process.exit(1) })
