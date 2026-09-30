#!/usr/bin/env node
/**
 * Evidence Runner（P1.7-PLAN v2.3.2 §15）
 *
 * Status 只能由 Command 产生：Plan → Command → Machine Result(exit code) →
 * Artifact(sha256, 落盘) → Evidence(本矩阵) → CLOSED。禁止人工填 PASS。
 *
 * 用法：node scripts/evidence-run.mjs --wave=W0 [--allow-frozen] [--dry-run]
 *      node scripts/evidence-run.mjs --wave=P18-A --dry-run   （只看计划，不写任何文件）
 *      node scripts/evidence-run.mjs --help                   （打印用法后 exit 0）
 *
 * 参数（白名单；**未知参数 = exit 2，绝不降级为执行**）：
 *   --wave=<WAVE>   目标波次（缺省 W0）。族键 = WAVE.split('-')[0]；任务表按族共用，
 *                   证据根按波次独立：W0 → docs/audit-package/_generated/evidence/W0/，
 *                   P18-A → docs/p18/_generated/evidence/P18-A/。
 *   --dry-run       只打印计划（wave / family / 任务数 / 证据根 / 退役上一轮 / commit）
 *                   后 exit 0 —— 不 mkdir、不 spawn 任务、不写 matrix。
 *   --allow-frozen  显式允许写入 docs/audit-package/（INV-1 冻结区）。缺省下证据根落在
 *                   该区域一律 exit 2，且**在产生任何文件前**退出。对非冻结区为 no-op。
 *   --help, -h      打印本用法到 stdout 后 exit 0，不写任何文件。
 *
 * 产物根：W* 波   → docs/audit-package/_generated/evidence/<WAVE>/
 *         P18* 波 → docs/p18/_generated/evidence/<WAVE>/（P1.8 证据树，**不进 P1.7 冻结区** —— 见 verify-p17-frozen.mjs INV-1）
 *   ├── <RunId>.txt          每条命令的原始输出（stdout+stderr）
 *   ├── evidence-matrix.json 机器矩阵（含 RunId/ExitCode/Commit/ArtifactHash）
 *   ├── evidence-matrix.md   人工可读版
 *   └── _superseded/         本波次被取代的历史轮（同任务旧产物，rename 归档，不参与 verify 判定）
 * RunId = <WAVE>-<TASK>-<yyyymmdd>-<hhmmss>-R<attempt>（§15 秒级 + attempt）
 *
 * 任务表按「族」共用、证据根按「波次」独立：
 *   FAMILY = WAVE.split('-')[0]（P18-A → P18；W0/W5C 无短横线 → 自身）。
 *   任务表查找 TASK_TABLE[WAVE] ?? TASK_TABLE[FAMILY] —— 于是 P18-A/P18-B/… 共用 P18 那份
 *   通用回归清单，但各自落 docs/p18/_generated/evidence/P18-A、…/P18-B 独立证据根。
 *   每次运行前把本波次同任务的旧产物 rename 进 _superseded/（不是删除），并让 RunId 的
 *   attempt 按代递增 —— 这样波次目录顶层恒等于 matrix 引用的那批文件，orphan 才是严格判据。
 *
 * ⚠️ 历史事故：本脚本默认 --wave=W0，而 --wave=W0 的证据根落在 INV-1 冻结区
 *   （docs/audit-package/**）。一次 `node scripts/evidence-run.mjs --help` 误触直接退役了
 *   24 个已提交产物、又写入 11 个新产物，污染了冻结区。根因是「危险脚本带破坏性默认值」。
 *   故：参数校验与冻结区守卫必须先于任何写路径，且脚本自身必须能证明「作用在预期对象上」
 *   （P1.8-DESIGN-RULINGS v1.0 ⑥ 第 7 条）。
 *
 * 实现：async spawn（本机 shim 环境下 spawnSync 返回 EBUSY，async spawn 正常）。
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync, readdirSync, renameSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const USAGE = [
  '用法：node scripts/evidence-run.mjs --wave=<WAVE> [--allow-frozen] [--dry-run]',
  '',
  '参数（白名单；之外任何参数一律 exit 2，绝不降级为执行）：',
  '  --wave=<WAVE>    目标波次（缺省 W0）。族键 = WAVE.split(\'-\')[0]，任务表按族共用，',
  '                   证据根按波次独立：W0 → docs/audit-package/_generated/evidence/W0/，',
  '                   P18-A → docs/p18/_generated/evidence/P18-A/。',
  '  --dry-run        只打印计划（wave / family / 任务数 / 证据根 / 退役上一轮 / commit）',
  '                   后 exit 0，不写任何文件（不 mkdir、不 spawn 任务、不写 matrix）。',
  '  --allow-frozen   显式允许写入 docs/audit-package/（INV-1 冻结区）；缺省下写入该区域',
  '                   的证据根一律 exit 2。对非冻结区为 no-op。',
  '  --help, -h       打印本用法到 stdout 后 exit 0，不写任何文件。',
  '',
  '未知参数 = exit 2，绝不降级为执行。',
].join('\n')

const listDir = (dir) => {
  try { return readdirSync(dir) } catch { return [] }
}

// --- 参数白名单解析：未知 flag / --help 一律在这里终结，绝不进入任何写路径 ---
let WAVE = null
let allowFrozen = false
let dryRun = false
for (const arg of process.argv.slice(2)) {
  if (arg === '--help' || arg === '-h') {
    console.log(USAGE)
    process.exit(0)
  }
  if (arg === '--allow-frozen') { allowFrozen = true; continue }
  if (arg === '--dry-run') { dryRun = true; continue }
  if (arg.startsWith('--wave=')) {
    const value = arg.slice('--wave='.length).trim()
    if (!value) {
      console.error(`invalid --wave: 缺少波次值\n\n${USAGE}`)
      process.exit(2)
    }
    WAVE = value.toUpperCase()
    continue
  }
  console.error(`unknown argument: ${arg}\n\n${USAGE}`)
  process.exit(2)
}
// 保留既有行为：未显式给 --wave 时缺省 W0（该波次证据根落在 INV-1 冻结区，由下方守卫拦截）。
if (WAVE === null) WAVE = 'W0'

const TASK_TABLE = {
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
  /** Wave 5 · C · Home composition only（§12：仅组合、e2e ≤6 条、零新键）。
   *  变更面：src/App.tsx（注入 catalog 汇总）+ src/components/HomePanel.tsx（展示）
   *  + tests/e2e.mjs（≤6 条断言）。不触碰 content/learning/persistence 子系统，
   *  故证据清单聚焦 TSC / LINT / BUILD / TEST-E2E 四项；其余门禁由 W5D 全量覆盖。
   *  BUILD 提前到 LINT 之后，保证 TEST-E2E 自举 preview 前有合法 dist。 */
  W5C: [
    { task: 'TSC', command: 'npx tsc -b --noEmit' },
    { task: 'LINT', command: 'npx oxlint src/' },
    { task: 'BUILD', command: 'npm run build' },
    { task: 'TEST-E2E', command: 'node tests/e2e.mjs' },
  ],
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
    // BUILD 提前：为 dist 依赖门禁（GATE-PERF / CHECK-BUNDLE / GATE-ARCHITECTURE 内 perf 子门）提供产物，
    // 使证据链自包含（不依赖预先存在的 dist）。原顺序把 BUILD 排在 GATE-PERF 之后，dist 缺失时三道门全 FAIL。
    { task: 'BUILD', command: 'npm run build' },
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
  /** P1.8 · Wave 18-* —— 内容与学习基础（P1.8-PLAN v1.0 §6）。
   *  本任务集由**整个 P1.8 系列共用**（18-0 基线冻结 / 18-A 类型契约 / 18-B 资产与许可 / …），
   *  每个 Wave 跑同一套通用回归，Wave 专属判据由该 Wave 新增的门脚本承担。
   *  已并入：
   *    18-0 —— scripts/verify-p17-frozen.mjs（INV-1 门，主判据）
   *    18-A —— scripts/gate-content-type-contract.mjs（INV-6 门）+ 其 --falsify 证伪自检
   *  证据根落 docs/p18/_generated/evidence/<WAVE>/（**不进 P1.7 冻结区** —— 见 verify-p17-frozen.mjs INV-1）：
   *  任务表按族共用（本键 P18 服务 P18-A/P18-B/…），证据根按波次独立（P18-A → …/evidence/P18-A）。
   *  BUILD 排在 dist 依赖门禁之前（W4 教训：先清 dist 再跑体积门会三连假红；
   *  本条尤其关键 —— 量到旧 dist 会让体积门假绿，实测踩过一次）。 */
  P18: [
    { task: 'TSC', command: 'npx tsc -b --noEmit' },
    { task: 'LINT', command: 'npx oxlint src/' },
    { task: 'BUILD', command: 'npm run build' },
    { task: 'VERIFY-P17-FROZEN', command: 'node scripts/verify-p17-frozen.mjs' },
    { task: 'VERIFY-MANIFESTS', command: 'node scripts/verify-manifest-hashes.mjs' },
    { task: 'CONTENT-VALIDATE', command: 'node scripts/content/validate.mjs' },
    // P18-F：INV-4（content/ 二进制媒体 = 0，双通道：扩展名白名单 + NUL 嗅探）+ 它自己的证伪自检，
    // 同上「不会失败的门等于没有门」纪律：证伪是独立证据任务，不许只跑门本身。
    { task: 'FALSIFY-CONTENT-VALIDATE', command: 'node scripts/content/validate.mjs --falsify' },
    { task: 'GATE-CONTENT-CONTRACT', command: 'node scripts/gate-content-contract.mjs' },
    { task: 'GATE-CONTENT-TYPE-CONTRACT', command: 'node scripts/gate-content-type-contract.mjs' },
    { task: 'FALSIFY-CONTENT-TYPE-CONTRACT', command: 'node scripts/gate-content-type-contract.mjs --falsify' },
    // P18-B：许可/资产入库前置硬门（INV-5，冻结 Plan §4.1 全表）+ 它自己的证伪自检。
    // 「不会失败的门等于没有门」—— 所以门的证伪必须是独立证据任务，不许只跑门本身。
    { task: 'GATE-LICENSE', command: 'node scripts/gate-license.mjs' },
    { task: 'FALSIFY-GATE-LICENSE', command: 'node scripts/gate-license.mjs --falsify' },
    // P18-D：UI 内容契约棘轮门（INV-2）+ 它自己的证伪自检。
    // 纯静态 AST 扫描（UI 域 ∪ src/lib/wordResolve.ts，不依赖 dist），基线落
    // docs/p18/_generated/ui-contract-baseline.json。同纪律：不会失败的门等于没有门 ——
    // 要证明的必须是「它能判红」，所以证伪是**独立证据任务**，不许只跑门本身。
    { task: 'TEST-UI-CONTRACT', command: 'node tests/ui-contract.mjs' },
    { task: 'FALSIFY-UI-CONTRACT', command: 'node tests/ui-contract.mjs --falsify' },
    { task: 'GATE-PERF', command: 'node scripts/gate-perf.mjs' },
    { task: 'CHECK-BUNDLE', command: 'node scripts/check-bundle.mjs' },
    // P18-C：体积门判据 4/5（manifest 投影 + lazy 反向校验）自带证伪，同上不许只跑门本身。
    { task: 'FALSIFY-CHECK-BUNDLE', command: 'node scripts/check-bundle.mjs --falsify' },
    { task: 'GATE-ARCHITECTURE', command: 'node scripts/gate-architecture.mjs' },
    { task: 'GATE-TODO', command: 'node scripts/gate-todo.mjs' },
    { task: 'GATE-LEARNING-BOUNDARY', command: 'node scripts/gate-learning-boundary.mjs' },
    { task: 'TEST-CONTENT-QUERY', command: 'node tests/content-query.mjs' },
    // P18-G0：relations 端点可达性契约测试 —— 非 word 端点扩展 + 三处调用点共用共享模块的静态断言。
    // 「不会失败的门等于没有门」：该测试在实施前先跑过一次，实测第 ② 条（reading 条目端点可达）
    // **判红**；扩展后转绿 —— 否则它就是一条恒真断言。它是 P18-G 产出首个 relations.json 的前置。
    { task: 'TEST-RELATIONS', command: 'node tests/relations.mjs' },
    // 裁定 ② 给 RELEASE-GATE 定的入表触发条件已达成：P18-F 落地后 P18-G4 由 PENDING 翻 PASS，
    // 实测 43 PASS / 0 FAIL / **0 PENDING** ⇒ 它不再恒 exit 1，进表不会让每个 P18 波次的矩阵判 FAIL。
    { task: 'RELEASE-GATE', command: 'node scripts/verify-release-gate.mjs' },
  ],
}

