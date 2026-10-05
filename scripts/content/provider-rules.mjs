/* V4.1 · provider-rules.mjs —— 内容包「来源方（provider）登记表」的**唯一实现** + 覆盖判据。
 *
 * ── 为什么单独抽这个模块（本刀的唯一目的）──
 * 历史上 PROVIDER 表躺在 scripts/content/build.mjs 里，而 build.mjs 写盘时是
 *   const provider = PROVIDER[id] ?? 'unknown'
 * 于是「新内容包落盘但忘了在表登记」⇒ 被**静默**写成 provider:'unknown'，全仓没有任何门会拦。
 * A1-E / A2 / A3 三套内容包恰好都记得登记（磁盘现状 0 个 unknown），但那是「靠人不是靠门」。
 * 本模块把**表**和**判表**放在同一个文件里，好让 scripts/gate-provider.mjs 能对同一张表跑判据。
 *
 * ⚠️ 单一实现纪律：build.mjs **不得**再留一份表（留两份 = 以后改一处漏一处，
 *    与 RELATION_TYPES 的三处 import 漂移同型）。要改登记改这里，别处一律 import。
 *
 * 判据 A / B / C 各自在防什么（详见 checkProviderCoverage 的注释）：
 *   A  漏登记 / 落盘缺失 —— 磁盘上有包，但 provider 是 undefined / '' / 'unknown'。
 *      这正是 build.mjs 的 `?? 'unknown'` 兜底会发生的事：兜底让**构建不报错**，
 *      于是溯源字段悄悄缺失、一路带到线上追责时答不出「这批词哪来的」。
 *   B  孤儿登记 —— 表里登记了 key，磁盘上却没这个包。「登记了不存在的包」和「漏登记」
 *      是同型的漂移（表 ⟷ 磁盘双向失衡），一样判红，不能只管单向。
 *   C  外部来源查不到仓库 —— 非哨兵 provider（如 ecdict）必须能在 PROVIDER_REPOSITORY 查到地址。
 *      证明「外部内容可溯源到具体仓库」，而不是只写了个字符串就算数。
 *
 * 哨兵 PROVIDER_ORIGINAL 复用 license-policy.mjs 的**同一份常量**（本文件再导出，不新建字面量）：
 * 自有内容哨兵已经被 provenance.ts / license-policy.mjs 两处镜像，这里再抄一遍字面量
 * 就是第三处漂移源 —— 所以 import + re-export，让「哨兵只有一份值」这件事由 import 图保证。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PROVIDER_ORIGINAL } from './license-policy.mjs'

export { PROVIDER_ORIGINAL }

/** 本模块所在目录 = <repo>/scripts/content；上两级即仓库根 */
const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(HERE, '..', '..')
/** 默认扫描根（真实 content/）。路径由模块位置推导，**不依赖 process.cwd()**，
 *  这样从任意 cwd 调用（CI / npm script / 测试）拿到的都是同一个仓库的 content/。 */
export const DEFAULT_CONTENT_DIR = path.join(REPO_ROOT, 'content')

/** 兜底哨兵：build.mjs 在表里查不到包时写的值，见 build.mjs 的 `?? 'unknown'`。
 *  ⚠️ 判据 A 就是冲着这个值来的：**它必须两边同值**（桶底常量共享一个 export），
 *     否则会出现「门判 unknown 红、构建却悄悄写出同名的别的值」这种对不上的假绿。 */
export const PROVIDER_UNKNOWN = 'unknown'

/** 来源方 → provider（P1.7-Wave4 B-4 溯源字段）：写入 manifest.sources[].provider。
 *
 *  ⚠️ 这张表是**显式登记表**，不在表里的包会被写成 provider:'unknown'（溯源字段缺失）。
 *     新增自研 vocabulary 包必须在这里登记，不要指望 `?? 'unknown'` 兜底 ——
 *     兜底只是让构建别崩，登记与否由 scripts/gate-provider.mjs 判据 A 硬拦。
 *  ⚠️ 补 provider/repository 不参与 words 派生 checksum（checksum 只由 words.json 决定），
 *  故 contentChecksum / contentVersion / ContentId 均不变 —— 只是溯源信息更完整。
 *  ECDICT 仓库地址来自 docs/audit-package/08-exam/CET.md 的数据源记载，非臆测。 */
