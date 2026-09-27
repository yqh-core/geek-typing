# 考研英语（KAoyan）

> 状态：🔄 混合（本文分节标注）
>
> ✅ **已有**：`kaoyan` 词汇包（3000 词，ECDICT MIT）
> 📐 **待建**：完形填空 / 阅读理解 / 新题型 / 翻译 / 写作 / 真题 / 模考 —— **全部零实现**
>
> 基线 commit：`4152eb2`　｜　实测日期：2026-09-27
> 证据来源：`content/vocabulary/kaoyan/{manifest,words}.json`、`scripts/build-bank.mjs`、`src/core/content/registry.ts`、`tests/`
>
> ⚠️ **文件名说明**：本文档名为 `KAoyan.md`（`K` 大写 + `aoyan` 小写），与 `docs/audit-package/README.md:139` 的登记名一致。
> 该命名源于 `scripts/build-bank.mjs:38-43` 的 `exportName: 'KAoyan'`（历史产物 `src/data/kaoyan.ts` 的导出符号名）。**这是保留的历史命名，非笔误** —— 与包目录名 `kaoyan`（全小写）不同，两者不要混用。

---

## 1. 一句话事实

**考研方向的全部落地物是「一个 3000 词的词频表」。** 考研英语的五大题型（完形 / 阅读 / 新题型 / 翻译 / 写作）零实现。

且实测发现一条**比雅思托福更值得注意的事实**：`kaoyan` 与 `ielts` 两个包**重叠 1802 词（60.1%）**，是三对大包中重叠最高的一对。

---

## 2. ✅ 已有：`kaoyan` 词汇包

### 2.1 manifest 实测字段（原文照抄自 `content/vocabulary/kaoyan/manifest.json`）

| 字段 | 实测值 |
|---|---|
| `id` | `content:vocabulary:ecdict-kaoyan:kaoyan` |
| `type` | `vocabulary` |
| `packageId` | `kaoyan` |
| `namespace` | `ecdict-kaoyan` |
| `title` | 考研核心 |
| `titleEn` | **`KAoyan Core`**（注意 `KA` 大写） |
| `description` | ECDICT 考研核心 3000 词（按词频排序） |
| `descriptionEn` | **`KAoyan core 3000 words from ECDICT (by frequency)`** |
| `exam` | **`考研`**（中文，非 `KAOYAN` / `POSTGRAD`） |
| `language` | `en` |
| `tags` | `["kaoyan", "vocabulary"]` |
| `icon` | `GraduationCap` |
| `features` | `{phonetic: true, definition: true}` |
| `stats` | `{items: 3000, phonetic: 2994, definition: 3000}` |
| `offline.policy` | `lazy` |
| `schemaVersion` | `4` |
| `contentRevision` / `contentVersion` | `2` / `2` |
| `contentChecksum` | `sha256:5766aa4b59af15cf5a5be14881170bed052ee9f77411d71fea7a272907a21240` |
| `sources[0].origin` | `ECDICT` |
| `sources[0].license` | `MIT License`（SPDX `MIT`，`commercialUse: true`） |

**两个命名细节（实测）**：

1. `exam` 字段用的是**中文 `"考研"`**，而 IELTS / TOEFL / CET-4 / CET-6 用的是**英文缩写**。五个考试包的 `exam` **命名体系不统一**（4 英文 + 1 中文），且 `exam` 无门禁约束（不在 `REQUIRED_FIELDS`，`validate.mjs:90`）。
2. `titleEn` = `KAoyan Core`（`KA` 大写，`oyan` 小写），即**大小写混排**的英文名。这是从 `exportName: 'KAoyan'` 继承的历史命名。

### 2.2 词条数据实测（`content/vocabulary/kaoyan/words.json`）

| 指标 | 实测值 |
|---|---|
| 词条数 | **3000** |
| 文件体积 | 约 476 KiB（目录 `du -sh`） |
| 字段集合 | `word` / `translation` / `phonetic` / `definition`（**仅 4 个**） |
| `phonetic` 非空 | **2994 / 3000 = 99.80%**（6 条缺失） |
| `definition` 非空 | **3000 / 3000 = 100.00%**（三包中唯一） |
| `translation` 非空 | 3000 / 3000 = 100% |
| 最长词形 | 15 字符 |
| 含空格的词组 | **0** |
| `partOfSpeech` | **0 / 3000 = 0%** |
| `examples` | **0 / 3000 = 0%** |

