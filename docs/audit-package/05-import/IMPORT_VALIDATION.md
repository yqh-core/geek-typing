# 导入校验门禁（IMPORT_VALIDATION）

> 状态：✅ 已有（实测）
>
> ✅ **已有**：`content:validate` 的 **20 项门禁**，逐条有实现行号、有退出码语义
> 📐 **待建**：用户上传链路的校验（零实现，见 §5）
>
> 基线 commit：`4152eb2`　｜　实测日期：2026-09-27
> 证据来源：`scripts/content/validate.mjs`（428 行）、`content/README.md:477-516`

---

## 1. 一句话事实

**20 项门禁是真实的、可执行的、有退出码的。** 它是本项目「不美化缺口」原则最直接的体现 —— 其中 3 项（第 18/19/20）是纯体积契约，7 项（第 4/6/8/9/12/15/16）是身份与去重契约。

门禁的判定原则写在 `validate.mjs:275-276`（原文）：

> **按「可判定性」分级：能判的判死，判不了的如实说跳过，绝不用「假装通过」凑绿。**

退出码语义（`:103-105`、`:423-424`）：

```js
let fails = 0
const fail = (msg) => { fails++; console.error(`  ✗ ${msg}`) }
const ok = (msg) => console.log(`  ✓ ${msg}`)
...
if (fails > 0) { console.error(`\n[content:validate] FAIL：${fails} 项`); process.exit(1) }
console.log(`\n[content:validate] PASS：${ids.length} 包全部通过`)
```

**用法**：`node scripts/content/validate.mjs`（= `npm run content:validate` = `npm run content:check`）。无参数，恒处理全部包。

---

## 2. 20 项门禁逐条

表格中的「红线代码」列是实现该门禁的真实行号（`scripts/content/validate.mjs`）。

| # | 门禁 | 判定逻辑 | 红线代码 | 失败后果 |
|---|---|---|---|---|
| 1 | 文件存在且 JSON 合法 | `manifest.json` / `words.json` 分别 `JSON.parse`；不可解析 → `continue`（跳过该包后续项） | `:141-147` | FAIL + 跳过该包 |
| 2 | manifest 必填字段完整 | `REQUIRED_FIELDS` 12 项全 `!== undefined` | `:162-165`，常量 `:90` | FAIL |
| 3 | ContentId 4 段式 | 匹配 `^content:vocabulary:[a-z0-9-]+:.+$` **且** `id.endsWith(':' + 目录名)` | `:167-170` | FAIL |
| 4 | 包内无重复词（精确词形） | 遍历 `words`，`Set` 去重后收集 dup | `:172-176` | FAIL（列出前 5 个） |
| 5 | `stats.items` === `words.length` | 相等 | `:178-180` | FAIL（提示跑 `content:build`） |
| 6 | `sources[].checksum` 一致 | 每条 `s.checksum === sha256Canonical(words)`；`sources` 为空也 FAIL | `:182-186` | FAIL |
| 7 | License 门禁 | 每条 source：license 为对象 + `name` 非空 + `attributionRequired` 为布尔；**外部来源（origin 不含 `curated`）必须有 `spdx`** | `:188-201`（关键 `:196`） | FAIL |
| 8 | 包 ContentId 全局唯一 | `seenIds` Map 查重 | `:203-205` | FAIL |
| 9 | **namespace 每包唯一** | `seenNs` Map；重复 → FAIL（词级 ContentId 将撞车） | `:207-215` | FAIL |
| 10 | `schemaVersion` === 4 | 常量 `SCHEMA_VERSION = 4`（`:93`） | `:232-234` | FAIL |
| 11 | `contentVersion` 为正整数 | `Number.isInteger && > 0` | `:236-238` | FAIL |
| 12 | **分级去重检测**（7 个子项 a~g） | 见 §3 | `:275-351` | 见 §3 |
| 13 | `packageId` === 目录名 | 相等 | `:217-219` | FAIL |
| 14 | `namespace` 与 `id` 第 3 段同源 | 严格相等（「每包唯一」由第 9 项兜底） | `:221-228` | FAIL |
| 15 | `contentChecksum` === `sha256Canonical(words)` | **必须走 canonical**，不得用文件原文或 `JSON.stringify` | `:240-242` | FAIL |
| 16 | 版本三元组自洽 | `revision`/`version` 正整数；`contentHistory` 非空且存在 `checksum === contentChecksum` 的条目，其 `version === contentVersion`、`1 ≤ revision ≤ contentRevision` | `:244-262` | FAIL |
| 17 | `build` 溯源完整 | `toolVersion` 非空字符串 + `builtAt` 可被 `Date.parse` + `sourceChecksum === contentChecksum` | `:264-273` | FAIL |
| 18 | **manifest 体积** | 单包 < 8 KiB **且** 全库 < 40 KiB | `:360-375`，常量 `:56-58` | FAIL |
| 19 | **inline 预算** | `offline.policy === 'inline'` 的包 Σ词 ≤ 1000 **且** Σ words.json ≤ 64 KiB | `:377-392`，常量 `:60-62` | FAIL |
| 20 | **策略一致性** | `manifest.offline.policy` ↔ `registry.ts` 实际加载方式（`words:` ↔ inline，`load:` ↔ lazy） | `:394-421`，解析器 `:75-88` | FAIL（未知策略只提示跳过） |

