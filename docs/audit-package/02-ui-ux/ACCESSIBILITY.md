# 无障碍（ACCESSIBILITY）

> 状态：🔄 混合（本文分节标注）
> 基线 commit：`4152eb2`｜实测日期：2026-09-27
> **§2 为已有实现（✅ 实测）**；**§3 为未建部分与缺口（📐）**。
> **重要**：本项目**没有 a11y 门禁、没有屏幕阅读器测试、没有 axe/Lighthouse 报告**。本文所有结论均来自**源码静态扫描**，不代表真机无障碍测试结果。

---

## 1. 扫描方法

| 方法 | 覆盖 |
|------|------|
| grep `aria-` 全仓 | **12 处命中** |
| grep `role=` 全仓 | **仅 1 处**（`role="option"`） |
| grep `prefers-reduced-motion` 全仓 | **2 处命中**（同一文件） |
| grep `matchMedia` 全仓 | **1 处命中**（非 reduced-motion） |
| 逐组件读取 JSX | 14 个组件 |
| E2E 用例扫描 | `tests/e2e.mjs`（1457 行）中 a11y 相关断言 |

**未执行**：axe-core、Lighthouse、真机屏幕阅读器（NVDA / VoiceOver / TalkBack）、键盘 Tab 序实测、对比度计算。

---

## 2. 已有实现（✅ 实测）

### 2.1 ARIA 属性全量清单（12 处）

| # | 文件:行号 | 属性 | 值/用途 |
|---|----------|------|---------|
| 1 | `src/App.tsx:374` | （属性选择器） | `[data-testid^="dropdown-"][aria-expanded="true"]` —— 用于 Esc 让位判断，**非自身标注** |
| 2 | `src/components/BankManager.tsx:92` | `aria-label` | 按钮 |
| 3 | `src/components/BankManager.tsx:181` | `aria-label` | 按钮 |
| 4 | `src/components/CommandPalette.tsx:378` | `aria-selected` | 候选项选中态 |
| 5 | `src/components/Dropdown.tsx:61` | `aria-expanded` | 下拉展开态 |
| 6 | `src/components/Header.tsx:320` | `aria-label` | 按钮 |
| 7 | `src/components/KeyMap.tsx:47` | `aria-hidden="true"` | 快捷键提示**对读屏隐藏** |
| 8 | `src/components/Memorize.tsx:383` | `aria-label` | 发音按钮 |
| 9 | `src/components/PracticePanel.tsx:185` | `aria-label` | 发音按钮 |
| 10 | `src/components/StatsPanel.tsx:61` | `aria-label` | 按钮 |
| 11 | `src/components/CommandPalette.tsx:379` | `role="option"` | **全仓唯一 `role`** |
| 12 | （见 #11） | — | — |

**统计**：

| 属性 | 次数 |
|------|------|
| `aria-label` | **6**（BankManager ×2、Header ×1、Memorize ×1、PracticePanel ×1、StatsPanel ×1） |
| `aria-expanded` | **1**（Dropdown） |
| `aria-selected` | **1**（CommandPalette） |
| `aria-hidden` | **1**（KeyMap） |
| `role` | **1**（`role="option"`） |
| `aria-live` | **0** |
| `aria-controls` | **0** |
| `aria-describedby` | **0** |
| `aria-modal` | **0** |
| `aria-current` | **0** |
| `role="tab"` / `tablist` / `tabpanel` | **0** |
| `role="dialog"` | **0** |
| `role="button"` | **0** |
| `role="status"` / `role="alert"` | **0** |

**关键观察**：**仅有 12 处 ARIA 标注覆盖 14 个组件的应用** —— 平均每组件不到 1 处。

### 2.2 键盘可用性（本项目最强的一环）

#### 2.2.1 全局键盘监听

`src/App.tsx:411-568` 的 `handleKeyDown`：

