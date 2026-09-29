/* P1.6-A · LearningService —— 学习层业务门面（UI 唯一允许直接访问的学习入口）
 *
 * 设计依据：用户 P1.6 设计目标 L1 / L2 / L3 / L4。
 *   - L1  UI 不直接访问底层存储键族（storage 细节封装在 lib/learning 内部）
 *   - L2  UI 不直接访问 Legacy Store 的写 API（reviewStore / memorizeStore / analytics）
 *   - L3  LearningService 成为唯一业务入口
 *   - L4  Learning v2 成为唯一 State B 事实源
 *
 * P1.7-W2B 拆分（Service Split）：268 行单体门面按职责域拆到 `./domains/*`，
 * 本文件只做**聚合与再导出**——函数体逐字搬移、行为零改动，既有 import 路径与
 * `learningService` 单例全部保持兼容（既有调用方无需改动）。
 *
 * 职责域划分（10 域）：
 *   state / memorize / review / insights / analytics / practice / attribution /
 *   weakness / upgrade /（persistence 接线见 ./storage-io）
 *
 * ⚠️ 各域模块只做编排：内部调用既有的 lib/learning 写函数，不引入任何新的
 * 存储键、不重复写逻辑；learning 键族的原生读写自 W2B 起经
 * `./storage-io` → persistence Repository（namespace 注册校验 + owner 域匹配）。
 */
import { getState, type LearningState } from './domains/state'
import { getMemorizeView, getMemorizeStats } from './domains/memorize'
import {
  getReviewItems,
  getDueItems,
  getReviewDueCount,
  getReviewTotalCount,
  getReviewDueViews,
  getReviewItemViews,
  recordReview,
} from './domains/review'
import { getMastery, getDuePartition, getMasteryDistribution } from './domains/insights'
import {
  getAnalytics,
  applyWordDone,
  applyKey,
  persistAnalytics,
  freshAnalytics,
  getWeakLetters,
} from './domains/analytics'
import { recordPractice, recordWordDoneV2 } from './domains/practice'
import { resolveContentId } from './domains/attribution'
import { rankByWeakness } from './domains/weakness'
import { startupMigration } from './domains/upgrade'

export type { LearningState }
export type { MemStore } from '../../lib/memorizeStore'
export type { Analytics } from '../../lib/analytics'

export {
  getState,
  getMemorizeView,
  getMemorizeStats,
  getReviewItems,
  getDueItems,
  getReviewDueCount,
  getReviewTotalCount,
  getReviewDueViews,
  getReviewItemViews,
  getMastery,
  getDuePartition,
  getMasteryDistribution,
  getAnalytics,
  applyWordDone,
  applyKey,
  persistAnalytics,
  freshAnalytics,
  getWeakLetters,
  recordReview,
  recordPractice,
  recordWordDoneV2,
  resolveContentId,
  rankByWeakness,
  startupMigration,
}

/** 门面单例：UI 一律 import { learningService } from '.../learning/service' */
export const learningService = {
  getState,
  getMemorizeView,
  getMemorizeStats,
  getReviewItems,
  getDueItems,
  getMastery,
  getDuePartition,
  getReviewDueCount,
  getReviewTotalCount,
  getReviewDueViews,
  getReviewItemViews,
  getMasteryDistribution,
  startupMigration,
  getAnalytics,
  applyWordDone,
  applyKey,
  persistAnalytics,
  freshAnalytics,
  getWeakLetters,
  recordReview,
  recordPractice,
  recordWordDoneV2,
  resolveContentId,
  rankByWeakness,
}
