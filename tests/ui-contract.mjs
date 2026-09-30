#!/usr/bin/env node
/**
 * P1.8-D · INV-2 —— **UI 内容契约棘轮门**（tests/ui-contract.mjs）
 *
 * 裁定依据：`docs/p18/P1.8-DESIGN-RULINGS-v1.0.md` §⑧（逐条对应见下）。
 * 判据核心：`scripts/ast/ui-contract-ast.mjs`（AST + 类型判定；本文件只做编排、打印与棘轮比对，
 * 不含任何「什么算违规」的规则逻辑 —— 规则只有一份）。
 *
 * ── 门的性质：**棘轮**（ratchet）────────────────────────────────────────────
 * 基线 = 落地当刻的实测值，写进 `docs/p18/_generated/ui-contract-baseline.json`（**避开 INV-1 冻结区**）。
 * 两个桶是**硬零**（必须 == 0），四个桶是**棘轮**（当前 ≤ 基线，只许降不许升）。
 *
 * ── 三态与退出码（照 scripts/check-bundle.mjs 的既定纪律）──────────────────
 *   PASS / FAIL / UNKNOWN —— **UNKNOWN 视为不通过**（测不出来 ≠ 通过）。
 *   0 = PASS（硬零 2/2、棘轮 4/4、探针全对）
 *   1 = FAIL 或 UNKNOWN（含「扫描到 0 个文件」这类测不出结论的情形）
 *   2 = Fatal —— **基线文件缺失 / 坏 JSON / 桶集合不符 / 未知参数 / 探针目录不可用**。
 *       ⚠️ 这是棘轮门的**头号假绿源**：基线读不到时若当作「计数 0」，所有棘轮桶都会
 *       变成 `0 ≤ 0` 而全绿。故一律 exit 2，**绝不降级成通过**（照 gate-perf.mjs:205-209）。
 *
 * ── 防假绿三道（⑧-5，缺一不可）────────────────────────────────────────────
 *   1. **对照组探针** `tests/fixtures/ui-contract-probe/`（仿 tests/fixtures/boundary-probe）：
 *      断言探针集上六桶的命中数**恰好等于**逐文件预期（双向钳制）——
 *      「恒放行」的实现会让期望非零的 6 个探针失败；「见啥都判红」的实现会让
 *      期望全零的 2 个放行探针（p7/p8）失败。**没有这层，`--falsify` 也可能一起漂。**
 *   2. **扫描非空**：扫到的文件数 > 0，否则记 UNKNOWN（防「扫不到文件 → 0 违规 → 假绿」）。
 *   3. **--falsify**：逐条注入故障 → 断言命中集**精确等于**预期 → 字节还原 → 对照组复绿。
 *      本仓纪律：**不会失败的门等于没有门**，故它作为独立证据任务入 P18 任务表。
 *
 * ── 单向棘轮：`--record-baseline` ──────────────────────────────────────────
 *   录制时若某桶新计数 **>** 旧基线 ⇒ **拒绝写 + exit 2**，除非显式
 *   `--force-raise --reason="..."`（照 gate-perf.mjs 的 REASONS 精神：禁止静默放松）。
 *
 * ── 实现注记 ───────────────────────────────────────────────────────────────
 *   · **不 spawn 任何子进程**（本机预加载 safe-delete / brokered-fs shim，同步 spawn 一律 EBUSY）；
 *     连 `git rev-parse` 都不调用 —— commit 直接读 `.git/HEAD`（含 packed-refs 兜底）。
 *   · 判「文件存在」用 `readdirSync` / `statSync`，不用 `existsSync`（后者会被 brokered-fs shim
 *     缓存误导）；读基线用 `try { readFileSync } catch`。
 *   · 证伪的隔离副本 = `node_modules/.tmp/ui-contract-falsify/`（gitignore），**绝不动真仓库文件**。
 *
 * 用法：
 *   npm run test:ui-contract                # 棘轮判定（CI / 本机）
 *   npm run test:ui-contract:falsify        # 自带证伪自检
 *   node tests/ui-contract.mjs --record-baseline [--force-raise --reason="..."]
 */
import { cpSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BUCKETS,
  BUCKET_KEYS,
  UI_EXTRA_FILES,
  UiContractFatal,
  checkUiContract,
  contentPackageIds,
} from '../scripts/ast/ui-contract-ast.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** 基线落点（⑧-3）：与 P18 证据树同域，**避开** `docs/audit-package/**`（INV-1 冻结区）。 */
const BASELINE_REL = 'docs/p18/_generated/ui-contract-baseline.json'
const BASELINE_JSON = join(ROOT, BASELINE_REL)

/** 对照组探针根（⑧-5-1）。 */
const PROBE_ROOT_REL = 'tests/fixtures/ui-contract-probe'
const PROBE_ROOT = join(ROOT, PROBE_ROOT_REL)

