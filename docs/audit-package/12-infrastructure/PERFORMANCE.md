# 性能基线与测量报告（PERFORMANCE）

> 状态：`🔄 混合` —— **`【实测】` 为本轮实跑数字；`【主观】` 为工程判断；`【未能实测】` 明确标注原因，不编数字**
> 测量日期：2026-09-27　基线 commit：`4152eb2`
> 环境：Windows 11 + Git Bash；**Node `v22.22.2`**；npm `8.5.2`；vite `8.3.1`
> 测量方式：`rm -rf dist` → `npm run build` → `npm run check:bundle` → Python 逐文件 `gzip.compress(level=9)` + `os.path.getsize`
> **前置约束（影响本文件全部数字）**：本机装有 **Esafenet 透明加密驱动**，会显著拖慢大文本文件的读取/转换。这直接影响了本轮测得的构建耗时（见 §2.2）。

---

## 0. 一句话结论

**首屏预算还有 9.3% raw / 11.9% gzip 余量，预热预算还有 17.2% 余量，体积门禁 3/3 通过 —— 当前构建是"合规的，但余量已经很薄"。同时必须明确：本项目除"构建产物体积"之外，性能监控是一片空白 —— 无 Lighthouse、无 FCP/LCP/TTFB 采集、无内存压测（`PERF-002`）。本文档给出的是"体积基线"，不是"运行时性能基线"。**

---

## 1. 基线总表（`【实测】`）

| 指标 | 阈值 | 实测值 | 余量 | 余量% | 判定 |
|---|---|---|---|---|---|
| **主 chunk raw** | 420 KiB | **381.09 KiB** | 38.91 KiB | **9.3%** | ✅ PASS |
| **主 chunk gzip** | 135 KiB | **118.57 KiB** | 16.43 KiB | **11.9%** | ✅ PASS |
| **预热预算 gzip** | 600 KiB | **497.03 KiB** | 102.97 KiB | **17.2%** | ✅ PASS |
| `words-*` chunk 数 ≥ lazy 包数 | ≥ 3 | **3** | 0 | **0%** | ✅ PASS（**刚好相等**） |
| inline 包词数 | ≤ 1000 词 | **346** 词（7 包） | 654 词 | 65.4% | ✅ PASS |
| inline 包体积 | ≤ 64 KiB | **36.17 KiB** | 27.83 KiB | 43.5% | ✅ PASS |
| manifest 单包体积 | ≤ 8 KiB | **1.40 KiB**（最大，`ts-code`） | 6.60 KiB | 82.5% | ✅ PASS |
| manifest 全库体积 | ≤ 40 KiB | **13.08 KiB** | 26.92 KiB | 67.3% | ✅ PASS |
| `dist/` 全树 raw | —（无阈值） | **1840.40 KiB** | — | — | — |
| `dist/` 全树 gzip | —（无阈值） | **629.05 KiB** | — | — | — |
| 首屏关键路径 gzip（HTML+主 JS+主 CSS） | —（无阈值） | **124.87 KiB** | — | — | — |

### 1.1 主 chunk 余量的直观含义（`【主观】`）

| 问题 | 回答 |
|---|---|
| 余量 38.91 KiB raw / 16.43 KiB gzip 是什么概念？ | 相当于**约 3.7 个 inline 小包**（346 词/7 包 ≈ 49 词/包，36.17 KiB/7 ≈ 5.17 KiB raw 每包） |
| 什么会击穿它？ | `【实测依据】`inline 词 **1:1.0005 全额传导**进主 chunk（见 §3.2）。因此：**新建一个 inline 包且它超过 39 KiB raw ⇒ 立刻破线** |
| 更现实的场景？ | 引入音视频播放器、字幕渲染库、日期/国际化库 —— 这几类动辄 30~80 KiB gzip，**一次依赖引入就足以破线** |
| 结论 | **主 chunk 余量是本项目 P1+ 的硬约束**（`PERF-001`） |

---

## 2. 构建实测

### 2.1 构建命令（`【实测】` 自 `package.json`）

```json
"build": "tsc -b && vite build"
```

两段式：先类型检查，再打包。`tsc -b` 失败则 `vite build` 不执行。**`build` 不含 `content:validate`，也不含 `check:bundle`** —— 三者是独立门禁。

### 2.2 构建耗时（`【实测】` —— 波动极大，**不是稳定指标**）

**结论先行**：构建耗时在本机**在 5.7s ~ 25.1s 之间剧烈波动**，**不能作为回归判据**，也不应写进验收表当作固定值。

| 轮次 | 命令 | Vite 自报 | 挂钟（`time` real） | 备注 |
|---|---|---|---|---|
| 第 1 次（`rm -rf dist` 后，**冷**） | `npm run build` | `✓ built in 25.12s` | **50.518s** | 插件耗时归因见下 |
| 第 2 次（紧跟再跑，**热**） | `npm run build` | `✓ built in 21.27s` | **37.424s** | 热跑只快 15% |
| 第 3 次（复核，**热**） | `npm run build` | **`✓ built in 5.70s`** | **13.329s** | 主项转为 `vite:prepare-out-dir renderStart`（68%, 3.9s） |
| 历史记录（`BUILD.md` / `FINAL_ACCEPTANCE.md`） | `npm run build` | `✓ built in 7.07s` | 未记录 | 与第 3 次同量级 |

