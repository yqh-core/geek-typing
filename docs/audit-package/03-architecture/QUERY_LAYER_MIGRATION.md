# Query 层迁移方案（UI 接 Content Query Layer）

> **文档状态**：方案设计，**未实施**（本文不改任何代码，仅给出迁移规格与验收判据）
> **产出日期**：2026-09-27
> **责任人**：AI 架构调研
> **核对基线 commit**：`4152eb2`（与 `04-content/CONTENT_CONTRACT.md` 导读同基线）
> **上游规范**：`CONTENT_CONTRACT.md` §12（P1 UI Contract）、§13（Content Loading Strategy）
> **上游导读**：`docs/audit-package/04-content/CONTENT_CONTRACT.md`、`docs/audit-package/03-architecture/SYSTEM_ARCHITECTURE.md#4`

---

## 0. 本文的标注约定（严格区分事实与推断）

| 标记 | 含义 |
|---|---|
| **[实测]** | 本次从 `4152eb2` 工作区**逐行 grep / sed 读出**，可复现，附 `文件:行` |
| **[契约]** | 出自 `CONTENT_CONTRACT.md` 冻结原文，附 §/行号 |
| **[推断]** | 基于实测的主观判断／风险预判，**未经验证**，不得当作结论引用 |
| **[反证]** | 实测结果与上游文档记载**冲突**，本文以实测为准并显式订正 |

> ⚠️ 全文所有 `文件:行` 均以 **`4152eb2` 工作区实测**为准。
> 行号是**易失的**：任何一次插入／删除都会使其失效（本文 §9 就是一个真实的行号失效案例）。

---

## 1. TL;DR（三条最关键结论）

1. **契约 §12.6 的「17 处直读」计数不可信** **[反证]** —— 逐行核验后，真正「读词数组做操作」的只有
   **11 处**，其中**只有 8 处需要 Query 层**；另 3 处是**必须永久豁免**的词数元数据／用户自建词库，改了会坏功能。
2. **Query 层缺的入口只有一个** —— `queryWord(packageId, word): WordHit | null`。
   补这**一个函数**即可吃掉 8 处里的 4 处（含契约亲自点名的 🔴 静默空释义缺陷），单位收益最高。
3. **`hasFeature()` 不需要接线** **[推断]** —— 契约 §12.3 要求的三处替换全**已失效**且**语义错误**
   （会拿包能力覆盖用户显式选择），渲染侧四处**已比包级开关更精确**。建议把「`hasFeature` 调用数 = 0」从债务指标移除。

---

## 2. 直读位置清单表

### 2.1 计数订正（先说清「17 处」是怎么来的）

| 说法 | 来源 | 实测核验 |
|---|---|---|
| 「UI 直读词数组 **17 处**」 | **[契约]** `CONTENT_CONTRACT.md:730` | **[反证]** 该行自带的行号清单已大面积失效 |
| 契约 §12.6 行号清单 | **[契约]** `CONTENT_CONTRACT.md:730`：`App.tsx:191-199/231/232/241/251/253/569/572` + `ReviewPanel.tsx:46/47/50-55` + `Memorize.tsx:52-57/68/96/269` | `App.tsx:231/232/241/251/253/569/572` 实测**均非**直读词数组；`ReviewPanel.tsx:50-55` 实测为 `dueWords()`／`Object.entries` 等，与词数组无关 |
| `BankManager.tsx` 「10 处」 | **[推断]** `00-project/GLOSSARY.md:324` 的追述（非契约原文） | 实测该文件只有 `:167` 一处读词数组 + `:207` 一处**写**（构造 CustomBank），无 10 处 |

> **[实测]** 契约 §12.6 那一行把「枚举了 17 个行号」当成了「17 处直读」。
> 实际有效行号不足一半。**棘轮基线建立在一个失效的行号清单上**，无法直接用作 CI 判据（见 §4.4）。

### 2.2 真正直读词数组的全部位置（去重后 11 处）

#### A 组：必须改（8 处，需要 Query 层）

