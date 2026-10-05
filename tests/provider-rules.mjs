/* Provider 覆盖判据测试 —— 证明 checkProviderCoverage 的判据 A/B/C **不是恒真**
 *
 * ── 为什么要有这份测试 ──
 * 判据写在 scripts/content/provider-rules.mjs，真 content/ 现状是 0 个 unknown（全绿）。
 * 全绿的门证明不了任何事：它同样可能是「判据压根没扫到文件」「表 key 对不上目录名」这种恒真实现。
 * 所以这里靠**合成根 + 注入表**把三条判据逐个打到判红，而不是拿真仓库复述一遍现状。
 *
 * ── 隔离口径 ──
 * 合成根一律 mkdtempSync(join(tmpdir(), 'provider-rules-')) —— 本测试**不 import 任何会写盘的脚本**
 * （provider-rules.mjs 是纯读模块，可安全 import），也绝不写真 content/。
 * 真仓库那组（G）是**只读**扫描，只用来钉住 27 包 / 0 unknown 的实测基线。
 *
 * ── 分组 ──
 *   A 合成根 · 判据 A（漏登记 / provider 缺失 / unknown）
 *   B 合成根 · 判据 B（孤儿登记）
 *   C 合成根 · 判据 C（外部来源须可溯到仓库）
 *   D 合成根 · 扫描过滤（isDirectory：content/ 根下的非目录文件不得被当成包）
 *   E 真实仓库 · 只读基线（27 包 / 0 unknown / 表内无孤儿）
 *   F 静态 · PROVIDER 表唯一实现（build.mjs 不得留第二份）
 */

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import {
  checkProviderCoverage,
  collectProviderStats,
  DEFAULT_CONTENT_DIR,
  PROVIDER,
  PROVIDER_REPOSITORY,
  PROVIDER_ORIGINAL,
  PROVIDER_UNKNOWN,
  scanContentPackages,
} from '../scripts/content/provider-rules.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')

