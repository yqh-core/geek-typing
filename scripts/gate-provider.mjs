/* Provider 覆盖门禁 gate:provider —— 把「新增内容包忘了在 PROVIDER 表登记」的**静默失败**变成硬判红。
 *
 * ── 它在防什么（三条判据）──
 *  判据 A（漏登记 / 落盘缺失）
 *    磁盘 content/ 下每个含 manifest.json 的目录，manifest.sources[].provider
 *    不得为 undefined / '' / 'unknown'。
 *    故障形态：新增内容包落盘但没在 PROVIDER 表登记 ⇒ build 的 `?? 'unknown'` 兜底
 *    把它静默写成 provider:'unknown'，溯源链断在「这批词哪来的」这一问上。
 *  判据 B（孤儿登记）
 *    PROVIDER 表里每个 key，磁盘上必须真有 content/<type>/<id>/manifest.json。
 *    故障形态：登记了不存在的包（表 ⟷ 磁盘双向失衡的那一侧）。
 *    为什么也要拦：只管「磁盘有、表没有」会放过「表有、磁盘没有」，
 *    而两者同型 —— 都是表与磁盘漂移，一个方向漏判，另一个方向的误判迟早来。
 *  判据 C（外部来源须可溯到仓库）
 *    非哨兵 provider（外部来源，如 ecdict）必须能在 PROVIDER_REPOSITORY 查到仓库地址。
 *    哨兵 provider 'geek-typing original'（自有内容）按设计豁免。
 *    判据 C 对当前 27 包**零误伤**：ecdict 已在 PROVIDER_REPOSITORY 里，
 *    22 个自有包走哨兵豁免 —— 这两类覆盖了磁盘全部 provider 值，故基线必绿。
 *
 * ── --falsify 注入了什么（证明本门不是恒真）──
 *  走**隔离副本** node_modules/.tmp/gate-provider-falsify/content（node_modules 被 gitignore），
 *  真 content/ 只读、绝不被写；每个用例前重建副本，用例后不留痕。
 *    CTRL 对照组：副本原样 ⇒ 必须判绿（门若在故障下还绿是假绿，对照组专治「注入空转」）
 *    S1 → 判据 A：造一个 provider='unknown' 的假包 ⇒ 必须判红且只报 A
 *    S2 → 判据 B：删掉一个**已登记**包的目录（content/vocabulary/ai-core）⇒ 必须判红且只报 B
 *    S3 → 判据 C：造一个 provider 不在 PROVIDER_REPOSITORY 的假包 ⇒ 必须判红且只报 C
 *  每条断言「退出码非 0」+「命中码集合**恰好等于**预期集合」—— 多报/少报都算门写坏了。
 *
 * ── 为什么 build.mjs 的 `?? 'unknown'` 兜底必须保留，而不是删掉 ──
 *  两个东西的位置不同，删兜底治不了本问题、还会引入新的：
 *  · 兜底是**运行时降级**：build.mjs 跑在开发者/流水线写盘的那一刻，它要保证「表没登记也能出产物」
 *    （构建脚本崩了比写出 provider:'unknown' 更糟 —— 内容就再也进不去，且崩点离病因很远）。
 *    降级 ≠ 默许：它把故障**降级成可观测的降级值**，再由这道离线门在门禁层硬拦。
 *  · 门是**离线防线**：读已落盘的 manifest 做断言，位置在 CI / pre-commit，
 *    目的恰恰是「兜底会掩盖的那部分，在这里翻出来」。
 *  · 若把兜底删成「查不到就抛错」，则新包一落盘就 build 崩、verify:registry 之类判据连锁翻红，
 *    排查者会以为是注册表坏了；而兜底保留 + 门判红，报错点直接指向「该在 PROVIDER 表登记」。
 *  两者是同一枚硬币的正反面：兜底**必须有**（否则构建脆），门**也必须有**（否则兜底变成静默吞错）。
 *
 * 用法：node scripts/gate-provider.mjs [--root=<dir>]  → 全绿 exit 0；任一问题 exit 1；自身异常 exit 2
 *       node scripts/gate-provider.mjs --falsify       → 证伪自检（exit 0=全过 / 1=断言失败 / 2=自身异常）
 */
import { cpSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  checkProviderCoverage,
  collectProviderStats,
  DEFAULT_CONTENT_DIR,
  PROVIDER_ORIGINAL,
  PROVIDER_UNKNOWN,
} from './content/provider-rules.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')

/** 隔离副本根目录（node_modules/.tmp/… —— node_modules 已被 gitignore，不污染工作区） */
const FALSIFY_DIR = path.join(ROOT, 'node_modules', '.tmp', 'gate-provider-falsify')
const FALSIFY_CONTENT = path.join(FALSIFY_DIR, 'content')

/** 证伪目标：一个**已在 PROVIDER 表登记**的包（删它的目录 ⇒ 判据 B 必现）。
 *  选 vocabulary 包：它们同时是表里的 key，也是 provider:'geek-typing original' 的自有包。 */
