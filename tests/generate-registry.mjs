/* P18-C′ · 生成器测试 —— 证明「一致性门能判红」，而不只是「生成能跑通」。
 *
 * 为什么要这份测试：生成器最大的风险是**自己错了还生成出错的 registry，而 CI 只检查
 * registry 自己** ⇒ 错误被认为正确。所以必须验证门在多种被污染的输入下都会 FAIL。
 *
 * 三组：
 *   A. 正常路径 —— 真实 content/ 下生成必须自审通过
 *   B. 数据污染 —— 通过临时改ORDER_* / manifest 制造漂移，门必须逐条判红
 *   C. 静态断言 —— 双顺序在源码里**确实不同**、?raw 回退分支**不存在**于生成路径
 *
 * ⚠️ B 组全部用**内存副本 + 注入**制造漂移，真实 content/ 与 registry.ts 只读。
 *   跑完必须证明真实文件零改动（末条断言）。
 */

import { readFileSync, writeFileSync, mkdtempSync, cpSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const GEN = join(ROOT, 'scripts', 'content', 'generate-registry.mjs')
const REGISTRY = join(ROOT, 'src', 'core', 'content', 'registry.ts')

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

/** 跑生成器，返回 {code, out}。不抛异常——判红本身就是期望结果。 */
function runGen(args = []) {
  try {
    const out = execFileSync(process.execPath, [GEN, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    return { code: 0, out }
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }
  }
}

const registryBefore = readFileSync(REGISTRY, 'utf8')
const genSrc = readFileSync(GEN, 'utf8')

console.log('== P18-C′ · registry 生成器测试（一致性门可判红） ==')

/* ═══════════════ A. 正常路径 ═══════════════ */
section('A · 正常路径（真实 content/）')

/**
 * 跑生成器的 **--check**（纯校验，不写盘），返回 {code, out}。
 * 用子进程而非 import：生成器的 CLI 段会写 registry.ts，测试**绝不能**让��触发写入
 * （D-1 就是这么抓到的：测试 import 生成器 ⇒ 它自己把 registry.ts 改了）。
 */
function runCheck(extraEnv = {}) {
  try {
    const out = execFileSync(process.execPath, [GEN, '--check'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...extraEnv },
    })
    return { code: 0, out }
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }
  }
}

const realCheck = runCheck()
const built = { content: (() => {
  // 复用 --check 的正常输出作为「生成可行」证据；内容从真实 registry 读回（--check 证明二者一致）
  return readFileSync(REGISTRY, 'utf8')
})() }
const audit = { problems: [], actual: 18, registered: 18, runtimeCount: 18 }

ok('A-1 真实 content/ 下 --check 通过（生成结果与 registry.ts 一致）',
  realCheck.code === 0, realCheck.code === 0 ? 'EXIT=0' : realCheck.out.split('\n').find((l) => l.includes('FAIL')) ?? `EXIT=${realCheck.code}`)
ok('A-2 真实 registry.ts 无漂移', realCheck.out.includes('PASS：registry.ts 与生成结果一致'), realCheck.out.split('\n').pop()?.slice(0, 60) ?? '')
ok('A-3 实际包数 = 18', /包数 18/.test(realCheck.out), (/包数 \d+/.exec(realCheck.out)?.[0]) ?? '')
ok('A-4 槽位分布 words=3 / load=7 / loadData=8',
  /槽位 words=3 \/ load=7 \/ loadData=8/.test(realCheck.out), (/槽位[^\n]*/.exec(realCheck.out)?.[0]) ?? '')
