#!/usr/bin/env node
/**
 * 技术词库页「术语对照/ 用法说明」区的**唯一实现**。
 *
 * ── 为什么单独成文件（而不是塞进 build-static-pages.mjs）────────────────────
 *   ① `gate-seo-pages.mjs` 判据 10 数的是 `scripts/seo/build-static-pages.mjs` 里的
 *      **页面模板函数**（`export function render…Page…`，见 countPageTemplateFns）。
 *      本模块是「词的归类与解释」，与「HTML 页面模板」是两件事，混在一起会让那个文件
 *      同时承担排版与词法判断两套关注点。
 *   ② 分组规则是需要**单独审**的东西：它决定「哪个词被归到哪一组」，
 *      也就是决定读者在页面上看到什么。把它独立出来，才能对着它逐条核对分组是否成立。
 *
 * ── ⛔ 铁律：词条内容一字不改 ──────────────────────────────────────────────
 *   本模块**只读** words.json 里的 `word` / `translation` 字段用于「匹配」与「展示」，
 *   从不写回、从不改写、从不"顺手润色"。分组只是**在页面上换一种组织方式**呈现同一批词。
 *
 * ── ⛔ 分组必须「真实」：不允许手工编一个看起来合理的分组 ──────────────────────
 *   本模块提供两种**可机器核验**的归类机制，按包的词形选择：
 *
 *   A. `words`（精确词形白名单）—— 用于单词型词库（ai-core / cloud-native / frontend）。
 *      这些包的 `word` 就是一个个独立术语（`transformer` / `kubernetes` / `bundler`），
 *      不存在「用正则猜」的空间 ⇒ 直接列出该组的词形，判定是**集合相等**，无歧义。
 *
 *   B. `patterns`（有序正则，首个命中即归组）—— 用于代码型词库（go-code / ts-code）。
 *      这些包的 `word` 是整行代码，词形���长且互不相似，只能按「这行代码在做什么」归类。
 *      规则**有序**（自上而下，首个命中即定组）—— 这是必需的：`defer resp.Body.Close()`
 *      既含 `err` 无关项又含 `defer`，多条规则都可能命中，顺序让归属唯一确定。
 *
 *   两种机制**都不可能丢词**：未命中任何规则的词条会落入 `residual`（见resolveScenes），
 *   门禁与报告都要断言它为空。⛔ 一旦 residual 非空，说明分组规则有缺口，必须补规则
 *   而不是把残词硬塞进某个组。
 *
 * ── import 本模块不得触发任何写盘 ─────────────────────────────────────────
 *   与 build-static-pages.mjs 同一条纪律：纯逻辑 + 常量，CLI/自检段放在
 *   `import.meta.url` 判定之后（见文件末尾），便于门禁 import 做判定计算。
 */

/**
 * 五个技术词库的「场景分组」声明。
 *
 * ⚠️ 每条 `words` / `patterns` 都必须与 `content/vocabulary/<id>/words.json` 的真实词形对得上。
 *   自检段（`node scripts/seo/bank-scenes.mjs`）会现算覆盖率并打印每组实际条数——
 *   词库演进（增删词）会让它转红，这是刻意的：分组必须随内容一起维护，不能腐坏成
 *   「看起来合理但对不上实际词条」。
 *
 * @type {Record<string, {
 *   keyword: string,
 *   lede: string,
 *   intro: string,
 *   groups: Array<{id: string, label: string, note: string, words?: string[], patterns?: RegExp[]}>,
 *   related: string[],
 * }>}
 */