| 文件:行 | 当前写法 | 档位 | 处置理由 | 替换代码 / 新增函数 |
|---|---|---|---|---|
| `src/components/Memorize.tsx:54` | `return bank.words` | **必须改** | `freshWords` 取「前 20 个未学过的词」，是对词表的 `filter`+`slice`，命中 §12.2 禁项 **[契约]** `CONTENT_CONTRACT.md:685` | `const all = await listWords({ packageId: bank.id, pageSize: DAILY_NEW * 10 })`→`.filter(!store[w.word])`→`.slice(0,DAILY_NEW)`；**必须显式锁 `sort:'word'`**（见 §7） |
| `src/components/Memorize.tsx:68` | `bank.words.find((w) => w.word === deck[cursor])` | **必须改** | 单词形精确取词条 = `queryWord` 的标准用例；当前是 `find`，也命中 §12.2 | `const item = await queryWord(bank.id, deck[cursor])` |
| `src/components/Memorize.tsx:96` | `bank.words.map((w) => w.word)` | **必须改** | 把整个词表压平成 word 字符串喂给 `getMemorizeStats`，属对词表 `map`，命中 §12.2 | 仅需词形集合 → `const forms = (await listWords({ packageId: bank.id, pageSize: 0 })).map(h => h.word)`；或改 `getMemorizeStats` 签名收 `WordHit[]` |
| `src/components/Memorize.tsx:269` | `bank.words.length === 0` | **必须改** | 空库判定的语义应是「**该包词条数**为 0」，不是「本地数组长度为 0」；懒加载包 `words` 恒为占位 `[]`，此判定在懒包上**恒真** | `if ((await countWords(bank.id)) === 0)`；**注意**：这是个**真实缺陷**，懒包下会误报「空词库」 |
| `src/App.tsx:252` | `bankWords.find((w) => w.word.toLowerCase() === word.toLowerCase())` | **必须改** | 大小写无关的单词形查找 = `queryWord` 语义（`queryWord` 内部 `norm` 兜底） | `const item = await queryWord(bankId, word)` |
| `src/App.tsx:262-264` | `allLoadedWords(banks)` + **`?? { word: w, translation: '' }`** | **必须改（最高优先）** | **[契约]** `CONTENT_CONTRACT.md:735-739` 亲自点名的 🔴 缺陷：取不到就**静默显示空释义**，不报错、不空转 | `const hit = await queryWord(word)；` 未命中时**显式降级**（跳过该词 + `console.warn` + 计数），**禁止**用空释义占位；`allLoadedWords` 整条路径可删 |
| `src/components/ReviewPanel.tsx:46-47` | `new Map(allLoadedWords(banks)...)` + `itemOf = itemMap.get(word) ?? { word, translation: '' }` | **必须改** | 与 `App.tsx:262` **同一兜底模式**（契约 `:737` 同时点名两处）；`allLoadedWords` 只覆盖**已加载**包，大库未缓存时必然大面积踩兜底 | 同 `App.tsx:262`；`itemOf` 改为返回 `WordHit \| null`，渲染侧显式处理 null（加载中 / 未命中） |

#### B 组：不应改（3 处，必须永久豁免）

| 文件:行 | 当前写法 | 档位 | 处置理由 | 替换代码 |
|---|---|---|---|---|
| `src/App.tsx:757` | `bank?.count ?? bank?.words.length ?? 0` | **不应改** | 这是**词数元数据**，不是词条内容。`count` 是懒加载包的**设计字段** **[实测]** `src/data/wordBanks.ts:32`「词数元数据（懒加载词库 words 为占位空数组时，下拉等处显示用）」 | 保持原样；**建议加注释**说明为何豁免 |
| `src/components/Header.tsx:200` | `b.count ?? b.words.length` | **不应改** | 同 `App.tsx:757`，词数元数据。且 `count ?? words.length` 正是为懒包占位 `[]` 设计的正确回退 | 保持原样；**建议加注释** |
| `src/components/BankManager.tsx:167` | `b.words.length` | **不应改** | **关键理由**：`banks` 此处是 `CustomBank[]`（用户自建词库）**[实测]** `src/lib/customBanks.ts:5-10`，其类定义在 `src/lib/`、**不在 `content/`、不在 registry** ⇒ **Query 层根本看不见它**。改成 `countWords(b.id)` 会：① 传 `custom-<base36>` 给 `getPackage` 返回 `undefined`；② `count` 返回 **0** ⇒ UI 直接显示「0 词」，用户自建词库内容仍在但界面说它是空的 | 保持原样；**必须在代码注释中写明「CustomBank 不在内容体系内」** |

> **[实测]** `BankManager.tsx:207` 的 `words: custom.words` 是**写入**（构造 CustomBank），不是直读，不计入。
> **[实测]** `ReviewPanel.tsx:136` 的 `analytics.words[...]` 是**统计计数子表**，不是词数组，计入 §3 豁免类。

### 2.3 档位汇总

| 档位 | 处数 | 文件 |
|---|---|---|
| **必须改** | 8 | `Memorize.tsx:54/68/96/269`、`App.tsx:252/262-264`、`ReviewPanel.tsx:46-47`（算 2 行 1 处） |
| **不应改（永久豁免）** | 3 | `App.tsx:757`、`Header.tsx:200`、`BankManager.tsx:167` |
| **合计有效直读** | **11** | 对比契约记载的 17 ⇒ **[反证]** 虚高约 55% |

---

## 3. 永久豁免清单（三类必须从 §12.6 棘轮基线剔除）

> **[推断]** 若不豁免，会出现**目标与判据互相矛盾**的局面：这些位置**结构上就不可能**归零
> （它们要么不是词数组、要么不在内容体系内），棘轮只能靠反复「豁免再讨论」被人肉绕过，
> 最终把**合法代码逼成违规代码**——开发者为了让门禁变绿，会去改这些**本来就正确**的写法。

