#!/usr/bin/env node
/* C 步 · 判据 L1 —— lint warnings 只许降不许升（棘轮）
 *
 * 为什么需要这条：
 *   H1–H5 把 oxlint warnings 从 53 压到 10，但**没有任何机器守着这个数**。
 *   没有棘轮的卫生工作会边清边长 —— 下一批新代码一进来，53 就又回来了，
 *   而没人会在 code review 里为一个「warning 数从 12 变 13」的 diff 报警。
 *   本门把「warnings 只许降」变成机器判据，形态对齐既有先例：
 *   gate-perf.mjs 的 --record-baseline 落盘 perf-baseline.json。
 *
 * 判定（三态退出码，与项目其它门一致）：
 *   基线缺失                       ⇒ UNKNOWN，EXIT=2（**不是放行** —— 缺基线要看清原因，别悄悄过）
 *   当前 total > 基线 total         ⇒ FAIL，EXIT=1
 *   任一规则当前值 > 该规则基线值     ⇒ FAIL，EXIT=1（比总数棘轮更严：总数可能因规则迁移而假性持平）
 *   否则                           ⇒ PASS，EXIT=0
 *
 * 基线：docs/p18/_generated/_baselines/lint-warnings.json，由 --record-baseline 写入并随仓库提交。
 *
 * 边界（重要）：
 *   - 本门**不改** `npm run lint` 的行为（它仍 EXIT=0，只报 warnings），只在外面包一层基线比对。
 *     避免「为了让门绿去关规则」这种反向激励 —— 想降 total 只能真的改代码。
 *   - 本门**不进** release-gate 的 43 项（那是 P18 的闭合证据，C 步是新门，混进去会污染波次证据）。
 *
 * 用法：
 *   node scripts/gate-lint.mjs                      # 判定（CI / 本机）
 *   node scripts/gate-lint.mjs --record-baseline    # 写入/更新基线（只许降，不许升）
 *   node scripts/gate-lint.mjs --falsify            # 自带证伪自检（判据能判红）
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BASELINE = join(ROOT, 'docs', 'p18', '_generated', '_baselines', 'lint-warnings.json')

/** 证伪注入用的临时文件：放在 scripts/ 下，必定被 oxlint 扫到 */
const FALSIFY_TMP = join(ROOT, 'scripts', '_gate_lint_falsify_tmp.mjs')
/**
 * 证伪注入用最小文件（用完即删）：一个**真没被用上**的顶层 const + 一个被用到的 import。
 *
 * ⚠️ 注入内容必须真的产生诊断，否则「证伪」会变成一条永远绿的自检 —— 这个坑我踩过一次：
 * 第一版写成 `import { readFileSync } from 'node:fs'\nexport default readFileSync`，
 * 结果 readFileSync 在 export 里被用掉了、没有未用绑定 ⇒ oxlint 报 0 条 ⇒ 判据看似 PASS，
 * 实际是注入失效。判定 `no-unused-vars` 时请先看 `--falsify` 的输出里有没有
 * 「证伪① OK：… ⇒ FAIL」这一行，没有就是注入没生效，不是判据通过。
 */
const FALSIFY_TMP_SRC = `// 证伪注入用临时文件（gate-lint --falsify 用完即删）
import { readFileSync } from 'node:fs'
const gateLintFalsifyUnused = 1
console.log(readFileSync)
export default 1
`

/* ------------------------------- measure ------------------------------- */

/** 跑 oxlint 的 JSON 输出，解析 diagnostics[]。任何异常都抛（宁可 UNKNOWN 也不猜一个假数）。 */
function measure() {
  // 必须用 `node <path>` 调 node_modules/oxlint/bin/oxlint：
  // 它本体是个 ESM node 脚本（`#!/usr/bin/env node` + `import "../dist/cli.js"`），
  // 既不是 .js 也不是原生 exe —— 直接 spawn 这个无扩展名文件会得到 ENOENT，
  // 直接 node 它但路径写错（写成 bin/oxlint.js）会拿到 loader 报错、stdout 不是 JSON。
  // 有 warnings 时 oxlint exit=1，那是正常的「扫到东西」，只看输出不看退出码。
  const r = spawnSync(
    process.execPath,
    [join('node_modules', 'oxlint', 'bin', 'oxlint'), '--format=json'],
    { cwd: ROOT, encoding: 'utf8' }
  )
  if (r.error) throw r.error
  // oxlint 有 warnings 时退出码为 1，那是正常的「扫到东西」；这里只看输出。
  const out = r.stdout || ''
  let j = null
  try {
    j = JSON.parse(out)
  } catch {
    throw new Error(`oxlint 输出不是 JSON（exit=${r.status}）：\n${out.slice(0, 500)}`)
  }
  const diags = Array.isArray(j.diagnostics) ? j.diagnostics : []
  const byRule = {}
  for (const d of diags) {
    if (typeof d.code !== 'string') continue
    byRule[d.code] = (byRule[d.code] || 0) + 1
  }
  return { total: diags.length, byRule }
}

/* ------------------------------- decide ------------------------------- */

/**
 * 只做「测量 vs 基线」的比较，不碰文件系统状态 —— 证伪自检直接复用它，
 * 不靠重跑整个门。
 * @returns {{status:'PASS'|'FAIL'|'UNKNOWN', reasons:string[]}}
 */