**关键观察**：第 3 次（5.70s）与历史记录（7.07s）**同量级**，而第 1/2 次（25.1s / 21.3s）是**离群值**。且第 3 次的**慢项完全不同**（`prepare-out-dir` 而非 `build-html`）—— 说明所谓"92% 时间在 build-html"是**那次运行的偶发现象**，不是架构固有成本。

⇒ **因此不构成"7.07s 无法复现"的问题**。正确结论是：**构建耗时受宿主环境（透明加密驱动 / 磁盘缓存 / 负载）影响，方差可达 4 倍以上；文档不应记录单一耗时数字作为基线。**

**`【实测】` Vite 的插件耗时归因（仅第 1 次冷跑出现）**：

```
[PLUGIN_TIMINGS] JavaScript callbacks ran for 24.9s of this 25.1s build (99%).
The slowest callbacks, timed inside each callback:
  - plugin vite:build-html transform (92%, 23.2s, 1 call)
Additional callback time came from ...:
  - plugin vite:asset load (20 calls)
```

第 3 次（5.70s）的归因**完全不同**：

```
[PLUGIN_TIMINGS] JavaScript callbacks ran for 4.9s of this 5.7s build (86%).
  - plugin vite:prepare-out-dir renderStart (68%, 3.9s, 1 call)
  - plugin vite:asset load (20 calls)
```

| 项 | 值 |
|---|---|
| 处理模块数 | **1939 modules transformed**（三次一致） |
| `tsc -b` 结果 | **0 error**（三次一致） |
| 构建成功 | ✅ 退出码 0（三次一致） |
| 慢项 | **不稳定**：冷跑在 `vite:build-html`（92%），热跑在 `prepare-out-dir`（68%） |

**`【实测】` 波动原因分析**：

| 候选原因 | 证据强度 | 说明 |
|---|---|---|
| **Esafenet 透明加密驱动拖慢文本读取** | `【主观】` 推断 | 本机对 `public/robots.txt` 等文本文件**实测存在透明加密**（本地 `cat` 2446 行仅 3 行可读）。`vite:build-html` 恰是"读 HTML → 处理 → 写 HTML"的载荷。**但未能控制变量验证**（无法临时卸载驱动） |
| 宿主磁盘缓存 / 负载 | `【实测】` 部分 | 同样的输入在**同一小时内**跑出 25.12s / 21.27s / **5.70s**，且慢项从 `build-html` 变为 `prepare-out-dir` ⇒ 强烈指向**宿主环境抖动**而非代码变化 |
| 代码导致的退化 | **已排除** | 三轮的**产物哈希完全一致**（`index-Dw5EkkBq.js` 等 5 个文件 + 门禁 3/3 数字不变）⇒ 无代码变更，耗时变化与代码无关 |

> **处置建议（`【主观】`）**：**构建耗时不是门禁，不阻塞发布；但也不应作为基线数字写进验收表。**
> `BUILD.md` 与 `FINAL_ACCEPTANCE.md` 中的 `7.07s` 是**历史有效记录**（第 3 次复核 5.70s 与之同量级，已证实可复现），
> 但**建议改为区间表述**（如"本机 5.7–25.1s，受宿主环境影响"），避免后续读者把单点数字当承诺。

### 2.3 完整构建输出（`【实测】`，逐行原样）

```
> geek-typing@0.0.0 build
> tsc -b && vite build

vite v8.3.1 building client environment for production...
transforming...
✓ 1939 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   2.00 kB │ gzip:   0.99 kB
dist/assets/index-DWqJDTkw.css   23.63 kB │ gzip:   5.53 kB
dist/assets/index-Dw5EkkBq.js   390.23 kB │ gzip: 123.08 kB
dist/assets/words-Dfqbfxph.js   475.18 kB │ gzip: 170.21 kB
dist/assets/words-DO8i2GAI.js   482.53 kB │ gzip: 174.09 kB
dist/assets/words-LP9e320F.js   483.08 kB │ gzip: 174.05 kB

✓ built in 25.12s
```

### 2.4 两种体积口径（**必读，否则会误判**）

| 工具 | 单位 | 主 chunk 报数 |
|---|---|---|
| `vite build`（自报） | **kB = 1000 字节**（十进制） | `390.23 kB` |
| `scripts/check-bundle.mjs` | **KiB = 1024 字节**（二进制） | `381.09 KiB` |

**换算校验**：`390.23 × 1000 = 390230`；`381.09 × 1024 = 390236` —— 差 6 字节，源于双方各自的四舍五入，**两个数字都正确**。

**同理**，gzip 也一样：vite 报 `123.08 kB` = 123080 B；门禁报 `118.91 KiB` = 121764 B。**注意这两个差异较大（1316 B）** —— 因为 **vite 用 gzip 默认级别**（`zlib` level 默认 6），**`check-bundle.mjs` 用 `level: 9`**（`gzipSync(buf, { level: 9 })`）。**级别不同 ⇒ 数字必然不同**，不是任何一方算错。

---

## 3. 分区块体积明细

### 3.1 `dist/` 全树逐文件实测（`【实测】`）

测量方法（精确算法，非估算）：

