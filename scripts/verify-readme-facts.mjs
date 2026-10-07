#!/usr/bin/env node
/**
 * verify-readme-facts —— README 声明性数字的防腐门（npm script 名见 package.json）
 *
 * ⛔ 本门**不校验行文**，只校验 README 里**可被机器复算的数字**。
 *
 * 判据一句话：README 正文里出现的「词库包数」「词条总数」若与 `content/` 磁盘真值
 * 不一致 ⇒ FAIL。**读不到 / 解析不出声明 ⇒ Fatal（绝不降级成 PASS）**。
 *
 * 为什么要这道门（问题陈述）：
 *   README 是静态文本，而词库是**持续增删的内容资产**（实测增量史：
 *   9346 → 9378 → 9408 → 9438，每次都只动一个包）。⇒ 把总数写进 README 的那一刻，
 *   它就开始腐坏：词库加了词，README 还写着旧数，**对外门面开始说假话**，
 *   而且没有任何机器信号提醒。GitHub 访客看到的每一个数字都是对外承诺。
 *   两种朴素做法都不够：
 *     (a) 不写死总数 —— 代价是 README 少一个最有说服力的量化锚点；
 *     (b) 写死总数但不校验 —— 代价是**静默腐坏**，比不写更危险（它看起来是权威数字）。
 *   选 (b) + 本门 ⇒ 「写死」这件事从风险变成能力：数字始终等于真值，且**变了就红**。
 *
 * 与 `tests/content-query.mjs` 的 `VOCABULARY_ONLY_ITEMS`（9438）的关系 —— **不重复实现**：
 *   那一处守的是「**内容仓**的词条数基准」（`content/` 变了 ⇒ 那道门红），是 P1.7 体系的一部分，
 *   口径权威、取自 registry（`stats.items`）。本门**不重新定义口径、不重算权威值**，
 *   只做一件那处管不到的事：**把 README 文本里声明的数字与磁盘真值对齐** ——
 *   内容仓改了数而 README 没改时，那处门会红但**没人知道 README 也需要跟着改**；
 *   本门正是把「README 这条对外文案」接进同一条守卫链。
 *   ⚠️ 两处口径必须一致，因此本门同样按 `manifest.stats.items` 求和（**不是** `words.json` 长度）。
 *   两者当前恰好相等（13 包 9438 条，实测逐包一致），但**口径不同**：换包实现时 `words.json`
 *   可能含被过滤项而 `stats.items` 不含。故一律以 `stats.items` 为准。
 *
 * 判据（任一命中 ⇒ FAIL）：
 *   1. README 必须是**合法 UTF-8**（fail-closed）。
 *      ⚠️ 这条不是洁癖：历史事故 `INCIDENT-ESAFENET`（见下）之后本仓根 README 一度整文件
 *      被宿主的 Esafenet 透明加密驱动改成 GBK，而 `scripts/scan-mojibake.mjs` 的扫描范围是
 *      `src/ tests/ scripts/ docs/ content/` —— **仓库根不在范围内**，所以那次损坏对
 *      lint:text 完全不可见。实测：554 个受版本控制的文本文件里**只有 README.md 一个**
 *      不是合法 UTF-8（665 个 U+FFFD）。本门把它纳入机器判定。
 *   2. README 必须能解析出全部受管声明（缺任一 ⇒ Fatal，见下）
 *   3. 词库包数：README 声明值 === `content/vocabulary/` 下的**目录数**
 *   4. 词条总数：README 声明值 === Σ 各包 `manifest.stats.items`
 *
 * 三态判定：PASS / FAIL / UNKNOWN，**UNKNOWN 视为不通过**（同 check-bundle.mjs 的口径：
 * 测不出来绝不等于通过）。其中「README 缺失 / 不是合法 UTF-8 / 解析不出声明」为 **Fatal**。
 *
 * 退出码：0 = PASS；1 = FAIL（含 UNKNOWN）；2 = Fatal / 未知参数。
 *
 * 用法：
 *   npm run verify:readme-facts            # 默认：校验 README 声明的数字
 *   npm run verify:readme-facts:falsify    # 自带证伪自检（证明每条判据都能判红）
 *   node scripts/verify-readme-facts.mjs --readme=<其它文件>   # 指向隔离副本（证伪用）
 */
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** 仓库根 README（`--readme=` 可覆盖，供证伪用隔离副本） */
const DEFAULT_README = join(ROOT, 'README.md')
/** 词库目录（内容资产，本门只**读**不改） */
const VOCAB_DIR = join(ROOT, 'content', 'vocabulary')

