# 项目总览（PROJECT OVERVIEW）

> 状态：✅ 已有（实测）
> 基线 commit：`4152eb2`｜实测日期：2026-09-27
> 本文只描述**已存在于仓库中的实现**，不描述规划。规划内容见同目录 `PRODUCT_VISION.md`、`PRODUCT_SCOPE.md`。

---

## 1. 这是什么

`geek-typing` 是一个**打字背单词 Web 应用**：用户在一个打字面板中逐字母敲出目标单词/代码行，敲错即纠正，敲完进入下一词；同一批词可在另一个页签里做卡片式背记，并按艾宾浩斯间隔进入复习队列。

**它不是**一个完整的英语学习平台。仓库内**没有**音视频、字幕、听力、口语评测、语法课程、阅读材料、考试模考、AI 对话等任何模块（详见 `PRODUCT_SCOPE.md` 未落地范围表）。

### 1.1 一句话定位（可核查）

| 维度 | 实测结论 | 证据 |
|------|---------|------|
| 已建成的能力 | **Content 基础设施**（内容建模/构建/校验/查询全链路）+ **打字—背单词—复习—进度** 四环学习闭环 | `src/lib/content-*.ts`、`src/core/content/**`、`src/lib/reviewStore.ts`、`src/lib/memorizeStore.ts` |
| 内容体量 | 10 个词库包、**9,346 个词条** | `docs/audit-package/content-samples/MANIFESTS.md`；`content/vocabulary/*/manifest.json` 的 `stats.items` |
| 内容类型落地率 | 12 种 `ContentType` 中**只有 2 种有数据**（`vocabulary`、`word`） | `src/core/content/model/content.ts:34-46`；`src/core/content/registry.ts:58-69` |
| 用户规模 / 运营数据 | **未能验证**（仓库内无任何分析上报、无后端、无数据库） | 全仓 grep 无 fetch 上报端点；`package.json` 无后端依赖 |
| 部署形态 | 纯静态站点，Cloudflare Pages | `wrangler.jsonc`、`.github/workflows/deploy.yml` |

**结论一句话**：当前交付物是一个**单机、纯前端、离线可用的打字背单词工具**，其底层内容治理链（Content 链）完成度显著高于其产品功能面。

---

## 2. 技术栈

来源：`package.json`（47 行，实测完整读取）。

### 2.1 运行时依赖

| 包 | 版本 | 用途 |
|----|------|------|
| `react` | `^19.2.8` | UI 框架 |
| `react-dom` | `^19.2.8` | DOM 渲染 |
| `lucide-react` | `^1.48.0` | 图标 |
| `canvas-confetti` | `^1.9.4` | 结算彩带 |

**只有 4 个运行时依赖。** 无路由库、无状态管理库、无 UI 组件库、无 i18n 库、无请求库、无日期库。

### 2.2 开发依赖

| 包 | 版本 | 用途 |
|----|------|------|
| `vite` | `^8.3.0` | 构建 |
| `typescript` | `~6.0.2` | 类型 |
| `@vitejs/plugin-react` | `^6.1.1` | React 插件 |
| `tailwindcss` | `^3.4.17` | 原子 CSS |
| `postcss` | `^8.5.28` | CSS 处理 |
| `autoprefixer` | `^10.6.1` | 前缀 |
| `oxlint` | `^1.81.0` | Lint（替代 ESLint） |
| `playwright-core` | `^1.63.0` | E2E 驱动（直连本机 Chrome，非 `@playwright/test`） |

### 2.3 关键架构选择（均为实测，非宣称）