```bash
python -c "
import os, gzip
for dp,dn,fn in os.walk('dist'):
    for f in sorted(fn):
        p=os.path.join(dp,f)
        raw=os.path.getsize(p)
        gz=len(gzip.compress(open(p,'rb').read(),9))
        print(p, raw, gz)
"
```

| 路径 | raw (B) | gzip (B) | raw (KiB) | gzip (KiB) | 压缩比 |
|---|---|---|---|---|---|
| `assets/words-LP9e320F.js` | 483087 | 170412 | 471.76 | **166.42** | 35.3% |
| `assets/words-DO8i2GAI.js` | 482531 | 170384 | 471.22 | **166.39** | 35.3% |
| `assets/words-Dfqbfxph.js` | 475181 | 166584 | 464.04 | **162.68** | 35.1% |
| **`assets/index-Dw5EkkBq.js`**（主 chunk） | 390232 | 121412 | **381.09** | **118.57** | **31.1%** |
| `assets/index-DWqJDTkw.css` | 23632 | 5472 | 23.08 | 5.34 | 23.2% |
| `favicon.svg` | 9522 | 1499 | 9.30 | 1.46 | 15.7% |
| `icons.svg` | 5031 | 2161 | 4.91 | 2.11 | 43.0% |
| `robots.txt` | 4171 | 633 | 4.07 | 0.62 | 15.2% |
| `sw.js` | 4130 | 2014 | 4.03 | 1.97 | 48.8% |
| `icon-512.png` | 2698 | 964 | 2.63 | 0.94 | 35.7% |
| `index.html` | 2007 | 986 | 1.96 | 0.96 | 49.1% |
| `manifest.webmanifest` | 809 | 511 | 0.79 | 0.50 | 63.2% |
| `icon-192.png` | 726 | 458 | 0.71 | 0.45 | 63.1% |
| `_headers` | 574 | 471 | 0.56 | 0.46 | 82.1% |
| `sitemap.xml` | 238 | 185 | 0.23 | 0.18 | 77.7% |
| **合计（15 个文件）** | **1884569** | **644146** | **1840.40** | **629.05** | **34.2%** |

> **注 1**：`gzip` 列用 `level: 9`，与 `check-bundle.mjs` 门禁口径一致（**不是** vite 的默认级别）。
> **注 2**：`icon-*.png` 与 `favicon.svg` 已是压缩格式，gzip 收益低（属正常）。
> **注 3**：`_headers` 压缩比 82.1%、`sitemap.xml` 77.7% —— 体积太小（<1 KiB），gzip 头部开销占比高，**收益为负在工程上常见**。

### 3.2 首屏加载路径（`【实测】` 由 §3.1 聚合）

| 口径 | 文件 | raw | gzip |
|---|---|---|---|
| **首屏关键路径** | `index.html` + 主 chunk + 主 CSS | 415.71 KiB | **124.87 KiB** |
| 去掉 HTML（只算 assets） | 主 chunk + 主 CSS | 404.17 KiB | 123.91 KiB |
| 首屏 + 全部 3 个 lazy chunk（预热后） | + 3 × `words-*` | 1806.19 KiB | **620.36 KiB** |
| 全站产物 | §3.1 合计 | 1840.40 KiB | 629.05 KiB |

**`【实测】` 生产实际传输量（curl，br/gzip 双测）**：

| 资源 | 无压缩 | gzip | brotli | 说明 |
|---|---|---|---|---|
| `/`（首页 HTML） | 2007 B | 985 B | **912 B** | 边缘压缩生效 |
| `/assets/index-Cawl4_-q.js`（**线上**主 chunk） | 390201 B | 121283 B | **121375 B** | 线上版本（非本轮本地构建） |
| `/assets/index-DWqJDTkw.css` | 23632 B | 5472 B | **5495 B** | 与本地一致 |
| `/sw.js` | 7619 B | 3441 B | **4178 B** | — |

> **`【实测】` 线上主 chunk（390201 B）与本地（390232 B）差 31 B** —— 因为线上是**旧版**（不含 `ResultOverlay.tsx` 的 `data-testid`），本地是新构建。详见 `FLAKY-001`。
> **`【实测】` 线上首屏 gzip 传输量 ≈ 912 + 121375 + 5495 = 127782 B ≈ 124.79 KiB** —— 与本地 §3.2 的 124.87 KiB 基本一致。

### 3.3 分包结构（`【实测】`）

| 策略 | 包数 | 词数 | 体积 | 产物 |
|---|---|---|---|---|
| **inline**（静态 `import ... ?raw`） | 7 | **346** | 36.17 KiB | 无独立 chunk，**全额进主 chunk** |
| **lazy**（`load: () => import(...)`） | 3 | **9000** | 1406.79 KiB | 3 个 `words-*.js` 独立 chunk |

**`【实测】` 分包机制**：分包**不靠配置**（`vite.config.ts` 仅 7 行，无 `build.rollupOptions`），而靠 `src/core/content/registry.ts` 里的 import 形态：

| 形态 | 策略 | 结果 |
|---|---|---|
| `words: parseWords(aiCoreWords)`（同步静态 import） | inline | 进主 chunk |
| `load: loadIelts`（`async () => parseWords((await import(...)).default)`） | lazy | 独立 `words-*.js` |

**`【实测】` registry 注册项全清单（10 个）**：

