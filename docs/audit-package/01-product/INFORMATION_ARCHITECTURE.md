# 信息架构（INFORMATION ARCHITECTURE）

> 状态：✅ 已有（实测）
> 基线 commit：`4152eb2`｜实测日期：2026-09-27
> 本文描述**实际实现**的信息架构。所有锚点均为 `data-testid` 实测值。

---

## 1. 架构总览

### 1.1 顶层结构

应用是**单页应用（SPA）但无路由**：全部内容挂在一个 URL 下，靠 `useState` 切换视图。

```
┌─────────────────────────────────────────────────────────┐
│  Header（顶栏）                                          │
│  ├─ 品牌 / 副标题          app.subtitle                 │
│  ├─ 模式下拉               mode-{classic|spell|timed|code}│
│  ├─ 词库下拉               bank 选择器                    │
│  ├─ 自动发音开关           toggle-autospeak              │
│  ├─ 复习入口（带角标）     menu-review / review-due-badge │
│  ├─ 词库管理               open-bank-manager             │
│  ├─ 语言切换               lang-{zh|en}                  │
│  ├─ 统计面板               open-stats                    │
│  └─ 命令面板入口           open-cmd                      │
├─────────────────────────────────────────────────────────┤
│  页签栏（5 个 tab）                                       │
│   tab-home │ tab-typing │ tab-memorize │ tab-review │ tab-progress │
├─────────────────────────────────────────────────────────┤
│  主内容区（按 tab 条件渲染，同一时刻只渲染一个）           │
│   ├─ home      → HomePanel      (home-panel)             │
│   ├─ typing    → PracticePanel  (word, speak-btn, code-wrap) │
│   ├─ memorize  → Memorize       (memorize-card, ...)     │
│   ├─ review    → ReviewPanel    (review-panel, ...)      │
│   └─ progress  → ProgressPanel  (progress-panel, ...)    │
├─────────────────────────────────────────────────────────┤
│  辅助区（常驻或条件渲染）                                 │
│   ├─ StatsBar（统计条）                                   │
│   ├─ KeyMap（快捷键提示，keymap，aria-hidden）            │
│   ├─ esc-hint（Esc 提示）                                 │
│   ├─ StreakBar（连击条）                                  │
│   └─ footer（页脚）                                       │
├─────────────────────────────────────────────────────────┤
│  浮层（条件渲染，覆盖式）                                 │
│   ├─ CommandPalette  (command-palette)  ← commandMode    │
│   ├─ ResultOverlay   (result-overlay)   ← tab==='typing' && finished │
│   ├─ StatsPanel      (open-stats 触发)                   │
│   └─ BankManager     (open-bank-manager 触发)             │
└─────────────────────────────────────────────────────────┘
```

### 1.2 五个页签

| # | id | 中文 | 英文 | 组件 | testid |
|---|----|------|------|------|--------|
| 1 | `home` | 今日 | Home | `HomePanel.tsx`（161 行） | `home-panel` |
| 2 | `typing` | 打字练习 | Typing | `PracticePanel.tsx`（240 行） | `word`、`speak-btn`、`code-wrap` |
| 3 | `memorize` | 背单词 | Memorize | `Memorize.tsx`（449 行） | `memorize-card` 等 |
| 4 | `review` | 复习 | Review | `ReviewPanel.tsx`（212 行） | `review-panel` 等 |
| 5 | `progress` | 进度 | Progress | `ProgressPanel.tsx`（120 行） | `progress-panel` 等 |

**定义源**：`src/App.tsx:44`

```ts
export type TabId = 'home' | 'typing' | 'memorize' | 'review' | 'progress'
```

> ⚠️ **行号说明**：`docs/audit-package/03-architecture/FRONTEND_ARCHITECTURE.md` 与 `SYSTEM_ARCHITECTURE.md` 原把 `TabId` 定义行号误记为第 52 行，**实测源码为 `App.tsx:44`**；该两处已同步订正为 `:44`。本文以源码为准。

**状态源**：`src/App.tsx:83` → `const [tab, setTab] = useState<TabId>('home')`

**页签按钮渲染**：`src/App.tsx:637` → `<button data-testid={`tab-${tb.id}`}>`

**验证**：E2E【16】"V3-P0a 五页签"

---

## 2. 浮层（Overlay）

### 2.1 目录

| 浮层 | 组件 | 触发条件 | 根 testid | 定位 |
|------|------|---------|-----------|------|
| **CommandPalette** | `CommandPalette.tsx`（404 行） | `commandMode` 为真 | `command-palette` | `fixed bottom-0 ... sm:bottom-6 sm:left-1/2 sm:-translate-x-1/2 sm:max-w-xl` |
| **ResultOverlay** | `ResultOverlay.tsx`（115 行） | `tab === 'typing' && finished` | `result-overlay` | 居中覆盖 |

### 2.2 CommandPalette 内部结构

