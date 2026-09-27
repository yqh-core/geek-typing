# 大学英语四六级（CET-4 / CET-6）

> 状态：🔄 混合（本文分节标注）
>
> ✅ **已有**：`cet4`（84 词）与 `cet6`（69 词）两个词汇包 —— 结构完整、字段 100% 覆盖，但**词量远低于考纲**
> 📐 **待建**：听力 / 阅读 / 写作 / 翻译 / 真题 / 模考 —— **全部零实现**
>
> 基线 commit：`4152eb2`　｜　实测日期：2026-09-27
> 证据来源：`content/vocabulary/{cet4,cet6}/{manifest,words}.json`、`scripts/build-cet-defs.mjs`、`scripts/build-cet-phonetics.mjs`、`src/core/content/registry.ts`

---

## 1. 一句话事实

**CET 是四个考试方向中「质量最高、覆盖最差」的一个。**

```
cet4  84 词    →  CET-4 考纲约 4500 词   →  覆盖率 约 1.9%
cet6  69 词    →  CET-6 考纲约 5500 词   →  覆盖率 约 1.3%
```

**CET-4 是用户最可能首先使用的考试词库，恰是覆盖最薄弱的一环。** 这不是「进度落后」，而是 `13-acceptance/KNOWN_ISSUES.md` 明确记录的独立缺陷条目 **CONTENT-001**。

---

## 2. ✅ 已有：两个 CET 词汇包（结构层面）

### 2.1 覆盖率（本文核心事实）

| 考试 | 包 | 实测词条数 | 考纲规模 | 覆盖率 | 与考纲的差距 |
|---|---|---|---|---|---|
| **CET-4** | `cet4` | **84** | 约 4500 | **约 1.9%** | 缺约 **4416** 词 |
| **CET-6** | `cet6` | **69** | 约 5500 | **约 1.3%** | 缺约 **5431** 词 |

分子来源（实测，可复现）：

```bash
$ node -e "const m=require('./content/vocabulary/cet4/manifest.json');console.log(m.stats.items)"
84
$ node -e "const m=require('./content/vocabulary/cet6/manifest.json');console.log(m.stats.items)"
69
```

`manifest.stats.items` 已由 `validate.mjs:178-180`（门禁第 5 项）与实测 `words.length` 强制一致，故 84 / 69 是**受门禁守护的确定值**。

分母来源（**既有文档记载，本文未独立核实**）：

- `13-acceptance/GAP_ANALYSIS.md:134`（C-2）：
  > **CET 覆盖率致命不足** | cet4 仅 **84 词**、cet6 仅 **69 词**。CET-4 考纲实际约 4500 词 —— **覆盖率约 1.9%**
- `13-acceptance/KNOWN_ISSUES.md:12-23`（CONTENT-001）：
  > | 现象 | `cet4` 包仅 84 词，`cet6` 仅 69 词 |
  > | 期望 | CET-4 考纲约 4500 词，CET-6 约 5500 词 |
  > | 实际覆盖率 | cet4 ≈ **1.9%**，cet6 ≈ 1.3% |
  > | 证据 | `content/vocabulary/cet4/words.json`（12,353 B）；manifest `stats.items=84` |
  > **备注**：`cet4`/`cet6` 是全库唯二 phonetic 100% 覆盖的包，说明做过精加工，但**词量太小**。

> ⚠️ **考纲规模（4500 / 5500）非代码可测事实**，本文不独立核实，只转述既有文档记载值。
> CET-6 的覆盖率比值（1.25%）由本文据同一分母补算（69 / 5500 ≈ 1.25%，既有文档只给了「约 1.3%」）。

### 2.2 「覆盖率」这一指标为何成立（与 ielts/toefl 的关键区别）

雅思/托福包是 **3000 词的词频截断上限**（`scripts/build-bank.mjs:21`：`const LIMIT = 3000`），不存在「覆盖率」概念（详见 `IELTS.md` §3.3）。

CET 则不同 —— 实测可确证其为**未完成的精加工词单**：

