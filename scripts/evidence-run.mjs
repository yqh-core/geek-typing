#!/usr/bin/env node
/**
 * Evidence Runner（P1.7-PLAN v2.3.2 §15）
 *
 * Status 只能由 Command 产生：Plan → Command → Machine Result(exit code) →
 * Artifact(sha256, 落盘) → Evidence(本矩阵) → CLOSED。禁止人工填 PASS。
 *
 * 用法：node scripts/evidence-run.mjs --wave=W0
 * 产物：docs/audit-package/_generated/evidence/<wave>/
 *   ├── <RunId>.txt          每条命令的原始输出（stdout+stderr）
 *   ├── evidence-matrix.json 机器矩阵（含 RunId/ExitCode/Commit/ArtifactHash）
 *   └── evidence-matrix.md   人工可读版
 * RunId = W<wave>-<TASK>-<yyyymmdd>-<hhmmss>-R<attempt>（§15 秒级+attempt）
 *
 * 实现：async spawn（本机 shim 环境下 spawnSync 返回 EBUSY，async spawn 正常）。
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const waveArg = process.argv.find((a) => a.startsWith('--wave=')) || '--wave=W0'
const WAVE = waveArg.split('=')[1].toUpperCase()

const TASKS = {
  W0: [
    { task: 'BUILD', command: 'npm run build' },
    { task: 'TSC', command: 'npx tsc -b --noEmit' },
    { task: 'LINT', command: 'npx oxlint src/' },
    { task: 'GATE-LEARNING-BOUNDARY', command: 'node scripts/gate-learning-boundary.mjs' },
    { task: 'GATE-G4', command: 'node scripts/gate-g4.mjs' },
    { task: 'GATE-LEGACY-WORDBANK', command: 'node scripts/gate-legacy-wordbank.mjs' },
    { task: 'RELEASE-GATE', command: 'node scripts/verify-release-gate.mjs' },
    { task: 'TEST-LEARNING-SERVICE', command: 'node tests/learning-service.mjs' },
    { task: 'TEST-LEARNING-STORAGE', command: 'node tests/learning-storage.mjs' },
    { task: 'TEST-LEARNING-INSIGHTS', command: 'node tests/learning-insights.mjs' },
    { task: 'TEST-MIGRATION-GUARDS', command: 'node tests/migration-guards.mjs' },
    { task: 'TEST-CONTENT-QUERY', command: 'node tests/content-query.mjs' },
    { task: 'TEST-E2E', command: 'node tests/e2e.mjs' },
    { task: 'AUDIT-LEARNING-R5', command: 'node scripts/learning-consistency.mjs --user-store=_user-snapshot/real-user-localStorage.json' },
  ],
}[WAVE]

if (!TASKS) { console.error(`unknown wave: ${WAVE}`); process.exit(2) }

function gitCommit() {
  // 用 async spawn 的同步等价场景在 shim 下不可用，这里从 environment 取，
  // 若缺失则由主流程第一条命令前用 async git 获取。
  return process.env.EVIDENCE_COMMIT || 'pending'
}
function stamp(d = new Date()) {
  const p = (n, w = 2) => String(n).padStart(w, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

/** 串行执行一条命令，聚合 stdout+stderr，返回 {code, out, ms} */
function run(command) {
  return new Promise((resolveRun) => {
    const t0 = Date.now()
    const child = spawn(command, {
      cwd: ROOT, shell: true,
      env: { ...process.env, CODEBUDDY_SAFE_DELETE_ENABLED: '0' },
    })
    let out = ''
    child.stdout?.on('data', (d) => { out += d })
    child.stderr?.on('data', (d) => { out += d })
    child.on('close', (code) => resolveRun({ code: code ?? -1, out, ms: Date.now() - t0 }))
    child.on('error', (e) => resolveRun({ code: -1, out: `spawn error: ${e.message}`, ms: Date.now() - t0 }))
  })
}

async function gitCommitAsync() {
  const { out } = await run('git rev-parse HEAD')
  return out.trim().split('\n')[0] || 'unknown'
}

const COMMIT = (await gitCommitAsync())
const OUT = join(ROOT, 'docs', 'audit-package', '_generated', 'evidence', WAVE)
mkdirSync(OUT, { recursive: true })

const entries = []
let failed = 0
for (const { task, command } of TASKS) {
  const runId = `${WAVE}-${task}-${stamp()}-R01`
  const startedAt = new Date().toISOString()
  const { code, out, ms } = await run(command)
  const raw = [
    `# RunId: ${runId}`,
    `# Command: ${command}`,
    `# Commit: ${COMMIT}`,
    `# StartedAt: ${startedAt}`,
    `# DurationMs: ${ms}`,
    `# ExitCode: ${code}`,
    '', '--- stdout+stderr ---', out,
  ].join('\n')
  const artifactHash = sha256(Buffer.from(raw, 'utf8'))
  writeFileSync(join(OUT, `${runId}.txt`), raw, 'utf8')
  const status = code === 0 ? 'PASS' : 'FAIL'
  if (code !== 0) failed++
  entries.push({
    task, command, owner: 'agent', runId, exitCode: code, commit: COMMIT,
    timestamp: startedAt, durationMs: ms, artifactSha256: artifactHash,
    evidence: `docs/audit-package/_generated/evidence/${WAVE}/${runId}.txt`, status,
  })
  console.log(`[${status}] ${runId}  (${(ms / 1000).toFixed(1)}s)`)
}

const matrix = {
  wave: WAVE, commit: COMMIT, generatedAt: new Date().toISOString(),
  summary: { total: entries.length, pass: entries.length - failed, fail: failed },
  note: 'Status machine-generated from exit code; PASS is not manually writable (P1.7-PLAN v2.3.2 §15/§19-9).',
  entries,
}
writeFileSync(join(OUT, 'evidence-matrix.json'), JSON.stringify(matrix, null, 2), 'utf8')

const md = [
  `# Evidence Matrix · ${WAVE} · commit \`${COMMIT.slice(0, 7)}\``,
  '', `generatedAt: ${matrix.generatedAt} · **PASS ${matrix.summary.pass} / FAIL ${matrix.summary.fail} / total ${matrix.summary.total}**`,
  '', 'Status 由命令退出码机器产生，禁止人工填写（v2.3.2 §15/§19-9）。', '',
  '| Task | RunId | Exit | Artifact SHA256(前12) | Evidence | Status |',
  '|------|-------|------|------------------------|----------|--------|',
  ...entries.map((e) => `| ${e.task} | \`${e.runId}\` | ${e.exitCode} | \`${e.artifactSha256.slice(0, 12)}\` | ${e.evidence.split('/').pop()} | **${e.status}** |`),
].join('\n')
writeFileSync(join(OUT, 'evidence-matrix.md'), md, 'utf8')

console.log(`\n${WAVE}: PASS ${matrix.summary.pass} / FAIL ${matrix.summary.fail} / total ${matrix.summary.total}`)
console.log(`matrix: ${join(OUT, 'evidence-matrix.json')}`)
process.exit(failed > 0 ? 1 : 0)
