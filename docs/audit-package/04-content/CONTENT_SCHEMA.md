# 内容 Schema（CONTENT_SCHEMA）

> 状态：✅ 已有 —— 全部字段与样本从实际落盘文件读出，非手工编写。
> 基线 commit：`4152eb2`　｜　实测日期：2026-09-27
> 数据源：`content-samples/MANIFESTS.md`、`content-samples/FIELD-COVERAGE.md`（由
> `docs/audit-package/_generated/extract-samples.mjs` 遍历实际 JSON 生成）

---

## 1. `schemaVersion` = 4

| 项 | 值 |
|---|---|
| 常量定义 | `SCHEMA_VERSION = 4` |
| 定义位置（TS） | `src/core/content/model/content.ts:127` |
| 定义位置（构建） | `scripts/content/build.mjs:55` |
| 定义位置（门禁） | `scripts/content/validate.mjs:93` |
| 落盘字段 | `manifest.schemaVersion` |
| 门禁 | validate 第 10 项（`validate.mjs:233-234`）：必须 `=== 4` |
| 实测（10 包） | 全部为 `4`（`MANIFESTS.md` 窄表） |

语义（`model/content.ts:119-126`）：

> 只在 content schema 发生**破坏性变更**时递增（字段增删/改名/语义变更）。
> ⚠️ 与「内容版本」（`contentVersion`）是两回事：
> `SCHEMA_VERSION` = 结构的形状；`contentVersion` = 某条内容的内容修订次数。

历史：V4.1-P0.5 引入（`build.mjs:52`、`content/README.md:13`）。

---

## 2. `manifest.json` 全部字段

TypeScript 定义：`src/core/content/schema.ts:24-79`（`PackageManifest` 接口）。

### 2.1 字段表（按落盘顺序，实测自真实 manifest）

| # | 字段 | 类型 | 来源 | 说明 |
|---|---|---|---|---|
| 1 | `schemaVersion` | `number` | build 派生 | 结构版本，当前 4 |
| 2 | `packageId` | `string` | build 派生 | **必须 === 目录名** |
| 3 | `namespace` | `string` | build 派生 | 从 `id` 第 3 段反解 |
| 4 | `contentRevision` | `number` | build 派生 | 单调递增审计号 |
| 5 | `contentVersion` | `number` | build 派生 | 对外学习契约版本 |
| 6 | `contentChecksum` | `string` | build 派生 | `'sha256:' + hex` 完整值 |
| 7 | `contentPublishedAt` | `string` | build 派生 | ISO date |
| 8 | `contentHistory` | `ContentRevisionEntry[]` | build 派生 | 按 revision 升序 |
| 9 | `build` | `{toolVersion, builtAt, sourceChecksum}` | build 派生 | 构建溯源 |
| 10 | `id` | `string` | build 派生 | 4 段式 ContentId |
| 11 | `type` | `ContentType` | 手写 | 当前恒为 `'vocabulary'` |
| 12 | `version` | `string` | 手写 | semver，实测 10 包全为 `"1.0.0"` |
| 13 | `title` | `string` | 手写 | |
| 14 | `titleEn` | `string` | 手写 | |
| 15 | `description` | `string` | 手写 | |
| 16 | `descriptionEn` | `string` | 手写 | |
| 17 | `language` | `string` | 手写 | 实测 10 包全为 `"en"` |
| 18 | `exam` | `string \| null` | 手写 | 非备考库为 `null` |
| 19 | `tags` | `string[]` | 手写 | 包级 tag，Query scope 用它过滤 |
| 20 | `icon` | `string` | 手写 | lucide 图标名 |
| 21 | `features` | `{phonetic, definition} & Record<string, boolean>` | 手写 | 能力开关 |
| 22 | `stats` | `{items} & Record<string, number>` | build 派生 | 自动派生 |
| 23 | `sources` | `ContentSource[]` | build 派生（license 手写） | 多来源溯源 |
| 24 | `offline` | `{supported, policy}` | 手写 | inline / lazy / runtime / on-demand |
| 25 | `normalize?` | `{stripHtml?: boolean}` | 手写 | **可选**，仅代码词库声明 |

