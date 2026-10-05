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
 *
 * ── A1（多实例化）：本表从「单值」变成「多单元 + 运行时选中」──
 * 第一刀只有 unit-01 一个单元，所以「当前单元」被写成了单值常量 `ACTIVE_LEARNING_UNIT`。
 * A1 让同一模型支持多个单元：`LEARNING_UNITS` 追加 unit-02（**同 bankId 'ielts'** ——
 * 多实例化不引入新数据源、不新增许可），「当前单元」改为运行时状态（App 的 unitId +本文件的
 * `learningUnitById` / `DEFAULT_LEARNING_UNIT_ID`）。**本表仍是 UI 编排表**：
 * 铁律 1（不升格为 Content Relation）、铁律 2（placeholder 必须给 reasonKey）逐条不变，
 * 对 registry.ts / relations / 词表 / schema 的改动依旧为 **0 行**。
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
  {
    id: 'unit-02',
    // ⚠️ 与 unit-01 **同源同包**（都是 ielts）：A1 是「已有模型的多实例化」，
    //不引入新数据源、不新增许可 —— 单元之间只有词段不同，bankId 必然相同。
    bankId: 'ielts',
    titleKey: 'unit.02.title',
    summaryKey: 'unit.02.summary',
    /* 词段 = ielts 包词频序的**下标 100..200**（与 unit-01 的 0..99 首尾相接、不重叠）。
     * 同 unit-01 的约定：显式词形白名单，`words` 与 `lexemes` 两份**逐项镜像**、同序即学习顺序。
     *
     * 本刀实测确认（不是推断，见交付报告）：ielts 3000 词中有 14 个**没有 `phonetic` 字段**，
     * `reinforced` 就是其中之一 —— 而 unit-01 的 100 词全部带音标，所以「音标缺失」这条渲染
     * 路径在此之前从未被本单元走过。数据侧按铁律**保持原样不补**（不补音标、不换词）：
     * 缺音标是词表事实，不是数据缺陷，UI 侧的容错由 A1 的第 ③ 步单独验证。 */
    words: [
      'perceptible', 'unconvincing', 'matrimony', 'meteorology', 'practicable', 'eke', 'gaily',
      'headstrong', 'sulphur', 'fortnight', 'perspire', 'timidity', 'microfilm', 'thesaurus',
      'reinforced', 'august', 'defile', 'fester', 'trinity', 'horticulture', 'petrol',
      'meteoric', 'offence', 'leprosy', 'combustible', 'infirmary', 'perturb', 'obstinate',
      'oblong', 'typhoon', 'reverent', 'zoology', 'baldness', 'dictation', 'defence',
      'gratuity', 'manifold', 'superstructure', 'forte', 'frost', 'kelp', 'venerate',
      'ostensible', 'teem', 'bookshop', 'ruinous', 'flabby', 'pliable', 'transgress',
      'excrement', 'microbiology', 'perishable', 'sportswear', 'slander', 'repatriate', 'hubbub',
      'tweezers', 'vehement', 'equivocal', 'ungainly', 'appreciable', 'insolvent', 'neurosis',
      'granular', 'fastidious', 'sociable', 'platitude', 'badminton', 'drudgery', 'abbreviation',
      'jeer', 'lubricate', 'negotiable', 'mercantile', 'delirium', 'expedient', 'piecemeal',
      'chaste', 'naught', 'scrupulous', 'pervert', 'bookkeeper', 'tyrannical', 'extort',
      'ponderous', 'storehouse', 'plankton', 'alphabetical', 'corrode', 'succinct', 'laudable',
      'oscillate', 'posthumous', 'plumb', 'quench', 'prologue', 'prospectus', 'plaintive',
      'isle', 'muddle',
    ],
    // `words` 的展示镜像（与 words 逐项一致）。理由见 LearningUnit.lexemes 的注释：
    // UI 域里不出现属性名为 `words` 的词表句柄读。
    lexemes: [
      'perceptible', 'unconvincing', 'matrimony', 'meteorology', 'practicable', 'eke', 'gaily',
      'headstrong', 'sulphur', 'fortnight', 'perspire', 'timidity', 'microfilm', 'thesaurus',
      'reinforced', 'august', 'defile', 'fester', 'trinity', 'horticulture', 'petrol',
      'meteoric', 'offence', 'leprosy', 'combustible', 'infirmary', 'perturb', 'obstinate',
      'oblong', 'typhoon', 'reverent', 'zoology', 'baldness', 'dictation', 'defence',
      'gratuity', 'manifold', 'superstructure', 'forte', 'frost', 'kelp', 'venerate',
      'ostensible', 'teem', 'bookshop', 'ruinous', 'flabby', 'pliable', 'transgress',
      'excrement', 'microbiology', 'perishable', 'sportswear', 'slander', 'repatriate', 'hubbub',
      'tweezers', 'vehement', 'equivocal', 'ungainly', 'appreciable', 'insolvent', 'neurosis',
      'granular', 'fastidious', 'sociable', 'platitude', 'badminton', 'drudgery', 'abbreviation',
      'jeer', 'lubricate', 'negotiable', 'mercantile', 'delirium', 'expedient', 'piecemeal',
      'chaste', 'naught', 'scrupulous', 'pervert', 'bookkeeper', 'tyrannical', 'extort',
      'ponderous', 'storehouse', 'plankton', 'alphabetical', 'corrode', 'succinct', 'laudable',
      'oscillate', 'posthumous', 'plumb', 'quench', 'prologue', 'prospectus', 'plaintive',
      'isle', 'muddle',
    ],
    wordCount: 100,
    attached: [
      // 与 unit-01 挂同一批 demo 包（A1 不新增内容包、不改 registry）：可用性判定逐项照抄，
      // 理由见 unit-01 的同名字段 —— 音频无二进制、练习无题目，一律显式「待接入」。
      { localId: 'demo-audio-01', status: 'placeholder', reasonKey: 'unit.status.audioPending' },
      { localId: 'demo-listening-01', status: 'listed' },
      { localId: 'demo-exercise-01', status: 'placeholder', reasonKey: 'unit.status.exercisePending' },
    ],
    subtitleStatus: 'placeholder',
    subtitleReasonKey: 'unit.status.subtitlePending',
  },
  {
    /* Unit-03 —— A1-E：IELTS Academic Unit 01「Education」。
     *
     * ⚠️ 与 unit-01 / unit-02 的**性质不同**，别混为一谈：
     *   unit-01/02 = Stage 2 探索期的「词段切片」单元（bankId 都是 ielts，按词频切 0..99 / 100..199）。
     *   unit-03    = 第一套**正式内容包驱动**的单元：词段来自本单元自己的词汇包
     *                （ielts-edu-01-vocab，32 词，PM 内容侧补齐中文释义），
     *                并挂载同单元的 reading / exercise 正式包。
     *
     * 词段规模 32 词是**内容事实**，不是凑门禁：PM 的 Unit 01 规格就是 20–40 词。
     * 相应地 scripts/verify-learning-unit.mjs 的 100 词断言已改为「从本表派生当前单元词数」，
     * 而不是把 Education 硬补到 100 词。
     *
     * 后续 unit-04 = 第二套正式内容包（Environment/Climate，30 词，前缀 ielts-env-02），
     * 两套单元的关系是「同一个 playing 层里并列的正式单元」：各自带自己的词汇包，
     * 互不复用 bankId；unit-01/02 仍是探索期词段切片，只有 unit-03/04 走内容包驱动。
     *
     * 挂载的两个包都是 status 'listed' —— 它们**有真实载荷**（正文 / 15 题），
     * 不是「条目存在但内容没有」的 placeholder。这里不给 reasonKey：
     * 铁律 2 要求 placeholder 才给原因，给 listed 的条目挂原因文案是自相矛盾的假提示。 */
    id: 'unit-03',
    // 本单元自己的词汇包（32 词）；与 unit-01/02 的 bankId 'ielts' 不同源，属新增内容包。
    bankId: 'ielts-edu-01-vocab',
    titleKey: 'unit.03.title',
    summaryKey: 'unit.03.summary',
    words: [
      'academic', 'assessment', 'institution', 'qualification', 'vocational', 'participation',
      'outcome', 'graduate', 'flexibility', 'motivation', 'instruction', 'evaluate',
      'continuous', 'practical', 'responsibility', 'conventional', 'expanded', 'alternative',
      'effectively',
      'transfer', 'circumstance', 'proportion', 'route', 'demonstrate', 'accumulation',
      'resource', 'reveal', 'sufficient', 'increasingly', 'relevant', 'established', 'approach',
    ],
    // `words` 的展示镜像（与 words 逐项一致）。理由见 LearningUnit.lexemes 的注释：
    // UI 域里不出现属性名为 `words` 的词表句柄读。
    lexemes: [
      'academic', 'assessment', 'institution', 'qualification', 'vocational', 'participation',
      'outcome', 'graduate', 'flexibility', 'motivation', 'instruction', 'evaluate',
      'continuous', 'practical', 'responsibility', 'conventional', 'expanded', 'alternative',
      'effectively',
      'transfer', 'circumstance', 'proportion', 'route', 'demonstrate', 'accumulation',
      'resource', 'reveal', 'sufficient', 'increasingly', 'relevant', 'established', 'approach',
    ],
    wordCount: 32,
    attached: [
      // 阅读：7 段正文（464 词）已入库，可消费 ⇒ listed
      { localId: 'ielts-edu-01-reading', status: 'listed' },
      // 练习：15 题（含 answer / explanation / skill）已入库，可作答 ⇒ listed
      { localId: 'ielts-edu-01-exercise', status: 'listed' },
    ],
    subtitleStatus: 'placeholder',
    subtitleReasonKey: 'unit.status.subtitlePending',
  },
  {
    /* Unit-04 —— A2：IELTS Academic Unit 02「Environment / Climate」。
     *
     * ⚠️ 与 unit-03 是**并列的第二套正式内容包**，不是它的变体：
     *   bankId 用自己的词汇包 ielts-env-02-vocab（30 词，与 unit-03 的 ielts-edu-01-vocab 不共用），
     *   reading / exercise 也是同前缀的独立包（ielts-env-02-reading / -exercise）。
     *   两套单元走同一条接入路径（同款注释结构、同款 listed 判定），后续再加第 N 套照抄即可。
     *
     * 词段规模 30 词同样是**内容事实**（PM 的 Unit 02 规格 20–40 词），不是凑门禁。
     *
     * 挂载的两个包都是 status 'listed' —— 它们**有真实载荷**（8 段正文 / 15 题），
     * 不是「条目存在但内容没有」的 placeholder。这里不给 reasonKey：
     * 铁律 2 要求 placeholder 才给原因，给 listed 的条目挂原因文案是自相矛盾的假提示。 */
    id: 'unit-04',
    // 本单元自己的词汇包（30 词）；与 unit-01/02/03 的 bankId 不同源，属新增内容包。
    bankId: 'ielts-env-02-vocab',
    titleKey: 'unit.04.title',
    summaryKey: 'unit.04.summary',
    words: [
      'albedo', 'anthropogenic', 'canopy', 'evapotranspiration', 'impermeable', 'mitigation',
      'vulnerability', 'susceptibility', 'threshold', 'ambient', 'exposure', 'urbanization',
      'emission', 'density', 'inequality', 'ventilation', 'suburban', 'reservoir',
      'exceed', 'pronounced', 'release', 'accumulate', 'compound', 'allocate', 'infrastructure',
      'fragment', 'mature', 'excursion', 'regulatory', 'moderate',
    ],
    // `words` 的展示镜像（与 words 逐项一致）。理由见 LearningUnit.lexemes 的注释：
    // UI 域里不出现属性名为 `words` 的词表句柄读。
    lexemes: [
      'albedo', 'anthropogenic', 'canopy', 'evapotranspiration', 'impermeable', 'mitigation',
      'vulnerability', 'susceptibility', 'threshold', 'ambient', 'exposure', 'urbanization',
      'emission', 'density', 'inequality', 'ventilation', 'suburban', 'reservoir',
      'exceed', 'pronounced', 'release', 'accumulate', 'compound', 'allocate', 'infrastructure',
      'fragment', 'mature', 'excursion', 'regulatory', 'moderate',
    ],
    wordCount: 30,
    attached: [
      // 阅读：8 段正文（814 词）已入库，可消费 ⇒ listed
      { localId: 'ielts-env-02-reading', status: 'listed' },
      // 练习：15 题（10 mcq + 5 tfng，含 answer / explanation / skill）已入库，可作答 ⇒ listed
      { localId: 'ielts-env-02-exercise', status: 'listed' },
    ],
    subtitleStatus: 'placeholder',
    subtitleReasonKey: 'unit.status.subtitlePending',
  },
  {
    /* Unit-05 —— A3：IELTS Academic Unit 03「Technology & Innovation」。
     * 切口是 **AI 辅助医学影像诊断的验证（validation）与责任归属（accountability）**。
     *
     * ⚠️ 与 unit-03 / unit-04 是**并列的第三套正式内容包**，不是任何一套的变体：
     *   bankId 用自己的词汇包 ielts-tech-03-vocab（30 词，与前两套的 bankId 均不共用），
     *   reading / exercise 也是同前缀的独立包（ielts-tech-03-reading / -exercise）。
     *   这是**第一个跨题材**的正式内容包（Education / Environment 都是自然-社会描述型，
     *   本套是术语密集、分层（模型层 / 数据层 / 制度层）的技术-医学文本），
     *   用来暴露「内容假设写死在题材上」的脚手架隐患。接入路径与前两套同款。
     *
     * 词段规模 30 词同样是**内容事实**（PM 的 Unit 03 规格 20–40 词），不是凑门禁。
     * 30 词的顺序**逐项同序取自检包磁盘 `words.json`**（不是按字母重排、也不是照抄 unit-04），
     * 前 18 词（algorithm … accountability）恰好构成 Tier A，后 12 词为 Tier B。
     *
     * 挂载的两个包都是 status 'listed' —— 它们**有真实载荷**（8 段正文 804 词 / 15 题），
     * 不是「条目存在但内容没有」的 placeholder。这里不给 reasonKey：
     * 铁律 2 要求 placeholder 才给原因，给 listed 的条目挂原因文案是自相矛盾的假提示。 */
    id: 'unit-05',
    // 本单元自己的词汇包（30 词）；与 unit-01/02/03/04 的 bankId 不同源，属新增内容包。
    bankId: 'ielts-tech-03-vocab',
    titleKey: 'unit.05.title',
    summaryKey: 'unit.05.summary',
    words: [
      'algorithm', 'annotation', 'audit', 'benchmark', 'bias', 'cohort',
      'dataset', 'deployment', 'drift', 'generalisation', 'inference', 'latency',
      'oversight', 'provenance', 'reproducibility', 'screening', 'validation', 'accountability',
      'attribute', 'curate', 'curtail', 'displace', 'discriminate', 'embed',
      'mitigate', 'obscure', 'replicate', 'skew', 'understate', 'corroborate',
    ],
    // `words` 的展示镜像（与 words 逐项一致）。理由见 LearningUnit.lexemes 的注释：
    // UI 域里不出现属性名为 `words` 的词表句柄读。
    lexemes: [
      'algorithm', 'annotation', 'audit', 'benchmark', 'bias', 'cohort',
      'dataset', 'deployment', 'drift', 'generalisation', 'inference', 'latency',
      'oversight', 'provenance', 'reproducibility', 'screening', 'validation', 'accountability',
      'attribute', 'curate', 'curtail', 'displace', 'discriminate', 'embed',
      'mitigate', 'obscure', 'replicate', 'skew', 'understate', 'corroborate',
    ],
    wordCount: 30,
    attached: [
      // 阅读：8 段正文（804 词）已入库，可消费 ⇒ listed
      { localId: 'ielts-tech-03-reading', status: 'listed' },
      // 练习：15 题（10 mcq + 5 tfng，含 answer / explanation / skill）已入库，可作答 ⇒ listed
      { localId: 'ielts-tech-03-exercise', status: 'listed' },
    ],
    subtitleStatus: 'placeholder',
    subtitleReasonKey: 'unit.status.subtitlePending',
  },
]

