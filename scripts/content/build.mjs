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
 *  ⑤ V4.1-P0.6 Contract Hardening（本轮）：
 *     (a) checksum 统一走 canonical：`sha256Canonical(words)` = sha256(规范化序列化结果)，
 *         与 words.json 的文件排版（缩进/换行/键序）彻底解耦。
 *         ⚠️ 语义区分（与 manifest 两个字段一一对应）：
 *           · contentChecksum    = **规范化入库内容**的指纹（本文件写入）
 *           · sources[].checksum = **来源原始数据**的指纹
 *         当前来源就是本仓 words.json ⇒ 二者同值；将来接入「导入原始 CSV / 上游文件」
 *         时，sources[].checksum 应改算**原始字节**的 sha256，二者即刻分叉 —— 这正是
 *         provenance（溯源）存在的意义：能回答「源数据没变，但入库内容变了（规范化改过）」。
 *     (b) 版本三元组：packageId / namespace / contentRevision / contentVersion /
 *         contentChecksum / contentPublishedAt / contentHistory / build —— 让「把内容
 *         回滚到上一版」有确定答案（version 回到历史值，revision 继续递增留审计痕）。
 *     (c) 落盘用 canonicalFile()：紧凑单行 + 尾随换行，与 checksum 计算同源 ⇒ 可复现。
 *
 * 幂等：可重复运行，仅在语义有差异时回写（用 canonicalize 比较，**不**比 JSON.stringify ——
 *       后者对键顺序敏感，而 canonical File 会把 manifest 顶层键排序后再落盘）。
 * 用法：node scripts/content/build.mjs
 */
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { canonicalFile, canonicalize, sha256Canonical } from './canonical.mjs'

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
/** 构建工具版本：写入 manifest.build.toolVersion，用于追溯「这份 manifest 是哪版工具产出的」 */
const TOOL_VERSION = 'content-build/1.1'
const MIT = { spdx: 'MIT', name: 'MIT License', url: 'https://opensource.org/licenses/MIT', attributionRequired: false, commercialUse: true }
const SELF = { name: 'Proprietary (self-curated)', attributionRequired: false, commercialUse: true }

/** 版本三元组 field 集合：写 manifest 时先从副本里 delete 再按固定顺序展开，
 *  避免对象字面量重复键，也避免脚本版本字段散落在 base 里导致键序漂移。 */
const VERSION_FIELDS = [
  'schemaVersion', 'packageId', 'namespace', 'contentRevision', 'contentVersion',
  'contentChecksum', 'contentPublishedAt', 'contentHistory', 'build',
]

/** namespace 从最终 ContentId 反解（`/^content:[a-z]+:([a-z0-9-]+):/` 第 1 组），
 *  而不是重算一遍 —— 保证 manifest.namespace 与 manifest.id 永远同源。 */
const namespaceOfId = (contentId, fallbackId) =>
  /^content:[a-z]+:([a-z0-9-]+):/.exec(contentId)?.[1] ?? namespaceOf(fallbackId)

