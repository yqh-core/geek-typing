/* P18-C′ · registry.ts 生成器 —— 手工注册 → 可验证生成注册。
 *
 * 目的：把 `src/core/content/registry.ts` 的 import 段与 `packages` 数组，从**手工维护**
 * 改为**可复现生成**。它买的是维护便利（加包不用改两段），卖的是**可验证**——
 * 本文件自带一致性门（见下方「一致性门」），生成器出错必须自己先 FAIL。
 *
 * ── 为什么这件事需要单独的生成器而不是「看着办」 ────────────────────
 * registry.ts 里藏着 4 类容易漂移的手工事实，实验（P18-C′ 等价性实验）已逐项实测：
 *   1. **两套独立顺序**：`import` 段顺序 ≠ `packages` 数组顺序。
 *      import 段：ielts kaoyan toefl cet4 cet6 ai-core cloud-native frontend ts-code go-code
 *      packages ：ai-core cloud-native frontend cet4 cet6 ielts kaoyan toefl ts-code go-code
 *      而 `getAllPackages()` / `byLocalId` / `byManifestId` **都按 packages 段**（注册序）。
 *      ⇒ 两者必须**分别显式定义**，只还原一套就会改变运行时行为。
 *   2. **`offline.policy` 决定槽位**：inline ⇔ `words:`；lazy+vocabulary ⇔ `load:`；
 *      lazy+非vocabulary ⇔ `loadData:`。不是按目录名或包数能推出来的。
 *   3. **`?runtime` 投影**：manifest 必须走构建期投影，**退化成 `?raw` 会把整段 manifest
 *      载荷带进主 chunk**（`scripts/check-bundle.mjs` 判据 J2 会判红）。
 *   4. **`localId` 的身份来源**：必须取 `manifest.packageId`（与 UI/持久化键一致），
 *      **目录名只是发现机制，不是身份契约**。
 *
 * ── 锁定的不变量（评审裁定的 5 条，逐条在下方代码里落实）─────────────
 *   [1] 双顺序分别成为显式生成规则（ORDER_IMPORT / ORDER_REGISTRY，互不相同）
 *   [2] localId = manifest.packageId（**永不**用目录名）
 *   [3] ?runtime 保持（生成器内不存在产出 `manifest.json?raw` 的分支）
 *   [4] 生成器自带一致性门：`--check` 比对「实际 content 包↔ 生成结果」，漂移即 FAIL
 *   [5] 证据链由调用方跑（见 package.json 的 verify:registry）
 *
 * ── 用法 ───────────────────────────────────────────────────────────
 *   node scripts/content/generate-registry.mjs            # 写入 registry.ts
 *   node scripts/content/generate-registry.mjs --check    # 只校验不写（门禁用，漂移 EXIT=1）
 *   node scripts/content/generate-registry.mjs --falsify  # 证伪自检：门能判红
 *
 * ⚠️ **不要**把本生成器的顺序表改成「自动排序」。那会静默改变注册序 ⇒ 改变
 * `getAllPackages()` 的返回顺序。顺序是**契约**，不是排版偏好。
 */

import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
/** 仓库根 = 本文件在 scripts/content/ 下 ⇒ 上溯两级。**可被环境变量覆盖**（测试的临时副本用）。 */
const ROOT = process.env.REGISTRY_GEN_ROOT
  ? process.env.REGISTRY_GEN_ROOT
  : join(HERE, '..', '..')
const CONTENT = join(ROOT, 'content')
const REGISTRY = process.env.REGISTRY_GEN_TARGET
  ? process.env.REGISTRY_GEN_TARGET
  : join(ROOT, 'src', 'core', 'content', 'registry.ts')

/* ───────────────────────── [1] 两套独立顺序（显式契约，不可合并） ───────────────────────── */

/** `import` 段的 manifest 顺序（实测自 registry.ts import 段）。 */
const ORDER_IMPORT = [
  'ielts', 'kaoyan', 'toefl', 'cet4', 'cet6',
  'ai-core', 'cloud-native', 'frontend', 'ts-code', 'go-code',
  // A1-E：Unit 03 — Education 的正式词汇包（32 词）
  'ielts-edu-01-vocab',
]

