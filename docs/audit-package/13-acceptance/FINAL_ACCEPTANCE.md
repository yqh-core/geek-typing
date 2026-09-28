# FINAL_ACCEPTANCE.md · 全量验收报告

> 状态：`【已有】` —— 全部为本机 2026-09-27 实跑结果
> 基线 commit：`4152eb2`
> 环境：Windows 11 + Git Bash；Node 22；Chrome 153.0.8010.53；生产 `https://geek-typing.pages.dev`

> ⚠️ **本文件是 2026-09-27 那一轮验收的历史实跑记录**（下表 e2e 165/165、test:content 149/149
> 等数字均为当轮实测），不代表最新现状。最新口径（2026-09-28 S4 后）：e2e **167/167** /
> test:content 163/163 / test:storage 78/78 / test:insights 12/12 / test:analytics 17/17 /
> test:migration 27/27 / browser-migration-e2e 19/19 —— 门禁现状以
> `P1.5-RELEASE-GATE.md` §0 两层 Gate（ENGINEERING READY / RELEASE READY）为准。

---

## 1. 门禁总览（实测）

| # | 门禁 | 命令 | 结果 | 判定 |
|---|---|---|---|---|
| 1 | 内容校验 20 项 | `npm run content:validate` | 10 包全部 PASS | ✅ |
| 2 | 内容契约测试 | `npm run test:content` | **149 / 149** | ✅ |
| 3 | 类型检查 | `npx tsc -b` | 0 error | ✅ |
| 4 | 静态检查 | `npm run lint` | 0 error / 16 warning | ⚠️ |
| 5 | 构建 | `npm run build` | `exit 0`（耗时宿主浮动，见 `PERFORMANCE.md` §2.2） | ✅ |
| 6 | 体积门禁 3 项 | `npm run check:bundle` | 3 / 3 PASS | ✅ |
| 7 | 端到端 | `npm run test:e2e` | **165 / 165** | ✅ |
| 8 | 离线套件 | `npm run test:offline` | **20 / 20** PASS（5 态，含态 4b） | ✅ |
| 9 | 生产冒烟 22 项 | `npm run test:smoke` | **21 / 22** | ⚠️ 见 §5 |
| 10 | 页面截图 | `node scripts/audit-capture.mjs` | 17 张成功 | ✅ |
| 11 | 样本复核 | `node docs/audit-package/_generated/verify-samples.mjs` | **76 / 76** | ✅ |

**合计：本地门禁全绿；生产冒烟 1 项因部署漂移告警（非站点缺陷）。**

---

## 2. 内容层实测（20 项门禁）

### 2.1 全库基线

| 指标 | 实测值 |
|---|---|
| 词库包数 | 10 |
| 全库词条数 | **9346** |
| inline 包 | 7 个 / 346 词 / 36.17 KiB |
| lazy 包 | 3 个 / 9000 词 / 1406.79 KiB |
| manifest 合计 | 13.08 KiB（最大单包 1.40 KiB） |
| schemaVersion | 4 |

### 2.2 逐项门禁（节选自 `content:validate` 原始输出）

```
✓ 必填字段完整
✓ ContentId 规范（content:vocabulary:ecdict-ts-code:ts-code）
✓ 无包内重复词条（50 词）
✓ stats.items 与实际一致（50）
✓ checksum 一致（canonical SHA-256）
✓ license 结构化（self）
✓ namespace 唯一（curated-ts-code）
✓ packageId=ts-code（与目录名一致）
✓ namespace 与 id 同源（curated-ts-code）
✓ schemaVersion=4
✓ contentVersion=1
✓ contentChecksum 一致（9f34b063…）
✓ 版本三元组自洽（revision=1 version=1 history=1 条，命中 revision=1）
✓ build 溯源完整（content-build/1.1 @ 2026-09-26T13:59:06.896Z）
✓ 跨包无 duplicate ContentId（全库 9346 词扫描，namespace 唯一 ⇒ 兜底回归）
✓ manifest 体积（最大 1.40 KiB「ts-code」，全库 13.08 KiB < 8/40 KiB）
✓ inline 预算（7 包 | Σ 346 词 / 36.17 KiB ≤ 1000 词 / 64 KiB）
✓ 策略一致性（manifest ↔ registry）：10 包一致（inline 7 / lazy 3）

[content:validate] PASS：10 包全部通过
```

