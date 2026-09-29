/* P1.7 Wave 1-C · Recovery Decision Function（v2.3.2 §5 / §19-1）
 *
 * 数学修正后穷举空间：MIGRATION_PHASES(5) × OLD_STATES(3) × NEW_STATES(4) = 60（非 72）。
 * 决策必须 total：任何组合永不返回 undefined（§19-1）。
 *
 * 分层决策（冻结文本）：
 *   1. corrupt（OLD 或 NEW）→ CORRUPT_STATE 终端规则（优先级最高，压过显式行）；
 *   2. 命中显式规则表（complete/missing 与各 phase 的 8 核心行）→ 显式 RecoveryAction；
 *   3. 其余 → MANUAL_REVIEW（终端兜底，永不静默）。
 *
 * 与 W1B fence journal 的关系：MIGRATION_PHASES 是迁移 journal 的相位机（§2 恰 5 个）；
 * W1B FencePhase 的 'committing'（marker 已授予、同步切换窗口）在 journal 上记为
 * 'verified' + fence marker 存在 —— REDO 重放由 W1B guard.redoSwitch 执行，
 * 本函数的 COMMIT 行为执行器入口（执行器见 marker 后走 replay）。
 *
 * 注：v2.3.1 全文已被 v2.3.2 取代（指针文件），8 核心行在本冻结结构约束下重新推导，
 * 随本 Wave 代码交付审查（冻结协议：审查对象 = 代码 + 测试 + Evidence）。
 */

/** 迁移 journal 相位（§2 状态机，恰 5 个；穷举测试从本枚举自动取得） */
export const MIGRATION_PHASES = ['pending', 'running', 'verified', 'committed', 'failed'] as const
export type MigrationPhase = (typeof MIGRATION_PHASES)[number]

/** 迁移前（旧键）数据状态 */
export const OLD_STATES = ['missing', 'complete', 'corrupt'] as const
export type OldState = (typeof OLD_STATES)[number]

/** 迁移后（新键）数据状态 */
export const NEW_STATES = ['missing', 'partial', 'complete', 'corrupt'] as const
export type NewState = (typeof NEW_STATES)[number]

/** 恢复动作（执行器语义见各行注释） */
export type RecoveryAction =
  | 'RUN' // 开始迁移：旧数据完整、新数据不存在
  | 'RESUME' // 续走流水线（staging 中断、localStorage 未动）
  | 'COMMIT' // staging 已验证，进入 commit 请求（marker 存在时由执行器转 replay）
  | 'CLEANUP_OLD' // 切换已完成，REMOVE OLD 待执行
  | 'COMPLETE' // 一切就绪，journal 收口
  | 'RERUN' // 清 staging 从头重跑（失败路径旧数据完整）
  | 'CORRUPT_STATE' // 终端：旧或新数据损坏，禁止静默处理
  | 'MANUAL_REVIEW' // 终端兜底：永不静默

/* ---------------- 显式规则表（8 核心行：old/new ∈ {complete, missing}） ---------------- */

interface RuleRow {
  phase: MigrationPhase
  old: 'missing' | 'complete'
  new: 'missing' | 'complete'
  action: RecoveryAction
}

export const CORE_RULES: readonly RuleRow[] = [
  // 1. 未开始 + 旧完整 + 新缺失 → 正常起点，开始迁移
  { phase: 'pending', old: 'complete', new: 'missing', action: 'RUN' },
  // 2. 未开始 + 旧缺失 + 新缺失 → 无数据无迁移，无事可做
  { phase: 'pending', old: 'missing', new: 'missing', action: 'COMPLETE' },
  // 3. running（staging 中）+ 旧完整 + 新缺失 → localStorage 未动，续走流水线
  { phase: 'running', old: 'complete', new: 'missing', action: 'RESUME' },
  // 4. verified（staging 已验证）+ 旧完整 + 新缺失 → 授予 commit（marker 已有则 replay）
  { phase: 'verified', old: 'complete', new: 'missing', action: 'COMMIT' },
  // 5. committed + 旧完整 + 新完整 → 切换已完成，REMOVE OLD 待执行
  { phase: 'committed', old: 'complete', new: 'complete', action: 'CLEANUP_OLD' },
  // 6. committed + 旧缺失 + 新完整 → 全部完成
  { phase: 'committed', old: 'missing', new: 'complete', action: 'COMPLETE' },
  // 7. failed + 旧完整 + 新缺失 → 失败路径旧数据永存（§19-5），清 staging 重跑
  { phase: 'failed', old: 'complete', new: 'missing', action: 'RERUN' },
  // 8. failed + 旧缺失 + 新完整 → 异常但自洽（新数据完整可用），收口
  { phase: 'failed', old: 'missing', new: 'complete', action: 'COMPLETE' },
]

export interface RecoveryInput {
  phase: MigrationPhase
  oldState: OldState
  newState: NewState
}

export interface RecoveryDecision extends RecoveryInput {
  action: RecoveryAction
  /** 决策来源：corrupt 终端 / 显式核心行 / MANUAL_REVIEW 兜底 */
  via: 'corrupt-terminal' | 'core-rule' | 'manual-fallback'
}

/** total 决策函数：60 组合穷举永不 undefined（§19-1） */
export function decideRecovery(phase: MigrationPhase, oldState: OldState, newState: NewState): RecoveryDecision {
  const input = { phase, oldState, newState }
  // 层 1：corrupt 终端（优先级最高）
  if (oldState === 'corrupt' || newState === 'corrupt') {
    return { ...input, action: 'CORRUPT_STATE', via: 'corrupt-terminal' }
  }
  // 层 2：显式核心行
  const hit = CORE_RULES.find((r) => r.phase === phase && r.old === oldState && r.new === newState)
  if (hit) return { ...input, action: hit.action, via: 'core-rule' }
  // 层 3：兜底（含全部 partial 组合与剩余 complete/missing 组合）
  return { ...input, action: 'MANUAL_REVIEW', via: 'manual-fallback' }
}
