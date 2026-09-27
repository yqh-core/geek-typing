# 雅思（IELTS）

> 状态：🔄 混合（本文分节标注）
>
> ✅ **已有**：`ielts` 词汇包（3000 词，ECDICT MIT）
> 📐 **待建**：听力 / 口语 / 阅读 / 写作 / 真题 / 模考 / 诊断 —— **全部零实现**
>
> 基线 commit：`4152eb2`　｜　实测日期：2026-09-27
> 证据来源：`content/vocabulary/ielts/{manifest,words}.json`、`scripts/build-ielts.mjs`、`scripts/build-bank.mjs`、`src/core/content/registry.ts`、`tests/`

---

## 1. 一句话事实

**雅思方向的全部落地物是「一个 3000 词的词频表」。** 雅思考试的四项能力（听/说/读/写）在仓库内**零实现**，也没有任何一道真题、任何一个 IELTS 题型模型。

```
$ ls content/
README.md  vocabulary/

$ ls content/audio content/reading content/exam content/ielts 2>&1
ls: cannot access 'content/audio': No such file or directory
ls: cannot access 'content/reading': No such file or directory
ls: cannot access 'content/exam': No such file or directory
ls: cannot access 'content/ielts': No such file or directory

$ find . -path ./node_modules -prune -o -iname "*ielts*" -print
./content/vocabulary/ielts
./content/vocabulary/ielts/manifest.json
./content/vocabulary/ielts/words.json
./scripts/build-ielts.mjs
```

**除词库外无任何雅思相关文件。**

---

## 2. ✅ 已有：`ielts` 词汇包

### 2.1 manifest 实测字段（原文照抄自 `content/vocabulary/ielts/manifest.json`）

| 字段 | 实测值 |
|---|---|
| `id` | `content:vocabulary:ecdict-ielts:ielts` |
| `type` | `vocabulary` |
| `packageId` | `ielts` |
| `namespace` | `ecdict-ielts` |
| `title` | 雅思核心 IELTS |
| `titleEn` | IELTS Core |
| `description` | ECDICT 雅思核心 3000 词（按词频排序） |
| `exam` | `IELTS` |
| `language` | `en` |
| `tags` | `["ielts", "vocabulary"]` |
| `icon` | `Globe` |
| `features` | `{phonetic: true, definition: true}` |
| `stats` | `{items: 3000, phonetic: 2986, definition: 2999}` |
| `offline.policy` | `lazy` |
| `schemaVersion` | `4` |
| `contentRevision` | `2` |
| `contentVersion` | `2` |
| `contentChecksum` | `sha256:0e4c8089648b261a95394c9a5b1bea6d8877f828e903da196a3397e3dfdea71f` |
| `sources[0].origin` | `ECDICT` |
| `sources[0].license` | `MIT License`（SPDX `MIT`，`commercialUse: true`，`attributionRequired: false`） |

字段完整性（`05-import/IMPORT_VALIDATION.md` 20 项门禁全绿）：

- `manifest` 必填 12 字段齐全（`validate.mjs:90`）
- `stats.items`（3000）= 实测词条数（`validate.mjs:178-180`）
- `exam` **不在** `REQUIRED_FIELDS`（`validate.mjs:90`），无门禁把关 —— 但它已填且语义正确

### 2.2 词条数据实测（`content/vocabulary/ielts/words.json`）

| 指标 | 实测值 |
|---|---|
| 词条数 | **3000** |
| 文件体积 | 482,461 B（471.15 KiB） |
| 字段集合 | `word` / `translation` / `phonetic` / `definition`（**仅 4 个**） |
| `phonetic` 非空 | **2986 / 3000 = 99.53%**（14 条缺失） |
| `definition` 非空 | **2999 / 3000 = 99.97%**（1 条为 `helpline`，空串，见 `13-acceptance/KNOWN_ISSUES.md#BUG-001`） |
| `translation` 非空 | 3000 / 3000 = 100% |
| 最长词形 | 15 字符 |
| 含空格的词组 | **0** |
| `partOfSpeech` | **0 / 3000 = 0%** |
| `examples` | **0 / 3000 = 0%** |

字段样例（`words.json` 首条，原文）：

```json
{"word":"eagle","translation":"n. 鹰, 鹰状标饰","phonetic":"'i:gl","definition":"n. any of various large keen-sighted diurnal birds of prey noted for their broad wings and strong soaring flight"}
```

**注意音标形态**：`'i:gl` 是**旧式重音撇号 + 长音符**记法，不是 IPA 的 `/ˈiːɡl/`。`13-acceptance/GAP_ANALYSIS.md:140` 记载 C-8「音标体系混用：cet4 用 IPA、toefl 用 KK，无字段可判定体系」——本包与 `toefl` 同类，属**第二套体系**。

