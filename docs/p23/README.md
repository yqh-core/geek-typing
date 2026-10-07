# P23 · 三站一体：把 DigDevBox 做成 Developer Utility + Learning + Knowledge Hub

> 起点 `1bba9e9`（geek-typing 侧 P22 收尾）→ 终点 `d5c8bc2`（dev-tools-main）
> 阶段性质：**用户亲自给出战略方向后的第一次执行**。此前是我按「工程收口」惯性推进，
> 本轮起战略由用户定义（见 `我的想法1.docx`）。

---

## 0. 用户的战略原话与我的理解

用户（`我的想法1.docx`）的核心判断：

> 现在不要再把主要精力放在"SEO 修修补补"上。
> 下一阶段应该把 DigDevBox 做成一个真正的 **Developer Utility Hub +
> Developer Learning/Typing Hub + 内容入口**。

```
                      Google
              ┌─────────┼─────────┐
              ↓         ↓         ↓
         Tool Search  Problem    Learning
              │       Search      │
              ↓         ↓         ↓
      digdevbox.com  notes.digdevbox  geek-typing
              └─────────┼─────────┘
                        ↓
                  Developer Ecosystem
```

**用户同时给了一条必须遵守的纪律**（与本项目既有纪律一致）：
> ⛔ 不做登录系统 / 社区/ 评论 / 成就徽章 / 大规模 AI 生成文章 / 几千个薄页面 /
> 买垃圾外链 / 复杂后台 / **不继续堆 JSON-LD** / **不为了 SEO 把每个词重复塞到所有页面** /
> **不再建立定时任务** / **不设置「10 月 XX 日复查」这种待办**

⇒ **本阶段全部产出都是一次性落地并上线，⛔ 仓库里没有新增任何 automation / 定时任务。**

---

## 1. ⭐ 本阶段最重要的发现：digdevbox 首页不是「只有工具列表」

用户以为digdevbox 首页需要推倒重建。**实测证明它是增量升级**（前置调研结论）：

| 用户以为要做 | 实际现状（实测） |
|---|---|
| 建工具搜索 | ✅ **已存在** —— `Home.page.vue:223-254` 搜索框 + Fuse.js 命令面板（`command-palette.store.ts:78`） |
| 建Browse by task | ✅ **已存在** —— `src/seo/clusters.ts:48-205` **14 个任务簇**，i18n 就位（`en.yml:560-574`），`build-seo.mjs:243-248` 强制en/zh 成对 |
| 建 Related Tools | ✅ **已存在** —— `tool-page.ts` 的 `resolveRelated`（同簇优先→同分类兜底，上限 6） |

⇒ **真正要花力气的是「把已有能力从藏在页面里变成 3 秒内可感知的产品结构」。**
⛔ 因此**没有**新建搜索、没有新建任务簇表、没有动 Related Tools 逻辑 —— 那是重复造轮子。

---

## 2. dev-tools-main：3 个 commit

| commit | 内容 |
|---|---|
| `b83f223` | 首页产品级重构（hero 吸收工具搜索 + 14 任务簇 + Developer Practice） |
| `322b5af` | Keyword Map 入库为机器可读单一事实源 + 构建期 audit |
| `1bba9e9` | 工具↔文章双向绑定（`ToolGuide.relatedNotes` + 首页 Blog 反向聚合） |
| `8f65707` | **修 dd-tokens 生成器引号 + `eslint --fix` 清零 796 errors** |
| `d5c8bc2` | otp 品牌改名历史债（测试期望硬编码旧中文品牌） |

### 2.1 首页（`b83f223`，975 行 → 1273 行）

| 区块 | 改动 |
|---|---|
| hero `:337-362` | **搜索框搬进 hero 内**并放大至 620px；placeholder 改任务式（`Try "format JSON", "decode JWT"...`） |
| 搜索 `:22-77` | `includes` 子串匹配 → **Fuse.js 模糊匹配**，复用 `composable/fuzzySearch.ts`（`threshold: 0.3`） |
| Popular `:119-129` | 10 → **8 个**，按用户指定顺序 |
| **Browse by task** `:431-467` | **新增 14 个任务簇**（消费 `TOOL_CLUSTERS`） |
| **Developer Practice** `:489-517` | **新增**引 geek-typing |
| Why `:330-362` | 改为 `Fast · Private · No signup · Browser based` |