/** `packages` 数组的 vocabulary 注册序（实测自 registry.ts 注册表段；**与上面不同**）。 */
const ORDER_REGISTRY = [
  'ai-core', 'cloud-native', 'frontend', 'cet4', 'cet6',
  'ielts', 'kaoyan', 'toefl', 'ts-code', 'go-code',
  // A1-E：Unit 03 — Education 的正式词汇包（32 词）。两张表**内容必须不同**，
  // 追加同一项不会让它们相等（前 10 项顺序本就不同），门会逐项比对。
  'ielts-edu-01-vocab',
]

/** 非 vocabulary 包的顺序（import 段与注册表段**恰好相同**，故共用一张表）。 */
const ORDER_NONVOCAB = [
  'listening/demo-listening-01',
  'audio/demo-audio-01',
  'reading/demo-reading-01',
  'topic/demo-topic-01',
  'exercise/demo-exercise-01',
  'writing/demo-writing-01',
  'speaking/demo-speaking-01',
  'collection/demo-study-set',
  // A1-E：IELTS Academic Unit 01 — Education（正式内容包，非 demo 探针）
  'reading/ielts-edu-01-reading',
  'exercise/ielts-edu-01-exercise',
]

/** 注册表首行注释里的包数说明（随 ORDER_REGISTRY + ORDER_NONVOCAB 变动，生成时同步算）。 */
const VOCAB_COUNT = ORDER_REGISTRY.length
const NONVOCAB_COUNT = ORDER_NONVOCAB.length

/* ───────────────────────── 扫描（目录只是发现机制） ───────────────────────── */

/**
 * 扫 `content/**` 发现包。
 *⚠️ `content/` 根下有**非目录文件**（`README.md`、`license-policy-1.json`），
 *   必须先 `isDirectory()` 过滤 —— 否则会把它们当包（实验期实测踩过：ENOTDIR）。
 */
function discoverPackages() {
  const found = []
  for (const type of readdirSync(CONTENT)) {
    const typeDir = join(CONTENT, type)
    if (!statSync(typeDir).isDirectory()) continue
    for (const dirName of readdirSync(typeDir)) {
      const pkgDir = join(typeDir, dirName)
      if (!statSync(pkgDir).isDirectory()) continue
      const manifestPath = join(pkgDir, 'manifest.json')
      if (!existsSync(manifestPath)) continue
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      found.push({
        type,
        dirName,
        key: `${type}/${dirName}`,
        // [2] localId 的唯一来源 —— 目录名仅用于定位文件
        pkgId: manifest.packageId,
        policy: manifest.offline?.policy,
        hasWords: existsSync(join(pkgDir, 'words.json')),
        hasItems: existsSync(join(pkgDir, 'items.json')),
      })
    }
  }
  return found
}

/* ───────────────────────── 槽位判定（[2] 与 policy 的对应） ───────────────────────── */

function assignSlot(p) {
  if (p.policy === 'inline') {
    if (!p.hasWords) throw new Error(`${p.pkgId} 声明 policy=inline 但没有 words.json`)
    return 'words'
  }
  if (p.policy === 'lazy') {
    if (p.type === 'vocabulary') {
      if (!p.hasWords) throw new Error(`${p.pkgId} 是 lazy vocabulary 但没有 words.json`)
      return 'load'
    }
    if (!p.hasItems) throw new Error(`${p.pkgId} 是 lazy 非 vocabulary 但没有 items.json`)
    return 'loadData'
  }
  throw new Error(`${p.pkgId} 的 offline.policy=${JSON.stringify(p.policy)} 既非 inline 也非 lazy`)
}

/* ───────────────────────── 顺序表 → 有序包列表（缺项/多出都 FAIL） ───────────────────────── */

function orderVocabulary(found, order, label) {
  const byPkgId = new Map(found.filter((p) => p.type === 'vocabulary').map((p) => [p.pkgId, p]))
  const out = []
  for (const pkgId of order) {
    const p = byPkgId.get(pkgId)
    if (!p) throw new Error(`[${label}] 顺序表里的 vocabulary 包在 content/ 下不存在：${pkgId}`)
    out.push(p)
  }
  const covered = new Set(out.map((p) => p.pkgId))
  const missing = found.filter((p) => p.type === 'vocabulary' && !covered.has(p.pkgId))
  if (missing.length) {
    throw new Error(
      `[${label}] content/ 下有 ${missing.length} 个 vocabulary 包没进顺序表：` +
      missing.map((p) => `${p.pkgId}(目录 ${p.key})`).join('、') +
      '\n  ⇒ 目录里存在但顺序表没收录 = 会被漏注册。顺序表是契约，请显式补上。',
    )
  }
  return out
}

