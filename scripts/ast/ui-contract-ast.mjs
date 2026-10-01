#!/usr/bin/env node
/**
 * P1.8-D · INV-2 —— UI 内容契约的 **AST 判定核心**（ts-morph）。
 *
 * 裁定依据：`docs/p18/P1.8-DESIGN-RULINGS-v1.0.md` §⑧（尤其 ⑧-2 桶定义 / ⑧-4 灰区裁定 / ⑧-5 防假绿）。
 *
 * ## 为什么必须是 AST 而不是正则（三条**实测**反例，正则方案必错）
 *
 *   假阳 `src/components/ReviewPanel.tsx:162` —— `LEVELS.filter(...)`：`LEVELS: MasteryLevel[]`
 *        是常量数组。任何「出现 `.filter(` 即违规」的正则必中。
 *   假阳 `src/lib/analytics.ts:259-263` —— `Object.entries(a.words).map().filter().sort().slice()`：
 *        `a.words` 是 `Record<string, WordStat>`、**不是数组**，但名字带 `words`，且整条链
 *        恰好是这四个算子 —— 文本正则的完美假阳。
 *   假阴 `src/components/Memorize.tsx:53-56` —— **换行链式** `bank.words` ⏎ `.filter(...)`
 *        ⏎ `.slice(...)` ⏎ `.map(...)`：单行正则只命中 1/3（漏 filter 与 slice）。
 *
 * 因此本文件的每个判据都以 **类型**（`WordItem[]` / 字符串字面量取值）锚定，而不是以文本锚定。
 *
 * ## 扫描范围（= 「消费者域」的 UI 子集 + 一处显式追加）
 *
 *   默认 = `src/App.tsx` / `src/main.tsx` / `src/components/**` / `src/hooks/**`
 *        **外加** `UI_EXTRA_FILES`（具名常量，见 ⑧-4）。
 *
 *   ⑧-4 裁定：`src/lib/wordResolve.ts` 直接持有并遍历词表（`allLoadedWords(banks)` / `flatMap`），
 *   且**被 UI 依赖**（`ReviewPanel.tsx:53,90`、`useReviewFlow.ts:73,98`）。但它落在
 *   `boundary-ast` 的 `/lib/` 排除区内 —— 若门只看 UI 域，这一次直读会「躲在被调函数里」
 *   绕过棘轮。故**显式纳入**（在门里作为具名常量列出，可审计、可 diff）。
 *
 * ## 六个桶（判据，不允许改定义）
 *
 *   tableJsonImports     import 语句（静态 + 动态 import()/require）    == 0 硬零
 *   packageBranches      BinaryExpression 边（一侧字面量 ∈ 内容包 id）  == 0 硬零
 *   wordTableSources     表达式（词表来源点）                            ≤ 基线
 *   handleReads          表达式（词表句柄上的读操作）                    ≤ 基线
 *   bannedArrayOps       CallExpression（链上每个算子各计 1）            ≤ 基线
 *   bypassFacadeImports  import 语句（绕过门面直引 core/content/**）     ≤ 基线
 *
 * ## 包 id 集合不做第二份手写清单
 *
 * `packageBranches` **不能**写成「变量名含 `id` + 字符串字面量」——`src/components/Header.tsx:241`
 * 的 `th.id === 'ide'`（主题 id）会假阳。判据必须用**字面量取值 ∈ 内容包 id 集合**锚定，而该集合
 * 由 `content/` 目录**派生**（`contentPackageIds()`），不是手写的第二份名单。
 *
 * ## 实现约束
 *
 *   - **纯进程内** ts-morph / TypeScript Compiler API，**不 spawn 子进程**（本机预加载 shim，
 *     同步 spawn 一律 EBUSY）。
 *   - **刻意不设** `skipFileDependencyResolution` —— 本判据依赖真实类型解析（`X.words: WordItem[]`）；
 *     跳过依赖解析会让导入符号退化成 `any`，六个桶全部恒零，**正是本门要防的那种假绿**。
 *     （对照：`boundary-ast.mjs` 只用语法、不用类型，所以它在那边可以开。）
 *
 * 用法（库）：import { checkUiContract } from './ui-contract-ast.mjs'
 * 用法（CLI）：node scripts/ast/ui-contract-ast.mjs [--scan-root=<dir>] [--json]
 */