| 证据 | 内容 |
|---|---|
| 词量级不匹配 | 84 / 69 与其它考试包的 3000 相差 **35~43 倍** |
| 独立的补全脚本 | 存在 `scripts/build-cet-defs.mjs` 与 `scripts/build-cet-phonetics.mjs` 两个**专为 CET 补字段**的脚本，且脚本内注释写明「**只补释义不扩词**」 |
| 100% 字段覆盖 | `phonetic` 与 `definition` 均为 **84/84、69/69**，是全库唯二的 100% 包 |
| 独立缺陷条目 | `KNOWN_ISSUES.md` 为其单列 CONTENT-001（其余包无同类条目） |

即：**CET 包做过精加工，但从未扩词。** 这两个包是「完成度最高的半成品」。

### 2.3 `scripts/build-cet-defs.mjs` 原文（关键约束）

```
/**
 * 为 src/data/englishBanks.ts 中 CET4/CET6 现有词单补英文释义（definition）
 *
 * 数据源：skywind3000/ECDICT（MIT License）ecdict.csv
 * 规则：
 *   - 只补释义不扩词：CET4/CET6 词数与 word 键值保持不变
 *   - 按 word 大小写不敏感匹配 ECDICT
 *   - definition 取英文释义第一行，截 160 字符
 *   - 精准逐词替换 `translation: '...' }` → `translation: '...', definition: '...' }`
 *     保留文件头注释与其余结构原样；匹配不到的词保持原样
 *
 * 用法：node scripts/build-cet-defs.mjs [csv路径]
 */
```

**「只补释义不扩词」是被写进脚本注释的显式设计约束** —— 即当前 84 / 69 的规模不是意外，而是这条脚本从未承担扩词职责。

> ⚠️ 同一处实测偏差：脚本的目标文件是 `src/data/englishBanks.ts`，该文件**现已不存在**（`src/data/` 下只有 `wordBanks.ts`）。`src/data/wordBanks.ts:1-6` 的头部注释说明：`wordBanks.ts = Content Registry 的兼容层，V4.1 起词库数据的唯一定义源是 content/vocabulary/...，不要在本文件添加新的数据内容`。
> 因此 `build-cet-defs.mjs` / `build-cet-phonetics.mjs` 与当前 `content/vocabulary/cet*/words.json` 之间**无直接写入关系** —— 生成链路在仓库内**不可复现**（与 `IELTS.md` §2.3 同类问题）。

### 2.4 manifest 实测字段

**`content/vocabulary/cet4/manifest.json`**：

| 字段 | 实测值 |
|---|---|
| `id` | `content:vocabulary:ecdict-cet4:cet4` |
| `packageId` / `namespace` | `cet4` / `ecdict-cet4` |
| `title` / `titleEn` | 四级 CET-4 / 四级 CET-4（**中英文相同**） |
| `description` / `descriptionEn` | 大学英语四级高频核心词 / 大学英语四级高频核心词（**相同**） |
| `exam` | `CET-4` |
| `tags` | `["cet", "vocabulary"]` |
| `icon` | `GraduationCap` |
| `features` | `{phonetic: true, definition: true}` |
| `stats` | `{items: 84, phonetic: 84, definition: 84}` |
| `offline.policy` | **`inline`** |
| `contentRevision` / `contentVersion` | `1` / `1` |
| `contentChecksum` | `sha256:5b6591b3b7183b5274fbe5167a8c4b9b3afd6a70a05b974a4f70624fce91611d` |

**`content/vocabulary/cet6/manifest.json`**：结构同上，差异项：

| 字段 | 实测值 |
|---|---|
| `id` | `content:vocabulary:ecdict-cet6:cet6` |
| `namespace` | `ecdict-cet6` |
| `title` | 六级 CET-6 |
| `description` | 大学英语六级进阶词 |
| `exam` | `CET-6` |
| `icon` | `ScrollText` |
| `stats` | `{items: 69, phonetic: 69, definition: 69}` |
| `offline.policy` | `inline` |
| `contentChecksum` | `sha256:2378866defc1fa86d848b1c577e6b08dbe9828ffa6ff248ddea77d2fb65c1f92` |

