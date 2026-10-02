# Stage 2 · Phase 2（Learning Unit）CLOSED 落档 + 下一刀的事实前提

> 日期：2026-10-02
> 上游：`STAGE2-PHASE2-LEARNING-UNIT-PLAN-2026-10-02.md`（方案）
> 交付 commit：`01c3633` feat(ui): Stage 2 第一刀落地学习单元最小闭环
> 裁定来源：第九轮终裁（用户），逐条比对方案边界与实际执行结果

---

## §0 裁定：Phase 2 CLOSED

判为**完成**的依据不是「代码提交了」，而是下面这条链每一环都有可复跑的判据：

```
设计边界 → 最小实现 → 契约门 → 构建 → 架构门 → E2E → 真机 → 数据持久化 → bundle → 文档回填 → commit
```

| 层 | 实测 | 结论 |
|---|---|---|
| UI Contract | 21/21 | ✅ |
| Architecture Gate | 10/10 | ✅ |
| Boundary AST | 20/20 | ✅ |
| E2E | **171/171** | ✅ |
| 真机 V1–V3 | **24/24** | ✅ |
| Bundle 判据 | 6/6 PASS | ✅ |
| 全程 console error | 0 | ✅ |

**且全程没有为过门禁放松任何既有棘轮**（未用 `--force-raise`、未 `--record-baseline`、未改门脚本、未改预算常量）。

---

## §1 边界守住的逐条核对

| 方案约束 | 实际 | 证据 |
|---|---|---|
| `registry.ts` 零改动 | ✅ | 只在**门面** `core/content/index.ts` 重导出 `loadPackage`/`loadPackageData`；registry 本体未动 |
| 不实体化 Course/Lesson | ✅ | 未建任何 `content/course` / `content/lesson` |
| 不提前造 relations.json | ✅ | 本刀未新增任何 relations.json |
| 判据 2（数据 chunk 数） | ✅ | 仍 15（words 7 + items 8） |
| 判据 5（lazy 探测集） | ✅ | 不增包 ⇒ 探测集不变，15 个 lazy 包探测串主 chunk 命中 **0** 次 |
| 页签仍 5 个 | ✅ | `tab-home / tab-typing / tab-memorize / tab-review / tab-progress` |
| 不批量导入内容 | ✅ | `content/` 未增删文件 |
| 不伪造音频/字幕/练习能力 | ✅ | 三处显式「待接入」+ **零可点按钮**（不做假播放器/假作答） |

**门面开口的正确性**（这刀唯一一处架构层面的新增）：
`bypassFacadeImports` 棘轮基线是 **0**，所以 UI 不允许深路径直引 `core/content/registry`；
而单元加载通道又必需 `loadPackage` / `loadPackageData` 这两个**registry 已有的**函数。
唯一合法出口就是从顶层 barrel 开口重导出 —— 不是绕过 facade，是**把facade 补完整**。

---

## §2 主 chunk 成本：接受，不回压

| | raw | gzip |
|---|---|---|
| 实现前基线 | 384.21 KiB | 119.06 KiB |
| 实现后实测 | **395.58 KiB** | **122.00 KiB** |
| 增量 | +11.37 KiB | +2.94 KiB |
| 上限 | 439.45 KiB | 141.60 KiB |
| 余量 | 10.0% | 13.8% |

**裁定：接受这个成本，不为把数字压回 384 KiB 做过早优化。** 理由：

- 预算是棘轮，方向正确（`450000/145000` 一行未改）；
- 增量主体是门面两个导出 + 编排表 100 词白名单，是**实际加载通道所需**，不是无意义膨胀；
- `WARMUP_IDS` 未动、registry 未动、lazy 语义未破坏；
- 仍有 44 KiB raw 余量，离红线很远。

---

## §3 §8 观察项 1320.60 KiB：仍只是观察项

首屏 JS 合计 1320.60 KiB **维持「记录观察、不整改、不重新打开 Stage 1」**。

理由（不变，且现在多一条）：
在 `首屏 → 进入 IELTS → 打开学习单元 → 加载音频/字幕/练习` 这条链路被**实测**之前，
不得以1320.6 KiB 为由改 `scripts/check-bundle.mjs` 预算或预热清单。
本刀只走了这条链路的前三段（首屏 → 单元 → 打字），后三段（音频/字幕/练习）**内容层仍是空的**，
拿现在的体积说「预热是瓶颈」等于拿一个没跑完的链路下结论。

