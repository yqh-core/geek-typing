#!/usr/bin/env node
/**
 * P1.5-S1 · G1-3 门禁：analytics 单词身份键 = 原词形（lowercase 旁路消灭）
 *
 * 背景：旧 recordWordDone 用 `word.toLowerCase()` 做身份键 ⇒ `treeShaking` 打成
 * `treeshaking`，与 review/memorize（原词形键）口径分裂 —— G1-4 真实链路样本实测
 * `Case conflict = 1` 的根因。修复（yqh 2026-09-28 批准解冻）：
 *   ① 写入：身份键一律原词形（recordWordDone 函数体内零 toLowerCase）
 *   ② 读取兼容：wordStatOf 原词形优先、miss 才查 lowercase（只读，不回写）
 *   ③ 写入时迁移：absorbLegacyWordKey 把同词历史 lowercase 计数并入原词形键后删除
 *
 * 判据（对齐门禁文档 G1-3 修订版）：
 *   a) recordWordDone 函数体内 `toLowerCase` 计数 === 0（写入路径零旁路）
 *   b) 全文件其余 toLowerCase 各归白名单：letter 字母级 / wordStatOf / absorbLegacyWordKey（legacy 兼容）/ rankByWeakness（打分）
 *   c) 行为 10 项（下方各 ok()）
 *
 * 怎么加载 TS：Vite `ssrLoadModule`（写法学 tests/content-query.mjs:31-34）。
 * 用法：node tests/analytics-identity.mjs
 */
import { createServer } from 'vite'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

let pass = 0
let fail = 0
const failures = []

