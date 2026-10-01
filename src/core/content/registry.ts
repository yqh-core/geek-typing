/* V4.1 · Content Registry —— 全站内容统一注册表（V4-P0 由 WORD_BANKS 模式泛化而来）。
 *
 * 原则：
 *  - UI 永远不感知内容来自 JSON / TS / GitHub / CDN / IndexedDB —— 只经本文件与 query 层；
 *  - 小库（curated + CET）inline 同步可用；大库（ielts/kaoyan/toefl…）lazy 动态 chunk，
 *    其中 **WARMUP_IDS 清单内的包**由 main.tsx 空闲期预热（清单本体在本文件末尾，见 warmUpVocabulary）；
 *  - 词条以 `?raw` 导入 + 运行时 JSON.parse，规避 tsc 对大 JSON 的字面量类型推断；
 *  - 加载结果单份缓存（loadPackage），兼容层与查询层共享，不重复占用内存。
 *
 * 新增内容包：vocabulary → content/vocabulary/<id>/ 放 manifest.json + words.json；
 * 其它类型 → content/<type>/<id>/ 放 manifest.json + items.json（可选载荷）。
 * 均在本文件登记 → content:validate 校验 → vocabulary 包再跑 content:build 同步 stats/checksum。
 */
import type { RuntimePackageManifest, WordPayload } from './schema'
import { parseContentId } from './model/content'
import type { ContentRelation } from './relation/relation'

/**
 * 内容包统一注册形状（P1.7-Wave4 B-2 泛化）：
 *  - vocabulary 包走 words?/load? 词条通道（与既有口径一致）；
 *  - 其余类型包走 data?/loadData? 条目通道（items.json，试金石包一律 lazy）。
 * VocabularyPackage 保留为别名，既有调用方（wordBanks / learning / query 层）不受影响。
 */
export interface ContentPackage {
  manifest: RuntimePackageManifest
  /** ContentId 的第 4 段（裸包 id），与 UI/持久化键一致 */
  localId: string
  /** vocabulary inline 策略：词条同步可用 */
  words?: WordPayload[]
  /** vocabulary lazy 策略：词条异步加载器 */
  load?: () => Promise<WordPayload[]>
  /** 非 vocabulary inline 策略：条目同步可用 */
  data?: unknown[]
  /** 非 vocabulary lazy 策略：条目异步加载器（items.json 动态 import，独立 chunk） */
  loadData?: () => Promise<unknown[]>
}
export type VocabularyPackage = ContentPackage
export type ContentPackageEntry = ContentPackage

/* ---------------- manifest（构建期 ?runtime 投影 → 对象；规则见 scripts/content/manifest-runtime.mjs） ---------------- */
import ieltsManifest from '../../../content/vocabulary/ielts/manifest.json?runtime'
import kaoyanManifest from '../../../content/vocabulary/kaoyan/manifest.json?runtime'
import toeflManifest from '../../../content/vocabulary/toefl/manifest.json?runtime'
import cet4Manifest from '../../../content/vocabulary/cet4/manifest.json?runtime'
import cet6Manifest from '../../../content/vocabulary/cet6/manifest.json?runtime'
import aiCoreManifest from '../../../content/vocabulary/ai-core/manifest.json?runtime'
import cloudNativeManifest from '../../../content/vocabulary/cloud-native/manifest.json?runtime'
import frontendManifest from '../../../content/vocabulary/frontend/manifest.json?runtime'
import tsCodeManifest from '../../../content/vocabulary/ts-code/manifest.json?runtime'
import goCodeManifest from '../../../content/vocabulary/go-code/manifest.json?runtime'

/* ---------------- inline 小库词条（同步 parse）—— 保留 ai-core（默认库）+ ts-code / go-code（本刀不动） ---------------- */
import aiCoreWords from '../../../content/vocabulary/ai-core/words.json?raw'
import tsCodeWords from '../../../content/vocabulary/ts-code/words.json?raw'
import goCodeWords from '../../../content/vocabulary/go-code/words.json?raw'

const parseWords = (raw: string): WordPayload[] => JSON.parse(raw) as WordPayload[]

/* ---------------- lazy 词库词条（动态 import，独立 chunk） ----------------
 * B 步 9.5：`cloud-native` / `frontend` 由 inline 改 lazy（两处 manifest 的 offline.policy
 * 同步改 lazy，否则 `scripts/content/validate.mjs` 判据 20「策略一致性」当场判红）。
 * 判定口径 = 体积 ÷ 首屏必需度（见 docs/p18/DECISIONS-POST-P18.md §9.5.2）：
 * 两包合计才 1.55 KiB，但都是「首页按任意键即打字」的入口词库 —— 提前到首屏换不来任何
 * 首屏收益，却白占主 chunk 常驻内存，故改 lazy 走骨架屏（Memorize.tsx 已配套加载态）。
 * 注意：这与预热的取舍无关（见 WARMUP_IDS 处注释）—— 改 lazy 不意味着该进预热清单。 */
