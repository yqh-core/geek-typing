#!/usr/bin/env node
/**
 * 批次 4 · geek-typing —— i18n 键门禁（gate-i18n.mjs）v2（词法解析器版）
 *
 * 背景：geek-typing 有 en.ts / zh.ts 双语，但无自动化门禁证明「键集合一致 / 英文未漏译中文 /
 * 组件 t('字面量') 引用的键存在」。缺此层 = 新增语言或漏译时静默降级，肉眼才见。
 *
 * v2 相对 v1 的根因修复（独立审查复现，见下「已知误报/漏报」）：
 *   v1 用三条互相冲突的正则近似 TS（indexOf { } + 顶层引号冒号 + 事后删 // 与 /* *\/），
 *   导致三类缺陷——本 v2 改**单一词法扫描器**（tokenize：注释 / 单双引号串 / 模板串含 ${} / 转义），
 *   parseDict 与 scanUsedKeys 都走它，从**结构上**消除误报/漏报；再补独立回归夹具自测。
 *
 * 已知误报/漏报（v1，均独立复现；本次真实词典未触发但属静默失效隐患，故必修）：
 *   R1（漏报 EN_CJK）：值里 `... https://x 未译 ...`，v1 事后 strip 注释把 `//` 到行尾删掉 →
 *       URL 之后的中文被连带删除 → 判绿。词法扫描下 URL 属字符串正文、不删 → 修复。
 *   R2（误识别键）：值若是模板串（合法 TS），模板内看似 `  'k':` 的示例文本被 v1 当顶层键 → 幻影键、
 *       可能假报不配平。词法扫描下模板内容是单个 template token、不再扫键 → 修复。
 *   R3（覆盖不足）：v1 的 CJK 范围漏 CJK 扩展 B（U+20000 𠀀）等。改用 Unicode 属性
 *       \p{Script=Han|Hiragana|Katakana|Hangul}（含扩展汉字）→ 修复。
 *
 * 三条判据（任一命中 ⇒ FAIL，独立 code）：
 *   1. KEY_BALANCE      —— en.ts 与 zh.ts 键集合完全相等（zh 为准源）；同侧重复键亦判红。
 *   2. EN_CJK_RESIDUE   —— 英文词典任一 value 正文含中日韩（Han/假名/谚文，含扩展）⇒ 未真正译出。
 *                          例外：剥行内 `code` 段（示例负载，如 bank.help 的 `quantization = 量化`）后再测。
 *   3. KEY_USAGE_MISSING —— 组件 t('字面量')/t("字面量") 引用的键不在 zh 准源。
 *                          契约：仅覆盖「直接 t(字面量) 调用」这一静态子集；别名/解构后改名/动态拼接键
 *                          不可静态判定，如实列为边界（与 digttsreader 的 i18n-keys 测试同界），不谎称全覆盖。
 *
 * 退出码：0=PASS；1=FAIL；2=Fatal（词典读不到 / 词法不闭合（未终止串/注释/模板、括号不平衡）/
 *   键非字符串等**超出受支持子集**的形态 / 未解析到键 / 未知 flag）——**解析失败绝不降级成 PASS**。
 *
 * 用法：
 *   npm run gate:i18n            # 读真 en.ts|zh.ts + 扫 src 的 t() 字面量
 *   npm run gate:i18n:falsify    # ① 词法解析器回归夹具（独立，不经 runChecks）② 内存注入证伪
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const I18N_DIR = join(ROOT, 'src', 'i18n')
const SRC_DIR = join(ROOT, 'src')

/** 脚本自身错误（EXIT=2）—— 与「判据不成立（EXIT=1）」严格区分。 */
class Fatal extends Error {}

/** 中日韩（Han 含扩展 A/B/…、假名、谚文），Unicode 属性正则。 */
const CJK = /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u

/* ============================ 词法扫描核心 ============================ */

/**
 * 把源码切成 token 序列：kind ∈ code | comment | str | template。
 * 关键：字符串 / 模板 / 注释**内部**的 { } : // 等一律不作为代码解读（结构性消除 R1/R2）。
 * 模板串的 ${…} 插值表达式按嵌套代码消费（其内的串/模板/大括号正确配对），但插值表达式内容
 * 不计入「可读文案」（value 仅取模板的字面文本段）——表达式不是 UI 文案。
 * 任何不闭合（未终止串/注释/模板）⇒ 抛 Fatal（fail-closed，绝不静默判绿）。
 */
