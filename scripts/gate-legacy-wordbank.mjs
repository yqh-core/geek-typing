#!/usr/bin/env node
/**
 * P1.6-A03 · 禁止新增 Legacy WordBank 依赖门禁
 *
 * 依据：用户 P1.6 第三阶段「WordBank 不删除，而是降级为 Legacy WordBank Adapter」，
 * 以及 A03「禁止新增 Legacy WordBank 依赖」。
 *
 * 判定：
 *   - 全 src/ 下所有从 wordBanks 导入的文件，必须落在已知白名单内；
 *   - 白名单外的任何文件（哪怕是 `import type`）一旦 import wordBanks → FAIL。
 *   - 这是「防新增依赖」的核心：已有消费点被一次性冻结，后续新增模块若想接 wordBanks
 *     会被直接拦下。
 *
 * P1.6-D 白名单变更（搬家 ≠ 新增）：App.tsx 拆 hook 后，原 App.tsx 的 wordBanks 依赖
 *   随之落到 3 个 hook —— useBank.ts（值导入 bankWordsOf/ensureBankWords）、
 *   useReviewFlow.ts 与 useTypingRound.ts（类型导入 WordItem）。这是同一批消费者的
 *   位置迁移，不是新依赖，故纳入白名单；此后任何**其它**文件接 wordBanks 仍一律 FAIL。
 *
 * 退出码：0 = 通过；1 = 任一 FAIL。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'src')

/** 已知消费点（相对仓库根）。新增依赖一律不得超出此集合。 */
const ALLOWLIST = new Set([
  'src/App.tsx',
  'src/lib/wordResolve.ts',
  'src/lib/customBanks.ts',
  'src/components/BankManager.tsx',
  'src/components/CommandPalette.tsx',
  'src/components/ReviewPanel.tsx',
  'src/components/Memorize.tsx',
  'src/components/Header.tsx',
  // P1.6-D：App 拆 hook 的搬家落点（见文件头说明）
  'src/hooks/useBank.ts',
  'src/hooks/useReviewFlow.ts',
  'src/hooks/useTypingRound.ts',
])

let pass = 0
let fail = 0
function ok(name, cond, detail = '') {
  if (cond) {
    pass++
    console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`)
  } else {
    fail++
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

const files = walk(SRC)
const rel = (p) => relative(ROOT, p).replaceAll('\\', '/')

// 匹配 `from '...wordBanks'` / `from "..wordBanks"`（路径可含 ../ 与子目录）
const IMPORT_RE = /from\s+['"][^'"]*wordBanks['"]/g

const importers = []
for (const f of files) {
  const text = readFileSync(f, 'utf8')
  if (IMPORT_RE.test(text)) importers.push(rel(f))
}

console.log('== P1.6-A03 · 禁止新增 Legacy WordBank 依赖 ==')
ok('导入 wordBanks 的文件数未超出白名单', importers.length <= ALLOWLIST.size, `${importers.length} 个`)

let illegal = []
for (const f of importers) {
  if (!ALLOWLIST.has(f)) illegal.push(f)
}

ok(
  '所有 wordBanks 导入点均落在已知白名单内（无新增依赖）',
  illegal.length === 0,
  illegal.length ? `非法新增 = ${illegal.join(', ')}` : `当前 ${importers.length} 个：${importers.join(', ')}`,
)

console.log(`\n共 ${pass + fail} 项，通过 ${pass}，失败 ${fail}`)
process.exit(fail > 0 ? 1 : 0)
