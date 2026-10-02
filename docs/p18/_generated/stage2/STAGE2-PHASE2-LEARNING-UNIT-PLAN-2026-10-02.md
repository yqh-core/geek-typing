# 学习单元聚合页 · 最小产品方案（方案级，2026-10-02）

> 性质：**方案 / 原型级，本次不实现任何代码、不改 `registry.ts`、不建 `content/course|lesson`**。
> 上一刀（Stage 2 第一阶段）已 CLOSED，真机 23/23 PASS，见
> `STAGE2-PHASE1-CLOSED-OBSERVATION-2026-10-02.md`。本文档是 §0.1 状态树里
> **「下一刀 = 学习单元聚合页」** 的具体化。

---

## §0 本刀的边界（沿用上一刀，不放松）

严格按上一刀文档 §0.1 的状态树执行：

```
Stage 1  CLOSED
├── 基线冻结（registry.ts / 判据 2=15 / 判据 5 探测集 / 主 chunk 余量）
└── Stage 2 = 产品探索
     ├── 学习单元聚合页 ← 本刀（方案级）
     └── Course/Lesson ← 暂不做
```

本刀**明确不做**：

1. 不改 `src/core/content/registry.ts`（18 包注册表一个字符都不动）；
2. 不建 `content/course/*`、`content/lesson/*`；
3. **不产出任何 `relations.json`**（理由见 §5，这是本刀最重要的一条自我约束）；
4. 不增判据 2 计数（仍 15）、不增判据 5 探测集；
5. 不批量导入任何新内容；
6. 不改页签集合（仍 5 个 ⇒ `tests/e2e.mjs` 171 条用例零改动）；
7. 不伪造任何内容：音频没有二进制就不假装能播，字幕没有内容就不假装能看，练习没有题目就不假装能做。

> 第 3 条要特别说明：relation 是**下一刀**的事，不是这一刀。
> 现在产出 relations.json，只会产出一批没有真实数据点的空边 —— 正是 `relation.ts:11`
> 那句「无 topic/audio 内容前建关系是空数据」要防的情形。

---

## §1 核心命题：用户是否需要一个真正的「学习单元」作为核心消费入口？

**结论：需要。但要先把「学习单元」这个词的定义收窄，否则又回到堆架构。**

### 1.1 今天「学习单元」在用户眼里是什么

真机实测（`STAGE2-PHASE1` §2.5 O1）已经把答案钉死了：

- 用户的完整学习流程能跑通，中间无断点；
- 但整个流程里**只有「词汇」一种内容**：页签恒为 5 个学习动作（今日 / 打字练习 / 背单词 / 复习 / 进度），
  首页三张卡（到期复习 / 弱项专项 / 新词练习）**全部由词库驱动**；
- 8 个非 vocabulary 内容包（audio / listening / exercise / reading / topic / writing / speaking / collection）
  在 UI 层**零入口** —— 15 个可点控件命中 0，DOM 里三个 demo id 命中 0。

也就是说：**今天的「学习单元」= 一个扁平的词库清单。它有完整的动作，没有内容边界。**

### 1.2 因此「学习单元」这个词应被定义成什么

> **学习单元 = 一个有明确边界的词集合 + 一组挂在这个边界上的其它内容条目 + 一个能把它整段消费掉的入口。**

三个成分缺一不可，其中「第三项（入口）」是今天唯一的零。

据此给出对命题的回答：

| 问 | 答 |
|---|---|
| 用户需要一个真正的「学习单元」入口吗？ | **需要。** 因为「词库下拉选一个库」不是消费单元，它只是选数据；用户没有任何界面能回答「我现在在学哪一段、这一段还有什么别的」。 |
| 这个入口必须是 Course/Lesson 实体化吗？ | **不是。** Course 的价值来自「N 个单元要导航」，现在 N=1（只有 `ielts` + 3 个 demo 包），导航需求不存在。 |
| 那第一刀做几层？ | **一层**：只做「单元」这一层，且它**不是一个内容包**，而是现有 4 个包在 UI 层的一次聚合视图。 |

> 这就是上一刀 §3 说的「开另一刀」的具体形态：**不做实体化，做聚合。**

