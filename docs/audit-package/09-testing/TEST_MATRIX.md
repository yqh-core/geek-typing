# 测试能力矩阵（T1 ~ T12）

> 状态：🔄 混合（部分已有实测覆盖，部分为待建规划）
> 实测环境：Windows 11 / Node 22 / Git Bash —— 仓库 `/d/work/geek-typing`
> 数据来源：本轮实测 + `13-acceptance/FINAL_ACCEPTANCE.md`（**未重跑**，直接引用其中数字）

---

## 0. 怎么读这张表

审计方最关心的问题是：**"这 12 个能力域，哪些真的有测试在守着，哪些只是嘴上说支持？"**

本表逐项回答，每行给四列：

| 列 | 取值 | 说明 |
|---|---|---|
| **状态** | ✅ 已有 / 🔄 混合 / 📐 待建 | ✅ = 有实测通过的断言；🔄 = 有部分覆盖但有明确空白；📐 = 零实现 |
| **已有断言数** | 实测数字 | 来源于 `grep` 实测的调用点计数，或 `FINAL_ACCEPTANCE.md` 的实测输出 |
| **证据文件** | 路径 + 行号 | 可点开核查 |
| **缺口** | 具体说明 | 不能含糊，必须说清"缺什么" |

**重要说明**：本表中「断言数」的统计口径有两种，已在 `TEST_STRATEGY.md` §5 澄清——`check()`/`ok()` **调用点**数 vs **实际执行**项数会因循环而不同。本表在两者不一致处显式标注。

---

## 1. 总览表

| # | 能力域 | 状态 | 已有断言数 | 主要证据 |
|---|---|---|---|---|
| T1 | Content Contract（内容契约） | ✅ **已有（实测）** | **149 + 20** | `tests/content-query.mjs`、`scripts/content/validate.mjs` |
| T2 | Import（导入/坏数据拒绝） | 📐 **待建** | **0** | 无 fixture、无负例 |
| T3 | Vocabulary（词库加载与检索） | ✅ **已有（部分）** | 约 60 / 149 | `tests/content-query.mjs:98-201`、`tests/e2e.mjs:864` |
| T4 | Audio（音频） | 📐 **待建** | **0** | 零实现 |
| T5 | Video（视频） | 📐 **待建** | **0** | 零实现 |
| T6 | Learning（学习记录） | ✅ **已有（部分）** | 约 25 / 167 | `tests/e2e.mjs:207`、`:290`、`:1220` |
| T7 | Relation（词间关系） | 📐 **有模型无数据** | **1**（仅"恒为数组"） | `tests/content-query.mjs:59` |
| T8 | Offline（离线） | ✅ **已有（实测）** | **5 态（20 项断言）** | `tests/offline-audit.mjs`、`tests/prod-smoke.mjs:PartB` |
| T9 | Performance（性能） | 🔄 **仅 bundle 门禁** | **3** | `scripts/check-bundle.mjs` |
| T10 | Security（安全） | 📐 **待建** | **0** | 零实现 |
| T11 | License（许可合规） | 📐 **待建** | **0**（L1 有一条被动的 checksum 校验） | `scripts/content/validate.mjs:7` |
| T12 | UX（体验/无障碍） | 🔄 **有移动视口，无 a11y** | 约 12 / 167 | `tests/e2e.mjs:361` |

**统计**：12 项中 ✅ 4 项、🔄 2 项、📐 6 项。

---

## T1 — Content Contract（内容契约）

> 状态：✅ **已有（实测）**
> 已有断言数：**149**（契约测试）+ **20**（静态门禁）= **169**

### 已有覆盖

| 层 | 文件 | 数量 | 实测结果 |
|---|---|---|---|
| L1 内容门禁 | `scripts/content/validate.mjs`（427 行） | **20 项** | 10 包全部 PASS |
| L2 契约测试 | `tests/content-query.mjs`（543 行） | **149 项** | 149/149 通过 |

**这是本仓库覆盖最好的一块。** 149 个契约断言分布在 13 个分区（见 `CONTENT_TEST.md`）。

### 关键证据（行号）

