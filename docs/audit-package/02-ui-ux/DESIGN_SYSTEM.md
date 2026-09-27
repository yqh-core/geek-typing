# 设计系统（DESIGN SYSTEM）

> 状态：🔄 混合（本文分节标注）
> 基线 commit：`4152eb2`｜实测日期：2026-09-27
> **§2 为已有实现（✅ 实测）**；**§4 为未建部分（📐）**；§5 为建议体系。

---

## 1. 现状总览

| 设计系统要素 | 状态 | 证据 |
|-------------|------|------|
| 颜色（语义槽） | ✅ 有（3 套 × 11 槽） | `src/lib/theme.ts`（81 行） |
| 颜色（CSS 变量） | 📐 **无** | 全仓无 `--` 自定义属性 |
| 字体族 | ✅ 有（仅 monospace 一项） | `tailwind.config.js` `fontFamily.mono` |
| 字号阶梯 | 📐 **无** | `tailwind.config.js` `theme.extend` 无 `fontSize` |
| 间距阶梯 | 📐 **无** | 同上，无 `spacing` |
| 圆角阶梯 | 📐 **无** | 同上，无 `borderRadius` |
| 阴影阶梯 | 📐 **无** | 同上，无 `boxShadow` |
| 动画 | ✅ 有（4 keyframes + 4 animations） | `tailwind.config.js` |
| 组件库抽象 | 📐 **无** | 无 UI 组件包、无变体系统 |
| 图标系统 | ✅ 有（lucide-react `^1.48.0`） | `package.json` |
| 主题变量化 | 📐 **无**（主题是 TS 常量） | `src/lib/theme.ts` |
| Tailwind 插件 | 📐 **无** | `plugins: []` |
| 设计令牌文档 | 📐 **无** | — |

**一句话**：本项目有**主题配色**与**少量动画**，但**没有设计令牌体系**。

---

## 2. 已有实现（✅ 实测）

### 2.1 主题系统 `src/lib/theme.ts`（81 行）

#### 2.1.1 三套主题

| id | 名称 | `root` 类（实测） | `accentHex` | 特殊标志 |
|----|------|------------------|-------------|---------|
| `matrix` | Matrix | `bg-[#0b1120] text-slate-200` | `#34d399` | — |
| `ide` | IDE | `bg-[#181818] text-[#d4d4d4]` | `#569cd6` | **`ideStyle: true`** |
| `ink` | Ink | `bg-[#f5f3ec] text-[#1f2328]` | `#0f7b4f` | 唯一亮色主题 |

**类型**：`ThemeId = 'matrix' | 'ide' | 'ink'`
**列表**：`THEME_LIST`（`:81`）

#### 2.1.2 11 个语义槽（`ThemeConfig` 接口）

每个槽在源码中均有**中文注释**（这是项目内少见的自我文档化）：

| # | 槽名 | 语义（源码注释） |
|---|------|----------------|
| 1 | `root` | 页面底色 |
| 2 | `card` | 主卡片背景 |
| 3 | `border` | 卡片描边 |
| 4 | `sub` | 次要文字 |
| 5 | `pending` | 未敲击字母 |
| 6 | `correct` | 已敲对的字母 |
| 7 | `caret` | 光标颜色 |
| 8 | `accent` | 强调色文字 |
| 9 | `accentHex` | 强调色原始色值 |
| 10 | `pill` | 强调色药丸 |
| 11 | `wrongBg` | 错误底色 |

另有可选字段 `ideStyle?: boolean`。

#### 2.1.3 主题的传递方式（关键实现事实）

| 检查 | 结果 |
|------|------|
| 主题是 CSS 变量吗？ | ❌ **不是** |
| 主题是 Tailwind 配置吗？ | ❌ **不是** |
| 主题是 TypeScript 常量对象吗？ | ✅ **是** |
| 槽的值是类名字符串吗？ | ✅ 是（如 `bg-[#0b1120] text-slate-200`） |
| 有任意值类名吗？ | ✅ 有（`bg-[#0b1120]` 形式） |

**含义与代价**：