function tokenize(src, label) {
  const toks = []
  const n = src.length
  let i = 0
  let codeStart = 0
  const flushCode = (end) => {
    if (end > codeStart) toks.push({ kind: 'code', value: src.slice(codeStart, end) })
  }
  while (i < n) {
    const c = src[i]
    const d = src[i + 1]
    if (c === '/' && d === '*') {
      flushCode(i)
      let j = i + 2
      while (j < n && !(src[j] === '*' && src[j + 1] === '/')) j++
      if (j >= n) throw new Fatal(`${label}：块注释未闭合`)
      j += 2
      toks.push({ kind: 'comment' }); i = j; codeStart = j; continue
    }
    if (c === '/' && d === '/') {
      flushCode(i)
      let j = i + 2
      while (j < n && src[j] !== '\n') j++
      toks.push({ kind: 'comment' }); i = j; codeStart = j; continue
    }
    if (c === "'" || c === '"') {
      flushCode(i)
      const q = c
      let j = i + 1
      let val = ''
      let closed = false
      while (j < n) {
        const e = src[j]
        if (e === '\\') { val += src[j + 1] ?? ''; j += 2; continue }
        if (e === q) { closed = true; j++; break }
        if (e === '\n') throw new Fatal(`${label}：字符串未闭合（跨行需转义换行）`)
        val += e; j++
      }
      if (!closed) throw new Fatal(`${label}：字符串未闭合`)
      toks.push({ kind: 'str', value: val }); i = j; codeStart = j; continue
    }
    if (c === '`') {
      flushCode(i)
      let j = i + 1
      let val = ''
      let closed = false
      while (j < n) {
        const e = src[j]
        if (e === '\\') { val += src[j + 1] ?? ''; j += 2; continue }
        if (e === '`') { closed = true; j++; break }
        if (e === '$' && src[j + 1] === '{') {
          // 消费平衡的插值表达式（不纳入文案）；内部串/模板/括号正确配对
          let depth = 1
          j += 2
          while (j < n && depth > 0) {
            const g = src[j]
            if (g === '{') depth++
            else if (g === '}') depth--
            else if (g === "'" || g === '"') {
              const q2 = g; j++
              while (j < n) { if (src[j] === '\\') { j += 2; continue } if (src[j] === q2) break; j++ }
            } else if (g === '`') {
              j++
              while (j < n && src[j] !== '`') { if (src[j] === '\\') j++; j++ }
            }
            j++
          }
          if (depth > 0) throw new Fatal(`${label}：模板插值 \${ 未闭合`)
          continue
        }
        val += e; j++
      }
      if (!closed) throw new Fatal(`${label}：模板字符串未闭合`)
      toks.push({ kind: 'template', value: val }); i = j; codeStart = j; continue
    }
    i++
  }
  flushCode(n)
  return toks
}

/**
 * 从 export const … = { ... } 词法抽取顶层 { key, value }。
 * 受支持子集：键必须是字符串字面量；值必须是字符串/模板字面量（其它形态 → fail-closed Fatal）。
 */
