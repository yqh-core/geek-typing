# Content Layer —— 内容层契约（V4.1-P0.5）

本目录是 **Content 层**的唯一数据根目录。它只描述「内容是什么」，
**不随任何用户改变**：导入新词库、新增内容类型，都不得污染用户学习记录。

---

## 0. Architecture Principles（先读这 10 条，代码会过时，这些不会）

1. Content is immutable from the user's perspective.（内容不随用户改变）
2. Learning never owns content.（学习状态永不倒灌进 content/）
3. User data never enters `content/`.
4. ContentId is globally unique **and stable**.（唯一 + 稳定，两个要求）
5. Package is a **delivery** boundary, not a learning boundary.
6. Asset is separate from Content.（Content ≠ File）
7. Query Layer is the only UI access path.（UI 禁止直接持有词表做 filter）
8. Content version must not silently change learning history.（版本变化必须可解释）
9. Every imported content must be reproducible.（完整 checksum + 来源溯源）
10. Every Content schema change must be migration-safe.（schemaVersion 与 contentVersion 分离）

---

## 1. 三层边界

| 层 | 存放 | 键 | 变更频率 |
|---|---|---|---|
| **Content** | `content/**`（本目录） | ContentId（+ contentVersion） | 随版本发布 |
| **Learning** | `src/core/learning/model/`（LocalStorage / 未来 IndexedDB） | contentId + contentVersion | 每次练习 |
| **User** | settings / goals / profile | 用户维度 | 用户主动改 |

## 2. 目录结构

```
content/                     内容（是什么）
└── vocabulary/<包 id>/{manifest.json, words.json, relations.json?}
assets/                      资产（文件在哪）—— Content ≠ File
└── audio|image|document|subtitle/...
```

新增内容类型时平级加目录：`content/audio/`、`content/reading/`、`content/topic/`。

## 3. ContentId —— 4 段式

```
content:<type>:<namespace>:<localId>
content:vocabulary:ecdict-ielts:ielts        词汇包（Package Content Entity）
content:word:ecdict-ielts:abandon            包内词条（Word Content Entity）
content:topic:ielts:environment              主题（未来）
content:audio:ielts:listening-test-01        音频（未来）
```

**① namespace 必须每包唯一**，规则 = `${来源族}-${包 id}`（`ecdict-ielts`、`curated-ai-core`）。
词级 localId 只有词形、不含包 id，所以「各包 namespace 互不相同」是**词级 ContentId 全局唯一的充要条件**。
（踩坑史：早期用来源族 `ecdict` 当 namespace，cet4/toefl/ielts 共用 → `content:word:ecdict:abandon` 三包撞车，
学习记录主键污染。由 `tests/content-query.mjs` 实测捕获，现为 validate 第 9 项门禁。）

**② localId 稳定性契约**：由 `normalizeLocalId()` 生成（NFC → trim → 空白折叠 → 去控制字符 → `:` `/` 换 `-`；
lowercase 由 vocabulary 侧决定，code 词库大小写敏感）。
- localId **一旦发布，不因展示文本变化而修改**；
- 同词多义用后缀区分：`run` / `run-2`，或 `run-v1` / `run-n1`（规范先写死，实现待需）。

**③ 跨包同词是合法数据关系**（IELTS/CET/TOEFL 各有 abandon），消歧靠 namespace，
*不是*靠禁止同词。任何「跨包词唯一」的约束都是错的。

**④ ContentId 与 PackageId 是两个实体**：

| | Package | Word |
|---|---|---|
| 身份 | `{packageId: ielts, namespace: ecdict-ielts, type: vocabulary}` | `{namespace: ecdict-ielts, localId: abandon}` |
| ContentId | `content:vocabulary:ecdict-ielts:ielts` | `content:word:ecdict-ielts:abandon` |

不要因为 namespace 长得像就把两个概念绑在一起 —— Topic/Audio/Reading 接入后会越来越容易混。

## 4. Content Version —— 两个维度，不要合并

| 字段 | 含义 | 谁维护 |
|---|---|---|
| `schemaVersion` | **结构**版本（当前 4）。schema 破坏性变更才递增 | `content:build` 写入常量 |
| `contentVersion` | **内容**版本。words.json 的 checksum 变化就 +1 | `content:build` 自动派生 |

**绝不把版本塞进 ContentId**（否则每次修订都换主键，学习记录全部失联）。学习记录记的是：

```jsonc
{ "contentId": "content:word:ecdict-ielts:abandon", "contentVersion": 2, "state": {} }
```

职责划分：ContentId = 是哪个实体；contentVersion = 学的是该实体的哪个版本；Learning = 学到什么程度。

## 5. 内容类型：统一「身份与元数据」，不统一业务字段

真正必须统一的是 **Identity / Metadata / Source / License / Version / Relation / Query**，
不是 payload。各类型有自己的字段：

| 类型 | 特有字段 |
|---|---|
| Vocabulary | word / phonetic / definition / examples / partOfSpeech |
| Audio | audioUrl / duration / transcript / segments / speaker / difficulty |
| Reading | title / body / paragraphs / questions / answers |
| Topic | title / description / children |
| Exercise | prompts / options / answer / explanation |

不要为了「统一」让所有类型共享同一套 payload。

## 6. Asset —— Content ≠ File

`AssetRef { assetId, kind, url, mime?, bytes?, checksum?, license? }`，`assetId` 形态
`asset:<kind>:<namespace>:<localId>`（**不用 `content:` 前缀**，避免被 `parseContentId` 误解析）。

Content 回答「这个东西是什么」，Asset 回答「文件在哪」。
将来 本地 → Cloudflare R2 → CDN → GitHub Releases 切换时，Content 模型一行都不用改。