**本包是三个 3000 词包中字段完整度最高的**（phonetic 99.80% 最高、definition 100% 唯一满值）。

### 2.3 生成链路

`scripts/build-bank.mjs:38-43`：

```js
kaoyan: {
  tagTokens: ['ky', 'kaoyan'], // ECDICT 考研 tag 为 ky（兼容 kaoyan 写法）
  exportName: 'KAoyan',
  title: '考研核心词库',
  outFile: 'kaoyan.ts',
},
```

**注意 `tagTokens` 有两个取值**：`['ky', 'kaoyan']` —— 因为 ECDICT 的考研标签实际是 **`ky`**，脚本同时兼容 `kaoyan` 写法。

其余两个包只有一个 token（`ielts: ['ielts']`、`toefl: ['toefl']`）。这说明**考研包的筛选口径与雅思/托福不同**：它在 ECDICT 里没有独立的完整标签名，用的是缩写。

逻辑仍是（`build-bank.mjs:5`）：`tag` 含 token 的词 → 按 `frq` 降序 → 取前 `LIMIT = 3000`。

> ⚠️ 与 `IELTS.md` §2.3 / `TOEFL.md` §2.4 同一问题：输出目标 `src/data/kaoyan.ts` **已不存在**，脚本与当前 `content/vocabulary/kaoyan/words.json` 之间**无直接写入关系**，生成链路在仓库内不可复现。

### 2.4 加载策略（lazy）

`src/core/content/registry.ts:54`：

```ts
const loadKaoyan = async () => parseWords((await import('../../../content/vocabulary/kaoyan/words.json?raw')).default)
```

`registry.ts:65`：`{ manifest: parseManifest(kaoyanManifest), localId: 'kaoyan', load: loadKaoyan }`

`offline.policy = 'lazy'`。

**本包是唯一有「改 inline 对照实验」实测数据的包**（`content/README.md:559-567`）：

| 项 | lazy（基线） | 改 inline 后 | 增量 |
|---|---|---|---|
| 主 chunk raw | 381.06 KiB | **852.97 KiB** | **+471.92 KiB（+123.8%）** |
| 主 chunk gzip | 118.89 KiB | **285.30 KiB** | **+166.41 KiB（+140.0%）** |
| words chunk 数 | 3 | 2 | −1 |

> 增量与 `kaoyan/words.json` 的 **471.70 KiB** 呈**字节级 1:1.0005 全额传导**。该实验已还原。

**这是全仓最有价值的定量结论之一**：`inline` 是首屏体积的直通车。考研包本身既是这条结论的**实验对象**，也是**受益方**（因为走了 lazy，3000 词不进主 chunk）。

### 2.5 词库预热（本包的收益最大）

`src/core/content/registry.ts:139-141` 的 `warmUpVocabulary()` **硬编码**预热 ielts / kaoyan / toefl：

- 实测预热 gzip 合计 **497.03 KiB / 600 KiB 预算 = 83%**（余量 17.2%）
- 三包均分约 165 KiB，**本包约占其中 1/3**

`13-acceptance/GAP_ANALYSIS.md:59-65`（A-3）明确记载：

> **`warmUpVocabulary()` 是硬编码名单，包一多就爆**
> 事实：`src/core/content/registry.ts:139` 内部硬编码 3 个包（ielts/kaoyan/toefl）。当前 gzip 合计 497.03 KiB / 600 KiB 预算，**余量仅 17.2%**。
> 为什么必须现在改：需求文档明确要加 GRE(12000)、Oxford(30000)、Cambridge(20000)、TOEFL 扩展等。每加一个包需手改 registry，且极易击穿预算 → **离线打不开**。

即：**考研包既是预热机制的受益者，也是它爆掉的三个成因之一**。

### 2.6 UI 可达性

