# 导入测试（待建）

> 状态：📐 待建
> 已有断言数：**0**
> 实测结论：**全仓库不存在任何测试 fixture**，因此**所有"坏数据必须被拒绝"的验证都没有发生过**

---

## 1. 现状：一条负例都没有

### 1.1 实测证据

```
$ grep -rli "fixture" --include="*.mjs" --include="*.json" --include="*.ts" .
./content/vocabulary/ielts/words.json
./content/vocabulary/kaoyan/words.json
./content/vocabulary/toefl/words.json

$ grep -o "\"[a-zA-Z]*fixture[a-zA-Z]*\"" content/vocabulary/ielts/words.json | head -3
"fixture"
```

**三个命中全部是英文单词 `"fixture"` 本身**（词条），不是测试夹具。

### 1.2 目录实测

```
tests/
├── _evidence/                 # 图片与 JSON 证据
├── content-query.mjs
├── e2e.mjs
├── offline-audit.mjs
├── preview-server.mjs
└── prod-smoke.mjs
```

**无 `fixtures/`、无 `invalid/`、无 `samples/`、无 `*.test.*`、无 `*.spec.*`。**

### 1.3 这意味着什么

`scripts/content/validate.mjs` 有 **20 项规则**，其中至少 **9 项是"拒绝型"规则**（遇到坏数据必须 `exit 1`）：

- 第 1 项：JSON 非法 ⇒ 拒绝
- 第 2 项：必填字段缺失 ⇒ 拒绝
- 第 3 项：ContentId 不合 4 段式 ⇒ 拒绝
- 第 5 项：`stats.items` 漂移 ⇒ 拒绝
- 第 6 项：checksum 不匹配 ⇒ 拒绝
- 第 7 项：license 缺失 ⇒ 拒绝
- 第 9 项：namespace 撞车 ⇒ 拒绝
- 第 10 项：schemaVersion 不匹配 ⇒ 拒绝
- 第 15 项：canonical checksum 不符 ⇒ 拒绝

**但这 9 条拒绝分支，从来没有一条被测试触发过。** 当前 10 个包全是干净数据，门禁每次都是"全绿通过"。

**换句话说：我们知道"好数据能过"，但不知道"坏数据会不会被拦住"。** 这是一个真实且严重的测试缺口——`DEBT-005`（无单元测试与 fixture）的核心内容。

### 1.4 有一个真实案例证明这条缺口是实的

`scripts/content/validate.mjs` 第 9 项的代码注释记录了一段历史（`DEBT` 链的成因）：

> **cet4 / toefl / ielts 曾共用 namespace `ecdict`** → 导致 **abandon 三包同 id** → 最终**由 `tests/content-query.mjs` 契约测试实测捕获**

**这个 bug 是被"契约测试"抓到的，不是被"门禁"抓到的。** 说明：
- 门禁的第 9 项规则**当时可能还不存在**，或者是它没拦住
- 真实缺陷曾经从门禁下溜过去，靠另一层测试兜住

**这是"负例测试必要性"的最有力论据**——如果当时有一个"两包共用 namespace"的负例 fixture，这个 bug 在门禁层就会被打回。

---

## 2. 待建方案：应测负例清单

以下是 T2 建设时应覆盖的**完整负例清单**。每条给出：样本形态、期望行为、对应门禁项。

### 2.1 词条级负例

| # | 负例 | 样本构造 | 期望行为 | 对应门禁 |
|---|---|---|---|---|
| N-01 | **missing word** | 词条 `{ "id": "...", "translation": "..." }`（无 `word` 字段） 或 `"word": ""` | `exit 1` | 第 2 项（REQUIRED_FIELDS 含 `word`） |
| N-02 | **duplicate word（包内）** | 同一 words.json 内两条 `{"word": "abandon"}`（localId 不同） | `exit 1` | 第 4 项 / 第 12(b) 项 |
| N-03 | **duplicate word（大小写差异）** | 包内同时有 `"Abandon"` 与 `"abandon"` | `exit 1` | 第 12(b) 项「normalized word」 |
| N-04 | **duplicate word（空白差异）** | 包内 `" abandon"` 与 `"abandon"` | `exit 1` | 第 12(b) 项 |
| N-05 | **invalid phonetic** | `"phonetic": "not-a-phonetic-!!!"` | ⚠️ **当前无规则** ⇒ 需新增 | 新增 |
| N-06 | **invalid wordId** | 词条 `id` 不符 4 段式，如 `"abandon"` 或 `content:word:ielts`（3 段） | `exit 1` | 第 3 项 / 第 9 项 |

**注意 N-02 与"跨包同词"的区别**：包内同词非法；**跨包同词合法**（`scripts/content/validate.mjs:8-10` 明确写「任何『跨包词唯一』规则都是错误的」）。负例样本**必须严格区分这两者**，否则会把正确的设计当成 bug。

### 2.2 包级负例

