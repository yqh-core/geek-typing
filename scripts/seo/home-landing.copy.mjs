/**
 * 首页落地块 · English-first copy source（home-landing.copy）
 *
 * ⛔ **本文件是纯数据 + 纯字符串，零逻辑**。它不含任何函数、任何条件分支、任何模板拼接。
 *   任何区块文案改动**只改这一个文件**；`home-landing.mjs` 负责把它变成 HTML，
 *   `gate-home-landing.mjs` 从这里派生关键词期望值 —— 门里**不再另写一份**文案。
 *   （纪律：同一个字符串在多处各写一遍，历史上整齐地一起写错过 —— `.html` 三处分叉、
 *   写死的词数腐坏成 18/9388。本文件就是为了消灭第三处分叉面而存在的。）
 *
 * ── 内容纪律（本项目既有纪律，不是偏好）────────────────────────────────────
 *   1. ⛔ **禁止编造用户评价、禁止编造使用人数 / 好评率 / 星级**。
 *      写死假评价并让门禁锁死它，等于把一句谎话变成不可删除的契约。
 *      所以**本文件没有「用户怎么说」区块**（架构师原稿的 gh-voice 已按主理人裁定删除），
 *      取而代之的是 gh-facts —— 它的每一条都能从代码里验证。
 *   2. ⛔ **禁止写死任何统计数字**（词数、包数、条目数一律现算，见 home-landing.mjs）。
 *      本文件里出现的数字只允许是「写死的文案里必要的量词」，而 block 数与词数都不写死。
 *      ⛔ 同一条纪律顺带管住**示意图**：TYPING_FIGURE 里的字符位置是坐标不是统计，
 *      所以它可以写死；但它**不许出现任何 WPM / 正确率 / 人数 / 词数**这类数字。
 *   3. ✅ 只写能从代码验证的事实：纯前端、localStorage、无需注册、可离线、无第三方追踪。
 *
 * ── Keyword strategy ───────────────────────────────────────────────────────
 * Primary terms: typing practice, English typing practice, typing test and developer typing practice.
 * Supporting terms: programming vocabulary, coding vocabulary, timed typing test, spelling practice.
 * Place terms naturally in the H1, first-fold copy, practice modes and vocabulary-bank descriptions.
 */

/**
 * 落地块相对 `#root` 的位置（配置项，便于日后翻转）。
 *
 * `'before-root'` = 放在 `<div id="root"></div>` **之前**：首屏即定位与关键词
 *   （Google 移动优先更友好），这是本轮采纳值。
 * `'after-root'`  = 放在其后（工具优先，老用户打开即摸到应用）。
 *
 * ⚠️ **无论哪种取值，落地块都必须在 `#root` 之外**，不能放进 `#root` 内部 ——
 *   React 19 `createRoot` 会 `clearContainerSparingly(#root)` 清空 `#root` 内的既有子节点
 *   （真机实测：块在 `#root` 内 `insideExists:false` 被清，在 `#root` 外 `outsideExists:true` 存活）。
 *   本项只决定「前」还是「后」，不决定「内」还是「外」。
 */
export const LANDING_PLACEMENT = 'after-root'

/** 落地块根元素 id（CSS 作用域锚点 + 门禁 H1 锚点） */
export const LANDING_ROOT_ID = 'seo-home'

/** 落地块注入标记注释（幂等注入靠它定位与替换，详见 home-landing.mjs 的 injectIntoIndexHtml） */
export const LANDING_START_COMMENT = '<!-- seo-home:start -->'
export const LANDING_END_COMMENT = '<!-- seo-home:end -->'

/**
 * 目标关键词 —— **门禁 H3 的期望值从这份数组派生，不在门里另写一份**。
 *
 * @type {readonly string[]}
 */
export const TARGET_KEYWORDS = Object.freeze([
  'typing practice',
  'English typing practice',
  'typing test',
  'developer typing practice',
  'programming vocabulary',
  'coding vocabulary',
  'timed typing test',
  'spelling practice',
  'code typing practice',
])

/** 顶部「跳过介绍」链接文案（落地块放 #root 之前的代价：老用户要多滚一屏，这里做缓解） */
export const SKIP_LINK_TEXT = 'Skip to the practice app'

/** 应用锚点 —— 应用挂载后 React 渲染进 #root，跳转目标就是它 */
export const APP_ANCHOR = '#root'