⚠️ **`index.html` +41 KB（+39.8%）**，主 chunk 3,458,177 B **逐字节未变**（Fuse 早已在包内）。
增量集中在 61 个内联 SVG。本项目**无体积门禁**（`vite.config.ts:141-143` 只有 `target: 'esnext'`），
且 `generateSW` 全量 precache ⇒ 首页体积涨多少，首访安装就白下载多少。
⚠️ 故未擅自去掉任务簇图标（可省约 20 KB raw / 4 KB gzip），**留给 yqh 裁定**。

#### ⭐ 断言设计（值得复用）
`assertPopularToolPaths()`（`:133-170`）在**模块顶层**执行（⛔ 不放computed ——
computed 要等模板访问才求值，预渲染时若区块被加 `v-if` 会静默失效）。

**踩中了一个真实path 陷阱**：`hash-text` 目录的路由是 `/hash-text`，
⛔ **站上没有 `/hash-generator` 这个路由**（用户给的清单里写的是 Hash Generator）。
`/date-converter` 同理（目录是 `date-time-converter/`）。

**⛔ 一个反直觉的事实（已写进代码注释）**：这道断言由 **`node scripts/build-seo.mjs`
（`npm run build` 的第四步）** 触发，**不是 `vite build`**。
实测把 `/hash-text` 故意改成 `/hash-generator`：
`npx vite build` → **exit 0**（全绿，什么都没报）；`node scripts/build-seo.mjs` → **exit 1**。
⇒ **光看 vite build 的绿灯会误判断言失效。**

#### 3 个硬约束的处理
1. ⛔ **101 个内链一个不能少**（`Home.page.vue:420-425` 红线：SEO 需全量可爬）
   ⇒ 实测改前 101/101 → 改后 **101/101**
2. ⛔ **i18n 数组词条在 SSR 预渲染下会渲染成 key 本身**
   （`Home.page.vue:100-104` 记录 `t('home.why.points')` 返回 key，产物出现 `<li>home.why.points</li>`）
   ⇒ 全程用**标量 key + 模板内硬编码列表**，零数组词条
3. ⛔ **目录名 ≠ 路由 path**（3 处已知）⇒ 一律从 `tool.path` 取

### 2.2 Keyword Map（`322b5af`）