| 类 | 具体位置 **[实测]** | 豁免判据（可写成门禁白名单的条件） |
|---|---|---|
| **① 统计计数对象** | `src/lib/analytics.ts:6`（`gt.analytics.v1` 的 `.words` 子表）；`ReviewPanel.tsx:136`（`analytics.words[word.toLowerCase()]`）；`App.tsx` 内 `stats.words` / `h[key].words` 同类引用 | 该 `.words` 的**值类型是「统计条目」而非「词条」**（键为 `word.toLowerCase()`，值不含 `translation`/`phonetic`）。判据：**路径根对象不是 `WordBank` / `ContentPackage`** |
| **② `CustomBank.words`（用户自建词库）** | `src/lib/customBanks.ts:5-10`（接口定义）；`BankManager.tsx:167`（读长度）；`BankManager.tsx:207`（写入） | 判据：**该数组的 `id` 前缀为 `custom-`**，且其类定义**不在 `content/` 目录、不经 `registry.ts` 注册**。⇒ **Query 层作用域之外，豁免是结构性要求而非宽容** |
| **③ 词数元数据** | `src/App.tsx:757`、`src/components/Header.tsx:200`、`BankManager.tsx:167` 的 `.length` / `.count` | 判据：**取的是标量（`number`）而非数组本身**，用途是「显示词数」。其 `.length` 在懒加载包上本就是**占位值**，正解是契约许可的 `count` 字段 **[实测]** `src/data/wordBanks.ts:32` |

**豁免的落地判据（建议写入门禁脚本）**：

```
计为「违规直读」当且仅当同时满足：
  1. 对某个数组表达式取元素／压平／筛选（.length/.find/.map/.filter/.slice）
  2. 该表达式可追溯到 WordBank.words 或 ContentPackage.words
  3. 该对象的 namespace 存在（即已注册进 registry.ts）
三者全中 ⇒ 违规；任一条不满足 ⇒ 豁免。
```

> **[推断]** 判据 3 是豁免 ① ② 的关键：`analytics.words` 无 namespace、`CustomBank` 无 namespace，
> 天然排除在 Query 层作用域之外。

---

## 4. Query 层能力缺口与 `queryWord` 规格

### 4.1 现有导出面 **[实测]**

`src/core/content/query/content-query.ts:320`：

```ts
export const contentQuery = { search, list, get, count }
```

| 入口 | 签名 | UI 为何用不了（8 处里 4 处的痛点） |
|---|---|---|
| `get(contentId)` | `get(contentId: string): Promise<WordHit \| null>`（`:302`） | **UI 手上只有 `{ bank.id, word }`，没有 `contentId`**。拼 ContentId 需要 **namespace**（形如 `ecdict-ielts`），而 namespace 不在 UI 的任何数据结构里。**UI 拿不到，也不该拿**——让它自己拼 namespace ＝ 泄漏包内部标识，**违反 §12.1「UI 只允许使用三类 API」** **[契约]** `CONTENT_CONTRACT.md:674-680` |
| `searchWords({query, exact})` | `searchWords(opts: SearchOptions): Promise<WordHit[]>`（`:331`） | 三重不适配：① **检索语义**（前缀/释义模糊命中），而我们要的是**单词形精确取回**；② 返回**数组**，调用方得写 `[0]`，多一处下标就多一处 `undefined` 风险；③ **无法表达「未命中 → null」**——未命中返回 `[]`，而 `[]` 恰好是**静默兜底的温床**（`arr[0]` 为 `undefined` ⇒ 又滑回 `?? { word, translation: '' }`） |
| `list(opts)` | `list(opts: QueryOptions): Promise<WordHit[]>`（`:293`） | 可用，但**排序不可控**：默认 `relevance`，tie-break 按词形字典序（见 §7）。取「前 N 词」会静默改变语义 |
| `count(opts)` | `count(opts: QueryOptions): Promise<number>`（`:310`） | **可用且够用**，直接解决 `Memorize.tsx:269` |

> **[实测]** 契约 §12.6 记载 `contentQuery.* UI 调用数 = 0`（`CONTENT_CONTRACT.md:731`），
> 本次复查**仍然为 0**（`grep -rn "contentQuery\.\|getCatalog(" src/ --exclude-dir=core` ⇒ 0 命中）。
> 该基线**属实**，但请注意：**它统计的是「调用数」，不是「该不该调用」** ——
> 零调用里有一大部分是因为**能力缺口**（缺 `queryWord`），不是单纯的懒。

### 4.2 新增函数规格

```ts
/**
 * 单词形精确取回（UI 唯一需要的单条寻址入口）。
 *
 * 存在理由：UI 手上只有 { packageId（裸 id）, word }。
 *   - get(contentId) 需要 namespace ⇒ UI 不该持有 ⇒ 不可用
 *   - searchWords({exact}) 是检索语义、返回数组、无法表达「未命中」
 *
 * 语义：
 *   1. 作用域锁定在单个 packageId 内（不做全库跨包检索，避免同名跨包歧义）
 *   2. 大小写口径与 getWord 一致（I-19）：先原词形精确，未命中再 norm 兜底
 *   3. 未命中**显式返回 null**，绝不返回空词条对象 —— 逼调用方处理 null
 *
 * @param packageId 包裸 id（如 'ielts' / 'go-code'），不是 ContentId
 * @param word      词形（原词形优先，大小写不敏感兜底）
 * @returns WordHit 或 null（包不存在 / 词不存在）
 */
export async function queryWord(packageId: string, word: string): Promise<WordHit | null>
```

**实现要点（按依赖顺序）**：