import { Node, Project, SyntaxKind, ts } from 'ts-morph'
import { readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { REPO_ROOT, foldString, walkSourceFiles } from './boundary-ast.mjs'

export { REPO_ROOT }

/** 默认扫描根：`src/`（真实运行口径）。 */
export const DEFAULT_SCAN_ROOT = join(REPO_ROOT, 'src')

/** UI 域文件名口径（相对仓库根）。与 `node_modules/.tmp/uic/detect.mjs` 的 UI_SCOPE_RE 逐字一致。 */
export const UI_SCOPE_RE = /^src\/(App\.tsx|main\.tsx|components\/.*\.(ts|tsx)|hooks\/.*\.(ts|tsx))$/

/**
 * **显式追加**进扫描范围的具名常量（⑧-4）。
 * 每条都要附书面理由 —— 这里只有一条，且是裁定明确要求的：
 *   `src/lib/wordResolve.ts` 持有并遍历词表、且被 UI 调用 ⇒ 不纳入就等于承认「洞存在」。
 * 新增即本门的配置变更（可审计、可 diff），不得散在正则里。
 */
export const UI_EXTRA_FILES = ['src/lib/wordResolve.ts']

/** 禁用的数组算子（CONTENT_CONTRACT §12.2②）。链式调用时**每个算子各计 1**。 */
export const BANNED_ARRAY_OPS = new Set(['filter', 'map', 'sort', 'slice'])

/** 「读操作」算子（句柄上的读，不含禁用的四个数组算子时另算）。 */
export const READ_OPS = new Set([
  'find', 'findIndex', 'findLast', 'findLastIndex', 'forEach', 'some', 'every',
  'reduce', 'reduceRight', 'includes', 'indexOf', 'lastIndexOf', 'join', 'at',
  'flat', 'flatMap', 'keys', 'values', 'entries', 'concat', 'reverse', 'splice',
])

/** `data/wordBanks` 的**词表读取 API**（值导出）。`DEFAULT_BANK_ID` 只是常量、不算词表读取。 */
export const TABLE_APIS = new Set(['WORD_BANKS', 'bankWordsOf', 'allLoadedWords', 'ensureBankWords'])

/**
 * 词表句柄的**按名锚点**（显式清单，新增即门的配置变更）：
 * `useBank()` 返回的词表数组名为 `bankWords`，它在 UI 里被直接遍历。
 */
export const TABLE_HANDLE_NAMES = new Set(['bankWords'])

/** 词表 JSON 载荷说明符（静态 + 动态都走这一条）。刻意先剥 `?raw` / `#fragment` 再判定。 */
const TABLE_JSON_PATH_RE = /(?:^|\/)(?:words|items)\.json$/

/** 门面所在目录（相对仓库根）。 */
const CONTENT_DIR_REL = 'src/core/content'

/** 六个桶（有序；顺序即输出顺序）。`rule: 'zero'` = 硬零，`rule: 'ratchet'` = 只许降不许升。 */
export const BUCKETS = [
  { key: 'tableJsonImports', rule: 'zero', unit: 'import 语句（静态 + 动态）', contract: 'CONTENT_CONTRACT §12.2①' },
  { key: 'packageBranches', rule: 'zero', unit: 'BinaryExpression 边', contract: 'CONTENT_CONTRACT §12.2③' },
  { key: 'wordTableSources', rule: 'ratchet', unit: '表达式（词表来源点）', contract: 'CONTENT_CONTRACT §12.4 白名单' },
  { key: 'handleReads', rule: 'ratchet', unit: '表达式（词表句柄读操作）', contract: 'CONTENT_CONTRACT §12.2②' },
  { key: 'bannedArrayOps', rule: 'ratchet', unit: 'CallExpression（链上每个算子各计 1）', contract: 'CONTENT_CONTRACT §12.2②' },
  { key: 'bypassFacadeImports', rule: 'ratchet', unit: 'import 语句（绕过门面直引 core/content/**）', contract: 'CONTENT_CONTRACT §12.1' },
]

/** 桶 key 的有序数组（基线与门共用；**单一事实源**）。 */
export const BUCKET_KEYS = BUCKETS.map((b) => b.key)

/** 判定核心的致命错误（EXIT=2 一类）：判据输入不可得时**绝不**降级成「零违规」。 */
export class UiContractFatal extends Error {
  constructor(message) {
    super(message)
    this.name = 'UiContractFatal'
  }
}

/* ------------------------------------------------------------------ *
 * 内容包 id 集合（从 content/ 派生，不做第二份手写清单）
 * ------------------------------------------------------------------ */

let _pkgIdCache = null

/**
 * 派生「内容包 id 集合」= `content/<type>/<pkg>/` 的**目录名**。
 *
 * 口径来源：`src/core/content/registry.ts:32` 明写 `localId` = 「ContentId 的第 4 段（裸包 id）」，
 * 且注册表为每个包登记 `content/<type>/<id>/` —— 目录名即 localId（实测 18 个包两两相等）。
 * 用目录派生而不是手写名单：新增/删除包时判据自动跟随，不存在「名单落后于内容」的漂移。
 *
 * fail-closed：`content/` 不可读或派生出空集 ⇒ 抛 `UiContractFatal`。
 * 空集会让 `packageBranches` 恒判零（假绿），绝不能当成「没有违规」。
 */
export function contentPackageIds(root = REPO_ROOT) {
  if (_pkgIdCache && _pkgIdCache.root === root) return _pkgIdCache.ids
  const contentDir = join(root, 'content')
  let types
  try {
    types = readdirSync(contentDir, { withFileTypes: true })
  } catch (e) {
    throw new UiContractFatal(`content/ 不可读（${contentDir}）— ${e.message}；内容包 id 集合无法派生，packageBranches 判据会退化成恒零`)
  }
  const ids = new Set()
  for (const t of types) {
    if (!t.isDirectory()) continue
    let pkgs
    try {
      pkgs = readdirSync(join(contentDir, t.name), { withFileTypes: true })
    } catch {
      continue
    }
    for (const p of pkgs) if (p.isDirectory()) ids.add(p.name)
  }
  if (ids.size === 0) {
    throw new UiContractFatal(`content/ 下未派生出任何内容包目录（${contentDir}）—— 空集会让 packageBranches 恒判零，拒绝放行`)
  }
  _pkgIdCache = { root, ids }
  return ids
}

/* ------------------------------------------------------------------ *
 * 工程构造
 * ------------------------------------------------------------------ */

/**
 * 建 ts-morph 工程。编译器选项取 `tsconfig.app.json`（真正管辖 src/ 的那份；
 * 根 `tsconfig.json` 是 solution 文件，只有 files:[] + references），与仓库构建口径一致。
 *
 * ⚠️ **不设** `skipFileDependencyResolution`：本判据依赖真实类型解析。
 *    设了它，`import type { WordItem }` 之类的符号会解析不到而退化成 `any`，
 *    于是 `wordTableSources` / `bannedArrayOps` 全部恒零 —— 一种不报错的假绿。
 */
export function createUiContractProject({ root = REPO_ROOT } = {}) {
  return new Project({
    compilerOptions: loadCompilerOptions(root),
    skipAddingFilesFromTsConfig: true,
  })
}

function loadCompilerOptions(root) {
  const appConfig = join(root, 'tsconfig.app.json')
  try {
    const read = ts.readConfigFile(appConfig, ts.sys.readFile)
    if (!read.error) {
      const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, dirname(appConfig))
      if (parsed.options && Object.keys(parsed.options).length > 0) {
        return { ...parsed.options, noEmit: true, incremental: false, composite: false }
      }
    }
  } catch {
    /* 落到兜底：不依赖任何 tsconfig 也能判定 */
  }
  return {
    target: ts.ScriptTarget.ES2023,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    allowJs: false,
    noEmit: true,
    skipLibCheck: true,
  }
}