/* ─────────────────────── 产品界面示意图（纯内联 SVG） ─────────────────────── */

/**
 * ⭐ 练习界面示意图 —— **零 `<script>`、零外部资源、零新依赖**的纯内联 SVG。
 *
 * 为什么要它（这是本轮唯一的「产品真实画面」缺口）：
 *   升级前落地块**通篇是文字描述**，没有任何一张图能让人一眼看出「这是个打字练习工具」。
 *   而截图方案在本项目里三条路都堵死：外链图片拖慢首页且可能挂、新依赖违反「纯静态内联」约束、
 *   `<script>` 会被门禁判据 4 直接判红（爬虫必须能无JS 读到全部内容）。
 *   ⇒ 唯一可行解就是**用内联 SVG 把界面画出来**：随 HTML 一起到达、离线可用、爬虫可读。
 *
 * 三条硬纪律（破了会红）：
 *   1. ⛔ **零 `<script>`、零 `<foreignObject>`**（后者在本门里等价于「嵌入另一份文档」）。
 *   2. ⛔ **不引用任何外部 URL**（无 `<image href>`、无外链字体、无 `@import`）。
 *   3. ⛔ **不写死任何统计数字**（WPM / 正确率 / 词数 / 人数一个都不许有）——
 *      示意图只能演示**机制**（敲对变绿、敲错标红、光标、进度），不能编造**战绩**。
 *
 * 两条尺寸纪律（破了会红）：
 *   1. ⛔ **不写 `width` / `height` 属性**，只给 `viewBox` + `preserveAspectRatio` ——
 *      尺寸一律由 LANDING_CSS 的 `.gh-shot svg{width:100%;max-width:100%;height:auto}` 接管。
 *      写死 px 宽会撞门禁判据 10（移动端安全），写死 px 高会让窄屏出现横向溢出。
 *   2. ✅ 文字**不逐字指定 font-family**（靠 CSS 的 `font-family:inherit` 继承系统字体栈），
 *      避免中文字形在部分平台缺字回退成方框。
 *
 * 坐标体系：viewBox 640×320。左侧 x≈64 是行标签，x≈150 起是内容；逐字符独立 `<text>`
 *   是为了**不依赖字体度量**（不同平台字体宽度不同，凑成一段 `<text>` 里的 tspan 会错位）。
 *
 * @type {string}
 */