| 选择 | 实测事实 | 证据 |
|------|---------|------|
| **无路由** | 页签为 `useState`，URL 恒为 `/` | `src/App.tsx:83`；见 `02-ui-ux/NAVIGATION.md` |
| **无状态管理库** | `App.tsx` 单文件 817 行，内含 25 个 `useState` | `docs/audit-package/_generated/line-counts.txt`；`src/App.tsx:83-113` |
| **无后端** | 无网络请求层，无 API 客户端 | 纯静态产物，`wrangler.jsonc` 只配 `assets` |
| **持久化只用 localStorage** | 14 个 key，零 IndexedDB | `docs/audit-package/03-architecture/DATA_ARCHITECTURE.md` §2 |
| **i18n 自研** | `LangProvider` + `useT()`，zh/en 各 185 条 | `src/i18n/index.tsx`（70 行）、`src/i18n/zh.ts`（232 行）、`src/i18n/en.ts`（231 行） |
| **主题用 TS 常量而非 CSS 变量** | `THEMES` 对象 3 套 × 11 语义槽 | `src/lib/theme.ts`（81 行） |
| **音效用 Web Audio 实时合成** | 3 套主题 `mech`/`thock`/`8bit`，无音频文件 | `src/lib/sound.ts`（204 行） |
| **发音用 Web Speech API** | 浏览器原生 TTS，无音频资源 | `src/lib/speech.ts`（82 行） |

---

## 3. 代码体量（实测）

来源：`docs/audit-package/_generated/line-counts.txt`（73 行，由 `wc -l` 生成）。

### 3.1 总量

| 目录 | 行数 | 文件数 | 说明 |
|------|------|-------|------|
| `src/` | **6,823** | 44 | 应用源码 |
| `scripts/` | **2,251** | 13 | 内容构建/校验/审计脚本 |
| `tests/` | **2,642** | 6 | E2E + content + offline + smoke |
| `src/components/` | 2,552 | 14 | UI 组件 |
| 合计（三者） | **11,716** | 63 | — |

**受版本控制文件总数：125**（口径：含 `docs/audit-package/**` 与 `scripts/audit-capture.mjs`）。
证据：`docs/audit-package/_generated/files.txt` 恰为 125 行。
（注：`git ls-files | wc -l` 在基线时点为 111，差额来自尚未 `git add` 的审计包文档与截图脚本。）

### 3.2 最大的单个文件（前 12）

| 文件 | 行数 | 备注 |
|------|------|------|
| `src/App.tsx` | **817** | 应用主控；25 个 `useState`、全局键盘监听、9 个派生 `useMemo` |
| `tests/e2e.mjs` | **1702** | 单文件 E2E，167 个断言用例 |
| `src/components/Memorize.tsx` | 449 | 背单词卡片；含原生 touch 手势 |
| `scripts/content/validate.mjs` | 427 | 内容门禁，20 项检查 |
| `src/components/CommandPalette.tsx` | 404 | 命令面板，14 条命令 |
| `src/lib/content-query.ts` | 385 | Query 层四入口 |
| `src/components/Header.tsx` | 363 | 顶部栏（含下拉、主题、语言、音效） |
| `scripts/content/check-bundle.mjs` | 250 | 体积门禁 |
| `scripts/content/build.mjs` | 214 | 内容构建 |
| `src/components/PracticePanel.tsx` | 240 | 打字主面板 |
| `src/i18n/zh.ts` | 232 | 中文词条 185 条 |
| `src/core/content/indexer/content-index.ts` | 231 | Index 层，四张 Map |

### 3.3 依赖与工程配置

| 文件 | 行数 | 内容 |
|------|------|------|
| `package.json` | 47 | 17 条 scripts；`private: true`；`version: 0.0.0` |
| `tailwind.config.js` | 40 | **仅**扩展 `fontFamily.mono` + 4 keyframes + 4 animations；`plugins: []` |
| `src/index.css` | 39 | `@tailwind` 三条 + 硬编码 body 底色 + 极简滚动条 + `*:focus{outline:none}` |
| `vite.config.ts` / `tsconfig*.json` / `postcss.config.js` / `wrangler.jsonc` | — | 标准配置 |

---

## 4. 运行入口与脚本

`package.json` 共 **17 条 scripts**（实测全量）：