**必填字段门禁**（`validate.mjs:90`，共 12 个）：

```js
const REQUIRED_FIELDS = ['id', 'type', 'version', 'title', 'description', 'language',
                         'tags', 'icon', 'features', 'stats', 'sources', 'offline']
```

注意：`titleEn` / `descriptionEn` / `exam` / `packageId` / `namespace` / 版本三元组
**不在 `REQUIRED_FIELDS`** —— 前四项由各自门禁项（#13 / #14 / #16 / #17）单独把关。

### 2.2 禁止手改的字段

契约 §7.1（`:387-389`）列出 11 个字段**禁止手改**，漂移时跑 `npm run content:build`：

```
id / namespace / packageId / stats / sources[].checksum / schemaVersion
/ contentRevision / contentVersion / contentChecksum / contentHistory / build
```

### 2.3 三个容易混淆的点

**① `contentChecksum` ≠ `sources[].checksum` ≠ `build.sourceChecksum`**

| 字段 | 指纹对象 | 计算处 |
|---|---|---|
| `contentChecksum` | **规范化入库内容**的指纹 | `build.mjs:102` `sha256Canonical(words)` |
| `sources[].checksum` | **来源原始数据**的指纹 | `build.mjs:103` |
| `build.sourceChecksum` | 本次构建读入源数据 | `build.mjs:176` |

当前来源就是本仓 `words.json` ⇒ **三者同值**（门禁 #17 要求 `build.sourceChecksum === contentChecksum`）。
将来接原始 CSV / 上游文件后会分叉 —— 分叉本身即 provenance 的价值。

**② `packageId` = 目录名，`namespace` = `id` 第 3 段**

「一词三表」：目录 / `manifest.packageId` / ContentId 第 4 段同源（门禁 #13）；
`namespace` 与 `id` 第 3 段同源（门禁 #14）。

**③ `normalize` 是唯一可选字段**

实测：**10 包中仅 2 个代码词库声明了该字段** —— `ts-code` 与 `go-code`，
值均为 `{"stripHtml":false}`。其余 8 包 `normalize === undefined`。

该字段的有无直接影响 manifest 字段数：**有 normalize 的包 25 个键，无的 24 个键**。

---

## 3. 真实 manifest 样本（`content/vocabulary/cet4/manifest.json`，逐字照抄）

落盘形态为**紧凑单行 + 尾随换行**（`canonicalFile()`）；下表为可读性展开。

```json
{
  "build": {
    "builtAt": "2026-09-26T13:59:06.588Z",
    "sourceChecksum": "sha256:5b6591b3b7183b5274fbe5167a8c4b9b3afd6a70a05b974a4f70624fce91611d",
    "toolVersion": "content-build/1.1"
  },
  "contentChecksum": "sha256:5b6591b3b7183b5274fbe5167a8c4b9b3afd6a70a05b974a4f70624fce91611d",
  "contentHistory": [
    {
      "checksum": "sha256:5b6591b3b7183b5274fbe5167a8c4b9b3afd6a70a05b974a4f70624fce91611d",
      "publishedAt": "2026-09-26",
      "revision": 1,
      "version": 1
    }
  ],
  "contentPublishedAt": "2026-09-26",
  "contentRevision": 1,
  "contentVersion": 1,
  "description": "大学英语四级高频核心词",
  "descriptionEn": "大学英语四级高频核心词",
  "exam": "CET-4",
  "features": { "phonetic": true, "definition": true },
  "icon": "GraduationCap",
  "id": "content:vocabulary:ecdict-cet4:cet4",
  "language": "en",
  "namespace": "ecdict-cet4",
  "offline": { "policy": "inline", "supported": true },
  "packageId": "cet4",
  "schemaVersion": 4,
  "sources": [
    {
      "checksum": "sha256:5b6591b3b7183b5274fbe5167a8c4b9b3afd6a70a05b974a4f70624fce91611d",
      "importedAt": "2026-09-26",
      "license": {
        "attributionRequired": false,
        "commercialUse": true,
        "name": "MIT License",
        "spdx": "MIT",
        "url": "https://opensource.org/licenses/MIT"
      },
      "origin": "ECDICT"
    }
  ],
  "stats": { "phonetic": 84, "definition": 84, "items": 84 },
  "tags": ["cet", "vocabulary"],
  "title": "四级 CET-4",
  "titleEn": "四级 CET-4",
  "type": "vocabulary",
  "version": "1.0.0"
}
```

