/* P1.7 Wave 1-C · R5 数据不变量验收（v2.3.2 §9）
 *
 * R5 = 迁移的数据不变量验收器，跑在 staging 上（VERIFY 阶段），Wave 1 出口证据。
 * 五零 + identity set 集合相等（set 相等而非仅 size 相等，防 A,B,C → A,B,D）。
 */

export interface R5Record {
  id: string
  refs?: string[] // 该记录引用的其他记录 id
  requiredRelations?: string[] // 必须非空的关系字段名（值取自 record 的 relations 对象）
  relations?: Record<string, string | null>
  enums?: Record<string, string> // 枚举字段名 → 值
}

export interface R5Spec {
  /** 枚举字段合法值集；记录的 enums 键必须在此集内 */
  validEnums?: Record<string, readonly string[]>
  /** 允许在迁移中显式丢失的 before id（如 deprecated 内容）；其余丢失 = unexpectedLoss */
  allowedLoss?: readonly string[]
}

export interface R5Result {
  /** 五零全过 + identity set 相等 */
  ok: boolean
  counts: {
    duplicateCount: number
    danglingReferenceCount: number
    brokenRequiredRelationCount: number
    invalidEnumCount: number
    unexpectedLossCount: number
  }
  identitySetEqual: boolean
  /** 集合差异明细（∅ = 相等） */
  identityDiff: { lost: string[]; gained: string[] }
  issues: string[]
}

/** 集合相等（元素级，非仅 size） */
export function setEqual(a: readonly string[], b: readonly string[]): boolean {
  const sa = new Set(a)
  const sb = new Set(b)
  if (sa.size !== sb.size) return false
  for (const x of sa) if (!sb.has(x)) return false
  return true
}

/** R5 检查（纯函数；before/after 均为记录数组） */
export function r5Check(before: readonly R5Record[], after: readonly R5Record[], spec: R5Spec = {}): R5Result {
  const issues: string[] = []
  const counts = {
    duplicateCount: 0,
    danglingReferenceCount: 0,
    brokenRequiredRelationCount: 0,
    invalidEnumCount: 0,
    unexpectedLossCount: 0,
  }

  // identity set 集合相等（§9）
  const beforeIds = before.map((r) => r.id)
  const afterIds = after.map((r) => r.id)
  const afterSet = new Set(afterIds)
  const lost = beforeIds.filter((id) => !afterSet.has(id) && !(spec.allowedLoss ?? []).includes(id))
  const gained = afterIds.filter((id) => !new Set(beforeIds).has(id))
  const identitySetEqual = setEqual(
    beforeIds.filter((id) => !(spec.allowedLoss ?? []).includes(id)),
    afterIds,
  )
  if (!identitySetEqual) issues.push(`identity set 不相等: lost=${lost.join(',')} gained=${gained.join(',')}`)

  // 五零
  const seen = new Set<string>()
  for (const r of after) {
    if (seen.has(r.id)) {
      counts.duplicateCount++
      issues.push(`duplicate id: ${r.id}`)
    }
    seen.add(r.id)
  }
  for (const r of after) {
    for (const ref of r.refs ?? []) {
      if (!afterSet.has(ref)) {
        counts.danglingReferenceCount++
        issues.push(`dangling reference: ${r.id} → ${ref}`)
      }
    }
    for (const rel of r.requiredRelations ?? []) {
      const v = r.relations?.[rel]
      if (v === undefined || v === null || v === '') {
        counts.brokenRequiredRelationCount++
        issues.push(`broken required relation: ${r.id}.${rel}`)
      }
    }
    for (const [field, value] of Object.entries(r.enums ?? {})) {
      const valid = spec.validEnums?.[field]
      if (!valid || !valid.includes(value)) {
        counts.invalidEnumCount++
        issues.push(`invalid enum: ${r.id}.${field}=${value}`)
      }
    }
  }
  for (const id of lost) {
    counts.unexpectedLossCount++
    issues.push(`unexpected loss: ${id}`)
  }

  const zeroViolations =
    counts.duplicateCount === 0 &&
    counts.danglingReferenceCount === 0 &&
    counts.brokenRequiredRelationCount === 0 &&
    counts.invalidEnumCount === 0 &&
    counts.unexpectedLossCount === 0

  return { ok: zeroViolations && identitySetEqual, counts, identitySetEqual, identityDiff: { lost, gained }, issues }
}
