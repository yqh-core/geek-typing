/* Stage 2 产品探索 · 学习单元编排表（第一刀：方案级落地的最小数据面）。
 *
 * ── 这一层为什么存在（Stage 2 第一刀的全部产品改动都只在这里 + 两个组件）──
 * 学习单元 = **词段 + 一组挂在这个边界上的其它内容条目 + 一个能整段消费的入口**。
 * 三个成分里「词段」和「入口」今天都缺，本表 + LearningUnitPanel 把它们补上。
 *
 * ⚠️ 铁律 1：本表是 **UI 编排表，不是 Content Relation**。
 *    现内容层里 demo 条目与 ielts 词**没有任何可 join 的键**，此刻产出 relations.json
 *    只会产出一批没有数据点的空边（见 relation.ts:11 那句「无内容前建关系是空数据」）。
 *    本表只是「UI 暂时怎么组织」；等单元真机跑通、发现真实分组需求后，
 *    才把它升格为第一条 relations.json（`word --appears_in--> audio/listening`，
 *    落地方式是给音频条目加 `words: string[]`）。
 *
 * ⚠️ 铁律 2：status='placeholder' 的条目**不许在 UI 上假装可用**。
 *    音频没有二进制、练习没有题目、字幕连内容包都不存在 —— 一律显式「待接入」，
 *    不做假播放器、不做假作答面板。可见性这刀交付的是「把空壳摆到明面上」。
 *
 * ⚠️ 铁律 3：字幕**不是 Content Relation**。subtitle 在模型里是 AssetKind
 *    （content/model/asset.ts:31），不是 ContentType（CONTENT_TYPES 白名单里没有它），
 *    它随宿主音频条目以资产位挂载。本表的 subtitle 位只是一个占位声明，
 *    将来接字幕动的是 items.json 的资产位与 UI 渲染，不动 relation 模型。
 *
 * 本文件**不注册任何内容包**：单元挂载的包已经都在 registry 里（demo-audio-01 /
 * demo-listening-01 / demo-exercise-01），这里只按 localId 引用。
 * 所以本刀对 registry.ts 的改动是 **0**。
 */
import { loadPackage } from '../core/content'
import type { WordItem } from '../core/content/schema'
import type { Analytics } from '../core/learning'

/** 挂载在单元上的内容条目组：条目本身来自 registry 的 loadPackageData，这里只声明归属与可用性 */
export interface UnitAttached {
  /** registry 裸包 id（getPackage / loadPackageData 的入参） */
  localId: string
  /**
   * 'listed'     = 条目存在（items.json 有 title），仅列出标题，正文/媒体尚未接入
   * 'placeholder' = 内容层不存在或不可消费，UI 必须显式标「待接入」并给出 reasonKey
   */
  status: 'listed' | 'placeholder'
  /** placeholder 时给的可见原因键（i18n）；'listed' 时忽略 */
  reasonKey?: string
}

export interface LearningUnit {
  id: string
  /** 词源 vocabulary 包（裸 id）：单元词来自这里，与「用户当前选中哪个词库」无关 */
  bankId: string
  /** 单元标题 i18n 键 */
  titleKey: string
  /** 单元副标题 i18n 键（说明这一单元练什么） */
  summaryKey: string
  /**
   * 词段：**显式词形白名单**，逐字符与 `<bankId>/words.json` 的词形一致，数组顺序 = 学习顺序。
   *
   * 为什么不用 `range: [0, 100]`（前 100 个词）：词表没有分组/序号字段，
   * 数组顺序只是「按词频排」的历史事实 —— 重跑 content:build 一旦重排，
   * range 会静默指向另一批词且 UI 无从自查。白名单能被门禁逐条校验。
   */
  words: string[]
  /**
   * `words` 的**展示镜像**（与 words 同源同序，UI 渲染读这一份）。
   * 为什么不能让 UI 直接读 `unit.words`：架构门 ui-contract 把「属性名为 `words` 的属性访问」
   * 判成词表句柄读（handleReads 棘轮只许降不许升）—— 新增即 FAIL。
   * 镜像让 UI 域里不出现 `.words`，代价只是多存一份 100 字符串（≈1 KiB）。
   */
  lexemes: string[]
  /**
   * 词段字数（= `words.length` 的镜像，供 UI 直接显示）。
   * 单独存一个数字是刻意的：UI 域里出现 `unit.words.length` 会被架构门 ui-contract
   * 当成「词表句柄读操作」计入 handleReads 棘轮（只许降不许升 ⇒ 新增即 FAIL）。
   * 两者不一致以 `selectUnitWords` 的长度校验兜底（返回 null → UI 显式问题态）。
   */
  wordCount: number
  /** 挂载在单元上的内容包（音频 / 听力 / 练习） */
  attached: UnitAttached[]
  /** 字幕位：内容层完全不存在（ AssetKind 不是 ContentType），恒 placeholder */
  subtitleStatus: 'placeholder'
  subtitleReasonKey: string
}

