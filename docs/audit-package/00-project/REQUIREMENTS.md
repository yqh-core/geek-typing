# 需求清单（REQUIREMENTS）

> 状态：🔄 混合（本文分节标注）
> 基线 commit：`4152eb2`｜实测日期：2026-09-27
> **§2 为已实现需求（✅ 从代码/脚本/E2E 反推）**；**§3 为未来需求（📐 引自需求文档转述）**；§1 说明本清单的生产方式与局限。

---

## 1. 本清单的生产方式（以及局限）

### 1.1 关键事实：没有正式需求文档

| 检查 | 结果 |
|------|------|
| `docs/` 下需求文档 | ❌ 只有 `功能总结.md`、`测试方案.md` |
| 《最新要求.docx》 | ❌ **不在仓库内**（`find . -iname "*.docx"` 零命中） |
| 任何 `REQUIREMENTS.md` / `PRD.md` | ❌ 无 |

因此本文**不能**从需求侧导出，只能**反向重建**：

| 节 | 生产方式 | 可靠性 |
|----|---------|-------|
| §2 已实现需求 | 从 `package.json` scripts + E2E 用例 + 源码路径**反推** | **高**（每条都有行号/用例证据） |
| §3 未来需求 | 从 `GAP_ANALYSIS.md` §8「与需求文档逐节对照」**二手转述** | **中**（原文未能验证） |

> 所有 §2 条目均为"代码里确实做了"的陈述，不是"需求方说要这样做"的陈述。这是一个**重要的口径区别**：我们无法判断某项已实现能力是否曾被正式提出为需求。

---

## 2. 已实现需求（✅ 从实现反推）

### 2.1 工程与构建需求

| # | 需求（反推） | 实现证据 |
|---|-------------|---------|
| R-01 | 提交前必须通过类型检查 | `package.json` `build: "tsc -b && vite build"` |
| R-02 | 必须能静态部署到 CDN | 产物 `dist/`，`wrangler.jsonc` 仅配 `assets` |
| R-03 | 必须有 lint | `lint: "oxlint"`（`oxlint ^1.81.0`） |
| R-04 | 必须能本地预览生产产物 | `preview: "vite preview --host 127.0.0.1 --port 4173 --strictPort"` |
| R-05 | 必须有体积上限门禁 | `content:check` → `scripts/content/check-bundle.mjs`（250 行），主 chunk 420 KiB / gzip 135 KiB |
| R-06 | 必须能生成 PWA 图标 | `icons: "node scripts/gen-icons.mjs"` |

### 2.2 内容治理需求

| # | 需求（反推） | 实现证据 |
|---|-------------|---------|
| R-07 | 内容必须有全局唯一 ID | `ContentId` 4 段式 `content:<type>:<namespace>:<localId>`（`src/core/content/model/content.ts:58-67`） |
| R-08 | 内容必须可校验完整性 | canonical SHA-256（`scripts/content/canonical.mjs`，134 行；7 条规则 N-1~N-8） |
| R-09 | 内容必须有版本三元组 | `schemaVersion` / `contentRevision` / `contentVersion` / `contentChecksum`（共 4 个数） |
| R-10 | 内容必须有来源与许可证声明 | manifest `sources[0].license.{name,spdx}`；门禁第 7 项（`validate.mjs:7`） |
| R-11 | 内容必须通过统一归一化 | `content:normalize` → `scripts/content/normalize.mjs`（186 行） |
| R-12 | 内容变更必须走构建 | `content:build` → `scripts/content/build.mjs`（214 行），三条构建铁律（`build.mjs:105-160`） |
| R-13 | 内容必须过 **20 项门禁** | `content:validate` → `scripts/content/validate.mjs`（427 行） |
| R-14 | 内容体积必须有上限 | `MANIFEST_MAX_BYTES` 8 KiB、`MANIFEST_TOTAL_MAX` 40 KiB、`INLINE_MAX_ITEMS` 1000、`INLINE_MAX_BYTES` 64 KiB |
| R-15 | 必须能列出内容清单 | `content:list` → `scripts/content/list.mjs`（59 行） |
| R-16 | namespace 必须唯一 | `build.mjs:45-49` 的 SOURCE 映射校验 |

### 2.3 学习功能需求

