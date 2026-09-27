# 内容层测试（149 契约断言 + 20 项门禁）

> 状态：✅ 已有（实测）
> 两个文件：
> - `scripts/content/validate.mjs`（**427 行**，20 项静态门禁）
> - `tests/content-query.mjs`（**543 行**，13 分区 / **149 个 `ok()` 断言**）
> 实测结果：门禁 10 包全部 PASS；契约测试 **149/149 通过**（引自 `13-acceptance/FINAL_ACCEPTANCE.md`，未重跑）

---

## 1. 为什么内容层单独成篇

因为本项目的**内容不是一个 JSON 文件，而是一个有契约的实体系统**：

- 词条有 4 段式全局唯一 id（`content:<type>:<namespace>:<localId>`）
- 包有 schemaVersion（结构版本）与 contentVersion（对外学习契约版本）
- 有 checksum（canonical SHA-256）与 revision history
- 有 inline/lazy 两种加载策略，且**策略声明必须与代码实际行为一致**
- 有 9346 条词、10 个包、13.08 KiB manifest

**光靠"能跑起来"验证不了这套系统。** 所以要 149 个契约断言 + 20 项门禁。

---

## 2. 部分一：静态门禁 `scripts/content/validate.mjs`

### 2.1 运行方式

```bash
node scripts/content/validate.mjs      # npm run content:validate
```

- 全绿 `exit 0`
- 任一 FAIL `exit 1`（`scripts/content/validate.mjs:423`）
- 通过时打印：`[content:validate] PASS：${ids.length} 包全部通过`（`:424`）
- 顶部注释写明原则：**「不伪造通过」**

### 2.2 20 项检查逐条（原文引自 `scripts/content/validate.mjs:1-40`）

| # | 规则 | 说明 / 备注 |
|---|---|---|
| 1 | `manifest.json` / `words.json` 存在且 JSON 合法 | 基础存在性 |
| 2 | manifest 必填字段完整 | `id/type/version/title/sources/offline...` |
| 3 | ContentId 4 段式规范 | `content:vocabulary:<namespace>:<目录名>` |
| 4 | 包内 duplicate word 检测 | **跨包同词合法**（详见 §2.3） |
| 5 | `stats.items` 与实际词数一致 | 漂移时跑 `npm run content:build` 同步 |
| 6 | `sources[].checksum` 与实际完整 SHA-256 一致 | |
| 7 | License 门禁 | 每条 source 必须有结构化 license；外部来源须有 SPDX 标识 |
| 8 | 包 id 全局唯一 | 同一 ContentId 不得被两个包占用 |
| 9 | **namespace 每包唯一** | 词级 ContentId 全局唯一的**充要条件**（详见 §2.4） |
| 10 | `schemaVersion` 存在且 `=== SCHEMA_VERSION` | 由 `content:build` 写入 |
| 11 | `contentVersion` 存在且为正整数 | 同一 checksum 复用同一 version |
| 12 | Duplicate Detection（分级，见 §2.5） | (a)~(g) 七个子项 |
| 13 | `packageId` 存在且 `=== 目录名` | 一词三表：manifest.packageId / 目录 / ContentId 第 4 段 |
| 14 | `namespace` 存在且与 manifest.id 第 3 段严格相等 | 两者必须同源；「每包唯一」由第 9 项兜底 |
| 15 | `contentChecksum === sha256Canonical(words)` | **必须走 canonical**（详见 §2.6） |
| 16 | contentRevision / contentVersion 正整数；contentHistory 有一致条目 | 回滚场景：version 回历史值，**revision 只增不减** |
| 17 | `build` 字段完整 | toolVersion 非空、builtAt 合法、sourceChecksum === contentChecksum |
| 18 | manifest 体积 | 单包 < 8 KiB 且全库 < 40 KiB |
| 19 | inline 预算 | `policy=inline` 的包 Σ items ≤ 1000 且 Σ bytes ≤ 64 KiB |
| 20 | 策略一致性 | manifest.offline.policy ⇔ registry.ts 实际加载方式（详见 §2.7） |

### 2.3 第 4 项：跨包同词是**刻意支持**的

`scripts/content/validate.mjs:8-10` 原文注释：

> 包内 duplicate word 检测（**跨包同词合法**：IELTS/CET/TOEFL 各有 abandon 是正常数据关系，是本平台刻意支持的能力，**任何「跨包词唯一」规则都是错误的**——见下方注释）