1. **包解析**：`getPackage(packageId)`；`undefined` 直接 `return null`（**不要** throw —— 与 `get` 的 C-5 口径一致 **[契约]** `CONTENT_CONTRACT.md:121`「非法 id 返回 null，不抛异常」）。
2. **确保索引**：`await ensureIndex([pkg.localId])`。**这是懒加载的关键**：`ensureIndex` 会把该包 words 载入并建索引，因此 `queryWord` 对 **lazy 包天然可用**，不需要调用方自己 load。
3. **走既有内部路径**，**不要**新写一套查找逻辑：直接复用 `getWord` 的 ① 精确 / ② norm 兜底两段（**[实测]** `content-query.ts:361-381`），把 `contentId` 构造收进函数内部：
   ```ts
   const ns = parseContentId(pkg.manifest.id)!.namespace   // ← namespace 只在层内使用，不外泄
   const direct = findById(`content:word:${ns}:${word}`)
   ```
   > 【重要】**namespace 的拼接发生在 Query 层内部**，调用方（UI）全程不见 namespace —— 这正是 §12.1 要求的边界。
4. **精确失败后的 norm 兜底**：遍历 `await loadPackage(pkg.localId)` 用 `norm(w.word) === norm(word)` 找，保证 `go-code` / `ts-code` 那 93 个带大写词条 **[实测]** `content-query.ts:355-359` 注释中记载「9346 条里 93 条」）也能取回。
5. **导出**：加入 `contentQuery`（`content-query.ts:320`）同时**保留独立 named export**，保持与 `getWord` 一致的用法习惯。
6. **单测**：并入 `tests/content-query.mjs`（该文件已存在 **[实测]**），至少覆盖「存在 / 不存在 / 大小写差异 / lazy 包 / 二次调用命中缓存」。

> **[实测]** `getWord` 已同时具备 ① 精确索引、② norm 兜底、③ 大小写口径注释，
> **`queryWord` 是 `getWord` 的「不用 ContentId 的薄封装」，不应引入任何新的查找逻辑。**
> 这也是它能做到「补一个函数收益最大」的原因：**成本几乎为零，复用已有全部正确性。**

---

## 5. 明确不做的两项

### 5.1 ❌ 不引入全量 `wordMap()`

**方案内容**：在 Query 层加 `wordMap(): Map<string, WordHit>`（或 `listAll()`），一次性拿全库词条，
然后把 `App.tsx:262` / `ReviewPanel.tsx:46` 的 `allLoadedWords(banks)` 换成它。

**不做的理由**：

| # | 理由 | 证据 |
|---|---|---|
| 1 | **会把「静默兜底」升级成「整轮失败」** | **[实测]** 现有 `allLoadedWords`（`src/data/wordBanks.ts:40`）只覆盖 `bankCache` 内**已加载**包，因此断网时**降级为占位词条**（虽然释义为空，但**复习轮不中断**）。全量 `wordMap()` 要求 3 个 lazy 包全部就位，断网时 `loadPackage` 直接 reject ⇒ **整条复习链断掉** |
| 2 | **撞预热预算** | **[实测]** 预热预算 `497.03 KiB / 600 KiB = 82.8%`，**余量仅 17%**（`00-project/PROJECT_OVERVIEW.md:212`、`03-architecture/FRONTEND_ARCHITECTURE.md:226`、`INTEGRATION_ARCHITECTURE.md:146` 三处一致） |
| 3 | **破坏 §12.5 懒加载边界** | **[契约]** §12.5「UI 若在页面初始化时同步 import 任何 `words.json`、或把 lazy 包强制拉进主 chunk，就是在破坏 I-20」⇒ `check:bundle` 直接判红 |
| 4 | **回归风险面最大** | **[实测]** 受影响用例：`tests/offline-audit.mjs:148-180`（态2 断网 reload）、`:182-208`（态3 断网功能完整性）。态3 明确断言「背单词 Space 翻面显示释义」——全量加载后断网即失败 |

> **[推断]** 正解是**按需**：`queryWord(word)` 在复习轮里**逐词**取，命中就渲染、未命中就显式跳过。
> 这既不需要全量加载，又把「静默」变成「显式」。**收益与成本都比 `wordMap()` 优。**

### 5.2 ❌ 不动 `App.tsx:202` 的洗牌 + `slice`

**现状** **[实测]** `src/App.tsx:200-212`：

```ts
const arr = [...base]
if (shuffled) {
  for (let i = arr.length - 1; i > 0; i--) { /* Fisher–Yates */ }
}
return arr.slice(0, CHAPTER_SIZE)
```

**不做的理由**：

| # | 理由 |
|---|---|
| 1 | **契约禁项确认**：`[...base]` + 洗牌 + `slice` 命中 §12.2「对词表数组做 `filter`/`map`/`sort`/`slice`」 **[契约]** `CONTENT_CONTRACT.md:685`。**这一点无争议，确实违规。** |
| 2 | **但 Query 层没有能力承接**：现有四入口 `{search, list, get, count}` **[实测]** `content-query.ts:320` **均无随机抽样能力**。`list()` 是 deterministic 的（I-14 **[契约]**） |
| 3 | **与分页铁律正面冲突**：**[实测]** `content-query.ts:74` 注释「**排序必须在分页之前完成**（sortRows → paginate），先切页再排序必然错页」；`:241` 注释「tie-break 恒升序 …… ⇒ **顺序完全确定**」。I-14 **[契约]** `CONTENT_CONTRACT.md:113` 要求「同一 query 多次执行顺序一致」。**随机化会直接破坏 I-14** |

