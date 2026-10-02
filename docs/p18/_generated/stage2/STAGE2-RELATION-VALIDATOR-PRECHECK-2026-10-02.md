# Stage 2 · Relation Validator Hardening —— 实施前的第二层核查（target-type 判据的模型缺口）

> 日期：2026-10-02
> 上游裁定：Relation Validator Hardening，只做步骤 0（type 白名单 + target-type 判据 + 违规测试 + 全量validate）
> 状态：**实施前核查发现阻塞项，需评审裁定后才动代码**

---

## §0 结论先说

**判据①（`type ∈ RelationType`）可以直接做**：它独立成立，补上后只会判红 1 条现存边（`mentions`）—— 正是预期的第一份证据。

**判据 ②（`to` 按 `RELATION_TARGET_TYPES` 校验）现在不能直接做**：照搬 `RELATION_TARGET_TYPES` 会让
**现存 5 条合法边判红**，因为那张表本身有缺口。补缺口 = 改模型 = 需要评审（与你第 4 条
「不要擅自扩RelationType」同一性质）。

---

## §1 实测：照搬 `RELATION_TARGET_TYPES` 会假红 5 条

现存 11 条 relations 边（`demo-reading-01` 4 条 + `demo-study-set` 7 条）逐条核算：

```
=== content/reading/demo-reading-01 (4 条)
  #0 type=contains  to类型段=vocabulary   允许=[word,audio,document,exercise]        ✓
  #1 type=mentions  <<< 非法 type          to类型段=word                            ✗ 非法 type
  #2 type=contains  to类型段=reading     允许=[word,audio,document,exercise]        ✗ target 不符
  #3 type=contains  to类型段=reading     允许=[word,audio,document,exercise]        ✗ target 不符

=== content/collection/demo-study-set (7 条)
  #0 type=contains  to类型段=vocabulary   允许=[word,audio,document,exercise]        ✓
  #1 type=contains  to类型段=vocabulary   允许=[word,audio,document,exercise]        ✓
  #2 type=contains  to类型段=topic       允许=[word,audio,document,exercise]        ✗ target 不符
  #3 type=contains  to类型段=reading     允许=[word,audio,document,exercise]        ✗ target 不符
  #4 type=belongs_to to类型段=vocabulary   允许=[vocabulary,topic,collection]        ✓
  #5 type=contains  to类型段=reading     允许=[word,audio,document,exercise]        ✗ target 不符
  #6 type=contains  to类型段=reading     允许=[word,audio,document,exercise]        ✗ target 不符
```

⇒ **6 条判红**：1 条真违规（`mentions`）+ **5 条是假红**（现存数据本身合规，是表缺项）。

若照搬就补，第二刀会立刻把 18 包判红，且**红灯里混着真违规和假红** ——
那就不是「validator 能可靠判红」，而是「validator 一开就乱判」，比现在的假绿更糟。

---

## §2 缺口出在模型表，不是判据

`RELATION_TARGET_TYPES`（`src/core/content/relation/relation.ts:54-61`）：

```ts
contains: ['word', 'audio', 'document', 'exercise'],
```

而 `CONTENT_TYPES`（`scripts/content/license-policy.mjs:54-58`）是 13 项：
`vocabulary / listening / audio / reading / topic / exercise / writing / speaking / grammar / document / collection / course / lesson`

⇒ `contains` 少了 **`reading` / `listening` / `topic` / `writing` / `speaking` / `grammar` / `collection` / `course` / `lesson`** 共 9 类。

**但这些「缺失」在语义上都是合法的**。最硬的反证在同仓`src/core/content/types/registry.ts:249`：

> collection 的 `note`：「**集合靠 relation 层描述成员关系（relations.json）**，不在此内联成员列表。」

⇒ `collection --contains--> reading` / `topic` / `vocabulary` **是本仓设计上明确要求的用法**
（集合包的存在意义就是聚合其它包），却不在 `contains` 的允许列表里。

`appears_in` 同理：`['audio','document','listening','reading']` 里没有 `video` 等，
但更重要的是它没覆盖「词出现在 exercise / collection 里」这类场景 ——
而 `exercise` 明确是 13 类ContentType 之一。

**结论：`RELATION_TARGET_TYPES` 是一张不完整的表，当前没有被任何判据消费，所以这个缺口从未暴露。**
一旦判据 ② 上线，缺口立刻变成 5 条假红。

---

## §3 为什么不能由我自行扩这张表

扩 `RELATION_TARGET_TYPES` 属于**改模型语义**，与「把 `mentions` 塞进 `RelationType`」是同一性质的动作。
你在第九轮已经明确：

> 「不要为了让 validator 重新变绿，就把 mentions 塞进枚举」……「应由评审最终裁定，而不是为了过门禁提前决定」

同一条纪律对 `RELATION_TARGET_TYPES` 同样成立：为了让门绿而补全允许列表 =
我自己在决定「哪些关系语义合法」。若我补错，validator 会把**真正违规的边**判绿 —— 
这比现在的假绿方向相反、后果更坏。

## §4 三条可选路径（需评审裁定）

| 方案 | 做法 | 代价 / 风险 |
|---|---|---|
| **A. 拆两步走**（本刀只做判据①） | 这刀只补 `type ∈ RelationType` + 违规测试。判据 ② 待`RELATION_TARGET_TYPES` 补全后单独一刀 | 本刀交付面窄；但每一条判据都是真判据，无假红 |
| **B. 同刀补全模型表 + 判据②** | 评审裁定 `contains` / `appears_in` 的允许列表 → 一次做完 | 一步到位；但**本刀就变成「改模型 + 加判据」两件事**，且补全列表的语义边界（`contains` 能不能含 `collection`？`course`？`grammar`？`writing`/`speaking` 算不算「内容」？）本身需要逐项裁定 |
| **C. 判据② 只对 `from` 已知的类型生效** | 先只校验「type 非法」，target-type 只在评审给出完整表后启用 | 等于 A，但把「待启用」显式写进代码/文档，避免后人误以为已覆盖 |

**我的建议：A**（= 你的裁定 ① type 白名单 + ④ 违规测试 + ⑤ 全量 validate）。
它满足你这刀的全部验收目标 —— 「**证明 validator 现在能够可靠地把非法 relation type 判红**」——
且完全不触碰任何模型语义表。

判据 ② 我建议**单独一刀**，评审只需裁定一件事：`RELATION_TARGET_TYPES` 的每个 type
允许哪些 `to` 类型段。这是一次纯语义的表定义工作，不该和「validator 加固」混在一起交付。

---

## §5 若走 A，本刀的预期结果（写死，便于事后核对）

| 项 | 预期 |
|---|---|
| `content/validate` | **EXIT=1**，报出 `demo-reading-01` 1 处非法 type（`mentions`） |
| 其余 17 包 | 全部通过 |
| `tests/relations.mjs` | 新增两条断言：① 现存非法 type 被判红 ② 合法的 6 个 type 不被误判红（**成对，防「一律判红」式假绿**） |
| `content/` 数据 | **零改动**（`mentions` 的归属等评审裁定，本刀不清理、不迁移、不改 `RelationType`） |
| `registry.ts` / 预算 / 棘轮 / 页签 | 零改动 |

**首次跑出 `mentions FAIL` 是本刀成功的第一份证据，不是回归** —— 这条已写进你的裁定，本档固化。