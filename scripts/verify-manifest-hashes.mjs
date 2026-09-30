/**
 * 交付包 artifact 完整性检查（P1.7 收口用）
 *
 * 职责：把所有 *-HASH-MANIFEST.md 里登记的「文件 → 字节数 → SHA256」逐条重算比对，
 * 证明交付包里的原始 artifact 未被改动 / 未丢失（machine 层面的「封装完整性」）。
 *
 * 覆盖：docs/audit-package/*-HASH-MANIFEST.md（W2B / W2C / W3 / W4 / W5C / W5D …）
 * 解析：markdown 表格行 `| \`<path>\` | <bytes> | \`<sha256>\` |`
 *       路径中的 `\` 归一化为 `/`。
 *
 * 任一文件缺失 / 字节不符 / SHA256 不符 → exit 1（fail-closed）。
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'

const ROOT = process.cwd()
const AUDIT = join(ROOT, 'docs', 'audit-package')

const manifests = readdirSync(AUDIT)
  .filter((f) => f.endsWith('-HASH-MANIFEST.md'))
  .sort()
if (manifests.length === 0) {
  console.error('❌ 未找到任何 *-HASH-MANIFEST.md')
  process.exit(1)
}

const ROW = /\|\s*`([^`]+)`\s*\|\s*(\d+)\s*\|\s*`([0-9a-f]{64})`\s*\|/g

let totalFiles = 0
let failures = 0
const perManifest = []

for (const mf of manifests) {
  const text = readFileSync(join(AUDIT, mf), 'utf8')
  let m
  let files = 0
  let bad = 0
  ROW.lastIndex = 0
  while ((m = ROW.exec(text)) !== null) {
    const rawPath = m[1].replace(/\\/g, '/')
    const bytes = Number(m[2])
    const sha = m[3]
    const abs = resolve(ROOT, rawPath)
    files++
    totalFiles++
    if (!existsSync(abs)) {
      bad++
      console.log(`  ❌ ${mf}: 缺文件 ${rawPath}`)
      continue
    }
    const buf = readFileSync(abs)
    const actual = createHash('sha256').update(buf).digest('hex')
    if (buf.length !== bytes || actual !== sha) {
      bad++
      console.log(`  ❌ ${mf}: ${rawPath}\n      期望 bytes=${bytes} sha=${sha.slice(0, 16)}…\n      实际 bytes=${buf.length} sha=${actual.slice(0, 16)}…`)
    }
  }
  failures += bad
  perManifest.push({ mf, files, bad })
  console.log(`${bad === 0 ? '  ✅' : '  ❌'} ${mf}：${files} 份文件，${bad} 处不符`)
}

console.log('\n汇总：')
for (const p of perManifest) console.log(`  ${p.mf} => ${p.files} 文件 / ${p.bad} 不符`)
console.log(`  合计核对文件数 = ${totalFiles}；不符 = ${failures}`)
console.log(`\nartifact 完整性：${failures === 0 ? '✅ PASS —— 所有 HASH-MANIFEST 登记的 artifact 逐字节匹配' : `❌ FAIL（${failures} 处不符）`}`)
if (failures > 0) process.exitCode = 1