- 包注册数契约：`tests/content-query.mjs:44` — `ok('注册 10 个 vocabulary 包', pkgDirs.length === 10, ...)`
- 全库词数真值：`tests/content-query.mjs:49` — `ok('全库 Σitems = 契约基准（词数变化必须显式确认）', manifestTotal === BASELINE_ITEMS, ...)`，其中 `BASELINE_ITEMS = 9346`（`:48`）
- ContentId 4 段式：`tests/content-query.mjs:62-85`（【2】分区）
- 缓存共享（单份内存）：`tests/content-query.mjs:90`
- id 自洽性（大小写敏感）：`tests/content-query.mjs:281-305`
- Search Sort 契约（翻页不重不漏）：`tests/content-query.mjs:340-405`
- ContentSnapshot 契约：`tests/content-query.mjs:406-529`
- 收尾：`tests/content-query.mjs:538` 打印合计、`:542` `process.exit(1)`

### 20 项门禁的阈值常量（实测自 `scripts/content/validate.mjs:54-64`）

```js
const MANIFEST_MAX_BYTES = 8 * 1024        // 单包 manifest，实测最大 1.40 KiB (ts-code)
const MANIFEST_TOTAL_MAX_BYTES = 40 * 1024 // 全库 manifest，实测 10 包 13.08 KiB
const INLINE_MAX_ITEMS = 1000              // inline 词条上限，实测 7 包 346 词
const INLINE_MAX_BYTES = 64 * 1024         // inline words 上限，实测 36.17 KiB
const SCHEMA_VERSION = 4
const KNOWN_POLICIES = new Set(['inline', 'lazy'])
const REQUIRED_FIELDS = ['id','type','version','title','description','language','tags','icon','features','stats','sources','offline']
```

### 缺口

1. **无负例**：20 项门禁只验证"现有 10 包是干净的"，从未验证"坏包会被拦"（见 T2）
2. **第 12 项有 3 个子项是"条件校验"**，条件不满足时**打印跳过而非失败**：
   - (e) invalid/orphan relation — `仅当 relations.json 存在时校验，否则打印跳过`
   - (f) broken asset — `仅当 manifest.assets 存在时校验，否则打印跳过`
   - (g) orphan learning record — `运行时检查，由 Learning 层负责，脚本不校验`
   即：**当前 relations.json 与 assets 都不存在，所以这三条路径一次都没跑过**
3. **无跨包唯一性约束是"刻意的"**，不是漏洞：`scripts/content/validate.mjs` 第 4 项注释明确写「**跨包同词合法**：IELTS/CET/TOEFL 各有 abandon 是正常数据关系，是本平台刻意支持的能力，任何『跨包词唯一』规则都是错误的」
4. **第 20 项用正则扫 TS 文本**（`registryLoadMode()`，`scripts/content/validate.mjs:69`），因为 Node 无法 import TS。这是脆弱点：`registry.ts` 排版一变，正则可能失配

---

## T2 — Import（导入 / 坏数据拒绝）

> 状态：📐 **待建**
> 已有断言数：**0**
> 证据文件：**无**

### 为什么是 0

实测确认（本轮）：

```
$ grep -rli "fixture" --include="*.mjs" --include="*.json" --include="*.ts" .
./content/vocabulary/ielts/words.json
./content/vocabulary/kaoyan/words.json
./content/vocabulary/toefl/words.json
```

三个命中全部是**英文单词 `"fixture"` 本身**（词条），**不是测试夹具**。全仓库不存在任何 fixture 目录、任何 invalid 样本。

### 缺口

**整套门禁只有"正常路径"验证，没有"异常路径"验证。** 具体说：

1. 没有任何一份"故意损坏的 manifest/words"样本
2. 无法证明 `validate.mjs` 的 20 项规则**真的会触发**——只有代码里有这些分支，没有测试证明它们能跑通
3. 无法验证 `normalize.mjs`、`build.mjs` 面对坏输入时的行为（是干净报错还是静默产出坏数据）

### 应测负例清单（T2 待建时要覆盖的）