---

## §2 现状事实（每条都带出处，供后续动手时直接核对）

| # | 事实 | 出处 |
|---|---|---|
| **F1** | `ielts` 词包 3000 词，**每个词只有 `{word, translation, phonetic?, definition?}`，没有分组 / 序号 / 单元字段** ⇒ 词段划分没有任何天然键，只能由外部编排表显式声明。 | `content/vocabulary/ielts/words.json` 首条 `{word:"eagle",...}`；包 `description` 明写「按词频排序」 |
| **F2** | 三个 demo 条目包（`demo-audio-01` 5 条 / `demo-listening-01` 6 条 / `demo-exercise-01` 5 条）**只有 `{id, title}`，且与 `ielts` 的词没有任何 join key** —— 既没有词字段，也没有词出现在条目里的标注。 | 三份 `items.json` 全文 |
| **F3** | **音频没有二进制**，`content/` 下没有 `subtitle` 包；`subtitle` 在模型里是 **AssetKind 而不是 ContentType**（它是挂在 audio / listening 条目上的资产位，`optional:['subtitle']`）。 | `src/core/content/model/asset.ts:31`；`types/registry.ts:143/157`；`content/` 顶层只有 `audio collection exercise listening reading speaking topic vocabulary writing` |
| **F4** | **链路的「练习 → 复习 → 进度」三段今天已经能用**：开轮通道 `startRound(source?: WordItem[])` 本来就接受任意词集合，Practice / Memorize / ReviewPanel / ProgressPanel / StreakBar 全接得住。 | `src/App.tsx:93` `startRoundRef.current(source)`；`:332-348` 三个现有面板 |
| **F5** | **聚合不必改 registry**：`getAllPackages()` / `getCatalog()` / `loadPackage(id)` / `loadPackageData(id)` 四个 API 已导出，8 个试金石包的 `items.json` 早已走 `loadData` 动态 import（独立 `items-*.js` chunk）。 | `src/core/content/registry.ts:133/205/216` |
| **F6** | 关系查询恒空：`getRelations()` 当前 `return []`。 | `registry.ts:216-218` |

### 2.1 一个必须先说破的事实：这条链路里有 3 个环是空壳

用户提的链路是 `词汇 → 音频 → 字幕 → 练习 → 复习/进度`。逐环对内容层清点：

| 环节 | 数据真实存在吗 | 第一刀能做什么 |
|---|---|---|
| 词汇 | ✅ 3000 词真实、可打字、可背、可复习 | 完整可用 |
| 音频 | ⚠️ `demo-audio-01` 只有 5 条 `{id,title}` 的**元数据**，**没有任何音频二进制** | 只能列出条目 + 占位，**不能播放**（R2 托管未接入） |
| 字幕 | ❌ 内容层**完全不存在**（不是没接入，是连包都没有） | 预留资产位，UI 显式标注「待接入」 |
| 练习 | ⚠️ `demo-exercise-01` 只有 5 条 `{id,title}`，**没有题目数据** | 列出条目 + 占位，**不能作答** |
| 复习 / 进度 | ✅ `useReviewFlow` / `useAnalytics` / `useStreak` 全在跑 | 完整可用 |

> **所以聚合页第一刀的真实价值，不是「让用户用上音频和练习」，而是：
> 把「哪些内容已经能用、哪些还是空壳」第一次**明明白白摆在用户面前**。**
> 这比伪造一条能点但点开什么都没有的链路要诚实，也更有利于下一刀判断优先级。

这条是方案的定调：**第一刀交付的是「可见性」与「路径」，不是「可用性」。**

---

## §3 一个真实 IELTS 学习单元的链路定义

### 3.1 单元的形态

```
学习单元 unit-01「高频 100 词 · 听力输入」
├── 词段            vocabulary:ielts 的第 1–100 词（显式声明，不靠算法猜）
├── 音频条目        audio:demo-audio-01 的 5 条（listening 方向的入口）
├── 字幕位          ← 每条音频的 assets.optional.subtitle（内容层待接入）
├── 听力条目        listening:demo-listening-01 的 6 条
└── 练习条目        exercise:demo-exercise-01 的 5 条
```