function parseDict(src, label) {
  const toks = tokenize(src, label)
  const entries = []
  let depth = 0
  let objSeen = false
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k]
    if (t.kind === 'comment') continue
    if (t.kind === 'code') {
      for (const ch of t.value) {
        if (ch === '{' || ch === '(' || ch === '[') depth++
        else if (ch === '}' || ch === ')' || ch === ']') depth--
      }
      continue
    }
    // str/template token：只在对象体内（depth>=1 且已见过 {）考虑
    if (!objSeen) {
      // 对象是否已开始：看之前 code 里是否出现过把 depth 推到 >=1 的 {
      // 简化：第一个 str 出现在 depth>=1 时才可能是键；否则是 Record<...> 之前的杂项
    }
    if (depth < 1) continue
    objSeen = true
    if (t.kind !== 'str') {
      // 对象体内出现裸模板作为「值」在下方处理；作为「键」不支持 → 交给下面键判定（模板不可能是键）
      // 若一个 template token 出现在「不是刚读完键」的位置，视为值延续，忽略（已由上一个键消费）
      continue
    }
    // str token：判断其后是否紧跟 `:`（键）——向后找第一个非 comment token 的代码片段
    const nextCode = (() => { let j = k + 1; while (j < toks.length && toks[j].kind === 'comment') j++; return toks[j] && toks[j].kind === 'code' ? toks[j].value.match(/^\s*(:)/) : null })()
    if (!nextCode) continue // 不是键（可能是值的一部分/函数参数等），跳过
    // 是键：向后取第一个非 comment token 作为值
    let v = k + 2
    while (v < toks.length && toks[v].kind === 'comment') v++
    // 跳过键与值之间的 code（空白 + 冒号 + 空白）
    while (v < toks.length && toks[v].kind === 'code') {
      const rest = toks[v].value.replace(/^\s*:\s*/, '')
      if (rest.trim() === '') { v++; continue }
      // 冒号后 code 里直接是其它内容（非空白）→ 值不是字符串/模板字面量开头 → fail-closed
      throw new Fatal(`${label}：键 "${t.value}" 的值不是字符串/模板字面量（超出受支持子集）`)
    }
    const vt = toks[v]
    if (!vt || (vt.kind !== 'str' && vt.kind !== 'template')) {
      throw new Fatal(`${label}：键 "${t.value}" 缺少字符串/模板值（受支持子集外或格式异常）`)
    }
    entries.push({ key: t.value, value: vt.value })
  }
  if (depth !== 0) throw new Fatal(`${label}：括号不平衡（词法解析器状态异常）`)
  if (entries.length === 0) throw new Fatal(`${label}：未解析到任何键（词典为空或超出受支持子集）`)
  return entries
}

/* ============================ 组件 t() 扫描 ============================ */

