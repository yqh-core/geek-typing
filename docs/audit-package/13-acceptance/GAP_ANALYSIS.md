# GAP_ANALYSIS.md · 缺口清单与优先级

> 状态：`【已有】` 事实 + `【主观】` 判断，逐条标注
> 依据：2026-09-27 全量实测 + 两份架构/内容调研

---

## 0. 一句话总结

> **地基（Content Platform）已经做得比大多数同类项目严谨；但上层（真实内容类型、
> 学习闭环、音视频字幕、导入体系、版权治理）几乎还是空的。**
> 真正的风险不是"架构不够好"，而是"**现在不改几个地方，加音视频/10 万词时会返工**"。

---

## 1. 五类缺口总览

| 类别 | 缺口数 | 严重度 | 是否阻止 P1 |
|---|---|---|---|
| **A. 会返工的架构债** | 5 | 🔴 高 | 是，必须先改 |
| **B. 测试覆盖虚高** | 5 | 🟠 中高 | 否，但应伴随 P1 |
| **C. 内容体量与品类** | 8 | 🟠 中高 | 否，是 P1 之后的主线 |
| **D. 能力完全缺失** | 7 | 🟡 中 | 否，是 P1+ 的目标 |
| **E. 工程与治理** | 8 | 🟡 中 | 否 |

---

## 2. A 类：会返工的架构债（🔴 必须先改）

### A-1 UI 直读词数组，绕过 Query 层 `【已有·实测】`

**事实**：`content-query.ts:4-5` 明确要求「UI 只能通过本层检索内容，不得直接持有词表数组做 filter」，但实际：

| 文件 | 行号 | 违规内容 |
|---|---|---|
| `src/App.tsx` | 13-21 | import `WORD_BANKS, allLoadedWords, bankWordsOf, ensureBankWords` |
| `src/App.tsx` | 127, 133, 150, 690, 722 | 直接操作 `WORD_BANKS` / `words` 数组 |
| `src/components/Memorize.tsx` | 54, 68, 96, 269 | 直接 `bank.words.find/map/length` |
| `src/components/ReviewPanel.tsx` | 4, 136 | import `allLoadedWords`，用 `analytics.words` |
| `src/components/Header.tsx` | 200 | `b.count ?? b.words.length` |
| `src/components/BankManager.tsx` | 10 处 | 直接读写 `words` |

**为什么必须现在改**：一旦接入音频/例句/字幕，UI 若继续自己遍历数组，就会出现"同一条内容在两处有不同字段"的分裂。契约已在注释里写明边界，但**未落地**。

**影响面**：17 处（与需求文档提到的"17 处"吻合）。

---

### A-2 `updated` 排序语义是假的 `【已有·实测】`

**事实**：`content-query.ts` 支持 `updated` 排序字段，但**它不是更新时间**，只是包内原始顺序。

**为什么必须现在改**：UI 一旦露出"最近更新"，用户会理解为"最近修改的单词"。这是**假功能欺诈**，与契约的诚实原则冲突。

**建议**（`【主观】`）：P1 先**不要在 UI 暴露** `updated`，只保留相关度 / A-Z；等真正有 `updatedAt` 再开放。

---

### A-3 `warmUpVocabulary()` 是硬编码名单，包一多就爆 `【已有·实测】`

**事实**：`src/core/content/registry.ts:139` 的 `warmUpVocabulary()` 内部硬编码 3 个包（ielts/kaoyan/toefl）。当前 gzip 合计 497.03 KiB / 600 KiB 预算，**余量仅 17.2%**。

**为什么必须现在改**：需求文档明确要加 GRE(12000)、Oxford(30000)、Cambridge(20000)、TOEFL 扩展等。每加一个包需手改 registry，且极易击穿预算 → **离线打不开**。

**建议**（`【主观】`）：改成预算型 warmup —— 按「当前包 → 最近使用包 → 其他包」优先级，在 `WARMUP_BUDGET` 内贪心预载，包清单由 manifest 自描述。

---

### A-4 Learning 记录用裸 `word` 做键，存在不可逆歧义 `【已有·实测】`

**事实**：
- 全库 9346 词中，**2323 个跨包同名词**（如 `abandon` 同时在 ielts/cet4）；
- **93 条词条含大写字母**（多为 go-code/ts-code/frontend 的真实代码行，如 `var wg sync.WaitGroup`；实测**不存在**仅大小写不同而其余相同的词形碰撞组）；
- 旧 Learning key 是裸 `word`，不是 `bankId + word`。

