# 页面规格（PAGE SPEC）

> 状态：✅ 已有（实测）
> 基线 commit：`4152eb2`｜实测日期：2026-09-27
> 本文逐页给出：**视图 id / 组件文件 / 目的 / 入口 / 数据来源 / 主要操作 / 状态处理 / 截图文件名**。
> 覆盖 **5 个页签 + 2 个浮层 + 2 个弹窗 = 9 个视图**。

---

## 0. 视图总索引

| # | 视图 | 类型 | 组件文件 | 行数 | 根 testid | 截图 |
|---|------|------|---------|------|-----------|------|
| P1 | `home` | 页签 | `HomePanel.tsx` | 161 | `home-panel` | `desktop/home.png`、`mobile/home.png`、`tablet/home.png` |
| P2 | `typing` | 页签 | `PracticePanel.tsx` | 240 | （无根 testid，用 `word`） | `desktop/typing.png`、`mobile/typing.png`、`tablet/typing.png` |
| P3 | `memorize` | 页签 | `Memorize.tsx` | 449 | （无根 testid，用 `memorize-card`） | `desktop/memorize.png`、`mobile/memorize.png`、`tablet/memorize.png` |
| P4 | `review` | 页签 | `ReviewPanel.tsx` | 212 | `review-panel` | `desktop/review.png`、`states/empty-review.png` |
| P5 | `progress` | 页签 | `ProgressPanel.tsx` | 120 | `progress-panel` | `desktop/progress.png` |
| O1 | 命令面板 | 浮层 | `CommandPalette.tsx` | 404 | `command-palette` | `states/command-palette.png`、`states/search-no-result.png` |
| O2 | 结算浮层 | 浮层 | `ResultOverlay.tsx` | 115 | `result-overlay` | `states/result-overlay.png` |
| N1 | 统计面板 | 弹窗 | `StatsPanel.tsx` | 219 | `open-stats`（入口） | — |
| N2 | 词库管理 | 弹窗 | `BankManager.tsx` | 209 | `open-bank-manager`（入口） | — |

**截图清单来源**：`docs/audit-package/screenshots/manifest.json`（103 行，17 张）

**公共组件**：
| 组件 | 文件 | 行数 | testid |
|------|------|------|--------|
| Header | `Header.tsx` | 363 | 见 §H |
| StatsBar | `StatsBar.tsx` | 44 | — |
| StreakBar | `StreakBar.tsx` | 72 | — |
| KeyMap | `KeyMap.tsx` | 84 | `keymap` + `aria-hidden="true"` |
| Dropdown | `Dropdown.tsx` | 87 | `data-testid={testId}` + `aria-expanded` |

---

## P1 —— `home`（今日 / 首页）

| 项 | 内容 |
|----|------|
| **视图 id** | `home` |
| **组件文件** | `src/components/HomePanel.tsx`（161 行） |
| **根 testid** | `home-panel`（`:45`） |
| **目的** | 一站式入口：显示今日目标完成度、连击天数，并给出三条推荐学习路径（复习 / 弱项 / 新词） |
| **入口** | ① 默认页（`App.tsx:83` 初值 `'home'`）② 页签按钮 `tab-home`（`App.tsx:637`）③ 命令 `:home`（`CommandPalette.tsx:56-71`） |
| **数据来源** | `gt.analytics.v1`（`analytics.ts`，116 行）、`gt.streak.v1`（`streak.ts`，94 行）、`gt.review.v1`（`reviewStore.ts`）、`recommend.ts`（39 行）；派生见 `App.tsx:579-596` |

### 主要操作

| 操作 | 元素 testid | 出处 |
|------|------------|------|
| 开始复习 | `home-review-start` | `:94` |
| 开始弱项专练 | `home-weak-start` | `:132` |
| 开始学新词 | `home-new-start` | `:153` |

### 内容区块