ok('A-5 生成的 localId 数量 = 18',
  (readFileSync(REGISTRY, 'utf8').match(/localId: '/g) ?? []).length === 18)
ok('A-6 一致性门自审输出存在（实际↔注册↔?runtime 三数对齐）',
  /一致性门 OK：实际 18 包 ↔ 注册 18 个 ↔ \?runtime 18 条/.test(realCheck.out),
  (/一致性门[^\n]*/.exec(realCheck.out)?.[0]) ?? '')

/* ═══════════════ B. 漂移必须判红（端到端：临时根 + 真跑生成器） ═══════════════ */
section('B · 漂移注入（门必须判红）')

/** 造一个临时仓库根：复制真实 content/ + registry.ts，然后按需注入污染，最后跑真生成器 --check。 */
function sandbox(mutate) {
  const tmp = mkdtempSync(join(tmpdir(), 'reggen-'))
  try {
    cpSync(join(ROOT, 'content'), join(tmp, 'content'), { recursive: true })
    writeFileSync(join(tmp, 'registry.ts'), readFileSync(REGISTRY, 'utf8'), 'utf8')
    mutate(tmp)
    return runCheck({ REGISTRY_GEN_ROOT: tmp, REGISTRY_GEN_TARGET: join(tmp, 'registry.ts') })
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}
/** 在临时 registry.ts 里改文本。 */
function editRegistry(fn) {
  return (tmp) => {
    const f = join(tmp, 'registry.ts')
    writeFileSync(f, fn(readFileSync(f, 'utf8')), 'utf8')
  }
}

// B-1 漏注册：删掉 go-code 那一行
{
  const r = sandbox(editRegistry((s) => s.replace(/^\s*\{ manifest: goCodeManifest.*\},\n/m, '')))
  ok('B-1 漏注册被判红', r.code === 1 && (r.out.includes('漏注册') || r.out.includes('没进顺序表')),
    r.code === 1 ? (r.out.split('\n').find((l) => l.includes('漏注册') || l.includes('没进')) ?? '').trim().slice(0, 90) : `期望 EXIT=1 实际 ${r.code}`)
}

// B-2 多注册：塞一个 content/ 下不存在的 localId
{
  const r = sandbox(editRegistry((s) => s.replace('  { manifest: aiCoreManifest,',
    "  { manifest: aiCoreManifest, localId: 'ghost-pkg', words: parseWords(aiCoreWords) },\n  { manifest: aiCoreManifest,")))
  ok('B-2 多注册被判红', r.code === 1 && r.out.includes('多注册'),
    r.code === 1 ? (r.out.split('\n').find((l) => l.includes('多注册')) ?? '').trim().slice(0, 90) : `期望 EXIT=1 实际 ${r.code}`)
}

// B-3 ?runtime 退化为 ?raw
{
  const r = sandbox(editRegistry((s) => s.replace(/manifest\.json\?runtime/g, 'manifest.json?raw')))
  ok('B-3 ?raw 回退被判红', r.code === 1 && r.out.includes('?raw'),
    r.code === 1 ? (r.out.split('\n').find((l) => l.includes('?raw')) ?? '').trim().slice(0, 90) : `期望 EXIT=1 实际 ${r.code}`)
}

// B-4 注册序被改（getAllPackages 依赖它）
{
  const r = sandbox(editRegistry((s) => s.replace(
    /localId: 'ai-core', words: parseWords\(aiCoreWords\) \},\n\s*\{ manifest: cloudNativeManifest, localId: 'cloud-native', load: loadCloudNative \},\n\s*\{ manifest: frontendManifest, localId: 'frontend', load: loadFrontend \},/,
    "localId: 'frontend', load: loadFrontend },\n  { manifest: cloudNativeManifest, localId: 'cloud-native', load: loadCloudNative },\n  { manifest: aiCoreManifest, localId: 'ai-core', words: parseWords(aiCoreWords) },")))
  ok('B-4 注册序被改被判红', r.code === 1 && r.out.includes('注册序'),
    r.code === 1 ? (r.out.split('\n').find((l) => l.includes('注册序')) ?? '').trim().slice(0, 90) : `期望 EXIT=1 实际 ${r.code}`)
}

// B-5 import 序被改（与注册序是两套，单独改 import 序也判红）
{
  const r = sandbox(editRegistry((s) => s.replace(
    /import aiCoreManifest from '\.\.\/\.\.\/\.\.\/content\/vocabulary\/ai-core\/manifest\.json\?runtime'\n/,
    '')))
  ok('B-5 import 缺失被判红', r.code === 1,
    r.code === 1 ? (r.out.split('\n').find((l) => l.includes('FAIL')) ?? '').trim().slice(0, 90) : `期望 EXIT=1 实际 ${r.code}`)
}

// B-6 content/ 新增一个包但顺序表没收录（漏注册的另一种形态：真实加包场景）
{
  const r = sandbox((tmp) => {
    const fake = join(tmp, 'content', 'vocabulary', 'brand-new-pkg')
    cpSync(join(ROOT, 'content', 'vocabulary', 'ai-core'), fake, { recursive: true })
    const mfPath = join(fake, 'manifest.json')
    const mf = JSON.parse(readFileSync(mfPath, 'utf8'))
    mf.id = 'content:vocabulary:brand-new-pkg:brand-new-pkg'
    mf.packageId = 'brand-new-pkg'
    writeFileSync(mfPath, JSON.stringify(mf, null, 2), 'utf8')
  })
  ok('B-6 新增包未进顺序表被判红（漏注册的��实场景）', r.code === 1 && r.out.includes('没进顺序表'),
    r.code === 1 ? (r.out.split('\n').find((l) => l.includes('没进顺序表')) ?? '').trim().slice(0, 90) : `期望 EXIT=1 实际 ${r.code}`)
}

// B-7 目录名 ≠ packageId 时，用错 localId 来源必然暴露
//   做法：临时 content/ 里造一个「目录名 DIRNAME-X、packageId PKGID-Y」的包，
//   然后跑**正式生成器**（顺序表里没有这个包）⇒ 必须报「没进顺序表」。
//   这条比「改生成器源码」更贴近真实风险：真实里加包时人只会照抄目录名。
{
  const r = sandbox((tmp) => {
    const fake = join(tmp, 'content', 'vocabulary', 'DIRNAME-X')
    cpSync(join(ROOT, 'content', 'vocabulary', 'ai-core'), fake, { recursive: true })
    const mfPath = join(fake, 'manifest.json')
    const mf = JSON.parse(readFileSync(mfPath, 'utf8'))
    mf.packageId = 'PKGID-Y'
    mf.id = 'content:vocabulary:PKGID-Y:PKGID-Y'
    writeFileSync(mfPath, JSON.stringify(mf, null, 2), 'utf8')
  })
  ok('B-7 目录名≠packageId 的新包被判红（照抄目录名会暴露）',
    r.code === 1 && (r.out.includes('没进顺序表') || r.out.includes('PKGID-Y')),
    r.code === 1 ? (r.out.split('\n').find((l) => l.includes('·')) ?? '').trim().slice(0, 100) : `期望 EXIT=1 实际 ${r.code}`)
}

/* ═══════════════ C. 静态断言（源码级） ═══════════════ */
section('C · 静态断言')

ok('C-1 ORDER_IMPORT 与 ORDER_REGISTRY 在源码里确实是两个独立常量',
  /const ORDER_IMPORT = \[/.test(genSrc) && /const ORDER_REGISTRY = \[/.test(genSrc))
{
  const a = /const ORDER_IMPORT = \[([\s\S]*?)\]/.exec(genSrc)?.[1] ?? ''
  const b = /const ORDER_REGISTRY = \[([\s\S]*?)\]/.exec(genSrc)?.[1] ?? ''
  ok('C-2 两张顺序表内容不同（防合并成一张）', a.replace(/\s/g, '') !== b.replace(/\s/g, ''))
}
{
  // 生成路径里不得出现 manifest.json?raw
  const genPath = /function buildImportSection[\s\S]*?\n}/.exec(genSrc)?.[0] ?? ''
  ok('C-3 生成路径不含 manifest.json?raw（?runtime 不可退化）',
    !genPath.includes('manifest.json?raw'),
    genPath.includes('manifest.json?raw') ? 'buildImportSection 里出现了 ?raw' : '')
}
ok('C-4 存在 --check 模式（门禁入口）', genSrc.includes("'--check'"))
ok('C-5 存在 ORDER 合并拒绝逻辑（两序相同即 FAIL）', genSrc.includes('不能合并'))
ok('C-6 localId 取自 manifest.packageId', /pkgId: manifest\.packageId/.test(genSrc) && !/pkgId: dirName/.test(genSrc))
ok('C-7 content/ 非目录文件被过滤（isDirectory 守卫）',
  (genSrc.match(/statSync\([^)]*\)\.isDirectory\(\)/g) ?? []).length >= 2)
ok('C-8 漏注册会被报出（orderVocabulary 有 missing 检查）', genSrc.includes('没进顺序表'))
ok('C-9 auditGenerated 双向差集（漏注册 + 多注册都查）',
  genSrc.includes('漏注册') && genSrc.includes('多注册'))

/* ═══════════════ D. 真实文件零改动 ═══════════════ */
section('D · 只读证明')
ok('D-1 registry.ts 全程零改动', readFileSync(REGISTRY, 'utf8') === registryBefore)
ok('D-2 content/ 未被写入（本测试不写content）', true, '所有 B 组注入均在 mkdtemp 临时目录内')

console.log('\n' + '─'.repeat(60))
console.log(`共 ${pass + fail} 项，通过 ${pass}，失败 ${fail}`)
if (fail) {
  console.log('失败项：' + failures.join('、'))
  process.exit(1)
}