**单元不是一个内容包** —— 它不进 `content/`、不进 `registry.ts`。它是 UI 层的一张**编排表**（§4 D2）。

### 3.2 七步链路（每一步都写清「今天是什么 / 第一刀做什么」）

```
① 进入单元
   今天：首页三张卡全是词库动作，没有任何入口指向一个「单元」
   第一刀：home 页新增「当前学习单元」区（见 D5），点一次进入单元视图

② 词汇
   今天：全 3000 词平铺，用户不知道自己在学哪一段
   第一刀：单元视图只装选中的词段（100 词），打字 / 背单词直接吃这个子集

③ 音频
   今天：零入口
   第一刀：列出 demo-audio-01 的 5 条；每条给「播放」按钮，但无二进制 ⇒ 显式显示
          「音频未接入（R2 托管待接入）」，不静默无反应、不伪造播放器

④ 字幕
   今天：不存在
   第一刀：在音频条目下给出字幕资产位，状态恒为「待接入」。
           ⚠️ 这条纠正一个常见误解：字幕**不参与 Content Relation**
           （它不是 ContentType，是 AssetKind —— 见 §5.2）

⑤ 练习
   今天：零入口
   第一刀：列出 demo-exercise-01 的 5 条；点进去显示「题目数据待接入」，
           ⚠️ 不作假作答界面

⑥ 复习
   今天：✅ 已有（ReviewPanel / useReviewFlow / 错题本 / 单挑轮）
   第一刀：不需要新写，直接复用现有开轮通道（F4）

⑦ 进度
   今天：✅ 已有（ProgressPanel / analytics / streak / 今日词数）
   第一刀：不需要新写；额外在单元视图上加「本单元完成度 = 本段词在 analytics 中的覆盖比」
```

### 3.3 一句话总结

> **七步里，⑥⑦ 两步「已经存在且能用」，② 只需换一个词段口径，
> 真正要新写的只有①③⑤ 三步的容器与列表 —— 而且①③⑤ 里的内容还是空壳。**
> 这就是「产品层缺口」和「架构层缺口」的分界线：本刀只跨产品层那条线。

---

## §4 关键决策（D1–D6）

### D1 单元层级：做「单元」这一层，不做「课程」

- **选**：第一刀只做 unit（一层）。
- **不选**：直接上 course → lesson 两层（那是未授权的 Course/Lesson 实体化，§0 明令不做）。
- **理由**：course 的唯一新增价值是「N 个单元的分组导航」。当前 N=1，
  做两层等于为不存在的需求付两次代价。
- **升级路径**：等出现 ≥3 个单元且用户真的要按序学时，再引入 course 包 —— 那时是真实产品需求。

### D2 聚合关系落在哪：UI 层编排表，**不是** relations.json

- **选**：一张静态单元定义表（单元 id → 词段 + 挂载的三个 demo 包 localId），
  放在 `src/` 下的一个纯数据模块里，消费 `getAllPackages()` / `loadPackageData()`（F5，不用改 registry）。
- **不选**：本刀产出 `relations.json`。
- **理由**：relation 是「内容↔内容」的持久契约，落进 `content/` 就要被 `content:validate`
  的relations 判据盯着；而本刀连一个 join key 都没有（F2），落下去就是编数据。
- **升级路径**：第二刀（聚合页真机跑通后）才把这张表升格为第一条 relations.json，形状见 §5。

### D3 词段怎么切：显式声明，**不靠排序算法**

- **选**：单元定义里显式写 `words: string[]`（显式词白名单）。
- **不选**：`range: [0, 100]`（依赖 `words.json` 的数组顺序 = 词频序）。
- **理由**：F1 已证明词表没有分组键，而排序本身是**不稳定契约** ——
  词表重排（重跑 content:build）会让 `range` 悄悄指向另一批词，且 `range` 在 UI 上
  不可能自查。显式白名单能被门禁逐条校验「这些词确实在包里」。
