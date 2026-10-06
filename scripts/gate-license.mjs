#!/usr/bin/env node
/**
 * P1.8-B · INV-5 —— License Gate（gate-license.mjs）· 内容**入库前置硬门**
 *
 * 门的性质（P1.8-PLAN §4.2）：内容**未过此门不得落盘到 content/**。
 *   外部素材 → normalize → gate:license(硬门，不过则终止) → build → validate → ingest → 进内容仓
 *                                   ↑
 *                          未过门的内容不允许落盘到 content/**
 *
 * 与 content:validate 的关系（**不是它的复印件**）：
 *   两者检查**同一批规则**（assetId 语法/归属 · checksum · url 必须远程 · 许可二选一与解析 ·
 *   provenance · 包级两件套条件必填）。规则实现**只有一份** = `scripts/content/asset-rules.mjs`；
 *   许可判定矩阵**只有一份** = `scripts/content/license-policy.mjs` 的 `decideLicense`。
 *   本文件**只做编排与打印**，自身不含任何规则逻辑（P1.8 裁定 ④-7：两份手写实现 = 下一场
 *   「12→14 白名单漂移」，只是这次漂的是资产规则）。
 *   「本门不得复制 asset-rules 规则」由 `gate:content-type-contract` 判据 **H3** 上锁，
 *   「许可矩阵不得复制」由 asset-rules 只调用 decideLicense 保证。
 *
 * 逐包判据（任一命中 ⇒ FAIL）：
 *   1. manifest.json 必须存在且为合法 JSON（读不到 / 坏 JSON ⇒ **Fatal EXIT=2**，绝不降级成 PASS）
 *   2. 每条 `sources[]` 必须带**结构化 license**（`{name,…}`），且 `decideLicense` 判定**不是**
 *      `rejected` / `review_required`（review_required 在无人值守门里与 rejected 同为 FAIL，
 *      只是 code 分开以便人工分诊 —— 见 asset-rules.mjs 的 checkLicenseDecision 取舍说明）
 *   2b. 每条 `sources[]` 的 `origin` / `provider` 必须为**非空字符串**（冻结 Plan §4.1 `:159`）
 *   2c. 每条 `sources[]` 的 `checksum` 必须存在，且**等于载荷实体的完整 SHA-256**
 *      （冻结 Plan §4.1 `:160`；用 `license-policy.mjs` 的 `checksumPayload`，与 `content:validate`
 *       判据 6 共用同一个 helper —— 不许出现第三份哈希实现）
 *   2d. 每条 `sources[]` 的 `license.redistributable` 必须**显式**声明为布尔（**fail-closed**：
 *       缺失/非布尔 ⇒ 判红）。这是「公开分发声明」的第三维 —— 本门此前只校验了
 *      `commercialUse`（能否商用）与 `attributionRequired`（是否必须署名）两维，
 *      「可否再分发」只活在 license-policy.mjs 的注释里，是**已证实的假绿盲区**。
 *      显式 `false` 合法（判据只强制表态，不强制为 true），故 14 个自有专有非词库包
 *      以 `redistributable:false` 如实记录「不可再分发」，13 个 MIT 词库包为 `true`。
 *   3. 包级 `licenses` 表（若存在）逐条判定（同 2 的口径）
 *   4. 每个 asset 走 `checkManifestAssets` 的**全规则**（assetId 语法/归属 · checksum 形状 ·
 *      url 必须 https · 许可二选一与 licenseRef 解析 · provenance）
 *   5. 包级两件套条件必填（包级 `licenses` + `provenance` ⇔ 声明了非空 `assets[]`）
 *   fail-closed 附加（不留静默空洞）：未知内容类型目录 / `sources` 缺失或为空 —— 一律判红，
 *   因为"这个目录/包没被许可门覆盖"本身就意味着有内容可能绕过硬门入库。
 *
 * §4.1 覆盖矩阵对账（本波核心 —— 把"靠注释"变成"靠机器"）：
 *   `P1.8-PLAN` §5 总表声明本门判据 = 「§4.1 全表」。但 §4.1 是 **7 行**规则，其中
 *   `:157` `commercialUse !== true` 与 `:158` `attributionRequired === true 但无署名文本`
 *   两条此前**只写在合同文档的"口径说明"里**、无任何机器判据 —— 正是评审禁止的「靠注释」。
 *   现在本门在**每次普通运行**里解析 `P1.8-PLAN-v1.0-FROZEN.md` §4.1 的 Markdown 表格，
 *   逐行与 `PLAN_4_1_COVERAGE` 对账（Plan 有而矩阵无 / 矩阵有而 Plan 无 / owner·check·falsify
 *   为空 / 证伪用例 id 不存在 ⇒ 判红），并**打印整张矩阵**。以后谁往 §4.1 加一行却不写门，
 *   或删掉某条判据的证伪用例，**这道门立刻判红** —— 覆盖不全不可能再悄悄发生。
 *   Plan 读不到 / 标题或表格解析不出来 ⇒ **Fatal EXIT=2**，绝不降级成 PASS。
 *
 * 退出码（与本仓其它门同族，三分且严格）：
 *   0 = PASS（无任何违规）
 *   1 = FAIL（存在违规）
 *   2 = Fatal（manifest 读不到 / JSON 坏 / **冻结 Plan 读不到或 §4.1 解析失败** /
 *       规则模块加载失败 / 未知 flag）—— **解析失败绝不降级成 PASS**
 *
 * 用法：
 *   npm run gate:license                     # 默认 --root=content/
 *   node scripts/gate-license.mjs --root=<dir>   # 指向隔离副本（证伪用；与 content:validate 同语义）
 *   npm run gate:license:falsify             # 自带证伪自检（见下）
 *
 * 为什么自带 --falsify：**不会失败的门等于没有门**。
 *   常规模式只证明"当前 content/ 通过"；--falsify 逐条植入故障、断言**命中集精确等于**预期
 *   （不是"包含"）、再字节还原并跑对照组复绿 —— 既证明它能判红，也证明它不越界误伤。
 *   隔离副本 = `node_modules/.tmp/gate-license-falsify/`（已被 gitignore），**绝不动真 content/**。
 *   例外：证明「§4.1 覆盖矩阵对账是活的」那一条（M1）必须改**真 Plan** 的表格（否则对账读不到
 *   被加的行）—— 但它不在 INV-1 冻结区（冻结区是 `docs/audit-package/**`），且改完立刻按
 *   sha256 **字节级还原**，运行后 `git diff -- docs/p18/P1.8-PLAN-v1.0-FROZEN.md` 必须为空。
 *
 * 实现注记：本脚本**不 spawn 任何子进程**（本机 Node 预加载 safe-delete / brokered-fs shim，
 *   从 node 进程内 spawn 一律 EBUSY）；因此证伪也在**进程内**直接调用 runChecks()，
 *   用 `root=隔离副本` 与 `--root=` 等义 —— 不拉起第二段 node 进程。
 *   还原的验收标准是**文件内容哈希**，不是 existsSync（后者会被 shim 缓存误导）。
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { CONTENT_TYPES, checksumPayload, payloadNameOf } from './content/license-policy.mjs'
import {
  checkManifestAssets,
  checkPackageAssetDeclarations,
  checkLicenseDecision,
} from './content/asset-rules.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** 脚本自身错误（EXIT=2）—— 与「判据不成立（EXIT=1）」严格区分，绝不互相降级 */
class Fatal extends Error {}

