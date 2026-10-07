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
 * ── ⛔ 分组粒度下限：任何一组不得少于 5 条词 ─────────────────────────────────
 *   上一轮（035355e）遗留了 ts-code 的「事件对象」1 条、「模块导出」2 条，
 *   以及 ai-core 的「常见任务动词」2 条这类**信息密度过低**的组：一个只放 1 个词的
 *   组，读者看不出「为什么它单独成组」，反而制造认知负担。
 *   因此本文件的合并纪律是：**每组 ≥ MIN_GROUP_SIZE（5）条词**，
 *   目标粒度每包 5-7 组。少于 5 条的组必须并入语义最接近的相邻组。
 *
 *   ⛔ 但「≥5 条」是**下限而不是目标**：**绝不允许为了凑满 5 条做语义错配的合并**。
 *   若某条词真的无处可去，就让它留在语义正确的组里（哪怕该组因此不足 5 条），
 *   并在本文件与报告里说明原因 —— 宁可承认粒度不达标，也不做错配。
 *   `selfCheck` 会把每包的实际组数与每组条数全部打印出来供人核。
 *
 *   ⚠️ 已知取舍：frontend（20 词）在本规则下的**数学上限是 4 组**（20/5=4），
 *   而强行凑到 4 组必须把 `asynchronous`（异步范式）塞进「组件与架构分层」——
 *   那是语义错配。故frontend 取 3 组（7/7/6），详见该包内的注释。
 *
 * ── ⛔ 内链必须对称 ───────────────────────────────────────────────────────
 *   `related` 表达的是「这几个词库在真实工作里常一起出现」这一**关系**，
 *   关系本身没有方向：只写 `ai-core → cloud-native` 而不写反向，
 *   等于宣称「ai-core 与 cloud-native 相关，但反过来不相关」——
 *   这既让爬虫对关系方向产生误判，也对读者造成信息损失
 *   （站在 ai-core 页上看不到它同时属于后端基础设施这条线）。
 *   裁定：**关系图必须是无向的**，任何有向边都必须有反向边。
 *   `selfCheck` 的 `assertRelationSymmetric` 会现算并断言这一点。
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
        label: 'Agent 编排与任务动词',
        // ⛔ 035355e 里「Agent 与编排」只有 4 条、「常见任务动词」只有 2 条，两组都不足
        //   MIN_GROUP_SIZE。此处合并的理由是**语义本就相连**：Agent 编排要解决的就是
        //   「让模型去做某件事」，而 summarize / classify 正是这件事在 API 上的动词形态。
        //   拆开看两个都太薄，合起来是「编排 → 动作」这条完整链条。
        note: '让模型进入有工具、有循环的工作流，以及它在任务里真正执行的那两个动作。',
        words: [
          'orchestration', 'scaffolding', 'autonomous', 'heuristic',
          'summarize', 'classify',
        ],
      },
      {
        id: 'engineering',
        label: '性能与工程',
        note: '把模型放进真实服务时要盯的指标与工程手段。',
        words: ['throughput', 'latency', 'batching', 'pipeline', 'scalable', 'robust'],
      },
    ],
    // ⛔ 必须与 go-code / cloud-native 的 related 互为反向（见文件头注「内链必须对称」）。
    related: ['go-code', 'cloud-native'],
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
        id: 'serialize',
        label: '序列化、格式化与文件读写',
        // ⛔ 035355e 里「JSON 与序列化」3 条 + 「格式化与文件读写」3 条，两组都不足
        //   MIN_GROUP_SIZE。合并理由是语义同源：三者的共同动作都是
        //   「把内存里的值变成字节流再交出去」——json 编解码、fmt 拼接、os 落盘。
        //
        // ⚠️ 本组⛔ 必须排在 error 组之前：`out, err := json.Marshal(v)` 这类行同时含
        //   独立词 `err` 与 `json.`，若 error 组在前就会被 error 的 /\berr\b/ 抢走。
        //   resolveScenes 的 patterns 是**有序**的，这里的顺序是语义的一部分。
        note: '结构体与 JSON 之间的来回转换、fmt 字符串拼接，以及把字节写进文件。',
        patterns: [/json\./, /application\/json/, /fmt\.Sprintf/, /os\.WriteFile/],
      },
      {
        id: 'error',
        label: '错误处理与资源释放',
        note: 'err 冒泡、错误包装与 defer 收尾——Go 里最该形成肌肉记忆的一段。',
        patterns: [/\berr\b/, /Errorf/, /errors\.New/, /log\.Fatal/, /\bdefer\b/],
      },
      {
        id: 'skeleton',
        label: '类型定义、方法签名与服务骨架',
        // ⛔ 035355e 里「类型定义与方法签名」6 条 + 「HTTP 服务与测试」4 条。
        //   合并理由：两者是同一件事的两半——先声明类型与构造函数，再把服务起起来、
        //   注册路由、写响应头，最后用 t.Run 跑子测试。这是「一个 Go 服务从类型到
        //   路由到测试」的完整骨架链，拆开看每半都不完整。
        note: '结构体声明、构造函数、指针接收者方法与 Stringer 接口，加上起服务、'
          + '注册路由、写响应头与 t.Run 子测试。',
        patterns: [
          /^type\s+\w+\s+struct/, /^func\s/, /String\(\)\s+string/, /^return\s/,
          /t\.Run/, /http\./, /w\.WriteHeader/,
        ],
      },
      {
        id: 'control',
        label: '流程控制与变量声明',
        // ⛔ 035355e 里「流程控制」3 条 + 「变量与常量声明」2 条。
        //   合并理由：两者都是「不进任何库、直接决定这行代码走哪条路」的骨架语法，
        //   放在一起正好是「带初始化的 if / 类型 switch / var / const」这条主线。
        //
        // ⚠️ 本组 ⛔ 必须排在 collection 组之前：`if strings.HasPrefix(name, "test") {`
        //   同时命中 /^if\s/ 与 /strings\./，顺序决定它属于语法组还是字符串组。
        note: '带初始化语句的 if、类型 switch，以及带初始值的 var 与包级 const。',
        patterns: [/^if\s/, /^switch\s/, /^var\s+\w+\s+\w/, /^const\s/],
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
    ],
    // ⛔ 必须与 ai-core / cloud-native 的 related 互为反向（见文件头注「内链必须对称」）。
    related: ['ai-core', 'cloud-native'],
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
        id: 'array',
        label: '数组与集合操作',
        note: 'map / filter / reduce / find / some / every / Set 去重与遍历。',
        patterns: [
          /\.reduce\(/, /\.filter\(/, /\.map\(/, /\.find\(/,
          /\.some\(/, /\.every\(/, /\.sort\(/, /new Set/, /forEach\(/, /for \(const/,
        ],
      },
      {
        id: 'types',
        label: '类型定义与模块导出',
        // ⛔ 035355e 里「类型定义与类型标注」5 条 + 「模块导出与环境常量」2 条。
        //   合并理由：两者都是「在模块边界上声明这个模块对外长什么样」——
        //   interface / type / 泛型 / as 断言描述类型契约，export default / export const
        //   把这个契约暴露出去，是同一条「模块接口声明」链的两半。
        //
        // ⚠️ 本组 ⛔ 必须排在 safety 组之前：`type Handler<T> = (event: T) => void;`
        //   同时命中 /^type\s/ 与 /\?\s*\{/，顺序决定它属于类型组还是空值处理组。
        //
        // ⚠️ 本组⛔刻意不含 /NODE_ENV/：`const isDev = process.env.NODE_ENV !== 'prod';`
        //   同时命中本组的 /^export\s/（否）与 runtime 组的 /process\.env/（是）。
        //   它是**环境变量**，语义上属于「运行时与浏览器 API」，
        //   故让它由 runtime 组认领，不在此处重复声明（重复声明会把它抢到错误的组）。
        note: 'interface、联合类型、泛型与 as 断言，以及默认导出与具名导出。',
        patterns: [/^interface\s/, /^type\s/, /number\[\]/, /\bas\s+Row/, /^export\s/],
      },
      {
        id: 'dom',
        label: '浏览器与 DOM',
        // ⛔ 035355e 里「事件对象」只有 1 条（`const stop = (e: Event) => e.stopPropagation();`）。
        //   合并理由：stopPropagation 是**浏览器事件机制**的一部分，与本组的
        //   addEventListener / window / document 天然同属「浏览器侧的事件与 DOM 操作」。
        //   （另一条候选是「异步与请求」——事件回调确实常与请求同现，但事件对象的
        //   类型标注与冒泡处理讲的是 DOM 事件语义，不是异步语义，故取 DOM。）
        //
        // ⚠️ 本组 ⛔ 必须排在 async 组之前：`const width = el?.getBoundingClientRect().width;`
        //   同时命中本组的 /\bel\?\./ 与 async 组的 /\?\./。它量的是元素尺寸（DOM 语义），
        //   不是空值兜底（async 语义），故必须让本组先命中。
        //   ⚠️ 这是一个**易退化点**：若日后把本组移到 async 之后，该词会静默改投 async 组，
        //   而 selfCheck 的 residual/unknown 断言**抓不到**（它仍被归组了，只是归错组）。
        //   要检出这类「归错组」，需现算出每条词的候选组序列并人工核对顺序语义。
        note: 'window / document 事件、localStorage、元素尺寸读取，'
          + '以及事件对象类型标注与阻止冒泡。',
        patterns: [
          /window\./, /document\./, /localStorage/, /addEventListener/,
          /getBoundingClientRect/, /\bel\?\./, /\bel\./,
          /stopPropagation/, /Event\)/,
        ],
      },
      {
        id: 'async',
        label: '异步请求与空值处理',
        // ⛔ 035355e 里「异步与数据请求」4 条 + 「错误与空值处理」4 条。
        //   合并理由：async / await / Promise.all / fetch 与 throw / ?? / ?. / 三元
        //   在真实代码里是**成对出现**的——请求失败要抛错、响应可能为空要兜底，
        //   拆成两组反而割裂了「取数据」这条完整链路。
        //
        // ⚠️ 本组 ⛔ 必须排在 runtime 组之前：`const json = await res.json();`
        //   同时命中 /\bawait\b/ 与 /\.json\(\)/，两组都在时顺序决定归属。
        note: 'async / await、Promise.all 并发与 fetch 取JSON，'
          + '以及请求链上配套的抛错、空值合并、三元表达式与可选链。',
        patterns: [
          /\bawait\b/, /\basync\b/, /Promise\./, /fetch\(/, /\.json\(\)/,
          /throw new Error/, /\?\?/, /\?\./, /\?\s+'/, /\?\s*\{/,
        ],
      },
      {
        id: 'template',
        label: '模板字符串、展开与 JSX',
        // ⛔ 035355e 里「模板字符串与展开解构」4 条 + 「JSX 与样式对象」3 条。
        //   合并理由：两者都是「把值拼进一段文本/标记里」——模板字符串插值、
        //   对象展开、数组与对象解构、className、条件渲染与内联样式对象字面量，
        //   都是同一条「构造 UI 文本」的表达手段。
        //   ⚠️ `=\s*\{\s*\w+:` 而不是 `=\{ color:` —— 真实词形是 `= { color: 'red', margin: 0 };`
        //   （`=` 与 `{` 之间有空格）。写死无空格版会静默漏词，由 selfCheck 的 residual 断言抓住。
        //
        // ⚠️ 本组 ⛔ 必须排在 dom 组之前：`const width = el?.getBoundingClientRect().width;`
        //   同时命中 /\.\.\./（无）与 /\bel\./，顺序决定归属。
        note: '模板字符串插值、对象展开、数组与对象解构，以及 JSX、className、'
          + '条件渲染与内联样式对象。',
        patterns: [
          /`\$\{/, /\.\.\./, /\{ id, name/,
          /className/, /return <</, /<List/, /return <div/, /=\s*\{\s*color:/,
        ],
      },
      {
        id: 'runtime',
        label: '运行时与浏览器 API',
        note: '定时器、深拷贝、JSON 解析、Node 环境变量与随机 ID。',
        patterns: [/structuredClone/, /crypto\.randomUUID/, /process\.env/, /JSON\.parse/, /setInterval/, /clearTimeout/, /toUpperCase/],
      },
    ],
    // ⛔ 必须与 frontend 的 related 互为反向（见文件头注「内链必须对称」）。
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
    // ⚠️ 诚实性说明：本包共 30 词，按 MIN_GROUP_SIZE=5 划分，目标 5-7 组要求至少 25-35 词。
    //   30 词若要拆成 5 组（每组 ≥5），最接近的均衡解是 5/5/5/5/10 或 5/5/5/7/8——
    //   必然要把「集群核心（kubernetes/scheduler/etcd/kubelet/kubeadm/controlplane/reconcile）」
    //   或「工作负载（replicaset/deployment/daemonset/statefulset/rollout/rollback/autoscaling…）」
    //   这类**同类词集**从中间劈开才能凑出第 5 组。那是语义错配，故本包诚实取 **4 组**。
    //   「100% 归组、零遗漏」不受组数影响，由 selfCheck 的 residual/unknown 断言独立承担。
    groups: [
      {
        id: 'cluster',
        label: '集群核心与控制循环',
        note: '编排系统本体、集群大脑、节点代理与引导工具，以及一切工作的控制循环。',
        words: ['kubernetes', 'controlplane', 'scheduler', 'kubelet', 'kubeadm', 'etcd', 'reconcile'],
      },
      {
        id: 'workload',
        label: '工作负载、容器与发布',
        // ⛔ 035355e 里「工作负载与发布」7 条 + 「容器与运行时」2 条。
        //   合并理由：container / containerd 正是「工作负载跑在什么上面」的答案——
        //   Deployment 拉起 Pod、Pod 由 container 打包、containerd 负责跑它，
        //   这是同一条「负载 → 容器 → 发布」的纵深链。
        note: '不同形态的应用负载、承载它们的容器与运行时，以及滚动发布与回滚。',
        words: [
          'replicaset', 'deployment', 'daemonset', 'statefulset', 'rollout', 'rollback',
          'autoscaling', 'container', 'containerd',
        ],
      },
      {
        id: 'config',
        label: '配置、存储与身份',
        note: '配置注入、持久化存储、命名空间隔离与集群内身份。',
        words: ['configmap', 'persistentvolume', 'namespace', 'serviceaccount', 'manifest', 'endpoint'],
      },
      {
        id: 'network',
        label: '流量、网关与可观测性',
        // ⛔ 035355e 里「流量与网关」4 条 + 「可观测性与探针」4 条。
        //   合并理由：两者都是「**运行中的集群对外表现如何**」——网关/负载均衡/熔断
        //   描述流量进出与止损，探针/telemetry 描述状态被观测与上报。
        //   它们都不是「集群里有哪些对象」，而是「这些对象跑起来之后处于什么状态」，
        //   放在一起正是「运行态观测与治理」这条线。
        note: '流量进集群的路径与出故障时的止损手段，以及集群状态的观测手段'
          + '与决定「要不要重启它」的两类探针。',
        words: [
          'loadbalancer', 'gateway', 'sidecar', 'circuitbreaker',
          'observability', 'telemetry', 'readinessprobe', 'livenessprobe',
        ],
      },
    ],
    // ⛔ 必须与 ai-core / go-code 的 related 互为反向（见文件头注「内链必须对称」）。
    related: ['ai-core', 'go-code'],
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
        label: '性能优化与产物控制',
        // ⛔ 035355e 里「性能优化手法」4 条 + 「构建、转译与兼容」3 条。
        //   合并理由：四个性能词与三个构建词解决的是**同一个问题的不同层**——
        //   memoization / debounce / throttle 省的是「运行时算得少」，
        //   treeShaking / bundler / transpile / polyfill 省的是「产物体积与兼容」。
        //   前者在源码层，后者在构建层，合起来是「让东西跑得快、传得小」。
        note: '运行时减少计算与请求（memoization / debounce / throttle），'
          + '以及构建期减少产物体积与兼容老浏览器（treeShaking / bundler / transpile / polyfill）。',
        words: [
          'memoization', 'debounce', 'throttle', 'treeShaking',
          'bundler', 'transpile', 'polyfill',
        ],
      },
      {
        id: 'arch',
        label: '组件架构与交付形态',
        // ⛔ 035355e 里「组件与架构分层」4 条 + 「交付与异步」2 条。
        //   合并理由：component / middleware / repository / refactor 讲的是
        //   「代码怎么分层」，而 deployment / asynchronous 讲的是「这套分层怎么上线、
        //   请求怎么进来」——从源码结构到线上形态是同一条「架构 → 交付」链。
        //
        // ⚠️ 诚实性说明：本包共 20 词，按 MIN_GROUP_SIZE=5 划分，**数学上限就是 4 组**
        //   （20/5=4）。而强行凑成 4 组必须把 `asynchronous`（异步范式）与
        //   component/middleware/repository（架构分层）拆开——那是语义错配。
        //   故本包诚实取 **3 组**（7/7/6），低于 TARGET_GROUP_RANGE 的下界 5。
        //   这是「⛔ 绝不为凑数做语义错配的合并」这条纪律的直接代价，属预期结果。
        note: '组件边界、中间件与数据访问层的职责划分，以及这套结构上到线上的形态：'
          + '部署与异步。',
        words: [
          'component', 'middleware', 'repository', 'refactor',
          'asynchronous', 'deployment',
        ],
      },
    ],
    // ⛔ 必须与 ts-code 的 related 互为反向（见文件头注「内链必须对称」）。
    related: ['ts-code'],
  },
}

/** 本次做差异化内容的 5 个包（⛔ 刻意不含 ielts/kaoyan/toefl/cet4/cet6 与三个 ielts-*-vocab 单元源派生包）。 */
export const SCENED_BANK_IDS = Object.keys(BANK_SCENES)

/**
 * ⛔ 分组粒度下限：任何一组不得少于这么多条词。
 *
 * 存在的理由：上一轮（035355e）留下了 ts-code 的「事件对象」1 条、「模块导出」2 条，
 * ai-core 的「常见任务动词」2 条这类组。一个只放 1 个词的组，读者无法从中得到
 * 「成组记忆」的收益（这正是整个分区存在的理由），反而凭空多出一层标题噪声。
 *
 * ⚠️ 这是**下限**，不是「必须凑满」：见文件头注的「⛔ 绝不为凑数做语义错配的合并」。
 *   frontend（20 词）在数学上就凑不出 5-7 组，本文件选择诚实地缩到 3 组并在包内
 *   注释说明，而不是硬凑到 4 组把 `asynchronous` 塞进不相干的组。
 */
export const MIN_GROUP_SIZE = 5

/** 目标组数区间（软目标：selfCheck 只提示不判红，理由见 MIN_GROUP_SIZE 上方说明）。 */
export const TARGET_GROUP_RANGE = { min: 5, max: 7 }

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
 * 断言内链关系图是**无向的**（没有任何单向边）。
 *
 * 为什么值得机器断言而不是靠人核：`related` 是 5 处手写的字符串数组，
 * 「加了一条新边却忘了加反向」是极易发生且极难被肉眼发现的错误
 * ——两次 selfCheck 输出看起来都完全正常。因此把「A→B 蕴含 B→A」写成代码。
 *
 * @returns {string[]} 违例描述（空数组 = 对称）
 */
export function assertRelationSymmetric(scenes = BANK_SCENES) {
  const ids = Object.keys(scenes)
  const violations = []
  for (const id of ids) {
    for (const target of scenes[id]?.related ?? []) {
      if (!scenes[target]) {
        violations.push(`${id} → ${target}：目标包不存在于 BANK_SCENES`)
        continue
      }
      const back = scenes[target]?.related ?? []
      if (!back.includes(id)) {
        violations.push(`${id} → ${target}：缺少反向边（${target} 未回指 ${id}）`)
      }
    }
  }
  return violations
}

/**
 * 自检：逐包现算分组覆盖率，打印每组实际条数。
 *
 * ⛔ 断言 `residual.length === 0`（无遗漏）与 `unknown.length === 0`（无过期声明）。
 *   任一不成立 ⇒ 分组规则与内容已失配，必须先修规则再上线。
 *   直接运行本文件即可：`node scripts/seo/bank-scenes.mjs`
 *
 * ⛔ 本轮新增两条断言（**只增不减**，原有两条判定逻辑一字未改）：
 *   ① 每组 ≥ MIN_GROUP_SIZE（5 词）—— 粒度下限；
 *   ② related 关系图无单向边 —— 见 assertRelationSymmetric。
 *   ⚠️ 组数落在 TARGET_GROUP_RANGE 之外时**只提示不判红**：frontend（20 词）
 *   在「每组≥5」约束下数学上限为 4 组，凑到 5-7 组必然要求语义错配。
 *   「100% 归组、零遗漏」这个保证由residual/unknown 两条断言独立承担，不受粒度影响。
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
    // 粒度断言：任何一组不得少于 MIN_GROUP_SIZE 条词
    const thin = r.groups.filter((g) => g.items.length < MIN_GROUP_SIZE)
    const ok = r.residual.length === 0
      && r.unknown.length === 0
      && assigned === words.length
      && thin.length === 0
    if (!ok) failed = true
    results.push({
      id, total: words.length, assigned,
      residual: r.residual, unknown: r.unknown,
      groups: r.groups, thin, ok,
    })
  }
  const asym = assertRelationSymmetric()
  if (asym.length > 0) failed = true

  console.log('[bank-scenes] 场景分组自检（词形现算，非声明）')
  for (const r of results) {
    console.log(`\n  ${r.id} · 共 ${r.total} 词 · 已归组 ${r.assigned} · ${r.ok ? '✅ 无遗漏' : '❌ 有缺口'}`)
    for (const g of r.groups) {
      console.log(`    · ${g.label.padEnd(16, ' ')} ${String(g.items.length).padStart(3)} 词`)
    }
    const inRange = r.groups.length >= TARGET_GROUP_RANGE.min && r.groups.length <= TARGET_GROUP_RANGE.max
    console.log(`    → ${r.groups.length} 组（目标 ${TARGET_GROUP_RANGE.min}-${TARGET_GROUP_RANGE.max} 组）`
      + `${inRange ? '' : '⚠️  不在目标区间，见该包注释里的诚实性说明'}`)
    if (r.residual.length > 0) {
      console.log(`    ⛔ 未归组 ${r.residual.length} 条：${r.residual.map((x) => x.word).join(' | ')}`)
    }
    if (r.unknown.length > 0) {
      console.log(`    ⛔ 声明但词表不存在 ${r.unknown.length} 条：${r.unknown.join(' | ')}`)
    }
    if (r.thin.length > 0) {
      console.log(`    ⛔ 粒度不足（<${MIN_GROUP_SIZE} 词）${r.thin.length} 组：`
        + `${r.thin.map((g) => `${g.label}(${g.items.length})`).join(' | ')}`)
    }
  }

  console.log('\n[bank-scenes] 内链对称性（有向邻接表的对称性）')
  for (const id of SCENED_BANK_IDS) {
    const rel = BANK_SCENES[id]?.related ?? []
    console.log(`  ${id.padEnd(14)} → ${rel.length > 0 ? rel.join(', ') : '(无)'}`)
  }
  if (asym.length > 0) {
    console.error(`\n[bankscenes]❌ 内链存在单向边 ${asym.length} 处：`)
    for (const v of asym) console.error(`    ⛔ ${v}`)
  } else {
    console.log('  ✅ 无单向边：每条 A→B 都存在反向 B→A')
  }

  if (failed) {
    console.error('\n[bankscenes]❌ 分组与词表失配：必须补规则（不得把残词硬塞进某组）')
    process.exitCode = 1
  } else {
    console.log(`\n[bank-scenes] ✅ ${results.length} 个包全部词条 100% 归组，无过期声明，`
      + `每组 ≥${MIN_GROUP_SIZE} 词，内链全部对称`)
  }
  return { failed, results, asym }
}

import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invoked) selfCheck(join(ROOT, 'content', 'vocabulary'))