| # | localId | 策略 | manifest id 前缀 | 词数 |
|---|---|---|---|---|
| 1 | `ai-core` | inline | （见 manifest） | 小型精编 |
| 2 | `cloud-native` | inline | — | 小型精编 |
| 3 | `frontend` | inline | — | 小型精编 |
| 4 | `cet4` | inline | — | **84** |
| 5 | `cet6` | inline | — | **69** |
| 6 | **`ielts`** | **lazy** | — | 3000 |
| 7 | **`kaoyan`** | **lazy** | — | 3000 |
| 8 | **`toefl`** | **lazy** | — | 3000 |
| 9 | `ts-code` | inline | `content:vocabulary:ecdict-ts-code` | 50 |
| 10 | `go-code` | inline | — | 小型精编 |

**INLINE / LAZY 硬约束（`【实测】` 自 `scripts/content/validate.mjs` 第 19 项）**：

| 约束 | 上限 | 当前 |
|---|---|---|
| **inline 词数硬上限** | **≤ 1000 词** | 346 词（7 包合计） |
| **inline 体积硬上限** | **≤ 64 KiB** | 36.17 KiB |

### 3.4 `【实测】` inline 词 1:1 全额传导（**本仓库最有价值的定量结论**）

引自 `scripts/check-bundle.mjs` 头部注释与 `scripts/content/validate.mjs:35-37`：

> 实测（10 包基线）：把 lazy 的 **kaoyan 改成 inline** ⇒ 主 chunk raw **381.06 → 852.97 KiB**（**+471.92 KiB**）、gzip **118.89 → 285.30 KiB**（**+166.41 KiB**），增量与 kaoyan `words.json` **471.70 KiB** 的比值 **1:1.0005** —— inline 是全额直通车。

**含义（`【实测】` + `【主观】`）**：

| 结论 | 性质 |
|---|---|
| inline 一个包 ≈ 把它的 `words.json` **原封不动**搬到主 chunk（比值 1.0005） | `【实测】` |
| **首屏体积不随词库增长** —— 前提是新增库保持 lazy | `【实测】` |
| 这条定量结论解释了为什么门禁第 19 项必须给 inline 设硬上限 | `【实测】` 因果 |
| ⇒ **lazy 是首屏体积的唯一调节阀** | `【主观】` 概括 |

---

## 4. 体积门禁实测输出（`【实测】` 原样）

```
> geek-typing@0.0.0 check:bundle
> node scripts/check-bundle.mjs

[check-bundle] dist/assets：5 个文件
  1. ✓ PASS   主 chunk index-Dw5EkkBq.js：381.09 KiB raw / 118.91 KiB gzip ≤ 420/135 KiB（余量 9.3% / 11.9%）
  2. ✓ PASS   words-* chunk 3 个 ≥ registry lazy 包 3 个（words-Dfqbfxph.js, words-DO8i2GAI.js, words-LP9e320F.js）
  3. ✓ PASS   预热预算（ielts→words-DO8i2GAI.js(166.96 KiB)，kaoyan→words-LP9e320F.js(166.95 KiB)，toefl→words-Dfqbfxph.js(163.12 KiB)）：gzip 合计 497.03 KiB ≤ 600 KiB（余量 17.2%）

[check-bundle] PASS：3 项全部通过
```

### 4.1 门禁阈值定义（`【实测】` 自 `scripts/check-bundle.mjs` 源码）

```js
const MAIN_RAW_MAX  = 420 * 1024   // 420 KiB
const MAIN_GZIP_MAX = 135 * 1024   // 135 KiB
const WARM_GZIP_MAX = 600 * 1024   // 600 KiB
```

| 项 | 阈值 | 门禁语义 |
|---|---|---|
| 1 | 主 chunk（`dist/assets/index-*.js`）raw ≤ 420 KiB **且** gzip ≤ 135 KiB | 两项都需满足 |
| 2 | `words-*` chunk 数 **≥** registry 中 lazy 包数 | 防止 lazy 包被写成 inline 并进主包 |
| 3 | `warmUpVocabulary` 列入的包，其 `words` chunk gzip **合计** ≤ 600 KiB | 预热预算 |

**三态语义（`【实测】`）**：`PASS` / `FAIL` / `UNKNOWN`，**`UNKNOWN` 视为不通过（`exit 1`）**。源码注释原文：

> 测不出来绝不等于通过；产物缺失、结构变化、探测不到归属都必须是 UNKNOWN/FAIL。

**`【实测】` 归属探测机制（很值得记一笔）**：chunk hash 会随内容变化，**不能硬编码文件名**。门禁改用**内容特征反查归属**：从每个包的 `words.json` 取 **8 个"该包独有"的纯字母且 ≥5 字符**的词作探针（`PROBE_COUNT=8`），在 chunk 文本中做字面量比对；独有词 < 3 个（`PROBE_MIN`）则判 `UNKNOWN`。**同时会检测 "lazy 包的词出现在主 chunk 里"（inline 泄漏）并直接 `FAIL`** —— 这正是本门禁要抓的回归。

### 4.2 预热预算的构成（`【实测】`）

