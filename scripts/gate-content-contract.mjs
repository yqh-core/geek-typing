/* V4.1 · gate-content-contract —— Content Contract 门禁（P1.7-Wave4 B-5）。
 *
 * 判红对照（任一命中 ⇒ exit 1）：
 *  ① 无 license     —— 任何 source 缺结构化 license，或外部来源（非自有）缺 SPDX；
 *                      或 License Policy Matrix 决策为 rejected / review_required。
 *  ② 坏引用         —— stats.items>0 但载荷文件缺失；relations.json 孤儿端点；
 *                      manifest.assets 含非法 URL。
 *  ③ ContentId 重写 —— manifest.id 的 localId 段 ≠ 目录名、namespace 段 ≠ manifest.namespace、
 *                      type 段 ≠ 目录类型、或 packageId ≠ 目录名（即 ContentId 被改写而与包体脱节）。
 *
 * License Policy Matrix 通过 scripts/content/license-policy.mjs 的 decideLicense 复用，
 * 与 ingest 同一份口径，禁止各写一份。
 *
 * 用法：node scripts/gate-content-contract.mjs [--root=<内容包目录>]
 *       node scripts/gate-content-contract.mjs --help
 *
 * `--root` 默认 `content/`，**仅**覆盖"内容包目录"（ROOT / registry / i18n 等一律不变），
 * 用于对隔离副本做 relations 判据的端到端验证（本机 spawn 一律 EBUSY，测试脚本起不了子进程
 * 跑门，只能靠门自己支持 --root；详见 scripts/content/license-policy.mjs 的 resolveContentDir）。
 */
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { CONTENT_ID_RE, loadPackages, decideLicense, resolveContentDir } from './content/license-policy.mjs'
/* relations 端点可达性**只从 relations.mjs 取**（P18-G0 裁定 §⑪-3）：本文件不得再有第二份实现。
 * 历史上这里与 content/ingest.mjs 是**逐字复制**，与 content/validate.mjs 是第三份 ——
 * 「必须同步」只写在注释里，就是下一场 P18-A「12→14 白名单漂移」。 */
import { buildReachability, isReachable, isValidRelationType, relationEndpoints } from './content/relations.mjs'

/* —— CLI 参数校验（对齐 validate.mjs：--help exit 0；未知参数 exit 2，不猜语义）—— */
const HELP_TEXT = `用法：
  node scripts/gate-content-contract.mjs [--root=<内容包目录>]   Content Contract 门禁，全绿 exit 0 / 任一 FAIL exit 1
  node scripts/gate-content-contract.mjs --help                  本帮助（exit 0）
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

let fails = 0
const fail = (msg) => { fails++; console.error(`  ✗ ${msg}`) }
const ok = (msg) => console.log(`  ✓ ${msg}`)

async function main() {
  const pkgs = await loadPackages(CONTENT_DIR)
  if (pkgs.length === 0) { console.error('未发现任何内容包'); process.exit(1) }
  console.log(`[gate:content-contract] ${pkgs.length} 个包`)

  const reach = buildReachability(pkgs)
  const reachable = (cid) => isReachable(reach, cid)

  for (const p of pkgs) {
    const m = p.manifest
    console.log(`▸ ${p.type}/${p.id}`)
    const sources = Array.isArray(m?.sources) ? m.sources : []

    /* —— ① 无 license / License Matrix —— */
    if (sources.length === 0) fail('sources 为空（无 license 判红）')
    for (const s of sources) {
      const d = decideLicense(s)
      if (d.decision === 'rejected') fail(`source(${s?.origin}) 许可 rejected：${d.reason}`)
      else if (d.decision === 'review_required') fail(`source(${s?.origin}) 许可 review_required（需人工复核，自动门禁拦截）：${d.reason}`)
    }
    if (sources.length > 0 && sources.every((s) => decideLicense(s).decision === 'allowed' || decideLicense(s).decision === 'allowed+attribution')) {
      ok(`license 全部 allowed（${sources.map((s) => s?.license?.spdx ?? 'self').join(', ')}）`)
    }

    /* —— ② 坏引用 —— */
    const items = Number(m?.stats?.items ?? 0)
    if (items > 0 && !p.payloadExists) fail(`stats.items=${items} 但 ${p.payloadName} 缺失（坏引用）`)
    else if (items > 0) ok(`载荷引用存在（${p.payloadName}）`)
    const relPath = path.join(p.dir, 'relations.json')
    if (existsSync(relPath)) {
      try {
        const raw = JSON.parse(await readFile(relPath, 'utf8'))
        const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.relations) ? raw.relations : null)
        if (!list) fail('relations.json 结构无法识别')
        else {
          const probs = []
          list.forEach((r, i) => {
            // 判据①（Stage 2 · 2026-10-02）：type ∈ RelationType。先于端点检查，理由同另两处。
            if (!isValidRelationType(r?.type)) {
              probs.push(`#${i} 非法 relation type：${JSON.stringify(r?.type ?? null)}（不在 RelationType 白名单内）`)
              return
            }
            const ends = relationEndpoints(r)
            for (const e of ends) if (typeof e === 'string' && !reachable(e)) probs.push(`#${i} 孤儿端点：${e}`)
          })
          if (probs.length) fail(`relation 校验失败 ${probs.length} 处：${probs.slice(0, 3).join('；')}`)
          else ok(`relations.json ${list.length} 条：type 合法且端点可达`)
        }
      } catch (e) { fail(`relations.json 不可解析：${e.message}`) }
    }
    if (Array.isArray(m?.assets)) {
      const broken = m.assets.filter((a) => !a?.url || !/^(https?:\/\/|\/)/.test(a.url))
      if (broken.length) fail(`broken asset ${broken.length} 处`)
      else ok(`assets ${m.assets.length} 项合法`)
    }

    /* —— ③ ContentId 重写 —— */
    const parsed = CONTENT_ID_RE.exec(m?.id ?? '')
    if (!parsed) { fail(`ContentId 格式非法：${m?.id ?? '缺失'}`); continue }
    const [, idType, idNs, idLocal] = parsed
    if (idType !== p.type) fail(`ContentId type 段="${idType}" ≠ 目录类型 "${p.type}"（ContentId 被重写）`)
    if (idNs !== m?.namespace) fail(`ContentId namespace 段="${idNs}" ≠ manifest.namespace="${m?.namespace}"（ContentId 被重写）`)
    if (idLocal !== p.id) fail(`ContentId localId 段="${idLocal}" ≠ 目录名 "${p.id}"（ContentId 被重写）`)
    if (m?.packageId !== p.id) fail(`packageId="${m?.packageId}" ≠ 目录名 "${p.id}"（ContentId 与包体脱节）`)
    if (idType === p.type && idNs === m?.namespace && idLocal === p.id && m?.packageId === p.id) {
      ok(`ContentId 与包体一致（${m.id}）`)
    }
  }

  if (fails > 0) { console.error(`\n[gate:content-contract] FAIL：${fails} 项`); process.exit(1) }
  console.log(`\n[gate:content-contract] PASS：${pkgs.length} 包全部通过 Content Contract`)
}

main().catch((e) => { console.error('[gate:content-contract] 异常：', e.message); process.exit(1) })