const sorted = (a) => [...a].sort()
const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')
const clone = (o) => structuredClone(o)

/* ------------------------------------------------------------------ *
 * §4.1 覆盖矩阵 + 与冻结 Plan 逐行对账（本波核心）
 *   冻结 Plan `docs/p18/P1.8-PLAN-v1.0-FROZEN.md` §5 总表声明 `gate:license` 的判据
 *   是「§4.1 全表」，但 §4.1 有 7 行规则 —— 只靠注释宣称"全覆盖"是**不可机检的承诺**。
 *   这里把「每一行 ← 由哪个判据实现 ← 由哪条证伪用例证明它可失败」写成一张表，
 *   再**每次运行**解析 Plan §4.1 表格逐行对账：少了行 / 多了行 / 证伪用例不存在 ⇒ 判红。
 * ------------------------------------------------------------------ */

/** 冻结 Plan（只读；**不在 INV-1 冻结区**内 —— 冻结区是 docs/audit-package/**） */
const PLAN_FILE = join(ROOT, 'docs', 'p18', 'P1.8-PLAN-v1.0-FROZEN.md')
const PLAN_41_HEADING_RE = /^###\s+4\.1\s+门禁规则\s*$/

/**
 * `PLAN_4_1_COVERAGE` —— §4.1 每一行 ↔ 实现它的判据 ↔ 证明它能判红的证伪用例 id。
 * `key` **必须与 Plan §4.1 表格第一列规范化后的文本逐字相等**（去反引号 → 折叠连续空白 → 去首尾空白）；
 * 对账失败会点名差异行，所以任何一侧改了文本，门会立刻告诉我们。
 */
const PLAN_4_1_COVERAGE = [
  { key: 'license.spdx 未知 / 缺失', owner: 'gate:license', check: 'license-policy:decideLicense', falsify: 'S2' },
  { key: 'spdx 非商用（如 CC-BY-NC）', owner: 'gate:license', check: 'license-policy:decideLicense', falsify: 'S3' },
  { key: 'commercialUse !== true（面向公开分发的内容）', owner: 'gate:license', check: 'license-policy:decideLicense', falsify: 'S5' },
  { key: 'attributionRequired === true 但无署名文本', owner: 'gate:license', check: 'license-policy:decideLicense', falsify: 'S6' },
  { key: 'provenance.origin/provider 缺失', owner: 'gate:license', check: 'gate-license:sourceProvenance', falsify: 'S7' },
  { key: 'checksum 缺失或与实体不符', owner: 'gate:license', check: 'gate-license:sourceChecksum', falsify: 'S8' },
  { key: 'Asset 缺 license 且无有效 licenseRef', owner: 'gate:license', check: 'asset-rules:checkAssetLicense', falsify: 'A1' },
]

/** §4.1 规则文本规范化：去反引号 → 连续空白折叠为单空格 → 去首尾空白 */
const normalizeRuleText = (s) => s.replace(/`/g, '').replace(/[\s\u00A0]+/g, ' ').trim()

/**
 * 解析冻结 Plan §4.1 表格的**第一列**（规则文本，已规范化）。
 * 读不到 / 找不到 §4.1 标题 / 表格分隔行缺失 / 零行规则 ⇒ **Fatal**（解析失败绝不降级成 PASS）。
 */
function plan41Rules() {
  let src
  try {
    src = readFileSync(PLAN_FILE, 'utf8')
  } catch (e) {
    throw new Fatal(`冻结 Plan 读不到（${PLAN_FILE}）— ${e.message}；§4.1 对账无法进行，绝不降级成 PASS`)
  }
  const lines = src.split(/\r?\n/)
  const start = lines.findIndex((l) => PLAN_41_HEADING_RE.test(l.trim()))
  if (start < 0) throw new Fatal(`Plan 中找不到 §4.1 标题「### 4.1 门禁规则」—— 表格结构被改动，对账无法进行`)

  const rules = []
  let sepSeen = false
  for (let i = start + 1; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (/^#{2,3}\s/.test(trimmed)) break // 下一个 ## / ### 标题 ⇒ 表格结束
    if (!trimmed.startsWith('|')) continue
    const cells = trimmed.split('|').slice(1, -1).map((c) => c.trim())
    if (cells.length < 2) continue
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) { sepSeen = true; continue } // |---|---| 分隔行
    if (!sepSeen) continue // 表头行（在分隔行之前）
    const key = normalizeRuleText(cells[0])
    if (key) rules.push(key)
  }
  if (!sepSeen || rules.length === 0) {
    throw new Fatal('Plan §4.1 表格解析为空（未找到表头分隔行，或零行规则）—— 对账无法进行，绝不降级成 PASS')
  }
  return rules
}

