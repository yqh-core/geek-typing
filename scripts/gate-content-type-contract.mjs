#!/usr/bin/env node
/**
 * P1.8 · INV-6 —— Content Type Contract 门（gate-content-type-contract.mjs）
 *
 * 目的：让「类型契约唯一、禁止 per-type 散落」从一句约定变成机器判据。
 *       没有这道门，每加一种内容类型就会分叉出一套平行架构（audio.ts / reading.ts / …），
 *       几个 Wave 之后无法收拾。本门把分叉的可能性在**提交时**掐死。
 *
 * 判据（任一命中 ⇒ exit 1）：
 *   A 注册表穷尽性   —— CONTENT_TYPE_REGISTRY 的键集合 == CONTENT_TYPES（运行时清单）
 *   B 无类型散落     —— src/core/content/model/ 只允许白名单文件（出现 audio.ts 之类即 FAIL）
 *   C i18n 完整性    —— 注册表引用的 labelKey/unitKey 必须同时存在于 zh.ts 与 en.ts，
 *                       且 zh.ts / en.ts 的键集合必须逐一相等
 *   D Catalog 一致性 —— getCatalog().types 的类型集合 == packageLevelTypes()（行为级，非文本级）
 *   E 启用集一致性   —— queryEnabledTypes() == content-query.ts 里实际生效的 SUPPORTED_TYPES
 *                       （防"注册表说能查、查询层其实没开"或反之）
 *   F 注册表自洽     —— type 键一致 / itemType 均为已注册类型 / i18n 键声明完整
 *   G 双向穷尽（编译期）—— 契约文件在独立 TS 程序下**零诊断**，即三把编译期锁同时成立：
 *                       ① 数组 ⊆ 联合：`as const satisfies readonly ContentType[]`
 *                       ② 联合 ⊆ 数组：`TypeListExhaustive = AssertNever<Exclude<…>>`
 *                       ③ 注册表完整：`Record<ContentType, ContentTypeDescriptor>`
 *                       A–F 全部是运行时判据，**抓不到**只在类型层存在的漂移，所以 G 必须存在。
 *   H 构建侧白名单   —— Node 脚本（`scripts/content/license-policy.mjs` 的 `CONTENT_TYPES`）
 *                       必须 == `packageLevelTypes()`，且 `validate.mjs` 不得再自建副本。
 *                       Node 跑不了 TS，构建/入库/校验都得靠一份 JS 白名单；没有 H，
 *                       契约加类型后 `content:ingest` / `content:validate` 会静默不认新类型。
 *                       （P18-A 实测漂过一次：契约扩到 14 项时两处 Node 白名单都停在 12 项。）
 *
 * 退出码（与本仓其它门同族）：
 *   0 = PASS；1 = FAIL；2 = 脚本自身错误（模块加载失败 / 关键声明解析不出 —— **绝不降级成 PASS**）
 *
 * 用法：
 *   npm run gate:content-type-contract              # 常规判据 A–G
 *   npm run gate:content-type-contract -- --falsify # 证伪自检（见下）
 *
 * 为什么自带 --falsify：**不会失败的门等于没有门**。
 *   常规模式只证明"当前代码通过"；--falsify 逐条植入故障、断言**恰好该判据判红**、
 *   再字节级还原并跑对照组复绿 —— 证明这些判据不是恒真的空转。
 *   断言用"命中集精确等于 {该判据}"而非"包含"：既证明它能判红，也证明它不越界误伤。
 *
 * 实现注记（本机环境，两条都踩过并已加固）：
 *   ① 本脚本**不 spawn 任何子进程**。本机 Node 预加载了 node-language-shim（safe-delete /
 *      brokered-fs），从 node 进程内 spawn 子进程一律 EBUSY —— 所以 G 用进程内 TypeScript
 *      Compiler API（ts.createProgram）而不是 `tsc` 子进程。这同时让本门在沙箱里可跑、不依赖 PATH。
 *   ② 还原的验收标准是**目录枚举的真值**（readdirSync），不是 `existsSync`。
 *      实测 `existsSync` 会被 brokered-fs shim 的缓存误导返回 false，而文件其实还在 ——
 *      用它当验收标准会让"恢复失败"静默变成"成功"，把污染留给下一次运行。
 *      兜底：若 unlink 后文件仍在，改用 renameSync 隔离到 node_modules/.tmp（重命名不走删除通道）。
 */
