/* P1.7 Wave 2-C · Persistence Boundary —— 通用域通道工厂（迁移批次 ②③ 底座）
 *
 * 目的：`src/core/learning/storage-io.ts`（W2B）证明了「业务模块经一条带授权的通道访问
 * 持久化层」这条路走得通，但它是 learning 域专用的。迁移批次 ②③ 还剩 8 个业务文件
 * 直连原生存储，逐个照抄一份 storage-io 会出现「一套语义 N 份实现」——审计时无法判定
 * 各处的降级口径是否一致。本文件把这套语义抽成工厂，业务侧只拿具名通道（见 channels.ts）。
 *
 * 与 W2B `storage-io` 同源的三条语义（**照抄，不各搞一套**）：
 *   1. 路由：`resolveKey(key).owner` 决定走哪个 `KeyFamilyRepository`，而不是按调用方身份猜；
 *   2. 授权：owner 不在通道 allowlist → `NamespaceError`，**读与写一视同仁**
 *      （只管写不管读会出现「写不进去但读得到」的半边界，接线正确性无法证明）；
 *   3. 错误分层：`NamespaceError`（未注册 / 越界域）**原样抛出不静默**；
 *      存储不可用（隐私模式 SecurityError 等环境问题）在 `read` 降级为 `null`。
 *
 * 只提供 `read/write` 这类**原始字符串**语义（底层走 `getRaw/setRaw`，不经 codec），
 * 因此存量数据格式与改造前逐字节一致。
 */

import { LocalStorageAdapter, type StorageAdapter } from './adapter'
import { KeyFamilyRepository } from './repository'
import { resolveKey, NamespaceError, type KeyOwner } from './namespace'

export interface StorageChannel {
  /** 原始字符串读取；未注册 / 越界域 → NamespaceError（不静默）；存储不可用 → null */
  read(key: string): string | null
  /** 原始字符串写入；未注册 / 跨域 → NamespaceError（判红，不静默） */
  write(key: string, raw: string): void
  /** 删除键（与写入同约束） */
  remove(key: string): void
  has(key: string): boolean
  /** 本通道 allowlist 域下的键 */
  keys(): string[]
  /** 全量键枚举 —— 仅诊断域通道可用，其余通道调用即判红（见 ALL_KEYS_OWNER） */
  allKeys(): string[]
}

let adapter: StorageAdapter = new LocalStorageAdapter()
const repoCache = new Map<KeyOwner, KeyFamilyRepository>()

/** 注入存储实现（测试 / 演练用；生产默认 LocalStorageAdapter） */
export function setChannelAdapter(a: StorageAdapter): void {
  adapter = a
  repoCache.clear()
}

/**
 * **全量枚举的唯一合法通道 = 诊断通道。**
 *
 * `allKeys()` 会越过 owner 边界读出整个 origin 的键名（含第三方键），是本次边界收口里
 * 唯一的「破界」能力；只有诊断/审计（配额快照要遍历 `gt.*` 全量算占用）有正当理由持有它。
 * 开关由 `opts.allKeys` 申请、由 `label` 校验：非诊断通道就算手滑传 true 也拿不到
 * （构造期直接判红），让「谁能全量枚举」这件事**结构性**成立而不是靠调用方自觉。
 */
const ALL_KEYS_LABEL = 'diagnostics'

export interface ChannelOptions {
  /** 申请开放 `allKeys()`；非诊断通道传 true 会在构造期判红（见 ALL_KEYS_LABEL） */
  allKeys?: boolean
}

/**
 * 创建一条具名通道。
 *
 * @param label 通道名（只用于报错文案，便于从一条 NamespaceError 反查是哪个通道越界）
 * @param owners 该通道被授权访问的域（最小授权：给够用，不多给）
 */
export function createChannel(label: string, owners: readonly KeyOwner[], opts: ChannelOptions = {}): StorageChannel {
  const allowed = new Set<KeyOwner>(owners)
  if (opts.allKeys === true && label !== ALL_KEYS_LABEL) {
    throw new NamespaceError(`全量枚举只允许诊断通道开启: 通道 ${label}`)
  }
  const allowAllKeys = opts.allKeys === true

  function repoOf(owner: KeyOwner): KeyFamilyRepository {
    let repo = repoCache.get(owner)
    if (!repo) {
      repo = new KeyFamilyRepository(adapter, owner)
      repoCache.set(owner, repo)
    }
    return repo
  }

  /** 路由（owner 驱动）+ 授权（allowlist）—— 两步都要过，缺一即半边界 */
  function repoFor(key: string): KeyFamilyRepository {
    const reg = resolveKey(key)
    if (!reg) throw new NamespaceError(`未注册键禁止经通道访问（通道 ${label}）: ${key}`)
    if (!allowed.has(reg.owner)) {
      throw new NamespaceError(`越界域判红: 通道 ${label} 不得访问 ${reg.owner} 域键 ${key}`)
    }
    return repoOf(reg.owner)
  }

  return {
    read(key: string): string | null {
      const repo = repoFor(key) // 边界违规在 try 之外抛出：不许读 ≠ 读不到
      try {
        return repo.getRaw(key)
      } catch {
        // 沿用原有降级语义：存储不可用（隐私模式等环境问题）→ null，由调用方按「空」处理
        return null
      }
    },
    write(key: string, raw: string): void {
      repoFor(key).setRaw(key, raw)
    },
    remove(key: string): void {
      repoFor(key).remove(key)
    },
    has(key: string): boolean {
      return repoFor(key).has(key)
    },
    keys(): string[] {
      const out = new Set<string>()
      for (const owner of owners) {
        for (const k of repoOf(owner).keys()) out.add(k)
      }
      return [...out]
    },
    allKeys(): string[] {
      if (!allowAllKeys) {
        throw new NamespaceError(`全量枚举只允许诊断域通道: 通道 ${label} 无此权限`)
      }
      return adapter.keys()
    },
  }
}
