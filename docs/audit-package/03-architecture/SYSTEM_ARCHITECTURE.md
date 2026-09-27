# 系统架构（SYSTEM_ARCHITECTURE）

> 状态：✅ 已有 —— 分层与依赖方向全部为当前真实实现，逐条附源码路径与行号。
> 基线 commit：`4152eb2`　｜　实测日期：2026-09-27
> 关联：`13-acceptance/GAP_ANALYSIS.md#A-1`（UI 边界泄漏）、`13-acceptance/KNOWN_ISSUES.md#DEBT-001`

---

## 1. 分层总览

系统是**纯前端单页应用**，无后端、无数据库、无用户体系。全部内容随构建产物一起分发，
全部用户状态存 `localStorage`。

七层结构如下（自下而上，依赖方向只允许向上）：

```
┌──────────────────────────────────────────────────────────────────────┐
│  ⑦ Learning 层    复习调度 / 掌握度 / 打卡 / 分析 / 推荐            │
│    src/lib/{reviewStore,memorizeStore,mastery,streak,analytics,      │
│              recommend}.ts                                           │
│    src/core/learning/model/learning-item.ts  ← 仅类型，无实现        │
├──────────────────────────────────────────────────────────────────────┤
│  ⑥ UI 层          React 19 组件（14 个）+ App.tsx 单页状态机        │
│    src/App.tsx（817 行）、src/components/*.tsx（14 个）              │
│    ⚠️ 边界泄漏：17 处直读词数组，绕过 ⑤                        │
├──────────────────────────────────────────────────────────────────────┤
│  ⑤ Query 层       检索 / 浏览 / 寻址 / 计数（UI 唯一入口）          │
│    src/core/content/query/content-query.ts（385 行）                 │
├──────────────────────────────────────────────────────────────────────┤
│  ④ Index 层       倒排索引（byId/byWord/byPackage/byTag 四张 Map）   │
│    src/core/content/index/content-index.ts（231 行）← internal       │
├──────────────────────────────────────────────────────────────────────┤
│  ③ Catalog 层     「有什么」：同步只读 manifest，不加载词条          │
│    src/core/content/catalog/catalog.ts（104 行）                     │
├──────────────────────────────────────────────────────────────────────┤
│  ② Registry 层    「从哪加载」：包注册 + 词条加载 + 单份缓存          │
│    src/core/content/registry.ts（141 行）                            │
├──────────────────────────────────────────────────────────────────────┤
│  ① Content 层     内容数据与模型（不随用户改变）                     │
│    content/vocabulary/<id>/{manifest,words}.json                     │
│    src/core/content/{schema,model/*,relation/*}.ts                   │
└──────────────────────────────────────────────────────────────────────┘
```

四层职责分离在 `src/core/content/catalog/catalog.ts:3-6` 有明文界定：

```
Catalog —— 回答「有什么」：有多少种内容类型、各类型多少包/多少条、每包的元信息；
Query   —— 回答「怎么找」：搜索 / 分页 / 单条寻址（src/core/content/query/）；
Registry—— 回答「从哪加载」：包注册与词条加载（src/core/content/registry.ts）。
```

---

## 2. 逐层职责与真实文件

### ① Content 层 —— 「内容是什么」

| 项 | 内容 |
|---|---|
| 数据落盘 | `content/vocabulary/<id>/manifest.json` + `words.json`（10 个包） |
| 类型定义 | `src/core/content/schema.ts`（91 行）、`model/content.ts`（204 行）、`model/vocabulary.ts`（29 行）、`model/snapshot.ts`（128 行）、`model/asset.ts`（37 行）、`relation/relation.ts`（90 行） |
| 构建工具链 | `scripts/content/{canonical,normalize,build,validate,list}.mjs` |
| 不变性 | 用户行为永不写回本层（`model/content.ts:3-7` 三层边界声明） |

**关键约束**：`schema.ts:9` 明确「内容数据的唯一定义源是 `content/<type>/<id>/{manifest,words}.json`；
本文件不承载数据」。

### ② Registry 层 —— 「从哪加载」

文件：`src/core/content/registry.ts`

| API | 行号 | 职责 |
|---|---|---|
| `getVocabularyPackages()` | `:80` | 返回全部包（注册序 = UI 下拉序） |
| `getVocabularyPackage(localId)` | `:85` | 按裸 id 取包 |
| `getPackage(id)` | `:90-92` | 兼容裸 id / 4 段式 ContentId |
| `loadPackage(id)` | `:95-103` | 加载词条，**单份缓存**（`loadedCache`，`:75`） |
| `getContent(contentId)` | `:106-120` | 按 ContentId 取单条（仅 `type==='word'`） |
| `listContent(type)` | `:123-126` | 仅支持 `vocabulary`，其余返回 `[]` |
| `getRelations(contentId)` | `:129-131` | **恒返回 `[]`**（当前无 relations.json） |
| `hasFeature(packageId, feature)` | `:134-136` | 能力探测（UI 调用数 = 0） |
| `warmUpVocabulary()` | `:139-141` | SW 空闲期预热，硬编码 3 个包 |