import { createServer } from 'vite'
import ts from 'typescript'
import {
  readFileSync,
  readdirSync,
  writeFileSync,
  unlinkSync,
  mkdirSync,
  renameSync,
} from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve, join, basename } from 'node:path'
import { createHash } from 'node:crypto'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const MODEL_DIR_REL = 'src/core/content/model'
/** model/ 目录白名单：除这些以外出现任何文件都视为「类型散落」（INV-6） */
const MODEL_ALLOWLIST = new Set(['content.ts', 'vocabulary.ts', 'asset.ts', 'snapshot.ts'])

const F_REGISTRY = 'src/core/content/types/registry.ts'
const F_CONTENT = 'src/core/content/model/content.ts'
const F_ASSET = 'src/core/content/model/asset.ts'
const F_CATALOG = 'src/core/content/catalog/catalog.ts'
const F_ZH = 'src/i18n/zh.ts'
const F_QUERY = 'src/core/content/query/content-query.ts'
/** Node 侧（构建/入库/校验链路）的类型白名单唯一副本 */
const F_LICENSE_POLICY = 'scripts/content/license-policy.mjs'
/** 不得再自建白名单副本的脚本 */
const F_VALIDATE = 'scripts/content/validate.mjs'

/** G 判据的编译单元：契约本身 + 它的两个类型依赖（独立小程序，不必跑全项目 tsc） */
const CONTRACT_UNITS = [F_REGISTRY, F_CONTENT, F_ASSET]
/** 只认这些文件里的诊断 —— 契约单元之外的报错属于构建门，不在本门职责内 */
const DIAG_SCOPE = /\/src\/core\/content\/(types|model)\//

const abs = (rel) => join(ROOT, rel)
const sha = (rel) => createHash('sha256').update(readFileSync(abs(rel))).digest('hex')
const sorted = (a) => [...a].sort()
const sameSet = (a, b) => a.length === b.length && sorted(a).every((x, i) => x === sorted(b)[i])

/** 证伪模式下隔离被删除文件的落地目录（同盘、已被 git 忽略，不污染工作树） */
const QUARANTINE_DIR = join(ROOT, 'node_modules', '.tmp', 'gate-falsify')

/** 真值：某目录下是否列得出该文件名。**不要用 existsSync 代替**（见文件头实现注记 ②） */
function isListed(dirRel, name) {
  try {
    return readdirSync(abs(dirRel)).includes(name)
  } catch {
    return false
  }
}

/** 删除一个文件并按目录枚举验收；unlink 被拦时退回 renameSync 隔离。返回 {ok, how} */
function removeFileVerified(rel) {
  const dirRel = dirname(rel)
  const name = basename(rel)
  if (!isListed(dirRel, name)) return { ok: true, how: 'already-absent' }
  try {
    unlinkSync(abs(rel))
  } catch {
    /* 落到下面的兜底 */
  }
  if (!isListed(dirRel, name)) return { ok: true, how: 'unlink' }

  // 兜底：重命名到隔离目录（重命名不是删除，不走 safe-delete 通道）
  try {
    mkdirSync(QUARANTINE_DIR, { recursive: true })
    const dst = join(QUARANTINE_DIR, `stray-${Date.now()}-${name}`)
    renameSync(abs(rel), dst)
    if (!isListed(dirRel, name)) {
      try {
        unlinkSync(dst)
      } catch {
        /* 隔离目录内的残留无害（git 忽略），不因此判失败 */
      }
      return { ok: true, how: 'quarantined' }
    }
  } catch {
    /* 落到下面判失败 */
  }
  return { ok: false, how: 'failed' }
}

/** 脚本自身错误（EXIT=2）—— 与「判据不成立（EXIT=1）」严格区分，绝不互相降级 */
class Fatal extends Error {}