| # | 负例 | 样本构造 | 期望行为 | 对应门禁 |
|---|---|---|---|---|
| N-07 | **missing source** | `"sources": []`（空数组） | `exit 1` | 第 2 项 / 第 7 项 |
| N-08 | **invalid license** | source 缺结构化 `license` 字段 | `exit 1` | 第 7 项 |
| N-09 | **invalid license（外部源）** | 外部来源但 `license` 无 SPDX 标识（如填 `"MIT-ish"`） | `exit 1` | 第 7 项 |
| N-10 | **checksum 漂移** | 手改 words.json 但不更新 manifest 的 `sources[].checksum` | `exit 1` | 第 6 项 |
| N-11 | **canonical checksum 不符** | 改词条语义但不更新 `contentChecksum` | `exit 1` | 第 15 项 |
| N-12 | **canonical 反例（排版变化不应误判）** | 只调整 words.json 的缩进/换行/键序，**不改语义** | ✅ **必须 `exit 0`** | 第 15 项（**反向断言**） |
| N-13 | **stats.items 漂移** | 删一个词条但不改 `stats.items` | `exit 1` | 第 5 项 |
| N-14 | **schemaVersion 不匹配** | `"schemaVersion": 3`（当前是 4） | `exit 1` | 第 10 项 |
| N-15 | **contentVersion 非正整数** | `"contentVersion": 0` 或 `-1` 或 `"1"` | `exit 1` | 第 11 项 |
| N-16 | **JSON 非法** | words.json 少一个 `}` | `exit 1` | 第 1 项 |
| N-17 | **文件缺失** | 包目录下有 manifest.json 但无 words.json | `exit 1` | 第 1 项 |

**N-12 是特别重要的一条反向断言**：它验证 `sha256Canonical()` **不会因为排版变化而误判漂移**。这是第 15 项那条注释（`scripts/content/validate.mjs:25-27`）的直接测试化。没有这条，`canonical` 的正确性只是"代码里说它对"。

### 2.3 唯一性负例

| # | 负例 | 样本构造 | 期望行为 | 对应门禁 |
|---|---|---|---|---|
| N-18 | **duplicate ContentId（跨包）** | 两个包 manifest.id 完全相同 | `exit 1` | 第 8 项 / 第 12(c) 项 |
| N-19 | **namespace 撞车** ⭐ | 两包共用 namespace（如都写 `ecdict`） | `exit 1` | 第 9 项 |
| N-20 | **namespace 与 manifest.id 不同源** | manifest.id 第 3 段是 `ecdict-a`，`namespace` 字段写 `ecdict-b` | `exit 1` | 第 14 项 |
| N-21 | **packageId ≠ 目录名** | 目录 `cet4/`，manifest `packageId: "cet6"` | `exit 1` | 第 13 项 |
| N-22 | **duplicate source** | 同一 origin 在 `sources[]` 出现两次 | `exit 1` | 第 12(d) 项 |

**N-19 是历史 bug 的复现场景**（cet4/toefl/ielts 共用地 `ecdict`）。**这条负例的缺失，正是那个 bug 能溜到契约测试层的原因。**

### 2.4 关系 / 资产负例

| # | 负例 | 样本构造 | 期望行为 | 对应门禁 |
|---|---|---|---|---|
| N-23 | **broken relation** ⚠️ | 新增 `relations.json`，其中一条指向不存在的 ContentId | `exit 1` | 第 12(e) 项 |
| N-24 | **relation 自环** | `A → A` | 需定义（拒绝或允许） | 新增规则 |
| N-25 | **relation 单向** | `A → B` 但无 `B → A` | 需定义 | 新增规则 |
| N-26 | **orphan relation** | relation 指向的词条已从 words.json 删除 | `exit 1` | 第 12(e) 项 |
| N-27 | **invalid audio** ⚠️ | `manifest.assets` 指向不存在的音频文件 | `exit 1` | 第 12(f) 项 |
| N-28 | **invalid audio format** | 音频路径后缀不在白名单（如 `.exe`） | `exit 1` | 新增规则 |
| N-29 | **invalid subtitle** ⚠️ | 字幕文件缺失或格式非法 | `exit 1` | **当前无规则** ⇒ 需新增 |
| N-30 | **orphan learning record** ⚠️ | 学习记录指向已删除词条 | 运行时清理 | 第 12(g) 项（**明确声明不校验**） |

**⚠️ 标记的四条（N-23 / N-27 / N-29 / N-30）对应"门禁里有代码但从未执行"的分支。** 详细信息：

- N-23 / N-27：门禁第 12 项 (e)(f) 的注释是「**仅当 `relations.json` / `manifest.assets` 存在时校验，否则打印跳过**」——当前两者都不存在，所以这两条路径**从未运行**
- N-30：门禁第 12 项 (g) 的注释是「**运行时检查，由 Learning 层负责，脚本不校验**」——即**门禁明确甩给了运行时，但运行时也没有实现**

### 2.5 预算负例

