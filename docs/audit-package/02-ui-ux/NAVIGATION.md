# 导航机制（NAVIGATION）

> 状态：✅ 已有（实测）
> 基线 commit：`4152eb2`｜实测日期：2026-09-27
> 本文描述**实际实现**的导航机制。核心事实：**本项目没有 URL 路由。**

---

## 1. 核心事实：无路由的单页切换

### 1.1 检查表

| 检查项 | 结果 | 证据 |
|--------|------|------|
| 是否有路由库依赖 | ❌ **无** | `package.json` 只有 4 个运行时依赖：`react`、`react-dom`、`lucide-react`、`canvas-confetti` |
| URL 是否会变化 | ❌ **不会**，恒为 `/` | `App.tsx:83` 用 `useState` 而非 history API |
| 是否用 hash 路由 | ❌ 无 | 全仓无 `location.hash` |
| 是否用 History API | ❌ 无 | 全仓无 `pushState`/`replaceState` |
| 刷新后落在哪 | **home** | `App.tsx:83` 初值 `'home'` |
| 浏览器前进/后退能否切页 | ❌ 不能 | 无 history 条目 |
| 能否分享"我在复习页"的链接 | ❌ 不能 | 同一 URL |
| 能否被搜索引擎分别收录各页 | ❌ 不能 | 单 URL |

### 1.2 实现

```ts
// src/App.tsx:44
export type TabId = 'home' | 'typing' | 'memorize' | 'review' | 'progress'

// src/App.tsx:83
const [tab, setTab] = useState<TabId>('home')
```

> ⚠️ **行号说明**：`docs/audit-package/03-architecture/FRONTEND_ARCHITECTURE.md` 与 `SYSTEM_ARCHITECTURE.md` 原把 `TabId` 定义行号误记为第 52 行，**实测源码为 `App.tsx:44`**；该两处已同步订正为 `:44`。本文以源码为准。

---

## 2. 导航入口（全量）

本项目共 **2 类导航入口**：

### 2.1 页签按钮（鼠标/触摸）

| # | 按钮 testid | 目标 | 出处 |
|---|------------|------|------|
| 1 | `tab-home` | 今日 | `App.tsx:637` |
| 2 | `tab-typing` | 打字练习 | 同上 |
| 3 | `tab-memorize` | 背单词 | 同上 |
| 4 | `tab-review` | 复习 | 同上 |
| 5 | `tab-progress` | 进度 | 同上 |

**渲染**：`<button data-testid={`tab-${tb.id}`}>`（`App.tsx:637`）

**验证**：E2E【16】"V3-P0a 五页签"

### 2.2 命令面板跳页（键盘）

| # | 命令 | 目标 | 出处 |
|---|------|------|------|
| 1 | `:home` | 今日 | `CommandPalette.tsx:56-71` |
| 2 | `:typing` | 打字练习 | 同上 |
| 3 | `:memorize` | 背单词 | 同上 |
| 4 | `:review` | 复习 | 同上 |
| 5 | `:progress` | 进度 | 同上 |

**验证**：E2E【11.5】`:typing`；E2E【16】`:home`、`:progress`；E2E【14-3】`:review`

### 2.3 其他间接导航（非跳页，但改变视图内容）

| 入口 | 效果 | 出处 |
|------|------|------|
| `home-review-start` | 触发复习轮次（不换页） | `HomePanel.tsx:94`；`App.tsx:248-257` |
| `home-weak-start` | 触发弱项专练（不换页） | `HomePanel.tsx:132`；`App.tsx:224-236` |
| `home-new-start` | 触发新词学习 | `HomePanel.tsx:153` |
| `review-start-btn` | 启动复习 | `ReviewPanel.tsx:90`；`App.tsx:248-257` |
| `review-item-drill` | 单挑某词（跳 typing 页） | `ReviewPanel.tsx:158` |
| `review-detail-practice` | 详情内练习 | `ReviewPanel.tsx:196` |
| `menu-review` | Header 复习入口 → review 页 | `Header.tsx:150` |
| `review-due-btn` | StatsPanel 去复习 → review 页 | `StatsPanel.tsx:99` |
| `weak-practice` | StatsPanel 弱项练习 | `StatsPanel.tsx:146` |

**注意**：`menu-review`、`review-due-btn`、`review-item-drill`、`review-detail-practice` **会改变 `tab` state**，因此也是导航入口（**但未在文档中单独标注为导航**）。

---

## 3. Esc 键的导航语义（重要机制）

`App.tsx:367-385` 在**捕获阶段（capture phase）**监听 Esc，优先级如下：

| 优先级 | 条件 | 行为 | 理由 |
|-------|------|------|------|
| **1** | 存在已展开的下拉：选择器 `[data-testid^="dropdown-"][aria-expanded="true"]` | **不劫持**，让下拉自行关闭 | 避免"关下拉"与"切命令面板"冲突 |
| **2** | 焦点在表单元素内（input/textarea 等） | **不劫持** | 不抢用户的取消/退出输入意图 |
| **3** | 其他 | **切换命令面板开/关**（`commandMode`） | 主用途 |

**为什么用捕获阶段**：命令面板内有真实 `<input>`（`command-input`），若用冒泡阶段可能被内部处理先消费；捕获阶段能先于组件判断。

**验证**：E2E【14-2】"命令态互斥"

### 3.1 Esc 的实现约束

| 约束 | 说明 |
|------|------|
| 下拉必须标 `aria-expanded` | 否则 Esc 会让位失败（选择器依赖该属性） |
| 下拉 testid 必须以 `dropdown-` 开头 | 同上（`Dropdown.tsx:60` 满足） |
| 表单元素不劫持 | 命令面板内 Esc 由 `CommandPalette` 自己处理关闭 |