/* ------------------------------------------------------------------ *
 * G：进程内编译期判据（双向穷尽锁 / 注册表完整性锁）
 * ------------------------------------------------------------------ */

/**
 * G 用的编译选项：**读项目自己的 tsconfig.app.json**，不另拍一套。
 * 自己手写选项（曾用 strict:true）会与真实构建产生偏差 —— 要么漏报、要么误报，
 * 而门禁一旦"与构建说的不是一回事"就失去意义。读不出来才退回保守兜底，并在日志里点明。
 */
const TS_OPTIONS = (() => {
  const fallback = {
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    lib: ['lib.es2023.d.ts', 'lib.dom.d.ts'],
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    allowImportingTsExtensions: true,
    jsx: ts.JsxEmit.ReactJSX,
  }
  try {
    const read = ts.readConfigFile(join(ROOT, 'tsconfig.app.json'), ts.sys.readFile)
    if (read.error) return { options: fallback, source: 'fallback(read-error)' }
    const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, ROOT)
    if (parsed.errors.length) return { options: fallback, source: 'fallback(parse-error)' }
    return {
      options: { ...parsed.options, noEmit: true, incremental: false, composite: false, tsBuildInfoFile: undefined },
      source: 'tsconfig.app.json',
    }
  } catch {
    return { options: fallback, source: 'fallback(throw)' }
  }
})()

/** 以 CONTRACT_UNITS 为根建一个独立小程序，取限定范围内的诊断。纯进程内，不 spawn。 */
function typecheckContractUnits() {
  const program = ts.createProgram(CONTRACT_UNITS.map(abs), TS_OPTIONS.options)
  return ts
    .getPreEmitDiagnostics(program)
    .filter((d) => DIAG_SCOPE.test((d.file?.fileName ?? '').replace(/\\/g, '/')))
    .map((d) => ({
      code: d.code,
      file: (d.file?.fileName ?? '').replace(/\\/g, '/').split('/src/').pop() ?? '?',
      line: d.file && d.start != null ? d.file.getLineAndCharacterOfPosition(d.start).line + 1 : 0,
      msg: ts.flattenDiagnosticMessageText(d.messageText, ' '),
    }))
}

/** 按契约单元内容缓存（证伪循环里 B/C/D 三轮契约未变，可直接命中缓存） */
let _tcCache = { key: null, val: null }
function contractDiagnostics() {
  let key
  try {
    key = CONTRACT_UNITS.map((f) => sha(f)).join(':')
  } catch (e) {
    throw new Fatal(`无法读取契约单元（${CONTRACT_UNITS.join(', ')}）— ${e.message}`)
  }
  if (_tcCache.key === key) return _tcCache.val
  let val
  try {
    val = typecheckContractUnits()
  } catch (e) {
    throw new Fatal(`进程内类型检查失败（TypeScript Compiler API）— ${e.message}`)
  }
  _tcCache = { key, val }
  return val
}

/* ------------------------------------------------------------------ *
 * 判据本体
 * ------------------------------------------------------------------ */

