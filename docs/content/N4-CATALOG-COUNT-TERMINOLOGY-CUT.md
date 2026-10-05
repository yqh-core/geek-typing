# N4 裁定 · vocabulary-only / all-types 命名口径统一

**状态**：DECIDED（2026-10-05）
**裁定人**：yqh（项目负责人）
**执行**：team lead 取证 → 工程师最小改名 → team lead 复核 → CI 权威证据
**基线**：`HEAD == origin/main == 8ca8178`（CI `37300741138` success）

---

## L0 目标与硬边界

**目标**：让「两类条目集合」在代码 / 门禁 / 报告里有**唯一且自解释的名字**，
任何人看到变量名就知道它数的是哪一类。

> **本刀只改名字，不改任何统计口径。** 口径数值必须与改动前逐字节相同。

**OUT（明确不做）**：
- ❌ 不改首页「词库 N · M 词」的**文案**（属产品口径，超边界）
- ❌ 不改任何 manifest 的 `stats.items` 值
- ❌ 不回改 `docs/audit-package/**`（P1.7 冻结交付物，`verify:p17-frozen` 把关）
- ❌ 不引入新的 alias / 第三个同义词
- ❌ 不动 14 份 `findChrome` 副本、不动 INV-3 解锁

---

## L1 取证：现状枚举（team lead 实测，2026-10-05）

**当前仓库态**：`packages = 27`（带 `manifest.json` 的包数）

### 两类集合的真值

| 口径 | 数值 | 定义 | 算法落点 |
|---|---|---|---|
| **vocabulary-only items** | **9438** | 只数 `manifest.type === 'vocabulary'` 的包 | ⚠️ **无共享实现**，见 L2 |
| **all-types items** | **9486** | 数**全部**类型包的 `stats.items` | `tests/helpers/catalog-totals.mjs` |
| 差值 | **48** | 非词汇条目（reading 9 / exercise 8 / listening 6 / audio 5 / collection 5 / speaking 5 / topic 5 / writing 5） | — |

⚠️ 上表数字均由本轮**现算**得出（读 27 个 manifest，按 `type` 字段分组求和），
未引用任何历史文档的旧值。

### ⚠️ 取证过程中踩到的坑（必须写进实现规格）

我第一次现算时 `vocabOnly` 算出来是 **0**。根因：字段名猜成了 `itemType` /
`contentType`，而 manifest 的真实字段是 **`type`**。
⇒ 这条印证项目既有纪律「调查数字必须自己重跑」：
**一个拼错的字段名不会抛错，只会静默返回 0**。
实现时凡涉及按类型过滤，必须**先验证过滤真的命中**（见 L4 验收项）。

---

## L2 冲突点枚举（这是本刀的实质工作）

现状是**三套口径、三处实现、两处已有命名混乱**：

| # | 位置 | 现状 | 问题 |
|---|---|---|---|
| **C1** | `tests/helpers/catalog-totals.mjs` | 返回 `{ packages, items }`，`items` 是**全类型** | 字段名 `items` 完全没说清口径；文件头已自陈「9486 词里本就含 48 条非词汇条目」 |
| **C2** | `tests/content-query.mjs:93` | `const BASELINE_ITEMS = 9438` | 变量名只说ITEMS，实际是 vocabulary-only；靠 `getVocabularyPackages()` 天然只取词汇包 |
| **C3** | `tests/content-query.mjs:64-69` | `fsWordItemsByTag`（词汇）vs `fsItemsByTag`（全类型） | **两套口径已在同一文件内并存**，注释已警告「两种口径别混用」（实测 3034 vs 3032） |
| **C4** | `tests/e2e.mjs:1573` | `（${CATALOG.packages} 词库 · ${CATALOG.items} 词）` | 标签写「词」，但数的是全类型 |
| **C5** | `tests/prod-catalog-check.mjs:68` | `const expected = catalogTotals()` | 同 C1，标签同样写「词」 |

**已确认的口径正确性**（这些**不要动**）：
- `content-query.mjs` 的 9438 口径是**对的** —— 它用 `registry.getVocabularyPackages()` 只取词汇包。
  `BASELINE_ITEMS` 的注释还承担着「词数变化必须被显式注意到」的守卫职责
  （9346→9378→9408→9438 每次增量都注明来源包），**改名不得毁掉这段历史**。

---

## L3 裁定：命名方案（最小改名）

**原则**：一个集合一个名字，名字自带口径；不引入第三个同义词。

| 新名 | 语义 | 替代现状 |
|---|---|---|
| `allTypesItems` | 全部类型条目数 | C1 的 `items`、C4/C5 的标签 |
| `vocabularyOnlyItems` | 仅 vocabulary 类型条目数 | C2 的 `BASELINE_ITEMS`、C3 的 `fsWordItemsByTag` |
| `packages` | 包数（**无口径歧义**，保持不变） | 保持 |

`catalogTotals()` 的返回形状由 `{ packages, items }` 改为
`{ packages, allTypesItems }`；**新增** `vocabularyOnlyItems` 导出，
让两个口径**同源、同一次遍历**算出——**顺带消灭 C3 的双实现**。

⚠️ **归一化必须是同一个遍历**：若为两种口径各写一次遍历，未来加包时两处会漏改不同的地方
（这正是 `prod-catalog-check` 与 `e2e` 硬编码分叉的成因）。一次遍历同时累两个计数器。

---