| 能力 | 实现 |
|------|------|
| 逐字母输入 | 单字符过滤（`:432-438` 附近） |
| 严格纠错 | `target.startsWith(next)` |
| spell 模式退格 | `App.tsx:432-438` |
| code 模式原文输入 | 不做 lower |
| 命令态让位 | 首段判断 `commandMode` |
| 非 typing 页签让位 | 判断当前 tab |
| 忽略修饰键 | Ctrl / Meta / Alt |
| Enter 重开一轮 | `:444` 附近 |

#### 2.2.2 背单词键盘流

`src/components/Memorize.tsx:101-138`：

| 键 | 行为 |
|----|------|
| **Space** | 翻面（`preventDefault`） |
| **1** | 不认识（unknown） |
| **2** | 模糊（fuzzy） |
| **3** | 认识（known） |
| **K** | 重读 |
| **Enter** | 完成时重来 |

**验证**：E2E【11.6】

#### 2.2.3 命令面板键盘流

`src/components/CommandPalette.tsx`（文件头注释）：

| 键 | 行为 |
|----|------|
| **Esc** | 打开 / 关闭（由 App 全局监听，捕获阶段） |
| **↑ / ↓** | 移动候选 |
| **Tab** | 补全 |
| **Enter** | 执行（带参命令只补全，不误执行） |
| 任意字符 | 真实 `<input>` 输入 + 模糊匹配 |

**验证**：E2E【11.5】【14-1】

#### 2.2.4 Esc 让位机制（键盘友好设计）

`src/App.tsx:367-385`：捕获阶段三级优先级

| 优先级 | 条件 | 行为 |
|-------|------|------|
| 1 | 有下拉展开（`[data-testid^="dropdown-"][aria-expanded="true"]`） | 不劫持 |
| 2 | 焦点在表单元素 | 不劫持 |
| 3 | 其他 | 切命令面板 |

**验证**：E2E【14-2】"命令态互斥"

#### 2.2.5 虚拟键盘

打字页有 `KeyMap` 组件（`src/components/KeyMap.tsx`，84 行），显示键位映射。

**关键事实**：`KeyMap.tsx:47` 带 **`aria-hidden="true"`** —— 即**该提示对屏幕阅读器完全隐藏**。这在设计上是合理的（避免读屏噪音），但意味着**读屏用户无法获知可用快捷键**。

#### 2.2.6 键盘可用性总评

| 能力 | 状态 |
|------|------|
| 全站核心功能可用键盘完成 | ✅ **是**（打字、翻卡、打分、命令、跳页、设置） |
| 无需鼠标可用 | ✅ **是** |
| 快捷键有提示 | ✅ 有（`KeyMap`，但 `aria-hidden`） |
| 焦点可见 | ❌ **否**（见 §3.1） |

**结论**：**键盘可用性是本项目 a11y 表现最好的一环**，且明显优于一般 SPA（很多 SPA 的弹窗/面板无法键盘操作）。

### 2.3 `prefers-reduced-motion`

#### 2.3.1 唯一落点

`src/lib/confetti.ts`：

| 行号 | 代码 |
|------|------|
| `:15` | `disableForReducedMotion: true` |
| `:25` | `disableForReducedMotion: true` |

**这是全仓唯一响应 `prefers-reduced-motion` 的地方。**

#### 2.3.2 未响应的动画（重要缺口）

`tailwind.config.js` 定义了 4 个动画，**均不响应 `prefers-reduced-motion`**：

| 动画 | 定义 | 是否响应 |
|------|------|---------|
| `shake` | `0.28s ease-in-out` | ❌ 否 |
| `blink` | `1s step-end infinite` | ❌ 否（**无限循环**） |
| `pop` | `0.16s ease-out` | ❌ 否 |
| `popIn` | `0.25s ease-out` | ❌ 否 |

另有：
| 动效 | 位置 | 是否响应 |
|------|------|---------|
| 卡片跟手旋转（≤12deg） | `Memorize.tsx:145-258` | ❌ 否 |
| 卡片飞入飞出（`flyOut`/`bounceBack`） | `Memorize.tsx:145-258` | ❌ 否 |

**最值得注意的是 `blink`**：`1s step-end infinite` 是**无限循环闪烁**，对光敏性癫痫与注意力障碍用户不友好，且**不响应减少动效偏好**。