export function decide(measured, baseline) {
  if (!baseline) return { status: 'UNKNOWN', reasons: ['基线文件缺失（先跑 --record-baseline 并提交基线）'] }
  const reasons = []
  if (measured.total > baseline.total) {
    reasons.push(`总数 ${measured.total} > 基线 ${baseline.total}`)
  }
  for (const [rule, n] of Object.entries(baseline.byRule || {})) {
    const cur = measured.byRule[rule] || 0
    if (cur > n) reasons.push(`${rule} ${cur} > 基线 ${n}`)
  }
  return { status: reasons.length ? 'FAIL' : 'PASS', reasons }
}

/* ------------------------------ record ------------------------------ */

function recordBaseline() {
  const m = measure()
  let prev = null
  if (existsSync(BASELINE)) {
    try {
      prev = JSON.parse(readFileSync(BASELINE, 'utf8'))
    } catch {
      console.error(`[gate-lint] 现有基线不是合法 JSON：${BASELINE}`)
      process.exit(1)
    }
  }
  if (prev && m.total > prev.total) {
    console.error(
      `[gate-lint] --record-baseline 拒绝：当前 ${m.total} 条 > 已存基线 ${prev.total} 条。\n` +
        `  棘轮只许降不许升（这是本门的全部意义）。要降 total 只能真的改代码，不能把基线抬高。`
    )
    process.exit(1)
  }
  mkdirSync(dirname(BASELINE), { recursive: true })
  writeFileSync(BASELINE, JSON.stringify({ total: m.total, byRule: m.byRule }, null, 2) + '\n', 'utf8')
  console.log(`[gate-lint] 基线已写入：${m.total} 条 ${JSON.stringify(m.byRule)}`)
  console.log(prev ? `（上一版 ${prev.total} 条 ⇒ ${m.total - prev.total}）` : '（首次建立基线）')
  // 棘轮写盘成功不等于判据能判红 —— 立刻自证一次：把基线删掉必须 UNKNOWN。
  process.exit(0)
}

/* ------------------------------ falsify ------------------------------ */

/**
 * 自带证伪自检：判据必须**能判红**，否则「一直绿」等于什么都没守。
 * 两条注入：① 塞一个未用变量 ⇒ 必须 FAIL；② 删基线 ⇒ 必须 UNKNOWN（不是悄悄放行）。
 */
function falsify() {
  const fail = []
  const backup = existsSync(BASELINE) ? readFileSync(BASELINE, 'utf8') : null
  const baselineObj = backup ? JSON.parse(backup) : { total: 0, byRule: {} }

  try {
    // ① 注入未用变量 ⇒ total +1 ⇒ 必须 FAIL
    writeFileSync(FALSIFY_TMP, FALSIFY_TMP_SRC, 'utf8')
    const m1 = measure()
    const d1 = decide(m1, baselineObj)
    if (d1.status !== 'FAIL') fail.push(`注入未用变量后判定为 ${d1.status}（应为 FAIL）。原因：${d1.reasons.join('；') || '无'}`)
    else console.log(`[gate-lint] 证伪① OK：注入 1 条未用变量 ⇒ ${m1.total} 条 ⇒ ${d1.status}`)
  } finally {
    if (existsSync(FALSIFY_TMP)) unlinkSync(FALSIFY_TMP)
  }

  try {
    // ② 删基线 ⇒ 必须 UNKNOWN（不是 PASS）
    if (backup === null) {
      if (existsSync(BASELINE)) throw new Error('基线文件存在但读不出来，证伪②跳过并报错')
    } else {
      unlinkSync(BASELINE)
    }
    const d2 = decide(measure(), null)
    if (d2.status !== 'UNKNOWN') fail.push(`删掉基线后判定为 ${d2.status}（应为 UNKNOWN）`)
    else console.log('[gate-lint] 证伪② OK：删掉基线 ⇒ UNKNOWN（缺基线不算放行）')
  } finally {
    if (backup !== null) writeFileSync(BASELINE, backup, 'utf8')
  }

  if (existsSync(FALSIFY_TMP)) fail.push(`证伪临时文件没删干净：${FALSIFY_TMP}`)

  if (fail.length) {
    console.error('[gate-lint] ❌ 证伪自检失败（判据可能恒真）：')
    for (const f of fail) console.error(`   · ${f}`)
    process.exit(1)
  }
  console.log('[gate-lint] ✅ 证伪自检通过：注入致红 + 缺基线致 UNKNOWN 两条都成立')
  process.exit(0)
}

/* ------------------------------- main ------------------------------- */

const argv = process.argv.slice(2)

if (argv.includes('--record-baseline')) recordBaseline()
if (argv.includes('--falsify')) falsify()

const measured = measure()
let baseline = null
if (existsSync(BASELINE)) {
  try {
    baseline = JSON.parse(readFileSync(BASELINE, 'utf8'))
  } catch (e) {
    console.error(`[gate-lint] 基线文件存在但不是合法 JSON：${e.message}`)
    process.exit(2)
  }
}

const { status, reasons } = decide(measured, baseline)

console.log(`[gate-lint] 当前 ${measured.total} 条：${JSON.stringify(measured.byRule)}`)
if (baseline) console.log(`[gate-lint] 基线 ${baseline.total} 条：${JSON.stringify(baseline.byRule)}`)

if (status === 'UNKNOWN') {
  console.error('[gate-lint] ⚠️ UNKNOWN —— ' + reasons.join('；'))
  console.error('  基线缺失不等于放行：先 node scripts/gate-lint.mjs --record-baseline 并提交基线文件。')
  process.exit(2)
}
if (status === 'FAIL') {
  console.error('[gate-lint] ❌ FAIL —— lint warnings 涨了（棘轮只许降不许升）：')
  for (const r of reasons) console.error(`   · ${r}`)
  process.exit(1)
}
console.log('[gate-lint] ✅ PASS —— lint warnings 未超过基线')
process.exit(0)
