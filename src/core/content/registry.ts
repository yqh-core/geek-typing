/* V4.1 · Content Registry —— 全站内容统一注册表（V4-P0 由 WORD_BANKS 模式泛化而来）。
 *
 * 原则：
 *  - UI 永远不感知内容来自 JSON / TS / GitHub / CDN / IndexedDB —— 只经本文件与 query 层；
 *  - 小库（curated + CET）inline 同步可用；三大库（ielts/kaoyan/toefl）lazy 动态 chunk，
 *    SW 空闲期预热（main.tsx → warmUpVocabulary）；
 *  - 词条以 `?raw` 导入 + 运行时 JSON.parse，规避 tsc 对大 JSON 的字面量类型推断；
 *  - 加载结果单份缓存（loadPackage），兼容层与查询层共享，不重复占用内存。
 *
 * 新增内容包：content/vocabulary/<id>/ 放 manifest.json + words.json → 本文件登记 →
 * content:validate 校验 → content:build 自动同步 stats/checksum。
 */
import type { PackageManifest, WordPayload } from './schema'
import { parseContentId } from './model/content'
import type { ContentRelation } from './relation/relation'

export interface VocabularyPackage {
  manifest: PackageManifest
  /** ContentId 的第 4 段（裸词库 id），与 UI/持久化键一致 */
  localId: string
  /** inline 策略：词条同步可用 */
  words?: WordPayload[]
  /** lazy 策略：词条异步加载器 */
  load?: () => Promise<WordPayload[]>
}

/* ---------------- manifest（?raw + parse，规避 resolveJsonModule） ---------------- */
import ieltsManifest from '../../../content/vocabulary/ielts/manifest.json?raw'
import kaoyanManifest from '../../../content/vocabulary/kaoyan/manifest.json?raw'
import toeflManifest from '../../../content/vocabulary/toefl/manifest.json?raw'
import cet4Manifest from '../../../content/vocabulary/cet4/manifest.json?raw'
import cet6Manifest from '../../../content/vocabulary/cet6/manifest.json?raw'
import aiCoreManifest from '../../../content/vocabulary/ai-core/manifest.json?raw'
import cloudNativeManifest from '../../../content/vocabulary/cloud-native/manifest.json?raw'
import frontendManifest from '../../../content/vocabulary/frontend/manifest.json?raw'
import tsCodeManifest from '../../../content/vocabulary/ts-code/manifest.json?raw'
import goCodeManifest from '../../../content/vocabulary/go-code/manifest.json?raw'

const parseManifest = (raw: string): PackageManifest => JSON.parse(raw) as PackageManifest

/* ---------------- inline 小库词条（同步 parse，体积小无负担） ---------------- */
import aiCoreWords from '../../../content/vocabulary/ai-core/words.json?raw'
import cloudNativeWords from '../../../content/vocabulary/cloud-native/words.json?raw'
import frontendWords from '../../../content/vocabulary/frontend/words.json?raw'
import cet4Words from '../../../content/vocabulary/cet4/words.json?raw'
import cet6Words from '../../../content/vocabulary/cet6/words.json?raw'
import tsCodeWords from '../../../content/vocabulary/ts-code/words.json?raw'
import goCodeWords from '../../../content/vocabulary/go-code/words.json?raw'

const parseWords = (raw: string): WordPayload[] => JSON.parse(raw) as WordPayload[]

/* ---------------- lazy 大库词条（动态 import，独立 chunk） ---------------- */
const loadIelts = async () => parseWords((await import('../../../content/vocabulary/ielts/words.json?raw')).default)
const loadKaoyan = async () => parseWords((await import('../../../content/vocabulary/kaoyan/words.json?raw')).default)
const loadToefl = async () => parseWords((await import('../../../content/vocabulary/toefl/words.json?raw')).default)

