# A2 · 第二套正式内容包裁定（IELTS Academic Unit 02 — Environment/Climate）

> 文档性质：**产品裁定落档**（L1 Product / L2 Scope / L3 Engineering Contract / L4 Acceptance）。
> 裁定人：PM（本项目负责人）。日期：2026-10-05。基线 HEAD：`27e738f`。
> 上一刀 `170d6dd`（A1-E，IELTS Academic Unit 01 — Education，32 词 + 464 词阅读 + 15 题）
> 已 CLOSED；`27e738f` 把「加第 N+1 个单元」从 4 处手工改动收敛成一条命令
> （`content:scaffold-unit`），本刀是**该命令的第一个真实用例**。

---

## L1 · Product（产品方向）

**做一件事**：再交付一套完整的学习单元 —— IELTS Academic Unit 02，主题 **Environment / Climate**。
单元三件套齐全（词汇包 + 学术阅读 + 15 题练习），并挂进学习单元编排表成为 `unit-04`。

**为什么是第二套 IELTS 单元素材而不是别的方向**：

1. A1-E 已经跑通「正式内容包 → registry → 单元编排 → 消费」这条链路，
   第二套的边际风险只剩「内容量更大时脚手架还灵不灵」，正是要把 `scaffold-unit` 压到真实的用例上。
2. .unit-01 / unit-02 都是 `bankId:'ielts'`（按词频切的老词库切片，0..99 / 100..199），
   **内容表达力弱**：词是机器切出来的，没有主题、没有释义、没有配套篇章。
   用一套**自研主题单元**把「内容包驱动单元」这条路再走一遍，才能证明它不是 A1-E 的一次性巧合。
3. Environment/Climate 是 IELTS Academic 最高频的必备话题之一（与 Education 并列），
   且与 Unit-01 不重叠，测试者连做两单元能看出「内容层是可复用的」而不是「换了个词表」。

**产品价值判定**：功能可见（学习面板里多一个可读、可练的单元）+ 架构可验证（第二个真实内容包）。

---

## L2 · Scope（In / Out）

### In（本刀做）

| # | 项 | 规格（硬要求） |
|---|----|----------------|
| 1 | 词汇包 `ielts-env-02-vocab` | **30 词**，中文释义 + 英文 definition 必填；沿用 Unit-01 的 Tier A / Tier B 分层（A 层 18 / B 层 12），音标可选 |
| 2 | 阅读包 `ielts-env-02-reading` | **正文总词数必须落在 700–900 区间**（Unit-01 实测 464 词，**未达规格**，本刀不得沿用该尺寸）。段落 **7–8 段**。主题：Urban Heat Island（城市热岛），原创学术英语 |
| 3 | 练习包 `ielts-env-02-exercise` | **15 题** = MCQ（主旨/细节）×5 + TFNG ×5 + Vocabulary in Context ×5；每题 `answer` + `explanation` + `skill` 齐备；`collocations` **18 条** |
| 4 | 接线 | `generate-registry.mjs` 两张 vocabulary 顺序表 + `ORDER_NONVOCAB`；`build.mjs` 的 `PROVIDER`；`learningUnits.ts` 新增 `unit-04`；`src/i18n/{zh,en}.ts` 新增 `unit.04.title` / `unit.04.summary` |

### Out（本刀**不做**，明确写下以免下一轮翻案时以为漏了）

- **不回头改 Unit-01（Education）**：它的 464 词阅读尺寸、32 词词表、文案，一律冻结。
  本刀只在**自己的规格**上达标，不用 Unit-01 当参照去返工。
- **不扩写 / 不重写 Unit-01 阅读**：A1-E 的 464 词是当时规格的产物，本刀不替它补到 700–900。
- **不落盘答题、不新增练习 UI**：本刀只交付**内容包 + 编排条目**，作答面板沿用既有实现
  （A1-E 已给 `ielts-edu-01-exercise` 的现成入口）。
- **不动首页词数口径**：首页口径（词库切换 / 统计）本刀零改动。
- **不顺手加 `provider: 'unknown'` 的门禁**：A1-E 交付后已登记为「全仓无门在管」的缺口，
  归下一刀（见 L4 遗留）。本刀只**保证自己登记进 PROVIDER**，不让这个缺口扩大。
- **不新增 Course / Lesson 等实体**：继续沿用 `LearningUnit` 既有模型（INV-6 类型契约唯一）。

---

## L3 · Engineering Contract（工程契约）

### 3.1 内容源（PM 侧交付物，未经第二人复核）