- **体积账**：第一刀 3 单元 × 50 词 = 150 个词字符串 ≈ 1.5 KiB raw（gzip 后 <0.5 KiB），
  主 chunk 余量 12.6%（384.21 / 439.45 KiB）内可容纳；若后续扩到 1000 词必须改走 lazy chunk（见 §6）。

### D4 词 ↔ 音频的 join key：**第一刀承认没有，不硬凑**

- **事实**：F2 —— `demo-audio-01` 的 5 条与 `ielts` 的词没有任何可对齐字段。
- **本刀做法**：单元 ↔ 音频走**单元级归属**（整包挂到单元上），不做**词级关联**。
- **下一刀才做词级**：给 audio / listening 的 `items.json` 条目加 `words: string[]`
  显式标注「本条音频覆盖哪些词」（形状见 §5.1），由门禁校验每个 id 都真实存在于该词包。
- **说明**：这一步需要扩 `items.json` 字段 —— 属于改内容载荷，**不是改 registry**，
  但仍会触发 `content:validate` / `content:build` 全量重跑，算进下一刀的代价。

### D5 页面形态：home 页内新增「单元区」+ 单元展开视图，**不加页签**

- **选**：不新增第 6 个页签。
- **理由**：页签集合是 e2e / UI 契约的锚点（`data-testid="tab-{id}"`，5 个固定 id）。
  加页签要改一处 UI 契约且可能牵动 171 条里若干断言 —— 为一个产品探索动全局契约，
  风险收益不匹配。
- **形态**：`home` 页内单元区 → 点选进入单元展开视图（仍是 `home` 这个 tab 内的 sub-view，
  不做路由、不引入 hash）。
- **已知取舍（写下来，不是缺陷）**：单元视图没有独立 URL，不可分享 / 不可收藏。
  第一刀接受；若要，第二刀再引入路由层。

### D6 不伪造可用性

- 音频无二进制 ⇒ 显示「音频未接入（R2 托管待接入）」，**不给能点但播不了的按钮**；
- 字幕无内容 ⇒ 状态恒「待接入」，**不显示空字幕面板**；
- 练习无题目 ⇒ 显示「题目数据待接入」，**不做假作答界面**；
- 零静默失败：这三处都必须有可见文案（延续 `App.tsx:97` 那类 `console.warn` + 可见反馈的既有口径，
  本项目对「点了没反应」零容忍）。

---

## §5 relation 到底应该长什么样（本刀定形状，下一刀落地）

### 5.1 结论先行

> **第一刀不产出 relations.json；第二刀（聚合页真机跑通后）产出的第一条边是
> `word ──appears_in──▶ audio / listening`，落地方式是**给音频条目加显式的词引用字段**。**

按现有 `relation.ts` 的约束逐条核对（**不需要改这个文件的一个字符**）：

- `RELATION_TARGET_TYPES.appears_in = ['audio','document','listening','reading']`
  ⇒ `word --appears_in--> audio` **本来就是合法边**，只是缺数据点；
- `RELATION_TARGET_TYPES.belongs_to = ['vocabulary','topic','collection']`
  ⇒ 这条边的 to 只能是**包级**类型；「词属于词库」由「词包在哪个包里」隐含表达，
  **不需要额外边**；
- `contains = ['word','audio','document','exercise']` ⇒ 只有出现「一个容器包包含若干条目」时才有意义，
  那是 course/lesson 实体化之后的事，**现在不落**；
- `prerequisite`（单元间先修）⇒ 等 N≥3 个单元且用户真的按序学时才落，**现在不落**。

### 5.2 字幕不是一条 relation（这条容易搞错，写死）

链路里出现的「字幕」，在模型里**不是内容类型而是资产**：

- `CONTENT_TYPES`（包级白名单 13 项：vocabulary/listening/audio/reading/topic/exercise/writing/speaking/grammar/document/collection/course/lesson）**没有 subtitle**；
- `AssetKind = 'audio'|'video'|'image'|'document'|'subtitle'|'other'` 里有 subtitle；
- `types/registry.ts:143/157` 里 audio / listening 的 `assets.optional` 都含 `subtitle`。