function orderNonVocabulary(found, label) {
  const byKey = new Map(found.filter((p) => p.type !== 'vocabulary').map((p) => [p.key, p]))
  const out = []
  for (const key of ORDER_NONVOCAB) {
    const p = byKey.get(key)
    if (!p) throw new Error(`[${label}] 顺序表里的非 vocabulary 包在 content/ 下不存在：${key}`)
    out.push(p)
  }
  const covered = new Set(out.map((p) => p.key))
  const missing = found.filter((p) => p.type !== 'vocabulary' && !covered.has(p.key))
  if (missing.length) {
    throw new Error(
      `[${label}] content/ 下有 ${missing.length} 个非 vocabulary 包没进顺序表：` +
      missing.map((p) => `${p.key}(packageId ${p.pkgId})`).join('、') +
      '\n  ⇒ 目录里存在但顺序表没收录 = 会被漏注册。顺序表是契约，请显式补上。',
    )
  }
  return out
}

/* ───────────────────────── 生成（[3] ?runtime 永不退化为 ?raw） ───────────────────────── */

const camel = (s) => s.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase())
const upper1 = (s) => s[0].toUpperCase() + s.slice(1)

function buildImportSection(importOrdered, nonvocab) {
  const L = []
  L.push('/* ---------------- manifest（构建期 ?runtime 投影 → 对象；规则见 scripts/content/manifest-runtime.mjs） ---------------- */')
  for (const p of importOrdered) {
    L.push(`import ${camel(p.pkgId)}Manifest from '../../../content/vocabulary/${p.pkgId}/manifest.json?runtime'`)
  }
  L.push('')
  L.push('/* ---------------- 非 vocabulary 试金石包（P1.7-Wave4 B-2） ----------------')
  L.push(' * manifest 静态 import（常驻主 chunk，单个 ~1.2 KiB，O(包数) 线性小步涨）；')
  L.push(' * items.json 一律动态 import（独立 items-*.js chunk，绝不进主 chunk），')
  L.push(' * 与 words-*.js 同一判据口径（构建后体积门禁按 (words|items)-*.js 计数）。')
  L.push(' * ⚠️ 同上，本段由 generate-registry.mjs 生成，不要手改。')
  L.push(' */')
  for (const p of nonvocab) {
    L.push(`import ${camel(p.pkgId)}Manifest from '../../../content/${p.type}/${p.dirName}/manifest.json?runtime'`)
  }
  L.push('')
  L.push('/* ---------------- inline 小库词条（同步 parse）---------------- */')
  for (const p of importOrdered.filter((x) => x.slot === 'words')) {
    L.push(`import ${camel(p.pkgId)}Words from '../../../content/vocabulary/${p.pkgId}/words.json?raw'`)
  }
  L.push('')
  L.push('const parseWords = (raw: string): WordPayload[] => JSON.parse(raw) as WordPayload[]')
  L.push('const parseData = (raw: string): unknown[] => JSON.parse(raw) as unknown[]')
  L.push('')
  L.push('/* ---------------- lazy 词库词条（动态 import，独立 chunk）----------------')
  L.push(' * B 步 9.5：`cloud-native` / `frontend` 由 inline 改 lazy（两处 manifest 的 offline.policy')
  L.push(' * 同步改 lazy，否则 `scripts/content/validate.mjs` 判据 20「策略一致性」当场判红）。')
  L.push(' * 判定口径 = 体积 ÷ 首屏必需度（见 docs/p18/DECISIONS-POST-P18.md §9.5.2）：')
  L.push(' * 两包合计才 1.55 KiB，但都是「首页按任意键即打字」的入口词库 —— 提前到首屏换不来任何')
  L.push(' * 首屏收益，却白占主 chunk 常驻内存，故改 lazy 走骨架屏（Memorize.tsx 已配套加载态）。')
  L.push(' * 注意：这与预热的取舍无关（见 WARMUP_IDS 处注释）—— 改 lazy 不意味着该进预热清单。')
  L.push(' *')
  L.push(' * ⚠️ 本段由 scripts/content/generate-registry.mjs 生成；改 policy 走改 manifest + 跑')
  L.push(' *   `npm run content:generate-registry`，**不要手改本文件**（会被 --check 判红）。')
  L.push(' */')
  for (const p of importOrdered.filter((x) => x.slot === 'load')) {
    L.push(`const load${upper1(camel(p.pkgId))} = async () => parseWords((await import('../../../content/vocabulary/${p.pkgId}/words.json?raw')).default)`)
  }
  for (const p of nonvocab) {
    L.push(`const load${upper1(camel(p.pkgId))} = async () => parseData((await import('../../../content/${p.type}/${p.dirName}/items.json?raw')).default)`)
  }
  return L
}