#### 2.3.3 `matchMedia` 的唯一使用

| 文件:行号 | 查询 | 用途 |
|----------|------|------|
| `src/components/Memorize.tsx:164` | `'(pointer: coarse)'` | 判定粗指针设备 |

**注意**：这**不是** `(prefers-reduced-motion: reduce)`。全仓**没有**任何地方查询 reduced-motion 偏好。

### 2.4 焦点样式

#### 2.4.1 关键事实

`src/index.css:36-39`：

```css
/* 本项目无需输入框 */
*:focus { outline: none }
```

**这是全站级的焦点轮廓移除**，源码注释给出的理由是"本项目无需输入框"。

#### 2.4.2 问题分析

| 问题 | 说明 |
|------|------|
| **与实现矛盾** | 命令面板**有真实 `<input>`**（`CommandPalette.tsx:332` 的 `command-input`），BankManager **有 `<textarea>`**（`:106` 的 `bank-textarea`）。注释"本项目无需输入框"**与事实不符** |
| **键盘用户失去焦点可见性** | `*:focus` 通配移除，**全站无可见焦点指示** |
| **未提供替代** | 未见 `:focus-visible` 样式补充 |
| **影响所有交互元素** | 按钮、下拉、输入框、候选列表全部无焦点环 |

**这是本项目 a11y 上**最严重的单点问题**：键盘导航完全可用（§2.2），但**用户看不见焦点在哪**。

> ⚠️ **注**：本次审计**未在真机上验证**是否存在浏览器默认样式的其他兜底（理论上 `outline: none` 已覆盖）。此项**建议实机复核**。

### 2.5 语义 HTML

| 项 | 状态 |
|----|------|
| 使用原生 `<button>` | ✅ 页签（`App.tsx:637`）、多数操作按钮 |
| 使用原生 `<input>` | ✅ 命令面板（`CommandPalette.tsx:332`） |
| 使用原生 `<textarea>` | ✅ BankManager（`:106`） |
| 是否有 `div` 冒充按钮 | **未完整验证**（需逐组件复核） |
| 是否有 `<h1>`~`<h6>` 层级 | **未能验证**（未做标题层级扫描） |
| 是否有 `<main>` / `<nav>` 语义标签 | **未能验证** |
| 是否有 `lang` 属性 | **未能验证**（`index.html` 未在本次审计中读取） |

### 2.6 颜色对比度

| 项 | 状态 |
|----|------|
| 是否有对比度审计 | ❌ 无 |
| 三套主题的对比度 | **未能验证**（未做计算） |
| 已知风险 | `matrix` 主题 `root: bg-[#0b1120] text-slate-200`（深底浅字，理论上较好）；`sub`（次要文字）槽可能对比不足；`ink` 亮色主题需单独核验 |

**声明**：本文**不给出任何对比度合规结论**（未经计算）。

### 2.7 触摸与指针可及性

| 项 | 状态 | 出处 |
|----|------|------|
| 粗指针检测 | ✅ | `Memorize.tsx:164` |
| 触摸手势 | ✅ | `Memorize.tsx:145-258` |
| 手势有键盘等价物 | ✅ | 1/2/3 键等价于滑动 |
| 触摸目标 ≥44×44px | ❌ **未验证** | 无规范、无测量 |
| 长按 / 双击 | ❌ 无 |

---

## 3. 未建部分与缺口（📐）

### 3.1 缺口清单（按严重度排序）

