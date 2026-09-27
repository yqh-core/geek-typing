# 数据架构（DATA_ARCHITECTURE）

> 状态：✅ 已有 —— 14 个 localStorage key 全部清点，逐条附文件与行号。
> 基线 commit：`4152eb2`　｜　实测日期：2026-09-27
> 关联：`LEARNING_ARCHITECTURE.md`（学习记录键口径）、`CONTENT_CONTRACT.md` §10 L-6

---

## 1. 总览

本应用**无后端、无数据库、无用户体系**。全部持久化只有两种介质：

| 介质 | 用途 | 规模 |
|---|---|---|
| **`localStorage`** | 全部用户状态与偏好 | **14 个 key** |
| **HTTP 缓存 / Cache Storage** | 静态资源与内容 chunk | `sw.js`（`gt-shell-v3`）+ `public/_headers` |

**零 `IndexedDB`**、**零 `sessionStorage`**、**零 `Document.cookie`**、**零 `fetch(` 业务调用**。

实测依据：

```
$ grep -rn "indexedDB|IndexedDB|idb" src/ tests/ scripts/
→ 仅 4 处命中，全部是 src/core/content/ 下的注释（未来规划），无一处是调用代码
$ grep -rn "sessionStorage" src/
→ 零命中
```

---

## 2. 全部 14 个 localStorage key 清点

`gt.` 前缀 = Geek Typing 命名空间。key 命名风格分两类：
**带 `.v1` 后缀**（结构化数据，schema 可能演进）与**不带**（标量偏好）。

### 2.1 标量偏好（8 个）

| # | key | 定义位置 | 读写位置 | 类型 / 默认值 | 用途 |
|---|---|---|---|---|---|
| 1 | `gt.bank` | `src/App.tsx:84` | 读 `:84` / 写 `:305` | `string`，默认 `DEFAULT_BANK_ID`（=`'ai-core'`，`schema.ts:91`） | 当前选中的词库 id |
| 2 | `gt.theme` | `src/App.tsx:85` | 读 `:85` / 写 `:306` | `ThemeId`，默认 `'matrix'` | IDE 风格主题 |
| 3 | `gt.sound` | `src/App.tsx:86` | 读 `:86` / 写 `:307` | `boolean`，默认 `true` | 键盘音效开关 |
| 4 | `gt.soundTheme` | `src/App.tsx:87` | 读 `:87` / 写 `:308` | `SoundTheme`，默认 `'mech'` | 音效主题（机械轴体等） |
| 5 | `gt.shuffle` | `src/App.tsx:88` | 读 `:88` / 写 `:309` | `boolean`，默认 `true` | 词序是否打乱 |
| 6 | `gt.mode` | `src/App.tsx:89` | 读 `:89` / 写 `:310` | `PracticeModeId`，默认 `'classic'` | 练习模式 |
| 7 | `gt.autoSpeak` | `src/App.tsx:110` | 读 `:110` / 写 `:311` | `boolean`，默认 `false` | 自动朗读开关 |
| 8 | `gt.lang` | `src/i18n/index.tsx:19` | 读 `:19` / 写 `:48` | `'zh' \| 'en'`，默认按 `navigator.language` 探测（`:16-26`） | 界面语言 |
| 9 | `gt.voice` | `src/lib/speech.ts:7` | 读 `:15` / 写 `:33` | `'en-US' \| 'en-GB'`，默认 `'en-US'`（`:4`） | 发音口音偏好 |

（上表列 9 行：`gt.voice` 由 `src/lib/speech.ts` 独立管理，不在 `App.tsx` 的批量持久化里。）

**统一读写实现**（`App.tsx:63-77`）：

```ts
function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch { return fallback }
}
function writeStorage(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* 隐私模式下忽略 */ }
}
```

全部走 `JSON.stringify`，因此 `true` 存为字符串 `"true"`、`"matrix"` 存为 `"\"matrix\""`。
`App.tsx:304-311` 用 7 个独立 `useEffect` 做**状态变化即落盘**，
无防抖、无节流（对比：`analytics` 有 800ms 节流，见 §2.2 第 10 项）。

### 2.2 结构化数据（5 个）

| # | key | 常量定义 | 用途 | 键形态 |
|---|---|---|---|---|
| 10 | `gt.review.v1` | `src/lib/reviewStore.ts:27` | 错题本 + 艾宾浩斯复习调度 | **裸 `word`（原词形）** |
| 11 | `gt.memorize.v1` | `src/lib/memorizeStore.ts:16` | 背单词三态进度 | **裸 `word`（原词形）** |
| 12 | `gt.analytics.v1` | `src/lib/analytics.ts:6` | 击键统计 + 词级分析 | `.words` 子表键 = **`word.toLowerCase()`** |
| 13 | `gt.streak.v1` | `src/lib/streak.ts:6` | 每日打卡 / 热力图 | 日期 `YYYY-MM-DD` |
| 14 | `gt.customBanks.v1` | `src/lib/customBanks.ts:3` | 用户自定义词库 | 数组（非 map），词**无 ContentId** |