**两包的 `titleEn` / `descriptionEn` 与中文完全相同** —— `src/data/wordBanks.ts:62-63` 对此有处理（`nameEn: m.titleEn === m.title ? undefined : m.titleEn`），即英文模式下会**回退到中文文案**。UI 显示为「四级 CET-4」而非英文名。

### 2.5 词条数据实测

| 指标 | cet4 | cet6 |
|---|---|---|
| 词条数 | **84** | **69** |
| 文件体积 | **12,353 B** | 约 16 KiB（目录） |
| 字段集合 | `word` / `translation` / `phonetic` / `definition` | 同 |
| `phonetic` 非空 | **84 / 84 = 100%** | **69 / 69 = 100%** |
| `definition` 非空 | **84 / 84 = 100%** | **69 / 69 = 100%** |
| `translation` 非空 | 84 / 84 = 100% | 69 / 69 = 100% |
| 最长词形 | 13 字符 | 12 字符 |
| 含空格的词组 | **0** | **0** |
| `partOfSpeech` | **0%** | **0%** |
| `examples` | **0%** | **0%** |

字段样例（`cet4/words.json` 首条，原文）：

```json
{"word":"abandon","translation":"放弃；抛弃","phonetic":"ә'bændәn","definition":"n. the trait of lacking restraint or control; reckless freedom from inhibition or worry"}
```

**注意**：`translation` 格式为「中文短语用`；`分隔」（如 `放弃；抛弃`），而 ielts/toefl 的 `translation` 为「词典风格带词性前缀」（如 `n. 鹰, 鹰状标饰`）。**两套 `translation` 写法在同一全库内并存，无字段区分**。

### 2.6 音标体系（IPA）

实测样例：`ә'bændәn`（abandon）、`'æbsәlu:t`（absolute）、`әk'selәreit`（accelerate）。

- 使用 **IPA 音位符号**（`æ` / `ʌ` / `ʊ` / `ɒ`）
- 但**重音符号用撇号**（`'`）而非 IPA 的 `ˈ`，次重音用 `.` 而非 `ˌ`
- `ә` 为旧式书写（IPA 标准为 `ə`）

`13-acceptance/GAP_ANALYSIS.md:140`（C-8）与 `KNOWN_ISSUES.md:48` 把 CET 归为「IPA」（对比 toefl 的「KK/旧式」）。**实测两者都是「IPA 符号 + 旧式重音标记」的混合写法**，只是 CET 用了标准 IPA 元音符号、toefl 未使用 —— 因此「IPA vs KK」这一分类**在实测数据上并不精确**，更准确的说法是「**两包的音标符号集与重音标记均不统一，且无字段可判定**」。

### 2.7 加载策略（inline）与 1000 词阈值的关系

两包均为 `offline.policy = 'inline'`，`registry.ts:61-62` 用 `words:` 而非 `load:`：

```ts
{ manifest: parseManifest(cet4Manifest), localId: 'cet4', words: parseWords(cet4Words) },
{ manifest: parseManifest(cet6Manifest), localId: 'cet6', words: parseWords(cet6Words) },
```

与门禁第 20 项（`offline.policy` ↔ `registry.ts` 加载方式一致）相符。

**但这里存在一个规划矛盾**（实测推论）：

- 门禁第 19 项：`inline` 包 **Σ词 ≤ 1000** 且 **Σ words.json ≤ 64 KiB**（`validate.mjs:54-62`）
- 现状：7 个 inline 包合计 **346 词 / 37.15 KiB**，余量有限
- CET 要覆盖考纲（4500 + 5500 = 10000 词）⇒ **必须改走 `lazy`**

即：**CET 扩词的第一个技术动作不是「加数据」，而是「改加载策略」** —— 因为 inline 路径有 1000 词硬上限，而当前 inline 池已被 7 个包占用 346 词。

详见 `05-import/IMPORT_PIPELINE.md` §4「inline / lazy 判定」与 `content/README.md:593-601`「新增大包时的固定流程」。

### 2.8 UI 可达性

