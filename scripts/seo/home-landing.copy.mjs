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

/* ──────────────────────────── 区块定义 ──────────────────────────── */

/**
 * 区块数组。顺序即渲染顺序。
 * id 全部锁在 `#seo-home` 作用域下（同时用作区块锚点）。
 *
 * ⛔ **本数组里没有任何一个字段是统计数字** —— 词数由 home-landing.mjs 从
 *   `content/vocabulary/<id>/words.json` 现算后填入 `{count}` 占位。
 *
 * @type {ReadonlyArray<{id: string, heading: string, lead?: string, body: string[]}>}
 */
export const SECTIONS = Object.freeze([
  {
    id: 'gh-hero',
    heading: '英语打字练习：程序员的肌肉记忆背单词工具',
    body: [
      '屏幕出一个单词，你照着敲，敲对了就变绿。敲完这一个词，你的手指比刚才更记得它怎么拼 —— 这就是英语打字练习真正的收益：把背单词从「眼睛认得」变成「手会写」。',
      '本站是一个纯前端的打字练习工具：{total} 个词库、{totalWords} 条词条，打开浏览器就能用。',
    ],
    ctas: [
      { text: '立即开始练习', href: APP_ANCHOR, primary: true },
      { text: '先看看词库', href: '#gh-banks', primary: false },
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
 */
export const LANDING_CSS = `#seo-home{box-sizing:border-box;display:block;max-width:100%;margin:0;padding:2.5rem 1.25rem 1rem;background:#0b1120;color:#e2e8f0;font-family:system-ui,-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;line-height:1.75;overflow-wrap:break-word;word-break:break-word}
#seo-home *{box-sizing:border-box}
#seo-home .gh-skip{display:inline-block;max-width:100%;margin:0 0 1.5rem;padding:.45rem .9rem;border:1px solid #1e293b;border-radius:.5rem;background:#0f172a;color:#93c5fd;font-size:.9rem;text-decoration:none;overflow-wrap:break-word}
#seo-home .gh-skip:hover{background:#1e293b;color:#bfdbfe}
#seo-home .gh-wrap{max-width:52rem;margin:0 auto}
#seo-home .gh-sec{margin:0 0 2.5rem}
#seo-home .gh-h1{margin:0 0 .75rem;font-size:1.9rem;line-height:1.35;color:#f8fafc;overflow-wrap:break-word}
#seo-home .gh-h2{margin:0 0 .75rem;font-size:1.25rem;color:#f8fafc;overflow-wrap:break-word}
#seo-home .gh-p{margin:0 0 .85rem;color:#cbd5e1;overflow-wrap:break-word}
#seo-home .gh-note{margin:0 0 1.25rem;color:#94a3b8;font-size:.9rem;overflow-wrap:break-word}
#seo-home .gh-cta{display:flex;flex-wrap:wrap;gap:.75rem;margin:1.25rem 0 0}
#seo-home .gh-btn{display:inline-block;max-width:100%;padding:.6rem 1.15rem;border:1px solid #1e293b;border-radius:.5rem;background:#0f172a;color:#e2e8f0;font-weight:600;text-decoration:none;overflow-wrap:break-word}
#seo-home .gh-btn-primary{background:#2563eb;border-color:#2563eb;color:#fff}
#seo-home .gh-btn:hover{filter:brightness(1.15)}
#seo-home .gh-grid{display:flex;flex-wrap:wrap;gap:.85rem;margin:0;padding:0}
#seo-home .gh-card{flex:1 1 16rem;min-width:0;max-width:100%;padding:.9rem 1rem;border:1px solid #1e293b;border-radius:.6rem;background:#0f172a;color:inherit;text-decoration:none;overflow-wrap:break-word}
#seo-home .gh-card:hover{border-color:#2563eb;background:#111c33}
#seo-home .gh-card-title{display:block;font-weight:600;color:#f8fafc;overflow-wrap:break-word}
#seo-home .gh-card-count{display:block;margin-top:.3rem;color:#7dd3fc;font-size:.88rem;overflow-wrap:break-word}
#seo-home .gh-card-id{display:block;margin-top:.15rem;color:#64748b;font-size:.78rem;overflow-wrap:break-word}
#seo-home .gh-cmp{margin:0;padding:0;list-style:none}
#seo-home .gh-cmp-item{display:flex;flex-wrap:wrap;gap:.5rem;padding:.6rem 0;border-bottom:1px solid #1e293b;overflow-wrap:break-word}
#seo-home .gh-cmp-kind{flex:1 1 18rem;min-width:0;color:#e2e8f0;font-weight:600}
#seo-home .gh-cmp-arrow{color:#475569}
#seo-home .gh-cmp-res{flex:1 1 18rem;min-width:0;color:#94a3b8}
#seo-home .gh-fact{margin:0 0 .7rem;padding:.75rem .95rem;border-left:3px solid #2563eb;border-radius:.35rem;background:#0f172a;overflow-wrap:break-word}
#seo-home .gh-fact-q{display:block;font-weight:600;color:#f8fafc;overflow-wrap:break-word}
#seo-home .gh-fact-a{display:block;margin-top:.2rem;color:#cbd5e1;overflow-wrap:break-word}
#seo-home .gh-faq{margin:0;padding:0}
#seo-home .gh-faq-item{margin:0 0 .5rem;border:1px solid #1e293b;border-radius:.5rem;background:#0f172a;overflow-wrap:break-word}
#seo-home .gh-faq-q{display:block;padding:.7rem .95rem;font-weight:600;color:#bfdbfe;cursor:pointer;overflow-wrap:break-word}
#seo-home .gh-faq-a{margin:0;padding:0 .95rem .75rem;color:#cbd5e1;overflow-wrap:break-word}
#seo-home .gh-foot{margin:0;padding:1rem 0 0;border-top:1px solid #1e293b;color:#64748b;font-size:.85rem;overflow-wrap:break-word}`

/** 页脚文案（同样只写真能从代码验证的事实） */
export const LANDING_FOOTER = 'Geek Typing · 纯前端英语打字练习工具 · 词条来自本站内容包，未做改写'