## 7. Registry / Catalog / Query —— 三个职责，不要混

```
Content Registry  → 从哪加载（registry.ts）
Content Catalog   → 有什么（catalog/catalog.ts，同步只读 manifest）
Content Index     → 检索加速（index/content-index.ts，倒排表懒构建）
Content Query     → 怎么找（query/content-query.ts，UI 唯一入口）
```

统一 Query API（**禁止**再出现 `searchTopics()` / `searchAudios()` 这类散装 API）：

```ts
contentQuery.search({ type: 'word' | 'all', query, packageId, tags, page, pageSize, exact, hasPhonetic })
contentQuery.list(opts) / contentQuery.get(contentId) / contentQuery.count(opts)
```

新类型接入时在 `SUPPORTED_TYPES` 里扩展，未接入类型返回空结果（诚实返回 0，不编造）。

## 8. Relation 分两类，永不合并进同一张图

- **Content Relation**（`relation/relation.ts`）：word→topic、audio→transcript、reading→vocabulary …
- **Learning Relation**：user→content、user→collection、user→goal …

学习关系属于 Learning 层，**不落 `content/` 数据**。

## 9. Import Pipeline

```
Raw → Normalize → Validate → Build → Index → Manifest → Content Registry → Query
```

- **Normalize**（`content:normalize`）：NFC / HTML 剥离 / 实体解码 / 空白折叠 / 去控制字符 / trim。
  ⚠️ 代码词库须在 manifest 声明 `"normalize": { "stripHtml": false }`，
  否则 `type Handler<T>`、`<div />` 会被当标签删掉，词表被破坏（ts-code 实测 5 条命中）。
  只检测不代改：重复词 / 空字段 / 非法字段由人工决策。
- **Validate**（`content:validate`）：12 项门禁，红了不许合。
- **Build**（`content:build`）：派生 stats / checksum / schemaVersion / contentVersion，幂等。

## 10. manifest.json 字段契约

| 字段 | 说明 |
|---|---|
| `id` / `type` / `version` | 4 段式 ContentId、类型、semver |
| `title(En)` / `description(En)` / `language` / `exam` / `tags` / `icon` | 展示与筛选 |
| `features` | 能力开关（`phonetic`/`definition`…），业务用 `hasFeature()` 查询，禁止 `if (bank === 'xxx')` |
| `stats` | `{items, phonetic, definition}` —— **全部自动派生** |
| `sources[]` | 多来源溯源（结构化 license；外部来源必须有 SPDX） |
| `offline` | `{supported, policy}`，policy: inline / lazy / runtime / on-demand |
| `schemaVersion` / `contentVersion` | 见第 4 节，**自动派生** |
| `normalize?` | 规范化开关（代码词库 `stripHtml: false`） |

**禁止手改**：`id` / `stats` / `sources[].checksum` / `schemaVersion` / `contentVersion` —— 漂移时跑 `content:build`。

## 11. 导入新内容包的固定流程

```
1) 落数据     content/vocabulary/<id>/words.json（最小形状 word + translation）
2) 写骨架     manifest.json 只写展示字段
3) 规范化     npm run content:normalize -- <id> --write
4) 派生       npm run content:build      # id / stats / checksum / 版本
5) 门禁       npm run content:validate   # 12 项
6) 登记       src/core/content/registry.ts 的 packages 数组
              （大库 ≥1000 词用 load: () => import(...?raw) 走 lazy chunk + 加入 warmUpVocabulary）
7) 验证       npm run test:content（契约）/ npm run test:e2e（UI 回归）
```

新包不得复用既有 namespace（门禁第 9 项直接 FAIL）。

## 12. 门禁清单（content:validate，12 项）

1 必填字段 · 2 ContentId 规范 · 3 无包内重复词条 · 4 stats 一致 · 5 checksum（完整 SHA-256）
· 6 结构化 license（外部来源须 SPDX）· 7 包 id 唯一 · 8 **namespace 每包唯一**
· 9 schemaVersion === 4 · 10 contentVersion 正整数
· 11 **Duplicate Detection**（见下）· 12 关系/资产校验（**有数据才判**，无数据打印「跳过」，不伪造通过）

Duplicate Detection 分级：
(a) 包内 duplicate localId · (b) 包内 duplicate **normalized** word（大小写/空格差异会撞车）
(c) 跨包 duplicate ContentId（全库兜底扫描）· (d) duplicate source origin
(e) invalid / orphan relation（relations.json 存在时）· (f) broken asset（manifest.assets 存在时）
(g) orphan learning record —— **运行时检查，由 Learning 层负责，不进 CI**

## 13. CLI

| 命令 | 作用 |
|---|---|
| `npm run content:normalize` | Raw→Normalize（默认干跑，`--write` 落盘，`[包id...]` 限定） |
| `npm run content:build` | 派生 stats / checksum / schemaVersion / contentVersion（幂等） |
| `npm run content:validate` | 12 项门禁；全绿 exit 0，任一 FAIL exit 1 |
| `npm run content:list` | 包清单（`--json` 结构化） |
| `npm run test:content` | 查询层 / Catalog / Index / ContentId 契约测试 |

## 14. 待接入（本轮未做）

- `relations.json` 与 `assets/` 尚无数据 → 门禁相应项打印「跳过」；
- UI 未接 Query Layer 与 Catalog：Word Detail / 全局搜索 / 首页内容分布 属 V4.1-P1；
- Learning 层只落了 `LearningItem` 模型，现有 `src/core/review/*` 仍是 `bankId+word` 键，迁移属 V4.1-P2；
- `getWord` 仍走包内线性查找（未走倒排），万级内容前换成 `byWord`。
