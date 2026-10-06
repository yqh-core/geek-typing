# Path C · Phase 1 最终裁定（SEO 内容面）

**状态**：CLOSED / PASS（yqh 裁定 2026-10-06）
**裁定人**：yqh（项目负责人）
**执行**：team lead 取证 → 工程师实现 → team lead 复核 → CI 权威证据
**格式沿用**：`docs/content/INV3-CI-ADMISSION-CUT.md`（L0..L7 分层结构）

---

## L0 裁定对象

**只回答一个问题**：Geek Typing 的 **Path C · Phase 1（SEO 内容面 /静态词汇包页）**
是否可以关闭。

**本刀的产物面**：把 13 个词汇包从「SPA 内的路由」变成「可被无JS 爬虫读取的静态页」，
并让 canonical / sitemap / 404 三者构成闭环。

**不回答**：是否继续做分页、是否扩展到reading / exercise（见 L5 明确不扩 scope）。

---

## L1 裁定结论

### Path C · Phase 1 = ✅ CLOSED / PASS

**核心闭环链（逐环有实测）：**

```
13 vocabulary packages
  → 13 static SEO pages
  → canonical = geek-typing.pages.dev + 无后缀
  → sitemap = 同一组无后缀 URL（14 条）
  → Cloudflare Pages ┬─ 有效页 200
                    └─ 不存在 404 + noindex
```

### 关键证据（⛔ 全部为实测值，逐条照抄，不得改动）

| 项 | 实测值 |
|---|---|
| **代码基线** | **`d35dade`**（= 当前仓库 HEAD；本刀未叠加纯文档 commit，两者同一个） |
| **CI run** | **`37406244511`** = 同一 HEAD，`completed` / `success`，四job 全绿 + 部署 success |
| SEO 页| **13/13** |
| sitemap | **14 条URL**（1 首页 + 13 词库页） |
| canonical | **13/13 正确且无 `.html`**（判据 5 + 判据 13 双保险，见 L2） |
| 生产 `/pages/bank/ielts` | **200 + 73967 B**（无后缀直连命中，**无需 308**） |
| 生产 `/pages/bank/frontend` | **200 + 5087 B**（最小包） |
| 生产 `/sitemap.xml` | **200 + 2178 B** + `application/xml`，`.html` 残留 **0** |
| 生产 `/nonexistent-xyz-123` | **404 + 1025 B** + `robots noindex` |
| `test:e2e` | **172/172** |
| `check:bundle` | **6/6** |
| `gate:perf` | **3 行** |
| `test:content` | **179/179** |
| `test:offline` | PASS |
| `dist/assets/index-*.js` | **1** |
| 生成器幂等 | ✅ 两次跑 **14 文件 sha256 全一致** |

### 门禁关键阈值（本刀判据的数字基线）

`gate:seo-pages`（13 条判据）中与本刀直接相关的阈值：

| 判据 | 阈值 | 实测 |
|---|---|---|
| 判据 1 | sitemap `<url>` 数 **== 14**（1 首页 + 13 词库页） | 14✅ |
| 判据 2 | 13 个页面文件都存在 | **13/13** ✅ |
| 判据 3 | 每页去标签正文长度 **≥ 500 字符** | 13/13 ✅ |
| 判据 9 | 单页 raw **≤ 200 KiB** | 13/13 ✅ |
| 判据 11 | `dist/assets/index-*.js` 恰好 **1** 个且 `dist/pages` 下无 `index.html` | ✅ |
| 判据 13 | canonical 与 sitemap `<loc>` 均**不含 `.html`** | ✅ |

相邻门禁的既有阈值（**本刀未改动**）：`gate:perf` 的
`words-chunk-raw-single = 550000 B`（INV-3，见 `docs/content/INV3-CI-ADMISSION-CUT.md`）。

### 前一版实现版证据（canonical 修复前，勿与收口版混用）

- `53bc8cd` / CI `37403078567`

---

## L2 本刀最重要的改进：判据 5 + 判据 13 双保险

这是本刀唯一一处**架构层面**的改动，单独成节讲透。

### 旧判据 5 的false-green（已定位并修复）

旧判据 5 只验「**canonical 自指**」（`canonical == 本页文件名`，带 `.html`）。
但生产实测 `/pages/bank/x.html` 会 **308 永久重定向** 到 `/pages/bank/x`
⇒ **`.html` 不是规范地址**。

> **自指 ≠ 规范。** 判据全绿，而 canonical 指向一个会重定向的地址。

### 新两道判据各自的职责

| 判据 | 验证内容 | 实现方式 |
|---|---|---|
| **判据 5** | **语义上的规范 URL** | `canonical == canonicalBankUrl()`，期望值从**生成器同一个函数**算出|
| **判据 13** | **`.html` 字面量绝不能存在** | **不复用任何 URL 构造逻辑**，纯字面量断言 |

### 为什么必须两道（核心论证）

**判据 5 与生成器共用 `canonicalBankUrl()`，这是一处刻意的「同源」**——
它保证语义正确，但也意味着：**如果未来 URL 构造逻辑出现系统性错误，
判据 5 会与生成器「整齐地一起绿」（同一个共谋函数）。**

