# 术语表（GLOSSARY）

> 状态：✅ 已有（实测）
> 基线 commit：`4152eb2`｜实测日期：2026-09-27
> 每个术语均给出**真实定义 + 代码出处（文件:行号）**。定义来自实际实现，不是设计意图的复述。
> 术语按所属层分组；跨层术语标注实际所属层。

---

## 0. 阅读说明

本项目中多个术语存在**同名不同物**的情况（例如"Learning 层"有两个互不相干的实现），这是本项目最容易误读的地方。凡遇此情况，本文均明确标注**实际生效的那一个**。

---

## 1. Content 层术语（内容治理链）

### 1.1 `ContentId`

**定义**：内容条目的全局唯一标识符，4 段式字符串。

**格式**：`content:<type>:<namespace>:<localId>`

**出处**：`src/core/content/model/content.ts:58-67`

**示例**（实测自真实 manifest）：

| 包 | 示例 ContentId |
|----|---------------|
| ai-core | `content:vocabulary:ai-core:word:0001` 形态 |
| ielts | `content:vocabulary:ielts:...` |

**关键约束**：4 段缺一不可；`type` 必须属于 `ContentType` 12 取值之一；`namespace` 全局唯一。

---

### 1.2 `namespace`

**定义**：`ContentId` 第 3 段，用于隔离不同内容包的 `localId` 空间。

**唯一性规则**：由构建期强制。`scripts/content/build.mjs:45-49` 维护 `SOURCE` 映射并校验唯一性。

**实测值**（10 个）：`ai-core`、`cet4`、`cet6`、`cloud-native`、`frontend`、`go-code`、`ts-code`、`ielts`、`kaoyan`、`toefl`。

**不变量**：`namespace` ∈ `build.mjs` 的 SOURCE 映射键集合；重复即构建失败。

---

### 1.3 `localId`

**定义**：`ContentId` 第 4 段，在 `namespace` 内唯一。

**说明**：`localId` **只在 `namespace` 内**唯一，跨 `namespace` 可重复。因此 `localId` 单独使用时**不是全局键**。

---

### 1.4 `ContentType`

**定义**：内容类型的枚举，共 **12 个取值**。

**出处**：`src/core/content/model/content.ts:34-46`

**实测落地**：**只有 2 种有数据**（`vocabulary`、`word`）。

**相关常量**：
- `SUPPORTED_TYPES = ['word']`（`src/lib/content-query.ts:133`）—— Query 层实际只认 `word`。
- `PLANNED_TYPES`（**11 项**占位，`src/core/content/catalog.ts:52-64`）—— 规划中但无实现。

---

### 1.5 `checksum` / `contentChecksum`

**定义**：内容的规范形式哈希值，用于完整性校验。

**算法**：canonical SHA-256。

**实现**：`scripts/content/canonical.mjs`（134 行），定义 **7 条规则（N-1~N-8）** 规定"规范形式"如何生成。

**关键语义**：`canonical.mjs` 对**三个字段**做语义区分（详见 `03-architecture/CONTENT_ARCHITECTURE.md`）。

---

### 1.6 版本三元组（实为 4 个数）

| 字段 | 语义 |
|------|------|
| `schemaVersion` | 内容**结构契约**版本；当前值 **`4`**（`src/core/content/model/content.ts:127`） |
| `contentRevision` | 内容**修订号**；实测 ielts/kaoyan/toefl 为 `rev2`，其余 7 包为 `rev1` |
| `contentVersion` | 内容**语义版本**；实测 ielts/kaoyan/toefl 为 `ver2`，其余为 `ver1` |
| `contentChecksum` | 上述校验和 |

**出处**：各 `content/vocabulary/*/manifest.json`

---

### 1.7 `ContentSnapshot`

**定义**：一次构建产出的内容快照，包含 catalog + index 的完整状态。

**实现**：`src/lib/snapshot.ts`（128 行）

**作用**：向运行时提供**不可变**的内容视图；配合 6 条冻结条款（C-1~C-6）。

---

### 1.8 四层治理链（Registry → Catalog → Index → Query）

| 层 | 术语 | 实现 | 行数 | 职责 |
|----|------|------|------|------|
| L1 | **Registry** | `src/core/content/registry.ts` | 141 | 内容包的注册与聚合；8 个 API |
| L2 | **Catalog** | `src/core/content/catalog.ts` | 104 | 类型目录；`getCatalog()`（`:80-97`）、`PLANNED_TYPES`（`:52-64`） |
| L3 | **Index** | `src/core/content/indexer/content-index.ts` | 231（internal） | 建 **4 张 Map** + 6 个 finder |
| L4 | **Query** | `src/lib/content-query.ts` | 385 | 对外查询入口 **4 个** |