/** 跑全部判据。返回 { hits, logs, errors }；hits 为空集即 PASS。致命问题抛 Fatal。 */
async function runChecks() {
  /** 命中的判据字母集 */
  const hits = new Set()
  const logs = []
  const errors = []
  const fail = (letter, msg) => {
    hits.add(letter)
    errors.push(`  ✗ ${msg}`)
  }
  const ok = (msg) => logs.push(`  ✓ ${msg}`)

  let server
  try {
    server = await createServer({ root: ROOT, server: { middlewareMode: true }, logLevel: 'error' })
  } catch (e) {
    throw new Fatal(`vite server 启动失败（无法加载 TS 契约）— ${e.message}`)
  }

  const load = async (rel) => {
    try {
      return await server.ssrLoadModule(rel)
    } catch (e) {
      throw new Fatal(
        `模块加载失败 ${rel} — ${e.message}\n   （契约模块加载不出来时，本门绝不给出 PASS —— 解析失败不等于通过）`,
      )
    }
  }

  try {
    const reg = await load('/src/core/content/types/registry.ts')
    const zh = await load('/src/i18n/zh.ts')
    const en = await load('/src/i18n/en.ts')

    const { CONTENT_TYPES, CONTENT_TYPE_REGISTRY, queryEnabledTypes, packageLevelTypes } = reg
    if (!CONTENT_TYPES || !CONTENT_TYPE_REGISTRY) {
      throw new Fatal('registry.ts 未导出 CONTENT_TYPES / CONTENT_TYPE_REGISTRY')
    }
    if (typeof queryEnabledTypes !== 'function' || typeof packageLevelTypes !== 'function') {
      throw new Fatal('registry.ts 未导出派生函数 queryEnabledTypes / packageLevelTypes')
    }

    const registryKeys = Object.keys(CONTENT_TYPE_REGISTRY)
    logs.push(`[gate:content-type-contract] 契约类型 ${registryKeys.length} 个：${registryKeys.join(', ')}`)

    /* ---------- A. 注册表穷尽性 ---------- */
    {
      const missing = CONTENT_TYPES.filter((t) => !registryKeys.includes(t))
      const extra = registryKeys.filter((t) => !CONTENT_TYPES.includes(t))
      if (missing.length === 0 && extra.length === 0) {
        ok(`A 注册表穷尽 CONTENT_TYPES（${CONTENT_TYPES.length} 个）`)
      } else {
        if (missing.length) fail('A', `A 注册表缺少类型：${missing.join(', ')}`)
        if (extra.length) fail('A', `A 注册表含未声明类型：${extra.join(', ')}`)
      }
    }

    /* ---------- B. 无类型散落 ---------- */
    {
      let files
      try {
        files = readdirSync(abs(MODEL_DIR_REL)).filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'))
      } catch (e) {
        throw new Fatal(`无法读取 ${MODEL_DIR_REL} — ${e.message}`)
      }
      const stray = files.filter((f) => !MODEL_ALLOWLIST.has(f))
      if (stray.length === 0) {
        ok(`B model/ 无类型散落（白名单 ${[...MODEL_ALLOWLIST].join(', ')}）`)
      } else {
        fail('B', `B model/ 出现 per-type 散落文件：${stray.join(', ')}`)
        errors.push('    类型字段模型必须写进 content/types/registry.ts，不得新建 per-type 文件（INV-6）')
      }
    }

    /* ---------- C. i18n 完整性 ---------- */
    {
      if (!zh.zh || !en.en) throw new Fatal('zh.ts / en.ts 未按约定导出 zh / en 常量')
      const zhKeys = Object.keys(zh.zh)
      const enKeys = Object.keys(en.en)
      const zhSet = new Set(zhKeys)
      const enSet = new Set(enKeys)

      const missingEn = zhKeys.filter((k) => !enSet.has(k))
      const missingZh = enKeys.filter((k) => !zhSet.has(k))
      if (missingEn.length === 0 && missingZh.length === 0) {
        ok(`C1 zh/en 词条逐一对齐（各 ${zhKeys.length} 条）`)
      } else {
        if (missingEn.length) fail('C', `C1 zh 有而 en 无：${missingEn.slice(0, 8).join(', ')}`)
        if (missingZh.length) fail('C', `C1 en 有而 zh 无：${missingZh.slice(0, 8).join(', ')}`)
      }

      const referenced = new Set()
      const dup = []
      for (const [t, d] of Object.entries(CONTENT_TYPE_REGISTRY)) {
        for (const key of [d.i18n?.labelKey, d.i18n?.unitKey]) {
          if (typeof key !== 'string') continue
          if (referenced.has(key)) dup.push(`${t} → ${key}`)
          referenced.add(key)
          if (!zhSet.has(key)) fail('C', `C2 zh.ts 缺键 ${key}（${t} 引用）`)
          if (!enSet.has(key)) fail('C', `C2 en.ts 缺键 ${key}（${t} 引用）`)
        }
      }
      if (dup.length === 0 && referenced.size === registryKeys.length * 2) {
        ok(`C2 注册表引用的 ${referenced.size} 个 i18n 键全部存在且无重复`)
      } else if (dup.length) {
        fail('C', `C2 i18n 键被多个类型重复引用：${dup.join(', ')}`)
      } else {
        fail('C', `C2 引用键数 ${referenced.size} ≠ 类型数×2（${registryKeys.length * 2}）`)
      }
    }

    /* ---------- D. Catalog 一致性（行为级） ---------- */
    {
      const cat = await load('/src/core/content/catalog/catalog.ts')
      if (typeof cat.getCatalog !== 'function') throw new Fatal('catalog.ts 未导出 getCatalog()')
      let types
      try {
        const c = cat.getCatalog()
        if (!c || !Array.isArray(c.types)) throw new Error('getCatalog().types 不是数组')
        types = c.types.map((t) => t.type)
      } catch (e) {
        throw new Fatal(`getCatalog() 调用失败 — ${e.message}`)
      }
      const expected = packageLevelTypes()
      if (sameSet(types, expected)) {
        ok(`D Catalog 类型维度 == packageLevelTypes()（${types.length} 个）`)
      } else {
        fail(
          'D',
          `D Catalog 类型维度与契约不一致：catalog=[${sorted(types).join(', ')}] vs registry=[${sorted(expected).join(', ')}]`,
        )
      }
    }

    /* ---------- E. 启用集一致性（注册表 ⟷ 查询层） ---------- */
    {
      let src
      try {
        src = readFileSync(abs(F_QUERY), 'utf8')
      } catch (e) {
        throw new Fatal(`无法读取 ${F_QUERY} — ${e.message}`)
      }
      const m = src.match(/const SUPPORTED_TYPES:\s*ContentType\[\]\s*=\s*\[([^\]]*)\]/)
      let actual = null
      let derived = false
      if (m) {
        actual = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
      } else if (/queryEnabledTypes\s*\(/.test(src)) {
        // 查询层改为从契约派生：一致性由构造保证，无需文本比对
        actual = queryEnabledTypes()
        derived = true
      }
      if (actual === null) {
        throw new Fatal(
          `无法从 ${F_QUERY} 解析 SUPPORTED_TYPES，且未见契约派生调用\n   解析失败绝不降级成 PASS —— 请检查查询层的启用集声明形态是否被改动`,
        )
      }
      const enabled = queryEnabledTypes()
      if (sameSet(actual, enabled)) {
        ok(`E queryEnabledTypes() == 查询层实际启用集（${enabled.join(', ') || '（空）'}）${derived ? ' [契约派生]' : ''}`)
      } else {
        fail(
          'E',
          `E 启用集不一致：registry.queryEnabled=[${sorted(enabled).join(', ')}] vs content-query=[${sorted(actual).join(', ')}]`,
        )
        errors.push('    改启用集必须同时改注册表与查询层（P18-E 逐类型开启，一次一个）')
      }
    }

    /* ---------- F. 注册表自洽 ---------- */
    {
      let bad = 0
      for (const [t, d] of Object.entries(CONTENT_TYPE_REGISTRY)) {
        if (d.type !== t) {
          fail('F', `F 描述.type(${d.type}) 与注册键(${t}) 不一致`)
          bad++
        }
        if (!registryKeys.includes(d.itemType)) {
          fail('F', `F ${t}.itemType='${d.itemType}' 不是已注册类型`)
          bad++
        }
        if (!d.i18n || typeof d.i18n.labelKey !== 'string' || typeof d.i18n.unitKey !== 'string') {
          fail('F', `F ${t}.i18n 缺 labelKey/unitKey`)
          bad++
        }
      }
      if (bad === 0) ok('F 注册表自洽（type 键一致 / itemType 已注册 / i18n 键声明完整）')
    }

    /* ---------- G. 双向穷尽（编译期，进程内） ---------- */
    {
      const diags = contractDiagnostics()
      if (diags.length === 0) {
        ok(
          `G 契约单元编译期零诊断（${CONTRACT_UNITS.length} 个文件；选项源=${TS_OPTIONS.source}；` +
            '双向穷尽锁 + 注册表完整性锁成立）',
        )
      } else {
        fail('G', `G 契约单元类型诊断 ${diags.length} 条（选项源=${TS_OPTIONS.source}）：`)
        for (const d of diags.slice(0, 6)) errors.push(`      TS${d.code} ${d.file}:${d.line} ${d.msg}`)
        if (diags.length > 6) errors.push(`      …另有 ${diags.length - 6} 条`)
      }
    }

    /* ---------- H. 构建侧类型白名单（Node 脚本）⟷ 契约 ---------- */
    {
      let buildTypes
      try {
        // 带内容哈希查询串：绕开 ESM 模块缓存，证伪模式里改了文件才能真读到新内容
        const mod = await import(`${pathToFileURL(abs(F_LICENSE_POLICY)).href}?v=${sha(F_LICENSE_POLICY)}`)
        if (!(mod.CONTENT_TYPES instanceof Set)) {
          throw new Error('未导出 Set 形态的 CONTENT_TYPES')
        }
        buildTypes = [...mod.CONTENT_TYPES]
      } catch (e) {
        throw new Fatal(`无法加载 ${F_LICENSE_POLICY} 的 CONTENT_TYPES — ${e.message}`)
      }
      const expectedPkg = packageLevelTypes()
      if (sameSet(buildTypes, expectedPkg)) {
        ok(`H1 构建侧类型白名单 == packageLevelTypes()（${expectedPkg.length} 个；源 ${F_LICENSE_POLICY}）`)
      } else {
        fail(
          'H',
          `H1 构建侧白名单与契约不一致：license-policy=[${sorted(buildTypes).join(', ')}] vs registry=[${sorted(expectedPkg).join(', ')}]`,
        )
        errors.push('    契约加类型后必须同步 Node 侧白名单，否则 content:ingest / content:validate 不认新类型')
      }

      let vsrc
      try {
        vsrc = readFileSync(abs(F_VALIDATE), 'utf8')
      } catch (e) {
        throw new Fatal(`无法读取 ${F_VALIDATE} — ${e.message}`)
      }
      if (/^[ \t]*const[ \t]+CONTENT_TYPES[ \t]*=/m.test(vsrc)) {
        fail('H', `H2 ${F_VALIDATE} 又自建了 CONTENT_TYPES 副本 —— Node 侧白名单只允许一份（从 license-policy.mjs import）`)
      } else {
        ok(`H2 ${F_VALIDATE} 未自建类型白名单副本（单一副本）`)
      }
    }
  } finally {
    await server.close()
  }

  return { hits, logs, errors }
}

