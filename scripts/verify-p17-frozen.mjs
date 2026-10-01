#!/usr/bin/env node
/**
 * P1.8 · INV-1 —— P1.7 冻结基线保护门
 *
 * 目的：把「P1.8 不回改 P1.7 交付物」从一句承诺变成**提交即判红**的机器门。
 *       P1.8 的所有提交必须是 additive（落在 `02e334e` 之上），任何触碰冻结路径的改动直接 FAIL。
 *
 * 判据（任一不成立 → exit 1）：
 *   A. 冻结 HEAD 在仓库中确实存在（git cat-file -e <sha>^{commit}）
 *   B. 后代性：冻结 HEAD 必须是当前 HEAD 的祖先（git merge-base --is-ancestor）
 *   C. 路径冻结：`git diff --name-only <FROZEN>..HEAD -- <FROZEN_PATHS>` 必须为空
 *   D. 内容冻结：`verify-manifest-hashes.mjs` 重算全部登记 artifact，必须 0 不符
 *
 * 退出码（与 verify-release-gate 同族语义）：
 *   0 = PASS（四项全成立）
 *   1 = FAIL（冻结区被改动 / hash 漂移）
 *   2 = 脚本自身错误（git 不可用 / 冻结 HEAD 不存在 / 清单器异常 —— 绝不允许降级成 PASS）
 *
 * 用法：npm run verify:p17-frozen
 */
import { spawn } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** P1.7 最终交付冻结 HEAD（来源：P1.7-FINAL-FINGERPRINT.txt / 08-GIT-STATE） */
const FROZEN_HEAD_DEFAULT = '02e334ef81014dce38582bd6786b568174b4802f'
/** 可覆盖仅用于**门的证伪自测**（如指向更早的历史节点，冻结区必然"有改动" → 门必须判红）。
 *  生产/CI 不得设置该变量，否则等于把门调松。 */
const FROZEN_HEAD = process.env.P17_FROZEN_HEAD || FROZEN_HEAD_DEFAULT

/** 冻结路径：P1.7 交付证据链所在目录（P1.8 只增不改） */
const FROZEN_PATHS = ['docs/audit-package/']

function run(cmd, args) {
  return new Promise((res) => {
    let p
    try {
      p = spawn(cmd, args, { cwd: ROOT, shell: false })
    } catch (e) {
      return res({ code: -1, out: '', err: String(e) })
    }
    let out = ''
    let err = ''
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (err += d))
    p.on('error', (e) => res({ code: -1, out, err: err + String(e) }))
    p.on('close', (code) => res({ code, out, err }))
  })
}

const git = (...args) => run('git', args)

let failures = 0
const _ignore = (msg) => console.log(`   ignore: ${msg}`)

console.log('======================================================================')
console.log(' P1.8 INV-1 — P1.7 冻结基线保护门（verify-p17-frozen.mjs）')
console.log('======================================================================')
console.log(` 冻结 HEAD : ${FROZEN_HEAD}`)
console.log(` 冻结路径  : ${FROZEN_PATHS.join(', ')}`)
console.log()

/* ---------- A. 冻结 HEAD 存在 ---------- */
{
  const r = await git('cat-file', '-e', `${FROZEN_HEAD}^{commit}`)
  if (r.code === 0) {
    console.log('[A] 冻结 HEAD 存在 ................................ ✅')
  } else {
    console.error('[A] 冻结 HEAD 存在 ................................ ❌')
    console.error(`    git cat-file 失败（exit=${r.code}）—— 仓库可能被浅克隆或历史被改写`)
    console.error(`    ${r.err.trim()}`)
    process.exit(2)
  }
}

/* ---------- B. 后代性 ---------- */
{
  const r = await git('merge-base', '--is-ancestor', FROZEN_HEAD, 'HEAD')
  if (r.code === 0) {
    console.log('[B] 后代性（冻结 HEAD 是 HEAD 祖先）............... ✅')
  } else {
    // exit 1 = 不是祖先（真 FAIL）；其他 = git 出错
    if (r.code === 1) {
      console.error('[B] 后代性（冻结 HEAD 是 HEAD 祖先）............... ❌')
      console.error('    当前 HEAD 不是冻结 HEAD 的后代 —— 历史被改写 / rebase / 强推过')
      failures++
    } else {
      console.error(`[B] git merge-base 异常（exit=${r.code}）：${r.err.trim()}`)
      process.exit(2)
    }
  }
}