const loadCloudNative = async () => parseWords((await import('../../../content/vocabulary/cloud-native/words.json?raw')).default)
const loadFrontend = async () => parseWords((await import('../../../content/vocabulary/frontend/words.json?raw')).default)
const loadIelts = async () => parseWords((await import('../../../content/vocabulary/ielts/words.json?raw')).default)
const loadKaoyan = async () => parseWords((await import('../../../content/vocabulary/kaoyan/words.json?raw')).default)
const loadToefl = async () => parseWords((await import('../../../content/vocabulary/toefl/words.json?raw')).default)
const loadCet4 = async () => parseWords((await import('../../../content/vocabulary/cet4/words.json?raw')).default)
const loadCet6 = async () => parseWords((await import('../../../content/vocabulary/cet6/words.json?raw')).default)

/* ---------------- 非 vocabulary 试金石包（P1.7-Wave4 B-2） ----------------
 * manifest 静态 import（常驻主 chunk，单个 ~1.2 KiB，O(包数) 线性小步涨）；
 * items.json 一律动态 import（独立 items-*.js chunk，绝不进主 chunk），
 * 与 words-*.js 同一判据口径（构建后体积门禁按 (words|items)-*.js 计数）。 */
import listeningManifest from '../../../content/listening/demo-listening-01/manifest.json?runtime'
import audioManifest from '../../../content/audio/demo-audio-01/manifest.json?runtime'
import readingManifest from '../../../content/reading/demo-reading-01/manifest.json?runtime'
import topicManifest from '../../../content/topic/demo-topic-01/manifest.json?runtime'
import exerciseManifest from '../../../content/exercise/demo-exercise-01/manifest.json?runtime'
import writingManifest from '../../../content/writing/demo-writing-01/manifest.json?runtime'
import speakingManifest from '../../../content/speaking/demo-speaking-01/manifest.json?runtime'
import collectionManifest from '../../../content/collection/demo-study-set/manifest.json?runtime'

const parseData = (raw: string): unknown[] => JSON.parse(raw) as unknown[]
const loadListeningDemo = async () => parseData((await import('../../../content/listening/demo-listening-01/items.json?raw')).default)
const loadAudioDemo = async () => parseData((await import('../../../content/audio/demo-audio-01/items.json?raw')).default)
const loadReadingDemo = async () => parseData((await import('../../../content/reading/demo-reading-01/items.json?raw')).default)
const loadTopicDemo = async () => parseData((await import('../../../content/topic/demo-topic-01/items.json?raw')).default)
const loadExerciseDemo = async () => parseData((await import('../../../content/exercise/demo-exercise-01/items.json?raw')).default)
const loadWritingDemo = async () => parseData((await import('../../../content/writing/demo-writing-01/items.json?raw')).default)
const loadSpeakingDemo = async () => parseData((await import('../../../content/speaking/demo-speaking-01/items.json?raw')).default)
const loadCollectionDemo = async () => parseData((await import('../../../content/collection/demo-study-set/items.json?raw')).default)

/* ---------------- 注册表（10 vocabulary + 7 类型试金石 + 1 collection = 18 包） ---------------- */
const packages: ContentPackage[] = [
  { manifest: aiCoreManifest, localId: 'ai-core', words: parseWords(aiCoreWords) },
  { manifest: cloudNativeManifest, localId: 'cloud-native', load: loadCloudNative },
  { manifest: frontendManifest, localId: 'frontend', load: loadFrontend },
  { manifest: cet4Manifest, localId: 'cet4', load: loadCet4 },
  { manifest: cet6Manifest, localId: 'cet6', load: loadCet6 },
  { manifest: ieltsManifest, localId: 'ielts', load: loadIelts },
  { manifest: kaoyanManifest, localId: 'kaoyan', load: loadKaoyan },
  { manifest: toeflManifest, localId: 'toefl', load: loadToefl },
  { manifest: tsCodeManifest, localId: 'ts-code', words: parseWords(tsCodeWords) },
  { manifest: goCodeManifest, localId: 'go-code', words: parseWords(goCodeWords) },
  { manifest: listeningManifest, localId: 'demo-listening-01', loadData: loadListeningDemo },
  { manifest: audioManifest, localId: 'demo-audio-01', loadData: loadAudioDemo },
  { manifest: readingManifest, localId: 'demo-reading-01', loadData: loadReadingDemo },
  { manifest: topicManifest, localId: 'demo-topic-01', loadData: loadTopicDemo },
  { manifest: exerciseManifest, localId: 'demo-exercise-01', loadData: loadExerciseDemo },
  { manifest: writingManifest, localId: 'demo-writing-01', loadData: loadWritingDemo },
  { manifest: speakingManifest, localId: 'demo-speaking-01', loadData: loadSpeakingDemo },
  { manifest: collectionManifest, localId: 'demo-study-set', loadData: loadCollectionDemo },
]