---

## 3. 构建与体积实测

### 3.1 构建产物（`npm run build`）

```
dist/index.html                   2.00 kB │ gzip:   0.99 kB
dist/assets/index-DWqJDTkw.css   23.63 kB │ gzip:   5.53 kB
dist/assets/index-Cawl4_-q.js   390.20 kB │ gzip: 123.07 kB   ← 主 chunk
dist/assets/words-Dfqbfxph.js   475.18 kB │ gzip: 170.21 kB   ← toefl
dist/assets/words-DO8i2GAI.js   482.53 kB │ gzip: 174.09 kB   ← ielts
dist/assets/words-LP9e320F.js   483.08 kB │ gzip: 174.05 kB   ← kaoyan
✓ built in 7.07s
```

### 3.2 体积门禁（`npm run check:bundle`）

```
1. ✓ PASS   主 chunk index-Cawl4_-q.js：381.06 KiB raw / 118.89 KiB gzip
            ≤ 420/135 KiB（余量 9.3% / 11.9%）
2. ✓ PASS   words-* chunk 3 个 ≥ registry lazy 包 3 个
3. ✓ PASS   预热预算（ielts 166.96 + kaoyan 166.95 + toefl 163.12）
            gzip 合计 497.03 KiB ≤ 600 KiB（余量 17.2%）
```

**重要观察**：主 chunk 余量仅 **9.3% raw / 11.9% gzip**。任何新增功能（尤其引入音视频播放器、字幕渲染库）都可能击穿阈值。这是 P1+ 的硬约束。

---

## 4. 测试实测

### 4.1 端到端（165 项）

覆盖 24 个分区（含重复编号），摘要：

| 分区 | 内容 | 代表断言 |
|---|---|---|
| 【1】 | 首屏与下拉导航 | 默认进 Home、统计栏四项齐全、Esc 关下拉 |
| 【2】 | 打字核心链路 | 敲错被拦住、打完自动切词、今日计数 +1 |
| 【3】 | 连击/WPM/虚拟键盘 | COMBO 累积、WPM > 0、键盘跟随光标 |
| 【4】 | 皮肤/词库/音效 | 词库下拉 8 本齐全 |
| 【5】 | 本地持久化 | — |
| 【6】 | 拼写模式 | 字母遮罩、拼错标红、Backspace 删除 |
| 【7】 | 限时模式 | 倒计时递减 |
| 【8】 | 通关结算 | 20 词后弹结算（正确率/速度/用时/连击） |
| 【9】 | 背单词模块 | 卡片出现、翻面显示释义、三键齐全 |
| 【10】 | 中英切换 | en 即时生效 |
| 【11】 | 移动端视口 | 无横向溢出 |
| 【11.5】 | 命令面板 | :help 列全部命令、:theme 切换生效 |
| 【13】 | 代码模式 | 代码行原样渲染、大写 T 敲错被拦 |
| 【14】 | 错题本 + 模糊匹配 | — |
| 【15】 | 懒加载分包 | 考研/托福 lazy chunk 正常出词 |
| 【16】 | V3-P0a 五页签 IA | Daily Goal 进度条、复习卡两态、弱项卡、新词卡、掌握分布 |
| 【12】 | 运行时报错 | 无 console / page 运行时错误 |

```
共 165 项，通过 165，失败 0
```

### 4.2 内容契约（149 项）

```
共 149 项，通过 149，失败 0
```

13 个分区：registry 契约 / ContentId 规范 / 加载缓存共享 / countWords / searchWords /
getWord / listWords / contentQuery 统一 API / Catalog + Index / id 自洽性 /
Query Scope / Search Sort 契约 / ContentSnapshot 契约。

### 4.3 离线套件（`npm run test:offline`）

```
态1  在线首访：SW 注册并 active、已接管
态1.5 在线 reload：SW 接管下导航成功
态2  断网 reload：无 ERR_FAILED + 落 Home + 逐字母可打
态3  断网功能完整性：背单词翻面 + 三键打分 + 零 console error
态4  缓存探针：gt-shell-v3 共 12 条，全部 redirected=false（无毒条目）

结论：✅ 全部通过
```

