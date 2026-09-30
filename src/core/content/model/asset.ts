/* P1.8-B · Content Asset —— 「文件在哪」与「内容是什么」分离。
 *
 * 核心原则：**Content ≠ File**。
 *   一条内容（word / audio / document …）可以有 0..n 个资产文件，且这些文件的
 *   存放位置会随部署演进而变（R2 → CDN → GitHub Releases）。Asset 层把「文件在哪」
 *   单独建模：搬运/换 CDN 时 **Content 模型不用动**，只改 URL 的解析策略。
 *   目录上也分离：`content/` 存数据；媒体本体不进 git（INV-4）。
 *
 * assetId 形态（P1.8-DESIGN-RULINGS v1.0 ③ 定死，只有这一种）：
 *   <宿主包 ContentId>#a:<assetLocalId>
 *   例：content:vocabulary:ecdict-ietf:ielts#a:a-0007
 *
 * 为什么废止旧形态 `asset:<kind>:<namespace>:<localId>`（已删除，两种形态不许并存）：
 *   1. **所有权必须写进标识** —— 三条所有权规则第 1 条是「Asset 不可跨包引用，生命周期
 *      严格随宿主包」。写成 `<宿主 ContentId>#a:<localId>` 时「这个 asset 属于哪个包」
 *      是**语法可见**的，isAssetOwnedBy() 退化成纯字符串判定；旧形态的 `namespace`
 *      只到来源族粒度（如 ecdict-ietf），表达不了「属于哪个包」，规则 1 只能靠运行时
 *      遍历校验，弱一层。
 *   2. **kind 放 ID 里是重复且会漂** —— kind 已写在 asset 记录里；同一份文件从 audio
 *      改判为 subtitle 不该导致 ID 变化。ID 只由「所有权 + 本地键」决定。
 *   3. **不引入第二套 ID 文法** —— 宿主段复用既有 ContentId 规范（parseContentId），
 *      本地段复用既有 localId 规范（isStableLocalId / normalizeLocalId）。本文件
 *      **不新造任何正则**：新造一份 = 第二份镜像，迟早与 content.ts 漂移。
 */
import { parseContentId, isStableLocalId, type ContentLicense } from './content'
import type { Provenance } from '../provenance'

/* P1.8-A 新增 `video`：ContentType 早有 listening/audio，但 AssetKind 缺 video，
 * 导致"视频"在类型契约里无处安放（P1.8 计划要支持视频+字幕）。
 * ⚠️ 成员是本枚举的对外契约（content/types/registry.ts 依赖），不得增删改。 */
export type AssetKind = 'audio' | 'video' | 'image' | 'document' | 'subtitle' | 'other'

/** assetId 中「宿主包 ContentId」与「本地键」的分隔符 */
const ASSET_ID_SEP = '#a:'

/** 构造 assetId：`<宿主包 ContentId>#a:<assetLocalId>`。
 *  **纯格式化，不做校验** —— 语法/归属/解析规则的校验统一归规则层，避免同一规则
 *  出现第二份实现（P18-A「白名单 12→14 漂移」同型事故）。 */
export function makeAssetId(hostContentId: string, assetLocalId: string): string {
  return `${hostContentId}${ASSET_ID_SEP}${assetLocalId}`
}

/**
 * 解析 assetId；**不合法返回 null**（调用方决定 fallback，不抛异常打断 UI，与 parseContentId 同族）。
 *
 * 按**第一个** `#a:` 切分（indexOf，不用贪婪正则去猜），然后：宿主段 → parseContentId，
 * 本地段 → isStableLocalId。两段都走既有规范，本文件不重复实现。
 *
 * 于是以下都返回 null：无 `#a:` / 本地键为空 / `#A:`（大写不是分隔符）/ 出现两个 `#a:`
 * （第二个被并进本地键，其中含 `:` → 本地段校验不过）/ 前后空白 / 宿主段不是合法 ContentId。
 */
export function parseAssetId(id: string): { hostContentId: string; assetLocalId: string } | null {
  const at = id.indexOf(ASSET_ID_SEP)
  if (at < 0) return null
  const hostContentId = id.slice(0, at)
  const assetLocalId = id.slice(at + ASSET_ID_SEP.length)
  if (parseContentId(hostContentId) === null) return null
  if (!isStableLocalId(assetLocalId)) return null
  return { hostContentId, assetLocalId }
}

/** 该 asset 是否属于指定宿主包（所有权规则 1「Asset 不可跨包引用」）。
 *  基于 parseAssetId 的纯判定 —— 供校验器与许可门调用。 */
export function isAssetOwnedBy(assetId: string, hostContentId: string): boolean {
  return parseAssetId(assetId)?.hostContentId === hostContentId
}

/** asset 许可二选一（P1.8-DESIGN-RULINGS ④-2b）：
 *  写 `license` 就不能写 `licenseRef`，反之亦然 ——「两个都写」与「两个都不写」
 *  **在 tsc 阶段即报错**（`?: never` 互斥手法），不靠运行时才暴露。
 *  运行时另锁「licenseRef 必须命中 manifest.licenses」（④-2：禁止隐式继承，缺 = FAIL）。
 *  两者缺一不可：类型锁「写法互斥」，运行时锁「引用有效」。 */
type AssetLicense =
  | { license: ContentLicense; licenseRef?: never }
  | { licenseRef: string; license?: never }

/** 资产元数据（许可二选一那部分见 AssetLicense）。字段名**逐字**对齐冻结 Plan §3.1。 */
interface AssetBase {
  /** `<宿主包 ContentId>#a:<assetLocalId>`（构造/解析一律走 makeAssetId / parseAssetId） */
  assetId: string
  kind: AssetKind
  /** **必须远程 `https://` 绝对 URL**（`http` / 相对路径一律 FAIL）。
   *  为什么必须远程：媒体本体不进 git（INV-4），运行期经 `/media/*` **同源代理**取回 ——
   *  同源才能进现有 Service Worker 缓存（`sw.js` 只缓存同源），否则媒体天然游离于
   *  离线策略之外。`/media/*` 代理与 R2 托管属 **P18-F**，本轮只立契约。 */
  url: string
  mime?: string
  bytes?: number
  /** **必填**，形态 `sha256:<64 位小写 hex>`（Plan §3.1「checksum 必填」） */
  checksum: string
  /** 媒体时长，单位**秒**（Plan §3.1 原注） */
  duration?: number
  /** 音轨 / 字幕语言 */
  lang?: string
  /** 资产角色（如 subtitle 的 transcript / translation / karaoke） */
  role?: string
  /** 逐件溯源：描述「这个文件本身从哪来」（可能与包级不同）。
   *  复用 provenance.ts 的 `Provenance`，**不新建类型**；其必填字段是 `provider`（不是 origin）。 */
  provenance: Provenance
}

/** 资产清单实体：**独立实体，生命周期严格随宿主包**（三条所有权规则见 Plan §3.2）。
 *  最终形态 = 元数据 & 许可二选一 —— 许可必须显式声明，**禁止隐式继承**。 */
export type AssetManifest = AssetBase & AssetLicense
