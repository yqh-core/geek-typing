/**
 * 首页落地块 · 中文文案唯一事实源（home-landing.copy）
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
 * ── 关键词策略（禁止堆砌）────────────────────────────────────────────────
 *   主词：英语打字练习 / 背单词 / 打字练习 / 程序员背单词
 *   细分词（中文 SERP 上工具站的真空档）：前端英语词汇 / Go 词汇 / 云原生词汇 /
 *         K8s 词汇 / AI 大模型词汇
 *   落地方式：主词进H1 与 Hero 正文；细分词集中落在 gh-banks 的一句技术栈定位陈述里 ——
 *   那是它们**唯一自然出现的位置**（技术栈词库的引导句），不是硬塞。
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
export const LANDING_PLACEMENT = 'before-root'

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
  '英语打字练习',
  '背单词',
  '打字练习',
  '程序员背单词',
  '前端英语词汇',
  'Go 词汇',
  '云原生词汇',
  'K8s 词汇',
  'AI 大模型词汇',
])

/** 顶部「跳过介绍」链接文案（落地块放 #root 之前的代价：老用户要多滚一屏，这里做缓解） */
export const SKIP_LINK_TEXT = '跳过介绍，直接开始练习'

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
  '<svg class="gh-shot-svg" viewBox="0 0 640 320" preserveAspectRatio="xMidYMid meet" role="img" aria-label="英语打字练习界面示意图">',
  '<title>英语打字练习界面示意图：敲对的字符显示为绿色，敲错的字符标红，灰色为待敲字符</title>',
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
  '<text x="64" y="90" font-size="12" fill="#5b6b8a">上一个词</text>',
  '<text x="150" y="90" font-size="17" fill="#4ade80">d</text>',
  '<text x="161.5" y="90" font-size="17" fill="#4ade80">e</text>',
  '<text x="173" y="90" font-size="17" fill="#f87171">p</text>',
  '<text x="184.5" y="90" font-size="17" fill="#4ade80">l</text>',
  '<text x="196" y="90" font-size="17" fill="#4ade80">o</text>',
  '<text x="207.5" y="90" font-size="17" fill="#4ade80">y</text>',
  '<rect x="172" y="94" width="11" height="2" rx="1" fill="#f87171"/>',
  // 行 2：当前单词（manifest）—— 已敲对变绿 / 当前字符高亮 / 待敲为灰 + 光标
  '<text x="64" y="156" font-size="12" fill="#5b6b8a">当前单词</text>',
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
  '<text x="64" y="196" font-size="12" fill="#5b6b8a">提示</text>',
  '<text x="150" y="196" font-size="13" fill="#7c8db5">照着上面这个单词敲，敲错的那个字符会标红</text>',
  // 本轮进度条（不标数字：示意图不编造战绩）
  '<text x="64" y="240" font-size="12" fill="#5b6b8a">本轮进度</text>',
  '<rect x="150" y="230" width="420" height="9" rx="4.5" fill="#1b2740"/>',
  '<rect x="150" y="230" width="196" height="9" rx="4.5" fill="url(#ghShotGrad)"/>',
  // 图例：绿=敲对 / 红=敲错 / 灰=待敲
  '<rect x="150" y="282" width="13" height="13" rx="3" fill="#4ade80"/>',
  '<text x="171" y="293" font-size="13" fill="#cbd5e1">敲对</text>',
  '<rect x="230" y="282" width="13" height="13" rx="3" fill="#f87171"/>',
  '<text x="251" y="293" font-size="13" fill="#cbd5e1">敲错</text>',
  '<rect x="310" y="282" width="13" height="13" rx="3" fill="#64748b"/>',
  '<text x="331" y="293" font-size="13" fill="#cbd5e1">待敲</text>',
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
    name: 'DigDevBox 工具箱',
    href: 'https://digdevbox.com/',
    desc: '同一站点群里的开发者工具站：在线工具、编码解码、文本与格式化类小工具，打开浏览器就能用，不必安装。',
  },
  {
    id: 'ddb-notes',
    name: 'Forge Notes',
    href: 'https://notes.digdevbox.com/',
    desc: '同一站点群里的技术博客：前端性能优化、Google SEO、VitePress 与 AdSense 集成的实战记录与踩坑笔记。',
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
  {
    id: 'gh-hero',
    heading: '英语打字练习：程序员的肌肉记忆背单词工具',
    body: [
      '屏幕出一个单词，你照着敲，敲对了就变绿。敲完这一个词，你的手指比刚才更记得它怎么拼 —— 这就是英语打字练习真正的收益：把背单词从「眼睛认得」变成「手会写」。',
      '本站是一个纯前端的打字练习工具：{total} 个词库、{totalWords} 条词条，打开浏览器就能用。',
    ],
    // Hero 徽标条：全部是可从代码验证的事实，零数字（纪律 2/3）
    chips: ['纯前端运行', '无需注册', 'localStorage 本地保存', '断网也能练'],
    ctas: [
      { text: '立即开始练习', href: APP_ANCHOR, primary: true },
      { text: '先看看词库', href: '#gh-banks', primary: false },
    ],
  },
  {
    id: 'gh-demo',
    heading: '产品界面：敲对一个字符，它就变绿',
    body: [
      '下面这张图是练习界面的示意 —— 一个词摆在上面，你照着敲，敲对的字符立刻变绿，敲错的那一个当场标红，光标停在下一个待敲的字符上。它不是截图，是用内联 SVG 画出来的，所以不加载任何外部图片，断网也照样显示。',
    ],
    figure: {
      svg: TYPING_FIGURE,
      caption:
        '示意图：上一行里拼错的那个字符标红；当前单词已敲对的部分是绿色，灰色的是还没敲的字符，蓝色高亮块是光标所在位置；下方是本轮进度。',
    },
    key: [
      { k: '敲对 → 变绿', v: '每敲对一个字符，那个字符立刻变绿，光标前进一格。' },
      { k: '敲错 → 标红', v: '拼错的那一个字符当场变红并停住，不用等事后回忆才发现拼不对。' },
      { k: '错词 → 进复习', v: '敲错的词会被排进后面的复习轮，下次练还会再出现。' },
    ],
  },
  {
    id: 'gh-why',
    heading: '为什么用打字练背单词，而不是看着单词表背',
    body: [],
    cards: [
      {
        title: '手指先记住，脑子才记住',
        text: '背了就忘，是因为眼睛认得这个词、手却不会写。打字逼你把每一个字母落到指尖上，记忆从「视觉识别」变成「运动技能」。',
      },
      {
        title: '错在哪一个字母，当场就知道',
        text: '拼错的一瞬间就变红，不用等第二天回忆起来才发现自己拼不对。错在哪个字母、错了几次，当场清清楚楚。',
      },
      {
        title: '有节奏，才记得住',
        text: '机械键盘音效与连击反馈，把背单词从一件枯燥的事变成一件有手感的事 —— 程序员背单词需要的就是这种「顺手」。',
      },
    ],
  },
  {
    id: 'gh-banks',
    heading: '词库：技术栈与考试词条一次覆盖',
    body: [
      '下面每一个词库都是真链接，点进去就是一份可直接阅读的静态词表；每个词库卡片上的数字都直接来自本站的内容包，不是估的。',
      '技术栈那几本是中文搜索里的真空档：前端英语词汇、Go 词汇、云原生词汇、K8s 词汇、AI 大模型词汇 —— 它们不是本站发明的分类，是技术人每天真在用、而工具站基本没做的那些词。',
    ],
    // ⛔ cards 不在这里列 —— 13 个词库卡片由 home-landing.mjs 从 content/ 现算生成。
    //   理由：写死包名清单 = 下一个新增词汇包会被静默漏掉，且「漏掉」在这条链路上零告警。
  },
  {
    id: 'gh-diff',
    heading: '打字练习的工具不少，能顺带把单词记住的很少',
    body: [
      'Geek Typing 想做的是**程序员的英语肌肉记忆训练器**：把「敲代码」的手感搬到「背单词」上 —— 机械键盘音效、IDE 风格皮肤、默写与限时模式、错词自动排进复习轮。',
      '只测速度的打字工具，让你知道自己快不快；纯背单词工具让你记住意思；两者之间的那条缝 —— 「我记住了意思，但代码里还是拼不对」—— 就是这个站点填的位置。',
    ],
    comparisons: [
      { kind: '只测打字速度，不背单词', result: '你知道它快，不知道自己记住了没有' },
      { kind: '背单词工具，没有打字环节', result: '意思记住了，拼写还是错的' },
      { kind: '有打字练习，词库是通用四六级', result: '考得过试，写不出 commit message' },
    ],
  },
  {
    id: 'gh-facts',
    heading: '你的数据在哪、会不会上传',
    // ⛔ 这不是「用户怎么说」，是**可从代码验证的事实陈述**。
    //   每一条都能在src/ 与 public/ 里找到对应实现，所以门禁断言它存在，但**不断言具体文字**
    //   （断言具体文字 = 把文案锁成契约，而文案本可迭代）。
    body: [],
    facts: [
      { q: '本站是纯前端应用', a: '所有练习逻辑都在你的浏览器里运行，没有后端服务参与每一次按键。' },
      { q: '学习记录保存在浏览器本地', a: '进度、错词与设置写在浏览器的 localStorage 里，不上传到任何服务器。' },
      { q: '不需要注册，也没有账号', a: '没有登录、没有注册流程、没有广告，打开就能用。' },
      { q: '断网也能继续练', a: '它是可安装的网页应用，已经加载过的词库在离线状态下照常练习。' },
      { q: '没有第三方追踪', a: '产物里不含第三方统计脚本；学习数据不出你的浏览器。' },
    ],
  },
  {
    id: 'gh-faq',
    heading: '常见问题',
    body: [],
    faq: [
      {
        q: 'Geek Typing 是做什么的？',
        a: '一个英语打字练习工具：屏幕上出一个单词，你照着敲，敲对了变绿。顺带把单词记住 —— 所以它既是打字练习，也是背单词工具。',
      },
      {
        q: '需要注册吗？',
        a: '不需要。打开网页就能用，没有账号、没有登录。',
      },
      {
        q: '支持离线吗？',
        a: '支持。它可以装成桌面应用，断网也能继续练已经加载好的词库。',
      },
      {
        q: '词库准吗？',
        a: '词条与释义直接来自本站的内容包，没有为了凑数编词。词库卡片上写的词数就是内容包里的真实条数。',
      },
      {
        q: '手机上能用吗？',
        a: '能，页面是响应式的。不过它是给键盘准备的，横屏或桌面用更顺手。',
      },
      {
        q: '我是程序员，最该从哪个词库开始？',
        a: '前端工程化词库或 Go 骨架代码 —— 这两个是你每天真会敲到的词。',
      },
    ],
  },
  {
    id: 'gh-sites',
    heading: '同一站点群里的其他站',
    body: [
      'Geek Typing 不是孤立的一个站。它和下面两个站同属DigDevBox 站点群，各有各的定位：一个放工具，一个写文章，这里专门练打字和背单词。',
    ],
    // ⛔ 兄弟站清单来自 SIBLING_SITES（见该常量上方纪律），⛔ 零统计数字。
    sites: SIBLING_SITES,
  },
  {
    id: 'gh-cta',
    heading: '现在就开始练',
    body: ['无需注册 · 无需下载 · 断网也能练'],
    ctas: [{ text: '立即开始练习', href: APP_ANCHOR, primary: true }],
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
 *   ·分层：Hero 与末尾 CTA 用渐变 + 重阴影「夹住」中段，中段区块用面板卡片交替底色。
 *   · 响应式：**移动优先** —— 基础样式即单列，640px / 960px 两个断点逐级升列。
 *     词库网格 1 → 2 → 3 列，能力卡 1 → 2 → 3 列，对比行 1 列 → 三段一行，示意图与要点 1 → 双栏。
 *   · 层次：卡片/按钮/示意图统一用 box-shadow；CTA 用渐变 + 阴影 + hover 位移。
 */
export const LANDING_CSS = `#seo-home{box-sizing:border-box;display:block;max-width:100%;margin:0;padding:0 0 .5rem;background:#070b16;color:#e2e8f0;font-family:system-ui,-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;line-height:1.75;overflow-wrap:break-word;word-break:break-word}
#seo-home *{box-sizing:border-box}
#seo-home .gh-wrap{max-width:52rem;margin:0 auto;padding:1.25rem 1.25rem 2rem}
#seo-home .gh-skip{display:inline-block;max-width:100%;margin:0 0 1.25rem;padding:.45rem .95rem;border:1px solid #26364f;border-radius:999px;background:#0e1729;color:#93c5fd;font-size:.9rem;text-decoration:none;overflow-wrap:break-word;box-shadow:0 1px 2px rgba(2,6,23,.7);transition:background .15s ease,color .15s ease}
#seo-home .gh-skip:hover{background:#17243d;color:#bfdbfe}
#seo-home .gh-sec{margin:0 0 1.25rem;padding:1.6rem 1.25rem;border:1px solid #1b2740;border-radius:1rem;background:#0c1424;box-shadow:0 1px 2px rgba(2,6,23,.65);overflow-wrap:break-word}
#seo-home .gh-h1{margin:0 0 .85rem;font-size:1.85rem;line-height:1.3;color:#f8fafc;letter-spacing:-.01em;overflow-wrap:break-word}
#seo-home .gh-h2{margin:0 0 .8rem;font-size:1.2rem;line-height:1.4;color:#f1f5f9;overflow-wrap:break-word}
#seo-home .gh-p{margin:0 0 .85rem;color:#cbd5e1;overflow-wrap:break-word}
#seo-home .gh-note{margin:0 0 1.25rem;color:#94a3b8;font-size:.9rem;overflow-wrap:break-word}
#seo-home #gh-hero{margin:0 0 1.5rem;padding:2.25rem 1.5rem 2rem;border:0;border-radius:1.25rem;background:radial-gradient(125% 130% at 8% -5%,#1e40af 0%,#15295f 42%,#0a1226 100%);box-shadow:0 24px 48px -24px rgba(2,6,23,.95),inset 0 1px 0 rgba(148,163,184,.12)}
#seo-home #gh-hero .gh-h1{font-size:2rem}
#seo-home #gh-hero .gh-p{color:#d3dced}
#seo-home #gh-demo{background:linear-gradient(180deg,#0f1a30 0%,#0b1425 100%);border-color:#22314c;box-shadow:0 18px 36px -24px rgba(2,6,23,.95),inset 0 1px 0 rgba(148,163,184,.08)}
#seo-home #gh-cta{border:0;border-radius:1.25rem;background:linear-gradient(135deg,#1e40af 0%,#1e3a8a 45%,#172554 100%);box-shadow:0 24px 48px -24px rgba(2,6,23,.95),inset 0 1px 0 rgba(148,163,184,.12);text-align:center}
#seo-home #gh-cta .gh-p{color:#dbeafe}
#seo-home #gh-cta .gh-cta{justify-content:center}
#seo-home .gh-chips{display:flex;flex-wrap:wrap;gap:.5rem;margin:1.25rem 0 0;padding:0;list-style:none}
#seo-home .gh-chip{padding:.3rem .7rem;border:1px solid rgba(147,197,253,.28);border-radius:999px;background:rgba(59,130,246,.12);color:#bfdbfe;font-size:.82rem;overflow-wrap:break-word}
#seo-home .gh-cta{display:flex;flex-wrap:wrap;gap:.75rem;margin:1.35rem 0 0}
#seo-home .gh-btn{display:inline-block;max-width:100%;padding:.65rem 1.25rem;border:1px solid #26364f;border-radius:.65rem;background:#111c31;color:#e2e8f0;font-weight:600;text-decoration:none;overflow-wrap:break-word;box-shadow:0 1px 2px rgba(2,6,23,.7);transition:transform .15s ease,box-shadow .15s ease,filter .15s ease}
#seo-home .gh-btn-primary{border-color:transparent;background:linear-gradient(135deg,#60a5fa 0%,#3b82f6 45%,#2563eb 100%);color:#fff;box-shadow:0 10px 24px -10px rgba(37,99,235,.95),inset 0 1px 0 rgba(255,255,255,.22)}
#seo-home .gh-btn:hover{filter:brightness(1.08);transform:translateY(-1px);box-shadow:0 14px 28px -12px rgba(2,6,23,.9)}
#seo-home .gh-btn-primary:hover{box-shadow:0 16px 32px -10px rgba(37,99,235,.95),inset 0 1px 0 rgba(255,255,255,.28)}
#seo-home .gh-grid{display:grid;grid-template-columns:1fr;gap:.85rem;margin:0;padding:0}
#seo-home .gh-card{min-width:0;max-width:100%;padding:.95rem 1.05rem;border:1px solid #1e2b45;border-radius:.8rem;background:#101a2d;color:inherit;text-decoration:none;overflow-wrap:break-word;box-shadow:0 1px 2px rgba(2,6,23,.6);transition:transform .15s ease,border-color .15s ease,background .15s ease,box-shadow .15s ease}
#seo-home .gh-card:hover{border-color:#3b82f6;background:linear-gradient(180deg,#16233c 0%,#111c31 100%);transform:translateY(-2px);box-shadow:0 14px 26px -16px rgba(2,6,23,.95)}
#seo-home .gh-card-title{display:block;font-weight:600;color:#f8fafc;overflow-wrap:break-word}
#seo-home .gh-card-count{display:block;margin-top:.3rem;color:#7dd3fc;font-size:.88rem;overflow-wrap:break-word}
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
#seo-home .gh-fact{margin:0 0 .7rem;padding:.85rem 1rem;border:1px solid #1b2740;border-left:3px solid #3b82f6;border-radius:.7rem;background:#101a2d;overflow-wrap:break-word}
#seo-home .gh-fact-q{display:block;font-weight:600;color:#f8fafc;overflow-wrap:break-word}
#seo-home .gh-fact-a{display:block;margin-top:.25rem;color:#cbd5e1;overflow-wrap:break-word}
#seo-home .gh-faq{margin:0;padding:0}
#seo-home .gh-faq-item{margin:0 0 .6rem;border:1px solid #1e2b45;border-radius:.7rem;background:#101a2d;overflow-wrap:break-word;box-shadow:0 1px 2px rgba(2,6,23,.5)}
#seo-home .gh-faq-q{display:block;padding:.8rem 1rem;font-weight:600;color:#bfdbfe;cursor:pointer;overflow-wrap:break-word}
#seo-home .gh-faq-a{margin:0;padding:0 1rem .85rem;color:#cbd5e1;overflow-wrap:break-word}
#seo-home .gh-sites{margin:1.1rem 0 0;padding:0;list-style:none;display:grid;grid-template-columns:1fr;gap:.7rem}
#seo-home .gh-site-item{min-width:0;max-width:100%}
#seo-home .gh-site{display:grid;grid-template-columns:1fr;gap:.3rem;min-width:0;max-width:100%;padding:.95rem 1.1rem;border:1px solid #1e2b45;border-radius:.8rem;background:#101a2d;color:inherit;text-decoration:none;overflow-wrap:break-word;box-shadow:0 1px 2px rgba(2,6,23,.6);transition:transform .15s ease,border-color .15s ease,background .15s ease,box-shadow .15s ease}
#seo-home .gh-site:hover{border-color:#3b82f6;background:linear-gradient(180deg,#16233c 0%,#111c31 100%);transform:translateY(-2px);box-shadow:0 14px 26px -16px rgba(2,6,23,.95)}
#seo-home .gh-site-name{display:block;font-weight:600;color:#f8fafc;overflow-wrap:break-word}
#seo-home .gh-site-desc{display:block;color:#94a3b8;font-size:.9rem;line-height:1.65;overflow-wrap:break-word}
#seo-home .gh-site-go{display:block;color:#7dd3fc;font-size:.82rem;overflow-wrap:break-word}
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
export const LANDING_FOOTER = 'Geek Typing · 纯前端英语打字练习工具 · 词条来自本站内容包，未做改写'