| script | 命令 | 作用 |
|--------|------|------|
| `dev` | `vite` | 开发服务器 |
| `build` | `tsc -b && vite build` | **先类型检查再构建** |
| `lint` | `oxlint` | Lint |
| `preview` | `vite preview --host 127.0.0.1 --port 4173 --strictPort` | 预览，固定端口 |
| `test:e2e` | `node tests/e2e.mjs` | 167 项 |
| `test:content` | `node tests/content-query.mjs` | 149 例 |
| `test:offline` | `node tests/offline-audit.mjs` | 20 例 |
| `test:prod` | `node tests/prod-smoke.mjs` | 22 例 |
| `test:e2e:prod` | 组合 | 对产物跑 E2E |
| `test:smoke` | 同上 | 冒烟 |
| `stress:review` | `node scripts/stress-review.mjs` | SRS 压力 |
| `icons` | `node scripts/gen-icons.mjs` | 生成图标 |
| `content:validate` | `node scripts/content/validate.mjs` | 20 项门禁 |
| `content:check` | `node scripts/content/check-bundle.mjs` | 3 项体积门禁 |
| `content:build` | `node scripts/content/build.mjs` | 构建 catalog+index |
| `content:normalize` | `node scripts/content/normalize.mjs` | 归一化 |
| `content:list` | `node scripts/content/list.mjs` | 列出内容 |

---

## 5. 部署与访问

| 项 | 实测值 | 证据 |
|----|-------|------|
| 托管 | Cloudflare Pages | `.github/workflows/deploy.yml` |
| 访问地址 | `https://geek-typing.pages.dev` | `README.md`（`docs/audit-package/README.md` 引用） |
| 构建命令 | `npm run build` | `deploy.yml` |
| 输出目录 | `dist/` | `vite.config.ts` |
| 缓存策略文件 | `public/_headers` | `public/_headers`（实测存在） |
| Service Worker | `public/sw.js`（178 行），缓存名 `gt-shell-v3` | `docs/audit-package/12-infrastructure/OFFLINE.md` |
| 站点地图 / 爬虫 | `public/sitemap.xml`、`public/robots.txt` | `docs/audit-package/_generated/files.txt` |
| 无 staging 环境 | 只有 1 个 Pages 项目 | `docs/audit-package/12-infrastructure/DEPLOYMENT.md` §5 |

---

## 6. 内容资产（最高价值的既有资产）

### 6.1 词库包总表

来源：`docs/audit-package/content-samples/MANIFESTS.md`（67 行）与 `SIZE-REPORT.md`（66 行）。

| 包 | 词条 | 加载方式 | license(SPDX) | `contentRevision` |
|----|-----|---------|--------------|-------------------|
| `ai-core` | 43 | inline | ECIDCT(MIT) | rev1 |
| `cet4` | 84 | inline | ECIDCT(MIT) | rev1 |
| `cet6` | 69 | inline | ECIDCT(MIT) | rev1 |
| `cloud-native` | 30 | inline | Proprietary | rev1 |
| `frontend` | 20 | inline | Proprietary | rev1 |
| `go-code` | 50 | inline | Proprietary | rev1 |
| `ts-code` | 50 | inline | Proprietary | rev1 |
| `ielts` | 3,000 | **lazy** | ECIDCT(MIT) | **rev2** |
| `kaoyan` | 3,000 | **lazy** | ECIDCT(MIT) | **rev2** |
| `toefl` | 3,000 | **lazy** | ECIDCT(MIT) | **rev2** |
| **合计** | **9,346** | 7 inline + 3 lazy | MIT 5 包 / Proprietary 5 包 | — |

### 6.2 体积

| 项 | 数值 |
|----|------|
| inline 7 包词条 | 346 词 |
| lazy 3 包词条 | 9,000 词 |
| inline 包字数占词条比例 | 3.70% |
| inline 包体积占总体积比例 | 2.51% |
| manifest 合计 | 13,391 B（13.08 KiB） |
| words.json 合计 | 1,477,598 B（1,442.97 KiB） |

**关键事实**：9,346 词中 **9,000 词（96.3%）来自 3 个 ECDICT 词频包**（ielts/kaoyan/toefl）；自有整理内容仅 346 词。

### 6.3 内容治理保障

| 项 | 实测值 |
|----|-------|
| `ContentId` 格式 | `content:<type>:<namespace>:<localId>`，4 段式（`src/core/content/model/content.ts:58-67`） |
| 内容校验门禁 | **20 项**（`scripts/content/validate.mjs`，427 行） |
| 体积门禁 | 3 项（`scripts/content/check-bundle.mjs`） |
| Content 单测 | **149/149 PASS**（`tests/content-query.mjs`，543 行） |
| 冻结条款 | **6 条** C-1~C-6（见 `03-architecture/CONTENT_ARCHITECTURE.md`） |

---