---

## 4. 视图切换的渲染行为

### 4.1 条件渲染（非路由匹配）

`App.tsx` 主内容区按 `tab` 值做**唯一分支**渲染：

| `tab` | 渲染组件 | 出处 |
|-------|---------|------|
| `home` | `HomePanel` | `App.tsx` 主内容区分支 |
| `review` | `ReviewPanel` | 同上 |
| `progress` | `ProgressPanel` | 同上 |
| `memorize` | `Memorize` | 同上 |
| `typing` | `PracticePanel` | 同上 |
| else | 加载中 | 同上 |

**含义**：同一时刻**只有一个页签组件挂载**，切换即卸载/挂载。

### 4.2 后果

| 后果 | 说明 |
|------|------|
| 组件内 state 不保留 | 切走再切回，页签内临时状态丢失 |
| 滚动位置不保留 | 每页签独立，切换后回到顶部（**未逐页验证**） |
| 需要 App 层保存的状态 | 已知：`tab`、偏好、复习版本等 25 个 `useState`（`App.tsx:83-113`） |
| 无法并行渲染 | 例如不能在 typing 时保持 review 列表挂载 |

### 4.3 浮层的渲染条件（独立于 tab）

| 浮层 | 条件 | 出处 |
|------|------|------|
| `CommandPalette` | `commandMode &&` | `App.tsx` 渲染段 |
| `ResultOverlay` | `tab === 'typing' && finished` | `App.tsx` 渲染段 |

**含义**：`CommandPalette` 可覆盖任意页签；`ResultOverlay` **只在 typing 页**才可能显示（切走再切回，若 `finished` 已重置则不显示）。

---

## 5. 无路由的后果（详细）

| # | 后果 | 影响 |
|---|------|------|
| **N-1** | **刷新丢页** | 用户在 review 页刷新 → 回到 home |
| **N-2** | **无法深链** | 不能把"我在背这个包"发给别人 |
| **N-3** | **无法书签** | 收藏夹只能存首页 |
| **N-4** | **前进/后退失效** | 浏览器返回键直接离开站点 |
| **N-5** | **SEO 无法分页收录** | 5 个页签只对应 1 个 URL；`sitemap.xml` 无法列出 5 页 |
| **N-6** | **分析无法分页** | 即便将来有埋点，也无法区分页签停留（**当前无埋点，故无实际损失**） |
| **N-7** | **无法被外部链接定位** | 文档/教程无法指向具体功能页 |
| **N-8** | 与"Learning OS"定位冲突 | 见 `00-project/PRODUCT_VISION.md` |

### 5.1 `sitemap.xml` 的现状

仓库有 `public/sitemap.xml` 与 `public/robots.txt`（见 `docs/audit-package/_generated/files.txt`）。但因单 URL，站点实际只有 **1 个可收录地址**。

---

## 6. 导航相关的可访问性问题

| # | 问题 | 证据 |
|---|------|------|
| A-1 | 页签按钮**无 `role="tab"`** | 全仓 `aria-` 仅 12 处命中，页签不在其中 |
| A-2 | 页签**无 `aria-selected`** | 同上 |
| A-3 | 页签栏**无 `role="tablist"`** | 同上 |
| A-4 | 页签**无 `aria-controls`** 指向面板 | 同上 |
| A-5 | 主内容区**无 `role="tabpanel"`** | 同上 |
| A-6 | 切换页签后**无焦点管理**（焦点不移动到新面板） | 无相关代码 |
| A-7 | **无路由 = 无页面标题变化**（`document.title` 不随页签变） | 无相关代码 |
| A-8 | 浮层**无焦点陷阱** | 见 `02-ui-ux/ACCESSIBILITY.md` |

**对比**：命令面板做得较好（`role="option"` + `aria-selected`，`CommandPalette.tsx:378-379`），而**页签这一最核心的导航控件反而零语义标注**。

---

## 7. 导航机制总表

| 维度 | 现状 |
|------|------|
| 路由方式 | **无路由**（`useState` 条件渲染） |
| URL 形态 | 恒为 `/` |
| 页签数 | 5 |
| 页签定义位置 | `src/App.tsx:44` |
| 页签状态位置 | `src/App.tsx:83` |
| 页签渲染位置 | `src/App.tsx:637` |
| 页签 testid 模式 | `tab-{id}` |
| 键盘导航入口 | 命令面板 5 条跳页命令 + Esc |
| Esc 让位规则 | 3 级优先级（下拉 > 表单 > 命令面板） |
| 浮层可跨页 | `CommandPalette` 可；`ResultOverlay` 仅 typing |
| 深链 | ❌ 不支持 |
| 刷新保留页 | ❌ 不保留（回 home） |
| 前进/后退 | ❌ 不支持 |
| 页签 ARIA 语义 | ❌ 全无 |

---

## 一句话结论

本项目**没有 URL 路由**：5 个页签由 `App.tsx:44` 的 `TabId` 类型与 `App.tsx:83` 的 `useState` 驱动、在 `App.tsx:637` 以 `tab-{id}` 按钮渲染，URL **恒为 `/`**，导致**刷新回首页、无法分享深链、无法书签、浏览器前进后退失效、5 个页签无法被 SEO 分页收录**（N-1~N-8）；导航只有两类入口（页签按钮与命令面板的 5 条跳页命令），Esc 采用**捕获阶段三级让位**（下拉 `aria-expanded` > 表单元素 > 命令面板）；而最核心的页签控件**零 ARIA 语义**（无 `role="tab"`、无 `aria-selected`、无 `role="tablist"`），反倒是命令面板做到了 `role="option"` + `aria-selected`。