| 预热包 | 所属 chunk | chunk gzip |
|---|---|---|
| `ielts` | `words-DO8i2GAI.js` | 166.96 KiB |
| `kaoyan` | `words-LP9e320F.js` | 166.95 KiB |
| `toefl` | `words-Dfqbfxph.js` | 163.12 KiB |
| **合计** | 3 个 | **497.03 KiB** ≤ 600 KiB（余量 **17.2%**） |

**`【实测】` 预热逻辑（`src/core/content/registry.ts:139-141`）**：

```ts
export function warmUpVocabulary(): Promise<unknown> {
  return Promise.allSettled([loadIelts(), loadKaoyan(), loadToefl()]).catch(() => {})
}
```

**⚠️ 硬编码 3 包（`【实测】` + `【主观】`，编号 `A-3`）**：

| 项 | 说明 |
|---|---|
| 现象 | 预热包列表**写死在 `registry.ts`**，不随 registry 自动扩展 |
| 后果 | 新增 lazy 包**不会自动纳入预热**，需手动改源码 |
| 余量风险 | 102.97 KiB / 17.2% —— **再塞一个 lazy 包（约 165 KiB gzip）就会破线** |
| 定性 | `【实测】` 现象 + `【主观】` 风险判断（"配置与代码耦合"的典型） |

> 注意 `parseWarmUpIds()` 的注释还记录了另一处陷阱：registry 里首个 `warmUpVocabulary` 命中是**第 6 行注释**，截不到 `allSettled([...])`，会误判成"无预热"⇒ `UNKNOWN`；因此必须用 `lastIndexOf('function warmUpVocabulary')` 锚定到**函数定义**。**这是一处"门禁也会踩坑"的实测记录。**

### 4.3 门禁的前置依赖与失败语义（`【实测】`）

| 场景 | 行为 |
|---|---|
| `dist` 不存在 | `[check-bundle] dist 不存在：请先 npm run build（产物缺失本身就是问题，不假装通过）` → `exit 1` |
| `dist/assets` 不存在 | `... 构建产物结构不符合预期，门禁拒绝放行` → `exit 1` |
| `index-*.js` 找到 0 个 | 第 1 项 `FAIL`（"比静默放行安全"） |
| `index-*.js` 找到 >1 个 | 第 1 项 `UNKNOWN`（"无法确定首屏口径"） |
| registry 解析不出注册项 | 第 2/3 项 `UNKNOWN` |
| 预热包探针 < 3 个独有词 | 第 3 项 `UNKNOWN` |
| 预热包的词出现在主 chunk | 第 3 项 `FAIL`（inline 泄漏） |

**零依赖**：只用 `node:fs` / `node:path` / `node:zlib`。

---

## 5. 已知性能事实汇总（`【实测】`，可直接引用）

| # | 事实 | 值 |
|---|---|---|
| F-1 | 主 chunk 实测 | **381.09 KiB raw / 118.89–118.91 KiB gzip** |
| F-2 | 主 chunk 余量 | **9.3% raw / 11.9% gzip** |
| F-3 | 预热预算 | **600 KiB gzip**，当前三包（ielts/kaoyan/toefl）gzip 合计 **497.03 KiB** |
| F-4 | 预热余量 | **17.2%** |
| F-5 | inline / lazy 包数 | **inline 7 包 / lazy 3 包** |
| F-6 | inline 词数硬上限 | **1000 词** |
| F-7 | inline 体积硬上限 | **words 体积 ≤ 64 KiB**（当前 36.17 KiB） |
| F-8 | inline 传导比 | **1:1.0005**（kaoyan 改 inline ⇒ 主 chunk +471.92 KiB raw / +166.41 KiB gzip） |
| F-9 | 主 chunk gzip 压缩比 | **31.1%**（121412 / 390232） |
| F-10 | `words-*` chunk gzip 压缩比 | **35.1%–35.3%** |
| F-11 | 全树 gzip 压缩比 | **34.2%**（644146 / 1884569） |
| F-12 | 首屏关键路径 gzip | **124.87 KiB**（HTML 0.96 + 主 JS 118.57 + 主 CSS 5.34） |
| F-13 | 模块数 | **1939 modules transformed** |
| F-14 | 构建耗时 | **21–25s**（Vite 自报）；挂钟 37–51s；**历史记录 7.07s 本机未能复现** |
| F-15 | 构建耗时集中点 | `vite:build-html` 单次调用占 **92%（23.2s）** |
| F-16 | 运行时依赖数 | **4 个**（react / react-dom / lucide-react / canvas-confetti） |
| F-17 | `words-*` chunk 数 vs lazy 包数 | **3 vs 3（刚好相等，零余量）** |
| F-18 | manifest 单包最大 / 全库 | **1.40 KiB** / **13.08 KiB** |

---

## 6. 性能监控缺口清单（**必须明确写出**）

### 6.1 `PERF-002` · 无性能监控基线

| 缺口 | 状态 | 说明 |
|---|---|---|
| **Lighthouse** | ❌ **无** | 无任何 Lighthouse 配置、无 `lighthouse-ci`、无 `@lhci/cli` 依赖、无人跑过并落盘报告 |
| **FCP 采集** | ❌ **无** | 代码中无 `PerformanceObserver` / `performance.getEntriesByType` 采集 |
| **LCP 采集** | ❌ **无** | 同上 |
| **TTFB 采集** | ❌ **无** | 同上 |
| **CLS / INP / TBT** | ❌ **无** | 同上 |
| **内存压测** | ❌ **无** | 无内存泄漏检测、无 `--max-old-space-size` 压力场景、无堆快照对比 |
| **CPU/长任务剖析** | ❌ **无** | 无 `--cpu-prof` 常态化流程 |
| **真实用户监控（RUM）** | ❌ **无** | 无采集端点、无上报（纯静态站，无后端） |
| **合成监控 / 定时拨测** | ❌ **无** | `MONITORING.md` 状态 `📐 待建` |
| **回归对比（历史趋势）** | ❌ **无** | 无"上次 vs 本次"自动比对 |