| 能力 | 证据 | 状态 |
|---|---|---|
| `:bank cet4` 命令切换 | `tests/e2e.mjs:735`（切到 cet4 做错题入库用例） | ✅ |
| 预热 / 离线 | `tests/e2e.mjs:1227`（`localStorage.setItem('gt.bank', 'cet4')` 做离线用例） | ✅ |
| 契约测试 | `tests/content-query.mjs:60`（namespace 反查 `ecdict-cet4`） | ✅ |
| **CET-4 与 CET-6 的区分筛选** | 两包 `tags` **都是 `["cet", "vocabulary"]`** ⇒ `tags: ['cet']` 会**同时命中两包**，无法区分 | ❌ **无** |
| **按考试维度筛选** | `grep -rn "exam" src/components/ src/App.tsx src/lib/` → **0 命中** | ❌ **无** |
| **四级/六级备考模式** | 无 | ❌ **无** |

`tags` 过滤实现于 `src/core/content/query/content-query.ts:182-185`（命中任一 tag 即入选），实测两包 tags 完全相同，因此 **tag 维度无法承载「四级 vs 六级」的区分**。唯一可区分的是 `packageId`（`cet4` / `cet6`）或 `exam` 字段（未接入查询）。

---

## 3. 📐 待建：CET 考试能力

### 3.1 缺口矩阵

| CET 题型 | 类型槽位 | 数据 | 实现 |
|---|---|---|---|
| 听力（短篇新闻 / 长对话 / 听力篇章） | `listening` / `audio` | 0 | 0 |
| 阅读（选词填空 / 长篇阅读 / 仔细阅读） | `reading` | 0 | 0 |
| 写作 | `writing` | 0 | 0 |
| 翻译（汉译英） | —（`exercise`?） | 0 | 0 |
| 真题 / 模考 / 计分 | `exercise` | 0 | 0 |
| 成绩诊断 | — | 0 | 0 |

`13-acceptance/GAP_ANALYSIS.md:138`（C-6）：「IELTS/TOEFL/CET 均只有词汇包，无听/说/读/写/真题」。

### 3.2 与其它方向的对比（实测，用于定位 CET 的特殊性）

| 维度 | CET | IELTS / TOEFL | 考研 |
|---|---|---|---|
| 词条数 | 84 / 69 | 各 3000 | 3000 |
| 覆盖率可计算 | ✅（约 1.9% / 1.3%） | ❌（词频截断，无分母） | ❌（同） |
| 字段完整度 | **100% / 100%** | 98.1~99.97% | 99.80% / 100% |
| 加载策略 | `inline` | `lazy` | `lazy` |
| 有独立补字段脚本 | ✅（2 个） | ✅（1 个） | ❌（复用参数化脚本） |
| `KNOWN_ISSUES` 条目 | **CONTENT-001（独立条目）** | 无（归入 C-6 通用缺口） | 无 |
| 两包互通 | ❌ **cet4 ∩ cet6 = 0** | — | — |

**最后一行是一条实测事实**：`cet4` 与 `cet6` 的词形交集为 **0**（按 lowercase 比对，其余组合均有交集：`cet6∩ielts = 56`、`cet6∩kaoyan = 54` 等）。

这**不合常理**：CET-6 考纲理论上包含 CET-4 词汇，两包不应完全不相交。实测说明两包是**各自独立采样**，而非「6 级 = 4 级 + 增量」。另实测 `cet4` 前 5 条 = `abandon` / `absolute` / `abstract` / `academic` / `accelerate` —— 是**按字母序**排列，**不是词频序**。两项事实合并记入 `KNOWN_ISSUES.md#CONTENT-007`、`GAP_ANALYSIS.md#C-10`。

这意味着 **cet4 / cet6 是两个互不相交的词单** —— 与三个 ECDICT 词频包（高度重叠，ielts ∩ kaoyan = 1802）**结构完全不同**。合起来 153 词，是**一份被切成两段的精加工词单**。

### 3.3 一条关键的规模对照

若把「补齐 CET」与既有工程的其它数字并列：

| 项 | 数值 |
|---|---|
| CET-4 现有 | 84 词 |
| CET-4 考纲 | 约 4500 词 |
| 需要新增（CET-4） | 约 4416 词 |
| CET-6 需要新增 | 约 5431 词 |
| 全库现有总量 | 9346 词 |
| 三个 ECDICT 大包 | 9000 词 |

