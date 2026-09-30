#!/usr/bin/env node
/**
 * P1.5 + P1.8 · 分层 Release Gate 机器判定器（冻结区自引用冲突的解法）
 *
 * ── 为什么必须分两份合同（冻结区自引用冲突）──────────────────────────────
 *   P1.5 的 release:gate 判据全部从
 *   `docs/audit-package/13-acceptance/P1.5-RELEASE-GATE.md` 的逐节标题派生；
 *   而该 md 处于 INV-1 冻结区（`docs/audit-package/**` 禁止任何改动）。
 *   但 `docs/p18/P1.8-PLAN-v1.0-FROZEN.md` §4/§5/§6 又要求「新增的门进入 release:gate」
 *   （例如 gate:license）。既不能改冻结文件、又要能扩充判据，故评审裁定：
 *     · P1.5 = 历史冻结合同（只读）；P1.8 = 新阶段增量合同；
 *     · 本校验器同时读两份、分层报告；
 *     · 任一份缺失或格式坏，一律以 EXIT=2 终止（绝不降级成「通过」）。
 *
 * ── 分层结构 ────────────────────────────────────────────────────────────
 *   合同① P1.5（历史冻结基线 · 只读）
 *     层一 CODE/ARCHITECTURE GATE  G1..G6  判定 ENGINEERING READY
 *     层二 PRODUCT RELEASE GATE    R1..R6  判定 RELEASE READY
 *   合同② P1.8（增量合同）
 *     P18-G*（工程/架构门 = P1.8 六条不变量 INV-1..INV-6）
 *     P18-R*（阶段发布门）
 *   总判定：两份合同各层全绿才整体绿。
 *
 * ── 事实源与解析（原则不变：标题行是唯一事实源，总览靠机器交叉核对）────
 *   1. 扫描 `### <ID> · ...` 标题行中的状态标记（PASS / FAIL / PENDING）。
 *      标题 ID 同时认两种前缀：P1.5 的 `G\d+-\d+` / `R\d+`；P1.8 的
 *      `P18-G\d+(?:-\d+)?` / `P18-R\d+` —— 只放宽、不收紧
 *      （P1.5 既有判据必须一个不变地继续被解析）。
 *   2. 解析每份合同 §0 总览表每行声明的 PASS/FAIL/PENDING 计数。
 *   3. 交叉验证：逐节实际计数 vs 总览声明，不一致即以 EXIT=2 终止
 *      （总览不可信 = 合同格式坏）。
 *   4. 层级判定：层内全 PASS 才亮绿灯；含 FAIL 或 PENDING 即该层未就绪。
 *   5. 总判定：两份合同各层全绿才整体绿。
 *
 * ── 退出码（防假通过）──────────────────────────────────────────────────
 *   0 = 两份合同全绿且总览一致
 *   1 = 任一层含 FAIL 或 PENDING（PENDING 语义是「产物还没做出来」，
 *       与 P1.5 同口径：不计入 FAIL 计数，但一样阻塞发布）
 *   2 = 脚本自身或合同错误（文件缺失 / 标题解析失败 / 总览与逐节不一致
 *       —— 解析失败绝不降级成「通过」）
 *
 * 用法：npm run release:gate   （或 node scripts/verify-release-gate.mjs）
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** 标题行正则（唯一事实源）：同时认 P1.5 与 P1.8 两种 ID 前缀 —— 只放宽、不收紧 */
const TITLE_RE = /^### ((?:P18-G\d+(?:-\d+)?)|(?:P18-R\d+)|(?:G\d+-\d+)|(?:R\d+)) ·(.*)$/
/** §0 总览行正则：同时认 `**G1**`/`**R1**` 与 `**P18-G1**`/`**P18-R1**` */
const OVERVIEW_RE = /^\|\s*\*\*((?:P18-G\d+)|(?:P18-R\d+)|(?:G\d)|(?:R\d))\*\*\s*\|/