**职责分离原文**：`src/core/content/catalog.ts:3-6`（注释中明确四层职责）。

**Query 四入口**：`search`（`:260`）、`list`（`:293`）、`get`（`:302`）、`count`（`:310`）。

**Index 六个 finder**：`findById`（`:202`）、`findByWord`（`:207`）、`findByPackage`（`:212`）、`findByTag`（`:217`）、`findByNamespace`（`:222`）、`idsByPackage`（`:228`）。

---

### 1.9 `Query` / `Scope` / `Sort`

| 术语 | 定义 | 出处 |
|------|------|------|
| **Query** | 四类查询操作：search / list / get / count | `src/lib/content-query.ts:260/293/302/310` |
| **Scope** | 查询范围限定（按包、按命名空间、按标签等） | 同上 |
| **Sort** | 排序键；**`updated` 是假排序**（所有条目同值，退化为无排序） | `GAP_ANALYSIS.md` A-2 |

**关键提醒**：`Sort.updated` 在本项目**不可作为有效排序依据**。

---

### 1.10 `normalizeWord()`

**定义**：词条归一化函数，用于查询时的字符串匹配。

**出处**：`src/core/content/indexer/content-index.ts:45-47`

**用途**：把查询输入与索引键做一致化处理。

---

### 1.11 inline / lazy（加载方式）

| 术语 | 定义 | 实测 |
|------|------|------|
| **inline** | 词条打包进主 chunk，随首屏加载 | **7 包，346 词** |
| **lazy** | 词条拆成独立 chunk，按需动态 import | **3 包，9,000 词**（ielts/kaoyan/toefl 各 3,000） |

**出处**：`docs/audit-package/content-samples/MANIFESTS.md`；lazy chunk 名 `words-Dfqbfxph`（toefl）/`words-DO8i2GAI`（ielts）/`words-LP9e320F`（kaoyan）。

---

### 1.12 冻结条款 C-1~C-6

**定义**：内容治理链的 **6 条不可违背的架构约束**。

**出处**：`docs/audit-package/03-architecture/CONTENT_ARCHITECTURE.md`

**作用**：任何内容相关改动必须同时满足 6 条，否则视为破坏架构。

---

## 2. Learning 层术语（学习状态）

### 2.1 ⚠️ "Learning 层"有两个实现（重要陷阱）

| 位置 | 文件数 | 行数 | 实际状态 |
|------|-------|------|---------|
| `src/core/learning/model/` | **1** | 47 | **零实现**——只有类型定义 |
| `src/lib/` | **12** | — | **真实现**——所有运行时学习逻辑在此 |

**出处**：`docs/audit-package/03-architecture/LEARNING_ARCHITECTURE.md`（该文档用"两个 Learning 层错位"专门说明）。

**结论**：讨论"Learning 层"时，若无特别说明，指的是 `src/lib/` 下的实现，而非 `src/core/learning/`。

---

### 2.2 `LearningItem`

**定义**：学习项的类型契约。

**出处**：`src/core/learning/model/learning-item.ts`（**47 行，仅类型**）

**结构要点**：`extends ContentRef`；含 `LearningStatus` 4 值。

**实测状态**：**仅有类型定义，无任何实现调用方**。

---

### 2.3 `LearningStatus`

**定义**：学习项状态，**4 个取值**。

**出处**：`src/core/learning/model/learning-item.ts`

**注意**：与 `MasteryLevel`（见 §2.4）是**两个不同的枚举**，不要混用。

---

### 2.4 `Mastery` / `MasteryLevel`（掌握度）

**定义**：用户对某个词的掌握程度，**4 个等级**：

| 等级 | 语义 |
|------|------|
| `struggling` | 吃力 |
| `learning` | 学习中 |
| `familiar` | 熟悉 |
| `strong` | 牢固 |

**出处**：`src/lib/mastery.ts`（33 行）

**验证**：E2E【16】断言 `struggling` 与 `strong` 徽章存在。

**关键说明**：掌握度是**从打字与卡片数据派生**的，不是独立评估结果。

---

### 2.5 `SRS`（Spaced Repetition System / 间隔重复系统）