两种加载策略并存（`registry.ts:58-69`）：

- **inline（7 包）**：`words: parseWords(xxxWords)` —— 静态 import，词条进主 chunk。
  `ai-core` / `cloud-native` / `frontend` / `cet4` / `cet6` / `ts-code` / `go-code`。
- **lazy（3 包）**：`load: loadXxx` —— 动态 `import('...?raw')`，独立 chunk。
  `ielts` / `kaoyan` / `toefl`（各 3000 词）。

manifest 用 `?raw` + 运行时 `JSON.parse` 导入（`registry.ts:27-50`），原因是 tsconfig 未开
`resolveJsonModule`（`tsconfig.app.json` 无该项）。

### ③ Catalog 层 —— 「有什么」

文件：`src/core/content/catalog/catalog.ts`

- `getCatalog()`（`:80-97`）：**同步**、只读 manifest、不加载任何词条，可放心首屏调用。
- `getPackageCatalog(localId)`（`:100-104`）：单包目录条目。
- `PLANNED_TYPES`（`:52-64`）：11 个类型槽位，未接入的恒为 `packages: 0 / items: 0`。

诚实原则写死在 `catalog.ts:9-12`：「未接入的内容类型一律返回 `packages=0 / items=0`，不许编造数字」。

### ④ Index 层 —— 「检索加速」

文件：`src/core/content/index/content-index.ts`（标注 **internal**，`content-index.ts:20-23`）

四张 Map（`ContentIndex` 接口，`:24-33`）：

| Map | key | value |
|---|---|---|
| `byId` | ContentId | `WordHit`（全量正排表） |
| `byWord` | 归一化词形 | `ContentId[]` |
| `byPackage` | packageLocalId | `ContentId[]` |
| `byTag` | tag | `ContentId[]` |

访问必须走 finder（`:201-231`）：`findById` / `findByWord` / `findByPackage` / `findByTag` /
`findByNamespace` / `idsByPackage`。

索引懒构建 + 在建 Promise 去重（`buildOne`，`:95-116`），`ensureIndex`（`:119-125`），
`invalidateIndex`（`:133-167`）+ `getIndexStats`（`:170-172`）。

### ⑤ Query 层 —— 「怎么找」

文件：`src/core/content/query/content-query.ts`

统一入口四个（`:260-320`）：

```
contentQuery.search(opts)  :260   搜索（精确 > 前缀 > 释义/翻译）
contentQuery.list(opts)    :293   浏览（按包/namespace/tag + hasPhonetic）
contentQuery.get(id)       :302   单条寻址
contentQuery.count(opts)   :310   计数
```

兼容封装保留原语义（`:331-385`）：`searchWords` / `listWords` / `getWord` / `countWords`。

`SUPPORTED_TYPES = ['word']`（`:133`）—— 只有 `word` 一个类型在当前可检索。未支持类型返回空结果。

Scope 与 Sort：
- `resolveScope()`（`:156-165`）：平铺参数优先于 `scope`。
- `sortRows()`（`:231-249`）：排序必须在分页之前；tie-break = (词形, packageLocalId, 包内序号) 恒升序。
- `cmpText()`（`:140`）：用 code-unit 比较，**不用 `localeCompare`**（ICU 数据不同会漂移）。

### ⑥ UI 层 —— 见 `FRONTEND_ARCHITECTURE.md`

### ⑦ Learning 层 —— 见 `LEARNING_ARCHITECTURE.md`

---

## 3. 依赖方向

允许的方向（实测自 import 语句）：

```
UI ──┬──> Query      （content-query.ts）        ✅ 契约允许
     ├──> Catalog    （catalog.ts）              ✅ 契约允许
     ├──> Learning   （lib/*Store.ts）           ✅ 契约允许
     └──> Index ─?─> Registry                   ❌ 禁止（Index 是 internal）
Query ──────> Index ──────> Registry ──────> Content
Learning ───> Content（仅类型 import：ContentRef）
Catalog ────> Registry（只读 manifest）
```

**实测违规项**：UI 层直连了 Registry 的兼容层 `src/data/wordBanks.ts`，绕开 Query 层。
见下节。

---

## 4. 边界泄漏：UI 绕过 Query 直读数组（架构视角）

### 4.1 契约怎么写的

`content-query.ts:4-5`：

> UI（含未来的 Word Detail / Search / Filter）只能通过本层检索内容，**不得直接持有词表数组做 filter**
> —— 这样底层数据源从 JSON 换成 IndexedDB / R2 / API 时页面零改动。

`content/README.md:48` 把这条列为十条架构原则之一：

> 7. Query Layer is the only UI access path.（UI 禁止直接持有词表做 filter）

### 4.2 实际是什么样

兼容层 `src/data/wordBanks.ts` 是绕过点。它在 `:7` 直接 `import { getVocabularyPackages, loadPackage }
from '../core/content/registry'`，在 `:56-73` 把 registry 的包映射成 V3 的 `WordBank` 形状并导出
`WORD_BANKS`。UI 从这里拿到词数组。

