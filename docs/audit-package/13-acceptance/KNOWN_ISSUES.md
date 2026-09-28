# KNOWN_ISSUES.md · 已知问题清单

> 状态：`【已有】` —— 全部可在当前 commit `4152eb2` 复现或已在实测中观察到
> 原则：**不掩盖问题**。失败历史比通过记录更有价值。

编号规则：`BUG-` 功能缺陷 / `FLAKY-` 不稳定 / `DEBT-` 技术债 / `UX-` 体验 / `PERF-` 性能 / `CONTENT-` 内容

---

## 🔴 高

### BUG-002 · Service Worker 可缓存 SPA fallback，导致 `/assets/*` 永久投毒白屏 `【已有·实测·生产活体】`

> **这是本轮审计发现的最高危缺陷。链路每一环均已实测，且当前生产环境处于可触发状态。**

| 项 | 值 |
|---|---|
| **现象** | SW 把「不存在的 `/assets/*` 的 SPA fallback 响应」当作合法 JS 写入缓存；因 `/assets/*` 走缓存优先，该 URL **永久返回 HTML**，应用白屏 |
| **证据 1** | 线上不存在的资源返回 **200 + `text/html` + 2007 B**（应为 404）：<br>`curl -sk -o /dev/null -w "%{http_code} %{content_type} %{size_download}" https://geek-typing.pages.dev/assets/does-not-exist.js` → `200 text/html; charset=utf-8 2007` |
| **证据 2** | 线上真实资源对照：`/assets/index-Cawl4_-q.js` → `200 application/javascript 390201` |
| **证据 3** | `public/sw.js:44-46`（precache）与 `:57-63`（putClean）**均只判 `res.ok`，零 Content-Type 校验** |
| **证据 4** | `public/sw.js:85-94` 对 `/assets/*` **缓存优先**，`caches.match` 命中即返回，**永不回源** ⇒ 一旦中毒无法自愈 |
| **证据 5（已触发的具体 hash）** | `/assets/index-Dw5EkkBq.js` —— 这是**本地当前构建的主 chunk hash**（`dist/assets/index-Dw5EkkBq.js`），线上**不存在该文件**，请求它返回 200 + HTML。而线上 index.html 引用的是 `index-Cawl4_-q.js` ⇒ **漂移已实际发生** |
| **放大器** | `public/_headers` 全局下发 `X-Content-Type-Options: nosniff` ⇒ 浏览器**必定拒绝执行** HTML 冒充的 JS，**不会 sniff 纠正** ⇒ 后果从"可能白屏"变为"**必定白屏**" |
| **根因** | ① Cloudflare Pages SPA fallback 对 `/assets/*` 不做 404（平台行为，无法改）；② SW 写入缓存时不做 MIME 白名单校验（**代码缺陷，本次修复对象**） |
| **影响** | 发生 hash 漂移后，存量用户的 SW 会把 HTML 存进 `/assets/<新hash>.js`；该用户此后**永久白屏**，且因白屏无法加载新 SW 自愈，只能手动清缓存 |
| **定性** | `【已有·实测】`（生产活体，非理论风险） |
| **修复状态** | ✅ **已修复**（见下方「修复记录」） |

#### 修复记录（已实施并验证）

| 项 | 内容 |
|---|---|
| **改动文件** | `public/sw.js`（新增 `MIME_BY_EXT` / `extOf()` / `typeMatches()`；两个写缓存入口均加校验；`CACHE` 升 `gt-shell-v2` → **`v3`**）、`tests/offline-audit.mjs`（新增态 4b 主动注入探针）、`tests/e2e.mjs` + `tests/prod-smoke.mjs`（同步 CACHE 版本号断言） |
| **降级语义** | 对 `/assets/*`：类型不符 ⇒ **不写缓存**且返回 **504**（不把 HTML 交给页面，避免 `Unexpected token '<'` 掩埋根因）；其它路径保持原样（页面本就允许 text/html） |
| **兼容性** | MIME 校验比对**主类型**（`application/javascript` 与 `text/javascript` 均算 JS），非写死字符串 ⇒ 换 CDN 不会误杀 |
| **为何必须升 v3** | `activate` 的「删非当前 CACHE」是清除存量中毒条目的**唯一**机制；不升版中毒用户因白屏收不到新 SW |
| **验证证据** | ① 离线套件 **20/20 通过**（态1/1.5/2/3/4/4b）；② E2E **165/165**；③ **反证实验**：临时摘除两处守卫 ⇒ 态 4b 立刻变红并报 `已投毒：cachedType=text/html` + `status=200 pageGotHtml=true`；恢复后转绿 ⇒ **证明该测试非空转** |
| **残留** | 线上仍是旧版 SW。**必须 push 部署后，存量用户才会在下次访问时升到 v3 并清除中毒缓存。** |