/**
 * 对账：Plan §4.1 规则集合 ⟷ `PLAN_4_1_COVERAGE`。
 * 返回 `{ ok, errors, logs }`；`ok=false` 时 errors 逐条指名差异（哪一行、差在哪一侧）。
 */
function checkPlan41Coverage() {
  const planRules = plan41Rules()
  const matrixKeys = PLAN_4_1_COVERAGE.map((r) => r.key)
  const planSet = new Set(planRules)
  const keySet = new Set(matrixKeys)
  const errors = []

  const missingInMatrix = planRules.filter((r) => !keySet.has(r)) // Plan 有而矩阵无
  const extraInMatrix = matrixKeys.filter((k) => !planSet.has(k)) // 矩阵有而 Plan 无
  if (missingInMatrix.length) {
    errors.push(`Plan §4.1 有规则但覆盖矩阵未登记（有规则、无门）：${missingInMatrix.map((r) => `「${r}」`).join('、')}`)
  }
  if (extraInMatrix.length) {
    errors.push(`覆盖矩阵登记了 Plan §4.1 不存在的规则（矩阵是死的/Plan 被改）：${extraInMatrix.map((r) => `「${r}」`).join('、')}`)
  }
  const dup = matrixKeys.filter((k, i) => matrixKeys.indexOf(k) !== i)
  if (dup.length) errors.push(`覆盖矩阵 key 重复（会掩盖遗漏行）：${[...new Set(dup)].map((r) => `「${r}」`).join('、')}`)

  const caseIds = new Set(CASES.map((c) => c.letter))
  for (const row of PLAN_4_1_COVERAGE) {
    for (const field of ['owner', 'check', 'falsify']) {
      if (typeof row[field] !== 'string' || row[field].trim() === '') {
        errors.push(`覆盖矩阵「${row.key}」的 ${field} 为空 —— 没有 owner/判据/证伪用例的覆盖是空头承诺`)
      }
    }
    if (row.owner === 'gate:license' && !caseIds.has(row.falsify)) {
      errors.push(`覆盖矩阵「${row.key}」的证伪用例 id「${row.falsify}」不在 CASES 中（判据失去证伪保障）`)
    }
  }

  const logs = ['§4.1 覆盖矩阵（冻结 Plan 规则 → 判据 → 证伪用例）：']
  for (const r of PLAN_4_1_COVERAGE) {
    logs.push(`  · ${r.key}  →  ${r.check}  →  证伪 ${r.falsify}（owner ${r.owner}）`)
  }
  if (errors.length === 0) {
    logs.push(`  ✓ 对账通过：Plan §4.1 ${planRules.length} 行 == 覆盖矩阵 ${matrixKeys.length} 行，每行证伪用例存在`)
  }
  return { ok: errors.length === 0, errors, logs }
}

/* ------------------------------------------------------------------ *
 * 参数
 * ------------------------------------------------------------------ */

/** 解析 CLI 参数。**未知 flag 一律 Fatal**（危险脚本不得带静默默认值 —— 同 evidence-run 事故教训）。 */
function parseArgs(argv) {
  const args = argv.slice(2)
  let root = null
  let falsify = false
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--falsify') {
      falsify = true
      continue
    }
    if (a.startsWith('--root=')) {
      root = a.slice('--root='.length)
      continue
    }
    if (a === '--root') {
      root = args[i + 1] ?? null
      i++
      continue
    }
    throw new Fatal(`未知参数 ${JSON.stringify(a)} —— 本门不接受未知 flag，也不猜测其语义`)
  }
  const contentDir = root === null || root === '' ? join(ROOT, 'content') : resolve(ROOT, root)
  return { contentDir, falsify }
}

/* ------------------------------------------------------------------ *
 * 判据本体（编排 + 打印；规则逻辑一律来自 asset-rules / license-policy）
 * ------------------------------------------------------------------ */

/** 读 manifest：读不到或 JSON 坏 ⇒ Fatal（EXIT=2）。**绝不**当成"无违规"跳过。 */
function readManifest(file, label) {
  let raw
  try {
    raw = readFileSync(file, 'utf8')
  } catch (e) {
    throw new Fatal(`${label}：manifest.json 读不到（${file}）— ${e.message}`)
  }
  try {
    return JSON.parse(raw)
  } catch (e) {
    throw new Fatal(`${label}：manifest.json 不是合法 JSON — ${e.message}`)
  }
}

/** 判据 2b/2c 需要「载荷实体」做基准：读包目录下的载荷文件（缺文件 ⇒ null；坏 JSON ⇒ 抛 Fatal）。 */
function readPayload(file, label) {
  let raw
  try {
    raw = readFileSync(file, 'utf8')
  } catch {
    return null // 无载荷文件：非 vocabulary 包允许无载荷 ⇒ 由调用方按「无实测基准」如实跳过
  }
  try {
    return JSON.parse(raw)
  } catch (e) {
    throw new Fatal(`${label}：载荷文件不是合法 JSON（${file}）— ${e.message}；checksum 实体比对无法进行，绝不降级成 PASS`)
  }
}

