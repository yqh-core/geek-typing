# 产品范围（PRODUCT SCOPE）

> 状态：🔄 混合（本文分节标注）
> 基线 commit：`4152eb2`｜实测日期：2026-09-27
> **§2 为已落地范围（✅ 实测）**；**§3 为未落地范围（📐 规划/零实现）**；§4 为边界灰色地带。

---

## 1. 范围判定口径

本文用三条硬标准判定一项能力是否属于"已落地范围"：

| 标准 | 要求 |
|------|------|
| **有实现** | 存在可运行的源码路径（非仅类型定义、非仅占位常量） |
| **有入口** | 用户能在 UI 上触达（有 `data-testid` 可被 E2E 定位） |
| **有验证** | 至少有一条 E2E 或单测用例覆盖 |

三项全满足 → ✅ 已落地；缺任一项 → 🔄 部分 / 📐 未落地。

---

## 2. 已落地范围（✅ 实测）

### 2.1 Content 基础设施层

| 能力 | 实现文件 | 体量 | 验证 |
|------|---------|------|------|
| 内容模型与类型契约 | `src/core/content/model/content.ts` | 204 行 | 149 例 `test:content` |
| 内容注册表 | `src/core/content/registry.ts` | 141 行 | 同上 |
| 内容目录 | `src/core/content/catalog.ts` | 104 行 | 同上 |
| 内容索引（4 张 Map） | `src/core/content/indexer/content-index.ts` | 231 行（internal） | 同上 |
| 内容查询（4 入口） | `src/lib/content-query.ts` | 385 行 | 同上 |
| 内容快照 | `src/lib/snapshot.ts` | 128 行 | 同上 |
| 内容构建链 | `scripts/content/{canonical,normalize,build,validate,list}.mjs` | 134+186+214+427+59 = **1,020 行** | 20 项门禁 |

**这是本项目最成熟的部分**：全链路有 6 条冻结条款（C-1~C-6）、20 项自动门禁、149 例单测、canonical SHA-256 校验和、版本三元组（`schemaVersion` / `contentRevision` / `contentVersion` / `contentChecksum`）。

### 2.2 学习闭环层

| 闭环 | 入口 | 实现 | 验证 |
|------|------|------|------|
| **① 打字练习** | `tab-typing` | `PracticePanel.tsx`(240) + `App.tsx:411-568` 键盘监听 | E2E【2】【6】【7】【8】【13-1】 |
| **② 背单词** | `tab-memorize` | `Memorize.tsx`(449) + `memorizeStore.ts`(72) | E2E【9】【11.6】【14-2】 |
| **③ 复习（SRS）** | `tab-review` | `ReviewPanel.tsx`(212) + `reviewStore.ts`(176) | E2E【14-3】【14-4】【14-5】 |
| **④ 进度查看** | `tab-progress` | `ProgressPanel.tsx`(120) + `analytics.ts`(116) + `streak.ts`(94) | E2E【16】 |
| **⑤ 首页聚合** | `tab-home` | `HomePanel.tsx`(161) + `recommend.ts`(39) | E2E【16】 |

### 2.3 支撑能力（已落地）

| 能力 | 实现 | 证据 |
|------|------|------|
| **4 种打字模式** | `classic` / `spell` / `timed`(60s) / `code` | `src/lib/modes.ts`（20 行）；E2E【7】`countdown`、【13-1】`:mode code` |
| **SRS 算法** | 艾宾浩斯 5 档 `[1,2,4,7,15]` 天 + ±10% jitter + QuotaExceeded 熔断 | `src/lib/reviewStore.ts:25`/`:99-101`/`:51-96`；E2E【13-2】 |
| **四级掌握度** | `struggling`/`learning`/`familiar`/`strong` | `src/lib/mastery.ts`（33 行）；E2E【16】徽章断言 |
| **3 套主题** | `matrix` / `ide` / `ink`，每套 11 语义槽 | `src/lib/theme.ts`（81 行）；E2E【4】 |
| **音效引擎** | Web Audio 实时合成，3 主题 `mech`/`thock`/`8bit` | `src/lib/sound.ts`（204 行）；E2E【4】 |
| **发音（TTS）** | Web Speech API，en-US / en-GB | `src/lib/speech.ts`（82 行）；E2E【8.5】、`:voice en-GB` |
| **命令面板** | 14 条命令 + 模糊匹配 + 双语 HELP | `CommandPalette.tsx`（404 行）；E2E【11.5】【14-1】 |
| **i18n（zh/en）** | 自研 `LangProvider` + `useT()`，各 185 条 | `src/i18n/`（70+232+231 行）；E2E【10】 |
| **自定义词库** | 文本粘贴导入，存 `gt.customBanks.v1` | `BankManager.tsx`（209 行）+ `customBanks.ts`（92 行） |
| **PWA / 离线** | `sw.js`（178 行），`gt-shell-v3`，双缓存策略 | E2E【14-2】预热探针；`test:offline` 20/20 |
| **体积门禁** | 主 chunk 420 KiB / gzip 135 KiB | `scripts/content/check-bundle.mjs`（250 行） |
| **移动端手势** | 原生 touch：左滑不认识、右滑认识、上滑模糊 | `Memorize.tsx:145-258`；E2E【14-2】 |
| **结算彩带** | `canvas-confetti`，尊重 reduced-motion | `src/lib/confetti.ts`（28 行） |