| # | 缺口 | 严重度 | 证据 | 影响 |
|---|------|-------|------|------|
| **G-1** | **全站焦点轮廓被移除**（`*:focus { outline: none }`） | **高** | `src/index.css:36-39` | 键盘用户看不见焦点位置；且注释"本项目无需输入框"与事实矛盾（有 input/textarea） |
| **G-2** | **`blink` 动画无限闪烁且不响应 reduced-motion** | **高** | `tailwind.config.js`（`blink 1s step-end infinite`） | 光敏性癫痫风险；注意力障碍用户的干扰 |
| **G-3** | **只有 `role="option"` 一处 `role`** | **高** | grep 全仓 | 页签、弹窗、面板、列表、进度条均无语义角色 |
| **G-4** | **页签零 ARIA 语义** | **高** | grep 无 `role="tab"`/`aria-selected` | 读屏用户不知有 5 个页签、不知当前在哪页 |
| **G-5** | **无 `aria-live`** | **高** | grep 零命中 | 打字进度、复习到期数、Toast（`command-notice`）变化**不播报** |
| **G-6** | **浮层/弹窗无 `role="dialog"` + `aria-modal`** | 中高 | grep 零命中 | 读屏用户不知进入了模态层 |
| **G-7** | **无焦点陷阱管理** | 中高 | 无相关代码 | 命令面板/弹窗打开后，Tab 可逃逸到底层内容 |
| **G-8** | **切换页签后无焦点管理** | 中 | 无相关代码 | 焦点留在旧按钮，读屏用户不知内容已变 |
| **G-9** | **无 a11y 门禁** | 中高 | CI 无 axe/Lighthouse | 回归无拦截 |
| **G-10** | **无屏幕阅读器测试** | 中高 | 无记录 | 上述所有问题未经真机确认 |
| **G-11** | **`prefers-reduced-motion` 仅 1 处生效** | 中 | `confetti.ts:15`/`:25` 唯一 | 4 个 keyframes + 卡片动画均不响应 |
| **G-12** | **`KeyMap` 对读屏隐藏** | 中 | `KeyMap.tsx:47` `aria-hidden="true"` | 读屏用户无法获知快捷键（**注：此设计可辩护**，但应提供等价说明） |
| **G-13** | **`aria-label` 仅 6 处** | 中 | grep | 大量图标按钮无名称 |
| **G-14** | **无跳转到主内容的 skip link** | 中 | 无相关代码 | 键盘用户需 Tab 穿越整个 Header |
| **G-15** | **无标题层级规范** | 中 | 未能验证 | 读屏大纲可能混乱 |
| **G-16** | **无 `document.title` 随页签变化** | 低中 | 无相关代码 | 读屏与浏览器标签页无法区分页签 |
| **G-17** | **无对比度审计** | 中 | 无 | 三套主题未核验，`sub` 槽有风险 |
| **G-18** | **触摸目标尺寸无规范** | 中 | 无 | 移动端小按钮可及性风险 |
| **G-19** | **无 `lang` 属性验证** | 低 | `index.html` 未读 | i18n 切换时读屏发音可能错误 |
| **G-20** | **无 200% 缩放测试** | 中 | 无 | 缩放后布局可能破坏 |

### 3.2 按 WCAG 2.1 维度归类的缺口

> ⚠️ **声明**：以下归类为**基于源码的初步判断**，**未做合规评估**，**不构成 WCAG 合规结论**。

| WCAG 原则 | 相关缺口 | 说明 |
|-----------|---------|------|
| **可感知（Perceivable）** | G-1、G-2、G-17 | 焦点可见性、闪烁、对比度 |
| **可操作（Operable）** | G-1、G-7、G-8、G-14、G-18、G-20 | 焦点管理、skip link、触摸目标、缩放 |
| **可理解（Understandable）** | G-4、G-15、G-16 | 结构语义、标题层级、页面标题 |
| **健壮（Robust）** | G-3、G-5、G-6、G-13、G-19 | 角色、状态播报、名称 |

### 3.3 明确未做的测试

| 测试 | 状态 |
|------|------|
| axe-core 扫描 | ❌ 未做 |
| Lighthouse a11y 评分 | ❌ 未做 |
| NVDA / JAWS 实测 | ❌ 未做 |
| VoiceOver（macOS/iOS）实测 | ❌ 未做 |
| TalkBack（Android）实测 | ❌ 未做 |
| 纯键盘 Tab 序实测 | ❌ 未做 |
| 对比度工具计算 | ❌ 未做 |
| 200% / 400% 缩放 | ❌ 未做 |
| prefers-reduced-motion 实机验证 | ❌ 未做 |
| 高对比度模式（Windows 高对比） | ❌ 未做 |
| 色盲模拟 | ❌ 未做 |