/** 证伪隔离副本（gitignore；真仓库文件只读）。 */
const FALSIFY_DIR = join(ROOT, 'node_modules', '.tmp', 'ui-contract-falsify')
const FALSIFY_PROBE_ROOT = join(FALSIFY_DIR, 'probe-root')

const USAGE = `用法：
  node tests/ui-contract.mjs                       # 棘轮判定（硬零 2 桶 + 棘轮 4 桶 + 对照组探针）
  node tests/ui-contract.mjs --falsify             # 自带证伪自检（证明每条判据分支都能判红）
  node tests/ui-contract.mjs --record-baseline     # 把当前实测写入基线（棘轮换代时人工执行）
  node tests/ui-contract.mjs --record-baseline --force-raise --reason="<书面理由>"
                                                   # 显式允许把某个桶的基线上调（禁止静默放松）

进程内 AST 判定，不 spawn 子进程。未知参数一律 stderr + exit 2。
退出码：0 = PASS / 1 = FAIL 或 UNKNOWN（UNKNOWN 视为不通过）/ 2 = Fatal（基线缺失或坏、未知参数等）`

/** 脚本自身错误（EXIT=2）—— 与「判据不成立（EXIT=1）」严格区分，绝不互相降级。 */
class Fatal extends Error {}

const sorted = (a) => [...a].sort()
const sameSet = (a, b) => a.length === b.length && sorted(a).every((x, i) => x === sorted(b)[i])

/* ------------------------------------------------------------------ *
 * 参数（白名单；未知 ⇒ usage + exit 2）
 * ------------------------------------------------------------------ */

function parseArgs(argv) {
  let mode = 'check' // 'check' | 'record' | 'falsify'
  let forceRaise = false
  let reason = ''
  for (const a of argv.slice(2)) {
    if (a === '--falsify') { mode = 'falsify'; continue }
    if (a === '--record-baseline') { mode = 'record'; continue }
    if (a === '--force-raise') { forceRaise = true; continue }
    if (a.startsWith('--reason=')) { reason = a.slice('--reason='.length); continue }
    throw new Fatal(`未知参数 ${JSON.stringify(a)} —— 本门不接受未知 flag，也不猜测其语义`)
  }
  if (forceRaise && mode !== 'record') throw new Fatal('--force-raise 只能与 --record-baseline 连用')
  if (reason && mode !== 'record') throw new Fatal('--reason 只能与 --record-baseline 连用')
  if (forceRaise && reason.trim() === '') {
    throw new Fatal('--force-raise 必须带非空 --reason="..."（棘轮放松必须留下书面理由，禁止静默放松）')
  }
  return { mode, forceRaise, reason }
}

/* ------------------------------------------------------------------ *
 * 基线读写（fail-closed：读不到 / JSON 坏 / 桶集合不符 ⇒ 一律 Fatal）
 * ------------------------------------------------------------------ */

/**
 * 读基线。任何不可用情形都返回 `{ ok:false, reason }` 而不是抛异常 ——
 * 让调用方显式决定「这是 Fatal（exit 2）」还是「这是可复用的坏输入（证伪用例）」。
 */
export function readBaseline(path = BASELINE_JSON) {
  let raw
  try {
    raw = readFileSync(path, 'utf8')
  } catch (e) {
    return { ok: false, reason: `基线文件读不到（${path}）— ${e.message}` }
  }
  let doc
  try {
    doc = JSON.parse(raw)
  } catch (e) {
    return { ok: false, reason: `基线文件不是合法 JSON — ${e.message}` }
  }
  const b = doc?.buckets
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { ok: false, reason: '基线缺 `buckets` 对象' }
  for (const k of BUCKET_KEYS) {
    const v = b[k]
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
      return { ok: false, reason: `基线 buckets.${k} 缺失或不是非负整数（实测 ${JSON.stringify(v)}）` }
    }
  }
  const extra = Object.keys(b).filter((k) => !BUCKET_KEYS.includes(k))
  if (extra.length) {
    return { ok: false, reason: `基线含未知桶 ${extra.join(', ')}（桶集合是单一事实源，拒绝静默忽略）` }
  }
  return { ok: true, doc, buckets: b }
}