/* ------------------------------------------------------------------ *
 * 通用小工具
 * ------------------------------------------------------------------ */

/** `import type` / 全部具名绑定带 inline `type` ⇒ 无运行时耦合，放行（口径同 boundary-ast）。 */
function isTypeOnlyImport(decl) {
  if (decl.isTypeOnly()) return true
  const clause = decl.getImportClause()
  if (!clause) return false // `import './x'` 副作用导入：有运行时耦合
  if (clause.getDefaultImport() || clause.getNamespaceImport()) return false
  const named = clause.getNamedBindings()
  if (named && Node.isNamedImports(named)) {
    const els = named.getElements()
    return els.length > 0 && els.every((e) => e.isTypeOnly())
  }
  return false
}

/** 词表 JSON 载荷？先剥 `?raw` / `#frag` 再判定（UI 侧 `?raw` 回退同样要抓）。 */
function isTableJsonSpecifier(spec) {
  if (typeof spec !== 'string') return false
  const path = spec.split(/[?#]/)[0]
  return TABLE_JSON_PATH_RE.test(path)
}

/**
 * 说明符是否指向 `src/core/content/**`：`'facade'`（顶层 barrel）/ `'bypass'`（深路径）/ `null`（无关）。
 * 纯路径判定，不做文件系统解析 —— 只认相对说明符（`./`、`../`）。
 */
export function classifyContentSpecifier(spec, fromFileRel) {
  if (typeof spec !== 'string' || !spec.startsWith('.')) return null
  const base = resolve(REPO_ROOT, CONTENT_DIR_REL).replaceAll('\\', '/')
  const abs = resolve(dirname(resolve(REPO_ROOT, fromFileRel)), spec).replaceAll('\\', '/')
  if (abs === base || abs === `${base}/index` || abs === `${base}/index.ts`) return 'facade'
  if (abs.startsWith(`${base}/`)) return 'bypass'
  return null
}

/** 元素类型是否为 `WordItem`（`WordItem[]` / `ReadonlyArray<WordItem>`）。 */
function isWordArray(t) {
  if (!t) return false
  let et = null
  try {
    if (t.isArray()) et = t.getArrayElementType()
    else if (typeof t.isReadonlyArray === 'function' && t.isReadonlyArray()) et = t.getArrayElementType()
  } catch {
    return false
  }
  if (!et) return false
  return /(?:^|[^\w$])WordItem$/.test(et.getText())
}

/** 属性访问 `.words` 的类型是否为 `WordItem[]`。 */
function propWordsIsArray(pa) {
  try {
    return isWordArray(pa.getType())
  } catch {
    return false
  }
}

/* ------------------------------------------------------------------ *
 * 判定主入口
 * ------------------------------------------------------------------ */

/**
 * AST 版 UI 内容契约判定。
 *
 * @param {object} [opts]
 * @param {string} [opts.root=REPO_ROOT] 相对路径基准
 * @param {string} [opts.scanRoot] 扫描根（默认 `<root>/src`）。**显式传入**时进入「探针模式」：
 *   扫描根下**所有** .ts/.tsx 都进判定（不套 `UI_SCOPE_RE`）—— 因为合成探针的路径不在 src/ 下。
 * @param {import('ts-morph').Project} [opts.project] 可复用工程
 * @returns {{buckets: Record<string, number>, files: string[], violations: Array, scanned: number, root: string, durationMs: number}}
 */
export function checkUiContract({ root = REPO_ROOT, scanRoot, project } = {}) {
  const t0 = performance.now()
  const probeMode = scanRoot != null
  const absScanRoot = resolve(root, scanRoot ?? 'src')
  const absScanRootNorm = absScanRoot.replaceAll('\\', '/')
  const own = project ?? createUiContractProject({ root })
  const relOf = (p) => relative(root, typeof p === 'string' ? p : p.getFilePath()).replaceAll('\\', '/')

  // 默认模式：UI 域正则 ∪ 显式追加项。
  // 探针模式（显式传 scanRoot）：**扫描根目录下的全部** .ts/.tsx —— 合成探针的路径不在 src/ 下，
  //   套 UI_SCOPE_RE 会一个都扫不到。用「必须落在扫描根内」而不是「无条件 true」，
  //   是为了把 ts-morph 因依赖解析而自动纳入工程的 node_modules 文件挡在计数之外。
  const inScope = (rel) => {
    if (probeMode) return resolve(root, rel).replaceAll('\\', '/').startsWith(`${absScanRootNorm}/`)
    return UI_SCOPE_RE.test(rel) || UI_EXTRA_FILES.includes(rel)
  }

  const all = walkSourceFiles(absScanRoot)
  for (const f of all) if (!own.getSourceFile(f)) own.addSourceFileAtPath(f)

  const buckets = Object.fromEntries(BUCKET_KEYS.map((k) => [k, 0]))
  const violations = []
  const seen = new Set()
  const files = []
  const packageIds = contentPackageIds(root)

  const record = (bucket, file, node, detail, text) => {
    const line = node.getStartLineNumber()
    const key = `${bucket}\u0000${file}:${line}\u0000${detail}`
    if (seen.has(key)) return
    seen.add(key)
    buckets[bucket]++
    violations.push({ bucket, file, line, detail, text })
  }

  for (const sf of own.getSourceFiles()) {
    const r = relOf(sf)
    if (!inScope(r)) continue
    files.push(r)

    const lines = sf.getFullText().split(/\r?\n/)
    const lineText = (line) => (lines[line - 1] ?? '')
    const trunc = (s, n = 160) => {
      const t = (s ?? '').trim()
      return t.length > n ? `${t.slice(0, n)}…` : t
    }

    /* ---- 本文件从 data/wordBanks 值导入的词表 API 绑定名（别名按别名算） ---- */
    const tableApiBindings = new Set()
    for (const d of sf.getImportDeclarations()) {
      if (!/wordBanks$/.test(d.getModuleSpecifierValue() ?? '')) continue
      const named = d.getImportClause()?.getNamedBindings()
      if (!named || !Node.isNamedImports(named)) continue
      for (const e of named.getElements()) {
        if (e.isTypeOnly()) continue
        const name = e.getName()
        if (!TABLE_APIS.has(name)) continue
        tableApiBindings.add(e.getAliasNode()?.getText() ?? name)
      }
    }

    /* ---- 桶 ①：直读词表 JSON（静态 + 动态） ---- */
    for (const d of sf.getImportDeclarations()) {
      const spec = d.getModuleSpecifierValue()
      if (!isTableJsonSpecifier(spec)) continue
      record('tableJsonImports', r, d, `import:${spec}`, trunc(d.getText()))
    }
    for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const expr = call.getExpression()
      const isDynamic = expr.getKind() === SyntaxKind.ImportKeyword
      const isRequire = Node.isIdentifier(expr) && expr.getText() === 'require'
      if (!isDynamic && !isRequire) continue
      const spec = foldString(call.getArguments()[0])
      if (!isTableJsonSpecifier(spec)) continue
      record('tableJsonImports', r, call, `${isDynamic ? 'import()' : 'require()'}:${spec}`, trunc(lineText(call.getStartLineNumber())))
    }

    /* ---- 桶 ②：内容包 id 分支（字面量取值 ∈ 派生集合，**不是**变量名含 id） ---- */
    for (const bin of sf.getDescendantsOfKind(SyntaxKind.BinaryExpression)) {
      const op = bin.getOperatorToken().getText()
      if (!['===', '!==', '==', '!='].includes(op)) continue
      for (const side of [bin.getLeft(), bin.getRight()]) {
        const lit = literalValueOf(side)
        if (lit === null || !packageIds.has(lit)) continue
        record('packageBranches', r, bin, `lit:${lit}`, trunc(lineText(bin.getStartLineNumber())))
      }
    }

    /* ---- 桶 ③：词表来源点（① `X.words` 属性访问 ② wordBanks 词表 API 标识符引用） ---- */
    for (const pa of sf.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)) {
      if (pa.getName() !== 'words') continue
      if (!propWordsIsArray(pa)) continue
      record('wordTableSources', r, pa, `words:${pa.getExpression().getText()}`, trunc(lineText(pa.getStartLineNumber())))
    }
    for (const id of sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
      const nm = id.getText()
      if (!tableApiBindings.has(nm)) continue
      if (Node.isImportSpecifier(id.getParent())) continue
      record('wordTableSources', r, id, `api:${nm}`, trunc(lineText(id.getStartLineNumber())))
    }

    /* ---- 桶 ④：词表句柄上的读操作（成员 / 下标 / 透传） ---- */
    const handleNames = new Set([...tableApiBindings, ...TABLE_HANDLE_NAMES])
    const isHandleBase = (n) => {
      if (Node.isPropertyAccessExpression(n) && n.getName() === 'words') return true
      if (Node.isIdentifier(n)) return handleNames.has(n.getText())
      return false
    }
    for (const pa of sf.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)) {
      const base = pa.getExpression()
      if (!isHandleBase(base)) continue
      const op = pa.getName()
      if (!(op === 'length' || READ_OPS.has(op) || BANNED_ARRAY_OPS.has(op))) continue
      record('handleReads', r, pa, `${op}:${base.getText()}`, trunc(lineText(pa.getStartLineNumber())))
    }
    for (const ea of sf.getDescendantsOfKind(SyntaxKind.ElementAccessExpression)) {
      if (!isHandleBase(ea.getExpression())) continue
      record('handleReads', r, ea, `[]:${ea.getExpression().getText()}`, trunc(lineText(ea.getStartLineNumber())))
    }
    for (const id of sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
      if (!tableApiBindings.has(id.getText())) continue
      const p = id.getParent()
      if (Node.isImportSpecifier(p)) continue
      const passThrough =
        (Node.isCallExpression(p) && p.getArguments().includes(id)) ||
        Node.isReturnStatement(p) ||
        Node.isSpreadElement(p) ||
        Node.isPropertyAssignment(p)
      if (!passThrough) continue
      record('handleReads', r, id, `pass:${id.getText()}`, trunc(lineText(id.getStartLineNumber())))
    }

    /* ---- 桶 ⑤：WordItem[] 上的 filter/map/sort/slice（链上每个算子各计 1） ---- */
    for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const callee = call.getExpression()
      if (!Node.isPropertyAccessExpression(callee)) continue
      const op = callee.getName()
      if (!BANNED_ARRAY_OPS.has(op)) continue
      let rt
      try {
        rt = callee.getExpression().getType()
      } catch {
        continue
      }
      if (!isWordArray(rt)) continue
      record('bannedArrayOps', r, call, `${op}:${callee.getExpression().getText()}`, trunc(lineText(call.getStartLineNumber())))
    }

    /* ---- 桶 ⑥：绕过门面直引 core/content/** ---- */
    for (const d of sf.getImportDeclarations()) {
      if (isTypeOnlyImport(d)) continue
      const spec = d.getModuleSpecifierValue()
      if (classifyContentSpecifier(spec, r) !== 'bypass') continue
      record('bypassFacadeImports', r, d, `bypass:${spec}`, trunc(d.getText()))
    }
  }

  files.sort()
  violations.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1))

  return {
    buckets,
    files,
    violations,
    scanned: files.length,
    root,
    durationMs: performance.now() - t0,
  }
}