| 能力 | 证据 | 状态 |
|---|---|---|
| `:bank kaoyan` 命令切换 | `tests/e2e.mjs:882-885`（`check(':bank kaoyan 切到考研词库', ...includes('考研核心'))`） | ✅ |
| 懒加载后正常出词 | `tests/e2e.mjs:887`（`check('考研词库懒加载后正常出词', ...)`） | ✅ |
| 打字推进 | `tests/e2e.mjs:889`（`check('考研词库打字推进到下一词', ...)`） | ✅ |
| 错题复习（懒词库下） | `tests/e2e.mjs` 15.3 段（敲错考研词入库 → 注入到期 → `:review` 拉出） | ✅ |
| 预热探针 | `tests/e2e.mjs:1215`；`tests/prod-smoke.mjs:17`（A5 懒加载 chunk 200） | ✅ |
| **按考试维度筛选** | `grep -rn "exam" src/components/ src/App.tsx src/lib/` → **0 命中** | ❌ **无** |
| **考研备考模式 / 题型训练** | 无 | ❌ **无** |

**本包是全仓 E2E 覆盖最完整的考试包**（切库 → 懒加载 → 出词 → 推进 → 错题入库 → 复习，全链路有用例）。

---

## 3. 📐 待建：考研英语题型全部缺失

### 3.1 缺口矩阵

| 考研英语题型（英语一 / 英语二） | 类型槽位 | 数据 | 实现 |
|---|---|---|---|
| 完形填空（10 分） | `exercise` | 0 | 0 |
| 阅读理解 Part A（40 分） | `reading` / `exercise` | 0 | 0 |
| 阅读理解 Part B 新题型（10 分） | `exercise` | 0 | 0 |
| 翻译（10/15 分） | `exercise` | 0 | 0 |
| 写作 A 小作文（10 分） | `writing` | 0 | 0 |
| 写作 B 大作文（20/15 分） | `writing` | 0 | 0 |
| 真题 / 模考 / 计时计分 | `exercise` | 0 | 0 |
| 分数诊断 | — | 0 | 0 |

`13-acceptance/GAP_ANALYSIS.md:138`（C-6）：「IELTS/TOEFL/CET 均只有词汇包，无听/说/读/写/真题」—— **该条目未提考研**，但实测结论相同（考研包同样只有词库）。

> 这是一处**既有文档的遗漏**：C-6 只列了 IELTS/TOEFL/CET 三个方向，未列考研与 GRE。实测 `kaoyan` 包同样是纯词库（`content/vocabulary/kaoyan/` 下只有 `manifest.json` 与 `words.json`）。

### 3.2 考研包与雅思包的重叠（实测，本文核心补充）

| 组合 | 交集词数 | 占较小包的比例 |
|---|---|---|
| kaoyan ∩ ielts | **1802** | 60.1%（对两者均为 60.1%，因都 3000 词） |
| kaoyan ∩ toefl | **344** | 11.5% |
| kaoyan ∩ cet6 | 54 | 78.3%（对 cet6） |
| kaoyan ∩ cet4 | 24 | 28.6%（对 cet4） |

三个 3000 词包合计 9000 条，**并集去重后仅 6471 个词形**（三者交集 = **230**；ielts∩toefl = **613**）。

**推论（实测）**：`kaoyan` 与 `ielts` **共享 1802 个词**，即约六成的考研包内容同时是雅思包内容。二者同源 ECDICT、同样按词频截断到 3000，因此**高度重叠是必然结果**。

`01-product/PRODUCT_ROADMAP.md:95`（P1 任务「词库分档去重」）已记录此问题并推测「可能高度重叠」；本文给出精确值 **1802 / 613 / 344**。

**含义**：这三个包不构成「三个不同的词库」，而是**同一词库的三个 tag 视图**。考研用户与雅思考生看到的词表有 60% 相同。

### 3.3 一个实测细节：考研包与 cet6 的 78% 重叠

`kaoyan ∩ cet6 = 54`，而 cet6 总共只有 69 词 ⇒ **cet6 的 78.3% 都出现在考研包中**。