| # | 负例 | 期望行为 | 对应门禁项 |
|---|---|---|---|
| 1 | missing word（词条 `word` 字段为空/缺失） | 拒绝 | 第 2 项 REQUIRED_FIELDS |
| 2 | duplicate word（包内同词） | 拒绝 | 第 4 项 / 第 12(b) 项 |
| 3 | invalid phonetic（音标格式非法） | 拒绝或告警 | 当前**无规则**，需新增 |
| 4 | invalid wordId（词级 ContentId 不合 4 段式） | 拒绝 | 第 3 项 / 第 9 项 |
| 5 | missing source（`sources` 为空数组） | 拒绝 | 第 2 项 / 第 7 项 |
| 6 | invalid license（source 缺结构化 license / 外部源缺 SPDX） | 拒绝 | 第 7 项 |
| 7 | broken relation（`relations.json` 指向不存在的 ContentId） | 拒绝 | 第 12(e) 项 |
| 8 | invalid audio（`assets` 指向不存在的音频文件） | 拒绝 | 第 12(f) 项 |
| 9 | invalid subtitle（字幕文件缺失或格式非法） | 拒绝 | 当前**无规则** |
| 10 | checksum 漂移（手改 words.json 不改 manifest） | 拒绝 | 第 6 项 / 第 15 项 |
| 11 | namespace 冲突（两包共用 namespace，历史上 cet4/toefl/ielts 曾共用 `ecdict`） | 拒绝 | 第 9 项 |
| 12 | schemaVersion 不匹配 | 拒绝 | 第 10 项 |
| 13 | stats.items 与真实词数不一致 | 拒绝 | 第 5 项 |
| 14 | policy 声明与实际加载方式不符（manifest 写 lazy，registry 用静态 import） | 拒绝 | 第 20 项 |
| 15 | 超预算（inline 包 > 1000 词 或 > 64 KiB） | 拒绝 | 第 19 项 |

**第 11 项有历史背景**：`scripts/content/validate.mjs` 第 9 项注释记录——cet4/toefl/ielts 曾共用 namespace `ecdict`，导致三包词条同 id（**abandon 三包同名**），最终由 `tests/content-query.mjs` 的契约测试实测捕获。**这是一个"测试真的抓到过生产级 bug"的案例**，值得作为 T2 建设时的模板。

详见 `09-testing/IMPORT_TEST.md`。

---

## T3 — Vocabulary（词库加载与检索）

> 状态：✅ **已有（部分）**
> 已有断言数：约 **60**（散在 163 个契约断言与 167 个 E2E 断言中）

### 已有覆盖

**契约层（`tests/content-query.mjs`）：**

| 分区 | 行号 | 内容 |
|---|---|---|
| 【3】加载缓存共享 | `:87-92` | 重复 `loadPackage` 返回同一引用（单份内存） |
| 【4】countWords | `:93-97` | 全库合计 = manifest 真值；`countWords("ielts")` = 3000 |
| 【5】searchWords | `:98-127` | 跨包检索 / 限定包 / 4 段式 packageId / 精确优先 / `exact` 开关 / 空查询 / limit / 中文按释义命中 |
| 【6】getWord | `:128-152` | 按 ContentId 取词 / 带翻译 / 唯一归属 / 跨包同词各自可寻址 / 三种非法输入返回 null |
| 【7】listWords | `:153-168` | 分页 / 页间无交集 / id 落 namespace 内 / 未知包空数组 / `hasPhonetic` 过滤 |
| 【8】contentQuery 统一 API | `:169-203` | `search` 与 `searchWords` 结果一致 / `type:'all'` 一致 / `listening` 未接入返回空 / 默认 type / 精确排序 |
| 【9】Catalog + Index | `:204-280` | 目录与索引正确性 |
| 【11】Query Scope | `:307-339` | 首页/搜索页/词库页/Detail/收藏页共用作用域 |
| 【12】Search Sort 契约 | `:340-405` | deterministic ⇒ 翻页不重不漏 |

