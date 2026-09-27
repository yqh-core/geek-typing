# 性能测试（体积门禁 + 缺失项）

> 状态：🔄 仅 bundle 门禁（有 3 项实测门禁，无任何运行时性能测试）
> 已有断言数：**3**
> 实现文件：`scripts/check-bundle.mjs`（**250 行**）
> 数字来源：`13-acceptance/FINAL_ACCEPTANCE.md`（**未重跑**）

---

## 1. 已有实现：`scripts/check-bundle.mjs`

### 1.1 运行方式

```bash
npm run check:bundle      # node scripts/check-bundle.mjs
```

### 1.2 三态判定（本仓库最重要的门禁语义）

实测 `scripts/check-bundle.mjs:32-34` 附近：

```js
const mark = { PASS: '✓ PASS  ', FAIL: '✗ FAIL  ', UNKNOWN: '? UNKNOWN' }
```

收尾（`:244-247`）：

```js
// (UNKNOWN 视为不通过)
process.exit(1)
...
// PASS：${results.length} 项全部通过
```

**核心规则：`UNKNOWN` 判 `exit 1`。**

理由（代码注释原文）：**「产物缺失本身就是问题，不假装通过」** —— `dist` 或 `dist/assets` 不存在时**直接 `exit 1`**。

这是成熟门禁的做法：无从取证 ≠ 通过。放到性能语境下，含义是"**如果我没法量你的体积，那你默认不合格**"。

### 1.3 三项门禁与阈值

阈值实测（`scripts/check-bundle.mjs:32-34`）：

```js
const MAIN_RAW_MAX  = 420 * 1024   // 主 chunk raw 上限
const MAIN_GZIP_MAX = 135 * 1024   // 主 chunk gzip 上限
const WARM_GZIP_MAX = 600 * 1024   // 预热包 gzip 合计上限
```

| 项 | 检查内容 | 判据 |
|---|---|---|
| **1** | 主 chunk raw + gzip **双阈值** | 两个都不得超 |
| **2** | `words-*` chunk 个数 ≥ registry 中 lazy 包数 | 懒加载分包确实生效 |
| **3** | `warmUpVocabulary` 预热包 gzip 合计 ≤ 600 KiB | **含 inline 泄漏检测** |

### 1.4 归属探测机制（不靠文件名猜）

这是本脚本最值得说的一处设计：

```js
const PROBE_COUNT = 8   // 每包取 8 个独有词做探针
const PROBE_MIN   = 3   // 命中 >= 3 个才判定"该包词条出现在主 chunk 里"
```

**机制**：拿每个包的**独有词**（只在该包出现的词）去主 chunk 的文本里搜索。

**为什么需要它**：文件名（`words-*.js`）只能证明"有一个独立文件存在"，**不能证明"主 chunk 里没有该包的词"**。如果 registry 把某个 lazy 包误写成了静态 import，会同时出现"独立 chunk 存在"和"词条也在主 chunk 里"——两者不矛盾，靠文件名完全看不出。

**探测机制能抓出这类静默污染**：

- 每包取 8 个独有词（`PROBE_COUNT = 8`）
- 命中 ≥ 3 个（`PROBE_MIN = 3`）即判"该包词条泄漏进主 chunk"
- 第 3 项据此做 inline 泄漏检测

**为什么是 3 而不是 8**：留容错。某些短词可能因代码里恰好有同名字符串而产生假命中，取 3 作为阈值是"抗噪"的折中。

---

## 2. 实测结果（引自 `13-acceptance/FINAL_ACCEPTANCE.md`）

### 2.1 门禁三项

| 项 | 实测 | 阈值 | 余量 | 判定 |
|---|---|---|---|---|
| 主 chunk raw | **381.06 KiB** | 420 KiB | **9.3%** ⚠️ | PASS（紧） |
| 主 chunk gzip | **118.89 KiB** | 135 KiB | **11.9%** ⚠️ | PASS（紧） |
| `words-*` chunk 数 | **3** | ≥ 3 | 刚够 | PASS |
| 预热包 gzip 合计 | **497.03 KiB** | 600 KiB | **17.2%** | PASS |

预热包明细：

| 包 | gzip |
|---|---|
| ielts | 166.96 KiB |
| kaoyan | 166.95 KiB |
| toefl | 163.12 KiB |
| **合计** | **497.03 KiB** |

### 2.2 构建产物清单

引自 `FINAL_ACCEPTANCE.md`（**vite 输出口径，kB = 十进制**）：