**结论** **[推断]**：这不是「懒」或「优先级低」，而是**契约尚未定义「随机抽样」这第三种语义**。
要迁移它，必须先设计契约（例如 `sample(opts, seed)`：**带 seed 的确定性抽样**——同 seed 同结果，既满足随机练习体验又满足 I-14），
再进门禁，最后才能改 UI。**本文档不做，并将其列为独立后续议题。**

> ⚠️ 顺带订正：`App.tsx:202` 的 `base` 来自 `buildQueue(source?)`，其中 `source` 为 `undefined` 时才用 `bankWords`。
> **[实测]** `:202` 自身是 `const base = source && source.length > 0 ? source : bankWords`，
> **洗牌循环在 `:204-209`**。引用时请写 `App.tsx:200-212` 区间，单片行号易错。

---

## 6. `hasFeature()` 结论：**不需要接线**

### 6.1 契约要求了什么 **[契约]**

`CONTENT_CONTRACT.md:705-708`（§12.3）要求用 `hasFeature(packageId, 'phonetic')` 替换
`src/App.tsx:388` / `:396` / `:734` 三处的 `gt.mode === 'code'` 判断，理由：「这三处是**按用户开关**决定大小写敏感／是否朗读，属于**包能力**」。

### 6.2 为什么这个要求是错的

| # | 论点 | 证据 |
|---|---|---|
| **1** | **`mode` 是用户显式选择，不是包能力** | **[实测]** 契约点的 `App.tsx:396` 现为 `const target = mode === 'code' ? (current?.word ?? '') : targetLower`，其上一行注释即 `// code 模式大小写敏感：target 用原文比较；其余模式保持小写比较`。`mode` 来自**用户在练习下拉里的显式选择** —— 用户**完全可以在有音标的 `cet4` 下主动选 `code` 模式**（练代码大小写敏感） |
| **2** | **用包能力覆盖用户选择 = 引入错误行为** | **[推断]** 若改为 `hasFeature(pkg,'code')`，用户选了 `code` 模式但当前包（如 `cet4`）未声明该 feature ⇒ 大小写敏感**被静默关闭**。这不是修 bug，是**用架构洁癖覆盖用户意图** |
| **3** | **契约记的三处行号已全部失效** | **[实测]** `App.tsx:388` = 「焦点在表单元素里时不劫持 Esc」的键盘处理；`:396` = `code` 模式 target（**存在但语义是用户选择**）；`:734` = `{tab === 'typing' && mode === 'spell' && ...}`（spell 提示）。⇒ **三处均为无关代码或语义不符，契约记的是旧行号下的旧代码** |
| **4** | **渲染侧已比包级开关更精确** | **[实测]** 音标渲染**实际只有 3 处**（见 6.3），全部是**词条级** `item.phonetic && ...`。**包级开关做不到这一点**：包声明 `features.phonetic === true` 但**个别词条缺音标**时，`hasFeature` 为 `true` ⇒ 渲染**空音标标签**（视觉上是「空框」）。词条级判断则自动跳过 |
| **5** | **调用数为 0 是「正确」，不是「债务」** | **[实测]** `grep -rn "hasFeature(" src/ --include=*.ts --include=*.tsx`（排除定义处）⇒ **0 命中**。该基线属实，但**归零目标本身是错的** |

### 6.3 音标渲染四处（契约 §12.3 之外的独立发现）

**[实测]** `grep -rn "phonetic" src/components/*.tsx` 全量命中：

| 文件:行 | 写法 | 评估 |
|---|---|---|
| `src/components/ReviewPanel.tsx:147` | `{item.phonetic && <span ...>{item.phonetic}</span>}` | ✅ 词条级，精确 |
| `src/components/ReviewPanel.tsx:173-176` | `{item.phonetic && (<span data-testid="review-detail-phonetic">...)}` | ✅ 词条级，精确 |
| `src/components/ReviewPanel.tsx:180` † | （`item.translation` / `item.definition` 条件渲染，同区域） | ✅ 词条级 |
| `src/components/Memorize.tsx:408` † | （背单词卡 `item.definition` 条件渲染） | ✅ 词条级 |

> † **[反证]**：契约任务清单说「渲染侧四处（`ReviewPanel.tsx:147/173/180`、`Memorize.tsx:408`）**已全部是词条级 `item.phonetic` 条件渲染**」。
> 实测 `ReviewPanel.tsx:180` 与 `Memorize.tsx:408` **不含 `phonetic`**：`:180` 是 `{item.translation && ...}` 区域，`Memorize.tsx:408` 是 `{item.definition && ...}`。
> **[实测]** `grep -n "phonetic" src/components/Memorize.tsx` ⇒ **0 命中**——**Memorize 组件根本不渲染音标**。
> 结论不受影响（两边都支持「词条级条件渲染优于包级开关」），但**引用时请勿照抄这四个行号**。

### 6.4 建议

