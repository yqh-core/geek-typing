/* 词库深链：`?bank=<packageId>` → 首屏词库。
 *
 * ⛔ 未知 id 的语义是**静默降级到默认词库**，不是报错：
 *   `useBank` 里既有 `banks.find(b => b.id === bankId) ?? banks[0]` 兜底，本模块再加一道
 *   **入口侧**的白名单校验 —— 只有确实存在的 id 才被采纳为初始 bankId。
 *   两道闸的分工：
 *     - 本模块（入口）：未知 id 直接当「没带参数」，回落 `gt.bank` → `DEFAULT_BANK_ID`；
 *       于是 `gt.bank` **不会**被写成垃圾值（否则用户手输一个错 id 就把偏好永久污染成
 *       "每次启动都落到 banks[0]"，且再也回不到自己原来那本库）。
 *     - useBank（渲染侧）：即便 bankId 因历史脏数据不可解析，仍按 `?? banks[0` 渲染，不白屏。
 *   任何解析异常（URLSearchParams 不可用、search 含畸形编码）一律 catch 成 `null`，
 *   **绝不抛错、绝不弹提示** —— 深链是「锦上添花的入口」，坏了必须无声无息。
 *
 * ⛔ 只在**应用初始化时读一次**（useState 惰性初始值），不做后续监听：
 *   1) 需求是「首屏词库的初始值」，不是路由；
 *   2) 监听 popstate / URL 变化会引入历史栈与竞态（用户手动切库后 URL 仍带旧 id 时
 *      到底听谁的），性价比不划算；
 *   3) 省字节（raw 余量只有 22.7 KB）。
 *   已知取舍：用户随后在 UI 里换库，URL 上的 `?bank=` 会变成陈旧值，刷新会回到该库。
 *   这是「导航参数」而非「状态同步」的正常语义 —— 与 SearchAction 无关，见 index.html 注释。
 */
import { WORD_BANKS } from '../data/wordBanks'
import { loadCustomBanks } from './customBanks'

/** URL 查询参数名（与 13 个静态词库页的 packageId 同一套 id 空间） */
export const BANK_QUERY_KEY = 'bank'

/**
 * 从一段 query string 里取出 `bank` 参数的值。
 *
 * @param search - query string，默认取 `window.location.search`
 * @returns 去掉首尾空白后的非空 id；缺省 / 空串 / 解析异常一律 `null`
 */
export function readBankParam(search?: string): string | null {
  try {
    const raw = search ?? (typeof window === 'undefined' ? '' : window.location.search)
    if (!raw) return null
    // URLSearchParams 对畸形 percent-encoding 是宽容的（不抛），但个别老环境压根没有这个
    // 构造函数 —— 故整段包在 try 里，失败等价于「没带参数」
    const id = new URLSearchParams(raw).get(BANK_QUERY_KEY)
    if (!id) return null
    const trimmed = id.trim()
    return trimmed === '' ? null : trimmed
  } catch {
    return null
  }
}

/**
 * 解析首屏应当采用的词库 id：**只有真实存在的 id 才返回**。
 *
 * 命中范围 = 13 个内建词库（`WORD_BANKS`）+ 用户导入的自定义词库（`loadCustomBanks`）。
 * 自定义库必须一并命中：深链是「分享」的主载体，而自定义库是用户自己建的、
 * 只有他自己会分享出去的库 —— 只认内建库会让一半的分享链接落地即降级。
 *
 * @returns 合法 id；无参数 / 未知 id / 读自定义库失败 —— 一律 `null`（交由调用方回落默认）
 */
export function resolveDeepLinkBankId(search?: string): string | null {
  const id = readBankParam(search)
  if (!id) return null
  if (WORD_BANKS.some((b) => b.id === id)) return id
  // loadCustomBanks 内部自带 try/catch（读失败按空表 + console.warn），不会抛
  if (loadCustomBanks().some((c) => c.id === id)) return id
  return null
}