---

## 3. 第 12 项：分级去重检测（重点）

第 12 项不是一个检查而是一组，**按可判定性分了 7 个子项**（`validate.mjs:16-23` 头注释、`:275-351` 实现）：

| 子项 | 判据 | 红线代码 | 实际行为 |
|---|---|---|---|
| **(a)** 包内 duplicate localId（精确词形） | 第 4 项已覆盖 | `:280` | **只回显，不重复报错** |
| **(b)** 包内 duplicate **normalized** word | key = NFC + lowercase + 空白折叠（含 `\u00A0`）+ trim | `:282-292` | FAIL |
| **(c)** 跨包 duplicate ContentId | key = `${namespace}\|${normalized word}`，**同一个 key 出现在 ≥2 个包**才 FAIL；全库扫描后统一判定 | `:294-304` + `:354-358` | FAIL（兜底回归） |
| **(d)** duplicate source | 同一 `origin` 在 `sources[]` 出现两次 | `:306-310` | FAIL |
| **(e)** invalid / orphan relation | **仅当 `relations.json` 存在时**校验：端点须匹配 4 段式且在全库可达 | `:312-340` | 无文件 → 打印「跳过」（`:315`） |
| **(f)** broken asset | **仅当 `manifest.assets` 存在时**：`url` 须为 `http(s)://` 或 `/` 开头 | `:342-351` | 无字段 → 打印「跳过」（`:344`） |
| **(g)** orphan learning record | **运行时检查，由 Learning 层负责，脚本不校验、不进 CI** | 注释 `:278-279` | 永不执行 |

归一化 key 的实现（`:95-98`）：

```js
const WS_RE = /[\s\u00A0]+/g
const normKey = (raw) => String(raw ?? '').normalize('NFC').toLowerCase().replace(WS_RE, ' ').trim()
```

> ⚠️ **子项 (e) 与 (f) 当前恒为「跳过」**：实测 10 个包**均无 `relations.json`**、**均无 `manifest.assets` 字段**。
> 因此这两项**从未真正执行过一次**，审计时不得当成「已校验通过」。
> `content/README.md:515` 已明确记录这一事实：「当前 10 个包全部无该字段 ⇒ 该项恒跳过，别当成『已校验通过』」。

### 3.1 跨包同词是合法关系（重要澄清）

**第 4 项只查「包内」重复，不做任何跨包唯一性约束。** 头注释 `:6-8` 原文：

> 4. 包内 duplicate word 检测（**跨包同词合法**：IELTS/CET/TOEFL 各有 abandon 是正常数据关系，是本平台刻意支持的能力，任何「跨包词唯一」规则都是错误的）

实测：全库 **9346 词中有 2323 个跨包同名词**（如 `abandon` 同时在 ielts/cet4）。这些**不构成任何门禁违规**。

第 12(c) 项真正的目标是**跨包 duplicate ContentId**（即 namespace 撞车），它理论上不可能发生（因为第 9 项已保证 namespace 每包唯一）—— 所以它被定位为**兜底回归检测**（`:296-297` 注释）。

实测输出（`:358`）：

```
✓ 跨包无 duplicate ContentId（全库 9346 词扫描，namespace 唯一 ⇒ 兜底回归）
```

---

## 4. 第 18/19/20 项：体积与策略契约

### 4.1 阈值常量（`validate.mjs:54-64`）

```js
const MANIFEST_MAX_BYTES = 8 * 1024          // 单包 manifest 上限
const MANIFEST_TOTAL_MAX_BYTES = 40 * 1024   // 全库 manifest 总和上限
const INLINE_MAX_ITEMS = 1000                // inline 包词条数上限
const INLINE_MAX_BYTES = 64 * 1024           // inline 包 words.json 字节上限
const KNOWN_POLICIES = new Set(['inline', 'lazy'])
```

注释里带了**实测基线**（`:55-62`）：单包最大 1.40 KiB（ts-code）、全库 10 包 13.08 KiB、inline 7 包 346 词 / 36.17 KiB。

### 4.2 第 18 项的设计意图（`:360-363` 原文）

> manifest 常驻主 chunk（registry 静态 import），是「**包数**」的函数而不是「**词数**」的函数。
> 词库从 43 词涨到 3000 词时 manifest 只该多几十字节；越过 8 KiB 说明有人把词表/释义之类的重数据塞进了 manifest —— 那会 1:1 推高首屏。

### 4.3 第 19 项的设计意图（`:377-379` 原文）

> inline 包的 words.json 被静态 import 进主 chunk，**实测传导比 1:1.0005**（kaoyan 改 inline ⇒ 主 chunk raw +471.92 KiB / gzip +166.41 KiB）。词库增长必须走 lazy，不能靠加 inline。

### 4.4 第 20 项：为什么必须扫 TS 源码

`:51-52` 注释：