## 7. 构建产物（实测）

来源：`docs/audit-package/13-acceptance/FINAL_ACCEPTANCE.md`。

| 产物 | 大小 | 阈值 |
|------|------|------|
| 主 chunk `index-*.js` | 381.06 KiB raw / 118.89 KiB gzip | 420 / 135 KiB |
| lazy `words-*.js` ×3 | toefl / ielts / kaoyan | 各独立 chunk |
| 预热预算 | 497.03 KiB gzip | 600 KiB |
| 构建耗时 | 不设基线（宿主抖动，非门禁） | — |
| TypeScript | **0 error** | `tsc -b` |
| oxlint | 0 error / 16 warning | — |

---

## 8. 质量门禁现状（实测）

来源：`docs/audit-package/13-acceptance/FINAL_ACCEPTANCE.md`（238 行）。

| 门禁 | 结果 |
|------|------|
| `content:validate` | PASS |
| `test:content` | 149/149 |
| `tsc -b` | 0 error |
| `lint` | 0 error / 16 warning |
| `build` | exit 0（耗时浮动） |
| `check:bundle` | 3/3 |
| `test:e2e` | 167/167 |
| `test:offline` | 20/20 |
| `test:prod`（smoke） | **21/22**（1 条因 bundle hash 漂移） |
| 截图 | 17 张 |

### 8.1 门禁未进 CI（重要缺口）

| 门禁 | 是否在 CI |
|------|----------|
| `npm run build` | ✅（`deploy.yml` + `e2e.yml`） |
| `test:e2e` | ✅ **仅 PR 触发**（`e2e.yml`） |
| `content:validate`（20 项） | ❌ |
| `check:bundle`（3 项） | ❌ |
| `test:content`（149 例） | ❌ |
| `test:offline`（20 例） | ❌ |
| `test:prod`（22 例） | ❌ |
| `lint` | ❌ |

即：**20 + 3 + 149 + 4 + 22 + lint 全部只在本地跑**。生产部署（`deploy.yml`）不做任何测试即上线。证据：`docs/audit-package/13-acceptance/GAP_ANALYSIS.md` B-3 / DEBT-002。

---

## 9. 已识别的架构债（摘要）

完整表见 `docs/audit-package/13-acceptance/GAP_ANALYSIS.md`。此处仅列影响定位判断的四条：

| 编号 | 事实 | 证据 |
|------|------|------|
| A-1 | UI 绕过 Query 层直读词数组，**17 处** | `GAP_ANALYSIS.md` A-1 逐行号表 |
| A-2 | 排序键 `updated` 为假排序（所有条目同值） | `src/lib/content-query.ts`；`GAP_ANALYSIS.md` A-2 |
| A-3 | `warmUpVocabulary()` 硬编码 3 个包名 | `src/core/content/registry.ts:139` |
| A-4 | 学习记录以**裸 `word`** 为键，非 `contentId`；跨包同名词 **2,323 个** | `docs/audit-package/03-architecture/DATA_ARCHITECTURE.md`；`CONTENT_ARCHITECTURE.md` |

---

## 10. 本文未能验证的内容

| 项 | 原因 |
|----|------|
| 根目录 `README.md` 正文 | 该文件在本环境下读取为二进制乱码（疑似加密残留），**内容未能验证**。本文所有涉及 README 的引用均改引 `docs/audit-package/README.md` |
| 线上真实用户量 / 访问量 | 仓库内无分析代码、无后端，**未能验证** |
| 《最新要求.docx》原文 | 该文件**不在仓库内**（`find . -iname "*.docx"` 零命中），相关需求只能从 `GAP_ANALYSIS.md#8` 等二手转述获得 |
| 生产环境实际表现 | 无监控、无日志采集（见 `12-infrastructure/MONITORING.md`） |

---

## 一句话结论

`geek-typing` 当前是一个**纯前端、离线可用、无用户系统与无后端**的打字背单词工具，拥有 9,346 词的内容资产和一套完成度较高、经 20 项门禁与 149 例单测保护的内容治理链（Content 链）；但它**不是需求文档所述的 English Learning Platform** —— 音视频、字幕、学习图谱、通用导入、内容体量、版权治理、CI 门禁六项均未开始或严重不足。