### 2.3 生成链路（两个脚本，一个已被取代）

| 脚本 | 作用 | 当前状态 |
|---|---|---|
| `scripts/build-ielts.mjs` | 从 ECDICT CSV 生成 `src/data/ielts.ts`：筛 `tag` 含 `IELTS` → 按 `frq`（zipf 词频）降序 → 取前 **3000** | **历史产物路径已失效** —— 输出 `src/data/ielts.ts` 现已不存在 |
| `scripts/build-bank.mjs` | 参数化同逻辑，`BANKS.ielts = { tagTokens: ['ielts'], exportName: 'IELTS', outFile: 'ielts.ts' }`（`build-bank.mjs:29-37`） | 同样输出 `src/data/*.ts` |

**实测不符点（重要）**：`build-ielts.mjs` 的注释里明确警告：

> 注意（V3-P0a）：`ielts.ts` 的 phonetic 字段由 `scripts/build-bank.mjs ielts` 提供；直接重跑本脚本会丢掉音标列

而 `scripts/build-bank.mjs:6` 描述 word 过滤规则为 `word 只留 /^[a-zA-Z-]+$/`，**要求词形仅由字母与连字符组成**。但实测 3000 条数据中 `maxWordLen = 15`、含空格词 0 条、且 `helmline` 类词存在 —— 与规则一致的只有「无空格」这一点；**数据本身无法反推出是哪一支脚本在哪一次运行的产物**。

更关键的是：**当前 `content/vocabulary/ielts/words.json` 的生成链路在仓库内不可复现** —— `build-ielts.mjs` 与 `build-bank.mjs` 的输出目标都是已删除的 `src/data/*.ts`，没有任何脚本直接写 `content/vocabulary/*/words.json`。详见 `05-import/IMPORT_PIPELINE.md` §6「脚本产物与数据现状的偏差」。

### 2.4 加载策略（实测为 lazy，有硬理由）

`src/core/content/registry.ts:54` 一行：

```ts
const loadIelts = async () => parseWords((await import('../../../content/vocabulary/ielts/words.json?raw')).default)
```

`registry.ts:64`：`{ manifest: parseManifest(ieltsManifest), localId: 'ielts', load: loadIelts }`

即 **`load:` 而非 `words:`**，对应 `offline.policy = 'lazy'`（门禁第 20 项一致性检查，`content/README.md:500`）。

**为什么必须 lazy 而不是 inline**（`content/README.md:557-567` 的对照实验硬证据）：

| 实验 | 主 chunk raw | 主 chunk gzip | 增量 |
|---|---|---|---|
| kaoyan 保持 lazy（基线 381.06 KiB） | 381.06 KiB | 118.89 KiB | — |
| **kaoyan 临时改 inline** | **852.97 KiB** | **285.30 KiB** | **+471.92 KiB（+123.8%）** |

增量与 `kaoyan/words.json` 的 471.70 KiB 呈 **1:1.0005 字节级全额传导**。ielts 的 words.json（471.15 KiB）与之同量级，**改 inline 会得到同样结论：主 chunk 立刻击穿 420 KiB 阈值（`check:bundle` 第 21 项）**。

### 2.5 词库预热（离线可用性的瓶颈）

`src/core/content/registry.ts:139-141` 的 `warmUpVocabulary()` **硬编码**预热 ielts / kaoyan / toefl 三包：

- 实测预热 gzip 合计 **497.03 KiB / 600 KiB 预算 = 83%**（余量 17.2%）
- `content/README.md:607-611` 标注为「🔴 预热预算是最薄弱的一环（本轮未解决，属待办）」
- `content/README.md:611` 给出约束：「**在新增 GRE / Oxford 之前，必须先把它从『全量 allSettled』改成『按需 + 限量』**」

**这意味着 ielts 虽然「已有」，但它自身就是后续扩展的约束来源之一** —— 雅思方向若要扩到 10000 词或加听力资源，会先撞上这条预算。

### 2.6 UI 可达性（✅ 已有，但仅限词库切换）

| 能力 | 证据 | 状态 |
|---|---|---|
| `:bank ielts` 命令切换 | `tests/e2e.mjs:447` 断言 `:bank` 列表含 `ielts` | ✅ |
| 下拉条目显示词数 | `tests/e2e.mjs:875` 同类断言（托福 3000） | ✅ |
| 懒加载 chunk 预热 | `tests/e2e.mjs:1215` 断言 SW 缓存含 ielts/kaoyan/toefl chunk | ✅ |
| 契约测试覆盖 | `tests/content-query.mjs:50/63-64/88-91/96` 多处使用 ielts 作被测包 | ✅ |
| **按「考试」维度筛选** | `grep -rn "exam" src/components/ src/App.tsx src/lib/` → **0 命中** | ❌ **无** |
| **考试目标选择 / 备考计划** | 无路由、无页面、无存储 | ❌ **无** |

