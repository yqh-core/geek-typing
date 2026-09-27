# 导入规格（IMPORT_SPEC）

> 状态：🔄 混合（本文分节标注）
>
> ✅ **已有**：内容包 JSON 链路的完整规格 —— 目录契约、文件形状、字段白名单、命名规则、CLI 流程
> 📐 **待建**：用户上传体系 —— 无服务端、无文件接收、无入库流程
>
> 基线 commit：`4152eb2`　｜　实测日期：2026-09-27
> 证据来源：`content/README.md`、`CONTENT_CONTRACT.md`（根目录，45 KiB）、`scripts/content/*.mjs`、`src/lib/customBanks.ts`

---

## 1. 一句话事实

**本项目有两条叫「导入」的链路，能力差距极大：**

| 链路 | 使用者 | 状态 | 输入 | 校验 |
|---|---|---|---|---|
| **A. 内容包导入**（开发/CI 侧） | 仓库维护者 | ✅ 已有 | 仓库内 `words.json` | 20 项门禁 |
| **B. 用户自定义词库**（浏览器侧） | 终端用户 | 🔄 部分（仅纯文本） | 粘贴文本 / 本地文件 | 仅 2 条正则（见 §3.2） |

需求文档所强调的「导入体系」若指 B，则**本项目完成度接近 0**；若指 A，则完成度较高。审计时必须先做此区分。

---

## 2. ✅ 已有：链路 A —— 内容包导入规格

### 2.1 目录契约

`content/README.md:63-76` 定义：

```
content/                     内容（是什么）
└── vocabulary/<包 id>/{manifest.json, words.json, relations.json?}
assets/                      资产（文件在哪）—— 规划中，尚未建目录
```

**实测**：`content/` 下只有 `README.md` 与 `vocabulary/` 两项（`find content -maxdepth 1 -type d` → `content` / `content/vocabulary`）。`content/assets/` **不存在**。`relations.json` 在 10 个包中**均不存在**。

### 2.2 包标识三要素（一词三表）

`content/README.md:404-405`：

| 概念 | 取值示例 | 守门门禁 |
|---|---|---|
| 目录名 | `ielts` | — |
| `manifest.packageId` | `ielts`（必须 === 目录名） | 第 13 项 |
| ContentId 第 4 段 | `content:vocabulary:ecdict-ielts:ielts` 的 `ielts` | 第 3 项 |

`namespace` 规则 = `${来源族}-${包 id}`（`build.mjs:45-49` 的 `SOURCE` 表）：

```js
const SOURCE = {
  ielts: 'ecdict', kaoyan: 'ecdict', toefl: 'ecdict', cet4: 'ecdict', cet6: 'ecdict',
  'ai-core': 'curated', 'cloud-native': 'curated', frontend: 'curated',
  'ts-code': 'curated', 'go-code': 'curated',
}
const namespaceOf = (id) => `${SOURCE[id] ?? 'curated'}-${id}`   // build.mjs:49
```

> ⚠️ **namespace 必须每包唯一**（门禁第 9 项）：词级 localId 只有词形、不含包 id，所以「各包 namespace 互不相同」是**词级 ContentId 全局唯一的充要条件**。早期用来源族 `ecdict` 当 namespace，导致 cet4/toefl/ielts 三包 `abandon` 撞车（`content/README.md:91-93`）。

### 2.3 `words.json` 形状（最小契约）

最小形状 = `word` + `translation`（`content/README.md:465`）。完整字段白名单由 `normalize.mjs:46` 定义：

```js
const FIELD_WHITELIST = ['word', 'translation', 'phonetic', 'definition', 'partOfSpeech']
```

**实测各包真实字段**：全库 9346 词只用到 4 个 key —— `word` / `translation` / `definition` / `phonetic`。**`partOfSpeech` 全库 0 条**（白名单内但无数据）。白名单外字段会被 `normalize.mjs:132-134` 报为「非法字段」并 `exit 1`。

真实词条样本（`content/vocabulary/ielts/words.json` 首条）：

