#!/usr/bin/env node
/**
 * 批次 4 · geek-typing —— i18n 键门禁（gate-i18n.mjs）
 *
 * 背景（评审一手证据）：geek-typing 有 en.ts / zh.ts 双语词典（261/261 计数相等），
 * 但**没有**任何自动化门禁证明「两词典键集合一致」「英文词典未被中文污染」「组件里
 * t('字面量') 引用的键真实存在」。对比 digttsreader 已有 tests/unit/i18n-keys.test.ts，
 * 本站缺这一层 = 新增语言或漏译时**静默降级**（界面切成英文、某句仍是中文，或 t('缺失键')
 * 直接把 key 字符串渲染给用户），肉眼才看得见。本门把它变成构建期判据。
 *
 * 与仓库既有门同族（见 gate-license.mjs）：三分退出码、runChecks 返回命中集、
 * --falsify 自证「不会失败的门等于没有门」。区别：本站门禁**全在进程内**用内存态输入
 * 证伪，**不写任何文件、不 spawn 子进程**（本机 node 预加载 shim 会 EBUSY），因此无字节还原环节。
 *
 * 三条判据（任一命中 ⇒ FAIL，独立 code 以便分诊）：
 *   1. KEY_BALANCE        —— en.ts 与 zh.ts 的键集合必须完全相等（zh 为准源，见 zh.ts 头注释）。
 *                            报告「仅 zh 有」「仅 en 有」两个方向。
 *   2. EN_CJK_RESIDUE     —— 英文词典任一 value 的**正文**含中日韩字符 ⇒ 该条尚未真正翻译（英文站泄漏中文）。
 *                            例外：`` `...` `` 行内代码段里的 CJK 是**示例负载**（如 bank.help 的
 *                            `` `quantization = 量化` `` 演示导入格式），属刻意内容、非漏译，判据剥除后再测。
 *   3. KEY_USAGE_MISSING  —— 组件里 t('字面量键') / t("字面量键") 引用的键，在 zh 准源里不存在。
 *                            （仅静态字面量；动态拼接键不可静态判定，如实不覆盖，与 ttsreader 同界。）
 *
 * 退出码：0=PASS；1=FAIL（存在违规）；2=Fatal（词典文件读不到 / 解析不出任何键 / 未知 flag）——
 *   **解析失败绝不降级成 PASS**。
 *
 * 用法：
 *   npm run gate:i18n            # 读真 src/i18n/en.ts|zh.ts + 扫 src 的 t() 字面量
 *   npm run gate:i18n:falsify   # 进程内注入故障，断言命中集精确等于预期 + 对照组判绿
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const I18N_DIR = join(ROOT, 'src', 'i18n')
const SRC_DIR = join(ROOT, 'src')

/** 脚本自身错误（EXIT=2）—— 与「判据不成立（EXIT=1）」严格区分。 */
class Fatal extends Error {}

