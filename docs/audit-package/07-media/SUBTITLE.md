# 字幕（SUBTITLE）

> 状态：📐 待建
>
> 📐 **待建**：字幕能力 —— **零实现，零文件，零解析器**
> ✅ **已有**（相关但独立）：`AssetKind` 中的 `'subtitle'` 取值、`PLANNED_TYPES` 的 `listening` / `reading` 槽位
>
> 基线 commit：`4152eb2`　｜　实测日期：2026-09-27
> 证据来源：全仓实测、`src/core/content/model/asset.ts`、`scripts/content/validate.mjs:342-351`

---

## 1. 一句话事实

**字幕能力零实现，但类型槽位已预留。**

```bash
$ find . -path ./node_modules -prune -o -type f \( -name "*.srt" -o -name "*.vtt" -o -name "*.lrc" -o -name "*.ass" -o -name "*.ssa" \) -print
（无输出）

$ grep -rn "srt\|vtt\|lrc\|parseSubtitle\|subtitleUrl" src/ --include="*.ts" --include="*.tsx"
（无命中）
```

**零字幕文件、零解析器、零渲染代码。**

**唯一已有的痕迹**是 `AssetKind` 枚举里的一个字符串（`content/README.md:241`）：

```ts
AssetKind = 'audio' | 'image' | 'document' | 'subtitle' | 'other'
```

即：**「字幕」被承认为一种资产类型，但没有任何一条字幕资产存在。**

---

## 2. 📐 零实现清单（逐项实测）

| 能力 | 现状 | 实测依据 |
|---|---|---|
| SRT 解析 | ❌ 无 | `grep` 无命中 |
| VTT 解析 | ❌ 无 | 同上 |
| LRC 解析 | ❌ 无 | 同上 |
| JSON 字幕模型 | ❌ 无 | 同上 |
| 字幕文件 | ❌ 0 个 | `find` 无输出 |
| 字幕渲染组件 | ❌ 无 | `src/components/` 无相关文件 |
| 字幕 ↔ 音频对齐 | ❌ 无 | 无音频资源（见 `AUDIO.md`） |
| 字幕 ↔ 视频对齐 | ❌ 无 | 无视频资源（见 `VIDEO.md`） |
| 字幕 AssetRef | ❌ 无 | 10 个包 `manifest.assets` 全部不存在 |
| 字幕与词条关联 | ❌ 无 | `relations.json` 全部不存在（见 `LEARNING_GRAPH.md`） |

---

## 3. ✅ 已有：唯一的预留 —— `AssetKind` 的 `'subtitle'`

### 3.1 定义位置

`content/README.md:237-244`（资产契约）：

```
AssetRef { assetId, kind, url, mime?, bytes?, checksum?, license? }
assetId 形态：asset:<kind>:<namespace>:<localId>（不用 content: 前缀）
AssetKind = 'audio' | 'image' | 'document' | 'subtitle' | 'other'
由 makeAssetId(kind, namespace, localId) 生成
```

**`assetId` 形态示例（建议）**：

```
asset:subtitle:curated-nce:lesson-01-en
asset:subtitle:curated-nce:lesson-01-zh
```

### 3.2 门禁对字幕的处理（恒跳过）

`validate.mjs:342-351`（第 12(f) 项 broken asset）：

```js
//   (f) broken asset —— 只有 manifest 存在 assets 字段才校验
if (manifest.assets === undefined) {
  console.log('  · manifest 无 assets 字段，跳过 asset 校验')
} else if (!Array.isArray(manifest.assets)) {
  fail('manifest.assets 必须为数组')
} else {
  const broken = manifest.assets.filter((a) => !a?.url || !/^(https?:\/\/|\/)/.test(a.url))
  if (broken.length === 0) ok(`assets ${manifest.assets.length} 项 url 合法`)
  else fail(`broken asset ${broken.length} 项：${broken.slice(0, 3).map((a) => a?.url).join(', ')}`)
}
```

**实测**：10 个包全部无 `manifest.assets` ⇒ 恒打印「跳过 asset 校验」。

> ⚠️ **门禁对字幕的校验即使启用也只有一条「url 合法」**（`/^(https?:\/\/|\/)/`）—— **不校验时间戳单调性、不校验格式合法、不校验与媒体的时长匹配**。若未来接入字幕，建议扩展这一项。