/* ---------- C. 路径冻结 ---------- */
{
  const r = await git('diff', '--name-only', `${FROZEN_HEAD}..HEAD`, '--', ...FROZEN_PATHS)
  if (r.code !== 0) {
    console.error(`[C] git diff 异常（exit=${r.code}）：${r.err.trim()}`)
    process.exit(2)
  }
  const changed = r.out.split('\n').map((s) => s.trim()).filter(Boolean)
  if (changed.length === 0) {
    console.log('[C] 路径冻结（冻结区内 0 改动）.................... ✅')
  } else {
    console.error('[C] 路径冻结（冻结区内 0 改动）.................... ❌')
    console.error(`    冻结区有 ${changed.length} 个文件被改动：`)
    for (const f of changed.slice(0, 20)) console.error(`      - ${f}`)
    if (changed.length > 20) console.error(`      …（另有 ${changed.length - 20} 个）`)
    failures++
  }
}

/* ---------- C3. 工作树冻结（未提交的改动/新增也不许） ----------
 * C 只看提交间 diff、D 只看「已登记文件」的内容 → 两者都漏掉「未提交的新增文件」。
 * 该检查补上这一缺口：冻结区在工作树里必须完全干净。 */
{
  const r = await git('status', '--porcelain', '--', ...FROZEN_PATHS)
  if (r.code !== 0) {
    console.error(`[C3] git status 异常（exit=${r.code}）：${r.err.trim()}`)
    process.exit(2)
  }
  const lines = r.out.split('\n').map((s) => s.trimEnd()).filter(Boolean)
  if (lines.length === 0) {
    console.log('[C3] 工作树冻结（冻结区无未提交改动/新增）........ ✅')
  } else {
    console.error('[C3] 工作树冻结（冻结区无未提交改动/新增）........ ❌')
    for (const l of lines.slice(0, 20)) console.error(`      ${l}`)
    if (lines.length > 20) console.error(`      …（另有 ${lines.length - 20} 条）`)
    failures++
  }
}

/* ---------- 冻结区存在性（防"删掉整个目录"绕过） ---------- */
{
  const dir = resolve(ROOT, FROZEN_PATHS[0])
  if (existsSync(dir) && statSync(dir).isDirectory()) {
    console.log('[C2] 冻结区目录存在 ............................... ✅')
  } else {
    console.error(`[C2] 冻结区目录不存在：${FROZEN_PATHS[0]}  ❌`)
    failures++
  }
}

/* ---------- D. 内容冻结（155 登记文件逐字节重算） ---------- */
{
  const verifier = resolve(ROOT, 'scripts/verify-manifest-hashes.mjs')
  if (!existsSync(verifier)) {
    console.error(`[D] 清单器缺失：scripts/verify-manifest-hashes.mjs  ❌`)
    process.exit(2)
  }
  const r = await run(process.execPath, ['scripts/verify-manifest-hashes.mjs'])
  const tail = (r.out + r.err).trim().split('\n').slice(-6).join('\n')
  if (r.code === 0) {
    console.log('[D] 内容冻结（登记 artifact 逐字节 0 不符）........ ✅')
    for (const l of tail.split('\n')) console.log(`    ${l}`)
  } else {
    console.error('[D] 内容冻结（登记 artifact 逐字节 0 不符）........ ❌')
    for (const l of tail.split('\n')) console.error(`    ${l}`)
    failures++
  }
}

console.log('──────────────────────────────────────────────────────────────────────')
if (failures === 0) {
  console.log('P1.7 冻结基线保护：✅ PASS —— 冻结区零改动、登记 artifact 逐字节一致')
  process.exit(0)
}
console.error(`P1.7 冻结基线保护：❌ FAIL —— ${failures} 项不成立（P1.8 不得触碰 P1.7 冻结区）`)
process.exit(1)