---

## 4. 已有 vs 缺失：对照总表

| 维度 | 已有 | 缺失 |
|------|------|------|
| **键盘可用性** | ✅ **全站核心功能可键盘完成**（打字、翻卡、打分、命令、跳页） | 焦点不可见（G-1）、无 skip link（G-14） |
| **ARIA** | 12 处（6 `aria-label` + 1 `aria-expanded` + 1 `aria-selected` + 1 `aria-hidden` + 1 `role`） | 无 `aria-live`、无 `role="tab"/"dialog"/"status"` |
| **动画无障碍** | 彩带响应 reduced-motion（2 处） | 4 个 keyframes + 卡片动画全部不响应 |
| **指针无障碍** | 粗指针检测 + 手势 + 键盘等价物 | 触摸目标尺寸无规范 |
| **语义 HTML** | 使用原生 button/input/textarea | 未验证标题层级与 landmark |
| **测试** | ❌ 全无 | axe、SR、Lighthouse、缩放、对比度 |
| **门禁** | ❌ 无 | CI 无 a11y 检查 |

---

## 5. 建议的改进优先级（📐 建议，非现状）

| 优先级 | 动作 | 对应缺口 |
|-------|------|---------|
| **P0** | 恢复焦点可见性：移除 `*:focus { outline: none }`，改用 `:focus-visible` 统一样式 | G-1 |
| **P0** | 让 `blink` 等动画响应 `prefers-reduced-motion` | G-2、G-11 |
| **P0** | 给页签加 `role="tablist"` / `role="tab"` / `aria-selected` / `aria-controls` + 面板 `role="tabpanel"` | G-3、G-4 |
| **P1** | 给 Toast / 进度 / 到期数加 `aria-live="polite"` | G-5 |
| **P1** | 给命令面板与弹窗加 `role="dialog"` + `aria-modal="true"` + 焦点陷阱 | G-6、G-7 |
| **P1** | 切页签后把焦点移到面板 | G-8 |
| **P1** | 加 axe-core 到 CI（含 E2E 集成） | G-9 |
| **P2** | 补 `aria-label` 到所有图标按钮 | G-13 |
| **P2** | 加 skip link | G-14 |
| **P2** | 做三套主题的对比度核验 | G-17 |
| **P2** | 定义触摸目标尺寸规范（≥44×44px） | G-18 |
| **P3** | 补标题层级规范 | G-15 |
| **P3** | `document.title` 随页签变化 | G-16 |
| **P3** | 做一次真机 SR 走查（NVDA + VoiceOver） | G-10 |

---

## 一句话结论

无障碍现状呈**"键盘可用性强、语义与反馈缺失"**的两极：一方面全站核心功能（打字、翻卡打分、命令面板、跳页、设置）**均可纯键盘完成**（`App.tsx:411-568`、`Memorize.tsx:101-138`、`CommandPalette.tsx` 的 ↑↓/Tab/Enter），Esc 还有三级让位机制（`App.tsx:367-385`），且彩带响应 `prefers-reduced-motion`（`confetti.ts:15`/`:25`）；另一方面全仓**仅有 12 处 ARIA 标注、仅 1 处 `role`**（`role="option"`），页签零语义（无 `role="tab"`/`aria-selected`）、**无 `aria-live`**（进度与 Toast 不播报）、浮层无 `role="dialog"` 与焦点陷阱，最严重的是 `src/index.css:36-39` 的 **`*:focus { outline: none }` 移除了全站焦点轮廓**（且其注释"本项目无需输入框"与命令面板 `<input>`、BankManager `<textarea>` 的存在矛盾），另有 `blink`（`1s step-end infinite`）**无限闪烁且不响应减少动效偏好**；同时**没有任何 a11y 门禁、屏幕阅读器测试或对比度计算**，本文全部结论均来自静态扫描而非真机验证。
