/* P1.7 Wave 2-B · 职责域：启动迁移（S4 硬耦合：首屏渲染前完成或明确放弃） */
import { runStartupMigration } from '../../../lib/learning/upgrade'

export function startupMigration(): Promise<import('../../../lib/learning/upgrade').UpgradeOutcome> {
  return runStartupMigration()
}
