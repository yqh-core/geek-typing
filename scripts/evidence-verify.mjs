#!/usr/bin/env node
/**
 * Evidence Chain Verifier（P1.7-PLAN v2.3.2 §15 审计工具）
 *
 * 对一个 Wave 的 evidence-matrix.json 做机器链路验证：
 *   Matrix RunId → Evidence filename → file exists → SHA256 matches
 *   → Evidence records Commit → Evidence ExitCode → Matrix Status 一致
 * 全部通过 ⇒ Evidence Chain: CLOSED；任一失败 ⇒ BROKEN（逐条指名）。
 *
 * orphan 语义（波次顶层里不被 matrix 引用的 .txt）分两档：
 *   · P1.8（P18*）：**严格判据** —— 证据根已恢复「按波次独立」（见 evidence-run.mjs），
 *     每次生成前把同任务旧产物退役进 _superseded/，故顶层只允许 matrix 引用的产物；
 *     出现任何 orphan 即 BROKEN（exit 1）。这是「按波次独立证据根」原则的机器落点。
 *   · P1.7（W*）：P1.7 已封版，且 docs/audit-package/** 是冻结区（INV-1）不可追溯改判 ——
 *     保留宽松语义（orphan 不判红），但措辞改准：那些文件是「历史轮留档」，并非
 *     「历史的失败轮」，且不参与判定。W* 目录下 _superseded/ 里的文件同样不计入判定。
 *
 * 用法：node scripts/evidence-verify.mjs --wave=W0
 *      node scripts/evidence-verify.mjs --wave=P18-A
 * 退出码：0 = CLOSED；1 = BROKEN；2 = 参数/文件错误。
 */
import { createHash } from 'node:crypto'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const waveArg = process.argv.find((a) => a.startsWith('--wave='))
if (!waveArg) { console.error('usage: --wave=W0'); process.exit(2) }
const WAVE = waveArg.split('=')[1].toUpperCase()
// P1.8（P18*）走严格 orphan 判据；P1.7（W*）已封版 + 冻结区不可追溯改判 → 宽松。
const STRICT_ORPHAN = /^P18/.test(WAVE)

// 证据根目录与 evidence-run.mjs 同口径：P1.7 Wave（W*）→ docs/audit-package/_generated/evidence；
// P1.8 Wave（P18*）→ docs/p18/_generated/evidence（不进 P1.7 冻结区，见 P1.8 INV-1）。
const dir = /^P18/.test(WAVE)
  ? join(ROOT, 'docs', 'p18', '_generated', 'evidence', WAVE)
  : join(ROOT, 'docs', 'audit-package', '_generated', 'evidence', WAVE)
const matrixPath = join(dir, 'evidence-matrix.json')
if (!existsSync(matrixPath)) { console.error(`matrix not found: ${matrixPath}`); process.exit(2) }
const matrix = JSON.parse(readFileSync(matrixPath, 'utf8'))

// 纯 fs 读 HEAD（.git/HEAD → ref 解引用），不走 spawn：
// 本会话 shell shim 存在 spawnSync EBUSY 劣化，spawnSync('git') 会假失败返回 unknown。
function currentCommit() {
  try {
    const head = readFileSync(join(ROOT, '.git', 'HEAD'), 'utf8').trim()
    const m = head.match(/^ref: (.+)$/)
    if (m) {
      return readFileSync(join(ROOT, '.git', m[1]), 'utf8').trim()
    }
    return head
  } catch {
    return 'unknown'
  }
}
const HEAD = currentCommit()
// W0..W5D（P1.7）与 P18（P1.8）两种 Wave 前缀都接受——**只放宽、不收紧**（既有 RunId 全部仍匹配）。
const RUNID_RE = /^(?:W\d+[A-Z]?|P\d+)-[A-Z0-9-]+-\d{8}-\d{6}-R\d{2}$/

const checks = []
function check(name, cond, detail = '') {
  checks.push({ name, ok: !!cond, detail })
  console.log(`  ${cond ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`)
}

console.log(`== Evidence Chain Verify · ${WAVE} ==`)
console.log(`matrix commit : ${matrix.commit}`)
console.log(`current HEAD  : ${HEAD}`)
console.log('')

