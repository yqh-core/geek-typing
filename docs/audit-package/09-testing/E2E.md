# E2E 测试说明（tests/e2e.mjs）

> 状态：✅ 已有（实测）
> 文件：`tests/e2e.mjs`，**1457 行**
> 实测：**162 个 `check()` 调用点**，实际执行 **165 项**，实测结果 **165/165 通过**
> （数字引自 `13-acceptance/FINAL_ACCEPTANCE.md`，本轮未重跑）

---

## 1. 运行机制

### 1.1 驱动方式

```js
// 概念示意（实际见 tests/e2e.mjs 顶部）
const browser = await chromium.launch({ executablePath: await findChrome() })
```

- 用 **`playwright-core`**（不是 `@playwright/test`，即**不带测试运行器**）
- `findChrome()` **多候选探测**，优先级：
  1. 系统安装的 Chrome
  2. `.agent-browser` 目录下的 Chrome
  3. ms-playwright 缓存的 Chromium
- 找到即用，找不到则报错退出

### 1.2 被测服务器

由 `tests/preview-server.mjs`（81 行）自举：

- `ensurePreviewServer()` 先探针（检查首页 HTML 里有没有 `<div id="root">`）
- 探到已运行 → **复用**；未运行 → **spawn** 一个 `node vite.js preview`
- `stopPreview()` **只杀自己 spawn 的进程**（`owned` 标记），避免误杀用户手动起的服务
- Windows 下用 `taskkill /pid <pid> /t /f` 兜底（`/t` 杀子进程树）
- **host 写死 `127.0.0.1`** —— 这是实测踩过的坑：绑 IPv6 会导致 `ERR_CONNECTION_REFUSED`

### 1.3 辅助函数

| 函数 | 作用 |
|---|---|
| `readWord` | 通过 `data-letter` 属性逐字拼接读取当前词（**不是 `textContent`**，因为虚拟键盘会拆分字符） |
| `readCursor` | 读光标位置（判断打字进度） |
| `pickMode` | 切换模式（拼写/限时等） |
| `gotoTyping` | 导航到打字页——**默认先落 Home，再切 `tab-typing`** |

`gotoTyping` 的行为很重要：因为 V3 之后首页改成了五页签 IA（见【16】），打字页不再是默认落点。

### 1.4 收尾逻辑（实测原文）

```js
1441:  console.log(`共 ${results.length} 项，通过 ${results.length - failures}，失败 ${failures}`)
1444:  if (failures > 0) process.exitCode = 1
```

**注意**：`results.length`（165）> 静态 `check()` 调用点（162），因为部分 `check()` 在循环/条件内。

---

## 2. 分区结构（实测行号）

### 2.1 全部分区标题清单

实测命令：`grep -n "【" tests/e2e.mjs` → **21 个命中**。

| # | 标题 | 行号 | 备注 |
|---|---|---|---|
| 1 | `【1】首屏与下拉导航` | **110** | |
| 2 | `【2】打字核心链路（严格纠错）` | **147** | |
| 3 | `【3】连击 / WPM / 虚拟键盘跟随` | **158** | |
| 4 | `【4】皮肤 / 词库 / 音效（下拉内操作）` | **173** | |
| 5 | `【5】本地持久化` | **207** | |
| 6 | `【6】拼写模式` | **213** | |
| 7 | `【7】限时模式` | **233** | |
| 8 | `【8】通关结算` | **241** | |
| 9 | `【8.5】发音与数据分析` | **255** | **小数编号** |
| 10 | `【9】背单词模块` | **290** | |
| 11 | `【10】中英双语切换` | **347** | |
| 12 | `【11】移动端视口` | **361** | |
| 13 | `【11.5】命令面板（Esc + : 命令）` | **370** | **小数编号** |
| 14 | `【11.6】背单词键盘流（Space / 1 / 2 / 3 / Enter）` | **481** | **小数编号** |
| 15 | `【13】代码模式与发音增强` | **538** | ⚠️ **第 1 次 【13】** |
| 16 | `【14】错题本 + 命令面板模糊匹配` | **666** | ⚠️ **第 1 次 【14】** |
| 17 | `【15】考研/托福词库（懒加载分包）` | **864** | |
| 18 | `【13】批8：Jitter 抗雪崩 + Quota 熔断` | **930** | ⚠️ **第 2 次 【13】** |
| 19 | `【14】批8：移动端手势 / 命令面板 / 预热` | **1063** | ⚠️ **第 2 次 【14】** |
| 20 | `【16】V3-P0a：五页签 IA / 今日推荐 / Review / Progress` | **1220** | |
| 21 | `【12】运行时报错` | **1436** | ⚠️ **【12】排在最后** |

### 2.2 编号重复问题（必须指出）

**这是一个真实存在的问题，对应 `DEBT-003`。**