**⭐ 关键发现：用户要求的那张表已经存在**——`D:\work\_ops\digdevbox-keyword-map-v1.md`
（30,428 B，2026-10-06），24 个页面 × 5 列，**已经在驱动 7 条 title 落地**
（`locales/en.yml:290,354,358,398,414,474,478`）。
⛔ 但它在 `D:\work\_ops\`——**两个 git 仓库之外，不受版本控制，且无任何机器校验防止改回旧 title**。

⇒ 入库为 `src/seo/keyword-map.ts`（TS 对象字面量，⛔ 绕开 i18n 数组词条的 SSR 坑）+
`auditKeywordMap()`（**12 条判据、抛错式**）+ `scripts/audit-keyword-map.mjs` 独立入口。

⭐ **口径声明保留**：`keyword-map.ts` 头部 22 行注释逐条落为可核验事实 ——
**搜索量全部 N/A**（无 Keyword Planner/Ads 权限）、27 次检索均未返回 PAA/AI Overview、
竞争评级是 top5 域名构成的定性判断。`auditKeywordMap()` 返回值含 `searchVolume: 'N/A'`，
**构建期不可能被下游当成流量预测**。

⭐ **证伪实测（我自己独立复验过）**：注入 `path: '/hash-generator'` → **exit 1**，
报错精确指出「不是真实工具路由（比对了 tool.path，不是目录名）」；还原后 exit 0、`git status` 干净。

**首次运行就真判红过一次（非注入）**：`/linux-commands` 线上是 `Linux commands cheat sheet`
（小写 c），文档建议大写 C，实际未落地 ⇒ 据此改成 `landed: false` + 注释说明差异，
⛔ 而非硬塞一个假锁定值。

### 2.3 工具↔文章双向绑定（`1bba9e9`）

**问题**：`forge-notes` 有 **23 篇**文章，首页 `BLOG_POSTS` 硬编码只有 **3 篇**，
且**漏掉的正是 2026-10-07 那两篇同批次英文开发文章**
`devops-tools-guide`（对应 `/chmod-calculator` + `/crontab-generator`）与
`uuid-vs-ulid-guide`（对应 `/uuid-generator` + `/ulid-generator`）——它们恰好是 Keyword Map
标为高优先的页面。`Home.page.vue:473` 自承「新文章上线后同步改 BLOG_POSTS」，
⛔ **该机制正在静默失效，且失效方向是漏掉最该收录的**。

**修法（⛔ 不引入 `@forge-notes/embed`）**：
- `guides.types.ts` 加 `ToolGuide.relatedNotes?`，数据落 `guides.en.ts` / `guides.zh.ts`
  （**en/zh 成对机制现成**，`tool-page.ts:183-195` 已在校验 about/faqs）
- 11 个工具 / 5 个真实 slug，en/zh 各 11 条 slug 逐位一致
- `Home.page.vue:252-309` 的 `BLOG_POSTS` 改为**从 `GUIDES` 反向聚合** ⇒ 一处数据两处消费，
  **修掉「手动增补」这个腐坏点**

**实测**：首页 Blog **3 篇 → 5 篇**（CDP 实测 `.home-blog-card` 数量），
⛔ **全部英文开发文章，0 篇中文**（探针内置 CJK 正则断言 `/[一-鿿]/`，实测 0 命中）。

#### ⭐ 探针抓到的一个真实缺陷
第一版探针 **22 项全红**：预渲染骨架（`ToolSeoPage.vue`）渲染了 related guides 区块，
但**真实工具页（`tool.layout.vue`）没有**。用户永远看不到、只有爬虫读得到——
正是 `ToolSeoPage.vue:17` 警告的「给爬虫看一套、给用户看另一套」。
⇒ 修法：**两侧都渲染，读同一份 `guides` 数据**。修完探针全绿。

---

## 3. ⭐ 断崖式发现：`ci` workflow 长期红灯，另3 个门禁从来没跑过

### 3.1 事实

`gh api repos/yqh-core/dev-tools/actions/runs/37608252003/jobs`：
```
failure  ci
  failure  Lint
  skipped  单元测试
  skipped  类型检查
  skipped  构建
```

`ci.yml:42` 跑 `pnpm run lint`（**⛔ 无 `continue-on-error`**），
面对 **796 个存量 error** 必然 exit 1 ⇒ **`ci` 长期 failure，
`单元测试`/`类型检查`/`构建` 长期skipped，从来没在 CI 环境跑过一次。**

⚠️ **为什么容易被误判为「CI 是绿的」**：另一个 `verify.yml` **只跑 build + 产物校验**，
它一直是绿的。⛔ 而「构建 + 产物校验」恰好是唯一被真正执行的那部分。

### 3.2 根因：796 个 error 里 794 个可自动修

⚠️ **我与工程师的初始假设都错了**：我以为 `linux-commands.constants.ts` 的 357 个需要人工判断，
**实测 794/796 有自动 fixer**。

⚠️ 另有一个**会导致反复咬人的陷阱**：
`src/generated/dd-tokens.ts`（54 个 error）虽git-tracked 且被 lint 覆盖，
但它是 `scripts/build-dd-tokens.mjs:84` 用 `` `${k}: ${JSON.stringify(v)}` ``（**双引号**）生成的。
⛔ 若只跑 `--fix`：① `tokens:check` 立刻 exit 1；② 下次 `npm run build` 生成回双引号，
**54 个 error 原样复活**。
⇒ 必须**先改生成器模板**（实测本项目 `quotes` 规则解析为 `["error","single"]`，
**⛔ 无 `avoidEscape`** ⇒「值含单引号就改双引号」这条退路不允许，必须真转义 `'`）。

### 3.3 处置：真绿，不是降级

`8f65707` + `d5c8bc2`：