```json
{"word":"abandon","translation":"放弃","phonetic":"ə'bændən","definition":"放弃；抛弃"}
```

### 2.4 `manifest.json` 形状

**手工写**的只有展示字段；**自动派生**的字段禁止手改（`content/README.md:387-389`）。

| 字段组 | 字段 | 来源 |
|---|---|---|
| 手写 | `type` / `title(En)` / `description(En)` / `language` / `exam` / `tags` / `icon` / `features` / `offline` / `normalize?` | 人工 |
| 派生 | `id` / `packageId` / `namespace` / `stats` / `sources[].checksum` / `schemaVersion` / `contentRevision` / `contentVersion` / `contentChecksum` / `contentHistory` / `build` | `content:build` |

真实样本（`content/vocabulary/cet4/manifest.json`，紧凑单行原文，此处展开可读）：

```json
{
  "schemaVersion": 4,
  "packageId": "cet4",
  "namespace": "ecdict-cet4",
  "contentRevision": 1,
  "contentVersion": 1,
  "contentChecksum": "sha256:5b6591b3b7183b5274fbe5167a8c4b9b3afd6a70a05b974a4f70624fce91611d",
  "contentPublishedAt": "2026-09-26",
  "contentHistory": [{ "revision": 1, "version": 1, "checksum": "sha256:5b65…", "publishedAt": "2026-09-26" }],
  "build": { "toolVersion": "content-build/1.1", "builtAt": "2026-09-26T13:59:06.588Z", "sourceChecksum": "sha256:5b65…" },
  "id": "content:vocabulary:ecdict-cet4:cet4",
  "type": "vocabulary",
  "version": "1.0.0",
  "title": "四级 CET-4",
  "description": "大学英语四级高频核心词",
  "language": "en",
  "exam": "CET-4",
  "tags": ["cet", "vocabulary"],
  "icon": "GraduationCap",
  "features": { "phonetic": true, "definition": true },
  "stats": { "items": 84, "phonetic": 84, "definition": 84 },
  "sources": [{ "origin": "ECDICT", "checksum": "sha256:5b65…", "importedAt": "2026-09-26", "license": { "spdx": "MIT", "name": "MIT License", "url": "https://opensource.org/licenses/MIT", "attributionRequired": false, "commercialUse": true } }],
  "offline": { "policy": "inline", "supported": true }
}
```

`REQUIRED_FIELDS`（`validate.mjs:90`）共 12 项，缺任一即 FAIL（第 2 项）：

```js
const REQUIRED_FIELDS = ['id', 'type', 'version', 'title', 'description', 'language', 'tags', 'icon', 'features', 'stats', 'sources', 'offline']
```

### 2.5 命名规则

| 对象 | 规则 | 依据 |
|---|---|---|
| 包 id（目录名） | 小写字母/数字/连字符，如 `ai-core` | `SOURCE` 表 + 门禁第 3 项正则 `^content:vocabulary:[a-z0-9-]+:.+$` |
| namespace | `${来源族}-${包 id}`，每包唯一 | `build.mjs:49`、门禁第 9 项 |
| 词级 localId | 词形；**id 侧禁止 lowercase**（C-6 契约） | 契约 §2.3 / I-19 |
| 多义词后缀 | `run` / `run-2`，或 `run-v1` / `run-n1`（规范已写死，实现待需） | `content/README.md:98` |
| 外部来源 | 必须带 `license.spdx`（未知协议不得入库） | 门禁第 7 项，`validate.mjs:196-199` |

### 2.6 离线策略（打包规格）

`content/README.md:531-543`：**这是产品级约束，不是性能建议**。

| policy | 加载方式 | registry 写法 | 阈值 |
|---|---|---|---|
| `inline` | 静态 import → 进主 chunk | `words:`（`registry.ts:59-63,67-68`） | Σ词 ≤ 1000 且 Σ words.json ≤ 64 KiB（门禁第 19 项） |
| `lazy` | 动态 import → 独立 chunk | `load: () => import('...?raw')`（`registry.ts:64-66`） | 无上限，但受部署体积约束 |