| # | 需求（反推） | 实现证据 |
|---|-------------|---------|
| R-17 | 支持逐字母打字，敲错即拦 | `App.tsx:411-568` `handleKeyDown`，`target.startsWith(next)` 判定；E2E【2】 |
| R-18 | 支持 4 种打字模式 | `classic` / `spell` / `timed` / `code`（`src/lib/modes.ts`，20 行） |
| R-19 | 限时模式必须有 60s 倒计时 | `App.tsx:325-336`；`data-testid="countdown"`（`:667`）；E2E【7】 |
| R-20 | 拼写模式必须遮罩目标词 | E2E【6】`·` 遮罩 + Backspace 退格（`App.tsx:432-438`） |
| R-21 | code 模式必须大小写敏感 | E2E【13-1】大写 T 被拦 |
| R-22 | 必须支持卡片式背单词（正反面） | `Memorize.tsx`（449 行），Space 翻面（`:101-138`） |
| R-23 | 卡片必须三键调度（不认识/模糊/认识） | `Memorize.tsx` `answer()`；1/2/3 键；E2E【11.6】 |
| R-24 | 必须支持左右滑动卡片 | `Memorize.tsx:145-258` 原生 touch；E2E【14-2】 |
| R-25 | 必须实现艾宾浩斯间隔重复 | `INTERVALS_DAYS = [1,2,4,7,15]`（`src/lib/reviewStore.ts:25`） |
| R-26 | 间隔必须有随机抖动 | ±10% jitter（`reviewStore.ts:99-101`）；E2E【13-2】 |
| R-27 | 存储超限必须熔断 | QuotaExceeded：每轮 1/4、最多 3 轮（`QUOTA_ROUNDS=3`，`reviewStore.ts:51-96`）；E2E【13-2】 |
| R-28 | 敲错必须进错题本并归零进度 | `recordWrong`（`reviewStore.ts:103-120`）；E2E【14-2】 |
| R-29 | 答对必须推进间隔，毕业则出队 | `recordCorrect`（`reviewStore.ts:122-149`）；E2E【14-4】【14-5】 |
| R-30 | 必须有四级掌握度 | `struggling`/`learning`/`familiar`/`strong`（`src/lib/mastery.ts`，33 行） |
| R-31 | 必须能看进度热力图 | `ProgressPanel.tsx:53` `progress-heatmap`（14 格）；E2E【16】 |
| R-32 | 必须能看弱项字母/错词 | `ProgressPanel.tsx:84`/`:103`；E2E【16】 |
| R-33 | 必须能看统计数字 | `progress-stat-*`（`ProgressPanel.tsx:69`） |
| R-34 | 首页必须给今日目标进度条 | `home-goal-bar`（`HomePanel.tsx:72`）；E2E【16】断言 60% |
| R-35 | 首页必须给复习/弱项/新词三张卡 | `home-review-card` / `home-weak-card` / `home-new-card`（`HomePanel.tsx:82/107/145`） |
| R-36 | 必须支持主题切换 | 3 套主题（`src/lib/theme.ts`，81 行）；E2E【4】 |
| R-37 | 必须支持音效 | Web Audio 合成 3 主题；`sound.ts`（204 行）；E2E【4】 |
| R-38 | 必须支持单词发音 | Web Speech API，en-US/en-GB（`src/lib/speech.ts`，82 行）；E2E【8.5】 |
| R-39 | 必须支持自动发音开关 | `gt.autoSpeak`；E2E【13-1】 |
| R-40 | 必须支持中英双语 | `src/i18n/{index.tsx,zh.ts,en.ts}` 各 185 条；E2E【10】 |
| R-41 | 必须支持自定义词库粘贴导入 | `BankManager.tsx:106` `bank-textarea` + `customBanks.ts`（92 行） |
| R-42 | 必须支持乱序开关 | `gt.shuffle`；E2E【13-1】`:shuffle off` |

### 2.4 交互与可用性需求

