# 新概念英语（NCE / New Concept English）

> 状态：📐 待建
>
> 📐 **待建**：NCE 方向 —— **零实现**。无教材内容、无课文、无课程结构、无音频。
> ✅ **已有**（方向性线索）：需求文档把 `iChochy/NCE` 列为 5 个 GitHub 参考项目之一；学习图谱设计已为「课 → 书」关系预留类型
>
> 基线 commit：`4152eb2`　｜　实测日期：2026-09-27
> 证据来源：`content/vocabulary/`（10 包清单）、`src/core/content/catalog/catalog.ts`、`src/core/content/relation/relation.ts`、`13-acceptance/GAP_ANALYSIS.md`、`00-project/PRODUCT_VISION.md`、`01-product/COMPETITOR_ANALYSIS.md`、`06-learning/LEARNING_GRAPH.md`

---

## 1. 一句话事实

**NCE 在仓库内不存在任何形式的实现 —— 没有课文、没有课程结构、没有音频、没有一课数据。**

```
$ ls content/
README.md  vocabulary/

$ find . -path ./node_modules -prune -o -iname "*nce*" -print
（无输出）

$ grep -rni "new concept\|新概念" src/ scripts/ content/
（无输出）
```

**`src/`、`scripts/`、`content/` 三处全文零命中。**

与 GRE 不同，NCE 在文档侧有**两类更具体的痕迹**：

1. 需求文档把 `iChochy/NCE` 列为 5 个 GitHub 参考项目之一（**唯一一个以教材命名的参考项目**）
2. 学习图谱设计文档已为「课 → 书」关系**预留了类型**（`lesson → book`）

---

## 2. 📐 已有记录（文档侧，非实现）

### 2.1 需求文档的参考项目（转述）

`00-project/PRODUCT_VISION.md:42`：

> 需求文档 §三 列出了 5 个 GitHub 参考项目（**`iChochy/NCE`**、`5mdld/anki-english-60k-decks`、`Ecattea/COCA-English-Anki-Deck`、`LinguaMiner`、`ISTS — IELTS Study OS`），并描述了「值得借鉴的方向」。

`01-product/COMPETITOR_ANALYSIS.md:47`：

> | 1 | `iChochy/NCE` | 需求文档列为参考 |

`01-product/COMPETITOR_ANALYSIS.md:62`：

> | 其中 **1 个项目名称含 "NCE"**（#1） | 项目名；**NCE 通常指 New Concept English** |

> ⚠️ **重要声明（既有文档已写明，本文重申）**：`01-product/COMPETITOR_ANALYSIS.md:43` 明确记载：
> 「**以下仅为项目标识符的转述，我方未访问、未阅读、未评估这些仓库。**」
> `:148` 进一步记载：「**本项目未做过任何竞品调研**（`GAP_ANALYSIS.md` §8 明确记载需求文档 §三"未做"），本文仅能转述需求文档提到的 5 个 GitHub 参考项目标识符」。
>
> 因此本文**不包含任何关于 `iChochy/NCE` 的功能、结构、许可、规模的信息** —— 唯一可确认的是：**项目名含 "NCE"，且通常指 New Concept English**（这是 `:62` 的原文表述，属推断而非核实）。

### 2.2 学习图谱已为「课 → 书」预留类型

`06-learning/LEARNING_GRAPH.md:251`（Content Relation 类型表）：

| 关系 | 语义 | 说明 | 来源 |
|---|---|---|---|
| `lesson → book` | 课 → 书 | 课属于哪本教材（如 **NCE 1-4**） | **需求：NCE 方向** |

即：`relation.ts` 的 `RelationType` 中已包含 NCE 所需的关系形状。

### 2.3 但类型体系与 NCE 需求存在范围错配（关键）

`06-learning/LEARNING_GRAPH.md:309` 原文（本文重点重申）：

> ⚠️ **注意 `PLANNED_TYPES` 中无 `lesson` / `book` / `sentence` / `video`** —— 而需求文档提到 NCE（1-4 册，课→书）与视频学习。**这意味着即使要建学习图谱，内容类型的槽位本身也需要先扩展**（或把 lesson 归入 `collection` / `document`）。这是一处需求与现有类型体系的**范围错配**，建议在规划阶段澄清。

**实测核对**（`src/core/content/catalog/catalog.ts:52-64`）：

```js
const PLANNED_TYPES = [
  'vocabulary', 'listening', 'reading', 'audio', 'topic',
  'exercise', 'writing', 'speaking', 'grammar', 'document', 'collection',
]
```

**11 个槽位中确实无 `lesson` / `book` / `sentence`。** 而 `ContentType`（`src/core/content/model/content.ts:34-46`）的 12 个取值同样无此三者。

即：**NCE 的「册 → 课」二级结构在当前内容类型体系中没有对应槽位。** 这是一处需要产品决策的**结构性缺口**，不是简单的「加数据」。

### 2.4 NCE 与「视频学习」的关联（既有文档已建立）

`07-media/VIDEO.md:132` 的示例 manifest 使用 NCE 作为示意：

```json
"title": "NCE Book 1 Lesson 1"
```