---

## 4. 📐 建议：统一字幕模型

> 以下全部为**建议**，非实测事实。当前零实现。

### 4.1 建议的统一 Segment 模型

不同字幕格式（SRT / VTT / LRC）的时间戳语法与结构差异很大，**建议**先归一到一个中间模型再入库：

```ts
/** 建议：统一的字幕分段（当前不存在） */
interface SubtitleSegment {
  /** 分段标识：同一文件内稳定且唯一，用于关系引用（word → segment） */
  segmentId: string
  /** 起始时间（秒，浮点） */
  start: number
  /** 结束时间（秒，浮点） */
  end: number
  /** 原文文本 */
  text: string
  /** 译文（可选，用于双语字幕） */
  translation?: string
  /** 说话人（可选，用于对话类材料） */
  speaker?: string
}
```

**字段设计说明**：

| 字段 | 必要性 | 理由 |
|---|---|---|
| `segmentId` | 🔴 必须 | 未来 `word → segment` 关系（「这个词出现在第几句」）需要稳定引用；**不可用数组下标**（重排即失效） |
| `start` / `end` | 🔴 必须 | 同步播放；**用秒（浮点）**而非字符串时间戳，便于计算与排序 |
| `text` | 🔴 必须 | 原文 |
| `translation` | 🟠 建议 | 需求文档强调中文用户 ⇒ 双语字幕是刚需 |
| `speaker` | 🟡 可选 | 对话类材料（如影视）需要区分说话人 |

**建议的 `segmentId` 生成规则**（📐）：`${assetLocalId}-${index}`（如 `lesson-01-en-0`）或基于内容的哈希（如 `lesson-01-en-a1b2c3`）。

- 前者简单但**重排即失效**；
- 后者稳定但生成成本高。
- **建议**：用「文件 + 序号」，并在导入时**冻结顺序**（与 `content/README.md:194` 的「数组绝不重排」原则一致 —— 字幕分段顺序同样是数据语义）。

### 4.2 建议支持的格式（含解析难度）

考虑「浏览器原生支持」这一关键因素，**建议的优先级与 VIDEO.md §4.3 保持一致**：

| 优先级 | 格式 | 时间戳形态 | 解析难度 | 建议理由 |
|---|---|---|---|---|
| **P1** | **VTT** | `00:00:01.000 --> 00:00:04.000` | 🟢 低 | **浏览器 `<track>` 原生支持** —— 可直接用于 `<video>`，无需自研渲染；也是字幕格式的 Web 标准 |
| P1 | SRT | `00:00:01,000 --> 00:00:04,000` | 🟢 低 | 最常见的字幕格式；与 VTT 近乎同构（仅逗号/点差异 + 无 `WEBVTT` 头） |
| P2 | LRC | `[mm:ss.xx]text` | 🟢 低 | 音乐歌词格式；**适合音频**（单词发音 / 例句音频的场景） |
| P2 | JSON | 自定义 | 🟢 低 | 自有格式，直接映射 §4.1 模型 |
| P3 | ASS / SSA | `Dialogue: 0,0:00:01.00,...` | 🟠 中 | 带样式；**建议不支持**（样式在 Web 上会与主题冲突） |

**关键建议**：**VTT 优先，SRT 次之，且两者共用一个解析基座**（差异仅 3 处：`WEBVTT` 头、时间戳毫秒分隔符 `.` vs `,`、样式标签）。建议实现为「一个 SRT/VTT 共用解析器 + 一个 LRC 解析器」。

### 4.3 建议的 SRT ↔ VTT 转换

**这是一个近乎零成本的互转**（📐 建议实现为导入时自动转换）：

```
SRT → VTT 的 3 处改动：
  1. 开头加 "WEBVTT\n\n"
  2. 时间戳的 "," → "."（00:00:01,000 → 00:00:01.000）
  3. 移除序号行（VTT 允许但不需要）
```

**建议**：**内部统一存 VTT** —— 因为它是浏览器原生格式，且 SRT 可在导入时无损转为 VTT。这样播放器只需处理一种格式。

### 4.4 建议的 LRC 用途区分

LRC 与 SRT/VTT 的语义不同：

