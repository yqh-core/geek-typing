# A3 · 第三套正式内容包裁定（IELTS Academic Unit 03 — Technology & Innovation）

> 文档性质：**产品裁定落档**（L1 Product / L2 Scope / L3 Engineering Contract / L4 Acceptance）。
> 裁定人：PM（本项目负责人）。日期：2026-10-05。基线 HEAD：`cb995e3`。
> 连续三刀：`170d6dd`（A1-E，Education，32 词 + 464 词阅读 + 15 题）
> → `3ca49fe` + `ff0b3a5` + `cb995e3`（A2，Environment/Climate，30 词 + 814 词阅读 + 15 题）
> → **本刀 A3（Technology & Innovation，30 词 + ~800 词阅读 + 15 题）**。
> 本刀是 `content:scaffold-unit` 的**第三个真实用例**，也是第一个**换题材跨领域**的用例。

---

## L1 · Product（产品方向）

**做一件事**：再交付一套完整的学习单元 —— IELTS Academic Unit 03，主题 **Technology & Innovation**，
具体切口：**AI 辅助医学影像诊断的验证（validation）与责任归属（accountability）**。
单元三件套齐全（词汇包 + 学术阅读 + 15 题练习），并挂进学习单元编排表成为 `unit-05`。

**为什么是第三套、为什么是 Technology/AI 这个切口**：

1. **第二套证明了「量能压上去」，第三套要证明「题材换了也不塌」。**
   A2 的 814 词已经把 `scaffold-unit` 从 464 词那一级推上来，但 Environment 和 Education 都属于
   「自然/社会描述型」文本：机制讲因果、句子偏长但术语密度低。
   换到 **技术/医学** 题材后，同一套脚手架要面对的是**术语密集、概念分层（模型层/数据层/制度层）**
   的文本。如果脚手架里有「内容假设写死在环境题材上」的地方，这一刀才会暴露出来 ——
   这是第二套用同一题材测不出来的风险。
2. **主题本身有产品价值。** AI 进入医疗影像是当下争议最大的技术话题之一：
   性能很高、落地很慢、出事之后没人知道该怪谁。把「**怎么验证、谁负责任、怎么审计**」
   写进一套可读可练的学术阅读，比再出一套「 advantages of the internet 」类泛泛话题
   对真实学习者更有信息量，也和我们这个产品「英语学习内容平台」的内容定位对得上。
3. **三连做是为了把「内容层可复用」钉成事实而不是形容词。**
   Education → Environment → Technology 三个互不重叠的话题共用同一套内容包/编排/消费链路，
   如果前两套只是巧合，第三套换题材就会露馅；如果第三套也顺，那么
   「加第 N+1 个单元 = 一条 scaffold 命令 + 5 处接线」这句话才是可断言的。

**产品价值判定**：功能可见（学习面板多一个可读可练、且**术语密度更高**的单元）
+ 架构可验证（第三个真实内容包、第一个跨题材真实内容包）。

---

## L2 · Scope（In / Out）

### In（本刀做）

| # | 项 | 规格（硬要求） |
|---|----|----------------|
| 1 | 词汇包 `ielts-tech-03-vocab` | **30 词**，中文释义 + 英文 definition 必填；沿用 Tier A / Tier B 分层（**A 层 18 / B 层 12**，与 A1-E、A2 同口径）；主题约束在 **Technology / AI / 研究与验证方法** |
| 2 | 阅读包 `ielts-tech-03-reading` | 正文总词数必须落在 **700–900 区间**（沿用 A2 规格，**不得**沿用 Unit-01 的 464 词量级）；段落 **8 段**；主题：**AI 辅助医学影像诊断的验证与责任归属**（validation, cohort, bias, audit, accountability），原创学术英语 |
| 3 | 练习包 `ielts-tech-03-exercise` | **15 题** = MCQ ×10 + TFNG ×5，其中 **5 题 `skill` 标 `Vocabulary in context`**；每题 `answer` + `explanation` + `skill` 齐备；`collocations` **18 条** |
| 4 | 接线 | `generate-registry.mjs` 的 `ORDER_IMPORT` / `ORDER_REGISTRY` / `ORDER_NONVOCAB` 三处；`build.mjs` 的 `PROVIDER`；`learningUnits.ts` 新增 `unit-05`；`src/i18n/{zh,en}.ts` 新增 `unit.05.title` / `unit.05.summary`；`tests/content-query.mjs` 的 `BASELINE_ITEMS` 按实测更新 |

