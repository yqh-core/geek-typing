# 前端架构（FRONTEND_ARCHITECTURE）

> 状态：✅ 已有 —— 技术栈、组件清单、构建链全部为当前真实实现，行号来自实际文件。
> 基线 commit：`4152eb2`　｜　实测日期：2026-09-27

---

## 1. 技术栈

| 层 | 技术 | 版本 | 依据 |
|---|---|---|---|
| UI 框架 | React | `^19.2.8` | `package.json` dependencies |
| DOM 渲染 | react-dom | `^19.2.8` | 同上 |
| 构建工具 | Vite | `^8.3.0` | `package.json` devDependencies |
| React 插件 | @vitejs/plugin-react | `^6.1.1` | 同上 |
| 类型系统 | TypeScript | `~6.0.2` | 同上 |
| CSS 框架 | Tailwind CSS | `^3.4.17` | 同上 |
| PostCSS 链 | postcss `^8.5.28` + autoprefixer `^10.6.1` | — | 同上 |
| 图标 | lucide-react | `^1.48.0` | 同上 |
| 动效 | canvas-confetti | `^1.9.4` | 同上 |
| Lint | oxlint | `^1.81.0` | 同上 |
| E2E 驱动 | playwright-core | `^1.63.0` | 同上（无 `@playwright/test`，无 runner） |

**无**：无路由库（react-router / wouter 等）、无状态管理库（redux / zustand / jotai）、
无 HTTP 客户端、无 i18n 库（自研）、无 UI 组件库、无测试框架（vitest / jest）。

---

## 2. 无路由：单页 useState 切页签

这是本前端**最重要的结构事实**，直接影响深链、SEO、分享能力。

```
App.tsx:44   export type TabId = 'home' | 'typing' | 'memorize' | 'review' | 'progress'
App.tsx:83   const [tab, setTab] = useState<TabId>('home')
```

- 5 个页签由 `useState` 驱动，**不写 URL**。
- 当前 URL 恒为 `/`（或部署域根路径）。刷新即回 `home`。
- 无 `<a href>` 语义导航，无 `history.pushState` 调用。
- 无 `popstate` 监听 → 浏览器返回键不返回上一页签。

后果（架构层）：

| 影响 | 说明 |
|---|---|
| 无法分享到具体页签 | 发送 `/` 链接，接收方只能落在首页 |
| 刷新丢失上下文 | 正在练的词库、当前页签全部重置（词库选择本身已持久化到 `gt.bank`） |
| 无法做「学习路径」深链 | 未来 Word Detail 页若无路由，仍无法被引用 |
| 无 SEO 收益 | 静态托管场景下，无法为不同页签生成独立可索引 URL |

`KNOWN_ISSUES.md#D-5` 已记录该缺口：「无路由库，URL 恒为 `/`，刷新回首页」。

---

## 3. 组件清单（14 个）

全部位于 `src/components/`，共 **2 552 行**（行数实测自 `wc -l`）。

| # | 文件 | 行数 | 职责（据源码） |
|---|---|---|---|
| 1 | `Memorize.tsx` | 449 | 背单词模式：看词选「认识/模糊/不认识」，进度存 localStorage |
| 2 | `CommandPalette.tsx` | 404 | 命令面板（Esc 唤起），键盘流操作 |
| 3 | `Header.tsx` | 363 | 顶栏：页签切换、词库选择、主题/音效开关、语言切换 |
| 4 | `PracticePanel.tsx` | 240 | 打字练习主面板 |
| 5 | `StatsPanel.tsx` | 219 | 统计面板（弱项字母 / 错词） |
| 6 | `ReviewPanel.tsx` | 212 | 错题复习面板，读 `allLoadedWords` + `analytics.words` |
| 7 | `BankManager.tsx` | 209 | 自定义词库管理（导入 / 删除 / 导出 JSON） |
| 8 | `HomePanel.tsx` | 161 | 推荐首页（Today's Practice） |
| 9 | `ProgressPanel.tsx` | 120 | 进度页签，打卡热力图 |
| 10 | `ResultOverlay.tsx` | 118 | 一轮结算浮层 |
| 11 | `Dropdown.tsx` | 87 | 通用下拉组件 |
| 12 | `KeyMap.tsx` | 84 | 键盘指法图 |
| 13 | `StreakBar.tsx` | 72 | 连续打卡条 |
| 14 | `StatsBar.tsx` | 44 | 顶部实时统计条 |

另有顶层容器与入口：

| 文件 | 行数 | 说明 |
|---|---|---|
| `src/App.tsx` | 817 | 全部状态与业务编排（见下节） |
| `src/main.tsx` | 58 | 挂载入口 + SW 注册 + 大词库预热 |

合计 `src/*.tsx` + `src/components/*.tsx` = **4 694 行**（含 `src/lib/*.ts` 1 095 行）。

### 3.1 `App.tsx` 的状态集中度

`App.tsx` 单文件持有全部应用级状态（`:83-113`）：

```
tab / bankId / themeId / soundEnabled / soundTheme / shuffled / mode / running /
countdown / commandMode / queue / wordIndex / typed / errorFlash / wrongKey /
finished / stats / elapsedMs / wrongWords / milestone / history / customBanks /
analytics / autoSpeak / reviewVersion
```