- **[推断]** 把「`hasFeature()` 调用数 = 0」**从债务指标中移除**，改为「`hasFeature()` 若被调用，必须传 `packageId` 且注释说明为何不能用词条级判断」。
- **[推断]** 契约 §12.3 的原文需**走变更流程**修订（`CONTENT_CONTRACT.md`:29-43 五步：先契约 → 后门禁 → 再回归），把「必须接上」改为「按需使用」。
  否则 P1 会照章办事，**制造出一个真实的用户行为 bug** 来满足一条错误的契约。

---

## 7. 行为漂移预警（本方案最危险的一处）

### 7.1 漂移机制

**现状** **[实测]** `src/components/Memorize.tsx:52-57`：

```ts
const freshWords = useMemo(() => {
  void session
  return bank.words            // ← 词表原序
    .filter((w) => !store[w.word])
    .slice(0, DAILY_NEW)       // ← 取「前 20 个未学过的词」
    .map((w) => w.word)
}, [bank, session])
```

「前 20 个」= **词表 JSON 里的原始顺序**（人工编排：从基础到进阶）。

**迁移后** **[实测]** `list()`（`content-query.ts:293`）默认 `sort: 'relevance'`，
而 `sortRows`（`:231-249`）的 **tie-break 恒升序**：

```
:243  cmpText(norm(a.hit.word), norm(b.hit.word))   // ← ① 词形字典序
:244  cmpText(a.hit.packageLocalId, b.hit.packageLocalId)
:245  a.ord - b.ord                                  // ← ③ 包内序号（原序）才排到第三
```

`list()` 路径下**所有行 `rank` 均为 0**（`rank` 只由 `search` 分配，见 `:276-284`），
⇒ **tie-break 第①项「词形字典序」成为实际主序**。

> **结论** **[推断]**：`freshWords` 的语义会从「**编排序**前 20 个未学过的词」
> **静默变成**「**字典序**前 20 个未学过的词」（实际会集中在 `a` / `abandon` 一带）。
> **学习路径的难度曲线被悄悄破坏**：新手第一组从「基础词」变成「a 开头词」。

### 7.2 为什么测试抓不住

**[实测]** `tests/e2e.mjs:310-319`：

```js
const progBefore = await page.textContent('[data-testid="memorize-progress"]')
await page.click('[data-testid="memorize-unknown"]')
check('不认识的词追加 2 次到队尾',
  progBefore?.includes('/20') && progAfter?.includes('/22'), ...)
```

该断言**只校验进度分母 20 → 22**，**完全不校验这 20 个词是谁**。
⇒ 换序后 `/20`、`/22` **仍会通过** ⇒ **测试全绿，行为已变**。这是**典型的「测试抓不住的行为漂移」**。

### 7.3 缓解措施（必须做，不可省）

1. **显式锁排序**：迁移时**必须**写 `listWords({ packageId: bank.id, sort: 'word', pageSize: ... })` 之类**明确的排序参数**，**禁止依赖默认值**。
   - ⚠️ 但 `sort:'word'` 也是**字典序**，**仍然不等于原序**！
2. **正确做法**：**只有 `sort` 走「包内原始序号」才能保序**。`sortRows` 的 `:239` 分支
   （`sort:'updated'` → `cmpText(packageLocalId) || a.ord - b.ord`）与 `:245` 的 tie-break ③ 才能表达原序。
   > 而 `sort:'updated'` 是**契约自认的退化语义** **[契约]** `CONTENT_CONTRACT.md:158`「L-1：`sort:'updated'` 是退化语义，词表无词级 `updatedAt`，实际按包内原始词序」。
   > ⇒ **[推断]** 现有四入口**没有一个能表达「保持内容原始顺序」**。这是 §4 之外的**第二个能力缺口**。
3. **新增入口**（与 `queryWord` 同批）：`listWords` 接受 `sort: 'origin'`（或 `'ord'`），语义 = 按 `a.ord` 升序，
   并在 `sortRows` 增加该分支。**这是保住学习难度曲线的唯一办法。**
4. **补测试**：新增断言**锁定第一组的前 3 个具体词形**（不是数量）：
   ```
   check('第一组锁定为词表原序前 3 词', first3 === expectedOriginFirst3)
   ```
   > **[推断]** 「断言具体内容而非仅断言数量」是本条的核心教训。数量断言对**顺序类**回归是**零覆盖**。

---

## 8. 回归风险清单

