import { CET4, CET6 } from './englishBanks'
import { TS_CODE } from './code/ts'
import { GO_CODE } from './code/go'

export interface WordItem {
  word: string
  translation: string
  /** 音标（ECDICT phonetic 原样字符串，由生成脚本注入；code 词库无音标） */
  phonetic?: string
  /** 英文释义（ECDICT 提供，雅思词库有） */
  definition?: string
}

export interface WordBank {
  id: string
  name: string
  description: string
  /** 英文词库名（en 语言模式下优先显示） */
  nameEn?: string
  descriptionEn?: string
  icon: string
  words: WordItem[]
  /**
   * 大词库异步加载器：words 为空数组占位，首次选中时动态 import 分包。
   * 小词库仍直接持有 words。加载结果缓存在模块级 bankCache，切换不重复请求。
   */
  load?: () => Promise<WordItem[]>
  /** 词数元数据（懒加载词库 words 为占位空数组时，下拉等处显示用） */
  count?: number
}

/** 懒加载词库的模块级缓存：bankId → 已加载词条，二次切换不再请求 */
const bankCache = new Map<string, WordItem[]>()

/** 读取词库当前可用词条：缓存优先，未加载的懒加载词库返回占位空数组 */
export function bankWordsOf(bank: WordBank): WordItem[] {
  return bankCache.get(bank.id) ?? bank.words
}

/** 已加载词集合（所有同步词库 + 缓存中的懒加载词库），供复习轮等需要全量映射处使用 */
export function allLoadedWords(banks: WordBank[]): WordItem[] {
  return banks.flatMap((b) => bankWordsOf(b))
}

/** 确保词库已加载并缓存，返回词条（无 load 的词库直接返回 words） */
export async function ensureBankWords(bank: WordBank): Promise<WordItem[]> {
  const hit = bankCache.get(bank.id)
  if (hit) return hit
  if (!bank.load) return bank.words
  const words = await bank.load()
  bankCache.set(bank.id, words)
  return words
}

/** 2026 · 大模型与 AI 工程师核心词库 */
const AI_CORE: WordItem[] = [
  { word: 'transformer', translation: '变换器架构 / Transformer 架构' },
  { word: 'attention', translation: '注意力机制' },
  { word: 'embedding', translation: '嵌入向量' },
  { word: 'tokenizer', translation: '分词器' },
  { word: 'inference', translation: '推理（模型前向预测）' },
  { word: 'quantization', translation: '量化（降低精度压缩模型）' },
  { word: 'fine-tuning', translation: '微调' },
  { word: 'temperature', translation: '温度参数（控制采样随机性）' },
  { word: 'hallucination', translation: '幻觉（模型编造事实）' },
  { word: 'retrieval', translation: '检索（RAG 中的召回环节）' },
  { word: 'grounding', translation: '事实锚定 / 可溯源性' },
  { word: 'distillation', translation: '知识蒸馏' },
  { word: 'perplexity', translation: '困惑度' },
  { word: 'benchmark', translation: '基准测试' },
  { word: 'guardrail', translation: '安全护栏' },
  { word: 'alignment', translation: '对齐（让模型符合人类意图）' },
  { word: 'checkpoint', translation: '检查点 / 权重快照' },
  { word: 'orchestration', translation: '编排（多智能体调度）' },
  { word: 'scaffolding', translation: '脚手架（Agent 外层工程结构）' },
  { word: 'throughput', translation: '吞吐量' },
  { word: 'latency', translation: '延迟' },
  { word: 'batching', translation: '批处理' },
  { word: 'pipeline', translation: '流水线' },
  { word: 'evaluate', translation: '评估' },
  { word: 'summarize', translation: '摘要' },
  { word: 'classify', translation: '分类' },
  { word: 'rerank', translation: '重排序' },
  { word: 'chunking', translation: '文本分块' },
  { word: 'vector', translation: '向量' },
  { word: 'semantic', translation: '语义的' },
  { word: 'reasoning', translation: '推理能力 / 思维链' },
  { word: 'autonomous', translation: '自主的' },
  { word: 'iterate', translation: '迭代' },
  { word: 'scalable', translation: '可扩展的' },
  { word: 'robust', translation: '稳健的 / 鲁棒的' },
  { word: 'heuristic', translation: '启发式的' },
  { word: 'threshold', translation: '阈值' },
  { word: 'gradient', translation: '梯度' },
  { word: 'optimizer', translation: '优化器' },
  { word: 'regularization', translation: '正则化' },
  { word: 'overfitting', translation: '过拟合' },
  { word: 'generalize', translation: '泛化' },
  { word: 'convergence', translation: '收敛' },
]