/** 判据 2 / 2b / 2c：每条 sources[] 的结构化许可 + decideLicense 判定 + provenance + checksum 实体比对。 */
function checkSources(manifest, payload, payloadName, fail, logs) {
  const sources = manifest?.sources
  if (!Array.isArray(sources) || sources.length === 0) {
    fail('SOURCES_MISSING', 'sources[] 缺失或为空：包至少要有 1 条来源，无来源 = 无从判定许可（fail-closed，不静默跳过）')
    return
  }
  const expectedChecksum = checksumPayload(payload) // null ⇒ 无载荷实体，无法比对
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i] ?? {}
    const lic = s.license
    const origin = typeof s.origin === 'string' && s.origin ? s.origin : `sources[${i}]`

    // 2b. provenance.origin / provider 必须为非空字符串（冻结 Plan §4.1 :159）
    const missingProv = []
    if (typeof s.origin !== 'string' || s.origin.trim() === '') missingProv.push('origin')
    if (typeof s.provider !== 'string' || s.provider.trim() === '') missingProv.push('provider')
    if (missingProv.length) {
      fail(
        'SOURCE_PROVENANCE_MISSING',
        `source(sources[${i}]) 缺 provenance.${missingProv.join(' / ')}（须为非空字符串）：冻结 Plan §4.1「provenance.origin/provider 缺失 → 拒绝」`,
      )
    }

    // 2c. checksum 必须存在，且等于载荷实体的完整 SHA-256（冻结 Plan §4.1 :160；
    //     算法 = license-policy.checksumPayload，与 content:validate 判据 6 同一份实现）
    const ck = s.checksum
    if (typeof ck !== 'string' || ck.trim() === '') {
      fail(
        'SOURCE_CHECKSUM_MISSING',
        `source(${origin}) 缺 checksum：冻结 Plan §4.1「checksum 缺失 → 拒绝」（须为载荷实体的完整 SHA-256）`,
      )
    } else if (expectedChecksum === null) {
      logs.push(`  · source(${origin}) 无载荷实体（缺 ${payloadName}），跳过 checksum 实体比对（无实测基准，不判通过）`)
    } else if (ck !== expectedChecksum) {
      fail(
        'SOURCE_CHECKSUM_MISMATCH',
        `source(${origin}) checksum 与载荷实体不符：manifest=${ck} ≠ 实体 ${expectedChecksum}：冻结 Plan §4.1「checksum 与实体不符 → 拒绝」`,
      )
    } else {
      logs.push(`  ✓ source(${origin}) checksum == 载荷实体 SHA-256（${ck.slice(0, 14)}…）`)
    }

    // 2. 结构化许可 + decideLicense 判定
    if (lic === null || typeof lic !== 'object' || Array.isArray(lic) || typeof lic.name !== 'string' || !lic.name) {
      fail('SOURCE_LICENSE_UNSTRUCTURED', `source(${origin}) 无结构化 license（需 {name, spdx?, attributionRequired, …}）`)
      continue
    }
    // 判定矩阵唯一位于 license-policy.decideLicense；此处经 asset-rules 的 checkLicenseDecision 映射（不复制矩阵）
    const v = checkLicenseDecision({ provider: s.provider, license: lic })
    if (!v.ok) fail(v.code, `source(${origin})：${v.message}`)
    else logs.push(`  ✓ source(${origin}) 许可判定 ${v.decision}`)
  }
}

/** 判据 3：包级 licenses 具名表逐条判定。 */
function checkPackageLicenses(manifest, fail, logs) {
  if (manifest?.licenses === undefined) return
  const table = manifest.licenses
  if (table === null || typeof table !== 'object' || Array.isArray(table)) {
    fail('PACKAGE_LICENSES_UNSTRUCTURED', 'manifest.licenses 必须为「id → 许可」的具名对象')
    return
  }
  for (const [lid, entry] of Object.entries(table)) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry) || typeof entry.name !== 'string' || !entry.name) {
      fail('PACKAGE_LICENSE_UNSTRUCTURED', `licenses.${lid} 许可非结构化（需 {name, spdx?, attributionRequired}）`)
      continue
    }
    const v = checkLicenseDecision({ provider: manifest?.provenance?.provider, license: entry })
    if (!v.ok) fail(v.code, `licenses.${lid}：${v.message}`)
    else logs.push(`  ✓ licenses.${lid} 许可判定 ${v.decision}`)
  }
}

/** 判据 4/5：asset 全规则 + 包级两件套条件必填（规则实现在 asset-rules.mjs，唯一）。 */
function checkAssets(manifest, fail, logs) {
  const r = checkManifestAssets(manifest)
  if (!r.hasAssets) {
    logs.push('  · manifest 无 assets 字段，跳过 asset 校验')
  } else {
    for (const v of [...r.assetViolations, ...r.assetLicenseViolations]) fail(v.code, v.message)
  }
  const decl = checkPackageAssetDeclarations(manifest)
  if (!decl.ok) {
    for (const v of decl.violations) fail(v.code, v.message)
  } else {
    logs.push(
      decl.required
        ? '  ✓ 资产契约：assets[] 非空 ⇒ 包级 licenses/provenance 齐备'
        : '  ✓ 资产契约：无 assets[]，包级 licenses/provenance 不要求（条件未触发）',
    )
  }
}

/**
 * 跑全部判据。返回 { hits:Set<code>, logs, errors, packageCount, violationCount }；hits 为空集即 PASS。
 * 致命问题（内容根不可读 / manifest 坏 / 载荷坏 / Plan §4.1 解析失败 / 规则模块出事）抛 Fatal。
 */