| # | 需求（反推） | 实现证据 |
|---|-------------|---------|
| R-43 | 必须有命令面板 | `CommandPalette.tsx`（404 行），14 条命令（`:56-71`）；E2E【11.5】 |
| R-44 | 命令必须支持模糊匹配 | 子串命中 + 前缀优先；E2E【14-1】`:t` → 补全 |
| R-45 | 必须有 `:q` 退出 | 命令注册表含 `q`；E2E【11.5】 |
| R-46 | 必须有 `:help` 双语帮助 | `CommandPalette.tsx:73-96`（zh/en 各 12 行） |
| R-47 | Esc 必须能开关命令/关闭浮层 | `App.tsx:367-385` 捕获阶段监听 + 下拉互斥 |
| R-48 | 必须有全局键盘流（打字/翻面/打分） | `App.tsx:411-568`、`Memorize.tsx:101-138` |
| R-49 | 下拉必须互斥（同时只开一个） | `App.tsx:374` 选择器 `[data-testid^="dropdown-"][aria-expanded="true"]` |
| R-50 | 移动端不得横向溢出 | E2E【11】断言；见 `02-ui-ux/RESPONSIVE.md` |
| R-51 | 命令面板输入框移动端 ≥16px | `CommandPalette.tsx` `text-base sm:text-sm`；E2E【14-2】断言 |
| R-52 | 必须有结算浮层 | `ResultOverlay.tsx:55` `result-overlay`；E2E【8】 |
| R-53 | 结算必须有彩带 | `src/lib/confetti.ts`（28 行） |
| R-54 | 彩带必须尊重 reduced-motion | `confetti.ts:15`/`:25` `disableForReducedMotion: true` |
| R-55 | 必须有 Toast / notice 提示 | `CommandPalette.tsx:318` `command-notice` / `command-error` |
| R-56 | 必须显示键盘映射 | `KeyMap.tsx`（84 行），`aria-hidden="true"`（`:47`） |
| R-57 | 必须有里程碑提示 | `MILESTONES = [10,20,30,50,100]`（`App.tsx:50`） |
| R-58 | 必须有连击/连续天数 | `src/lib/streak.ts`（94 行），`DAILY_GOAL=50` |

### 2.5 质量保障需求

| # | 需求（反推） | 实现证据 |
|---|-------------|---------|
| R-59 | 必须有 E2E 测试 | `tests/e2e.mjs`（1457 行），165 例，21 个分区 |
| R-60 | 必须有 Content 单测 | `tests/content-query.mjs`（543 行），149 例 |
| R-61 | 必须有离线审计 | `tests/offline-audit.mjs`（348 行），20 项断言 / 5 态 |
| R-62 | 必须有生产冒烟 | `tests/prod-smoke.mjs`（292 行），22 例 |
| R-63 | 必须有 SRS 压力测试 | `scripts/stress-review.mjs`（37 行） |
| R-64 | 必须有 PWA / Service Worker | `public/sw.js`（178 行），`gt-shell-v3` |
| R-65 | 必须有内容预热 | `main.tsx:27-58`；E2E【14-2】预热探针断言 3 个 `words-*.js` |
| R-66 | 必须有 SEO 基础 | `public/robots.txt`、`public/sitemap.xml` |
| R-67 | 必须有缓存头策略 | `public/_headers` |
| R-68 | 必须有截图归档 | `scripts/audit-capture.mjs`（249 行），17 张 |

### 2.6 已实现需求的覆盖率小结

| 类别 | 条数 |
|------|------|
| 工程与构建 | 6 |
| 内容治理 | 10 |
| 学习功能 | 26 |
| 交互与可用性 | 16 |
| 质量保障 | 10 |
| **合计** | **68** |

---

## 3. 未来需求（📐 引自需求文档转述）

### 3.1 来源与可靠度声明

以下需求**全部转引自** `docs/audit-package/13-acceptance/GAP_ANALYSIS.md` §8「与需求文档逐节对照」，该节是对《最新要求.docx》**32 节**的对照摘要。

**未能验证的部分**：需求文档原文、章节标题原文、优先级、验收标准、时间要求。
**可以确认的部分**：`GAP_ANALYSIS.md` §8 明确记载"§三 GitHub 竞品调研未做"（对应本文 §3.2 的 N-06）。

### 3.2 未来需求清单（转述）