共 **25 个 `useState`**。无 Context（除 i18n 的 `LangProvider`）、无 reducer、无 store。
这是「无状态管理库」的实际代价：所有派生逻辑与副作用都在一个 817 行的文件里。

### 3.2 组件依赖方向

```
main.tsx
  └─ LangProvider (src/i18n/index.tsx)
       └─ App.tsx
            ├─ Header ─────────┬─ Dropdown
            │                  └─ (词库选择 / 主题 / 语言)
            ├─ StatsBar
            ├─ HomePanel        (推荐首页)
            ├─ PracticePanel    (打字)
            ├─ Memorize         (背单词)
            ├─ ReviewPanel      (复习)
            ├─ ProgressPanel ──┬─ StreakBar
            │                  └─ StatsPanel
            ├─ ResultOverlay
            ├─ KeyMap
            └─ CommandPalette
```

所有子组件通过 props 接收状态与回调；无组件直接订阅全局状态。

---

## 4. i18n（自研，无库）

位于 `src/i18n/`：

| 文件 | 行数 | 说明 |
|---|---|---|
| `index.tsx` | 70 | `LangProvider` + `useT()` + `useLang()`；语言持久化到 `gt.lang` |
| `zh.ts` | 232 | 中文词条 **185** 条（`grep -c "^  '"` 实测） |
| `en.ts` | 231 | 英文词条（与 zh 同 key 集） |

实现要点：

- 无第三方 i18n 库，词条是普通 `Record<string, string>` 常量对象。
- 初始语言探测：`localStorage['gt.lang']` → 浏览器语言（`i18n/index.tsx:16-19`）。
- 切换即 `localStorage.setItem('gt.lang', l)`（`i18n/index.tsx:48`）。
- 未命中 key 的 fallback 行为见 `index.tsx`（无插值、无复数规则、无日期格式化）。

---

## 5. 数据层（前端侧）

前端不持有内容数据源，全部经 `src/data/wordBanks.ts`（73 行）读取：

```
wordBanks.ts:7    import { getVocabularyPackages, loadPackage } from '../core/content/registry'
wordBanks.ts:56   export const WORD_BANKS: WordBank[] = getVocabularyPackages().map(...)
wordBanks.ts:32   const bankCache = new Map<string, WordItem[]>()   // 懒加载包缓存
wordBanks.ts:35   bankWordsOf(bank)  — 缓存优先，未加载返回占位空数组
wordBanks.ts:40   allLoadedWords(banks) — 全部已加载词
wordBanks.ts:45   ensureBankWords(bank) — 触发加载并缓存
```

**这是 V3 兼容层**，文件头注释（`wordBanks.ts:1-6`）写明：

> V4.1 起词库数据的唯一定义源是 `content/vocabulary/<id>/{manifest,words}.json`
> （经 `src/core/content/registry.ts` 注册）；本文件保留 V3 的 `WordBank` 形状与
> 缓存/加载 API，供既有 UI 与测试零改动运行。

→ 架构后果见 `SYSTEM_ARCHITECTURE.md#4`（边界泄漏）。

---

## 6. 构建链

### 6.1 脚本（`package.json` scripts）

| 脚本 | 命令 | 用途 |
|---|---|---|
| `dev` | `vite` | 开发服务器 |
| `build` | `tsc -b && vite build` | **类型检查 + 构建**（tsc 前置，类型错误会阻断构建） |
| `lint` | `oxlint` | 静态检查（实测 16 warnings / 0 errors，`KNOWN_ISSUES.md#DEBT-006`） |
| `preview` | `vite preview --host 127.0.0.1 --port 4173 --strictPort` | 本地预览（供 e2e / smoke 用） |

### 6.2 配置

**Vite**（`vite.config.ts`，全文 7 行）：

```ts
export default defineConfig({
  plugins: [react()],
})
```

零自定义配置 —— 无 `base`、无 `build.rollupOptions`、无手动 chunk 拆分、无别名。
3 个 lazy chunk 完全由 `registry.ts:53-55` 的动态 `import()` 自动产生。

**TypeScript**（`tsconfig.app.json`）：

| 项 | 值 | 说明 |
|---|---|---|
| `target` | `es2023` | |
| `lib` | `["ES2023","DOM"]` | |
| `module` | `esnext` | |
| `moduleResolution` | `bundler` | |
| `jsx` | `react-jsx` | 无需 `import React` |
| `noEmit` | `true` | 只做类型检查，产物由 Vite 产出 |
| `verbatimModuleSyntax` | `true` | 强制 `import type` |
| `noUnusedLocals` / `noUnusedParameters` | `true` | 未使用变量即报错 |
| `erasableSyntaxOnly` | `true` | 禁用 enum / namespace 等不可擦除语法 |
| `include` | `["src"]` | 只检查 `src/` |
| **未开启** | `resolveJsonModule` | ⇒ 这是 `registry.ts` 用 `?raw` + `JSON.parse` 的原因 |

**Tailwind**（`tailwind.config.js`）：