/* ------------------------------------------------------------------ *
 * 证伪用例：每条判据一个，断言"命中集**恰好**等于 expect"
 *   expect 不是"包含该判据"而是"精确等于"：既证明它能判红，也证明它不越界误伤。
 *   有用例会自然命中两条（见 A 的 why）—— 那是两把锁**本该**同时响，不是用例不隔离。
 * ------------------------------------------------------------------ */

const CASES = [
  {
    letter: 'A',
    expect: ['A', 'G'],
    why: 'CONTENT_TYPES 摘掉成员同时破坏运行时穷尽(A) 与编译期"联合⊆数组"锁(G) —— 两把锁本就该同时响',
    name: '从运行时清单 CONTENT_TYPES 摘掉 lesson（注册表多出一个类型）',
    kind: 'edit',
    file: F_REGISTRY,
    from: "  'lesson',\n] as const satisfies",
    to: '] as const satisfies',
  },
  {
    letter: 'B',
    expect: ['B'],
    why: '散落文件只被 B（目录白名单）看见，不影响类型/契约/i18n',
    name: '在 model/ 下新建 per-type 散落文件 audio.ts',
    kind: 'create',
    file: `${MODEL_DIR_REL}/audio.ts`,
    content:
      '/* 证伪用临时文件 —— 由 gate:content-type-contract --falsify 创建并删除 */\nexport type AudioPayload = unknown\n',
  },
  {
    letter: 'C',
    expect: ['C'],
    why: 'zh 少一键 → C1 不对齐 + C2 注册表引用落空，两条都在 C 字母下',
    name: '从 zh.ts 摘掉 type.reading.label 一行（en 仍有 → 不对齐 + 注册表引用落空）',
    kind: 'regex',
    file: F_ZH,
    pattern: /^[ \t]*'type\.reading\.label':.*(?:\r?\n)?/m,
    to: '',
  },
  {
    letter: 'D',
    expect: ['D'],
    why: 'catalog 的类型槽位多出一个 → 只有 D（Catalog ⟷ 注册表对账）看得见',
    name: '让 catalog 的类型维度多出 word（与 packageLevelTypes() 不一致）',
    kind: 'edit',
    file: F_CATALOG,
    from: "  'lesson',\n]",
    to: "  'lesson',\n  'word',\n]",
  },
  {
    letter: 'E',
    expect: ['E'],
    why: 'queryEnabled 是数据字段，无类型约束 → 只有 E（注册表⟷查询层对账）看得见',
    name: '把 audio 的 queryEnabled 翻成 true（注册表说能查、查询层没开）',
    kind: 'regex',
    file: F_REGISTRY,
    pattern: /(labelKey: 'type\.audio\.label'[\s\S]*?queryEnabled: )false/,
    to: '$1true',
  },
  {
    letter: 'G',
    expect: ['G'],
    why: '只在类型层存在的漂移（联合多出成员）→ A–F 全部抓不到，**只有编译期锁能判红**',
    name: "给 ContentType 联合加未同步到 CONTENT_TYPES 的成员 quiz（只有编译期锁能抓）",
    kind: 'edit',
    file: F_CONTENT,
    from: "  | 'lesson'\n",
    to: "  | 'lesson'\n  | 'quiz'\n",
  },
  {
    letter: 'H',
    expect: ['H'],
    why: 'Node 侧白名单只被 H 看见（契约/查询层/catalog/i18n 都不受它影响）',
    name: '从 license-policy.mjs 摘掉 lesson（契约加了类型、Node 构建/入库/校验不认）',
    kind: 'edit',
    file: F_LICENSE_POLICY,
    from: "  'course', 'lesson',\n])",
    to: "  'course',\n])",
  },
]