**为什么升 `CACHE` 版本号是关键**：`public/sw.js:69-76` 的 `activate` 已实现「删除所有 ≠ CACHE 的缓存」。升版是**唯一**能清掉存量中毒 v2 条目的机制 —— 不升版，已中毒用户永远收不到修复。

---

### CONTENT-001 · CET 词库覆盖率严重不足

| 项 | 值 |
|---|---|
| 现象 | `cet4` 包仅 84 词，`cet6` 仅 69 词 |
| 期望 | CET-4 考纲约 4500 词，CET-6 约 5500 词 |
| 实际覆盖率 | cet4 ≈ **1.9%**，cet6 ≈ 1.3% |
| 证据 | `content/vocabulary/cet4/words.json`（12,353 B）；manifest `stats.items=84` |
| 影响 | 以"四级/六级"为名的功能无法支撑真实学习 |
| 定性 | `【已有·实测】` |

**备注**：`cet4`/`cet6` 是全库唯二 phonetic 100% 覆盖的包，说明做过精加工，但**词量太小**。

---

### BUG-001 · 9 条词条 definition 为空字符串

| 项 | 值 |
|---|---|
| 现象 | 全库 **9 条**词条的 `definition` 为 `""`（空串，非缺失） |
| 清单 | `ielts:helpline`、`toefl:supercontinent`、`toefl:springwater`、`toefl:geomagnetic`、`toefl:suburbanization`、`toefl:assistantship`、`toefl:survivability`、`toefl:urbanism`、`toefl:urbanite` |
| 证据 | 独立复核脚本 `docs/audit-package/_generated/verify-def.mjs` 实测 |
| **根因** | `scripts/content/normalize.mjs:135-137` 的空值检查**只覆盖 `word` 与 `translation`**，不含 `phonetic` 与 `definition`。所以不是"门禁漏检"，而是"门禁从未设计检查这两项" |
| 派生问题 | manifest `stats.definition` 口径是"**key 存在**"而非"值非空"：ielts 声明 2999（实际非空 2998），带来统计歧义 |
| 影响 | 词条详情页可能出现空释义行；非空覆盖率真值为 **9144/9346 = 97.84%**（不是 97.93%） |
| 定性 | `【已有·实测】` |

**修复建议**：① 扩 `normalize.mjs` 空值检查至 4 字段；② 明确 `stats.*` 的口径（key 存在 vs 值非空）并写入门禁。

---

### CONTENT-004 · 音标体系混用且无字段标识

| 项 | 值 |
|---|---|
| 现象 | `phonetic` 一个字段承载两套标注体系 |
| 证据 | `cet4` 用 IPA（`ˈhelplaɪn`）；`toefl` 用 KK/旧式（`,sju:pә'kɔntinәnt`） |
| 影响 | 前端无法按体系渲染；未来接入 TTS/音频对齐时会错 |
| 定性 | `【已有·实测】` |

---

### CONTENT-005 · `partOfSpeech` 已声明但零数据 —— ✅ 已关闭（P1.6-E）

| 项 | 值 |
|---|---|
| 现象（审计时点） | `normalize.mjs:46` 白名单含 5 个字段，实测数据只出现 4 个，`partOfSpeech` 覆盖率 **0%** |
| 定性 | `【已有·实测】` |
| **处置（P1.6-E）** | **移除字段声明**（`model/vocabulary.ts`、`canonical.mjs:36`、`normalize.mjs:46`、`CONTENT_CONTRACT.md`）。全库 9346 条该键零出现、0 处代码读取、`WordItem` / `WordHit` 均未声明 ⇒ 纯声明层空壳。不补假数据、不写 `[]` 占位；移除后 10 包 `contentChecksum` 逐包不变（`version` / `revision` / `history` 全不动） |
| 状态 | ✅ 已关闭 |