**判定规则**（`content/README.md:596`）：**词数 > 1000 或 words.json > 64 KiB ⇒ 必须 lazy**。

**实测分布**：7 个 inline（`ai-core`/`cloud-native`/`frontend`/`cet4`/`cet6`/`ts-code`/`go-code`，共 346 词 / 37.15 KiB）+ 3 个 lazy（`ielts`/`kaoyan`/`toefl`，各 3000 词 / 约 471 KiB）。

### 2.7 固定操作流程

见 `IMPORT_PIPELINE.md` §3（7 步）。第 6 步「登记 registry」是唯一手工环节。

---

## 3. 🔄 用户导入：仅有的窄路径

### 3.1 ✅ 已有：粘贴 / 本地文件 → localStorage

唯一用户入口在 `src/components/BankManager.tsx`（199 行）+ `src/lib/customBanks.ts`（92 行）。

| 能力 | 位置 | 实测行为 |
|---|---|---|
| 粘贴文本区 | `BankManager.tsx:105-112` | `<textarea>`，placeholder 示例 `quantization = 量化` |
| 本地文件 | `BankManager.tsx:132-138` | `<input type="file" accept=".txt,.json,.csv,.md">` |
| 文件读取 | `BankManager.tsx:56-71` | `file.text()` → `parseWords()`；读失败提示 `bank.readFail` |
| 解析失败 | `BankManager.tsx:44-47` | 0 词 → 提示 `bank.parseFail`，**不落盘** |
| 落盘 | `customBanks.ts:25-36` | `localStorage` key `gt.customBanks.v1`（`customBanks.ts:3`） |
| 导出 | `customBanks.ts:86-92` | `exportBanksAsJson()` → 下载 `geek-typing-wordbanks.json` |

> ⚠️ **`accept=".txt,.json,.csv,.md"` 是「文件选择器过滤」，不是「格式支持」。** 它只是让对话框默认显示这几类，用户仍可切到「所有文件」。**真正的解析只有 `parseWords()` 一种**，`.csv` / `.md` 能否导入完全取决于其内容是否恰好符合 `parseWords` 的行格式。详见 `IMPORT_FORMATS.md`。

### 3.2 ✅ 已有：`parseWords()` 的真实解析规则

`src/lib/customBanks.ts:50-84`。三条分支：

**分支 1 —— JSON**（`:54-68`）：首字符是 `[` 或 `{` 时走 `JSON.parse`：

```ts
const data = JSON.parse(text)
const arr = Array.isArray(data) ? data : data.words ?? []
return arr
  .map((w: unknown) => {
    if (typeof w === 'string') return { word: w.trim(), translation: '' }
    const o = w as Record<string, string>
    return { word: (o.word ?? o.name ?? '').trim(), translation: (o.translation ?? o.meaning ?? '').trim() }
  })
  .filter((w: WordItem) => /^[A-Za-z][A-Za-z'\- ]*$/.test(w.word))
```

字段别名：`word` | `name`；`translation` | `meaning`。解析异常 → `catch { return [] }`（`:65-67`），**静默返回空数组**。

**分支 2 / 3 —— 行文本**（`:70-84`）：

```ts
const m = line.match(/^([A-Za-z][A-Za-z'\- ]*?)\s*(?:=|,|\||:|：|\t| {2,})\s*(.+)$/)
if (m) return { word: m[1].trim(), translation: m[2].trim() }
const parts = line.split(/\s+/)
if (parts.length >= 2 && /^[A-Za-z][A-Za-z'\-]*$/.test(parts[0])) {
  return { word: parts[0], translation: parts.slice(1).join(' ') }
}
return { word: line, translation: '' }
```

分隔符支持：`=`、`,`、`|`、`:`、中文全角 `：`、`\t`、**连续 2 个以上空格**。

### 3.3 ✅ 已有：唯一的「词形约束」

```ts
.filter((w) => /^[A-Za-z][A-Za-z'\- ]*$/.test(w.word))
```

`customBanks.ts:64` 与 `:83` 各出现一次。含义：**词必须以 ASCII 字母开头，只含 ASCII 字母 / 撇号 / 连字符 / 空格**。