export const TYPING_FIGURE = [
  '<svg class="gh-shot-svg" viewBox="0 0 640 320" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Typing practice interface: correct letters turn green and mistakes turn red">',
  '<title>Typing practice interface: correct letters turn green, mistakes turn red, and pending letters stay muted</title>',
  '<defs><linearGradient id="ghShotGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#22c55e"/><stop offset="1" stop-color="#a3e635"/></linearGradient></defs>',
  // 窗口外框 + 标题栏
  '<rect x="0" y="0" width="640" height="320" rx="14" fill="#0b1220"/>',
  '<rect x="0" y="0" width="640" height="38" rx="14" fill="#121d33"/>',
  '<rect x="0" y="24" width="640" height="14" fill="#121d33"/>',
  '<rect x="0" y="38" width="640" height="1" fill="#1f2c45"/>',
  '<circle cx="24" cy="19" r="5.5" fill="#ef4444"/>',
  '<circle cx="42" cy="19" r="5.5" fill="#f59e0b"/>',
  '<circle cx="60" cy="19" r="5.5" fill="#22c55e"/>',
  '<text x="320" y="24" text-anchor="middle" font-size="13" fill="#8093b8">geek-typing</text>',
  // 行 1：上一个词（deploy，其中 p 敲错 → 标红 + 下划线）
  '<text x="64" y="90" font-size="12" fill="#5b6b8a">Previous word</text>',
  '<text x="150" y="90" font-size="17" fill="#4ade80">d</text>',
  '<text x="161.5" y="90" font-size="17" fill="#4ade80">e</text>',
  '<text x="173" y="90" font-size="17" fill="#f87171">p</text>',
  '<text x="184.5" y="90" font-size="17" fill="#4ade80">l</text>',
  '<text x="196" y="90" font-size="17" fill="#4ade80">o</text>',
  '<text x="207.5" y="90" font-size="17" fill="#4ade80">y</text>',
  '<rect x="172" y="94" width="11" height="2" rx="1" fill="#f87171"/>',
  // 行 2：当前单词（manifest）—— 已敲对变绿 / 当前字符高亮 / 待敲为灰 + 光标
  '<text x="64" y="156" font-size="12" fill="#5b6b8a">Current word</text>',
  '<rect x="276" y="116" width="26" height="44" rx="7" fill="#1d3a63" stroke="#38bdf8"/>',
  '<text x="150" y="152" font-size="38" font-weight="700" fill="#4ade80">m</text>',
  '<text x="176" y="152" font-size="38" font-weight="700" fill="#4ade80">a</text>',
  '<text x="202" y="152" font-size="38" font-weight="700" fill="#4ade80">n</text>',
  '<text x="228" y="152" font-size="38" font-weight="700" fill="#4ade80">i</text>',
  '<text x="254" y="152" font-size="38" font-weight="700" fill="#4ade80">f</text>',
  '<text x="280" y="152" font-size="38" font-weight="700" fill="#e0f2fe">e</text>',
  '<text x="306" y="152" font-size="38" font-weight="700" fill="#64748b">s</text>',
  '<text x="332" y="152" font-size="38" font-weight="700" fill="#64748b">t</text>',
  '<rect x="302" y="118" width="4" height="40" rx="2" fill="#38bdf8"/>',
  // 行 3：提示
  '<text x="64" y="196" font-size="12" fill="#5b6b8a">Prompt</text>',
  '<text x="150" y="196" font-size="13" fill="#7c8db5">Type the word above. Incorrect letters are marked in red.</text>',
  // 本轮进度条（不标数字：示意图不编造战绩）
  '<text x="64" y="240" font-size="12" fill="#5b6b8a">Session progress</text>',
  '<rect x="150" y="230" width="420" height="9" rx="4.5" fill="#1b2740"/>',
  '<rect x="150" y="230" width="196" height="9" rx="4.5" fill="url(#ghShotGrad)"/>',
  // 图例：绿=敲对 / 红=敲错 / 灰=待敲
  '<rect x="150" y="282" width="13" height="13" rx="3" fill="#4ade80"/>',
  '<text x="171" y="293" font-size="13" fill="#cbd5e1">Correct</text>',
  '<rect x="230" y="282" width="13" height="13" rx="3" fill="#f87171"/>',
  '<text x="251" y="293" font-size="13" fill="#cbd5e1">Mistake</text>',
  '<rect x="310" y="282" width="13" height="13" rx="3" fill="#64748b"/>',
  '<text x="331" y="293" font-size="13" fill="#cbd5e1">Pending</text>',
  '</svg>',
].join('')

/**
 * 站点群兄弟站（互导）—— 供落地块渲染成**真 `<a href>` 出站链接**。
 *
 * 为什么要它（这是「孤岛」问题的另一半）：
 *   上一轮修的是**入站**（13 个词库页终于有了入站链接）；但反方向一直空着 ——
 *   落地块里除本站词库页外，`dist/index.html` 对外一条链接都没有。
 *   访问 geek-typing 的人看不到 DigDevBox 站点群的其他站，流量自然单向流出。
 *
 * 三条硬纪律（破了会红）：
 *   1. ⛔ **不写死任何统计数字**（「101 个工具」「18 篇文章」这类一律不许出现）。
 *      不是因为它们不真，而是**它们会腐坏** —— 站点群的文章与工具都在增，
 *      而落地块是静态产物，改一次就要走一次发布流程。写「有多少」等于给自己埋一个
 *      必然过期的数字（这与 Home.page.vue 里的文章清单是同一类腐坏点）。
 *   2. ⛔ **链接 class 不能叫 `gh-card`** —— `gate-home-landing.mjs` 的
 *      `extractBankLinks()` 用 `/<a\s+class="gh-card"\s+href="..."/ ` 抽取词库卡，
 *      判据 5/6 会把兄弟站链接当成「多出来的词库卡」判红。
 *      所以这里用 `gh-site`，两套链接形态互不干扰。
 *   3. ⛔ **必须是真链接**：纯文字展示对流量互导零收益。
 *
 * @type {ReadonlyArray<{id: string, name: string, href: string, desc: string}>}
 */