/**
 * 受管声明的抽取规则 —— **锚点故意写成机器可识别的固定串**。
 *
 * 为什么用固定锚点而不是正则去捞正文里的任意数字：
 *   正则捞数字必然误伤（行文里出现「3000 词」「13 个包」都可能被抓，而它们的**口径**
 *   各不相同：3000 是 `ielts` 单包条目数，9438 是全库 vocabulary-only 口径）。
 *   锚点法让「哪些数字受管」变成**显式契约**：README 认了这三个锚点，本门就负责它们的真值。
 *   锚点以 HTML 注释承载 ⇒ **对 GitHub 访客不可见**（不污染渲染、不出现在 3 秒判读区），
 *   但对机器稳定可见。
 */
const DECLARATIONS = [
  { key: 'package-count', label: '词库包数', pattern: /<!--\s*readme:package-count=([0-9]+)\s*-->/ },
  { key: 'entry-count', label: '词条总数', pattern: /<!--\s*readme:entry-count=([0-9]+)\s*-->/ },
]

/** 三态结果累加器 */
const results = []
/**
 * 记录一条判据结果。
 *
 * @param {string} name 判据名
 * @param {'PASS'|'FAIL'|'UNKNOWN'} state 判定
 * @param {string} detail 打印到报告里的实测细节
 */
function judge(name, state, detail) {
  results.push({ name, state, detail })
}

/**
 * 严格 UTF-8 解码：非法字节序列**抛错**，不做 U+FFFD 替换。
 *
 * ⛔ 这里必须 fail-closed：若用宽松解码，GBK 文件会被替换成 U+FFFD 而**长度不变**，
 * 于是后面的数字正则仍可能匹配成功 —— 一份整文件损坏的 README 会被判成 PASS，
 * 正是本门要防的那类假绿。
 *
 * @param {Uint8Array} bytes 文件字节
 * @return {string} 合法 UTF-8 文本
 * @throws {Error} 编码非法时抛出
 */