---

### LEGAL-001 · 无 LICENSE 文件、package.json 无 license 字段

| 项 | 值 |
|---|---|
| 现象 | 仓库根目录**无 `LICENSE` 文件**；`package.json` 无 `license` 字段（仅 `private: true`） |
| 影响 | 内容侧声明了 5 个包使用 MIT，而 **MIT 要求随附版权声明与许可全文** —— 合规链条不闭环 |
| 定性 | `【已有·实测】` |
| 成本 | 极低（新增 1 个文件 + 1 个字段） |

---

### SECURITY-001 · 无 CSP

| 项 | 值 |
|---|---|
| 现象 | `grep Content-Security-Policy` 在 `public/_headers`、`index.html`、`vite.config.ts`、`src/` **零命中** |
| 已有安全头 | `X-Content-Type-Options: nosniff`、`Referrer-Policy`、`X-Frame-Options: SAMEORIGIN`、`Cross-Origin-Opener-Policy: same-origin`（4 条） |
| 有利条件 | 本项目无内联脚本、无外部 CDN、仅 4 个运行时依赖 —— **上严格 CSP 的条件已成熟** |
| 定性 | `【已有·实测】` |

---

### UX-004 · 全应用焦点环被移除（WCAG 2.4.7 失败）

| 项 | 值 |
|---|---|
| 现象 | `src/index.css:36-39` 的 `*:focus { outline: none }` 移除了**整个应用**所有元素的焦点环 |
| 注释前提已失效 | 该处注释写「禁止输入类元素获得焦点框（本项目无需输入框）」，**但命令面板 `src/components/CommandPalette.tsx` 确实有输入框** —— 「本项目无需输入框」的前提不成立 |
| 影响面 | **全应用级**：键盘用户（Tab 键导航）在**任何元素（含输入框）**上都看不到焦点位置 |
| 标准违反 | **WCAG 2.4.7 Focus Visible 失败**（当前无任何替代性可见焦点指示） |
| 定性 | `【已有·实测】` |

**修复建议**：删除全局 `outline: none`，改为 `:focus-visible { outline: 2px solid <token>; outline-offset: 2px }`，仅在指针交互时才抑制轮廓。

---

### CONTENT-006 · 三个「考纲包」实为同一 ECDICT 词库的 tag 视图

| 项 | 值 |
|---|---|
| 现象 | `ielts` / `kaoyan` / `toefl` 各 3000 条，**各自内部无重复词形**，但三包间高度重叠 |
| 实测交集 | `ielts∩kaoyan` = **1802**、`ielts∩toefl` = **613**、`kaoyan∩toefl` = **344**、三者交集 = **230** |
| 并集 | 三包合计 9000 条，**并集去重后仅 6471 个词形**（既有文档曾把该并集数写偏大，本轮已按实测订正） |
| 核心结论 | **三个包实为同一 ECDICT 词库按 tag 过滤出的三个视图**，不是三套独立词表。ielts 与 kaoyan 重合度高达 **60.1%**（1802 / 3000） |
| 用户可见影响 | ① 用户**切包学习时会重复见到同一单词**（约 60% 概率）；② 学习记录/掌握度以裸 `word` 为键，跨包重复词**合并为同一条**，**去重与掌握度统计会失真** |
| 定性 | `【已有·实测】` |

**备注**：`content/README.md:101-102` 明确「跨包同词是合法数据关系」—— 这**不是数据缺陷**，但它决定了「按考试分档」不能靠包划分实现，且「加第 4 个 3000 词包」的边际收益极低（详见 `08-exam/IELTS.md` §3.4 / E-3）。

---

### CONTENT-007 · CET 四六级词形完全不相交（且为字母序非词频序）

