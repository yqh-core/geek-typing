#!/usr/bin/env node
/**
 * P1.7 Wave 3 · A-3 Phase 1/2 —— Learning Boundary 的 **AST 判定核心**（ts-morph）。
 *
 * 取代 scripts/gate-learning-boundary.mjs 里原先的「正则 + 文件系统遍历」实现。
 * 语义与旧实现对齐（消费者定义、禁用模块片段、键族、type-only 放行、白名单 ∅），
 * 但判定基于 TypeScript AST，覆盖正则无法覆盖的绕过向量。
 *
 * 覆盖的 6 类语法：
 *   1. 静态值导入     `import { x } from '../lib/analytics'`
 *   2. 再导出 from    `export { x } from '../lib/reviewStore'` / `export * from '...'`
 *   3. 再导出链       `export { x } from './barrel'`，barrel 自身从禁忌模块导入/再导出（递归，
 *                     仅在消费者域内跟随，避免把 src/lib 内部互引误判成泄漏）
 *   4. 动态导入       `await import('../lib/' + 'analytics')`（含常量折叠拼接路径）
 *   5. require()      `require('../lib/memorizeStore')`（同上，含折叠）
 *   6. 键族字面量     AST 上的字符串/模板字面量取值 equal 于 8 个 gt.* 学习键
 *
 * type-only（`import type` / `export type` / 全部绑定带 inline `type`）放行——无运行时耦合。
 *
 * 用法（库）：import { checkBoundary } from './boundary-ast.mjs'
 * 用法（CLI）：node scripts/ast/boundary-ast.mjs [--scan-root=<dir>]
 */
import { Project, Node, SyntaxKind, ts } from 'ts-morph'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
/** 默认扫描根：src/（与旧正则版一致）。 */
export const DEFAULT_SCAN_ROOT = join(REPO_ROOT, 'src')

/** 禁止消费者直连的模块（import 路径片段；命中规则 = 说明符含 `/<片段>`）。 */
export const FORBIDDEN = [
  'memorizeStore',
  'reviewStore',
  'analytics',
  'learning/storage',
  'learning/insights',
  'learning/upgrade',
]

/** 学习键族字面量（消费者文件中禁止出现；唯一入口 lib/learning/storage.ts，呼应 G4-2）。 */
export const FORBIDDEN_KEY_LITERALS = [
  'gt.learning.v2', 'gt.learning.v2.backup', 'gt.diag.v1',
  'gt.review.v1', 'gt.memorize.v1', 'gt.analytics.v1',
  'gt.totals.v1', 'gt.letterStats.v1',
]

/** 待迁移消费者白名单：**必须保持 ∅**（任何新增豁免都要显式在此列出并可审计）。 */
export const WHITELIST = new Set()

/** 免除区：相对仓库根的路径含 /core/ 或 /lib/ 的文件不被视为「消费者」。 */
const EXCLUDED_PATH_MARKS = ['/core/', '/lib/']

const MAX_FOLD_DEPTH = 8
const MAX_CHAIN_DEPTH = 5

/** 判定路径是否属于消费者域（与旧正则版同口径：相对仓库根不含 /core/、/lib/）。 */
export function isConsumerPath(relPath) {
  const r = relPath.replaceAll('\\', '/')
  return !EXCLUDED_PATH_MARKS.some((m) => r.includes(m))
}