**这是审计时必须理解的设计意图**：同一个英文单词在不同考试词库里出现，是**正常的词库结构**，不是数据污染。

由此推出一个重要的架构约束：**词级 ContentId 必须全局唯一，而词形不需要**。这就是第 9 项「namespace 每包唯一」成为充要条件的原因。

### 2.4 第 9 项：namespace 唯一性 + 历史踩坑记录

`scripts/content/validate.mjs:11-12` 原文注释：

> namespace 每包唯一（词级 ContentId 全局唯一的充要条件，见代码内注释）

**代码内注释记录了一段真实历史**（对应 `KNOWN_ISSUES.md` 的成因链）：

> cet4 / toefl / ielts 曾共用 namespace `ecdict` → **abandon 三包同 id** → 由 `tests/content-query.mjs` 契约测试实测捕获

**这是一个"测试真的抓到了生产级 bug"的实证案例。** 值得作为负例测试建设的模板（见 `IMPORT_TEST.md`）。

### 2.5 第 12 项：Duplicate Detection 分级（实测自 `scripts/content/validate.mjs:13-20`）

| 子项 | 检查目标 | 当前是否执行 |
|---|---|---|
| (a) 包内 duplicate localId | 第 4 项已覆盖，此处**只回显、不重复报错** | ✅ 执行（由第 4 项兜底） |
| (b) 包内 duplicate normalized word | 大小写/空白差异撞车 | ✅ 执行 |
| (c) 跨包 duplicate ContentId | 全库兜底回归检测 | ✅ 执行 |
| (d) duplicate source | 同一 origin 在 `sources[]` 出现两次 | ✅ 执行 |
| (e) invalid / orphan relation | **仅当 `relations.json` 存在时校验，否则打印跳过** | ❌ **未执行**（无数据） |
| (f) broken asset | **仅当 `manifest.assets` 存在时校验，否则打印跳过** | ❌ **未执行**（无数据） |
| (g) orphan learning record | **运行时检查，由 Learning 层负责，脚本不校验** | ❌ **从未实现** |

**审计要点**：**(e)(f)(g) 三条路径当前一次都没跑过。** 它们是"代码里写了但从未被执行"的分支——既不能证明有效，也不能证明无效。

### 2.6 第 15 项：为什么必须走 canonical

`scripts/content/validate.mjs:25-27` 原文注释：

> `contentChecksum === sha256Canonical(words)`（**必须走 canonical**，不得用文件原文或 `JSON.stringify` 直算，否则**文件排版一变就误判漂移**）

`sha256Canonical()` 实现在 `scripts/content/canonical.mjs`（134 行）。它的语义是：**checksum 只取决于数据的语义，与文件排版无关**。

这是一个正确的设计决策——否则每次格式化 words.json 都会导致全库 checksum 漂移，进而触发所有包的 version 变更。

### 2.7 第 20 项：策略一致性的脆弱实现

**问题**：Node 跑不了 TS，但"包的实际加载方式"只定义在 `src/core/content/registry.ts` 里。

**解法**（`scripts/content/validate.mjs:48` + `:69`）：

```js
const REGISTRY_TS = path.join(ROOT, 'src', 'core', 'content', 'registry.ts')

function registryLoadMode(src, id) { ... }   // 正则扫文本
```

实现细节（`scripts/content/validate.mjs:54-80` 附近注释）：

1. 先用正则定位 `{ ... localId: '<id>' ... }` 的注册对象块
2. 在该块内找 `words:`（静态 import ⇒ **inline**）或 `load:`（动态 import ⇒ **lazy**）

**为什么不能只扫 import 段**（代码注释原文）：

> 注意：registry 里可能存在「**已声明但未被注册项使用**」的 `<id>Words` 静态 import（死代码），只扫 import 段会把 **lazy 包误判成 inline**，故必须以注册对象块为准。

**输出三态**：
- `{ mode: 'missing' }` — 该 id 未注册
- `{ mode: 'ambiguous', count: n }` — 匹配到多个块
- `{ mode: 'inline' }` / `{ mode: 'lazy' }`

**未知策略的处理**（`:60`）：`KNOWN_POLICIES = new Set(['inline','lazy'])`——**其余（runtime / on-demand 等）只提示跳过，不判通过也不判失败**。

### 2.8 第 18/19 项：阈值常量与实测值对照（`scripts/content/validate.mjs:54-64`）

