#!/usr/bin/env node
/**
 * P1.7 Wave 2-C · Persistence Boundary Gate（A-1 验收判据）
 *
 * 判据一句话：`src/` 下出现 `localStorage` 标识符的文件，**只允许是 `src/core/persistence/**`**。
 *
 * 为什么按「标识符出现」而不是「调用出现」判定：
 *   - 注释里的 `localStorage` 同样会被扫到 —— 这是**刻意的严格**：注释若还写着
 *     「直连 localStorage」，要么说明注释已过期，要么说明有人打算再开一条直连路径。
 *     修正方式是**改注释措辞**（本机存储 / 存储层），不是放宽本判据；
 *   - 因此本门禁同时兼任「文档与实现一致性」检查：豁免目录外的任何提及都必须消失。
 *
 * 为什么豁免 `src/core/persistence/**`：那里是 StorageAdapter 的唯一实现点
 * （`adapter.ts` 的 LocalStorageAdapter），它必须直连 —— 边界的意义是「只有一处直连」，
 * 而不是「零直连」。豁免清单在输出里显式打印，便于审计豁免范围没有悄悄扩大。
 *
 * 退出码：0 = 全部合规；1 = 出现违规（逐条打印 文件路径:行号）。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'src')

/** 唯一豁免前缀：持久化层内部（StorageAdapter 的唯一实现点 + 迁移写入口） */
const EXEMPT_PREFIX = 'src/core/persistence/'

const NEEDLE = 'localStorage'

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx|js|jsx|mjs|css|html)$/.test(name)) out.push(p)
  }
  return out
}

const rel = (p) => relative(ROOT, p).replaceAll('\\', '/')
const files = walk(SRC).map(rel).sort()

const violations = [] // { file, line, text }
const exempt = [] // { file, lines }

for (const r of files) {
  const lines = readFileSync(join(ROOT, r), 'utf8').split(/\r?\n/)
  const hits = []
  lines.forEach((line, i) => {
    if (line.includes(NEEDLE)) hits.push({ file: r, line: i + 1, text: line.trim() })
  })
  if (!hits.length) continue
  if (r.startsWith(EXEMPT_PREFIX)) exempt.push({ file: r, count: hits.length })
  else violations.push(...hits)
}

console.log('== P1.7-W2C · Persistence Boundary Gate ==')
console.log(`扫描文件 ${files.length} 个（src/ 全量，豁免前缀 ${EXEMPT_PREFIX}）`)

if (violations.length > 0) {
  console.log(`\n❌ 违规 ${violations.length} 处 —— src/ 下 localStorage 直连只允许出现在 ${EXEMPT_PREFIX}：`)
  for (const v of violations) console.log(`   ${v.file}:${v.line}  ${v.text}`)
  console.log('\n  修正方式：把读写改为经 src/core/persistence/channels.ts 的具名通道；')
  console.log('  若只是注释/文案提及，改掉措辞（本机存储 / 存储层），不要放宽本判据。')
  process.exit(1)
}

const exemptTotal = exempt.reduce((n, e) => n + e.count, 0)
console.log(`\n  ✅ 无越界直连（违规 0 处）`)
console.log(`  ✅ 豁免文件 ${exempt.length} 个 / 提及 ${exemptTotal} 处（唯一豁免前缀 ${EXEMPT_PREFIX}）`)
for (const e of exempt) console.log(`     - ${e.file}（${e.count} 处）`)
console.log('\n共 1 项判据，通过 1，失败 0')
process.exit(0)