/** 读 `.git/HEAD` 取 commit（**不 spawn git**）。取不到返回 'unknown'。 */
function gitHead() {
  try {
    const head = readFileSync(join(ROOT, '.git', 'HEAD'), 'utf8').trim()
    if (!head.startsWith('ref: ')) return head || 'unknown'
    const ref = head.slice(5).trim()
    try {
      return readFileSync(join(ROOT, '.git', ref), 'utf8').trim()
    } catch {
      /* 可能被打包进 packed-refs */
    }
    try {
      for (const line of readFileSync(join(ROOT, '.git', 'packed-refs'), 'utf8').split('\n')) {
        const m = /^([0-9a-f]{40})\s+(.+)$/.exec(line.trim())
        if (m && m[2] === ref) return m[1]
      }
    } catch {
      /* 无 packed-refs */
    }
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

/* ------------------------------------------------------------------ *
 * 纯判定（可被 --falsify 直接驱动）
 * ------------------------------------------------------------------ */

/**
 * 输入（当前计数 / 基线 / 扫描文件数）→ 三态结果。**纯函数**，无 IO、无打印。
 * 返回 `{ checks: [{id, status, msg}], fail: string[], unknown: string[] }`。
 */
export function decide({ counts, baseline, scanned }) {
  const checks = []
  const fail = []
  const unknown = []

  if (!(scanned > 0)) {
    checks.push({ id: 'SCAN-NONEMPTY', status: 'UNKNOWN', msg: `扫描到 ${scanned} 个文件（要求 > 0）—— 扫不到文件时的 0 违规不是通过` })
    unknown.push('SCAN-NONEMPTY')
  } else {
    checks.push({ id: 'SCAN-NONEMPTY', status: 'PASS', msg: `扫描到 ${scanned} 个文件` })
  }

  for (const b of BUCKETS.filter((x) => x.rule === 'zero')) {
    const id = `ZERO-${b.key}`
    const cur = counts[b.key]
    if (cur === 0) checks.push({ id, status: 'PASS', msg: `${b.key} = 0（硬零：${b.contract}，单位=${b.unit}）` })
    else {
      checks.push({ id, status: 'FAIL', msg: `${b.key} = ${cur}（硬零桶必须为 0；${b.contract}，单位=${b.unit}）` })
      fail.push(id)
    }
  }

  for (const b of BUCKETS.filter((x) => x.rule === 'ratchet')) {
    const id = `RATCHET-${b.key}`
    const cur = counts[b.key]
    const base = baseline == null ? null : baseline[b.key]
    if (base == null) {
      checks.push({ id, status: 'UNKNOWN', msg: `${b.key} 无可用基线值（当前 ${cur}）—— 没有基线就无法判定棘轮` })
      unknown.push(id)
      continue
    }
    if (cur <= base) checks.push({ id, status: 'PASS', msg: `${b.key} 当前 ${cur} ≤ 基线 ${base}（余量 ${base - cur}）` })
    else {
      checks.push({ id, status: 'FAIL', msg: `${b.key} 当前 ${cur} > 基线 ${base}（棘轮只许降不许升；新增直读必须改走门面或走 --force-raise 留痕）` })
      fail.push(id)
    }
  }

  return { checks, fail, unknown }
}

/* ------------------------------------------------------------------ *
 * 对照组探针期望表（⑧-5-1）
 * ------------------------------------------------------------------ */

/**
 * 逐文件、逐桶的**精确**期望命中数。缺省 0。
 * 这是「断言空转」的解药：期望非零 ⇒ 恒放行实现必失败；期望全零 ⇒ 见啥都判红实现必失败。
 * 刻意把**没写进本表**的探针文件也判 FAIL（新增探针必须同步登记，不允许静默入组）。
 */
export const PROBE_EXPECT = [
  { file: '_support/wordBanks.ts', buckets: {}, note: '替身夹具：只提供形状与导出名、不实现行为 ⇒ 自身零违规' },
  { file: 'p1-table-json-import.probe.ts', buckets: { tableJsonImports: 2 }, note: '静态 + 动态 import 词表 JSON' },
  { file: 'p2-package-branch.probe.ts', buckets: { packageBranches: 1 }, note: '1 命中 + 3 条同型反例（主题 id / 前缀）不得命中' },
  { file: 'p3-word-table-source.probe.ts', buckets: { wordTableSources: 2, handleReads: 2 }, note: 'X.words 来源点 + 成员读 + 下标读' },
  { file: 'p4-banned-array-ops.probe.ts', buckets: { wordTableSources: 1, handleReads: 1, bannedArrayOps: 3 }, note: '换行链式 filter/slice/map —— 单行正则只命中 1/3' },
  { file: 'p5-handle-reads.probe.ts', buckets: { wordTableSources: 2, handleReads: 3 }, note: '按名锚点 bankWords + wordBanks 值导入 API + 透传' },
  { file: 'p6-bypass-facade.probe.ts', buckets: { bypassFacadeImports: 1 }, note: '深路径直引命中；门面直引与 type-only 直引放行' },
  { file: 'p7-type-only-negative.probe.ts', buckets: {}, note: '**放行**：type-only 引用无运行时耦合' },
  { file: 'p8-false-positive-guards.probe.ts', buckets: {}, note: '**放行**：常量数组 filter / Record 上的四算子链（正则必错的假阳）' },
]

/** 把 violations 按文件聚合为每桶计数。 */
function countsByFile(violations) {
  const out = new Map()
  for (const v of violations) {
    const rec = out.get(v.file) ?? Object.fromEntries(BUCKET_KEYS.map((k) => [k, 0]))
    rec[v.bucket]++
    out.set(v.file, rec)
  }
  return out
}

/* ------------------------------------------------------------------ *
 * 正常判定
 * ------------------------------------------------------------------ */

function runCheck() {
  let pass = 0
  let fail = 0
  const ok = (name, cond, detail = '') => {
    if (cond) { pass++; console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`) }
    else { fail++; console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`) }
  }

  const base = readBaseline()
  if (!base.ok) throw new Fatal(`${base.reason}；棘轮门缺基线时**绝不**把计数当作 0（头号假绿源）—— 先跑 node tests/ui-contract.mjs --record-baseline`)

  const real = checkUiContract()
  const counts = real.buckets

  console.log('== P18-D · UI 内容契约棘轮门（INV-2 · tests/ui-contract.mjs）==')
  console.log(`扫描范围 = UI_SCOPE_RE ∪ UI_EXTRA_FILES(${JSON.stringify(UI_EXTRA_FILES)})`)
  console.log(`扫描到 ${real.scanned} 个文件；内容包 id 集合 ${contentPackageIds().size} 个（从 content/ 派生）；AST 判定耗时 ${real.durationMs.toFixed(0)}ms`)
  const baselineAge = base.doc?.meta?.generatedAt ?? '（无 meta.generatedAt）'
  console.log(`基线 ${BASELINE_REL}（记录于 ${baselineAge}）\n`)

  /* —— 1. 判据（决策层，纯函数） —— */
  const dec = decide({ counts, baseline: base.buckets, scanned: real.scanned })
  for (const c of dec.checks) {
    ok(`${c.id} [${c.status}]`, c.status === 'PASS', c.msg)
  }

  /* —— 2. 扫描范围自证：⑧-4 显式追加的 wordResolve.ts 必须在扫描集里 —— */
  ok(
    `⑧-4 显式追加文件已纳入扫描（${UI_EXTRA_FILES.join(', ')}）`,
    UI_EXTRA_FILES.every((f) => real.files.includes(f)),
    UI_EXTRA_FILES.every((f) => real.files.includes(f)) ? '在扫描集内' : '不在扫描集内 —— 那次直读会「躲在被调函数里」绕过棘轮',
  )

  /* —— 3. 对照组探针（双向钳制） —— */
  let probeStat = { scaled: 0, files: 0, nonZero: 0, allZero: 0, bad: 0 }
  try {
    const probe = checkUiContract({ scanRoot: PROBE_ROOT })
    const byFile = countsByFile(probe.violations)
    const expectFiles = PROBE_EXPECT.map((e) => `${PROBE_ROOT_REL}/${e.file}`).sort()
    const scannedFiles = [...probe.files].sort()

    ok('对照组：探针扫描集与期望表**逐一对应**（无未登记探针）', sameSet(scannedFiles, expectFiles),
      sameSet(scannedFiles, expectFiles)
        ? `${scannedFiles.length} 个探针文件`
        : `扫描 ${scannedFiles.length} 个 vs 期望表 ${expectFiles.length} 个；差集 ${JSON.stringify([
            ...scannedFiles.filter((f) => !expectFiles.includes(f)),
            ...expectFiles.filter((f) => !scannedFiles.includes(f)),
          ])}`)

    for (const e of PROBE_EXPECT) {
      const rel = `${PROBE_ROOT_REL}/${e.file}`
      const actual = byFile.get(rel) ?? Object.fromEntries(BUCKET_KEYS.map((k) => [k, 0]))
      const expect = Object.fromEntries(BUCKET_KEYS.map((k) => [k, e.buckets[k] ?? 0]))
      const same = BUCKET_KEYS.every((k) => actual[k] === expect[k])
      if (!same) probeStat.bad++
      const expectTotal = BUCKET_KEYS.reduce((a, k) => a + expect[k], 0)
      if (expectTotal > 0) probeStat.nonZero++
      else probeStat.allZero++
      ok(
        `探针 ${e.file} 命中数恰好等于预期`,
        same,
        same
          ? expectTotal === 0
            ? '六桶全 0（放行样本）'
            : `{${BUCKET_KEYS.filter((k) => expect[k] > 0).map((k) => `${k}=${expect[k]}`).join(', ')}}`
          : `实际 {${BUCKET_KEYS.filter((k) => actual[k] > 0).map((k) => `${k}=${actual[k]}`).join(', ') || '全 0'}} vs 预期 {${BUCKET_KEYS.filter((k) => expect[k] > 0).map((k) => `${k}=${expect[k]}`).join(', ') || '全 0'}} —— ${e.note}`,
      )
    }
    probeStat.files = scannedFiles.length

    ok('对照组双向钳制成立（同时存在「期望非零」与「期望全零」样本）',
      probeStat.nonZero > 0 && probeStat.allZero > 0,
      `期望非零 ${probeStat.nonZero} 个 / 期望全零 ${probeStat.allZero} 个 —— 缺任一侧都会让「恒放行」或「恒判红」的实现蒙过去`)
  } catch (e) {
    ok('对照组探针可运行', false, `${e instanceof UiContractFatal ? e.message : e.stack}`)
  }

  /* —— 汇总 —— */
  console.log('──────────────────────────────────────────────────────')
  console.log(`共 ${pass + fail} 项，通过 ${pass}，失败 ${fail}`)
  if (fail > 0) {
    console.error(`UI Content Contract：❌ FAIL —— ${fail} 项不通过（UNKNOWN 视为不通过；棘轮放松必须走 --record-baseline --force-raise --reason）`)
    process.exit(1)
  }
  console.log(
    `UI Content Contract：✅ PASS —— 硬零 2/2、棘轮 4/4、探针 ${probeStat.files} 个全对；` +
      `计数 ${BUCKET_KEYS.map((k) => `${k}=${counts[k]}`).join(' ')}`,
  )
  process.exit(0)
}

/* ------------------------------------------------------------------ *
 * 录制基线（单向棘轮：上调必须显式 --force-raise --reason）
 * ------------------------------------------------------------------ */

function runRecord({ forceRaise, reason }) {
  const real = checkUiContract()
  if (real.scanned <= 0) {
    throw new Fatal(`扫描到 ${real.scanned} 个文件 —— 空扫描不得落基线（会把「什么都没扫到」固化成合法基线）`)
  }
  const brokenZero = BUCKETS.filter((b) => b.rule === 'zero' && real.buckets[b.key] !== 0)
  if (brokenZero.length) {
    throw new Fatal(
      `硬零桶当前不为 0（${brokenZero.map((b) => `${b.key}=${real.buckets[b.key]}`).join(', ')}）—— ` +
        '把「已经判红的状态」录成基线毫无意义，先修根因再录制',
    )
  }

  const old = readBaseline()
  if (old.ok) {
    const raised = BUCKET_KEYS.filter((k) => real.buckets[k] > old.buckets[k])
    if (raised.length && !forceRaise) {
      console.error('❌ 拒绝写基线：下列桶的计数**高于**现有基线（棘轮只许降不许升）：')
      for (const k of raised) console.error(`   ${k}: ${old.buckets[k]} → ${real.buckets[k]}（+${real.buckets[k] - old.buckets[k]}）`)
      console.error('如确需放松棘轮，请显式：node tests/ui-contract.mjs --record-baseline --force-raise --reason="<书面理由>"')
      console.error('（禁止静默放松：抬升必须留痕，同 gate-perf.mjs 的 REASONS 纪律）')
      process.exit(2)
    }
    if (raised.length) {
      console.log(`⚠️ --force-raise 生效，记录棘轮抬升 —— reason: ${reason}`)
      for (const k of raised) console.log(`   ${k}: ${old.buckets[k]} → ${real.buckets[k]}（+${real.buckets[k] - old.buckets[k]}）`)
    } else {
      console.log('✓ 无桶上调（或全部持平/下降），按单向棘轮正常落盘')
    }
  } else {
    console.log(`（无可用旧基线：${old.reason}）→ 首次落盘`)
  }

  const doc = {
    schemaVersion: 1,
    buckets: real.buckets,
    meta: {
      generatedAt: new Date().toISOString(),
      commit: gitHead(),
      node: process.version,
      scannedFiles: real.scanned,
      scanner: 'scripts/ast/ui-contract-ast.mjs',
      scope: {
        uiScope: 'src/App.tsx, src/main.tsx, src/components/**, src/hooks/**',
        explicitExtraFiles: [...UI_EXTRA_FILES],
        note: 'UI_EXTRA_FILES 见 P1.8-DESIGN-RULINGS v1.0 §⑧-4（不纳入则该次直读会躲在被调函数里绕过棘轮）',
      },
      rules: Object.fromEntries(BUCKETS.map((b) => [b.key, b.rule === 'zero' ? '== 0（硬零）' : '≤ 基线（棘轮，只许降不许升）'])),
      caveat:
        '基线 = 落地当刻实测；两个硬零桶不得上调（--record-baseline 会直接拒绝），四个棘轮桶上调必须 --force-raise --reason。CONTENT_CONTRACT §12.6 的旧基线已作废（App.tsx 957→447 行后行号全失效），一切以本文件实测为准。',
    },
  }
  mkdirSync(dirname(BASELINE_JSON), { recursive: true })
  writeFileSync(BASELINE_JSON, `${JSON.stringify(doc, null, 2)}\n`, 'utf8')
  console.log(`\n[ui-contract] 基线已记录 → ${BASELINE_REL}`)
  console.log(`  ${BUCKET_KEYS.map((k) => `${k}=${real.buckets[k]}`).join('  ')}`)
  console.log(`  scannedFiles=${real.scanned}  commit=${doc.meta.commit.slice(0, 12)}`)
  process.exit(0)
}

/* ------------------------------------------------------------------ *
 * 证伪自检（证明每条判据分支都能判红；含字节注入 → 精确命中 → 字节还原 → 复绿）
 * ------------------------------------------------------------------ */

/**
 * 探测器层用例（Group C）：把一段**违规源码**写进隔离副本的扫描根，
 * 断言六桶的增量**恰好等于**预期；随后用 pristine 字节还原，断言增量归零（对照组复绿）。
 */
const DETECTOR_CASES = [
  {
    letter: 'C1',
    bucket: 'tableJsonImports',
    name: '直读词表 JSON（静态 import）',
    src: () => `import words from './_support/words.json'\nexport const W = words\n`,
    expect: { tableJsonImports: 1 },
  },
  {
    letter: 'C2',
    bucket: 'packageBranches',
    name: '内容包 id 分支',
    src: () => `declare const p: string\nexport const x = p === 'ielts'\n`,
    expect: { packageBranches: 1 },
  },
  {
    letter: 'C3',
    bucket: 'wordTableSources',
    name: '词表来源点（X.words，无读操作）',
    src: () => `import type { WordBank } from './_support/wordBanks'\nexport function f(b: WordBank) {\n  return b.words\n}\n`,
    expect: { wordTableSources: 1 },
  },
  {
    letter: 'C4',
    bucket: 'handleReads',
    name: '句柄读（按名锚点 bankWords.length，不掺 wordTableSources）',
    src: () => `import type { WordItem } from './_support/wordBanks'\ndeclare const bankWords: WordItem[]\nexport function f() {\n  return bankWords.length\n}\n`,
    expect: { handleReads: 1 },
  },
  {
    letter: 'C5',
    bucket: 'bannedArrayOps',
    name: 'WordItem[] 上的禁用算子（不掺 wordTableSources）',
    src: () => `import type { WordItem } from './_support/wordBanks'\ndeclare const xs: WordItem[]\nexport function f() {\n  return xs.filter((w) => !!w)\n}\n`,
    expect: { bannedArrayOps: 1 },
  },
  {
    letter: 'C6',
    bucket: 'bypassFacadeImports',
    name: '绕过门面直引 core/content/** 深路径',
    src: () => {
      const rel = relative(FALSIFY_PROBE_ROOT, join(ROOT, 'src', 'core', 'content', 'catalog', 'catalog')).replaceAll('\\', '/')
      const spec = rel.startsWith('.') ? rel : `./${rel}`
      return `import { getCatalog } from '${spec}'\nexport const c = getCatalog()\n`
    },
    expect: { bypassFacadeImports: 1 },
  },
]

function falsify() {
  const sum = (o) => BUCKET_KEYS.reduce((a, k) => a + (o[k] ?? 0), 0)
  const delta = (a, b) => Object.fromEntries(BUCKET_KEYS.map((k) => [k, (a[k] ?? 0) - (b[k] ?? 0)]))

  console.log('[ui-contract] 证伪自检 —— 证明每条判据分支都能判红（不会失败的门等于没有门）')
  console.log('  三组用例：A 决策层各分支精确判红 / B 输入层 fail-closed（基线缺失·坏 JSON）/ C 探测器层字节注入→精确命中→字节还原→复绿')
  console.log(`  隔离副本：${relative(ROOT, FALSIFY_DIR).replaceAll('\\', '/')}（gitignore；真仓库文件只读）\n`)

  let bad = 0
  let total = 0
  const lines = []

  /* ---- 先备好真基线（A 组需要它作为「无故障」基准） ---- */
  const realBase = readBaseline()
  if (!realBase.ok) throw new Fatal(`证伪需要一份可用基线作对照：${realBase.reason}；先跑 --record-baseline`)
  const realScan = checkUiContract()
  const realCounts = realScan.buckets
  const realScanned = realScan.scanned

  /* ================= A. 决策层：每条判据分支恰好判红 ================= */
  const A_CASES = [
    { letter: 'A1', name: '注入 tableJsonImports=1（硬零桶）', mutate: (s) => ({ counts: { ...s.counts, tableJsonImports: 1 } }), expectFail: ['ZERO-tableJsonImports'], expectUnknown: [] },
    { letter: 'A2', name: '注入 packageBranches=1（硬零桶）', mutate: (s) => ({ counts: { ...s.counts, packageBranches: 1 } }), expectFail: ['ZERO-packageBranches'], expectUnknown: [] },
    { letter: 'A3', name: 'wordTableSources 抬到 基线+1', mutate: (s) => ({ counts: { ...s.counts, wordTableSources: s.baseline.wordTableSources + 1 } }), expectFail: ['RATCHET-wordTableSources'], expectUnknown: [] },
    { letter: 'A4', name: 'handleReads 抬到 基线+1', mutate: (s) => ({ counts: { ...s.counts, handleReads: s.baseline.handleReads + 1 } }), expectFail: ['RATCHET-handleReads'], expectUnknown: [] },
    { letter: 'A5', name: 'bannedArrayOps 抬到 基线+1', mutate: (s) => ({ counts: { ...s.counts, bannedArrayOps: s.baseline.bannedArrayOps + 1 } }), expectFail: ['RATCHET-bannedArrayOps'], expectUnknown: [] },
    { letter: 'A6', name: 'bypassFacadeImports 抬到 基线+1', mutate: (s) => ({ counts: { ...s.counts, bypassFacadeImports: s.baseline.bypassFacadeImports + 1 } }), expectFail: ['RATCHET-bypassFacadeImports'], expectUnknown: [] },
    { letter: 'A7', name: '扫描到 0 个文件（⇒ UNKNOWN，不通过）', mutate: (s) => ({ scanned: 0 }), expectFail: [], expectUnknown: ['SCAN-NONEMPTY'] },
    {
      letter: 'A8',
      name: '基线不可用（按 0 处理会全绿 ⇒ 必须走 Fatal）',
      mutate: () => ({ baseline: null }),
      expectFail: [],
      expectUnknown: ['RATCHET-wordTableSources', 'RATCHET-handleReads', 'RATCHET-bannedArrayOps', 'RATCHET-bypassFacadeImports'],
      note: '四个棘轮桶全部退化为 UNKNOWN（不是 PASS）—— 证明「基线读不到 ⇒ 当 0 ⇒ 全绿」这条假绿路径不存在',
    },
    { letter: 'ACTRL', name: '对照组：不注入任何故障 ⇒ 九条判据全 PASS', mutate: (s) => s, expectFail: [], expectUnknown: [] },
  ]

  const baseState = { counts: realCounts, baseline: realBase.buckets, scanned: realScanned }
  for (const c of A_CASES) {
    total++
    let res
    try {
      res = decide({ ...baseState, ...c.mutate(baseState) })
    } catch (e) {
      bad++
      lines.push(`  ✗ ${c.letter} 注入失败：${e.message}`)
      continue
    }
    const exact = sameSet(res.fail, c.expectFail) && sameSet(res.unknown, c.expectUnknown)
    const pass = c.expectFail.length === 0 && c.expectUnknown.length === 0
    if (exact) {
      lines.push(
        `  ✓ ${c.letter} ${pass ? '恰好判绿（对照组）' : `恰好判红（fail={${res.fail.join(',') || '∅'}} unknown={${res.unknown.join(',') || '∅'}}）`}`,
      )
      lines.push(`      ${c.name}`)
      if (c.note) lines.push(`      ↳ ${c.note}`)
    } else {
      bad++
      lines.push(
        `  ✗ ${c.letter} 未达预期：期望 fail={${c.expectFail.join(',') || '∅'}} unknown={${c.expectUnknown.join(',') || '∅'}}，` +
          `实际 fail={${res.fail.join(',') || '∅'}} unknown={${res.unknown.join(',') || '∅'}} —— ${c.name}`,
      )
    }
  }

  /* ================= B. 输入层 fail-closed（基线读不到 / 坏 JSON） ================= */
  mkdirSync(FALSIFY_DIR, { recursive: true })
  const B_CASES = [
    { letter: 'B1', name: '基线文件缺失 ⇒ readBaseline ok=false ⇒ 入口 exit 2', path: join(FALSIFY_DIR, 'absent-baseline.json'), write: null },
    {
      letter: 'B2',
      name: '基线 JSON 损坏 ⇒ readBaseline ok=false ⇒ 入口 exit 2',
      path: join(FALSIFY_DIR, 'broken-baseline.json'),
      write: '{"buckets": {"tableJsonImports": 0, "packageBranches":',
    },
    {
      letter: 'B3',
      name: '基线桶集合不全（缺桶 ⇒ 不得当成 0）',
      path: join(FALSIFY_DIR, 'missing-bucket-baseline.json'),
      write: `${JSON.stringify({ schemaVersion: 1, buckets: { tableJsonImports: 0, packageBranches: 0 } }, null, 2)}\n`,
    },
  ]
  for (const c of B_CASES) {
    total++
    if (c.write !== null) writeFileSync(c.path, c.write, 'utf8')
    const r = readBaseline(c.path)
    const okFatal = r.ok === false
    if (okFatal) {
      lines.push(`  ✓ ${c.letter} 恰好判 Fatal（exit 2），且**没有**把缺失当成计数 0`)
      lines.push(`      ${c.name}`)
      lines.push(`      ↳ ${r.reason}`)
    } else {
      bad++
      lines.push(`  ✗ ${c.letter} 未判 Fatal：${c.name} —— 基线不可用却仍返回 ok=true（这正是棘轮门的头号假绿源）`)
    }
  }

  /* ================= C. 探测器层：字节注入 → 精确命中 → 字节还原 → 复绿 ================= */
  mkdirSync(join(FALSIFY_PROBE_ROOT, '_support'), { recursive: true })
  const supportFile = join(FALSIFY_PROBE_ROOT, '_support', 'wordBanks.ts')
  const pristineSupport = readFileSync(join(PROBE_ROOT, '_support', 'wordBanks.ts'), 'utf8')
  const pristineCase = 'export {}\n'
  const caseFile = join(FALSIFY_PROBE_ROOT, 'probe.ts')
  writeFileSync(supportFile, pristineSupport, 'utf8')
  writeFileSync(caseFile, pristineCase, 'utf8')

  const scratchRun = () => checkUiContract({ scanRoot: FALSIFY_PROBE_ROOT }).buckets
  let scratchBase
  try {
    scratchBase = scratchRun()
  } catch (e) {
    throw new Fatal(`隔离副本暂存失败（无法建立对照组基线）：${e instanceof UiContractFatal ? e.message : e.message}`)
  }
  total++
  if (sameSet(Object.keys(scratchBase), BUCKET_KEYS)) {
    lines.push(`  ✓ C0 对照组：隔离副本 pristine 状态六桶全 0（基线 {${BUCKET_KEYS.map((k) => `${k}=${scratchBase[k]}`).join(', ')}}）`)
  } else {
    bad++
    lines.push(`  ✗ C0 隔离副本 pristine 状态不为全 0 —— C 组用例失去对照意义`)
  }

  for (const c of DETECTOR_CASES) {
    total++
    try {
      writeFileSync(caseFile, c.src(), 'utf8')
      const got = scratchRun()
      const d = delta(got, scratchBase)
      const changed = BUCKET_KEYS.filter((k) => d[k] !== 0)
      const expectChanged = BUCKET_KEYS.filter((k) => (c.expect[k] ?? 0) !== 0)
      const exact =
        changed.length === expectChanged.length &&
        expectChanged.every((k) => d[k] === c.expect[k])
      if (exact) {
        lines.push(`  ✓ ${c.letter} 探测器恰好判红（增量 {${expectChanged.map((k) => `${k}+${c.expect[k]}`).join(', ')}}）`)
        lines.push(`      ${c.name}`)
      } else {
        bad++
        lines.push(
          `  ✗ ${c.letter} 增量不符：期望 {${expectChanged.map((k) => `${k}+${c.expect[k]}`).join(', ')}}，实际 {${changed.map((k) => `${k}${d[k] > 0 ? '+' : ''}${d[k]}`).join(', ') || '无'}} —— ${c.name}`,
        )
      }
    } finally {
      /* ---- 字节还原（无论成败）：写回 pristine，随后复绿必须成立 ---- */
      writeFileSync(caseFile, pristineCase, 'utf8')
    }
    const after = scratchRun()
    const d2 = delta(after, scratchBase)
    if (sum(d2) === 0) {
      lines.push('      ↳ 字节还原 ✓，对照组复绿 ✓（增量归零）')
    } else {
      bad++
      lines.push(`      ↳ ✗ 还原后仍有增量 {${BUCKET_KEYS.filter((k) => d2[k] !== 0).map((k) => `${k}${d2[k]}`).join(', ')}}（还原不干净）`)
    }
  }

  /* ---- 真仓库文件未被写：真基线 + 真探针目录 sha256 前后一致 ---- */
  const sha = (p) => readFileSync(p)
  writeFileSync(supportFile, pristineSupport, 'utf8') // 幂等：确保副本也是 pristine
  const realBaselineIntact = readBaseline().ok && readBaseline().buckets.tableJsonImports === realBase.buckets.tableJsonImports
  const realProbeIntact = sha(join(PROBE_ROOT, '_support', 'wordBanks.ts')).equals(sha(join(FALSIFY_PROBE_ROOT, '_support', 'wordBanks.ts')))
  total++
  if (realBaselineIntact && realProbeIntact) {
    lines.push('  ✓ CTRL 真仓库只读：真基线可读且未被改写，真探针夹具与副本逐字节一致')
  } else {
    bad++
    lines.push(`  ✗ CTRL 真仓库只读被破坏：baselineIntact=${realBaselineIntact} probeIntact=${realProbeIntact}`)
  }

  for (const l of lines) console.log(l)
  console.log('──────────────────────────────────────────────────────')
  if (bad === 0) {
    console.log(`✓ falsify: ${total - bad}/${total} 恰好判红（含 1 条全 PASS 决策对照组 + 1 条 pristine 探测器对照组 + 1 条真仓库只读对照）`)
    process.exit(0)
  }
  console.error(`✗ falsify: FAIL —— ${bad} 项问题（存在恒真/恒红判据、越界误伤或还原不干净 ⇒ 本门不可信）`)
  process.exit(1)
}

/* ------------------------------------------------------------------ *
 * 入口
 * ------------------------------------------------------------------ */

try {
  const { mode, forceRaise, reason } = parseArgs(process.argv)
  if (mode === 'falsify') falsify()
  else if (mode === 'record') runRecord({ forceRaise, reason })
  else runCheck()
} catch (e) {
  if (e instanceof Fatal || e instanceof UiContractFatal) {
    console.error(`❌ EXIT=2：${e.message}`)
    console.error(`\n${USAGE}`)
    process.exit(2)
  }
  throw e
}