### Out（本刀**不做**，明确写下以免下一轮翻案时以为漏了）

- **不回头改 Unit-01（Education）与 Unit-02（Environment）**：它们的词表、阅读、文案、尺寸一律冻结。
  本刀只在**自己的规格**上达标，不拿前两套当参照去返工，也不为了「三套统一」去动它们。
- **不扩写 / 不重写已有阅读**：Unit-01 的 464 词仍是当时规格的产物，本刀不替它补到 700–900。
- **不落盘答题、不新增练习 UI**：本刀只交付**内容包 + 编排条目**，作答面板沿用既有实现。
  （A2 已确认：ExercisePanel 本地作答、不落盘是既有契约。）
- **不动首页词数口径**：首页「词库切换 / 统计 / 内容目录汇总」本刀零改动。
  两套词数口径（vocabulary-only vs all-types）的差异**继续只在文档里记录**，代码不改。
- **不顺手加 `provider: 'unknown'` 的门禁**：该缺口从 A1-E 登记至今仍未有硬门，
  本刀只**保证自己登记进 PROVIDER**，不让缺口扩大。加门归下一刀（见 L4 遗留）。
- **不接 `scripts/verify-learning-unit.mjs` 进 `package.json` / CI**：它需要 preview 服务，
  属证据任务，本刀不夹带。
- **不新增 Course / Lesson 等实体**：继续沿用 `LearningUnit` 既有模型（INV-6 类型契约唯一）。
- **不为了赶「三连」的节奏放宽任何规格**：尤其阅读仍按 700–900 词验收，
  哪怕因此这一刀比 A2 慢，也不降级。

---

## L3 · Engineering Contract（工程契约）

### 3.1 内容源（PM 侧交付物，未经第二人复核）

- 路径：**`D:/work/_ops/unit-source-ielts-tech-03.json`**（仓库外，与 A1-E、A2 同处 `_ops/`）。
- 形状严格按 `scripts/content/scaffold-unit.mjs` 的 `--help`（USAGE_TEXT），与 A2 源逐键对齐：
  ```
  packagePrefix = "ielts-tech-03"
  publishedAt   = "<本地日历日>"（不得是未来日期；口径见下）
  origin        = "original authored content (A3 · IELTS Academic Unit 03 — Technology & Innovation)"
  tags          = ["ielts", "academic", "technology"]
  vocabulary    = { title, description, items:[{word, translation, definition}] }   // 30 条
  reading       = { title（包标题）, itemTitle（条目标题，两者不同）, description, paragraphs:[…] } // 8 段
  exercise      = { title, itemTitle, description, questions:[…15], collocations:[…18] }
  ```
- ⚠️ `reading.title` 与 `reading.itemTitle` **必须分开写**（A1-E、A2 都是两处不同）：
  包标题走「IELTS Academic Unit 03 — Technology & Innovation: Reading」，
  条目走具体标题（本刀：**When the Algorithm Reads the Scan**）。
  混写会静默改内容，且这种改动不会被任何门判红。
