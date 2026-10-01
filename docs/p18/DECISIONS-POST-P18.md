# P18 后决策（B 步）· 三项决策的产品口径与工程方案

> 承接 `docs/p18/P1.8-SIGN-OFF-v1.0.md` §4 遗留项移交清单的 B 步三项（9.1 / 9.2 / 9.5）。
> 本文件只做**决策与方案**；实施见各波提交。三条硬约束贯穿全文：
> ① B 步不属于 P18 已闭合范围，可动判据与代码，但**必须新开证据波次**留机器证据；
> ② 预算**只许降不许升**（INV-3）；③ 凡是"两边必须同步"的地方，**不靠注释靠单一事实源**。

---

## 0. 三项决策一句话结论

| # | 项 | 决策 | 落点 |
|---|---|---|---|
| 9.2 | `warmUpVocabulary` 按需 + 限量 | **清单常量化（`WARMUP_IDS`）+ 清单长度硬顶（≤ 2）+ 新库默认不入清单**，预算只受清单控制、不再随包数线性膨胀 | 已实施（P18-I） |
| 9.5 | 7 个 inline 词库改 lazy | **只改 2 个（`frontend` / `cloud-native`），其余 5 个保持 inline**；改 lazy 的必须给骨架屏 + 失败重试 | 本文件定口径，实施待排 |
| 9.1 | R2 / `AssetManifest` | **不自行造凭据网关**；产品前置条件 = 媒体资源清单覆盖 6 类内容类型 + `/media/*` 提供同源直链与离线兜底；凭据就位后单开半波 | 本文件定前置条件，实施待凭据 |

---

## 9.2 `warmUpVocabulary` 改按需 + 限量 【已实施 · P18-I】

### 9.2.1 现状（实测，非二手）

- **实现**：`src/core/content/registry.ts:220-222`
  `Promise.allSettled([loadIelts(), loadKaoyan(), loadToefl()]).catch(() => {})` —— 硬编码 3 个库，**无上限**。
- **loader**：`registry.ts:64-66` `loadIelts` / `loadKaoyan` / `loadToefl`（各自 `import('.../words.json?raw')`）。
- **触发点**：`src/main.tsx:62-66`，`window load` → `requestIdleCallback(..., { timeout: 4000 })`；
  前置条件 `main.tsx:48-57` 等 SW `ready` + `controller`；`main.tsx:41-44` 省流模式（`saveData` / `slow-2g|2g|3g`）整段跳过。
- **预算**：`scripts/check-bundle.mjs:69` `const WARM_GZIP_MAX = 600 * 1024`；
  实测预热三库 gzip 合计 **496.89 KiB**（ielts 166.87 + kaoyan 166.85 + toefl 163.17），余量 **17.2%**。
- **判据锚点**：`check-bundle.mjs:162-175` `parseWarmUpIds()` 用 `lastIndexOf('function warmUpVocabulary')`
  锚定函数定义 → 取其后 600 B 内 `allSettled([...])` 的 `xxx()` 调用名 → 反查 entries 的 `loader` 名 → 出包名。

### 9.2.2 侦察到的关键陷阱（这是本项决策的核心）

`parseWarmUpIds` 是**文本扫描判据**：它靠"预热实现被写成了什么样"来反推"预热了哪些包"。

因此任何把预热名单从代码里彻底拿掉的改造 —— 动态清单、config 驱动、运行时按包体积算、注册表全量扫 ——
都会让判据 3 从"能算"变成 **解析不到 ⇒ `UNKNOWN` ⇒ 不通过**（`check-bundle.mjs:595-596`）。

更隐蔽的失败形态：**改造后判据仍在跑、仍判绿，但它算的是"候选集"而不是"实际预热集"** ⇒ 假通过。
例如写成 `Promise.allSettled(WARMUP_POOL.map(id => getPackage(id).load()))`，
判据若仍从 `allSettled` 里抠出 `WARMUP_POOL` 里 loader 名，**一个 loader 名都抠不到 ⇒ 判 UNKNOWN**；
若抠到的是"全注册表 loader"，则算出来的数字是全体 lazy 包（约 700+ KiB）⇒ 反而会误判红。

