/* V4-P0 · content:list —— 内容包清单展示（文档十三章 CLI 的落地）。
 * 用法：node scripts/content/list.mjs
 */
import { readdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(process.cwd())
const VOCAB_DIR = path.join(ROOT, 'content', 'vocabulary')

async function main() {
  if (!existsSync(VOCAB_DIR)) { console.error('content/vocabulary 不存在'); process.exit(1) }
  const ids = (await readdir(VOCAB_DIR, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name)
  console.log('Vocabulary')
  console.log('───────────────────────────────')
  for (const id of ids) {
    const m = JSON.parse(await readFile(path.join(VOCAB_DIR, id, 'manifest.json'), 'utf8'))
    const feats = Object.entries(m.features).filter(([, v]) => v).map(([k]) => k).join(',')
    console.log(`✓ ${id.padEnd(14)} ${String(m.stats.items).padStart(5)} words  v${m.version}  [${feats}]  ${m.exam ?? '-'}  ${m.source.license}`)
  }
  console.log('───────────────────────────────')
  console.log(`total: ${ids.length} packages`)
}

main().catch((e) => { console.error(e.message); process.exit(1) })
