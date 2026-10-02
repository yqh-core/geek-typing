# Relation Validator Hardening（Stage 2 · 下一刀第 1 刀）—— 交付证据

> 日期：2026-10-02
> 范围：**只做判据①`relation.type ∈ RelationType`**（用户裁定 A）
> 上游：`STAGE2-PHASE2-CLOSED-AND-NEXT-KNIFE-2026-10-02.md` §7 步骤 0
> 前置核查：`STAGE2-RELATION-VALIDATOR-PRECHECK-2026-10-02.md`

---

## §0 验收目标（用户写死）

> 「不是『把18 包重新验绿』，而是『**证明 validator 现在能够可靠地把非法 relation type 判红**』。」
> 「第一次跑出 `mentions` FAIL **不是回归，是这刀成功的第一份证据**。」

本文档即按此目标组织：先给判红证据，再给**双向证伪**，最后给范围守住证明。

---

## §1 第一份成功证据：机器判红了真违规

`node scripts/content/validate.mjs`：

```
▸ reading/demo-reading-01
  ✗ relation 校验失败 1 处：#1 非法 relation type："mentions"（不在 RelationType 白名单内）
[content:validate] FAIL：1 项
EXIT=1
```

**同一份数据在加固前的实测行为**（假绿基线，本轮之前）：
```
✓ relations.json 4 条：端点合法且可达
[content:validate] PASS：18 包全部通过
EXIT=0
```

⇒ 同一份数据，同一台机器，判据①上线前后从 **PASS 变成 FAIL** —— 缺口被真实闭合。

**其余 17 包 + `demo-study-set` 的 7 条边零误判红**（`✓ relations.json 7 条：type 合法、端点合法且可达`）。

---

## §2 双向证伪：判据是判据，不是恒红

一条会判红的判据，如果对任何输入都判红，它和没有判据等价。故必须成对证明双向。

### 证伪 A：把非法 type 换成合法 type ⇒ 应转绿

注入：`content/reading/demo-reading-01/relations.json` 的 `#1` 从 `mentions` 改为 `appears_in`

```
✓ relations.json 4 条：type 合法、端点合法且可达
[content:validate] PASS：18 包全部通过
EXIT=0
```

⇒ 判据**不是恒红**。

### 证伪 B：注入 3 个全新违规 type ⇒ 应全部判红

注入（同一文件三个不同位置的 type 分别改成）：

| 位置 | 注入值| 用途 |
|---|---|---|
| `#0` | `lesson_of` | 未知 type（不是特判 `mentions`） |
| `#1` | `""`（空串） | 字段存在但为空 |
| `#2` | `Contains`（首字母大写） | 大小写漂移 |

结果：
```
✗ relation 校验失败 3 处：#0 非法 relation type："lesson_of"（不在 RelationType 白名单内）；
  #1 非法 relation type：""（不在 RelationType 白名单内）；
  #2 非法 relation type："Contains"（不在 RelationType 白名单内）
EXIT=1
```

⇒ 三处全部判红，**不是只认 `mentions` 一个**；**大小写不做归一放行**（归一等于替脏数据擦屁股）。

### 证伪 C：真实 `content/` 未被写入

两次注入均用临时副本操作，结束后 `git diff --stat content/` **零输出** ⇒ 真内容零污染。

---

## §3 契约测试（成对断言，防假绿）

`node tests/relations.mjs`：**16/16 通过**（加固前为 9 项）。

新增第 ⑦ 组，四条断言按「能判红 + 不误判红 + 不归一 + 同源」成对设计：

| 断言 | 内容 | 结果 |
|---|---|---|
| ⑦-a | 非法 type 被判红（`isValidRelationType("mentions") === false`） | ✅ |
| ⑦-b | **6 个合法 type 全部不被误判红**（防「一律判红」式假判据） | ✅ |
| ⑦-c | `undefined` / `null` / `""` / `"Mentions"` / `"MENTIONS"` / `" contains"` 全判红（fail-closed） | ✅ |
| ⑦-cb | `relationEndpoints` 三种形状（`endpoints` / `from`+`to` / `source`+`target`）口径一致 | ✅ |
| ⑦-d | **静态同源断言**：脚本侧 `RELATION_TYPES` 与运行侧 `relation.ts` 的 TS 联合类型逐项一致 | ✅ |