### 6.2 已有的性能相关资产（**唯一的一块**）

| 资产 | 内容 | 强度 |
|---|---|---|
| `scripts/check-bundle.mjs`（体积门禁 3 项） | 主 chunk raw/gzip、`words-*` chunk 数、预热预算 | **强**：三态语义（`UNKNOWN` 视为不通过）、内容特征反查归属、inline 泄漏检测、零依赖 |
| `scripts/content/validate.mjs` 第 19 项 | inline 预算（≤ 1000 词 / ≤ 64 KiB） | **强**：把"首屏会不会被撑大"变成门禁 |
| `scripts/content/validate.mjs` 第 17 项 | manifest 体积（单包 ≤ 8 KiB / 全库 ≤ 40 KiB） | **强**：守护"manifest 常驻首屏"的设计前提 |
| inline 传导比的定量实测 | 1:1.0005 | **强**：把"inline 撑大首屏"从直觉变成可计算 |

### 6.3 `【实测】` 交付物与缺口的落差

| 维度 | 有基线？ |
|---|---|
| **体积（bundle size）** | ✅ **有** —— 3 项门禁 + 本文件基线表 |
| **构建时长** | ⚠️ **有数字但无门禁** —— 且本机数字与历史记录不一致 |
| **加载性能（FCP/LCP/TTFB）** | ❌ **无** |
| **运行时性能（长任务、内存、流畅度）** | ❌ **无** |
| **真实用户侧性能** | ❌ **无** |

**`【主观】` 结论**：**本项目有"体积治理"，没有"性能治理"。** 两者不可互换 —— 体积是**可达性的代理指标**，不是**体验的度量**。一个 124 KiB gzip 的首屏在低端移动设备 + 4G 下完全可能是 3s+ 的 LCP，而这一点**当前无法从任何数据中得知**。

---

## 7. 如何复现本基线（命令清单）

### 7.1 最小复现（体积基线）

```bash
# 0. 环境确认
node -v                    # 期望 v22.x
npm -v                     # 期望 8.x

# 1. 清空产物（关键：避免读到陈旧 dist）
rm -rf dist

# 2. 构建（含 tsc -b 类型检查）
npm run build              # 期望：1939 modules / built in ...s

# 3. 体积门禁 3 项
npm run check:bundle       # 期望：PASS：3 项全部通过

# 4. 逐文件 raw + gzip 精确测量（与 §3.1 表一致）
python -c "
import os, gzip
rows=[]
for dp,dn,fn in os.walk('dist'):
    for f in sorted(fn):
        p=os.path.join(dp,f)
        raw=os.path.getsize(p)
        gz=len(gzip.compress(open(p,'rb').read(),9))
        rows.append((p,raw,gz))
rows.sort(key=lambda r:-r[1])
print('%-46s %12s %12s %10s %10s' % ('path','raw_B','gzip_B','raw_KiB','gzip_KiB'))
for p,raw,gz in rows:
    print('%-46s %12d %12d %10.2f %10.2f' % (p,raw,gz,raw/1024,gz/1024))
print('%-46s %12d %12d %10.2f %10.2f' % ('TOTAL',
    sum(r[1] for r in rows), sum(r[2] for r in rows),
    sum(r[1] for r in rows)/1024, sum(r[2] for r in rows)/1024))
"
```

### 7.2 内容侧体积（inline 预算与 manifest 预算）

```bash
npm run content:validate   # 含第 17 项 manifest 体积、第 19 项 inline 预算、第 20 项策略一致性
npm run content:list       # 逐包词数（用于核对 inline 346 词 / lazy 9000 词）
```

### 7.3 构建耗时复现（含插件归因）

```bash
rm -rf dist
time npm run build         # 关注：vite 自报 built in Xs、[PLUGIN_TIMINGS] 段
```

> **复现注意**：`[PLUGIN_TIMINGS]` 默认只在构建较慢时打印（vite 内置阈值）。本机 21–25s 时会打印。**若复现得到 7s 且无该段，说明环境更快，属正常差异** —— 记录你的环境一并归档。

### 7.4 生产侧传输量复现（**必须加 `--noproxy '*'`**）

```bash
P=https://geek-typing.pages.dev

# 主 chunk hash（从线上 HTML 取，不要用本地 hash）
curl -s --noproxy '*' $P/ | grep -o 'assets/index-[^"]*\.js'

# 压缩传输量实测（与本文件 §3.2 表对照）
for u in / /assets/index-Cawl4_-q.js /assets/index-DWqJDTkw.css /sw.js; do
  for enc in br gzip identity; do
    printf "%-32s %-9s " "$u" "$enc"
    curl -sS -o /dev/null --max-time 25 --noproxy '*' \
      -H "Accept-Encoding: $enc" -w "transferred=%{size_download}\n" "$P$u"
  done
done
```

