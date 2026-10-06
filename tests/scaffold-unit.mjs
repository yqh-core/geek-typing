/* A1-E 之后 · content:scaffold-unit 测试 —— 证明「加第 N+1 个单元」这条命令**能判红**
 *
 * ── 为什么要有这份测试 ──
 * 脚手架是「产品化内容包扩展」的入口：以后每一个新单元都靠它落盘。
 * 它要是**自己错了还生成错的内容、而门不判红**，错误会被当成正确一路带到线上
 * （P18-C′ 的 registry 生成器就是同样的风险，所以那边也有一份同构测试）。
 *
 * 本轮实测踩到的两个「假通过」形态，都被下面用例钉死：
 *   ① manifest 比对只 diff 一个 7 项键白名单 ⇒ reading/exercise 的差异是 stats，
 *      压根不在白名单里 ⇒ 报红但不打印任何细节（C-1/C-6 专治）
 *   ② 载荷「非逐字节」时统一打印「JSON 语义一致」⇒ 语义其实也不同时会误导
 *      （C-3 治「真不一致必须判红」，C-7 治「仅排版不同必须判绿」）
 *
 * ── 分组 ──
 *   A 源契约 —— 坏源必须挡在写盘之前
 *   B 写盘   —— 落盘内容本身正确（checksum 走唯一实现、stats 自洽、可重复写）
 *   C 漂移   —— 门必须能判红，且**报得出是哪个键**
 *   D 真实仓库 —— Unit-01 三个包能被「从磁盘反向构造的源」重现（幂等证明）
 *   E 静态   —— 禁止手搓 checksum、禁止自动改顺序表与 PROVIDER 表
 *   F 本地日 —— 发布日期判据必须按**本地**日历日比较（缺这个门就天天假红）
 *              （⚠️ 注释里别写「ORDER_ 星号 + 斜杠 + PROVIDER」这种字面量：
 *                 那个斜杠加星号会把块注释提前闭合 —— 本文件实测踩过两次）
 *
 * ⚠️ A/B/C 全在 mkdtemp 临时根里跑；D 用真实 content/ 但**只读**。
 *    末条断言证明跑完全程真实 content/ 与 scripts/ 零改动。
 */

import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, existsSync, cpSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { checksumPayload } from '../scripts/content/license-policy.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const SC = join(ROOT, 'scripts', 'content', 'scaffold-unit.mjs')
const CONTENT = join(ROOT, 'content')
const GEN_REG = join(ROOT, 'scripts', 'content', 'generate-registry.mjs')
const PROVIDER_RULES = join(ROOT, 'scripts', 'content', 'provider-rules.mjs')
// 待办文案里点了这两个文件的名（E-3/E-4），先确认它们还在原处、结构没被搬走，
// 否则「提示你改 generate-registry.mjs」会指向一个不存在或已重命名的目标。
const genRegSrc = readFileSync(GEN_REG, 'utf8')
const providerRulesSrc = readFileSync(PROVIDER_RULES, 'utf8')

const scSrc = readFileSync(SC, 'utf8')

let pass = 0
let fail = 0
const failures = []
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
function section(t) {
  console.log(`\n── ${t}`)
}

const TMP = mkdtempSync(join(tmpdir(), 'scaffold-unit-'))