/** 两份合同的解析配置：合同① P1.5 冻结只读；合同② P1.8 增量 */
const CONTRACTS = [
  {
    file: 'docs/audit-package/13-acceptance/P1.5-RELEASE-GATE.md',
    label: '合同① P1.5（历史冻结基线 · 只读 · INV-1 禁改）',
    engineeringUnits: ['G1', 'G2', 'G3', 'G4', 'G5', 'G6'],
    unitOf: (id) => { const m = id.match(/^G(\d+)-\d+$/); return m ? `G${m[1]}` : null },
    isR: (id) => /^R\d+$/.test(id),
    gateRange: [4, 6],
    rRange: [4, 12],
    layers: [
      { name: '层一 CODE/ARCHITECTURE GATE', unitsOf: (u) => u.startsWith('G'), ready: '🟢 ENGINEERING READY' },
      { name: '层二 PRODUCT RELEASE GATE', unitsOf: (u) => u.startsWith('R'), ready: '🟢 RELEASE READY' },
    ],
  },
  {
    file: 'docs/p18/P1.8-RELEASE-GATE-CONTRACT.md',
    label: '合同② P1.8（增量合同）',
    engineeringUnits: ['P18-G1', 'P18-G2', 'P18-G3', 'P18-G4', 'P18-G5', 'P18-G6'],
    unitOf: (id) => { const m = id.match(/^(P18-G\d+)/); return m ? m[1] : null },
    isR: (id) => /^P18-R\d+$/.test(id),
    gateRange: [1, 6],
    rRange: [2, 8],
    layers: [
      { name: 'P1.8 工程门 P18-G*（P1.8 六条不变量）', unitsOf: (u) => u.startsWith('P18-G'), ready: '🟢 INVARIANTS READY' },
      { name: 'P1.8 阶段发布门 P1.8-R*', unitsOf: (u) => u.startsWith('P18-R'), ready: '🟢 PHASE RELEASE READY' },
    ],
  },
]

/**
 * 解析并核算一份合同。
 * 返回 { fatal?, errors, criteria, rows, layerTotals, rIds }
 *   fatal  —— 合同文件读不出来（直接 EXIT=2）
 *   errors —— 标题/分组/总览/一致性问题（全部 EXIT=2）
 */