| 区块 | testid | 出处 | 说明 |
|------|--------|------|------|
| 连击 | `home-streak` | `:55` | streak 天数 |
| 今日目标 | `home-goal`、`home-goal-bar` | `:62`、`:72` | 进度条；`DAILY_GOAL = 50` |
| 复习卡 | `home-review-card` | `:82` | 到期词数 |
| 复习空态 | `home-review-empty` | `:100` | 无到期词 |
| 弱项卡 | `home-weak-card` | `:107` | 弱项词（带正确率） |
| 弱项空态 | `home-weak-empty` | `:138` | 无弱项 |
| 新词卡 | `home-new-card` | `:145` | 待学新词数 |

### 状态处理

| 状态 | 处理 |
|------|------|
| 首次访问（无数据） | 目标条 0%，各卡显示空态 |
| 有到期词 | `home-review-card` 显示数量 |
| 无到期词 | `home-review-empty` |
| 无弱项 | `home-weak-empty` |

### 验证

E2E【16】断言：`home-goal-bar` **60%**、`home-review-card`「1 个单词到期」+ abandon、`home-weak-card` q **90%**、`home-new-card` **84**、`:home` 命令

### 已知问题

| 问题 | 证据 |
|------|------|
| 今日目标 50 硬编码 | `streak.ts` `DAILY_GOAL = 50` |
| 统计口径与 review/memorize 不一致（`toLowerCase()` vs 裸 `word`） | A-4 |

### 截图

`desktop/home.png`、`mobile/home.png`、`tablet/home.png`（另 `states/offline-home.png` 为离线态同一页面）

---

## P2 —— `typing`（打字练习）

| 项 | 内容 |
|----|------|
| **视图 id** | `typing` |
| **组件文件** | `src/components/PracticePanel.tsx`（240 行） |
| **根 testid** | **无**（用 `word` 定位目标词） |
| **目的** | 逐字母敲出目标单词/代码行，实时纠错，完成后结算 |
| **入口** | ① 页签 `tab-typing` ② 命令 `:typing` ③ 复习详情内 `review-detail-practice` ④ 弱项专练（`weak-practice`）⑤ 单挑（`review-item-drill`） |
| **数据来源** | `bankWords` effect（`App.tsx:151-171`，含 lazy 动态 import）→ `buildQueue`（`:189-202`） |

### 主要操作

| 操作 | 元素 testid | 出处 |
|------|------------|------|
| 敲字母 | `word` 内 `data-letter` | `PracticePanel.tsx:35` |
| 看光标 | `data-state="cursor"` | 同上 |
| 发音 | `speak-btn` + `aria-label` | `:182`、`:185` |
| 代码模式包裹 | `code-wrap` | `:194` |

### 页面级附加元素（由 `App.tsx` 渲染）

| 元素 | testid | 出处 | 条件 |
|------|--------|------|------|
| 倒计时 | `countdown` | `:667` | 仅 `timed` 模式 |
| Esc 提示 | `esc-hint` | `:745` | 常驻 |
| 里程碑提示 | — | `:50` | `MILESTONES = [10,20,30,50,100]` |
| StatsBar | — | `StatsBar.tsx` | 常驻 |
| KeyMap | `keymap` | `KeyMap.tsx:47` | 常驻 |
| 加载中 | — | `App.tsx` 分支 else | lazy 词库加载时 |

### 状态处理

| 状态 | 处理 |
|------|------|
| 词库加载中 | 显示"加载中"分支（`App.tsx` 主内容区 else 分支） |
| 敲对 | 字母变色（`correct` 槽） |
| 敲错 | 抖动（`shake` 动画）+ 拦截 |
| 整词完成 | `lockRef` + `settleReview` + 220ms 后 `advance` |
| 20 词完成 | 弹 `ResultOverlay` |
| 限时归零 | 自动 `finishRound`（`App.tsx:334-336`） |
| 释义为空 | **静默显示空字符串**（`App.tsx:253` 的 `map.get(w) ?? { word: w, translation: '' }`） |