| 项 | 值 |
|---|---|
| 现象 | `cet4`（84 条）与 `cet6`（69 条）**词形完全不相交**：`cet4 ∩ cet6 = 0` |
| 不合常理 | CET-6 考纲理论上**包含** CET-4 词汇，两包不应完全不相交 |
| 推论 | 两包是**各自独立采样**，而非「6 级 = 4 级 + 增量」 |
| 附带事实 | `cet4` 前 5 条 = `abandon` / `absolute` / `abstract` / `academic` / `accelerate` —— **按字母序**排列，**不是词频序** |
| 对照 | 三个 ECDICT 词频包高度重叠（ielts∩kaoyan = 1802），CET 两包结构与它们**完全不同** |
| 定性 | `【已有·实测】` |

---

## 🟠 中

### DEBT-001 · UI 绕过 Query 层直读词数组（17 处）

见 `GAP_ANALYSIS.md#A-1`。契约已写明边界但未落地。

| 文件 | 违规行号 |
|---|---|
| `src/App.tsx` | 13-21, 127, 133, 150, 690, 722 |
| `src/components/Memorize.tsx` | 54, 68, 96, 269 |
| `src/components/ReviewPanel.tsx` | 4, 136 |
| `src/components/Header.tsx` | 200 |
| `src/components/BankManager.tsx` | 43,44,48,50,61,62,63,65,167,207 |

---

### DEBT-002 · 内容门禁与体积门禁未接入 CI

| 项 | 值 |
|---|---|
| 现象 | `deploy.yml` 只跑 build；`e2e.yml` 只跑 build + e2e |
| 未执行的门禁 | content:validate(20) / check:bundle(3) / test:content(149) / offline(4) / smoke(22) |
| 影响 | 内容或体积击穿阈值仍可正常部署 |
| 证据 | `.github/workflows/deploy.yml`、`.github/workflows/e2e.yml` |
| 定性 | `【已有·实测】` |

---

### UX-001 · 无离线状态 UI

| 项 | 值 |
|---|---|
| 现象 | SW 缓存可用（离线能打开），但应用层**零提示** |
| 证据 | grep `navigator.onLine` / `offline` 在 `src/components/` 零命中 |
| 影响 | 用户离线时不知道自己处于离线态，也不知道"学习记录可能未同步" |
| 定性 | `【已有·实测】` |

---

### UX-002 · 词库加载失败无用户反馈

| 项 | 值 |
|---|---|
| 现象 | lazy chunk 加载失败时仅 `console.warn`，UI 无任何提示 |
| 证据 | `src/App.tsx:164-167` |
| 影响 | 弱网下用户看到空白却不知原因 |
| 定性 | `【已有·实测】` |

---

### UX-003 · 无全局错误边界

| 项 | 值 |
|---|---|
| 现象 | 无 `ErrorBoundary` / `componentDidCatch` |
| 影响 | 任意组件抛错 → 白屏 |
| 定性 | `【已有·实测】` |

---

### UX-005 · 页签控件零 ARIA 语义

| 项 | 值 |
|---|---|
| 现象 | 最核心的页签（Tab）控件**无任何语义标注**：无 `role="tab"`、无 `role="tablist"`、无 `aria-selected` |
| 实测 ARIA 密度 | 全仓 `aria-*` 属性仅 **10 处**（不是 12）；`role=` 仅 **1 处** |
| 对照 | 反倒是命令面板做到了 `role="option"` + `aria-selected` |
| 影响 | 屏幕阅读器无法识别「这是一组页签、当前选中哪一个」，键盘/读屏用户无法建立正确的导航心智模型 |
| 定性 | `【已有·实测】` |

---

### DEBT-008 · inline 1000 词硬上限阻断 CET 扩词

| 项 | 值 |
|---|---|
| 现象 | inline 包词数硬上限 **1000**（`scripts/content/validate.mjs` 第 19 项，常量 `INLINE_MAX_ITEMS = 1000`），另有 64 KiB 字节上限 |
| 实测加载策略 | inline 包 **7 个**、lazy 包 **3 个**（ielts/kaoyan/toefl 三个大包走 lazy） |
| 阻断点 | CET 扩词到 4500+ 词时，**4500 > 1000 上限** ⇒ 第一个动作必然是先改加载策略（inline → lazy），否则直接击穿门禁第 19 项 |
| 衍生约束 | 扩词新增的 lazy chunk 会同时恶化 `warmUpVocabulary()` 预热预算（当前 497.03 / 600 KiB，余量 17.2%，见 `GAP_ANALYSIS.md#A-3`） |
| 定性 | `【已有·实测】` |