/** 收集扫描根下所有 .ts/.tsx（跳过 node_modules / dist / .git）。 */
export function walkSourceFiles(dir, out = []) {
  let names = []
  try {
    names = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of names) {
    if (name === 'node_modules' || name === 'dist' || name === '.git') continue
    const p = join(dir, name)
    let st = null
    try {
      st = statSync(p)
    } catch {
      continue
    }
    if (st.isDirectory()) walkSourceFiles(p, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

/**
 * 建 ts-morph 工程的 tsconfig 编译器选项。
 * 根 tsconfig.json 是 solution 文件（files: [] + references），本身不含 compilerOptions，
 * 真正管辖 src/ 的是 tsconfig.app.json，因此从这里取（含 jsx/moduleResolution/bundler 等），
 * 保证 AST 解析与项目构建口径一致。
 */
function loadCompilerOptions(root) {
  const appConfig = join(root, 'tsconfig.app.json')
  if (existsSync(appConfig)) {
    try {
      const read = ts.readConfigFile(appConfig, ts.sys.readFile)
      if (!read.error) {
        const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, dirname(appConfig))
        if (parsed.options && Object.keys(parsed.options).length > 0) return parsed.options
      }
    } catch {
      /* 落到默认值 */
    }
  }
  // 兜底：只取必要的解析相关选项（不依赖任何 tsconfig 也能判定）
  return {
    target: ts.ScriptTarget.ES2023,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    allowJs: false,
  }
}

/** 建复用型 Project（调用方可传入已有 project 以复用解析器缓存）。 */
export function createBoundaryProject({ root = REPO_ROOT } = {}) {
  return new Project({
    compilerOptions: loadCompilerOptions(root),
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
  })
}

/** 从 specifier 里取禁用的模块片段；无命中返回 null。 */
export function modOf(spec) {
  if (typeof spec !== 'string') return null
  for (const f of FORBIDDEN) if (spec.includes(`/${f}`)) return f
  return null
}

/**
 * 字符串常量折叠：把 BinaryExpression(`+`) / 模板串 / 括号 / 同文件 const 初始值
 * 折叠成最终字符串；含不可静态判定的片段（变量 / 函数调用）时返回 null —— 宁可不可用，
 * 不做猜测式拼接。
 */
export function foldString(node, seen = 0, allowId = true) {
  if (!node || seen > MAX_FOLD_DEPTH) return null
  if (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)) return node.getLiteralText()
  if (Node.isParenthesizedExpression(node)) return foldString(node.getExpression(), seen + 1)
  if (Node.isBinaryExpression(node)) {
    if (node.getOperatorToken().getText() !== '+') return null
    const l = foldString(node.getLeft(), seen + 1)
    const r = foldString(node.getRight(), seen + 1)
    return l === null || r === null ? null : l + r
  }
  if (Node.isTemplateExpression(node)) {
    // 结构与 text：`head` 含开头的反引号，span.literal 以 `}` 开头、末尾含收尾反引号
    let acc = node.getHead().getText().slice(1) // 去掉开头的反引号
    if (acc.endsWith('${')) acc = acc.slice(0, -2) // head 结尾含 `${`
    const spans = node.getTemplateSpans()
    for (let i = 0; i < spans.length; i++) {
      const v = foldString(spans[i].getExpression(), seen + 1)
      if (v === null) return null
      let tail = spans[i].getLiteral().getText().slice(1) // 去掉开头的 `}`
      if (i === spans.length - 1 && tail.endsWith('`')) tail = tail.slice(0, -1) // 收尾反引号
      else if (tail.endsWith('${')) tail = tail.slice(0, -2) // 下一段占位符的开头
      acc += v + tail
    }
    return acc
  }
  if (Node.isIdentifier(node)) return allowId ? foldIdentifier(node) : null
  return null
}

/** 每文件的模块级 `const NAME = <字面量>` 折叠表（WeakMap 缓存，避免触发 type checker）。 */
const CONST_CACHE = new WeakMap()

function moduleConsts(sourceFile) {
  let map = CONST_CACHE.get(sourceFile)
  if (map) return map
  map = new Map()
  CONST_CACHE.set(sourceFile, map) // 先落缓存：常量自身的初始值不做标识符再解（防递归）
  for (const decl of sourceFile.getVariableDeclarations()) {
    if (decl.getVariableStatement()?.getParent() !== sourceFile) continue // 仅模块级，避免块级同名遮蔽歧义
    const name = decl.getName()
    if (map.has(name)) continue
    const init = decl.getInitializer()
    if (!init) continue
    const v = foldString(init, 0, false)
    if (v !== null) map.set(name, v)
  }
  return map
}

/** 同文件模块级 `const X = '...'` 的初始值折叠（`const p='../lib/'; import(p+'analytics')` 兜底）。 */
function foldIdentifier(node) {
  const value = moduleConsts(node.getSourceFile()).get(node.getText())
  return value === undefined ? null : value
}

/** `import type` / `export type` / 全部绑定 inline `type` → 放行（无运行时耦合）。 */
function isTypeOnlyImportClause(decl) {
  if (decl.isTypeOnly?.()) return true
  const clause = decl.getImportClause?.()
  if (!clause) return false // `import './x'` 副作用导入：有运行时耦合
  if (clause.getDefaultImport() || clause.getNamespaceImport()) return false
  const named = clause.getNamedBindings()
  if (named && Node.isNamedImports(named)) {
    const els = named.getElements()
    return els.length > 0 && els.every((e) => e.isTypeOnly())
  }
  return false
}

function isTypeOnlyExportClause(decl) {
  if (decl.isTypeOnly?.()) return true
  const named = decl.getNamedExports?.() ?? []
  // `export * from '...'` 无具名导出 → 存在运行时耦合；`export { type A } from` → 放行
  return named.length > 0 && named.every((e) => e.isTypeOnly())
}

/** 单文件「直接」禁忌引用（不跟随再导出链）。 */
function directForbiddenRefs(sourceFile, relOf) {
  const hits = []
  const rel = relOf(sourceFile)
  const push = (mod, kind, node, spec) =>
    hits.push({ mod, kind, spec, file: rel, line: node.getStartLineNumber() })

  for (const decl of sourceFile.getImportDeclarations()) {
    const spec = decl.getModuleSpecifierValue()
    const mod = modOf(spec)
    if (!mod || isTypeOnlyImportClause(decl)) continue
    push(mod, 'static-import', decl, spec)
  }
  for (const decl of sourceFile.getExportDeclarations()) {
    const spec = decl.getModuleSpecifierValue()
    if (spec === undefined) continue
    const mod = modOf(spec)
    if (mod && !isTypeOnlyExportClause(decl)) push(mod, 'export-from', decl, spec)
  }
  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = call.getExpression()
    const isDynamicImport = expr.getKind() === SyntaxKind.ImportKeyword
    const isRequire = Node.isIdentifier(expr) && expr.getText() === 'require'
    if (!isDynamicImport && !isRequire) continue
    const spec = foldString(call.getArguments()[0])
    const mod = modOf(spec)
    if (!mod) continue
    push(mod, isDynamicImport ? 'dynamic-import' : 'require', call, spec)
  }
  return hits
}