**定义**：按艾宾浩斯遗忘曲线安排复习时点的调度算法。

**实现**：`src/lib/reviewStore.ts`（176 行）

**存储 key**：`gt.review.v1`

**核心常量**：`INTERVALS_DAYS = [1, 2, 4, 7, 15]`（`:25`）

**关键机制**：
| 机制 | 出处 | 说明 |
|------|------|------|
| jitter（抖动） | `:99-101` | ±10%，避免大批同时到期 |
| `recordWrong` | `:103-120` | 答错归零（`intervalIdx` 回 0） |
| `recordCorrect` | `:122-149` | 答对推进一档；毕业则移除 |
| `dueWords` | `:151-159` | 取出到期词 |
| Quota 熔断 | `:51-96` | `QUOTA_ROUNDS = 3`，每轮 1/4 |

**验证**：E2E【13-2】jitter 断言 `[0.85d,1.15d]` / `[1.8d,2.2d]`；【14-3】到期词注水；【14-4】推进 0→1；【14-5】毕业移除。

**详细文档**：`docs/audit-package/06-learning/SRS.md`（521 行）

---

### 2.6 `Ratchet`（棘轮）

**定义**：学习进度**只能前进、不能后退**的机制约束。答错时并非"回退到上一档"，而是按特定规则处理（错词归零 + 追加练习次数）。

**出处**：`src/lib/reviewStore.ts`（`recordWrong` 的归零语义）；`src/components/Memorize.tsx`（三键追加语义）

**实证语义**：
- 复习侧：答错 → `intervalIdx = 0`（`reviewStore.ts:103-120`）
- 卡片侧：`unknown` 追加 **2 次**、`fuzzy` 追加 **1 次**、`known` 直接完成（`Memorize.tsx` 文件头注释 + `answer()`）

**设计意图**：进度表的"棘轮"指已完成的推进档位不回退，而非"错误不发生"。

---

### 2.7 `LearningRelation`

**定义**：内容与用户之间的**关系类型**，共 **5 种**：

| 关系 | 语义 |
|------|------|
| `studied` | 已学过 |
| `collected` | 已收藏 |
| `mastered` | 已掌握 |
| `in_progress` | 进行中 |
| `goal_of` | 作为目标 |

**出处**：`src/core/learning/model/relation.ts:64-90`（90 行）

**实测状态**：**仅类型定义，无引擎、无存储、无 UI**。（这是学习图谱的基础契约，但图谱本身零实现。）

---

## 3. 存储与数据术语

### 3.1 localStorage key 命名约定

**格式**：`gt.<domain>[.v<n>]`

| 形态 | 示例 |
|------|------|
| 无版本后缀（标量偏好） | `gt.bank`、`gt.theme`、`gt.sound`、`gt.lang`、`gt.voice`、`gt.shuffle`、`gt.mode`、`gt.autoSpeak`、`gt.soundTheme` |
| 带版本后缀（结构化数据） | `gt.review.v1`、`gt.memorize.v1`、`gt.analytics.v1`、`gt.streak.v1`、`gt.customBanks.v1` |

**实测总数：14 个**。

**出处**：`docs/audit-package/03-architecture/DATA_ARCHITECTURE.md` §2

**读写工具**：`readStorage` / `writeStorage`（`src/App.tsx:63-77`）

---

### 3.2 四层键口径不一致（重要事实）

**定义**：同一个"词"，在四个存储层里用的是**不同的键**。

| 存储 key | 键形态 | 出处 |
|----------|-------|------|
| `gt.review.v1` | 裸 `word`（原词形） | `src/lib/reviewStore.ts` |
| `gt.memorize.v1` | 裸 `word`（原词形） | `src/lib/memorizeStore.ts`（72 行） |
| `gt.analytics.v1` | `word.toLowerCase()` | `src/lib/analytics.ts`（116 行） |
| `gt.streak.v1` | **日期**（非词） | `src/lib/streak.ts`（94 行） |
| `gt.customBanks.v1` | **无 id** | `src/lib/customBanks.ts`（92 行） |

**后果**：跨包同名词 **2,323 个**、**含大写字母的词条 93 条**（多为 go-code/ts-code/frontend 的真实代码行，如 `var wg sync.WaitGroup`；实测**不存在**仅大小写不同而其余相同的词形碰撞组）会被错误合并或分裂。

