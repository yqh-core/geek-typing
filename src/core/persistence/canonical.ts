/* P1.7 Wave 1-C · Canonical JSON（v2.3.2 §7 / §19-6）
 *
 * Canonicalization = JCS（RFC 8785）；项目附加规范化 = Unicode NFC ——
 * NFC 不属于 JCS，定位为 canonicalization boundary 上的 pre-normalization：
 * 所有 string（键与值）在进入 canonical 序列化前统一 NFC。
 *
 * 附加规则（冻结）：
 *   -0 → 0；safe integer 之外的 number reject；BigInt/undefined/NaN/Infinity/symbol/function reject；
 *   Date 先转 ISO 字符串；对象键按 UTF-16 code unit 序排序（JCS 要求）；数组保序。
 *
 * hash = SHA-256(canonical 串)（hex）；同构于 Node crypto 与 WebCrypto。
 */

export class CanonicalizationError extends Error {
  constructor(message: string) {
    super(`canonicalize: ${message}`)
    this.name = 'CanonicalizationError'
  }
}

/** 值入口前的类型收紧 + 规范化（递归） */
function normalize(value: unknown, depth: number): unknown {
  if (depth > 64) throw new CanonicalizationError('nesting too deep')
  if (value === null) return null
  const t = typeof value
  if (t === 'string') return (value as string).normalize('NFC')
  if (t === 'boolean') return value
  if (t === 'number') {
    const n = value as number
    if (!Number.isFinite(n)) throw new CanonicalizationError(`non-finite number: ${n}`)
    if (!Number.isSafeInteger(n) && !Number.isInteger(n)) {
      // 非整数 number：JCS 允许（IEEE 754 双精度），但必须是有限值 → 保留
      if (Object.is(n, -0)) return 0
      return n
    }
    if (Object.is(n, -0)) return 0 // -0 → 0
    if (!Number.isSafeInteger(n)) throw new CanonicalizationError(`unsafe integer: ${n}`)
    return n
  }
  if (t === 'bigint') throw new CanonicalizationError('bigint rejected')
  if (t === 'undefined') throw new CanonicalizationError('undefined rejected')
  if (t === 'symbol') throw new CanonicalizationError('symbol rejected')
  if (t === 'function') throw new CanonicalizationError('function rejected')
  if (value instanceof Date) return normalize(value.toISOString(), depth + 1)
  if (Array.isArray(value)) return value.map((v) => normalize(v, depth + 1))
  if (t === 'object') {
    const src = value as Record<string, unknown>
    // 键 NFC 后按 UTF-16 code unit 序排序（默认字符串比较即 code unit 序）；
    // 必须携带原值配对（用规范化后的键回读原始对象会读丢组合符键 —— 测试抓到的真缺陷）
    const pairs = Object.keys(src)
      .map((k) => [k.normalize('NFC'), src[k]] as const)
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    const out: Record<string, unknown> = {}
    for (const [k, v] of pairs) out[k] = normalize(v, depth + 1)
    return out
  }
  throw new CanonicalizationError(`unsupported type: ${t}`)
}

/** canonical 序列化：JCS 排序键 + NFC 预规范化；非法输入抛 CanonicalizationError */
export function canonicalize(value: unknown): string {
  return JSON.stringify(normalize(value, 0))
}

/** canonical hash：SHA-256(canonical) hex（WebCrypto，Node ≥18 与浏览器同构） */
export async function canonicalHash(value: unknown): Promise<string> {
  const data = new TextEncoder().encode(canonicalize(value))
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** 便捷等值断言：两个值的 canonical hash 是否一致 */
export async function canonicalEqual(a: unknown, b: unknown): Promise<boolean> {
  return (await canonicalHash(a)) === (await canonicalHash(b))
}
