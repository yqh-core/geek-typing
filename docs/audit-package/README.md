# Geek Typing 全量审计资料包 · INDEX

> 生成日期：2026-09-27
> 对应基线 commit：`4152eb2`（V4.1-P0.6.1 收口 + 测试门禁硬化）
> 仓库根目录：`geek-typing/`
> 本资料包位置：`docs/audit-package/`
> **规模**：84 份文档 / 25,562 行 / 17 张实拍截图 / 6 份内容样本 / 6 个可复跑脚本（含 `_generated/verify-samples.mjs`）
>
> **先读这个** → [`13-acceptance/TOTAL_AUDIT_REPORT.md`](13-acceptance/TOTAL_AUDIT_REPORT.md)（全量审计总报告，30 秒 TL;DR + 高危缺陷 + 行动顺序）

---

## 0. 这份资料包是什么

这是对需求文档《最新要求.docx》第 32 节「第一批 10 项真实性资料」及其 32 节完整清单的**逐项应答**。

**核心规则（贯穿全包）**：

1. **只写实测事实，不写推测**。所有数字都来自本机实跑，附命令与原始输出。
2. **区分两种状态**，每个文档顶部都有标注：
   - `【已有】` = 项目当前真实存在的实现/数据，内容可直接采信；
   - `【待建】` = 项目当前**不存在**的能力，仅给出规划与缺口，**不得当作已完成**。
3. **不美化缺口**。凡是"数量多但覆盖不足""架构严谨但产品未展开"的地方，明确写出来。

---

## 1. 目录结构与交付状态总表

| 目录 | 内容 | 状态 | 说明 |
|---|---|---|---|
| **`README.md`** | 本文件（导航 + 状态总表） | — | — |
| **`13-acceptance/TOTAL_AUDIT_REPORT.md`** | **全量审计总报告（顶层交付物）** | ✅ 已有 | 建议先读 |
| **`00-project/`** | 项目概览、愿景、范围、需求、术语 | 见下 | — |
| **`01-product/`** | 人物画像、用户旅程、信息架构、功能矩阵、路线图、竞品 | 见下 | — |
| **`02-ui-ux/`** | 设计系统、页面规格、导航、响应式、无障碍、交互 | 见下 | — |
| **`03-architecture/`** | 系统/前端/内容/学习/数据/集成架构 | 见下 | — |
| **`04-content/`** | Content Contract、类型、Schema、关系、版本、来源、许可 | 见下 | — |
| **`05-import/`** | 导入规格、流水线、格式、校验、去重、错误处理 | 见下 | — |
| **`06-learning/`** | 学习引擎、SRS、掌握度、复习、练习、学习图谱 | 见下 | — |
| **`07-media/`** | 音频、视频、字幕、转写、媒体流水线 | 见下 | — |
| **`08-exam/`** | IELTS/TOEFL/CET/考研/GRE/NCE | 见下 | — |
| **`09-testing/`** | 测试策略、测试矩阵、E2E、内容/导入/媒体/性能/安全/无障碍测试 | 见下 | — |
| **`10-security/`** | 安全、威胁模型、上传安全、隐私 | 见下 | — |
| **`11-legal/`** | 许可政策、版权、署名、内容风险 | 见下 | — |
| **`12-infrastructure/`** | 构建、部署、离线、性能、监控、容灾 | 见下 | — |
| **`13-acceptance/`** | 发布清单、生产清单、最终验收、Known Issues、技术债 | 见下 | — |
| **`screenshots/`** | 17 张真实页面截图（desktop 5 / tablet 3 / mobile 3 / states 6） | `【已有】` | 无头 Chrome 153 CDP 实抓，含结算浮层/离线/空态 |
| **`content-samples/`** | 内容真实样本与统计（字段覆盖率、体积报告） | `【已有】` | 76 项断言独立复核通过 |
| **`_generated/`** | 可复现证据：文件清单、行数统计、提取与复核脚本 | `【已有】` | 全部可重跑 |

---

## 2. 每一个交付物的状态（逐文件）

图例：`✅ 已有` = 有真实实现，文档记录事实；`📐 待建` = 项目尚无此能力，文档写规划与缺口；`🔄 混合` = 部分真实 + 部分规划，文档内分节标注。