| 常量 | 值 | 实测 | 余量 |
|---|---|---|---|
| `MANIFEST_MAX_BYTES` | 8 KiB | 最大单包 **1.40 KiB**（ts-code） | 82.5% |
| `MANIFEST_TOTAL_MAX_BYTES` | 40 KiB | 10 包 **13.08 KiB** | 67.3% |
| `INLINE_MAX_ITEMS` | 1000 | 7 包 **346 词** | 65.4% |
| `INLINE_MAX_BYTES` | 64 KiB | 7 包 **36.17 KiB** | 43.5% |
| `SCHEMA_VERSION` | 4 | — | — |

**第 19 项的阈值依据**（`scripts/content/validate.mjs:35-37` 注释，含一条实测结论）：

> 实测 inline 词 **1:1 全额传导**进主 chunk：kaoyan 改 inline ⇒ 主 chunk **+471.92 KiB**，与 words.json 471.70 KiB **比值 1:1.0005**，故 **inline 是首屏体积的直通车，必须限量**

**这是本仓库最有价值的一条实测数据之一**——它把"inline 会撑大首屏"从直觉变成了带系数的定量结论（1:1.0005）。

### 2.9 第 16 项：回滚语义

`scripts/content/validate.mjs:28-30` 原文：

> contentRevision / contentVersion 均为正整数；contentHistory 中存在 checksum === contentChecksum 的条目，且该条目 version === contentVersion、revision <= contentRevision（**回滚场景：version 回到历史值，revision 只增不减**）

这是一个**单向递增 revision + 可回退 version** 的版本模型。含义：内容可以回滚到历史版本，但"发生过的修订次数"永不可篡改。

---

## 3. 部分二：契约测试 `tests/content-query.mjs`

### 3.1 关键机制：跑的是生产同一份 TS 源码

```js
// 顶部注释说明（实测）
// 用 vite ssrLoadModule 加载：
//   /src/core/content/registry.ts
//   /src/core/content/query/content-query.ts
//   /src/core/content/model/content.ts
```

**这意味着测试的对象不是编译产物、不是 mock，而是生产的 TypeScript 源码本身。**

技术要点：`vite` 的 `ssrLoadModule()` 在 Node 进程内提供一个 Vite 模块图，能直接 `import` `.ts` 文件并做转换。这让 Node 侧测试能复用前端的模块解析与类型语义。

### 3.2 独立真值基线

```js
// tests/content-query.mjs:48
const BASELINE_ITEMS = 9346
```

对应断言（`:49`）：

```js
ok('全库 Σitems = 契约基准（词数变化必须显式确认）', manifestTotal === BASELINE_ITEMS, `${manifestTotal} vs ${BASELINE_ITEMS}`)
```

**这是"测试防的是什么"的典型**：它防的不是代码 bug，而是**内容悄悄变化**。9063 条变 9346 条时，必须有人显式改这个常量——等于强制一次人工确认。

### 3.3 13 个分区（实测行号）

实测命令：`grep -n "【" tests/content-query.mjs`

| # | 分区 | 起始行 | 断言数（约） |
|---|---|---|---|
| 【1】 | registry 契约 | **43** | 8 |
| 【2】 | ContentId 规范（V4.1 4 段式 + namespace 每包唯一） | **62** | 7 |
| 【3】 | 加载缓存共享（兼容层与查询层同一份数据） | **87** | 2 |
| 【4】 | countWords | **93** | 2 |
| 【5】 | searchWords | **98** | 14 |
| 【6】 | getWord（Word Detail 前置接口） | **128** | 8 |
| 【7】 | listWords（分页 + 过滤） | **153** | 5 |
| 【8】 | contentQuery 统一 API | **169** | 11 |
| 【9】 | Catalog + Content Index | **204** | 约 20 |
| 【10】 | id 自洽性（生成侧 vs 寻址侧大小写口径） | **281** | 约 8 |
| 【11】 | Query Scope（首页 / 搜索页 / 词库页 / Detail / 收藏页共用一套作用域） | **307** | 约 10 |
| 【12】 | Search Sort 契约（deterministic ⇒ 翻页不重不漏） | **340** | 约 12 |
| 【13】 | ContentSnapshot 契约（V4.1-P0.6：哪个实体的哪个快照） | **406** | 约 42 |

收尾：`tests/content-query.mjs:538` 打印合计、`:542` `process.exit(1)`。

### 3.4 【1】registry 契约 — `tests/content-query.mjs:43-61`（8 条）