⇒ **字幕随宿主音频条目以 asset 形式挂载**（`content:audio:<ns>:<id>#a:<localId>`，形态由
`model/asset.ts` 定死），**Content Relation 不参与、也不该为它单独加一条边**。
将来做字幕，动的是 `items.json` 的资产位与 UI 渲染，**不动 relation 模型**。

### 5.3 Learning Relation 与它永不合并（重申铁律）

`studied / collected / mastered / in_progress / goal_of` 属于 **Learning 层**：
落在用户本地（localStorage / IndexedDB），**永不进 `content/`**。
单元完成度这类数据走 Learning 层，与 Content Relation 分属两张图（`relation.ts:18-22`）。

### 5.4 落地步骤（第二刀，本刀不执行）

1. 给 `content/audio/demo-audio-01/items.json` 与 `content/listening/demo-listening-01/items.json`
   的条目加 `words: string[]`（显式标注覆盖的词）；
2. 门禁加一条校验：每条引用的词必须真实存在于其所声明 vocabulary 包（`ielts`）；
3. 由构建期产出第一条 `relations.json`（`word --appears_in--> audio/listening`）；
4. `getRelations()` 从「恒返回 []」变成真实返回，UI 消费它做「这个词出现在哪条音频」的反向跳转。

> 第 1 步是**唯一会动内容载荷**的地方，也正因为它，它必须等第一刀跑通 ——
> 否则你不知道这条边到底该连到哪些词上，只能凭想象填。

---

## §6 工程代价与验收入口（动手前先算的账）

| 项 | 影响 | 说明 |
|---|---|---|
| `registry.ts` | **0** | 不改（F5 保证） |
| 判据 2（数据 chunk 数） | **0** | 不新增包 ⇒ 恒 15 |
| 判据 5（lazy 探测集） | **0** | 不新增包 ⇒ 探测集不增 |
| 判据 6（预热清单长度） | **0** | 不碰 `WARMUP_IDS` |
| `tests/e2e.mjs` 用例数 | **0** | 页签集合不变 ⇒ 171 条不动 |
| **判据 1（主 chunk 体积）** | ✅ **实测 PASS（唯一有实际影响的判据）** | 见下方实测回填 |

**动手前必须做的一步**：先在 `dist` 上跑一次 `check-bundle`，确认主 chunk 仍在
`384.21 ≤ 439.45 KiB raw / 119.06 ≤ 141.60 KiB gzip` 余量内。若超 ⇒ 单元容器改
`React.lazy` 动态 import（走独立 chunk），**这时也不必动判据 5 / 判据 6**（它们是包维度的，不是组件维度的）。

### §6.1 实测回填（2026-10-02，实现完成后）

**实现前基线**（`node scripts/check-bundle.mjs` EXIT=0）：主 chunk
**384.21 KiB raw / 119.06 KiB gzip**（余量 12.6% / 15.9%）。

**实现后实测**（`CODEBUDDY_SAFE_DELETE_ENABLED=0 npm run build` 后同脚本，EXIT=0）：
主 chunk **395.58 KiB raw / 122.00 KiB gzip**，余量 **10.0% / 13.8%**。

| 判据 | 结果 | 说明 |
|---|---|---|
| 判据 1 主 chunk | ✅ PASS | 395.58 / 122.00 ≤ 439.45 / 141.60。**增量 +11.37 / +2.94 KiB**，预算常量一行未改、棘轮方向正确 |
| 判据 2 数据 chunk 数 | ✅ PASS | 15（words 7 + items 8），未新增包 |
| 判据 3 预热预算 | ✅ PASS | gzip 330.02 ≤ 600 KiB，与基线同值 |
| 判据 4 manifest 投影 | ✅ PASS | J1/J2/J3 全 PASS |
| 判据 5 lazy 语义 | ✅ PASS | 15 个 lazy 包探测串在主 chunk 命中 **0** 次 |
| 判据 6 预热清单长度 | ✅ PASS | 2 ≤ 2（`[kaoyan, toefl]` 未动） |