**备注**：这不是「加数据」问题，而是**必须先改加载策略 + 先解决预热预算**的工程前置问题（详见 `08-exam/CET.md` §3.3 与 C-2 / C-3 建议）。

---

## 🟡 低

### FLAKY-001 · prod-smoke A3 受部署时序影响

| 项 | 值 |
|---|---|
| 现象 | 本轮实测 21/22，A3（`/` 引用的 bundle 与本地 dist 一致）失败 |
| 根因 | 本地重跑 build 后 hash 变化（`index-Dw5EkkBq.js`），而线上仍是 `index-Cawl4_-q.js` |
| 定性 | **这是检查项按设计正常工作**，报出了真实的"本地/线上漂移"；但也会在"刚上线又本地 build"时误报 |
| 建议 | CI 中运行时加"仅比对 git 已提交产物"的前置条件；或明确该检查仅在部署后窗口期有效 |

---

### FLAKY-002 · 弱网/代理下 prod 门禁抖动

| 项 | 值 |
|---|---|
| 现象 | 历史多次出现 `ERR_CONNECTION_CLOSED` / `net::ERR_FAILED` |
| 已做的缓解 | `tests/prod-smoke.mjs:276-278` 过滤 `net::ERR_FAILED` 与 favicon；`tests/e2e.mjs` 预热探针预算 18s→30s |
| 残留风险 | 真实缺陷可能被过滤规则掩盖 |
| 定性 | `【已有·实测】` |

---

### DEBT-003 · 测试分区编号重复

| 项 | 值 |
|---|---|
| 现象 | `tests/e2e.mjs` 中 `【13】`/`【14】` 各出现两次，`【12】` 排在末尾 |
| 影响 | 无法建立稳定用例索引，审计困难 |
| 定性 | `【已有·实测】` |

---

### DEBT-004 · 文档内部数字不一致 —— **✅ 本轮已修**

| 项 | 值 |
|---|---|
| 现象 | `content/README.md` §10（`:362`）写"17 项门禁"，§13（`:469`/`:477`）写"20 项"（代码实为 20 项）；同文件 `:13` 还把契约测试写成"148 项"（实测 **149**） |
| 修复 | 已改 `content/README.md:13`（17→20 项、148→149 项）与 `:362`（17→20 项）。`content:validate` 实为 20 项（`scripts/content/validate.mjs`）；`test:content` 实为 149 项（实跑输出：`共 149 项，通过 149，失败 0`） |
| 未改 | `:400` 的"门禁第 17 项"是**规则编号引用**（指 checksum 一致性规则），非计数，**有意保留** |
| 定性 | `【已有·实测】` → 已闭环 |

---

### DEBT-005 · 无单元测试与 fixture

| 项 | 值 |
|---|---|
| 现象 | 无 `tests/unit/`、无 `*.test.*`、无 vitest/jest/coverage 配置、无 fixture |
| 影响 | `src/lib/*` 12 个模块零直接测试；validate 的负例无法自动验证 |
| 定性 | `【已有·实测】` |

---

### PERF-001 · 主 chunk 余量偏紧

| 项 | 值 |
|---|---|
| 实测 | 381.06 KiB raw / 118.89 KiB gzip，阈值 420/135 |
| 余量 | **9.3% raw / 11.9% gzip** |
| 风险 | 引入音视频播放器/字幕库极易击穿 |
| 定性 | `【已有·实测】` 数字 + `【主观】` 风险判断 |

---

### PERF-002 · 无性能监控基线

| 项 | 值 |
|---|---|
| 现象 | 无 Lighthouse、无 FCP/LCP/TTFB 采集、无内存压测 |
| 已有 | 仅 bundle 体积门禁 |
| 定性 | `【已有·实测】` |

---

### CONTENT-002 · 7 个包字段贫瘠

| 项 | 值 |
|---|---|
| 现象 | ai-core/cloud-native/frontend/go-code/ts-code 只有 `word` + `translation` |
| 影响 | 详情页无音标、无释义，`features:{phonetic:false,definition:false}` 已如实声明 |
| 定性 | `【已有·实测】`（口径正确，但内容待补） |

