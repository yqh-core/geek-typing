/* V4.1 · Content Registry —— 全站内容统一注册表。
 *
 * 由 V3 的 WORD_BANKS 注册模式泛化而来（V4-P0）：
 *  - manifest 静态声明（构建期可校验，content:validate 门禁）；
 *  - 小库（ai-core/cloud-native/frontend/cet4/cet6）inline：随主包同步可用（与 V3 行为一致）；
 *  - 大库（ielts/kaoyan/toefl）lazy：动态 import 独立 chunk，SW 空闲期预热（main.tsx）；
 *  - 词条以 `?raw` 导入 + 运行时 JSON.parse，避免 tsc 对大 JSON 做字面量类型推断。
 * 新增内容包：content/vocabulary/<id>/ 放 manifest.json + words.json → 本文件登记 →
 * content:validate 校验。listening/reading 等类型上线时在此扩展类型槽位。
 */
import type { PackageManifest, WordItem, ContentType } from './schema'

export interface VocabularyPackage {
  manifest: PackageManifest
  /** inline 策略：词条同步可用 */
  words?: WordItem[]
  /** lazy 策略：词条异步加载器（模块级缓存由 wordBanks.bankCache 承担） */
  load?: () => Promise<WordItem[]>
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

const parseWords = (raw: string): WordItem[] => JSON.parse(raw) as WordItem[]

/* ---------------- lazy 大库词条（动态 import，独立 chunk） ---------------- */
const loadIelts = async () => parseWords((await import('../../../content/vocabulary/ielts/words.json?raw')).default)
const loadKaoyan = async () => parseWords((await import('../../../content/vocabulary/kaoyan/words.json?raw')).default)
const loadToefl = async () => parseWords((await import('../../../content/vocabulary/toefl/words.json?raw')).default)

/* ---------------- 注册表（vocabulary 槽位；其余类型上线时扩展） ---------------- */
/** key = 裸词库 id（与 UI/持久化一致，manifest.id 为 `bank:<裸id>`） */
const vocabularyPackages: Record<string, VocabularyPackage> = {
  'ai-core': { manifest: parseManifest(aiCoreManifest), words: parseWords(aiCoreWords) },
  'cloud-native': { manifest: parseManifest(cloudNativeManifest), words: parseWords(cloudNativeWords) },
  frontend: { manifest: parseManifest(frontendManifest), words: parseWords(frontendWords) },
  cet4: { manifest: parseManifest(cet4Manifest), words: parseWords(cet4Words) },
  cet6: { manifest: parseManifest(cet6Manifest), words: parseWords(cet6Words) },
  ielts: { manifest: parseManifest(ieltsManifest), load: loadIelts },
  kaoyan: { manifest: parseManifest(kaoyanManifest), load: loadKaoyan },
  toefl: { manifest: parseManifest(toeflManifest), load: loadToefl },
  'ts-code': { manifest: parseManifest(tsCodeManifest), words: parseWords(tsCodeWords) },
  'go-code': { manifest: parseManifest(goCodeManifest), words: parseWords(goCodeWords) },
}

/* ---------------- 查询 / Capability API ---------------- */

/** 全部 vocabulary 包（按注册序，即 UI 下拉序） */
export function getVocabularyPackages(): VocabularyPackage[] {
  return Object.values(vocabularyPackages)
}

/** 按裸 id 取包 */
export function getVocabularyPackage(id: string): VocabularyPackage | undefined {
  return vocabularyPackages[id]
}

/** Capability 查询：业务代码用它替代 if (bank === 'xxx') 分支 */
export function hasFeature(pkg: VocabularyPackage, feature: string): boolean {
  return pkg.manifest.features[feature] === true
}

/** 按内容类型列出 manifest（listening 等类型上线前恒为空数组） */
export function listManifests(type: ContentType): PackageManifest[] {
  if (type !== 'vocabulary') return []
  return getVocabularyPackages().map((p) => p.manifest)
}

/** SW 空闲期预热（main.tsx 调用）：预拉 3 个 lazy 大库 chunk，经 SW fetch handler 入缓存，
 *  保证首访用户首次离线也能切换大词库。与 wordBanks.load 同一模块路径 → 同一 chunk。 */
export function warmUpVocabulary(): Promise<unknown> {
  return Promise.allSettled([loadIelts(), loadKaoyan(), loadToefl()]).catch(() => {})
}