关键断言实测原文：
- `tests/content-query.mjs:96` — `ok('countWords("ielts") = 3000', (await q.countWords('ielts')) === ieltsManifest.stats.items)`
- `tests/content-query.mjs:118` — `ok('精确优先：首位为词形全等命中', hits[0].word.toLowerCase() === 'abandon')`
- `tests/content-query.mjs:121` — `ok('exact=true 不返回前缀命中', exactOff.length === 0, ...)`
- `tests/content-query.mjs:147` — `ok('跨包同词各自可寻址（未找到重叠词形，跳过）', true, 'ielts ∩ cet4 为空')` ← **注意这条是恒真断言的兜底分支**

**E2E 层（`tests/e2e.mjs`）：**

- 【15】考研/托福词库（懒加载分包）：`tests/e2e.mjs:864`
- 【4】皮肤 / 词库 / 音效：`tests/e2e.mjs:173`

### 缺口

1. **懒加载只测了 3 个包**（kaoyan/toefl/ielts），inline 的 7 个小包没有专门的加载路径测试
2. **词库加载失败的路径无测试**——对应 `UX-002`（`src/App.tsx:164-167` 加载失败无用户反馈），这个失败路径**没有任何断言覆盖**
3. **大词库压测缺失**——9000 词级别的检索性能无断言（见 T9）
4. `tests/content-query.mjs:147` 那条"跳过"是恒真断言，实际未验证跨包同词寻址
5. **UI 直读词数组的 17 处**（`DEBT-001`）绕过了 query 层，契约测试**覆盖不到**这些路径

---

## T4 — Audio（音频）

> 状态：📐 **待建**
> 已有断言数：**0**

### 实测现状

- 内容层：`scripts/content/validate.mjs` 第 12 项 (f) broken asset **仅在 `manifest.assets` 存在时校验**，实测**当前无包声明 assets ⇒ 该分支从未执行**
- `tests/e2e.mjs` 【8.5】发音与数据分析（`:255`）与【13】代码模式与发音增强（`:538`）涉及**发音（speech synthesis）**，但那是浏览器 TTS，不是音频资源加载
- 无音频文件校验、无音频格式校验、无音频加载失败回退测试

### 缺口

1. 音频资源存在性校验（当前门禁分支未激活）
2. 音频格式 / MIME 校验
3. 音频加载失败回退（`UX-002` 同类问题）
4. 音频与词条 ContentId 的绑定关系校验
5. 发音（TTS）在弱网/无网络下的行为

详见 `09-testing/MEDIA_TEST.md`。

---

## T5 — Video（视频）

> 状态：📐 **待建**
> 已有断言数：**0**

### 实测现状

**全仓库零视频相关代码与资源。**

- 内容层无 `assets` 声明
- 无视频加载器
- `tests/` 下无任何 video 断言
- `src/core/content/` 的 `ContentType` 仅有 `vocabulary` 与 `listening` 两种（`listening` 已预留但未接入，见 `tests/content-query.mjs:57`：`ok('listContent("listening") 返回空（类型未接入）', ...)`）

### 缺口

**这是一个完全未实现的能力域**，不是"测试缺失"而是"功能缺失"。详见 `09-testing/MEDIA_TEST.md`。

---

## T6 — Learning（学习记录）

> 状态：✅ **已有（部分）**
> 已有断言数：约 **25**（散在 167 个 E2E 断言中）

### 已有覆盖

**E2E 层（`tests/e2e.mjs`）：**

| 分区 | 行号 | 内容 |
|---|---|---|
| 【5】本地持久化 | `:207` | localStorage 写入/读取 |
| 【9】背单词模块 | `:290` | 翻面 / 推进 / 记录 |
| 【11.6】背单词键盘流 | `:481` | Space / 1 / 2 / 3 / Enter 全链路 |
| 【14】错题本 + 命令面板模糊匹配 | `:666` | 错题本（第 1 次 【14】） |
| 【16】V3-P0a：五页签 IA / 今日推荐 / Review / Progress | `:1220` | Review 与 Progress 页签 |

**离线层（`tests/offline-audit.mjs`）：**

- 态 3（`tests/offline-audit.mjs` 内）：背单词 Space 翻面 + 打 1 推进 + **零 console error**