---

### CONTENT-003 · 9163 条词条缺 example/audio/pos

| 项 | 值 |
|---|---|
| 现象 | 全库无 `partOfSpeech`（**P1.6-E 已移除该字段声明**）/ `example` / `exampleAudio` / `frequency` / `cefr` / `sense` |
| 影响 | 无法支撑"点击单词看例句、听发音"等核心学习场景 |
| 定性 | `【已有·实测】` |

---

### DEBT-006 · lint 16 个 warning

| 项 | 值 |
|---|---|
| 现象 | `npm run lint` → 16 warnings, 0 errors |
| 内容 | 多为字符类中 `\-` 转义的风格提示（如 `customBanks.ts:78`） |
| 定性 | `【已有·实测】` |

---

### DEBT-007 · `data-testid` 同值重复导致选择器歧义

| 项 | 值 |
|---|---|
| 现象 | `data-testid="open-bank-manager"` 在**两处同值重复** |
| 位置 | `src/components/BankManager.tsx:78` 与 `src/components/Header.tsx:209` |
| 影响 | `[data-testid="open-bank-manager"]` 选择器命中 2 个元素 ⇒ **选择器歧义、测试脆弱**（可能抓到错误元素、或在两元素渲染顺序变化时静默失效） |
| 定性 | `【已有·实测】` |

**修复建议**：为两处分配语义不同的 testid（如 `open-bank-manager-panel` / `open-bank-manager-header`），或明确唯一入口。

---

## 本轮审计引入的改动（需你确认）

### A. 修复类（有验证证据，建议保留）

| 文件 | 改动 | 性质 | 验证 |
|---|---|---|---|
| `public/sw.js` | 新增 `typeMatches()` MIME 校验 + 两个写缓存入口加守卫 + `CACHE` 升 v3 | 🔴 **BUG-002 修复**（安全） | 离线 20/20、E2E 165/165、反证实验变红 |
| `tests/offline-audit.mjs` | 新增态 4b「软 404 主动注入」探针（3 条断言） | BUG-002 回归防护 | 反证实验证明非空转 |
| `tests/e2e.mjs`、`tests/prod-smoke.mjs` | `gt-shell-v2` → `gt-shell-v3`（同步断言） | 版本号一致性 | 各自套件全绿 |
| `content/README.md` | `:13` 17→20 项 / 148→149 项；`:362` 17→20 项 | 文档数字与代码一致（DEBT-004） | `content:validate` 20 项、`test:content` 149 项实测 |

### B. 审计工具类（非产品代码，可保留）

| 文件 | 改动 | 性质 |
|---|---|---|
| `src/components/ResultOverlay.tsx` | 新增 `data-testid="result-overlay"` | 零行为变更的测试钩子；为稳定抓取"结算浮层"截图所必需 |
| `scripts/audit-capture.mjs` | 新增（截图脚本，自带 preview 生命周期 + CDP） | 审计工具 |
| `docs/audit-package/**` | 新增（84 份文档 + 17 截图 + 6 样本 + 6 脚本） | 本资料包 |
| `docs/audit-package/**`（全包一致性回填） | 把 `sw.js` 规格从旧值 **106 行 / 4130 B** 全面订正为实测 **178 行 / 7619 B**（gzip 3441 B）；`gt-shell-v2` → `gt-shell-v3`（21 处，其中 6 处保留为升版对照）；离线断言 `4 态 / 4 例` → **5 态 / 20 项**（含态 4b）；`269 行` → `348 行`；契约 `148` → `149`；门禁 `17` → `20`；构建耗时不再设单一基线 | 消除跨文档自相矛盾 |
| `tests/offline-audit.mjs` | 头部注释与收尾文案 `四态` → `五态` / `全部通过` | 与新增态 4b 一致（无测试断言该文案，改动安全） |