| # | 需求（转述） | 现状 | 对应 Gap |
|---|-------------|------|---------|
| N-01 | **词汇产品化**：扩大词汇内容体量、补齐词性/音标/释义完整度、按考试分档 | 🔄 部分：9,346 词但 CET4 覆盖仅 1.9%；`partOfSpeech` 零数据；9 条空 definition；音标体系混用 | C-1~C-8、CONTENT-001/004/005、BUG-001 |
| N-02 | **学习图谱**：把内容与用户状态建模为可查询关系网络 | 📐 仅类型（`relation.ts` 5 种关系），无引擎 | §6「当前无实现 7 项」 |
| N-03 | **音视频内容类型**：支持音频/视频作为学习材料 | 📐 零实现；`07-media/` 空目录 | E 系列 |
| N-04 | **字幕**：字幕类型 + 时间轴 + 与文本对齐 | 📐 零实现 | E 系列 |
| N-05 | **通用内容导入体系**：多格式、多来源导入 | 📐 零实现（仅纯文本粘贴草稿） | `05-import/` 目录下 6 份文档所述 |
| N-06 | **竞品调研**：调研 5 个 GitHub 参考项目并产出借鉴结论 | 📐 **明确未做** | `GAP_ANALYSIS.md` §8：§三 未做 |
| N-07 | **考试体系**：IELTS / 考研 / 托福训练 | 📐 零实现；`08-exam/` 空目录 | 需求文档 §三十二 等 |
| N-08 | **练习引擎族**：听写、跟读、选择、填空等 | 📐 仅打字 1 种 | — |
| N-09 | **阅读 / 语法模块** | 📐 零实现 | — |
| N-10 | **AI Tutor** | 📐 零实现 | — |
| N-11 | **Personal Learning OS**：以图谱为核心的个性化学习系统 | 📐 零实现 | — |
| N-12 | **URL 路由 / 深链分享** | 📐 零实现（URL 恒 `/`） | S-1 |
| N-13 | **用户账号与跨设备同步** | 📐 零实现（不变量 D-6 ❌） | D-6 |
| N-14 | **内容版权治理体系** | 🔄 部分：有 license 字段；无 `rightsStatus`；仓库根无 LICENSE；来源字段缺 sourceUrl/author/publisher/copyright/downloadDate | E-1、E-2、LEGAL-001 |
| N-15 | **CI 测试门禁**：把全部测试纳入 CI | 📐 零实现：20+3+149+4+22+lint 全未进 CI | B-3、DEBT-002 |
| N-16 | **内容来源判定加固** | 📐 现状：靠**字符子串**判定来源（`validate.mjs:196`） | E-10 |
| N-17 | **修复架构债 A-1~A-4** | 📐 UI 直读 17 处；`updated` 假排序；预热硬编码 3 包；裸 `word` 键 | A-1~A-4 |
| N-18 | **补齐学习记录以 contentId 为键** | 📐 不变量 D-5 ❌ | D-5 |

### 3.3 需求文档所述但本文未能转述的部分

`GAP_ANALYSIS.md` §8 是**逐节对照**，但本文只列出其中导出为可执行需求的部分。**未在本文出现的需求文档章节，其内容未能验证**，不应视为不存在。

---

## 4. 需求覆盖度矩阵

| 需求域 | 已实现 | 未来需求 | 覆盖度 |
|--------|-------|---------|-------|
| 打字练习 | R-17~R-21、R-42、R-48 | — | 高 |
| 背单词 | R-22~R-24 | — | 高 |
| SRS 复习 | R-25~R-29 | — | 中高（间隔不可配） |
| 进度统计 | R-30~R-33 | — | 中 |
| 首页聚合 | R-34~R-35 | — | 中 |
| 主题/音效/发音/i18n | R-36~R-40 | — | 高 |
| 内容治理 | R-07~R-16 | N-14、N-16 | 中高 |
| 命令面板与键盘流 | R-43~R-49 | — | 高 |
| PWA / 离线 | R-64~R-65 | — | 中 |
| 测试体系 | R-59~R-63、R-68 | N-15 | 中（有测试，无 CI） |
| 内容体量与类型 | — | N-01 | **低** |
| 学习图谱 | — | N-02、N-11 | **零** |
| 音视频/字幕 | — | N-03、N-04 | **零** |
| 导入体系 | — | N-05 | **零** |
| 考试体系 | — | N-07 | **零** |
| 练习引擎族 | R-17~R-21（打字） | N-08、N-09 | **低** |
| AI Tutor | — | N-10 | **零** |
| 路由/深链 | — | N-12 | **零** |
| 账号/同步 | — | N-13 | **零** |

---

## 一句话结论

仓库内**没有正式需求文档**（《最新要求.docx》不在仓库中），因此本文将需求拆成两半：**68 条已实现需求**（全部从 `package.json` scripts、E2E 用例与源码路径反推，逐条有证据）与 **18 条未来需求**（转引自 `GAP_ANALYSIS.md` §8）；已实现部分集中在"打字—背单词—复习—进度"四环与内容治理链，未来需求集中在内容体量、学习图谱、音视频/字幕、导入体系、考试体系五大零实现域。