| 行 | 断言 |
|---|---|
| 44 | `ok('注册 10 个 vocabulary 包', pkgDirs.length === 10, pkgDirs.join(','))` |
| 49 | `ok('全库 Σitems = 契约基准（词数变化必须显式确认）', ...)` |
| 50 | `ok('getPackage 支持裸 id', registry.getPackage('ielts')?.localId === 'ielts')` |
| 55 | `ok('getPackage 未知 id 返回 undefined', registry.getPackage('content:vocabulary:ecdict:nope') === undefined)` |
| 56 | `ok('listContent("vocabulary") 返回全部 manifest', registry.listContent('vocabulary').length === 10)` |
| 57 | `ok('listContent("listening") 返回空（类型未接入）', registry.listContent('listening').length === 0)` |
| 58 | `ok('hasFeature 未知 feature 为 false 且不崩溃', registry.hasFeature('ai-core', 'nope') === false)` |
| 59 | `ok('getRelations 恒为数组（关系模型就位、无数据）', Array.isArray(registry.getRelations(...)))` |
| 60 | `ok('getPackage 支持「来源族-包」namespace 反查', registry.getPackage('content:vocabulary:ecdict-cet4:cet4')?.localId === 'cet4')` |

**第 57 行是"期望空"的断言**——`listening` 类型未接入，所以返回空数组是**正确行为**。这种"断言负空间"的写法很好，它防止了"type 未接入却返回了脏数据"。

**第 59 行是 T7 的全部覆盖**——只证明"返回数组、不崩"。

### 3.5 【2】ContentId 规范 — `tests/content-query.mjs:62-86`（7 条）

| 行 | 断言 |
|---|---|
| 64 | `ok('ielts 包 id 为 content:vocabulary:ecdict-ielts:ielts', ieltsManifest.id === 'content:vocabulary:ecdict-ielts:ielts', ieltsManifest.id)` |
| 65-69 | （多行）解析与构造往返一致性 |
| 70-73 | （多行）4 段式各段语义 |
| 74-77 | （多行）非法输入 |
| 78 | `ok('非法 ContentId 解析为 null', model.parseContentId('ielts') === null)` |
| 81-85 | （多行）namespace 唯一性相关 |

### 3.6 【5】searchWords — `tests/content-query.mjs:98-127`（14 条，检索能力核心）

| 行 | 断言 |
|---|---|
| 100 | `ok('跨包检索 abandon 有多条来源', hits.length >= 2, hits.map(h => h.packageLocalId).join(','))` |
| 102-106 | （多行）命中结构 |
| 108-112 | （多行）排序 |
| 113 | `ok('每条命中带包上下文', hits.every(h => h.packageId && h.packageLocalId && h.packageTitle))` |
| 115 | `ok('限定包检索只返回该包', ieltsOnly.length === 1 && ieltsOnly[0].packageLocalId === 'ielts')` |
| 117 | `ok('packageId 支持 4 段式', byContentId.length === 1)` |
| 118 | `ok('精确优先：首位为词形全等命中', hits[0].word.toLowerCase() === 'abandon')` |
| 121 | `ok('exact=true 不返回前缀命中', exactOff.length === 0, \`${exactOff.length}\`)` |
| 122 | `ok('exact=false 返回前缀命中', exactOn.length > 0 && exactOn[0].word.toLowerCase().startsWith('aban'), ...)` |
| 123 | `ok('空查询返回空数组', (await q.searchWords({ query: '   ' })).length === 0)` |
| 124 | `ok('limit 生效', (await q.searchWords({ query: 'a', limit: 7 })).length <= 7)` |
| 126 | `ok('中文按释义/翻译命中', zh.length > 0, zh[0] ? \`${zh[0].word}=${zh[0].translation}\` : 'none')` |

**第 126 行值得注意**：支持中文按释义检索，这是"背单词"场景的关键能力（用户记得中文意思但忘了英文拼写）。

### 3.7 【6】getWord — `tests/content-query.mjs:128-152`（8 条）

| 行 | 断言 |
|---|---|
| 132 | `ok('按 ContentId 取到词条', !!w && w.word === sample.word, ...)` |
| 133 | `ok('词条带翻译', !!w?.translation, w?.translation)` |
| 134 | `ok('词条唯一归属 ielts 包', w?.packageId === 'content:vocabulary:ecdict-ielts:ielts', ...)` |
| 141-145 | （多行）跨包同词寻址 |
| 147 | `ok('跨包同词各自可寻址（未找到重叠词形，跳过）', true, 'ielts ∩ cet4 为空')` ⚠️ **恒真断言** |
| 149 | `ok('不存在的词返回 null', (await q.getWord('content:word:ecdict-ielts:zzzznotaword')) === null)` |
| 150 | `ok('错误 type 返回 null', (await q.getWord('content:vocabulary:ecdict-ielts:ielts')) === null)` |
| 151 | `ok('非 ContentId 返回 null', (await q.getWord('abandon')) === null)` |