| # | 负例 | 样本构造 | 期望行为 | 对应门禁 |
|---|---|---|---|---|
| N-31 | **单包 manifest 超 8 KiB** | 塞入超长 description/tags | `exit 1` | 第 18 项 |
| N-32 | **全库 manifest 超 40 KiB** | 构造 40+ 包或超长字段 | `exit 1` | 第 18 项 |
| N-33 | **inline 词数超 1000** | inline 包放 1001 词 | `exit 1` | 第 19 项 |
| N-34 | **inline 字节超 64 KiB** | inline 包 words.json 65 KiB | `exit 1` | 第 19 项 |
| N-35 | **策略声明不符** ⭐ | manifest 写 `policy: "lazy"`，registry.ts 用静态 `words:` 导入 | `exit 1` | 第 20 项 |
| N-36 | **策略反向不符** | manifest 写 `policy: "inline"`，registry.ts 用动态 `load:` | `exit 1` | 第 20 项 |
| N-37 | **未知策略** | `policy: "runtime"` | **跳过（提示）**，不判通过也不判失败 | 第 20 项（`KNOWN_POLICIES` 不含） |

**N-35 / N-36 是对第 20 项（正则扫文本）的关键验证。** 因为这一项的实现方式最脆弱——它靠正则匹配 `registry.ts` 的对象块。负例可以发现：
- 正则是否真的能识别 `words:` 与 `load:`
- 排版变化（换行、引号风格）会不会导致失配
- 多个同名块时 `{ mode: 'ambiguous' }` 分支是否正确触发

**N-37 验证"未知策略只提示不判失败"的语义**（`scripts/content/validate.mjs:60`：`KNOWN_POLICIES = new Set(['inline','lazy'])`）。这条断言的意义是保证门禁**不主动拦下未来的新策略**，避免误伤。

---

## 3. fixture 目录设计建议

若要落地，建议结构：

```
tests/fixtures/
├── valid/                          # 正例（应 exit 0）
│   └── minimal-package/            # 最小可过包
│       ├── manifest.json
│       └── words.json
├── invalid/
│   ├── N-01-missing-word/
│   ├── N-02-duplicate-word/
│   ├── ...
│   └── N-37-unknown-policy/
└── canonical/
    ├── semantic-change/            # 语义变 ⇒ checksum 应变
    └── format-only-change/         # 仅排版变 ⇒ checksum 不应变（N-12）
```

**注意**：fixture 不应放在 `content/` 下（会被真实门禁扫到）。放在 `tests/fixtures/` 并用**独立的临时 content root** 跑门禁。

但这里有一个实现难点需要如实指出：`scripts/content/validate.mjs` 的 `VOCAB_DIR` 是硬编码的：

```js
const VOCAB_DIR = path.join(ROOT, 'content', 'vocabulary')
```

**要让门禁支持 fixture，需要改造 `VOCAB_DIR` 为可注入参数**（如环境变量 `CONTENT_ROOT`）。这是一处必要的重构，不是纯加测试。

同理，`REGISTRY_TS` 也是硬编码：

```js
const REGISTRY_TS = path.join(ROOT, 'src', 'core', 'content', 'registry.ts')
```

第 20 项的负例（N-35~N-37）需要能替换 registry 文本，也需要参数化。

---

## 4. 优先级建议

| 优先级 | 负例 | 理由 |
|---|---|---|
| 🔴 P0 | N-19（namespace 撞车） | **历史真实 bug 的复现场景**，且已有"被抓到过"的证据 |
| 🔴 P0 | N-18（跨包 dup ContentId） | 兜底同源问题 |
| 🔴 P0 | N-10 / N-11（checksum 漂移） | 内容完整性基础 |
| 🔴 P0 | N-12（canonical 反向断言） | 唯一一条"不应误判"的断言，成本低价值高 |
| 🟠 P1 | N-01 / N-02 / N-07 / N-08 | 最常见的坏数据形态 |
| 🟠 P1 | N-13 / N-14 / N-16 / N-17 | 结构漂移与文件缺失 |
| 🟠 P1 | N-35 / N-36（策略不符） | 第 20 项实现最脆弱，最需要验证 |
| 🟡 P2 | N-31~N-34（预算） | 有实测余量数据背书，风险较低 |
| 🟡 P2 | N-20 / N-21 / N-22 | 与 N-18/N-19 同族，可后续补 |
| ⚪ P3 | N-23~N-30（relation/asset/subtitle） | **依赖功能先落地**——无 relations.json、无 assets、无字幕，测不了 |

**N-05（invalid phonetic）与 N-29（invalid subtitle）需要先新增门禁规则，再写负例。** 它们当前是"无规则"，不是"规则未测"。

---

## 5. 与其他文档的关系

- 20 项门禁的完整说明：`09-testing/CONTENT_TEST.md`
- 149 契约断言的分布：`09-testing/CONTENT_TEST.md`
- 无单元测试的记账：`DEBT-005`（`13-acceptance/KNOWN_ISSUES.md`）
- 音频/视频负例详解：`09-testing/MEDIA_TEST.md`
- 安全类负例（XSS / 路径穿越）：`09-testing/SECURITY_TEST.md`

---

## 6. 一句话总结给审计方

**内容层的正向验证做得很好（149 + 20），但完全没有任何负向验证。所有"拒绝型"规则都只存在于代码里，从未被数据触发过。并且历史上已经发生过一次（namespace 撞车）靠另一层测试才兜住的案例。**