let pass = 0
let fail = 0
let unknown = 0
const failures = []
const unknowns = []
function ok(name, cond, detail = '') {
  if (cond) {
    console.log(`  ✅ ${name}${detail ? ' — ' + detail : ''}`)
    pass++
  } else {
    console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`)
    fail++
    failures.push(name)
  }
}
function section(title) {
  console.log(`\n${title}`)
}

/** 造一个隔离内容根：
 *  · RootFile.md + license-policy-1.json（**非目录文件**，专门验证 isDirectory 过滤）
 *  · vocabulary/<id>/manifest.json（sources 由 providers 决定）
 *
 * ⚠️ 本夹具的 root **就是内容根**（等价于真仓库的 <repo>/content），不是仓库根。
 *    scanContentPackages(root) 的契约是「root = 内容根」—— 真仓库传的就是 <repo>/content。
 *    本刀踩过：夹具曾把包摆在 <tmp>/content/vocabulary/... 却把 <tmp>/ 当内容根传进去，
 *    于是门剥不掉第一层，dir 多出一段 'content/'，D-2/A-2b 假红（3 条）。
 *    假红比假绿便宜，但仍会让人去改正确的实现 —— 根因在这里，改夹具。 */
function makeRoot({ dirs, providers }) {
  const root = mkdtempSync(join(tmpdir(), 'provider-rules-'))
  // 非目录文件：与真 content/ 根下的 README.md / license-policy-1.json 同形（都在内容根上）
  writeFileSync(join(root, 'README.md'), '# README\n', 'utf8')
  writeFileSync(join(root, 'license-policy-1.json'), '{"v":"1"}\n', 'utf8')
  for (const id of dirs) {
    const d = join(root, 'vocabulary', id)
    mkdirSync(d, { recursive: true })
    const sources = (providers[id] ?? []).map((p) => ({ origin: `${id}-src`, provider: p }))
    writeFileSync(
      join(d, 'manifest.json'),
      `${JSON.stringify(
        { id: `content:vocabulary:zz-${id}:${id}`, packageType: 'vocabulary', sources },
        null,
        2,
      )}\n`,
      'utf8',
    )
  }
  return root
}

/** 判据命中的码集合（去重 + 排序，便于精确对账） */
const codesOf = (problems) => [...new Set(problems.map((p) => p.code))].sort()

/**
 * 从 package.json 的 scripts **派生**出全部 npm script 入口（F-8 的清单）。
 *
 * 派生而非手写：手写清单的失效方式是**静默**的 —— 新增一个 npm 脚本没人会记得
 * 回去加一行，而漏掉的入口正好是「新增脚本第一次跑不起来」的那次。
 * 2026-10-05 实测：手写 4 个 vs 实际 50 个入口（覆盖 8%）。
 *
 * @returns {string[]} 仓库相对、posix 分隔、已排序去重的入口路径（只含文件真实存在的）
 */
function npmScriptEntries() {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  const found = new Set()
  for (const cmd of Object.values(pkg.scripts ?? {})) {
    // 形如 `node scripts/xxx.mjs` / `node --experimental-x scripts/xxx.mjs`
    const matches = String(cmd).match(/node\s+(?:-[\w-]+\s+)*([\w./-]+\.mjs)/g) ?? []
    for (const m of matches) {
      const rel = m.replace(/^node\s+/, '').replace(/^-[\w-]+\s+/, '').split('\\').join('/')
      if (existsSync(join(ROOT, rel))) found.add(rel)
    }
  }
  return [...found].sort()
}

/* ═══════════════ A · 判据 A：漏登记 / provider 缺失 / unknown ═══════════════ */
section('A · 判据 A（漏登记 / provider 缺失 / unknown）')
{
  const root = makeRoot({
    dirs: ['zz-pkg-a', 'zz-pkg-b'],
    providers: { 'zz-pkg-a': [PROVIDER_ORIGINAL], 'zz-pkg-b': ['ecdict'] },
  })
  const table = { 'zz-pkg-a': PROVIDER_ORIGINAL, 'zz-pkg-b': 'ecdict' }

  // ① 基线：表与磁盘对得上 ⇒ 全绿（这条是「判据不能乱报」的对照组）
  const base = checkProviderCoverage({ root, provider: table })
  ok('A-1 基线全绿（表与磁盘双向对得上）', base.length === 0, `problems=${base.length}`)

  // ② 假包 provider = unknown（build 的 ?? 兜底写出来的那个值）⇒ 判据 A 判红
  let r = makeRoot({ dirs: ['zz-pkg-a', 'zz-pkg-b', 'zz-bad-unknown'], providers: { 'zz-pkg-a': [PROVIDER_ORIGINAL], 'zz-pkg-b': ['ecdict'], 'zz-bad-unknown': [PROVIDER_UNKNOWN] } })
  let problems = checkProviderCoverage({ root: r, provider: table })
  ok('A-2 unknown provider ⇒ 判据 A 判红', codesOf(problems).join() === 'PROVIDER_UNREGISTERED', `codes=${codesOf(problems).join()} / ${problems[0]?.reason ?? ''}`)
  ok('A-2b 报得名是哪个包', problems.some((p) => p.dir === 'vocabulary/zz-bad-unknown'))
  rmSync(r, { recursive: true, force: true })

  // ③ 空串 provider（落盘时被写空）⇒ 判据 A 判红
  r = makeRoot({ dirs: ['zz-bad-empty'], providers: { 'zz-bad-empty': [''] } })
  problems = checkProviderCoverage({ root: r, provider: { 'zz-bad-empty': PROVIDER_ORIGINAL } })
  ok('A-3 空串 provider ⇒ 判据 A 判红', codesOf(problems).join() === 'PROVIDER_UNREGISTERED', `codes=${codesOf(problems).join()}`)
  rmSync(r, { recursive: true, force: true })

  // ④ provider 字段整个缺失（sources[0] 只有 origin）⇒ 判据 A 判红
  const root2 = makeRoot({ dirs: ['zz-bad-missing'], providers: { 'zz-bad-missing': [undefined] } })
  problems = checkProviderCoverage({ root: root2, provider: { 'zz-bad-missing': PROVIDER_ORIGINAL } })
  ok('A-4 provider 缺失（undefined）⇒ 判据 A 判红', codesOf(problems).join() === 'PROVIDER_UNREGISTERED', `codes=${codesOf(problems).join()}`)
  rmSync(root2, { recursive: true, force: true })

  // ⑤ 哨兵常量与兜底哨兵的值（纯常量对账，防改表时两边悄悄分叉）
  ok('A-5 哨兵 === "geek-typing original"（自有内容）', PROVIDER_ORIGINAL === 'geek-typing original', JSON.stringify(PROVIDER_ORIGINAL))
  ok('A-5b 兜底哨兵 === "unknown"（与 build.mjs 的 ?? 兜底同值）', PROVIDER_UNKNOWN === 'unknown', JSON.stringify(PROVIDER_UNKNOWN))

  rmSync(root, { recursive: true, force: true })
}

/* ═══════════════ B · 判据 B：孤儿登记（表里有 key、磁盘上没这个包） ═══════════════ */
section('B · 判据 B（孤儿登记）')
{
  const root = makeRoot({
    dirs: ['zz-pkg-a', 'zz-pkg-b'],
    providers: { 'zz-pkg-a': [PROVIDER_ORIGINAL], 'zz-pkg-b': ['ecdict'] },
  })
  const table = { 'zz-pkg-a': PROVIDER_ORIGINAL, 'zz-pkg-b': 'ecdict', 'zz-gone-never-existed': PROVIDER_ORIGINAL }

  // ② 表里多一个从没存在过的 key ⇒ 判据 B 判红
  let problems = checkProviderCoverage({ root, provider: table })
  ok('B-1 表里有孤儿 key（磁盘上没这个包）⇒ 判据 B 判红', codesOf(problems).join() === 'PROVIDER_ORPHAN_REGISTRATION', `codes=${codesOf(problems).join()}`)
  ok('B-1b 报出孤儿 key 的名字', problems.some((p) => p.id === 'zz-gone-never-existed'), `id=${problems[0]?.id}`)

  // ②b 反向形态：表不动，把**已登记**包的目录删掉 ⇒ 同样必须判红（这才是「表登记了却不存在的包」的真身）
  rmSync(join(root, 'vocabulary', 'zz-pkg-b'), { recursive: true, force: true })
  problems = checkProviderCoverage({ root, provider: table })
  ok('B-2 删掉已登记包的目录 ⇒ 判据 B 判红', codesOf(problems).join() === 'PROVIDER_ORPHAN_REGISTRATION' && problems.some((p) => p.id === 'zz-pkg-b'), `codes=${codesOf(problems).join()} / ${problems.map((p) => p.id).join()}`)

  // ②c 目录名 ≠ manifest.id（manifest.id 被写成 ContentId，见 makeRoot）：表键是**目录名**
  //（与真仓库 ai-core 同形），不能被 ContentId 索引带偏 ⇒ zz-pkg-a 仍算已登记、不得报孤儿。
  // ⚠️ 表里**保留** zz-gone-never-existed：全绿也是一种结果，但那样这条什么都证明不了
  //（无问题可比对），所以留一个已知孤儿当**见证物**，再反向断言 zz-pkg-a 不在其中。
  problems = checkProviderCoverage({ root, provider: { 'zz-pkg-a': PROVIDER_ORIGINAL, 'zz-gone-never-existed': PROVIDER_ORIGINAL } })
  ok('B-3 表键按目录名匹配（zz-pkg-a 不被 ContentId 带偏误报孤儿）', problems.length === 1 && problems[0].id === 'zz-gone-never-existed', `ids=${problems.map((p) => p.id).join()}`)

  rmSync(root, { recursive: true, force: true })
}

/* ═══════════════ C · 判据 C：外部来源须可溯到仓库 ═══════════════ */
section('C · 判据 C（外部来源须能在 PROVIDER_REPOSITORY 查到仓库地址）')
{
  // C-1 不误伤：ecdict 已在 PROVIDER_REPOSITORY ⇒ 外部来源判绿
  let root = makeRoot({
    dirs: ['zz-pkg-a', 'zz-pkg-b'],
    providers: { 'zz-pkg-a': [PROVIDER_ORIGINAL], 'zz-pkg-b': ['ecdict'] },
  })
  let problems = checkProviderCoverage({ root, provider: { 'zz-pkg-a': PROVIDER_ORIGINAL, 'zz-pkg-b': 'ecdict' } })
  ok('C-1 ecdict（已登记仓库）⇒ 判绿，不误伤', problems.length === 0, `problems=${problems.length}`)
  rmSync(root, { recursive: true, force: true })

  // C-2 外部 provider 查不到仓库 ⇒ 判据 C 判红
  root = makeRoot({ dirs: ['zz-pkg-c'], providers: { 'zz-pkg-c': ['acme-unmapped-sources'] } })
  problems = checkProviderCoverage({ root, provider: { 'zz-pkg-c': 'acme-unmapped-sources' } })
  ok('C-2 外部 provider 无仓库地址 ⇒ 判据 C 判红', codesOf(problems).join() === 'PROVIDER_REPOSITORY_MISSING', `codes=${codesOf(problems).join()} / ${problems[0]?.reason ?? ''}`)
  rmSync(root, { recursive: true, force: true })

  // C-3 哨兵按设计豁免：自有内容即便不在 PROVIDER_REPOSITORY 也不该被判 C
  root = makeRoot({ dirs: ['zz-pkg-d'], providers: { 'zz-pkg-d': [PROVIDER_ORIGINAL] } })
  problems = checkProviderCoverage({ root, provider: { 'zz-pkg-d': PROVIDER_ORIGINAL } })
  ok('C-3 自有哨兵豁免判据 C（按设计，不是漏判）', problems.length === 0, `problems=${problems.length}`)
  rmSync(root, { recursive: true, force: true })

  // C-4 真表自洽：PROVIDER 表里的非哨兵值都必须是 PROVIDER_REPOSITORY 的键（现有 27 包零误伤的前提）
  const external = Object.values(PROVIDER).filter((v) => v !== PROVIDER_ORIGINAL)
  ok('C-4 PROVIDER 表外部值 ⊆ PROVIDER_REPOSITORY 键', external.length > 0 && external.every((v) => Boolean(PROVIDER_REPOSITORY[v])), `external=${external.join()}`)
}

/* ═══════════════ D · 扫描过滤：isDirectory ═══════════════ */
section('D · 扫描过滤（content/ 根下的非目录文件不得被当成包）')
{
  const root = makeRoot({
    dirs: ['zz-pkg-a', 'zz-pkg-b'],
    providers: { 'zz-pkg-a': [PROVIDER_ORIGINAL], 'zz-pkg-b': ['ecdict'] },
  })
  const { packages } = scanContentPackages(root)
  ok('D-1 包数 = 2（README.md / license-policy-1.json 未计入）', packages.length === 2, `packages=${packages.map((p) => p.dir).join()}`)
  ok('D-2 包目录名正确（目录名而非 ContentId）', packages.every((p) => /^vocabulary\/zz-pkg-[ab]$/.test(p.dir)))

  // 判据 A 扫的也是同一批 ⇒ 非目录文件不会引入幽灵问题
  const problems = checkProviderCoverage({ root, provider: { 'zz-pkg-a': PROVIDER_ORIGINAL, 'zz-pkg-b': 'ecdict' } })
  ok('D-3 注入 2 个非目录文件后仍全绿（无幽灵问题）', problems.length === 0, `problems=${problems.length}`)

  rmSync(root, { recursive: true, force: true })
}

/* ═══════════════ E · 真实仓库只读基线 ═══════════════ */
section('E · 真实仓库基线（只读扫描，绝不写盘）')
{
  const { packages } = scanContentPackages(DEFAULT_CONTENT_DIR)
  const stats = collectProviderStats(DEFAULT_CONTENT_DIR)
  ok('E-1 真实 content/ 有 27 个带 manifest.json 的包', packages.length === 27, `packages=${packages.length}`)
  ok('E-2 全库 0 个 unknown / 缺失 provider', stats.distribution[PROVIDER_UNKNOWN] === undefined, `distribution=${JSON.stringify(stats.distribution)}`)

  /* E-3 的 22 / 5是**钉住的基线**（同 tests/content-query.mjs 的 VOCABULARY_ONLY_ITEMS 口径，
   *    即 vocabulary-only 条目数—— 与本文件的 provider 分布同以词汇包为主体）：
   * 每加一套内容包都要按实测改这两个数 —— 这是刻意的：改它的人会顺便看一眼
   * 新包的 provider 登记对不对，而不是让数字悄悄漂走。 */
  const actual = { 'geek-typing original': 0, ecdict: 0 }
  for (const [k, v] of Object.entries(stats.distribution)) {
    if (k in actual) actual[k] = v
  }
  ok('E-3 分布 = 22 个 geek-typing original + 5 个 ecdict', actual['geek-typing original'] === 22 && actual.ecdict === 5, `distribution=${JSON.stringify(stats.distribution)}`)

  // 判据 B 也不能漂：真实表 13 项在真仓库每一条都找得到
  const problems = checkProviderCoverage({ root: DEFAULT_CONTENT_DIR })
  ok('E-4 真实表无孤儿登记（B 不误伤）', !problems.some((p) => p.criterion === 'B'), `problems=${problems.length} codes=${codesOf(problems).join()}`)
  ok('E-5 真实 content/ 全绿（判据 A/C 不误伤）', problems.length === 0, `problems=${problems.length}`)

}

/* ═══════════════ F · 静态：PROVIDER 表唯一实现 ═══════════════ */
section('F · 静态契约（PROVIDER 表唯一实现，用读文件+正则，不靠 import）')
{
  const buildSrc = readFileSync(join(ROOT, 'scripts', 'content', 'build.mjs'), 'utf8')
  const rulesSrc = readFileSync(join(ROOT, 'scripts', 'content', 'provider-rules.mjs'), 'utf8')
  const validateSrc = readFileSync(join(ROOT, 'scripts', 'content', 'validate.mjs'), 'utf8')

  /** 去掉块注释与行注释后再匹配：注释里提到某个字面量 ≠ 代码里硬写了一份 */
  const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  const buildCode = stripComments(buildSrc)

  ok('F-1 build.mjs 无 "geek-typing original" 字面量（哨兵不再在 build 落一份）', !buildCode.includes('geek-typing original'))
  ok('F-2 build.mjs 无 PROVIDER 表字面量（const PROVIDER = { 不出现）', !/const\s+PROVIDER\s*=\s*\{/.test(buildCode))
  ok('F-3 build.mjs 无 PROVIDER_REPOSITORY 表字面量', !/const\s+PROVIDER_REPOSITORY\s*=\s*\{/.test(buildCode))
  ok('F-4 build.mjs 从 provider-rules.mjs import（单一实现的唯一通道）', /from\s+'\.\/provider-rules\.mjs'/.test(buildCode))
  ok('F-5 provider-rules.mjs 确实是表的家（const PROVIDER = { 在此）', /const\s+PROVIDER\s*=\s*\{/.test(rulesSrc))
  ok('F-6 provider-rules.mjs 同时持有 PROVIDER_REPOSITORY 与哨兵（同址可查）', /export\s+const\s+PROVIDER_REPOSITORY/.test(rulesSrc) && /PROVIDER_ORIGINAL/.test(rulesSrc))
  // 只换引用、不动语义：validate.mjs 里不得再有第二份哨兵字面量
  ok('F-7 validate.mjs 哨兵走常量引用（无第二份字面量）', !stripComments(validateSrc).includes("'geek-typing original'"))

  /* F-8 每一个 **npm script 入口**都必须能被 Node 真解析。
   * ⚠️ 这条是被真实事故逼出来的：本刀把 PROVIDER 表从 build.mjs 搬走时，同一条
   *    import 被插了两遍，ESM 直接 SyntaxError（Identifier 'PROVIDER' has already been
   *    declared），`npm run content:build` 整个起不来 —— 而 F-1~F-7 全绿、单测 30/30 全绿，
   *    因为它们 import 的是 provider-rules.mjs，**从没加载过 build.mjs**。
   *    静态正则断言查不出重复声明 ⇒ 必须另加一道真解析（node --check）。
   *
   * ⚠️⚠️ 清单**从 package.json 自动派生**，不手写。原版手写 4 个文件，A2 收口复核时
   *    实测发现本刀一共改过 7 个 npm 入口（漏了 scaffold-unit.mjs / tests/e2e.mjs /
   *    prod-catalog-check.mjs / tests/provider-rules.mjs / tests/scaffold-unit.mjs）——
   *    也就是说「凡本刀改过的入口都要进这个列表」这条原则**我自己没落实**。
   *    手写清单的失效方式是静默的：新增一个 npm 入口没人会记得回来加一行。
   *    派生则天然覆盖全部，且新增脚本自动进门。
   *
   * 三态：真语法错 = FAIL；本机起不动第二个 node 进程（EBUSY，与 gate:lint 同一根因）
   * = UNKNOWN，**既不冒充 PASS 也不冒充 FAIL**，但必须在收尾汇总里喊出来 ——
   * 静默跳过 = 门看起来在跑、其实没跑，比红更坏。真跑得起来的地方是 CI（全新容器）。 */
  const syntaxTargets = npmScriptEntries()
  /** F-9 的已知坏文件用（放临时根，不碰仓库） */
  const TMP2 = mkdtempSync(join(tmpdir(), 'provider-syntax-'))
  /** @returns {{v: 'PASS'|'FAIL'|'UNKNOWN', why: string}} */
  const syntaxVerdict = (absPath) => {
    try {
      execFileSync(process.execPath, ['--check', absPath], { stdio: 'pipe' })
      return { v: 'PASS', why: '' }
    } catch (e) {
      const msg = String(e.stderr ?? e.message)
      if (/EBUSY|EPERM|ENOMEM|spawn/i.test(msg)) return { v: 'UNKNOWN', why: '本机起不动第二个 node 进程（EBUSY，同 gate:lint 根因）' }
      return { v: 'FAIL', why: msg.split('\n').find((l) => l.includes('Error')) ?? msg.trim() }
    }
  }
  const record = (name, verdict, detail) => {
    if (verdict === 'PASS') { console.log(`  ✅ ${name}${detail ? ' — ' + detail : ''}`); pass++ }
    else if (verdict === 'UNKNOWN') { console.log(`  ⚠️  ${name} — UNKNOWN：${detail}`); unknown++; unknowns.push(name) }
    else { console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); fail++; failures.push(name) }
  }
  // 派生本身的有效性：清单不能是空的、也不能少于已知入口数 —— 否则「全绿」是因为什么都没查
  ok('F-8a npm 入口清单自动派生非空（派生逻辑没坏）', syntaxTargets.length >= 20, `entries=${syntaxTargets.length}`)
  for (const must of ['scripts/content/build.mjs', 'scripts/content/scaffold-unit.mjs', 'scripts/content/validate.mjs', 'tests/e2e.mjs']) {
    ok(`F-8b 已知入口在派生清单里（${must}）`, syntaxTargets.includes(must))
  }
  for (const rel of syntaxTargets) {
    const r = syntaxVerdict(join(ROOT, rel))
    record(`F-8 ${rel} 可被 Node 解析（重复 import / 语法错会当场判红）`, r.v, r.why)
  }

  /* F-9 元自检：先证明「`node --check` 抓得住重复 import」这件事本身不是空话。
   * 只测「好文件能过」的门 = 恒真门；这里造一个**已知坏**文件，期望它被抓。 */
  const dup = join(TMP2, 'dup-import.mjs')
  writeFileSync(dup, "import { a } from './x.mjs'\nimport { a } from './x.mjs'\n", 'utf8')
  {
    const { v, why } = syntaxVerdict(dup)
    if (v === 'UNKNOWN') record('F-9 元自检：node --check 抓得住重复 import', 'UNKNOWN', `${why}（元自检跳过）`)
    else record('F-9 元自检：node --check 抓得住重复 import', v === 'FAIL' ? 'PASS' : 'FAIL', v === 'FAIL' ? '坏文件如预期被判错（检测器有效）' : `坏文件竟然通过了（${why}）⇒ 检测器无效，F-8 是恒真门`)
  }
  rmSync(TMP2, { recursive: true, force: true })
}

/* ── 收尾 ── */
console.log('\n────────────────────────────────────────────────────────────────────')
console.log(`provider-rules 测试：${pass} 通过 / ${fail} 失败${unknown > 0 ? ` / ${unknown} UNKNOWN` : ''}（共 ${pass + fail + unknown} 条）`)
if (unknown > 0) {
  console.warn(`⚠️  ${unknown} 条 UNKNOWN（本机 EBUSY，跑不动第二个 node 进程）：`)
  for (const u of unknowns) console.warn(`  · ${u}`)
  console.warn('   UNKNOWN 既不算通过也不算失败，但**它们这次确实没被验证** —— 由 CI（全新容器）兜底执行。')
}
if (fail > 0) {
  console.error('失败用例：')
  for (const f of failures) console.error(`  · ${f}`)
  process.exit(1)
}
console.log('✅ 全部通过（判据 A/B/C 各自都有判红用例 + 对照组非恒真）')
process.exit(0)