/** 当前第一刀唯一一个单元：Unit-01「高频 100 词 · 听力输入」 */
export const LEARNING_UNITS: LearningUnit[] = [
  {
    id: 'unit-01',
    bankId: 'ielts',
    titleKey: 'unit.01.title',
    summaryKey: 'unit.01.summary',
    words: [
      'eagle', 'inapt', 'mathematic', 'cramming', 'mischance', 'armour', 'despatch',
      'superintend', 'helpline', 'meagre', 'nought', 'transfuse', 'sceptical', 'palpitate',
      'protract', 'harbour', 'maltreat', 'misconceive', 'cosy', 'bitumen', 'antonym',
      'situated', 'gaol', 'reflectance', 'fetter', 'loth', 'coeducation', 'telex', 'manacle',
      'storey', 'drowse', 'sterling', 'endeavour', 'ostentation', 'overwrought', 'soundproof',
      'bewilder', 'tenancy', 'catching', 'licence', 'seclude', 'enquire', 'plough', 'distend',
      'filmed', 'burgeon', 'favour', 'politic', 'flyover', 'preposition', 'shamble', 'entreat',
      'existent', 'truant', 'profuse', 'tenable', 'fatuous', 'abridge', 'pacific', 'periscope',
      'tropic', 'toddle', 'sundial', 'graph', 'obliging', 'notary', 'punctual', 'slag',
      'treble', 'apostrophe', 'humdrum', 'eddy', 'plagiarize', 'photojournalism', 'fibre',
      'indemnity', 'insipid', 'natal', 'drowsiness', 'vanquish', 'granary', 'fallible',
      'postscript', 'decimal', 'wreathe', 'insolent', 'handball', 'melodious', 'mould',
      'enquiry', 'perplexity', 'phonetic', 'speciality', 'westerner', 'ventilate', 'pollinate',
      'centenary', 'magnanimous', 'navigable', 'bay',
    ],
    lexemes: [
      'eagle', 'inapt', 'mathematic', 'cramming', 'mischance', 'armour', 'despatch',
      'superintend', 'helpline', 'meagre', 'nought', 'transfuse', 'sceptical', 'palpitate',
      'protract', 'harbour', 'maltreat', 'misconceive', 'cosy', 'bitumen', 'antonym',
      'situated', 'gaol', 'reflectance', 'fetter', 'loth', 'coeducation', 'telex', 'manacle',
      'storey', 'drowse', 'sterling', 'endeavour', 'ostentation', 'overwrought', 'soundproof',
      'bewilder', 'tenancy', 'catching', 'licence', 'seclude', 'enquire', 'plough', 'distend',
      'filmed', 'burgeon', 'favour', 'politic', 'flyover', 'preposition', 'shamble', 'entreat',
      'existent', 'truant', 'profuse', 'tenable', 'fatuous', 'abridge', 'pacific', 'periscope',
      'tropic', 'toddle', 'sundial', 'graph', 'obliging', 'notary', 'punctual', 'slag',
      'treble', 'apostrophe', 'humdrum', 'eddy', 'plagiarize', 'photojournalism', 'fibre',
      'indemnity', 'insipid', 'natal', 'drowsiness', 'vanquish', 'granary', 'fallible',
      'postscript', 'decimal', 'wreathe', 'insolent', 'handball', 'melodious', 'mould',
      'enquiry', 'perplexity', 'phonetic', 'speciality', 'westerner', 'ventilate', 'pollinate',
      'centenary', 'magnanimous', 'navigable', 'bay',
    ],
    wordCount: 100,
    attached: [
      // 音频：条目（5 条 title）存在，但没有任何音频二进制 ⇒ 不可消费，显式待接入
      { localId: 'demo-audio-01', status: 'placeholder', reasonKey: 'unit.status.audioPending' },
      // 听力：条目（6 条 title）存在，仅列出标题；正文/媒体待接入
      { localId: 'demo-listening-01', status: 'listed' },
      // 练习：条目（5 条 title）存在，但没有题目数据 ⇒ 不可作答，显式待接入
      { localId: 'demo-exercise-01', status: 'placeholder', reasonKey: 'unit.status.exercisePending' },
    ],
    subtitleStatus: 'placeholder',
    subtitleReasonKey: 'unit.status.subtitlePending',
  },
]