/**
 * 默认选中单元（多实例化后的初始值）。
 *
 * ⚠️ 这里**不再**有「当前单元」的单值常量：A1 把「当前单元」变成**运行时状态**
 * （见 App 的 `unitId` state + `learningUnitById`），默认单元只是初始值而非唯一入口。
 * 保留一个「默认」而不是删掉，是为了让初始选中项仍是**单一事实源**（写在数据层，UI 不硬编码 id）。
 */
export const DEFAULT_LEARNING_UNIT_ID: string = LEARNING_UNITS[0].id

/**
 * 按 id 取单元 —— **找不到时回落到默认单元**（不返回 null）。
 *
 * 为什么放在 data 层：App 要按 id 解析单元，解析需要遍历 `LEARNING_UNITS`。
 * 架构门 ui-contract 的扫描域含 `src/App.tsx`，遍历放在那里会给 UI 域增加一处
 * 数组算子（`find` 属 READ_OPS）。放数据层则 UI 只收一个结果，与
 * `loadUnitWords` / `unitProgressOf` 同一口径。
 *
 * 回落到默认单元而不是抛错：id 只来自本表的 `id` 字段与 `LEARNING_UNITS` 自身，
 * 逻辑上不可达；真不可达时给一个可用单元（显式降级）好过整页崩掉。
 */
export function learningUnitById(id: string): LearningUnit {
  return LEARNING_UNITS.find((u) => u.id === id) ?? LEARNING_UNITS[0]
}

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