**这一条正则造成了真实的能力边界**（全部 `【实测·代码可读】`）：

| 输入 | 结果 | 原因 |
|---|---|---|
| `Transformer` | ✅ 接受 | 大写字母在 `[A-Za-z]` 内 |
| `café` | ❌ 丢弃 | `é` 不在字符类 |
| `北京` | ❌ 丢弃 | 非 ASCII 字母 |
| `don't` | ✅ 接受 | `'` 在白名单 |
| `well-known` | ✅ 接受 | `-` 在白名单 |
| `中文 释义`（作为 word） | ❌ 丢弃 | 首字符非 ASCII 字母 |
| `123abc` | ❌ 丢弃 | 首字符非字母 |

### 3.4 📐 待建：用户导入的校验与治理

**当前没有任何一项**：

| 应校验项 | 现状 | 依据 |
|---|---|---|
| 空文件 | 无显式检查（`parseWords` 返回 `[]` → `BankManager.tsx:44` 提示） | 间接覆盖 |
| 文件体积上限 | **无** | `BankManager.tsx:56-71` 无 size 判断 |
| 条目数上限 | **无** | `saveCustomBank` 不做限制 |
| 编码（UTF-8 / GBK） | **无** —— `file.text()` 恒按 UTF-8 解码 | `BankManager.tsx:58` |
| 乱码检测 | **无** | — |
| 重复词去重 | **无** —— 同词重复照收 | `parseWords` 无 dedup |
| 路径穿越 / 恶意文件名 | **无**（仅用作词库显示名，`BankManager.tsx:63`） | 因不落文件系统，风险低 |
| MIME 校验 | **无** —— 只看内容不看 MIME | `file.text()` |
| 内容合规（版权/敏感） | **无** | — |
| localStorage 配额 | **无** —— `customBanks.ts:22` 的 `persist()` 无 try/catch | 对比：`reviewStore.ts:64-96` 有完整熔断 |

> ⚠️ **配额缺口值得单列**：`customBanks.ts:21-23` 的 `persist()` 是裸的 `localStorage.setItem`，**没有 try/catch**。导入超大词库时 `QuotaExceededError` 会直接抛出，而 `BankManager.tsx:42-54` 的 `doImport` **不包 try/catch** ⇒ 表现为未捕获异常。同一项目里 `reviewStore.ts:64-96` 对此做了三轮熔断清洗（详见 `ERROR_HANDLING.md` §3）—— **两者强度不一致**。

---

## 4. 需求文档「素材导入为核心能力」的对照

| 需求文档要求 | 实测状态 | 对应文件 |
|---|---|---|
| 通用格式导入（CSV/TXT/MD/PDF/DOCX/SRT/VTT/LRC/Anki） | ❌ 均未实现（仅纯文本行 + JSON） | `IMPORT_FORMATS.md` |
| 用户上传链路 | 📐 无服务端、无接收 | 本文 §3.4 |
| 上传安全（恶意文件 / MIME / 体积） | 📐 零实现 | `10-security/*` |
| 导入错误处理 | 🔄 内容脚本有；上传链路无 | `ERROR_HANDLING.md` |
| 去重 | ✅ 内容层分级去重完整；用户层无 | `DEDUPLICATION.md` |
| 导入可复现（checksum） | ✅ 内容层完整；用户层无 | `IMPORT_PIPELINE.md` |

---

## 5. 结论

- **已有的是「内容工程」，缺的是「用户产品」。** 链路 A 的规格相当完整（目录契约、字段白名单、命名规则、20 项门禁、幂等构建、canonical 指纹），可直接作为同类项目的参考实现。
- **链路 B 只有一条窄路径**：粘贴/选择文件 → 2 条正则过滤 → `localStorage`。无体积限制、无编码检测、无去重、无配额保护。
- **两条链路在规格上没有任何共享** —— 用户导入**不会**经过 `normalize.mjs` 的规范化，也不会产生 checksum/版本，更不会进入 `content/`。若要统一，需按 `IMPORT_PIPELINE.md` §4.3 的三步走。