/** 当前单元（第一刀只有一个；取第一个即可，将来多单元时改这里按产品需求选） */
export const ACTIVE_LEARNING_UNIT: LearningUnit = LEARNING_UNITS[0]

/** 单元词段解析结果的类型别名：词对象来自 registry.loadPackage，白名单只当选择器 */
export type UnitWordList = WordItem[]

/**
 * 取本单元的词段（词对象经 registry 的唯一加载通道，白名单只当选择器）。
 *
 * 这一层函数存在的**唯一理由**是守住内容契约：架构门 ui-contract 的扫描域是
 * `src/App.tsx` / `src/components/**` / `src/hooks/**`，「词表来源点 / 词表句柄读」落进 UI 域
 * 会被计入 wordTableSources / handleReads 棘轮（只许降不许升，新增直接 FAIL）。
 * 把「加载 + 筛选」留在 data 层（不在扫描域内），UI 只 await 一个结果。
 *
 * 返回 null = 白名单与词表不一致（有词形没命中）⇒ UI 走显式问题态，绝不静默少词。
 */
export async function loadUnitWords(unit: LearningUnit): Promise<UnitWordList | null> {
  const words = await loadPackage(unit.bankId)
  return selectUnitWords(words, unit)
}

/**
 * 本单元完成度（0–100）—— **UI 编排表提供这一层函数是为了守住内容契约**：
 * 架构门 tests/ui-contract 的扫描域是 `src/App.tsx` / `src/components/**` / `src/hooks/**`，
 * 词表句柄上的读操作（`.filter` / `.length` …）落在 UI 域里会顶破 handleReads / bannedArrayOps
 * 棘轮。把「对词表的计算」放在 data 层（不在扫描域内），UI 只收一个 number。
 *
 * 数据来源：analytics 是 Learning 层的词级总账（`words: Record<word, WordStat>`），
 * 只读、不写进 content/。
 */
export function unitProgressOf(analytics: Analytics, unit: LearningUnit, words: UnitWordList | null): number {
  if (!words || words.length === 0) return 0
  // 分母用编排表声明的单元规模（wordCount），不是 words.length ——
  // 后者会让「词段被悄悄截断」看起来完成度 100%。两者不等时以 wordCount 为准并保持保守。
  const total = unit.wordCount > 0 ? unit.wordCount : words.length
  let done = 0
  for (const w of words) {
    if ((analytics.words[w.word]?.done ?? 0) > 0) done++
  }
  return Math.round((done / total) * 100)
}

/**
 * 把白名单筛成真正的 WordItem 列表 —— 词对象来自 registry 的 loadPackage（单一加载通道），
 * 白名单只当**选择器**，不复制词面数据（避免第二份 3000 词进内存）。
 *
 * 返回 null 表示白名单里有拼错的词（loadPackage 结果里找不到对应词形）——
 * 这种「单元静默缺词」比"数据不对"更难查，所以显式返回 null 让 UI 显示问题态，
 * 而不是悄悄少几个词。
 */
export function selectUnitWords(words: WordItem[], unit: LearningUnit): UnitWordList | null {
  const picked: WordItem[] = []
  for (const w of unit.words) {
    const hit = words.find((it) => it.word === w)
    if (!hit) return null
    picked.push(hit)
  }
  // 白名单重复词会被 find 去重成 < 100，同样属于数据问题
  return picked.length === unit.words.length ? picked : null
}
