# Content Contract 导读（CONTENT_CONTRACT）

> 状态：✅ 已有
>
> ⚠️ **本文是导读，不是契约原文。**
> 契约原文 45 215 B，位于仓库根目录 **`CONTENT_CONTRACT.md`**（冻结于 V4.1-P0.6，2026-09-26）。
> 本文负责回答「原文里有什么、去哪里看」，**不重复也不替代原文**。
> 两者冲突时**以根目录原文为准**。
>
> 基线 commit：`4152eb2`　｜　核对日期：2026-09-27

---

## 1. 原文位置与配套文档

| 文档 | 位置 | 大小 | 定位 |
|---|---|---|---|
| **契约（规范）** | `CONTENT_CONTRACT.md` | 45 215 B | **什么不可变**。唯一规范源 |
| 操作手册 | `content/README.md` | — | **怎么用** / 踩坑史 / CLI |
| 契约状态 | `CONTENT_CONTRACT.md:3` | — | `FROZEN @ V4.1-P0.6`（2026-09-26） |

冲突处置规则（`content/README.md:7`）：

> 「什么不可变」写在根目录的 `CONTENT_CONTRACT.md`，**两者冲突以契约为准**并立即修本文件。

### 1.1 原文目录结构（13 节 + 3 个附录）

| § | 主题 | 原文行号 |
|---|---|---|
| 1 | 三层边界 | `:72` |
| 2 | ContentId | `:88` |
| 3 | PackageId / namespace / localId | `:154` |
| 4 | 版本模型：schemaVersion / contentVersion / contentRevision / checksum | `:207` |
| 5 | Canonical JSON 与 checksum 算法 | `:269` |
| 6 | 核心类型：ContentRef / ContentVersioned / ContentVersionRef / ContentSnapshot / AssetRef | `:297` |
| 7 | `manifest.json` 契约 | `:379` |
| 8 | `words.json` / `relations.json` 契约 | `:435` |
| 9 | Catalog / ContentIndex / ContentQuery 三层职责与 API | `:463` |
| 10 | 已知限制（冻结时必须一起接受） | `:588` |
| 11 | 不变式清单（可直接写成断言） | `:635` |
| 12 | P1 UI Contract（防腐层） | `:666` |
| 13 | Content Loading Strategy（产品级约束） | `:742` |
| 附 | 变更历史 | `:841` |
| 附 | 下一步 | `:852` |
| 附 | P1 的一句话原则（用户原话） | `:862` |

---

## 2. 冻结条款摘要（20 项）

原文顶部「🔒 冻结条款」段落给出 6 条**明令禁止**（`:17-24` 的表格），
§2.2 给出 6 条 ContentId 断言（C-1~C-6），§4.1 给出 4 个版本字段的语义约束，
§7 给出「禁止手改」字段清单，§12.2 给出 3 条 UI 禁止项。
合并去重后共 **20 项冻结条款**：

| # | 冻结条款 | 原文位置 |
|---|---|---|
| 1 | 禁止为了少一次查询而把 `contentVersion` 塞进 ContentId | `:19` |
| 2 | 禁止为了让联结表好看而放宽 / 收紧 namespace 规则 | `:21` |
| 3 | 禁止为了少写一个字段而跳过 checksum | `:22` |
| 4 | 禁止为了让某个页面好写而新增 `searchXxx()` 散装 API | `:23` |
| 5 | 禁止为了让某张卡片显示「最近添加」而给词条补 `updatedAt` 假数据 | `:24` |
| 6 | 禁止觉得某字段麻烦而在 manifest 里省略它（§7 全部必填） | `:25` |
| 7 | **C-1** ContentId 大小写敏感、逐字符比较 | `:117` |
| 8 | **C-2** `type` ∈ 12 个 `ContentType` 取值 | `:118` |
| 9 | **C-3** `namespace` 匹配 `[a-z0-9-]+` | `:119` |
| 10 | **C-4** 版本信息绝不进 ContentId（不拼 `.v2`、不拼 checksum） | `:120` |
| 11 | **C-5** 非法 id 时 `parseContentId` 返回 `null`，不抛异常 | `:121` |
| 12 | **C-6** 词条 ContentId 的 lemma **保留原词形**（id 侧禁止 lowercase） | `:122` |
| 13 | `schemaVersion` 只在结构破坏性变更时递增 | `:211` |
| 14 | `contentRevision` 回滚也不回头（单调递增） | `:212` |
| 15 | `contentVersion` **同一 checksum 复用同一 version**（回滚即回到历史值） | `:213` |
| 16 | `contentChecksum` 是内容的确定性身份，格式 `'sha256:' + hex` 完整不截断 | `:214`、`:282` |
| 17 | 禁止手改：`id` / `namespace` / `packageId` / `stats` / `sources[].checksum` / `schemaVersion` / `contentRevision` / `contentVersion` / `contentChecksum` / `contentHistory` / `build` | `:387-389` |
| 18 | 禁止 UI `import words.json`（不论 `?raw` 还是经 `wordBanks` 转手） | `:684` |
| 19 | 禁止 UI 对词表数组做 `filter` / `map` / `sort` / `slice` | `:685` |
| 20 | 禁止包名分支 `packageId === 'ielts'` / `bankId === 'cet4'` | `:686` |

