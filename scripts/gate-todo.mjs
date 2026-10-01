#!/usr/bin/env node
/**
 * P1.7 Wave 3 · §14 待办标记门（登记式 allowlist；npm script 名见 package.json）
 *
 * 判据一句话：扫描范围内的**代码语义位置**出现待办标记 → FAIL；
 * **字符串 / 模板串 / 正则字面量内容**里出现 → ALLOW；登记进 `P1.7-DEFERRED.md`
 * 的条目按「文件 + 行号 + Token」精确豁免，不匹配就仍然判红。
 *
 * 为什么要区分语义位置与字符串内容：把某个标记词写成**标识符/类型名**是真的
 *   「没做完」的开关或占位类型；写成**字符串或正则的内容**只是「提到了这个词」，
 *   语义上是数据不是承诺。按文本全量 grep 会把后者全判红，逼着人去改字符串，
 *   那是门禁在制造噪声。带字面量的对照示例见
 *   `docs/ARCHITECTURE-INVARIANTS.md` 的「§14 待办标记门」一节。
 *
 * 两条通道（这是计划原文的允许形态）：
 *   ① .ts / .tsx —— ts-morph AST 通道：Identifier（含变量声明名）、
 *      Type/Interface/Class/Enum 及其成员名、注释节点 → FAIL；
 *      StringLiteral / TemplateLiteral / RegExp 字面量内容 → ALLOW（它们根本不是
 *      Identifier 节点，天然不会命中，无需额外放行逻辑）。
 *   ② .mjs / .cjs / .js / .jsx —— **降级通道**：正则 + 简易词法状态机实现同样语义
 *      （注释 → FAIL；字符串/模板/正则内容 → ALLOW）。scripts/ 与 tests/ 绝大多数是
 *      .mjs，没有 ts 类型信息可依，走文本扫描是唯一可行解。
 *      **最终形态并入 A-3 AST 基建**——等 A-3 的 AST 扫描基建落地后，本文件的
 *      降级通道应替换为与 ① 同源的 AST 实现，届时正则实现按计划 Phase 3 删除。
 *
 * ⚠️ **本文件的注释刻意不写出任何标记词的字面量**：本门扫描 `scripts/` 且**包含
 * 自身**，注释里出现字面量会被自己判红（那是一条真实的、不是误伤的自指命中）。
 * 标记词清单见下方 TOKENS 常量（写在字符串里属 ALLOW），带字面量的说明一律
 * 放在 `docs/` 下（不在扫描范围内）。
 *
 * 词形约定：只匹配「非字母数字紧邻」的完整词，因此把某个标记词当作更长单词的
 * 前缀（如「临时」的英文单词之于「临时」标记词）不会被误伤；带下划线分隔的
 * 真实命名仍会命中。若将来出现误伤，正确做法是收紧词边界规则，而不是删规则。
 *
 * 退出码：0 = 无未登记违规；1 = 存在未登记违规（逐条打印 文件:行号 Token）。
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Project, SyntaxKind } from 'ts-morph'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** §14 扫描范围 */
const SCAN_ROOTS = ['src', 'scripts', 'tests']
/** §14 exclude（按路径**段**匹配，因此 tests/fixtures/ 也在内） */
const EXCLUDE_SEGMENTS = new Set(['node_modules', 'dist', 'coverage', '_generated', 'fixtures', 'vendor', 'docs'])
/** §14 Tokens（大小写不敏感；字面量写在字符串里 = ALLOW，不会被本门判红） */
const TOKENS = ['TODO', 'FIXME', 'XXX', 'HACK', 'BLOCKED', 'UNIMPLEMENTED', 'TEMP']
/** 登记式 allowlist（仓库根） */
const ALLOWLIST_FILE = 'P1.7-DEFERRED.md'

const SOURCE_EXT = /\.(ts|tsx|mjs|cjs|js|jsx)$/
const TS_EXT = /\.(ts|tsx)$/

/** 完整词匹配：前/后不允许紧邻字母数字（前允许 `_`，后允许 `_`/`-`，以覆盖 snake_case 命名） */
const TOKEN_RE = new RegExp(`(?<![A-Za-z0-9])(?:${TOKENS.join('|')})(?![A-Za-z0-9])`, 'gi')

