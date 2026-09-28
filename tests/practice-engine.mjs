#!/usr/bin/env node
/**
 * P1.6-C · Practice Engine v1 契约测试
 *
 * 验证 src/core/practice/engine.ts 的 completeTypingWord / recordMemorizeAnswer 与 A06 四边界：
 *   A 同词不同包   —— 同词在 N 个包 = N 条独立 (词,包) 记录，互不覆盖
 *   B ContentId 优先级 —— ctx.contentId 覆盖 bankId，落盘键等于给定 contentId
 *   C 重复提交去重 —— 同 contentId 本轮只落一次（第二次 reviewWritten=false，wrongCount 不累加）
 *   D 空异常输入忽略 —— 空词 / 空白词 / 无归属 ctx 均不写、不动 analytics
 * 并覆盖 memorize 整批写（一次 recordPractice 落 memorize + review）与队列追加次数非对称性。
 *
 * 不依赖浏览器：复用 vite ssrLoadModule 在 Node 加载 TS + Map 后备 localStorage 桩
 * （与 tests/learning-service.mjs 同源手法）。
 *
 * 用法：node tests/practice-engine.mjs
 */
import { createServer } from 'vite'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

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

/* ---------------- localStorage 桩（Map 后备） ---------------- */
const lsMap = new Map()
globalThis.localStorage = {
  getItem: (k) => (lsMap.has(k) ? lsMap.get(k) : null),
  setItem: (k, v) => {
    lsMap.set(k, String(v))
  },
  removeItem: (k) => {
    lsMap.delete(k)
  },
  clear: () => lsMap.clear(),
}

const server = await createServer({
  root: ROOT,
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})
const engine = await server.ssrLoadModule('/src/core/practice/engine.ts')
const svc = await server.ssrLoadModule('/src/core/learning/service.ts')

const BANK = 'ai-core'

function storeNow() {
  return JSON.parse(globalThis.localStorage.getItem('gt.learning.v2') || '{}')
}
function keyOf(word) {
  return Object.keys(storeNow()).find((k) => k.includes(word))
}
const newSession = () => engine.createSession('typing', [])

console.log('\n【0】引擎契约：completeTypingWord 返回结构正确')
lsMap.clear()
const sess0 = newSession()
const a0 = svc.getAnalytics()
const r0 = engine.completeTypingWord(sess0, { word: '__c0__', perfect: false, wpm: 40 }, a0, { bankId: BANK })
ok('返回 analytics（对象）', !!r0.analytics && typeof r0.analytics === 'object')
ok('返回 reviewWritten（布尔）', typeof r0.reviewWritten === 'boolean')
ok('错词 → reviewWritten = true', r0.reviewWritten === true)
ok('错词 → 写入 review 子记录（wrongCount=1）', storeNow()[keyOf('__c0__')]?.review?.wrongCount === 1, `wrongCount=${storeNow()[keyOf('__c0__')]?.review?.wrongCount}`)

console.log('\n【A】同词不同包 → (词,包) 各自独立')
lsMap.clear()
const sessA = newSession()
engine.completeTypingWord(sessA, { word: 'apple', perfect: false }, svc.getAnalytics(), { bankId: 'ai-core' })
engine.completeTypingWord(sessA, { word: 'apple', perfect: false }, svc.getAnalytics(), { bankId: 'custom-x' })
const sA = storeNow()
const keysA = Object.keys(sA).filter((k) => k.includes('apple'))
ok('同词跨包产生 ≥2 条记录', keysA.length >= 2, `keys=${keysA.length}`)
ok('两条记录 namespace 不同（ai-core vs custom-x）', new Set(keysA.map((k) => k.split(':')[2])).size >= 2, `ns=${[...new Set(keysA.map((k) => k.split(':')[2]))].join(',')}`)
ok('两包各自 wrongCount=1（互不覆盖）', keysA.every((k) => sA[k]?.review?.wrongCount === 1))

console.log('\n【B】ContentId 优先级：ctx.contentId 覆盖 bankId')
lsMap.clear()
const sessB = newSession()
const OVERRIDE_CID = 'content:word:custom-ovr:apple'
engine.completeTypingWord(sessB, { word: 'apple', perfect: false }, svc.getAnalytics(), { contentId: OVERRIDE_CID, bankId: 'ai-core' })
const sB = storeNow()
const kB = Object.keys(sB).find((k) => k.includes('apple'))
ok('写入键等于给定 contentId（非 bankId 推导）', !!kB && kB === OVERRIDE_CID, kB)
ok('review 子记录挂在 override contentId 下', !!sB[OVERRIDE_CID]?.review)