### 3.1 落盘键序的观察（N-1 规则的实际效果）

`canonicalize()` 的键序规则（契约 §5.1 N-1）：

> 白名单字段按固定顺序输出 `['word','translation','phonetic','definition','partOfSpeech']`。
> ⚠️ 白名单对**任意对象**生效、不只对词条。

实际效果：

- **顶层键序** = `VERSION_FIELDS` 固定序 + 其余按 code-unit 字典序
  （`build.mjs:63-66` 定义 `VERSION_FIELDS`，`:163-177` 先 `delete` 再展开）。
- **`stats` 键序** = `phonetic` → `definition` → `items`
  （前两个命中白名单被前置，`items` 走字典序）—— 与 `MANIFESTS.md` 表格中的 `{phonetic, definition, items}` 一致。
- **`license` 键序** = `attributionRequired` → `commercialUse` → `name` → `spdx` → `url`
  （全部走字典序，无一命中白名单）。
- **`offline` 键序** = `policy` → `supported`（`p` < `s`）。
- **`build` 键序** = `builtAt` → `sourceChecksum` → `toolVersion`（字典序）。

→ 这就是「同数据不同插入序必同指纹」的实现方式：落盘键序由算法决定，不由手写顺序决定。

---

## 4. `WordItem` / `WordPayload` 字段

### 4.1 ⚠️ 两个类型描述同一份数据，但字段数不同

| 类型 | 定义位置 | 字段 |
|---|---|---|
| `WordItem` | `src/core/content/schema.ts:83-88` | `word` / `translation` / `phonetic?` / `definition?`（**4 个**） |
| `WordPayload` | `src/core/content/model/vocabulary.ts:29` | = `Omit<WordContent, 'id' \| 'type'>`（**word / translation / phonetic? / definition? / partOfSpeech?**，**5 个**） |
| `WordContent` | `src/core/content/model/vocabulary.ts:8-18` | `+ id` / `+ type: 'word'`（**6 个**，含继承的 `ContentItem` 两字段） |

契约 §8.1（`:441-443`）明确以哪个为准：

> ⚠️ `schema.ts` 里的 `WordItem` 只是 `WordPayload` 的**子集描述**（缺 `partOfSpeech`），
> 写类型请以 `WordPayload` 为准，否则会丢字段。

**这是一处类型层的不一致**：`schema.ts:83` 导出的 `WordItem` 被 `src/data/wordBanks.ts:8-10`
用作 UI 侧词条类型，意味着 **UI 侧的类型定义看不到 `partOfSpeech`**。

### 4.2 `WordContent` 完整定义

`src/core/content/model/vocabulary.ts:8-18`：

```ts
export interface WordContent extends ContentItem {
  type: 'word'
  /** 词形原文（code 词库为整行代码，大小写敏感） */
  word: string
  translation: string
  phonetic?: string
  /** 英文释义（ECDICT 提供；code 词库无） */
  definition?: string
  /** 词性（V4.1-P1 由 ECDICT 词性列注入；当前未填充） */
  partOfSpeech?: string[]
}
```

`partOfSpeech` 的状态（`:16-17` 注释）：**「V4.1-P1 由 ECDICT 词性列注入；当前未填充」**。
`normalize.mjs:46-48` 把它列入白名单与参与规范化的字段集合（但不做文本清洗）：

```js
const FIELD_WHITELIST = ['word', 'translation', 'phonetic', 'definition', 'partOfSpeech']
const TEXT_FIELDS = ['word', 'translation', 'phonetic', 'definition']   // partOfSpeech 是枚举型
```

### 4.3 `PhraseContent`（模型占位）

`src/core/content/model/vocabulary.ts:21-25`：

```ts
export interface PhraseContent extends ContentItem {
  type: 'word'
  phrase: string
  translation: string
}
```

注释（`:20`）：「短语/搭配（**模型占位**：Phrase/Example 属同一类型族，数据源到位后再落数据）」。
**无任何数据**。