### 2.4 已落地范围的一句话概括

> **能做的事**：打开网页 → 选词库/模式/主题 → 敲字背单词 → 卡片背记 → 按艾宾浩斯复习 → 看进度热力图；离线可用；中英双语；手机可滑卡片。
> **不能做的事**：注册登录、跨设备同步、分享链接、听写、口语、看视频、学语法、做套题。

---

## 3. 未落地范围（📐 规划 / 零实现）

### 3.1 内容类型缺口

`ContentType` 定义 **12 种**（`src/core/content/model/content.ts:34-46`），落地 **2 种**：

| # | 类型 | 状态 | 说明 |
|---|------|------|------|
| 1 | `vocabulary` | ✅ 有数据 | 词库包 |
| 2 | `word` | ✅ 有数据 | 词条 |
| 3–12 | 其余 10 种 | 📐 零数据 | 无任何内容 |

另有 `PLANNED_TYPES` **11 项**仅为占位常量（`src/core/content/catalog.ts:52-64`），无对应实现。
`SUPPORTED_TYPES = ['word']`（`src/lib/content-query.ts:133`）—— Query 层只认 1 种。

### 3.2 需求文档所述、但零实现的能力

来源：`docs/audit-package/13-acceptance/GAP_ANALYSIS.md` §8 逐节对照。

| 能力域 | 状态 | 目录/证据 |
|--------|------|----------|
| **音视频内容** | 📐 零实现 | `docs/audit-package/07-media/` **空目录** |
| **字幕（时间轴/对齐）** | 📐 零实现 | 无字幕类型、无时间轴模型 |
| **学习图谱引擎** | 📐 契约有、实现零 | `src/core/learning/model/relation.ts`（90 行）定义 5 种关系；`src/core/learning/model/` 仅 1 文件 |
| **通用内容导入体系** | 📐 零实现 | 仅有纯文本粘贴（见 §4.1） |
| **考试体系（IELTS/考研/托福训练）** | 📐 零实现 | `docs/audit-package/08-exam/` **空目录** |
| **练习引擎族（听写/跟读/选择/填空）** | 📐 零实现 | 只有打字 |
| **AI Tutor** | 📐 零实现 | 全仓无 LLM 调用 |
| **阅读 / 语法模块** | 📐 零实现 | 无 |
| **用户账号 / 登录** | 📐 零实现 | 无后端、无认证代码 |
| **跨设备同步** | 📐 零实现 | 数据不变量 D-6 ❌（`03-architecture/DATA_ARCHITECTURE.md` §5） |
| **URL 路由 / 深链** | 📐 零实现 | URL 恒 `/`（`02-ui-ux/NAVIGATION.md`） |
| **发音评测（打分）** | 📐 零实现 | 只有播放 TTS |
| **内容版权治理体系** | 🔄 部分 | manifest 有 license 字段，但无 `rightsStatus`、仓库根无 LICENSE |

### 3.3 内容体量缺口（量化）

| 项 | 数值 | 来源 |
|----|------|------|
| CET4 覆盖率 | **1.9%** | `13-acceptance/KNOWN_ISSUES.md` CONTENT-001 |
| 自有整理词条 | 346 / 9,346 = **3.70%** | `content-samples/SIZE-REPORT.md` |
| ECDICT 词频包词条 | 9,000 / 9,346 = **96.30%** | 同上 |
| `partOfSpeech` 字段 | ~~**零数据**~~ → **已移除**（P1.6-E；零数据空壳，留着会误导为「有词性数据」） | `KNOWN_ISSUES.md` CONTENT-005（已关闭） |
| 空 `definition` 词条 | **9 条** | `KNOWN_ISSUES.md` BUG-001（`normalize.mjs:135-137`） |
| 音标体系 | **混用**（两套标注体系并存） | `KNOWN_ISSUES.md` CONTENT-004 |

### 3.4 工程保障缺口

| 项 | 状态 | 证据 |
|----|------|------|
| CI 跑测试 | ❌ 20+3+149+4+22+lint 全未进 CI | `GAP_ANALYSIS.md` B-3 / DEBT-002 |
| 单元测试框架 | ❌ 无（用裸 `node` 脚本 + 断言） | `GAP_ANALYSIS.md` B-1 |
| 测试 fixture | ❌ 无 | `GAP_ANALYSIS.md` B-2 |
| ErrorBoundary | ❌ 无 | `KNOWN_ISSUES.md` DEBT 系列 |
| CSP | ❌ 无 | `KNOWN_ISSUES.md` SECURITY-001 |
| 监控 / 容灾 | ❌ 无 | `12-infrastructure/MONITORING.md`、`DISASTER_RECOVERY.md` |
| staging 环境 | ❌ 无，只有 1 个 Pages 项目 | `12-infrastructure/DEPLOYMENT.md` §5 |
| a11y 门禁 | ❌ 无 | `02-ui-ux/ACCESSIBILITY.md` |
| Design Tokens 体系 | ❌ 无（用 TS 常量，无 CSS 变量） | `02-ui-ux/DESIGN_SYSTEM.md` |
| 仓库 LICENSE 文件 | ❌ 无（`package.json` 亦无 `license` 字段） | `KNOWN_ISSUES.md` LEGAL-001 |

