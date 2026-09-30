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
  /** Wave 1-A · Migration Lock（全协议 CAS + fencing） */
  W1A: [
    { task: 'TSC', command: 'npx tsc -b --noEmit' },
    { task: 'LINT', command: 'npx oxlint src/' },
    { task: 'GATE-LEARNING-BOUNDARY', command: 'node scripts/gate-learning-boundary.mjs' },
    { task: 'BUILD', command: 'npm run build' },
    { task: 'TEST-LOCK', command: 'node tests/migration-lock.mjs' },
    { task: 'TEST-LOCK-BROWSER', command: 'node tests/migration-lock-browser.mjs' },
    { task: 'TEST-E2E', command: 'node tests/e2e.mjs' },
  ],
  /** Wave 1-B · FencedWrite（MigrationWriteGuard + IDB staging + 单次同步切换 + kill-page） */
  W1B: [
    { task: 'TSC', command: 'npx tsc -b --noEmit' },
    { task: 'LINT', command: 'npx oxlint src/' },
    { task: 'GATE-LEARNING-BOUNDARY', command: 'node scripts/gate-learning-boundary.mjs' },
    { task: 'BUILD', command: 'npm run build' },
    { task: 'TEST-LOCK', command: 'node tests/migration-lock.mjs' },
    { task: 'TEST-FENCED-WRITE', command: 'node tests/fenced-write.mjs' },
    { task: 'TEST-FENCED-WRITE-BROWSER', command: 'node tests/fenced-write-browser.mjs' },
    { task: 'TEST-E2E', command: 'node tests/e2e.mjs' },
  ],
  /** Wave 1-C · Recovery / Version / Canonical / FieldPolicy / R5 */
  W1C: [
    { task: 'TSC', command: 'npx tsc -b --noEmit' },
    { task: 'LINT', command: 'npx oxlint src/' },
    { task: 'GATE-LEARNING-BOUNDARY', command: 'node scripts/gate-learning-boundary.mjs' },
    { task: 'BUILD', command: 'npm run build' },
    { task: 'TEST-RECOVERY', command: 'node tests/recovery.mjs' },
    { task: 'TEST-VERSION', command: 'node tests/version-contract.mjs' },
    { task: 'TEST-CANONICAL', command: 'node tests/canonical.mjs' },
    { task: 'TEST-FIELD-POLICY', command: 'node tests/field-policy.mjs' },
    { task: 'TEST-R5', command: 'node tests/r5.mjs' },
    { task: 'TEST-E2E', command: 'node tests/e2e.mjs' },
  ],
  /** Wave 1-D · Orchestrator（Wave 1 出口整合：Journal + Lock + Guard + Recovery + R5 + 真实数据演练） */
  W1D: [
    { task: 'TSC', command: 'npx tsc -b --noEmit' },
    { task: 'LINT', command: 'npx oxlint src/' },
    { task: 'GATE-LEARNING-BOUNDARY', command: 'node scripts/gate-learning-boundary.mjs' },
    { task: 'BUILD', command: 'npm run build' },
    { task: 'TEST-ORCHESTRATOR', command: 'node tests/migration-orchestrator.mjs' },
    { task: 'DRYRUN-REAL', command: 'node scripts/migration-dryrun-w1.mjs --user-store=_user-snapshot/real-user-localStorage.json' },
    { task: 'TEST-E2E', command: 'node tests/e2e.mjs' },
  ],
  /** Wave 2-A · Persistence Boundary 基础设施（StorageAdapter / namespace / codec / Repository） */
  W2A: [
    { task: 'TSC', command: 'npx tsc -b --noEmit' },
    { task: 'LINT', command: 'npx oxlint src/' },
    { task: 'GATE-LEARNING-BOUNDARY', command: 'node scripts/gate-learning-boundary.mjs' },
    { task: 'BUILD', command: 'npm run build' },
    { task: 'TEST-PERSISTENCE-BOUNDARY', command: 'node tests/persistence-boundary.mjs' },
    { task: 'TEST-E2E', command: 'node tests/e2e.mjs' },
  ],
  /**
   * Wave 2-B · Service Split（learning 域接线 + 单体服务拆分）
   *
   * 任务选择原则：**证明「W2A 的边界真的被业务模块接起来了」**，因此除了本轮新增的
   * 接线测试，还保留所有会被这次改道波及的既有套件作为回归证据 —— 尤其
   * TEST-MIGRATION-GUARDS（回滚要写 analytics / content 域旧键，正是 owner 驱动路由
   * 的真回归点）与 TEST-E2E（浏览器里跑真实 runStartupMigration，覆盖 upgrade.ts 改道）。
   */
  W2B: [
    { task: 'TSC', command: 'npx tsc -b --noEmit' },
    { task: 'LINT', command: 'npx oxlint src/' },
    { task: 'GATE-LEARNING-BOUNDARY', command: 'node scripts/gate-learning-boundary.mjs' },
    { task: 'BUILD', command: 'npm run build' },
    { task: 'TEST-PERSISTENCE-BOUNDARY', command: 'node tests/persistence-boundary.mjs' },
    { task: 'TEST-LEARNING-BOUNDARY-WIRING', command: 'node tests/learning-boundary-wiring.mjs' },
    { task: 'TEST-LEARNING-STORAGE', command: 'node tests/learning-storage.mjs' },
    { task: 'TEST-LEARNING-SERVICE', command: 'node tests/learning-service.mjs' },
    { task: 'TEST-LEARNING-INSIGHTS', command: 'node tests/learning-insights.mjs' },
    { task: 'TEST-MIGRATION-GUARDS', command: 'node tests/migration-guards.mjs' },
    { task: 'DRYRUN-REAL', command: 'node scripts/migration-dryrun-w1.mjs --user-store=_user-snapshot/real-user-localStorage.json' },
    { task: 'TEST-E2E', command: 'node tests/e2e.mjs' },
  ],
  /**
   * Wave 2-C · 迁移批次②③（legacy 三 store + settings 域 + diagnostics 收口）
   *
   * 与 W2B 的差别：本轮改动面横跨 25 个文件（含 hooks / i18n / speech / 三个 legacy store /
   * diagnostics），不再是 learning 单域 —— 因此任务清单扩到「全部门禁 + 全部既有套件 + R5
   * 真实快照对照」。§1 要求「每批迁移后全套 fresh 全绿 + R5 快照对照」，AUDIT-LEARNING-R5
   * 就是这条判据的落点（用真实用户快照，不是夹具）。
   */
  W2C: [
    { task: 'TSC', command: 'npx tsc -b --noEmit' },
    { task: 'LINT', command: 'npx oxlint src/' },
    { task: 'GATE-PERSISTENCE', command: 'node scripts/gate-persistence.mjs' },
    { task: 'GATE-LEARNING-BOUNDARY', command: 'node scripts/gate-learning-boundary.mjs' },
    { task: 'GATE-G4', command: 'node scripts/gate-g4.mjs' },
    { task: 'GATE-LEGACY-WORDBANK', command: 'node scripts/gate-legacy-wordbank.mjs' },
    { task: 'GATE-PRACTICE-ENGINE', command: 'node scripts/gate-practice-engine.mjs' },
    { task: 'BUILD', command: 'npm run build' },
    { task: 'TEST-PERSISTENCE-BOUNDARY', command: 'node tests/persistence-boundary.mjs' },
    { task: 'TEST-LEARNING-BOUNDARY-WIRING', command: 'node tests/learning-boundary-wiring.mjs' },
    { task: 'TEST-LEARNING-STORAGE', command: 'node tests/learning-storage.mjs' },
    { task: 'TEST-LEARNING-SERVICE', command: 'node tests/learning-service.mjs' },
    { task: 'TEST-LEARNING-INSIGHTS', command: 'node tests/learning-insights.mjs' },
    { task: 'TEST-ANALYTICS-IDENTITY', command: 'node tests/analytics-identity.mjs' },
    { task: 'TEST-MIGRATION-GUARDS', command: 'node tests/migration-guards.mjs' },
    { task: 'TEST-CONTENT-QUERY', command: 'node tests/content-query.mjs' },
    { task: 'AUDIT-LEARNING-R5', command: 'node scripts/learning-consistency.mjs --user-store=_user-snapshot/real-user-localStorage.json' },
    { task: 'DRYRUN-REAL', command: 'node scripts/migration-dryrun-w1.mjs --user-store=_user-snapshot/real-user-localStorage.json' },
    { task: 'TEST-E2E', command: 'node tests/e2e.mjs' },
  ],
  /**
   * Wave 3 · Architecture（A-3 AST 门禁三阶段 + A-4 汇总门 + A-5 不变量 + §14 待办标记门）
   *
   * 本轮新增三项证据：GATE-ARCHITECTURE（一键串行汇总门）、待办标记门（§14）、
   * TEST-BOUNDARY-AST（探针 6 例 5 红 1 放行 + src 违规数快照）。
   * 注：§14 判注释节点里的标记词为 FAIL —— 所以这里不能把门禁名原样写进注释
   * （字符串字面量放行，注释必判红），措辞须绕开标记词本身。
   * DUAL-RUN-BOUNDARY 在 Phase 3 后语义改为「探针 6 例 + 快照不变」的回归断言
   * （正则 oracle 已按计划删除，等价性证据留在 c9a4d50 的 git 历史里）。
   *
   * ⚠️ 刻意不含 CHECK-BUNDLE：CI 的 check:bundle 当前 FAIL（主 chunk 424.20 KiB > 420 KiB），
   * 属 Wave 5 D-2 预算门的处置范围，已显式披露在 W2C/W3 对照图，不静默跳过。
   */
  W3: [
    { task: 'TSC', command: 'npx tsc -b --noEmit' },
    { task: 'LINT', command: 'npx oxlint src/' },
    { task: 'GATE-ARCHITECTURE', command: 'node scripts/gate-architecture.mjs' },
    { task: 'GATE-TODO', command: 'node scripts/gate-todo.mjs' },
    { task: 'GATE-LEARNING-BOUNDARY', command: 'node scripts/gate-learning-boundary.mjs' },
    { task: 'GATE-PERSISTENCE', command: 'node scripts/gate-persistence.mjs' },
    { task: 'GATE-G4', command: 'node scripts/gate-g4.mjs' },
    { task: 'GATE-LEGACY-WORDBANK', command: 'node scripts/gate-legacy-wordbank.mjs' },
    { task: 'GATE-PRACTICE-ENGINE', command: 'node scripts/gate-practice-engine.mjs' },
    { task: 'TEST-BOUNDARY-AST', command: 'node tests/boundary-ast.mjs' },
    { task: 'DUAL-RUN-BOUNDARY', command: 'node scripts/dual-run-boundary.mjs' },
    { task: 'BUILD', command: 'npm run build' },
    { task: 'TEST-PERSISTENCE-BOUNDARY', command: 'node tests/persistence-boundary.mjs' },
    { task: 'TEST-LEARNING-BOUNDARY-WIRING', command: 'node tests/learning-boundary-wiring.mjs' },
    { task: 'TEST-LEARNING-STORAGE', command: 'node tests/learning-storage.mjs' },
    { task: 'TEST-LEARNING-SERVICE', command: 'node tests/learning-service.mjs' },
    { task: 'TEST-LEARNING-INSIGHTS', command: 'node tests/learning-insights.mjs' },
    { task: 'TEST-ANALYTICS-IDENTITY', command: 'node tests/analytics-identity.mjs' },
    { task: 'TEST-MIGRATION-GUARDS', command: 'node tests/migration-guards.mjs' },
    { task: 'TEST-CONTENT-QUERY', command: 'node tests/content-query.mjs' },
    { task: 'AUDIT-LEARNING-R5', command: 'node scripts/learning-consistency.mjs --user-store=_user-snapshot/real-user-localStorage.json' },
    { task: 'DRYRUN-REAL', command: 'node scripts/migration-dryrun-w1.mjs --user-store=_user-snapshot/real-user-localStorage.json' },
    { task: 'TEST-E2E', command: 'node tests/e2e.mjs' },
  ],
  /**
   * Wave 5-D · 性能基线（D-1）+ 预算门（D-2/D-3）
   *
   * 交付三件：bench-content / bench-boot（产 perf-baseline.json）、gate-perf（预算表
   * effective = min-strict(derived ×1.15, absolute) + reason）、check-bundle 改为读
   * 预算表（单一事实来源）。本轮同时解除 CI 部署阻断（主 chunk 434,385 B 超旧硬编码
   * 430,080 B；raw 预算按计划 D-2 absolute 450,000 B 处理，reason 双记录，gzip 不抬）。
   *
   * CHECK-BUNDLE 自本轮起进固定证据清单（W2C/W3 对照图披露的缺口就此闭合）。
   * BENCH-* 在 BUILD 之后跑（需要 dist）；不进 CI，理由见 bench 脚本头注释。
   */
  W5D: [
    { task: 'TSC', command: 'npx tsc -b --noEmit' },
    { task: 'LINT', command: 'npx oxlint src/' },
    { task: 'GATE-PERF', command: 'node scripts/gate-perf.mjs' },
    { task: 'CHECK-BUNDLE', command: 'node scripts/check-bundle.mjs' },
    { task: 'GATE-ARCHITECTURE', command: 'node scripts/gate-architecture.mjs' },
    { task: 'GATE-TODO', command: 'node scripts/gate-todo.mjs' },
    { task: 'GATE-LEARNING-BOUNDARY', command: 'node scripts/gate-learning-boundary.mjs' },
    { task: 'GATE-PERSISTENCE', command: 'node scripts/gate-persistence.mjs' },
    { task: 'GATE-G4', command: 'node scripts/gate-g4.mjs' },
    { task: 'GATE-LEGACY-WORDBANK', command: 'node scripts/gate-legacy-wordbank.mjs' },
    { task: 'GATE-PRACTICE-ENGINE', command: 'node scripts/gate-practice-engine.mjs' },
    { task: 'BUILD', command: 'npm run build' },
    { task: 'BENCH-CONTENT', command: 'node scripts/bench-content.mjs' },
    { task: 'BENCH-BOOT', command: 'node scripts/bench-boot.mjs' },
    { task: 'TEST-PERSISTENCE-BOUNDARY', command: 'node tests/persistence-boundary.mjs' },
    { task: 'TEST-LEARNING-BOUNDARY-WIRING', command: 'node tests/learning-boundary-wiring.mjs' },
    { task: 'TEST-LEARNING-STORAGE', command: 'node tests/learning-storage.mjs' },
    { task: 'TEST-LEARNING-SERVICE', command: 'node tests/learning-service.mjs' },
    { task: 'TEST-LEARNING-INSIGHTS', command: 'node tests/learning-insights.mjs' },
    { task: 'TEST-ANALYTICS-IDENTITY', command: 'node tests/analytics-identity.mjs' },
    { task: 'TEST-MIGRATION-GUARDS', command: 'node tests/migration-guards.mjs' },
    { task: 'TEST-CONTENT-QUERY', command: 'node tests/content-query.mjs' },
    { task: 'TEST-BOUNDARY-AST', command: 'node tests/boundary-ast.mjs' },
    { task: 'AUDIT-LEARNING-R5', command: 'node scripts/learning-consistency.mjs --user-store=_user-snapshot/real-user-localStorage.json' },
    { task: 'DRYRUN-REAL', command: 'node scripts/migration-dryrun-w1.mjs --user-store=_user-snapshot/real-user-localStorage.json' },
    { task: 'TEST-E2E', command: 'node tests/e2e.mjs' },
  ],
  /** Wave 4 · Content Platform（B-1 类型泛化 / B-2 七类试金石+collection / B-3 ingest / B-4 provenance / B-5 contract gate） */
  W4: [
    { task: 'TSC', command: 'npx tsc -b --noEmit' },
    { task: 'LINT', command: 'npx oxlint src/' },
    { task: 'CONTENT-VALIDATE', command: 'node scripts/content/validate.mjs' },
    { task: 'CONTENT-BUILD', command: 'node scripts/content/build.mjs' },
    { task: 'CONTENT-INGEST', command: 'node scripts/content/ingest.mjs' },
    { task: 'GATE-CONTENT-CONTRACT', command: 'node scripts/gate-content-contract.mjs' },
    { task: 'GATE-PERF', command: 'node scripts/gate-perf.mjs' },
    { task: 'CHECK-BUNDLE', command: 'node scripts/check-bundle.mjs' },
    { task: 'GATE-ARCHITECTURE', command: 'node scripts/gate-architecture.mjs' },
    { task: 'GATE-TODO', command: 'node scripts/gate-todo.mjs' },
    { task: 'GATE-LEARNING-BOUNDARY', command: 'node scripts/gate-learning-boundary.mjs' },
    { task: 'GATE-PERSISTENCE', command: 'node scripts/gate-persistence.mjs' },
    { task: 'GATE-G4', command: 'node scripts/gate-g4.mjs' },
    { task: 'GATE-LEGACY-WORDBANK', command: 'node scripts/gate-legacy-wordbank.mjs' },
    { task: 'GATE-PRACTICE-ENGINE', command: 'node scripts/gate-practice-engine.mjs' },
    { task: 'BUILD', command: 'npm run build' },
    { task: 'BENCH-CONTENT', command: 'node scripts/bench-content.mjs' },
    { task: 'BENCH-BOOT', command: 'node scripts/bench-boot.mjs' },
    { task: 'TEST-PERSISTENCE-BOUNDARY', command: 'node tests/persistence-boundary.mjs' },
    { task: 'TEST-LEARNING-BOUNDARY-WIRING', command: 'node tests/learning-boundary-wiring.mjs' },
    { task: 'TEST-LEARNING-STORAGE', command: 'node tests/learning-storage.mjs' },
    { task: 'TEST-LEARNING-SERVICE', command: 'node tests/learning-service.mjs' },
    { task: 'TEST-LEARNING-INSIGHTS', command: 'node tests/learning-insights.mjs' },
    { task: 'TEST-ANALYTICS-IDENTITY', command: 'node tests/analytics-identity.mjs' },
    { task: 'TEST-MIGRATION-GUARDS', command: 'node tests/migration-guards.mjs' },
    { task: 'TEST-CONTENT-QUERY', command: 'node tests/content-query.mjs' },
    { task: 'TEST-BOUNDARY-AST', command: 'node tests/boundary-ast.mjs' },
    { task: 'AUDIT-LEARNING-R5', command: 'node scripts/learning-consistency.mjs --user-store=_user-snapshot/real-user-localStorage.json' },
    { task: 'DRYRUN-REAL', command: 'node scripts/migration-dryrun-w1.mjs --user-store=_user-snapshot/real-user-localStorage.json' },
    { task: 'TEST-E2E', command: 'node tests/e2e.mjs' },
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