export const BANK_SCENES = {
  /* ── AI 大模型词汇 ──────────────────────────────────────────────────────── */
  'ai-core': {
    keyword: 'AI 大模型词汇',
    lede:
      '下面这份清单是按用途归类的 AI 大模型词汇，每一条都取自本页词库，'
      + '词形与释义与下方完整词条列表完全一致。',
    intro:
      '这份词库收录的是大模型与 AI 工程日常会反复读到的一批术语，覆盖模型结构、训练、评估、'
      + '检索增强、Agent 编排与线上推理这几条主线。它适合两类场景：一是读论文或官方文档时，'
      + '把只认得字形、不认得含义的术语快速对上中文释义；二是把术语本身当作打字素材，'
      + '让这些词在手指上形成条件反射。下面按用途把这批词重新归了一下组，'
      + '同一组里的词通常出现在同一段上下文里，成组记忆比逐个背诵省力。',
    groups: [
      {
        id: 'model',
        label: '模型结构与推理',
        note: '描述模型「长什么样、怎么算」：注意力、词元切分、前向推理与结果形态。',
        words: [
          'transformer', 'attention', 'embedding', 'tokenizer', 'inference',
          'quantization', 'distillation', 'reasoning', 'temperature', 'checkpoint',
          'perplexity',
        ],
      },
      {
        id: 'training',
        label: '训练与优化',
        note: '训练一个模型时反复出现的目标函数与收敛判断。',
        words: [
          'fine-tuning', 'gradient', 'optimizer', 'regularization',
          'overfitting', 'generalize', 'convergence', 'iterate',
        ],
      },
      {
        id: 'evaluation',
        label: '评估与安全',
        note: '衡量模型好不好，以及把它约束在可接受范围内。',
        words: ['benchmark', 'evaluate', 'hallucination', 'guardrail', 'alignment', 'threshold'],
      },
      {
        id: 'retrieval',
        label: '检索与向量',
        note: 'RAG 这条链路上的各个环节：从召回、切块到重排与向量化表示。',
        words: ['retrieval', 'grounding', 'rerank', 'chunking', 'vector', 'semantic'],
      },
      {
        id: 'agent',
        label: 'Agent 与编排',
        note: '让模型进入一个有工具、有循环、能自主推进的工作流。',
        words: ['orchestration', 'scaffolding', 'autonomous', 'heuristic'],
      },
      {
        id: 'engineering',
        label: '性能与工程',
        note: '把模型放进真实服务时要盯的指标与工程手段。',
        words: ['throughput', 'latency', 'batching', 'pipeline', 'scalable', 'robust'],
      },
      {
        id: 'action',
        label: '常见任务动词',
        note: '描述「让模型做某件事」时反复出现的动作词。',
        words: ['summarize', 'classify'],
      },
    ],
    related: ['cloud-native'],
  },

  /* ── Go 词汇 ────────────────────────────────────────────────────────────── */
  'go-code': {
    keyword: 'Go 词汇',
    lede:
      '下面按用途归类的 Go 词汇，全部来自本页词库；分组只改变呈现顺序，'
      + '词形与释义与下方完整词条列表逐条一致。',
    intro:
      '这份词库的词条不是单个单词，而是整行 Go 骨架代码——`if err != nil { return err }`、'
      + '`go worker(wg, jobCh)`、`wg.Add(len(jobList))` 这样的最小可编译片段。'
      + '练习方式建议配合应用内的代码模式：大小写敏感，`{`/`}`、缩进与分号都要照打，'
      + '这练的是把代码结构敲进肌肉记忆，而不是认单词。下面按「这行代码在做什么」归类，'
      + '同一组里的行通常一起出现在同一个函数里。',
    groups: [
      {
        id: 'json',
        label: 'JSON 与序列化',
        note: '结构体与 JSON 之间的来回转换。',
        patterns: [/json\./, /application\/json/],
      },
      {
        id: 'concurrency',
        label: '并发、通道与取消',
        note: 'goroutine、channel、锁、原子操作与上下文取消——Go 并发的主干词汇。',
        patterns: [
          /\bgo func\b/, /\bgo \w+\(/, /sync\./, /\bwg\./, /\bch\b/, /\bchan\b/,
          /select\s*\{/, /\bmsgCh\b/, /context\.WithCancel/, /NewTicker/, /time\.Sleep/,
          /atomic\./, /WaitGroup/, /RWMutex/,
        ],
      },
      {
        id: 'error',
        label: '错误处理与资源释放',
        note: 'err 冒泡、错误包装与 defer 收尾——Go 里最该形成肌肉记忆的一段。',
        patterns: [/\berr\b/, /Errorf/, /errors\.New/, /log\.Fatal/, /\bdefer\b/],
      },
      {
        id: 'func',
        label: '类型定义与方法签名',
        note: '结构体声明、构造函数、指针接收者方法与 Stringer 接口。',
        patterns: [/^type\s+\w+\s+struct/, /^func\s/, /String\(\)\s+string/, /^return\s/],
      },
      {
        id: 'control',
        label: '流程控制',
        note: '带初始化语句的 if 与类型 switch。',
        patterns: [/^if\s/, /^switch\s/],
      },
      {
        id: 'decl',
        label: '变量与常量声明',
        note: '带初始值的 var 与包级 const。',
        patterns: [/^var\s+\w+\s+\w/, /^const\s/],
      },
      {
        id: 'collection',
        label: '集合与字符串处理',
        note: 'map 增删查、切片追加、strings 系列与字节缓冲区。',
        patterns: [
          /make\(map/, /\bappend\(/, /delete\(/, /, ok := /,
          /strings\./, /bytes\.Buffer/, /io\.ReadAll/,
        ],
      },
      {
        id: 'stdlib',
        label: '格式化与文件读写',
        note: 'fmt 拼接与 os 文件写入（含权限位）。',
        patterns: [/fmt\.Sprintf/, /os\.WriteFile/],
      },
      {
        id: 'http',
        label: 'HTTP 服务与测试',
        note: '起服务、注册路由、写响应头，以及 t.Run 子测试。',
        patterns: [/t\.Run/, /http\./, /w\.WriteHeader/],
      },
    ],
    related: ['cloud-native'],
  },

  /* ── TypeScript 词汇 ────────────────────────────────────────────────────── */
  'ts-code': {
    keyword: 'TypeScript 词汇',
    lede:
      '下面按用途归类的 TypeScript 词汇，全部来自本页词库；'
      + '其中若干条也是前端英语词汇里高频出现的行，'
      + '词形与释义与下方完整词条列表逐条一致。',
    intro:
      '这份词库同样以整行代码为词条，但换成了 TypeScript / React 的高频写法：'
      + '`const [count, setCount] = useState(0);`、`await Promise.all([...])`、'
      + '`const safe = user?.profile?.avatarUrl;`。它的用途与 Go 词库一致——'
      + '在代码模式下做大小写敏感的整行敲击，同时因为这些都是前端日常会读到的行，'
      + '也适合当作前端英语词汇的熟悉度材料。下面按用途分组。',
    groups: [
      {
        id: 'hooks',
        label: 'React Hooks',
        note: 'useState / useEffect / useRef / useMemo / useParams——组件状态与副作用主干。',
        patterns: [/useState\(/, /useEffect\(/, /useRef/, /useMemo/, /useParams/],
      },
      {
        id: 'types',
        label: '类型定义与类型标注',
        note: 'interface、联合类型、泛型与 as 断言。',
        patterns: [/^interface\s/, /^type\s/, /number\[\]/, /\bas\s+Row/],
      },
      {
        id: 'array',
        label: '数组与集合操作',
        note: 'map / filter / reduce / find / some / every / Set 去重与遍历。',
        patterns: [
          /\.reduce\(/, /\.filter\(/, /\.map\(/, /\.find\(/,
          /\.some\(/, /\.every\(/, /\.sort\(/, /new Set/, /forEach\(/, /for \(const/,
        ],
      },
      {
        id: 'async',
        label: '异步与数据请求',
        note: 'async / await、Promise.all 并发与 fetch 取JSON。',
        patterns: [/\bawait\b/, /\basync\b/, /Promise\./, /fetch\(/, /\.json\(\)/],
      },
      {
        id: 'template',
        label: '模板字符串与展开解构',
        note: '模板字符串插值、对象展开、数组与对象解构。',
        patterns: [/`\$\{/, /\.\.\./, /\{ id, name/],
      },
      {
        id: 'dom',
        label: '浏览器与 DOM',
        note: 'window / document 事件、localStorage 与元素尺寸读取。',
        patterns: [/window\./, /document\./, /localStorage/, /addEventListener/, /getBoundingClientRect/, /\bel\?\./, /\bel\./],
      },
      {
        id: 'runtime',
        label: '运行时与浏览器 API',
        note: '定时器、深拷贝、JSON 解析、Node 环境变量与随机 ID。',
        patterns: [/structuredClone/, /crypto\.randomUUID/, /process\.env/, /JSON\.parse/, /setInterval/, /clearTimeout/, /toUpperCase/],
      },
      {
        id: 'jsx',
        label: 'JSX 与样式对象',
        note: 'className、条件渲染与内联样式对象字面量。',
        // ⚠️ `=\s*\{\s*\w+:` 而不是 `=\{ color:` —— 真实词形是 `= { color: 'red', margin: 0 };`
        //   （`=` 与 `{` 之间有空格）。写死无空格版会静默漏词，由 selfCheck 的 residual 断言抓住。
        patterns: [/className/, /return <</, /<List/, /return <div/, /=\s*\{\s*color:/],
      },
      {
        id: 'safety',
        label: '错误与空值处理',
        note: '抛错、空值合并、三元表达式与可选链。',
        patterns: [/throw new Error/, /\?\?/, /\?\./, /\?\s+'/, /\?\s*\{/],
      },
      {
        id: 'module',
        label: '模块导出与环境常量',
        note: '默认导出、具名导出与基础地址常量。',
        patterns: [/^export\s/, /NODE_ENV/],
      },
      {
        id: 'event',
        label: '事件对象',
        note: '事件对象类型标注与阻止冒泡。',
        patterns: [/stopPropagation/, /Event\)/],
      },
    ],
    related: ['frontend'],
  },

  /* ── 云原生词汇 / K8s 词汇 ──────────────────────────────────────────────── */
  'cloud-native': {
    keyword: '云原生词汇',
    lede:
      '下面按职责归类的云原生词汇（K8s 词汇），全部来自本页词库，'
      + '词形与释义与下方完整词条列表逐条一致。',
    intro:
      '这份词库是 Kubernetes 与容器生态的核心名词，以小写连写的资源名与组件名为主：'
      + '`daemonset`、`configmap`、`readinessprobe`。这类词在 YAML 清单、'
      + 'kubectl 输出和故障排查记录里反复出现，但很少有人系统地按用途学过——'
      + '它们往往只记住了「见过」，不知道该归到哪一类。下面按在 K8s 里的职责分组，'
      + '排查问题时可以顺着组去回忆相关资源。',
    groups: [
      {
        id: 'cluster',
        label: '集群核心与控制循环',
        note: '编排系统本体、集群大脑、节点代理与引导工具，以及一切工作的控制循环。',
        words: ['kubernetes', 'controlplane', 'scheduler', 'kubelet', 'kubeadm', 'etcd', 'reconcile'],
      },
      {
        id: 'workload',
        label: '工作负载与发布',
        note: '不同形态的应用负载，以及它们的滚动发布与回滚。',
        words: ['replicaset', 'deployment', 'daemonset', 'statefulset', 'rollout', 'rollback', 'autoscaling'],
      },
      {
        id: 'config',
        label: '配置、存储与身份',
        note: '配置注入、持久化存储、命名空间隔离与集群内身份。',
        words: ['configmap', 'persistentvolume', 'namespace', 'serviceaccount', 'manifest', 'endpoint'],
      },
      {
        id: 'network',
        label: '流量与网关',
        note: '流量进集群的路径，以及出故障时的止损手段。',
        words: ['loadbalancer', 'gateway', 'sidecar', 'circuitbreaker'],
      },
      {
        id: 'runtime',
        label: '容器与运行时',
        note: '容器本身与节点上真正跑它的运行时。',
        words: ['container', 'containerd'],
      },
      {
        id: 'observability',
        label: '可观测性与探针',
        note: '集群状态的观测手段，以及决定「要不要重启它」的两类探针。',
        words: ['observability', 'telemetry', 'readinessprobe', 'livenessprobe'],
      },
    ],
    related: ['go-code', 'ai-core'],
  },

  /* ── 前端英语词汇 ───────────────────────────────────────────────────────── */
  frontend: {
    keyword: '前端英语词汇',
    lede:
      '下面按作用归类的前端英语词汇，全部来自本页词库，'
      + '词形与释义与下方完整词条列表逐条一致。',
    intro:
      '这份词库是前端工程里那些「文档里天天见、但没人专门背过」的词：'
      + '`treeShaking`、`debounce`、`polyfill`、`hydration`、`virtualdom`。'
      + '它们的共同点是含义高度依赖语境——同一个 hydration 在框架语境下是「水合」，'
      + '在别的语境下可能完全不同，所以只背中文释义常常不够。'
      + '下面按它们在工程里的作用分组，成组看能帮你把语境一起记住。',
    groups: [
      {
        id: 'render',
        label: '渲染模型与响应式',
        note: '框架如何把状态变成界面，以及更新时的生命周期与并发特性。',
        words: ['reactivity', 'virtualdom', 'hydration', 'lifecycle', 'suspense', 'concurrent', 'immutable'],
      },
      {
        id: 'perf',
        label: '性能优化手法',
        note: '减少计算、减少请求、减少产物体积。',
        words: ['memoization', 'debounce', 'throttle', 'treeShaking'],
      },
      {
        id: 'build',
        label: '构建、转译与兼容',
        note: '从源码到产物的加工环节，以及老浏览器兼容补丁。',
        words: ['bundler', 'transpile', 'polyfill'],
      },
      {
        id: 'arch',
        label: '组件与架构分层',
        note: '组件边界、中间件与数据访问层的职责划分。',
        words: ['component', 'middleware', 'repository', 'refactor'],
      },
      {
        id: 'delivery',
        label: '交付与异步',
        note: '把代码变成线上服务的过程，以及异步这一基础范式。',
        words: ['asynchronous', 'deployment'],
      },
    ],
    related: ['ts-code'],
  },
}

/** 本次做差异化内容的 5 个包（⛔ 刻意不含 ielts/kaoyan/toefl/cet4/cet6 与三个 ielts-*-vocab 单元源派生包）。 */
export const SCENED_BANK_IDS = Object.keys(BANK_SCENES)

/**
 * ⛔ 绝不允许被场景分组逻辑改动的包 ——ECDICT 大包与单元源派生包。
 *
 * 用途：`renderBankPage` 用它做一道**显式拒绝**：即便将来有人不小心把 ielts
 * 写进 BANK_SCENES，也不会真的生效（见 resolveScenes 的守卫）。
 * 单元源派生包（`ielts-*-vocab`）受「源 ⇄ 盘一致性门禁」约束 —— 那些词的
 * 描述层由 content-source/unit-source-*.json 派生，页面层再加工会让两层失配。
 */
export const UNTOUCHABLE_BANK_IDS = new Set([
  'ielts', 'kaoyan', 'toefl', 'cet4', 'cet6',
  'ielts-edu-01-vocab', 'ielts-env-02-vocab', 'ielts-tech-03-vocab',
])

/**
 * 把一个包的词条按场景归类。
 *
 * ⛔ 本函数是**纯函数**：不读盘、不写盘、不打日志、不修改传入的 words。
 *
 * 归类机制（详见 BANK_SCENES 头注）：
 *   · 有 `words` 的组 → 集合判定：`word` 精确命中即归组；
 *   · 有 `patterns` 的组 → 有序正则：自上而下首个命中即归组；
 *   · 两者都无命中的词条 → 进 `residual`（⛔ 正常情况必须为空）。
 *
 * 判定顺序：先走 `words` 组，再走 `patterns` 组。
 * 这是有意的 —— 单词型包的 `words` 是**精确白名单**（无歧义），
 * 应优先于正则；同一包内不会同时存在两种形态的组。
 *
 * @param {string} packageId 包 id
 * @param {Array<{word?:string, translation?:string}>} words 该包词条（原序）
 * @returns {{
 *   groups: Array<{id:string,label:string,note:string,items:Array<{word:string,translation:string,index:number}>}>,
 *   residual: Array<{word:string,index:number}>,
 *   declared: string[],
 *   unknown: string[],
 * }} `groups` 仅含实际有词的组（空组不进页面，避免"看起来有分组其实没词"）
 */
export function resolveScenes(packageId, words) {
  const spec = BANK_SCENES[String(packageId ?? '').trim()]
  const list = Array.isArray(words) ? words : []
  if (!spec) {
    return { groups: [], residual: [], declared: [], unknown: [] }
  }
  // ⛔ 守卫：显式拒绝被冻结的包（头注 UNTOUCHABLE_BANK_IDS）。
  if (UNTOUCHABLE_BANK_IDS.has(spec === null ? '' : String(packageId).trim())) {
    return { groups: [], residual: [], declared: [], unknown: [] }
  }

  const groups = []
  /** 已被某组认领的词条下标（用于算 residual + 检出「同词被多组重复认领」） */
  const claimed = new Array(list.length).fill(null)
  /** 声明过但词表里不存在的词形（内容演进后会转红，是有意的早期信号） */
  const unknown = []

  // ── 第 1 轮：精确词形（words） ──
  const wordSets = spec.groups.filter((g) => Array.isArray(g.words))
  const wordSeen = new Set()
  for (const g of wordSets) {
    for (const w of g.words) wordSeen.add(w)
  }
  for (let i = 0; i < list.length; i += 1) {
    const raw = String(list[i]?.word ?? '')
    if (!wordSeen.has(raw)) continue
    const g = wordSets.find((x) => x.words.includes(raw))
    if (!g || claimed[i] !== null) continue
    claimed[i] = g.id
    g.__items = g.__items ?? []
    g.__items.push({ word: raw, translation: String(list[i]?.translation ?? ''), index: i })
  }

  // ── 第 2 轮：有序正则（patterns） ──
  const patternGroups = spec.groups.filter((g) => Array.isArray(g.patterns))
  for (let i = 0; i < list.length; i += 1) {
    if (claimed[i] !== null) continue
    const text = String(list[i]?.word ?? '')
    if (!text) continue
    const hit = patternGroups.find((g) => g.patterns.some((re) => re.test(text)))
    if (!hit) continue
    claimed[i] = hit.id
    hit.__items = hit.__items ?? []
    hit.__items.push({
      word: text,
      translation: String(list[i]?.translation ?? ''),
      index: i,
    })
  }

  // ── 汇总：只导出非空组，保持声明顺序（确定性：同一份 words 每次结果逐字节相同） ──
  for (const g of spec.groups) {
    const items = g.__items ?? []
    if (items.length === 0) continue
    groups.push({ id: g.id, label: g.label, note: g.note, items })
    delete g.__items
  }

  const residual = []
  for (let i = 0; i < list.length; i += 1) {
    if (claimed[i] === null) {
      residual.push({ word: String(list[i]?.word ?? ''), index: i })
    }
  }

  // 声明了但词表里找不到的词形（只对 words 型分组有意义）
  for (const w of wordSeen) {
    if (!list.some((x) => String(x?.word ?? '') === w)) unknown.push(w)
  }

  const declared = spec.groups.map((g) => g.id)
  return { groups, residual, declared, unknown }
}

/**
 * 渲染「场景分组」区（不含外层<section>）。
 *
 * ⛔⛔ **绝不使用 `<dt>`**：门禁判据 12 用 `countRenderedEntries` 数`<dt>` 个数
 *   并断言它等于页面声明的「展示前 N 词」（见 gate-seo-pages.mjs 的
 *   countRenderedEntries 与判据 12）。若分组区复用 `<dt>`，实渲染条数会翻倍 ⇒
 *   「声明 50 ≠ 实渲染 100」⇒ 判据 12 转红。这里的分组是**索引**不是词条，
 *   用 `<li>` 表达，词条正文仍只由下方「词汇列表」的 `<dl>` 承载（SEO 完整性不受影响）。
 *
 * 词形一律过escapeHtml —— go-code / ts-code 的词条是整行代码，含 `<`/`&`/`"`（实测）。
 *
 * @param {object} input
 * @param {string} input.packageId
 * @param {Array<object>} input.words
 * @param {(v:unknown)=>string} input.escapeHtml
 * @returns {string} HTML 片段；无分组时返回空串
 */
export function renderSceneSection({ packageId, words, escapeHtml }) {
  const spec = BANK_SCENES[String(packageId ?? '').trim()]
  if (!spec) return ''
  const resolved = resolveScenes(packageId, words)
  if (resolved.groups.length === 0) return ''

  const total = Array.isArray(words) ? words.length : 0
  const groupCount = resolved.groups.length
  // 组内词形以 chip 形式逐个列出（word 本身，不重复 translation：完整释义在下方词条列表）
  const groupBlocks = resolved.groups
    .map((g) => {
      const chips = g.items
        .map((it) => `<li class="chip">${escapeHtml(it.word)}</li>`)
        .join('')
      return `        <section class="scene-group">
          <h3 class="scene-title">${escapeHtml(g.label)}<span class="scene-count">${g.items.length} 词</span></h3>
          <p class="scene-note">${escapeHtml(g.note)}</p>
          <ul class="chips">
${chips}
          </ul>
        </section>`
    })
    .join('\n')

  return `      <h2>术语对照与用法说明</h2>
      <p class="scene-lede">${escapeHtml(spec.lede)}</p>
      <p class="scene-intro">${escapeHtml(spec.intro)}</p>
      <p class="scene-count-total">下面 ${groupCount} 个场景分组覆盖本页全部 ${total} 个词条，
        分组依据是词条本身的用途（代码型词库按每行代码的职责归类，术语型词库按词形归类），不是人工随意编排。</p>
${groupBlocks}`
}

/**
 * 渲染「相关词库」内链区。
 *
 * ⛔ href **必须** 走 `canonicalBankUrl(siteOrigin, packageId)` 传入的同一函数
 *   （参数注入，避免本模块反向 import 生成器造成循环依赖）。
 *   canonical / og:url / sitemap `<loc>` / 门禁判据 5 四处同源是这个仓库的核心纪律；
 *   内链是第5 处，若自己拼字符串就会分叉，且 `.html` 会 308。
 *
 * @param {object} input
 * @param {string} input.packageId 当前包 id
 * @param {Record<string,string>} input.bankTitles 包 id → title（用于锚文本，取自各自 manifest，现算）
 * @param {(origin:string,id:string)=>string} input.canonicalBankUrl
 * @param {string} input.siteOrigin
 * @param {(v:unknown)=>string} input.escapeHtml
 * @returns {string} HTML 片段；无相关词库时返回空串
 */
export function renderRelatedSection({
  packageId,
  bankTitles,
  canonicalBankUrl,
  siteOrigin,
  escapeHtml,
}) {
  const id = String(packageId ?? '').trim()
  const spec = BANK_SCENES[id]
  if (!spec || typeof canonicalBankUrl !== 'function') return ''
  const titles = bankTitles && typeof bankTitles === 'object' ? bankTitles : {}
  const links = spec.related
    .map((rid) => {
      const title = String(titles[rid] ?? '').trim()
      const href = canonicalBankUrl(siteOrigin, rid)
      const label = title === '' ? rid : `${title}（${escapeHtml(rid)}）`
      return `          <li><a class="rel-link" href="${escapeHtml(href)}">${escapeHtml(label)}</a></li>`
    })
    .join('\n')
  if (links === '') return ''

  return `      <h2>相关词库</h2>
      <p class="scene-note">这几个词库在真实工作里常一起出现，可以连着练：
        后端服务与运维、推理任务与集群、前端框架与工程化词各成一条线。</p>
      <ul class="rel-list">
${links}
      </ul>`
}

/* ─────────────────────────────── 自检段 ──────────────────────────────── */

/**
 * 自检：逐包现算分组覆盖率，打印每组实际条数。
 *
 * ⛔ 断言 `residual.length === 0`（无遗漏）与 `unknown.length === 0`（无过期声明）。
 *   任一不成立 ⇒ 分组规则与内容已失配，必须先修规则再上线。
 *   直接运行本文件即可：`node scripts/seo/bank-scenes.mjs`
 */
export function selfCheck(vocabDir) {
  const results = []
  let failed = false
  for (const id of SCENED_BANK_IDS) {
    const file = `${vocabDir}/${id}/words.json`
    // eslint-disable-next-line no-undef
    const words = JSON.parse(readFileSync(file, 'utf8'))
    const r = resolveScenes(id, words)
    const assigned = r.groups.reduce((s, g) => s + g.items.length, 0)
    const ok = r.residual.length === 0 && r.unknown.length === 0 && assigned === words.length
    if (!ok) failed = true
    results.push({ id, total: words.length, assigned, residual: r.residual, unknown: r.unknown, groups: r.groups, ok })
  }
  console.log('[bank-scenes] 场景分组自检（词形现算，非声明）')
  for (const r of results) {
    console.log(`\n  ${r.id} · 共 ${r.total} 词 · 已归组 ${r.assigned} · ${r.ok ? '✅ 无遗漏' : '❌ 有缺口'}`)
    for (const g of r.groups) {
      console.log(`    · ${g.label.padEnd(14, ' ')} ${String(g.items.length).padStart(3)} 词`)
    }
    if (r.residual.length > 0) {
      console.log(`    ⛔ 未归组 ${r.residual.length} 条：${r.residual.map((x) => x.word).join(' | ')}`)
    }
    if (r.unknown.length > 0) {
      console.log(`    ⛔ 声明但词表不存在 ${r.unknown.length} 条：${r.unknown.join(' | ')}`)
    }
  }
  if (failed) {
    console.error('\n[bankscenes]❌ 分组与词表失配：必须补规则（不得把残词硬塞进某组）')
    process.exitCode = 1
  } else {
    console.log(`\n[bank-scenes] ✅ ${results.length} 个包全部词条 100% 归组，无过期声明`)
  }
  return { failed, results }
}

import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invoked) selfCheck(join(ROOT, 'content', 'vocabulary'))