| 代价 | 说明 |
|------|------|
| 无法运行时切主题（不重渲染） | 切主题需 React 重渲染 |
| 无法被 CSS 媒体查询影响 | 如 `prefers-color-scheme` **无法生效** |
| 无法被浏览器扩展/用户样式覆盖 | — |
| 新增主题必须改 TS 源码 | 非配置化 |
| 槽值是类名 → Tailwind 必须扫描到 | `content` 已含 `./src/**/*.{js,ts,jsx,tsx}`（`tailwind.config.js`），故任意值类名可被生成 |

#### 2.1.4 硬编码颜色的旁路（重要）

`src/index.css:5-8` 绕过主题直接写死：

```css
:root { color-scheme: dark }
body { background-color: #0b1120; color: #e2e8f0 }
```

| 问题 | 说明 |
|------|------|
| `#0b1120` 与 `matrix` 主题的 `root` 一致，但与 `ide`/`ink` **不一致** | 说明 body 底色**不随主题切换** |
| `color-scheme: dark` 固定为 dark | 亮色主题 `ink` 下 `color-scheme` 仍为 dark |
| 这两个值是**非令牌**的裸值 | 主题改了，body 不会跟着改 |

### 2.2 Tailwind 配置 `tailwind.config.js`（40 行）

#### 2.2.1 `theme.extend` 全量（只有 2 项）

| 项 | 内容 |
|----|------|
| `fontFamily.mono` | `JetBrains Mono`, `Fira Code`, `SFMono-Regular`, `Consolas`, `Menlo`, `monospace` |

```
4 个 keyframes：
  shake   — 敲错抖动
  blink   — 光标闪烁
  pop     — 弹入
  popIn   — 浮层进入

4 个 animation：
  shake   0.28s ease-in-out
  blink   1s step-end infinite
  pop     0.16s ease-out
  popIn   0.25s ease-out
```

#### 2.2.2 明确**没有**的扩展

| 未扩展项 | 后果 |
|---------|------|
| `colors` | 无品牌色令牌；颜色散落在类名与 `theme.ts` |
| `fontSize` | 字号用 Tailwind 默认阶梯，无项目语义（如 `heading`/`caption`） |
| `spacing` | 间距用默认 |
| `borderRadius` | 圆角用默认 |
| `boxShadow` | 阴影用默认 |
| `screens` | 断点为 Tailwind 默认（见 `02-ui-ux/RESPONSIVE.md`） |
| `plugins` | `plugins: []` |

**`content` 配置**：`['./index.html', './src/**/*.{js,ts,jsx,tsx}']`

### 2.3 图标系统

| 项 | 值 |
|----|-----|
| 库 | `lucide-react` `^1.48.0` |
| 出处 | `package.json` |
| 唯一图标库 | ✅ 是 |

### 2.4 动画与动效

| 动画 | 用途 | 触发点 |
|------|------|-------|
| `shake`（0.28s） | 敲错反馈 | 打字错误 |
| `blink`（1s step-end） | 光标闪烁 | 当前字母光标 |
| `pop`（0.16s） | 元素弹入 | — |
| `popIn`（0.25s） | 浮层进入 | 浮层 |
| 彩带 | 结算庆祝 | `src/lib/confetti.ts`（28 行） |
| 卡片跟手旋转 | 触摸拖动 | `Memorize.tsx:145-258`（≤12deg） |

**无障碍问题**：`prefers-reduced-motion` **只在彩带生效**（`confetti.ts:15`/`:25` 的 `disableForReducedMotion: true`），**4 个 keyframes 动画均不响应**。

### 2.5 字体

| 项 | 值 |
|----|-----|
| 字体族令牌 | 仅 `mono` 一项 |
| 字体文件 | **无**（未引入 Web Font，依赖系统字体） |
| 回退链 | `JetBrains Mono` → `Fira Code` → `SFMono-Regular` → `Consolas` → `Menlo` → `monospace` |

**说明**：不引入 Web Font 是一个**有意的性能取舍**（无字体下载、无 FOUT/FOIT），但也意味着**视觉在不同系统上不一致**。

---