| 门禁 | 基线 | 现在 |
|---|---|---|
| `lint` | 796 errors / 77 warnings | **0 errors / 4 warnings** |
| `vitest` | 1 failed / 137 passed | **146 passed (34 files)** |
| `typecheck` | 0 | 0 |
| `build` | 0，106 页面 | 0，106 页面 |
| `tokens:check` | 0 | 0，light 27 / dark 27 |
| `audit:keyword-map` | — | 0，24 行 |

**⛔ `ci.yml` 逐字未改**（`git diff e447000 HEAD -- .github/workflows/ci.yml` 为空）——
⛔ **没有用 `continue-on-error` / `|| true` / 改 lint 阈值 / disable 注释压制。**

**`--fix` 审 diff 发现的 3 类可疑改动（如实记录）**：
1. `.vue` 模板被重排版（`vue/singleline-html-element-content-newline`）—— 查证为**纯空白**，
   Vue默认 `whitespace: 'condense'` 会折叠；`build` exit 0 + 106 页面正常产出是硬证据
2. UnoCSS attributify 重排（`text-sm text-primary` → `text-primary text-bold`）——
   唯一有语义风险类别，**实测同属性冲突为零**（每个标签只有一个字号和一个透明度工具类）
3. interface 分隔符 `,` → `;` —— 类型语义等价

**`json-to-code.vue` 的 2 个 `no-use-before-define`**：`infer`/`buildModel`/`mergeModel`
是**三者互递归**的 const 箭头函数（不提升，互调撞 TDZ）。
⛔ **未采用简单调序**（会让互递归变 TDZ 错误）⇒ 正解是三个都改成会提升的 `function` 声明。
⚠️ **该工具原本没有任何单测** ⇒ 补写了 `json-to-code.test.ts`（**8 例，真实 mount + 断言生成代码文本**，
覆盖三条递归路径），8/8 通过 —— 功能没坏不是只看 lint 变绿。

---

## 4. geek-typing：GitHub 外链资产（`e0de844` + `3aee7c0`）

### 4.1 `package.json` 四个字段（实测全为 `undefined` → 已补）

```json
"description": "程序员的英语肌肉记忆训练器：英语打字练习 + 背单词两合一，纯前端、无需注册、可离线使用",
"repository": { "type": "git", "url": "git+https://github.com/yqh-core/geek-typing.git" },
"homepage": "https://geek-typing.pages.dev",
"keywords": ["typing-practice","vocabulary","flashcards","spaced-repetition","pwa","offline-first","react","developer-tools"]
```
⛔ `dependencies` / `devDependencies` / `scripts` / `version` 逐字节未变；⛔ 不许 `npm publish`。
**keywords 为何用英文**：npm 惯例是英文技术短语，GitHub Topics 按全球索引；
9 个中文目标词已在页面上（`home-landing.copy.mjs:53-63` 的 `TARGET_KEYWORDS`），
⛔ 复制进 npm metadata 属关键词堆砌。

### 4.2 ⭐ 我上轮说错的一件事（工程师纠正，已独立复验）

我上轮说「13 个可开源 / 14 个不可开源」，**但我当时只查了 `content/vocabulary/` 一个目录**。
**实测全仓 27 个包的正确分布**（`content/*/*/manifest.json`）：

| 类别 | 数量 | packageId |
|---|---|---|
| MIT · 可自由再分发 | **8** | `ai-core` `cloud-native` `frontend` `go-code` `ts-code` `ielts-edu-01-vocab` `ielts-env-02-vocab` `ielts-tech-03-vocab` |
| MIT · **需署名**（派生自 ECDICT） | **5** | `cet4` `cet6` `ielts` `kaoyan` `toefl` |
| 专有 · **不可再分发** | **14** | `demo-audio-01` `demo-study-set` `demo-exercise-01` `ielts-edu-01-{exercise,reading}` `ielts-env-02-{exercise,reading}` `ielts-tech-03-{exercise,reading}` `demo-listening-01` `demo-reading-01` `demo-speaking-01` `demo-topic-01` `demo-writing-01` |

⚠️ **14 个不可再分发的包不在 `content/vocabulary/` 下**，而在
`audio`/`collection`/`exercise`/`listening`/`reading`/`speaking`/`topic`/`writing` 八个类型目录下，
`license.name: "Proprietary (self-curated)"`、`spdx: undefined`。
⚠️ 且**可再分发的 13 个是「8 MIT + 5 MIT需署名」，不是「MIT vs 专有」**——是 MIT 对 MIT，
只差要不要署名。