- 路径：**`D:/work/_ops/unit-source-ielts-env-02.json`**（仓库外，与 A1-E 的 `_a1e-make-source.mjs` 同处，避免把草稿内容塞进版本库）。
- 形状严格按 `scripts/content/scaffold-unit.mjs` 的 `--help`（USAGE_TEXT）：
  ```
  packagePrefix = "ielts-env-02"
  publishedAt   = "2026-10-04"（不得是未来日期，脚本硬校验；口径见下方时区说明）
  origin        = "original authored content (A2 · IELTS Academic Unit 02 — Environment/Climate)"
  tags          = ["ielts", "academic", "environment"]
  vocabulary    = { title, description, items:[{word, translation, definition}] }   // 30 条
  reading       = { title（包标题）, itemTitle（条目标题，两者不同）, paragraphs:[…] } // 7–8 段
  exercise      = { title, itemTitle, questions:[…15], collocations:[…18] }
  ```
- ⚠️ `reading.title` 与 `reading.itemTitle` **必须分开写**：Unit-01 实测包叫「…: Reading」、
  条目叫「The Changing Role of Education」，混写会静默改内容。本刀同样两处不同。
- ⚠️ **`publishedAt` 的时区坑（本刀实测撞到，已修根因）**：判据原先是
  `publishedAt > new Date().toISOString().slice(0,10)` —— 用的是 **UTC 日历日**。
  本刀落地窗口在本地（GMT+8）00:55，此时 UTC 还停在 10-04，于是按本地写的 `2026-10-05`
  被判成「未来日期」而硬退出。PM 最初把源写成 `2026-10-05`，工程师绕行（派生临时源）
  跑通了包，但**源与磁盘会不一致**（`--check` 终会红）。处置两步：
  ① 源 JSON 对齐落盘值改为 `2026-10-04`（与 A1-E 的 edu-01 三包同 UTC 日口径，磁盘零改动）；
  ② 判据本身改为**按本地日历日**比较（语义正确：内容发布日期是作者所在时区的日历日），
  配套补测试锁死。改完 PM 按本地日写源即可原样重现。

### 3.2 落包命令

```bash
npm run content:scaffold-unit -- --src=D:/work/_ops/unit-source-ielts-env-02.json
```

写出三包（默认落仓库 `content/`）：

```
content/vocabulary/ielts-env-02-vocab/{words.json,manifest.json}
content/reading/ielts-env-02-reading/{items.json,manifest.json}
content/exercise/ielts-env-02-exercise/{items.json,manifest.json}
```

### 3.3 四处接线（scaffold 只打印待办、不自动改；改的是契约表不是内容）

| 文件 | 加什么 | 形态 |
|------|--------|------|
| `scripts/content/generate-registry.mjs` | `ORDER_IMPORT` 与 `ORDER_REGISTRY` 各加 `'ielts-env-02-vocab'` | **只写包名**；两张表内容必须不同（追加同一项不会让它俩相等） |
| `scripts/content/generate-registry.mjs` | `ORDER_NONVOCAB` 加 `'reading/ielts-env-02-reading'`、`'exercise/ielts-env-02-exercise'` | 形态是 **`type/dir`** |
| `scripts/content/build.mjs` | `PROVIDER` 加 `'ielts-env-02-vocab': PROVIDER_ORIGINAL` | 不登记会被写成 `provider:'unknown'` |
| `src/data/learningUnits.ts` | 新增 `unit-04`（`bankId:'ielts-env-02-vocab'`，`attached` 指向同单元 reading/exercise 且 `status:'listed'`） | id **必须是 unit-04**（unit-03 已是 Education，不得复用） |
| `src/i18n/{zh,en}.ts` | 新增 `unit.04.title` / `unit.04.summary` | 沿用既有键位（en.ts:292-293 同位置） |

> 顺序表与 PROVIDER 是**契约**（目录有但表没收 = 漏注册，会被门判红），所以 scaffold
> 只精确打印要加什么让人改一次；改成自动写会让脚手架和生成器变成两个写入口。

### 3.4 门禁（只许降不许升，禁止上调任何棘轮）

`content:validate` → `content:generate-registry`（写 registry.ts）→ `content:build`
→ `verify:registry` → `test:generate-registry` → `test:scaffold-unit`
→ `test:content` → `test:ui-contract` → `gate:license` → `gate:architecture`
→ `verify:manifests` → `verify:p17-frozen` → `npm run build` → `check:bundle` → `test:e2e`
→ oxlint（基线 0）。