function buildRegistrySection(registryOrdered, nonvocab) {
  const L = []
  L.push(`/* ---------------- 注册表（${VOCAB_COUNT} vocabulary + ${NONVOCAB_COUNT} 非 vocabulary = ${VOCAB_COUNT + NONVOCAB_COUNT} 包） ---------------- */`)
  L.push('const packages: ContentPackage[] = [')
  for (const p of registryOrdered) {
    const n = camel(p.pkgId)
    L.push(p.slot === 'words'
      ? `  { manifest: ${n}Manifest, localId: '${p.pkgId}', words: parseWords(${n}Words) },`
      : `  { manifest: ${n}Manifest, localId: '${p.pkgId}', load: load${upper1(n)} },`)
  }
  for (const p of nonvocab) {
    const n = camel(p.pkgId)
    L.push(`  { manifest: ${n}Manifest, localId: '${p.pkgId}', loadData: load${upper1(n)} },`)
  }
  L.push(']')
  return L
}

/* ───────────────────────── 装配整份 registry.ts ───────────────────────── */

/** 生成段的起止标记：用于在既有 registry.ts 里就地替换（幂等，不重排文件其余部分）。 */
const BEGIN = '/* ---------------- manifest（构建期 ?runtime 投影 → 对象；规则见 scripts/content/manifest-runtime.mjs） ---------------- */'
const END_MARKER = '/** vocabulary 槽位（既有 API 口径：UI / 持久化 / 学习层只看词库包） */'

export function generateRegistrySource() {
  const found = discoverPackages()
  for (const p of found) p.slot = assignSlot(p)

  const importOrdered = orderVocabulary(found, ORDER_IMPORT, 'import 序')
  const registryOrdered = orderVocabulary(found, ORDER_REGISTRY, '注册序')
  const nonvocab = orderNonVocabulary(found, '非 vocabulary 序')

  // [1] 两套顺序必须真的不同 —— 相同说明有人把它们合并了，运行时行为会变
  if (ORDER_IMPORT.join('|') === ORDER_REGISTRY.join('|')) {
    throw new Error('ORDER_IMPORT 与 ORDER_REGISTRY 完全相同：两者是不同的事实（注册序由 getAllPackages 使用），不能合并')
  }

  const generated = [...buildImportSection(importOrdered, nonvocab), '', ...buildRegistrySection(registryOrdered, nonvocab), '']

  const original = readFileSync(REGISTRY, 'utf8')
  const beginIdx = original.indexOf(BEGIN)
  const endIdx = original.indexOf(END_MARKER)
  if (beginIdx < 0 || endIdx < 0 || endIdx <= beginIdx) {
    throw new Error(
      `registry.ts 里找不到生成段的边界标记（BEGIN 命中=${beginIdx} / END 命中=${endIdx}）。` +
      '\n  ⇒ 手写结构变了，或标记被删。生成器拒绝盲写，请先确认边界。',
    )
  }
  return {
    content: original.slice(0, beginIdx) + generated.join('\n') + original.slice(endIdx),
    stats: {
      packages: found.length,
      importOrdered: importOrdered.length,
      registryOrdered: registryOrdered.length,
      nonvocab: nonvocab.length,
      slots: {
        words: found.filter((p) => p.slot === 'words').length,
        load: found.filter((p) => p.slot === 'load').length,
        loadData: found.filter((p) => p.slot === 'loadData').length,
      },
    },
  }
}