function listSrcFiles(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) { if (!/(node_modules|\.git)/.test(name)) out.push(...listSrcFiles(p)) }
    else if (/\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

/**
 * 扫组件里 t('字面量') / t("字面量") 的静态键 —— **刻意用宽松启发式，不用上面的严格词法器**。
 *
 * 为什么不复用严格 lexer（这正是独立审查揭示的边界）：组件是 .tsx，含正则字面量（/['"]/）与
 * JSX 文本里的裸撇号（it's），手写小型 JS/TS 词法器无法可靠区分「除法 vs 正则」「JSX 文本撇号 vs
 * 字符串起点」——强行套用会把 PracticePanel 这类正常文件误判成「字符串未闭合」而 Fatal。严格 lexer
 * 只用于**纯数据的词典文件**（en.ts/zh.ts 无正则/JSX/关键字，安全），组件扫描退回到剥注释+正则。
 *
 * 误差方向可控：
 *   - 漏报（某真实 t() 因同行前置 URL 的 `//` 被当注释截断而没扫到）→ 安全：只是少检一个键，不会误红。
 *   - 误报（注释/字符串里的假 t('ghost') 被计入）→ 已用「先剥块/行注释」压到很低；若仍命中且该键真不在
 *     词典，会判红 —— 属可接受的保守误报（宁红勿漏），需在报告里人工分诊。
 * 契约边界：仅静态直接调用 t('literal')；别名/解构改名/动态拼接键/其它 i18n API 不覆盖（明示，不谎称）。
 */
function collectLiteralKeys(files) {
  const used = new Set()
  const re = /\bt\(\s*(['"])([^'"]+)\1/g
  for (const f of files) {
    let txt
    try { txt = readFileSync(f, 'utf8') } catch { continue }
    const cleaned = txt.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    let m
    while ((m = re.exec(cleaned)) !== null) used.add(m[2])
  }
  return used
}

/* ============================ 判据（纯函数） ============================ */

function runChecks(enEntries, zhEntries, usedKeys) {
  const hits = new Set()
  const logs = []
  const errors = []
  const fail = (code, msg) => { hits.add(code); errors.push(`  ✗ [${code}] ${msg}`) }

  const enKeys = enEntries.map((e) => e.key)
  const zhKeys = zhEntries.map((e) => e.key)
  const enSet = new Set(enKeys)
  const zhSet = new Set(zhKeys)
  const onlyZh = zhKeys.filter((k) => !enSet.has(k))
  const onlyEn = enKeys.filter((k) => !zhSet.has(k))
  const dupEn = [...new Set(enKeys.filter((k, i) => enKeys.indexOf(k) !== i))]
  const dupZh = [...new Set(zhKeys.filter((k, i) => zhKeys.indexOf(k) !== i))]
  if (onlyZh.length || onlyEn.length || dupEn.length || dupZh.length) {
    const parts = []
    if (onlyZh.length) parts.push(`仅 zh 有(en 缺)：${onlyZh.slice(0, 12).join(', ')}${onlyZh.length > 12 ? ` …(+${onlyZh.length - 12})` : ''}`)
    if (onlyEn.length) parts.push(`仅 en 有(zh 缺)：${onlyEn.slice(0, 12).join(', ')}${onlyEn.length > 12 ? ` …(+${onlyEn.length - 12})` : ''}`)
    if (dupEn.length) parts.push(`en 重复键：${dupEn.join(', ')}`)
    if (dupZh.length) parts.push(`zh 重复键：${dupZh.join(', ')}`)
    fail('KEY_BALANCE', `en(${enKeys.length})/zh(${zhKeys.length}) 键集合不一致 → ${parts.join(' | ')}`)
  } else {
    logs.push(`  ✓ 键配平：en/zh 各 ${enKeys.length} 键，集合完全相等，无重复`)
  }

  const cjk = enEntries.filter((e) => CJK.test(e.value.replace(/`[^`]*`/g, '')))
  if (cjk.length) {
    fail('EN_CJK_RESIDUE', `英文词典 ${cjk.length} 条 value 正文含中日韩（未真正译出；行内 code 示例已豁免）：${cjk.slice(0, 10).map((e) => `${e.key}="${e.value.slice(0, 24)}"`).join(', ')}${cjk.length > 10 ? ` …(+${cjk.length - 10})` : ''}`)
  } else {
    logs.push(`  ✓ 英文词典正文无 CJK 污染（${enEntries.length} 条 value，已豁免行内 code 示例）`)
  }

  const missing = [...usedKeys].filter((k) => !zhSet.has(k)).sort()
  if (missing.length) {
    fail('KEY_USAGE_MISSING', `组件 t('key') 引用了 zh 准源里不存在的键 ${missing.length} 个：${missing.slice(0, 15).join(', ')}${missing.length > 15 ? ` …(+${missing.length - 15})` : ''}`)
  } else {
    logs.push(`  ✓ 组件静态 t('key') 全部命中词典（引用 ${usedKeys.size} 个唯一键）`)
  }
  return { hits, logs, errors, counts: { enKeys: enKeys.length, zhKeys: zhKeys.length, usedKeys: usedKeys.size } }
}

function loadReal() {
  const en = parseDict(readFileSync(join(I18N_DIR, 'en.ts'), 'utf8'), 'en.ts')
  const zh = parseDict(readFileSync(join(I18N_DIR, 'zh.ts'), 'utf8'), 'zh.ts')
  const used = collectLiteralKeys(listSrcFiles(SRC_DIR))
  return { en, zh, used }
}

/* ============================ 证伪自检 ============================ */

/**
 * ① 词法解析器回归夹具：直接喂手写 TS 源给 parseDict / collectLiteralKeys / runChecks，
 *    断言**解析结果本身**（键集/值/命中 code），**不经** runChecks 读真词典那条路径。
 *    —— 独立证明解析器理解 URL/模板/转义/扩展汉字/畸形输入，而非只证明注入故障会命中。
 */
function parserFixtures() {
  const results = []
  let bad = 0
  const ok = (id, cond, note = '') => { results.push(`  ${cond ? '✓' : '✗'} ${id}${note ? ' — ' + note : ''}`); if (!cond) bad++ }

  // F-URL：值含 https:// 且其后有未译中文 → EN_CJK_RESIDUE 必须命中（v1 漏报）
  {
    const en = parseDict(`export const en = { 'a.help': 'See https://x.dev 未译 text', 'b': 'ok' }`, 'F-URL-en')
    const zh = parseDict(`export const zh = { 'a.help': '看 https://x.dev 未译 文字', 'b': '好' }`, 'F-URL-zh')
    const r = runChecks(en, zh, new Set())
    ok('F-URL 值内 // 不再误删、正文中文判红', r.hits.has('EN_CJK_RESIDUE'), `hits={${[...r.hits].join(',')}}`)
    ok('F-URL 键集解析正确(2)', en.length === 2 && zh.length === 2)
  }
  // F-TMPL：模板串值里的伪键不得被当顶层键（v1 幻影键）
  {
    const en = parseDict("export const en = { 'help': `Example:\n  'fake.key': 'not real'\n`, 'real.key': 'Real' }", 'F-TMPL')
    const keys = en.map((e) => e.key)
    ok('F-TMPL 模板伪键不被计入', !keys.includes('fake.key') && keys.length === 2 && keys.includes('help') && keys.includes('real.key'), `keys=[${keys.join(', ')}]`)
  }
  // F-EXTB：CJK 扩展 B（𠀀）应被识别为汉字
  {
    ok('F-EXTB 扩展汉字被识别', /\p{Script=Han}/u.test('\u{20000}'), 'U+20000 ∈ Han 属性')
    const en = parseDict("export const en = { 'x': 'a\u{20000}b' }", 'F-EXTB-en')
    const zh = parseDict("export const zh = { 'x': '中' }", 'F-EXTB-zh')
    ok('F-EXTB 经 runChecks 判红 EN_CJK_RESIDUE', runChecks(en, zh, new Set()).hits.has('EN_CJK_RESIDUE'))
  }
  // F-DUP：同侧重复键必须判红
  {
    const en = parseDict("export const en = { 'a': 'x', 'a': 'y' }", 'F-DUP-en')
    const zh = parseDict("export const zh = { 'a': 'x', 'a': 'y' }", 'F-DUP-zh')
    ok('F-DUP 重复键判红', runChecks(en, zh, new Set()).hits.has('KEY_BALANCE'))
  }
  // F-ESCAPE：转义引号不破坏值边界
  {
    const en = parseDict(`export const en = { 'a': 'say "hi" & \\'x\\' ok', 'b': 'y' }`, 'F-ESC')
    const e = en.find((x) => x.key === 'a')
    ok('F-ESCAPE 转义引号完整取值', e && e.value.includes('say "hi"') && e.value.includes("'x'"), `value=${JSON.stringify(e && e.value)}`)
  }
  // F-COMMENT：组件宽松扫描 —— 注释里的假 t() 不计入；各真实 t() 分行即可命中。
  //   （宽松是**有意**的：严格词法器无法安全吃 .tsx 的正则/JSX 撇号，见 collectLiteralKeys 注释。）
  {
    const looseClean = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    const collect = (code) => { const s = new Set(); const re = /\bt\(\s*(['"])([^'"]+)\1/g; let m; const c = looseClean(code); while ((m = re.exec(c)) !== null) s.add(m[2]); return s }
    const found = collect("const x = t('real.key');\n// t('ghost.comment')\n/* t('ghost.block') */\nconst y = t('after');")
    ok('F-COMMENT 注释里的假 t() 不计入、分行真实 t() 命中', found.has('real.key') && found.has('after') && !found.has('ghost.comment') && !found.has('ghost.block'), `found={${[...found].join(',')}}`)
    // 已知边界（编码为期望，而非当作 bug）：同行 URL 的 `//b` 会被当行注释截断 → 漏报该行后续 t()（安全方向：少检不误红）
    const limited = collect("const u = 'http://a//b'; const y = t('sameLineAfter');")
    ok('F-COMMENT 边界：同行 URL 后 t() 漏报（宽松启发式的已知安全局限）', !limited.has('sameLineAfter'), `found={${[...limited].join(',')}}`)
  }
  // F-CLOSE-STR / F-CLOSE-CMT / F-CLOSE-TPL / F-UNSUP：畸形/超子集必须抛 Fatal（fail-closed）
  const mustThrow = (id, fn) => { let threw = false; try { fn() } catch (e) { threw = e instanceof Fatal } ok(id, threw) }
  mustThrow('F-CLOSE-STR 未闭合字符串 → Fatal', () => parseDict("export const en = { 'a': 'oops }", 'F1'))
  mustThrow('F-CLOSE-CMT 未闭合块注释 → Fatal', () => parseDict("export const en = { /* nope 'a':'b' }", 'F2'))
  mustThrow('F-CLOSE-TPL 未闭合模板 → Fatal', () => parseDict('export const en = { `a }', 'F3'))
  mustThrow('F-UNSUP 值非字符串字面量(数字) → Fatal', () => parseDict("export const en = { 'a': 123 }", 'F4'))
  mustThrow('F-EMPTY 无键 → Fatal', () => parseDict('export const en = {}', 'F5'))

  return { results, bad }
}

function falsify() {
  console.log('[gate:i18n] 证伪自检')
  console.log('────────── ① 词法解析器回归夹具（独立，不经真词典）──────────')
  const fx = parserFixtures()
  for (const l of fx.results) console.log(l)

  console.log('────────── ② 判据注入证伪（内存注入，不动真词典）──────────')
  const real = loadReal()
  const clone = (arr) => arr.map((e) => ({ ...e }))
  let bad = fx.bad
  const results = []
  const check = (letter, name, expect, en, zh, used) => {
    const r = runChecks(en, zh, used)
    const got = [...r.hits].sort()
    const want = [...expect].sort()
    const exact = got.length === want.length && got.every((x, i) => x === want[i])
    if (exact) results.push(`  ✓ ${letter} ${want.length ? `恰好判红 {${got.join(',')}}` : '恰好判绿（对照组）'} —— ${name}`)
    else { bad++; results.push(`  ✗ ${letter} 期望 {${want.join(',') || '∅'}}，实际 {${got.join(',') || '∅'}} —— ${name}`) }
  }
  check('CTRL', '真词典+真引用必须判绿', [], real.en, real.zh, real.used)
  { const en = clone(real.en); en.splice(5, 1); check('B1', 'en 删一键 → 不配平', ['KEY_BALANCE'], en, clone(real.zh), new Set()) }
  { const en = clone(real.en); en.push({ key: 'z.extra', value: 'x' }); check('B2', 'en 加一键 → 不配平', ['KEY_BALANCE'], en, clone(real.zh), new Set()) }
  { const en = clone(real.en); en[0] = { ...en[0], value: 'Practice 练习' }; check('C1', '英文正文含中文 → 判红', ['EN_CJK_RESIDUE'], en, clone(real.zh), new Set()) }
  { const en = clone(real.en); en[0] = { ...en[0], value: 'a `x = 中` b `y = 文` c' }; check('C2', '中文在多段行内 code 示例内 → 豁免判绿', [], en, clone(real.zh), new Set()) }
  { const en = clone(real.en); en[0] = { ...en[0], value: 'See https://x 未译' }; check('C3', 'URL 后中文不再被误删 → 判红(v1 R1 回归)', ['EN_CJK_RESIDUE'], en, clone(real.zh), new Set()) }
  { check('V1', '引用不存在键 → 覆盖缺失', ['KEY_USAGE_MISSING'], clone(real.en), clone(real.zh), new Set(['no.such'])) }
  { check('V2', '引用合法集合 → 判绿', [], clone(real.en), clone(real.zh), new Set(real.used)) }

  for (const l of results) console.log(l)
  console.log('──────────────────────────────────────────────────────')
  if (bad === 0) { console.log(`i18n Gate Falsification：✅ PASS —— 夹具 ${fx.results.length} 项全绿 + 注入 ${8 - 0} 例符合预期（含 2 判绿对照组）；真词典未被触碰`); process.exit(0) }
  console.error(`i18n Gate Falsification：❌ FAIL —— ${bad} 项问题（解析器/判据不可信）`); process.exit(1)
}

function parseArgs(argv) {
  let falsifyMode = false
  for (const a of argv.slice(2)) { if (a === '--falsify') falsifyMode = true; else throw new Fatal(`未知参数 ${JSON.stringify(a)} —— 不接受未知 flag`) }
  return { falsifyMode }
}

try {
  const { falsifyMode } = parseArgs(process.argv)
  if (falsifyMode) { falsify() } else {
    const real = loadReal()
    const r = runChecks(real.en, real.zh, real.used)
    for (const l of r.logs) console.log(l)
    for (const e of r.errors) console.error(e)
    console.log('──────────────────────────────────────────────────────')
    if (r.hits.size === 0) { console.log(`i18n Gate: PASS —— en ${r.counts.enKeys} 键 / zh ${r.counts.zhKeys} 键 / 引用 ${r.counts.usedKeys} 唯一键`); process.exit(0) }
    console.error(`i18n Gate: FAIL —— 命中 ${[...r.hits].join(', ')}`); process.exit(1)
  }
} catch (e) {
  if (e instanceof Fatal) { console.error(`❌ EXIT=2：${e.message}`); process.exit(2) }
  throw e
}