**为什么必须现在改**：用户"以前学过 abandon"在迁移后会指向不确定的包，**无法回答"为什么我在 IELTS 里找不到学过的 abandon"**。

**现状**：契约已承认此问题，定义了三态迁移（唯一命中/多包命中/orphan），但**迁移本身未实现**。

**建议**（`【主观】`）：P1 前先做 ① 迁移 dry-run ② Migration Audit Ledger（`resolved/ambiguous/orphan` 可查询）③ Learning 记录带 `contentId + contentVersion + checksum`。

---

### A-5 架构文档行号错误 + testid 同值重复（证据基座与测试选择器） `【已有·实测】`

**事实**：

| 项 | 内容 |
|---|---|
| **行号错误** | `FRONTEND_ARCHITECTURE.md`、`SYSTEM_ARCHITECTURE.md` 曾把 `TabId` 定义误记为第 52 行，**实测源码为 `App.tsx:44`**（`export type TabId = 'home' \| 'typing' \| 'memorize' \| 'review' \| 'progress'`）。本轮已订正 |
| **testid 重复** | `data-testid="open-bank-manager"` 在 `src/components/BankManager.tsx:78` 与 `src/components/Header.tsx:209` **同值重复** ⇒ 选择器歧义、测试脆弱（见 `KNOWN_ISSUES.md#DEBT-007`） |

**为什么归入 A 类（而非 E 类）**：A 类全部 4 条（A-1~A-4）的判断**都以「架构文档给出的行号/出处准确」为前提** —— 例如 A-1 的「17 处」、A-3 的 `registry.ts:139`、A-4 的 `content-query.ts` 出处。一条被引用为「事实」的行号本身是错的（`:52`），意味着**审计证据链存在未校验的引用**；而 testid 同值重复会使 E2E 断言在选择器层面**静默指向错误元素**，直接削弱 B 类「测试可信度」的结论。二者同属「**支撑其它结论的基座性缺陷**」，故与 A-1~A-4 并列，而非放入 E 类工程治理项。

**影响面**：
- 行号错误：所有转引该出处的外部文档/后续审计会继承错误定位（本轮已在资料包内全链订正）。
- testid 重复：`[data-testid="open-bank-manager"]` 命中 2 个元素，E2E 抓取可能不稳定或在渲染顺序变化时静默失效。

**修复建议**（`【主观】`）：① 对资料包内所有 `file:line` 出处做一次自动校验（脚本比对 `export`/`function` 定义行）；② 为两处 testid 分配语义不同值。

---

## 3. B 类：测试"数量多但覆盖不足"（🟠）

### B-1 没有单元测试，也没有测试框架 `【已有·实测】`

**事实**：
- 无 `tests/unit/`、无 `*.test.*`、无 `*.spec.*`；
- 无 vitest / jest / playwright.config / coverage 配置；
- 全部测试是**自建断言脚本**（`check()` / `ok()` + `process.exit`）。

**风险**：模块级回归只能靠 e2e 与契约测试间接保障；`src/lib/*` 的 12 个工具模块（sound/speech/theme/customBanks 等）**零直接测试**。

---

### B-2 无 fixture / invalid fixture `【已有·实测】`

**事实**：全仓搜索 `fixture` 无任何测试数据文件。

**风险**：validate 的 20 项规则里，"负例"（missing word / invalid phonetic / invalid wordId / broken relation / invalid subtitle）**无法自动化验证**——只能靠读代码相信它是对的。

---

### B-3 20 项内容门禁 + 3 项体积门禁未接入 CI `【已有·实测】`

**事实**：`deploy.yml` 只跑 `build`；`e2e.yml` 只跑 `build + e2e`。

**风险**：内容或体积击穿阈值时，**CI 不会拦截**，可以正常部署上线。

---

### B-4 `prod-smoke` 存在环境敏感 failure `【已有·实测】`

**事实**：本轮实测 21/22，A3 因"本地 dist 与线上不一致"失败。历史 summary 也记录过 flaky（代理/延迟导致 ERR_CONNECTION_CLOSED）。

**风险**：真实缺陷可能被 flaky 噪音掩盖（狼来了）。

---

### B-5 重复编号、命名混乱 `【已有·实测】`

**事实**：`e2e.mjs` 分区编号出现 **13/14 各两次**，12 排在最后；`content/README.md` 曾一处写「17 项门禁」、另一处写「20 项」（**本轮已修**：`:13` 与 `:362` 均订正为 20 项，`:13` 的「148 项」亦订正为实测值 149）。

**风险**：审计与维护时无法建立稳定的用例索引。