for (const e of matrix.entries) {
  const tag = e.task
  // 1. RunId 格式与文件名一致
  check(`${tag}: RunId 格式合法`, RUNID_RE.test(e.runId), e.runId)
  check(`${tag}: RunId 与矩阵文件名一致`, e.evidence.endsWith(`${e.runId}.txt`), e.evidence.split('/').pop())
  // 2. Evidence 文件存在
  const p = join(ROOT, e.evidence)
  check(`${tag}: Evidence 文件存在`, existsSync(p))
  if (!existsSync(p)) continue
  // 3. SHA256 全长一致
  const raw = readFileSync(p)
  const hash = createHash('sha256').update(raw).digest('hex')
  check(`${tag}: ArtifactHash 全长一致`, hash === e.artifactSha256, hash.slice(0, 12))
  // 4. 头部字段与矩阵一致（RunId / Commit / ExitCode）
  const head = raw.toString('utf8').slice(0, 500)
  const mRun = head.match(/^# RunId: (.+)$/m)
  const mCommit = head.match(/^# Commit: (.+)$/m)
  const mExit = head.match(/^# ExitCode: (\d+)$/m)
  check(`${tag}: 头部 RunId 一致`, mRun?.[1] === e.runId, mRun?.[1])
  check(`${tag}: 头部 Commit 一致`, mCommit?.[1] === e.commit, mCommit?.[1])
  check(`${tag}: 头部 ExitCode 一致`, mExit && Number(mExit[1]) === e.exitCode, mExit?.[1])
  // 5. Status 与 ExitCode 机器一致（PASS ⇔ exit 0）
  check(`${tag}: Status 与 ExitCode 一致（PASS ⇔ 0）`, (e.exitCode === 0) === (e.status === 'PASS'), `exit=${e.exitCode} status=${e.status}`)
}

// 汇总：orphan 产物（波次顶层里不被 matrix 引用的 .txt）。
// P18*：严格 —— 顶层只允许 matrix 引用的产物，任何 orphan ⇒ BROKEN（本原则的机器落点）。
// W*  ：宽松 —— P1.7 已封版 + 冻结区（INV-1）不可追溯改判，仅列明「历史轮留档」，不判红。
const referenced = new Set(matrix.entries.map((e) => e.evidence.split('/').pop()))
const onDisk = readdirSync(dir).filter((f) => f.endsWith('.txt'))
const orphans = onDisk.filter((f) => !referenced.has(f))
if (STRICT_ORPHAN) {
  check('无 orphan 产物（波次顶层只允许 matrix 引用的产物）', orphans.length === 0,
    orphans.length ? `orphan = ${orphans.join(', ')}` : '无')
} else {
  check('无 orphan 产物（W* 历史波次宽松：不追溯改判）', true,
    orphans.length ? `历史轮留档、不计入判定 = ${orphans.join(', ')}` : '无')
}
// 信息性输出（不计入 broken）：_superseded/ 已退役的历史轮 —— 只列数 + 最近 3 个文件名。
const supDir = join(dir, '_superseded')
const supFiles = existsSync(supDir) ? readdirSync(supDir).filter((f) => f.endsWith('.txt')).sort() : []
console.log(`  ℹ️ 已退役的历史轮（不再参与判定）：${supFiles.length} 个`
  + (supFiles.length ? ` — 最近 3：${supFiles.slice(-3).join(', ')}` : ''))

const broken = checks.filter((c) => !c.ok)
const total = checks.length
console.log('──────────────────────────────────────────────────────')
console.log(`Evidence Chain: ${broken.length === 0 ? 'CLOSED' : 'BROKEN'}  （checks ${total - broken.length}/${total}）`)
console.log(`被测基线语义：matrix commit = ${matrix.commit}；current HEAD = ${HEAD}`)
console.log('若 matrix commit ≠ HEAD：证明的是「matrix commit 时代的代码树」（W1A 为 fa63d17 + 未提交改动 = 315e92a 内容），')
console.log('自 Wave 1-B 起协议改为「先提交实现、后跑证据」，被测树与提交一一对应。')
console.log('──────────────────────────────────────────────────────')
process.exit(broken.length > 0 ? 1 : 0)