> **本机环境坑**：`https_proxy=http://127.0.0.1:64500` 存在，**不加 `--noproxy '*'` 会得到假失败**（历史见 `FLAKY-002`）。

### 7.5 完整门禁一键复现

```bash
npm run content:validate && \
npm run test:content && \
rm -rf dist && npm run build && \
npm run check:bundle
```

---

## 8. 优化方向与风险（`【主观】` 全部标注）

### 8.1 若需为主 chunk 减重

| 方向 | 预估收益 | 依据强度 | 风险 |
|---|---|---|---|
| 把部分 inline 包改成 lazy | 每个约 **5.17 KiB raw**（36.17/7） | `【实测】` 1:1.0005 传导比 ⇒ 收益=该包 `words.json` 体积 | 增加一次网络请求；小库 inline 的初衷（省一次请求）被放弃 |
| `lucide-react` 按需导入 | **需实测** | `【未能实测】` — 本轮未做依赖体积剖析（无 bundle analyzer） | 改错导入方式可能影响 tree-shaking |
| 清理 registry 里"已声明但未被注册项使用"的静态 import 死代码 | **需实测** | `【实测】` 死代码**确实存在**（`scripts/content/validate.mjs` 的 `registryLoadMode()` 注释明确记录） | 低 |
| 检查 `canvas-confetti` 是否可延后加载 | **需实测** | `【未能实测】` | 低（仅结算时用） |

> **`【未能实测】` 说明**：本轮**未做依赖级体积剖析**（项目无 `rollup-plugin-visualizer` 之类的 analyzer，也未加装）。上表的"预估收益"均为**推算**，不是测量值。**若要据此做优化决策，请先补一次依赖剖析。**

### 8.2 若需提升预热预算余量（`A-3`）

| 方向 | 收益 | 风险 |
|---|---|---|
| 把预热包列表从硬编码改为"由 registry 的 lazy 列表派生" | 消除"新增包需手改源码"的耦合 | `【主观】` 会让预热范围随 lazy 包数增长而线性增长 ⇒ 需同时引入"预热优先级"概念 |
| 引入预热优先级（如只预热用户当前选中的库 + 1 个相邻库） | 预算占用随使用行为而非包总数增长 | 实现复杂度上升；需先有"用户当前库"的持久化口径 |
| 维持现状 + 明文记录余量 | 零成本 | 余量 17.2%，**再加 1 个 lazy 包即破线** |

### 8.3 必须先补的能力（`【主观】` 优先级建议）

| 优先级 | 事项 | 理由 |
|---|---|---|
| 🔴 P0 | **`check-bundle` 接入 CI** | 余量仅 9.3%，而门禁只在开发者本机跑（`DEBT-002`）。3 行 YAML |
| 🟠 P1 | **引入 Lighthouse CI（或至少一次人工 Lighthouse 基线）** | 当前对 FCP/LCP/TTFB **一无所知**；一个静态站引入 LHCI 成本很低 |
| 🟠 P1 | **一次依赖体积剖析并落盘** | 8.1 的四个方向全部"需实测"，无剖析无法决策 |
| 🟠 P1 | **给构建耗时加一个宽松上限告警** | 本机 21–25s vs 历史 7.07s，**差异未被解释**；无告警则永远发现不了劣化 |
| 🟡 P2 | **内存压测（长会话词库切换 + 背单词翻面 N 次）** | 9000 词 lazy 包全量驻留内存，配额行为未知 |
| 🟡 P2 | **统一文档中的体积口径说明** | kB（十进制）vs KiB（二进制）混用已造成过混淆 |

---

## 9. 客观实测 vs 主观判断（分离声明）

### 客观实测（可直接采信，均标注 `【实测】`）

本文档中所有 `【实测】` 条目，包括：

- §1 基线总表的**全部数字**（主 chunk 381.09/118.57、预热 497.03、inline 346 词/36.17 KiB、manifest 1.40/13.08 KiB 等）。
- §2.2 两次构建的耗时（Vite 自报 25.12s / 21.27s；挂钟 50.518s / 37.424s）、`1939 modules transformed`、`[PLUGIN_TIMINGS]` 的 `92% / 23.2s` 归因。
- §2.3 完整构建输出逐行。
- §2.4 两种口径的换算校验（390.23 kB ↔ 381.09 KiB；gzip level 差异 1316 B）。
- §3.1 `dist/` 全树 15 个文件的 raw / gzip 字节数（Python `gzip.compress(level=9)` + `os.path.getsize`）。
- §3.2 生产实际传输量 4 资源 × 3 编码共 12 个字节数；线上主 chunk 与本地差 31 B。
- §3.3 registry 10 个注册项的 localId 与策略；inline 7/lazy 3；词数 346/9000。
- §3.4 1:1.0005 传导比与 +471.92 KiB / +166.41 KiB 增量（引自仓库内实测注释）。
- §4.1 三个阈值常量、三态语义、`PROBE_COUNT=8` / `PROBE_MIN=3`、`lastIndexOf('function warmUpVocabulary')` 陷阱。
- §4.2 预热三包与各自 chunk 的 gzip（166.96 / 166.95 / 163.12）。
- §4.3 门禁前置依赖与各失败语义（自源码）。
- §6.1 全部"无"的缺口（依据仓库内无对应依赖/文件/代码：`grep` 零命中）。
- §6.2 已有资产清单。
- §8.1 "死代码确实存在"（依据 `scripts/content/validate.mjs` 注释原文）。