function runChecks(contentDir) {
  const hits = new Set()
  const logs = []
  const errors = []
  let violationCount = 0
  const fail = (code, msg) => {
    violationCount++
    hits.add(code)
    errors.push(`  ✗ [${code}] ${msg}`)
  }

  // 先跑 §4.1 覆盖矩阵对账（与内容根无关，只读冻结 Plan）—— 打印在前，让它每次都在人眼前
  const cov = checkPlan41Coverage()
  for (const l of cov.logs) logs.push(l)
  if (!cov.ok) for (const e of cov.errors) fail('PLAN_4_1_COVERAGE_MISMATCH', e)

  let entries
  try {
    entries = readdirSync(contentDir, { withFileTypes: true })
  } catch (e) {
    throw new Fatal(`内容根不可读：${contentDir} — ${e.message}`)
  }

  const typeDirs = entries.filter((d) => d.isDirectory()).map((d) => d.name).sort()
  let packageCount = 0

  for (const type of typeDirs) {
    const typeDir = join(contentDir, type)
    if (!CONTENT_TYPES.has(type)) {
      fail('UNKNOWN_CONTENT_TYPE', `未知内容类型目录 ${type}/：不在 ContentType 白名单 → 该目录下的内容不会被许可门覆盖（fail-closed）`)
      continue
    }
    const ids = readdirSync(typeDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()
    for (const id of ids) {
      packageCount++
      const label = `${type}/${id}`
      logs.push(`▸ ${label}`)
      const manifest = readManifest(join(typeDir, id, 'manifest.json'), label)
      const pName = payloadNameOf(type)
      const payload = readPayload(join(typeDir, id, pName), label)
      const before = hits.size
      checkSources(manifest, payload, pName, fail, logs)
      checkPackageLicenses(manifest, fail, logs)
      checkAssets(manifest, fail, logs)
      if (hits.size === before) logs.push('  ✓ 许可 / 资产判据全部通过')
    }
  }

  return { hits, logs, errors, packageCount, violationCount }
}

/* ------------------------------------------------------------------ *
 * 证伪自检：在**隔离副本**上逐条注入故障，断言命中集**精确等于**预期
 *   隔离副本 = node_modules/.tmp/gate-license-falsify/content（gitignore）
 *   然后对副本调用与常规模式**完全同一条** runChecks()（= --root 指向副本），绝不动真 content/
 * ------------------------------------------------------------------ */

const FALSIFY_DIR = join(ROOT, 'node_modules', '.tmp', 'gate-license-falsify')
const FALSIFY_CONTENT = join(FALSIFY_DIR, 'content')
/** 证伪基准包（选 topic 试金石：无资产、单来源、结构最小，便于精确注入） */
const BASE_PKG = join('topic', 'demo-topic-01')

/** 合法许可 / 合法资产构件（对照组与多数用例的"其余部分保持绿"基座）
 *  ⚠️ `redistributable: true` 是**必填**的显式声明（license-policy 第三维，缺失即 rejected）
 *     —— 本常量代表「一份合法许可」，故必须把三维度表态齐全，否则对照组会被自己的门禁判红。*/
const MIT = { name: 'MIT License', spdx: 'MIT', attributionRequired: false, commercialUse: true, redistributable: true }
/** 64 位小写 hex（checksum 形状合法） */
const GOOD_CHECKSUM = `sha256:${'a1'.repeat(32)}`
/** 外部来源方标识（非自有哨兵 ⇒ 许可真走判定矩阵，而不是被哨兵短路成 allowed） */
const EXTERNAL = 'acme-records'

const goodAsset = (hostContentId, over = {}) => ({
  assetId: `${hostContentId}#a:a-0001`,
  kind: 'audio',
  url: 'https://cdn.example.com/media/a-0001.mp3',
  checksum: GOOD_CHECKSUM,
  provenance: { provider: EXTERNAL },
  license: { ...MIT },
  ...over,
})

/** 把包级两件套与一条资产装进 manifest（后续用例在其上做局部破坏） */
const withAssetPackage = (m, assets, extra = {}) => ({
  ...m,
  provenance: { provider: EXTERNAL },
  licenses: { mit: { ...MIT } },
  assets,
  ...extra,
})

const CASES = [
  {
    letter: 'CTRL',
    name: '对照组：合法资产 + 合法许可（本门**必须判绿**）',
    why: '证明这道门不是恒红的 —— 若连合法输入都判红，前面的"恰好判红"毫无意义',
    expect: [],
    mutate: (m) => withAssetPackage(m, [goodAsset(m.id, { assetId: `${m.id}#a:a-0001` })]),
  },
  {
    letter: 'S1',
    name: 'source 无结构化 license（删掉 sources[0].license）',
    why: '结构缺失只被 SOURCE_LICENSE_UNSTRUCTURED 看见；许可判定被跳过，不越界误伤其它判据',
    expect: ['SOURCE_LICENSE_UNSTRUCTURED'],
    mutate: (m) => {
      const c = clone(m)
      delete c.sources[0].license
      return c
    },
  },
  {
    letter: 'S2',
    name: '外部来源无 SPDX（provider 改外部、license 去掉 spdx）',
    why: 'decideLicense 对"外部来源无 spdx"返回 rejected ⇒ LICENSE_REJECTED（commercialUse/署名两条已满足，确保命中的是"无 spdx"分支，而不是被 §4.1 :157/:158 先拦下）',
    expect: ['LICENSE_REJECTED'],
    mutate: (m) => {
      const c = clone(m)
      c.sources[0].provider = EXTERNAL
      c.sources[0].license = { name: 'ECDICT dataset', commercialUse: true, attributionRequired: true, attribution: '© ECDICT', redistributable: true }
      return c
    },
  },
  {
    letter: 'S3',
    name: 'CC-BY-NC（非商用 ⇒ rejected）',
    why: 'decideLicense 对 CC-BY-NC 返回 rejected ⇒ LICENSE_REJECTED（与"无 spdx"同 code，但拒绝理由不同；commercialUse/署名两条已满足 ⇒ 命中 CC-BY-NC 分支）',
    expect: ['LICENSE_REJECTED'],
    mutate: (m) => {
      const c = clone(m)
      c.sources[0].provider = EXTERNAL
      c.sources[0].license = { name: 'CC BY-NC 4.0', spdx: 'CC-BY-NC-4.0', commercialUse: true, attributionRequired: true, attribution: '© CC', redistributable: false }
      return c
    },
  },
  {
    letter: 'S4',
    name: 'CC-BY-SA（review_required ⇒ 在自动门里同判 FAIL）',
    why: 'review_required 不得粉饰为 PASS（PENDING 不粉饰原则）⇒ 独有 code LICENSE_REVIEW_REQUIRED；署名文本已给（否则会被 §4.1 :158 先判 rejected，测不到 review_required 分支）',
    expect: ['LICENSE_REVIEW_REQUIRED'],
    mutate: (m) => {
      const c = clone(m)
      c.sources[0].provider = EXTERNAL
      c.sources[0].license = { name: 'CC BY-SA 4.0', spdx: 'CC-BY-SA-4.0', commercialUse: true, attributionRequired: true, attribution: '© CC', redistributable: true }
      return c
    },
  },
  {
    letter: 'A1',
    name: 'asset 缺许可（既无 license 也无 licenseRef）',
    why: '许可二选一"都不写" ⇒ ASSET_LICENSE_XOR；包级两件套齐备 ≠ 替代 asset 级（④-3）',
    expect: ['ASSET_LICENSE_XOR'],
    mutate: (m) => {
      const a = goodAsset(m.id)
      delete a.license
      return withAssetPackage(m, [a])
    },
  },
  {
    letter: 'A2',
    name: 'asset 双写许可（license 与 licenseRef 同时存在）',
    why: '许可二选一"两个都写" ⇒ ASSET_LICENSE_XOR（与 A1 同 code 的两侧）',
    expect: ['ASSET_LICENSE_XOR'],
    mutate: (m) => {
      const a = goodAsset(m.id, { licenseRef: 'mit' })
      return withAssetPackage(m, [a])
    },
  },
  {
    letter: 'A3',
    name: 'licenseRef 解析不到（指向包级 licenses 里不存在的 id）',
    why: '禁止隐式继承：解析不到 ⇒ ASSET_LICENSE_REF_UNRESOLVED（不回退 sources[].license）',
    expect: ['ASSET_LICENSE_REF_UNRESOLVED'],
    mutate: (m) => {
      const a = goodAsset(m.id)
      delete a.license
      a.licenseRef = 'nope'
      return withAssetPackage(m, [a])
    },
  },
  {
    letter: 'A4',
    name: 'assetId 非法（无 #a: 分隔符）',
    why: 'assetId 语法判据 ⇒ ASSET_ID_SHAPE（owner 判定在其后，不重复计数）',
    expect: ['ASSET_ID_SHAPE'],
    mutate: (m) => withAssetPackage(m, [goodAsset(m.id, { assetId: 'not-an-asset-id' })]),
  },
  {
    letter: 'A5',
    name: 'asset 归属他人（宿主段是另一个包）',
    why: '所有权规则 1「Asset 不可跨包引用」⇒ ASSET_NOT_OWNED',
    expect: ['ASSET_NOT_OWNED'],
    mutate: (m) =>
      withAssetPackage(m, [goodAsset(m.id, { assetId: 'content:vocabulary:other-ns:other#a:a-1' })]),
  },
  {
    letter: 'A6',
    name: 'url 非 https（http 明文）',
    why: '媒体必须远程且 https ⇒ ASSET_URL_NOT_HTTPS',
    expect: ['ASSET_URL_NOT_HTTPS'],
    mutate: (m) => withAssetPackage(m, [goodAsset(m.id, { url: 'http://cdn.example.com/media/a-0001.mp3' })]),
  },
  {
    letter: 'A7',
    name: 'checksum 形状错（非 sha256:<64 hex>）',
    why: 'checksum 必填且形态固定 ⇒ ASSET_CHECKSUM_SHAPE',
    expect: ['ASSET_CHECKSUM_SHAPE'],
    mutate: (m) => withAssetPackage(m, [goodAsset(m.id, { checksum: 'sha256:ABC' })]),
  },
  {
    letter: 'P1',
    name: '有 assets 但缺包级 licenses 表',
    why: '包级两件套 ⇔ assets 非空（④-3 条件必填）⇒ PACKAGE_LICENSES_REQUIRED',
    expect: ['PACKAGE_LICENSES_REQUIRED'],
    mutate: (m) => {
      const c = clone(m)
      c.provenance = { provider: EXTERNAL }
      c.assets = [goodAsset(m.id)] // 资产自身许可合法 ⇒ 唯一命中来自包级缺表
      return c
    },
  },
  {
    letter: 'P2',
    name: '包级 licenses 表某条判红（CC-BY-NC）',
    why: '包级 licenses 逐条走 decideLicense ⇒ LICENSE_REJECTED（与 S3 同 code 的另一路径）',
    expect: ['LICENSE_REJECTED'],
    mutate: (m) => {
      const c = clone(m)
      c.provenance = { provider: EXTERNAL }
      c.licenses = { bad: { name: 'CC BY-NC 4.0', spdx: 'CC-BY-NC-4.0', commercialUse: true, attributionRequired: true, attribution: '© CC', redistributable: false } }
      return c
    },
  },
  /* —— P18-B 新增：冻结 Plan §4.1 :157/:158/:159/:160 四条此前无机器判据 —— */
  {
    letter: 'S5',
    name: 'source license.commercialUse=false（自有内容也一样拦）',
    why: '§4.1 :157「commercialUse !== true → 拒绝」；判据排在自有哨兵之前 ⇒ 自有内容不豁免分发声明',
    expect: ['LICENSE_REJECTED'],
    mutate: (m) => {
      const c = clone(m)
      c.sources[0].license = { ...c.sources[0].license, commercialUse: false }
      return c
    },
  },
  {
    letter: 'S5b',
    name: 'source license.commercialUse 字段缺失（缺失 = 不 true）',
    why: '§4.1 :157 的「缺失也算不 true」：删掉字段后不得被静默放行（无声明 ≠ 允许商用）',
    expect: ['LICENSE_REJECTED'],
    mutate: (m) => {
      const c = clone(m)
      delete c.sources[0].license.commercialUse
      return c
    },
  },
  {
    letter: 'S6',
    name: 'attributionRequired=true 但无署名文本（外部 MIT）',
    why: '§4.1 :158「attributionRequired === true 但无署名文本 → 拒绝」：license.attribution 缺失 ⇒ rejected',
    expect: ['LICENSE_REJECTED'],
    mutate: (m) => {
      const c = clone(m)
      c.sources[0].provider = EXTERNAL
      c.sources[0].license = { name: 'MIT License', spdx: 'MIT', commercialUse: true, attributionRequired: true, redistributable: true }
      return c
    },
  },
  {
    letter: 'S6b',
    name: '对照组：attributionRequired=true **且**给出署名文本 → 复绿',
    why: '证明 §4.1 :158 判据不是恒红：同一条来源补上 attribution 文本后恢复 allowed（本门判绿）',
    expect: [],
    mutate: (m) => {
      const c = clone(m)
      c.sources[0].provider = EXTERNAL
      c.sources[0].license = { name: 'MIT License', spdx: 'MIT', commercialUse: true, attributionRequired: true, attribution: '© 2026 Acme Records', redistributable: true }
      return c
    },
  },
  {
    letter: 'S7',
    name: 'source 缺 provenance.origin（删掉 sources[0].origin）',
    why: '§4.1 :159「provenance.origin/provider 缺失 → 拒绝」⇒ 独有 code SOURCE_PROVENANCE_MISSING（许可仍 allowed ⇒ 不越界误伤）',
    expect: ['SOURCE_PROVENANCE_MISSING'],
    mutate: (m) => {
      const c = clone(m)
      delete c.sources[0].origin
      return c
    },
  },
  {
    letter: 'S8',
    name: 'sources[].checksum 格式合法但与载荷实体不符',
    why: '§4.1 :160「checksum 与实体不符 → 拒绝」⇒ SOURCE_CHECKSUM_MISMATCH（换成一个 sha256:<64hex> 但≠实体指纹）',
    expect: ['SOURCE_CHECKSUM_MISMATCH'],
    mutate: (m) => {
      const c = clone(m)
      c.sources[0].checksum = `sha256:${'00'.repeat(32)}`
      return c
    },
  },
  /* —— 公开分发声明第三维：license.redistributable（可否再分发）——
   *此前该维度**只存在于 license-policy.mjs 的注释里**，无任何机器判据（假绿盲区）。 */
  {
    letter: 'S9',
    name: 'source license 缺 redistributable（删掉该字段）',
    why: '第三维 fail-closed：「可否再分发」必须**显式**声明。字段缺失 = UNKNOWN ≠ 允许'
      + '（若判绿，「没写」就被当成「可以」—— 正是本条判据要消灭的假绿形态）',
    expect: ['LICENSE_REJECTED'],
    mutate: (m) => {
      const c = clone(m)
      delete c.sources[0].license.redistributable
      return c
    },
  },
  {
    letter: 'S9b',
    name: 'source license.redistributable 非布尔（字符串 "true" 而非 true）',
    why: '第三维要求**布尔**类型：字符串 "false" 是 JS 假值的经典陷阱（typeof判true、比较判false），'
      + '必须显式判红而不是含糊放过',
    expect: ['LICENSE_REJECTED'],
    mutate: (m) => {
      const c = clone(m)
      c.sources[0].license.redistributable = 'true'
      return c
    },
  },
  {
    letter: 'S10',
    name: '对照组：redistributable=false（显式声明「不可再分发」）→ 仍判绿',
    why: '证明第三维不是恒红、且**不越界误伤**：判据只强制「必须表态」，不强制「必须为 true」——'
      + '否则等于用门禁逼所有内容开源。显式 false 是合法且被如实记录的事实（自有专有内容即此档）',
    expect: [],
    mutate: (m) => {
      const c = clone(m)
      c.sources[0].license.redistributable = false
      return c
    },
  },
  {
    letter: 'S11',
    name: '对照组：redistributable=true（显式声明「可再分发」）→ 判绿',
    why: '与 S10 成对：true / false **两档都必须能判绿**，证明判据校验的是「有无显式声明」'
      + '而非「必须为 true」；本轮 13 个词库包即 true 档，构成机器可读的「可开源」白名单',
    expect: [],
    mutate: (m) => {
      const c = clone(m)
      c.sources[0].license.redistributable = true
      return c
    },
  },
  {
    letter: 'M1',
    target: 'plan',
    name: '给冻结 Plan §4.1 表格临时加一行「新规则（本波不应存在）」',
    why: '证明覆盖矩阵对账是**活的**：Plan 有而矩阵无 ⇒ PLAN_4_1_COVERAGE_MISMATCH，且输出必须指名那一行（改完字节级还原，git diff 为空）',
    expect: ['PLAN_4_1_COVERAGE_MISMATCH'],
    // Plan 用例改的是**真 Plan 文件**（docs/p18/，不在 INV-1 冻结区），改完立即按 sha256 字节还原
    mutateText: (t) =>
      t.replace(
        '| Asset 缺 `license` 且无有效 `licenseRef` | **拒绝** |',
        '| Asset 缺 `license` 且无有效 `licenseRef` | **拒绝** |\n| 新规则（本波不应存在） | **拒绝** |',
      ),
  },
]

function falsify() {
  const greenCount = CASES.filter((c) => c.expect.length === 0).length
  const planCount = CASES.filter((c) => c.target === 'plan').length
  console.log('[gate:license] 证伪自检 —— 证明每条判据都能判红（不会失败的门等于没有门）')
  console.log(`  用例 ${CASES.length} 条（含 ${greenCount} 条判绿对照组）；每条：注入故障 → 断言"命中集恰好等于预期" → 字节还原 → 复验复绿`)
  console.log(`  隔离副本：${FALSIFY_CONTENT}（gitignore；真 content/ 只读、绝不被写）`)
  console.log(
    `  边界用例 ${planCount} 条改的是**真冻结 Plan**（${PLAN_FILE.replace(ROOT, '.')}，不在 INV-1 冻结区）：` +
      '改完立刻按 sha256 字节还原，运行后 `git diff` 必须为空\n',
  )

  // 建隔离副本（整树拷贝；后续每次只用字节还原被改的那一个 manifest）
  mkdirSync(FALSIFY_DIR, { recursive: true })
  cpSync(join(ROOT, 'content'), FALSIFY_CONTENT, { recursive: true, force: true })

  let bad = 0
  const results = []

  for (const c of CASES) {
    const isPlan = c.target === 'plan'
    /** 还原基准（真文件）：manifest 用例 = 真 content/ 的原文件；plan 用例 = 真 Plan 自身 */
    const pristineFile = isPlan ? PLAN_FILE : join(ROOT, 'content', BASE_PKG, 'manifest.json')
    /** 被破坏的目标：manifest 用例改隔离副本（绝不动真 content/）；plan 用例改真 Plan */
    const targetFile = isPlan ? PLAN_FILE : join(FALSIFY_CONTENT, BASE_PKG, 'manifest.json')
    const pristine = readFileSync(pristineFile, 'utf8')
    const before = sha(pristineFile)

    let observed = null
    let fatalMsg = null
    let restoreNote = ''

    try {
      /* ---- 植入 ---- */
      let out
      try {
        out = isPlan ? c.mutateText(pristine) : JSON.stringify(c.mutate(JSON.parse(pristine)))
      } catch (e) {
        throw new Fatal(`用例 mutate 抛出异常：${e.message}`)
      }
      if (out === pristine) throw new Fatal('植入空转：mutate 未改变目标文件 —— 这样的"证伪"是假的')
      writeFileSync(targetFile, out)

      /* ---- 观测（与常规模式同一条路径，root 指向副本） ---- */
      observed = runChecks(FALSIFY_CONTENT).hits
    } catch (e) {
      fatalMsg = e instanceof Fatal ? e.message : e.stack
    } finally {
      /* ---- 还原（无论成败）：字节写回 + sha256 真值验收 ---- */
      try {
        writeFileSync(targetFile, pristine)
        const after = sha(targetFile)
        if (after !== before) {
          restoreNote = `sha 不符 ${before} → ${after}`
          bad++
          console.error(`  ‼ ${c.letter} 还原失败（${targetFile} 内容哈希变了）`)
        } else {
          restoreNote = 'bytes'
        }
      } catch (e) {
        restoreNote = 'error'
        bad++
        console.error(`  ‼ ${c.letter} 还原异常：${e.message}`)
      }
    }

    if (fatalMsg) {
      bad++
      results.push(`  ✗ ${c.letter} 证伪执行失败：${fatalMsg}`)
      continue
    }

    /* ---- 断言：命中集精确等于 expect ---- */
    const got = sorted([...observed])
    const want = sorted(c.expect)
    const exact = got.length === want.length && got.every((x, i) => x === want[i])

    /* ---- 复验复绿：还原后本门必须零命中 ---- */
    let green = false
    let greenMsg = ''
    try {
      const r = runChecks(FALSIFY_CONTENT)
      green = r.hits.size === 0
      greenMsg = green ? '' : `还原后仍有命中 {${sorted([...r.hits]).join(',')}}`
    } catch (e) {
      greenMsg = `复验抛 Fatal：${e instanceof Fatal ? e.message : e.message}`
    }
    if (!green) bad++

    if (exact && green) {
      const tag = want.length === 0 ? '恰好判绿（对照组）' : `恰好判红（命中 {${got.join(',')}}）`
      results.push(`  ✓ ${c.letter} ${tag}；还原=${restoreNote}；复验复绿 ✓`)
      results.push(`      ${c.name}`)
      if (want.length > 1) results.push(`      ↳ 预期耦合：${c.why}`)
    } else {
      bad++
      results.push(
        `  ✗ ${c.letter} 未达预期：期望命中 {${want.join(',') || '∅'}}，实际 {${got.join(',') || '∅'}}` +
          (green ? '' : `；且复验未复绿（${greenMsg}）`) +
          ` —— ${c.name}`,
      )
      if (got.length === 0 && want.length > 0) results.push('     该判据是空转的（注入故障后仍判 PASS）')
      else if (!green) results.push('     还原不干净或存在残留故障')
    }
  }

  for (const line of results) console.log(line)

  console.log('──────────────────────────────────────────────────────')
  if (bad === 0) {
    console.log(
      `License Gate Falsification：✅ PASS —— ${CASES.length}/${CASES.length} 用例恰好判红（含 ${greenCount} 条判绿对照组），隔离副本已字节还原，真 content/ 未被写入`,
    )
    process.exit(0)
  }
  console.error(`License Gate Falsification：❌ FAIL —— ${bad} 项问题（存在恒真判据或还原异常 ⇒ 本门不可信）`)
  process.exit(1)
}

/* ------------------------------------------------------------------ *
 * 入口
 * ------------------------------------------------------------------ */

try {
  const { contentDir, falsify: wantFalsify } = parseArgs(process.argv)
  if (wantFalsify) {
    falsify()
  } else {
    const r = runChecks(contentDir)
    for (const l of r.logs) console.log(l)
    for (const e of r.errors) console.error(e)
    console.log('──────────────────────────────────────────────────────')
    if (r.hits.size === 0) {
      console.log(`License Gate: PASS —— packages ${r.packageCount}, violations ${r.violationCount}`)
      process.exit(0)
    }
    console.error(`License Gate: FAIL —— packages ${r.packageCount}, violations ${r.violationCount}`)
    process.exit(1)
  }
} catch (e) {
  if (e instanceof Fatal) {
    console.error(`❌ EXIT=2：${e.message}`)
    process.exit(2)
  }
  throw e
}