| 编号 | 出现位置 | 结论 |
|---|---|---|
| `【13】` | **538** 与 **930** | **重复 2 次** |
| `【14】` | **666** 与 **1063** | **重复 2 次** |
| `【12】` | **1436**（文件末尾） | **编号顺序错乱**——12 排在 16 之后 |

**成因**：测试是分批次追加的。后面几批（「批8」、「V3-P0a」）在文件末尾继续加，作者用了当时的批次编号，**没有回头重排**。

**实际影响**：
- 输出日志里会出现两个「【13】」两个「【14】」，人工排查时无法凭编号定位
- `【12】运行时报错` 在最后，容易被误认为"最后才检查报错"，实际它是**兜底的全局 console error 收集**（放在最后是刻意的——要收集全程的报错）

**建议**（若后续修复）：把「批8」的两个分区改名 `【13b】` / `【14b】`，把末位 `【12】` 改为 `【17】`。

### 2.3 分区数：21 vs 24 的口径

| 口径 | 数字 |
|---|---|
| `console.log('【...】')` 标题行数 | **21** |
| 需求文档/`FINAL_ACCEPTANCE.md` 所称分区数 | **24** |

**差异分析**：
- 实测标题行 **21 个**
- 其中 **3 个是小数编号**（8.5 / 11.5 / 11.6）
- `FINAL_ACCEPTANCE.md` 的表格**只列了 19 行**（含 `【11.5】`，但漏了 `【8.5】` 与 `【11.6】`）

**"24"这个数字在当前代码里没有直接对应物**。若以"逻辑分区"计，21 个标题已经是完整枚举；若把 `【6】【7】` 之类再拆子分区也无据可依。**报数时建议以实测的 21 为准，并注明 `FINAL_ACCEPTANCE.md` 表格只有 19 行。**

---

## 3. 各分区代表断言

以下是每个分区的**代表性断言**（非全部），带行号。完整断言需阅读源文件。

### 【1】首屏与下拉导航 — `tests/e2e.mjs:110`

验证首屏渲染、下拉菜单可交互。这是所有后续测试的前置——下拉不通，后面的皮肤/词库/音效都测不了。

### 【2】打字核心链路（严格纠错）— `tests/e2e.mjs:147`

**这是整个产品最核心的功能，也是断言最严的地方。**「严格纠错」意味着：打错一个字母必须原地卡住，不允许跳字。

### 【3】连击 / WPM / 虚拟键盘跟随 — `tests/e2e.mjs:158`

验证 combo 计数、WPM 计算、虚拟键盘高亮跟随当前字符。

### 【4】皮肤 / 词库 / 音效（下拉内操作）— `tests/e2e.mjs:173`

在下拉菜单内切换皮肤/词库/音效并验证生效。

### 【5】本地持久化 — `tests/e2e.mjs:207`

localStorage 写入 → 刷新 → 读回。这是学习记录的基础。

### 【6】拼写模式 — `tests/e2e.mjs:213`

### 【7】限时模式 — `tests/e2e.mjs:233`

计时器行为。

### 【8】通关结算 — `tests/e2e.mjs:241`

结算弹层。**注意**：`ResultOverlay.tsx` 的 `data-testid` 在本轮审计中新增，这是导致 `prod-smoke` A3 失败的原因（见 §5）。

### 【8.5】发音与数据分析 — `tests/e2e.mjs:255`

`SpeechSynthesis` 发音 + 结算页的数据分析展示。

### 【9】背单词模块 — `tests/e2e.mjs:290`

翻面 → 认识/不认识 → 推进。

### 【10】中英双语切换 — `tests/e2e.mjs:347`

i18n 运行时切换。

### 【11】移动端视口 — `tests/e2e.mjs:361`

设置移动端 viewport 后验证布局。**这是 T12 中唯一的"体验"类覆盖**，a11y 完全没有（见 `ACCESSIBILITY_TEST.md`）。

### 【11.5】命令面板（Esc + : 命令）— `tests/e2e.mjs:370`

键盘驱动的命令面板。**这是键盘可达性做得最好的部分**，但它是自研命令面板，不是标准 a11y 能力。

### 【11.6】背单词键盘流（Space / 1 / 2 / 3 / Enter）— `tests/e2e.mjs:481`

纯键盘操作背单词全链路：`Space` 翻面、`1/2/3` 选择、`Enter` 确认。

### 【13】代码模式与发音增强 — `tests/e2e.mjs:538`（第 1 次）

### 【14】错题本 + 命令面板模糊匹配 — `tests/e2e.mjs:666`（第 1 次）

错题本（错词收集）与命令面板的模糊匹配（fuzzy search）。

### 【15】考研/托福词库（懒加载分包）— `tests/e2e.mjs:864`

