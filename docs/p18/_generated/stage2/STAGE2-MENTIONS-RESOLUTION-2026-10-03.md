# `mentions` 归属评审材料—— 事实已查清，等你裁定

> 日期：2026-10-03
> 触发：`8e14722` 判据①上线后 `content:validate` / `gate-content-contract` / `gate-architecture`
> 三门持续判红（失败子项 = `content/reading/demo-reading-01` 的 `#1`）
> 上游：`STAGE2-RELATION-VALIDATOR-EVIDENCE-2026-10-02.md` §7 待裁第 1 项

**本文档只摆事实，不给倾向性结论，不改任何数据。** 处置方案由评审裁定。

---

## §1 这条边是什么

```
content/reading/demo-reading-01 --mentions--> content:word:curated-ai-core:transformer
```

它是现存 11 条relations 里**唯一的「包 → 词」方向的边**，也是唯一一条非法 type：

```
=== content/reading/demo-reading-01（4 条）
  #0  contains    reading:demo-reading-01              -> vocabulary:ai-core
  #1  mentions    reading:demo-reading-01              -> word:transformer        <<< 非法 type
  #2  contains    reading:demo-reading-01              -> reading:reading-item-01
  #3  contains    reading:demo-reading-01              -> reading:reading-item-02

=== content/collection/demo-study-set（7 条）
  #0  contains    collection:demo-study-set-> vocabulary:ai-core
  #1  contains    collection:demo-study-set            -> vocabulary:cet4
  #2  contains    collection:demo-study-set            -> topic:demo-topic-01
  #3  contains    collection:demo-study-set            -> reading:demo-reading-01
  #4  belongs_to  word:abandon                -> vocabulary:cet4
  #5  contains    collection:demo-study-set            -> reading:reading-item-01
  #6  contains    collection:demo-study-set            -> reading:reading-item-02
```

注意方向对比：其余 10 条都是「包/词 → 包」或「集合 → 成员」，
**只有 #1 是「内容 → 某个具体词」**，即它想表达的是「这篇阅读里出现了 transformer 这个词」。

---

## §2 语义核对：这条边**没有内容事实支撑**

`content/reading/demo-reading-01/items.json` 全文 6 条：

```json
[{"id":"reading-item-01","title":"Passage: The origin of tea"},
 {"id":"reading-item-02","title":"Passage: Coral reefs under stress"},
 {"id":"reading-item-03","title":"Passage: How bridges stand"},
 {"id":"reading-item-04","title":"Passage: Sleep and memory"},
 {"id":"reading-item-05","title":"Passage: Ancient trade routes"},
 {"id":"reading-item-06","title":"Passage: The first maps"}]
```

**六个标题（茶 / 珊瑚礁 / 桥 / 睡眠 / 古代商路 / 早期地图）没有一条与 `transformer` 有关。**

而`transformer` 在 `ai-core` 里的词条是：

```json
{"word":"transformer","translation":"变换器架构 / Transformer 架构"}
```

这是 **AI/LLM 领域**的词（`ai-core` 包 = 「大模型 / AI 工程师高频词汇」，43 词）。
把它挂在一篇讲茶叶起源的阅读文章上，**语义上不成立**。

⇒ 这条边是**手编的**，不是从内容事实推出来的。

---

## §3 出处查证：它是P18-G1 一次门禁测试的**留痕产物**

```
commitbeeb9cc  content(p18-g1): 真实 relations 落地 —— 包级/词条级/条目级非 word 三种端点
作者  yqh-core   日期  2026-10-01 10:26:08 +0800
```

该 commit 的**全部**改动只有 2 个文件、2 行：

```
content/collection/demo-study-set/relations.json | 2 +-
content/reading/demo-reading-01/relations.json   | 1 +
```

拆开看两处各加了什么：

**① `demo-study-set` 加了 2 条**（都是**条目级端点**）：
```diff
+{"from":"...demo-study-set","to":"...demo-reading-01:reading-item-01","type":"contains"}
+{"from":"...demo-study-set","to":"...demo-reading-01:reading-item-02","type":"contains"}
```

**② `demo-reading-01` 加了 1 条**（即本问题的那条）：
```json
{"from":"...demo-reading-01","to":"content:word:curated-ai-core:transformer","type":"mentions"}
```

