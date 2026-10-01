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
 * 用法：node scripts/content/ingest.mjs [--root=<内容包目录>]
 *       node scripts/content/ingest.mjs --help
 *
 * `--root` 默认 `content/`，**仅**覆盖"内容包目录"（ROOT / registry / i18n 等一律不变），
 * 用于对隔离副本做 relations 判据的端到端验证（本机 spawn 一律 EBUSY，测试脚本起不了子进程
 * 跑门，只能靠门自己支持 --root；详见 license-policy.mjs 的 resolveContentDir）。
 * License Policy Matrix 的落盘路径随之进入该内容目录（默认仍是 content/license-policy-1.json）。
 */
import { writeFile, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import {
  LICENSE_POLICY_VERSION, PROVIDER_ORIGINAL,
  loadPackages, decidePackage, checksumPayload, resolveContentDir,
} from './license-policy.mjs'
/* relations 端点可达性**只从 relations.mjs 取**（P18-G0 裁定 §⑪-3）：本文件不得再有第二份实现。
 * 历史上这里与 scripts/gate-content-contract.mjs 是**逐字复制**，与 validate.mjs 是第三份。 */
import { buildReachability, isReachable } from './relations.mjs'

/* —— CLI 参数校验（对齐 validate.mjs：--help exit 0；未知参数 exit 2，不猜语义）—— */
const HELP_TEXT = `用法：
  node scripts/content/ingest.mjs [--root=<内容包目录>]   内容接入八段流水线，全绿 exit 0 / 任一 FAIL exit 1
  node scripts/content/ingest.mjs --help                  本帮助（exit 0）
  · \`--root\` 仅覆盖内容包目录，用于对隔离副本做 relations 判据的端到端验证。`
{
  const args = process.argv.slice(2)
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--help' || a.startsWith('--root=')) continue
    if (a === '--root') { i++; continue } // 空格形式：值在下一个 argv（与 resolveContentDir 同语义）
    console.error(`未知参数 ${JSON.stringify(a)} —— 本脚本不接受未知 flag，也不猜测其语义\n`)
    console.error(HELP_TEXT)
    process.exit(2)
  }
  if (args.includes('--help')) { console.log(HELP_TEXT); process.exit(0) }
}
const CONTENT_DIR = resolveContentDir()
const OUT = path.join(CONTENT_DIR, `${LICENSE_POLICY_VERSION}.json`)

const stage = (n, name) => console.log(`\n[ingest] 阶段 ${n}/8 · ${name}`)
let failures = 0
const fail = (msg) => { failures++; console.error(`  ✗ ${msg}`) }
const ok = (msg) => console.log(`  ✓ ${msg}`)

async function main() {
  /* —— 1. DISCOVER —— */
  stage(1, 'DISCOVER')
  const pkgs = await loadPackages(CONTENT_DIR)
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
  // 可达性索引：全部包 ContentId + 各类型的条目级端点（共享模块，唯一实现）
  const reach = buildReachability(pkgs)
  const reachable = (cid) => isReachable(reach, cid)
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
  /* 幂等（对齐 build.mjs「仅在语义有差异时回写」）：generatedAt 是溯源时间戳，每次运行必然
   * 变化，故不参与语义比较 —— 否则产物（已入库、受版本控制）每次运行都会产生一次工作区漂移。
   * ⚠️ 只**排除**它参与判定，不从产物里删字段；落盘结构 / 键序 / 缩进 / 尾随换行一律不变。
   * ⚠️ 两侧用同一方式构造 ⇒ 键序一致，可直接比字符串，不引入任何新的规范化依赖。 */
  // `_generatedAt`：它每跑必变、刻意**不参与**语义比较（排除而不删字段），下划线 = 有意不用
  const semanticsOf = ({ _generatedAt, ...rest }) => JSON.stringify(rest)
  let prev = null
  try { prev = JSON.parse(await readFile(OUT, 'utf8')) } catch { prev = null } // 不存在/不可解析 ⇒ 必须写
  if (prev !== null && typeof prev === 'object' && semanticsOf(prev) === semanticsOf(artifact)) {
    console.log(`  · 产物语义未变，跳过写入（generatedAt 保持 ${prev.generatedAt}）`)
  } else {
    await writeFile(OUT, JSON.stringify(artifact, null, 2) + '\n', 'utf8')
    ok(`License Policy Matrix 已落盘：${OUT}`)
  }
  console.log(`  · 汇总：allowed=${summary.allowed} allowed+attribution=${summary.allowedAttribution} review_required=${summary.reviewRequired} rejected=${summary.rejected}`)

  console.log(`\n[ingest] ${failures === 0 ? 'PASS' : `FAIL：${failures} 项`}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => { console.error('[ingest] 异常：', e.message); process.exit(1) })
