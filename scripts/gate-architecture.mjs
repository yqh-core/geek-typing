#!/usr/bin/env node
/**
 * P1.7 Wave 3 · A-4 Architecture Gate 汇总门
 *
 * 职责：把分散的架构子门禁串成「一键可跑」的单一入口（`npm run gate:architecture`）。
 * 判据一句话：任一**已接入**子门非 0 → 总 EXIT=1，且指名是哪个子项红、红在哪几行。
 *
 * 为什么用子进程而不是 import 子门：子门都是「脚本」而非「库」——它们自己
 * `process.exit()`，且 stdout 是给人看的报告而非可断言的数据结构。用 spawnSync
 * 分别执行可以拿到各自的退出码与原始输出尾部，失敗时定位信息不丢失；
 * 代价是不能共享扫描结果（子门之间会重复读文件），这个代价在秒级量级内可接受。
 *
 * ── 关于「未接入子门」的取舍（重要，此处刻意不静默）────────────────────────
 * 计划 A-4 原文要求汇总是「B02 + G4 + A03 + persistence + content-contract」，
 * 但 content-contract 属 Wave 4、perf（A-5 清单里的 bundle budget 门）属 Wave 5，
 * 两个脚本在 Wave 3 时点**尚不存在**。
 *
 * 三种可选处理：
 *   ① 直接不列 —— 最省事，但等于把「架构不变量还有两块没有自动落点」这个事实
 *      从门禁输出里抹掉，阅读者会误以为汇总门已经是完备的。**不采用**。
 *   ② 缺文件即 FAIL —— 语义上不对：一个尚未到期的门不应阻断当前 Wave 的出口，
 *      否则 Wave 3 永远不可能绿，门禁就变成了「假装严格」的门。**不采用**。
 *   ③ 显式 PENDING —— 缺失必须在输出里看得见（单独一整行、带待落地 Wave），
 *      但不计入 FAIL，并在结尾固定打印一行「未接入子项」清单。**本文件采用**。
 *
 * 因此 PENDING 的语义是「**已知缺口，尚未到期**」，不是「已通过」。它会被
 * docs/ARCHITECTURE-INVARIANTS.md 的「Wave 归属与现状」一节交叉引用；
 * 一旦对应 Wave 落地、脚本文件出现，下面的 FUTURE_GATES 会自动从 PENDING
 * 转为真实执行并计入 FAIL —— 无需改本文件的逻辑。
 *
 * 退出码：0 = 全部已接入子门通过；1 = 任一已接入子门非 0（PENDING 不影响）。
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** 汇总门显示失败详情时保留的输出行数 */
const TAIL_LINES = 15

/** 已接入子门：文件必须存在，缺文件视为架构错误（FAIL） */
const SUB_GATES = [
  { id: 'B02', label: 'learning-boundary', script: 'scripts/gate-learning-boundary.mjs', note: 'UI→core/learning 唯一入口 / UI❌→lib/learning' },
  { id: 'G4', label: 'g4', script: 'scripts/gate-g4.mjs', note: 'G4-1/2/3① 静态侧（键族入口 + 零静默 catch）' },
  { id: 'A03', label: 'legacy-wordbank', script: 'scripts/gate-legacy-wordbank.mjs', note: '旧词库边界' },
  { id: 'persistence', label: 'persistence', script: 'scripts/gate-persistence.mjs', note: 'UI❌→localStorage；core/learning❌→browser storage 直触' },
  { id: 'practice-engine', label: 'practice-engine', script: 'scripts/gate-practice-engine.mjs', note: '练习引擎边界' },
]

/**
 * 尚未落地的计划内子门（Wave 4 / Wave 5）。
 * 存在即执行并计入 FAIL；不存在即 PENDING，不计入 FAIL，但显式打印。
 */
const FUTURE_GATES = [
  { id: 'content-contract', label: 'content-contract', script: 'scripts/gate-content-contract.mjs', wave: 'Wave 4', note: 'Content 必须经 registry 注册' },
  { id: 'content-type-contract', label: 'content-type-contract', script: 'scripts/gate-content-type-contract.mjs', wave: 'P1.8-A', note: '类型契约唯一 / 禁 per-type 散落 / 注册表⟷查询层对账（INV-6）' },
  { id: 'perf', label: 'perf', script: 'scripts/gate-perf.mjs', wave: 'Wave 5', note: '新依赖必须过 bundle budget' },
  { id: 'license', label: 'license', script: 'scripts/gate-license.mjs', wave: 'P1.8-B', note: '资产/许可入库前置硬门（INV-5）' },
]