| # | 受影响文件:行号 | 风险描述 | 缓解措施 |
|---|---|---|---|
| R-1 | `src/components/Memorize.tsx:54` | 取「前 20 词」的顺序从**原序**漂移为**字典序**，学习难度曲线静默改变 | 见 §7.3：新增 `sort:'origin'`，**显式**传参；补「锁定前 3 词词形」的断言 |
| R-2 | `src/components/Memorize.tsx:269` | `bank.words.length === 0` 在**懒加载包**下 `words` 恒为占位 `[]` ⇒ **恒判为「空词库」**。改为 `countWords` 后此路径行为**发生变化**（修好了，但可能暴露此前被掩盖的 UI 分支） | 用 `countWords(bank.id)`；对 3 个 lazy 包（ielts/kaoyan/toefl）+ 1 个 inline 包各跑一遍「空库提示」断言 |
| R-3 | `src/App.tsx:262-264` | 去掉 `?? { word: w, translation: '' }` 后，**未命中词将被跳过而非占位** ⇒ 复习轮**词数变少**；调用方若假设词数不变会出错 | `queryWord` 返回 `null` 时**显式计数 + `console.warn`**；检查 `startReviewRound` 的返回值语义（`:257` 返回 `boolean`）是否仍成立 |
| R-4 | `src/components/ReviewPanel.tsx:46-47` | 同 R-3；且 `ReviewPanel` 逐条渲染，`null` 需在**渲染层**处理，否则会 `item.word` 崩（此时 `item` 为 `null`） | `itemOf` 改为 `WordHit \| null`；渲染侧先判 null（加载中 / 未命中态），**不要**保留占位对象 |
| R-5 | `src/components/ReviewPanel.tsx:136` | `analytics.words[...]` **看起来像**直读词数组，容易被误改 ⇒ **真的会报错** | 归入 §3 豁免类 ①，并在该行加注释 |
| R-6 | `src/components/BankManager.tsx:167` | 若被误改为 `countWords(b.id)`，`CustomBank` 的 `custom-*` id 查不到包 ⇒ **显示「0 词」**（用户数据仍在，界面说空） | 归入 §3 豁免类 ②，**代码注释写明「不在内容体系内」** |
| R-7 | `src/App.tsx:757` / `src/components/Header.tsx:200` | 改掉 `count ?? words.length` 会**丢失懒加载包的真实词数**（`count` 是专为占位 `[]` 设计的设计字段） | 归入 §3 豁免类 ③；加注释指明 `count` 字段用途（`src/data/wordBanks.ts:32`） |
| R-8 | **全站** | First-load 体积：任何把 lazy 包拉进主 chunk 的改动都会撞 I-20 / §12.5 | 每次改动后跑 `check:bundle`（主 chunk ≤ 420 KiB raw / 135 KiB gzip **[契约]** I-20） |
| R-9 | `tests/offline-audit.mjs:148-180`（态2）、`:182-208`（态3） | 断网态下 `queryWord` 若隐式触发 `loadPackage`，在 lazy 包**未预热**时会 reject（预热只覆盖 ielts/kaoyan/toefl **[实测]** `src/core/content/registry.ts:139-141`） | `queryWord` 内部 `try/catch` → 返回 `null`；**禁止** reject 冒泡到 React 渲染树 |
| R-10 | `tests/content-query.mjs` | 新增 `queryWord` 若不复用 `getWord` 口径，会重现「search 查得到、get 取不回」（93 个带大写词条） | **必须复用 `getWord` 的 ① 精确 + ② norm 兜底**；补大写词形（如 `Oxford` / `Marxist`）用例 |
| R-11 | 契约 §12.4 棘轮 | **`tests/ui-contract.mjs` 不存在** **[实测]**（`ls tests/` ⇒ 只有 `_evidence/ content-query.mjs e2e.mjs offline-audit.mjs preview-server.mjs prod-smoke.mjs`）⇒ 「基线由 `tests/ui-contract.mjs` 落盘锁定」**当前无法执行** | 棘轮落盘脚本**需先创建**；且**必须先按 §2/§3 重建基线**（11 处而非 17 处，扣掉 3 处豁免） |

---

## 9. 实施顺序（5 档，按风险从低到高）

### 档 1：补 Query 层能力（**零 UI 改动，零用户可见变化**）

| 项 | 内容 |
|---|---|
| **改哪些文件** | `src/core/content/query/content-query.ts`（新增 `queryWord`，加入 `:320` 的 `contentQuery`）；`sortRows`（`:231`）新增 `'origin'` 分支；`tests/content-query.mjs` 补用例 |
| **预期收益** | 为档 3/4/5 解除阻塞；**本身不改变任何 UI 行为**；同时补上 §7.2 记录的排序能力缺口 |
| **如何验证** | `node tests/content-query.mjs`（新增用例：存在/不存在/大小写/lazy 包/`sort:'origin'` 保序）；`npm run build` 通过；确认主 chunk 体积**不变**（无新依赖） |

### 档 2：永久豁免落实 + 重建棘轮基线

| 项 | 内容 |
|---|---|
| **改哪些文件** | 新建 `tests/ui-contract.mjs`（棘轮落盘脚本）；在 `App.tsx:757` / `Header.tsx:200` / `BankManager.tsx:167` / `ReviewPanel.tsx:136` 加**豁免说明注释** |
| **预期收益** | 基线从**虚高的 17** 校正为**真实的 11（含 3 处豁免）** ⇒ **8 处有效目标**，一次可及；门禁从此**可执行、可下降** |
| **如何验证** | 跑 `tests/ui-contract.mjs` 输出基线数 = 11（8 需改 + 3 豁免）；**故意**在某处加一行 `bank.words.map(...)`，确认门禁**判红**；撤回后**转绿** |

### 档 3：修 🔴 静默空释义（**收益最大，风险中等**）