const REGISTERED_PKG = 'ai-core'
const REGISTERED_PKG_REL = path.join('vocabulary', REGISTERED_PKG)

/**
 * 跑一次门（常规模式与证伪模式**共用同一条**判定路径）。
 *
 * @param {object} opts
 * @param {string} opts.root 内容根（content/ 或隔离副本）
 * @returns {{ problems: Array<object>, stats: object, exitCode: number }}
 */
export function runGate({ root = DEFAULT_CONTENT_DIR }) {
  const problems = checkProviderCoverage({ root })
  const stats = collectProviderStats(root)
  return { problems, stats, exitCode: problems.length > 0 ? 1 : 0 }
}

/** 打印统计（包数 / provider 分布 / 表大小），与判据解耦 —— 判据只看 problems */
function printStats(stats) {
  const dist = Object.entries(stats.distribution)
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .map(([k, v]) => `${k}=${v}`)
    .join(', ')
  console.log(
    `  内容包 ${stats.packageCount} 个（source 条目 ${stats.sourceCount} 条）· provider 分布 { ${dist || '空'} } · PROVIDER 表 ${stats.tableSize} 项`,
  )
}

/** 常规模式：读真实 content/，有 ⇒ 打印每条问题并 exit 1 */
function main() {
  const args = process.argv.slice(2)
  let raw = null
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--root=')) { raw = args[i].slice('--root='.length); break }
    if (args[i] === '--root') { raw = args[i + 1] ?? null; break }
  }
  const root = raw ? path.resolve(raw) : DEFAULT_CONTENT_DIR

  console.log('[gate:provider] provider 覆盖门禁（判据 A 漏登记 / B 孤儿登记 / C 外部来源须有仓库）')
  console.log(`  内容根：${root.replace(ROOT, '.')}`)

  const { problems, stats, exitCode } = runGate({ root })
  printStats(stats)

  /* 判定与退出码只认 runGate 给的 exitCode —— 它是判据逻辑的**唯一出口**。
   * ⚠️ 不要再用 problems.length === 0 自己推一遍：那样「判据算 1、CLI 退 0」这类
   *    分叉就没人看得见了（本刀 lint 棘轮先抓到的就是这个：解出 exitCode 却没用它）。 */
  if (exitCode === 0) {
    console.log('  ✓ provider 覆盖完整：磁盘上的每个包都登记且 provider 可溯源，表内登记无孤儿')
    console.log(`  · 哨兵 provider = ${JSON.stringify(PROVIDER_ORIGINAL)}（自有内容，按设计豁免判据 C）`)
    console.log(`  · 兜底哨兵 = ${JSON.stringify(PROVIDER_UNKNOWN)}（build.mjs 的 ?? 兜底值，写盘时静默命中即由判据 A 拦）`)
    console.log('────────────────────────────────────────────────────────────────────')
    process.exit(0)
  }

  console.error(`  ✗ provider 覆盖 ${problems.length} 项问题：`)
  for (const p of problems) {
    /* 定位写法：磁盘包给 content 相对路径 + ContentId（身份契约），孤儿登记给表 key。
     * ⚠️ 括号里**不**放 p.id：判据 A/C 的 id 是目录名（= 你要往表里加的那一行），
     *    与 ContentId 不是同一个东西，混着报只会让人去错地方找。 */
    const at = p.dir
      ? `${p.dir}${p.contentId ? `（ContentId: ${p.contentId}）` : ''}`
      : `PROVIDER 表项 '${p.id}'`
    console.error(`    [判据 ${p.criterion}] ${at} · ${p.code}：${p.reason}`)
  }
  console.error(
    `  修复：自有内容在 scripts/content/provider-rules.mjs 的 PROVIDER 表补登记；` +
      `外部来源同时补 PROVIDER_REPOSITORY。注意 build.mjs 不得再留第二份表（单一实现）。`,
  )
  console.log('────────────────────────────────────────────────────────────────────')
  process.exit(1)
}

/* ───────────────────────────── 证伪自检 ───────────────────────────── */

/** 重建隔离副本（每个用例前调用 ⇒ 用例之间互不残留，也天然「还原」） */
function rebuildCopy() {
  rmSync(FALSIFY_DIR, { recursive: true, force: true })
  mkdirSync(FALSIFY_DIR, { recursive: true })
  cpSync(DEFAULT_CONTENT_DIR, FALSIFY_CONTENT, { recursive: true, force: true })
}

/** 在副本里造一个假包（provider 由用例决定） */
function addFakePackage(root, { id, provider }) {
  const dir = path.join(root, 'vocabulary', id)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    path.join(dir, 'manifest.json'),
    `${JSON.stringify(
      { id: `content:vocabulary:falsify-${provider}:${id}`, packageType: 'vocabulary', sources: [{ origin: 'falsify', provider }] },
      null,
      2,
    )}\n`,
    'utf8',
  )
}