| 文件 | raw (kB) | gzip (kB) | 说明 |
|---|---|---|---|
| `dist/index.html` | 2.00 | 0.99 | |
| `index-DWqJDTkw.css` | 23.63 | 5.53 | |
| **`index-Cawl4_-q.js`** | **390.20** | **123.07** | **主 chunk** |
| `words-Dfqbfxph.js` | 475.18 | 170.21 | toefl |
| `words-DO8i2GAI.js` | 482.53 | 174.09 | ielts |
| `words-LP9e320F.js` | 483.08 | 174.05 | kaoyan |

### 2.3 口径提醒（重要）

**同一个主 chunk，两个数字口径不同：**

| 口径 | raw | gzip | 来源 |
|---|---|---|---|
| **KiB**（二进制，1024） | **381.06** | **118.89** | `check-bundle.mjs` 输出 |
| **kB**（十进制，1000） | **390.20** | **123.07** | vite 构建输出 |

换算核对：`381.06 × 1024 / 1000 = 390.20` ✓，`118.89 × 1024 / 1000 = 121.74`（gzip 略有出入，因压缩边界不同）。

**报数时必须写明口径**，否则会出现"为什么两个文档数字不一样"的误判（这是 `DEBT-004` 同类问题的潜在来源）。

---

## 3. 缺口清单

### 3.1 完全没有的测试

| # | 缺失项 | 说明 |
|---|---|---|
| P-1 | **Lighthouse / Lighthouse CI** | 无任何审计报告 |
| P-2 | **FCP**（First Contentful Paint） | 无断言 |
| P-3 | **LCP**（Largest Contentful Paint） | 无断言 |
| P-4 | **TTFB**（Time To First Byte） | 无断言 |
| P-5 | **CLS**（Cumulative Layout Shift） | 无断言 |
| P-6 | **INP / FID**（交互延迟） | 无断言 |
| P-7 | **首屏可交互时间**（TTI） | 无断言 |
| P-8 | **运行时打字延迟** | 无断言——**这是本产品的核心体验指标，反而零覆盖** |
| P-9 | **内存占用** | 无断言（懒加载 3 个约 480 KB 的 chunk 后的堆内存） |
| P-10 | **大词库压测** | 9346 词规模下的检索/排序性能无断言 |
| P-11 | **动画帧率** | 无断言（连击/WPM 有动画） |
| P-12 | **长任务（Long Task）检测** | 无断言 |
| P-13 | **性能回归基线** | `PERF-002`——无历史数据，无法判断"变慢了没有" |

### 3.2 体积门禁自身的缺口

| # | 缺口 | 说明 |
|---|---|---|
| B-1 | **只覆盖主 chunk 与预热包** | 懒加载 chunk 的**单个**体积无上限（当前每个约 475~483 kB raw，接近主 chunk） |
| B-2 | **CSS 无预算** | 当前 23.63 kB，无阈值守着 |
| B-3 | **HTML 无预算** | 当前 2.00 kB，无阈值 |
| B-4 | **总传输体积无预算** | 只有主 chunk 与预热包，没有"整站首次访问总下载量" |
| B-5 | **资源数无预算** | 无请求数量限制 |
| B-6 | **余量过紧** | `PERF-001`：raw 9.3% / gzip 11.9%。**一次中等规模依赖升级就可能破线** |

**B-6 值得展开**：主 chunk 381.06 KiB 距 420 KiB 只有 38.94 KiB 空间。参考量级——`react-dom` 单次 minor 升级的增量就可能吃掉这个余量。**当前阈值虽绿，但安全边际很薄。**

### 3.3 门禁未进 CI

`PERF-001` 与 `DEBT-002` 叠加的后果：

- 体积门禁存在，且判定严格（UNKNOWN 判失败）
- **但 `.github/workflows/deploy.yml` 只跑 `npm run build`，不跑 `check:bundle`**
- ⇒ **超预算的提交可以直接上线**

详见 `12-infrastructure/DEPLOYMENT.md`。

---

## 4. 待建方案

### 4.1 Web Vitals（最高价值）

建议用 `playwright-core` 已有的 Chromium 采集（不需要新依赖）：

```js
// 概念示意 —— 不加新依赖，复用 playwright-core
const metrics = await page.evaluate(() => new Promise(resolve => {
  new PerformanceObserver(list =>
    resolve(list.getEntries().map(e => ({ name: e.name, value: e.startTime })))
  ).observe({ type: 'largest-contentful-paint', buffered: true })
}))
```

