/**
 * 错题本压力实测（批8 A3）：5000 条错题条目的 localStorage JSON 体积
 *
 * 结论用途：评估「不做元组压缩」的合理性——JSON 对象 map 体积远低于
 * localStorage 5MB 上限即无需压缩（压缩会破坏 e2e 对 schema 的直接断言）。
 *
 * 用法：node scripts/stress-review.mjs [条目数=5000]
 */
const N = Number(process.argv[2] ?? 5000)
const DAY = 86400000
const now = Date.now()

// 与 src/lib/reviewStore.ts 的 ReviewEntry 完全一致的字段与量级
const store = {}
for (let i = 0; i < N; i++) {
  const idx = i % 5 // intervalIdx 均匀分布在 [0,4]，贴近真实分布
  store[`stress-w-${String(i).padStart(5, '0')}`] = {
    wrongCount: 1 + (i % 7),
    correctStreak: idx,
    lastWrongAt: now - (i % 30) * DAY,
    nextReviewAt: now + [1, 2, 4, 7, 15][idx] * DAY,
    intervalIdx: idx,
  }
}

const bytes = Buffer.byteLength(JSON.stringify(store), 'utf8')
const kb = bytes / 1024
const mb = kb / 1024
const quotaMB = 5
const pct = ((mb / quotaMB) * 100).toFixed(2)

console.log('=== reviewStore localStorage 压力实测 ===')
console.log(`条目数         : ${N}`)
console.log(`JSON 字节数    : ${bytes.toLocaleString()} B`)
console.log(`JSON 体积      : ${kb.toFixed(1)} KB (${mb.toFixed(3)} MB)`)
console.log(`占 5MB 上限比例 : ${pct}%`)
console.log(`单条均摊       : ${(bytes / N).toFixed(0)} B`)