**第 147 行是一个恒真断言**（`true` 作为条件）。它的措辞诚实说明了原因：「未找到重叠词形，跳过」。这是一个**"没有数据就跳过但保留位置"的折中**——比静默删除好，但它确实**没有验证跨包同词寻址**。

### 3.8 【7】listWords — `tests/content-query.mjs:153-168`（5 条）

| 行 | 断言 |
|---|---|
| 156 | `ok('第 1 页 10 条', page1.length === 10)` |
| 157 | `ok('第 2 页与第 1 页无交集', !page1.some(h => page2.some(x => x.word === h.word)))` |
| 158 | `ok('id 落在包 namespace 内', page1.every(h => h.id.startsWith('content:word:ecdict-ielts:')))` |
| 159 | `ok('未知包返回空数组', (await q.listWords({ packageId: 'nope' })).length === 0)` |
| 161 | `ok('hasPhonetic 过滤生效', ph.length > 0 && ph.every(h => !!h.phonetic), \`${ph.length} 条带音标\`)` |

**第 157 行是"翻页不重不漏"的直接证据。**

### 3.9 【8】contentQuery 统一 API — `tests/content-query.mjs:169-203`（11 条）

| 行 | 断言 |
|---|---|
| 170-175 | （多行）统一 API 返回结构 |
| 176 | `ok('search({type:"word"}) 与 searchWords 结果一致', idOf(uni) === idOf(legacy), \`${uni.length} 条\`)` |
| 178 | `ok("type:'all' 与 type:'word' 结果一致（当前仅 word 已接入）", idOf(uniAll) === idOf(uni), ...)` |
| 179 | `ok("type:'listening'（未接入）返回空数组", (await cq.search({ type: 'listening', query: 'abandon' })).length === 0)` |
| 180 | `ok("search 默认 type 为 word", idOf(await cq.search({ query: 'abandon', pageSize: 50 })) === idOf(uni))` |
| 181 | `ok('search 精确排序保持：首位为词形全等', uni[0]?.word.toLowerCase() === 'abandon', ...)` |
| 183 | `ok('search 支持 4 段式 packageId', uniPkg.length === 1 && uniPkg[0].packageLocalId === 'ielts')` |

**第 176 行是"新旧 API 等价性"契约**——统一 API 是后来引入的，这条断言保证它与旧 API 行为一致，是重构安全网。

**设计背景**（引自 `src/core/content/query/content-query.ts` 顶部契约注释）：

> 统一入口原则写死（**禁止** `searchTopics()` / `searchAudios()` / `listListening()` 散装 API）

即：**所有内容检索必须走 `contentQuery` 一个入口**，不允许按类型散装多个 API。这是一个明确拒绝"给每种内容类型配一个 search 函数"的架构决策。

### 3.10 【9】Catalog + Content Index — `tests/content-query.mjs:204-280`

验证目录（Catalog）与索引（Content Index）的正确性。

**架构约束**（引自 `content-query.ts` 契约注释）：

> UI 只能通过本层检索、**不得直接持有词表数组做 filter**；只走 content-index 的 finder，**不得出现 `idx.byWord` / `idx.byId`**

即：索引的内部结构是私有的，**必须走 finder 函数**。

**这条约束当前被违反 17 处**（`DEBT-001`，UI 直读词数组 17 处，`KNOWN_ISSUES.md` 有逐文件行号表）。**契约测试覆盖不到这些违反路径**——因为它们是绕过 query 层的。

### 3.11 【10】id 自洽性 — `tests/content-query.mjs:281-306`

标题：`id 自洽性（生成侧 vs 寻址侧大小写口径）`

验证"生成 id 的一侧"和"用 id 寻址的一侧"在大小写处理上口径一致。实测提及 **Oxford 大小写敏感** 场景。

### 3.12 【11】Query Scope — `tests/content-query.mjs:307-339`

标题：`Query Scope（首页 / 搜索页 / 词库页 / Detail / 收藏页共用一套作用域）`

验证 5 个页面共用同一套作用域解析。

**契约原文**（`content-query.ts`）：`ContentScope` 与 `resolveScope` 的合并规则是 —— **显式平铺参数优先于 scope**。

