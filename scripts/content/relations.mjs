/* V4.1 · relations 端点可达性 —— **唯一实现**（P18-G0）。
 *
 * 为什么抽这一份：端点可达性判定历史上存在**三份**实现，其中
 *   scripts/gate-content-contract.mjs 与 scripts/content/ingest.mjs 是**逐字复制**，
 *   scripts/content/validate.mjs 是第三份（结构不同：用 registry Map + normWords）。
 * 三份都只认 `type === 'word'` ⇒ P18-G 一旦产出含 reading / listening / audio **条目**端点的
 * relations.json，所有非 word 端点会被判成孤儿端点（**假红**）；为不红而删端点则变漏判（**假绿**）。
 * 「三处必须同步」只写在注释里，就是下一场 P18-A「12→14 白名单漂移」—— 故抽成模块 + 加静态
 * 引用断言（tests/relations.mjs 第 ⑥ 条）。三处调用点只 import，自身**不得**再有规则逻辑。
 *
 * 两个关键事实（实测，勿推翻）：
 *  1. **端点类型段 ≠ 包类型**：vocabulary 包 → 端点 `content:word:<ns>:<词形>`
 *     （证据 src/core/content/index/content-index.ts:64、src/core/content/query/content-query.ts:38）；
 *     其余包类型与端点类型**同名**（如 content:reading:demo-demo-reading-01:reading-item-01）。
 *     照抄包类型做分桶 ⇒ 词桶永远空转。
 *  2. **载荷项的键字段按族分**：词库 = `word`；非词库条目 = `id`。
 *
 * 跨族必须不匹配：词桶与条目桶**物理隔离**，
 * `content:word:<reading 的 ns>:<reading 条目 id>` 必须 false —— 否则又是一次「静默错数据」。
 */
import { CONTENT_ID_RE } from './license-policy.mjs'

/** 归一化：NFC + lowercase + 空白折叠（与三处调用点原实现**逐字一致**，勿改口径） */
export const normKey = (raw) => String(raw ?? '').normalize('NFC').toLowerCase().replace(/[\s\u00A0]+/g, ' ').trim()

/** 端点类型段：vocabulary 包 → 'word'；其余包类型与端点类型同名 */
const endpointTypeOf = (pkgType) => (pkgType === 'vocabulary' ? 'word' : pkgType)

/** 载荷项的键字段：词库取 word，其余取 id（两者都是「数据字段」，不回写进类型分支） */
const keyFieldOf = (pkgType) => (pkgType === 'vocabulary' ? 'word' : 'id')

/**
 * 由 loadPackages() 的返回数组构造可达性索引。
 *
 * @param {Array<{type:string,id:string,dir:string,manifest:object,payloadName:string,payloadExists:boolean,payload:unknown}>} pkgs
 * @returns {{packages:Set<string>, byType:Map<string, Map<string, Set<string>>>}}
 *   packages —— 全部包的 ContentId（**包级端点**，优先命中）
 *   byType   —— 端点类型段 → ns → 归一化 local 集合（**条目级端点**，分族隔离）
 */
export function buildReachability(pkgs) {
  const packages = new Set()
  const byType = new Map()
  for (const p of pkgs) {
    const cid = p.manifest?.id
    if (cid) packages.add(cid)
    const ns = CONTENT_ID_RE.exec(String(cid ?? ''))?.[2]
    if (!ns) continue
    if (!Array.isArray(p.payload)) continue

    const type = endpointTypeOf(p.type)
    let bucket = byType.get(type)
    if (!bucket) { bucket = new Map(); byType.set(type, bucket) }
    let set = bucket.get(ns)
    if (!set) { set = new Set(); bucket.set(ns, set) }

    const field = keyFieldOf(p.type)
    for (const item of p.payload) {
      const k = normKey(item?.[field])
      // 空键不入桶：否则 local 为纯空白/空串的端点会「可达」，是假绿。
      if (k) set.add(k)
    }
  }
  return { packages, byType }
}

/**
 * 端点 ContentId 是否可达。
 * ① 包级 ContentId 命中（整包端点）⇒ 真；
 * ② 否则按 [端点类型段][ns][归一化 local] 查桶 —— **只查该类型自己的桶**，跨族恒不匹配。
 */
export function isReachable(reach, cid) {
  if (typeof cid !== 'string' || cid === '') return false
  if (reach.packages.has(cid)) return true
  const m = CONTENT_ID_RE.exec(cid)
  if (!m) return false
  const [, type, ns, local] = m
  return reach.byType.get(type)?.get(ns)?.has(normKey(local)) ?? false
}