| 格式 | 时间轴类型 | 适合场景 |
|---|---|---|
| SRT / VTT | **区间**（start → end） | 视频、对话、讲解 |
| LRC | **时刻**（仅 start） | 音乐、朗读、逐句跟读 |

**建议**：LRC 不转换到 VTT（会丢失精度语义），而是独立支持，并**在模型层用 `end` 可选来兼容**：

```ts
interface SubtitleSegment {
  start: number
  end?: number      // ← LRC 无 end 时省略
  ...
}
```

播放时对无 `end` 的分段，**建议用「下一段的 start」作为本段结束** —— 这是播放器的常见做法。

### 4.5 建议的存储与关联

| 项 | 建议 |
|---|---|
| 目录 | `content/assets/subtitle/<namespace>/<id>.vtt`（需先建 `content/assets/`，当前不存在） |
| 声明 | `manifest.assets[]` 中的 `AssetRef`（`kind: 'subtitle'`） |
| 关联媒体 | manifest 的 `subtitles: string[]`（AssetRef id 数组），或经 `relations.json` 的 `appears_in` |
| 关联词条 | `relations.json`：`content:word:<ns>:abandon --appears_in--> asset:subtitle:<ns>:lesson-01-en` |

> ⚠️ **注意 `appears_in` 的目标类型约束**：`relation.ts:59` 定义 `appears_in: ['audio', 'document', 'listening', 'reading']` —— **不含 `subtitle`**。
> 若要让「词出现于某字幕」，需扩展 `RELATION_TARGET_TYPES`，或把字幕视为 `document`。
> **建议**：把「词 → 字幕」建模为「词 → 字幕的某分段」，并在 `appears_in` 的目标类型中加 `subtitle`（走契约变更流程）。

### 4.6 ⚠️ 建议避免的陷阱

| 陷阱 | 说明 | 依据 |
|---|---|---|
| 用数组下标当 segmentId | 重排即失效，关系数据全部错位 | 同 `content/README.md:194` 的「数组绝不重排」原则 |
| 自研字幕渲染 | 浏览器 `<track>` 已支持 VTT；自研只在需要「点击跳转/生词高亮」时才必要 | `VIDEO.md` §4.3 |
| 存 SRT 而不用 VTT | 播放器需处理两种格式；SRT→VTT 转换零成本 | §4.3 |
| 只存 `start` 不存 `end` | 无法表达区间，视频字幕需要 | §4.1 |
| 不支持 `translation` | 中文用户需双语字幕 | §4.1 |
| 把字幕当 `document` 处理 | 语义混淆，`appears_in` 约束会失效 | §4.5 |

---

## 5. 与需求文档的对照

| 需求 | 实测状态 |
|---|---|
| 字幕系统 | 📐 零实现 |
| 字幕同步 | 📐 零实现（无媒体资源可同步） |
| 双语字幕 | 📐 零实现（模型未定义 `translation`） |
| 字幕格式支持（SRT/VTT/LRC） | 📐 零实现 |
| 字幕 ↔ 词条关联 | 📐 零实现（无 `relations.json`） |
| 字幕版权 | 📐 零治理 |

---

## 6. 结论

- **字幕能力完成度 = 0%**：零文件、零解析器、零渲染、零模型。唯一痕迹是 `AssetKind` 枚举中的 `'subtitle'` 字符串。
- **门禁对字幕的现有校验极弱**：第 12(f) 项即使启用也只查 `url` 是否以 `http(s)://` 或 `/` 开头 —— 不查时间戳单调性、不查格式、不查与媒体时长匹配。**建议在接入字幕时扩展该项。**
- **建议的技术选型要点**（📐，全部为建议）：
  1. **内部统一存 VTT**（浏览器原生 `<track>` 支持，SRT 可零成本互转）；
  2. **统一 Segment 模型**：`segmentId / start / end / text / translation? / speaker?`；
  3. **`segmentId` 用「文件 + 冻结序号」**，不用可变下标；
  4. **`end` 可选**以兼容 LRC；
  5. **ASS/SSA 建议不支持**（样式会与主题冲突）。
- **一处约束冲突需处理**：`appears_in` 的目标类型不含 `subtitle`（`relation.ts:59`），若要建立「词 → 字幕分段」关系需扩展契约。