/** 取「字符串字面量取值」：字面量 / 无替换模板 / 括号包裹的字面量；其余返回 null。 */
function literalValueOf(node) {
  if (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)) return node.getLiteralText()
  if (Node.isParenthesizedExpression(node)) return literalValueOf(node.getExpression())
  return null
}

/* ------------------------------------------------------------------ *
 * CLI：node scripts/ast/ui-contract-ast.mjs [--scan-root=<dir>] [--json]
 * ------------------------------------------------------------------ */

const isDirectRun = process.argv[1] && /[\\/]scripts[\\/]ast[\\/]ui-contract-ast\.mjs$/.test(process.argv[1])
if (isDirectRun) {
  let scanRoot = null
  let json = false
  for (const a of process.argv.slice(2)) {
    if (a === '--json') { json = true; continue }
    const m = /^--scan-root=(.*)$/.exec(a)
    if (m && m[1]) { scanRoot = resolve(m[1]); continue }
    console.error(`未知参数 ${JSON.stringify(a)}`)
    process.exit(2)
  }
  try {
    const r = checkUiContract({ scanRoot })
    if (json) {
      console.log(JSON.stringify({ buckets: r.buckets, scanned: r.scanned, files: r.files, violations: r.violations }, null, 2))
    } else {
      console.log(`UI 内容契约（AST 判定核心）—— 扫描 ${r.scanned} 个文件，耗时 ${r.durationMs.toFixed(0)}ms`)
      console.log(`扫描范围：UI_SCOPE_RE ∪ UI_EXTRA_FILES = ${JSON.stringify(UI_EXTRA_FILES)}`)
      console.log(`内容包 id 集合（从 content/ 派生，${contentPackageIds().size} 个）：${[...contentPackageIds()].sort().join(', ')}\n`)
      for (const b of BUCKETS) {
        const head = `== ${b.key} == ${r.buckets[b.key]} 处`
        console.log(`${head}   [${b.rule === 'zero' ? '硬零' : '棘轮 ≤ 基线'}] 单位=${b.unit}`)
        for (const v of r.violations.filter((x) => x.bucket === b.key)) {
          console.log(`   ${v.file}:${v.line}  [${v.detail}] ${v.text}`)
        }
        console.log('')
      }
    }
    process.exit(0)
  } catch (e) {
    if (e instanceof UiContractFatal) {
      console.error(`EXIT=2：${e.message}`)
      process.exit(2)
    }
    throw e
  }
}