const CASES = [
  {
    letter: 'CTRL',
    name: '对照组：副本原样（本门**必须判绿**）',
    why: '证明注入真的生效了 —— 若故障已被判红、对照组反而也判红，说明门恒绿或注入空转，用例作废',
    expect: [],
    inject: () => undefined,
  },
  {
    letter: 'S1',
    name: '判据 A：造一个 provider=unknown 的假包',
    why: '模拟「新内容包落盘但忘了登记」—— build 的 ?? unknown 兜底会静默写出这个值，必须被判据 A 拦下',
    expect: ['PROVIDER_UNREGISTERED'],
    inject: () => addFakePackage(FALSIFY_CONTENT, { id: 'zz-falsify-unknown', provider: PROVIDER_UNKNOWN }),
  },
  {
    letter: 'S2',
    name: '判据 B：删掉一个已登记包的目录（' + REGISTERED_PKG_REL + '）',
    why: '模拟「表登记了、磁盘上却没有这个包」的孤儿登记 —— 与判据 A 反向的漂移，同样必须判红',
    expect: ['PROVIDER_ORPHAN_REGISTRATION'],
    inject: () => {
      const t = path.join(FALSIFY_CONTENT, REGISTERED_PKG_REL)
      if (!existsSync(t)) throw new Error(`证伪前置失败：副本里没有 ${REGISTERED_PKG_REL}（删它才造得出孤儿登记）`)
      rmSync(t, { recursive: true, force: true })
    },
  },
  {
    letter: 'S3',
    name: '判据 C：造一个 PROVIDER_REPOSITORY 查不到的外部 provider 假包',
    why: '证明判据 C 是活的 —— 外部来源必须能溯到仓库，光写个 provider 字符串不算可溯源',
    expect: ['PROVIDER_REPOSITORY_MISSING'],
    inject: () => addFakePackage(FALSIFY_CONTENT, { id: 'zz-falsify-external', provider: 'acme-unmapped-sources' }),
  },
]

function falsify() {
  const greenCount = CASES.filter((c) => c.expect.length === 0).length
  console.log('[gate:provider] 证伪自检 —— 证明每条判据都能判红（不会失败的门等于没有门）')
  console.log(`  用例 ${CASES.length} 条（含 ${greenCount} 条判绿对照组）；每条：注入故障 → 断言「退出码非 0」且「命中码集合恰好等于预期」`)
  console.log(`  隔离副本：${FALSIFY_CONTENT}（node_modules/.tmp/，gitignore；真 content/ 只读、绝不被写）\n`)

  let bad = 0
  for (const c of CASES) {
    try {
      rebuildCopy()
      c.inject()
      const { problems, stats } = runGate({ root: FALSIFY_CONTENT })
      const codes = [...new Set(problems.map((p) => p.code))].sort()
      const observedExit = problems.length > 0 ? 1 : 0
      const exitOk = c.expect.length === 0 ? observedExit === 0 : observedExit !== 0
      const codeOk = JSON.stringify(codes) === JSON.stringify([...c.expect].sort())
      const pass = exitOk && codeOk
      console.log(
        `  ${pass ? '✅' : '❌'} ${c.letter} ${c.name}\n` +
          `     命中 { ${codes.join(', ') || '空'} }（预期 { ${[...c.expect].sort().join(', ') || '空'} }）· 副本 ${stats.packageCount} 包`,
      )
      if (!pass) {
        bad++
        console.error(
          `     └ 断言失败：${!exitOk ? '退出码不符（' + observedExit + '）' : ''}${!exitOk && !codeOk ? '；' : ''}${!codeOk ? '命中码集合不等于预期' : ''}`,
        )
        if (problems.length > 0 && codeOk) {
          for (const p of problems) console.error(`       · [判据 ${p.criterion}] ${p.code}：${p.reason}`)
        }
      }
    } catch (e) {
      bad++
      console.error(`  ❌ ${c.letter} ${c.name}\n     用例自身异常：${e?.stack ?? e}`)
    }
  }

  // 收尾：清掉副本，避免留 27+ 包的临时树在工作区
  try {
    rmSync(FALSIFY_DIR, { recursive: true, force: true })
  } catch (e) {
    console.warn(`  ⚠ 隔离副本清理失败（node_modules/.tmp，容器即弃，不影响判定）：${e?.message ?? e}`)
  }

  console.log('────────────────────────────────────────────────────────────────────')
  if (bad === 0) {
    const redCount = CASES.length - greenCount
    console.log(`[gate:provider] Falsification：✅ PASS —— ${CASES.length}/${CASES.length} 用例通过（${redCount} 条判红 + ${greenCount} 条判绿对照），真 content/ 未被写入`)
    process.exit(0)
  }
  console.error(`[gate:provider] Falsification：❌ FAIL —— ${bad}/${CASES.length} 条用例未过 ⇒ 本判据不可信`)
  process.exit(1)
}

if (process.argv.slice(2).includes('--falsify')) falsify()
else main()