/** vocabulary 槽位（既有 API 口径：UI / 持久化 / 学习层只看词库包） */
const vocabularyPackages = packages.filter((p) => p.manifest.type === 'vocabulary')

const byLocalId = new Map(packages.map((p) => [p.localId, p]))
const byManifestId = new Map(packages.map((p) => [p.manifest.id, p]))

/** 包级加载缓存（单份数据，兼容层与查询层共享） */
const loadedCache = new Map<string, WordPayload[]>()
/** 非 vocabulary 包条目缓存（loadPackageData 专用，与词条缓存分离） */
const dataCache = new Map<string, unknown[]>()

/* ---------------- 查询 API ---------------- */

/** 全部内容包（18 个：10 vocabulary + 8 试金石/组合，按注册序） */
export function getAllPackages(): ContentPackage[] {
  return packages
}

/** 全部 vocabulary 包（按注册序，即 UI 下拉序；既有 API 口径不变） */
export function getVocabularyPackages(): ContentPackage[] {
  return vocabularyPackages
}

/** 按裸 id（ai-core / ielts / demo-listening-01 ...）取包（含全部类型） */
export function getVocabularyPackage(localId: string): ContentPackage | undefined {
  return byLocalId.get(localId)
}

/** 按包 id（裸 id 或 4 段式 ContentId）取包（含全部类型） */
export function getPackage(id: string): ContentPackage | undefined {
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

/**
 * ContentId → 单条内容（当前仅 word 类型可解析；其余类型待内容接入后扩展）。
 *
 * 单条寻址的唯一出口：**委托 query 层 `getWord`**，本层不再自己实现词形匹配。
 *
 * 为什么必须委托（而不是在这里 `w.word.toLowerCase() === localId.toLowerCase()`）：
 *  - ContentId 的匹配口径是**原词形逐字符精确**（CONTENT_CONTRACT C-1 大小写敏感 / C-6
 *    词条 id 保留原词形，lowercase 只允许出现在检索 key normalizeWord 里）。原先的双侧
 *    lowercase 归一化把 `content:word:ns:useEffect` 与 `content:word:ns:useeffect` 判成同一条，
 *    直接违反 C-1/C-6；一旦语料引入大写变体（如 ts-code / go-code 里的 `const`、`Oxford`），
 *    就会出现「id 指错条目」的静默错数据。
 *  - 精确寻址（id 逐字符同源）与检索（normalizeWord 宽松匹配）的口径必须**只有一处实现**，
 *    否则两条路径迟早漂移。query 层 getWord 已是正确实现：先 findById 精确取，未命中才用
 *    norm 兜底，且兜底同时防了「独立展开子串 id」的过度匹配（如 `content:word:ns:word:foo`）。
 *  - 循环依赖：content-query 已 import 本文件（getPackage / getVocabularyPackages /
 *    loadPackage），此处只能**函数体内动态 import** 破环；静态 import 会形成
 *    registry ↔ content-query 的模块环。懒加载只在首次调用时付一次 Promise 开销。
 */
export async function getContent<T = WordPayload>(contentId: string): Promise<T | null> {
  const { getWord } = await import('./query/content-query')
  const hit = await getWord(contentId)
  if (!hit) return null
  // WordHit（含 id / packageId / packageLocalId / packageTitle 等寻址上下文）
  // → WordPayload（words.json 原始载荷形状）。只做字段搬运，不丢字段：
  // WordPayload = Omit<WordContent, 'id' | 'type'> = { word, translation, phonetic?, definition? }
  return {
    word: hit.word,
    translation: hit.translation,
    phonetic: hit.phonetic,
    definition: hit.definition,
  } as T
}

/** 按类型列出内容包 manifest（B-2 泛化：按注册表实际类型过滤，未接入的类型自然为空数组） */
export function listContent(type: string): RuntimePackageManifest[] {
  return packages.filter((p) => p.manifest.type === type).map((p) => p.manifest)
}

/**
 * 加载非 vocabulary 包的条目（data/loadData 通道，单份缓存，语义对齐 loadPackage）。
 * vocabulary 包条目请走 loadPackage（词条通道）。
 */
export async function loadPackageData(id: string): Promise<unknown[]> {
  const pkg = getPackage(id)
  if (!pkg) return []
  const hit = dataCache.get(pkg.localId)
  if (hit) return hit
  const rows = pkg.data ?? (pkg.loadData ? await pkg.loadData() : [])
  dataCache.set(pkg.localId, rows)
  return rows
}

/** 关系查询：当前无 relations.json，恒为空数组（关系模型已就位，接入内容即产出） */
export function getRelations(_contentId: string): ContentRelation[] {
  return []
}

/** Capability 查询：业务代码用它替代「按包 id 硬编码分支」，统一走 features 声明 */
export function hasFeature(packageId: string, feature: string): boolean {
  return getPackage(packageId)?.manifest.features[feature] === true
}

/* ---------------- 预热清单（预热预算的唯一事实源） ----------------
 * 旧实现把 `loadIelts()/loadKaoyan()/loadToefl()` 直接写死在函数体里，且**没有上限** ——
 * 每新增一个 lazy 词库就只能靠人记得「要不要手动加一行」，预热因此随包数线性膨胀
 * （三库合计已占 600 KiB 预算的 82.8%）。
 *
 * 改造要点（B 步 9.2）：
 *   1. 预热哪些包 = 本数组，**运行时不得自行扩张**（新增大词库默认不入清单 ⇒ 预算不自动爆）；
 *   2. 本数组被 `scripts/check-bundle.mjs` 判据 3 以同语法解析 —— 判据算的就是这份清单，
 *      而不是「候选集 / 全注册表」；清单若消失 ⇒ 判 UNKNOWN（不视为通过，绝不悄悄放行）；
 *   3. 「预热哪些」由常量决定（可被判据独立读取），「先预热哪个」留给运行时排序（不影响预算核算）。
 *
 * ⚠️ 别把 `frontend` / `cloud-native` 塞进这份清单（B 步 9.5 实测过，别再试一遍）：
 *   1. 预热时机在 `window load` → `requestIdleCallback`（src/main.tsx），发生在**首屏之后**；
 *      这两个包改 lazy 后走的是「切库时按需加载 + 骨架屏」，本就要在 idle 之后才可能被摸到，
 *      提前预热换不来任何首屏收益；
 *   2. 清单从 2 撑到 4 会同时撞两道坎 —— `scripts/check-bundle.mjs:86` 的 `WARMUP_MAX_IDS = 2`
 *      长度上限，和 `docs/p18/_generated/warmup-ids-baseline.json` 的棘轮基线
 *      （判据 6 只许降不许升，`--record-baseline` 都被锁死）；
 *   3. 这两个包合计 1.55 KiB，本来就不属于「离线可切大词库」这套预算要保的对象。
 */
export const WARMUP_IDS = ['kaoyan', 'toefl'] as const

/** SW 空闲期预热（main.tsx）：按清单预拉词库 chunk 入 SW 缓存，保证首次离线可切大词库。
 *
 * ⚠️ 返回值是**结果摘要**而不是 `void`：旧实现末尾挂的 `.catch(() => {})` 把一切失败
 * 吞得干干净净 —— `allSettled` 本身就不会 reject，再加上这个裸 catch，调用方（main.tsx）
 * 拿到的是一个「永远成功」的空 promise，预热没跑成在控制台不留任何痕迹，只能等用户反馈
 * 「离线切不了大词库」才被发现。现在把成功/失败/缺 loader 三个数**回传**，由 main.tsx
 * 决定怎么打日志：静默失败必须变成可观测事件（Stage 0 · N2）。
 *
 * 仍然不 reject：预热全程跑在 `window load` → `requestIdleCallback` 的空闲期，只服务于
 * 「首次离线可切大词库」这一条体验，失败不该影响任何流程，也不该挂到 ErrorBoundary 上。 */
export function warmUpVocabulary(): Promise<{ warmed: number; failed: number; missing: number }> {
  const jobs = WARMUP_IDS.map((id) => getPackage(id)?.load?.())
  return Promise.allSettled(jobs).then((rs) => ({
    warmed: rs.filter((r) => r.status === 'fulfilled').length,
    failed: rs.filter((r) => r.status === 'rejected').length,
    missing: jobs.filter((j) => j === undefined).length,
  }))
}
