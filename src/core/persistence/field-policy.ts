/* P1.7 Wave 1-C · Field Compatibility Policy（v2.3.2 §8）
 *
 * 决策算法（有序，机器可执行，冻结）：
 *   1. resolve rule by path —— 未命中 → FAIL（no rule → FAIL，新增字段禁止静默通过）
 *   2. compare(source, target, comparator) —— comparator 缺省 = exact-deep-equal
 *   3. exact match → PASS
 *   4. mismatch + TRANSFORM_ALLOWED + 已注册 transformer → TRANSFORM → 回到 2
 *   5. mismatch + OPTIONAL_PRESERVE → PASS，仅当「缺失」被该字段规则显式允许
 *   6. mismatch + DROP_ALLOWED → PASS，仅当字段被显式移除（target 无此键）
 *   7. mismatch + REQUIRED_PRESERVE 或 DROP_FORBIDDEN → FAIL
 *   8. TRANSFORM_ALLOWED 但 transformer 缺失/未注册 → FAIL
 */

export type FieldPolicy =
  | 'REQUIRED_PRESERVE' // 必须保留且值不变
  | 'OPTIONAL_PRESERVE' // 允许单侧缺失；双侧存在则必须相等
  | 'TRANSFORM_ALLOWED' // 允许经注册 transformer 转换
  | 'DROP_ALLOWED' // 允许显式移除（target 无此键）
  | 'DROP_FORBIDDEN' // 禁止移除（存在性或值变化均 FAIL）

export interface FieldCompatibilityRule {
  path: string
  policy: FieldPolicy
  /** comparator id（注册表解析）；缺省 exact-deep-equal */
  comparator?: string
  /** transformer id（注册表解析）；TRANSFORM_ALLOWED 时必填否则步骤 8 FAIL */
  transformer?: string
}

export type CompareFn = (source: unknown, target: unknown) => boolean
export type TransformFn = (source: unknown) => unknown

export interface TransformRegistry {
  comparators?: Record<string, CompareFn>
  transformers?: Record<string, TransformFn>
}

export type FieldDecision =
  | { status: 'PASS'; path: string; value: unknown; via: 'exact' | 'optional-missing' | 'dropped' | 'transformed' }
  | { status: 'FAIL'; path: string; reason: string; via: 'no-rule' | 'mismatch' | 'transform-loop' | 'transformer-missing' }

/** 缺省 comparator：exact deep equal（键序无关） */
export function exactDeepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b || a === null || b === null) return false
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => exactDeepEqual(v, b[i]))
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a as object).sort()
    const kb = Object.keys(b as object).sort()
    if (ka.length !== kb.length || !ka.every((k, i) => k === kb[i])) return false
    return ka.every((k) => exactDeepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
  }
  return false
}

const MISSING = Symbol('field-policy:missing')
/** 缺失哨兵（导出：调用方构造「源/目标无此键」时必须用同一 symbol 实例） */
export const FIELD_MISSING = MISSING

/** 单字段决策（§8 八步算法；transform 最多回环 8 次，超限 FAIL transform-loop） */
export function decideField(
  source: unknown, // MISSING = source 无此键
  target: unknown, // MISSING = target 无此键
  rule: FieldCompatibilityRule | undefined,
  registry: TransformRegistry = {},
): FieldDecision {
  const path = rule?.path ?? '<unresolved>'
  // 步骤 1：no rule → FAIL（新增字段禁止静默通过）
  if (!rule) return { status: 'FAIL', path, reason: 'no-rule: 未登记 FieldCompatibilityRule 的字段变化默认 FAIL', via: 'no-rule' }
  const compare = rule.comparator
    ? (registry.comparators?.[rule.comparator] ?? null)
    : exactDeepEqual
  if (rule.comparator && !compare) {
    return { status: 'FAIL', path, reason: `comparator 未注册: ${rule.comparator}`, via: 'transformer-missing' }
  }
  const cmp = compare as CompareFn

  let cur = source
  let iterations = 0
  for (;;) {
    // 步骤 2
    const srcMissing = cur === MISSING
    const tgtMissing = target === MISSING
    if (!srcMissing && !tgtMissing && cmp(cur, target)) {
      // 步骤 3：exact match
      return { status: 'PASS', path, value: cur, via: iterations > 0 ? 'transformed' : 'exact' }
    }
    // 缺失组合先于策略判定处理（步骤 5/6 的「缺失」语义）
    if (srcMissing !== tgtMissing) {
      // 恰一侧缺失
      if (rule.policy === 'OPTIONAL_PRESERVE') {
        return { status: 'PASS', path, value: tgtMissing ? cur : target, via: 'optional-missing' } // 步骤 5
      }
      if (rule.policy === 'DROP_ALLOWED' && tgtMissing) {
        return { status: 'PASS', path, value: undefined, via: 'dropped' } // 步骤 6：target 无此键 = 显式移除
      }
      if (rule.policy === 'TRANSFORM_ALLOWED' && srcMissing && !tgtMissing) {
        // source 缺失、target 存在：无输入可变换 → 视为 FAIL（不可凭空 transform）
        return { status: 'FAIL', path, reason: 'transform 无输入：source 缺失而 target 存在', via: 'mismatch' }
      }
      return {
        status: 'FAIL',
        path,
        reason: `policy=${rule.policy} 不允许该缺失形态（source ${srcMissing ? '缺' : '在'} / target ${tgtMissing ? '缺' : '在'}）`,
        via: 'mismatch',
      }
    }
    // 双侧缺失：无内容可比，视为 exact（键均不存在）
    if (srcMissing && tgtMissing) {
      return { status: 'PASS', path, value: undefined, via: 'exact' }
    }
    // 双侧存在但不匹配
    if (rule.policy === 'TRANSFORM_ALLOWED') {
      // 步骤 8 前置检查：transformer 必须已注册
      const t = rule.transformer ? registry.transformers?.[rule.transformer] : undefined
      if (!t) {
        return { status: 'FAIL', path, reason: `TRANSFORM_ALLOWED 但 transformer 缺失/未注册: ${rule.transformer ?? '<none>'}`, via: 'transformer-missing' }
      }
      if (++iterations > 8) {
        return { status: 'FAIL', path, reason: 'transform 回环超过 8 次未收敛', via: 'transform-loop' }
      }
      cur = t(cur) // 步骤 4：变换后回到比较
      continue
    }
    if (rule.policy === 'REQUIRED_PRESERVE' || rule.policy === 'DROP_FORBIDDEN' || rule.policy === 'OPTIONAL_PRESERVE' || rule.policy === 'DROP_ALLOWED') {
      // 步骤 7 + 双侧存在时 5/6 的等值要求
      return { status: 'FAIL', path, reason: `policy=${rule.policy} 双侧存在且不相等`, via: 'mismatch' }
    }
  }
}

/** 全字段决策：按 target 键集 ∪ source 键集逐字段跑 decideField（每个键都必须有规则） */
export function decideFields(
  source: Record<string, unknown>,
  target: Record<string, unknown>,
  rules: readonly FieldCompatibilityRule[],
  registry: TransformRegistry = {},
): { ok: boolean; decisions: FieldDecision[] } {
  const ruleByPath = new Map(rules.map((r) => [r.path, r]))
  const paths = [...new Set([...Object.keys(source), ...Object.keys(target)])].sort()
  const decisions = paths.map((p) => {
    const s = p in source ? source[p] : MISSING
    const t = p in target ? target[p] : MISSING
    return decideField(s, t, ruleByPath.get(p), registry)
  })
  return { ok: decisions.every((d) => d.status === 'PASS'), decisions }
}