**出处**：`docs/audit-package/03-architecture/DATA_ARCHITECTURE.md` §2.3；`GAP_ANALYSIS.md` A-4。

---

### 3.3 `wordBanks.ts`（遗留数据通道）

**定义**：UI 层实际读取词数据的模块，**绕过 Query 层**。

**出处**：`src/lib/wordBanks.ts`（73 行）

**关键事实**：Content 治理链（Registry→Catalog→Index→Query）**未被 UI 接线**；UI 直接走 `wordBanks.ts`。

**实测影响**：UI 直读词数组 **17 处**（`GAP_ANALYSIS.md` A-1 逐行号表：`App.tsx:13-21/127/133/150/690/722`；`Memorize.tsx:54/68/96/269`；`ReviewPanel.tsx:4/136`；`Header.tsx:200`；`BankManager.tsx` 10 处）。

---

### 3.4 内容不变量 D-1~D-6

| 编号 | 内容 | 状态 |
|------|------|------|
| D-1~D-4 | 内容侧不变量 | ✅ |
| **D-5** | 学习记录应以 `contentId` 为键 | ❌ **未满足** |
| **D-6** | 应有跨设备同步 | ❌ **未实现** |

**出处**：`docs/audit-package/03-architecture/DATA_ARCHITECTURE.md` §5

---

## 4. UI / 交互术语

### 4.1 页签 / Tab

**定义**：应用顶层视图，用 `TabId` 类型表示。

**取值**：`'home' | 'typing' | 'memorize' | 'review' | 'progress'`

**出处**：`src/App.tsx:44`（⚠️ `03-architecture/FRONTEND_ARCHITECTURE.md` 与 `SYSTEM_ARCHITECTURE.md` 记为 `:52`，**实测源码为 `:44`**，以源码为准）

**切换机制**：`src/App.tsx:83` 的 `useState<TabId>('home')`。

---

### 4.2 浮层 / Overlay 与弹窗 / Panel

| 术语 | 含义 | 实例 |
|------|------|------|
| **浮层（Overlay）** | 覆盖式 UI，可含输入 | `CommandPalette`（`:command-palette`）、`ResultOverlay`（`:result-overlay`） |
| **弹窗（Panel）** | 面板式 UI | `StatsPanel`（`:open-stats`）、`BankManager`（`:open-bank-manager`） |

---

### 4.3 `data-testid` 约定

**定义**：所有可被 E2E 定位的元素所带的测试锚点属性。

**命名约定**：
- 页签：`tab-{id}`（`src/App.tsx:637`）
- 命令项：`command-item-{name}`（`src/components/CommandPalette.tsx:376`）
- 下拉：`dropdown-{name}`（`src/components/Dropdown.tsx:60`，配 `aria-expanded` `:61`）
- 面板根：`{name}-panel`
- 详情：`{name}-detail`

**验证价值**：`data-testid` 是 E2E 167 项与审计截图脚本的唯一定位依据。

---

### 4.4 `CommandPalette`（命令面板）

**定义**：类 Raycast 的命令输入浮层，Esc 唤起/关闭。

**实现**：`src/components/CommandPalette.tsx`（404 行）

**14 条命令**（`:56-71`）：

| 命令 | 参数 |
|------|------|
| `review` | — |
| `bank` | 有参（词库名） |
| `mode` | 有参（模式 id） |
| `voice` | 有参（en-US / en-GB） |
| `theme` | 有参（主题 id） |
| `sound` | 有参 |
| `soundtheme` | 有参 |
| `shuffle` | 有参（on/off） |
| `memorize` | — |
| `typing` | — |
| `home` | — |
| `progress` | — |
| `q` | 退出 |
| `help` | — |

**匹配算法**：子串命中 + 前缀优先（文件头注释）。

**交互**：↑↓ 移动、Tab 补全、Enter 执行、带参命令回车补全不误执行。

**HELP 文本**：`:73-96`（zh/en 各 12 行）。

---

### 4.5 `mode`（练习模式）

| 模式 id | 名称 | 关键差异 |
|---------|------|---------|
| `classic` | 经典 | 严格逐字母，敲错即拦 |
| `spell` | 拼写 | 目标词遮罩为 `·`，可 Backspace |
| `timed` | 限时 60s | 有倒计时（`:countdown`） |
| `code` | 代码 | **大小写敏感**，允许代码符号 |

**出处**：`src/lib/modes.ts`（20 行）

---

### 4.6 `theme`（主题）