---

## §4 三个坑（判定长期有效，保留）

### 坑 ① `.words` 是 UI 契约域的形状词，不是普通属性名
`isHandleBase` 的规则是「`PropertyAccessExpression` 且属性名 `=== 'words'`」或「标识符 ∈ handleNames」。
⇒ **UI 扫描域里任何 `X.words.length` / `X.words.map` 都会计入 `handleReads`，与 X 是不是词表无关。**
工程规则：词表相关的读与算子**全部下沉到 `src/data/`**（不在扫描域），UI 只收 `number` / `string[]` / `boolean`。
扫描域 = `src/App.tsx` + `src/main.tsx` + `src/components/**` + `src/hooks/**` + `UI_EXTRA_FILES`；
**`src/data/**` 不在扫描域内** —— 编排表放这里不是随意选的。

### 坑 ② UI 文案不是稳定的自动化锚点
Home 页签的中文文案是**「今日」**不是「首页」。按「首页」找永远落空，
症状却表现为「切回 Home 没生效、sub-view 状态坏了」—— 极易误判成产品 bug。
**规则：一律按 DOM id（`tab-home` 等）选页签**，与 i18n 文案解耦；文案会变，id 是契约。

### 坑 ③ 合成 KeyboardEvent 打不动字
`new KeyboardEvent('keydown')` 是 `isTrusted=false`，React 的 `onKeyDown` 收不到。
表现极具欺骗性：字母「打进去了」、词不推进、`localStorage` 全空、完成度恒 0 —— 像功能坏了。
正解 = CDP `Input.dispatchKeyEvent`（与 `tests/e2e.mjs:177` 的 `page.keyboard.type()` 同一条通道）。
补：打字页当前词的 testid 是 **`word`**（`src/components/PracticePanel.tsx:35`）。

---

## §5 下一刀的前置核查：**Relation 形状落地现在做不了**

用户第九轮定方向「下一刀按 §5.4 走」，但同时立了一条硬原则：

> **不要为了满足 relation 模型而人为编词。真正要解决的是：哪些真实音频/听力条目，实际上覆盖哪些真实 IELTS 词？**

本刀完成后就这个问题做了一次**实测核查**，结论是**答案现在还不存在**。三条硬证据：

### 事实 R1：全仓 18 个包里，**没有任何一个真实的audio / listening 包**

```
content/audio/     → demo-audio-01     （唯一）
content/listening/ → demo-listening-01 （唯一）
```

两者 manifest 的 `description` 写得很清楚：

- `audio/demo-audio-01`：「audio 类型**试金石包**（B-2 结构探针）」，`tags: ["demo"]`，`origin: "curated in-repo (B-2 试金石)"`
- `listening/demo-listening-01`：「listening 类型**试金石包**（B-2 结构探针）」

⇒ 它们是**结构探针**，不是内容。exercise / reading / speaking / writing / topic / collection 全部同此性质。

### 事实 R2：这些条目是**题型样板**，内容层为空

`content/audio/demo-audio-01/items.json` 全文 5 条：

```json
[{"id":"audio-item-01","title":"Audio clip: number dictation 01"},
 {"id":"audio-item-02","title":"Audio clip: number dictation 02"},
 {"id":"audio-item-03","title":"Audio clip: minimal pairs"},
 {"id":"audio-item-04","title":"Audio clip: sentence stress"},
 {"id":"audio-item-05","title":"Audio clip: shadowing drill"}]
```

`content/listening/demo-listening-01/items.json` 全文 6 条：
`Short conversation: booking a table` / `asking for directions` / `Monologue: campus introduction` /
`weather forecast` / `Dialogue: library renewal` / `Announcement: platform change`

⇒ 条目**只有 `{id, title}` 两个字段**，title 是**题型名称**（数字听写 / 最小对立对 / 句重音 / 影子跟读 /
订位对话 / 问路 / 校园介绍 / 天气预报 / 图书馆续借 / 站台变更），
**既没有音频二进制，也没有转写稿，更没有任何一个 IELTS 词形**。

⇒ 「哪些真实音频覆盖哪些真实 IELTS 词」这个问题，在这个仓里**没有数据源可答**。
硬填`words: ["eagle", ...]` 就是 R2 意义上的编词 —— 正是那条原则禁止的。

### 事实 R3：`getRelations()` 恒返回 `[]`，relation 运行时**从未被消费**

`src/core/content/registry.ts:215-217`：