**Schema 明细**：

```
gt.review.v1       → Record<string, { wrongCount, correctStreak, lastWrongAt, nextReviewAt, intervalIdx }>
                     定义：reviewStore.ts:14-22

gt.memorize.v1     → Record<string, { status: 'known'|'fuzzy'|'unknown', reviews: number, lastAt: number }>
                     定义：memorizeStore.ts:6-14

gt.analytics.v1    → { letters: Record<string, {hit,miss}>, words: Record<string, {done,wrong}>,
                       totalKeys, totalCorrect, totalWords, bestWpm }
                     定义：analytics.ts:18-25

gt.streak.v1       → Record<string, { date: 'YYYY-MM-DD', words: number, seconds: number }>
                     定义：streak.ts:11-17

gt.customBanks.v1  → Array<{ id: 'custom-<base36>', name: string, words: WordItem[], createdAt: number }>
                     定义：customBanks.ts:5-10；id 生成 :28
```

### 2.3 ⚠️ 四层键口径不一致（实测）

| key | 键形态 | 后果 |
|---|---|---|
| `gt.review.v1` | 裸 `word` 原词形 | 与 memorize 一致，与 analytics 不一致 |
| `gt.memorize.v1` | 裸 `word` 原词形 | 同上 |
| `gt.analytics.v1` | `word.toLowerCase()` | `Oxford` 与 `oxford` 合并为一条 |
| `gt.customBanks.v1` | 无 id | 无法参与 Content 体系 |

契约 §10.1 用「四层口径还各不相同」描述这一现状，并指出：
**全库 9346 词中 2323 个跨包同名词、93 条含大写字母的词条**（如 `var wg sync.WaitGroup`；实测**不存在**仅大小写不同而其余相同的词形碰撞组）。
详细分析见 `LEARNING_ARCHITECTURE.md#4`。

---

## 3. 零 IndexedDB

全仓 `grep -rn "indexedDB"` 仅 4 处命中，**全部是注释**：

| 文件 | 行 | 文本性质 |
|---|---|---|
| `src/core/content/index/content-index.ts` | `:5` | 「将来索引落在 IndexedDB / 远端搜索 API」 |
| `src/core/content/index/content-index.ts` | `:179` | 「可能是 Trie / FST / SQLite / IndexedDB / 跑在 Worker 里的倒排表」 |
| `src/core/content/query/content-query.ts` | `:5` | 「底层数据源从 JSON 换成 IndexedDB / R2 / API 时页面零改动」 |
| `src/core/content/registry.ts` | `:4` | 「UI 永远不感知内容来自 JSON / TS / GitHub / CDN / IndexedDB」 |

**当前无任何 IndexedDB 代码**。

### 3.1 为什么这构成一个数据架构风险

`localStorage` 的硬约束：

| 约束 | 值 | 对本项目的影响 |
|---|---|---|
| 单源容量 | 通常 5 MB（浏览器而异） | 目前够用，但学习记录只存词的 key + 数字，不存内容正文 |
| 同步 API | 阻塞主线程 | 当前数据量下无感；记录数上万后会卡 |
| 只存字符串 | 必须 JSON 序列化 | 每次写入是**全量序列化 + 写盘** |
| 无索引 / 无查询 | 必须全量 `JSON.parse` 后在内存过滤 | `dueWords()`（`reviewStore.ts:152-159`）每次调用都全量加载 |

**已有一处熔断机制**：`reviewStore.ts:64-96` 的 Quota 熔断 ——
遇 `QuotaExceededError` 时按 `intervalIdx` 降序清洗 1/4，最多 3 轮（约清 58%），
每轮 `console.warn` 保证可观测。

若未来引入音频/字幕（需求文档的核心方向），**内容本体不会进 localStorage**
（Asset 模型设计为远程 URL，见 `03-architecture/CONTENT_ARCHITECTURE.md#4.3`），
但**每词的音频播放位置、字幕进度**这类细粒度状态会显著放大记录数 ——
届时 `localStorage` 的同步全量写会成为瓶颈。

→ 契约 §1 已把 Learning 层的存储标注为「LocalStorage / **未来 IndexedDB**」，
`content/README.md:60` 同此。这是已识别的方向，非新发现。

---

## 4. 数据流

### 4.1 内容数据流（只读，构建期固化）

```
开发期
  content/vocabulary/<id>/words.json（人工编排，顺序有语义）
        │
        │  npm run content:normalize      ← NFC / HTML 剥离 / 实体解码 / 空白折叠
        ▼
  words.json（规范形）
        │
        │  npm run content:build          ← 派生 stats / checksum / 版本三元组 / history / build
        ▼
  {manifest.json, words.json}（canonical 紧凑单行 + 尾随换行）
        │
        │  npm run content:validate       ← 20 项门禁，红了不许合
        ▼
  git commit
        │
        │  npm run build（tsc -b && vite build）
        ▼
  主 chunk（7 个 inline 包的 words）+ 3 个 lazy chunk（ielts/kaoyan/toefl）
  + 10 个 manifest（常驻主 chunk）
        │
        │  Cloudflare Pages 部署
        ▼
  用户浏览器
        │
        │  registry.loadPackage()（?raw + JSON.parse）
        ▼
  内存（loadedCache，单份）
        │
        ├──→ Index（四张 Map，懒构建）
        └──→ wordBanks.WORD_BANKS（V3 兼容层）
                  │
                  ▼
              UI 组件（当前路径，绕过 Query）
```

