/**
 * P1.5 · 静默失败的统一上报（§3.4 问题 4 的三件套）
 *
 * 设计依据：`docs/audit-package/06-learning/P1.5-LEARNING-MODEL.md` §3.4 问题 4。
 *
 * 现状盘点（设计文档逐个核过行号）：5 个 v1 store 里有 4 处静默 `catch {}`
 * （`analytics.ts:48` / `memorizeStore.ts:37` / `streak.ts:38` / `App.tsx:81`），
 * 外加 `customBanks.ts:22` **完全没有 try/catch**（Quota 异常会抛到 React 渲染链路）。
 * 其中两个**必须让人知道**：
 *   - `memorizeStore.ts:37` —— 每次作答都写，静默失败 = 用户学了 100 个词而系统只记住 60 个，**用户完全无感**；
 *   - `customBanks.ts:22` —— 会抛异常，可能导致整页白屏。
 *
 * 本文件提供「console + 内存 ring buffer + 可选 gt.diag.v1 落盘」三件套，
 * **不引入任何后端**（项目零后端，见 EVIDENCE-INDEX §1）。
 *
 * ⚠️ 后记（G4-3 机器化时）：上面盘点的 4 处静默 catch 与 1 处无保护 setItem 已按
 *    「失败留痕、不改控制流」补齐 console.warn（见各文件 G4-3 注释）；v1 store 的
 *    结构性改造仍属 §3.5 S3–S6（冻结中）。本文件的 7 个 DiagCode 与三件套自此
 *    由 `learning/storage.ts` 真实消费（不再是死代码）。
 *
 * ⚠️ 循环依赖说明：`storage.ts` 会 import 本文件（写完失败要上报）。
 *    因此本文件**绝不能** import `storage.ts` —— 否则形成
 *    `storage.ts → diagnostics.ts → storage.ts` 的循环。所以本文件里
 *    写 `gt.diag.v1` 时**直接**用持久化通道落盘并吞掉自己的异常。
 *    这也是整个代码库里**唯一被设计文档允许的静默 catch**：观测者无法自我诊断，
 *    若 diag 自己的写入失败还要再写一条 diag，就是无限递归。
 */

import { diagnosticsChannel } from '../../core/persistence/channels'

/* ===========================================================================
 * §3.4 问题 4 —— DiagEntry
 * ========================================================================= */

/**
 * diag 条目：**结构化、可枚举 code、不含用户词形明文**。
 *
 * 为什么禁止自由文本 `message`：无法聚合。100 条「写入失败」的 message 若各不相同，
 * 就退化成日志；而 `code` 是可枚举的，能直接 `groupBy` 出「哪类失败最多」。
 *
 * 为什么禁止存用户词形：隐私。键名（`gt.review.v1`）是安全的，词形不是。
 */
export interface DiagEntry {
  /** 单调递增序号（ring buffer 定位用） */
  seq: number
  at: number
  /** 可枚举的 code（禁止自由文本 —— 否则无法聚合） */
  code: DiagCode
  /** 涉及的存储键（不是用户数据，是键名，安全） */
  key: string
  /** 计数类信息（丢了几个、占多少百分比） */
  count?: number
  percent?: number
  /** 原始错误的 name（如 'QuotaExceededError'），**不存 message、不存 stack** */
  errorName?: string
}

/** 可枚举的 diag code（§3.4 问题 4 的 7 个） */
export type DiagCode =
  | 'STORAGE_WRITE_FAILED'
  | 'STORAGE_READ_CORRUPT'
  | 'STORAGE_ENTRY_DROPPED' // decode 时丢了单条脏数据
  | 'QUOTA_EVICTED'
  | 'QUOTA_PRESSURE'
  | 'MIGRATION_WARNING'
  | 'MIGRATION_ABORTED'

/* ===========================================================================
 * §3.4 问题 4 —— 内存 ring buffer（默认容量 100，**不落盘**）
 * ========================================================================= */

/** ring buffer 容量（§3.4 问题 4 明确「默认容量 100」） */
const RING_CAPACITY = 100