### 交互细节

| 项 | 实现 |
|----|------|
| 严格纠错 | `target.startsWith(next)`（`App.tsx:411-568`） |
| code 模式大小写敏感 | `target` 不做 lower（`:388-397`） |
| spell 模式可 Backspace | `App.tsx:432-438` |
| 换词自动发音 | `App.tsx:401-409`（code 模式禁用） |
| 命令态让位 | `App.tsx:411-568` 首段判断 |
| 非 typing 页签让位 | 同上 |

### 验证

E2E【1】【2】【4】【6】【7】【8】【13-1】【15】

### 截图

`desktop/typing.png`、`mobile/typing.png`、`tablet/typing.png`

---

## P3 —— `memorize`（背单词）

| 项 | 内容 |
|----|------|
| **视图 id** | `memorize` |
| **组件文件** | `src/components/Memorize.tsx`（**449 行**，组件中第二长） |
| **根 testid** | **无**（用 `memorize-card` 定位） |
| **目的** | 卡片式背记：正面单词 + 发音，翻面看释义，用不认识/模糊/认识三键调度复习次数 |
| **入口** | ① 页签 `tab-memorize` ② 命令 `:memorize` |
| **数据来源** | `gt.memorize.v1`（`memorizeStore.ts`，72 行）；`DAILY_NEW = 20`（`:34`） |

### 主要操作

| 操作 | 元素 testid | 出处 |
|------|------------|------|
| 发音 | `memorize-speak`（`aria-label` `:383`） | `:377` |
| 翻面 | `memorize-flip` | `:389` |
| 不认识 | `memorize-unknown`（`memorize-${b.id}`） | `:429` |
| 模糊 | `memorize-fuzzy` | `:429` |
| 认识 | `memorize-known` | `:429` |
| 再一轮 | `memorize-again` | `:307` |

### 内容区块

| 区块 | testid | 出处 |
|------|--------|------|
| 奖牌 | `memorize-medal` | `:280` |
| 进度 | `memorize-progress` | `:347` |
| 卡片 | `memorize-card` | `:362` |
| 释义 | `memorize-translation` | `:405` |
| 键位提示 | `memorize-keyhint` | `:440` |

### 状态处理

| 状态 | 处理 |
|------|------|
| 正面 | 单词 + 音标 + 发音按钮 |
| 翻面 | `memorize-translation` 显示释义 |
| unknown | 该词**追加 2 次**；计入错题 |
| fuzzy | 该词**追加 1 次** |
| known | 该词完成出队 |
| 全部完成 | `memorize-medal` + `memorize-again` + 彩带（`celebrate([theme.accentHex])` `:140-143`） |
| 释义为空 | **无提示**（空字符串） |

### 手势（移动端）

| 手势 | 条件 | 行为 |
|------|------|------|
| 点击 | 未翻面 | 翻面 |
| 上滑 | 未翻面 | 翻面 |
| 左滑 | 已翻面 | unknown |
| 右滑 | 已翻面 | known |
| 上滑 | 已翻面 | fuzzy |
| 下滑 | 任意 | 回弹 |
| 左右滑 | 未翻面 | 回弹 |

**实现**：`Memorize.tsx:145-258`，原生 `touchstart`/`touchmove`/`touchend`
- `SWIPE_THRESHOLD = 60`（`:37`）
- `coarsePointer` = `matchMedia('(pointer: coarse)')`（`:164`）
- `isTouch` = `navigator.maxTouchPoints > 0`
- `touchHandledAt` 屏蔽合成 click
- `answerRef` 取最新 `answer`
- `touchmove` 跟手 `translate` + ≤12deg `rotate`
- 监听选项：start `{passive: true}`、move `{passive: false}`

### 键盘流（桌面）

`Memorize.tsx:101-138`：**Space** 翻面（`preventDefault`）、**1/2/3** 打分、**K** 重读、done 时 **Enter** 重来