| 元素 | testid / 属性 | 出处 |
|------|--------------|------|
| 容器 | `command-palette` | `:313` |
| 输入框 | `command-input` | `:332` |
| 候选列表 | `command-list`（`max-h-56` 滚动） | `:370` |
| 候选项 | `command-item-${c.name}` | `:376` |
| 选中态 | `aria-selected` + `role="option"` | `:378-379` |
| 提示 | `command-notice` / `command-error` | `:318` |
| 光标色 | `style={{ caretColor: theme.accentHex }}` | `:398` |

**14 条命令**（`:56-71`）：`review`、`bank`(参)、`mode`(参)、`voice`(参)、`theme`(参)、`sound`(参)、`soundtheme`(参)、`shuffle`(参)、`memorize`、`typing`、`home`、`progress`、`q`、`help`

**双语 HELP**（`:73-96`，zh/en 各 12 行）

**移动端细节**：输入框 `text-base sm:text-sm`，保证移动端字号 ≥16px 以防聚焦缩放（E2E【14-2】有断言）

---

## 3. 弹窗（Panel）

| 面板 | 组件 | 入口 testid | 内部锚点 |
|------|------|------------|---------|
| **StatsPanel** | `StatsPanel.tsx`（219 行） | `open-stats`（`:47`） | `review-stats`(`:82`)、`review-total`(`:87`)、`review-due`(`:93`)、`review-due-btn`(`:99`)、`weak-practice`(`:146`) |
| **BankManager** | `BankManager.tsx`（209 行） | `open-bank-manager`（`:78`、Header `:209`） | `bank-textarea`(`:106`)、`import-bank`(`:118`) |

> **注**：`open-bank-manager` 这个 testid 在 `BankManager.tsx:78` 与 `Header.tsx:209` **都出现**，需注意 E2E 定位时的歧义。

---

## 4. 各视图内层结构

### 4.1 HomePanel（`home-panel`）

| 区块 | testid | 说明 |
|------|--------|------|
| 连击 | `home-streak` | streak 天数 |
| 今日目标 | `home-goal`、`home-goal-bar` | 目标进度条；`DAILY_GOAL = 50` |
| 复习卡 | `home-review-card`、`home-review-start`、`home-review-empty` | 到期词数 / 开始 / 空态 |
| 弱项卡 | `home-weak-card`、`home-weak-start`、`home-weak-empty` | 弱项词 / 开始 / 空态 |
| 新词卡 | `home-new-card`、`home-new-start` | 待学新词 / 开始 |

**验证**：E2E【16】断言 `home-goal-bar` **60%**、`home-review-card`「1 个单词到期」、`home-weak-card` q **90%**、`home-new-card` **84**

### 4.2 PracticePanel（typing）

| 区块 | testid | 说明 |
|------|--------|------|
| 目标词/行 | `word` | 内层 `data-letter` 逐字母；`data-state="cursor"` 标记光标 |
| 发音按钮 | `speak-btn` | `aria-label`（`:185`） |
| 代码包裹 | `code-wrap` | 仅 code 模式（`:194`） |

**外层（App.tsx 渲染）**：
| 元素 | testid | 出处 |
|------|--------|------|
| 倒计时 | `countdown` | `:667`（限时模式） |
| Esc 提示 | `esc-hint` | `:745` |
| 里程碑提示 | — | `MILESTONES = [10,20,30,50,100]`（`:50`） |

### 4.3 Memorize（背单词）

| 区块 | testid | 出处 |
|------|--------|------|
| 奖牌 | `memorize-medal` | `:280` |
| 再一轮 | `memorize-again` | `:307` |
| 进度 | `memorize-progress` | `:347` |
| 卡片 | `memorize-card` | `:362` |
| 发音 | `memorize-speak`（含 `aria-label` `:383`） | `:377` |
| 翻面按钮 | `memorize-flip` | `:389` |
| 释义 | `memorize-translation` | `:405` |
| 三键 | `memorize-${b.id}`（unknown/fuzzy/known） | `:429` |
| 键位提示 | `memorize-keyhint` | `:440` |

### 4.4 ReviewPanel（复习）

| 区块 | testid | 出处 |
|------|--------|------|
| 面板根 | `review-panel` | `:67` |
| 总数 | `review-stat-total` | `:74` |
| 到期 | `review-stat-due` | `:80` |
| 开始 | `review-start-btn` | `:90` |
| 分布 | `review-dist`、`review-dist-${l}` | `:108`、`:112` |
| 列表项 | `review-item-${word}` | `:138` |
| 项详情按钮 | `review-item-detail` | `:150` |
| 项单挑按钮 | `review-item-drill` | `:158` |
| 详情容器 | `review-detail` | `:170` |
| 详情音标 | `review-detail-phonetic` | `:174` |
| 详情练习 | `review-detail-practice` | `:196` |

### 4.5 ProgressPanel（进度）