export const PROVIDER = {
  'ai-core': PROVIDER_ORIGINAL, 'cloud-native': PROVIDER_ORIGINAL, frontend: PROVIDER_ORIGINAL,
  'ts-code': PROVIDER_ORIGINAL, 'go-code': PROVIDER_ORIGINAL,
  /* A1-E：Unit 03 — Education 的正式词汇包（32 词，PM 内容侧补齐中文释义）。 */
  'ielts-edu-01-vocab': PROVIDER_ORIGINAL,
  'ielts-env-02-vocab': PROVIDER_ORIGINAL,
  /* A3：Unit 05 — Technology & Innovation 的正式词汇包（30 词）。同 A1-E / A2 口径。 */
  'ielts-tech-03-vocab': PROVIDER_ORIGINAL,
  ielts: 'ecdict', kaoyan: 'ecdict', toefl: 'ecdict', cet4: 'ecdict', cet6: 'ecdict',
}

/** 外部来源方 → 仓库地址；自有内容省略 */
export const PROVIDER_REPOSITORY = { ecdict: 'https://github.com/skywind3000/ECDICT' }

/**
 * 把 subRel 里**扫描根那一层**剥掉：'content/vocabulary/ai-core' → 'vocabulary/ai-core'。
 * 只剥 root 自己的 basename（falsify 的副本目录同样成立），名字对不上就原样返回 ——
 * 不硬编码 'content'，免得换个扫描根就静默剥错层。
 */
const stripRootPrefix = (rel, rootName) =>
  rootName && rel.startsWith(`${rootName}/`) ? rel.slice(rootName.length + 1) : rel

/**
 * 扫描 content/ 下的内容包（目录含 manifest.json 即一个包）。
 *
 * ⚠️ 必须 `isDirectory()` 过滤：`content/` 根下有 `README.md` / `license-policy-1.json`
 *    两个**非目录文件**，不过滤会把它们当包 —— 在那两个文件上 find manifest.json 会失败，
 *    表现是「扫描崩了/包数对不上」的假故障。
 *
 * 不抛异常遍历失败：读不到就当空目录跳过，判据层统一 fail-closed 兜底（见 checkProviderCoverage）。
 *
 * @param {string} [root=DEFAULT_CONTENT_DIR] 内容根目录（content/）
 * @returns {{ packages: Array<{dir: string, id: string, dirName: string, sources: Array<object>}>, index: Map<string, string> }}
 *    packages 按遍历序；index = **包目录名**（及 ContentId 别名）→ 相对目录
 *    （判据 B 用「PROVIDER 表的 key = 目录名，在不在磁盘上」），真实仓库的表键（ai-core / ielts …）即目录名。
 */