实测计数（`GAP_ANALYSIS.md#A-1` 与 `KNOWN_ISSUES.md#DEBT-001` 已逐行列出行号，此处不重复）：

| 文件 | 违规行号 |
|---|---|
| `src/App.tsx` | 13-21, 127, 133, 150, 690, 722 |
| `src/components/Memorize.tsx` | 54, 68, 96, 269 |
| `src/components/ReviewPanel.tsx` | 4, 136 |
| `src/components/Header.tsx` | 200 |
| `src/components/BankManager.tsx` | 43,44,48,50,61,62,63,65,167,207 |

`contract` §12.6 另给出一组口径（`App.tsx:191-199/231/232/241/251/253/569/572`、
`ReviewPanel.tsx:46/47/50-55`、`Memorize.tsx:52-57/68/96/269`），总计同样为 **17 处**。
两份清单纯计数一致，具体行号因统计口径（是否把 `useMemo` 依赖数组计入）略有差异。

`contentQuery.*` / `getCatalog()` 在 UI 中的调用数 = **0**；`hasFeature()` 调用数 = **0**（契约 §12.6）。

### 4.3 架构视角的影响（非重复 GAP_ANALYSIS 的结论）

`GAP_ANALYSIS.md#A-1` 已说明「必须现在改」的原因。从分层架构角度补充三点结构性后果：

**① 依赖倒置**：正常依赖方向是 UI → Query → Index → Registry。
现在 UI → `wordBanks.ts` → Registry，形成了**第二条到 Content 的路径**。
两条路径的返回形状不同（`WordItem[]` vs `WordHit[]`），
`WordHit` 多带 `id` / `packageId` / `packageLocalId` / `packageTitle` 四个字段（`content-query.ts:27-39`），
`WordItem` 只有 4 个内容字段（`schema.ts:83-88`）。**UI 手上没有 ContentId** —— 这是 Learning 层
无法迁移到 ContentId 的直接原因（见 `LEARNING_ARCHITECTURE.md`）。

**② 缓存被分裂成两份**：`registry.loadPackage` 有 `loadedCache`（`registry.ts:75`），
`wordBanks.ts` 另有 `bankCache`（`wordBanks.ts:32`）。两者对 lazy 包走的是**同一次动态 import**
（`wordBanks.ts:68-70` 注释已说明「与查询层共享同一份缓存」），但对 inline 包，
`WORD_BANKS` 在模块初始化时就把 `words` 数组**引用**出去了（`wordBanks.ts:65`）——
UI 持有的数组与 `loadedCache` 里的是同一份，任何 UI 侧 `sort` / `splice` 都会污染 Content 层视图。
当前 UI 未做原地修改（`bank.words.find/map/length` 均为只读），但**没有任何机制阻止**。

**③ 索引形同虚设**：Index 层存在的价值是把 O(n) 线性扫描降到 O(1)/O(k)（`content-index.ts:3-4`）。
只要 UI 继续在 3000 词的数组上 `.find()`，Index 层对**用户可感知的路径**零贡献——
它的全部使用方只有 `tests/content-query.mjs`。架构上这是「建了但没接线」。

### 4.4 修复方向（建议，非已达成的现状）

契约 §12.4 已给出处置方式：把 `types.Clear` 作为**唯一白名单**，用棘轮（ratchet）约束 ——
计数只许降不许升，基线由 `tests/ui-contract.mjs` 落盘锁定。
`content/README.md:528` 记录该脚本「P1 落地时接入，当前未实现」。

---

## 5. 已知限制（架构层）

| # | 限制 | 事实 | 证据 |
|---|---|---|---|
| S-1 | 无路由 | 单页 `useState<TabId>` 切 5 个页签，URL 恒为 `/`，刷新回首页 | `App.tsx:44`、`App.tsx:83` |
| S-2 | 无错误边界 | 无 `ErrorBoundary` / `componentDidCatch`，任一组件抛错即白屏 | `KNOWN_ISSUES.md#UX-003` |
| S-3 | 无离线状态 UI | SW 缓存可用，但应用层零 `navigator.onLine` 监听 | `KNOWN_ISSUES.md#UX-001` |
| S-4 | 单入口、无代码分割 UI 侧 | 仅 3 个 lazy chunk（ielts/kaoyan/toefl），组件全部进主 chunk | `registry.ts:53-55` |
| S-5 | 无状态管理库 | 全部状态在 `App.tsx` 顶层 `useState` + prop 下传 | `App.tsx:83-113` |
| S-6 | 无后端 | 无 API 调用、无数据库、无用户体系 | 全仓无 `fetch(` 业务调用 |

---

## 6. 一句话结论

> 七层分层在 Content 侧（①~⑤）是真实且严谨的，四个职责（Registry/Catalog/Index/Query）
> 各有独立文件、独立契约、独立门禁。**但 ⑥ UI 层与 ⑤ Query 层之间的接线从未发生** ——
> UI 走的是 `src/data/wordBanks.ts` 这条 V3 兼容路径，导致 Index 层对用户零贡献、
> Learning 层拿不到 ContentId。这不是「架构不够好」，是「架构未接线」。