即 `07-media/VIDEO.md` 在规划视频内容类型时，**以 NCE 课为原型**。这说明 NCE 在本项目的规划中**不只是词表**，而是「教材 + 视频/音频 + 课文」的完整内容形态。

> 该示例出现在 📐 待建的 `VIDEO.md` 中，**不代表任何已实现内容**。

### 2.5 审计包 README 的登记

`docs/audit-package/README.md:37`：`| **08-exam/ | IELTS/TOEFL/CET/考研/GRE/NCE |`
`docs/audit-package/README.md:141`：`| NCE.md | 📐 待建 | 零实现 |`

---

## 3. 📐 待建：NCE 的完整缺口

### 3.1 内容层缺口

| 项 | 现状 | 证据 |
|---|---|---|
| `content/lesson/` / `content/book/` 目录 | **不存在** | `ls content/` |
| 课文数据 | 无 | — |
| 课程结构（册 → 课） | 无 | — |
| 生词表（每课词表） | 无 | — |
| 音频 | 无 | `content/assets/` 不存在 |
| 视频 | 无 | — |
| 习题 | 无 | — |
| 数据源 | **未确定** | 无任何记载 |
| **许可** | **未确定，且高风险** | —— 见 §3.3 |

### 3.2 类型层缺口（结构性）

| NCE 所需概念 | 现有类型槽位 | 状态 |
|---|---|---|
| 教材（Book 1-4） | 无 `book` | 可勉强归入 `collection`？**未决策** |
| 课（Lesson） | 无 `lesson` | 可勉强归入 `document`？**未决策** |
| 课文句子 | 无 `sentence` | 无对应；`reading` 是「文章/段落」粒度 |
| 课内音频 | `audio` | 槽位存在，零数据、零实现 |
| 课内视频 | 无 `video` | **`AssetKind` 也无 `video`**（见 `07-media/VIDEO.md`） |
| 课内习题 | `exercise` | 槽位存在，零数据、零实现 |

`06-learning/LEARNING_GRAPH.md:309` 已把这项列为**待澄清的范围错配**。

### 3.3 许可风险（本文最需强调的一项）

NCE（New Concept English，亚历山大 / 朗文）是**在版商业教材**，其课文、录音、插图均受版权保护。

实测：仓库内的 10 个包的来源与许可如下表：

| 包 | `sources[0].origin` | `sources[0].license` |
|---|---|---|
| ielts / kaoyan / toefl / cet4 / cet6 | `ECDICT` | `MIT License`（SPDX `MIT`） |
| ai-core / cloud-native / frontend | `curated in-repo (…)` | `Proprietary (self-curated)` |
| go-code / ts-code | `curated in-repo (…)` | `Proprietary (self-curated)` |

**全库 10 包中无一是受版权保护的第三方教材内容** —— 5 包 MIT 开源词典衍生数据，5 包自研术语表。

而 NCE 课文**无法以 MIT 或自研方式合法纳入**。相关既有记载：

- `13-acceptance/GAP_ANALYSIS.md:175`（E-1/E-2 特别提示）：
  > 需求文档反复强调"**绝对不能把 GitHub 素材直接塞进网站**"。当前架构**兼容**这一要求（sources 已是结构化对象），但**字段不足以支撑合规判断**。
- `13-acceptance/GAP_ANALYSIS.md:164`（E-1）：版权治理未建 —— 有 `license` 结构化，但**无 `rightsStatus` 体系**（owned / licensed / public-domain / restricted…）
- `13-acceptance/GAP_ANALYSIS.md:170`（E-7）：仓库根**无 LICENSE 文件**，`package.json` 无 `license` 字段，而内容侧声明 5 包为 MIT —— **合规链条不闭环**

**实测推论（本文）**：NCE 是 6 个考试方向中**版权风险最高的一个** —— 也是唯一一个**内容主体本身受版权保护**（而非仅有数据来源问题）的方向。当前 `sources[]` 的字段（`license.name` / `spdx` / `commercialUse` / `attributionRequired`）**没有一个能表达「已获授权使用教材」「仅限个人学习」这类状态**。

### 3.4 能力层缺口

| NCE 常见学习方式 | 类型槽位 | 数据 | 实现 |
|---|---|---|---|
| 跟读（听 + 说） | `speaking` + `audio` | 0 | 0（无 ASR、无发音评测） |
| 听写 | `listening` + `audio` | 0 | 0 |
| 背诵 / 默写 | `exercise` | 0 | 0 |
| 课文朗读（TTS） | — | — | 🟡 **部分**：`src/lib/speech.ts`（88 行）有 Web Speech API 单词发音，**但只能读传入的词，无课文上下文与分句** |
| 逐句讲解 | — | 0 | 0 |
| 课内语法 | `grammar` | 0 | 0（槽位存在，零数据） |
| 视频学习 | `video` | 0 | 0 |

**唯一可复用的一点**：TTS 发音能力已存在（`src/lib/speech.ts`，`en-US` / `en-GB` 双音），可在有课文文本的前提下低成本用于朗读 —— 但它**不能替代教材配套录音**（音质、语速、语调、连读均不同）。

---

## 4. 建议（📐 全部为建议，非已承诺路线）

