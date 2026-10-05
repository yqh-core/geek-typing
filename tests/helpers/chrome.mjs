/**
 * Chromium / Chrome 可执行文件的**唯一查找实现**（单一实现纪律）。
 *
 * ── 为什么抽出来 ──
 * 这段查找逻辑曾有三份各自为政的副本，且质量参差不齐：
 *   1. tests/e2e.mjs:41-64            —— 最完整，优先级链已在 CI 上实证可用
 *   2. tests/prod-catalog-check.mjs:27 —— 与 (1) 逐字重复
 *   3. scripts/verify-learning-unit.mjs:54 —— 最差：候选只写死 3 条 Windows 路径、
 *      用 `C:/Program Files/...` 正斜杠形式、**没有 CHROME_PATH 兜底、没有 Linux 路径**
 *      ⇒ 在 ubuntu CI 上必然 `throw new Error('no chrome found')`，结构上跑不起来。
 * 三份副本的失效方式都是**静默**的：只有第三份在 Linux 上炸，而它恰恰是唯一一份
 * 从没被任何门执行过的脚本 —— 「没人跑过」和「能跑」之间没有任何机制挂钩。
 *
 * 本模块以 e2e.mjs 那份为蓝本（它的优先级链已经过 CI 验证）：
 *   CHROME_PATH 环境变量 → Windows 两条安装路径
 *   → %USERPROFILE%/.agent-browser/browsers 下各版本目录里的 chrome.exe
 *   → $PLAYWRIGHT_BROWSERS_PATH|~/.cache/ms-playwright 下chromium* 子目录里的 chrome-linux/chrome
 *
 * ⚠️ 语义约定：找不到时**返回 undefined**（不抛错），由调用方决定怎么报错 ——
 *    与 e2e.mjs / prod-catalog-check.mjs 既有行为一致。抛错版会让「本机没装浏览器」
 *    这件事在 import 期就炸，调用方连自己的错误提示都没机会打。
 */
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 按优先级链查找可用的 Chromium/Chrome 可执行文件。
 *
 * @returns {string|undefined} 第一个真实存在的路径；一个都找不到时返回 undefined
 *   （**不抛错** —— 调用方负责把这个 undefined 翻译成它自己的错误提示）
 */
export function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ]
  const agents = join(process.env.USERPROFILE ?? '', '.agent-browser', 'browsers')
  if (existsSync(agents)) {
    for (const dir of readdirSync(agents)) {
      const exe = join(agents, dir, 'chrome.exe')
      if (existsSync(exe)) candidates.unshift(exe)
    }
  }
  // Playwright 下载的 Chromium（CI / Linux / macOS）
  const pwRoot = process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(process.env.HOME ?? '', '.cache', 'ms-playwright')
  if (existsSync(pwRoot)) {
    for (const dir of readdirSync(pwRoot)) {
      if (!dir.startsWith('chromium')) continue
      const exe = join(pwRoot, dir, 'chrome-linux', 'chrome')
      if (existsSync(exe)) candidates.unshift(exe)
    }
  }
  return candidates.find((p) => existsSync(p))
}