### 00-project
| 文件 | 状态 | 依据 |
|---|---|---|
| `PROJECT_OVERVIEW.md` | ✅ 已有 | README + package.json + 目录树 |
| `PRODUCT_VISION.md` | 📐 待建 | 用户仅在《最新要求》中口述方向，无正式 PRD |
| `PRODUCT_SCOPE.md` | 🔄 混合 | Content 层范围真实；音视频/考试等为规划 |
| `REQUIREMENTS.md` | 🔄 混合 | 已实现需求可考；未来需求来自需求文档 |
| `GLOSSARY.md` | ✅ 已有 | 术语取自 CONTENT_CONTRACT 真实定义 |

### 01-product
| 文件 | 状态 | 依据 |
|---|---|---|
| `USER_PERSONAS.md` | 📐 待建 | 项目无用户调研数据 |
| `USER_JOURNEYS.md` | 🔄 混合 | 现有 5 页签流程真实；学习闭环为规划 |
| `INFORMATION_ARCHITECTURE.md` | ✅ 已有 | 5 页签 + 2 浮层，实测自 App.tsx |
| `FEATURE_MATRIX.md` | 🔄 混合 | 已实现功能逐项标注；未实现列缺口 |
| `PRODUCT_ROADMAP.md` | 🔄 混合 | P0~P0.6.1 已完成可考；P1+ 来自需求文档 |
| `COMPETITOR_ANALYSIS.md` | 📐 待建 | 需求文档提及 5 个参考项目，未做正式调研 |

### 02-ui-ux
| 文件 | 状态 | 依据 |
|---|---|---|
| `DESIGN_SYSTEM.md` | 🔄 混合 | 三套主题令牌真实；组件库/Design Tokens 未建立 |
| `PAGE_SPEC.md` | ✅ 已有 | 逐页规格实测自源码 + testid |
| `NAVIGATION.md` | ✅ 已有 | 无路由单页切换，已确认 |
| `RESPONSIVE.md` | 🔄 混合 | 有截图证据；断点无系统定义 |
| `ACCESSIBILITY.md` | 🔄 混合 | 有部分语义；无 a11y 测试，缺口明确 |
| `INTERACTION_SPEC.md` | ✅ 已有 | 键盘/手势交互实测自 e2e 用例 |

### 03-architecture（**本包最核心**）
| 文件 | 状态 | 依据 |
|---|---|---|
| `SYSTEM_ARCHITECTURE.md` | ✅ 已有 | 分层真实，含 UI 边界泄漏如实记录 |
| `FRONTEND_ARCHITECTURE.md` | ✅ 已有 | React 19 + Vite 8，无路由 |
| `CONTENT_ARCHITECTURE.md` | ✅ 已有 | Registry→Catalog→Index→Query 全链 |
| `LEARNING_ARCHITECTURE.md` | 🔄 混合 | SRS 真实在 reviewStore；ContentId 迁移未做 |
| `DATA_ARCHITECTURE.md` | ✅ 已有 | 14 个 localStorage key 全清点 |
| `INTEGRATION_ARCHITECTURE.md` | 🔄 混合 | 现有集成真实；媒体域为规划 |

### 04-content
| 文件 | 状态 | 依据 |
|---|---|---|
| `CONTENT_CONTRACT.md` | ✅ 已有 | 45 KiB 契约原文（根目录），本包提供导读 |
| `CONTENT_TYPES.md` | 🔄 混合 | 当前仅 vocabulary 落地；其余为 PLANNED_TYPES 槽位 |
| `CONTENT_SCHEMA.md` | ✅ 已有 | schemaVersion=4，字段真实 |
| `CONTENT_RELATION.md` | 🔄 混合 | relation.ts 有模型无数据 |
| `CONTENT_VERSIONING.md` | ✅ 已有 | 版本三元组 + contentHistory 真实 |
| `CONTENT_PROVENANCE.md` | 🔄 混合 | sources[] 已有；字段不完整 |
| `CONTENT_LICENSE.md` | 🔄 混合 | MIT 结构化已落地；rightsStatus 体系未建 |