export const SIBLING_SITES = Object.freeze([
  {
    id: 'ddb-tools',
    name: 'DigDevBox Developer Tools',
    href: 'https://digdevbox.com/',
    desc: 'A task-first collection of practical developer utilities for text, encoding, formatting and everyday workflows.',
  },
  {
    id: 'ddb-notes',
    name: 'Forge Notes',
    href: 'https://notes.digdevbox.com/',
    desc: 'Technical articles and field notes on developer tools, search growth, web performance and product engineering.',
  },
])

/* ──────────────────────────── 区块定义 ──────────────────────────── */

/**
 * 区块数组。顺序即渲染顺序。
 * id 全部锁在 `#seo-home` 作用域下（同时用作区块锚点）。
 *
 * ⛔ **本数组里没有任何一个字段是统计数字** —— 词数由 home-landing.mjs 从
 *   `content/vocabulary/<id>/words.json` 现算后填入 `{count}` 占位。
 *
 * ⚠️ **`<section>` 标签本身是门禁 --falsify 的精确匹配锚点**（注入 2 匹配
 *   `<section class="gh-sec" id="gh-why">`、注入 9 匹配 `… id="gh-faq">`），
 *   所以**区块标签的 class 列表必须逐字保持 `"gh-sec"` 单类**。
 *   区块之间的视觉差异（交替底色/ 渐变）一律走 CSS 里的 `#gh-*` id 选择器，
 *   **不许通过给 `<section>` 加 class 来实现** —— 那会让两条注入静默失效。
 *
 * @type {ReadonlyArray<{
 *   id: string,
 *   heading: string,
 *   lead?: string,
 *   body?: string[],
 *   chips?: ReadonlyArray<string>,
 *   cards?: ReadonlyArray<{title: string, text: string}>,
 *   figure?: {svg: string, caption: string},
 *   key?: ReadonlyArray<{k: string, v: string}>,
 *   comparisons?: ReadonlyArray<{kind: string, result: string}>,
 *   facts?: ReadonlyArray<{q: string, a: string}>,
 *   faq?: ReadonlyArray<{q: string, a: string}>,
 *   ctas?: ReadonlyArray<{text: string, href: string, primary?: boolean}>,
 *   sites?: ReadonlyArray<{id: string, name: string, href: string, desc: string}>,
 * }>}
 */
