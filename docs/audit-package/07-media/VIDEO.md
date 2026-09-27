# 视频（VIDEO）

> 状态：📐 待建
>
> 📐 **待建**：视频能力 —— **零实现，零文件**
> ✅ **已有**（相关但独立）：`PLANNED_TYPES` 中的类型槽位、`AssetKind` 中的 `video` 语义（实为 `other`）、`document` 类型槽位
>
> 基线 commit：`4152eb2`　｜　实测日期：2026-09-27
> 证据来源：全仓实测（`find` / `grep`）、`src/core/content/catalog/catalog.ts:52-64`、`src/core/content/model/asset.ts`

---

## 1. 一句话事实

**视频是本项目完全空白的能力域。** 需求文档将「视频学习」列为差异化方向（`GAP_ANALYSIS.md:216` 记为「七、视频学习差异化 → 零实现」），但：

```bash
$ find . -path ./node_modules -prune -o -type f \( -name "*.mp4" -o -name "*.webm" -o -name "*.mkv" -o -name "*.mov" \) -print
（无输出）

$ grep -rn "<video\|videoUrl\|HTMLVideoElement\|\.play()" src/
（无命中）
```

**零视频文件、零视频代码。**

---

## 2. 📐 零实现清单（逐项实测）

| 能力 | 现状 | 实测依据 |
|---|---|---|
| 视频文件 | ❌ 0 个 | `find` 无 mp4/webm/mkv/mov |
| `<video>` 元素 | ❌ 0 处 | `grep "<video"` 无命中 |
| 视频播放器组件 | ❌ 无 | `src/components/` 14 个文件中无播放器（实测列表见下） |
| `HTMLVideoElement` 用法 | ❌ 0 处 | `grep` 无命中 |
| 视频内容类型 | ❌ `PLANNED_TYPES` **不含 `video`** | `catalog.ts:52-64` |
| 视频字段（`videoUrl` / `duration`） | ❌ 全仓无此字段 | `grep` 无命中 |
| 视频 AssetRef | ❌ 无 | `AssetKind` 无 `video`（见 §3.1） |
| 视频字幕 | ❌ 无 | 见 `SUBTITLE.md` |
| 视频转写 | ❌ 无 | 见 `TRANSCRIPT.md` |
| 视频版权治理 | ❌ 无 | 见 `11-legal/*` |

**实测 `src/components/` 全部文件**（14 个，无任何媒体组件）：

```
BankManager.tsx    CommandPalette.tsx   Dropdown.tsx      Header.tsx
HomePanel.tsx      KeyMap.tsx           Memorize.tsx      PracticePanel.tsx
ProgressPanel.tsx  ResultOverlay.tsx    ReviewPanel.tsx   StatsBar.tsx
StatsPanel.tsx     StreakBar.tsx
```

---

## 3. 已有的「间接预留」

### 3.1 `AssetKind` —— 无 `video` 取值

`src/core/content/model/asset.ts` 与 `content/README.md:241` 定义：

```ts
AssetKind = 'audio' | 'image' | 'document' | 'subtitle' | 'other'
```

> ⚠️ **没有 `video`。** 视频若要接入，只能归入 `other`（语义不明确），**需要扩展枚举**。

**这是一个具体的、可执行的缺口**：扩展 `AssetKind` 加 `'video'` 是一个低成本变更，但会触及 `content/` 层的类型契约 —— 按 `content/README.md:643-648` 的流程，**需先改 `CONTENT_CONTRACT.md`，再改门禁，最后回归**。

### 3.2 `PLANNED_TYPES` —— 无 `video`

`catalog.ts:52-64`：

```ts
const PLANNED_TYPES = [
  'vocabulary',    // ✅ 有数据
  'listening',     // 📐 空
  'reading',       // 📐 空
  'audio',         // 📐 空
  'topic',         // 📐 空
  'exercise',      // 📐 空
  'writing',       // 📐 空
  'speaking',      // 📐 空
  'grammar',       // 📐 空
  'document',      // 📐 空
  'collection',    // 📐 空
]
```

> ⚠️ **需求文档要「视频学习差异化」，但类型槽位里没有 `video`。**
> 可能的归入方式：① 归 `document`（语义勉强）；② 归 `collection`（若是视频集合）；③ **扩展 `ContentType` 加 `video`**。
> 这是一个**需求与类型体系的范围错配**，与 `06-learning/LEARNING_GRAPH.md` §5 记录的 lesson/book 问题同源。

### 3.3 `ContentType` 全集（对照）

`src/core/content/model/content.ts:34-46`（引用于 `04-content/CONTENT_TYPES.md`）：

```ts
export type ContentType =
  | 'vocabulary' | 'word' | 'topic' | 'listening' | 'audio'
  | 'reading' | 'writing' | 'speaking' | 'grammar'
  | 'document' | 'collection' | 'exercise'
```

**12 个取值，无 `video`。**

---

## 4. 📐 建议：视频能力设计

> 以下全部为**建议**，非实测事实。当前零实现。

### 4.1 建议的类型扩展

若确定要做视频学习，**建议**按以下顺序扩展（每步都需走契约变更流程）：

| 步骤 | 变更 | 影响面 |
|---|---|---|
| V1 | `AssetKind` 加 `'video'` | `asset.ts`、`content/README.md`、契约 |
| V2 | `ContentType` 加 `'video'`；`PLANNED_TYPES` 加 `'video'` | `content.ts`、`catalog.ts`、`04-content/CONTENT_TYPES.md` |
| V3 | `RELATION_TARGET_TYPES.appears_in` 加 `'video'` | `relation.ts:59`（当前为 `['audio', 'document', 'listening', 'reading']`） |
| V4 | manifest 新增 `video` 特有字段段 | `schema.ts`、`build.mjs`（如需派生 stats） |

