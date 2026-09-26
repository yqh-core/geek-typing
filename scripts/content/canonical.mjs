/* V4.1-P0.6 · scripts/content/canonical.mjs —— 可复现构建链的序列化基石。
 *
 * 为什么需要它（对应 V4.1-P0.6「Contract Hardening」的数据管线部分）：
 *   build.mjs 原先拿 words.json **文件原文**算 sha256，validate.mjs 拿 JSON.stringify(words)
 *   算。两者现在恰好一致，但只要文件被格式化（加缩进 / 换行 / 键顺序变化），checksum 就会
 *   漂移 ⇒ 「内容没变」被误判成「内容变了」，进而污染 contentVersion、触发缓存失效。
 *   本模块把「序列化」与「指纹」收敛到唯一实现：checksum = sha256(canonicalize(value))，
 *   只取决于**数据语义**，与文件排版无关。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ 铁律 1：数组保持原顺序，绝不重排。
 *   词表顺序 = 数据与产品语义（词频序 / 教材序 / 难度梯度），重排会破坏产品本身。
 *   本模块对数组只做「逐元素 canonicalize + 逗号拼接」，不做任何排序、去重、过滤。
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 规则：
 *  1. 对象键按**固定顺序**：词条白名单序 word → translation → phonetic → definition →
 *     partOfSpeech；白名单外的未知键按**字典序**（UTF-16 码位序，与 locale 无关）
 *     排在白名单键之后 —— 既不丢字段，也不因 JS 插入序漂移。
 *     值为 undefined 的键**省略**；null **保留**（"exam": null 是有语义的取值）。
 *  2. 数组保持原顺序（见铁律 1）。
 *  3. 字符串走 JSON.stringify 标准转义，**Unicode 原样输出**（不转义成 \uXXXX）；
 *     仅孤立代理项（lone surrogate）按 ES2019 well-formed stringify 转义，属 JSON 合法性所需。
 *  4. 无缩进、无空格（JSON.stringify 紧凑形），**结尾无换行**。
 *  5. 数字原样输出，不做任何格式化（不补零、不转科学计数）；非有限数（NaN/Infinity）
 *     按 JSON 语义退化为 null。
 *
 * 幂等性（可复现的前提）：canonicalize(JSON.parse(canonicalize(x))) === canonicalize(x)。
 *   第一遍输出已固定键序且无 undefined 键 ⇒ 再解析再序列化字节不变。
 *   自检见下方 selfCheck()，可直接 `node scripts/content/canonical.mjs` 运行。
 */
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

/** 词条字段白名单序 —— 同时也是 src/core/content 词模型的字段序，勿随意调整。 */
export const CANONICAL_FIELD_ORDER = ['word', 'translation', 'phonetic', 'definition', 'partOfSpeech']

/** 字典序比较器：显式用 UTF-16 码位序，避免 localeCompare / 引擎差异 */
const byCodeUnit = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

/** 对象键顺序：白名单键（按白名单序）在前，未知键（按字典序）在后；跳过 undefined 值 */
function orderedKeys(v) {
  const keys = Object.keys(v).filter((k) => v[k] !== undefined)
  const whitelisted = CANONICAL_FIELD_ORDER.filter((k) => keys.includes(k))
  const unknown = keys.filter((k) => !CANONICAL_FIELD_ORDER.includes(k)).sort(byCodeUnit)
  return [...whitelisted, ...unknown]
}

/**
 * 规范序列化：把任意 JSON 值转成唯一、稳定、与排版无关的紧凑字符串。
 * @param {unknown} value
 * @returns {string} 紧凑 JSON 文本，**不含尾随换行**
 */