### 验证

E2E【9】【11.6】【14-2】

### 截图

`desktop/memorize.png`、`mobile/memorize.png`、`tablet/memorize.png`、`states/memorize-flipped.png`

---

## P4 —— `review`（复习）

| 项 | 内容 |
|----|------|
| **视图 id** | `review` |
| **组件文件** | `src/components/ReviewPanel.tsx`（212 行） |
| **根 testid** | `review-panel`（`:67`） |
| **目的** | 展示 SRS 队列：总数 / 到期 / 等级分布 / 词列表 / 详情 / 直接练习 |
| **入口** | ① 页签 `tab-review` ② 命令 `:review` ③ Header `menu-review` ④ 首页 `home-review-start` |
| **数据来源** | `gt.review.v1`（`reviewStore.ts`，176 行）；`App.tsx:174-183` 的 `reviewDue`/`reviewTotal` |

### 主要操作

| 操作 | 元素 testid | 出处 |
|------|------------|------|
| 开始复习 | `review-start-btn` | `:90` |
| 打开词详情 | `review-item-detail` | `:150` |
| 单挑该词 | `review-item-drill` | `:158` |
| 详情内练习 | `review-detail-practice` | `:196` |

### 内容区块

| 区块 | testid | 出处 |
|------|--------|------|
| 总数 | `review-stat-total` | `:74` |
| 到期 | `review-stat-due` | `:80` |
| 等级分布 | `review-dist`、`review-dist-${l}` | `:108`、`:112` |
| 词列表项 | `review-item-${word}` | `:138` |
| 详情容器 | `review-detail` | `:170` |
| 详情音标 | `review-detail-phonetic` | `:174` |

### 状态处理

| 状态 | 处理 | 截图 |
|------|------|------|
| 空队列 | 空态 | `states/empty-review.png` |
| 有到期词 | 列表 + 开始按钮 | `desktop/review.png` |
| 详情展开 | `review-detail` 显示 | — |
| 词无音标 | 静默不显示（`ReviewPanel.tsx:47` 空释义兜底） | — |

### 验证

E2E【14-3】【14-4】【14-5】【16】

### 截图

`desktop/review.png`、`states/empty-review.png`

---

## P5 —— `progress`（进度）

| 项 | 内容 |
|----|------|
| **视图 id** | `progress` |
| **组件文件** | `src/components/ProgressPanel.tsx`（120 行） |
| **根 testid** | `progress-panel`（`:47`） |
| **目的** | 展示学习统计：热力图、统计卡、弱项字母、错词列表 |
| **入口** | ① 页签 `tab-progress` ② 命令 `:progress` |
| **数据来源** | `gt.analytics.v1`（`analytics.ts`，116 行）、`gt.streak.v1`（`streak.ts`，94 行）、`mastery.ts`（33 行） |

### 内容区块

| 区块 | testid | 出处 | 说明 |
|------|--------|------|------|
| 热力图 | `progress-heatmap` | `:53` | **14 格** |
| 统计区 | `progress-stats` | `:67` | — |
| 单条统计 | `progress-stat-${s.id}` | `:69` | — |
| 弱项字母区 | `progress-weak-letters` | `:84` | — |
| 单个字母 | `progress-weak-letter-${w.letter}` | `:90` | — |
| 错词区 | `progress-wrong-words` | `:103` | — |
| 单个错词 | `progress-wrong-word-${w.word}` | `:109` | — |

### 状态处理

| 状态 | 处理 |
|------|------|
| 无数据 | 热力图全空、统计为 0 |
| 有数据 | 按 14 天窗口渲染 |
| 掌握度徽章 | E2E【16】断言 `struggling` + `strong` |

### 验证

E2E【8.5】【16】

### 截图

`desktop/progress.png`

### 已知问题

