# geek-typing · 英语打字学习工具

> **在线试：<https://geek-typing.pages.dev>** —— 无需注册，断网也能用。

**一句话**：把背单词和英语打字练习合成一件事 —— 在敲键盘的过程中把单词记住，
打对一个词就绿一个词，错的自动进复习队列。

纯前端单页应用：没有后端、没有账号、没有 telemetry，
学习进度存在你自己浏览器的 localStorage 里（PWA 可安装、可离线）。

<!-- readme:package-count=13 -->
<!-- readme:entry-count=9438 -->

本仓库内置 **13 个词库包 / 9438 条词条**（CET-4、CET-6、IELTS、考研、TOEFL、
Go / TypeScript 代码行、AI 大模型、前端、云原生等主题词库）。
上面两个数字由 `npm run verify:readme-facts` 与 `content/` 磁盘真值对账，
词库增删后数字不一致会**直接判红**，不会出现「README 还写着旧数」。

## 适合谁用

- **备考四六级 / 雅思 / 考研 / 托福**：需要高频重复的词表，且想知道自己「哪些词一直记不住」。
- **技术栈词汇**：写 Go、TypeScript、AI 应用的开发者，想把领域术语（以及代码行本身）
  变成肌肉记忆，而不是每次都在 IDE 里拼错。
- **想改掉拼写错误的开发者**：打字时实时校验正确率，把「看起来会写」变成「真能敲对」。

不适合：需要多人同步进度、社交排行或云端备份的场景 —— 本项目刻意不做这些。

## 截图

暂无仓库内截图（体积与首屏权衡的取舍见下方「截图方案」一节）。
应用真实界面可直接访问：<https://geek-typing.pages.dev>

## 词库与内容许可

代码与仓库内容以 [MIT License](./LICENSE) 发布（`Copyright (c) 2026 yqh-core`）。
**词库内容与代码的许可不同**，按包逐条声明在各自 `manifest.json` 的 `sources[].license`。
实测分类如下（统计口径：`content/*/*/manifest.json`，**只看 `sources[].license`**）：

