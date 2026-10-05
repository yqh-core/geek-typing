/**
 * 首页「词库 N · M 词」两个数字的**唯一算法**（单一实现纪律）。
 *
 * ── 为什么抽出来 ──
 * 这段算法先在 tests/e2e.mjs 里落地（A1-E：写死的「18 词库 · 9388 词」在新增
 * reading / exercise 包后变成 20 / 9390，判据立刻假红 —— 红的又是「数字过期」
 * 而不是「功能坏了」），改成按 content/ 下的 manifest 现算。
 * 但 tests/prod-catalog-check.mjs 是**另一个**断言同一组数字的脚本，A1-E 时被漏掉了，
 * 于是同一处硬编码在该文件里一直留到今天（实测已腐坏成 18 / 9388，而线上早就是
 * 27 / 9486）—— 两份各自为政的副本，就是这样悄悄分叉的。
 *
 * ⚠️ 绝不回落到写死的旧数字：解析不出包就抛错。静默回落 = 假绿。
 *
 * ⚠️ 口径（既有行为，非本模块引入）：`items` 统计的是**所有类型的条目**，
 *    所以一篇 reading 篇章也计 1 ——「9486 词」里本就含 48 条非词汇条目。
 *    这是 UI 文案把 items 一律叫「词」的老问题（超边界未改），只负责如实对齐。
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
/** 仓库根（tests/helpers/ 上两级） */
export const REPO_ROOT = join(HERE, '..', '..')

/**
 * 按 content/ 下的 manifest 现算首页汇总的两个数字。
 *
 * @param {string} [contentDir=join(REPO_ROOT, 'content')] 内容根
 * @returns {{ packages: number, items: number }} packages = 带 manifest.json 的包数；
 *   items = Σ stats.items（**全类型**口径，含非词汇条目，见文件头说明）
 * @throws {Error} 一个包都解析不出来时抛错（不回落写死数字）
 */
export function catalogTotals(contentDir = join(REPO_ROOT, 'content')) {
  let packages = 0
  let items = 0
  for (const type of readdirSync(contentDir)) {
    const td = join(contentDir, type)
    if (!statSync(td).isDirectory()) continue
    for (const name of readdirSync(td)) {
      const pd = join(td, name)
      if (!statSync(pd).isDirectory()) continue
      const mf = join(pd, 'manifest.json')
      if (!existsSync(mf)) continue
      packages++
      const m = JSON.parse(readFileSync(mf, 'utf8'))
      if (typeof m.stats?.items === 'number') items += m.stats.items
    }
  }
  if (packages === 0) throw new Error('content/ 下解析不出任何包 —— 不回落到写死的旧数字')
  return { packages, items }
}