export function canonicalize(value) {
  if (value === null) return 'null'
  if (Array.isArray(value)) {
    // 铁律 1：原序拼接，绝不排序 / 去重
    return '[' + value.map(canonicalize).join(',') + ']'
  }
  const t = typeof value
  if (t === 'string') return JSON.stringify(value) // 标准转义 + Unicode 原样 + well-formed surrogate
  if (t === 'number') return Number.isFinite(value) ? JSON.stringify(value) : 'null'
  if (t === 'boolean') return value ? 'true' : 'false'
  if (t === 'object') {
    const body = orderedKeys(value)
      .map((k) => JSON.stringify(k) + ':' + canonicalize(value[k]))
      .join(',')
    return '{' + body + '}'
  }
  return 'null' // undefined / function / symbol：JSON 无此类型，退化为 null
}

/**
 * 内容指纹。返回 `'sha256:' + hex`。
 * 用法语义区分（build.mjs 注释同步说明）：
 *   · manifest.contentChecksum = **规范化入库内容**的指纹（本函数）
 *   · manifest.sources[].checksum = **来源原始数据**的指纹。
 *     当前来源就是本仓 words.json ⇒ 二者同值；将来接入「导入原始 CSV / 上游文件」时，
 *     sources[].checksum 应改为原始字节的 sha256，二者会不同 —— 这正是 provenance 的用途。
 */
export function sha256Canonical(value) {
  return 'sha256:' + createHash('sha256').update(canonicalize(value), 'utf8').digest('hex')
}

/**
 * 落盘形态：canonicalize 结果 + 尾随换行（POSIX 文本文件惯例，避免 diff 时出现 "\ No newline"）。
 * 注意：checksum 只对 canonicalize 结果计算，**不含**这个换行。
 */
export function canonicalFile(value) {
  return canonicalize(value) + '\n'
}

/** 幂等自检：canonicalize(JSON.parse(canonicalize(x))) === canonicalize(x)
 *  出错抛异常（CI 可用）；正常返回 true。 */
export function selfCheck() {
  const samples = [
    { b: 2, a: 1, word: 'x' },
    // 词条真实形态：插入序违反白名单序，应被重排为 word/translation/phonetic/definition
    { definition: '放弃', phonetic: "ə'bændən", translation: '抛弃', word: 'abandon' },
    { word: 'null 保留', exam: null, ghost: undefined },
    [{ word: 'z' }, { word: 'a' }], // 数组必须保持原序 z → a
    { nested: { stats: { items: 3, z: [1, 2, { y: true, x: 1 }] } } },
    '中文 / 😀 / 引号"与\\反斜杠 / 制表\t / 换行\n',
    42, -0.5, true, false, null, [],
  ]
  for (const x of samples) {
    const once = canonicalize(x)
    const twice = canonicalize(JSON.parse(once))
    if (once !== twice) throw new Error(`canonicalize 非幂等：\n  once=${once}\n  twice=${twice}`)
  }
  // 数组不得重排
  if (canonicalize([{ word: 'z' }, { word: 'a' }]) !== '[{"word":"z"},{"word":"a"}]') {
    throw new Error('数组被重排，违反铁律 1')
  }
  // 与排版无关：同一份数据、不同插入序/不同缩进的两种写法必须同指纹
  const a = { definition: 'd', phonetic: 'p', translation: 't', word: 'w' }
  const b = JSON.parse(JSON.stringify({ ...a }, null, 2))
  if (sha256Canonical(a) !== sha256Canonical(b)) throw new Error('指纹依赖了键顺序')
  return true
}

// 直接运行本文件即跑自检：node scripts/content/canonical.mjs
// （Windows 下 process.argv[1] 是 D:\... 而 import.meta.url 是 file:///D:/...，
//   用 pathToFileURL 归一后再比，别手写字符串拼接。）
const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) {
  selfCheck()
  const demo = { definition: '放弃；抛弃', phonetic: "ə'bændən", translation: '放弃', word: 'abandon' }
  console.log('canonicalize  :', canonicalize(demo))
  console.log('canonicalFile :', JSON.stringify(canonicalFile(demo)))
  console.log('sha256Canonical:', sha256Canonical(demo))
  console.log('[canonical] selfCheck PASS（幂等 + 数组不重排 + 指纹与排版无关）')
}