**⑦-d 为什么必须存在**：脚本侧（node跑，手写 `Set`）与运行侧（TS 联合类型）是两份清单，
必然漂移 —— 这正是 P18-A「12→14 白名单漂移」的原型。故把它做成机器判据，不靠注释提醒同步。

```
TS 侧 6 个 [belongs_to, contains, related_to, prerequisite, appears_in, same_as]
vs 脚本侧 6 个 [belongs_to, contains, related_to, prerequisite, appears_in, same_as]
```

---

## §4 门自带证伪自检

`node scripts/content/validate.mjs --falsify`：**4/4 断言通过**（EXIT=0）
⇒ 隔离副本已清理，**真 `content/` 未被写入**。

---

## §5 范围守住证明

| 项 | 状态 |
|---|---|
| `content/` 数据 | **零改动**（`git diff --stat content/` 空） |
| `mentions` 的归属 | **未裁定、未清理、未迁移**（等评审） |
| `RelationType` 联合类型 | **未改**（6 个值原样） |
| `RELATION_TARGET_TYPES` | **未改**（判据② 不在本刀，见前置核查 §4） |
| `registry.ts` / `getRelations()` | **未碰**（恒 `[]` 是独立问题，本刀不处理） |
| `items.json` / 词形白名单 | **未碰**（不造关系数据） |
| `registry.ts` 预算常量 / 棘轮 | **未碰** |
| Course / Lesson | **仍未授权** |

改动仅5 个文件（4 脚本 + 1 测试），`+152 / -13`。

---

## §6 当前红灯状态（**有意保留**，用户裁定 A）

用户裁定：**选 A —— 提交当前结果，保留 CI 红灯，下一轮评审裁定 `mentions` 归属。**

理由（用户原话）：「现在这两个 mentions 红灯是真实关系校验结果，不是误报……
CI 变红是设计上应该暴露问题，不应该为了绿灯去篡改数据。」

因此**当前实测状态**：

| 门 | EXIT | 说明 |
|---|---|---|
| `content:validate` | **1** | 1 项FAIL = `demo-reading-01` 的 `mentions` |
| `gate:content-contract` | **1** | 同上（该门在`gate-architecture` 的 10 个子门内） |
| `gate:architecture` | **1** | 10 项中 9 过、1 败，失败子项 = `content-contract` |
| CI（`.github/workflows`） | 会红 | 工作流第 46-47 行直接跑 `npm run content:validate` |
| `tests/relations.mjs` | **0** | 16/16 |
| `validate --falsify` | **0** | 4/4 |

**这是本刀的预期状态，不是回归。** 红灯即「机器发现了真违规」的持续证据，
直到下一轮评审裁定 `mentions` 归属（清理 / 迁移 / 纳入模型）后才可能转绿。

---

## §7 下一轮评审待裁（已结转）

1. **`mentions` 的归属**：`content/reading/demo-reading-01/relations.json` 里这一条
   `content:reading:… --mentions--> content:word:curated-ai-core:transformer`该怎么处理：
   - **A. 清理/迁移**（用户已倾向：`appears_in` 语义上很可能已覆盖这个场景）；
   - **B. 显式纳入 `RelationType`**（需同时改 TS 联合类型 + 脚本白名单 + 补 `RELATION_TARGET_TYPES` 条目）。
2. **`RELATION_TARGET_TYPES` 是否完整**（独立议题，判据② 的前置）：
   `contains` 缺 reading / topic / listening / writing / speaking / grammar / collection / course / lesson 共 9 类，
   与 `types/registry.ts:249`「集合靠 relation 层描述成员关系」冲突（见前置核查 §2）。
3. **`getRelations()` 恒 `[]`**：关系运行时断链，与「有没有真实关系数据」是两个独立问题（文档已分开记）。