**门禁层：**

- `scripts/content/validate.mjs` 第 12 项 (g)：`orphan learning record —— 运行时检查，由 Learning 层负责，脚本不校验` ← **明确声明不校验**

### 缺口

1. **无孤立学习记录检测**（门禁明确甩给运行时，但运行时也没有）
2. **Learning 用裸 word 做键**（架构缺口 `A-4`，来自 `GAP_ANALYSIS.md`）：实测存在 **2323 个跨包同名词形**、**93 条含大写字母的词条**
   - 后果：`abandon` 在 ielts/cet4/toefl 三包都有 → 学习记录会**串包**
   - **当前无任何断言覆盖这个串包场景**
3. **`src/lib/mastery.ts`、`streak.ts`、`reviewStore.ts`、`memorizeStore.ts` 零直接单元测试**（`DEBT-005`）
4. **配额熔断只在 E2E 里被触发过一次**（`tests/e2e.mjs:930` 【13】批8：Jitter 抗雪崩 + Quota 熔断），无系统化的容量边界测试
5. **多设备 / 多标签同步无测试**

---

## T7 — Relation（词间关系）

> 状态：📐 **有模型无数据**
> 已有断言数：**1**（且是"恒为数组"这种最弱的形式）

### 已有覆盖

唯一一条断言（`tests/content-query.mjs:59`）：

```js
ok('getRelations 恒为数组（关系模型就位、无数据）', Array.isArray(registry.getRelations('content:vocabulary:ecdict-ielts:ielts')))
```

**注意这条断言的措辞本身就承认了现状**——「关系模型就位、无数据」。它只证明"调用不崩、返回数组"，不证明任何关系语义。

### 缺口

1. **无 `relations.json` 数据文件** ⇒ `scripts/content/validate.mjs` 第 12 项 (e)「invalid / orphan relation」分支**从未执行**
2. 无关系类型定义测试（同义/反义/词根/派生等）
3. 无关系双向一致性测试（A→B 则 B→A）
4. 无关系闭环检测（A→B→C→A 是否允许）
5. 无关系指向存在性校验（指向不存在的 ContentId）

### 说明

这不是"能力缺失"而是"**预留但未启用**"——`src/core/content/relation/` 目录存在，模型就位，但零数据。

---

## T8 — Offline（离线）

> 状态：✅ **已有（实测）**
> 已有断言数：**5 态（20 项断言）**（`tests/offline-audit.mjs`）+ Part B 三组（`tests/prod-smoke.mjs`）

### 已有覆盖

**`tests/offline-audit.mjs`（348 行）五态：**

| 态 | 内容 |
|---|---|
| 态 1 | SW `ready` + `active` + `controller` 存在 |
| 态 1.5 | 在线 reload（验证 SW 不破坏在线路径） |
| 态 2 | 断网 reload **无 `ERR_FAILED`**、落 Home、切 typing、敲字母光标前进 |
| 态 3 | 背单词 Space 翻面 + 打 1 推进 + **零 console error** |
| 态 4 | 缓存探针 `gt-shell-v3` 无 `redirected=true` 毒条目 + index 已缓存 |
| 态 4b | **MIME 投毒探针（主动注入）**：`context.route` 伪造软 404（200 + `text/html`）→ 断言不写入 `/assets/*.js` 缓存、不交给页面 |

- 证据落盘：`tests/_evidence/offline-audit-result.json`
- 收尾实测：`tests/offline-audit.mjs:334` 打印「结论：✅ 全部通过」、`:348` `process.exit(...)`

**`tests/prod-smoke.mjs` Part B（生产 SW 升级）：**

| 断言 | 内容 |
|---|---|
| B1 | 新访客 `skipWaiting` + `claim` 立即接管、仅保留 `gt-shell-v3` |
| B2 | 连续 reload 第二次断网走缓存 |
| B3 | 注入 `gt-shell-v1` 残留 → 重装 → `activate` 清理 → 断网可用 |

### 这是本仓库做得最扎实的域之一