**说明**：
- **全部未 commit、未 push。**
- **A 类建议尽快 commit + push** —— 线上仍是旧版 SW，存量中毒风险持续存在；不部署则修复不生效。
- B 类的保留与否由你决定（不影响功能）。
- 本轮所有门禁现状：content:validate **20/20 PASS**｜test:content **149/149**｜tsc **0 error**｜lint **16 warning / 0 error**（未增）｜build **exit 0**｜check:bundle **3/3**｜e2e **165/165**｜offline **20/20**（含新态 4b）｜verify-samples **76/76**
- 上述 9 项均由本轮**逐一复跑确认**（非引用历史值）；`offline` 正向断言 21 个（含 1 个总结行）/ 失败 0。

---

## P1.5-S1/S3/S5 新增条目（2026-09-28）

| ID | 类别 | 标题 | 严重度 | 状态 | 详情 |
|---|---|---|---|---|---|
| **R-003** | 已修复 | `recordWordDone` 用 lowercase 做单词身份键（三 store 无法 join） | **P0 Blocker** | ✅ CLOSED | `docs/audit-package/13-acceptance/INCIDENT-ANALYTICS-IDENTITY.md`（三段式修复 + 17/17 锁死 + 真实数据 `Case conflict=0` + e2e 167/167） |
| **R-004** | 已修复 | `migrate` 备份的 analytics 键序被 `splitSnapshot` 重排 ⇒ 回滚非逐字节还原 | P1 | ✅ CLOSED | `INCIDENT-MIGRATE-BACKUP-KEYORDER.md`（`preserveBackupKeys` 可选注入；SSR 门禁零破坏 78/78 + 27/27） |
| **B-008** | 已修复 | 4 个 Esafenet 透明加密密文文件（含已入库 `README.md` + 上线产物 `public/robots.txt`） | **P1（生产伤害）** | ✅ **CLOSED** | 根因：本机亿赛通（EsafeNet）透明加密驱动把落盘文件整文件加密，原内容不可恢复；处置（2026-09-28）：`README.md` / `public/robots.txt` 明文重写（README 含不可恢复诚实声明），两个未入库文档隔离至 `docs/_quarantine-esafenet/`（.gitignore 排除）；lint:text Esafenet 判红归零、build 后 dist/robots.txt 与 public 逐字节一致 —— 见 `INCIDENT-ESAFENET.md` §7 |

### 新增测试资产（本轮）

| 文件 | 作用 | 实测 |
|---|---|---|
| `tests/analytics-identity.mjs`（`npm run test:analytics`） | G1-3 身份键契约锁死：源码级 2（`recordWordDone` 函数体零 toLowerCase + 全文件白名单归属）+ 行为 15 | **17/17** |
| `tests/browser-migration-e2e.mjs` | 浏览器内迁移全生命周期：预置 V1 → apply → reload 幂等 → rollback 逐字节 | **19/19** |
| `scripts/verify-release-gate.mjs`（`npm run release:gate`） | 机器扫描 `Gx-y` 状态 + 与 §0 总览交叉验证；解析失败 `EXIT=2`（不允许静默降级） | **RELEASE=APPROVED**；故障注入自证通过 |

### 记录纪律条目（新类别：**记录器自身的可信度**）

| ID | 标题 | 说明 |
|---|---|---|
| **R-005** | 测试输出收集脚本伪造 `EXIT=0` | 首版 `10-FINAL-TEST-OUTPUT.txt` 收集脚本把 `$?` 读成 `echo` 的状态码（恒 0），导致全部命令看起来「全绿」。**已发现并重写**（`eval` 后立即取 `$?`，禁管道遮蔽）。与门禁伪造 PASS 同类事故 —— 记录器也是被测对象 |
| **R-006** | 浏览器内 rollback 取证的污染风险 | reload 后真实 App 会挂载并自写 localStorage（streak 当日初始化等）；事后 dump 取证会被 React 内存态覆写。**必须在同一 evaluate 同步窗口取证**。S4 接线时沿用此纪律 |

> ⚠️ **不可过度解读**：R-003/R-004 修复后 `Case conflict = 0` 是**真实链路样本**上的结论；
> 「历史脏数据（跨版本 / 手改 / 真实大小写分布）迁得干净」仍然**未验证**（本机无 `real-user` 数据）。
> 这条不许含糊 —— 与「PENDING 不得记作 PASS」是同一个道理。