/* ───────────────────────── [4] 一致性门 ───────────────────────── */

/**
 * 独立复核生成结果，**不信任生成器自己的判断**。
 *
 * ⚠️ 审计对象是**两份**：① 生成结果 content ② 磁盘上的实际 registry.ts。
 *   只审① 是不够的 —— 那只会发现「生成器算错了」，
 *   查不出「有人手改了 registry.ts 而生成器不知道」这个更常见的漂移形态
 *   （实测踩过：删掉注册表里一行，`--check` 只能报「文本不一致」，
 *    报不出「漏注册 go-code」这个真正的问题）。两份都审才能定位。
 *
 * @param {string} generated 生成出的 registry.ts 文本
 * @param {string} [onDisk]  磁盘上的 registry.ts 文本；缺省即视为与生成结果相同
 */
export function auditGenerated(generated, onDisk) {
  const problems = []
  const actual = discoverPackages()
  const actualPkgIds = actual.map((p) => p.pkgId)

  /** 对**一份** registry.ts 文本做全部结构检查。 */
  function checkOne(content, label) {
    const bad = (msg) => problems.push(`[${label}] ${msg}`)

    // a) localId（注册表段）
    const localIds = [...content.matchAll(/localId: '([^']+)'/g)].map((m) => m[1])
    // b) import的包（manifest.json 路径）
    const importedKeys = [...content.matchAll(/content\/(vocabulary|[a-z]+)\/([^/']+)\/manifest\.json\?\w+/g)]
      .map((m) => `${m[1]}/${m[2]}`)

    // 双向差集：漏注册 / 多注册
    const missing = actualPkgIds.filter((id) => !localIds.includes(id))
    const extra = localIds.filter((id) => !actualPkgIds.includes(id))
    if (missing.length) bad(`有 ${missing.length} 个实际内容包没进注册表（漏注册）：${missing.join('、')}`)
    if (extra.length) bad(`注册表里有 ${extra.length} 个 content/ 下不存在的包（多注册）：${extra.join('、')}`)

    // import 覆盖度：每个包都必须有 manifest 导入
    const missingImport = actual.filter((p) => !importedKeys.includes(p.key)).map((p) => p.pkgId)
    if (missingImport.length) bad(`有 ${missingImport.length} 个包没有 manifest import：${missingImport.join('、')}`)

    // [2] localId 必须是 packageId —— 目录名≠packageId 时若用了目录名，直接判红
    for (const p of actual) {
      if (p.dirName !== p.pkgId && localIds.includes(p.dirName) && !localIds.includes(p.pkgId)) {
        bad(`${p.key} 的 localId 用了目录名 ${p.dirName}，而 manifest.packageId 是 ${p.pkgId} —— 目录名不是身份契约`)
      }
    }

    // [3] manifest 必须全部 ?runtime —— 出现 ?raw 即回退，J2 会判红
    if (/manifest\.json\?raw/.test(content)) {
      bad('出现 manifest.json?raw —— ?runtime 投影被退化为 ?raw，会把整段 manifest 带进主 chunk（判据 J2 会判红）')
    }
    const runtimeCount = (content.match(/manifest\.json\?runtime/g) ?? []).length
    if (runtimeCount !== actual.length) {
      bad(`?runtime manifest import 数 ${runtimeCount} ≠ 实际包数 ${actual.length}`)
    }

    // [1] 两套顺序必须都在，且不同
    const importOrder = importedKeys.filter((k) => k.startsWith('vocabulary/')).map((k) => k.split('/')[1])
    const registryOrder = [...content.matchAll(/localId: '([^']+)'/g)]
      .map((m) => m[1])
      .filter((id) => actual.find((p) => p.pkgId === id)?.type === 'vocabulary')
    if (importOrder.join('|') === registryOrder.join('|')) {
      bad('import 序与注册序完全相同 —— 两者是不同的事实，合并会改变 getAllPackages() 行为')
    }
    for (const [i, id] of registryOrder.entries()) {
      if (ORDER_REGISTRY[i] !== id) {
        bad(`注册序第 ${i + 1} 位是 ${id}，与 ORDER_REGISTRY 声明的 ${ORDER_REGISTRY[i]} 不一致`)
        break
      }
    }
    return { localIds, runtimeCount }
  }

  const g = checkOne(generated, '生成结果')
  // onDisk 那份的返回值**故意不用**：checkOne 的副作用是往 problems 追加，
  // 这里要的是「生成结果与磁盘 registry.ts 两份都审」，不是取谁的结论。
  // 之前写成 `let d = g; d = checkOne(…)` —— 赋值后从不读，是死变量，
  // oxlint no-unused-vars 判红（基线 total=0 ⇒ lint 棘轮门会红，CI 上必挂）。
  if (typeof onDisk === 'string' && onDisk !== generated) {
    checkOne(onDisk, '磁盘 registry.ts')
  }

  return { problems, actual: actual.length, registered: g.localIds.length, runtimeCount: g.runtimeCount }
}

/* ───────────────────────── CLI ───────────────────────── */

const isMain = process.argv[1] && process.argv[1].endsWith('generate-registry.mjs')
if (isMain) {  const args = process.argv.slice(2)
  const checkOnly = args.includes('--check')

  let result
  try {
    result = generateRegistrySource()
  } catch (e) {
    console.error(`[generate-registry] FAIL：${e.message}`)
    process.exit(1)
  }

  // 生成后立刻自审（不信任生成过程）。
  //
  // ⚠️ 磁盘审一份还是两份，取决于**是不是写盘模式**：
  //   · `--check`（CI 的 verify:registry）：两份都审。目的是抓「有人手改了 registry.ts」
  //     —— 只审生成结果只能发现生成器算错，查不出手改（实测踩过：删一行只报「文本不一致」，
  //     报不出「漏注册 go-code」）。这个模式不改磁盘，审计它是有意义的。
  //   · 写盘模式：**不审磁盘**。磁盘那份马上就要被本次生成结果整体覆盖，审它是自指死锁 ——
  //     「往 content/ 加一个包」这个生成器最本职的动作，会因磁盘那份还是旧的（没有新包）
  //     被自己的门判成「漏注册」而永远写不进去（A1-E 实测撞到：新增 2 个包 ⇒ 18≠20 ⇒ 拒绝写盘）。
  //     手改检测没有因此丢失：改完跑 `--check`，两份不一致依然判红。
  const onDisk = readFileSync(REGISTRY, 'utf8')
  const audit = auditGenerated(result.content, checkOnly ? onDisk : null)
  if (audit.problems.length) {
    console.error('[generate-registry] FAIL：生成结果未通过一致性门')
    for (const p of audit.problems) console.error(`  · ${p}`)
    process.exit(1)
  }

  const s = result.stats
  console.log('[generate-registry] 生成完成')
  console.log(`  包数 ${s.packages}（vocabulary ${s.registryOrdered} + 非 vocabulary ${s.nonvocab}）`)
  console.log(`  槽位 words=${s.slots.words} / load=${s.slots.load} / loadData=${s.slots.loadData}`)
  console.log(`  一致性门 OK：实际 ${audit.actual} 包 ↔ 注册 ${audit.registered} 个 ↔ ?runtime ${audit.runtimeCount} 条`)
  console.log(`  双顺序：import[${ORDER_IMPORT.join(',')}]`)
  console.log(`          注册 [${ORDER_REGISTRY.join(',')}]`)

  if (checkOnly) {
    const current = readFileSync(REGISTRY, 'utf8')
    if (current === result.content) {
      console.log('[generate-registry] PASS：registry.ts 与生成结果一致（无漂移）')
    } else {
      console.error('[generate-registry] FAIL：registry.ts 与生成结果不一致（有漂移）')
      console.error('  ⇒ 跑 `node scripts/content/generate-registry.mjs` 重新生成')
      const a = current.split('\n')
      const b = result.content.split('\n')
      for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if (a[i] !== b[i]) {
          console.error(`  首行差异 L${i + 1}：`)
          console.error(`    现文件: ${a[i] ?? '(无)'}`)
          console.error(`    生成器: ${b[i] ?? '(无)'}`)
          break
        }
      }
      process.exit(1)
    }
  } else {
    writeFileSync(REGISTRY, result.content, 'utf8')
    console.log(`  已写入 ${REGISTRY.slice(ROOT.length + 1)}`)
  }
}