/* ---------------- 注册表（vocabulary 槽位；其余类型上线时扩展） ---------------- */
const packages: VocabularyPackage[] = [
  { manifest: parseManifest(aiCoreManifest), localId: 'ai-core', words: parseWords(aiCoreWords) },
  { manifest: parseManifest(cloudNativeManifest), localId: 'cloud-native', words: parseWords(cloudNativeWords) },
  { manifest: parseManifest(frontendManifest), localId: 'frontend', words: parseWords(frontendWords) },
  { manifest: parseManifest(cet4Manifest), localId: 'cet4', words: parseWords(cet4Words) },
  { manifest: parseManifest(cet6Manifest), localId: 'cet6', words: parseWords(cet6Words) },
  { manifest: parseManifest(ieltsManifest), localId: 'ielts', load: loadIelts },
  { manifest: parseManifest(kaoyanManifest), localId: 'kaoyan', load: loadKaoyan },
  { manifest: parseManifest(toeflManifest), localId: 'toefl', load: loadToefl },
  { manifest: parseManifest(tsCodeManifest), localId: 'ts-code', words: parseWords(tsCodeWords) },
  { manifest: parseManifest(goCodeManifest), localId: 'go-code', words: parseWords(goCodeWords) },
]

const byLocalId = new Map(packages.map((p) => [p.localId, p]))
const byManifestId = new Map(packages.map((p) => [p.manifest.id, p]))

/** 包级加载缓存（单份数据，兼容层与查询层共享） */
const loadedCache = new Map<string, WordPayload[]>()

/* ---------------- 查询 API ---------------- */

/** 全部 vocabulary 包（按注册序，即 UI 下拉序） */
export function getVocabularyPackages(): VocabularyPackage[] {
  return packages
}

/** 按裸 id（ai-core / ielts ...）取包 */
export function getVocabularyPackage(localId: string): VocabularyPackage | undefined {
  return byLocalId.get(localId)
}

/** 按包 id（裸 id 或 4 段式 ContentId）取包 */
export function getPackage(id: string): VocabularyPackage | undefined {
  return byManifestId.get(id) ?? byLocalId.get(id) ?? byLocalId.get(parseContentId(id)?.localId ?? '')
}

/** 加载包内词条（inline 直接返回，lazy 走动态 import 并缓存） */
export async function loadPackage(id: string): Promise<WordPayload[]> {
  const pkg = getPackage(id)
  if (!pkg) return []
  const hit = loadedCache.get(pkg.localId)
  if (hit) return hit
  const words = pkg.words ?? (pkg.load ? await pkg.load() : [])
  loadedCache.set(pkg.localId, words)
  return words
}

/** ContentId → 单条内容（当前仅 word 类型可解析；其余类型待内容接入后扩展） */
export async function getContent<T = WordPayload>(contentId: string): Promise<T | null> {
  const parsed = parseContentId(contentId)
  if (!parsed) return null
  if (parsed.type === 'word') {
    // 词条的 namespace 即包所在 namespace：在对应 namespace 的包内按词形查找
    const pkgs = packages.filter((p) => parseContentId(p.manifest.id)?.namespace === parsed.namespace)
    for (const p of pkgs) {
      const words = await loadPackage(p.localId)
      const hit = words.find((w) => w.word.toLowerCase() === parsed.localId.toLowerCase())
      if (hit) return hit as T
    }
    return null
  }
  return null
}

/** 按类型列出内容包清单（listening 等类型当前为空数组） */
export function listContent(type: string): PackageManifest[] {
  if (type !== 'vocabulary') return []
  return packages.map((p) => p.manifest)
}

/** 关系查询：当前无 relations.json，恒为空数组（关系模型已就位，接入内容即产出） */
export function getRelations(_contentId: string): ContentRelation[] {
  return []
}

/** Capability 查询：业务代码用它替代 if (bank === 'xxx') 分支 */
export function hasFeature(packageId: string, feature: string): boolean {
  return getPackage(packageId)?.manifest.features[feature] === true
}

/** SW 空闲期预热（main.tsx）：预拉三大库 chunk 入 SW 缓存，保证首次离线可切大词库 */
export function warmUpVocabulary(): Promise<unknown> {
  return Promise.allSettled([loadIelts(), loadKaoyan(), loadToefl()]).catch(() => {})
}