**3 套**：`matrix` / `ide` / `ink`

**出处**：`src/lib/theme.ts`（81 行），`ThemeId` 与 `THEME_LIST`（`:81`）

**每套 11 个语义槽**：`root`、`card`、`border`、`sub`、`pending`、`correct`、`caret`、`accent`、`accentHex`、`pill`、`wrongBg`（每个槽在源码中有中文注释）。

**关键实现事实**：主题是 **TypeScript 常量对象**，**不是 CSS 变量**。`ink` 主题带 `ideStyle: true` 标志。

**实测值举例**：

| 主题 | `root` | `accentHex` |
|------|--------|------------|
| matrix | `bg-[#0b1120] text-slate-200` | `#34d399` |
| ide | `bg-[#181818] text-[#d4d4d4]` | `#569cd6` |
| ink | `bg-[#f5f3ec] text-[#1f2328]` | `#0f7b4f` |

---

### 4.7 `sound` / `soundTheme`（音效）

**定义**：用 Web Audio API **实时合成**的打字音，**无音频文件**。

**实现**：`src/lib/sound.ts`（204 行）

**3 套音效主题**：`mech` / `thock` / `8bit`

---

### 4.8 `voice` / 发音（TTS）

**定义**：单词发音，用浏览器原生 **Web Speech API**。

**实现**：`src/lib/speech.ts`（82 行）

**口音**：`en-US` / `en-GB`，持久化为 `gt.voice`（`speech.ts:7`）

**关键限制**：依赖浏览器/系统内置语音，**无服务端 TTS**。

---

### 4.9 `notice` / Toast

**定义**：命令面板底部的轻提示，分两种：

| testid | 语义 |
|--------|------|
| `command-notice` | 普通提示 |
| `command-error` | 错误 |

**出处**：`src/components/CommandPalette.tsx:318`（按 `notice.kind === 'error'` 切换）

---

### 4.10 `prefers-reduced-motion`（减少动效）

**定义**：用户的系统级无障碍偏好。

**实测落点**：**全仓唯一** —— `src/lib/confetti.ts:15` 与 `:25` 的 `disableForReducedMotion: true`。

**含义**：除彩带外，**其余动画（`shake`/`blink`/`pop`/`popIn`）不响应此偏好**。

---

### 4.11 `pointer: coarse`（粗指针）

**定义**：触屏设备的媒体查询。

**实测落点**：**全仓唯一** —— `src/components/Memorize.tsx:164` 的 `window.matchMedia('(pointer: coarse)')`。

**另有一处**：`Memorize.tsx` 的 `isTouch = navigator.maxTouchPoints > 0`（`:145-258` 手势段内）。

---

## 5. 工程术语

### 5.1 `content:validate`（20 项门禁）

**定义**：内容合法性的自动化检查，共 **20 项**。

**实现**：`scripts/content/validate.mjs`（**427 行**）

**分类举例**：
- 第 7 项：license 检查（`:7`）
- 第 9/12(c)/14 项：namespace 唯一性、structure 等（详见 `03-architecture/CONTENT_ARCHITECTURE.md`）
- 包内去重（`:172-176`）—— **只做包内，不做跨包**
- 来源判定（`:196`）—— **靠字符子串**（`KNOWN_ISSUES.md` E-10 指为薄弱点）

---

### 5.2 `check:bundle`（3 项体积门禁）

**定义**：构建产物体积上限检查。

**实现**：`scripts/content/check-bundle.mjs`（250 行）

**阈值**：主 chunk **420 KiB** raw / **135 KiB** gzip。

**实测**：`index-Cawl4_-q.js` 381.06 KiB raw / 118.89 KiB gzip → **通过**。

---

### 5.3 三条构建铁律

**定义**：`scripts/content/build.mjs:105-160` 规定的三条构建期强制规则。

**出处**：`docs/audit-package/03-architecture/CONTENT_ARCHITECTURE.md`

---

### 5.4 `warmUpVocabulary()`

**定义**：启动期内容预热函数。

**实现**：`src/main.tsx:27-58`（调用）；`src/core/content/registry.ts:139`（**硬编码 3 个包名**）

**实测证据**：E2E【14-2】预热探针断言 `gt-shell-v3` 缓存含 **3 个 `words-*.js`**。

**已知债**：A-3 —— 预热列表硬编码，新增 lazy 包不会自动预热。

---

### 5.5 `gt-shell-v3`

**定义**：Service Worker 的缓存名。

