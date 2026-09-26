/* V4.1-P0.6 · Content Snapshot —— 「用户学的到底是哪个实体的哪个快照」。
 *
 * 三者分工（V4.1 定版，务必守住）：
 *   ContentId                = **哪个**内容实体（4 段式，不随修订改变）
 *   contentVersion + checksum = 该实体的**哪个内容快照**（内容变了才变）
 *   Learning                 = 学到**什么程度**（Learning 层，不在这里）
 *
 * 为什么要把「修订号 / 契约版本 / 内容指纹」拆成三个数？
 *   旧模型里 contentVersion 是「checksum 变化就 +1」的单调计数器，它是**状态**而不是
 *   内容的确定性身份：把 words.json 回滚到上一版再 build，version 会白白 +1，
 *   于是「回滚后的内容」和「从未发布过的新内容」在版本号上无法区分。
 *
 *   revision —— 单调递增审计号：每次内容构建都 +1，**回滚也不回头**。只回答
 *               「这份包一共被构建过多少次」，不参与任何相等性判断。
 *   version  —— 对外学习契约版本：**同一 checksum 复用同一 version**。回滚后 checksum
 *               回到历史值，version 也随之回到历史值 —— 学习记录因此能认出
 *               「这是我学过的那个版本」。
 *   checksum —— 规范化内容的 canonical SHA-256：**内容的确定性身份**。
 *
 * ⚠️ 为什么 version 不能承担 checksum 的职责？
 *   version 是「对外契约号」，它的语义是「第几代」，天然可被两个不同内容共用
 *   （A 包第 3 代 与 B 包第 3 代 都是 3）。只有 checksum 能回答「这是不是同一份内容」。
 *   反过来，回滚场景里 version 只是回到历史值，真正识别「这是历史内容」的是 checksum：
 *   若仅比 version，一次「内容 X 的第 3 代」与「内容 Y 的第 3 代」会被误判为同一份。
 *   所以判断"同一个快照"必须 contentId + contentVersion + checksum **三者全等**。
 */

import { SCHEMA_VERSION } from './content'

/** 修订历史条目：一次内容构建的历史留痕（用于回滚时识别历史内容） */
export interface ContentRevisionEntry {
  /** 单调递增审计号：每次构建 +1，回滚不回头 */
  revision: number
  /** 该次构建对应的对外学习契约版本（同一 checksum 复用同一 version） */
  version: number
  /** 该次构建的规范化内容指纹 */
  checksum: string
  /** 该次构建的发布时间（ISO date） */
  publishedAt?: string
}

/** 内容的版本三元组 + 修订历史 */
export interface ContentVersionInfo {
  /** 单调递增审计号：每次内容构建都 +1（审计用，回滚也不回头） */
  revision: number
  /** 对外学习契约版本：同一 checksum 复用同一 version（回滚即回到历史 version） */
  version: number
  /** 规范化内容指纹（canonical SHA-256） */
  checksum: string
  /** 当前版本快照的发布时间（ISO date） */
  publishedAt?: string
  /** 修订历史：按 revision 升序，用于回滚时把 checksum 还原成 (revision, version) */
  history: ContentRevisionEntry[]
}

/** 内容快照：用户学习的到底是「哪个实体的哪个快照」—— 学习记录应指向它 */
export interface ContentSnapshot {
  /** ContentId：哪个实体 */
  contentId: string
  /** 对外学习契约版本：该实体的哪个内容快照 */
  contentVersion: number
  /** 规范化内容指纹：该快照的确定性身份 */
  checksum: string
  /** 结构版本：写入快照时刻的 schema 形状，便于跨 schema 迁移时判断是否需要迁移 */
  schemaVersion: number
  /** 该快照的发布时间（ISO date） */
  publishedAt?: string
}

/**
 * 由实体 id + 版本信息构造快照。
 * schemaVersion 省略时取当前常量 SCHEMA_VERSION（即"按当前结构理解这份快照"）。
 */
export function snapshotOf(
  contentId: string,
  v: { version: number; checksum: string; publishedAt?: string },
  schemaVersion: number = SCHEMA_VERSION,
): ContentSnapshot {
  return {
    contentId,
    contentVersion: v.version,
    checksum: v.checksum,
    schemaVersion,
    ...(v.publishedAt ? { publishedAt: v.publishedAt } : {}),
  }
}

/**
 * 两个快照是否同一份。
 *
 * ⚠️ 必须 contentId + contentVersion + checksum **三者全等**才算同一快照：
 *   - 只比 contentVersion：不同内容（不同实体）恰好同 version 时会误判为同一份；
 *   - 只比 checksum：checksum 只描述内容本身，无法区分「哪个实体」的这份内容，
 *     跨包同词（IELTS/CET 各有 abandon）时两份不同实体的内容可能共用指纹语义。
 * 任一侧缺失（null/undefined）即为不同 —— 宁可判"不同"触发重新学习，也不要误判"相同"跳过复习。
 */
export function isSameSnapshot(a?: ContentSnapshot | null, b?: ContentSnapshot | null): boolean {
  if (!a || !b) return false
  return (
    a.contentId === b.contentId && a.contentVersion === b.contentVersion && a.checksum === b.checksum
  )
}

/**
 * 在修订历史里按 checksum 反查该次构建的 (revision, version)。
 * 回滚场景用它回答「这份内容历史上是哪一代」；没找到返回 null（说明这是一份全新内容）。
 *
 * ⚠️ 口径必须与 `scripts/content/build.mjs` 的回滚逻辑**同源同口径**：
 *   构建器用 `[...prevHistory].reverse().find(...)` 取「history 中 revision 最大的匹配条目」，
 *   本函数因此也必须**倒序扫描**（从 history 末尾往前找），否则两边会给出不同的历史条目。
 *
 * 两条约定：
 *   - `contentHistory` 按 revision **升序**追加（末尾即最新一次构建）；
 *   - 同一 checksum 可出现多次（内容 X → 内容 Y → 回滚回 X，X 的条目会有两条），
 *     此时以**最近一次发布**（revision 最大的那条）为准。
 */
export function findRevision(
  history: ContentRevisionEntry[],
  checksum: string,
): ContentRevisionEntry | null {
  if (!checksum) return null
  const list = Array.isArray(history) ? history : []
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i]
    if (e?.checksum === checksum) return e
  }
  return null
}