> 教训与"派生 vs 对账"那条一致：**判据要能算出它声称算的东西**。
> 「由 X 派生」时改 X 会让两边同步变化 ⇒ 判据在源侧永远无法被证伪。
> 所以新机制必须让**"实际预热了哪些包"是一个可被独立读取的显式常量**，而不是运行时计算的产物。

### 9.2.3 决策

**（1）清单常量化 —— 唯一事实源**

在 `src/core/content/registry.ts` 导出一个显式数组常量，运行时**只按它加载，绝不自行扩张**：

```ts
/** 预热清单（唯一事实源，check-bundle 第 3 项判据同语法解析；运行时不得自行扩张）。 */
export const WARMUP_IDS = ['ielts', 'toefl', 'kaoyan'] as const
```

`warmUpVocabulary()` 改为按清单取 `getPackage(id)?.load?.()` 执行。

**（2）限量 —— 清单长度硬顶 + 扩词不再自动爆预算**

- 硬顶常量 `WARMUP_MAX_IDS = 2`（**当前清单 3 项需在实施时收到 2 项**：见 9.2.4 取舍）。
- **新增任何大词库（GRE / Oxford / …）默认不在 `WARMUP_IDS` 里** ⇒ 预热预算**不再随包数线性膨胀**。
  这一条直接满足 `content/README.md:611` 的硬性前置（"在新增 GRE / Oxford 之前必须先改预热机制"）。

**（3）按需 —— 只做"兜底集 + 触发面收窄"，排序类按需留下一波**

- "按需"在本波落实为三件事：**清单变短**（3→2）、**触发面不变**（idle 预热保留，离线可切大词库的价值要保持）、
  **省流模式仍整段跳过**（`main.tsx:41-44` 保持）。
- **明确不做**：按用户最近使用排序 / 按学习进度预测 —— 这需要产品口径（近期使用记多久？跨设备？）
  且会牵动持久化存储与学习服务，留到 D 步内容扩充时一并设计。**本波不碰存储与学习服务。**

**（4）预算口径**

`WARM_GZIP_MAX = 600 KiB` **保持不变**（不是 INV-3 主 chunk 预算，收紧也无必要；真正的问题是无限膨胀，不是当前超了）。
新增判据做**棘轮**：清单长度只许降不许升。

### 9.2.4 清单取哪 2 个（取舍）

三库体积几乎相同（166.87 / 166.85 / 163.17 KiB gzip），**体积不是区分度**，得看产品路径：

| 包 | 用户路径 | 结论 |
|---|---|---|
| `kaoyan`（考研） | 国内考研人群是本站主要目标用户，切词库频次最高 | **保留** |
| `toefl`（托福） | 标准化考试，备考路径明确 | **保留** |
| `ielts`（雅思） | 与 toefl 同属"出国考试"，目标人群大概率二选一 | **移出清单**（但**仍保留 lazy + 可被按需加载**，用户切过去照常秒开） |

理由：雅思/托福目标人群重叠度高，**预热其中 1 个即可覆盖"出国考试"意图**，把省下的 ~166 KiB 留给未来 GRE/Oxford 落地。
移出的库**不是被砍掉**，仍然 lazy 可加载、仍然离线可用 —— 只是不做空闲期后台预拉（省流量 + 给新库腾预算）。

> ⚠️ 这条是**产品决策**，可推翻：若认为雅思用户量显著高于托福，把 `toefl` 移出、`ielts` 留下即可，
> 改一个数组字面量、重跑判据，不需要动结构。

### 9.2.5 判据怎么跟（必须同步，否则判 3 会 UNKNOWN）

- `parseWarmUpIds` 改为解析 `const WARMUP_IDS = [...]` 数组，包名直接比对 entries 的 `localId`
  （**比原来"抠 loader 函数名再反查包名"少一层间接，更不容易错**）。
- 新增判据 6：清单长度 `WARMUP_IDS.length ≤ WARMUP_MAX_IDS`，且 **≤ 基线记录值**（棘轮，只许降）。
- 每条新判据都必须自带证伪注入点（见 9.2.6）。

### 9.2.6 验收口径（可机器验证）