### 4.1 必须先在产品层回答的问题

| # | 待澄清问题 | 为什么必须先答 |
|---|---|---|
| N-1 | **NCE 用什么数据？** 若用教材原文/录音 ⇒ 版权问题；若用公开的 NCE 词汇表 ⇒ 只剩词表，非「教材」 | 决定整个方向的可行性 |
| N-2 | **是否已获授权 / 是否只做词汇表？** | 当前 `sources[]` 无字段表达授权状态（E-1） |
| N-3 | **`lesson` / `book` 是新增类型，还是归入 `collection` / `document`？** | `LEARNING_GRAPH.md:309` 已标为范围错配 |
| N-4 | **NCE 的定位是「考试方向」还是「教材方向」？** | 现有 5 个考试包都以 `exam` 字段标记（CET-4 / IELTS…），NCE 不属考试；`08-exam/` 容纳它是一处目录归属上的错配 |

> **N-4 值得单独说明**：`08-exam/` 目录的语义是「考试方向」，但需求文档把 NCE 与 IELTS/TOEFL/GRE 并列。实测 `manifest.exam` 字段的 5 个取值全是考试名，**没有「教材」这一类别**。因此 NCE 放在 `08-exam/` 是**审计交付物的目录安排**（`docs/audit-package/README.md:37`），在产品模型上它可能需要独立的内容域。

### 4.2 若决定推进，建议的落地顺序

| # | 建议 | 依据 |
|---|---|---|
| N-5 | **先定版权策略，再定内容** | 与其他 5 个方向相反 —— 其余方向的瓶颈是「数据量不足」，NCE 的瓶颈是「数据合法性未决」 |
| N-6 | **先扩类型槽位**（`lesson` / `book` / `sentence`，以及 `video`） | `LEARNING_GRAPH.md:309`；`07-media/VIDEO.md`（`AssetKind` 无 `video`） |
| N-7 | **先做 Asset 契约**（音频/视频定位） | `content/README.md:68`：`content/assets/` **不存在**，`AssetManifest` 推到 P3 |
| N-8 | **若要低成本试点，用「TTS 朗读 + 公开词表」做最小课形态** | 复用 `src/lib/speech.ts`（已有）；避开版权主体 |
| N-9 | **建 `lesson → book` 关系数据** | `relation.ts` 已含该类型（`LEARNING_GRAPH.md:251`），但**零数据** |

### 4.3 明确不建议的做法

| # | 不建议 | 原因 |
|---|---|---|
| N-10 | 直接抓取 GitHub 上的 NCE 仓库内容并入站 | `GAP_ANALYSIS.md:175` 明确需求「绝对不能把 GitHub 素材直接塞进网站」；且 `iChochy/NCE` 的**许可未知**（`COMPETITOR_ANALYSIS.md:43` 记载「未访问、未阅读、未评估」） |
| N-11 | 在 `sources[]` 里填一个模糊的 license 了事 | 门禁第 7 项只校 `name` 非空 + `attributionRequired` 为布尔 + 外部来源有 `spdx`；**表达不了「授权范围」**（E-1） |

---

## 5. 与其它审计文档的关系（不重复内容）

| 主题 | 详见 |
|---|---|
| 需求文档 §三 竞品调研（含 `iChochy/NCE`） | `00-project/PRODUCT_VISION.md:42`、`01-product/COMPETITOR_ANALYSIS.md` |
| 学习图谱的 `lesson → book` 与类型错配 | `06-learning/LEARNING_GRAPH.md` §251 / §309 |
| 视频内容类型（以 NCE 为原型） | `07-media/VIDEO.md` |
| 音频 / 字幕 / 转写 | `07-media/AUDIO.md`、`SUBTITLE.md`、`TRANSCRIPT.md` |
| 版权治理缺口（E-1 / E-2 / E-7） | `13-acceptance/GAP_ANALYSIS.md` §6、`11-legal/*` |
| 内容来源溯源字段 | `04-content/CONTENT_PROVENANCE.md` |
| Asset ≠ Content（`content/assets/` 不存在） | `content/README.md:68-75`、`04-content/CONTENT_CONTRACT.md` |
| 12 类型落地率 | `04-content/CONTENT_TYPES.md` |
| TTS / 音效现状 | `07-media/AUDIO.md` |

---

## 6. 一句话结论

> NCE 方向的「已有」= **零**（`src/`、`scripts/`、`content/` 三处 `grep` 零命中）。
> 文档侧有两处具体痕迹：**`iChochy/NCE` 被列为参考项目**（但**未访问、未评估**，许可未知），
> 以及**学习图谱已为 `lesson → book` 关系预留类型**（零数据）。
> 最需强调的三点：① NCE 是 6 个方向中**唯一「内容主体受版权保护」**的（其余为 MIT 词典衍生或自研术语）；
> ② `lesson` / `book` / `sentence` / `video` **在 `ContentType` 与 `PLANNED_TYPES` 中均无槽位**，是结构性缺口而非数据缺口；
> ③ 瓶颈不是「数据量不足」，而是**「数据合法性未决」** —— 与其余 5 个方向的问题性质不同。