---

## 4. 边界灰色地带（不算已落地，也不算零实现）

### 4.1 自定义词库 ≠ 内容导入

`BankManager` 允许用户粘贴纯文本词表（`src/components/BankManager.tsx:106` 的 `bank-textarea`）。但：

| 检查 | 结果 |
|------|------|
| 是否进入 Content 链（Registry / Index / Query） | ❌ **否**。落在 `localStorage` 的 `gt.customBanks.v1` |
| 是否有 `ContentId` | ❌ 否。`customBanks.ts`（92 行）**未定义 `custom-<base36>` namespace** |
| 是否支持格式解析（CSV/JSON/Anki） | ❌ 否，纯文本分割 |
| 是否做去重 / 字段映射 | ❌ 否 |
| 是否可被复习/统计覆盖 | 🔄 部分（`App.tsx:125-137` 把自定义词库 merge 进 `banks`，故可参与练习） |

**判定**：属于"用户本地草稿"，**不属于内容导入体系**。需求文档所指的通用导入体系为零实现。

### 4.2 已有契约但无实现的部分

| 项 | 契约位置 | 实现 |
|----|---------|------|
| `Registry.listContent()` | `src/core/content/registry.ts:122-126` | 接口预留，无调用方 |
| `Registry.getContent()` | `src/core/content/registry.ts:105-120` | 接口预留，无调用方 |
| `LearningRelation`（5 种关系） | `src/core/learning/model/relation.ts:64-90` | 仅类型，无引擎 |
| `LearningItem`（4 种状态） | `src/core/learning/model/learning-item.ts`（47 行） | 仅类型，无实现 |
| `PLANNED_TYPES`（11 项） | `src/core/content/catalog.ts:52-64` | 仅常量 |
| `Role` / 权限 | — | 无 |

**判定**：这些是"设计已冻结、实现未开始"，应计为 📐 未落地。

### 4.3 视觉/交互上存在但非产品功能的项

| 项 | 说明 |
|----|------|
| 17 张审计截图 | 属交付物，非产品功能 |
| `scripts/audit-capture.mjs`（249 行） | 属审计工具，非产品功能 |
| `docs/audit-package/**` | 属文档，非产品功能 |

---

## 5. 范围对照总表

| 能力域 | 范围归属 | 落地率 |
|--------|---------|-------|
| Content 基础设施（模型/注册/索引/查询/构建/门禁） | ✅ 已落地 | 高 |
| 打字练习（4 模式） | ✅ 已落地 | 高 |
| 背单词（卡片 + 3 键调度） | ✅ 已落地 | 高 |
| SRS 复习（5 档艾宾浩斯） | ✅ 已落地 | 中高（不可配置） |
| 进度统计（热力图/弱项/错词） | ✅ 已落地 | 中 |
| i18n / 主题 / 音效 / TTS / PWA | ✅ 已落地 | 中高 |
| 内容类型体系 | 🔄 部分 | **2/12** |
| 内容体量 | 🔄 部分 | 自有 3.70%；CET4 覆盖 1.9% |
| 版权治理 | 🔄 部分 | 有 license 字段，无 rightsStatus / LICENSE 文件 |
| 移动端手势 | ✅ 已落地 | 中 |
| 自定义词库 | 🔄 部分 | 本地草稿，未进 Content 链 |
| 通用导入体系 | 📐 未落地 | 0 |
| 音视频 / 字幕 | 📐 未落地 | 0（`07-media/` 空） |
| 学习图谱 | 📐 未落地 | 0（仅类型） |
| 考试体系 | 📐 未落地 | 0（`08-exam/` 空） |
| 练习引擎族 | 📐 未落地 | 1/≥5 |
| AI Tutor | 📐 未落地 | 0 |
| 路由 / 深链 | 📐 未落地 | 0 |
| 用户账号 / 同步 | 📐 未落地 | 0 |
| CI 测试门禁 | 📐 未落地 | 0/6 |
| 监控 / 容灾 | 📐 未落地 | 0 |

---

## 一句话结论

产品范围呈现**明显两极化**：底层 Content 基础设施与"打字—背单词—复习—进度"四环闭环已落地且经全量回归验证（最新口径 2026-09-28：167 项 E2E / 163 content / 20 门禁），但诉求中的 English Learning Platform 所需六项核心能力——**音视频、字幕、学习图谱、通用导入、考试体系、练习引擎族**——全部为零实现，其中 `07-media/`、`08-exam/` 两个审计目录本身为空目录。