`git show beeb9cc^:content/reading/demo-reading-01/relations.json` 报
`exists on disk, but not in 'beeb9cc^'` ⇒ **这个文件就是 beeb9cc 新建的**。

### 意图还原

commit 标题自述：「**包级/词条级/条目级非 word 三种端点**」——
它在验证「端点可达性判定已扩展到非 word 端点」（P18-G0 的后续）。
为此它需要**三种形态各一个样本**：

| 形态 | 样本 | 是否成功 |
|---|---|---|
| 包级 | `contains → vocabulary:ai-core` | ✅ 早已有 |
| **词条级** | `mentions → word:transformer` | ⚠️ **这条就是本问题那条** |
| 条目级 | `contains → reading:reading-item-01` | ✅ 本commit 加的 |

⇒ **`mentions` 是当时随手写的第4 个 type，用来试「换type行不行」**，
它承担的是「**验证可达性能否解析词级端点**」这个测试职责，
**不是**在表达「这篇阅读包含 transformer」这个内容事实。

**旁证**：`transformer` 恰好是 `tests/relations.mjs` 里取样用的那个词
（`vocabPkg.payload.find((w) => w?.word === 'transformer')`）——
说明作者当时手上正拿着这个词做端点可达性测试，顺手把它写进了relations。

---

## §4 三个处置方案（供裁定）

| 方案 | 做法 | 影响面 | 代价 |
|---|---|---|---|
| **A. 删除该条边** | 移除 `mentions` 那一行 | `content/`改动 1 行；3 门立即转绿 | 若 `appears_in` 语义确实需要「内容→词」这个方向，删掉后将来要重建 |
| **B. 迁为 `appears_in` 并反方向** | 改成 `content:word:...:transformer --appears_in--> content:reading:...:demo-reading-01` | `content/` 改动 1 行（from/to 互换+ type）；3 门转绿 | ⚠️ **方向变了**，且 `appears_in` 的 to 允许列表含 `reading` ✅ 合法。但语义仍不成立（文章里没有 transformer） |
| **C. 纳入 `RelationType`** | 把 `mentions` 加进 TS 联合类型 + 脚本白名单 | 改 `relation.ts` + `relations.mjs` + 补 `RELATION_TARGET_TYPES` 条目 | 需同时裁定 target-type 列表（当前不完整，见 §5）；等于给一条手编数据发永久通行证 |

### 一个必须一并回答的前置问题

**方案 A/B/C 都在回答「这条边该怎么办」，但没回答「它凭什么存在」。**

§2/§3 已证明：它**没有内容事实支撑**（文章不含 transformer），且**来源是门禁测试留痕**。
所以还有第四个选项：

**D. 先只清理，不补模型。** 认定它是测试留痕而非内容事实 → 走A（删除）；
同时把「内容 → 词」这个方向的需求**留到有真实内容时再提**（与 P18 的既有纪律一致：
无真实内容不建关系）。

---

## §5 与另两个待裁项的关系（三者**互相独立**，别混）

| 待裁项 | 现状 | 是否阻塞本条 |
|---|---|---|
| **① `mentions` 归属** | 本文档 §1–§4 | — |
| **② `RELATION_TARGET_TYPES` 不完整** | `contains` 缺 9 类（含 `reading`/`topic`），与 `types/registry.ts:249`「集合靠 relation 层描述成员关系」冲突 | **否**。判据② 尚未上线，缺口未暴露 |
| **③ `getRelations()` 恒 `[]`** | 运行时断链 | **否**。与「有没有真实关系数据」是两个独立问题 |

> 若选方案 B（迁为 `appears_in`），会**顺带验证** `appears_in` 的 to 列表确实含 `reading` ✅，
> 但**不会**触及②（`contains` 的缺口）—— 两者是不同type。

---

## §6 现状（等裁定期间保持不变）

| 项 | 状态 |
|---|---|
| `content/` | **零改动**（判据①上线至今） |
| 3 门 |持续判红（EXIT=1），失败子项 = 本文档这一条 |
| CI | 会红（工作流第 46-47 行直接跑 `content:validate`） |
| 判据① 实现 | 已提交 `8e14722`，双向证伪已复核 |
| 其它 10 条 relations | 合法，零误判红 |

**本文档不提出倾向，只提供「它是测试留痕、不是内容事实」这一事实，
供评审决定是删（A/D）、迁（B）还是纳（C）。**