function ok(name, cond, detail = '') {
  if (cond) {
    pass++
    console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`)
  } else {
    fail++
    failures.push(name)
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const mod = await server.ssrLoadModule('/src/lib/analytics.ts')
const { recordWordDone, wordStatOf, wrongWords } = mod

const EMPTY = { letters: {}, words: {}, totalKeys: 0, totalCorrect: 0, totalWords: 0, bestWpm: 0 }

/* ---------- a+b. 源码级判据（不依赖行为测试，独立真值） ---------- */
console.log('\n【a+b】源码级：写入路径零 toLowerCase')
{
  const src = readFileSync(resolve(root, 'src/lib/analytics.ts'), 'utf8')
  const i = src.indexOf('export function recordWordDone')
  const body = src.slice(i, src.indexOf('\n}', i))
  const bodyCount = (body.match(/toLowerCase/g) || []).length
  ok('recordWordDone 函数体内 toLowerCase 计数 = 0', bodyCount === 0, `count=${bodyCount}`)

  // 全文件每一处 toLowerCase 必须落在白名单函数内（逐处归属检查，不是数总数）
  const whitelist = ['recordKey', 'wordStatOf', 'absorbLegacyWordKey', 'rankByWeakness']
  const lines = src.split('\n')
  const offenders = []
  lines.forEach((line, idx) => {
    if (!line.includes('toLowerCase')) return
    // 向上找最近的 function 声明，确认归属
    let owner = null
    for (let j = idx; j >= 0; j--) {
      const m = lines[j].match(/(?:function|const)\s+(\w+)/)
      if (m && lines[j].includes('function')) { owner = m[1]; break }
    }
    if (!owner || !whitelist.includes(owner)) offenders.push(`:${idx + 1} (owner=${owner ?? '???'})`)
  })
  ok('全文件 toLowerCase 全部归属白名单（letter/wordStatOf/absorbLegacyWordKey/rankByWeakness）', offenders.length === 0, offenders.join(' ') || '4 处全部合法')
}

/* ---------- c. 行为 10 项 ---------- */
console.log('\n【c】行为契约')

/* 1. 写入原词形 */
{
  const a = recordWordDone(EMPTY, 'treeShaking', true, 60)
  ok('recordWordDone 写入原词形键', a.words['treeShaking']?.done === 1, JSON.stringify(a.words))
  ok('不再产生 lowercase 键', a.words['treeshaking'] === undefined)
}

/* 2. 纯函数性：不 mutate 输入 */
{
  const before = JSON.stringify(EMPTY)
  recordWordDone(EMPTY, 'apple', false, 40)
  ok('recordWordDone 纯函数（不改输入）', JSON.stringify(EMPTY) === before)
}

/* 3. 写入时迁移：legacy lowercase 计数并入原词形键 */
{
  const a = { ...EMPTY, words: { treeshaking: { done: 3, wrong: 1 } } }
  const out = recordWordDone(a, 'treeShaking', false, 50)
  ok('legacy lowercase 计数并入原词形键（done 3+1=4 / wrong 1+1=2）',
    out.words['treeShaking']?.done === 4 && out.words['treeShaking']?.wrong === 2,
    JSON.stringify(out.words))
  ok('legacy lowercase 键消失', out.words['treeshaking'] === undefined)
  ok('totalWords 只 +1（合并不虚增）', out.totalWords === 1)
}

/* 4. 全小写词不受影响 */
{
  const a = recordWordDone(EMPTY, 'apple', false, 30)
  const b = recordWordDone(a, 'apple', true, 44)
  ok('全小写词正常累加（done=2, wrong=1）', b.words['apple']?.done === 2 && b.words['apple']?.wrong === 1)
}

/* 5. wordStatOf 原词形优先 */
{
  const a = { ...EMPTY, words: { treeshaking: { done: 9, wrong: 9 }, treeShaking: { done: 2, wrong: 0 } } }
  const s = wordStatOf(a, 'treeShaking')
  ok('wordStatOf 原词形优先（legacy 共存时取原词形）', s.done === 2 && s.wrong === 0, JSON.stringify(s))
}

/* 6. wordStatOf fallback 只读 */
{
  const a = { ...EMPTY, words: { treeshaking: { done: 3, wrong: 1 } } }
  const snapshot = JSON.stringify(a.words)
  const s = wordStatOf(a, 'treeShaking')
  ok('wordStatOf miss 时 fallback legacy lowercase', s.done === 3 && s.wrong === 1, JSON.stringify(s))
  ok('fallback 是只读（lowercase 键不被写回/不消失）', JSON.stringify(a.words) === snapshot)
}

/* 7. wordStatOf 零值兜底 */
{
  const s = wordStatOf(EMPTY, 'apple')
  ok('wordStatOf 两边皆无 → {done:0,wrong:0}', s.done === 0 && s.wrong === 0)
}

/* 8. wrongWords 返回原词形 */
{
  let a = recordWordDone(EMPTY, 'treeShaking', false, 30)
  a = recordWordDone(a, 'useEffect', true, 70)
  const names = wrongWords(a).map((w) => w.word)
  ok('wrongWords 返回原词形键', names.includes('treeShaking') && !names.includes('treeshaking'), names.join(','))
}

/* 9. 两词形独立计数（身份键不再打平） */
{
  let a = recordWordDone(EMPTY, 'Apple', false, 30)
  a = recordWordDone(a, 'apple', true, 30)
  ok('Apple 与 apple 是两个独立身份键', a.words['Apple']?.done === 1 && a.words['apple']?.done === 1, JSON.stringify(a.words))
  ok('totalWords = 2（两个词都算）', a.totalWords === 2)
}

/* 10. legacy 合并 + 原词形已有计数的复合场景 */
{
  const a = { ...EMPTY, words: { treeshaking: { done: 5, wrong: 2 }, treeShaking: { done: 1, wrong: 1 } } }
  const out = recordWordDone(a, 'treeShaking', true, 80)
  ok('复合场景：原词形已有计数 + legacy 并入（done 1+5+1=7 / wrong 1+2+0=3）',
    out.words['treeShaking']?.done === 7 && out.words['treeShaking']?.wrong === 3,
    JSON.stringify(out.words))
}

console.log('──────────────────────────────────────────────────────')
console.log(`共 ${pass + fail} 项，通过 ${pass}，失败 ${fail}`)
console.log('──────────────────────────────────────────────────────')
if (fail > 0) {
  console.log('失败项：', failures.join(' / '))
  process.exit(1)
}
await server.close()
