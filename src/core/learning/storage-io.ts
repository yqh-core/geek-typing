/* P1.7 Wave 2-B · learning 键族的持久化接线（v2.3.2 §1 A-1）
 *
 * 目的：把 lib/learning 对本机存储的**原生读写**收口到 persistence 层的
 * Repository —— 之后 learning 域键的任何存取都过 namespace 注册校验 + owner 域匹配。
 *
 * 边界契约：
 *   - learning 域键（gt.learning.v2 / .backup / gt.letterStats.v1 / gt.totals.v1）
 *     走 learning 仓；gt.migration.v1 属 migration 域，走 migration 仓 —— 跨域写会被判红，
 *     这正是 W2A 建立的运行时边界在真实业务模块上的落地；
 *   - 只走 getRaw/setRaw（不经过 codec），因此**写入字节与改动前完全一致**，
 *     配额熔断、损坏告警、diag 等既有逻辑零改动；
 *   - 本模块是唯一注入点：`setLearningAdapter()` 仅供测试/演练替换存储实现。
 */

import { LocalStorageAdapter, type StorageAdapter } from '../persistence/adapter'
import { KeyFamilyRepository } from '../persistence/repository'
import { resolveKey, NamespaceError, type KeyOwner } from '../persistence/namespace'

let adapter: StorageAdapter = new LocalStorageAdapter()
const repoCache = new Map<KeyOwner, KeyFamilyRepository>()

/** 注入存储实现（测试 / migration 演练用；生产环境默认 LocalStorageAdapter） */
export function setLearningAdapter(next: StorageAdapter): void {
  adapter = next
  repoCache.clear()
}

/**
 * learning 模块**允许触及的域**（回滚/备份/迁移会写 analytics、content 等非 learning 旧键）。
 * settings 域不在其中 —— 学习层碰设置键属越界，直接判红。
 *
 * 约束对**读与写一视同仁**：把「路由正确」（owner 驱动选仓）与「授权正确」
 * （本模块该不该碰这个域）分开，授权一旦只管写不管读，就会出现「写不进去但读得到」
 * 的半边界，审计时无法判定接线是否成立。
 *
 * 注意这与 W2A 仓储层契约**不冲突而是分层**：`KeyFamilyRepository.getRaw` 对任意域放行
 * （迁移批次需要跨键族读），收严发生在「业务模块经本通道访问」这一层。
 */
const ALLOWED_OWNERS: ReadonlySet<KeyOwner> = new Set<KeyOwner>([
  'learning',
  'analytics',
  'content',
  'migration',
  'diagnostics',
])

/**
 * 按 namespace 解析出的 owner 选仓 —— 而不是「非 migration 一律走 learning 仓」。
 * 回滚路径要写 gt.analytics.v1（analytics 域）/ gt.customBanks.v1（content 域）等
 * **非 learning 域**的旧键（learning-storage 套件抓到的真回归）：owner 驱动路由后
 * 这些写入合法（已注册 + 域匹配），未注册键与越界域仍由 namespace 判红。
 */
function repoFor(key: string): KeyFamilyRepository {
  const reg = resolveKey(key)
  const owner: KeyOwner = reg?.owner ?? 'learning' // 未注册键：落到 learning 仓，写入时由 assertWritable 判红
  if (!ALLOWED_OWNERS.has(owner)) {
    throw new NamespaceError(`越界域判红: learning 模块不得经本通道访问 ${owner} 域键 ${key}`)
  }
  let repo = repoCache.get(owner)
  if (!repo) {
    repo = new KeyFamilyRepository(adapter, owner)
    repoCache.set(owner, repo)
  }
  return repo
}

/**
 * 读取原始字符串。
 *
 * 两层错误语义必须分开，不能一律 catch → null：
 *   - `NamespaceError`（越界域 / 未注册）：**原样抛出**，边界违规不得静默成 null，
 *     否则「读不到」与「不许读」不可区分，接线正确性就证明不了；
 *   - 存储不可用（隐私模式 SecurityError 等环境问题）：降级为 `null`，
 *     与改动前语义一致 —— 环境问题是环境问题，不是数据损坏。
 */
export function readKeyRaw(key: string): string | null {
  let repo: KeyFamilyRepository
  try {
    repo = repoFor(key)
  } catch (e) {
    if (e instanceof NamespaceError) throw e
    return null
  }
  try {
    return repo.getRaw(key)
  } catch {
    return null
  }
}

/** 写入原始字符串；未注册键 / 跨域 → NamespaceError（写入判红，不静默） */
export function writeKeyRaw(key: string, raw: string): void {
  repoFor(key).setRaw(key, raw)
}

/** 删除键（REMOVE OLD 走同一边界） */
export function removeKeyRaw(key: string): void {
  repoFor(key).remove(key)
}
