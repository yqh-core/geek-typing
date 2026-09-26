/* V4.1 · content:build —— 内容包构建器：manifest 由数据自动派生，杜绝人工维护漂移。
 *
 * 职责（对应 V4-P0 遗留问题①②）：
 *  ① checksum 存完整 SHA-256（provenance 可复现），展示层按需截断；
 *  ② stats.items / stats.phonetic / stats.definition 一律由 words.json 计算后回写，
 *     开发者改词表不需要（也不应该）手工改 manifest.stats —— 漂移时跑一次即同步。
 *  ③ V4.1 manifest 迁移：source{} → sources[]、license 字符串 → 结构化、bank:x →
 *     content:vocabulary:<ns>:x（4 段式 ContentId）。
 *  ④ V4.1-P0.5 版本字段：schemaVersion（结构版本，常量）+ contentVersion（内容版本，
 *     由 checksum 变化驱动自增）—— 让「schema 变了」与「内容变了」可分别判定，
 *     供缓存失效 / 增量同步使用（P1 的 chunk 缓存会读 contentVersion）。
 *
 * 幂等：可重复运行，仅在 stats/checksum/schema 有差异时回写。
 * 用法：node scripts/content/build.mjs
 */
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'

const ROOT = path.resolve(process.cwd())
const VOCAB_DIR = path.join(ROOT, 'content', 'vocabulary')

/** 来源族 → namespace 前缀（ContentId 第 3 段）：ECDICT 派生 vs 仓库自维护。
 *
 *  ⚠️ namespace 必须是「每包唯一」，规则 = `${来源族}-${包 id}`（如 ecdict-ielts）。
 *  早期版本直接用来源族（ecdict）作 namespace，导致 cet4/toefl/ielts 三个包共用
 *  ecdict，词级 ContentId `content:word:ecdict:abandon` 在三个包里同时存在而撞车，
 *  不能作为学习记录主键（V4.1 契约测试实测捕获）。
 *  每包唯一 namespace ⇒ (namespace, localId=词形) 全局唯一，无需在词级 id 里再塞包 id。 */
const SOURCE = {
  ielts: 'ecdict', kaoyan: 'ecdict', toefl: 'ecdict', cet4: 'ecdict', cet6: 'ecdict',
  'ai-core': 'curated', 'cloud-native': 'curated', frontend: 'curated', 'ts-code': 'curated', 'go-code': 'curated',
}
const namespaceOf = (id) => `${SOURCE[id] ?? 'curated'}-${id}`

/** manifest 结构版本（**不是内容版本**）。
 *  常量 SCHEMA_VERSION = 4 对应 V4.1-P0.5（schemaVersion/contentVersion 入 manifest）。
 *  仅当 manifest 结构发生破坏性变更（字段增删/语义变化，旧 reader 读不懂）才递增；
 *  内容词表改动只动 contentVersion，不动它。 */
const SCHEMA_VERSION = 4
const MIT = { spdx: 'MIT', name: 'MIT License', url: 'https://opensource.org/licenses/MIT', attributionRequired: false, commercialUse: true }
const SELF = { name: 'Proprietary (self-curated)', attributionRequired: false, commercialUse: true }

const sha256 = (s) => 'sha256:' + createHash('sha256').update(s).digest('hex')

/** 旧格式 source{} → V4.1 结构化 sources[] */
function migrateSources(raw, id) {
  if (Array.isArray(raw.sources)) return raw.sources.map((s) => ({ ...s, license: typeof s.license === 'string' ? (s.license === 'MIT' ? MIT : SELF) : s.license }))
  const src = raw.source ?? {}
  const license = typeof src.license === 'string'
    ? (src.license === 'MIT' ? MIT : SELF)
    : (src.license ?? SELF)
  return [{ origin: src.origin ?? (SOURCE[id] === 'ecdict' ? 'ECDICT' : 'curated in-repo'), license, importedAt: src.importedAt }]
}

async function main() {
  if (!existsSync(VOCAB_DIR)) { console.error('content/vocabulary 不存在'); process.exit(1) }
  const ids = (await readdir(VOCAB_DIR, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name)
  let changed = 0

  for (const id of ids) {
    const dir = path.join(VOCAB_DIR, id)
    const rawWords = await readFile(path.join(dir, 'words.json'), 'utf8')
    const words = JSON.parse(rawWords)
    const m = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'))

    const canonicalId = `content:vocabulary:${namespaceOf(id)}:${id}`
    const sources = migrateSources(m, id).map((s) => ({ ...s, checksum: sha256(rawWords) }))

    /** contentVersion（内容版本）：以 words.json 的 checksum 是否变化为准。
     *  · 有旧 checksum 且 ≠ 新 checksum ⇒ 内容变了 → +1
     *  · 有旧 checksum 且 ＝ 新 checksum ⇒ 内容没变 → 保持原值
     *  · 无旧 checksum（首次生成的新包）⇒ 1（contentVersion ?? 0 + 1 也落在 1） */
    const prevChecksum = m.sources?.[0]?.checksum
    const nextChecksum = sources[0].checksum
    const contentVersion = (prevChecksum !== undefined && prevChecksum !== nextChecksum)
      ? (m.contentVersion ?? 0) + 1
      : (m.contentVersion ?? 1)

    // schemaVersion/contentVersion 固定排在 manifest 头部：先从 m 副本里删掉再展开，
    // 避免对象字面量重复键，同时保证 JSON.stringify 的键顺序稳定（幂等的前提）。
    const base = { ...m }
    delete base.schemaVersion
    delete base.contentVersion
    const next = {
      schemaVersion: SCHEMA_VERSION,
      contentVersion,
      ...base,
      id: canonicalId,
      type: m.type ?? 'vocabulary',
      version: m.version ?? '1.0.0',
      stats: {
        ...m.stats,
        items: words.length,
        phonetic: words.filter((w) => w.phonetic).length,
        definition: words.filter((w) => w.definition).length,
      },
      sources,
      offline: m.offline ?? { supported: true, policy: 'lazy' },
    }
    delete next.source // 旧单来源字段，迁移后移除

    const same = JSON.stringify(next) === JSON.stringify(m)
    if (!same) {
      await writeFile(path.join(dir, 'manifest.json'), JSON.stringify(next, null, 2) + '\n', 'utf8')
      changed++
      console.log(`▸ ${id}: manifest 已同步（id=${canonicalId} items=${next.stats.items} schemaVersion=${SCHEMA_VERSION} contentVersion=${contentVersion} checksum=${sources[0].checksum.slice(7, 15)}…）`)
    } else {
      console.log(`▸ ${id}: 无变化`)
    }
  }
  console.log(`\n[content:build] ${ids.length} 包，回写 ${changed} 个`)
}

main().catch((e) => { console.error('[content:build] 异常：', e.message); process.exit(1) })