/** 类/接口/类型/枚举及其成员名（用于把命中归类为「类型名」而不是笼统的「标识符」） */
const TYPE_NAME_PARENTS = new Set([
  SyntaxKind.InterfaceDeclaration,
  SyntaxKind.TypeAliasDeclaration,
  SyntaxKind.ClassDeclaration,
  SyntaxKind.EnumDeclaration,
  SyntaxKind.EnumMember,
  SyntaxKind.MethodDeclaration,
  SyntaxKind.MethodSignature,
  SyntaxKind.PropertyDeclaration,
  SyntaxKind.PropertySignature,
  SyntaxKind.GetAccessor,
  SyntaxKind.SetAccessor,
  SyntaxKind.TypeParameter,
  SyntaxKind.TypeReference,
])

/* ---------------- 文件收集 ---------------- */
function walk(dir, out = []) {
  let names
  try {
    names = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of names) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (SOURCE_EXT.test(name)) out.push(p)
  }
  return out
}

const rel = (p) => relative(ROOT, p).replaceAll('\\', '/')

function collectFiles() {
  const files = []
  for (const root of SCAN_ROOTS) {
    const abs = join(ROOT, root)
    if (!existsSync(abs)) {
      console.log(`  ⚠️ 扫描根不存在，跳过：${root}/`)
      continue
    }
    for (const f of walk(abs)) {
      const r = rel(f)
      const segs = r.split('/')
      // 末段是文件名，只判断目录段
      if (segs.slice(0, -1).some((s) => EXCLUDE_SEGMENTS.has(s))) continue
      files.push(r)
    }
  }
  return files.sort()
}

/* ---------------- 行号换算 ---------------- */
function buildLineStarts(text) {
  const starts = [0]
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1)
  return starts
}

function lineOf(starts, pos) {
  let lo = 0
  let hi = starts.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (starts[mid] <= pos) lo = mid
    else hi = mid - 1
  }
  return lo + 1
}

/* ---------------- 降级通道：文本状态机 ----------------
 * 返回 { codeMask, commentRanges }
 *   codeMask      —— 与原文等长：字符串/模板/正则/**注释** 内容被替换为空格（换行保留），
 *                    其余字符原样。在其中搜 Token = 「标识符」命中。
 *   commentRanges —— 注释区间原文，在其中搜 Token = 「注释」命中。
 */
function scanText(text) {
  const n = text.length
  const mask = new Array(n)
  const commentRanges = []
  const tplStack = []
  let brace = 0
  let state = 'code'
  let commentStart = -1
  let i = 0
  let lastSig = '' // code 态下最近一个有意义字符，用于区分 `/` 是除号还是正则起始

  const blank = (from, to) => {
    for (let k = from; k < to && k < n; k++) mask[k] = text[k] === '\n' ? '\n' : ' '
  }

  while (i < n) {
    const c = text[i]
    const d = text[i + 1]

    if (state === 'code') {
      if (c === '/' && d === '/') {
        state = 'line'
        commentStart = i
        blank(i, i + 2)
        i += 2
        continue
      }
      if (c === '/' && d === '*') {
        state = 'block'
        commentStart = i
        blank(i, i + 2)
        i += 2
        continue
      }
      if (c === "'" || c === '"') {
        state = c === "'" ? 'sq' : 'dq'
        mask[i] = ' '
        i++
        continue
      }
      if (c === '`') {
        state = 'tpl'
        mask[i] = ' '
        i++
        continue
      }
      if (c === '/' && (lastSig === '' || '(,=:[!&|?{};+-*%~^<>'.includes(lastSig))) {
        // 试探性按正则处理：必须在本行内找到未转义的闭合 `/`，否则当作除号
        let j = i + 1
        let inClass = false
        let closed = -1
        while (j < n && text[j] !== '\n') {
          const ch = text[j]
          if (ch === '\\') {
            j += 2
            continue
          }
          if (ch === '[') inClass = true
          else if (ch === ']') inClass = false
          else if (ch === '/' && !inClass) {
            closed = j
            break
          }
          j++
        }
        if (closed > i + 1) {
          // 整段正则一次性吞掉：必须**留在 code 态**并直接跳到闭合斜杠之后。
          // 早期版本在这里把 state 置成 'regex' 再跳，结果后续代码被 regex 分支当正则体
          // 一路吞到下一个 `/`，整段文件的屏蔽状态错位（表现为字符串里的词被误判红）。
          blank(i, closed + 1)
          i = closed + 1
          lastSig = '/'
          continue
        }
      }
      if (c === '{') brace++
      else if (c === '}') {
        if (tplStack.length && brace === 0) state = tplStack.pop()
        else if (brace > 0) brace--
      }
      if (!/\s/.test(c)) lastSig = c
      mask[i] = c
      i++
      continue
    }

    if (state === 'line') {
      if (c === '\n') {
        commentRanges.push({ start: commentStart, end: i })
        state = 'code'
        mask[i] = '\n'
        i++
        continue
      }
      mask[i] = ' '
      i++
      continue
    }

    if (state === 'block') {
      if (c === '*' && d === '/') {
        commentRanges.push({ start: commentStart, end: i + 2 })
        blank(i, i + 2)
        i += 2
        state = 'code'
        continue
      }
      mask[i] = c === '\n' ? '\n' : ' '
      i++
      continue
    }

    // 字符串 / 模板 / 正则：内容整体抹掉，只处理转义与边界
    if (c === '\\') {
      mask[i] = ' '
      if (i + 1 < n) mask[i + 1] = text[i + 1] === '\n' ? '\n' : ' '
      i += 2
      continue
    }
    if (state === 'sq' && c === "'") {
      mask[i] = ' '
      state = 'code'
      i++
      continue
    }
    if (state === 'dq' && c === '"') {
      mask[i] = ' '
      state = 'code'
      i++
      continue
    }
    if (state === 'tpl') {
      if (c === '$' && d === '{') {
        tplStack.push('tpl')
        state = 'code'
        brace = 0
        blank(i, i + 2)
        i += 2
        continue
      }
      if (c === '`') {
        mask[i] = ' '
        state = 'code'
        i++
        continue
      }
      mask[i] = c === '\n' ? '\n' : ' '
      i++
      continue
    }
    // 余下状态只有 sq / dq / tpl：内容一律抹掉（正则已在 code 态一次性吞掉，无 regex 态）
    mask[i] = c === '\n' ? '\n' : ' '
    i++
  }
  if (state === 'line' || state === 'block') commentRanges.push({ start: commentStart, end: n })

  return { codeMask: mask.map((ch) => (ch === undefined ? ' ' : ch)).join(''), commentRanges }
}