| 区块 | testid | 出处 |
|------|--------|------|
| 面板根 | `progress-panel` | `:47` |
| 热力图 | `progress-heatmap`（**14 格**） | `:53` |
| 统计区 | `progress-stats` | `:67` |
| 单条统计 | `progress-stat-${s.id}` | `:69` |
| 弱项字母区 | `progress-weak-letters` | `:84` |
| 单个字母 | `progress-weak-letter-${w.letter}` | `:90` |
| 错词区 | `progress-wrong-words` | `:103` |
| 单个错词 | `progress-wrong-word-${w.word}` | `:109` |

### 4.6 公共组件

| 组件 | testid / 属性 | 出处 |
|------|--------------|------|
| KeyMap | `keymap` + `aria-hidden="true"` | `:47` |
| Dropdown | `data-testid={testId}` + `aria-expanded={open}` | `:60`、`:61` |
| StatsBar | — | 44 行 |
| StreakBar | — | 72 行 |

---

## 5. Header 内层结构

`Header.tsx`（363 行）

| 元素 | testid | 出处 |
|------|--------|------|
| 模式项 | `mode-${m.id}` | `:115` |
| 自动发音开关 | `toggle-autospeak` | `:133` |
| 复习入口 | `menu-review` | `:150` |
| 复习角标 | `review-due-badge` | `:162` |
| 词库管理入口 | `open-bank-manager` | `:209` |
| 语言项 | `lang-${l}` | `:298` |
| 命令面板入口 | `open-cmd` | `:314` |
| 带 `aria-label` 的按钮 | `aria-label` | `:320` |

---

## 6. 导航机制（关键事实）

### 6.1 无 URL 路由

| 检查 | 结果 |
|------|------|
| 是否使用 react-router / 类似库 | ❌ 无（`package.json` 无路由依赖） |
| URL 是否会变化 | ❌ **不会**，恒为 `/` |
| 刷新后落在哪 | **home**（`App.tsx:83` 初值） |
| 能否分享"我在复习页"的链接 | ❌ 不能 |
| 能否浏览器前进/后退切页 | ❌ 不能 |
| 是否有 hash 路由 | ❌ 无 |

### 6.2 两种切换方式

| 方式 | 实现 | 证据 |
|------|------|------|
| **点击页签按钮** | `setTab(tb.id)` | `App.tsx:637` `tab-${tb.id}` |
| **命令面板跳页** | `:home` / `:typing` / `:memorize` / `:review` / `:progress` | `CommandPalette.tsx:56-71` |

### 6.3 Esc 的导航语义（重要）

`App.tsx:367-385` 在**捕获阶段**监听 Esc，规则为：

| 优先级 | 条件 | 行为 |
|-------|------|------|
| 1 | 存在已展开的下拉（`[data-testid^="dropdown-"][aria-expanded="true"]`） | **不劫持**，让下拉自己关 |
| 2 | 焦点在表单元素内 | **不劫持** |
| 3 | 其他 | 切换命令面板开/关 |

**验证**：E2E【14-2】"命令态互斥"

---

## 7. 深度与宽度

| 指标 | 值 |
|------|-----|
| 顶层视图（页签） | **5** |
| 浮层 | **2** |
| 弹窗 | **2**（StatsPanel、BankManager，另有 BankManager 与 Header 双入口） |
| 最大层级深度 | 页签 → 列表项 → 详情（**3 层**，见于 ReviewPanel：`review-item-*` → `review-item-detail` → `review-detail`） |
| 视图总数（含浮层弹窗） | **9** |

---

## 8. 信息架构的已知问题

| 编号 | 问题 | 证据 |
|------|------|------|
| IA-1 | **无 URL 路由**：刷新回 home、无法深链、无前进后退 | `App.tsx:83`；S-1 |
| IA-2 | 页签**无 aria 标注**（无 `role="tab"` / `aria-selected`） | 全仓 `aria-` 仅 12 处命中，页签不在其中 |
| IA-3 | `open-bank-manager` testid **重复**（BankManager `:78` 与 Header `:209`） | grep 结果 |
| IA-4 | 抽屉式弹窗**无焦点陷阱管理** | 见 `02-ui-ux/ACCESSIBILITY.md` |
| IA-5 | 浮层与页面**无滚动锁定**机制（未见 body overflow 控制） | — |
| IA-6 | 命令面板定位在移动端为底部固定、桌面端为居中浮层，**同一组件两套定位** | `CommandPalette.tsx:313` |

---

## 一句话结论

信息架构为 **9 个视图**（5 页签 + 2 浮层 + 2 弹窗）挂在**单一 URL `/`** 下，靠 `App.tsx:83` 的 `useState<TabId>` 切换（`TabId` 定义于 `App.tsx:44`，非既有文档所记的 `:52`）；导航仅有两类入口（页签按钮 `tab-*` 与命令面板 14 条命令），**没有 URL 路由，刷新即回首页、无法分享深链**，且页签缺少 `role="tab"` / `aria-selected` 等语义标注。