- ⚠️ **`publishedAt` 的时区口径（承 A2 `ff0b3a5` 的修法，本刀不得回退）**：
  判据是**本地日历日** `localDay()`（不是 `toISOString().slice(0,10)` 的 UTC 日）。
  GMT+8 的 00:00–08:00 窗口用 UTC 口径会把「本地今天」误判成未来日期而硬退出 `exit(2)`。
  本刀落地窗口在本地 2026-10-05 上午，**源里直接写本地日期 2026-10-05**（与磁盘 `contentPublishedAt`
  必须同值，否则 `--check` 终会红）。测试 F-1 / F-2 已双向钉死今天过 / 明天红。

### 3.2 落包命令

```bash
npm run content:scaffold-unit -- --src=D:/work/_ops/unit-source-ielts-tech-03.json
```

写出三包（默认落仓库 `content/`）：

```
content/vocabulary/ielts-tech-03-vocab/{words.json,manifest.json}
content/reading/ielts-tech-03-reading/{items.json,manifest.json}
content/exercise/ielts-tech-03-exercise/{items.json,manifest.json}
```

### 3.3 五处接线（scaffold 只打印待办、不自动改；改的是契约表不是内容）

| 文件 | 加什么 | 形态 |
|------|--------|------|
| `scripts/content/generate-registry.mjs` | `ORDER_IMPORT` 与 `ORDER_REGISTRY` 各加 `'ielts-tech-03-vocab'` | **只写包名**；两张表内容必须不同（追加同一项不会让它俩相等） |
| `scripts/content/generate-registry.mjs` | `ORDER_NONVOCAB` 加 `'reading/ielts-tech-03-reading'`、`'exercise/ielts-tech-03-exercise'` | 形态是 **`type/dir`** |
| `scripts/content/build.mjs` | `PROVIDER` 加 `'ielts-tech-03-vocab': PROVIDER_ORIGINAL` | 不登记会被写成 `provider:'unknown'` |
| `src/data/learningUnits.ts` | 新增 `unit-05`（`bankId:'ielts-tech-03-vocab'`，`attached` 指向同单元 reading/exercise 且 `status:'listed'`） | id **必须是 unit-05**（unit-01/02/03/04 已占，不得复用） |
| `src/i18n/{zh,en}.ts` | 新增 `unit.05.title` / `unit.05.summary` | 沿用既有键位（紧随 `unit.04.*`） |

> 顺序表与 PROVIDER 是**契约**（目录有但表没收 = 漏注册，会被门判红），
> 所以 scaffold 只精确打印要加什么让人改一次；改成自动写会让脚手架和生成器变成两个写入口。

> `learningUnits.ts` 里 `lexemes` 与 `words` 是**镜像字段**（`wordCount` 是 `words.length`）：
> 30 项必须**逐项同序全等**，且与磁盘 `words.json` 一致（A2 已踩过我自己提取口径的错，
> 本刀落地后要独立复核）。

### 3.4 门禁（只许降不许升，禁止上调任何棘轮）

`content:generate-registry`（写 registry.ts）→ `content:validate` → `content:build`
→ `verify:registry` → `test:generate-registry` → `test:scaffold-unit`
→ `test:content` → `test:ui-contract` → `gate:license` → `gate:architecture`
→ `verify:manifests` → `verify:p17-frozen` → `npm run build` → `check:bundle` → `test:e2e`
→ oxlint（基线 0）。

> ⚠️ **`content:validate` 不能打头（本刀实测撞到，A2 文档的同一处顺序是错的）**：
> `content:validate` 读的是 `src/core/content/registry.ts`，而 registry.ts 由
> `content:generate-registry` 生成；新包刚落盘、registry.ts 还是上一版时，validate 会判红 3 项：
> ```
> ✗ 策略不一致：ielts-tech-03-{vocab,reading,exercise} manifest policy=lazy，
>   但 registry.ts 中找不到 localId: 'ielts-tech-03-*' 的注册项
> [content:validate] FAIL：3 项
> ```
> 正确顺序是 `generate-registry → validate`。scaffold 自己打印的收口命令也是这个顺序。
> （A2 落档文档 §3.4 把 validate 写在最前面，是当时没实测出来的笔误；本刀已按实测改，
> 且这一条对未来任何「加内容包」都有用。）
>
> ⚠️ 序列里 `npm run build` **不能省**（A2 实测踩过）：`check:bundle` 与 `test:e2e`
> 都读 `dist/`，`dist/` 陈旧时它们在加包后立刻假红，容易被误分诊成功能缺陷
> （A2 首轮 170/171 就是这个形态，分诊结论是 `dist/assets` 只有 18 个数据 chunk）。
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