/** 内部 store：`seq` 单调递增（跨 clear 也不重置，避免「同一个 seq 出现两次」） */
let seqCounter = 0
let buffer: DiagEntry[] = []

/** 内存 ring buffer 的当前内容（只读视图）。零成本、零隐私风险。 */
export function getDiagBuffer(): readonly DiagEntry[] {
  return buffer
}

/**
 * 记录一条 diag。自动补 `seq`（单调递增）与 `at`（`Date.now()`）。
 * 超出容量时**丢弃最旧的一条**（FIFO）。
 *
 * 本函数**永不抛异常** —— 它是所有失败路径的最后一道观测手段，
 * 自己抛异常会把「写失败」变成「崩渲染」。
 */
export function reportDiag(entry: Omit<DiagEntry, 'seq' | 'at'>): void {
  try {
    const full: DiagEntry = { seq: ++seqCounter, at: Date.now(), ...entry }
    buffer.push(full)
    if (buffer.length > RING_CAPACITY) {
      buffer = buffer.slice(buffer.length - RING_CAPACITY)
    }
    persistDiagIfEnabled(full)
  } catch {
    /* 观测者自身失败时静默 —— 唯一被允许的静默 catch（见文件头说明） */
  }
}

/** 清空 ring buffer（`seqCounter` **不重置**，保证 seq 全局单调） */
export function clearDiagBuffer(): void {
  buffer = []
}

/* ===========================================================================
 * §3.4 问题 4 —— 可选落盘 gt.diag.v1（**默认关闭**）
 * ========================================================================= */

/**
 * 可选落盘键（§3.4 问题 4）。
 *
 * 为什么默认关闭（设计文档的两条理由，逐字保留）：
 *   ① 隐私 —— 键名里不含词，但「用户在什么时间频繁写失败」本身就是行为数据；
 *   ② 体积 —— diag 落盘会与 Learning 争配额，而配额正是 diag 要观测的对象，
 *      这构成循环依赖（观测者与被观测者抢同一份资源）。
 */
export const KEY_DIAG = 'gt.diag.v1'

/** 落盘容量固定 50 条，超出 FIFO（§3.4 问题 4） */
const DIAG_PERSIST_CAPACITY = 50

let diagPersistenceEnabled = false

/** 仅当用户**显式开启**（设置页默认关闭）时写 `gt.diag.v1` */
export function setDiagPersistence(enabled: boolean): void {
  diagPersistenceEnabled = enabled
}

export function isDiagPersistenceEnabled(): boolean {
  return diagPersistenceEnabled
}

/**
 * 把一条 diag 追加到 `gt.diag.v1`（仅当显式开启）。
 *
 * ⚠️ 本函数**直接**经 `diagnosticsChannel` 落盘，不走 `storage.ts` —— 见文件头的循环依赖说明。
 *    且**任何写入失败都静默丢弃**：观测者不可能自我诊断（设计文档原文：
 *    「任何写入失败时静默丢弃（不可能自我诊断）」）。
 */
function persistDiagIfEnabled(entry: DiagEntry): void {
  if (!diagPersistenceEnabled) return
  try {
    // P1.7-W2C：原生读收口到 persistence 诊断通道。沿用原有降级语义 ——
    // 通道抛出的 NamespaceError 与存储不可用同样被下面的 catch 静默丢弃（观测者不自我诊断）。
    const raw = diagnosticsChannel.read(KEY_DIAG)
    let list: DiagEntry[] = []
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw)
        if (Array.isArray(parsed)) list = parsed as DiagEntry[]
      } catch {
        // 落盘的 diag 自身损坏：直接重置（不报告 —— 报告会递归）
        list = []
      }
    }
    list.push(entry)
    if (list.length > DIAG_PERSIST_CAPACITY) list = list.slice(list.length - DIAG_PERSIST_CAPACITY)
    diagnosticsChannel.write(KEY_DIAG, JSON.stringify(list))
  } catch {
    /* 静默丢弃（设计文档明确允许）：观测者不能自我诊断 */
  }
}