| 类别 | 数量 | packageId | 说明 |
| --- | --- | --- | --- |
| MIT · 可自由再分发 | 8 | `ai-core` `cloud-native` `frontend` `go-code` `ts-code` `ielts-edu-01-vocab` `ielts-env-02-vocab` `ielts-tech-03-vocab` | 自编主题词库，`spdx: MIT`、`redistributable: true` |
| MIT · 需署名（派生自 ECDICT） | 5 | `cet4` `cet6` `ielts` `kaoyan` `toefl` | 派生自 [ECDICT](https://github.com/skywind3000/ECDICT)（MIT License），`attributionRequired: true` —— **再分发时必须署名** |
| 专有 · **不可再分发** | 14 | `demo-audio-01` `demo-study-set` `demo-exercise-01` `ielts-edu-01-exercise` `ielts-env-02-exercise` `ielts-tech-03-exercise` `demo-listening-01` `demo-reading-01` `ielts-edu-01-reading` `ielts-env-02-reading` `ielts-tech-03-reading` `demo-speaking-01` `demo-topic-01` `demo-writing-01` | 自编教材 / 结构探针包，`license.name: "Proprietary (self-curated)"`、`redistributable: false` |

注意这 14 个不可再分发的包**不在 `content/vocabulary/` 下**，
而在 `content/` 的 `audio` / `collection` / `exercise` / `listening` / `reading` /
`speaking` / `topic` / `writing` 八类目录里。它们同样随本仓库以 MIT 形式提供，
但其**内容**被显式声明为专有 —— 想复用请先联系作者。
上表的 packageId 列表可用 `npm run gate:license` 复核。

## 相关工具（站点群）

本项目属于一个三站体系，互相导流：

- **[digdevbox.com](https://digdevbox.com)** —— 101 个在线开发者工具
  （JSON 格式化 / JWT 解码 / Regex 测试 / Base64 / 时间戳转换等），即开即用、无需注册。
- **[notes.digdevbox.com](https://notes.digdevbox.com)** —— 开发者知识库文章。
- **geek-typing**（本项目）—— 英语打字 + 背单词，离线可用的 PWA。

上面两个站点均已在本项目落地页（`scripts/seo/home-landing.copy.mjs` 的 `SIBLING_SITES`）
与 README 中互相引用。

## 截图方案（维护者备注）

README 尚无仓库内截图，这是**有意为之的待裁定项**，三种方案的实测对比：

- **方案 A（当前采用）**：纯文字 + 可点击入口，不加图。仓库零二进制增量，首屏最快。
- **方案 B**：截图存仓库外（如 `D:\work\_ops\repo-shots\`），README 不引用图床。
  规避体积，但 GitHub 上永远看不到图。
- **方案 C**：仿 `dev-tools-main` 的先例提交到 `.github/assets/`。
  该仓库现有 4 张 png（`home` / `json-formatter` / `jwt-decoder` / `regex-tester`），
  合计约 424 KB。本项目若照做，参考现有 a11y 截图单张约 50–75 KB（1280×800），
  2–3 张约 150–220 KB。
- **Shields.io 徽章**：本项目**禁用第三方追踪类外部请求**，故不采用。

README 图片**不进入前端 bundle**（`dist/` 体积与 `npm run check:bundle` 完全无关），
因此截图方案与主 chunk 体积余量（当前 4.0%）是两个独立问题，不应混淆。

---

## 核心功能

- **打字练习**：逐词打字训练，实时统计速度与正确率（`src/components/PracticePanel.tsx`、`StatsBar.tsx`、`ResultOverlay.tsx`）
- **背单词**：单词卡记忆模式，音标与释义展示（`src/components/Memorize.tsx`）
- **错题复习**：基于艾宾浩斯遗忘曲线的复习调度（`src/components/ReviewPanel.tsx`、`src/lib/learning/`）
- **学习分析**：学习进度、掌握度与连续打卡统计（`src/components/StatsPanel.tsx`、`ProgressPanel.tsx`、`src/lib/mastery.ts`、`streak.ts`）
- **多词库**：内置多个词库（CET-4/6、IELTS、考研、TOEFL 及 AI/前端/编程等主题词库，见 `src/data/wordBanks.ts`），支持自定义词库管理（`src/components/BankManager.tsx`）
- **其它**：命令面板（`CommandPalette.tsx`）、中英双语界面（`src/i18n/`）、PWA 离线可用（`public/sw.js`、`manifest.webmanifest`）

## 技术栈

- React 19 + TypeScript + Vite
- Tailwind CSS、canvas-confetti、lucide-react
- 词库内容与质量门禁脚本：Node.js（`scripts/content/`、`scripts/scan-mojibake.mjs` 等）

## 开发命令

`package.json` 的 `scripts` 原文如下：

```json
{
  "dev": "vite",
  "build": "tsc -b && vite build",
  "lint": "oxlint",
  "preview": "vite preview --host 127.0.0.1 --port 4173 --strictPort",
  "test:e2e": "node tests/e2e.mjs",
  "test:content": "node tests/content-query.mjs",
  "test:queryword-lazy": "node tests/queryword-lazy.mjs",
  "lint:text": "node scripts/scan-mojibake.mjs",
  "test:learning": "node tests/learning-model.mjs",
  "test:offline": "node tests/offline-audit.mjs",
  "test:prod": "node tests/offline-audit.mjs --prod",
  "test:e2e:prod": "node tests/e2e.mjs --prod",
  "test:smoke": "node tests/prod-smoke.mjs",
  "stress:review": "node scripts/stress-review.mjs",
  "icons": "node scripts/gen-icons.mjs",
  "content:validate": "node scripts/content/validate.mjs",
  "content:check": "node scripts/content/validate.mjs",
  "content:build": "node scripts/content/build.mjs",
  "content:normalize": "node scripts/content/normalize.mjs",
  "content:list": "node scripts/content/list.mjs",
  "check:bundle": "node scripts/check-bundle.mjs",
  "audit:learning": "node scripts/learning-consistency.mjs",
  "migration:dryrun": "node scripts/migration-dryrun.mjs",
  "test:migration": "node tests/migration-guards.mjs",
  "test:storage": "node tests/learning-storage.mjs",
  "test:insights": "node tests/learning-insights.mjs",
  "test:analytics": "node tests/analytics-identity.mjs",
  "gate:g4": "node scripts/gate-g4.mjs",
  "release:gate": "node scripts/verify-release-gate.mjs"
}
```

> 上方为历史快照（节选）。**权威来源是 `package.json` 本身**，门禁脚本请以 `npm run` 实行为准。

## 测试与质量门禁

- `npm run build`：类型检查（`tsc -b`）+ 产物构建 + 静态页生成（三步，见 `scripts` 里的 `build`）
- `npm run test:e2e` / `npm run test:offline` / `npm run test:content` 等：浏览器端到端、离线审计、内容契约等测试套件（见上方 scripts）
- `npm run lint:text`：全仓乱码 / 非 UTF-8 文本扫描（`scripts/scan-mojibake.mjs`）
- `npm run gate:license`：词库与素材许可准入门（`scripts/gate-license.mjs`）
- `npm run verify:readme-facts`：README 数字与内容真值对账（`scripts/verify-readme-facts.mjs`）
- `npm run release:gate`：发布门禁校验（`scripts/verify-release-gate.mjs`）

## 文档索引

完整审计资料包位于 `docs/audit-package/`，从 `00-project` 到 `13-acceptance` 共 14 个分区（产品、UI/UX、架构、内容、导入、学习模型、媒体、考试、测试、安全、法务、基础设施、验收），入口见 `docs/audit-package/README.md`。

## 已知问题

- `README.md` 曾于 2026-09-28 被本机「亿赛通 EsafeNet 透明加密驱动」整文件加密为密文，
  事故详情与处置实录见 `docs/audit-package/13-acceptance/INCIDENT-ESAFENET.md`。
  `npm run verify:readme-facts` 现已把「根 README 必须是合法 UTF-8」纳入机器判定 ——
  此前 `npm run lint:text` 的扫描范围不含仓库根，对该损坏不可见。