function analyze(contract) {
  const errors = []
  const docPath = resolve(ROOT, contract.file)
  let doc
  try {
    doc = readFileSync(docPath, 'utf8')
  } catch (e) {
    return { fatal: `合同文件读取失败：${contract.file} — ${e.message}`, errors, criteria: new Map(), rows: [], layerTotals: [], rIds: [] }
  }
  const lines = doc.split('\n')

  /* 1. 逐节判据状态（标题行是唯一事实源） */
  const criteria = new Map()
  lines.forEach((line, idx) => {
    const m = line.match(TITLE_RE)
    if (!m) return
    const id = m[1]
    if (criteria.has(id)) errors.push(`:${idx + 1} 判据 ${id} 标题重复出现`)
    const s = line.match(/\*\*(PASS|FAIL|PENDING)\b/)
    if (!s) {
      errors.push(`:${idx + 1} 判据 ${id} 标题中找不到状态标记（PASS/FAIL/PENDING）—— 不允许无状态的判据标题`)
      return
    }
    criteria.set(id, { id, title: m[2].trim(), status: s[1], line: idx + 1 })
  })

  /* 2. 分组：工程门按门聚合；R 系列一判据一单元 */
  const byUnit = new Map(contract.engineeringUnits.map((g) => [g, []]))
  for (const id of criteria.keys()) {
    const gate = contract.unitOf(id)
    if (gate) {
      if (!byUnit.has(gate)) errors.push(`判据 ${id} 不属于任何已知工程门（${contract.engineeringUnits.join('/')}）`)
      else byUnit.get(gate).push(id)
    } else if (contract.isR(id)) {
      byUnit.set(id, [id])
    } else {
      errors.push(`判据 ${id} 的 ID 前缀不属于本合同（既非工程门也非 R 系列）`)
    }
  }
  const [gMin, gMax] = contract.gateRange
  for (const g of contract.engineeringUnits) {
    const n = (byUnit.get(g) ?? []).length
    if (n === 0) errors.push(`门 ${g} 一条判据都没扫到 —— 合同结构可能被改坏`)
    else if (n < gMin || n > gMax) errors.push(`门 ${g} 判据数 ${n} 超出 ${gMin}~${gMax} 的预期范围（合同可能被改坏）`)
  }
  const rIds = [...criteria.keys()].filter((id) => contract.isR(id))
  const [rMin, rMax] = contract.rRange
  if (rIds.length < rMin) errors.push(`R 系列仅扫到 ${rIds.length} 条（<${rMin}）—— 阶段判据可能被误删`)
  if (rIds.length > rMax) errors.push(`R 系列扫到 ${rIds.length} 条（>${rMax}）—— 合同可能被改坏`)

  /* 3. §0 总览声明计数 */
  const declared = new Map()
  lines.forEach((line, idx) => {
    const m = line.match(OVERVIEW_RE)
    if (!m) return
    const unit = m[1]
    const cols = line.split('|').map((c) => c.trim())
    if (cols.length < 5) {
      errors.push(`:${idx + 1} 判定单元 ${unit} 总览行列数不足（期望 ≥5 列）`)
      return
    }
    const cell = cols[4] ?? ''
    if (!/\d+\s*(?:PASS|FAIL|PENDING)\b/.test(cell)) {
      errors.push(`:${idx + 1} 判定单元 ${unit} 总览状态列解析不出「N PASS / N FAIL / N PENDING」：\`${cell}\``)
      return
    }
    if (declared.has(unit)) errors.push(`:${idx + 1} 判定单元 ${unit} 总览行重复出现`)
    declared.set(unit, {
      pass: Number(cell.match(/(\d+)\s*PASS\b/)?.[1] ?? 0),
      fail: Number(cell.match(/(\d+)\s*FAIL\b/)?.[1] ?? 0),
      pending: Number(cell.match(/(\d+)\s*PENDING\b/)?.[1] ?? 0),
      line: idx + 1,
    })
  })
  for (const g of contract.engineeringUnits) if (!declared.has(g)) errors.push(`§0 总览缺工程门 ${g} 的声明行`)
  for (const id of rIds) if (!declared.has(id)) errors.push(`§0 总览缺阶段判据 ${id} 的声明行`)
  for (const unit of declared.keys()) if (!byUnit.has(unit)) errors.push(`§0 总览声明了不存在的判定单元 ${unit}`)

  /* 4. 交叉验证 + 分层合计 */
  const rows = []
  const layerTotals = contract.layers.map((l) => ({ layer: l, p: 0, f: 0, q: 0, n: 0 }))
  for (const unit of [...contract.engineeringUnits, ...rIds]) {
    const ids = byUnit.get(unit) ?? []
    const actual = { PASS: 0, FAIL: 0, PENDING: 0 }
    for (const id of ids) actual[criteria.get(id).status]++
    const d = declared.get(unit) ?? { pass: -1, fail: -1, pending: -1, line: 0 }
    const match = d.pass === actual.PASS && d.fail === actual.FAIL && d.pending === actual.PENDING
    if (!match) {
      errors.push(`${unit}：总览声明 ${d.pass}/${d.fail}/${d.pending}（行 ${d.line}） vs 逐节实际 ${actual.PASS}/${actual.FAIL}/${actual.PENDING}`)
    }
    const lt = layerTotals.find((t) => t.layer.unitsOf(unit))
    if (lt) {
      lt.p += actual.PASS
      lt.f += actual.FAIL
      lt.q += actual.PENDING
      lt.n += ids.length
    }
    rows.push({
      unit,
      count: ids.length,
      PASS: actual.PASS,
      FAIL: actual.FAIL,
      PENDING: actual.PENDING,
      d,
      match,
      nonPass: ids.filter((x) => criteria.get(x).status !== 'PASS'),
    })
  }

  return { errors, criteria, rows, layerTotals, rIds }
}

