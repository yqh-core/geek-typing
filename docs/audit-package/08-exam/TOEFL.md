# 托福（TOEFL）

> 状态：🔄 混合（本文分节标注）
>
> ✅ **已有**：`toefl` 词汇包（3000 词，ECDICT MIT）
> 📐 **待建**：听力 / 口语 / 阅读 / 写作 / 真题 / 模考 / 诊断 —— **全部零实现**
>
> 基线 commit：`4152eb2`　｜　实测日期：2026-09-27
> 证据来源：`content/vocabulary/toefl/{manifest,words}.json`、`scripts/build-bank.mjs`、`src/core/content/registry.ts`、`tests/`

---

## 1. 一句话事实

**托福方向的全部落地物是「一个 3000 词的词频表」，与雅思（`IELTS.md`）在结构与来源上完全同构。** 三项考试能力（听/说/读/写）零实现。

两者唯一的**实测差异**在字段完整度与音标缺失量上 —— 见 §2.2 对照表。托福是**五大考试包中 phonetic 覆盖最低的一个**（98.10%）。

---

## 2. ✅ 已有：`toefl` 词汇包

### 2.1 manifest 实测字段（原文照抄自 `content/vocabulary/toefl/manifest.json`）

| 字段 | 实测值 |
|---|---|
| `id` | `content:vocabulary:ecdict-toefl:toefl` |
| `type` | `vocabulary` |
| `packageId` | `toefl` |
| `namespace` | `ecdict-toefl` |
| `title` | 托福核心 |
| `titleEn` | TOEFL Core |
| `description` | ECDICT 托福核心 3000 词（按词频排序） |
| `exam` | `TOEFL` |
| `language` | `en` |
| `tags` | `["toefl", "vocabulary"]` |
| `icon` | `Plane` |
| `features` | `{phonetic: true, definition: true}` |
| `stats` | `{items: 3000, phonetic: 2943, definition: 2992}` |
| `offline.policy` | `lazy` |
| `schemaVersion` | `4` |
| `contentRevision` | `2` |
| `contentVersion` | `2` |
| `contentChecksum` | `sha256:bc6c8ee511c7b708b28de831c47dbf55537af60b63780edff32a06c5e9a7b2a6` |
| `sources[0].origin` | `ECDICT` |
| `sources[0].license` | `MIT License`（SPDX `MIT`） |

### 2.2 词条数据实测（`content/vocabulary/toefl/words.json`）

| 指标 | 实测值 |
|---|---|
| 词条数 | **3000** |
| 文件体积 | 475,078 B（463.95 KiB） |
| 字段集合 | `word` / `translation` / `phonetic` / `definition`（**仅 4 个**） |
| `phonetic` 非空 | **2943 / 3000 = 98.10%**（**57 条缺失**） |
| `definition` 非空 | **2992 / 3000 = 99.73%**（8 条空串） |
| `translation` 非空 | 3000 / 3000 = 100% |
| 最长词形 | **17 字符**（五大包最长） |
| 含空格的词组 | **0** |
| `partOfSpeech` | **0 / 3000 = 0%**（**P1.6-E 已移除该字段声明**） |
| `examples` | **0 / 3000 = 0%** |

字段样例（`words.json` 首条，原文）：

```json
{"word":"eagle","translation":"n. 鹰, 鹰状标饰","phonetic":"'i:gl","definition":"n. any of various large keen-sighted diurnal birds of prey noted for their broad wings and strong soaring flight"}
```

**⚠️ 实测发现：`ielts` 与 `toefl` 的 `words.json` 首条完全相同。** 两包都以 `eagle` / `inapt` / `mathematic` / `cramming` 开头（词序一致），说明二者**不只是同源，词序也一致** —— 见 §3.4。

### 2.3 五个考试包的实测对照（本文补算，用于横向定位）

| 包 | 词条数 | 文件体积 | phonetic 率 | definition 率 | 最长词 | 音标体系 |
|---|---|---|---|---|---|---|
| cet4 | 84 | 12,353 B | **100.00%** | **100.00%** | 13 | IPA |
| cet6 | 69 | — | **100.00%** | **100.00%** | 12 | IPA（同 cet4） |
| ielts | 3000 | 482,461 B | 99.53% | 99.97% | 15 | 旧式撇号+长音符 |
| kaoyan | 3000 | 476 KiB | 99.80% | **100.00%** | 15 | 旧式撇号+长音符 |
| **toefl** | 3000 | 475,078 B | **98.10%（最低）** | 99.73% | **17（最长）** | **KK / 旧式** |

`13-acceptance/KNOWN_ISSUES.md:48` 明确记录本包音标体系问题：

> `cet4` 用 IPA（`ˈhelplaɪn`）；`toefl` 用 KK/旧式（`,sju:pә'kɔntinәnt`）