### 3.13 【12】Search Sort 契约 — `tests/content-query.mjs:340-405`

标题：`Search Sort 契约（deterministic ⇒ 翻页不重不漏）`

验证排序是**确定性的**。

**为什么这条重要**：如果排序不稳定（同等权重项顺序随机），那么第 1 页取 10 条、第 2 页取 10 条时，**同一条可能出现在两页、或一条都不出现**。这是分页系统的经典陷阱，[12] 分区就是为它设的。

**注意**：这里的 "sort" 与 `A-2`（`GAP_ANALYSIS.md`：`updated` 排序语义是假的）是两个不同问题——[12] 保证了"同一排序下分页稳定"，但没保证"`updated` 排序字段本身有意义"。

### 3.14 【13】ContentSnapshot 契约 — `tests/content-query.mjs:406-529`（约 42 条，最大分区）

标题：`ContentSnapshot 契约（V4.1-P0.6：哪个实体的哪个快照）`

这是断言最多的分区，涉及 `findRevision` 等快照查找接口。它解决的问题是：**在内容会随版本变化的系统里，"用户看到的这一份"到底是哪个版本的哪一条？**

### 3.15 收尾

| 行 | 内容 |
|---|---|
| 538 | `console.log(\`共 ${pass + fail} 项，通过 ${pass}，失败 ${fail}\`)` |
| 542 | `process.exit(1)` |

---

## 4. 断言函数 `ok()`

与 E2E 的 `check()` 同构：**计数器 + 可选的 detail 字符串**。

```js
ok(描述, 条件, detail?) 
```

- `detail` 只在失败时打印（或作为附加信息），便于定位
- 全部分区跑完后统一打印合计

**注意**：`content-query.mjs` 的 `ok()` 是**二态**的（pass/fail），**没有 `check-bundle.mjs` 那样的 UNKNOWN 语义**。这是四层里唯一有 UNKNOWN 的一层（见 `TEST_STRATEGY.md` §4）。

---

## 5. 内容层实测数据（引自 `13-acceptance/FINAL_ACCEPTANCE.md`）

### 5.1 全库基线

| 项 | 值 |
|---|---|
| 包数 | **10** |
| 总词数 | **9346** |
| inline 包 | **7 个 / 346 词 / 36.17 KiB** |
| lazy 包 | **3 个 / 9000 词 / 1406.79 KiB** |
| manifest 合计 | **13.08 KiB**（最大单包 1.40 KiB） |
| schemaVersion | **4** |

### 5.2 内容缺陷（实测）

| 编号 | 问题 |
|---|---|
| `CONTENT-001` | CET 覆盖严重不足：cet4 **84 词 ≈ 1.9%**、cet6 **69 词 ≈ 1.3%** |
| `BUG-001` | `helpline` 的 `definition` 为空串——而 `manifest.stats.definition = 2999` 的口径是 **"key 存在"**而非"值非空" |
| `CONTENT-002` | 7 个包字段贫瘠 |
| `CONTENT-003` | **9163 条**缺 example / audio / pos |

**`BUG-001` 的口径问题值得审计方注意**：门禁第 2 项只校验 key 存在，所以"空串"能通过门禁。这是**门禁规则本身的边界**，不是执行疏漏。

---

## 6. 缺口总结

| 缺口 | 说明 |
|---|---|
| **无负例** | 20 项门禁从未被"坏包"触发过（见 `IMPORT_TEST.md`） |
| **第 12 项三条分支未执行** | (e) relation / (f) asset / (g) learning record |
| **第 20 项靠正则扫文本** | `registry.ts` 排版变化可能导致失配 |
| **无跨包唯一性约束是刻意的** | 设计决策，非缺陷 |
| **[6] 第 147 行恒真** | 跨包同词寻址实际未验证 |
| **`DEBT-001` 17 处绕过** | UI 直读词数组，契约测试覆盖不到 |
| **无 checksum 漂移负例** | 第 6/15 项的拦截能力未被证明 |
| **门禁未接入 CI** | `DEBT-002`——20 项只在开发者本机跑 |

---

## 相关文档

- 四层金字塔：`09-testing/TEST_STRATEGY.md`
- 能力矩阵：`09-testing/TEST_MATRIX.md`
- 负例清单：`09-testing/IMPORT_TEST.md`
- 缺陷编号：`13-acceptance/KNOWN_ISSUES.md`
- 架构缺口：`13-acceptance/GAP_ANALYSIS.md`