**这是 T3 词库能力的关键证据**：验证 lazy 包（kaoyan/toefl/ielts）切换时确实按需加载独立 chunk，不污染主 chunk。

### 【13】批8：Jitter 抗雪崩 + Quota 熔断 — `tests/e2e.mjs:930`（第 2 次 【13】）

- **Jitter 抗雪崩**：重试带随机抖动，避免同时重试打垮服务
- **Quota 熔断**：localStorage 配额超限时的降级处理

这是 T6 学习记录的边界条件证据之一。

### 【14】批8：移动端手势 / 命令面板 / 预热 — `tests/e2e.mjs:1063`（第 2 次 【14】）

移动端手势 + 命令面板 + 预热（`warmUpVocabulary`）。**预热逻辑是 `check-bundle.mjs` 第 3 项门禁的对象**（`A-3` 指出它硬编码 3 包于 `src/core/content/registry.ts:139`）。

### 【16】V3-P0a：五页签 IA / 今日推荐 / Review / Progress — `tests/e2e.mjs:1220`

V3 版本的信息架构改造：五个页签 + 今日推荐 + Review 页 + Progress 页。**这是最新一批测试，也是 IA 变化最大的一批**（`gotoTyping` 里"默认落 Home 再切 `tab-typing`"的由来）。

### 【12】运行时报错 — `tests/e2e.mjs:1436`

**放在最后是刻意的**：它收集全程的 `console.error`，检查有没有运行时异常。编号 `【12】` 与位置不符，是历史遗留。

---

## 4. 与离线审计的分工

`tests/e2e.mjs` **不测离线**。离线由 `tests/offline-audit.mjs` 单独覆盖（5 态，20 项断言）。

两者共用 `tests/preview-server.mjs` 起服务，但断言对象不同：

| 文件 | 测什么 | 断言数 |
|---|---|---|
| `tests/e2e.mjs` | 功能正确性 | 165 |
| `tests/offline-audit.mjs` | SW 接管 + 断网可用性 | 5 态（20 项断言） |
| `tests/prod-smoke.mjs` | 线上 CDN + SW 升级 | 22 |

---

## 5. 已知问题

### 5.1 `FLAKY-001`：prod-smoke A3 时序敏感

`tests/prod-smoke.mjs:276-278` 的 console error 过滤：

```js
const realErrors = consoleErrors.filter(e =>
  !e.includes('favicon') && !e.includes('net::ERR_FAILED'))
```

`net::ERR_FAILED` 被**无差别过滤**。这在离线测试里是必要的（离线本来就会 ERR_FAILED），但副作用是：**真正的 ERR_FAILED 也会被吞掉**。这是"为避免假失败而引入真失败盲区"的典型取舍。

### 5.2 `FLAKY-002`：弱网抖动

e2e 的预热探针预算实测从 **18s 放宽到 30s**。原因是弱网下预热（拉 3 个约 480 KB 的 words chunk）会超时。这是**假失败**（站点没问题，是网络慢），放宽预算是对的处置，但意味着**测试对网络环境敏感**。

### 5.3 `DEBT-003`：编号重复

见 §2.2。

### 5.4 五个 check 在循环内

162 个调用点 → 165 项执行，**多出的 3 项**来自循环。报数时须说明口径（见 `TEST_STRATEGY.md` §5.2）。

---

## 6. CI 中的位置

`.github/workflows/e2e.yml`（40 行）实测步骤：

1. `actions/checkout`
2. `actions/setup-node@22`（带 npm cache）
3. `npm ci`
4. `npm run build`
5. `npx playwright@1.49.1 install chromium --with-deps` ← **注意：装的是标准 playwright 的 Chromium，与本地用 `playwright-core` + 系统 Chrome 的路径不同**
6. 起 preview：`npm run preview -- --port 4173 --host 127.0.0.1 &` + `curl` 轮询 30 次
7. `node tests/e2e.mjs`

**触发条件：仅 PR + `workflow_dispatch`。** 即 **push main 时 e2e 不跑**（`deploy.yml` 只 build 不 test）。

**CI 中未跑的检查：**
- ❌ `content:validate`
- ❌ `check:bundle`
- ❌ `test:content`
- ❌ `test:offline`
- ❌ `test:smoke`
- ❌ `lint`

→ `DEBT-002`。详见 `12-infrastructure/DEPLOYMENT.md`。

---

## 相关文档

- 四层金字塔总述：`09-testing/TEST_STRATEGY.md`
- 能力覆盖矩阵：`09-testing/TEST_MATRIX.md`
- 离线套件：`12-infrastructure/OFFLINE.md`
- 缺陷编号：`13-acceptance/KNOWN_ISSUES.md`（DEBT-002 / DEBT-003 / FLAKY-001 / FLAKY-002）