实测样例印证：本包 phonetic 形如 `'i:gl` / `,sju:pә'kɔntinәnt` —— 使用 `ә`（西里尔 schwa 或旧式 ASCII 近似）、逗号表次重音、撇号表主重音，**与 IPA 的 `ˈ`/`ˌ`/`ə` 不是同一体系**。

**关键缺口**：`13-acceptance/GAP_ANALYSIS.md:140`（C-8）与 `13-acceptance/KNOWN_ISSUES.md#CONTENT-004` 记录此问题，并指出**无字段可判定体系** —— manifest 与词条都**没有** `phoneticScheme` 之类的标记。这意味着：

- 前端 TTS 发音（`src/lib/speech.ts`，Web Speech API）**不受影响**（TTS 不读音标字段）
- 但「音标展示」在两套体系间**无法统一渲染**（同一个 `<span>` 里两种符号混排）
- 且**新增数据源时无法门禁拦截**（`04-content/CONTENT_QUALITY.md` §7.4 记录：「音标字段无空串」是实测通过但**无门禁守护**的项）

### 2.4 生成链路

`scripts/build-bank.mjs:44-49` 的配置：

```js
toefl: {
  tagTokens: ['toefl'],
  exportName: 'TOEFL',
  outFile: 'toefl.ts',
},
```

逻辑（`build-bank.mjs:4-6`）：`tag` 含 `toefl` 的词 → 按 `frq` 降序 → 取前 `LIMIT = 3000`。

> ⚠️ 与 `IELTS.md` §2.3 同一问题：**输出目标 `src/data/toefl.ts` 已不存在**，脚本与当前 `content/vocabulary/toefl/words.json` 之间**无直接写入关系**，生成链路在仓库内不可复现。

### 2.5 加载策略（lazy）

`src/core/content/registry.ts:55`：

```ts
const loadToefl = async () => parseWords((await import('../../../content/vocabulary/toefl/words.json?raw')).default)
```

`registry.ts:66`：`{ manifest: parseManifest(toeflManifest), localId: 'toefl', load: loadToefl }`

`offline.policy = 'lazy'`，与门禁第 20 项（策略一致性）一致。

本包体积 463.95 KiB，若改 inline，按 `content/README.md:557-567` 的 1:1.0005 传导系数，主 chunk 将从 381.06 KiB 增至约 **845 KiB**，**击穿 420 KiB 阈值**。

### 2.6 UI 可达性

| 能力 | 证据 | 状态 |
|---|---|---|
| `:bank toefl` / 下拉条目 | `tests/e2e.mjs:875` 断言「下拉含托福条目且词数 3000」 | ✅ |
| 懒加载 chunk 预热 | `tests/e2e.mjs:1215`；`tests/prod-smoke.mjs:69`（A5 懒加载 chunk 200） | ✅ |
| 生产环境 chunk 可达 | `tests/prod-smoke.mjs:17`「A5 懒加载 chunk（kaoyan 与 toefl 词库）→ 200」 | ✅ |
| **按考试维度筛选** | `grep -rn "exam" src/components/ src/App.tsx src/lib/` → **0 命中** | ❌ **无** |
| **托福备考计划 / 目标选择** | 无 | ❌ **无** |

---

## 3. 📐 待建：托福能力全部缺失

### 3.1 缺口矩阵

| 托福能力 | 类型槽位 | 数据 | 实现 |
|---|---|---|---|
| 听力 Listening | `listening` | 0 | 0 |
| 口语 Speaking | `speaking` | 0 | 0（无 ASR、无评分） |
| 阅读 Reading | `reading` | 0 | 0 |
| 写作 Writing | `writing` | 0 | 0 |
| 综合写作 / 独立写作 | `exercise` | 0 | 0 |
| 真题 / 模考 / 计分 | `exercise` | 0 | 0 |

`13-acceptance/GAP_ANALYSIS.md:138`（C-6）：「IELTS/TOEFL/CET 均只有词汇包，无听/说/读/写/真题」。

`01-product/PRODUCT_ROADMAP.md:80`（P6 考试体系）：现状 `📐 零实现`。

### 3.2 托福与雅思的**共同缺口**（实测：二者在仓库内几乎不可区分）

这是本方向一条重要的实测结论：**`toefl` 与 `ielts` 两个包在数据层几乎完全相同** —— 同源、同结构、同字段集、同词序开头，唯一可区分的是 `tags[0]`（`"ielts"` vs `"toefl"`）与 `exam`（`"IELTS"` vs `"TOEFL"`）。

因此：