原因在于它踩过真实的坑，并把坑固化成了断言。`public/sw.js` 的 `sanitize(res)` 函数（剥离 `content-encoding` / `content-length` / `vary`）对应**三类静默 `ERR_FAILED`**，代码注释里逐条写明：

1. **308 redirected 毒条目** —— 缓存里存了重定向响应，回放时失败
2. **body 二次解码** —— 响应体已被解压但 `content-encoding` 头还在，浏览器再解一次
3. **`Vary: Origin` 静默 miss** —— `caches.match()` 因 Vary 头匹配不上而静默返回 undefined

`putClean(req,res)` 的注释还强调：必须返回**重建的干净 Response**，因为原 `res.body` 已被消费 → 会报 Body already consumed → 导航 `ERR_FAILED`。

### 缺口

1. **无离线状态 UI**（`UX-001`）—— 断网时用户看不到任何提示，虽然功能可用
2. **弱网（非断网）无测试** —— `FLAKY-002` 记录了预热探针预算从 18s 放宽到 30s 的抖动问题
3. **SW 更新提示无测试** —— `skipWaiting()` 是立即接管，用户不会看到"有新版本"提示，这个行为**没有被断言覆盖**
4. **缓存容量上限无测试** —— 浏览器 Cache Storage 配额耗尽时的行为无覆盖
5. **多 tab 场景无测试** —— 两个标签页同时开着时 `clients.claim()` 的行为

详见 `12-infrastructure/OFFLINE.md`。

---

## T9 — Performance（性能）

> 状态：🔄 **仅 bundle 门禁**
> 已有断言数：**3**

### 已有覆盖

**`scripts/check-bundle.mjs`（250 行）3 项门禁**，阈值实测自 `:32-34`：

```js
const MAIN_RAW_MAX  = 420 * 1024   // 主 chunk raw
const MAIN_GZIP_MAX = 135 * 1024   // 主 chunk gzip
const WARM_GZIP_MAX = 600 * 1024   // 预热包 gzip 合计
```

| 项 | 内容 |
|---|---|
| 1 | 主 chunk raw/gzip 双阈值 |
| 2 | `words-*` chunk 数 ≥ registry 中 lazy 包数 |
| 3 | `warmUpVocabulary` 预热包 gzip 合计 ≤ 600 KiB（**含 inline 泄漏检测**） |

**实测结果（引自 `13-acceptance/FINAL_ACCEPTANCE.md`）：**

| 指标 | 实测 | 阈值 | 余量 |
|---|---|---|---|
| 主 chunk raw | **381.06 KiB** | 420 KiB | **9.3%** ⚠️ |
| 主 chunk gzip | **118.89 KiB** | 135 KiB | **11.9%** ⚠️ |
| `words-*` chunk 数 | 3 | ≥ 3 | 刚好 |
| 预热包 gzip 合计 | ielts 166.96 + kaoyan 166.95 + toefl 163.12 = **497.03 KiB** | 600 KiB | **17.2%** |

注：`FINAL_ACCEPTANCE.md` 另有一处用 **kB（十进制）** 口径报的 `index-Cawl4_-q.js` 为 **390.20/123.07**，即 vite 输出的 `390.20 kB / gzip 123.07 kB`。两个口径（KiB 二进制 vs kB 十进制）数值不同但**指同一个文件**，报数时须说明。

**构建产物实测清单（引自 `FINAL_ACCEPTANCE.md`）：**

| 文件 | raw | gzip |
|---|---|---|
| `dist/index.html` | 2.00 kB | 0.99 kB |
| `index-DWqJDTkw.css` | 23.63 kB | 5.53 kB |
| `index-Cawl4_-q.js`（主 chunk） | 390.20 kB | 123.07 kB |
| `words-Dfqbfxph.js`（toefl） | 475.18 kB | 170.21 kB |
| `words-DO8i2GAI.js`（ielts） | 482.53 kB | 174.09 kB |
| `words-LP9e320F.js`（kaoyan） | 483.08 kB | 174.05 kB |

### 缺口