| 问题 | 证据 |
|------|------|
| 热力图仅 **14 格**，无月/年视图 | `:53` |
| 无导出/备份入口 | 无相关代码 |
| analytics 键用 `toLowerCase()`，与 review/memorize 不一致 | A-4 |

---

## O1 —— 命令面板（CommandPalette）

| 项 | 内容 |
|----|------|
| **视图 id** | 浮层（无 tab id） |
| **组件文件** | `src/components/CommandPalette.tsx`（**404 行**） |
| **根 testid** | `command-palette`（`:313`） |
| **目的** | 键盘驱动的全局命令入口（类 Raycast） |
| **入口** | ① **Esc**（全局捕获，`App.tsx:367-385`）② Header `open-cmd`（`:314`） |
| **数据来源** | 14 条命令注册表（`:56-71`）；不查内容（**注意**） |

### 结构

| 元素 | testid / 属性 | 出处 |
|------|--------------|------|
| 容器 | `command-palette` | `:313` |
| 输入框 | `command-input` | `:332` |
| 候选列表 | `command-list`（`max-h-56` 滚动） | `:370` |
| 候选项 | `command-item-${c.name}` | `:376` |
| 选中态 | `aria-selected` + `role="option"` | `:378-379` |
| 提示 | `command-notice` / `command-error` | `:318` |
| 光标色 | `caretColor: theme.accentHex` | `:398` |

### 定位（响应式）

```
fixed bottom-0 ... sm:bottom-6 sm:left-1/2 sm:-translate-x-1/2 sm:max-w-xl
```

移动端底部贴边，桌面端居中浮层。

### 主要操作

| 操作 | 行为 |
|------|------|
| 输入 `:` | 列出候选命令 |
| ↑ / ↓ | 移动选中项 |
| **Tab** | 补全 |
| **Enter** | 执行；**带参命令只补全，不误执行**（文件头注释） |
| Esc | 关闭 |

### 14 条命令

`review` / `bank`(参) / `mode`(参) / `voice`(参) / `theme`(参) / `sound`(参) / `soundtheme`(参) / `shuffle`(参) / `memorize` / `typing` / `home` / `progress` / `q` / `help`

### 匹配算法

子串命中 + 前缀优先（文件头注释）；验证 E2E【14-1】`:t`、`:vo`

### 状态处理

| 状态 | 处理 | 截图 |
|------|------|------|
| 无匹配 | 空态 | `states/search-no-result.png` |
| 非法命令 | `command-error`（E2E【11.5】`:nope`） | — |
| 普通提示 | `command-notice` | — |
| 命令态互斥 | 有下拉展开时 Esc 不劫持（`App.tsx:374`） | — |

### 移动端细节

输入框 `text-base sm:text-sm` → 移动端字号 ≥16px，防止聚焦缩放（E2E【14-2】有断言）

### 双语 HELP

`:73-96`，zh / en 各 **12 行**

### 关键限制（重要）

| 限制 | 说明 |
|------|------|
| **只搜命令，不搜内容** | `Query.search()`（`content-query.ts:260`）已实现但**无 UI 调用方** |
| 无命令历史 | ↑↓ 已用于移动候选 |
| 无自定义命令 | — |

### 验证

E2E【11.5】【13-1】【14-1】

### 截图

`states/command-palette.png`、`states/search-no-result.png`

---

## O2 —— 结算浮层（ResultOverlay）

| 项 | 内容 |
|----|------|
| **视图 id** | 浮层（无 tab id） |
| **组件文件** | `src/components/ResultOverlay.tsx`（115 行） |
| **根 testid** | `result-overlay`（**`:55`**，本轮审计新增） |
| **目的** | 一轮打字结束后展示成绩 |
| **入口** | `tab === 'typing' && finished`（`App.tsx` 渲染条件） |
| **数据来源** | `App.tsx:579-596` 派生：`accuracy` / `minutes` / `wpm` / `percent` |

### 触发条件