⚠️ **`license` 在 `sources[].license`（数组，可能多源），⛔ 不在 manifest 顶层**——
查错路径会得到「0 个可开源」的假绿。

### 4.3 词条数：选 (b)加校验而非删数字

`tests/content-query.mjs:100` **已经**断言 `VOCABULARY_ONLY_ITEMS = 9438`，
但那道门守的是**内容仓库**，⛔ 不是 README 文案——改了内容它会红，
但**不会告诉你「README 现在在说谎」**。

⇒ 新增 `scripts/verify-readme-facts.mjs`（268 行）：README 里的数字用
`<!-- readme:package-count=13 -->` 机器可读标记 + 与 `content/` 磁盘真值对账。
**证伪已实测**：把 README 改成 9999 → exit 1；还原 → exit 0。
`--falsify` 含 5 例自证（含对照组 F4），⛔ 不会恒红。

### 4.4 截图：采纳「方案 D」（零字节）

工程师提出一个我没列的选项（方案 D）：**仓库已跟踪 7 张真实界面截图**
在 `docs/audit-package/screenshots/a11y/`（`desktop-1280__typing.png` 71 KB 等）。
**引用它们 = 0 字节增量、0 新文件**。
⚠️ 只读引用，⛔ **不触碰 P1.7 冻结区**（hash manifests 实测 PASS）。

**已实施**（`3aee7c0`）：4 张（打字/ 背单词 / 进度 / 复习），路径实测 **4/4 存在**。

⛔ **拒绝 Shields.io 徽章**：外部请求 + 冲突于本项目「无第三方追踪」纪律。

---

## 5. ⭐ 分类页：6 个里 4 个不值得做（裁定不做）

用户列了 6 个分类页。**前置架构评估实测逐页裁决后，建议只做 0-1 个**：

| 页面 | 裁决 | 理由（实测素材量，拿竞品 1085 词作参照） |
|---|---|---|
| `/json-tools` | ⚠️ 有条件值得 | ≈**940 词**是唯一够的；但形态必须是「JSON 工作流决策指南」**而非工具列表**（照搬 = 与 12 个工具页重复） |
| `/security-tools` | ⚠️ 有条件值得 | ≈832 词够，但 `hash`+`jwt` 语义跨度太大；建议改做 `/hashing-tools`（7 工具语义自洽） |
| `/encoding-tools` | ❌ 不值得 | ≈492 词；`url`+`base64` 合并缺内在逻辑（两种不同编码规范） |
| `/text-tools` | ❌ 不值得 | ≈323 词；「text tools」无独立搜索意图（实测 `text` 出现在 7 个工具的 keywords 里，与单页重叠） |
| `/timestamp-tools` | ❌ 不值得 | ≈182 词；⛔ 且 Keyword Map §2 簇 4 明确标记 **`date converter online` 与 `unix timestamp converter` 两个 intent 挤在一页、定位冲突未裁定** —— 未决问题不应固化成新 URL |
| `/regex-tools` | ❌ 不值得 | ≈**112 词 / 仅 2 个工具**；两页各自已是内容完整且对应两套零重叠排名域名的独立页 |

**三个额外的阻断**：
1. ⛔ **37/101 个工具不属于任何簇** —— 分类页天然盖不全，会给用户「分类即全部」的错误预期
2. ⛔ **`public/_redirects:25-32` 已删 SPA fallback**（软 404 的根源）⇒
   分类页**必须走构建期预渲染**才有真实文件；纯客户端路由 = 线上 404 = 与没做一模一样
3. ⛔ `build-seo.mjs` 的 12 项自检里 9 项是工具页专属 ⇒ 分类页只继承 6 项全局自检，
   等于**用未受同等校验的模板**产出新页面

**竞品对照（实测抓取）**：`www.devtools.tools` 做集合页（`/category/<slug>`，20+ 分类），
其正文体量 ≈ 1085 词，**绝大部分是逐工具的独立描述**（37 条 × ~28 词）。
⇒ **「只做链接列表」这个假设被否掉**。
CyberChef / Regex101 **都没有集合页**（前者是纯 SPA + `#recipe=` fragment；后者把知识塞进工具本体）。