/** 读取落盘的 diag（供设置页「导出诊断信息」使用） */
export function loadPersistedDiag(): DiagEntry[] {
  try {
    // P1.7-W2C：同 persistDiagIfEnabled —— 沿用原有降级语义（读不到即空列表）。
    const raw = diagnosticsChannel.read(KEY_DIAG)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as DiagEntry[]) : []
  } catch {
    return []
  }
}

/* ===========================================================================
 * §3.4 问题 1 —— onSaveFailure 订阅（「默认就上报」）
 * ========================================================================= */

/** 写入失败事件（§3.4 问题 1 的 ② 全局订阅） */
export interface SaveFailureEvent {
  key: string
  result: SaveResultLike
  at: number
}

/**
 * `SaveResultLike` —— 结构性最小契约。
 *
 * 为什么不用 `storage.ts` 的 `SaveResult`：会形成循环（`storage.ts` → 本文件 → `storage.ts`）。
 * 用结构类型（鸭子类型）描述本文件**真正用到的字段**，既避免循环又保持类型安全：
 * `storage.ts` 的 `SaveResult` 天然满足它。
 */
export interface SaveResultLike {
  ok: boolean
  evicted: number
  reason: 'quota' | 'serialize' | 'unavailable' | 'other' | null
  error?: unknown
}

type SaveFailureListener = (e: SaveFailureEvent) => void

const saveFailureListeners = new Set<SaveFailureListener>()

/**
 * 订阅写入失败事件。返回**退订函数**。
 *
 * 为什么不做「回调参数」（§3.4 问题 1 排除的方案）：回调需要每个调用点都传，
 * 而调用点分散在 6 个文件 11 处。要求每处都传 = **必然有人忘**。
 * 改为「save() 返回 SaveResult + persistence 层**无条件**触发本事件」，
 * 把「必须记得处理」变成「默认就上报」。
 */
export function onSaveFailure(cb: SaveFailureListener): () => void {
  saveFailureListeners.add(cb)
  return () => {
    saveFailureListeners.delete(cb)
  }
}

/**
 * 触发写入失败事件（**无条件**，由写入层调用）。
 * 监听器自身的异常被隔离 —— 一个 UI 订阅者崩了不能影响其它订阅者与写入流程。
 */
export function emitSaveFailure(key: string, result: SaveResultLike): void {
  const event: SaveFailureEvent = { key, result, at: Date.now() }
  for (const cb of saveFailureListeners) {
    try {
      cb(event)
    } catch {
      /* 订阅者自身的异常隔离 */
    }
  }
}

/**
 * 由未知异常抽取安全的错误名（**不取 message、不取 stack** —— 见 DiagEntry 的隐私约束）。
 */
export function errorNameOf(e: unknown): string | undefined {
  if (!e || typeof e !== 'object') return undefined
  const name = (e as { name?: unknown }).name
  return typeof name === 'string' && name ? name : undefined
}

/**
 * 判断一个异常是否是 Quota 类错误（与 `reviewStore.ts:54-57` 同口径）。
 *
 * `QuotaExceededError` 是标准名；`NS_ERROR_DOM_QUOTA_REACHED` 是 Firefox 的历史名。
 * 两者之外一律不算 quota —— 因为**只有 quota 可以熔断清洗**，其它错误清洗也没用
 * （§3.2 的 `reason` 字段注释：「'quota' 与 'other' 必须区分 —— 前者可熔断，后者不可」）。
 */
export function isQuotaError(e: unknown): boolean {
  const name = errorNameOf(e)
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED'
}

/* ===========================================================================
 * §3.4 问题 2 —— Quota 可观测（G4-4）
 * ========================================================================= */

/**
 * 保守配额口径：5 MiB（§2.9 同款）。
 *
 * 为什么不用 `navigator.storage.estimate()`：它是异步的、且各浏览器给出的数字
 * 差异极大（Chrome 给整个 origin 的配额而不是本机存储的）。本机存储
 * 的行业保守口径一直是 ~5 MiB，用它算百分比**只会高估占用**（提前告警），
 * 不会漏报 —— 对观测来说是安全的方向。
 */
export const QUOTA_CONSERVATIVE_BYTES = 5 * 1024 * 1024