| 触发 | 证据 |
|------|------|
| 20 词敲完 | `CHAPTER_SIZE = 20`（`App.tsx:47`）；E2E【8】 |
| 限时归零 | `App.tsx:334-336` |

### 展示内容

| 项 | 来源 |
|----|------|
| 完成文案（「本轮完成」） | E2E【8】断言 |
| WPM | `App.tsx:579-596` |
| 准确率 | 同上 |
| 用时 | 同上 |
| 彩带 | `confetti.ts`（两侧喷射 + 420ms 后中间一发） |

### 状态处理

| 状态 | 处理 |
|------|------|
| 关闭 | 点浮层或按 Enter 重开 |
| reduced-motion | 彩带**自动禁用**（`confetti.ts:15`/`:25`） |

### 验证

E2E【8】

### 截图

`states/result-overlay.png`

---

## N1 —— 统计面板（StatsPanel）

| 项 | 内容 |
|----|------|
| **视图 id** | 弹窗 |
| **组件文件** | `src/components/StatsPanel.tsx`（219 行） |
| **入口 testid** | `open-stats`（`:47`，Header 中的按钮） |
| **带 `aria-label` 按钮** | `:61` |
| **目的** | 快速查看复习统计与弱项练习入口 |
| **数据来源** | `gt.review.v1`、`gt.analytics.v1` |

### 内容区块

| 区块 | testid | 出处 |
|------|--------|------|
| 复习统计 | `review-stats` | `:82` |
| 总数 | `review-total` | `:87` |
| 到期 | `review-due` | `:93` |
| 去复习按钮 | `review-due-btn` | `:99` |
| 弱项练习 | `weak-practice` | `:146` |

### 验证

E2E【14-3】注入到期词后断言 `review-total=1`、`review-due=1`

### 状态处理

| 状态 | 处理 |
|------|------|
| 无到期 | 显示 0 |
| 弱项专练 | 点击触发 `App.tsx:224-236` `startWeakRound` |

### 截图

无独立截图

---

## N2 —— 词库管理（BankManager）

| 项 | 内容 |
|----|------|
| **视图 id** | 弹窗 |
| **组件文件** | `src/components/BankManager.tsx`（209 行） |
| **入口 testid** | `open-bank-manager`（`:78`，但 **Header 也有同名 `:209`**） |
| **带 `aria-label` 按钮** | `:92`、`:181` |
| **目的** | 用纯文本粘贴自定义词库 |
| **数据来源** | `gt.customBanks.v1`（`customBanks.ts`，92 行） |

### 主要操作

| 操作 | 元素 testid | 出处 |
|------|------------|------|
| 粘贴文本 | `bank-textarea` | `:106` |
| 导入 | `import-bank` | `:118` |

### 状态处理

| 状态 | 处理 |
|------|------|
| 空输入 | 导入无效 |
| 导入成功 | 写入 `gt.customBanks.v1` |
| 合并影响 | `App.tsx:125-137` 合并进 `banks`（`useMemo`） |
| 切换词库 | `App.tsx:140-142` 刷新 customBanks |

### 关键限制（重要）

| 限制 | 说明 |
|------|------|
| **只支持纯文本** | 无 CSV / JSON / `.apkg` 解析 |
| **不进 Content 链** | 无 `ContentId`；`custom-<base36>` namespace **未定义** |
| 无字段映射 | — |
| 无去重 | `validate.mjs:172-176` 只做**包内**去重 |
| 无法编辑/删除单条 | 只能整库操作 |

### 已知问题

| 问题 | 证据 |
|------|------|
| `open-bank-manager` testid **重复**（`:78` 与 `Header.tsx:209`） | grep 结果 |

### 截图

无独立截图

---

## H —— Header（顶栏，跨视图常驻）

| 项 | 内容 |
|----|------|
| **组件文件** | `src/components/Header.tsx`（**363 行**） |
| **目的** | 品牌、模式、词库、自动发音、复习入口、词库管理、语言、统计、命令入口 |