### 05-import
| 文件 | 状态 | 依据 |
|---|---|---|
| `IMPORT_SPEC.md` | 🔄 混合 | JSON 链路真实；其它格式未支持 |
| `IMPORT_PIPELINE.md` | ✅ 已有 | Raw→Normalize→Validate→Canonical→Build 真实 |
| `IMPORT_FORMATS.md` | 🔄 混合 | 支持矩阵如实填写 |
| `IMPORT_VALIDATION.md` | ✅ 已有 | 20 项门禁逐条真实 |
| `DEDUPLICATION.md` | ✅ 已有 | 分级去重逻辑真实 |
| `ERROR_HANDLING.md` | 🔄 混合 | 内容脚本有；上传链路未建 |

### 06-learning
| 文件 | 状态 | 依据 |
|---|---|---|
| `LEARNING_ENGINE.md` | 🔄 混合 | 现有引擎真实，规模有限 |
| `SRS.md` | ✅ 已有 | 艾宾浩斯 5 档真实 |
| `MASTERY.md` | ✅ 已有 | 四级掌握度派生真实 |
| `REVIEW.md` | ✅ 已有 | 错题本 + 抖动 + 熔断真实 |
| `PRACTICE.md` | ✅ 已有 | 4 种练习模式真实 |
| **`MIGRATION_AUDIT.md`** | 🆕 **本轮新增（实测）** | **Learning 键迁移审计**：全库 6713 词中 **4390 resolved / 2323 ambiguous（34.6%）**，`ambiguous` 无法从裸 word 反推包 —— P0.7 收口第 1-3 项的前置证据。数据可重跑：`node scripts/migration-audit.mjs` |
| `LEARNING_GRAPH.md` | 📐 待建 | 需求文档核心目标，当前无任何实现 |

### 07-media
| 文件 | 状态 | 依据 |
|---|---|---|
| `AUDIO.md` | 📐 待建 | 仅 Web Audio 音效 + Web Speech 发音，无音频内容体系 |
| `VIDEO.md` | 📐 待建 | 零实现 |
| `SUBTITLE.md` | 📐 待建 | 零实现 |
| `TRANSCRIPT.md` | 📐 待建 | 零实现 |
| `MEDIA_PIPELINE.md` | 📐 待建 | 零实现 |

### 08-exam
| 文件 | 状态 | 依据 |
|---|---|---|
| `IELTS.md` | 🔄 混合 | 词汇包真实（3000 词）；听说读写无实现 |
| `TOEFL.md` | 🔄 混合 | 同上 |
| `CET.md` | 🔄 混合 | cet4/cet6 包真实（84/69 词），**词数远不足考纲** |
| `KAoyan.md` | 🔄 混合 | 3000 词包真实 |
| `GRE.md` | 📐 待建 | 零实现 |
| `NCE.md` | 📐 待建 | 零实现 |

### 09-testing
| 文件 | 状态 | 依据 |
|---|---|---|
| `TEST_STRATEGY.md` | ✅ 已有 | 自建断言框架 + 三层门禁 |
| `TEST_MATRIX.md` | 🔄 混合 | T1~T12 矩阵，已实现标 `✅`，未实现标 `📐` |
| `E2E.md` | ✅ 已有 | 167 项真实 |
| `CONTENT_TEST.md` | ✅ 已有 | 149 断言 + 20 门禁 |
| `IMPORT_TEST.md` | 📐 待建 | 无 fixture，无导入测试 |
| `MEDIA_TEST.md` | 📐 待建 | 零实现 |
| `PERFORMANCE_TEST.md` | 🔄 混合 | bundle 门禁真实；无 Lighthouse/压测 |
| `SECURITY_TEST.md` | 📐 待建 | 零实现 |
| `ACCESSIBILITY_TEST.md` | 📐 待建 | 零实现 |

### 10-security / 11-legal
| 文件 | 状态 | 依据 |
|---|---|---|
| `10-security/*` | 📐 待建 | 纯静态站，无上传/无后端，攻击面小但无正式模型 |
| `11-legal/*` | 🔄 混合 | MIT 许可元数据真实；版权治理体系未建 |