**建议先做 V1**（成本最低、无 UI 影响），因为它不需要新内容类型即可被 AssetRef 承载。

### 4.2 建议的内容形状

```jsonc
// content/video/<namespace>-<id>/manifest.json（建议，当前不存在）
{
  "id": "content:video:curated-nce:nnce-lesson-01",
  "type": "video",
  "title": "NCE Book 1 Lesson 1",
  "language": "en",
  "duration": 312.5,
  "videoUrl": "/assets/video/...",       // 或经 AssetRef 间接引用
  "posterUrl": "/assets/image/...",
  "subtitles": ["asset:subtitle:...:en", "asset:subtitle:...:zh"],  // 见 SUBTITLE.md
  "transcript": "asset:document:...:transcript",                    // 见 TRANSCRIPT.md
  "offline": { "supported": true, "policy": "lazy" }
}
```

**关键建议**：`offline.policy` **必须为 `lazy` 或 `runtime`**，绝不能 `inline` —— 视频体积远超 64 KiB 的 inline 上限（门禁第 19 项），且会 1:1 进主 chunk（`content/README.md:557-577` 的对照实验）。

### 4.3 建议的播放器能力清单

| 能力 | 优先级 | 说明 |
|---|---|---|
| 基本播放 / 暂停 / 进度 | 🔴 必须 | `<video>` 原生控件起步 |
| 字幕同步（VTT） | 🔴 必须 | 浏览器原生支持 `<track>`，成本低 —— **建议用 VTT 而非 SRT**（见 SUBTITLE.md） |
| 倍速 | 🟠 建议 | 学习场景必需（0.75x / 1.0x / 1.25x） |
| A-B 循环 | 🟠 建议 | 精听练习核心功能 |
| 逐句跳转 | 🟠 建议 | 依赖字幕分段 |
| 点击字幕跳转 | 🟠 建议 | 依赖字幕与时间戳 |
| 生词高亮（与词库比对） | 🟡 可选 | 依赖 `contentQuery` 接入 |
| 听写模式（遮字幕） | 🟡 可选 | 依赖字幕 |

**注意**：字幕同步（第 2 项）**不需要自研** —— 浏览器对 `<video>` + `<track kind="subtitles" src="*.vtt">` 有原生支持。**建议直接使用原生 `<track>`，不要自研字幕渲染**，除非需要「点击字幕跳转」「生词高亮」等原生不支持的交互。

### 4.4 建议的存储与分发

| 阶段 | 方案 | 理由 |
|---|---|---|
| 本地开发 | `public/videos/` 或 R2 | 与现有静态站部署兼容 |
| 生产 | Cloudflare R2 + CDN | 与 `content/README.md:244` 提到的方案一致（「本地 → Cloudflare R2 → CDN → GitHub Releases」） |
| 离线 | **不建议**缓存视频到 SW | 视频体积远超 SW 缓存预算；建议仅缓存字幕与元数据 |

**建议**：视频**不参与** SW 离线预缓存。现有 `12-infrastructure/OFFLINE.md` 记录的是词库的缓存策略，视频需单独评估。

### 4.5 ⚠️ 建议优先澄清的版权问题

需求文档强调「视频学习差异化」，但**视频是最容易踩版权的品类**：

| 来源 | 版权风险 |
|---|---|
| 影视片段 | 🔴 极高（需逐个授权） |
| YouTube 视频 | 🔴 高（除非 CC 授权且确认可下载） |
| 自摄教学视频 | 🟢 低（自有版权） |
| 公开课（CC 授权） | 🟠 中（需核验 CC 版本与署名要求） |
| 动画 / 白板讲解（自制） | 🟢 低 |

**建议**（📐）：在动手做视频播放器**之前**先确定内容来源与许可 —— 否则会做出一个无合法内容可播的播放器。这与 `GAP_ANALYSIS.md:175` 记录的「绝对不能把 GitHub 素材直接塞进网站」是同一类问题。

---

## 5. 与需求文档的对照

| 需求 | 实测状态 | 缺口 |
|---|---|---|
| 视频学习差异化 | 📐 零实现 | 全部（类型、字段、播放器、内容、字幕） |
| 视频 + 字幕 | 📐 零实现 | 见 `SUBTITLE.md` |
| 视频 + 转写 | 📐 零实现 | 见 `TRANSCRIPT.md` |
| 视频生词提取 | 📐 零实现 | 依赖转写 + 词库比对 |
| 视频版权 | 📐 零治理 | 见 `11-legal/*` |

---

## 6. 结论

- **视频能力完成度 = 0%**：零文件、零 `<video>`、零播放器组件、零字段、无 `video` 类型槽位。
- **两处类型缺口是具体的、可执行的**（📐）：① `AssetKind` 无 `'video'`（`asset.ts`）；② `PLANNED_TYPES` 与 `ContentType` 均无 `'video'`（`catalog.ts:52-64`、`content.ts:34-46`）。两者都需走契约变更流程。
- **一处建议可显著降低实现成本**：字幕同步建议**直接使用浏览器原生 `<track>` + VTT**，不自研 —— 这也决定了字幕格式应优先选 VTT 而非 SRT（见 `SUBTITLE.md` §4）。
- **最重要的前置建议**（📐）：**先定版权来源，再做播放器**。视频是版权风险最高的品类，本项目当前零版权治理体系（`11-legal/*` 记为「🔄 混合」）。