**变更流程**（原文 `:29-35`，不允许跳过任何一步）：

```
1) 先改本文件（写明变更、影响面、迁移方案、是否需要 SCHEMA_VERSION +1）
2) 再改 scripts/content/validate.mjs，把新约束固化为门禁项
3) 跑 content:build 全量迁移所有包
4) 跑全量回归：content:validate → test:content → build → e2e → offline-audit
5) 提交时 commit message 必须含 [CONTRACT CHANGE]
```

顺序不能倒（`content/README.md:650`）：**先契约，后门禁，再回归**。
门禁没跟着改的契约变更等于没有契约。

---

## 3. 不变式清单 I-1 ~ I-21（照抄原文编号）

原文 §11（`:635-664`）定义。**编号 I-1~I-18 为 P0.6 冻结，
I-19 / I-20 为 P0.6.1 追加**（原文 `:33-34` 的变更记录表）。

| ID | 不变式 | 守护者 |
|---|---|---|
| **I-1** | 每个包的 `packageId === 目录名` | validate #13 |
| **I-2** | 每个包的 `namespace === parse(manifest.id).namespace` | validate #14 |
| **I-3** | **namespace 两两不同** | validate #9 |
| **I-4** | 包 ContentId 全局唯一 | validate #8 |
| **I-5** | `contentChecksum === sha256Canonical(words)` | validate #15 |
| **I-6** | `build.sourceChecksum === contentChecksum` | validate #17 |
| **I-7** | `contentHistory` 非空，且存在 `checksum === contentChecksum` 的条目，其 `version === contentVersion`、`1 ≤ revision ≤ contentRevision` | validate #16 |
| **I-8** | `schemaVersion === 4`、`contentVersion` 为正整数 | validate #10 / #11 |
| **I-9** | `stats.items === words.length` | validate #5 |
| **I-10** | 包内无 duplicate localId / duplicate normalized word | validate #4 / #12 |
| **I-11** | 外部来源必须有 SPDX | validate #7 |
| **I-12** | 词级 ContentId 全局唯一（跨包扫描） | validate #12(c) |
| **I-13** | Query 层零直访 ContentIndex 内部 Map | test:content + code review |
| **I-14** | 排序 deterministic：同一 query 多次执行顺序一致 | test:content【12】 |
| **I-15** | 全库词条 **search 能查到 ⇒ get 能取回**（含大写词形） | test:content 逐条自取回归 |
| **I-16** | 全库 10 包 Σ items = 基准数（当前 **9346**），变更需显式更新 | test:content【1】 |
| **I-17** | `canonicalize` 对「同内容不同排版」输出一致，且**不重排数组** | canonical.selfCheck + test:content |
| **I-18** | `findRevision` 与 `content:build` 回滚同口径（取 revision 最大的匹配条目） | test:content【13】 |
| **I-19** | **（P0.6.1）** 词条 ContentId 的 lemma 保留原词形（`wordId` 与 `buildHits` 同源，**禁止在 id 侧 lowercase**） | `test:content` |
| **I-20** | **（P0.6.1）** **首屏体积不随词库增长**：主 chunk ≤ 420 KiB raw / 135 KiB gzip；`offline.policy==='inline'` 的包 Σ词 ≤ 1000 且 Σ words.json ≤ 64 KiB | `check:bundle` + `content:validate` 第 **19 / 21** 项 |

> **I-21 的说明**：原文 §11 **没有 I-21**。该编号仅出现在 `GAP_ANALYSIS.md#7`
> 的修复优先级表里（「清掉静默 `translation: ''` fallback（**新增**门禁 I-21）」）——
> 它是**建议新增**的编号，不是已定义的不变式。本导读据实记录，不做补号。
> 相关的既有依据是契约 §12.6「🔴 最危险的一类（迁移时必须优先处理）」：
> `App.tsx:253` / `ReviewPanel.tsx:47` 的 `map.get(w) ?? { word: w, translation: '' }` 占位兜底。

### 3.1 覆盖规模（原文 §11 开头 `:637-638`）

> 这些已经被 `content:validate`（**20** 项 × 10 包）、`test:content`（**148** 项）
> 以及构建后门禁 `check:bundle`（主 chunk 体积 / 预热预算）覆盖。

---

## 4. 三层边界（原文 §1）

| 层 | 存放 | 主键 | 变更频率 |
|---|---|---|---|
| **Content** | `content/**` | ContentId + contentChecksum | 随版本发布 |
| **Learning** | `src/core/learning/model/` | contentId（+ ContentSnapshot） | 每次练习 |
| **User** | settings / goals / profile | 用户维度 | 用户主动改 |

三条不可协商（原文 `:76-80`）：

1. Content is immutable from the user's perspective.（用户行为永远不写 `content/`）
2. Learning never owns content.（学习状态绝不挂进 content payload）
3. User data never enters `content/`.

---