| 判据 | 要求 | 实测 |
|------|------|------|
| 阅读正文词数 | **700–900**，不虚报 | **804**（空白切分）/ 字母串 808 / 纯字母整词 705，**8 段** ✅ |
| 词汇数 | 30（Tier A 18 / Tier B 12） | **30** ✅ |
| 题目数 | 15（mcq 10 + tfng 5），Vocab in context 恰好 5 题 | **15**（mcq 10 + tfng 5；Vocab in context 恰好 5）✅ |
| collocations | 18 | **18** ✅ |
| 包数 | 27（vocabulary 13 + 非 vocab 14） | **27**（13 + 14）✅ |
| 词数基准 | `BASELINE_ITEMS` 9408 → **实测增量**（必须是实测不是估算） | **9438** ✅（= 9408 + 30） |
| 门禁 | 3.4 **全部绿**，oxlint 0，UI 棘轮（13 / 11 / 11 / 0）**未上调** | 16 门跑完 **14 绿**；`gate:lint` 本机 UNKNOWN（见 §4.4） |
| 幂等 | 源能原样重现磁盘包（含 publish 日期） | `--check` **6/6** ✅（vocab 为「JSON 语义一致（排版不同）」，reading/exercise 逐字节一致） |
| e2e | 171/171 | **171/171**，首页实测「27 词库 · 9486 词」✅ |
| unit-05 数据 | words / lexemes 30 项逐项同序全等，且与磁盘 `words.json` 同序同内容 | ✅ 独立提取复核通过（不采信工程师转述） |

> ⚠️ **三个「词数」口径别混用**（本刀首次出现三数并存，写清楚免得下一轮再查）：
> 对同一段正文，**804**（按空白切分，含 `Deep-learning,` 这类带标点 token）、
> **808**（`[A-Za-z]+` 匹配出的字母串总数）、**705**（`^[A-Za-z]+$` 完全命中、不含标点与连字符的整词）。
> 本刀对外统一口径 = **804**（与 A2 报的 814 同口径，env-02 复算亦为 814 / 715），
> 落在 700–900 规格内。**A2 落档文档 §4.1 写的「814（纯字母 token 824）」里 824 这个数不对**
> —— 它应该与 A3 一样给三数，正确主口径是 814（空白切分），「纯字母整词」是 715。

### 4.2 两套「词数」口径（延续 A2 §4.2，勿重复推导）

- **9438** = 仅 `vocabulary` 类型的 `stats.items` 之和（`tests/content-query.mjs` 的 `BASELINE_ITEMS`，本刀写死 9438）。
- **9486** = **所有类型** `stats.items` 之和（`tests/e2e.mjs` 的 `catalogTotals()`、首页「内容目录汇总」）。
- 差 **48**（本刀实测，A2 时是 46）——增量 2 的来源：本单元新增的 `ielts-tech-03-reading` **1 条条目**
  与 `ielts-tech-03-exercise` **1 条条目**都进 all-types 统计，但都不进 vocabulary-only 统计。
  按类型拆：audio 5 / collection 5 / exercise 8 / listening 6 / reading 9 / speaking 5 / topic 5 / writing 5（合计 48）。
- 注意这个差值**不是常量**：每加一套「词汇包 + 阅读 + 练习」三件套，差值就 +2（1 条阅读条目 + 1 条练习条目）。
  下次再加单元时，差值会从 48 变 50，不要拿本文件的 48 当定值。