这正是本次 false-green 的形态。判据 13 就是为此而存在：
它**不复用任何 URL 构造逻辑**，只做最朴素的字面量断言，
因而在「生成器与判据 5 同时被改错」时**依然能判红**。

### false-green 对拍证据（同一注入下新旧谓词行为不同 —— 这是本刀的核心证据）

对「自指 `.html` canonical」这一注入，两道新判据与旧判据行为**确实不同**：

| 谓词 | 对「自指 `.html` canonical」注入的判定 |
|---|---|
| 旧判据 5（自指） | **PASS** ← false-green |
| 新判据 5 | **FAIL** ✅ |
| 新判据 13 | **FAIL** ✅ |

**同一注入下旧谓词放行、新谓词判红** —— 这才叫「门真的能拦住」，
而不是「新旧都绿所以无所谓」。

### 三处 URL 必须同源

生成器导出**唯一**的 `canonicalBankUrl()`，以下四处**全部调用它**：

1. `<link rel="canonical">`（`renderBankPage`）
2. `og:url`
3. sitemap的 `<loc>`（`main`）
4. **门禁判据 5 的期望值**（`gate-seo-pages` import 本函数）

⇒ **门禁内不另写域名常量**，任何一处自己拼字符串都会再次分叉。

---

## L3 域名锁定（独立成节，不可省略）

### 当前裁定

**当前 Geek Typing 的 canonical 只能是 `geek-typing.pages.dev`。**

### `digdevbox.com` 属于另一个独立站点（实测）

| 探测项 | 实测结果 |
|---|---|
| title | 「DigDevBox - Online Developer Tools」 |
| 首页 | **242891 B** |
| `/pages/bank/ielts` | **无响应** |

⇒ ⛔ **`digdevbox.com` 不得进入当前 Geek Typing 的 canonical / sitemap。**

### 未来若真要迁移域名

**作为独立的 domain migration 工作处理**，整体切：
canonical + sitemap + redirect + 重新做迁移验收。
**不提前修改 canonical。**

### 教训（本刀最重要的一条方法论）

yqh 的裁定文里曾把 canonical 目标写成 `digdevbox.com`。
**若直接实施，会把 SEO 闭环指向别人的站点，而本机 13 条判据照样全绿** ——
因为判据只管「三处一致」，**不管域名对不对**。

> **判据一致 ≠ 语义正确。**
> **外部事实（域名归属）必须单独核实。**

这是对「机器门禁万能论」的直接反例：门禁能证明**内部一致性**，
但**无法证明外部指向物是对的**。域名归属这类事实必须靠独立核实，
不能指望门禁顺带证明。

---

## L4 ⛔ 明确不扩 scope（逐条）

本刀**明确不做**以下各项：

- **不做**全量分页
- **不碰** reading
- **不碰** exercise
- **不继续**堆 SEO 工程
- **不**因 `public/sitemap.xml` 可手改而扩大本刀
- **不**因新增第 14 个词汇包会触发 fail-closed 而修改门禁
- `shouldInclude` 维持**只判 `type === 'vocabulary'`**（**不硬编码包名**）
- 门禁判据 2 的 `=== 13` **是有意的 fail-closed**：
  新增第 14 包**故意红**，逼工程师同步更新验收基线

---

## L5 观察项（登记，不处理）

### O-SEO-01：`public/sitemap.xml` 可人工手改

**现状**：`public/sitemap.xml` 可人工手改，而当前门禁**只验证生成后的 `dist` 产物**，
**未证明**「source 不会被手改后绕过生成器」。

**当前闭环只证明**：
```
content → generator → dist/sitemap.xml → production
```
**不证明** source 层的手改不会被生成器覆盖掉。

**处置**：**登记，不处理。** 若将来人工维护成为真实风险，
再设计 source-vs-generated 双向一致性 ——
**不做现在的过度工程化**。

---

## L6 下一阶段：进入 GSC 观察期

> **下一刀由真实 GSC 数据决定，而不是由工程上的「还能优化什么」决定。**

**观察链**：
```
收录 → 展示 → query → impressions → clicks → CTR
```

等真实搜索数据证明某些词汇包值得扩大，
再决定是否把同一个生成器扩展到分页
（`/bank/x/` + `/bank/x/page/2/`）。

**判据来源从「工程判据」切换到「真实搜索数据」** —— 这是本刀之后的口径变更。

---

## L7 实现版 vs 收口版两笔证据（分列，勿混）

| 版本 | SHA | CI run | 说明 |
|---|---|---|---|
| 实现版 | `53bc8cd` | `37403078567` success | canonical 修复**前** |
| **收口版** | **`d35dade`** | **`37406244511` success** | **当前** |

两笔证据**用途不同**，不得互相替代。

### 遗留风险（如实登记，不修）

1. **判据 3 的 500 字符门槛余量偏紧** —— 对最小包 `frontend`（仅 20 词）
   **余量只有 47 字符**；若继续给它减词会触发误报，**需重裁阈值**。
2. **旧 `.html` URL 的 308 是 Cloudflare Pages 固有行为** —— 本次**未改其行为**（也无权改）；
   只是 **canonical / sitemap 已不再指向它**。