| # | 判据 | 命令 | 期望 |
|---|---|---|---|
| A | 预热清单可解析、长度 ≤ 上限 | `node scripts/check-bundle.mjs` | 判据 3 PASS，清单列出 2 包 |
| B | 预热 gzip 合计仍 ≤ 600 KiB | 同上 | PASS（约 330 KiB 后） |
| C | 清单长度棘轮不被顶破 | 同上有棘轮记录 | 只许降 |
| D | **判据能判红**：往 `WARMUP_IDS` 塞第 3 个包 | `node scripts/check-bundle.mjs --falsify` | 判据 3/6 恰好判红，命中集 = 预期 |
| E | **判据能判红**：删掉 `WARMUP_IDS` 常量 | 同 `--falsify` | `UNKNOWN`（解析不到 ⇒ 不通过，不是悄悄放行） |
| F | 预热函数实际只加载清单内的包 | `node scripts/content/validate.mjs \| grep -i warm` / e2e | 网络请求数 = 清单长度 |

### 9.2.7 遗留

- 按用户偏好排序的"真按需"：留 D 步，需产品口径 + 持久化设计。
- 本波**没有**新增 `WARMUP_GZIP_BUDGET` 的运行时字节钳制 —— 运行时拿不到 gzip 尺寸，
  **在构建期判据里算才是唯一诚实的位置**；硬塞进运行时只会得到一个"永远不触发的保险丝"。

---

## 9.5 7 个 inline 词库改 lazy 【本步定口径，实施待排】

### 9.5.1 现状（实测）

`node scripts/content/validate.mjs` 实测：**inline 7 包 = 346 词 / 36.17 KiB**，未超 inline 预算（1000 词 / 64 KiB）：
`ai-core(43词/2.27KiB)`、`cet4(84词/12.06KiB)`、`cet6(69词/9.61KiB)`、`cloud-native(30词/1.55KiB)`、
`frontend(20词/0.97KiB)`、`go-code(50词/4.54KiB)`、`ts-code(50词/5.17KiB)`；**lazy 11 包**。

inline 的收益是"首屏可得、零等待"；代价是**永不卸载、全留在主包里的常驻内存 + 主 chunk 体积**。

### 9.5.2 决策：**只改 2 个，其余 5 个保持 inline**

判定指标 = **体积 ÷ 首屏必需度**（不是单纯看体积大小）：

| 包 | 体积 | 首屏/高频路径 | 判定 |
|---|---|---|---|
| `frontend` | 0.97 KiB | **工具站首页可按任意键打字**，词库是核心入口 | → **改 lazy** |
| `cloud-native` | 1.55 KiB | 同上（开发者向默认词库之一） | → **改 lazy** |
| `ai-core` | 2.27 KiB | 默认/高频 | 保持 inline |
| `cet4` | 12.06 KiB | **最大单包、国内用户基数最大、默认库候选** | 保持 inline（一旦改 lazy，最用户的路径反而变慢） |
| `cet6` | 9.61 KiB | 高频、与 cet4 同人群 | 保持 inline |
| `go-code` | 4.54 KiB | 中频 | 保持 inline |
| `ts-code` | 5.17 KiB | 中频 | 保持 inline |

**合计只省 2.52 KiB（不是 36 KiB）。** 这是一条必须说清楚的预期修正：
评审把"7 个 inline 词库改 lazy（约 36 KiB）"整体作为一项，
但 36 KiB 是**七包总和**，而这七个包在首屏的价值差别极大 —— **一刀切改 lazy 会拿最贵的延迟换最便宜的体积**。

> 若评审认为 cet4（12 KiB）也该走 lazy，明确一句即可：`content/vocabulary/cet4/manifest.json` 的
> `delivery` 字段从 `inline` 改 `lazy` 并跑 validate，主 chunk 省 12.06 KiB，
> 代价是cet4 从"零等待"变成"首屏有骨架屏"。**这条我没替你决定，因为它同时是产品取舍。**

### 9.5.3 UX 加载态（改 lazy 的那 2 个必须配套）

