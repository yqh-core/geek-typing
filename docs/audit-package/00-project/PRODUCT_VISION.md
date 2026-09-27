# 产品愿景（PRODUCT VISION）

> 状态：📐 待建
> 基线 commit：`4152eb2`｜实测日期：2026-09-27
> **本文记录的是"需求方提出的愿景"，不是仓库中已实现的产品定义。** 仓库内不存在任何正式 PRD、产品需求文档或路线图文件（详见 §1）。

---

## 1. 关键事实：仓库内没有正式 PRD

### 1.1 实测证据

| 检查项 | 结果 |
|--------|------|
| `docs/` 下是否有 PRD / 需求文档 | ❌ 无。`docs/` 下仅有 `功能总结.md`、`测试方案.md` 两份既有文档 |
| 仓库内是否有 `.docx` 需求文档 | ❌ `find . -iname "*.docx"` 零命中 |
| 是否有 `ROADMAP.md` / `VISION.md` / `PRD.md` | ❌ 无 |
| issue tracker / 项目管理文件 | ❌ 仓库内无 |
| 唯一的需求来源 | 《最新要求.docx》——**该文件不在仓库中**，只能通过 `13-acceptance/GAP_ANALYSIS.md` §8 的逐节对照间接获知 |

**结论**：产品愿景目前**只以口头/外部文档形式存在，未在仓库中落成可追溯的文档**。本文所述的愿景全部转引自 `docs/audit-package/13-acceptance/GAP_ANALYSIS.md` §8「与需求文档逐节对照」与 `docs/audit-package/README.md`，属**二手转述**，原文细节**未能验证**。

---

## 2. 需求方提出的愿景（转述）

需求文档（《最新要求.docx》，32 节）提出的产品定位是：

> **Personal English Learning Content & Practice OS**
> （个人英语学习内容与练习操作系统）

该定位的核心主张可归纳为三层：

| 层 | 主张 | 转述来源 |
|----|------|---------|
| **内容层** | 建立一个**可导入、可治理、可扩展**的个人英语内容体系，覆盖词汇、短语、句子、段落、文章、音视频、字幕等多类型内容 | `GAP_ANALYSIS.md` §8 |
| **练习层** | 在内容之上建立**多种练习引擎**（打字、拼写、听写、跟读、选择、填空等），由统一的学习引擎调度 | `GAP_ANALYSIS.md` §8 |
| **OS 层** | 以**学习图谱**（Learning Graph）为核心，把内容与用户学习状态建模为可查询、可推荐的关系网络，最终形成个人化的学习操作系统 | `GAP_ANALYSIS.md` §8 |

### 2.1 需求文档提到的外部参考

需求文档 §三 列出了 5 个 GitHub 参考项目（`iChochy/NCE`、`5mdld/anki-english-60k-decks`、`Ecattea/COCA-English-Anki-Deck`、`LinguaMiner`、`ISTS — IELTS Study OS`），并描述了「值得借鉴的方向」。

**重要事实**：这部分**我方未做任何调研**。详见同目录 `../01-product/COMPETITOR_ANALYSIS.md`。

---

## 3. 现状 vs 愿景：差距表

下表逐维度对照愿景与实测现状。所有"现状"列均有文件+行号证据；"差距"列为客观描述，不含时间估计。