**关键事实**：`exam` 字段虽在 10 个 manifest 中已有 5 个填了值，但 `ContentType`/`ContentQuery`/UI **全部没有 exam 维度的查询接口**（`content-query.ts:59/67/117` 的 `QueryOptions` 与 `ContentScope` 只有 `type`/`packageId`/`namespace`/`tags`）。

唯一可用的替代筛选是 `tags`：`scopeTags()` 实现于 `src/core/content/query/content-query.ts:182-185`，按 `p.manifest.tags.includes(t)` 过滤，因此 `tags: ['ielts']` **可以**筛到本包。但：

- `tags` 过滤是**包级**的，不是考试级的（CET-4 与 CET-6 的 tags 都是 `["cet", ...]`，无法用 tag 区分四级/六级）
- UI 层 `contentQuery` 调用数 **0**（`tests/ui-contract.mjs` 尚未实现；`content/README.md:528`）

---

## 3. 📐 待建：雅思四项目前全部缺失

### 3.1 缺口矩阵（逐项实测）

| 雅思能力 | 内容类型槽位 | 数据 | 实现 | 证据 |
|---|---|---|---|---|
| 听力 Listening | `listening` / `audio` | 0 | 0 | `content/audio/` 不存在；`07-media/*` 全 📐 |
| 阅读 Reading | `reading` | 0 | 0 | `content/reading/` 不存在 |
| 写作 Writing | `writing` | 0 | 0 | 无类型数据；无评分/批改 |
| 口语 Speaking | `speaking` | 0 | 0 | 无 ASR、无发音评测 |
| 真题 / 模考 | `exercise` | 0 | 0 | 无题型模型、无计时、无计分 |
| 诊断报告 | — | 0 | 0 | 无 |

`12 个 ContentType` 中与本方向相关的 4 个（`listening` / `reading` / `writing` / `speaking`）**全部在 `PLANNED_TYPES` 里返回 `packages:0 / items:0`**（`src/core/content/catalog/catalog.ts:52-64`、`:83-89`）。

### 3.2 与需求文档的对照（转述，非核实）

`13-acceptance/GAP_ANALYSIS.md:138` 记载 **C-6「无真考题库」**：

> IELTS/TOEFL/CET 均只有词汇包，无听/说/读/写/真题

`00-project/README` 体系（`docs/audit-package/README.md:37`）将 `08-exam/` 定位为「IELTS/TOEFL/CET/考研/GRE/NCE」。

`01-product/PRODUCT_ROADMAP.md:80` 将「考试体系」列为 **P6 阶段**，`现状 = 📐 零实现`，任务为「考试目标选择 / 题型训练 / 模考计分 / 诊断报告」—— 四项全部无。

> ⚠️ **来源声明**：上述需求文档章节号转引自 `13-acceptance/GAP_ANALYSIS.md` §8，**需求文档原文未在仓库内**，本文未独立核实。

### 3.3 一个结构性事实：IELTS 词库的 3000 词是「词频截断」，不是「考纲全覆盖」

实测口径（`scripts/build-bank.mjs:21`）：`const LIMIT = 3000`，逻辑为「tag 含 `IELTS` 的词 → 按 `frq` 降序 → **取前 3000**」。

因此本包是**按词频排序后截断的 3000 条**，而非「IELTS 考纲的全部词汇」：

- 被截断后的词**没有出现在包里**（不是「覆盖 3000 / 考纲总量」的覆盖率概念）
- 排序依据 `frq`（zipf 词频）来自 ECDICT；词频低但考试可能出现的词被排在 3000 之外
- 实测**无法从数据中判定**「雅思考纲总量是多少」「本包覆盖了多少」

> 对比：CET 包（84 / 69 词）明显是**未完成**的（`13-acceptance/KNOWN_ISSUES.md#CONTENT-001` 记录为覆盖率 1.9%）；而 ielts 的 3000 是**设计上限**。二者不是同一类问题。详见 `CET.md` §3。

### 3.4 三个考试词频包的重叠（实测，影响「按考试分档」的可行性）

五个考试包两两交集（按 lowercase 词形，实测）：