- `content`: `['./index.html', './src/**/*.{js,ts,jsx,tsx}']`
- 扩展项仅 2 处：`fontFamily.mono`（JetBrains Mono / Fira Code 栈）、
  4 个 keyframes（`shake` / `blink` / `pop` / `popIn`）+ 对应 animation。
- **无** `theme.extend.colors`、**无** `spacing` / `fontSize` / `borderRadius` 覆盖。
  → 架构含义：设计令牌未系统化，颜色/间距/圆角全部散落为原子类字面量
  （`GAP_ANALYSIS.md#E-6` 已记录）。

**PostCSS**（`postcss.config.js`，2 行）：`tailwindcss` + `autoprefixer`。

### 6.3 打包策略

| 项 | 实测值 | 来源 |
|---|---|---|
| 首屏必须下载（index.html + 主 chunk + CSS，不含 words chunk） | 406.09 KiB raw / 125.21 KiB gzip | `content/README.md:549` |
| 主 chunk `index-Cawl4_-q.js` | 381.06 KiB raw / 118.89 KiB gzip | `content/README.md:550` |
| 3 个 lazy chunk（ielts / kaoyan / toefl） | 464.04 / 471.22 / 471.76 KiB raw | `content/README.md:551` |
| 10 个 manifest 总计 | 13.08 KiB raw / 2.21 KiB gzip | `content/README.md:552` |
| 主 chunk 阈值 | ≤ 420 KiB raw / 135 KiB gzip | `content/README.md:586` |
| 预热预算 | ≤ 600 KiB gzip（实测 497.03 KiB） | `content/README.md:587` |

体积门禁由 `npm run check:bundle`（`scripts/check-bundle.mjs`）守护。
**未接入 CI**（`KNOWN_ISSUES.md#DEBT-002`）。

---

## 7. PWA 与离线

| 项 | 文件 | 说明 |
|---|---|---|
| Service Worker | `public/sw.js`（7 619 B） | 缓存名 `gt-shell-v3` |
| 预缓存清单 | `sw.js` SHELL 常量 | `/`、`/index.html`、`/favicon.svg`、`/icons.svg`、`/icon-192.png`、`/icon-512.png`、`/manifest.webmanifest` |
| install 策略 | `precacheShell()` | 解析首页 HTML 把 `/assets/*` 一并纳入预缓存 |
| fetch 策略 | `sw.js:78-103` | 静态资源缓存优先；页面与其它文件网络优先，断网回落 `/index.html` |
| 注册 | `main.tsx:19-25` | 仅 `import.meta.env.PROD` 注册 |
| 响应净化 | `sw.js` `sanitize()` | 剥离 `content-encoding` / `content-length` / `vary`，防二次解码与 Vary 静默 miss |
| PWA 清单 | `public/manifest.webmanifest` | `display: standalone`、`start_url: /`、2 个图标 |
| 安全头 | `public/_headers` | `nosniff`、`strict-origin-when-cross-origin`、`SAMEORIGIN`、`same-origin` COOP |
| 缓存策略 | `public/_headers` | `/assets/*` → `max-age=31536000, immutable`；`/sw.js` → `no-cache` |

**idle 预热**（`main.tsx:27-58`）：`requestIdleCallback`（fallback `setTimeout 2000`）
→ 等 SW `ready` + `controller` → 调 `warmUpVocabulary()` 预拉 3 个大词库 chunk。
慢网（`saveData` / `slow-2g`/`2g`/`3g`）跳过，不打爆流量。

---

## 8. 渲染策略（架构层事实）

| 项 | 现状 |
|---|---|
| 渲染模式 | 纯 CSR（客户端渲染）。`index.html` 的 `<div id="root">` 为空，无预渲染 |
| 首屏可索引内容 | 只有 `index.html` 里的 `<meta>` 与 `<title>`；正文全部由 JS 注入 |
| SSR / SSG | 无 |
| `<StrictMode>` | 已启用（`main.tsx:10`），开发期双调用副作用 |
| 根节点 | `createRoot(document.getElementById('root')!)`（`main.tsx:9`） |
| 无障碍基线 | 有少量 `aria-*`，无 a11y 门禁（`KNOWN_ISSUES.md#E-5`） |

`index.html` 已配齐 SEO/PWA 元信息：`description`、`keywords`、`author`、
Open Graph（`og:type/site_name/title/description/url/locale`）、`twitter:card`、
`canonical`（`https://geek-typing.pages.dev/`）、`theme-color`。
`public/robots.txt`（4 171 B）与 `public/sitemap.xml`（238 B）已存在。

→ 但 `sitemap.xml` 只可能列出 `/` 一个 URL（无路由，见 §2）。

---

## 9. 一句话结论

> 前端是 **React 19 + Vite 8 + Tailwind 3 + TypeScript 6** 的纯 CSR 单页应用，
> **零构建配置、零路由、零状态管理库**。14 个组件 + 一个 817 行的 `App.tsx` 承载全部逻辑。
> 该技术栈与本项目「无输入框、键盘流、纯前端、离线可用」的产品定位匹配；
> 但「无路由」与「UI 未接 Query 层」是两项会被后续产品化放大的结构约束。