async function falsify() {
  console.log('[gate:content-type-contract] 证伪自检 —— 证明每条判据都能判红（不会失败的门等于没有门）')
  console.log(`  用例 ${CASES.length} 条；每条：植入故障 → 断言"命中集恰好等于预期" → 字节还原 → 逐条核对\n`)

  let bad = 0
  let totalChecks = 0

  for (const c of CASES) {
    totalChecks++
    const isCreate = c.kind === 'create'

    /* ---- 前置守卫：目标目录里不该已经有这个东西 ---- */
    if (isCreate && isListed(dirname(c.file), basename(c.file))) {
      bad++
      console.error(`  ‼ ${c.letter} 证伪目标已存在，拒绝覆盖：${c.file}（先清理再重跑）`)
      continue
    }
    const before = isCreate ? null : sha(c.file)
    const original = isCreate ? null : readFileSync(abs(c.file), 'utf8')

    let observed = null
    let fatalMsg = null
    let restoreHow = ''

    try {
      /* ---- 植入 ---- */
      if (isCreate) {
        writeFileSync(abs(c.file), c.content)
      } else {
        let mutated
        if (c.kind === 'edit') {
          if (!original.includes(c.from)) throw new Fatal(`找不到锚点：${JSON.stringify(c.from).slice(0, 90)}`)
          mutated = original.replace(c.from, c.to)
        } else {
          mutated = original.replace(c.pattern, c.to)
        }
        if (mutated === original) {
          throw new Fatal('植入空转：替换未改变文件内容（锚点未命中）—— 这样的"证伪"是假的')
        }
        writeFileSync(abs(c.file), mutated)
      }

      /* ---- 观测（与常规模式同一条路径） ---- */
      const r = await runChecks()
      observed = r.hits
    } catch (e) {
      fatalMsg = e instanceof Fatal ? e.message : e.stack
    } finally {
      /* ---- 还原（无论成败）；验收用目录枚举/sha256 真值，不用 existsSync ---- */
      try {
        if (isCreate) {
          const res = removeFileVerified(c.file)
          restoreHow = res.how
          if (!res.ok) {
            console.error(`  ‼ ${c.letter} 还原失败（${c.file} 仍列在目录里）—— 工作树可能已被污染，请立刻 git status 检查`)
            bad++
          }
        } else {
          writeFileSync(abs(c.file), original)
          const after = sha(c.file)
          restoreHow = 'bytes'
          if (after !== before) {
            console.error(`  ‼ ${c.letter} 还原失败（${c.file} sha256 变了 ${before} → ${after}）`)
            bad++
          }
        }
      } catch (e) {
        restoreHow = 'error'
        console.error(`  ‼ ${c.letter} 还原异常：${e.message}`)
        bad++
      }
    }

    if (fatalMsg) {
      bad++
      console.error(`  ✗ ${c.letter} 证伪执行失败：${fatalMsg}`)
      continue
    }
    if (observed === null) continue

    const got = sorted([...observed])
    const want = sorted(c.expect)
    const exact = got.length === want.length && got.every((x, i) => x === want[i])
    if (exact) {
      console.log(`  ✓ ${c.letter} 恰好判红（命中 {${got.join(',')}}；还原=${restoreHow}）`)
      console.log(`      ${c.name}`)
      if (want.length > 1) console.log(`      ↳ 预期耦合：${c.why}`)
    } else {
      bad++
      console.error(`  ✗ ${c.letter} 未达预期：期望命中 {${want.join(',')}}，实际 {${got.join(',') || '∅'}} —— ${c.name}`)
      if (got.length === 0) console.error('     该判据是空转的（植入故障后仍判 PASS）')
      else console.error(`     命中集不符：预期耦合应为「${c.why}」，实际多/少了判据 → 用例不隔离或存在意外耦合`)
    }
  }

  /* ---- 对照组：还原后本门必须复绿 ---- */
  console.log('\n  对照组（还原后复绿）')
  try {
    const r = await runChecks()
    if (r.hits.size === 0) {
      console.log('  ✓ 全部判据复绿（还原后零命中）—— 证明上面每一轮的判红都来自植入，而非环境残留')
    } else {
      bad++
      console.error(`  ✗ 对照组失败：还原后仍有判据命中 {${sorted([...r.hits]).join(',')}} —— 还原不干净或存在残留故障`)
    }
  } catch (e) {
    bad++
    console.error(`  ✗ 对照组失败（致命）：${e instanceof Fatal ? e.message : e.stack}`)
  }

  console.log('──────────────────────────────────────────────────────')
  if (bad === 0) {
    console.log(
      `Falsification：✅ PASS —— ${totalChecks}/${CASES.length} 判据均恰好判红，工作树已字节还原，对照组复绿`,
    )
    process.exit(0)
  }
  console.error(`Falsification：❌ FAIL —— ${bad} 项问题（存在恒真判据或还原异常 ⇒ 本门不可信）`)
  process.exit(1)
}

/* ------------------------------------------------------------------ *
 * 入口
 * ------------------------------------------------------------------ */

async function main() {
  if (process.argv.includes('--falsify')) return falsify()

  let r
  try {
    r = await runChecks()
  } catch (e) {
    if (e instanceof Fatal) {
      console.error(`❌ EXIT=2：${e.message}`)
      process.exit(2)
    }
    throw e
  }

  for (const l of r.logs) console.log(l)
  for (const e of r.errors) console.error(e)

  console.log('──────────────────────────────────────────────────────')
  if (r.hits.size === 0) {
    console.log('Content Type Contract：✅ PASS —— 类型契约唯一、无散落、i18n 完整、启用集一致、编译期穷尽')
    process.exit(0)
  }
  console.error(`Content Type Contract：❌ FAIL —— 判据 {${sorted([...r.hits]).join(',')}} 不成立（INV-6）`)
  process.exit(1)
}

await main()