1. **无 Lighthouse / Core Web Vitals 测试** —— 没有 FCP / LCP / TTFB / CLS / INP 任何一项的断言
2. **无运行时性能测试** —— 打字延迟、按键响应、动画帧率
3. **无内存测试** —— 懒加载 3 个包（约 1.4 MB words.json）后的堆内存无断言
4. **无大词库压测** —— 9346 词规模下的检索/排序无性能断言
5. **无首屏时间断言** —— 只有"体积小"的间接证据，没有"首屏快"的直接证据
6. **余量偏紧**（`PERF-001`）：raw 9.3% / gzip 11.9% 余量意味着**一次中等规模的依赖升级就可能破线**
7. **无性能监控基线**（`PERF-002`）

详见 `09-testing/PERFORMANCE_TEST.md`。

---

## T10 — Security（安全）

> 状态：📐 **待建**
> 已有断言数：**0**

### 实测现状

- `tests/` 下无任何安全类断言（无 XSS、无注入、无头部校验）
- `scripts/` 下无安全扫描脚本
- **`grep -rn "Content-Security-Policy\|csp" public/_headers index.html vite.config.ts src/` → 零命中**（本轮实测）
- 即：**没有任何测试，也没有 CSP**

现有安全头**仅 4 条**（`public/_headers`，共 19 行）：

```
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
X-Frame-Options: SAMEORIGIN
Cross-Origin-Opener-Policy: same-origin
```

`index.html` 中**无 CSP meta 标签**。

### 缺口

1. 无 CSP（也即无 CSP 违规测试）
2. 无 XSS 测试（自定义词库是纯文本输入，但渲染路径未测）
3. 无安全响应头回归测试（4 条头存在但**无断言守着**，改错了没人发现）
4. 无依赖漏洞扫描（无 `npm audit` 接入）
5. 无 SW 安全测试（`fetch` 事件中跨 origin 请求的处理是否正确拒绝）

详见 `10-security/SECURITY.md` 与 `09-testing/SECURITY_TEST.md`。

---

## T11 — License（许可合规）

> 状态：📐 **待建**
> 已有断言数：**0**（仅有 1 条被动的、与许可无关的 checksum 校验）

### 实测现状

**门禁层只有一条相关规则** —— `scripts/content/validate.mjs` 第 7 项：

```
7. License 门禁：每条 source 必须有结构化 license；外部来源须有 SPDX 标识
```

**但这是对「结构化字段存在性」的校验，不是对「许可条款合规性」的校验。** 它只能回答"有没有填 license 字段"，不能回答"这个 license 是否允许我们这样用"。

### 缺口

1. **无 `rightsStatus` 体系**（架构缺口 `E-1`，来自 `GAP_ANALYSIS.md`）—— 没有字段记录"这条内容的权利状态"（已授权/公有领域/待清理/不可用）
2. **来源字段不完整**（`E-2`）—— 实测缺 `sourceUrl` / `author` / `publisher` / `copyright` / `downloadDate`
3. **无许可兼容性测试** —— ECDICT（MIT）与 curated 包（Proprietary 声明）混在一个站里，无自动检查
4. **无归属声明渲染测试**（MIT 要求保留版权声明）
5. **无 DMCA / 下架流程测试**

### 核心风险（必须让审计方看到）

**"绝不能把 GitHub 素材直接塞进网站"** —— 这是本项目在 `11-legal/CONTENT_RISK.md` 中明确写出的红线。当前门禁**无法阻止**这件事发生。

详见 `11-legal/LICENSE_POLICY.md` 与 `11-legal/CONTENT_RISK.md`。

---

## T12 — UX（体验 / 无障碍）

> 状态：🔄 **有移动视口，无 a11y**
> 已有断言数：约 **12**（主要集中在移动端与命令面板）

### 已有覆盖

**E2E 层（`tests/e2e.mjs`）：**

| 分区 | 行号 | 内容 |
|---|---|---|
| 【1】首屏与下拉导航 | `:110` | 首屏渲染、下拉交互 |
| 【10】中英双语切换 | `:347` | i18n 切换 |
| 【11】移动端视口 | `:361` | 移动端视口渲染 |
| 【11.5】命令面板（Esc + : 命令） | `:370` | 键盘命令面板 |
| 【11.6】背单词键盘流 | `:481` | Space/1/2/3/Enter |
| 【14】批8：移动端手势 / 命令面板 / 预热 | `:1063` | 第 2 次 【14】，移动端手势 |
| 【12】运行时报错 | `:1436` | 全局 console error 检查（排在最后） |