console.log('\n【C】重复提交去重：同 contentId 本轮只落一次')
lsMap.clear()
const sessC = newSession()
const rC1 = engine.completeTypingWord(sessC, { word: '__dup__', perfect: false }, svc.getAnalytics(), { bankId: BANK })
const rC2 = engine.completeTypingWord(sessC, { word: '__dup__', perfect: false }, svc.getAnalytics(), { bankId: BANK })
const sC = storeNow()
const kC = keyOf('__dup__')
ok('首次提交 reviewWritten = true', rC1.reviewWritten === true)
ok('重复提交 reviewWritten = false（被去重）', rC2.reviewWritten === false)
ok('wrongCount 不重复累加（仍为 1）', sC[kC]?.review?.wrongCount === 1, `wrongCount=${sC[kC]?.review?.wrongCount}`)

console.log('\n【D】空/异常输入忽略：不写、不动 analytics')
lsMap.clear()
const sessD = newSession()
const aD = svc.getAnalytics()
const rD1 = engine.completeTypingWord(sessD, { word: '', perfect: false }, aD, { bankId: BANK })
const rD2 = engine.completeTypingWord(sessD, { word: '   ', perfect: false }, aD, { bankId: BANK })
const rD3 = engine.completeTypingWord(sessD, { word: '__emptyctx__', perfect: false }, aD, {}) // 无 bankId/contentId
const sD = storeNow()
ok('空词 → reviewWritten = false', rD1.reviewWritten === false)
ok('空白词 → reviewWritten = false', rD2.reviewWritten === false)
ok('无归属 ctx → reviewWritten = false（C4 不猜）', rD3.reviewWritten === false)
ok('空输入不写任何记录', Object.keys(sD).filter((k) => k.includes('__emptyctx__')).length === 0)
ok('空输入 analytics 不变（引用相等）', rD1.analytics === aD && rD3.analytics === aD)

console.log('\n【M】recordMemorizeAnswer：整批写 + 重复次数')
lsMap.clear()
const m1 = engine.recordMemorizeAnswer({ word: '__mk__', bankId: BANK }, 'known')
ok('known → view 含该词 status=known', m1.view['__mk__']?.status === 'known')
ok('known → repeat=0', m1.repeat === 0)
const m2 = engine.recordMemorizeAnswer({ word: '__mu__', bankId: BANK }, 'unknown')
ok('unknown → repeat=2', m2.repeat === 2)
ok('unknown → review 子记录已写（wrongCount=1）', storeNow()[keyOf('__mu__')]?.review?.wrongCount === 1)
const m3 = engine.recordMemorizeAnswer({ word: '__mf__', bankId: BANK }, 'fuzzy')
ok('fuzzy → repeat=1', m3.repeat === 1)
const m4 = engine.recordMemorizeAnswer({ word: '   ', bankId: BANK }, 'known')
ok('空词 → repeat=0 且不抛', m4.repeat === 0 && !!m4.view)

console.log('\n【X】打字增量写 vs 背单词整批写 非对称性（保留）')
lsMap.clear()
const sessX = newSession()
// 打字：逐词 3 连（analytics 走 React 态、v2/review 落盘）
engine.completeTypingWord(sessX, { word: '__t1__', perfect: true }, svc.getAnalytics(), { bankId: BANK })
engine.completeTypingWord(sessX, { word: '__t2__', perfect: false }, svc.getAnalytics(), { bankId: BANK })
const sX = storeNow()
ok('打字 → 每个词各自一条 v2 记录', !!sX[keyOf('__t1__')] && !!sX[keyOf('__t2__')])
ok('打字 perfect 词 → review 子记录不写（仅 analytics.markedDone）', sX[keyOf('__t1__')]?.analytics?.done === 1 && sX[keyOf('__t1__')]?.review === undefined)
ok('打字 wrong 词 → review.wrongCount=1', sX[keyOf('__t2__')]?.review?.wrongCount === 1)
// 背单词：一次 recordPractice 整批落 memorize + review（unknown 自动记错）
engine.recordMemorizeAnswer({ word: '__mz__', bankId: BANK }, 'unknown')
const sXm = storeNow()
ok('背单词 unknown → memorize 子记录 status=unknown', sXm[keyOf('__mz__')]?.memorize?.status === 'unknown')
ok('背单词 unknown → review 子记录同步写（整批）', sXm[keyOf('__mz__')]?.review?.wrongCount === 1)

await server.close()

console.log(`\n──────────────────────────────────────────────────────`)
console.log(`共 ${pass + fail} 项，通过 ${pass}，失败 ${fail}`)
console.log(`──────────────────────────────────────────────────────`)
if (fail > 0) {
  console.log('失败项：' + failures.join(' | '))
  process.exit(1)
}