**出处**：`public/sw.js`（178 行 / 7 619 B）

**版本沿革**：`v1` → `v2`（历史策略调整）→ **`v3`（本轮审计为修复 BUG-002 升级）**。升版是清除存量中毒缓存的唯一机制。

**双策略**：
- `/assets/*` → **cache-first**
- 其余 → **network-first**

---

### 5.6 `DEBT-002`（CI 缺口）

**定义**：已知技术债编号——测试门禁未进 CI。

**实测**：`deploy.yml`（60 行）只跑 build；`e2e.yml`（40 行）**仅 PR 触发**且只跑 build + e2e。

**未进 CI 的门禁**：`content:validate`(20) + `check:bundle`(3) + `test:content`(149) + `test:offline`(4) + `test:prod`(22) + `lint`。

**出处**：`docs/audit-package/13-acceptance/GAP_ANALYSIS.md` B-3 / DEBT-002

---

### 5.7 编号规则（缺陷与债）

| 前缀 | 含义 |
|------|------|
| `BUG-` | 功能缺陷 |
| `FLAKY-` | 不稳定用例 |
| `DEBT-` | 技术债 |
| `UX-` | 体验问题 |
| `PERF-` | 性能问题 |
| `CONTENT-` | 内容质量问题 |
| `LEGAL-` | 法务/版权问题 |
| `SECURITY-` | 安全问题 |
| `A-` / `B-` / `C-` / `D-` / `E-` | 缺口分析五类分组 |

**出处**：`docs/audit-package/13-acceptance/KNOWN_ISSUES.md`（编号规则节）

---

## 6. 易混淆术语对照表

| 术语 A | 术语 B | 区别 |
|--------|--------|------|
| `LearningStatus`（4 值） | `MasteryLevel`（4 值） | 前者在 `src/core/learning/`（**仅类型**），后者在 `src/lib/mastery.ts`（**真实现**）；**不是同一个枚举** |
| `src/core/learning/` | `src/lib/`（Learning 实现） | 前者 1 文件 47 行零实现；后者 12 文件真实现 |
| `ContentType`（12 值） | `SUPPORTED_TYPES`（1 值） | 前者是契约全集，后者是 Query 层实际支持集 **`['word']`** |
| `ContentType`（12 值） | `PLANNED_TYPES`（11 项） | 后者是占位常量，无实现 |
| `namespace` | `localId` | 前者全局唯一；后者仅包内唯一 |
| `contentRevision` | `contentVersion` | 前者是修订号（rev1/rev2），后者是语义版本（ver1/ver2） |
| `Sort.updated` | 真实时间排序 | 前者是**假排序**，所有条目同值 |
| `word`（裸字符串） | `ContentId` | 学习记录用前者（**错误**，跨包同名词 2,323 个），契约要求后者（D-5 ❌） |
| `gt.review.v1` 键 | `gt.analytics.v1` 键 | 前者裸 `word`，后者 `word.toLowerCase()` |
| `theme`（TS 常量） | CSS 变量 | 本项目**没有 CSS 变量**；主题是 TS 对象 |
| `sound`（Web Audio 合成） | 音频文件 | 本项目**无音频资源文件** |
| `voice`（Web Speech API） | 服务端 TTS | 本项目**无服务端**，依赖浏览器内置语音 |

---

## 7. 本文未能验证的术语

| 术语 | 原因 |
|------|------|
| `rightsStatus` | 需求文档提及但**未实现**，仓库无此字段 |
| 通用导入相关术语（格式、映射、去重） | 功能零实现，无代码可考 |
| 学习图谱相关术语（节点、边、推荐算法） | 除 `LearningRelation` 5 类型外无实现 |
| 音视频 / 字幕相关术语 | 零实现 |
| 考试体系相关术语 | 零实现 |

---

## 一句话结论

本项目的术语体系**跨两个成熟度差异极大的层**：Content 层（`ContentId`、`namespace`、`checksum`、Registry→Catalog→Index→Query、6 条冻结条款）术语定义严谨且有 20 项门禁保障；Learning 层则存在**同名两实现**（`src/core/learning/` 仅类型 vs `src/lib/` 真实现）与**四层键口径不一致**（裸 `word` / `toLowerCase` / 日期 / 无 id）两个结构性混淆点，其中学习记录未以 `contentId` 为键（不变量 D-5 ❌）是当前最需要审计方关注的术语-实现落差。