| 项 | 内容 |
|---|---|
| **改哪些文件** | `src/App.tsx:262-264`（`startReviewRound`）；`src/components/ReviewPanel.tsx:46-47`（`itemOf` + 渲染侧 null 分支） |
| **预期收益** | 消除**契约明文点名的最高危缺陷**（`CONTENT_CONTRACT.md:735-739`）：不再静默显示空释义，改为**显式跳过**。这 2 处吃下 8 处目标里的 **2 处**，且是**用户真正能感知**的修复 |
| **如何验证** | ① 单测/手动：构造「复习词存在但所属包未加载」⇒ 确认**不再渲染空释义**，且有 `console.warn`；② 跑 `tests/offline-audit.mjs` 态2/态3 **仍全绿**（断网不炸）；③ 跑 `tests/e2e.mjs` 复习相关用例 |

### 档 4：迁移 Memorize 四处（**行为敏感，必须先做档 1**）

| 项 | 内容 |
|---|---|
| **改哪些文件** | `src/components/Memorize.tsx:54`（→ `sort:'origin'`）、`:68`（→ `queryWord`）、`:96`（→ `listWords`）、`:269`（→ `countWords`） |
| **预期收益** | 背单词页**全部**直读清零；顺带**修好 `:269` 的懒加载假空库缺陷**（R-2） |
| **如何验证** | ① **新增**「第一组前 3 词 = 词表原序前 3 词」断言（§7.3）；② `tests/e2e.mjs` 重跑，`:310-319` 的 `/20 → /22` 必绿 **且**新断言必绿；③ 切到 `ielts`（lazy）确认空库提示**不再误报** |

### 档 5：迁移 `App.tsx:252` + 收尾（**最低风险，最后做**）

| 项 | 内容 |
|---|---|
| **改哪些文件** | `src/App.tsx:252`（`bankWords.find` → `queryWord`） |
| **预期收益** | 8 处目标**归零**；删除 `allLoadedWords` 的 UI 调用方（`wordBanks.ts:40` 若无其他调用方则可标废弃） |
| **如何验证** | `grep -rn "\.words" src/components/*.tsx src/App.tsx` ⇒ 仅剩 3 处豁免行；`tests/ui-contract.mjs` 计数 = **0 违规**；全量回归：`content:validate` → `test:content` → `build` → `e2e` → `offline-audit` → `check:bundle` |

> **顺序不可颠倒的理由** **[推断]**：档 1 是**其他四档的唯一前置**（没有 `queryWord` 就没有替代写法）；
> 档 3 放在档 4 之前，是因为它**修的是真实性缺陷**（空释义），而档 4 是**重构**——
> 先修缺陷能保证后续重构的验证基线是干净的。

---

## 10. 遗留议题（本文不解决，需单独设计）

| # | 议题 | 阻塞原因 |
|---|---|---|
| Q-1 | **随机抽样能力**（迁移 `App.tsx:200-212`） | 与 I-14「同一 query 多次执行顺序一致」冲突，需先设计**带 seed 的确定性抽样**契约 |
| Q-2 | **`sort:'origin'` 的契约地位** | 现为本文新增建议，尚未进门禁；`sort:'updated'`（L-1）的**退化语义**与它高度相关，宜一并修订 |
| Q-3 | **契约 §12.3 修订** | `hasFeature()` 要求语义错误（§6）；须走 §12 的五步变更流程 |
| Q-4 | **§12.6 基线重写** | 「17 处」不成立（§2.1）；须连同 §12.4 棘轮一起订正为 11 处 / 8 目标 |
| Q-5 | **`tests/ui-contract.mjs` 缺失** | 棘轮「由该脚本落盘锁定」目前**无实现**；档 2 需新建 |

---

## 附：本文的事实／推断分界（供复核）

| 结论 | 性质 | 复核命令 |
|---|---|---|
| 直读实为 11 处（8 需改 + 3 豁免） | **[实测]** | `grep -n "\.words" src/App.tsx src/components/*.tsx` |
| `contentQuery.*` UI 调用数 = 0 | **[实测]** | `grep -rn "contentQuery\.\|getCatalog(" src/ --exclude-dir=core` |
| `hasFeature()` 调用数 = 0 | **[实测]** | `grep -rn "hasFeature(" src/ --include=*.ts --include=*.tsx` |
| `Memorize.tsx` 不渲染音标 | **[实测]** | `grep -n "phonetic" src/components/Memorize.tsx` ⇒ 0 |
| `tests/ui-contract.mjs` 不存在 | **[实测]** | `ls tests/` |
| `list()` tie-break 首位为词形字典序 | **[实测]** | `sed -n '231,249p' src/core/content/query/content-query.ts` |
| 预热余量 497.03 / 600 KiB = 82.8% | **[实测]**（三处文档一致） | `grep -rn "497.03" docs/audit-package/` |
| 「17 处」计数不可信 | **[反证]** | 逐行核验 §12.6 所列行号 |
| 迁移会破坏学习难度曲线 | **[推断]** | §7.1 逻辑推演，**未跑真机验证** |
| `hasFeature` 接线会引入用户行为 bug | **[推断]** | §6.2 论点 1-2，**未跑真机验证** |
| 豁免三类可写成门禁判据 | **[推断]** | §3 判据草案，**未实现** |
| 5 档实施顺序 | **[推断]** | §9，优先级判断 |

---

> **本文档只描述方案，不含任何代码改动。** 落地须走 `CONTENT_CONTRACT.md:29-43` 的五步变更流程：
> **先契约 → 后门禁 → 再回归**（顺序不可倒，`content/README.md:650`）。