## 3. 主题令牌实测值全表

### 3.1 `matrix`（暗）

| 槽 | 值 |
|----|-----|
| `root` | `bg-[#0b1120] text-slate-200` |
| `accentHex` | `#34d399` |

> 其余 9 槽值见 `src/lib/theme.ts`；本文只核验了 `root` 与 `accentHex` 两个关键槽的确切字符串（**其余槽的具体值未逐一记录**）。

### 3.2 `ide`（暗，IDE 风）

| 槽 | 值 |
|----|-----|
| `root` | `bg-[#181818] text-[#d4d4d4]` |
| `accentHex` | `#569cd6` |
| `ideStyle` | `true` |

### 3.3 `ink`（亮）

| 槽 | 值 |
|----|-----|
| `root` | `bg-[#f5f3ec] text-[#1f2328]` |
| `accentHex` | `#0f7b4f` |

### 3.4 三套主题的对比观察

| 观察 | 说明 |
|------|------|
| 2 暗 1 亮 | `matrix`/`ide` 暗，`ink` 亮 |
| 3 套的 accent 完全不同色系 | 绿（matrix）/ 蓝（ide）/ 深绿（ink） |
| `ide` 独有 `ideStyle` | 说明存在**主题专属样式分支** |
| 只有 3 套，无自定义 | 用户不能自建主题 |

---

## 4. 未建部分（📐）

| # | 缺失项 | 说明 | 后果 |
|---|-------|------|------|
| D-1 | **CSS 变量** | 全仓无 `--*` 自定义属性 | 主题无法脱离 JS；无法响应 `prefers-color-scheme` |
| D-2 | **字号令牌** | 无 `fontSize` 扩展 | 无 `heading`/`body`/`caption` 语义；字号散落 |
| D-3 | **间距令牌** | 无 `spacing` 扩展 | 无 `sm`/`md`/`lg` 项目语义 |
| D-4 | **圆角令牌** | 无 `borderRadius` 扩展 | — |
| D-5 | **阴影令牌** | 无 `boxShadow` 扩展 | 层次感靠边框而非阴影 |
| D-6 | **颜色令牌（非主题）** | 无 `colors` 扩展 | 品牌色 / 语义色（success/warn/danger）无统一来源 |
| D-7 | **组件库抽象** | 无 UI 组件包 | 同类按钮在 14 个组件里各自实现 |
| D-8 | **变体系统** | 无（如 button 的 primary/secondary/ghost） | — |
| D-9 | **令牌文档** | 无 | 新成员无从查阅可用值 |
| D-10 | **令牌 lint / 门禁** | 无 | 任意值类名（`bg-[#0b1120]`）可随意新增 |
| D-11 | **响应式断点定义** | 用 Tailwind 默认 | 见 `02-ui-ux/RESPONSIVE.md` |
| D-12 | **暗/亮模式系统切换** | 只有 3 套固定主题 | 无 `prefers-color-scheme` 支持 |
| D-13 | **动效令牌** | 4 个 animation 直接写在 config | 无 `duration`/`easing` 语义令牌 |
| D-14 | **图标尺寸令牌** | 无 | 图标尺寸散落在各组件 |
| D-15 | **z-index 阶梯** | 无 | 浮层/弹窗层级散落 |

---

## 5. 建议的四级体系（📐 建议，非现状）

> ⚠️ 以下为**建议**，不是已实现内容，也不是已批准的计划。

```
Level 1  Design Tokens（令牌）
         ├─ 颜色：CSS 变量，按语义槽命名（--gt-color-*）
         ├─ 字号：语义阶梯（display / h1..h3 / body / caption / mono）
         ├─ 间距：4 基数的阶梯（4/8/12/16/24/32）
         ├─ 圆角：none / sm / md / lg / full
         ├─ 阴影：none / sm / md / lg
         ├─ 动效：duration + easing
         └─ z-index：base / dropdown / overlay / modal / toast

Level 2  Components（组件）
         ├─ 基础：Button / IconButton / Input / Select / Checkbox / Badge / Card / Tooltip
         ├─ 组合：Dropdown / Tabs / Modal / Toast / ProgressBar
         └─ 每条组件有变体（primary/secondary/ghost/danger）+ 尺寸（sm/md/lg）
            + 状态（default/hover/active/focus/disabled/loading）

Level 3  Patterns（模式）
         ├─ 空态（EmptyState）
         ├─ 加载态（Loading）
         ├─ 错误态（ErrorState）
         ├─ 确认流（ConfirmFlow）
         ├─ 键盘优先交互（KeyboardFirst）
         └─ 移动手势（SwipeableCard）

Level 4  Pages（页面）
         └─ 5 页签 + 2 浮层 + 2 弹窗，全部由 L1~L3 组合而成
```