/* ---------------- 通用：在一段文本里找 Token ---------------- */
function findTokens(text) {
  const out = []
  TOKEN_RE.lastIndex = 0
  let m
  while ((m = TOKEN_RE.exec(text)) !== null) {
    // raw 保留原始大小写：锚点要的是「这个标识符叫什么」，不是它归一化成哪个标记词
    out.push({ token: m[0].toUpperCase(), raw: m[0], offset: m.index })
    if (m.index === TOKEN_RE.lastIndex) TOKEN_RE.lastIndex++
  }
  return out
}

const snippet = (text, from, to) => {
  const a = Math.max(0, from)
  const b = Math.min(text.length, to)
  return text.slice(a, b).replace(/\s+/g, ' ').trim()
}

/* ---------------- allowlist ---------------- */
/**
 * 登记行格式（五列，竖线分隔）：
 *   - `文件路径` | TOKEN | 锚点 | 原因 | 解封 Wave
 *
 * ⚠️ 锚点不是行号 —— 这是 9.6 的核心改动：行号是会漂的地址，靠行号做豁免键，
 * 任何一次同文件改动都会让登记批量失效（2026-10-01 实测：给 content/normalize.mjs
 * 加 5 行 import/注释 ⇒ 6 条登记全红，门明明什么都没放过去）。锚点取**内容**：
 *   - 标识符 / 类型·成员名命中 ⇒ 那个标识符的**名字**（实际值由 `--print-anchors`
 *     直接打出来，这里刻意不写字面量 —— 本文件扫描自身，写进去就是自指命中）；
 *     只要这个变量还叫这个名字，豁免就在，哪怕它在文件里被挪到第 300 行；
 *   - 注释命中 ⇒ 注释正文的前 40 字（空白折叠后，`|` 换成 `/`，免得撑破五列解析）。
 *
 * 锚点里不允许出现竖线：登记行就是按竖线切五列的，锚点带竖线会把后面几列整体错位，
 * 表现为「登记了却仍然判红」这种最难查的假失败。
 * 于是「挪一行」不会破豁免，而**新增**一个同文件同 Token 但不同锚点的命中仍会判红
 * （想豁免必须再登记一条）—— 既去脆又没放开宽度。
 *
 * 文档里的「登记行格式」示例长得和真登记行一模一样，会被本正则当成一条登记计数
 * （它永远匹配不到命中，因为不存在叫「文件路径」的文件，但会让「登记 N 条」这个数字
 * 比真实登记数多 1）。故显式排除这个占位路径（见 loadAllowlist）。
 */
