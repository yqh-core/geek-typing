#!/usr/bin/env node
/**
 * P1.6-A06 · LearningService 链路契约测试
 *
 * 验证「UI → LearningService.recordPractice → lib/learning 写函数 → gt.learning.v2」这条
 * P1.6 新链路的写入与读取，确保门面没有改坏既有 State B 语义（与 Memorize.answer /
 * App.tsx settleReview 逐字等价）。
 *
 * 不依赖浏览器：用 vite ssrLoadModule 在 Node 里加载 TS 模块，并用 Map 后备的
 * localStorage 桩驱动（与 tests/learning-storage.mjs 同源手法）。
 *
 * 用法：node tests/learning-service.mjs
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

/* ---------------- localStorage 桩（Map 后备，调用时动态解析，无需重载模块） ---------------- */
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

const server = await createServer({ root: ROOT, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const svc = await server.ssrLoadModule('/src/core/learning/service.ts')

const BANK = 'ai-core' // 默认内置包，确保 namespace 可解析

function makeResult(mode, answers, sessionId = `s-${Date.now()}-${Math.random()}`) {
  return {
    sessionId,
    mode,
    contentIds: answers.map((a) => a.word),
    startedAt: Date.now(),
    completedAt: Date.now(),
    results: answers,
  }
}

function storeNow() {
  return JSON.parse(globalThis.localStorage.getItem('gt.learning.v2') || '{}')
}
function keyOf(word) {
  return Object.keys(storeNow()).find((k) => k.includes(word))
}

console.log('\n【1】memorize known → 仅写 memorize 子记录')
lsMap.clear()
const w1 = '__p16_known__'
svc.recordPractice(makeResult('memorize', [{ word: w1, bankId: BANK, memStatus: 'known', correct: true }]))
let s = storeNow()
let k1 = keyOf(w1)
ok('memorize known 写入 gt.learning.v2', !!k1 && !!s[k1]?.memorize, k1)
ok('memorize known status = known', s[k1]?.memorize?.status === 'known')
ok('memorize known 不写 review 子记录', s[k1]?.review === undefined)

console.log('\n【2】memorize 二次 → reviews 自增')
svc.recordPractice(makeResult('memorize', [{ word: w1, bankId: BANK, memStatus: 'known', correct: true }]))
s = storeNow()
ok('memorize 二次 reviews = 2', s[k1]?.memorize?.reviews === 2, `reviews=${s[k1]?.memorize?.reviews}`)

console.log('\n【3】memorize unknown → 写 review 子记录（wrongCount=1）')
const w2 = '__p16_unknown__'
svc.recordPractice(makeResult('memorize', [{ word: w2, bankId: BANK, memStatus: 'unknown', correct: false }]))
s = storeNow()
const k2 = keyOf(w2)
ok('memorize unknown 写 review 子记录', !!s[k2]?.review, k2)
ok('memorize unknown review.wrongCount = 1', s[k2]?.review?.wrongCount === 1, `wrongCount=${s[k2]?.review?.wrongCount}`)

console.log('\n【4】typing 错 → review.wrongCount=1（recordWordDoneV2 也写 analytics）')
const w3 = '__p16_typing__'
svc.recordPractice(makeResult('typing', [{ word: w3, bankId: BANK, correct: false }]))
s = storeNow()
const k3 = keyOf(w3)
ok('typing 错 → review.wrongCount = 1', s[k3]?.review?.wrongCount === 1, `wrongCount=${s[k3]?.review?.wrongCount}`)
ok('typing 错 → analytics 子记录已写', s[k3]?.analytics?.done === 1, `done=${s[k3]?.analytics?.done}`)

console.log('\n【5】typing 对（已有 review）→ recordCorrect 推进 intervalIdx')
svc.recordPractice(makeResult('typing', [{ word: w3, bankId: BANK, correct: true }]))
s = storeNow()
ok('typing 对 → review.intervalIdx 推进为 1', s[k3]?.review?.intervalIdx === 1, `idx=${s[k3]?.review?.intervalIdx}`)

console.log('\n【6】读取侧（门面转发，不抛）')
ok('getMemorizeView 返回对象', typeof svc.getMemorizeView(BANK) === 'object')
ok('getDueItems 返回数组', Array.isArray(svc.getDueItems()))
ok('getMastery 返回分布（含 attributed）', !!svc.getMastery()?.attributed)
ok('getReviewItems 返回数组', Array.isArray(svc.getReviewItems()))
ok('getState 命中已知词', svc.getState(k1)?.hasRecord === true)
ok('getState 未命中返回 hasRecord=false', svc.getState('content:word:curated-ai-core:__never__')?.hasRecord === false)

await server.close()

console.log(`\n──────────────────────────────────────────────────────`)
console.log(`共 ${pass + fail} 项，通过 ${pass}，失败 ${fail}`)
console.log(`──────────────────────────────────────────────────────`)
if (fail > 0) {
  console.log('失败项：' + failures.join(' | '))
  process.exit(1)
}