### 5.1 迁移建议（📐 建议）

| 步骤 | 动作 | 价值 |
|------|------|------|
| 1 | 把 `theme.ts` 的 11 个槽改为 CSS 变量（保留 TS 常量作为默认值来源） | 使主题可被 CSS 层消费，为 `prefers-color-scheme` 铺路 |
| 2 | 把 `index.css` 的硬编码 `#0b1120`/`#e2e8f0` 改为变量引用 | 消除第一处旁路 |
| 3 | 在 `tailwind.config.js` 补 `colors`/`fontSize`/`spacing`/`borderRadius` 扩展 | 建立令牌来源 |
| 4 | 抽取 Button / Card / Badge 三个最高频组件 | 组件库起点 |
| 5 | 把 4 个 keyframes 动画接入 `prefers-reduced-motion` 门禁 | 修 `ACCESSIBILITY.md` 的缺口 |
| 6 | 加令牌 lint（禁止裸任意值类名） | 防止令牌体系被绕过 |

### 5.2 建议的验收标准（📐 建议）

| 标准 | 检查方式 |
|------|---------|
| 0 处硬编码颜色 | grep `bg-\[#` / `text-\[#` 应为 0（当前存在） |
| 主题切换不重渲染 | 切主题时 React DevTools 无组件重渲染 |
| `prefers-color-scheme` 生效 | 系统切暗色，站点跟随 |
| 所有动画响应 reduced-motion | 系统开减少动效，全部动画停止 |
| 组件变体有文档 | 每个组件有 usage 示例 |

---

## 6. 现状与设计系统成熟度的对照

| 维度 | 现状 | 成熟度评级 |
|------|------|-----------|
| 配色 | 3 套主题 × 11 语义槽，有中文注释 | **中高** |
| 配色工程化 | TS 常量，无 CSS 变量 | **低** |
| 字体 | 只有 monospace 一项，无 Web Font | **低（但是有意的取舍）** |
| 字号/间距/圆角 | 用 Tailwind 默认 | **低** |
| 动画 | 4 个 keyframes + 4 个 animation | **中** |
| 无障碍动效 | reduced-motion 只在彩带生效 | **低** |
| 组件抽象 | 无 | **零** |
| 令牌门禁 | 无 | **零** |
| 文档 | 无 | **零** |

**综合判断**：本项目有**一套好用的主题配色实现**，但没有**设计系统**。当前状态更接近"每个组件自带样式 + 一个共享的主题对象"，而非"令牌 → 组件 → 模式 → 页面"的分层体系。

---

## 一句话结论

设计系统现状是**"有主题配色、无令牌体系"**：`src/lib/theme.ts`（81 行）提供 3 套主题 × 11 个带中文注释的语义槽（`matrix`/`ide`/`ink`），`tailwind.config.js`（40 行）仅扩展了 `fontFamily.mono` 与 4 个 keyframes/4 个 animation，`plugins: []`；但**没有 CSS 变量**（主题是 TS 常量，导致切主题需重渲染且 `prefers-color-scheme` 无法生效）、**没有字号/间距/圆角/阴影令牌**、**没有组件库抽象**，且 `src/index.css:5-8` 的 body 底色 `#0b1120` 与 `color-scheme: dark` 是绕过主题的**硬编码旁路**，`prefers-reduced-motion` 也**只在彩带生效**（`confetti.ts:15`/`:25`）而 4 个 keyframes 动画均不响应。