export const SECTIONS = Object.freeze([
  { id: 'gh-hero', heading: 'Developer Typing Practice for Programming Vocabulary',
    body: [
      'Type the word on screen, one character at a time. Correct letters turn green and mistakes turn red, so you practise accurate spelling instead of only recognising a word.',
      'Geek Typing combines English typing practice with developer-focused vocabulary, live WPM and accuracy feedback, and focused review. Choose a word bank and start a round in your browser.',
    ],
    chips: ['Runs in your browser', 'No account required', 'Progress saved on this device', 'Offline-ready after caching'],
    ctas: [{ text: 'Start practice', href: APP_ANCHOR, primary: true }, { text: 'Explore word banks', href: '#gh-banks', primary: false }],
  },
  { id: 'gh-demo', heading: 'See How the Typing Practice Works',
    body: ['The practice view gives each character clear feedback: correct letters turn green, an incorrect key is highlighted in red, and the caret marks the next character. This product illustration is inline SVG, so it does not depend on an external image.'],
    figure: { svg: TYPING_FIGURE, caption: 'Illustration of the practice view: completed letters, an incorrect character, the current caret and session progress.' },
    key: [
      { k: 'Correct', v: 'Each correct keystroke advances the caret and confirms the character.' },
      { k: 'Mistakes', v: 'An incorrect key is highlighted immediately, so you can see where spelling went wrong.' },
      { k: 'Review', v: 'Words you miss can be brought back in later review rounds.' },
    ],
  },
  { id: 'gh-why', heading: 'Build Spelling Recall Through Active Typing', body: [],
    cards: [
      { title: 'Move beyond recognition', text: 'Typing requires you to produce the spelling, not just recognise a word on a flashcard. Each round becomes an active recall task.' },
      { title: 'See errors as they happen', text: 'Character-level feedback shows exactly where a spelling went wrong, while accuracy and speed remain visible during the round.' },
      { title: 'Practise words developers use', text: 'Choose focused technical vocabulary and code-adjacent word banks rather than relying only on generic typing-test passages.' },
    ],
  },
  { id: 'gh-banks', heading: 'Explore Developer and English Vocabulary Banks',
    body: [
      'Open a word bank to browse its entries, then use the same set for typing and spelling practice. Each card links to a real vocabulary page, and entry counts are generated from the source content.',
      'The collection combines programming and technical terminology with broader English vocabulary. It is designed to make everyday development language easier to recall and spell accurately.',
    ],
  },
  { id: 'gh-diff', heading: 'More Than a Typing Speed Test',
    body: [
      'Geek Typing combines typing practice with vocabulary recall: use Classic for accurate repetition, Spelling to recall a word from its meaning, Timed 60s to challenge your pace, or Code to practise real code lines and symbols.',
      'Live WPM, accuracy, key-level feedback and review rounds connect speed practice with learning. Switch word banks, import your own list and keep your progress in the browser.',
    ],
    comparisons: [
      { kind: 'Typing tests focused only on speed', result: 'Measure pace, but do not reinforce a vocabulary set.' },
      { kind: 'Flashcards without typing', result: 'Build recognition without practising exact spelling keystroke by keystroke.' },
      { kind: 'Generic word lists', result: 'Miss the technical terminology and code-adjacent practice developers need.' },
    ],
  },
  { id: 'gh-facts', heading: 'Your Practice Data and Privacy', body: [],
    facts: [
      { q: 'Practice runs in your browser', a: 'Typing interaction and immediate feedback are handled client-side; no account is required to start.' },
      { q: 'Progress is stored on this device', a: 'Practice history, review state and preferences are saved in browser storage rather than a cloud learning account.' },
      { q: 'No sign-up flow', a: 'Open the site and start practising. You do not need to create an account or connect a profile.' },
      { q: 'Offline-ready', a: 'The installable web app can continue working offline after the app shell and selected content have been cached.' },
    ],
  },
  { id: 'gh-faq', heading: 'Frequently Asked Questions', body: [],
    faq: [
      { q: 'What is Geek Typing?', a: 'Geek Typing is a browser-based typing practice tool with English and developer vocabulary banks. It combines character-level feedback with spelling practice and review.' },
      { q: 'Which practice modes are available?', a: 'Classic, Spelling, Timed 60s and Code modes are available. Choose a mode from the Practice menu before starting a round.' },
      { q: 'Is this only a typing speed test?', a: 'No. WPM and accuracy feedback are paired with focused vocabulary banks, spelling recall, code-line practice and review of missed words.' },
      { q: 'Can I use my own vocabulary?', a: 'Yes. You can import a custom word bank from a text or JSON file and practise it in the app.' },
      { q: 'Do I need an account?', a: 'No account is required. Your practice history and preferences are saved in browser storage on your device.' },
      { q: 'Can I practise offline?', a: 'The app is installable and supports offline use after the app and the content you need have been cached.' },
      { q: 'Is it useful on a phone?', a: 'The layout is responsive, but a physical keyboard gives the most natural typing-practice experience.' },
    ],
  },
  { id: 'gh-sites', heading: 'More Tools from the DigDevBox Network',
    body: ['Geek Typing focuses on typing and vocabulary practice. Explore the related developer tools and technical notes through these separate sites.'],
    sites: SIBLING_SITES,
  },
  { id: 'gh-cta', heading: 'Ready for a Practice Round?',
    body: ['Choose a word bank, pick a mode and start typing.'],
    ctas: [{ text: 'Start typing', href: APP_ANCHOR, primary: true }],
  },
])

/* ──────────────────────────── 落地块样式 ──────────────────────────── */