---

## 5. 真实样本（词条级）

数据源：遍历 `content/vocabulary/*/words.json` 实测重算（判定口径：key 存在且值为非空字符串）。
口径说明与差异详见 `CONTENT_QUALITY.md` §7.1。

### 5.1 全库 key 汇总

| key | 全库出现条数 | 占全库词条比例 | 覆盖包数 |
|---|---|---|---|
| `word` | 9346 | 100.00% | 10 / 10 |
| `translation` | 9346 | 100.00% | 10 / 10 |
| `definition` | 9144 | 97.84% | 5 / 10 |
| `phonetic` | 9076 | 97.11% | 5 / 10 |

**全库只出现 4 个不同的 key**。

⚠️ 口径提示：`definition` 按「非空」计为 **9144**（97.84%）；若按「键存在」计则为 9153（97.93%），差额 9 条来自全库 9 条空串 `definition`（ielts 1 条 + toefl 8 条）。本文采用「非空」口径。注意 `content-samples/FIELD-COVERAGE.md` 内部两种口径混用（其 §一 与 §二/§三 不一致），详见 `CONTENT_QUALITY.md` §7.1。

### 5.2 逐包 key 频次

| 包 | 总词条数 | `word` | `translation` | `phonetic` | `definition` |
|---|---|---|---|---|---|
| ai-core | 43 | 43 | 43 | **0** | **0** |
| cet4 | 84 | 84 | 84 | 84 | 84 |
| cet6 | 69 | 69 | 69 | 69 | 69 |
| cloud-native | 30 | 30 | 30 | **0** | **0** |
| frontend | 20 | 20 | 20 | **0** | **0** |
| go-code | 50 | 50 | 50 | **0** | **0** |
| ielts | 3000 | 3000 | 3000 | 2986 | 2999 |
| kaoyan | 3000 | 3000 | 3000 | 2994 | 3000 |
| toefl | 3000 | 3000 | 3000 | 2943 | 2992 |
| ts-code | 50 | 50 | 50 | **0** | **0** |
| **合计** | **9346** | **9346** | **9346** | **9076** | **9144** |

（`definition` 列按「非空」口径；ielts 少 1、toefl 少 8 即为空串条目，见 `CONTENT_QUALITY.md` §3.2。）

### 5.3 `normalize.stripHtml` 的合规核对（实测：合规）

按契约 §7.3（`:422-425`）与 `normalize.mjs:14-18`，
**代码词库（`ts-code` / `go-code`）必须声明 `normalize.stripHtml: false`**。

实测 manifest 字段（逐包核对）：

| 包 | `normalize` 字段 | `words.json` 中含 `<` 或 `>` 的词条数 | 是否符合契约 |
|---|---|---|---|
| **ts-code** | `{"stripHtml":false}` | **16 / 50** | ✅ 符合，且**必要** |
| **go-code** | `{"stripHtml":false}` | **3 / 50** | ✅ 符合，且**必要** |
| 其余 8 包 | 缺失（`undefined`） | 0 | ✅ 符合（非代码词库） |

**结论：合规，无缺口。**

复核命令与实测输出：

```bash
$ node scripts/content/normalize.mjs go-code ts-code
[content:normalize] 2 包（干跑，不落盘）
   · go-code: manifest.normalize.stripHtml=false → 跳过 HTML 剥离与实体解码（代码词库）
▸ go-code: 规范化 0 条 / 重复 0 / 空字段 0 / 非法字段 0（已规范）
   · ts-code: manifest.normalize.stripHtml=false → 跳过 HTML 剥离与实体解码（代码词库）
▸ ts-code: 规范化 0 条 / 重复 0 / 空字段 0 / 非法字段 0（已规范）
```

**该开关确实是必要的**（若缺失会造成数据损坏）—— 受影响的真实词条样本：

| 包 | 受影响词条（含尖括号） | 若剥离 HTML 的后果 |
|---|---|---|
| ts-code | `type Handler<T> = (event: T) => void;` | → `type Handler = (event: T) => void;`（泛型参数被删） |
| ts-code | `const ref = useRef<HTMLInputElement>(null);` | → `const ref = useRef(null);`（类型参数被删） |
| go-code | `if n := len(items); n > 0 {` | `>` 不构成 `<[^>]*>` 完整匹配，**不受影响** |