> 第 20 项比对对象：包的「实际加载方式」只在这里定义，Node 跑不了 TS，只能扫文本

`registryLoadMode()`（`:75-88`）的解析策略：

1. 用正则 `\{[^{}]*localId:\s*['"\`]<id>['"\`][^{}]*\}` 定位注册对象块（`:77`）
2. 0 命中 → `missing`；> 1 命中 → `ambiguous`（`:79-80`）
3. 块内含 `words:` 且含 `load:` → `conflict`（`:84`）
4. 只含 `words:` → `inline`；只含 `load:` → `lazy`（`:85-86`）
5. 都无 → `unknown`（`:87`）

> ⚠️ 注释 `:72-73` 特别提醒：registry 里可能存在**已声明但未被注册项使用的死代码 import**（如 `xxxWords`），只扫 import 段会把 lazy 包误判成 inline，故**必须以注册对象块为准**。

**第 20 项对未知策略的处理**（`:402`、`:413-415`）：

```js
if (!KNOWN_POLICIES.has(policy)) { skipped.push(...); continue }
...
if (skipped.length > 0) {
  console.log(`  · 策略一致性跳过 ${skipped.length} 包（未知策略，不判通过也不判失败）：${skipped.join('；')}`)
}
```

`runtime` / `on-demand` 等策略**只提示跳过，不判通过也不判失败** —— 这是「不伪造通过」原则的落实。

---

## 5. 📐 待建：用户上传链路的校验

> 以下全部为**建议**，非实测事实。当前代码零实现。

用户上传**不经过**上述任何一项门禁。现有的全部校验只有 `customBanks.ts:64` 与 `:83` 的两条正则。

### 5.1 现有 vs 应建（对照表）

| 校验维度 | 内容包门禁（已有） | 用户上传（现状） | 建议补齐 |
|---|---|---|---|
| JSON 合法性 | 第 1 项 | 静默返回 `[]`（`customBanks.ts:65-67`） | 提示具体错误位置 |
| 必填字段 | 第 2 项（12 项） | 无（缺失即空串） | 至少 `word` 非空 |
| 词形合法性 | 白名单字段 + 正则 | 正则 `/^[A-Za-z][A-Za-z'\- ]*$/` | 放宽以支持重音/非拉丁字母 |
| 重复词 | 第 4 项 + 12(b) | **无** | 导入前报告并允许去重 |
| 条目数上限 | 第 19 项（inline ≤ 1000） | **无** | 建议 5000 上限并提供降级 |
| 体积上限 | 第 18/19 项 | **无**（配额溢出即抛异常） | 见 §5.2 |
| 编码 | `words.json` 恒 UTF-8 | `file.text()` 恒 UTF-8，无检测 | 建议加 `TextDecoder` 探测 |
| license / 来源 | 第 7 项 | **无** | 用户内容无法主张 license，建议标注「用户自备」 |
| 版本 / checksum | 第 15/16/17 项 | **无** | 建议给自定义词库算 checksum 以支持导出/去重 |

### 5.2 建议新增的用户侧门禁（**建议**）

若未来建用户上传体系，建议至少设 8 条（编号 U-1 ~ U-8，**不在现有 20 项内**，当前不存在）：

| # | 断言 | 阈值建议 | 理由 |
|---|---|---|---|
| U-1 | 文件体积 ≤ N MiB | 建议 5 MiB | 浏览器内存 + localStorage 配额 |
| U-2 | 解析后条目数 ≤ M | 建议 5000 | 超出 localStorage 必然 QuotaExceeded |
| U-3 | 编码可识别 | UTF-8 / GBK | 现状：GBK 静默变空 |
| U-4 | 空文件 / 全空白拒绝 | — | 现状：已有间接提示 |
| U-5 | MIME 与内容一致（嗅探，非信任 MIME） | — | 防伪装文件 |
| U-6 | 无控制字符 / 无超长单词 | 单词 ≤ 64 字符 | 现状：无 |
| U-7 | 重复词报告并可一键去重 | — | 现状：重复照收 |
| U-8 | 落盘失败可回滚 | — | 现状：`customBanks.ts:22` 裸 setItem 会抛 |

### 5.3 与内容门禁的关系

**不建议**让用户上传走 `validate.mjs` 的 20 项 —— 其中 6 项（第 3/8/9/10/13/14 项）是**包身份契约**，与用户私有词库无关。建议按 `IMPORT_PIPELINE.md` §4.3 抽出可复用部分（规范化 + 去重 + 字段白名单），其余保持独立。

---

## 6. 结论

- **20 项门禁真实、可执行、有退出码**，是本项目质量底线的主要承载者。尤其第 15 项（checksum 必须走 canonical）与第 18/19/20 项（体积与策略契约）在同类项目中并不常见。
- **3 项恒跳过**：第 12(e) relation、第 12(f) asset、第 12(g) learning record。实测「跳过」不是「通过」，审计时须区分。
- **用户上传链路零校验**：仅有 2 条正则，且配额溢出会抛未捕获异常（`customBanks.ts:22` 无 try/catch，对比 `reviewStore.ts:64-96` 的三轮熔断）。