建议断言：

| 指标 | 建议阈值 | 依据 |
|---|---|---|
| FCP | < 1.5s（本地 preview） | 主 chunk 118.89 KiB gzip，本地无网络延迟 |
| LCP | < 2.5s | Web Vitals "good" 标准 |
| TTFB | < 800ms | 静态托管 + CF CDN |
| CLS | < 0.1 | Web Vitals "good" 标准 |
| INP | < 200ms | Web Vitals "good" 标准 |

**注意**：本地 `vite preview` 与线上 CDN 差异大，**建议 `--prod` 模式单独采集**（对照 `offline-audit.mjs --prod` / `e2e.mjs --prod` 的既有模式）。

### 4.2 打字延迟（本产品最该测的运行时指标）

**这是一个打字练习软件，按键响应延迟是核心体验**，反而零覆盖。

建议：

| # | 断言 |
|---|---|
| 1 | `keydown` → 字符上屏，单次延迟 < 50ms |
| 2 | 连续输入 100 字符，无丢帧（帧率 ≥ 55fps） |
| 3 | WPM 计算在输入过程中不触发重排（layout thrashing） |
| 4 | 虚拟键盘高亮切换不引发 full re-render |
| 5 | 长词（如 20 字符）输入全程延迟稳定 |

可用 `performance.mark()` / `performance.measure()` 在 E2E 里采集。

### 4.3 内存测试

| # | 断言 |
|---|---|
| 1 | 加载前 / 加载 3 个 lazy 包后的堆内存增量 ≈ words.json 大小量级（不应是数倍） |
| 2 | 切换 10 次词库后内存不持续增长（**无泄漏**） |
| 3 | 连续打字 5000 字符后内存稳定 |

**第 2 条尤其重要**：`tests/content-query.mjs:90` 有一条契约断言证明"重复 `loadPackage` 返回同一引用（单份内存）"。但那只证明 **registry 层**不重复加载，**不能证明 UI 层不重复持有**——而 `DEBT-001` 记录了 **17 处 UI 直读词数组**，这些地方正是内存泄漏的高风险区。

### 4.4 大词库压测

| # | 断言 |
|---|---|
| 1 | 9346 词全库检索 P95 < 100ms |
| 2 | 分页翻到第 100 页的耗时与第 1 页相当（无 O(n²)） |
| 3 | 9000 词懒加载包的解析耗时（`JSON.parse` 480 KB）有上界 |
| 4 | 中文释义检索（14 个中文词全部命中的规模下）延迟可控 |

### 4.5 体积门禁扩展

| # | 建议 |
|---|---|
| 1 | 加 `LAZY_CHUNK_MAX`（单懒加载 chunk raw 上限，当前约 483 kB） |
| 2 | 加 CSS 预算 |
| 3 | 加"首次访问总传输量"预算 |
| 4 | 加资源请求数预算 |
| 5 | **调整主 chunk 阈值或减重**：当前余量 9.3% 属于危险区间 |

---

## 5. 优先级建议

| 优先级 | 事项 | 理由 |
|---|---|---|
| 🔴 P0 | **`check:bundle` 接入 CI** | 门禁存在但形同虚设（`DEBT-002`） |
| 🔴 P0 | **打字延迟测试** | 核心体验指标零覆盖 |
| 🟠 P1 | FCP / LCP / TTFB 采集 | 有 `playwright-core` 就够，无需新依赖 |
| 🟠 P1 | 内存泄漏测试（切词库 10 次） | `DEBT-001` 17 处直读是风险区 |
| 🟠 P1 | 主 chunk 余量治理 | 9.3% 太薄（`PERF-001`） |
| 🟡 P2 | 大词库检索压测 | 9346 词已有规模 |
| 🟡 P2 | 单懒加载 chunk 预算 | 当前每个接近主 chunk |
| ⚪ P3 | 性能监控基线（连续记录） | `PERF-002`，需要长期数据 |

---

## 6. 一句话总结给审计方

**体积门禁做得对（三态语义、UNKNOWN 判失败、独有词探针防污染），但只有体积一条线，且未接入 CI；运行时性能（首屏时间、打字延迟、内存、帧率）零覆盖——对一个打字练习产品来说，打字延迟恰恰是最该测却最没测的指标。另外主 chunk 余量仅 9.3% / 11.9%，安全边际偏薄。**