function decodeUtf8Strict(bytes) {
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

/**
 * 磁盘真值：词库包数 + 词条总数。
 *
 * 口径与 `tests/content-query.mjs` 的 `VOCABULARY_ONLY_ITEMS` 一致：**Σ manifest.stats.items**，
 * 只统计 `content/vocabulary/` 下的包（含包内 `items` 字段的动态 import，刻意不引入 registry
 * 依赖 —— 本门要在 registry 跑不起来时也能给出结论，那属于 UNKNOWN 而非「大概对」）。
 *
 * @return {{packages: number, entries: number, bad: string[]}} 真值与读取失败的包
 */
function readDiskTruth() {
  if (!existsSync(VOCAB_DIR)) return { packages: 0, entries: 0, bad: ['content/vocabulary/ 目录不存在'] }
  const dirs = readdirSync(VOCAB_DIR).filter((d) => existsSync(join(VOCAB_DIR, d, 'manifest.json')))
  const bad = []
  let entries = 0
  for (const d of dirs) {
    try {
      const m = JSON.parse(readFileSync(join(VOCAB_DIR, d, 'manifest.json'), 'utf8'))
      if (typeof m?.stats?.items !== 'number') throw new Error('manifest.stats.items 不是数字')
      entries += m.stats.items
    } catch (e) {
      // 单包读坏 ⇒ 累加值不可信 ⇒ 记下来交由上层判 UNKNOWN，绝不拿「少算的数」当真值去比
      bad.push(`${d}: ${e.message}`)
    }
  }
  return { packages: dirs.length, entries, bad }
}

/**
 * 主流程。
 *
 * @param {string} readmePath 待校验的 README 路径
 * @return {boolean} 是否达到 PASS
 */
function verify(readmePath) {
  if (!existsSync(readmePath)) {
    console.error(`FATAL：README 不存在 —— ${readmePath}`)
    return false
  }

  // 判据 1：合法 UTF-8（fail-closed，绝不降级成 PASS）
  let text
  try {
    text = decodeUtf8Strict(readFileSync(readmePath))
  } catch (e) {
    judge('README 是合法 UTF-8', 'UNKNOWN', `解码失败：${e.message}（整文件可能是 GBK/被加密）`)
    return false
  }
  judge('README 是合法 UTF-8', 'PASS', '严格解码通过（fatal:true）')

  // 判据 2：全部受管声明可解析（解析不出 ⇒ Fatal，不拿「只校验到的那几个」冒充全绿）
  const declared = {}
  const missing = []
  for (const d of DECLARATIONS) {
    const m = text.match(d.pattern)
    if (m) declared[d.key] = Number(m[1])
    else missing.push(d.key)
  }
  if (missing.length) {
    judge(
      'README 声明锚点齐全',
      'UNKNOWN',
      `解析不出 ${missing.length} 个声明锚点：${missing.join(', ')} —— 声明缺失时**无法校验**，` +
        '按 Fatal 处理（若确认不再声明该数字，请同步删掉 scripts/verify-readme-facts.mjs 的 DECLARATIONS 条目）',
    )
    return false
  }
  judge('README 声明锚点齐全', 'PASS', `解析到 ${DECLARATIONS.length} 个声明`)

  // 判据 3/4：与磁盘真值对齐
  const truth = readDiskTruth()
  if (truth.bad.length) {
    judge(
      '词库真值可读',
      'UNKNOWN',
      `${truth.bad.length} 个包读取失败，累加值不可信：${truth.bad.join(' | ')}`,
    )
    return false
  }
  judge('词库真值可读', 'PASS', `${truth.packages} 个包，逐包 stats.items 全部可解析`)

  judge(
    '声明：词库包数',
    declared['package-count'] === truth.packages ? 'PASS' : 'FAIL',
    `README 写 ${declared['package-count']} · 磁盘真值 ${truth.packages}`,
  )
  judge(
    '声明：词条总数（vocabulary-only 口径 Σ stats.items）',
    declared['entry-count'] === truth.entries ? 'PASS' : 'FAIL',
    `README 写 ${declared['entry-count']} · 磁盘真值 ${truth.entries}`,
  )

  return true
}

/** 打印判据表与总结。 */
function report() {
  console.log('\n---- verify:readme-facts 判据 ----')
  for (const r of results) {
    const icon = r.state === 'PASS' ? '✅' : r.state === 'FAIL' ? '❌' : '❓'
    console.log(`  ${icon} ${r.state.padEnd(4)} ${r.name} —— ${r.detail}`)
  }
  const failed = results.filter((r) => r.state !== 'PASS')
  console.log(`\n共 ${results.length} 项，通过 ${results.length - failed.length}，不通过 ${failed.length}`)
  if (failed.length) {
    console.log('  ⚠️ 上表为「本轮判据」；Fatal/UNKNOWN 一律计入不通过（测不出来不等于通过）。')
    console.log('  ⇒ 修法：要么把 README 数字改回真值，要么先改内容再改 README（顺序不能反）。')
  }
  console.log(failed.length ? '\n❌ README Facts Gate FAIL' : '\n✅ README Facts Gate PASS')
}

/**
 * 证伪自检：证明**每条判据都真的会判红**。
 *
 * 没有证伪的判据无法区分「在咬」与「恒绿」—— 两者输出都是 PASS。
 * 本门逐条构造「已知坏数据」，并**要求真的红**；任一条没红 ⇒ 证伪失败 ⇒ exit 2。
 *
 * @return {boolean} 全部证伪用例符合预期
 */
function falsify() {
  console.log('---- verify:readme-facts 证伪自检 ----')
  const tmp = mkdtempSync(join(ROOT, '.readme-falsify-'))
  const cases = [
    {
      name: 'F1 包数写错（12 ≠ 13）',
      body: 'x\n<!-- readme:package-count=12 -->\n<!-- readme:entry-count=9438 -->\n',
      expectRed: true,
    },
    {
      name: 'F2 词条数写错（9400 ≠ 9438）',
      body: 'x\n<!-- readme:package-count=13 -->\n<!-- readme:entry-count=9400 -->\n',
      expectRed: true,
    },
    {
      name: 'F3 缺 entry-count 锚点 ⇒ 必须 Fatal',
      body: 'x\n<!-- readme:package-count=13 -->\n',
      expectRed: true,
    },
    {
      name: 'F4 合法真值 ⇒ 必须绿（对照组，防本门恒红）',
      body: 'x\n<!-- readme:package-count=13 -->\n<!-- readme:entry-count=9438 -->\n',
      expectRed: false,
    },
  ]
  let bad = 0
  for (const c of cases) {
    const p = join(tmp, 'README.md')
    writeFileSync(p, c.body, 'utf8')
    const before = results.length
    verify(p)
    const failedNow = results.slice(before).some((r) => r.state !== 'PASS')
    const good = failedNow === c.expectRed
    if (!good) bad++
    console.log(
      `  ${good ? '✅' : '❌'} ${c.name} —— 期望${c.expectRed ? '判红' : '通过'}，实际${failedNow ? '判红' : '通过'}`,
    )
  }
  // F5：GBK 文件必须被判红（判据 1 的证伪 —— 防「宽松解码让整文件损坏静默通过」）
  {
    const p = join(tmp, 'README.gbk.md')
    writeFileSync(p, Buffer.from([0x23, 0x20, 0x61, 0xa1, 0xa4, 0x0a, 0x3c, 0x21, 0x2d, 0x2d, 0x0a]))
    const before = results.length
    verify(p)
    const failedNow = results.slice(before).some((r) => r.state !== 'PASS')
    if (!failedNow) bad++
    console.log(`  ${failedNow ? '✅' : '❌'} F5 非法 UTF-8（GBK 字节）必须判红 —— 实际${failedNow ? '判红' : '通过'}`)
  }
  rmSync(tmp, { recursive: true, force: true })
  console.log(bad ? `\n❌ 证伪失败 ${bad} 条` : '\n✅ 证伪通过：每条判据都真的在咬')
  return bad === 0
}

/* ─────────────────────────── CLI ─────────────────────────── */

const argv = process.argv.slice(2)
const readmeArg = argv.find((a) => a.startsWith('--readme='))
const readmePath = readmeArg ? resolve(readmeArg.slice('--readme='.length)) : DEFAULT_README

if (argv.includes('--falsify')) {
  process.exit(falsify() ? 0 : 2)
}
if (argv.some((a) => a.startsWith('--'))) {
  console.error(`未知参数：${argv.filter((a) => a.startsWith('--')).join(' ')}`)
  console.error('用法：node scripts/verify-readme-facts.mjs [--falsify] [--readme=<path>]')
  process.exit(2)
}

const fatal = !verify(readmePath)
report()
if (fatal && results.some((r) => r.state === 'UNKNOWN')) process.exit(2)
process.exit(results.some((r) => r.state !== 'PASS') ? 1 : 0)