/** 跑脚手架，返回 {code, out}。不抛异常 —— 判红本身就是很多用例的期望结果。 */
function run(args = []) {
  try {
    const out = execFileSync(process.execPath, [SC, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { code: 0, out }
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }
  }
}

/** 最小合法源（2 词 / 1 段 / 1 题）—— 合成源，不依赖仓库现有内容。
 *  ⚠️ `license` **必填**（判据 23，fail-closed）：合成源也必须逐段声明许可，
 *     否则 A/B/C/F 全组都会被判红 —— 那不是「测出真回归」，是夹具自己过期了。
 *     形态与仓库现状同口径：vocabulary 可再分发(MIT)，reading / exercise 不可再分发。 */
const GOOD_SRC = () => ({
  packagePrefix: 'zz-test-01',
  publishedAt: '2026-01-01',
  origin: 'original authored content (test)',
  tags: ['test'],
  license: {
    vocabulary: { name: 'MIT License', spdx: 'MIT', url: 'https://opensource.org/licenses/MIT', commercialUse: true, attributionRequired: false, redistributable: true },
    reading: { name: 'Proprietary (self-curated)', commercialUse: true, attributionRequired: false, redistributable: false },
    exercise: { name: 'Proprietary (self-curated)', commercialUse: true, attributionRequired: false, redistributable: false },
  },
  vocabulary: {
    title: 'ZZ Test 01 — Core Vocabulary',
    description: '合成测试词汇包',
    items: [
      { word: 'alpha', translation: '阿尔法', definition: 'first letter' },
      { word: 'beta', translation: '贝塔' },
    ],
  },
  reading: {
    title: 'ZZ Test 01 — Reading',
    itemTitle: 'A Synthetic Passage',
    description: '合成测试篇章',
    paragraphs: ['First paragraph.', 'Second paragraph.'],
  },
  exercise: {
    title: 'ZZ Test 01 — Practice',
    itemTitle: 'ZZ Test 01 — Practice Set',
    description: '合成测试练习',
    questions: [
      { id: 'q01', type: 'mcq', prompt: 'Which one?', options: [{ key: 'A', text: 'yes' }, { key: 'B', text: 'no' }], answer: 'A', explanation: 'because', skill: 'Main idea' },
    ],
    collocations: ['synthetic test'],
  },
})

/** 把源写进临时文件，返回路径。mutate 用于制造坏源。 */
function writeSrc(name, mutate = (s) => s) {
  const p = join(TMP, `${name}.json`)
  writeFileSync(p, JSON.stringify(mutate(GOOD_SRC()), null, 2), 'utf8')
  return p
}

/** 把 src 写盘到 outRoot，返回 {code,out}。 */
function scaffoldTo(name, srcPath, outRoot) {
  return run([`--src=${srcPath}`, `--out-root=${outRoot}`])
}
function checkAt(srcPath, outRoot) {
  return run([`--src=${srcPath}`, '--check', `--out-root=${outRoot}`])
}

console.log('== scaffold-unit 测试（脚手架能判红） ==')

/* ═══════════════ A · 源契约：坏源必须挡在写盘之前 ═══════════════ */
section('A · 源契约（坏源必须 FAIL，不写盘）')
{
  const emptyRoot = join(TMP, 'empty')
  mkdirSync(emptyRoot, { recursive: true })

  // ⚠️ A-1 走**写盘**模式而不是 --check：--check 打的是空根，包不存在也会判红，
  //    那样测的是「磁盘有没有包」而不是「源合不合法」，等于把 A-1 变成恒红。
  const goodRoot = join(TMP, 'a1-content')
  {
    const p = writeSrc('A_1', (s) => s)
    const rw = scaffoldTo('A-1', p, goodRoot)
    ok('A-1 合法源能过校验并落盘', rw.code === 0, `exit=${rw.code}`)
  }

  const cases = [
    ['A-2 vocabulary 空数组', (s) => { s.vocabulary.items = []; return s }, false],
    ['A-3 vocabulary 缺 translation', (s) => { delete s.vocabulary.items[0].translation; return s }, false],
    ['A-4 vocabulary 重复词', (s) => { s.vocabulary.items[1].word = s.vocabulary.items[0].word; return s }, false],
    ['A-5 reading.paragraphs 空', (s) => { s.reading.paragraphs = []; return s }, false],
    ['A-6 reading.paragraphs 含空段', (s) => { s.reading.paragraphs = ['ok', '  ']; return s }, false],
    ['A-7 exercise answer 不在 options', (s) => { s.exercise.questions[0].answer = 'Z'; return s }, false],
    ['A-8 exercise type 非法', (s) => { s.exercise.questions[0].type = 'essay'; return s }, false],
    ['A-9 exercise 缺 explanation', (s) => { delete s.exercise.questions[0].explanation; return s }, false],
    ['A-10 publishedAt 是未来日期', (s) => { s.publishedAt = '2099-01-01'; return s }, false],
    ['A-11 packagePrefix 非法字符', (s) => { s.packagePrefix = 'Bad_Prefix!'; return s }, false],
    ['A-12 三段全缺省', (s) => { delete s.vocabulary; delete s.reading; delete s.exercise; return s }, false],
  ]
  for (const [name, mutate, expectPass] of cases) {
    const p = writeSrc(name.replace(/[^A-Za-z0-9]/g, '_'), mutate)
    const r = checkAt(p, emptyRoot)
    ok(name, expectPass ? r.code === 0 : r.code !== 0, `exit=${r.code}`)
    if (!expectPass) {
      ok(`  └ ${name} 给了可读理由`, /失败|非法|未来日期/.test(r.out), (r.out.split('\n').find((l) => l.includes('·')) ?? '').trim())
    }
  }
  // 坏源绝不能写盘
  ok('A-13 坏源不写任何文件', readdirSync(emptyRoot).length === 0, `empty 根下 ${readdirSync(emptyRoot).length} 个条目`)
}

/* ═══════════════ B · 写盘正确性 ═══════════════ */
section('B · 写盘（内容本身必须正确）')
const B_ROOT = join(TMP, 'b-content')
{
  const srcPath = writeSrc('B-good')
  const r = scaffoldTo('B-good', srcPath, B_ROOT)
  ok('B-1 写盘退出码 0', r.code === 0, `exit=${r.code}`)

  const packs = [
    ['vocabulary', 'zz-test-01-vocab', 'words.json'],
    ['reading', 'zz-test-01-reading', 'items.json'],
    ['exercise', 'zz-test-01-exercise', 'items.json'],
  ]
  for (const [type, id, payloadName] of packs) {
    const dir = join(B_ROOT, type, id)
    ok(`B-2 ${id} 包已落盘（载荷+manifest）`, existsSync(join(dir, payloadName)) && existsSync(join(dir, 'manifest.json')))
    if (!existsSync(join(dir, 'manifest.json'))) continue
    const payload = JSON.parse(readFileSync(join(dir, payloadName), 'utf8'))
    const m = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
    // checksum 唯一实现纪律：测试**独立**重算一次，而不是信脚手架自己算的
    const recomputed = checksumPayload(payload)
    ok(`B-3 ${id} checksum 与唯一实现一致`, m.contentChecksum === recomputed, m.contentChecksum === recomputed ? '' : `磁盘=${m.contentChecksum} / 重算=${recomputed}`)
    ok(`B-4 ${id} sources[0].checksum 同步`, m.sources?.[0]?.checksum === recomputed)
    ok(`B-5 ${id} stats.items == 载荷条数`, m.stats?.items === payload.length, `stats=${m.stats?.items} / 载荷=${payload.length}`)
    ok(`B-6 ${id} 包 id / type 自洽`, m.packageId === id && m.type === type && m.id === `content:${type}:curated-${id}:${id}`)
  }

  // 可重复写：再写一次，然后 --check 必须全绿（幂等）
  const r2 = scaffoldTo('B-good', srcPath, B_ROOT)
  const c = checkAt(srcPath, B_ROOT)
  ok('B-7 重复写盘仍退出码 0', r2.code === 0, `exit=${r2.code}`)
  ok('B-8 重复写盘后 --check 全绿（幂等）', c.code === 0 && (c.out.match(/✓/g) ?? []).length === 6, `exit=${c.code} ✓×${(c.out.match(/✓/g) ?? []).length}`)

  // 只给一段 ⇒ 只落一个包（别偷偷建空包）
  const onlyVocab = join(TMP, 'only-vocab-src.json')
  const s1 = GOOD_SRC()
  delete s1.reading
  delete s1.exercise
  writeFileSync(onlyVocab, JSON.stringify(s1), 'utf8')
  const V_ROOT = join(TMP, 'v-content')
  scaffoldTo('v', onlyVocab, V_ROOT)
  ok('B-9 只给 vocabulary ⇒ 不建 reading/exercise', !existsSync(join(V_ROOT, 'reading')) && !existsSync(join(V_ROOT, 'exercise')) && existsSync(join(V_ROOT, 'vocabulary', 'zz-test-01-vocab', 'words.json')))

  // 提示（不自动改）：顺序表 + PROVIDER + 编排表 + i18n
  ok('B-10 打印 generate-registry 顺序表待办', /ORDER_IMPORT/.test(r.out) && /ORDER_REGISTRY/.test(r.out))
  ok('B-11 打印 PROVIDER 待办', /PROVIDER/.test(r.out))
  ok('B-12 打印 learningUnits / i18n 待办', /learningUnits\.ts/.test(r.out) && /i18n/.test(r.out))
  // 顺序表待办的**形态**必须分类型：非 vocabulary 包走 ORDER_NONVOCAB 且是 type/dir，
  // 少一个 '/' 就匹配不上（照着旧文案改会白改一轮）—— 实测踩过。
  ok('B-13 非 vocabulary 包提示 ORDER_NONVOCAB + type/dir 形态', /ORDER_NONVOCAB 加 'reading\/zz-test-01-reading'/.test(r.out) && /ORDER_NONVOCAB 加 'exercise\/zz-test-01-exercise'/.test(r.out), (r.out.split('\n').find((l) => l.includes('ORDER_NONVOCAB')) ?? '').trim())
  ok('B-14 vocabulary 包提示 ORDER_IMPORT + ORDER_REGISTRY', /ORDER_IMPORT 与 ORDER_REGISTRY 加 'zz-test-01-vocab'/.test(r.out))
}

/* ═══════════════ C · 漂移：门必须判红，且报得出是哪个键 ═══════════════ */
section('C · 漂移注入（每个判据都必须能判红）')
{
  const srcPath = writeSrc('C-good')
  /** 复制一份 B_ROOT，施加 mutate，跑 --check，返回 {code,out} */
  function drift(name, mutate) {
    const root = join(TMP, `drift-${name}`)
    cpSync(B_ROOT, root, { recursive: true })
    mutate(root)
    const r = checkAt(srcPath, root)
    return r
  }
  const edit = (file, fn) => (root) => {
    const p = join(root, file)
    const v = JSON.parse(readFileSync(p, 'utf8'))
    writeFileSync(p, JSON.stringify(fn(v)), 'utf8')
  }
  const VOC_M = 'vocabulary/zz-test-01-vocab/manifest.json'
  const VOC_P = 'vocabulary/zz-test-01-vocab/words.json'
  const RD_M = 'reading/zz-test-01-reading/manifest.json'

  // ① 白名单之外的键（stats）—— 这条正是本轮实测的假通过点
  let r = drift('stats-items', edit(VOC_M, (m) => { m.stats.items = 999; return m }))
  ok('C-1 改 stats.items ⇒ FAIL 且报出 stats.items', r.code !== 0 && /stats\.items/.test(r.out), `exit=${r.code}`)

  // ② 删掉整个 stats 键 ⇒ 必须报「磁盘缺少此键」
  r = drift('stats-missing', edit(VOC_M, (m) => { delete m.stats; return m }))
  ok('C-2 删掉 stats ⇒ FAIL 且报出该键', r.code !== 0 && /stats/.test(r.out), `exit=${r.code}`)

  // ③ 标题改了（不在旧白名单里）
  r = drift('title', edit(VOC_M, (m) => { m.title = 'TAMPERED'; return m }))
  ok('C-3 改 manifest.title ⇒ FAIL 且报出 title', r.code !== 0 && /title/.test(r.out), `exit=${r.code}`)

  // ④ 内容身份键
  r = drift('checksum', edit(VOC_M, (m) => { m.contentChecksum = 'sha256:deadbeef'; return m }))
  ok('C-4 改 contentChecksum ⇒ FAIL 且报出该键', r.code !== 0 && /contentChecksum/.test(r.out), `exit=${r.code}`)

  r = drift('src-checksum', edit(VOC_M, (m) => { m.sources[0].checksum = 'sha256:deadbeef'; return m }))
  ok('C-5 改 sources[0].checksum ⇒ FAIL 且报出该键路径', r.code !== 0 && /sources\[0\]\.checksum/.test(r.out), `exit=${r.code}`)

  // ⑤ 载荷真改动 ⇒ 必须判「不一致」，**不能**说成「语义一致」
  r = drift('payload-word', edit(VOC_P, (w) => { w[0].translation = '被篡改'; return w }))
  ok('C-6 载荷真改动 ⇒ FAIL 且判为「不一致」', r.code !== 0 && /不一致/.test(r.out) && !/语义一致/.test(r.out), `exit=${r.code}`)

  // ⑥ build 戳不同 ⇒ 必须**判绿**（不同构建器本就该不同，拿它判漂移只会造假红）
  r = drift('build-stamp', edit(VOC_M, (m) => { m.build = { toolVersion: 'content-build/1.1', builtAt: '2020-01-01T00:00:00.000Z', sourceChecksum: m.build.sourceChecksum }; return m }))
  ok('C-7 只改 build 戳 ⇒ PASS（不参与比对）', r.code === 0, `exit=${r.code}`)

  // ⑦ 载荷仅排版不同（pretty print）⇒ 必须判绿，且文案要说清是「排版不同」
  r = drift('payload-pretty', (root) => {
    const p = join(root, VOC_P)
    writeFileSync(p, JSON.stringify(JSON.parse(readFileSync(p, 'utf8')), null, 2), 'utf8')
  })
  ok('C-8 载荷仅排版不同 ⇒ PASS 且标为「排版不同」', r.code === 0 && /排版不同/.test(r.out), `exit=${r.code}`)

  // ⑧ 包缺失 ⇒ 报「不存在」
  r = drift('missing-pack', (root) => rmSync(join(root, 'exercise'), { recursive: true, force: true }))
  ok('C-9 包被删 ⇒ FAIL 且报「不存在」', r.code !== 0 && /不存在/.test(r.out), `exit=${r.code}`)

  // ⑨ 非 vocabulary 包同样受检（别只盯着词汇包）
  r = drift('reading-stats', edit(RD_M, (m) => { m.stats.items = 42; return m }))
  ok('C-10 reading 包 stats 漂移 ⇒ FAIL 且报出 stats.items', r.code !== 0 && /stats\.items/.test(r.out), `exit=${r.code}`)
}

/* ═══════════════ D · 真实仓库：Unit-01 必须能被反向构造的源重现 ═══════════════ */
section('D · 真实仓库（Unit-01 幂等重现，只读）')
{
  const vDir = join(CONTENT, 'vocabulary', 'ielts-edu-01-vocab')
  const rDir = join(CONTENT, 'reading', 'ielts-edu-01-reading')
  const eDir = join(CONTENT, 'exercise', 'ielts-edu-01-exercise')
  const hasAll = [vDir, rDir, eDir].every((d) => existsSync(join(d, 'manifest.json')))
  ok('D-0 Unit-01 三包存在于仓库', hasAll)
  if (hasAll) {
    const vm = JSON.parse(readFileSync(join(vDir, 'manifest.json'), 'utf8'))
    const rm = JSON.parse(readFileSync(join(rDir, 'manifest.json'), 'utf8'))
    const em = JSON.parse(readFileSync(join(eDir, 'manifest.json'), 'utf8'))
    const vw = JSON.parse(readFileSync(join(vDir, 'words.json'), 'utf8'))
    const ri = JSON.parse(readFileSync(join(rDir, 'items.json'), 'utf8'))
    const ei = JSON.parse(readFileSync(join(eDir, 'items.json'), 'utf8'))

    // 反向构造：源 = 磁盘现有内容（不含任何手写文案），再让脚手架渲染回来
    // ⚠️ `license` 必须**逐类型**从磁盘 manifest 反推，不能省略：
    //   本 unit 的 vocabulary 包已改标 MIT（可开源），而 reading / exercise 仍是
    //   Proprietary（redistributable:false）—— 许可已是随内容而异的事实数据，
    //   省略它会让脚手架回落到默认「专有」默认值、与磁盘现状漂移 ⇒ D-1/D-2 判红。
    //   （这正是「反向源可重现」这条幂等判据的价值：许可口径一变就当场暴露。）
    const licenseOf = (m) => ({ ...m.sources[0].license })
    const derived = {
      packagePrefix: 'ielts-edu-01',
      publishedAt: vm.contentPublishedAt,
      origin: vm.sources[0].origin,
      tags: vm.tags,
      license: {
        vocabulary: licenseOf(vm),
        reading: licenseOf(rm),
        exercise: licenseOf(em),
      },
      vocabulary: { title: vm.title, description: vm.description, items: vw },
      reading: { title: rm.title, itemTitle: ri[0].title, description: rm.description, paragraphs: ri[0].paragraphs },
      exercise: {
        title: em.title,
        itemTitle: ei[0].title,
        description: em.description,
        questions: ei[0].questions.items,
        collocations: ei[0].questions.collocations ?? [],
      },
    }
    const p = join(TMP, 'unit01-derived.json')
    writeFileSync(p, JSON.stringify(derived, null, 2), 'utf8')
    const r = checkAt(p, CONTENT)
    ok('D-1 Unit-01 三包可被反向源重现（--check 全绿）', r.code === 0 && (r.out.match(/✓/g) ?? []).length === 6, `exit=${r.code} ✓×${(r.out.match(/✓/g) ?? []).length}`)
    ok('D-2 载荷全部一致（无「不一致」）', !/不一致/.test(r.out))
  }
}

/* ═══════════════ E · 静态断言 ═══════════════ */
section('E · 静态契约')
{
  ok('E-1 不手搓 checksum（无 createHash）', !/createHash/.test(scSrc))
  ok('E-2 checksum 走唯一实现 checksumPayload', /import\s*\{[^}]*checksumPayload[^}]*\}\s*from\s*'\.\/license-policy\.mjs'/.test(scSrc))
  ok('E-3 不自动改 generate-registry.mjs', !/writeFileSync\(\s*GEN_REG/.test(scSrc))
  ok('E-4 不自动改 build.mjs', !/writeFileSync\(\s*BUILD/.test(scSrc))
  ok('E-6 待办指向的 generate-registry.mjs 确实有双顺序表', /ORDER_REGISTRY/.test(genRegSrc) && /ORDER_IMPORT/.test(genRegSrc))
  // 表已从 build.mjs 搬到 provider-rules.mjs（本刀的单一实现改造）：指针与断言一起跟着走，
  // 否则这条会去一个搬空了的文件里找表 —— 断言就会假红，或更糟：假绿（指针失效没人发现）。
  ok('E-7 待办指向的 provider-rules.mjs 确实有 PROVIDER 登记表', /const PROVIDER = \{/.test(providerRulesSrc))
  ok('E-5 --check 只校验不写盘（写盘前有 process.exit）', /if \(CHECK\)[\s\S]*?process\.exit\(bad === 0 \? 0 : 1\)/.test(scSrc))
}

/* ═══════════════ F · 发布日期判据必须按本地日历日比较 ═══════════════ */
section('F · 本地日历日判据（UTC 00:00–08:00 窗口也必须过）')
{
  const pd = (n) => String(n).padStart(2, '0')
  // ⚠️ 今天 / 明天都**动态算**，写死字符串跑过零点就变假红。
  // ⚠️ 也绝不能拿 **UTC** 日历日去生成源：UTC 00:00–08:00 时 UTC 日还是本地昨日，
  //    拿它当「今天」写进源会被当场判成未来日期 ⇒ 用例假红（本刀要治的恰恰是这个窗口）。
  //    同理「今天」的字面量也不能用。本组实测跑在 2026-10-05 01:12 本地（UTC 仍 10-04）下。
  const now = new Date()
  const today = `${now.getFullYear()}-${pd(now.getMonth() + 1)}-${pd(now.getDate())}`
  // 用构造器 +1 天而不是 +86400000：跨月/跨年/夏令时都安全
  const tmr = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const tomorrow = `${tmr.getFullYear()}-${pd(tmr.getMonth() + 1)}-${pd(tmr.getDate())}`

  // ① 对照组（必须绿）：源里写**本地今天** ⇒ 脚手架必须 exit 0。
  //    这条专治「为了不再假红把判据改松」—— 本地今天能过，才说明判据真在按本地日历日比对。
  //    走**写盘**模式而不是 --check：--check 打空根会因「包不存在」判红，测的就不是日期判据了。
  const fRoot = join(TMP, 'f-content')
  const s1 = writeSrc('F_1', (s) => { s.publishedAt = today; return s })
  const r1 = scaffoldTo('F-1', s1, fRoot)
  ok('F-1 publishedAt = 本地今天 ⇒ PASS（判据按本地日历日工作，不是被放宽）', r1.code === 0, `exit=${r1.code} publishedAt=${today}`)

  // ② 证伪组（必须红）：源里写**本地明天** ⇒ 必须判红 + stderr 含「未来日期」。
  //    这条证明判据没被 ①「放宽」掉：本地今天过、本地明天红，判据才是真的在工作。
  const fEmpty = join(TMP, 'f-empty')
  mkdirSync(fEmpty, { recursive: true })
  const s2 = writeSrc('F_2', (s) => { s.publishedAt = tomorrow; return s })
  const r2 = checkAt(s2, fEmpty)
  ok('F-2 publishedAt = 本地明天 ⇒ FAIL 且报「未来日期」', r2.code !== 0 && /未来日期/.test(r2.out), `exit=${r2.code} publishedAt=${tomorrow}`)
}

/* ═══════════════ G · 源许可 fail-closed（判据 23 · 缺失 ≠ 默认允许）═══════════════ */
section('G · 源许可 fail-closed（缺段必须当场判红，不许静默降级）')
{
  // 三条分支，缺一条就证不了伪：
  //   ① 源**缺 license 段** ⇒ 判红（fail-closed；「缺失」≠ 默认允许）
  //   ② 源的 license 与**磁盘现状不一致** ⇒ 判红（重跑会造成降级/变更要被发现）
  //   ③ **对照组**：源与磁盘完全一致 ⇒ 判绿（证明不是恒红门）

  // ① 缺段：整段拿掉
  const noLicense = writeSrc('G_1', (s) => { delete s.license; return s })
  const r1 = checkAt(noLicense, B_ROOT)
  ok('G-1 源缺 license 段 ⇒ FAIL 且点名 license.vocabulary',
    r1.code !== 0 && /license\.vocabulary/.test(r1.out), `exit=${r1.code}`)
  ok('G-1b 判红理由写明「缺失 ≠ 默认允许」并点名 redistributable:false 的降级后果',
    /缺失/.test(r1.out) && /默认允许/.test(r1.out) && /redistributable/.test(r1.out),
    (r1.out.split('\n').find((l) => l.includes('缺失')) ?? '').trim())

  // ① 只缺一段（给了 reading/exercise，没给 vocabulary）⇒ 仍判红，且只点名缺的那段
  const partial = writeSrc('G_2', (s) => { delete s.license.vocabulary; return s })
  const r2 = checkAt(partial, B_ROOT)
  ok('G-2 源只缺 license.vocabulary（另两段齐备）⇒ FAIL 且只点名 vocabulary',
    r2.code !== 0 && /license\.vocabulary/.test(r2.out) && !/license\.reading/.test(r2.out), `exit=${r2.code}`)

  // ① 只声明 vocabulary 段的源**不必**声明另两段（否则是假红：没建的包不该被要求许可）
  const vocabOnly = writeSrc('G_3', (s) => {
    delete s.reading; delete s.exercise
    s.license = { vocabulary: s.license.vocabulary }
    return s
  })
  const vOnlyRoot = join(TMP, 'g-vocab-only')
  const rv = scaffoldTo('G-3', vocabOnly, vOnlyRoot)
  ok('G-3 只声明 vocabulary 的源不必给 reading/exercise 许可 ⇒ PASS（不造假红）',
    rv.code === 0, `exit=${rv.code}`)

  // ② 源与磁盘不一致：把 vocabulary 降级（MIT/true ⇒ 专有/false），即「重跑会造成降级」
  const downgraded = writeSrc('G_4', (s) => {
    s.license.vocabulary = { name: 'Proprietary (self-curated)', commercialUse: true, attributionRequired: false, redistributable: false }
    return s
  })
  const r4 = checkAt(downgraded, B_ROOT)
  ok('G-4 源把 vocabulary 降级为 redistributable:false ⇒ FAIL 且报出 license 漂移',
    r4.code !== 0 && /license/.test(r4.out) && /不一致/.test(r4.out), `exit=${r4.code}`)

  // ③ 对照组：源与磁盘完全一致 ⇒ 判绿（这条最容易被省，而它才是可信度的锚 ——
  //   一个只会判红的门和一个没有门，在只看「注入是否变红」时无法区分）
  const good = writeSrc('G_5', (s) => s)
  const r5 = checkAt(good, B_ROOT)
  ok('G-5 **对照组**：源与磁盘完全一致 ⇒ PASS（证明判据 23 不是恒红门）',
    r5.code === 0 && (r5.out.match(/✓/g) ?? []).length === 6, `exit=${r5.code} ✓×${(r5.out.match(/✓/g) ?? []).length}`)

  // ③ 对照组的必要前提：B_ROOT 里的包确实是 redistributable:true（否则 G-5 的绿是假绿）
  const bLic = JSON.parse(readFileSync(join(B_ROOT, 'vocabulary', 'zz-test-01-vocab', 'manifest.json'), 'utf8'))
  ok('G-6 对照组前提：B_ROOT 的 vocabulary 包确为 redistributable:true',
    bLic.sources?.[0]?.license?.redistributable === true, `实得 ${JSON.stringify(bLic.sources?.[0]?.license?.redistributable)}`)

  // 真实仓库侧：13 个词库必须全是 redistributable:true（判据 23 盘侧在 content:validate 跑，
  //   这里只钉住「Unit-01 三包」这个最小切片，证明脚手架写出的包许可形态没漂）。
  const realV = JSON.parse(readFileSync(join(CONTENT, 'vocabulary', 'ielts-edu-01-vocab', 'manifest.json'), 'utf8'))
  const realR = JSON.parse(readFileSync(join(CONTENT, 'reading', 'ielts-edu-01-reading', 'manifest.json'), 'utf8'))
  ok('G-7 真实 vocab 包 = MIT + redistributable:true（可开源）',
    realV.sources?.[0]?.license?.redistributable === true && realV.sources?.[0]?.license?.spdx === 'MIT',
    JSON.stringify(realV.sources?.[0]?.license))
  ok('G-8 真实 reading 包 = 专有 + redistributable:false（按类型分段，非一刀切）',
    realR.sources?.[0]?.license?.redistributable === false, JSON.stringify(realR.sources?.[0]?.license))
}

/* ═══════════════ 收尾：真实文件零改动 ═══════════════ */
section('Z · 隔离性')
{
  // content/ 下的三包内容不应被测试碰过（D 组是只读 --check）
  const gitPorcelain = (() => {
    try {
      return execFileSync('git', ['status', '--porcelain', '--', 'content', 'scripts'], { encoding: 'utf8', cwd: ROOT }).trim()
    } catch {
      return ''
    }
  })()
  ok('Z-1 测试未改动真实 content/ 与 scripts/content/', !gitPorcelain.includes('content/reading') && !gitPorcelain.includes('content/vocabulary') && !gitPorcelain.includes('content/exercise') && !gitPorcelain.includes('scripts/content/'), gitPorcelain || '(clean)')
  rmSync(TMP, { recursive: true, force: true })
  ok('Z-2 临时根已清理', !existsSync(TMP))
}

console.log(`\n== scaffold-unit 测试：${pass} PASS / ${fail} FAIL ==`)
if (fail) {
  console.log('失败项：')
  for (const f of failures) console.log(`  · ${f}`)
}
process.exit(fail === 0 ? 0 : 1)