### 4.2 用户数据流（读写，运行时）

```
用户操作
  │
  ├── 偏好变更 ─→ useState ─→ useEffect ─→ writeStorage('gt.bank' | 'gt.theme' | ...)
  │                                          App.tsx:304-311
  │
  ├── 打字击键 ─→ recordKey(analytics, ...)         analytics.ts:59
  │               recordWordDone(analytics, ...)     analytics.ts:72
  │               recordWord()                       streak.ts:43
  │                    └──→ useEffect（800ms 节流）→ saveAnalytics()    App.tsx:318-321
  │
  ├── 敲错/复习对 ─→ recordWrong(word) / recordCorrect(word)   reviewStore.ts:104 / :123
  │                    └──→ save()（含 Quota 熔断）→ localStorage.setItem
  │
  ├── 背单词作答 ─→ recordMemorize(store, word, status)        memorizeStore.ts:29
  │                    └──→ localStorage.setItem（catch 静默）
  │
  └── 导入自定义词库 ─→ parseWords(raw) → saveCustomBank(name, words)   customBanks.ts:50 / :25
                          └──→ localStorage.setItem
```

### 4.3 读路径的实时派生

```
localStorage
  │
  ├── loadReview()   ──→ dueWords(validWords)  ──→ 复习队列      reviewStore.ts:31 / :152
  ├── loadMemorize() ──→ getMemorizeStats()    ──→ 今日新学/复习  memorizeStore.ts:19 / :60
  ├── loadAnalytics()──→ weakLetters() / wrongWords() / rankByWeakness()
  ├── loadHistory()  ──→ getStreakDays() / getRecentDays()      streak.ts:25 / :67 / :84
  └── loadCustomBanks() ──→ App.tsx 合并进 banks 列表            customBanks.ts:12
```

**关键事实**：`dueWords(validWords?)` 的第二参数是「有效词集合」。
调用方需先从 UI 侧拿到全部已加载词（`allLoadedWords`）传进去 ——
这是 UI 与 Learning 层之间**唯一的数据契约**，也是 Learning 无法独立于 UI 的原因之一。

### 4.4 内容的"隐式持久化"

内容数据不经 localStorage，而是靠 **HTTP 缓存 + Cache Storage**：

| 机制 | 位置 | 策略 |
|---|---|---|
| 带 hash 静态资源 | `public/_headers` | `/assets/*` → `max-age=31536000, immutable` |
| SW shell 缓存 | `public/sw.js` | `gt-shell-v3`，install 时预缓存（含解析 HTML 得到的 `/assets/*`） |
| SW 运行时 | `sw.js:78-103` | 静态资源缓存优先；页面网络优先，断网回落 `/index.html` |
| SW 自身 | `public/_headers` | `/sw.js` → `no-cache`（保证新版本能被探测） |
| 大词库预热 | `src/main.tsx:27-58` | `requestIdleCallback` → `warmUpVocabulary()` 预拉 3 个 lazy chunk |

→ 内容层「版本」的正确性因此依赖 **构建产物 hash 变化**，
而不是内容字段。这与 `contentVersion` / `contentChecksum` 是两套独立的版本机制
（前者是浏览器缓存失效，后者是内容身份）。

---

## 5. 数据架构的边界约束（不变量）

| # | 约束 | 现状 |
|---|---|---|
| D-1 | 用户数据永不进 `content/` | ✅ 遵守（无任何写 `content/` 的运行时代码） |
| D-2 | 学习状态永不挂进 content payload | ✅ 遵守（`WordPayload` 只有 4 个内容字段） |
| D-3 | 内容本体不进 localStorage | ✅ 遵守（内容只进 HTTP/SW 缓存） |
| D-4 | 音频/大文件资源存远程 URL | 📐 仅设计（`model/asset.ts`），当前无资产数据 |
| D-5 | 学习记录以 contentId 为键 | ❌ **未遵守**（4 套裸 word / lowercase / 日期口径） |
| D-6 | 用户数据可跨设备同步 | ❌ 无实现（纯本机 `localStorage`，UI 已如实提示：`i18n/zh.ts:89` 「数据只保存在本机 localStorage」） |

---

## 6. 一句话结论

> 数据层是**纯 `localStorage`、14 个 key、零 IndexedDB** 的单机模型。
> 9 个标量偏好结构简单、口径清晰；5 个结构化数据里，
> `gt.review.v1` / `gt.memorize.v1` / `gt.analytics.v1` **用了三套互不兼容的键口径**，
> 而 `gt.customBanks.v1` 的词根本没有 id。
> 内容的"版本"由构建产物 hash 承担，与 `contentChecksum` 是两套独立机制。