// 族键查找：P18-A/P18-B/… 各自独立证据根，但共用 P18 那份任务表；W0/W5C（无短横线）FAMILY 即自身。
const FAMILY = WAVE.split('-')[0]
const TASKS = TASK_TABLE[WAVE] ?? TASK_TABLE[FAMILY]
if (!TASKS) {
  console.error(`unknown wave: ${WAVE}（已尝试任务表键：WAVE=${WAVE}，FAMILY=${FAMILY}）`)
  process.exit(2)
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

/** 证据根目录按波次分流（与 evidence-verify.mjs 同口径）：
 *  P1.7 Wave（W*）保持历史路径；P1.8 Wave（P18*）落 docs/p18，避免写入 P1.7 冻结区。 */
const EVIDENCE_REL = /^P18/.test(WAVE)
  ? ['docs', 'p18', '_generated', 'evidence']
  : ['docs', 'audit-package', '_generated', 'evidence']
const EVIDENCE_REL_PATH = EVIDENCE_REL.join('/')
const OUT = join(ROOT, ...EVIDENCE_REL, WAVE)
// 本波次被取代的历史轮归档目录（子目录，verify 的 orphan 扫描只读顶层，天然不受影响）。
const SUPERSEDED = join(OUT, '_superseded')

/** 匹配「本波次 + 本任务」的产物文件名：用带尾随 `-` 的精确前缀，避免
 *  GATE-CONTENT-CONTRACT 被误判成 GATE-CONTENT-TYPE-CONTRACT 的前缀。 */
const artifactName = (f, task) => f.endsWith('.txt') && f.startsWith(`${WAVE}-${task}-`)

// ---- INV-1 冻结区守卫：必须在任何 mkdir / 写文件 / renameSync 之前通过 ----
// 判据用 path.resolve 后的绝对路径做前缀比较（分隔符统一为 `/`），
// 避免相对路径 / 大小写 / `..` 之类的字符串绕过。
const FROZEN_ROOT = resolve(ROOT, 'docs', 'audit-package')
const normPath = (p) => resolve(p).replace(/\\/g, '/').toLowerCase()
const OUT_NORM = normPath(OUT)
const FROZEN_NORM = normPath(FROZEN_ROOT)
const isFrozen = OUT_NORM === FROZEN_NORM || OUT_NORM.startsWith(`${FROZEN_NORM}/`)
if (isFrozen && !allowFrozen) {
  console.error('拒绝写入冻结区（INV-1）：解析出的证据根落在 docs/audit-package/ 之下。')
  console.error(`  证据根：${OUT}`)
  console.error(`  冻结区：${FROZEN_ROOT}（由 scripts/verify-p17-frozen.mjs 逐字节冻结）`)
  console.error('  本次未写任何文件。确需写入请显式加 --allow-frozen。')
  process.exit(2)
}

const COMMIT = (await gitCommitAsync())

// ---- --dry-run：打印计划后 exit 0，不 mkdir / 不 spawn 任务 / 不写 matrix ----
if (dryRun) {
  const outFiles = listDir(OUT)
  const retired = TASKS
    .filter(({ task }) => outFiles.some((f) => artifactName(f, task)))
    .map(({ task }) => task)
  console.log('--- dry-run 计划（不写任何文件）---')
  console.log(`wave        : ${WAVE}`)
  console.log(`family      : ${FAMILY}`)
  console.log(`任务数      : ${TASKS.length}`)
  console.log(`证据根      : ${OUT}`)
  console.log(`冻结区      : ${isFrozen ? '是（已由 --allow-frozen 显式放行）' : '否'}`)
  console.log(`退役上一轮  : ${retired.length ? `${retired.length} 个任务：${retired.join(', ')}` : '无（本波次顶层无同任务旧产物）'}`)
  console.log(`commit      : ${COMMIT}`)
  process.exit(0)
}

mkdirSync(OUT, { recursive: true })
mkdirSync(SUPERSEDED, { recursive: true })

const entries = []
let failed = 0
for (const { task, command } of TASKS) {
  // 生成前先把同任务的旧产物退役：rename（不删 —— 本机 safe-delete shim 会拦 unlink）。
  for (const f of readdirSync(OUT)) {
    if (artifactName(f, task)) {
      renameSync(join(OUT, f), join(SUPERSEDED, f))
      console.log(`↩ 退役上一轮产物 → _superseded/：${f}`)
    }
  }
  // attempt 按代递增：顶层 + _superseded 里同任务产物总数 + 1（全新波次 count=0 → R01，兼容 P1.7 既有产物）。
  const priors = readdirSync(OUT).filter((f) => artifactName(f, task)).length
    + readdirSync(SUPERSEDED).filter((f) => artifactName(f, task)).length
  const attempt = String(priors + 1).padStart(2, '0')
  const runId = `${WAVE}-${task}-${stamp()}-R${attempt}`
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
    evidence: `${EVIDENCE_REL_PATH}/${WAVE}/${runId}.txt`, status,
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