/** 占用告警阈值（G4-4 判据：70%） */
export const QUOTA_WARN_PERCENT = 70

export interface QuotaSnapshot {
  /** 每个 `gt.*` 键的 UTF-16 字节（与 storage.diagnostics 同口径：字符数 ×2） */
  perKeyBytes: Record<string, number>
  /** `gt.*` 键总字节 */
  totalGtBytes: number
  /** 配额口径（恒为 QUOTA_CONSERVATIVE_BYTES） */
  quotaBytes: number
  /** 占用百分比（0~100+） */
  percent: number
}

/** 遍历本机存储的 `gt.*` 键算占用。存储不可用时返回零快照（不抛）。 */
export function snapshotQuota(): QuotaSnapshot {
  const perKeyBytes: Record<string, number> = {}
  let totalGtBytes = 0
  try {
    // P1.7-W2C：全量枚举收口到诊断通道的 allKeys()（唯一被授权的全量枚举通道，
    // 见 channel.ts 的 ALL_KEYS_LABEL）；沿用原有降级语义 —— 存储不可用时空快照、不抛。
    // 未注册的 gt.* 键经通道读取会被判红（NamespaceError）：这里**逐键跳过**而不是让异常
    // 冲掉整轮循环 —— 否则一个来历不明的 gt.* 键会让后面所有键都统计不到（半截快照）。
    for (const k of diagnosticsChannel.allKeys()) {
      if (!k || !k.startsWith('gt.')) continue
      let raw: string | null
      try {
        raw = diagnosticsChannel.read(k)
      } catch {
        continue // 未注册键：不经通道读不到，少算一条好过整轮截断
      }
      const bytes = raw === null ? 0 : raw.length * 2
      perKeyBytes[k] = bytes
      totalGtBytes += bytes
    }
  } catch {
    /* 存储不可用：空快照即可，观测者自身不可抛 */
  }
  const percent = totalGtBytes === 0 ? 0 : (totalGtBytes / QUOTA_CONSERVATIVE_BYTES) * 100
  return { perKeyBytes, totalGtBytes, quotaBytes: QUOTA_CONSERVATIVE_BYTES, percent }
}

export interface QuotaPressureEvent {
  percent: number
  totalGtBytes: number
  quotaBytes: number
}

type QuotaPressureListener = (e: QuotaPressureEvent) => void

const quotaPressureListeners = new Set<QuotaPressureListener>()

/** 订阅配额压力事件（≥70% 上升沿触发一次，降回阈值下再升会重新触发）。返回退订函数。 */
export function onQuotaPressure(cb: QuotaPressureListener): () => void {
  quotaPressureListeners.add(cb)
  return () => {
    quotaPressureListeners.delete(cb)
  }
}

/**
 * 滞回闩：只在「从 <70% 跨到 ≥70%」的**上升沿**发事件。
 * 没有滞回的话，超阈值期间每次保存都会发一条事件 + diag —— 告警变成噪音。
 */
let pressureLatched = false

/**
 * 检查当前占用是否达到告警阈值；达到则 reportDiag(QUOTA_PRESSURE) + 触发订阅者。
 * 返回「本次调用是否真的触发了事件」（上升沿语义，见 pressureLatched）。
 */
export function checkQuotaPressure(snap: QuotaSnapshot = snapshotQuota()): boolean {
  const over = snap.percent >= QUOTA_WARN_PERCENT
  if (!over) {
    pressureLatched = false
    return false
  }
  if (pressureLatched) return false
  pressureLatched = true
  reportDiag({
    code: 'QUOTA_PRESSURE',
    key: '*',
    count: snap.totalGtBytes,
    percent: Math.round(snap.percent * 100) / 100,
  })
  const event: QuotaPressureEvent = {
    percent: snap.percent,
    totalGtBytes: snap.totalGtBytes,
    quotaBytes: snap.quotaBytes,
  }
  for (const cb of quotaPressureListeners) {
    try {
      cb(event)
    } catch {
      /* 订阅者自身的异常隔离（与 emitSaveFailure 同口径） */
    }
  }
  return true
}