const ALLOWLIST_LINE_RE =
  /^\s*[-*]\s+`([^`]+?)`\s*\|\s*([A-Za-z]+)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*$/gm

/** 登记行格式示例里的路径列占位符（不是真路径，见上面的 ⚠️） */
const TEMPLATE_PLACEHOLDER_PATH = '文件路径'

function normPath(p) {
  return String(p).replace(/^\.\//, '').replaceAll('\\', '/')
}

function loadAllowlist() {
  const abs = join(ROOT, ALLOWLIST_FILE)
  if (!existsSync(abs)) return { entries: [], raw: 0 }
  const text = readFileSync(abs, 'utf8')
  const entries = []
  ALLOWLIST_LINE_RE.lastIndex = 0
  let m
  while ((m = ALLOWLIST_LINE_RE.exec(text)) !== null) {
    if (m[1].trim() === TEMPLATE_PLACEHOLDER_PATH) continue // 格式示例行，不是登记
    const file = normPath(m[1])
    const token = m[2].toUpperCase()
    const anchor = m[3].trim()
    entries.push({
      file,
      token,
      anchor,
      reason: m[4],
      wave: m[5],
      key: `${file}:${anchor}:${token}`,
    })
  }
  return { entries, raw: entries.length }
}

/** 锚点：标识符命中用标识符名，其余（注释）用正文前 40 字（空白折叠）；`|` 换 `/`。 */
function anchorOf(hit, raw) {
  const base = hit.kind === 'identifier' || hit.kind === 'typeName' ? hit.name : String(raw ?? '')
  return base.replace(/\s+/g, ' ').trim().slice(0, 40).replace(/\|/g, '/')
}

/* ---------------- 主流程 ---------------- */
const files = collectFiles()
const tsFiles = files.filter((f) => TS_EXT.test(f))
const jsFiles = files.filter((f) => !TS_EXT.test(f))
const { entries: allowEntries } = loadAllowlist()
const allowKeys = new Set(allowEntries.map((e) => e.key))

const hits = [] // { file, line, token, kind, excerpt }
const stats = { comment: 0, identifier: 0, typeName: 0 }

/* ① ts-morph AST 通道（.ts / .tsx） */
const project = new Project({ skipAddingFilesFromTsConfig: true })
project.addSourceFilesAtPaths(tsFiles.map((f) => join(ROOT, f)))
for (const sf of tsFiles) {
  const source = project.getSourceFile(join(ROOT, sf))
  if (!source) {
    console.log(`  ⚠️ ts-morph 未解析到文件，跳过：${sf}`)
    continue
  }
  const text = source.getFullText()
  const starts = buildLineStarts(text)

  // 注释节点 → FAIL
  const seenCommentPos = new Set()
  const addComment = (range) => {
    const pos = range.getPos()
    if (seenCommentPos.has(pos)) return
    seenCommentPos.add(pos)
    const body = range.getText()
    for (const t of findTokens(body)) {
      hits.push({ file: sf, line: lineOf(starts, pos + t.offset), token: t.token, kind: 'comment', raw: body, excerpt: snippet(body, Math.max(0, t.offset - 20), t.offset + 60) })
    }
  }
  source.forEachDescendant((node) => {
    for (const r of node.getLeadingCommentRanges()) addComment(r)
    for (const r of node.getTrailingCommentRanges()) addComment(r)
  })

  // Identifier（含变量声明名 / 类型与成员名）→ FAIL；字符串内容不是 Identifier，天然 ALLOW
  source.forEachDescendant((node) => {
    if (node.getKind() !== SyntaxKind.Identifier) return
    const name = node.getText()
    if (!findTokens(name).length) return
    const parent = node.getParent()
    const isTypeName = !!parent && TYPE_NAME_PARENTS.has(parent.getKind()) && typeof parent.getNameNode === 'function' && parent.getNameNode() === node
    const kind = isTypeName ? 'typeName' : 'identifier'
    const pos = node.getStart()
    hits.push({ file: sf, line: lineOf(starts, pos), token: findTokens(name)[0].token, kind, name, raw: name, excerpt: snippet(text, pos - 20, pos + name.length + 40) })
  })
}

/* ② 降级通道（.mjs / .cjs / .js / .jsx） */
for (const file of jsFiles) {
  const text = readFileSync(join(ROOT, file), 'utf8')
  const starts = buildLineStarts(text)
  const { codeMask, commentRanges } = scanText(text)
  for (const r of commentRanges) {
    const body = text.slice(r.start, r.end)
    for (const t of findTokens(body)) {
      hits.push({ file, line: lineOf(starts, r.start + t.offset), token: t.token, kind: 'comment', raw: body, excerpt: snippet(body, Math.max(0, t.offset - 20), t.offset + 60) })
    }
  }
  for (const t of findTokens(codeMask)) {
    hits.push({ file, line: lineOf(starts, t.offset), token: t.token, kind: 'identifier', name: t.raw, raw: t.raw, excerpt: snippet(text, t.offset - 20, t.offset + 60) })
  }
}

/* ---------------- 报告 ---------------- */
hits.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line))

console.log('== P1.7-W3 · TODO Gate（§14 登记式 allowlist）==')
console.log(`扫描范围：${SCAN_ROOTS.join(' / ')}`)
console.log(`exclude（目录段）：${[...EXCLUDE_SEGMENTS].join(' / ')}`)
console.log(`Tokens：${TOKENS.join(' | ')}（完整词匹配，大小写不敏感）`)
console.log(`文件：${files.length} 个 —— AST 通道(ts-morph) ${tsFiles.length} / 降级通道(正则) ${jsFiles.length}`)
console.log(`allowlist：${ALLOWLIST_FILE} —— 登记 ${allowEntries.length} 条\n`)

const registered = []
const violations = []
for (const h of hits) {
  // 豁免键 = 文件路径 + 内容锚点 + Token（**不含行号**，见 anchorOf 的注释）
  h.key = `${h.file}:${anchorOf(h, h.raw)}:${h.token}`
  if (allowKeys.has(h.key)) registered.push(h)
  else violations.push(h)
}

for (const h of hits) stats[h.kind]++

console.log(`命中总数 ${hits.length} 处 —— 注释 ${stats.comment} / 标识符 ${stats.identifier} / 类型·成员名 ${stats.typeName}`)
console.log(`已登记豁免 ${registered.length} 处，未登记违规 ${violations.length} 处\n`)

if (registered.length) {
  console.log('---- 已登记（豁免）----')
  for (const h of registered) console.log(`  ⏸ ${h.file}:${h.line}  ${h.token}  （${h.kind}）`)
  console.log('')
}

if (violations.length) {
  console.log('---- 未登记违规（FAIL）----')
  for (const h of violations) {
    const kindLabel = { comment: '注释', identifier: '标识符', typeName: '类型·成员名' }[h.kind]
    console.log(`  ❌ ${h.file}:${h.line}  ${h.token}  [${kindLabel}]  ${h.excerpt}`)
  }
  console.log('')
}

// 失效登记：登记了但代码里已不存在（多半是重命名/已清理），提示但不判红
const hitKeys = new Set(hits.map((h) => h.key))
const stale = allowEntries.filter((e) => !hitKeys.has(e.key))
if (stale.length) {
  console.log(`---- 失效登记 ${stale.length} 条（代码里已无对应锚点，请核对后从 ${ALLOWLIST_FILE} 移除）----`)
  for (const e of stale) console.log(`  ⚠️ ${e.file}  ${e.token}  锚点「${e.anchor}」（登记原因：${e.reason}）`)
  console.log('')
}

console.log(`共 ${hits.length} 处命中：登记 ${registered.length}，违规 ${violations.length}`)
console.log(violations.length ? '\n❌ TODO Gate FAIL' : '\n✅ TODO Gate PASS')

/* --print-anchors：把当前每条命中的「可粘贴登记行」打出来。
 * 9.6 之后锚点由内容决定、人不用自己想，直接复制这一行粘进 P1.7-DEFERRED.md 即可；
 * 登记条数可以减少（同一锚点覆盖多处），但**不要**为了省事用宽锚点糊过去。 */
if (process.argv.includes('--print-anchors')) {
  console.log(`\n---- --print-anchors：${ALLOWLIST_FILE} 可粘贴行（锚点已按内容生成，去重后按列序）----`)
  const seen = new Set()
  for (const h of hits) {
    if (allowKeys.has(h.key) || seen.has(h.key)) continue
    seen.add(h.key)
    console.log(`- \`${h.file}\` | ${h.token} | ${anchorOf(h, h.raw)} | 原因待填 | Wave 待填`)
  }
  console.log('')
}

process.exit(violations.length > 0 ? 1 : 0)