---

## 6. ⭐ 独立复核：`@forge-notes/embed` 不值得用（第二次确认）

**实测产物**：`raw 466.1 KB / gzip 145.7 KB`（比前置结论的 436KB/134KB **更大**——
因为包在 10-07 后重新构建，新文章已打进包）。
**22/22 个 slug 全量内联**（`build-embed-content.mjs:6-13` 的机制确认，不是懒加载）。
✅ 好的一面：`grep -c markdown-it` = 0，markdown-it 确实没进运行时。

**成本完全不对称**：首页 Blog 只需 **title + description + url + tag 四字段 × 3 条**，
为12 个字段引入 **146KB gzip**。且 `package.json` 无该依赖，引入还要处理
`peerDependencies: vue ^3.5.0`（本仓是 `vue ^3.3.4`，**版本区间不重叠**）。

**更划算的替代（已实施，即 §2.3）**：给 `ToolGuide` 加 `relatedNotes`，
成本 = 0 个新文件 + 0 个新依赖 + 约 20 行数据。

---

## 7. 两条平行工作线（本阶段观察到的并发写仓）

⚠️ **本阶段两次遇到另一个会话/进程在并发写同一仓库**：

1. `forge-notes`：`9a939e8` 做了与工程师同一个 footer 重构，并新增 5 篇文章
2. `dev-tools-main`：`e447000`（换站点图标，碰 12 个 `public/*.png`，零 `src/`）、
   `f26a66e`（同主题又一次图标迭代）

⇒ **处置原则：一律未删、未回退他人的改动**，等其自行提交后一并推送；
用 `git merge-base --is-ancestor` 验证未回退任何东西。
⛔ **教训**：多会话并行写同一仓库需要你侧确认，我只能保证「不破坏、不回退」。

---

## 8. 留给 yqh 的决策点

| # | 决策 | 我的建议 |
|---|---|---|
| 1 | 任务簇 chip 是否去掉图标（可省约 20 KB raw / 4 KB gzip） | ⛔ 先不 opt。`index.html` 已 +39.8% 且**本项目无体积门禁**，去掉图标会与下方既有 chips 区块视觉不一致 |
| 2 | 每簇 6 个代表工具是否按簇长自适应 | ⛔ 暂不改。`json`/`yaml` 簇成员多（12/5），截断到 6 会漏上下游|
| 3 | 17 条待落地 title 是否分批落地 | **这是内容决策不是工程决策**，等你裁 |
| 4 | `/date-converter` 定位冲突（epoch vs date format） | ⛔ **未裁定**。当前 title 锁定只是「防回退」不是「定位已定」 |
| 5 | `relatedNotes` 只给 11 个工具的边界 | 有意为之（避免链接农场）。若口径是「沾边都链」，边界要你划 |
| 6 | `audit:notes` 需要本机有 `forge-notes` 仓库 | CI 上会 exit 2（UNKNOWN 而非假绿）。若要进 CI 需改成读入库快照，或 CI 里 checkout |
| 7 | geek-typing 的 `lint:text`（26 处，**既有债**） | ⛔ 不在 `deploy.yml` 的 CI 门禁里，不阻塞部署。⛔ 本轮不修（属独立刀） |

---

## 9. ⛔ 留给 yqh 的两件外部动作（⛔ 不代做）

1. **V2EX / Reddit / HN / DEV 发帖**：⛔ **不代发、不复制 AI 内容**，你逐句改写并发布。
   成稿在 `docs/p20/V2EX-POST-DRAFT.md`
2. **Google Trends / Keyword Planner / GSC**：⛔ **本机 Google 全系不可达**
   （`www.google.com` DNS 被劫持到 Meta 段 IP、`trends.google.com` TCP 超时），
   **Keyword Planner 还需要 Ads 权限**（这一点在 Keyword Map 的口径声明里已落为事实）。
   ⇒ **本阶段没有任何真实搜索量数据**，`keyword-map.ts` 的 `searchVolume: 'N/A'` 是诚实标注。
   ⛔ 不得把本机网络失败误判成站点或 Google 侧故障。