- **不存在任何「托福专属」的数据或逻辑**。任何针对托福的设计建议，同时适用于雅思（反之亦然）。
- 若要做「托福 vs 雅思」的差异化功能（如托福独立写作评分），**必须先有考试级的题型模型**，而当前连 `exam` 字段都未接入查询层（`grep -rn "exam" src/core/ src/components/ src/lib/` → 仅 `src/core/content/schema.ts:36` 一处**类型声明**，零使用点）。

### 3.3 三个词频包的重叠（实测，决定性事实）

| 组合 | 交集词数 | 占 ielts/toefl 的比例 |
|---|---|---|
| **ielts ∩ toefl** | **613** | ielts 的 20.4% / toefl 的 20.4% |
| ielts ∩ kaoyan | **1802** | — |
| kaoyan ∩ toefl | **344** | — |

三个 3000 词包**并集去重后 6471 个词形**（合计 9000 条，三者交集 = **230**）。

**推论**：三个 3000 词包**共享同一底层词库（ECDICT）**，按不同 tag 筛出，因此**互相重叠但词序开头一致**。`01-product/PRODUCT_ROADMAP.md:95` 已把「词库分档去重」列为 P1 任务，本文提供了精确重叠数字。

### 3.4 一个未被记录的事实：词序开头一致

实测 `ielts/words.json` 与 `toefl/words.json` **前 8 条完全相同**（`eagle` / `inapt` / `mathematic` / `cramming` / `mischance` / `armour` / `despatch` / `superintend`）。

这与脚本逻辑（「按 `frq` 降序」）**表面上矛盾** —— 若两包按词频各自排序，前 8 条不应完全一致。可能的解释有二：

1. 两包的 `frq` 字段大量缺失，导致 fallback 到 CSV 原始顺序（`build-bank.mjs:5` 提到「frq（zipf 词频，**缺失排后**）」）
2. `words.json` 的实际生成顺序不是脚本逻辑产出的顺序

**实测无法从仓库内判定是哪一种**，因为生成脚本本身不写 `words.json`（见 §2.4）。这构成一条**待确认项**：`words.json` 的词序语义未知，「按词频排序」这一 manifest 描述（`description: "ECDICT 托福核心 3000 词（按词频排序）"`）**在实测数据上未被验证**。

> 影响：`content/README.md:201-202` 明确「词表顺序 = 产品语义（词频序 / 教材序 / 难度梯度），重排等于改数据」。若实际顺序不是词频序，则「按词频排序」是一处**声明与数据不符**。

---

## 4. 建议（📐 全部为建议）

| # | 建议 | 针对的实测事实 | 备注 |
|---|---|---|---|
| T-1 | **为考试包引入 `phoneticScheme` 字段** | toefl phonetic 98.10%（最低）+ 音标体系无标记 | 与 `04-content/CONTENT_QUALITY.md` Q-3 同一建议 |
| T-2 | **先核实 `words.json` 的真实词序语义** | 前 8 条与 ielts 完全一致，与「按词频排序」声明不符 | 需找到实际生成 `words.json` 的步骤 |
| T-3 | **托福的差异化必须建立在题型模型上** | 数据层 ielts / toefl 几乎不可区分 | 无题型模型则无法做「托福专属」 |
| T-4 | **不要新增同源 3000 词包** | ielts ∩ toefl = 613；kaoyan ∩ toefl = 344 | 应先解决去重/分档 |
| T-5 | **补 57 条缺失 `phonetic`** | 2943 / 3000 | 与 §4 T-1 的体系问题分开处理 |
| T-6 | **接入 `exam` 维度查询** | `exam` 字段零使用点（`schema.ts:36` 仅类型） | 需走契约变更流程 |

---

## 5. 与其它审计文档的关系（不重复内容）

| 主题 | 详见 |
|---|---|
| 词汇包导入 / 门禁 | `05-import/IMPORT_PIPELINE.md`、`IMPORT_VALIDATION.md` |
| 音标体系混用、字段贫瘠 | `04-content/CONTENT_QUALITY.md` §6、§7 |
| 12 类型落地率 | `04-content/CONTENT_TYPES.md` |
| 媒体（音/视频/字幕/转写） | `07-media/*`（5 份，全 📐） |
| 考试包之间的重叠与去重 | `05-import/DEDUPLICATION.md` |
| 雅思方向 | `08-exam/IELTS.md`（同构，可互参） |

---

## 6. 一句话结论

> 托福方向的「已有」= **1 个 3000 词包**（与 ielts 同源同构，phonetic 覆盖 98.10% 为五包最低，音标用 KK/旧式）；
> 「待建」= **听 / 说 / 读 / 写 / 真题 五项全部零实现**。
> 实测补充两点：① `ielts` 与 `toefl` 的 `words.json` **前 8 条完全相同**，与 manifest 所述「按词频排序」不符，词序语义待核实；
> ② 数据层**不存在任何托福专属内容** ⇒ 差异化功能必须先有题型模型。
