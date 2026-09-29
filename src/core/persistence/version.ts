/* P1.7 Wave 1-C · Version System（v2.3.2 §6）
 *
 * 五类版本 tagged template：裸 string 在类型层不可赋值（TS 模板字面量类型天然拒绝）。
 * 版本单调性由 contract gate 测试断言（本文件提供注册表与比较工具）。
 */

export type MigrationVersion = `migration-${number}`
export type SchemaVersion = `schema-${number}`
export type FormatVersion = `format-${number}`
/** content 版本带内容标识（如 content-cet4-v2） */
export type ContentVersion = `content-${string}`
export type LicensePolicyVersion = `license-policy-${number}`

export type AnyVersion =
  | MigrationVersion
  | SchemaVersion
  | FormatVersion
  | ContentVersion
  | LicensePolicyVersion

/* ---------------- 构造器（受控入口；直接字符串字面量也可赋值，但 API 契约只收本类型） ---------------- */

export const migrationVersion = (n: number): MigrationVersion => `migration-${n}`
export const schemaVersion = (n: number): SchemaVersion => `schema-${n}`
export const formatVersion = (n: number): FormatVersion => `format-${n}`
export const contentVersion = (id: string): ContentVersion => `content-${id}`
export const licensePolicyVersion = (n: number): LicensePolicyVersion => `license-policy-${n}`

/* ---------------- 解析与比较 ---------------- */

export interface ParsedVersion {
  kind: 'migration' | 'schema' | 'format' | 'content' | 'license-policy'
  /** content 版本的 id 部分；数值类版本为 null */
  id: string | null
  /** 数值类版本的序号；content 版本为 null */
  num: number | null
  raw: string
}

const PREFIXES: Array<[ParsedVersion['kind'], string]> = [
  ['migration', 'migration-'],
  ['schema', 'schema-'],
  ['format', 'format-'],
  ['license-policy', 'license-policy-'],
  ['content', 'content-'],
]

/** 解析版本串；不匹配任何前缀模式 → null（content 前缀必须最后匹配，避免吞掉 license-policy） */
export function parseVersion(v: string): ParsedVersion | null {
  for (const [kind, prefix] of PREFIXES) {
    if (v.startsWith(prefix)) {
      const rest = v.slice(prefix.length)
      if (kind === 'content') return { kind, id: rest, num: null, raw: v }
      if (/^\d+$/.test(rest)) return { kind, id: null, num: Number(rest), raw: v }
      return null
    }
  }
  return null
}

/** 同 kind 数值版本单调比较：a < b → -1；a > b → 1；相等 → 0；kind 不同或非数值 → null */
export function compareVersions(a: AnyVersion, b: AnyVersion): -1 | 0 | 1 | null {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  if (!pa || !pb || pa.kind !== pb.kind || pa.num === null || pb.num === null) return null
  return pa.num < pb.num ? -1 : pa.num > pb.num ? 1 : 0
}

/** 断言注册表按 kind 分组后序号严格递增（contract gate 用；返回首个违例描述或 null） */
export function assertMonotonic(versions: readonly AnyVersion[]): string | null {
  const byKind = new Map<ParsedVersion['kind'], ParsedVersion[]>()
  for (const v of versions) {
    const p = parseVersion(v)
    if (!p) return `unparseable version: ${v}`
    if (p.num === null) continue
    const list = byKind.get(p.kind) ?? []
    const prev = list[list.length - 1]
    if (prev && prev.num !== null && p.num <= prev.num) {
      return `non-monotonic: ${prev.raw} → ${p.raw}`
    }
    list.push(p)
    byKind.set(p.kind, list)
  }
  return null
}