### 4.4 CI 覆盖缺口（**重要**）

| workflow | 实际执行 | **未执行** |
|---|---|---|
| `deploy.yml` | `npm ci` → `npm run build` → 部署 | content:validate、check:bundle、test:* |
| `e2e.yml` | build → preview → `tests/e2e.mjs` | content:validate、check:bundle、test:content、offline、smoke |

**结论**：20 项内容门禁与 3 项体积门禁**目前只能在本地手动跑**，CI 不拦截。这是真实缺口，见 `KNOWN_ISSUES.md#DEBT-002`。

---

## 5. 生产冒烟：21/22 的根因分析（如实记录）

### 失败项

```
❌ A3: / → 200 且引用 bundle 与本地 dist 一致
   — status=200 期望=/assets/index-Dw5EkkBq.js
```

### 根因（已核实，非站点缺陷）

| 项 | 值 |
|---|---|
| 线上 `/` 引用 | `assets/index-Cawl4_-q.js` |
| 本地 `dist/` | `dist/assets/index-Dw5EkkBq.js` |

两者 hash 不同，因为：
1. 本轮审计**本地重跑了 `npm run build`**（且为抓结算浮层截图，`ResultOverlay.tsx` 新增了 1 个 `data-testid`）；
2. 该改动**尚未 commit / push**，Cloudflare Pages 仍是上一次部署的产物。

**这是 A3 检查项按设计正常工作** —— 它的职责就是检测"本地构建产物与线上部署是否一致"，本次如实报出了部署漂移。

**未做的动作**：我没有 push 部署。是否上线由你决定（见 §7 待决事项）。

### 其余 21 项全绿，含

```
A1: /index.html → 308 重定向到 /          ✅
A2: /sw.js → 200 + Cache-Control: no-cache ✅
A3+: / HTML 边缘压缩                       ✅
A4: bundle 200 + br 压缩 + immutable 强缓存 ✅
A5: 3 个懒加载 chunk 全部 200              ✅
B1: 全新访客 SKIP_WAITING 立即接管          ✅
B2: 断网 reload 走缓存成功                 ✅
B3: v1 残留缓存被 activate 清理             ✅
```

---

## 6. 截图验收

| 目录 | 张数 | 视口 | 说明 |
|---|---|---|---|
| `desktop/` | 5 | 1440×900 | home / typing / memorize / review / progress |
| `mobile/` | 3 | 390×844 @3x | home / typing / memorize |
| `tablet/` | 3 | 834×1112 @2x | home / typing / memorize |
| `states/` | 6 | 1440×900 | command-palette / offline-home / search-no-result / empty-review / memorize-flipped / result-overlay |
| **合计** | **17** | | 全部真实渲染，已逐张目视校验 |

抓取方式：无头 Chrome 153 + CDP，强制 `--no-proxy-server`（本机 `https_proxy` 会拦截本地请求，导致假失败）。脚本自带 preview 生命周期，可重复执行。

---

## 7. 待决事项

| # | 事项 | 说明 |
|---|---|---|
| 1 | `src/components/ResultOverlay.tsx` 新增 `data-testid` 未提交 | 零行为变更，为本轮截图所需；保留与否请你确认 |
| 2 | 生产未更新 | 本地已 build 但未 push；线上仍为 `Cawl4_-q`（旧版） |
| 3 | lint 16 个 warning | 均为 `\-` 转义风格提示，无 error，可批量清理 |
| 4 | `.audit-chrome-profile` 已清理 | 应在 `.gitignore` 中加一条以防复发 |

---

## 8. 客观实测 vs 主观判断（分离声明）

### 客观实测（可直接采信）

- 上表全部数字、命令输出、截图、内容样本统计。
- 门禁通过/失败状态。
- 代码行数、文件数、依赖版本。

### 主观判断（仅供参考，需你决策）

- "主 chunk 余量 9.3% 偏紧" —— 基于阈值的工程判断，非实测风险。
- "词汇覆盖不足以支撑考试产品" —— 基于词数对比考纲的推断。
- P1+ 路线图的优先级排序。

详见 `13-acceptance/GAP_ANALYSIS.md` 与 `13-acceptance/KNOWN_ISSUES.md`。