const CJK = /[\u3400-\u4DBF\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/

/**
 * 从 `export const xx: Record<string,string> = { ... }` 里**精确**抽取 { key, value }。
 * 逐字符扫描：跟踪单/双引号与 `/* *\/`、`//` 注释；只在对象字面量**顶层**（depth 1）记录
 * `key : value`。key 一律是带引号的字符串；value 取到该条结束（逗号/换行由下一 key 界定，
 * 我们只关心 value 的文本用于 CJK 判定，故把 key 之后到下一个顶层 key 之前、去注释的片段作 value）。
 * 简化策略：先剥注释，再按「顶层引号串 + 冒号」切 key，冒号后到下一个 key 前为 value。
 */
function parseDict(src, label) {
  const open = src.indexOf('{')
  const close = src.lastIndexOf('}')
  if (open < 0 || close < 0 || close <= open) {
    throw new Fatal(`${label}：找不到对象字面量 { ... }，无法抽取键（解析失败，绝不判绿）`)
  }
  let body = src.slice(open + 1, close)
  // 剥块注释与行注释（词典无嵌套注释、value 内无 // https 这类串——见样本；保守只剥整行注释与 /* */）
  body = body.replace(/\/\*[\s\S]*?\*\//g, '')
  const entries = []
  // 逐行扫描顶层 key：`  'key': <开始值>` 或 `  'key':\n    <值>`
  // 我们按 key 边界切分：匹配 (^\s*)(['"])(...)\2(\s*:) 作为一条起点。
  const keyRe = /^[ \t]*(['"])([^'"]+)\1[ \t]*:/gm
  const marks = []
  let m
  while ((m = keyRe.exec(body)) !== null) {
    marks.push({ key: m[2], start: m.index, valFrom: m.index + m[0].length })
  }
  if (marks.length === 0) {
    throw new Fatal(`${label}：未解析到任何键（正则失配？词典格式变更？）—— 解析失败，绝不判绿`)
  }
  for (let i = 0; i < marks.length; i++) {
    const next = i + 1 < marks.length ? marks[i + 1].start : body.length
    const rawVal = body.slice(marks[i].valFrom, next)
    // 去掉行注释与首尾空白、结尾逗号，再剥引号（单或双）
    const cleaned = rawVal.replace(/\/\/[^\n]*/g, '').replace(/\s+/g, ' ').trim().replace(/,\s*$/, '')
    const unq = cleaned.match(/^(['"])((?:\\.|(?!\1).)*)\1$/s)
    entries.push({ key: marks[i].key, value: unq ? unq[2] : cleaned })
  }
  return entries
}

/** 递归列出 src 下 .ts/.tsx（跳过词典与测试文件目录内注释噪音无妨；仅取调用点）。 */
function listSrcFiles(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) {
      if (/(node_modules|\.git)/.test(name)) continue
      out.push(...listSrcFiles(p))
    } else if (/\.tsx?$/.test(name)) {
      out.push(p)
    }
  }
  return out
}

/** 扫组件里的 `t('key')` / `t("key")` 静态字面量键。 */
function collectLiteralKeys(files) {
  const used = new Set()
  const re = /\bt\(\s*(['"])([^'"]+)\1/g
  for (const f of files) {
    let txt
    try { txt = readFileSync(f, 'utf8') } catch { continue }
    // 去块/行注释避免注释里的 t('...') 误报
    txt = txt.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    let m
    while ((m = re.exec(txt)) !== null) used.add(m[2])
  }
  return used
}

/**
 * 纯函数判据主体（内存态输入，正常/证伪共用一条路径）。
 * 返回 { hits:Set, logs, counts }。
 */
function runChecks(enEntries, zhEntries, usedKeys) {
  const hits = new Set()
  const logs = []
  const errors = []
  const fail = (code, msg) => { hits.add(code); errors.push(`  ✗ [${code}] ${msg}`) }

  const enKeys = enEntries.map((e) => e.key)
  const zhKeys = zhEntries.map((e) => e.key)
  const enSet = new Set(enKeys)
  const zhSet = new Set(zhKeys)

  // 判据 1：键集合一致
  const onlyZh = zhKeys.filter((k) => !enSet.has(k))
  const onlyEn = enKeys.filter((k) => !zhSet.has(k))
  // 重复键检查（同侧）
  const dupEn = enKeys.filter((k, i) => enKeys.indexOf(k) !== i)
  const dupZh = zhKeys.filter((k, i) => zhKeys.indexOf(k) !== i)
  if (onlyZh.length || onlyEn.length || dupEn.length || dupZh.length) {
    const parts = []
    if (onlyZh.length) parts.push(`仅 zh 有(en 缺)：${onlyZh.slice(0, 12).join(', ')}${onlyZh.length > 12 ? ` …(+${onlyZh.length - 12})` : ''}`)
    if (onlyEn.length) parts.push(`仅 en 有(zh 缺)：${onlyEn.slice(0, 12).join(', ')}${onlyEn.length > 12 ? ` …(+${onlyEn.length - 12})` : ''}`)
    if (dupEn.length) parts.push(`en 重复键：${[...new Set(dupEn)].join(', ')}`)
    if (dupZh.length) parts.push(`zh 重复键：${[...new Set(dupZh)].join(', ')}`)
    fail('KEY_BALANCE', `en(${enKeys.length})/zh(${zhKeys.length}) 键集合不一致 → ${parts.join(' | ')}`)
  } else {
    logs.push(`  ✓ 键配平：en/zh 各 ${enKeys.length} 键，集合完全相等，无重复`)
  }

  // 判据 2：英文词典 CJK 污染（正文；剥 `` `...` `` 行内代码示例后判，示例负载豁免）
  const cjk = enEntries.filter((e) => CJK.test(e.value.replace(/`[^`]*`/g, '')))
  if (cjk.length) {
    fail('EN_CJK_RESIDUE', `英文词典 ${cjk.length} 条 value 正文含中日韩字符（未真正译出，行内代码示例已豁免）：${cjk.slice(0, 10).map((e) => `${e.key}="${e.value.slice(0, 20)}"`).join(', ')}${cjk.length > 10 ? ` …(+${cjk.length - 10})` : ''}`)
  } else {
    logs.push(`  ✓ 英文词典正文无 CJK 污染（${enEntries.length} 条 value，已豁免行内代码示例）`)
  }

  // 判据 3：t('字面量') 引用的键必须存在于 zh 准源
  const missing = [...usedKeys].filter((k) => !zhSet.has(k)).sort()
  if (missing.length) {
    fail('KEY_USAGE_MISSING', `组件 t('key') 引用了 zh 准源里不存在的键 ${missing.length} 个：${missing.slice(0, 15).join(', ')}${missing.length > 15 ? ` …(+${missing.length - 15})` : ''}`)
  } else {
    logs.push(`  ✓ 组件静态 t('key') 全部命中词典（引用 ${usedKeys.size} 个唯一键）`)
  }

  return { hits, logs, errors, counts: { enKeys: enKeys.length, zhKeys: zhKeys.length, usedKeys: usedKeys.size } }
}

function parseArgs(argv) {
  const args = argv.slice(2)
  let falsify = false
  for (const a of args) {
    if (a === '--falsify') falsify = true
    else throw new Fatal(`未知参数 ${JSON.stringify(a)} —— 本门不接受未知 flag`)
  }
  return { falsify }
}

/** 读真词典 + 扫真 src → 供正常模式与证伪的对照组基座。 */
function loadReal() {
  const enText = readFileSync(join(I18N_DIR, 'en.ts'), 'utf8')
  const zhText = readFileSync(join(I18N_DIR, 'zh.ts'), 'utf8')
  const en = parseDict(enText, 'en.ts')
  const zh = parseDict(zhText, 'zh.ts')
  const used = collectLiteralKeys(listSrcFiles(SRC_DIR))
  return { en, zh, used }
}

/* ---------------------- 证伪自检（纯内存，绝不写文件） ---------------------- */
function falsify() {
  console.log('[gate:i18n] 证伪自检 —— 证明每条判据都能判红（内存注入，不动真词典/不写文件）')
  const real = loadReal()
  const clone = (arr) => arr.map((e) => ({ ...e }))
  let bad = 0
  const results = []
  const check = (letter, name, expect, en, zh, used) => {
    const r = runChecks(en, zh, used)
    const got = [...r.hits].sort()
    const want = [...expect].sort()
    const exact = got.length === want.length && got.every((x, i) => x === want[i])
    if (exact) {
      results.push(`  ✓ ${letter} ${want.length ? `恰好判红 {${got.join(',')}}` : '恰好判绿（对照组）'} —— ${name}`)
    } else {
      bad++
      results.push(`  ✗ ${letter} 未达预期：期望 {${want.join(',') || '∅'}}，实际 {${got.join(',') || '∅'}} —— ${name}`)
      if (got.length === 0 && want.length > 0) results.push('      该判据是空转的（注入故障后仍判 PASS）')
    }
  }

  // CTRL：真输入 → 判绿
  check('CTRL', '真词典 + 真引用（本门必须判绿，否则前面全失真）', [], real.en, real.zh, real.used)
  // B1：en 少一个键 → 仅 zh 有 → KEY_BALANCE
  { const en = clone(real.en); en.splice(5, 1); check('B1', 'en 删一个键 → 键集合不一致', ['KEY_BALANCE'], en, clone(real.zh), new Set()) }
  // B2：en 多一个 zh 没有的键 → 仅 en 有
  { const en = clone(real.en); en.push({ key: 'zonly.extra.key', value: 'Extra' }); check('B2', 'en 多一个键 → 键集合不一致', ['KEY_BALANCE'], en, clone(real.zh), new Set()) }
  // C1：某 en value 正文塞中文 → EN_CJK_RESIDUE
  { const en = clone(real.en); en[0] = { ...en[0], value: 'Practice 练习' }; check('C1', '英文正文 value 含中文 → 污染判红', ['EN_CJK_RESIDUE'], en, clone(real.zh), new Set()) }
  // C2：某 en value 的中文在行内代码示例里 → 豁免 → 判绿（证明豁免不是"无视所有 CJK"）
  { const en = clone(real.en); en[0] = { ...en[0], value: 'One per line like `x = 中文`, ok' }; check('C2', '中文在 `` `code` `` 示例内 → 豁免判绿', [], en, clone(real.zh), new Set()) }
  // V1：引用一个词典里没有的键 → KEY_USAGE_MISSING
  { check('V1', '组件引用不存在键 → 覆盖缺失', ['KEY_USAGE_MISSING'], clone(real.en), clone(real.zh), new Set(['no.such.key.xyz'])) }
  // V2：对照组，used 全是真键 → 判绿
  { const used = new Set(real.used.size ? [...real.used] : []); check('V2', '引用集合保持合法（仅测覆盖维度不误伤）', [], clone(real.en), clone(real.zh), used) }

  for (const l of results) console.log(l)
  console.log('──────────────────────────────────────────────────────')
  if (bad === 0) {
    console.log(`i18n Gate Falsification：✅ PASS —— ${7}/7 用例符合预期（含 3 条判绿对照组），真词典未被触碰`)
    process.exit(0)
  }
  console.error(`i18n Gate Falsification：❌ FAIL —— ${bad} 项问题（存在恒真判据 ⇒ 本门不可信）`)
  process.exit(1)
}

/* ------------------------------- 入口 ------------------------------- */
try {
  const { falsify: wantFalsify } = parseArgs(process.argv)
  if (wantFalsify) { falsify() } else {
    const real = loadReal()
    const r = runChecks(real.en, real.zh, real.used)
    for (const l of r.logs) console.log(l)
    for (const e of r.errors) console.error(e)
    console.log('──────────────────────────────────────────────────────')
    if (r.hits.size === 0) {
      console.log(`i18n Gate: PASS —— en ${r.counts.enKeys} 键 / zh ${r.counts.zhKeys} 键 / 引用 ${r.counts.usedKeys} 唯一键`)
      process.exit(0)
    }
    console.error(`i18n Gate: FAIL —— 命中 ${[...r.hits].join(', ')}`)
    process.exit(1)
  }
} catch (e) {
  if (e instanceof Fatal) { console.error(`❌ EXIT=2：${e.message}`); process.exit(2) }
  throw e
}