- **骨架屏**：词库面板用固定的 6 行骨架占位（行数固定 ⇒ 布局零跳动），文案走 i18n（不能硬编码中文）。
- **失败兜底**：加载失败 → 展示"重试"按钮 + 降级到 `cet4`（若 cet4 亦 inline 则瞬时可用）；不弹原生 alert。
- **可取消**：切词库/关闭面板时 `AbortController.abort()`，不残留 pending。
- **离线**：无网络时 lazy 请求必然失败 ⇒ 必须有明确文案（"离线中，已加载词库仍可用"），不能白屏。

### 9.5.4 影响面（必须同步改的判据）

| 判据 | 位置 | 影响 |
|---|---|---|
| inline/lazy 策略一致性 | `scripts/content/validate.mjs` | 7/11 的分界变了 ⇒ 一致性判据的期望数字要跟着改 |
| inline 预算 | 同上 | `Σ 346 词 / 36.17 KiB` → 期望值变小 |
| 数据 chunk 数 | `check-bundle.mjs` 判据 2 | lazy 包 11 → 13 ⇒ **chunk 数必须 ≥ 13**，否则判红 |
| lazy 不得进主 chunk | 判据 5 | 这两个包会成为被探测的对象（探测词扫描自动生效） |

### 9.5.5 验收口径

- `node scripts/content/validate.mjs` → inline 数 7→5、lazy 11→13、inline Σ 词/字节按实测更新
- `node scripts/check-bundle.mjs` → 判据 2 数据 chunk ≥ 13、判据 5 这两个包**命中 0**（真没进主 chunk）
- `node scripts/check-bundle.mjs --falsify` → 注入把 `frontend` 改回 inline ⇒ 判据 2 或 5 恰好判红
- 主 chunk 体积下降实测记录（期望 −2.5 KiB 上下，不是 36 KiB）

---

## 9.1 R2 / `AssetManifest` 【本步定前置条件，实施待 Cloudflare R2 凭据】

### 9.1.1 现状

产物尚不存在（无 `AssetManifest`、无 `/media/*`），按裁定 ⑩-5 **不许记 PASS**。
卡点是**外部凭据**（Cloudflare R2 绑定），工程侧无法自行造。

### 9.1.2 产品前置条件（凭据就位前产品侧要先答清的）

| # | 问题 | 本轮建议口径 |
|---|---|---|
| 1 | `AssetManifest` 要覆盖哪些内容类型 | **6 类**：listening / audio / reading / speaking / writing / exercise（与现有 `content/<type>/` 一一对应），collection 类（study-set）不需要媒体清单 |
| 2 | `/media/*` 同源代理的意义 | 三个：① 规避第三方 CDN 跨域与 CSP；② 统一 Referer/鉴权；③ **让 SW 能缓存**（跨源资源 SW 兜不住，离线会缺媒体） |
| 3 | 凭据就位后怎么验收（用户可感知） | ① 任意媒体页首播 < 1.5 s；② **断网后已看过的媒体仍可重听**（SW 命中）；③ LCP 不因媒体退化 |
| 4 | 失败兜底 | 媒体 404/超时 → 该素材隐藏 + 文案提示，**不得整页崩**（`AppErrorBoundary` 已就位，但要细粒度） |

### 9.1.3 工程侧会给什么（凭据就位后）

- 构建期生成 `AssetManifest`：`<contentId, assetId, url, sha256, bytes, mime, width?/duration?>` 逐资产登记。
- `/media/*` 走 Pages Functions 同源代理（dev 走 vite proxy），**双份配置各司其职、不共用一份易错代码**。
- 判据自带证伪：扩展名白名单（`.json/.md/.txt`）+ NUL 嗅探（前 8192 B）双通道沿用 INV-4 的写法；
  注入一个"文件名是 .json 但内容是 PNG"的资产 ⇒ 判据必须判红。

### 9.1.4 下一步

凭据绑定完成后需评审人单独放行开工 —— **本项不自行推进**。

---

## 附：三项之间没有关系依赖

- 9.2 已实施完毕（P18-I），是 D 步扩词的**硬前置**，已解除。
- 9.5 与 9.2 无依赖，可独立排期；注意 9.5 会动 `check-bundle` 判据 2/5，与 9.2 的判据 3/6 **互不重叠**，可同波或分波。
- 9.1 卡外部凭据，与另两项无关。