/** 文件的再导出目标（用于链跟随）。 */
function reexportTargets(sourceFile) {
  return sourceFile
    .getExportDeclarations()
    .map((d) => ({ decl: d, spec: d.getModuleSpecifierValue() }))
    .filter((e) => typeof e.spec === 'string' && !isTypeOnlyExportClause(e.decl))
}

/**
 * 相对模块说明符的**文件系统解析**（刻意不用 getModuleSpecifierSourceFile()：
 * 那会迫使 ts-morph 建 TypeChecker/Program，实测让门禁从 ~0.5s 涨到 ~1.8s）。
 * 只需认 Tos 相对路径 + 扩展名/目录索引，够用于再导出链跟随；
 * 说明符本身是否已命中禁忌片段由 modOf 判断，与解析无关。
 */
const RESOLVE_SUFFIXES = ['', '.ts', '.tsx', '/index.ts', '/index.tsx']

function makeModuleResolver(absFilePaths) {
  const known = new Set(absFilePaths.map((f) => resolve(f).replaceAll('\\', '/')))
  return (fromFile, spec) => {
    if (typeof spec !== 'string' || !spec.startsWith('.')) return null
    const base = resolve(dirname(resolve(fromFile)), spec)
    for (const suffix of RESOLVE_SUFFIXES) {
      const candidate = (base + suffix).replaceAll('\\', '/')
      if (known.has(candidate)) return candidate
    }
    return null
  }
}

/**
 * 跟随再导出链 consumer → barrel → … → 禁忌模块。
 * 只在**消费者域内**跟随（src/lib 与 src/core 是获准的内部互引区，跟进去会产生假阳性）。
 */
function followReexportChain({ file, getSourceFile, relOf, resolveModule, isConsumer, visited, depth }) {
  if (depth > MAX_CHAIN_DEPTH || visited.has(file)) return null
  visited.add(file)
  const sourceFile = getSourceFile(file)
  if (!sourceFile) return null
  for (const { spec } of reexportTargets(sourceFile)) {
    // 目标本身就命中禁忌片段 → 属于 direct 路径，交给调用处的直接判定处理
    if (modOf(spec)) continue
    const target = resolveModule(file, spec)
    if (!target || !isConsumer(relOf(target))) continue
    const own = directForbiddenRefs(getSourceFile(target), relOf)
    if (own.length > 0) return { hit: own[0], via: relOf(target) }
    const deeper = followReexportChain({
      file: target, getSourceFile, relOf, resolveModule, isConsumer, visited, depth: depth + 1,
    })
    if (deeper) return deeper
  }
  return null
}

/** 单文件的键族字面量判定（AST 取值，折叠模板 / `+` 拼接后的比较）。 */
function forbiddenKeyRefs(sourceFile, relOf) {
  const rel = relOf(sourceFile)
  const kinds = [
    SyntaxKind.StringLiteral,
    SyntaxKind.NoSubstitutionTemplateLiteral,
    SyntaxKind.TemplateExpression,
    SyntaxKind.BinaryExpression,
  ]
  const seen = new Set()
  const hits = []
  // 注：getDescendantsOfKind 传数组在 ts-morph 28 上返回空集（实测），逐个 kind 取
  for (const kind of kinds) {
    for (const node of sourceFile.getDescendantsOfKind(kind)) {
      const value = foldString(node)
      if (value === null || !FORBIDDEN_KEY_LITERALS.includes(value)) continue
      const key = `${value}@${node.getStartLineNumber()}`
      if (seen.has(key)) continue
      seen.add(key)
      hits.push({ key: value, file: rel, line: node.getStartLineNumber(), kind: 'key-literal' })
    }
  }
  return hits
}