| 维度 | 愿景（需求文档） | 现状（实测） | 差距 |
|------|-----------------|-------------|------|
| **内容类型** | 词汇 / 短语 / 句子 / 段落 / 文章 / 音视频 / 字幕 等多类型 | `ContentType` 定义了 **12 种**类型（`src/core/content/model/content.ts:34-46`），但**只有 2 种有数据**（`vocabulary`、`word`），落地率 **2/12 = 16.7%** | 10 种类型零数据；`PLANNED_TYPES` 11 项仅为占位（`src/core/content/catalog.ts:52-64`） |
| **内容体量** | 支撑英语学习平台的内容规模 | **9,346 词**；其中 **9,000 词（96.3%）**来自 3 个 ECDICT 词频包；自有整理仅 346 词 | CET4 覆盖率实测 **1.9%**（`13-acceptance/KNOWN_ISSUES.md` CONTENT-001） |
| **内容导入** | 通用导入体系（多格式、多来源） | **不存在**。只有 `BankManager` 的**纯文本粘贴框**（`src/components/BankManager.tsx:106`），且产物落在 `localStorage` 的 `gt.customBanks.v1`，**未进入 Content 链** | 无格式解析、无字段映射、无去重、无来源追踪 |
| **音视频** | 音频 / 视频内容类型 | **零实现**。`docs/audit-package/07-media/` 目录为**空** | 无媒体类型契约、无播放器、无存储方案 |
| **字幕** | 字幕类型与同步 | **零实现**。无字幕类型、无时间轴模型、无分词对齐 | 完全未开始 |
| **学习图谱** | 关系网络（内容↔内容、内容↔用户） | `LearningRelation` 类型已定义 **5 种关系**（`studied`/`collected`/`mastered`/`in_progress`/`goal_of`，`src/core/learning/model/relation.ts:64-90`，90 行），但该目录下**零实现**；`src/core/learning/model/` 仅 1 个文件（47 行的 `learning-item.ts`） | 有契约骨架、无引擎、无存储、无 UI |
| **学习引擎** | 统一调度多种练习 | 4 种打字模式（`classic`/`spell`/`timed`/`code`，`src/lib/modes.ts`，20 行）+ 背单词卡片 + SRS 复习。**三套状态各自独立存储**（`gt.review.v1` / `gt.memorize.v1` / `gt.analytics.v1`） | 无统一引擎；无调度层；四层键口径不一致（见 `03-architecture/DATA_ARCHITECTURE.md` §2.3） |
| **练习类型** | 听写 / 跟读 / 选择 / 填空 / 发音评测 等 | 仅**打字**（4 模式）+ **卡片打分**（3 键）。无听力、无口语、无选择题 | 练习引擎族基本空白 |
| **SRS** | 艾宾浩斯/间隔重复 | ✅ **已实现**：`INTERVALS_DAYS = [1,2,4,7,15]`（`src/lib/reviewStore.ts:25`），±10% jitter（`:99-101`），QuotaExceeded 熔断（`:51-96`）。但间隔数组**硬编码 5 档，不可配置** | 算法有，可配置性无；无跨设备同步 |
| **掌握度模型** | 学习状态建模 | 四级 `MasteryLevel`：`struggling`/`learning`/`familiar`/`strong`（`src/lib/mastery.ts`，33 行） | 模型有，但派生自打字/卡片数据，非独立评估 |
| **考试体系** | 雅思/考研/托福等考试训练 | **零实现**。`docs/audit-package/08-exam/` 目录为**空**。虽有 `exam` 字段的 manifest 元数据，但无任何考试功能 | 完全未开始 |
| **AI Tutor** | 需求文档提及 | **零实现**。全仓无任何 LLM/API 调用代码 | 完全未开始 |
| **用户系统** | （愿景隐含） | **零实现**。无登录、无账号、无后端 | 完全未开始 |
| **跨设备同步** | （愿景隐含） | **零实现**。数据不变量 D-6 明确标记 ❌（`03-architecture/DATA_ARCHITECTURE.md` §5） | 完全未开始 |
| **URL 路由 / 深链** | （OS 定位隐含需要） | **零实现**。URL 恒为 `/`，刷新回首页 | 见 `02-ui-ux/NAVIGATION.md` |
| **版权治理** | 内容来源合规 | manifest 已有 `sources[0].license.{name,spdx}`，20 项门禁含 license 检查（`validate.mjs:7`）。但**无 `rightsStatus` 字段**、**无 sourceUrl/author/publisher/copyright/downloadDate**、**仓库根目录无 LICENSE 文件** | 见 `11-legal/LICENSE_POLICY.md`；`KNOWN_ISSUES.md` LEGAL-001 |

### 3.1 差距的量化总结

| 分类 | 已落地 | 未落地 | 落地率 |
|------|-------|-------|-------|
| 内容类型 | 2 | 10 | 16.7% |
| 规划类型（`PLANNED_TYPES`） | 0 | 11 | 0% |
| 需求文档 32 节所述能力 | 见 `GAP_ANALYSIS.md` §8 逐节对照 | 大多数节 | 需求文档 §三 明确"未做" |
| 练习引擎族 | 1（打字） | ≥4（听/说/选/填） | ≤20% |

---

## 4. 愿景与现状的根本落差（架构层面）

这不是"功能做了多少"的落差，而是**架构定位**的落差：

| 项 | 现状定位 | 愿景定位 |
|----|---------|---------|
| **数据主键** | 裸 `word` 字符串（跨包同名词 **2,323 个**、含大写字母的词条 93 条） | 应是 `ContentId`（4 段式全局唯一） |
| **内容存储** | 构建期打包进 JS chunk（不可运行时扩展） | 应是可导入、可增量、可远程分发的资源体系 |
| **用户数据** | `localStorage` 14 个 key，单机单浏览器 | 应是可同步、可迁移的用户数据集 |
| **内容寻址** | UI 直读词数组 **17 处**（绕过 Query 层） | 应统一走 Query 层 |
| **内容类型** | 编译期常量枚举，2/12 落地 | 应是可扩展的类型系统 |

**换句话说**：现有的 Content 治理链（Registry→Catalog→Index→Query）**已经按"OS"的方向设计好了骨架**（`src/core/content/**`，6 条冻结条款 C-1~C-6），但**产品功能面还停留在"打字背单词工具"**，两者之间存在明显的**契约悬空**。

---

## 5. 本文未能验证的内容

| 项 | 原因 |
|----|------|
| 《最新要求.docx》原文 32 节的完整内容 | 文件不在仓库内，仅有 `GAP_ANALYSIS.md` §8 的逐节对照摘要 |
| 需求文档的优先级排序与验收标准 | 同上，无原文 |
| 需求方对愿景的最终确认版本 | 无任何正式签署文档 |
| 5 个 GitHub 参考项目的实际内容 | **我方未调研**，见 `../01-product/COMPETITOR_ANALYSIS.md` |
| 目标发布时间 / 里程碑 | 无 |

---

## 一句话结论

需求方提出的愿景是「Personal English Learning Content & Practice OS」，但该愿景**在仓库中无任何正式 PRD 承载**，且与现状存在**架构级落差**：Content 链已按 OS 方向设计好骨架（12 类型契约、4 段式 ContentId、6 条冻结条款），而产品面仅落地了打字 + 背单词 + SRS 复习三项，音视频、字幕、学习图谱、通用导入、考试体系、AI Tutor **均为零实现**。