const today = () => new Date().toISOString().slice(0, 10)
const nowIso = () => new Date().toISOString()
const isPosInt = (v) => Number.isInteger(v) && v > 0

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
    const namespace = namespaceOfId(canonicalId, id)

    /** 统一 checksum：内容指纹 = sha256(规范化序列化)，与文件排版无关（见文件头 ⑤(a)）。 */
    const checksum = sha256Canonical(words)
    const sources = migrateSources(m, id).map((s) => ({ ...s, checksum }))

    /* ── 版本三元组 ─────────────────────────────────────────────────────────
     * contentRevision —— 单调递增审计号：「这个包被构建过多少次」，回滚也不回头。
     * contentVersion  —— 对外学习契约版本：**同一 checksum 复用同一 version**，
     *                    回滚 ⇒ version 回到历史值（学习记录据此判断快照是否同一份）。
     *
     * ⚠️ 三条铁律：
     *  1. 首次迁移（manifest 无 contentHistory）**不递增** —— 否则本轮迁移会让 ielts
     *     从 contentVersion 2 白涨到 3，凭空制造一次「内容变了」。
     *  2. 内容与上次记录一致（contentChecksum === C）⇒ revision/version/publishedAt/
     *     builtAt 全部原样复用，**一个字节都不改** —— 否则每次 build 都改 builtAt，
     *     幂等被直接破坏（永远「有变化」）。
     *  3. 内容确实变了 ⇒ 先查 history：
     *       · 命中历史 checksum（回滚场景）⇒ version = 该条 version，revision = max+1，
     *         不新增条目，publishedAt 复用该快照的发布时间；
     *       · 未命中（全新内容）⇒ revision = version = max+1，push 新条目。
     */
    const prevHistory = Array.isArray(m.contentHistory) ? m.contentHistory.slice() : null
    const maxRev = isPosInt(m.contentRevision) ? m.contentRevision : (isPosInt(m.contentVersion) ? m.contentVersion : 0)
    const contentChanged = m.contentChecksum !== checksum

    let contentRevision, contentVersion, contentPublishedAt, contentHistory, builtAt
    if (prevHistory === null) {
      // ① 首次迁移：只补字段，不递增（铁律 1）
      const v = maxRev || 1
      contentRevision = v
      contentVersion = v
      contentPublishedAt = today()
      contentHistory = [{ revision: v, version: v, checksum, publishedAt: contentPublishedAt }]
      builtAt = nowIso()
    } else {
      const maxRevision = prevHistory.reduce((acc, e) => (isPosInt(e?.revision) && e.revision > acc ? e.revision : acc), maxRev)
      // 回滚时若同一 checksum 在 history 里有多条，取**最近一条**（最后一次以该内容发布的记录）
      const hit = [...prevHistory].reverse().find((e) => e?.checksum === checksum)
      builtAt = m.build?.builtAt ?? nowIso()
      if (!contentChanged) {
        // ② 无变化：原样复用（铁律 2）
        contentRevision = isPosInt(m.contentRevision) ? m.contentRevision : (hit?.revision ?? maxRevision)
        contentVersion = hit?.version ?? (isPosInt(m.contentVersion) ? m.contentVersion : maxRevision)
        contentPublishedAt = hit?.publishedAt ?? (typeof m.contentPublishedAt === 'string' ? m.contentPublishedAt : today())
        contentHistory = prevHistory
      } else if (hit) {
        // ③ 回滚：学习契约版本回到历史值，审计号继续递增
        contentRevision = maxRevision + 1
        contentVersion = hit.version
        contentPublishedAt = hit.publishedAt ?? today()
        contentHistory = prevHistory
        builtAt = nowIso()
      } else {
        // ④ 新内容：revision / version 同步 +1，记录一条历史
        contentRevision = maxRevision + 1
        contentVersion = maxRevision + 1
        contentPublishedAt = today()
        contentHistory = [...prevHistory, { revision: contentRevision, version: contentVersion, checksum, publishedAt: contentPublishedAt }]
        builtAt = nowIso()
      }
    }

    // 版本字段固定排在 manifest 头部：先从 m 副本里删掉再展开（键顺序稳定的前提）
    const base = { ...m }
    for (const k of VERSION_FIELDS) delete base[k]
    const next = {
      schemaVersion: SCHEMA_VERSION,
      packageId: id, // = content/vocabulary/<目录名>，与 UI/持久化键一致
      namespace,
      contentRevision,
      contentVersion,
      contentChecksum: checksum,
      contentPublishedAt,
      contentHistory,
      // build.sourceChecksum 记录本次构建读入的源数据指纹；当前来源就是本仓 words.json，
      // 故 === contentChecksum（将来接原始数据时会分叉，见文件头 ⑤(a)）
      build: { toolVersion: TOOL_VERSION, builtAt, sourceChecksum: checksum },
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

    // 幂等判据：canonical 序列化的语义比较（键序无关 / undefined 忽略），
    // 不能用 JSON.stringify 直比 —— manifest 落盘会被 canonicalFile 重排键序。
    const same = canonicalize(next) === canonicalize(m)
    const wordsCanonical = canonicalFile(words)
    // words.json 格式收敛：canonical 输出与现有字节不同、但 checksum 相同（历史文件带缩进
    // / 键序不合规 / 缺尾随换行）⇒ 重写一次。属排版收敛，**contentVersion 不变**。
    const wordsConverge = wordsCanonical !== rawWords
    if (!same) {
      await writeFile(path.join(dir, 'manifest.json'), canonicalFile(next), 'utf8')
      changed++
      console.log(`▸ ${id}: manifest 已同步（items=${next.stats.items} schemaVersion=${SCHEMA_VERSION} revision=${contentRevision} version=${contentVersion} checksum=${checksum.slice(7, 15)}…）`)
    } else {
      console.log(`▸ ${id}: 无变化`)
    }
    if (wordsConverge) {
      await writeFile(path.join(dir, 'words.json'), wordsCanonical, 'utf8')
      console.log(`   · words.json 格式收敛为 canonical（内容未变，contentVersion=${contentVersion} 不变）`)
    }
  }
  console.log(`\n[content:build] ${ids.length} 包，回写 ${changed} 个`)
}

main().catch((e) => { console.error('[content:build] 异常：', e.message); process.exit(1) })