---

## 4. C 类：内容体量与品类（🟠）

| # | 缺口 | 实测事实 |
|---|---|---|
| C-1 | **词汇总量少** | 9346 词，其中 9000 词来自 3 个 ECDICT 词频包 |
| C-2 | **CET 覆盖率致命不足** | cet4 仅 **84 词**、cet6 仅 **69 词**。CET-4 考纲实际约 4500 词 —— **覆盖率约 1.9%** |
| C-3 | **字段贫瘠** | 全库只有 4 个 key：`word`/`translation`/`definition`/`phonetic`。**无** `partOfSpeech`/`example`/`audio`/`frequency`/`cefr`/`sense`/`collocation` |
| C-4 | **5 个包只有 word+translation** | ai-core/cloud-native/frontend/go-code/ts-code（phonetic 与 definition 覆盖均为 0）。注：**不是 7 个**——7 是"inline 包"的数量，别混用口径 |
| C-5 | **无音频/视频/字幕/课文** | 零文件。`content/assets/` **不存在** |
| C-6 | **无真考题库** | IELTS/TOEFL/CET 均只有词汇包，无听/说/读/写/真题 |
| C-7 | **9 条空 definition** | 见 `KNOWN_ISSUES.md#BUG-001`；根因是 `normalize.mjs` 空值检查不含该字段 |
| C-8 | **音标体系混用** | cet4 用 IPA、toefl 用 KK，无字段可判定体系 |
| C-9 | **三个考纲包同源** | `ielts`/`kaoyan`/`toefl` 各 3000、包内无重复，但 `ielts∩kaoyan = 1802`、`ielts∩toefl = 613`、`kaoyan∩toefl = 344`、三者交集 = 230 ⇒ **并集去重后仅 6471 个词形**。三包实为**同一 ECDICT 词库按 tag 过滤出的三个视图**；ielts∩kaoyan 重合 **60.1%**。见 `KNOWN_ISSUES.md#CONTENT-006` |
| C-10 | **cet4/cet6 词形完全不相交** | `cet4 ∩ cet6 = 0`（cet4 84 条 / cet6 69 条）—— 不合常理（CET-6 理论上含 CET-4），说明两包**独立采样**；且 `cet4` 前 5 条为**字母序**（`abandon`…`accelerate`），**非词频序**。见 `KNOWN_ISSUES.md#CONTENT-007` |

**结论**：需求文档提出的 Content Matrix（23 个大类）目前**只落地了 1 个**（词汇），且该类别本身覆盖也不足。

---

## 5. D 类：能力完全缺失（🟡）

| # | 能力 | 现状 |
|---|---|---|
| D-1 | **学习图谱（Learning Graph）** | 需求文档核心目标。当前 `relation.ts` 有模型但**不产出任何数据** |
| D-2 | **音视频播放 + 字幕同步** | 零实现（无播放器、无 SRT/VTT/LRC 解析） |
| D-3 | **通用内容导入** | 只支持 JSON 一种格式（还是脚本侧，非用户上传） |
| D-4 | **用户上传链路** | 只有 localStorage 自定义词库（纯文本粘贴/文件），无服务端、无校验 |
| D-5 | **URL 路由 / 深链** | 无路由库，URL 恒为 `/`，刷新回首页 |
| D-6 | **离线状态 UI** | SW 缓存可用，但**应用层零离线提示**（无 online/offline 事件监听） |
| D-7 | **错误边界** | 无 ErrorBoundary；词库加载失败仅 `console.warn`，用户无感知 |

---

## 6. E 类：工程与治理（🟡）