### 12-infrastructure
| 文件 | 状态 | 依据 |
|---|---|---|
| `BUILD.md` | ✅ 已有 | Vite 8 + tsc，1939 模块，耗时受宿主影响不设基线 |
| `DEPLOYMENT.md` | ✅ 已有 | Cloudflare Pages + GitHub Actions |
| `OFFLINE.md` | ✅ 已有 | SW 双策略 + 4 态审计（含 BUG-002 缓存投毒分析） |
| `PERFORMANCE.md` | ✅ 已有 | 主 chunk 381 KiB/118.89 KiB gzip 实测 |
| `MONITORING.md` | 📐 待建 | 无任何监控 |
| `DISASTER_RECOVERY.md` | 📐 待建 | 无 |

### 13-acceptance
| 文件 | 状态 | 依据 |
|---|---|---|
| `TOTAL_AUDIT_REPORT.md` | ✅ 已有 | **总审计报告（顶层交付物，建议先读）** |
| `RELEASE_CHECKLIST.md` | ✅ 已有 | 依据 package.json 全量脚本，判定「有条件发布」 |
| `PRODUCTION_CHECKLIST.md` | 🔄 混合 | prod-smoke 22 项真实；8 组生产检查项 |
| `FINAL_ACCEPTANCE.md` | ✅ 已有 | 10 项门禁实测总表 |
| `KNOWN_ISSUES.md` | ✅ 已有 | 含本轮新发现的真实缺陷（含 BUG-002 高危） |
| `GAP_ANALYSIS.md` | ✅ 已有 | **对方最需要的缺口清单** |

---

## 3. 一句话结论

> **Content 基础设施（P0~P0.6.1）已冻结且经全量回归验证；但"英语学习平台"所需的
> 音视频、字幕、学习图谱、导入体系、内容体量、版权治理**全部尚未开始**。
> 当前 9346 词中 9000 词来自 3 个 ECDICT 词频包，**词汇覆盖远不足以支撑考试产品**。
> 本轮审计发现的 **1 个高危缺陷（SW 缓存投毒致白屏）已修复并加了回归测试**，
> 但**线上仍是旧版，必须部署才生效**（见 `13-acceptance/KNOWN_ISSUES.md#BUG-002`）。

---

## 3.1 本轮审计最重的 5 条结论（先读这个）

| # | 结论 | 性质 | 状态 / 详见 |
|---|---|---|---|
| **1** | **SW 会把 SPA fallback 的 HTML 缓存成 JS ⇒ `/assets/*` 永久投毒白屏**，线上漂移 hash 已实测存在 | 🔴 生产活体缺陷 | ✅ **已修 + 回归测试**，⏳ 待部署 → `KNOWN_ISSUES.md#BUG-002` |
| **2** | **三个"考纲包"（ielts/kaoyan/toefl）实为同一 ECDICT 词库的 tag 视图**：ielts∩kaoyan=1802（60.1%）、并集仅 6471 词形 | 🔴 内容可信度 | ⏳ 待处理 → `08-exam/*`、`KNOWN_ISSUES.md#CONTENT-006` |
| **3** | **CET 四六级词形完全不相交**（cet4∩cet6=0），按字母序非词频序，词量仅 84/69 vs 考纲 4500/5500 | 🔴 内容可信度 | ⏳ 待处理 → `KNOWN_ISSUES.md#CONTENT-007` |
| **4** | **全应用焦点环被 `*:focus{outline:none}` 移除**，而命令面板有输入框 —— 注释前提已失效 | 🔴 无障碍 | ⏳ 待处理 → `KNOWN_ISSUES.md#UX-004` |
| **5** | **20 项内容门禁 + 3 项体积门禁均未接入 CI**，击穿阈值仍可正常部署 | 🟠 工程治理 | ⏳ 待处理 → `GAP_ANALYSIS.md#B-3` |

---

## 4. 如何验证本资料包

```bash
# 1. 内容门禁（20 项）
npm run content:validate

# 2. 内容契约测试（149 项）
npm run test:content

# 3. 端到端测试（167 项）
node tests/preview-server.mjs start   # 或 npm run preview 另开终端
npm run test:e2e

# 4. 离线套件
npm run test:offline

# 5. 体积门禁（3 项，需先 build）
npm run build && npm run check:bundle

# 6. 重新抓取截图（自带 preview 生命周期）
node scripts/audit-capture.mjs

# 7. 复核内容样本数字
node docs/audit-package/_generated/verify-samples.mjs
```

各命令在 2026-09-27 基线 `4152eb2` 上的实测结果见 `13-acceptance/FINAL_ACCEPTANCE.md`。