### 主观判断（仅供参考，需你决策）

- §1.1 主 chunk 余量的**直观含义换算**（"约 3.7 个 inline 小包"）与"哪类依赖会击穿"。
- §3.4 "lazy 是首屏体积的唯一调节阀"这一概括。
- §4.2 `A-3` 的**风险判断**（"再塞 1 个包就破线"）。
- §6.3 "本项目有体积治理、没有性能治理"的结论与"体积是代理指标不是体验度量"的论述。
- §8 的**全部优化方向、收益预估与优先级**。（8.1 表中"预估收益"为推算，非测量值。）
- §2.2 关于耗时差异归因于 Esafenet 的推断。

### 未能实测 / 无法核实（**不编数字**）

| 项 | 原因 |
|---|---|
| **Lighthouse 报告** | 项目无 Lighthouse 相关依赖与配置；本轮未引入。**无任何性能指标（Performance/SEO/A11y/Best Practices）得分** |
| **FCP / LCP / TTFB / CLS / INP / TBT** | 代码与测试中**无任何采集**；本轮未新增采集（任务限定不改源码）。**本文档不含这些数字，也不做估算** |
| **内存压测** | 无压测脚本；本轮未做。**9000 词 lazy 包全量驻留的内存占用未知** |
| **依赖级体积剖析** | 项目无 `rollup-plugin-visualizer` 类工具；本轮未加装（会改动 `package.json`）。⇒ §8.1 的收益列**全部为推算** |
| **`lucide-react` 实际打包进去多少** | 同上，无剖析工具 |
| **构建耗时 7.07s 的复现与控制变量验证** | 本机受 Esafenet 透明加密驱动影响；**无法临时卸载以做对照实验** ⇒ "是驱动导致"为推断而非结论 |
| **低端设备 / 弱网下的真实加载表现** | 无设备farm、无网络限速场景、无 RUM ⇒ **完全未知** |
| **主 chunk 在浏览器中的解析/执行耗时** | 无 `--cpu-prof` 采集 |
| **`dist/` 中 PNG/SVG 图标的实际渲染性能影响** | 未测量（体积极小，判断为可忽略 —— `【主观】`） |
| **`/robots.txt` 与 sitemap 的体积治理** | `public/robots.txt`（4.07 KiB）**内容不可读**（本机 Esafenet 透明加密，本地与线上两份副本均为密文）⇒ 无法评估其内容是否必要 |

---

## 10. 复现清单速查（一页）

```bash
# —— 环境 ——
node -v && npm -v

# —— 体积基线（三步）——
rm -rf dist && npm run build && npm run check:bundle

# —— 逐文件精确测量（Python, level 9）——
python -c "
import os, gzip
rows=[]
for dp,dn,fn in os.walk('dist'):
    for f in sorted(fn):
        p=os.path.join(dp,f); raw=os.path.getsize(p)
        rows.append((p, raw, len(gzip.compress(open(p,'rb').read(),9))))
rows.sort(key=lambda r:-r[1])
for p,raw,gz in rows: print('%-46s %10d %10d %8.2f %8.2f' % (p,raw,gz,raw/1024,gz/1024))
print('TOTAL', sum(r[1] for r in rows), sum(r[2] for r in rows))
"

# —— 内容侧预算 ——
npm run content:validate && npm run content:list

# —— 构建耗时 + 插件归因 ——
rm -rf dist && time npm run build

# —— 生产传输量（务必加 --noproxy '*'）——
P=https://geek-typing.pages.dev
curl -s --noproxy '*' $P/ | grep -o 'assets/index-[^"]*\.js'
for enc in br gzip identity; do
  curl -sS -o /dev/null --noproxy '*' -H "Accept-Encoding: $enc" -w "$enc %{size_download}\n" $P/
done
```

**阈值备忘**：主 chunk raw **420 KiB** / gzip **135 KiB**；预热 gzip **600 KiB**；inline **1000 词 / 64 KiB**；manifest **8 KiB 单包 / 40 KiB 全库**。

---

## 11. 关联文档

| 文档 | 关系 |
|---|---|
| `12-infrastructure/BUILD.md` | 构建链、分包机制、`A-3` 硬编码预热、耗时 7.07s（**本机未复现**） |
| `12-infrastructure/DEPLOYMENT.md` | 体积门禁为何不在 CI、修复成本 |
| `12-infrastructure/OFFLINE.md` | 预热与 SW cache-first 的配合 |
| `13-acceptance/FINAL_ACCEPTANCE.md` | §3 构建与体积实测（本文档与之一致，补全了逐文件明细与口径分析） |
| `13-acceptance/KNOWN_ISSUES.md` | `PERF-001`（余量偏紧）、`PERF-002`（无性能监控）、`A-3` |
| `13-acceptance/RELEASE_CHECKLIST.md` | §4 构建与体积的勾选项 |
| `09-testing/PERFORMANCE_TEST.md` | 测试策略视角（状态 `🔄 混合`：bundle 门禁真实，无 Lighthouse/压测） |