/**
 * 内联 `<style>` 内容（**落地块不用 Tailwind utility**）。
 *
 * ⛔ **为什么必须自带 `<style>`**：`tailwind.config.js` 的 content 只扫 `./index.html`
 *   与 `./src/**`，而注入发生在 `vite build` **之后** —— 那时 Tailwind 已经编译完，
 *   注入的 class 名不在产物 CSS 里 ⇒ **静默无样式**（不报错，只是不生效，最难查的一类bug）。
 *   沿用 `renderBankPage` 的内联样式先例。
 *
 * ⛔ **一切选择器锁在 `#seo-home` 下**（id 优先级 100，压得住 Tailwind utility）：
 *   **禁止裸标签选择器**（`h1 {}` / `a {}` 会污染 React 渲染出来的应用 UI）、
 *   **禁止 `body` / `html` 全局规则**（会改掉应用的全局排版）。
 *
 * ⛔ **移动端纪律（门禁 H10）**：无任何固定 px 宽度声明，一律 `max-width` + `flex-wrap`
 *   + `overflow-wrap: break-word`。门禁 H10 会正则扫描本字符串，发现裸 `width: <n>px`
 *   即判红（`max-width` / `min-width` 不算，见门禁的 width 声明解析）。
 *   ⚠️ 这条同时约束了 SVG：**示意图不给 width/height 属性**，尺寸由下面 `.gh-shot svg` 接管。
 *
 * ── 视觉体系（本轮从「SEO 文字块」升级到「产品首页区块」的落点）────────────
 *   ·分层：Hero 与末尾 CTA 用 teal-soft 实底 + 重阴影「夹住」中段，中段区块用面板卡片交替底色。
 *   ·单色纪律（2026-10-13 P0 UI 改造）：品牌色收敛为 dd-tokens teal 单色相（C-2），
 *     蓝紫渐变已全部拆除；示意图内的绿/红/蓝是产品功能色（敲对/敲错/光标），属既有豁免。
 *   · 响应式：**移动优先** —— 基础样式即单列，640px / 960px 两个断点逐级升列。
 *     词库网格 1 → 2 → 3 列，能力卡 1 → 2 → 3 列，对比行 1 列 → 三段一行，示意图与要点 1 → 双栏。
 *   · 层次：卡片/按钮/示意图统一用 box-shadow；CTA 用渐变 + 阴影 + hover 位移。
 */