| 元素 | testid | 出处 |
|------|--------|------|
| 模式项 | `mode-${m.id}` | `:115` |
| 自动发音开关 | `toggle-autospeak` | `:133` |
| 复习入口 | `menu-review` | `:150` |
| 复习角标 | `review-due-badge` | `:162` |
| 词库管理 | `open-bank-manager` | `:209` |
| 语言项 | `lang-${l}` | `:298` |
| 命令面板 | `open-cmd` | `:314` |
| aria-label 按钮 | `aria-label` | `:320` |

**Props 列表长**（`App.tsx:600-620`）：Header 接收约 20 个 props → 组件耦合度高。

---

## 跨视图：全局元素

| 元素 | testid | 出处 |
|------|--------|------|
| 页签按钮 | `tab-${tb.id}` | `App.tsx:637` |
| 倒计时 | `countdown` | `App.tsx:667` |
| Esc 提示 | `esc-hint` | `App.tsx:745` |
| 快捷键提示 | `keymap` + `aria-hidden="true"` | `KeyMap.tsx:47` |
| 下拉 | `data-testid` + `aria-expanded` | `Dropdown.tsx:60`/`:61` |

---

## 页面规格的横向对照表

| 视图 | 有根 testid | 有 aria 标注 | 有截图 | 有加载态 | 有错误态 | 有空态 |
|------|-----------|-------------|-------|---------|---------|-------|
| P1 home | ✅ `home-panel` | ❌ | ✅ ×4 | ❌ | ❌ | ✅ |
| P2 typing | ❌ | ❌ | ✅ ×3 | ✅ | ❌ | ❌ |
| P3 memorize | ❌ | ⚠️ 1 处 `aria-label` | ✅ ×4 | ❌ | ❌ | 🔄 奖牌态 |
| P4 review | ✅ `review-panel` | ❌ | ✅ ×2 | ❌ | ❌ | ✅ |
| P5 progress | ✅ `progress-panel` | ❌ | ✅ ×1 | ❌ | ❌ | 🔄 零值态 |
| O1 command | ✅ `command-palette` | ✅ `role="option"` + `aria-selected` | ✅ ×2 | ❌ | ✅ `command-error` | ✅ |
| O2 result | ✅ `result-overlay` | ❌ | ✅ ×1 | ❌ | ❌ | — |
| N1 stats | ⚠️ 入口有 testid | ⚠️ 1 处 `aria-label` | ❌ | ❌ | ❌ | 🔄 |
| N2 bank | ⚠️ 入口 testid 重复 | ⚠️ 2 处 `aria-label` | ❌ | ❌ | ❌ | ❌ |

### 横向问题

| # | 问题 |
|---|------|
| 1 | **2/9 视图无根 testid**（typing、memorize），E2E 只能靠内部元素定位 |
| 2 | **无任何视图有错误态**（无 ErrorBoundary） |
| 3 | **仅 O1 有完整的 ARIA 语义**（`role` + `aria-selected`） |
| 4 | **N1/N2 无独立截图**（审计证据不完整） |
| 5 | 加载态只在 typing 页有（lazy 词库） |

---

## 一句话结论

9 个视图（5 页签 + 2 浮层 + 2 弹窗）的规格已全部落定并有 `data-testid` 锚点：页签为 `home`/`typing`/`memorize`/`review`/`progress`（`App.tsx:44`/`:637`），浮层为 `command-palette`（404 行，14 条命令）与 `result-overlay`（115 行，`:55` 为本轮新增 testid），弹窗为 StatsPanel（219 行）与 BankManager（209 行）；横向对照暴露出四处结构性问题——**typing/memorize 无根 testid**、**9 个视图全部无错误态**（无 ErrorBoundary）、**仅命令面板有 `role`/`aria-selected` 语义**、**StatsPanel/BankManager 无独立审计截图**。