| # | 缺口 | 说明 |
|---|---|---|
| E-1 | **版权治理未建** | `sources[].license` 有 MIT 结构化，但无 `rightsStatus` 体系（owned/licensed/public-domain/restricted…） |
| E-2 | **来源字段不完整** | 15 个应有字段只有 5 个完整（覆盖率 33%）；缺 `sourceUrl`/`author`/`publisher`/`copyright`/`downloadDate` |
| E-3 | **无监控** | 无任何埋点/错误上报/性能监控（`analytics.ts` 是本地学习统计，不是监控） |
| E-4 | **无容灾** | 无备份策略、无 recover 流程；**无自有域名 ⇒ 无法 failover** |
| E-5 | **无障碍零测试** | 有少量 `aria`，但无 a11y 门禁 |
| E-6 | **无设计令牌体系** | 令牌实为 `theme.ts` 的 TS 常量；字号/间距/圆角全散落为 Tailwind 原子类 |
| E-7 | **无 LICENSE 文件** | 仓库根无 `LICENSE`、`package.json` 无 `license` 字段，而内容侧声明 5 包为 MIT —— 合规链条不闭环（成本极低） |
| E-8 | **无 CSP** | 4 条安全头已在，但 CSP 零命中。项目无内联脚本/无 CDN，具备上严格 CSP 的条件 |
| E-9 | **3 处"靠人工维持的合规"** | `translation` 全含汉字、`stats.phonetic`/`stats.definition` 与实测一致、音标无空串 —— 三项实测通过但**无门禁守护**，引入新数据源即破 |
| E-10 | **来源判定靠字符子串** | `validate.mjs:196` 用 `!origin.includes('curated')` 判外部来源；`origin` 是无约束自由文本，`"in-house"` 会误判、`"community-curated"` 会漏放 |
| E-11 | **焦点环被全局移除** | `src/index.css:36-39` 的 `*:focus { outline: none }` 注释前提「本项目无需输入框」已失效（`CommandPalette.tsx` 有输入框）⇒ **全应用级**键盘用户无法定位焦点，WCAG 2.4.7 失败。见 `KNOWN_ISSUES.md#UX-004` |
| E-12 | **ARIA 近乎为零** | 全仓 `aria-*` 属性仅 **10 处**、`role=` 仅 **1 处**；核心页签控件**零语义**（无 `role="tab"`/`tablist`/`aria-selected`）。见 `KNOWN_ISSUES.md#UX-005` |

**E-1/E-2 特别提示**：需求文档反复强调"绝对不能把 GitHub 素材直接塞进网站"。当前架构**兼容**这一要求（sources 已是结构化对象），但**字段不足以支撑合规判断**。

---

## 7. 建议的修复优先级

### 🔴 立即（P1 之前，否则返工）

| # | 事项 | 成本 |
|---|---|---|
| 1 | Learning 迁移 dry-run + Audit Ledger | 中 |
| 2 | `warmUpVocabulary()` 预算化 | 低 |
| 3 | 定义 `LearningBindingStatus`（bound/ambiguous/orphan） | 低 |
| 4 | 清掉静默 `translation: ''` fallback（新增门禁 I-21） | 低 |
| 5 | 20 项门禁 + 体积门禁接入 CI | 低 |

### 🟠 P1 第一批

| # | 事项 |
|---|---|
| 6 | `hasFeature()` 接线（替换 `gt.mode === 'code'` 硬编码） |
| 7 | UI 17 处直读词数组 → 棘轮下降（先 App/Review/Memorize） |
| 8 | 补 `tests/unit/` + fixture，覆盖 `src/lib/*` |
| 9 | 补 `updated` 排序 UI 语义降级（先不暴露） |

### 🟡 P2（P1 产品化之后）

音视频 + 字幕、通用导入流水线、学习图谱、版权治理体系、监控与容灾、a11y。

---

## 8. 与需求文档的逐节对照

| 需求文档章节 | 我方状态 | 本包对应文件 |
|---|---|---|
| 一、目标升级为 English Learning Platform | 认同，但当前仅 Content 层 | `00-project/PRODUCT_SCOPE.md` |
| 二、要"测试体系+结果+代码+样本" | 已给 | `09-testing/*`、`content-samples/*` |
| 三、GitHub 素材参考 5 项目 | **未调研** | `01-product/COMPETITOR_ANALYSIS.md`（标待建） |
| 四、Content Provenance/License | 部分已有 | `04-content/CONTENT_PROVENANCE.md` |
| 五、素材导入做核心能力 | 未做 | `05-import/*` |
| 六、标准化内容类型 | 仅 vocabulary | `04-content/CONTENT_TYPES.md` |
| 七、视频学习差异化 | 零实现 | `07-media/*` |
| 八、Content Matrix 23 类 | 落地 1 类 | `08-exam/*` |
| 九、Test Matrix T1~T12 | 部分实现 | `09-testing/TEST_MATRIX.md` |
| 十、要 11 项资料 | 本轮全部给出 | 本包全部 |
| 十一、P1 不应绑死 | 认同 | `01-product/PRODUCT_ROADMAP.md` |
| 二十六、版权 | 部分 | `11-legal/*` |
| 三十一、分 8 阶段 | 已按此组织 | 本包目录 |
| 三十二、第一批 10 项 | **全部给出** | 见 `README.md#2` |

**未满足项**：§三（GitHub 竞品调研）未做 —— 这是一个独立的调研任务，本包只留了骨架。