/* ---------------- 主流程 ---------------- */
const results = []
for (const c of CONTRACTS) {
  const r = analyze(c)
  if (r.fatal) {
    console.error(`❌ EXIT=2：${r.fatal}`)
    process.exit(2)
  }
  results.push({ contract: c, ...r })
}

const allErrors = results.flatMap((r) => r.errors.map((e) => `[${r.contract.label}] ${e}`))
if (allErrors.length > 0) {
  console.error('❌ EXIT=2：合同解析或一致性失败（先修合同，再谈判定）：')
  for (const e of allErrors) console.error(`   ${e}`)
  process.exit(2)
}

/* ---------------- 输出 ---------------- */
const bar = '='.repeat(70)
const thin = '─'.repeat(70)
console.log(bar)
console.log(' P1.8 RELEASE GATE — 分层机器判定（verify-release-gate.mjs）')
console.log(' 合同①：docs/audit-package/13-acceptance/P1.5-RELEASE-GATE.md —— P1.5 历史冻结基线（只读 · INV-1 禁改）')
console.log(' 合同②：docs/p18/P1.8-RELEASE-GATE-CONTRACT.md                —— P1.8 增量合同（本阶段新增）')
console.log(' 分层原因：P1.5 判据派生自冻结区 md（禁改），P1.8 又要求「新增门进入 release:gate」')
console.log('           → 冻结基线只读 + 增量合同叠加，校验器同时读两份、分层报告。')
console.log(bar)

const gt = { p: 0, f: 0, q: 0, n: 0 }
for (const r of results) {
  console.log(`\n【${r.contract.label}】`)
  console.log('Unit       判据  PASS  FAIL  PENDING   总览声明(行)      一致')
  for (const row of r.rows) {
    const decl = `${row.d.pass}/${row.d.fail}/${row.d.pending}`
    console.log(
      `${row.unit.padEnd(10)} ${String(row.count).padEnd(5)} ${String(row.PASS).padEnd(5)} ${String(row.FAIL).padEnd(5)} ${String(row.PENDING).padEnd(8)} ${decl.padEnd(16)} ${row.match ? '✅' : '❌ 不一致'}`,
    )
  }
  console.log(thin)
  for (const lt of r.layerTotals) {
    const ok = lt.f === 0 && lt.q === 0
    gt.p += lt.p
    gt.f += lt.f
    gt.q += lt.q
    gt.n += lt.n
    console.log(`  ${lt.layer.name}：${lt.n} 项 —— ${lt.p} PASS / ${lt.f} FAIL / ${lt.q} PENDING → ${ok ? lt.layer.ready : '🔴 NOT READY'}`)
  }
  const nonPass = r.rows.flatMap((row) => row.nonPass.map((id) => r.criteria.get(id)))
  for (const c of nonPass) console.log(`    ⏳ ${c.id}=${c.status} —— ${c.title}`)
}

console.log(`\n${bar}`)
console.log(`总判定：${gt.n} 项判据 —— ${gt.p} PASS / ${gt.f} FAIL / ${gt.q} PENDING`)
if (gt.f > 0) {
  console.log('RELEASE=BLOCKED —— 存在 FAIL 判据（必须先修根因，再谈判定）')
  process.exit(1)
}
if (gt.q > 0) {
  console.log('RELEASE=BLOCKED —— 存在 PENDING 判据（PENDING 的语义是「产物还不存在」，不得记作 PASS）')
  process.exit(1)
}
console.log('RELEASE=APPROVED —— 两份合同全绿（P1.5 历史冻结基线 + P1.8 增量合同逐节核实，总览数字机器核对一致）')
console.log('⚠️ 这只代表门禁合同自洽；发布前仍需：未提交改动清点（git status）+ FINAL-TEST-OUTPUT 全量复跑留档。')
process.exit(0)