```ts
/** 关系查询：当前无 relations.json，恒为空数组（关系模型已就位，接入内容即产出） */
export function getRelations(_contentId: string): ContentRelation[] {
  return []
}
```

⇒ 即便现在造出 `word --appears_in--> audio`，**运行时也读不到**。
`relation.ts:4` 声明的数据流「relations.json → registry.getRelations()」**当前是断的**。

---

## §6 核查中发现的既存漏洞：relation 校验**不查 type**

顺手查了校验器（`scripts/content/validate.mjs:501-521`、`scripts/content/ingest.mjs:140-158`），
它们对 relations.json 只校验两件事：**端点格式合法 + 端点可达**。
**完全不校验 `type` 是否在 `RelationType` 联合里。**

实证：仓里已有两份relations.json，其中一份含**非法 type**：

`content/reading/demo-reading-01/relations.json`：
```json
{"from":"...demo-reading-01","to":"content:word:curated-ai-core:transformer","type":"mentions"}
```

而 `RelationType`（`src/core/content/relation/relation.ts:24-39`）只有6 个值：
`belongs_to` / `contains` / `related_to` / `prerequisite` / `appears_in` / `same_as` —— **没有 `mentions`**。

跑 `node scripts/content/validate.mjs`（EXIT=0）：
```
✓ relations.json 7 条：端点合法且可达
✓ relations.json 4 条：端点合法且可达
[content:validate] PASS：18 包全部通过
```
⇒ **含非法 type 的 relations 照样 PASS。** 这是一个真实的、能假绿的校验缺口。

---

## §7 因此下一刀的实际形态（不是原§5.4 那四步）

原方案 §5.4 是「加 `words: string[]` → 校验词在 ielts → 构建 relations → 产出 appears_in」。
按 R1/R2/R3，这四步**现在无法诚实执行**。当前唯一能诚实推进、且不编数据的一步是**第0 步：把校验补成机器判据**：

| 步骤 | 内容 | 为什么现在能做（不依赖真实内容） |
|---|---|---|
| **0（唯一可做）** | 给 relation 校验补**type 白名单判据**：`type ∈ RelationType`，并按 `RELATION_TARGET_TYPES` 校 `to` 的类型 | R6 已证现有校验器漏此项；补上后会立刻判红现存那份含 `mentions` 的 relations —— 这是**暴露既存问题**，不是引入新问题 |
| 1 | 决定 `mentions` 的归属：它是RelationType 的漏项，还是B-2 试金石的历史遗留应清理 | 需要评审；`appears_in`（词→音频/听力/阅读）语义上已覆盖 `mentions` |
| 2 | **等真实内容**：`items.json` 带真实词覆盖（真实转写稿 → 真实 IELTS 词形） | R1/R2：无数据源。**不得手填** |
| 3 | 接 `getRelations()` 运行时 | R3：当前恒空，属独立的一刀 |

> 步骤 0 与「Phase 3 上手」无关，也**不动Phase 1 基线**：
> 它改的是 `scripts/content/` 里的校验逻辑，不改预算常量、不改棘轮、不改 `registry.ts`。

---

## §8 当前状态树

```
Stage 1  CLOSED                          ← 基线 / registry / gates 全部冻结
└── Stage 2 = 产品探索
     ├── Phase 1：真实内容观察          ← CLOSED（上一刀）
     ├── Phase 2：Learning Unit         ← CLOSED（本刀，commit 01c3633，V1–V4 全绿）
     ├── 下一刀：Relation 形状落地       ← 尚未执行
     │     └── 阻塞在「真实内容不存在」（R1/R2），先做步骤 0（校验补type 判据）
     └── Course / Lesson                ← 继续冻结（解禁需真实需求 + 重新评审）
```

---

## §9 遗留观察项（不整改，等下一刀一起看）

1. 首屏 JS 1320.60 KiB（§3）——链路未跑完，不下结论。
2. `getRelations()` 恒空（R3）——运行时断链，与关系数据是否产出**两个独立问题**，别混。
3. relation 校验不查 type（R6）——**唯一现在就能修且不编数据**的一项。
4. `mentions` 的归属未定 —— 需要评审。
5. Panel lazy 101.6 KiB 等 N6 UX；S2-3 门槛值无判据；R2 凭据仍 BLOCKED。
6. `PLANNED_BASELINE` staleness、`loadFailedFor` 冗余 state、e2e 第四态零覆盖、`items` 分支 src 过滤未接。