| 组合 | 交集词数 |
|---|---|
| ielts ∩ kaoyan | **1802** |
| ielts ∩ toefl | **613** |
| kaoyan ∩ toefl | **344** |
| cet6 ∩ ielts | 56 |
| cet6 ∩ kaoyan | 54 |
| cet4 ∩ kaoyan | 24 |
| cet4 ∩ ielts | 19 |
| cet6 ∩ toefl | 14 |
| cet4 ∩ toefl | 1 |
| **cet4 ∩ cet6** | **0** |

三个 3000 词包合计 9000 条，**并集去重后仅 6471 个词形**（三者交集 = **230**；各自包内无重复词形）。

**结论（实测推论）**：ielts 与 kaoyan **重叠 60.1%**（1802 / 3000），三包并集去重后只余 **6471** 个词形（交集 230）—— **三个「考纲包」实为同一 ECDICT 词库按 tag 过滤出的三个视图，不是三套独立词表**。`content/README.md:101-102` 明确「跨包同词是合法数据关系」，因此这**不是数据缺陷**；但它意味着「按考试分档」不能靠包划分来实现。

> ⚠️ **用户可见后果**（记入 `KNOWN_ISSUES.md#CONTENT-006`）：用户在不同考纲包间切换学习时，会有**约 60% 的概率重复见到同一单词**；且学习记录/掌握度以裸 `word` 为键，跨包重复词会**合并为同一条**，导致去重与掌握度统计失真。

`01-product/PRODUCT_ROADMAP.md:95`（P1 任务「词库分档去重」）已记录这一问题：「`ielts`/`kaoyan`/`toefl` 各 3,000 词**同源 ECDICT**，可能高度重叠」。本文给出精确数字：**重叠 1802 / 613 / 344**。

---

## 4. 建议（📐 全部为建议，非已承诺路线）

| # | 建议 | 针对的实测事实 | 约束条件 |
|---|---|---|---|
| E-1 | **先做 `exam` 维度查询，再做内容** | `exam` 字段已有 5 包填值，但 `QueryOptions` 无此维度 | 需改 `content-query.ts`（内容层契约冻结，须走 `content/README.md:637-650` 流程） |
| E-2 | **雅思内容的第一个切口建议是 `listening` + `subtitle` 而非 `reading`** | 雅思听力对词汇量依赖最低、且 `07-media/SUBTITLE.md` 的统一 Segment 模型可同时服务音频与文本对齐 | 强依赖 Asset 契约（当前 `AssetKind` 无 `video`，见 `VIDEO.md`）与媒体体积方案（未评估） |
| E-3 | **不要用「加第 4 个 3000 词包」的方式提升雅思覆盖** | ielts ∩ kaoyan = 1802（60.1%）⇒ 第 4 个同源包边际收益低 | — |
| E-4 | **扩包前先改 `warmUpVocabulary()`** | 余量仅 17.2%（497.03 / 600 KiB） | `content/README.md:611` 已列为前置约束 |
| E-5 | **记录「3000 是词频截断上限」而非「覆盖率」** | 三个包同为 `LIMIT = 3000`，无覆盖率口径 | 需先定义雅思考纲总量作为分母 |
| E-6 | **补 `partOfSpeech`** | ielts 覆盖率 0%（白名单已声明，`normalize.mjs:46`） | 雅思阅读/写作需要词性 |

---

## 5. 与其它审计文档的关系（不重复内容）

| 主题 | 详见 |
|---|---|
| 词汇包如何导入 / 20 项门禁 | `05-import/IMPORT_PIPELINE.md`、`IMPORT_VALIDATION.md` |
| 跨包同词为何合法 | `05-import/DEDUPLICATION.md` §5.3 |
| 字段完整度 / 音标体系混用 | `04-content/CONTENT_QUALITY.md` §6 |
| 内容类型槽位现状（12 类落地 2 类） | `04-content/CONTENT_TYPES.md` |
| 音视频 / 字幕 / 转写 | `07-media/AUDIO.md`、`VIDEO.md`、`SUBTITLE.md`、`TRANSCRIPT.md` |
| 学习记录以裸 `word` 为键的歧义 | `03-architecture/LEARNING_ARCHITECTURE.md` §4 |
| 预热预算 | `03-architecture/INTEGRATION_ARCHITECTURE.md` §2（I-1 / I-2） |

---

## 6. 一句话结论

> 雅思方向的「已有」= **1 个 3000 词包**（ECDICT MIT，lazy 加载，字段 4 个，音标用旧式记法）；
> 「待建」= **听 / 说 / 读 / 写 / 真题 五项全部零实现**。
> 且实测发现：三个 3000 词包（ielts/kaoyan/toefl）**同源 ECDICT 且高度重叠**（ielts ∩ kaoyan = 1802），
> 「按考试分档」在当前数据形态下**不是包划分问题**。