## 5. 已知限制 L-1 ~ L-7（原文 §10）

原文 `:590-599` 表格。**冻结 = 连同这些一起接受**：

| # | 限制 | 现状 | 本文档包内对应文件 |
|---|---|---|---|
| L-1 | `sort:'updated'` 是**退化语义** | 词表无词级 `updatedAt`，实际按包内原始词序 | `03-architecture/CONTENT_ARCHITECTURE.md#7.3` |
| L-2 | `contentVersion` **不保证连续** | 回滚后新内容跳号（实测 ver `1 → 4`） | `04-content/CONTENT_VERSIONING.md` |
| L-3 | `relations.json` / `assets/` **尚无数据** | 门禁相应项打印「跳过」 | `04-content/CONTENT_RELATION.md` |
| L-4 | 近似重复只在 for-review 层 | car / automobile 这类不做自动处理，**绝不自动删词** | `04-content/CONTENT_QUALITY.md` |
| L-5 | **AssetManifest 未做** | 推到 P3 | `03-architecture/INTEGRATION_ARCHITECTURE.md#5` |
| L-6 | **Learning 层未迁移** | 运行时键是**裸 `word`**；9346 词中 2323 个跨包同名词、93 条含大写字母 | `03-architecture/LEARNING_ARCHITECTURE.md#4` |
| L-7 | **UI 尚未接 Query Layer 与 Catalog** | 17 处直读词数组；`contentQuery.*` / `getCatalog()` 调用数 = 0；`hasFeature()` 调用数 = 0 | `03-architecture/SYSTEM_ARCHITECTURE.md#4` |

### 5.1 L-6 明细（原文 §10.1，`:603-633`）

四层 Learning 运行时键的真实口径：

| key | 位置 | 每条记录的键 |
|---|---|---|
| `gt.review.v1` | `src/lib/reviewStore.ts:27` | **裸 `word`（原词形）** |
| `gt.memorize.v1` | `src/lib/memorizeStore.ts:16` | **裸 `word`（原词形）** |
| `gt.analytics.v1` | `src/lib/analytics.ts:6` | `.words` 子表键 = **`word.toLowerCase()`**（口径还不一样） |
| `gt.customBanks.v1` | `src/lib/customBanks.ts:3` | 数组不是 map，词**没有 ContentId**；包 id 形如 `custom-<base36>` |

→ 详见 `03-architecture/DATA_ARCHITECTURE.md#2`（14 个 key 全清点）。

---

## 6. 内容包清单（实测，10 个）

由 `content-samples/MANIFESTS.md` 从实际 JSON 读出。汇总：

| 包 | 词数 | namespace | policy | contentVersion | 许可 |
|---|---|---|---|---|---|
| ai-core | 43 | `curated-ai-core` | inline | 1 | Proprietary (self-curated) |
| cet4 | 84 | `ecdict-cet4` | inline | 1 | MIT |
| cet6 | 69 | `ecdict-cet6` | inline | 1 | MIT |
| cloud-native | 30 | `curated-cloud-native` | inline | 1 | Proprietary |
| frontend | 20 | `curated-frontend` | inline | 1 | Proprietary |
| go-code | 50 | `curated-go-code` | inline | 1 | Proprietary |
| ielts | 3000 | `ecdict-ielts` | lazy | 2 | MIT |
| kaoyan | 3000 | `ecdict-kaoyan` | lazy | 2 | MIT |
| toefl | 3000 | `ecdict-toefl` | lazy | 2 | MIT |
| ts-code | 50 | `curated-ts-code` | inline | 1 | Proprietary |
| **合计** | **9346** | 10 个互不相同 | inline 7 / lazy 3 | — | MIT 5 / Proprietary 5 |

---

## 7. 本资料包内对应的深度文档

| 主题 | 文件 |
|---|---|
| 契约原文（45 KB） | `CONTENT_CONTRACT.md`（仓库根目录） |
| 内容类型清单与落地状态 | `04-content/CONTENT_TYPES.md` |
| manifest / words.json 字段与真实样本 | `04-content/CONTENT_SCHEMA.md` |
| 关系模型（有模型无数据） | `04-content/CONTENT_RELATION.md` |
| 版本三元组机制 | `04-content/CONTENT_VERSIONING.md` |
| 来源溯源字段对照 | `04-content/CONTENT_PROVENANCE.md` |
| 许可体系与 rightsStatus 缺口 | `04-content/CONTENT_LICENSE.md` |
| 内容质量实测 | `04-content/CONTENT_QUALITY.md` |
| Content 层架构治理链 | `03-architecture/CONTENT_ARCHITECTURE.md` |

---

## 8. 一句话结论

> 契约是一份 **45 KB、13 节、20 项冻结条款、20 条不变式（I-1~I-20）** 的规范文档，
> 冻结于 V4.1-P0.6 并有明确的变更流程（先契约 → 后门禁 → 再回归）。
> 它的核心特征是**诚实**：§10 用 7 条「已知限制」把未做的部分写进冻结范围，
> §12.6 把实测基线（17 处直读、0 处调用）写进契约本身，而不是留白。