/** 云原生 / Kubernetes 核心词库（贴合自建集群实操） */
const CLOUD_NATIVE: WordItem[] = [
  { word: 'kubernetes', translation: '容器编排系统' },
  { word: 'containerd', translation: '容器运行时' },
  { word: 'namespace', translation: '命名空间' },
  { word: 'replicaset', translation: '副本集' },
  { word: 'deployment', translation: '无状态应用部署对象' },
  { word: 'daemonset', translation: '守护进程集' },
  { word: 'statefulset', translation: '有状态应用集' },
  { word: 'configmap', translation: '配置映射' },
  { word: 'persistentvolume', translation: '持久化存储卷' },
  { word: 'scheduler', translation: '调度器' },
  { word: 'etcd', translation: '分布式键值存储（集群大脑）' },
  { word: 'endpoint', translation: '端点' },
  { word: 'kubelet', translation: '节点代理组件' },
  { word: 'kubeadm', translation: '集群引导工具' },
  { word: 'controlplane', translation: '控制平面' },
  { word: 'autoscaling', translation: '自动扩缩容' },
  { word: 'readinessprobe', translation: '就绪探针' },
  { word: 'livenessprobe', translation: '存活探针' },
  { word: 'loadbalancer', translation: '负载均衡器' },
  { word: 'serviceaccount', translation: '服务账号' },
  { word: 'observability', translation: '可观测性' },
  { word: 'telemetry', translation: '遥测数据' },
  { word: 'container', translation: '容器' },
  { word: 'manifest', translation: '资源清单文件' },
  { word: 'reconcile', translation: '调和 / 控制循环' },
  { word: 'rollout', translation: '滚动发布' },
  { word: 'rollback', translation: '回滚' },
  { word: 'circuitbreaker', translation: '熔断' },
  { word: 'sidecar', translation: '边车容器' },
  { word: 'gateway', translation: '网关' },
]

/** 前端 / 工程化高频词库 */
const FRONTEND: WordItem[] = [
  { word: 'asynchronous', translation: '异步的' },
  { word: 'component', translation: '组件' },
  { word: 'middleware', translation: '中间件' },
  { word: 'repository', translation: '仓库 / 知识库' },
  { word: 'deployment', translation: '部署' },
  { word: 'hydration', translation: '水合（SSR 客户端激活）' },
  { word: 'memoization', translation: '记忆化缓存' },
  { word: 'immutable', translation: '不可变的' },
  { word: 'debounce', translation: '防抖' },
  { word: 'throttle', translation: '节流' },
  { word: 'refactor', translation: '重构' },
  { word: 'polyfill', translation: '特性补丁' },
  { word: 'treeShaking', translation: '摇树优化' },
  { word: 'bundler', translation: '打包器' },
  { word: 'transpile', translation: '转译' },
  { word: 'reactivity', translation: '响应式' },
  { word: 'virtualdom', translation: '虚拟 DOM' },
  { word: 'lifecycle', translation: '生命周期' },
  { word: 'suspense', translation: '悬念 / 异步边界' },
  { word: 'concurrent', translation: '并发的' },
]

export const WORD_BANKS: WordBank[] = [
  {
    id: 'ai-core',
    name: '2026 AI 核心词库',
    description: '大模型 / AI 工程师高频词汇',
    icon: 'Sparkles',
    words: AI_CORE,
  },
  {
    id: 'cloud-native',
    name: '云原生 K8s 词库',
    description: 'Kubernetes 与容器生态',
    icon: 'Boxes',
    words: CLOUD_NATIVE,
  },
  {
    id: 'frontend',
    name: '前端工程化词库',
    description: 'React / 构建工具高频词',
    icon: 'Code2',
    words: FRONTEND,
  },
  {
    id: 'cet4',
    name: '四级 CET-4',
    description: '大学英语四级高频核心词',
    icon: 'GraduationCap',
    words: CET4,
  },
  {
    id: 'cet6',
    name: '六级 CET-6',
    description: '大学英语六级进阶词',
    icon: 'ScrollText',
    words: CET6,
  },
  {
    id: 'ielts',
    name: '雅思核心 IELTS',
    nameEn: 'IELTS Core',
    description: 'ECDICT 雅思核心 3000 词（按词频排序）',
    descriptionEn: 'IELTS core 3000 words from ECDICT (by frequency)',
    icon: 'Globe',
    words: [],
    count: 3000,
    load: () => import('./ielts').then((m) => m.IELTS),
  },
  {
    id: 'kaoyan',
    name: '考研核心',
    nameEn: 'KAoyan Core',
    description: 'ECDICT 考研核心 3000 词（按词频排序）',
    descriptionEn: 'KAoyan core 3000 words from ECDICT (by frequency)',
    icon: 'GraduationCap',
    words: [],
    count: 3000,
    load: () => import('./kaoyan').then((m) => m.KAoyan),
  },
  {
    id: 'toefl',
    name: '托福核心',
    nameEn: 'TOEFL Core',
    description: 'ECDICT 托福核心 3000 词（按词频排序）',
    descriptionEn: 'TOEFL core 3000 words from ECDICT (by frequency)',
    icon: 'Plane',
    words: [],
    count: 3000,
    load: () => import('./toefl').then((m) => m.TOEFL),
  },
  {
    id: 'ts-code',
    name: 'TS 骨架代码',
    nameEn: 'TS Skeletons',
    description: 'TypeScript / React 高频骨架代码行，配合代码模式练习（大小写敏感）',
    descriptionEn: 'Common TypeScript/React skeleton lines — pair with Code mode (case-sensitive)',
    icon: 'Code',
    words: TS_CODE,
  },
  {
    id: 'go-code',
    name: 'Go 骨架代码',
    nameEn: 'Go Skeletons',
    description: 'Go 标志性骨架代码行，配合代码模式练习（大小写敏感）',
    descriptionEn: 'Iconic Go skeleton lines — pair with Code mode (case-sensitive)',
    icon: 'Code',
    words: GO_CODE,
  },
]

export const DEFAULT_BANK_ID = 'ai-core'