**补齐 CET-4 + CET-6 需要新增约 9847 词 —— 是现有全库（9346 词）的 1.05 倍。**

（口径说明：9847 = 4416 + 5431，按考纲 4500 / 5500 与现有 84 / 69 计算。该数字依赖考纲规模这一**非代码可测**的分母。）

且新增后 10000 词**必须走 lazy**，因此会新增 2 个约 470 KiB 的 chunk，并使 `warmUpVocabulary()` 的预热预算问题（当前 497.03 / 600 KiB，余量 17.2%）**进一步恶化** —— `content/README.md:611` 已把「改预热机制」列为**新增 GRE / Oxford 之前的强制前置**。

---

## 4. 建议（📐 全部为建议）

| # | 建议 | 针对的实测事实 | 备注 |
|---|---|---|---|
| C-1 | **为考试包定义覆盖率目标并入门禁** | CET-4 仅 84 词（约 1.9%），无任何机制度量 | `04-content/CONTENT_QUALITY.md` Q-6 同一建议 |
| C-2 | **扩词前先改加载策略为 `lazy`** | inline 上限 1000 词，当前 inline 池已占 346 词 | 否则扩词直接击穿门禁第 19 项 |
| C-3 | **扩词前先解决 `warmUpVocabulary()` 预算** | 余量 17.2%，加 2 个 3000 词包必爆 | `content/README.md:611` 已列为前置约束 |
| C-4 | **用 `packageId` 或新增 `exam` 维度，而非 `tags`，区分四级/六级** | 两包 tags 完全相同，`tags:['cet']` 会同时命中 | 需走契约变更流程 |
| C-5 | **CET 应扩到「考纲全覆盖」而非「词频前 N」** | CET 与 IELTS/TOEFL 的目标定义不同（前者要覆盖率，后者是截断） | 需先明确产品定义 |
| C-6 | **补 `titleEn` / `descriptionEn` 英文文案** | 两包中英文文案完全相同，`wordBanks.ts:62-63` 导致英文模式回退中文 | 低成本 |
| C-7 | **统一 `translation` 写法** | CET 用「`；`分隔中文短语」，ielts/toefl 用「`n.` 词典风格」 | 无门禁约束 |
| C-8 | **细化音标体系分类** | 「IPA vs KK」实测不精确；两包都是「IPA 符号 + 旧式重音」的混合 | 与 T-1 / Q-3 同一方向 |
| C-9 | **补记 CET-4/6 的 `partOfSpeech`** | 覆盖率 0%（白名单已声明） | `normalize.mjs:46` |

---

## 5. 与其它审计文档的关系（不重复内容）

| 主题 | 详见 |
|---|---|
| CONTENT-001 完整记录 | `13-acceptance/KNOWN_ISSUES.md` §CONTENT-001 |
| C-2 缺口条目 | `13-acceptance/GAP_ANALYSIS.md:134` |
| 覆盖率对照表（与本文同源） | `04-content/CONTENT_QUALITY.md` §6.1、§6.2 |
| inline / lazy 判定与 1000 词阈值 | `05-import/IMPORT_PIPELINE.md` §4 |
| 门禁第 19 / 20 项 | `05-import/IMPORT_VALIDATION.md` |
| 预热预算（I-1 / I-2） | `03-architecture/INTEGRATION_ARCHITECTURE.md` §2 |
| 字段贫瘠 / 音标混用（C-3 / C-8） | `13-acceptance/GAP_ANALYSIS.md` §4 |

---

## 6. 一句话结论

> CET 方向的「已有」= **两个字段 100% 覆盖、但只有 84 / 69 词的包**；
> 覆盖率 **约 1.9% / 1.3%**（考纲 4500 / 5500），是全库**唯一可精确计算覆盖率**的考试方向。
> 补齐需新增约 **9847 词**（为现有全库 9346 词的 1.05 倍），因此这不是「加数据」问题，
> 而是**必须先改加载策略（inline → lazy）+ 先解决预热预算**的工程前置问题。
> 实测补充：`cet4` 与 `cet6` 词形交集为 **0**（与三个 ECDICT 词频包的高度重叠形成对照），且两者 `tags` 完全相同、无法用于四级/六级筛选。