- `tests/e2e.mjs:22-26` 早已声明「`totalItems` 统计所有类型条目，所以一篇 reading 也计 1，
  UI 文案把 items 一律叫「词」的老问题，本刀不改（超边界）」—— 本刀同样不改。

### 4.3 门序里必须有 `npm run build`

`check:bundle` 与 `test:e2e` 都读 `dist/`，`dist/` 是上一版构建产物时，加包后这两个门会**立刻假红**。
后续任何「加内容包」的收口，**跑这两个门前先 `npm run build`**。此条已并入 §3.4 门序语境，不是可选项。

### 4.4 汇报字段（沿用 A1-E / A2 收口格式）

`HEAD` / `WORKTREE` / `Changed` / `Gates` / `Bundle` / `Regression` / `Boundary` / `Result`。

### 4.4 本刀实跑结果（commit `cf7db16`，未推送）

- `HEAD` `cb995e3` → `cf7db16`；14 个文件 +273 / −2；`git status` clean。
- `Changed`：三包 6 个文件；`generate-registry.mjs` +9；`build.mjs` +3；`learningUnits.ts` +49（unit-05 整块）；
  `i18n/{zh,en}.ts` 各 +2；`tests/content-query.mjs` +5/−1；`src/core/content/registry.ts`（生成器产物，随接线重生成）。
- `Bundle`：主 chunk `index-*.js` 422149 B → **426002 B**（gzip 128971 → **129789 B**，+818）；CSS 未变。
- `Regression`：e2e **171/171**；UI 棘轮 `13 / 11 / 11 / 0` **纹丝未动**；`provider === 'unknown'` 全库 0 个。

**唯一的「不是绿」：`gate:lint` 输出 UNKNOWN。** 它报
「oxlint 起不来，测量失败：EBUSY —— 本机起不动第二个 node 进程」，
但 oxlint 本体是好的（经门自己给的分流法实证，不是绕过）：

```
node_modules/oxlint/bin/oxlint --format=json  →  diagnostics [] , 218 files
npm run lint  →  Found 0 warnings and 0 errors. 218 files
```

判定：**本机环境限制（同时 spawn 第二个 node 被挡），不是仓库门禁失效**，CI 全新容器不复现。
另外 `package.json` 里**没有叫 `oxlint` 的脚本**（`lint: oxlint`），`gate:lint` 的入口是
`node scripts/gate-lint.mjs` 调 `lint`。下次收口遇到同现象，先跑 `npm run lint` 拿本体证据，
不要因为「门是 UNKNOWN」就以为 lint 没跑。

### 4.5 遗留（本刀明确不动，登记在案）

1. `provider:'unknown'` 无硬门禁 —— 本刀保证自己登记进 PROVIDER，不新增该缺口；门禁加不加归下一刀。
2. `scripts/verify-learning-unit.mjs` 仍未接进 `package.json` / CI（要 preview 服务，属证据任务）。
3. 首页「词数」把非词汇 items 也叫「词」的口径，超边界未动（理由见 §4.2）。
4. `publishedAt` 退出码口径：契约类 `exit(2)` / 内容校验类 `exit(1)`（A2 的 F-2 是 2，既有口径保持不变）。
5. **A2 / A3 两份落档文档的门序与词数口径有笔误，已在本刀（A3）实测证伪并就地改对**，
   但 **A2 文档 `docs/content/A2-UNIT-ENV-CUT.md` 的对应段落没有回改**（A2 已 CLOSED 并推送）：
   - §3.4 门序把 `content:validate` 写在 `content:generate-registry` 之前 → 会红 3 项「策略不一致」。
   - §4.1 的「814（纯字母 token 824）」→ 824 这个数不存在，正确是 814（空白切分）/ 715（纯字母整词）。
   下一刀若还要引用 A2 文档做门序，以本文件 §3.4 / §4.1 为准。