## L4 验收标准（yqh 制定）

- [ ] 两类集合**定义唯一**（各只有一处算法实现）
- [ ] 名称与实际集合成员一致（`allTypesItems` 确含非词汇条目、`vocabularyOnlyItems` 确不含）
- [ ] **统计数字未因改名发生任何变化**：27 / 9486 / 9438 / 差值 48 全部逐字节不变
- [ ] `gate` / `test` / `report` 三侧口径一致（无「标签写词、实际全类型」的残留）
- [ ] 不产生新的 alias / duplicate terminology（全仓 grep 旧名应零命中）
- [ ] `npm run lint` PASS
- [ ] 相关 gate PASS（至少 `test:content` / `gate:content-type-contract`）
- [ ] `npm run test:e2e` 无回归
- [ ] **CI 权威 PASS**
- [ ] **字段名拼错自检**：按类型过滤的实现必须证明「过滤真的命中」
      （防止再出现本轮 `itemType`→静默 0 的同型错误）

---

## L5 门禁纪律（本刀新增一条）

**改名类改动必须配「数字不变」证据。**
改名本身不该改变任何被断言的数值——所以验收不能只看「测试绿」，
必须**把改动前后的关键数字并列打印**（27 / 9486 / 9438 / 48），
由人确认四个数都没动。**测试绿只证明「与改动后一致」，不证明「与改动前一致」。**

---

## L6 实施结果（team lead 复核，2026-10-05）

**「数字不变」铁证（用 `git stash` 做改动前后同磁盘对比，非事后补跑）**：

```
BEFORE: packages=27 items=9486
AFTER : packages=27 allTypesItems=9486 vocabularyOnlyItems=9438
```
同一份`content/`、同一套算法，all-types 口径**逐字节相同**（9486），
且额外产出词汇口径（9438）。四个基线数27 / 9486 / 9438 / 48 **一个都没动**。

**全仓旧名零残留**（team lead 实测grep 计数）：
`BASELINE_ITEMS` / `fsWordItemsByTag` / `fsItemsByTag` / `fsIeltsWordItems` /
`fsIeltsTagItems` / `CATALOG.items` / `expected.items` **各 0 命中**。
⚠️ `stats.items`（manifest 契约字段）**49 处全部保留** —— 我们改的是自己的变量名，
不是 manifest 契约。

**新守卫的负向验证（非恒真证明）**：
造「2 个包其中 1 个故意缺 `type` 字段」的临时内容根，
`catalogTotals()` 如期抛错 `content/ 下有 1/2 个 manifest 缺 type 字段——
vocabulary-only 口径已失效，不回落写死数字`。
⇒ 该守卫**会判红**，不是恒真装饰。

**验收逐项**：

| 项 | 结果 | 依据 |
|---|---|---|
| 两类集合定义唯一 | ✅ | `catalog-totals.mjs` 单次遍历同时累两个计数器 |
| 名称与实际成员一致 | ✅ | `allTypesItems=9486`（含非词汇）、`vocabularyOnlyItems=9438` |
| 统计数字未变 | ✅ | stash 前后对比（见上） |
| gate/test/report 三侧一致 | ✅ | e2e + prod-check 标签已注明 all-types 口径；UI 文案未动 |
| 无新alias/重复术语 | ✅ | 旧名全仓 0 命中 |
| lint | ✅ | 0 warnings / 0 errors |
| 相关 gate | ✅ | `test:content` 179/179（**条数未变**）；`gate:content-type-contract` 16 条全绿 |
| e2e 无回归 | ✅ | 171/171 |
| 字段名拼错自检 | ✅ | 负向对照组：`itemType`/`contentType`/`kind` 各得 0 |
| CI 权威 | ✅ | run `37304525318` success；门禁①②③ + 部署全绿，`test:content` / `gate:content-type-contract` / `gate:lint` 均 success |

**两处「与规格不符」的判断（已复核，认可）**：
1. 未额外导出独立的 `vocabularyOnlyItems` 函数/常量，而是让 `catalogTotals()` 一并返回
   —— 规格原文允许二选一，三字段同源更能保证「一次遍历」。
2. 额外改了 `tests/provider-rules.mjs:240` 一行**注释**里的旧名交叉引用
   —— 属「旧名零残留」同一目标内，只改文字不改任何数值。

**刻意未做的事**（防「为了统一而统一」）：
- **未合并** `content-query.mjs` 的 registry 视角与 `catalog-totals.mjs` 的磁盘视角
  —— 两者语义不同，合并会改变该文件语义。
- **未改** UI 渲染文案（首页仍是「词库 N · M 词」）、未改任何 `stats.items` 值、
  未回改 `docs/audit-package/**`、未碰 14 份 `findChrome` 副本与 `gate-perf.mjs`。

---

## L7 状态

| 项 | 状态 |
|---|---|
| A3.1-② verify-learning-unit | ✅ CLOSED / PASS（yqh 裁定） |
| A3.1-③ N3 | ✅ CLOSED / PASS（yqh 裁定；INV-6 进 CI、INV-3 暂缓带三解锁条件） |
| **A3.1-④ N4** | ✅ **CLOSED / PASS**（CI `37304525318` success；提交 `b909625`） |
| INV-3 解锁 | ⛔ 需另起一刀，三条件齐备前不得进 CI |
| O1–O4 / 14 份 findChrome | 📋 不阻塞、不扩范围 |