function tail(text, n = TAIL_LINES) {
  const lines = String(text ?? '').replace(/\r$/gm, '').split('\n')
  // 去掉尾部空行，避免打印出来一坨空白
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop()
  return lines.slice(-n)
}

function runGate(gate) {
  const abs = join(ROOT, gate.script)
  // stdio 必须显式给成 ['ignore', 'pipe', 'pipe']：本机沙箱下默认 stdio 会让
  // spawnSync 以 EBUSY 失败（status=null 且无输出），那样汇总门会把「执行不起来」
  // 误报成「子门失败」。显式 ignore 掉 stdin 后子进程可正常拉起。
  const res = spawnSync(process.execPath, [abs], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (res.error) {
    return { code: 1, output: `子进程启动失败：${res.error.message}` }
  }
  const code = typeof res.status === 'number' ? res.status : 1
  const output = `${res.stdout ?? ''}${res.stderr ?? ''}`
  return { code, output }
}

console.log('== P1.7-W3 · Architecture Gate 汇总（A-4）==')
console.log(`已接入子门 ${SUB_GATES.length} 个，计划内待落地 ${FUTURE_GATES.length} 个（PENDING 不计 FAIL，但必打印）\n`)

const failed = []
const passed = []
const pending = []

for (const gate of SUB_GATES) {
  if (!existsSync(join(ROOT, gate.script))) {
    // 已接入清单里的文件缺失 = 架构事故，不能退化成 PENDING
    failed.push({ ...gate, code: 'MISSING', output: `子门脚本不存在：${gate.script}` })
    console.log(`  ❌ ${gate.id.padEnd(14)} ${gate.label.padEnd(18)} 缺失脚本 ${gate.script}`)
    continue
  }
  const { code, output } = runGate(gate)
  if (code === 0) {
    passed.push(gate)
    console.log(`  ✅ ${gate.id.padEnd(14)} ${gate.label.padEnd(18)} EXIT=0  ${gate.note}`)
  } else {
    failed.push({ ...gate, code, output })
    console.log(`  ❌ ${gate.id.padEnd(14)} ${gate.label.padEnd(18)} EXIT=${code}  ${gate.note}`)
  }
}

for (const gate of FUTURE_GATES) {
  if (existsSync(join(ROOT, gate.script))) {
    // Wave 已落地 → 自动转为真实子门，红则计入 FAIL
    const { code, output } = runGate(gate)
    if (code === 0) {
      passed.push(gate)
      console.log(`  ✅ ${gate.id.padEnd(14)} ${gate.label.padEnd(18)} EXIT=0  （已从 PENDING 转为已接入）${gate.note}`)
    } else {
      failed.push({ ...gate, code, output })
      console.log(`  ❌ ${gate.id.padEnd(14)} ${gate.label.padEnd(18)} EXIT=${code}  （已从 PENDING 转为已接入）${gate.note}`)
    }
    continue
  }
  pending.push(gate)
  console.log(`  ⏳ ${gate.id.padEnd(14)} ${gate.label.padEnd(18)} PENDING（未接入：${gate.wave} 待落地）  ${gate.note}`)
}

if (failed.length) {
  console.log('\n---- 失败子项明细（输出最后 ' + TAIL_LINES + ' 行）----')
  for (const g of failed) {
    console.log(`\n[${g.id} ${g.label}] EXIT=${g.code} — ${g.script}`)
    for (const line of tail(g.output)) console.log(`  ${line}`)
  }
}

const pendingList = pending.map((g) => `${g.id}(${g.wave})`)

console.log(`\n共 ${SUB_GATES.length + FUTURE_GATES.length} 项：通过 ${passed.length}，失败 ${failed.length}，未接入 ${pending.length}`)
console.log(`失败子项：${failed.length ? failed.map((g) => `${g.id} ${g.label}`).join(' / ') : '无'}`)
console.log(`未接入子项：${pendingList.length ? pendingList.join(' / ') : '无'}`)
if (pendingList.length) {
  console.log('ℹ️ PENDING = 该门尚未到落地 Wave，不阻断当前 Wave 出口；落地后脚本出现即自动转为真实子门并计入 FAIL。')
}
console.log(failed.length ? '\n❌ Architecture Gate FAIL' : '\n✅ Architecture Gate PASS')

process.exit(failed.length > 0 ? 1 : 0)
