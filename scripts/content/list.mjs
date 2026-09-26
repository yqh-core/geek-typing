/* V4.1 · content:list —— 内容包清单展示（文档十三章 CLI 的落地）。
 *
 * V4.1 适配：manifest.source{} → sources[]、license 字符串 → 结构化、id → 4 段式
 * （早期版本直接读 m.source.license，schema 迁移后该字段不存在，脚本会崩）。
 *
 * 用法：node scripts/content/list.mjs [--json]
 */
import { readdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(process.cwd())
const VOCAB_DIR = path.join(ROOT, 'content', 'vocabulary')
const asJson = process.argv.includes('--json')

async function main() {
  if (!existsSync(VOCAB_DIR)) { console.error('content/vocabulary 不存在'); process.exit(1) }
  const ids = (await readdir(VOCAB_DIR, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name)

  const rows = []
  let total = 0
  for (const id of ids) {
    const m = JSON.parse(await readFile(path.join(VOCAB_DIR, id, 'manifest.json'), 'utf8'))
    const feats = Object.entries(m.features ?? {}).filter(([, v]) => v).map(([k]) => k).join(',')
    const lic = (m.sources ?? []).map((s) => s?.license?.spdx ?? 'self').join('+') || '-'
    const items = m.stats?.items ?? 0
    total += items
    rows.push({
      localId: id,
      contentId: m.id,
      namespace: /^content:[a-z]+:([a-z0-9-]+):/.exec(m.id ?? '')?.[1] ?? '-',
      items,
      phonetic: m.stats?.phonetic ?? 0,
      version: m.version,
      features: feats,
      exam: m.exam ?? '-',
      license: lic,
      offline: m.offline?.policy ?? '-',
    })
  }

  if (asJson) {
    console.log(JSON.stringify({ packages: rows, total }, null, 2))
    return
  }

  console.log('Vocabulary')
  console.log('────────────────────────────────────────────────────────────────────────────────')
  for (const r of rows) {
    console.log(
      `✓ ${r.localId.padEnd(14)}${String(r.items).padStart(5)} words  v${r.version}  ` +
        `[${r.features}]  ${r.exam.padEnd(6)} ${r.license.padEnd(5)} ${r.offline.padEnd(5)} ${r.contentId}`,
    )
  }
  console.log('────────────────────────────────────────────────────────────────────────────────')
  console.log(`total: ${rows.length} packages / ${total} words`)
}

main().catch((e) => { console.error(e.message); process.exit(1) })