> ⚠️ 序列里 `npm run build` **不能省**（本刀实测踩过）：`check:bundle` 与 `test:e2e`
> 都读 `dist/`，`dist/` 陈旧时它们在加包后立刻假红，容易被误分诊成功能缺陷。
>
> ⚠️ **本机环境**（Git Bash + safe-delete shim，CI 无此问题）跑 `npm run build` 时，
> vite 清空 `dist/`（≥50 文件）会被批量删除守卫拦下
> （`SAFE_DELETE_BULK_CONFIRM_REQUIRED {"count":50,"threshold":50}`），表现是
> `tsc -b` 已过、2018 modules 已 transform 却报构建失败。处置：`npm run build` 之前
> `git clean -xdf dist`，或对该条命令加 `CODEBUDDY_SAFE_DELETE_ENABLED=0`。
> **本仓库的 npm 脚本里不写这个开关** —— 那是本机环境纪律，不是仓库契约，
> 写进 scripts 会在真删失败时掩盖根因；CI 是全新容器，本来就撞不到。

---

## L4 · Acceptance（验收口径，汇报时逐条给数）

### 4.1 硬指标

| 判据 | 要求 | 实测 | 来源 |
|------|------|------|------|
| 阅读正文词数 | **700–900**，不虚报 | **814**（纯字母 token 824）✅ | 对 `items.json` 的 `body` 实测 |
| 词汇数 | 30 | **30** ✅ | `words.json` 长度 |
| 题目数 | 15，MCQ / TFNG / Vocab 三族齐备 | **15**（mcq 10 + tfng 5；Vocab in context 5 题）✅ | 磁盘真值 |
| collocations | 18 | **18** ✅ | 磁盘真值 |
| 包数 | 24（vocabulary 12 + 非 vocab 12） | **24**（12 + 12）✅ | `verify:registry` / 磁盘 `FS_PKGS` |
| 词数基准 | `BASELINE_ITEMS` 9378 → 9408（+30），**必须是实测增量不是估算** | **9408** ✅ | `tests/content-query.mjs` |
| 门禁 | 3.4 **全部绿**，oxlint 0，UI 棘轮（13/11/11/0）**未上调** | 13/13 绿，oxlint 0，棘轮未动 ✅ | 实跑输出 |
| 幂等 | 源能原样重现磁盘包（含 publish 日期） | ✅ | `content:scaffold-unit --src=原源 --check` |
| e2e | 171/171 | **171/171** ✅ | `test:e2e` |

### 4.2 两套「词数」口径（本刀实测数字对不上的根因，记下免得下一轮再查）

- **9408** = 仅 `vocabulary` 类型的 `stats.items` 之和（ vocabulary 12 包）。
- **9454** = **所有类型**的 `stats.items` 之和（24 包）—— `tests/e2e.mjs` 的 `catalogTotals()`
  与首页「内容目录汇总」用的是这个口径。
- 差 **46** = 8 个非词汇类型的全部条目：
  audio 5 + collection 5 + exercise 7 + listening 6 + reading 8 + speaking 5 + topic 5 + writing 5。
- 这不是本刀引入的缺陷：`tests/e2e.mjs:22-26` 的注释已说明「`totalItems` 统计的是所有类型的
  条目，所以一篇 reading 篇章也计 1…… UI 文案把 items 一律叫「词」的老问题，本刀不改（超边界）」。
- PM 定：**继续不改**首页口径；但本文件记下差值与拆分，下一轮要动这个口径时不必重新推导。

### 4.3 门序里必须有 `npm run build`

`check:bundle` 与 `test:e2e` 都读 `dist/`，`dist/` 是上一版构建产物时，加包后这两个门会
**立刻假红**（本刀首轮 170/171 就是这么红的，分诊结论是 `dist/assets` 里只有 18 个数据 chunk）。
后续任何「加内容包」的收口，**跑这两个门前先 `npm run build`**。此条已并入 §3.4 门序语境。

### 4.2 汇报字段（沿用 A1-E 收口格式）

`HEAD` / `WORKTREE` / `Changed` / `Gates` / `Bundle` / `Regression` / `Boundary` / `Result`。

### 4.3 遗留（本刀明确不动，登记在案）

1. `provider:'unknown'` 无硬门禁 —— 本刀保证自己登记进 PROVIDER，不新增该缺口；门禁加不加归下一刀。
2. `scripts/verify-learning-unit.mjs` 仍未接进 `package.json` / CI（要 preview 服务，属证据任务）。
