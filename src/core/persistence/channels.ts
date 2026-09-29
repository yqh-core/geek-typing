/* P1.7 Wave 2-C · Persistence Boundary —— 具名通道清单（最小授权）
 *
 * 迁移批次 ②③ 的接线台账：8 个业务文件各自只能拿到**它真正需要的那一个域**。
 * 通道与消费方一一对应，`scripts/gate-persistence.mjs` 保证 `src/` 下再无第二条
 * 直连原生存储的路径（唯一豁免 = `src/core/persistence/**`）。
 *
 * 最小授权表（改这里之前先想清楚为什么这个模块需要碰别人的域）：
 *   legacyStoreChannel  → learning  ：reviewStore / memorizeStore / streak 的三个 v1 键
 *   analyticsChannel    → analytics ：analytics.ts 的 gt.analytics.v1
 *   contentChannel      → content   ：customBanks.ts 的 gt.customBanks.v1
 *   settingsChannel     → settings  ：useSettings / i18n / speech 的偏好键
 *   diagnosticsChannel  → diagnostics（唯一允许 allKeys）　：learning/diagnostics.ts
 */

import { createChannel } from './channel'

/** 三个 legacy v1 store（review / memorize / streak）的读写入口 */
export const legacyStoreChannel = createChannel('legacyStore', ['learning'])

/** 打字统计（gt.analytics.v1） */
export const analyticsChannel = createChannel('analytics', ['analytics'])

/** 用户自建词库（gt.customBanks.v1） */
export const contentChannel = createChannel('content', ['content'])

/** 偏好设置类键（gt.bank / gt.theme / gt.sound / … / gt.lang / gt.voice） */
export const settingsChannel = createChannel('settings', ['settings'])

/**
 * 诊断通道（gt.diag.v1 + 配额快照）。
 *
 * ⚠️ 两个「唯一」，都由 G4-4 配额观测的真实需求倒逼，不是随手放宽：
 *   ① 唯一持有 `allKeys()` —— 配额快照要遍历全量 `gt.*` 键；
 *   ② 唯一被授权**跨域读** —— 遍历之后还要逐个读出原始串才能算 UTF-16 字节，
 *      只枚举不读出来的快照是假的（learning-storage 套件 E 段：totalGtBytes 必须等于
 *      gt.learning.v2 + gt.totals.v1 之和，跨域读不通会直接判红）。
 *
 * 最小授权在这里的落点是「跨域读只给诊断这一个通道」：其余四个通道仍是**单域**，
 * 业务模块拿不到观测能力。写入侧实际只写 gt.diag.v1 —— diagnostics.ts 是本通道的
 * 唯一消费方（接线台账见 gate-persistence 豁免清单 + 本文件头部注释）。
 */
export const diagnosticsChannel = createChannel(
  'diagnostics',
  ['diagnostics', 'learning', 'analytics', 'content', 'settings', 'migration'],
  { allKeys: true },
)