export const LANDING_CSS = `#seo-home{--dd-primary:#14b8a6;--dd-primary-hover:#2dd4bf;--dd-primary-soft:#0f2b28;--dd-accent-text:#5eead4;--dd-on-primary:#04201d;/* ^ dd-tokens.css v1.2 dark 值同步（geek-typing 未整站接令牌，landing 块内联挂载，改令牌源须同步此处） */box-sizing:border-box;display:block;max-width:100%;margin:0;padding:0 0 .5rem;background:#070b16;color:#e2e8f0;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.75;overflow-wrap:break-word;word-break:break-word}
#seo-home *{box-sizing:border-box}
#seo-home .gh-wrap{max-width:52rem;margin:0 auto;padding:1.25rem 1.25rem 2rem}
#seo-home .gh-skip{display:inline-block;max-width:100%;margin:0 0 1.25rem;padding:.45rem .95rem;border:1px solid #26364f;border-radius:999px;background:#0e1729;color:var(--dd-accent-text);font-size:.9rem;text-decoration:none;overflow-wrap:break-word;box-shadow:0 1px 2px rgba(2,6,23,.7);transition:background .15s ease,color .15s ease}
#seo-home .gh-skip:hover{background:#17243d;color:var(--dd-accent-text)}
#seo-home .gh-sec{margin:0 0 1.25rem;padding:1.6rem 1.25rem;border:1px solid #1b2740;border-radius:1rem;background:#0c1424;box-shadow:0 1px 2px rgba(2,6,23,.65);overflow-wrap:break-word}
#seo-home .gh-h1{margin:0 0 .85rem;font-size:1.85rem;line-height:1.3;color:#f8fafc;letter-spacing:-.01em;overflow-wrap:break-word}
#seo-home .gh-h2{margin:0 0 .8rem;font-size:1.2rem;line-height:1.4;color:#f1f5f9;overflow-wrap:break-word}
#seo-home .gh-p{margin:0 0 .85rem;color:#cbd5e1;overflow-wrap:break-word}
#seo-home .gh-note{margin:0 0 1.25rem;color:#94a3b8;font-size:.9rem;overflow-wrap:break-word}
#seo-home #gh-hero{margin:0 0 1.5rem;padding:2.25rem 1.5rem 2rem;border:0;border-radius:1.25rem;background:var(--dd-primary-soft);border:1px solid #134e4a;box-shadow:0 24px 48px -24px rgba(2,6,23,.95),inset 0 1px 0 rgba(148,163,184,.12)}
#seo-home #gh-hero .gh-h1{font-size:2rem}
#seo-home #gh-hero .gh-p{color:#d5e5e1}
#seo-home #gh-demo{background:linear-gradient(180deg,#101a2d 0%,#0b1425 100%);border-color:#1b2740;box-shadow:0 18px 36px -24px rgba(2,6,23,.95),inset 0 1px 0 rgba(148,163,184,.08)}
#seo-home #gh-cta{border:0;border-radius:1.25rem;background:var(--dd-primary-soft);border:1px solid #134e4a;box-shadow:0 24px 48px -24px rgba(2,6,23,.95),inset 0 1px 0 rgba(148,163,184,.12);text-align:center}
#seo-home #gh-cta .gh-p{color:#dbeafe}
#seo-home #gh-cta .gh-cta{justify-content:center}
#seo-home .gh-chips{display:flex;flex-wrap:wrap;gap:.5rem;margin:1.25rem 0 0;padding:0;list-style:none}
#seo-home .gh-chip{padding:.3rem .7rem;border:1px solid rgba(45,212,191,.28);border-radius:999px;background:rgba(20,184,166,.12);color:var(--dd-accent-text);font-size:.82rem;overflow-wrap:break-word}
#seo-home .gh-cta{display:flex;flex-wrap:wrap;gap:.75rem;margin:1.35rem 0 0}
#seo-home .gh-btn{display:inline-block;max-width:100%;padding:.65rem 1.25rem;border:1px solid #26364f;border-radius:.65rem;background:#111c31;color:#e2e8f0;font-weight:600;text-decoration:none;overflow-wrap:break-word;box-shadow:0 1px 2px rgba(2,6,23,.7);transition:transform .15s ease,box-shadow .15s ease,filter .15s ease}
#seo-home .gh-btn-primary{border-color:transparent;background:var(--dd-primary);color:var(--dd-on-primary);box-shadow:0 10px 24px -10px rgba(15,118,110,.55),inset 0 1px 0 rgba(255,255,255,.25)}
#seo-home .gh-btn:hover{filter:brightness(1.08);transform:translateY(-1px);box-shadow:0 14px 28px -12px rgba(2,6,23,.9)}
#seo-home .gh-btn-primary:hover{background:var(--dd-primary-hover);box-shadow:0 16px 32px -10px rgba(15,118,110,.65),inset 0 1px 0 rgba(255,255,255,.3)}
#seo-home .gh-grid{display:grid;grid-template-columns:1fr;gap:.85rem;margin:0;padding:0}
#seo-home .gh-card{min-width:0;max-width:100%;padding:.95rem 1.05rem;border:1px solid #1e2b45;border-radius:.8rem;background:#101a2d;color:inherit;text-decoration:none;overflow-wrap:break-word;box-shadow:0 1px 2px rgba(2,6,23,.6);transition:transform .15s ease,border-color .15s ease,background .15s ease,box-shadow .15s ease}
#seo-home .gh-card:hover{border-color:var(--dd-primary-hover);background:linear-gradient(180deg,#16233c 0%,#111c31 100%);transform:translateY(-2px);box-shadow:0 14px 26px -16px rgba(2,6,23,.95)}
#seo-home .gh-card-title{display:block;font-weight:600;color:#f8fafc;overflow-wrap:break-word}
#seo-home .gh-card-count{display:block;margin-top:.3rem;color:var(--dd-accent-text);font-size:.88rem;overflow-wrap:break-word}
#seo-home .gh-card-id{display:block;margin-top:.15rem;color:#64748b;font-size:.78rem;overflow-wrap:break-word}
#seo-home .gh-demo{display:grid;grid-template-columns:1fr;gap:1.1rem;margin:1.1rem 0 0;align-items:start}
#seo-home .gh-shot{margin:0;padding:0;min-width:0}
#seo-home .gh-shot-svg{display:block;width:100%;max-width:100%;height:auto;border:1px solid #24344f;border-radius:.85rem;background:#0b1220;box-shadow:0 20px 40px -22px rgba(2,6,23,.95)}
#seo-home .gh-shot-cap{margin-top:.7rem;color:#94a3b8;font-size:.85rem;line-height:1.6;overflow-wrap:break-word}
#seo-home .gh-key{display:grid;grid-template-columns:1fr;gap:.6rem;margin:0;padding:0;list-style:none}#seo-home .gh-key-item{min-width:0;padding:.8rem .95rem;border:1px solid #1e2b45;border-radius:.7rem;background:#111c31;overflow-wrap:break-word}
#seo-home .gh-key-k{display:block;font-weight:600;color:#f8fafc;overflow-wrap:break-word}
#seo-home .gh-key-v{display:block;margin-top:.2rem;color:#94a3b8;font-size:.88rem;overflow-wrap:break-word}
#seo-home .gh-cmp{margin:0;padding:0;list-style:none;display:grid;gap:.6rem}
#seo-home .gh-cmp-item{display:grid;grid-template-columns:1fr;gap:.35rem;padding:.85rem 1rem;border:1px solid #1b2740;border-radius:.7rem;background:#101a2d;overflow-wrap:break-word}
#seo-home .gh-cmp-kind{color:#e2e8f0;font-weight:600}
#seo-home .gh-cmp-arrow{color:#475569}
#seo-home .gh-cmp-res{color:#94a3b8}
#seo-home .gh-fact{margin:0 0 .7rem;padding:.85rem 1rem;border:1px solid #1b2740;border-left:3px solid var(--dd-primary);border-radius:.7rem;background:#101a2d;overflow-wrap:break-word}
#seo-home .gh-fact-q{display:block;font-weight:600;color:#f8fafc;overflow-wrap:break-word}
#seo-home .gh-fact-a{display:block;margin-top:.25rem;color:#cbd5e1;overflow-wrap:break-word}
#seo-home .gh-faq{margin:0;padding:0}
#seo-home .gh-faq-item{margin:0 0 .6rem;border:1px solid #1e2b45;border-radius:.7rem;background:#101a2d;overflow-wrap:break-word;box-shadow:0 1px 2px rgba(2,6,23,.5)}
#seo-home .gh-faq-q{display:block;padding:.8rem 1rem;font-weight:600;color:var(--dd-accent-text);cursor:pointer;overflow-wrap:break-word}
#seo-home .gh-faq-a{margin:0;padding:0 1rem .85rem;color:#cbd5e1;overflow-wrap:break-word}
#seo-home .gh-sites{margin:1.1rem 0 0;padding:0;list-style:none;display:grid;grid-template-columns:1fr;gap:.7rem}
#seo-home .gh-site-item{min-width:0;max-width:100%}
#seo-home .gh-site{display:grid;grid-template-columns:1fr;gap:.3rem;min-width:0;max-width:100%;padding:.95rem 1.1rem;border:1px solid #1e2b45;border-radius:.8rem;background:#101a2d;color:inherit;text-decoration:none;overflow-wrap:break-word;box-shadow:0 1px 2px rgba(2,6,23,.6);transition:transform .15s ease,border-color .15s ease,background .15s ease,box-shadow .15s ease}
#seo-home .gh-site:hover{border-color:var(--dd-primary-hover);background:linear-gradient(180deg,#16233c 0%,#111c31 100%);transform:translateY(-2px);box-shadow:0 14px 26px -16px rgba(2,6,23,.95)}
#seo-home .gh-site-name{display:block;font-weight:600;color:#f8fafc;overflow-wrap:break-word}
#seo-home .gh-site-desc{display:block;color:#94a3b8;font-size:.9rem;line-height:1.65;overflow-wrap:break-word}
#seo-home .gh-site-go{display:block;color:var(--dd-accent-text);font-size:.82rem;overflow-wrap:break-word}
#seo-home .gh-foot{margin:0;padding:1.25rem .25rem 0;border-top:1px solid #1b2740;color:#64748b;font-size:.85rem;overflow-wrap:break-word}
@media (min-width:640px){
#seo-home .gh-wrap{padding:1.75rem 1.75rem 2.5rem}
#seo-home .gh-sec{padding:2rem 1.75rem;border-radius:1.1rem}
#seo-home #gh-hero{padding:2.75rem 2.25rem 2.25rem}
#seo-home .gh-h1{font-size:2.15rem}
#seo-home #gh-hero .gh-h1{font-size:2.3rem}
#seo-home .gh-h2{font-size:1.3rem}
#seo-home .gh-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
#seo-home .gh-sites{grid-template-columns:repeat(2,minmax(0,1fr))}
#seo-home .gh-cmp-item{grid-template-columns:1fr auto 1fr;align-items:center;gap:.9rem}
}
@media (min-width:960px){
#seo-home .gh-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
#seo-home .gh-demo{grid-template-columns:1.3fr 1fr;gap:1.5rem}
#seo-home .gh-h1{font-size:2.35rem}
#seo-home #gh-hero .gh-h1{font-size:2.5rem}
}`

/** 页脚文案（同样只写真能从代码验证的事实） */
export const LANDING_FOOTER = 'Geek Typing · English typing practice for developers · Vocabulary entries come from the published content banks.'