/**
 * AST 版边界判定主入口。
 *
 * @param {object} [opts]
 * @param {string} [opts.scanRoot=src] 扫描根目录（探针/夹具目录可指定）
 * @param {import('ts-morph').Project} [opts.project] 可复用工程（省去重复 parse）
 * @param {string} [opts.root=REPO_ROOT] 相对路径基准
 * @returns {{violations: Array, dynamicViolations: Array, keyViolations: Array, scanned: number, consumerCount: number, scanRoot: string, durationMs: number, root: string}}
 */
export function checkBoundary({ scanRoot = DEFAULT_SCAN_ROOT, project, root = REPO_ROOT } = {}) {
  const t0 = performance.now()
  const absScanRoot = resolve(root, scanRoot)
  const own = project ?? createBoundaryProject({ root })
  const files = walkSourceFiles(absScanRoot)
  const relOf = (sf) => relative(root, typeof sf === 'string' ? sf : sf.getFilePath()).replaceAll('\\', '/')

  // 只把**消费者文件**加进 Project：
  //   ① 违规判定依据的是模块说明符字符串本身，不需解析到目标文件；
  //   ② 再导出链只在消费者域内跟随（core/、lib/ 是获准的内部互引区），
  //      因此非消费者文件不进工程也不会改变任何结论 —— 少 2/3 的 parse 开销。
  const consumers = files.filter((f) => isConsumerPath(relOf(f)))
  for (const f of consumers) {
    if (!own.getSourceFile(f)) own.addSourceFileAtPath(f)
  }

  const violations = [] // ① 静态值导入 / ② export-from / ③ 再导出链
  const dynamicViolations = [] // ④ import() / ⑤ require()
  const keyViolations = [] // ⑥ 键族字面量
  const resolveModule = makeModuleResolver(files)
  const getSourceFile = (file) => own.getSourceFile(file)

  for (const abs of consumers) {
    const sf = getSourceFile(abs)
    if (!sf) continue
    const rel = relOf(sf)

    for (const hit of directForbiddenRefs(sf, relOf)) {
      if (hit.kind === 'dynamic-import' || hit.kind === 'require') dynamicViolations.push(hit)
      else violations.push(hit)
    }

    const chain = followReexportChain({
      file: abs,
      getSourceFile,
      relOf,
      resolveModule,
      isConsumer: isConsumerPath,
      visited: new Set(),
      depth: 0,
    })
    if (chain) {
      violations.push({
        file: rel,
        mod: chain.hit.mod,
        kind: 'export-from-chain',
        spec: `via ${chain.via} → ${chain.hit.spec}`,
        line: chain.hit.line,
      })
    }

    for (const hit of forbiddenKeyRefs(sf, relOf)) keyViolations.push(hit)
  }

  return {
    violations,
    dynamicViolations,
    keyViolations,
    scanned: consumers.length,
    consumerCount: consumers.length,
    scanRoot: absScanRoot,
    root,
    durationMs: performance.now() - t0,
  }
}

/** CLI：node scripts/ast/boundary-ast.mjs [--scan-root=<dir>] */
function parseScanRoot(argv) {
  for (const a of argv) {
    const m = /^--scan-root=(.*)$/.exec(a)
    if (m && m[1]) return resolve(m[1])
  }
  return DEFAULT_SCAN_ROOT
}

const isDirectRun = process.argv[1] && /[\\/]scripts[\\/]ast[\\/]boundary-ast\.mjs$/.test(process.argv[1])
if (isDirectRun) {
  const r = checkBoundary({ scanRoot: parseScanRoot(process.argv.slice(2)) })
  const all = [...r.violations, ...r.dynamicViolations, ...r.keyViolations]
  console.log(`AST 判定：扫描 ${r.scanned} 个消费者文件，违规 ${all.length} 条（${r.durationMs.toFixed(0)}ms）`)
  for (const v of all) console.log(`  ${v.file}:${v.line} [${v.kind}] ${v.mod ?? v.key} ← ${v.spec ?? ''}`)
  process.exit(all.length > 0 ? 1 : 0)
}