export function scanContentPackages(root = DEFAULT_CONTENT_DIR) {
  /** @type {Array<{dir: string, id: string, sources: Array<object>}>} */
  const packages = []
  /** @type {Map<string, string>} */
  const index = new Map()

  const walk = (absDir, relDir) => {
    let entries
    try {
      entries = readdirSync(absDir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const subAbs = path.join(absDir, entry.name)
      const subRel = relDir ? `${relDir}/${entry.name}` : entry.name
      let manifestPath = null
      try {
        if (statSync(path.join(subAbs, 'manifest.json')).isFile()) manifestPath = path.join(subAbs, 'manifest.json')
      } catch {
        manifestPath = null
      }
      if (manifestPath !== null) {
        const parse = (text) => {
          try {
            const v = JSON.parse(text)
            return v !== null && typeof v === 'object' && !Array.isArray(v) ? v : null
          } catch {
            return null
          }
        }
        const manifest = parse(readFileSync(manifestPath, 'utf8'))
        /* ⚠️ 题名必须用**目录名**（'ai-core'），不能只认 manifest.id ——
         * id 是 ContentId（'content:vocabulary:ai-core:ai-core'），而 PROVIDER 表登记的是包 id
         * （= 目录名，见 build.mjs 的 namespace 注释）。只按 id 索引会让判据 B 把真包判成孤儿登记。 */
        const dirName = entry.name
        const pkg = {
          /* ⚠️ dir 是**content/ 相对**路径（'vocabulary/ai-core'），不是仓库相对
           * （'content/vocabulary/ai-core'）—— 与 generate-registry 的 ORDER_NONVOCAB 形态
           * （'reading/ielts-tech-03-reading'）同口径，看报错时不用在脑内再剥一层前缀。
           * 只剥扫描根那一层（root 的 basename），falsify 的副本目录同样成立；名字对不上就原样返回，不硬编码 'content'。 */
          dir: stripRootPrefix(subRel, path.basename(root)),
          /* ⚠️ 目录名（'ai-core'）才是 PROVIDER 表登记的形态（= 判据 B 的匹配键），故单列 dirName；
           * `id` 留给 ContentId（身份契约在它手上，别丢），但**判据层报的 id 一律用 dirName**：
           * 门让人去表里加一行，报 ContentId 会让人对着 'content:vocabulary:ai-core:ai-core'
           * 找不到该加哪一行 —— 判据白写了。manifest.id 解析不出来时退回目录名，保证永远指得名。 */
          dirName,
          id: manifest?.id ?? manifest?.packageId ?? dirName,
          sources: Array.isArray(manifest?.sources) ? manifest.sources : [],
        }
        packages.push(pkg)
        if (!index.has(dirName)) index.set(dirName, subRel)
        // 别名：ContentId 形态也认（将来表若改成登记 ContentId 不至于立刻全判红）
        const alias = manifest?.id
        if (typeof alias === 'string' && alias.length > 0 && !index.has(alias)) index.set(alias, subRel)
      }
      // 不 early-return：包内若还有带 manifest.json 的子目录，那本身也是包，继续下钻。
      walk(subAbs, subRel)
    }
  }

  walk(root, '')
  return { packages, index }
}

/**
 * 统计 provider 分布（给门打印用，与判据无关 —— 判据只看 problems）。
 *
 * @param {string} [root=DEFAULT_CONTENT_DIR] 内容根目录
 * @returns {{ packageCount: number, sourceCount: number, distribution: Record<string, number>, tableSize: number }}
 */
export function collectProviderStats(root = DEFAULT_CONTENT_DIR, providerTable = PROVIDER) {
  const { packages } = scanContentPackages(root)
  /** @type {Record<string, number>} */
  const distribution = {}
  for (const pkg of packages) {
    for (const s of pkg.sources) {
      const p = s?.provider
      const key = typeof p === 'string' && p.length > 0 ? p : PROVIDER_UNKNOWN
      distribution[key] = (distribution[key] ?? 0) + 1
    }
  }
  const keys = Object.keys(providerTable ?? {})
  return {
    packageCount: packages.length,
    sourceCount: packages.reduce((n, p) => n + p.sources.length, 0),
    distribution,
    tableSize: keys.length,
  }
}

/**
 * Provider 覆盖判据（**双向**：磁盘 → 表、表 → 磁盘）。无问题返回空数组 ⇒ 门判绿。
 *
 * 判据 A：磁盘上每个含 manifest.json 的目录，其 `manifest.sources[].provider`
 *         不得为 undefined / null / '' / 'unknown'（漏登记 / 落盘缺失）。
 * 判据 B：PROVIDER 表里每个 key，磁盘上必须有对应的包目录 manifest.json
 *         （孤儿登记：登记了不存在的包，与漏登记同型的双向漂移）。
 * 判据 C：非哨兵 provider（外部来源，如 ecdict）必须能在 PROVIDER_REPOSITORY 查到仓库地址。
 *         哨兵 PROVIDER_ORIGINAL 按设计豁免。
 *
 * fail-closed：遍历/解析异常一律转成「问题项」，绝不当成 0 个问题放过。
 *
 * @param {object} [opts]
 * @param {string} [opts.root=DEFAULT_CONTENT_DIR] 内容根目录
 * @param {Record<string, string>} [opts.provider=PROVIDER] 登记表（可注入：测试/证伪用）
 * @param {Record<string, string>} [opts.repository=PROVIDER_REPOSITORY] 仓库地址表（可注入）
 * @returns {Array<{id: string, dir: string|null, criterion: 'A'|'B'|'C', code: string, reason: string}>}
 */
export function checkProviderCoverage({
  root = DEFAULT_CONTENT_DIR,
  provider = PROVIDER,
  repository = PROVIDER_REPOSITORY,
} = {}) {
  /** @type {Array<{id: string, dir: string|null, contentId?: string, criterion: 'A'|'B'|'C', code: string, reason: string}>} */
  const problems = []
  /** 磁盘包的「指名符」= **目录名**（= PROVIDER 表登记的形态，判据 B 的匹配键也是它）。
   *  ⚠️ 不能用 pkg.id（ContentId）：门让人去表里加一行，报 'content:vocabulary:ai-core:ai-core'
   * 会让人对着一个 ContentId 找该加哪一行 —— 判据白写（本刀 3 条红就是这么查出来的）。 */
  const nameOf = (pkg) => pkg.dirName ?? pkg.id

  let packages = []
  let index = new Map()
  try {
    const scanned = scanContentPackages(root)
    packages = scanned.packages
    index = scanned.index
  } catch (e) {
    problems.push({
      id: root,
      dir: null,
      criterion: 'A',
      code: 'PROVIDER_SCAN_FAILED',
      reason: `扫描内容根失败（fail-closed，不当作 0 个问题）：${e?.message ?? e}`,
    })
    return problems
  }

  /* ── 判据 A（漏登记 / 落盘缺失）+ 判据 C（外部来源须有仓库地址）── */
  for (const pkg of packages) {
    pkg.sources.forEach((s, i) => {
      const p = s?.provider
      const missing = p === undefined || p === null || (typeof p === 'string' && p.trim() === '')
      if (missing || p === PROVIDER_UNKNOWN) {
        problems.push({
          id: nameOf(pkg),
          dir: pkg.dir,
          contentId: typeof pkg.id === 'string' ? pkg.id : undefined,
          criterion: 'A',
          code: 'PROVIDER_UNREGISTERED',
          reason: `sources[${i}].provider = ${JSON.stringify(p ?? null)}（漏登记 / 落盘缺失 —— build 的 ?? '${PROVIDER_UNKNOWN}' 兜底会把这种包静默写成 ${PROVIDER_UNKNOWN}）`,
        })
        return
      }
      if (p !== PROVIDER_ORIGINAL && !repository?.[p]) {
        problems.push({
          id: nameOf(pkg),
          dir: pkg.dir,
          contentId: typeof pkg.id === 'string' ? pkg.id : undefined,
          criterion: 'C',
          code: 'PROVIDER_REPOSITORY_MISSING',
          reason: `provider=${JSON.stringify(p)} 是外部来源，但 PROVIDER_REPOSITORY 里查不到它的仓库地址（外部内容必须能溯源到具体仓库）`,
        })
      }
    })
  }

  /* ── 判据 B（孤儿登记）：表里有 key、磁盘上没有这个包 ── */
  for (const key of Object.keys(provider ?? {})) {
    if (!index.has(key)) {
      problems.push({
        id: key,
        dir: null,
        criterion: 'B',
        code: 'PROVIDER_ORPHAN_REGISTRATION',
        reason: `PROVIDER 表登记了 '${key}'，但磁盘 content/ 下不存在该包（登记了不存在的包 = 与漏登记同型的漂移，同样判红）`,
      })
    }
  }

  return problems
}