**视觉证据**：`tests/_evidence/` 与 `docs/audit-package/screenshots/` 下共 **17 张截图**（含 `04-mobile.png`）。

### 缺口

1. **零 a11y 测试**（`E-5`）—— 无 axe-core、无 ARIA 断言、无键盘可达性矩阵、无对比度检查、无屏幕阅读器验证
2. **无焦点管理测试** —— 命令面板/Esc 关闭后的焦点回归未断言
3. **无 reduced-motion 测试** —— 无 `prefers-reduced-motion` 支持验证
4. **无横屏移动端测试**
5. **无缩放测试** —— 200% 缩放下的布局
6. **无 i18n 完整性测试** —— 切换语言后是否有遗漏未翻译的硬编码文案
7. **错误态无测试**（`UX-002` / `UX-003`）—— 词库加载失败无反馈、无全局错误边界

详见 `09-testing/ACCESSIBILITY_TEST.md`。

---

## 2. 缺口汇总：按"能不能守住"排序

| 风险等级 | 缺口 | 归属 |
|---|---|---|
| 🔴 **高** | 无 fixture ⇒ 全部门禁只有正例、无负例 | T2 |
| 🔴 **高** | 所有门禁未接入 CI（`DEBT-002`） | 全层 |
| 🔴 **高** | Learning 用裸 word 做键，2323 跨包同名词会串包（`A-4`） | T6 |
| 🟠 **中** | 无 CSP，无安全头回归测试 | T10 |
| 🟠 **中** | 无许可合规自动检查，`rightsStatus` 体系未建 | T11 |
| 🟠 **中** | 主 chunk 余量仅 9.3% / 11.9%（`PERF-001`） | T9 |
| 🟠 **中** | 音频/视频零实现（不是测试缺失，是功能缺失） | T4 / T5 |
| 🟡 **低** | 关系有模型无数据 | T7 |
| 🟡 **低** | 无 a11y 测试 | T12 |
| 🟡 **低** | `src/lib/` 12 模块零单元测试（`DEBT-005`） | 全层 |

---

## 3. 与 13-acceptance 的对应关系

本表的所有数字均直接引自 `13-acceptance/FINAL_ACCEPTANCE.md`，**未重跑**。该文件记录的门禁总览：

| 门禁 | 结果 |
|---|---|
| `content:validate` | 10 包 PASS |
| `test:content` | 149/149 |
| `tsc -b` | 0 error |
| `lint`（oxlint） | 0 error / 16 warning |
| `build` | exit 0（耗时浮动） |
| `check:bundle` | 3/3 PASS |
| `test:e2e` | 167/167 |
| `test:offline` | 20/20 |
| `test:smoke` | **21/22** ← 唯一未满分项 |
| 截图 | 17 张 |

`test:smoke` 唯一的失败项是 **A3**：线上 `/` 引用 `index-Cawl4_-q.js`，而本地 `dist` 为 `index-Dw5EkkBq.js`——原因是本轮重跑 build 时 `ResultOverlay.tsx` 新增了 `data-testid` 但未提交，导致线上与本地指纹不一致。**这不是站点缺陷，是审计过程的时序产物**，详见 `KNOWN_ISSUES.md` 的 `FLAKY-001`。

---

## 相关文档

- 策略与技术选择：`09-testing/TEST_STRATEGY.md`
- E2E 分区明细：`09-testing/E2E.md`
- 内容契约 149 + 20：`09-testing/CONTENT_TEST.md`
- 体积门禁 3 项：`09-testing/PERFORMANCE_TEST.md`
- 待建负例清单：`09-testing/IMPORT_TEST.md`
- 缺陷编号：`13-acceptance/KNOWN_ISSUES.md`
- 架构缺口：`13-acceptance/GAP_ANALYSIS.md`