这从数据侧印证了一个常识性判断：**考研词汇难度高于 CET-6**，因此 CET-6 词汇基本被考研包包含。反过来说，**cet6 包在词表维度上的独立性只有约 15 词**（69 − 54）。

（同理：`cet4 ∩ kaoyan = 24`，占 cet4 的 28.6%。）

### 3.4 字段完整度横向对照

| 包 | 词条数 | phonetic 率 | definition 率 | 最长词 | 加载 |
|---|---|---|---|---|---|
| **kaoyan** | 3000 | **99.80%** | **100.00%** | 15 | lazy |
| ielts | 3000 | 99.53% | 99.97% | 15 | lazy |
| toefl | 3000 | 98.10% | 99.73% | 17 | lazy |
| cet4 | 84 | 100.00% | 100.00% | 13 | inline |
| cet6 | 69 | 100.00% | 100.00% | 12 | inline |

考研包在 3000 词档中**字段完整度最高**。

---

## 4. 建议（📐 全部为建议）

| # | 建议 | 针对的实测事实 | 备注 |
|---|---|---|---|
| K-1 | **统一 `exam` 字段命名体系** | 本包为 `"考研"`，其余 4 包为英文缩写；且无门禁 | 建议改门禁（`validate.mjs` 第 7 项旁）或统一为 `KAOYAN` |
| K-2 | **统一 `titleEn` 大小写** | 本包为 `"KAoyan Core"`（大小写混排） | 低成本；但注意 `docs/audit-package/README.md:139` 与本文文件名依赖 `KAoyan` 拼写 |
| K-3 | **考研方向应先做「题型模型」而非「扩词」** | 与 ielts 重叠 1802（60.1%），扩词边际收益低 | 考研英语的难点在阅读与写作，不在词汇量 |
| K-4 | **不要用 tags 做考试筛选** | 三包 tags 分别为 `["kaoyan"]` / `["ielts"]` / `["toefl"]`，虽可区分但语义非考试维度 | 建议补 `exam` 维度查询 |
| K-5 | **补 6 条缺失 `phonetic`** | 2994 / 3000 | 低成本 |
| K-6 | **补记 C-6 缺口条目** | 现有 C-6 未列考研与 GRE | 既有文档遗漏，建议更新 `GAP_ANALYSIS.md` |
| K-7 | **补 `partOfSpeech`** | 覆盖率 0% | 考研完形填空需要词性 |

---

## 5. 与其它审计文档的关系（不重复内容）

| 主题 | 详见 |
|---|---|
| 词汇包导入 / 门禁 | `05-import/IMPORT_PIPELINE.md`、`IMPORT_VALIDATION.md` |
| 雅思/托福（同源结构） | `08-exam/IELTS.md`、`TOEFL.md` |
| 跨包同词为何合法 | `05-import/DEDUPLICATION.md` §5.3 |
| 1:1.0005 传导系数（以本包为实验对象） | `content/README.md:557-567`、`09-testing/CONTENT_TEST.md` §2.8 |
| 预热预算 A-3（I-1 / I-2） | `13-acceptance/GAP_ANALYSIS.md:59-65`、`03-architecture/INTEGRATION_ARCHITECTURE.md` §2 |
| 字段贫瘠 / 音标混用 | `04-content/CONTENT_QUALITY.md` §6 |
| 学习记录以裸 `word` 为键的歧义 | `03-architecture/LEARNING_ARCHITECTURE.md` §4 |

---

## 6. 一句话结论

> 考研方向的「已有」= **1 个 3000 词包**（三包中字段完整度最高：phonetic 99.80% / definition 100%）；
> 「待建」= **完形 / 阅读 / 新题型 / 翻译 / 写作 / 真题 六项全部零实现**。
> 实测补充三点：① **`kaoyan` ∩ `ielts` = 1802 词（60.1%）**，三包实为同一词库的三个 tag 视图；
> ② `cet6` 的 **78.3%** 被考研包包含，从数据侧印证「考研 > CET-6」的难度关系；
> ③ 本包是 1:1.0005 传导系数对照实验的**实验对象**，也是 E2E 覆盖最完整的考试包。
