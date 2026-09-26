# Content Layer —— 内容层契约（V4.1）

本目录是 **Content 层**的唯一数据根目录。它只描述「内容是什么」，
**不随任何用户改变**：导入新词库、新增内容类型，都不得污染用户学习记录。

三层边界（必须守住）：

| 层 | 存放 | 键 | 变更频率 |
|---|---|---|---|
| **Content** | `content/**`（本目录） | ContentId | 随版本发布 |
| **Learning** | `src/core/review/*`（LocalStorage / 未来 IndexedDB） | contentId | 每次练习 |
| **User** | settings / goals / profile | 用户维度 | 用户主动改 |

---

## 1. 目录结构

```
content/
└── vocabulary/<包 id>/
    ├── manifest.json    元数据 + 溯源 + 统计（stats/checksum 由脚本派生，勿手改）
    ├── words.json       正文数据
    └── relations.json   （可选，V4.1-P0 尚不产出）
```

新增内容类型时平级加目录：`content/listening/...`、`content/topic/...`。

## 2. ContentId —— 4 段式

```
content:<type>:<namespace>:<localId>
content:vocabulary:ecdict-ielts:ielts        词汇包
content:word:ecdict-ielts:abandon            包内词条
content:topic:ielts:environment              主题（未来）
content:audio:ielts:listening-test-01        音频（未来）
```

**namespace 必须每包唯一**，规则 = `${来源族}-${包 id}`（如 `ecdict-ielts`、`curated-ai-core`）。

原因是词级 id 的 localId 只有词形、不含包 id：

- 早期版本用来源族 `ecdict` 当 namespace，而 cet4 / toefl / ielts 三包共用它，
  于是 `content:word:ecdict:abandon` 在三个包里同时存在 —— **ContentId 撞车**，
  无法作为学习记录主键（跨包进度互相污染）。该坑由 `tests/content-query.mjs` 实测捕获。
- 「各包 namespace 互不相同」是**词级 ContentId 全局唯一的充要条件**，
  已固化为 `content:validate` 第 9 项门禁。

**跨包同词是合法数据关系**（IELTS / CET / TOEFL 各有 abandon），消歧靠 namespace，
*不是*靠禁止同词。任何「跨包词唯一」的约束都是错的，不要加。

## 3. manifest.json 字段契约

| 字段 | 说明 |
|---|---|
| `id` | 4 段式 ContentId，**由 `content:build` 派生**，勿手改 |
| `type` / `version` / `title` / `description` / `language` / `tags` / `icon` | 展示与筛选元数据 |
| `features` | 能力开关（`phonetic` / `definition` …），业务代码用 `hasFeature()` 查询，禁止 `if (bank === 'xxx')` |
| `stats` | `{items, phonetic, definition}` —— **全部由 words.json 自动派生** |
| `sources[]` | 多来源溯源数组（见下） |
| `offline` | `{supported, policy}`，`policy: inline \| lazy` |

### sources[] —— 结构化溯源

```jsonc
"sources": [{
  "origin": "ECDICT",
  "license": { "spdx": "MIT", "name": "MIT License", "url": "https://opensource.org/licenses/MIT",
               "attributionRequired": false, "commercialUse": true },
  "importedAt": "2026-09-26",
  "checksum": "sha256:<完整 64 位>"   // 不截断，provenance 要可复现
}]
```

门禁：每条 source 必须有**结构化 license 对象**；外部来源（非 curated）**必须有 SPDX**。
未知协议的内容不得入库。

## 4. Import Pipeline —— 导入新词库的固定流程

```
1) 落数据    content/vocabulary/<id>/words.json
             词条最小形状：{ word, translation, phonetic?, definition?, partOfSpeech? }
2) 写骨架    content/vocabulary/<id>/manifest.json
             只需手写展示字段（title/description/language/tags/icon/features/exam）
             id / stats / sources[].checksum 交给脚本
3) 登记      src/core/content/registry.ts 的 packages 数组加一行
             （大库 ≥1000 词用 load: () => import(...?raw) 走 lazy chunk；
               并在 warmUpVocabulary() 里加入预热）
4) 派生      npm run content:build     # 自动回写 id / stats / checksum，幂等
5) 门禁      npm run content:validate  # 9 项检查，红了不许合
6) 验证      npm run test:content      # 查询层契约 42 项
             npm run test:e2e          # 165 项 UI 回归
```

约定：

- **禁止手改** `stats` / `checksum` / `id` —— 漂移时跑 `content:build` 而不是编辑；
- 禁止直接 import 词表数组做 filter —— UI 一律走 `src/core/content/query/content-query.ts`；
- 新包不得复用既有 namespace，否则门禁第 9 项直接 FAIL。

## 5. CLI

| 命令 | 作用 |
|---|---|
| `npm run content:build` | 由 words.json 派生 stats/checksum + V4.1 schema 迁移（幂等） |
| `npm run content:validate` | 9 项门禁；全绿 exit 0，任一 FAIL exit 1 |
| `npm run content:list` | 包清单（`--json` 输出结构化） |
| `npm run test:content` | 查询层 / registry / ContentId 契约测试 |

## 6. 待接入（本轮未做）

- `relations.json` + `getRelations()` 当前恒为空数组 —— 关系模型已就位
  （`src/core/content/relation/relation.ts`），等第一个非 vocabulary 内容类型接入即产出；
- UI 尚未接查询层：Word Detail / 全局搜索 / 筛选 属 V4.1-P1。