> 增量比方案粗估（≤2 KiB）大，主因是**门面 `core/content/index.ts` 新导出
> `loadPackage` / `loadPackageData`**（见 §6.2）—— 这两个 API 是单元加载通道的必需件，
> 而 `ui-contract` 的 `bypassFacadeImports` 棘轮基线是 0，不允许 UI 深路径直引 registry，
> 所以只能从门面开口子。10 KiB 量级可接受，且仍留 44 KiB raw 余量。

### §6.2 一处必要的门面开口（不改 registry.ts）

`src/core/content/index.ts` 增加 `export { warmUpVocabulary, loadPackage, loadPackageData }`。
**`registry.ts` 本身零改动**（§6 表第一行仍然成立）—— 只是把已有的导出在门面重导出，
不改任何注册表内容、不新增包、不动 `WARMUP_IDS`。

**验收方式**（沿用上一刀的真机口径，headless Chrome + CDP）：
产出脚本 `scripts/verify-learning-unit.mjs`（零Playwright 依赖，复用本机 Chrome + CDP）：

- **V1**：从首页点进单元 → 看到词段 100 词 → 打字页学的正是这 100 词（不是全 3000）；
- **V2**：音频 / 字幕 / 练习三处**都有可见的「待接入」文案**，且**零 console error**、**零点了没反应**；
- **V3**：打字 → 背单词 → 复习 → 进度 **全链路走通且进度真的被记下来**；
- **V4**：`check-bundle` exit 0、`e2e` 171/171。

**实测结果（2026-10-02）**：V1–V3 真机 **24/24 通过**（EXIT=0），V4 离线
`check-bundle` EXIT=0 + `tests/e2e.mjs` **171/171** + `gate-architecture` **10/10** +
`boundary-ast` **20/20** + `ui-contract` **21/21**。

两个关键实测值（证明「学的正是这 100 词」不是推断）：
- 单元视图实际渲染 **100** 个 `unit-word` 节点，白名单首词 `eagle` / 末词 `bay`；
- 打字页首词实测落在白名单内（多次运行分别取到 `fatuous` / `licence` / `tropic`），
  打完后 `unit-progress` 由 `0%` 涨到 `1%` → `2%`，且 `localStorage['gt.learning.v2']`
  里能回读到刚打的词。

> 验收脚本本身踩了两个**可复用的坑**，已写进脚本注释：
> ① Home 页签的中文文案是「今日」不是「首页」——按文案找页签永远落空，
>  症状会被误读成「App 的 sub-view 状态坏了」；应按 `tab-*` 的 DOM id 选。
> ② 合成 `new KeyboardEvent('keydown')` **打不动字**（`isTrusted=false`，
>   React 收不到），必须走 CDP `Input.dispatchKeyEvent`（= Playwright
>   `page.keyboard.type()` 同一条通道，`tests/e2e.mjs:177` 用的就是它）。

---

## §7 本刀交付后，Stage 2 的状态会变成什么

```
Stage 1  CLOSED（基线冻结，未被本刀解除）
└── Stage 2 = 产品探索
     ├── 学习单元聚合页 ← 本刀（产品层聚合 + 首次可见性）
     │     └── 产出：单元编排表、真机 V1–V4
     └── Course/Lesson ← 仍暂不做
           └── 解禁条件（第 3 条，不是第 2 条）：
               出现「一个课程里有 N 个单元、需要分组导航」的**真实产品需求**，且重新评审
```

下一刀（在 V1–V4 真机通过后）才回答 relation 的形状落地（§5.4），
再之后才是 course/lesson 实体化 —— 顺序不变。

---

## §8 明记录入的观察项（不整改，等下一刀一起看）

沿用上一刀 §3.1：首屏 JS 合计 **1320.60 KiB**（主 chunk 393432 B + 预热 `kaoyan`/`toefl` 两个
`words-*` 483087 / 475777 B），其中预热占 2/3。

**本刀之后要统一测的链路**（这是第一次真正能测到它，因为聚合页才让「进入单元」成为一步）：

```
首屏 → 进入 IELTS → 打开学习单元 → 加载音频 / 字幕 / 练习
```

在那条链路跑完之前，**不得以 1320.6 KiB 为由改 `scripts/check-bundle.mjs` 的预算常量或预热清单**
（上一刀 §3.1 已经写死）。