⚠️ **但门禁不校验该字段的存在性** —— `REQUIRED_FIELDS`（`validate.mjs:90`）不含 `normalize`，
`validate.mjs` 也无对应检查项。这意味着：

> **这一项合规是「人工维持」的，不是「门禁守护」的。**
> 新增代码词库时若忘记声明该字段，`content:validate` **不会报错**，CI 不会拦截，
> 而词表会在下一次 `content:normalize --write` 时被静默破坏。

`normalize.mjs:14-18` 自述该缺陷「由 ts-code 实测 5 条命中后固化」——
当时是人工发现，非门禁捕获。

**建议**（标注为「建议」，非现状）：
在 `validate.mjs` 增加一项门禁 ——
`words.json` 中存在匹配 `/[<>]/` 的词条时，该包必须声明 `normalize.stripHtml === false`。
这样才把「人工维持的合规」变成「门禁守护的不变式」。

---

## 6. 字段级门禁与派生

### 6.1 `stats` 的自动派生

`build.mjs:181-186`：

```js
stats: {
  ...m.stats,
  items: words.length,
  phonetic: words.filter((w) => w.phonetic).length,
  definition: words.filter((w) => w.definition).length,
},
```

**注意 `definition` 的口径是「key 存在」而非「值非空」**（`w.definition` 是 truthy 判断，
空字符串 `""` 会 **不计入**）。

⚠️ 由此产生一处口径歧义 —— `KNOWN_ISSUES.md#BUG-001`：

> ielts 包第 9 条 `helpline` 的 `definition` 为 `""`（空串，非缺失）。
> manifest `stats.definition=2999` 的口径是"**key 存在**"，而非"值非空"。
> 若校验改用非空判定，会差 1 条。

复核：`FIELD-COVERAGE.md` 的「含有」判定标准是「该 key 存在，且值为**非空字符串**」，
实测 ielts `definition` 列（含非空）= **2999**，与 manifest 声明一致；
但 `MANIFESTS.md` 的 stats 声明值也是 **2999** —— 两处一致，
说明**该包恰好只有 1 条空值且它已被 `w.definition` 的 truthy 判断排除**，
统计口径在数值上巧合一致。

### 6.2 `sources[].license` 门禁

`validate.mjs:188-201` 第 7 项：

```js
if (!lic || typeof lic !== 'object') fail(...)          // 必须结构化对象
if (!lic.name) fail(...)                                // name 非空
if (typeof lic.attributionRequired !== 'boolean') fail(...)  // 布尔
if (!lic.spdx && !String(s.origin).includes('curated')) fail(...)  // 外部来源必须有 SPDX
```

实测（10 包）：MIT 5 包有 `spdx: "MIT"`；Proprietary 5 包无 `spdx` 但 `origin`
含 `curated` ⇒ 通过。

### 6.3 `offline.policy` 门禁

第 20 项（`validate.mjs:394-421`）：`manifest.offline.policy` 必须与 `registry.ts` 的
实际加载方式一致（`words:` ↔ inline，`load:` ↔ lazy）。

实现方式特殊：**Node 跑不了 TS，只能扫 registry.ts 文本**（`registryLoadMode()`，`:75-88`）。

实测：10/10 一致（`content/README.md:585`）。

---

## 7. 一句话结论

> `schemaVersion = 4`，manifest 有 **25 个字段**（含 1 个可选 `normalize`），
> 其中 **11 个禁止手改**、由 `content:build` 派生，另有 12 个必填字段门禁。
> 词条层实际只有 **4 个 key**（`word` / `translation` / `phonetic` / `definition`），
> 类型定义里的 `partOfSpeech` 与 `PhraseContent` **零数据**。
> 一项发现：`normalize.stripHtml` 开关的合规是**人工维持**的 ——
> 两个代码词库当前都正确声明（ts-code 16/50、go-code 3/50 词条含尖括号，开关确有必要），
> 但**门禁不校验该字段的存在性**，新增代码词库时漏声明不会被拦下（详见 §5.3）。
