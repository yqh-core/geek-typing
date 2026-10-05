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
 * ── 两个口径（N4 裁定：名字自带口径） ──
 * 本模块同时产出**两类条目集合**，二者定义如下、不可混用：
 *
 * |返回字段             | 口径         | 定义                                | 数值 |
 *|----------------------|--------------|-------------------------------------|------|
 * |`allTypesItems`       | all-types    | Σ `stats.items`，**全部**类型包      | 9486 |
 * |`vocabularyOnlyItems` | vocabulary-only | Σ `stats.items`，**仅** `type === 'vocabulary'` | 9438 |
 *
 * 差值 **48** = 非词汇条目：reading 9 / exercise 8 / listening 6 / audio 5 /
 * collection 5 / speaking 5 / topic 5 / writing 5（13 个词汇包 9438 + 14 个非词汇包 48）。
 *
 * ⚠️ UI 文案（首页「词库 N · M 词」）数的是 **all-types** 口径 ——
 *    所以「M 词」里本就含 48 条非词汇条目。那是 UI 文案的老问题（属产品口径，
 *    超边界未改）；本模块只负责如实对齐，并让字段名把这件事说清楚。
 *
 * ── 为什么必须「一次遍历同时累两个计数器」 ──
 * 若为两种口径各写一次遍历（一次只累 all-types、一次只累 vocabulary），未来新增包时
 * 两处会漏改不同的地方 —— 这正是 `prod-catalog-check.mjs` 与 `e2e.mjs` 硬编码分叉的成因。
 * 单次for 循环内对同一份 `stats.items` 同时累两个计数器，两个口径**恒同源**。
 *
 * ⚠️ 字段名纪律：manifest 里的类型字段是 **`type`**，不是 `itemType` / `contentType` / `kind`。
 *    猜错字段名**不会抛错**，只会让 `vocabularyOnlyItems` 静默变成 0（N4 取证时踩过：
 *    实测 27 个 manifest 里 `type` 出现 27 次，其余候选键各 0 次）。
 *    故本模块显式统计「缺 `type` 字段的包数」，非 0 即抛错（见函数末尾），
 *    让这类静默 0 变成硬失败。
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
/** 仓库根（tests/helpers/ 上两级） */
export const REPO_ROOT = join(HERE, '..', '..')

/**
 * 唯一口径的类型字段名（manifest 契约字段，**不可改**）。
 * 导出为常量是为了让「拼错字段名 ⇒ 静默 0」这类错误在代码里只能写一次。
 * @type {string}
 */
export const VOCABULARY_TYPE_FIELD = 'type'
/** vocabulary 类型的 `type` 取值 */
export const VOCABULARY_TYPE = 'vocabulary'

/**
 * 按 content/ 下的 manifest **一次遍历**现算首页汇总的三个数字。
 *
 * @param {string} [contentDir=join(REPO_ROOT, 'content')] 内容根
 * @returns {{ packages: number, allTypesItems: number, vocabularyOnlyItems: number }}
 *   packages = 带 manifest.json 的包数（**无口径歧义**）；
 *   allTypesItems = Σ stats.items（**all-types 口径**，含非词汇条目，见文件头说明）；
 *   vocabularyOnlyItems = Σ stats.items（**vocabulary-only 口径**，仅 type === 'vocabulary'）
 * @throws {Error} 一个包都解析不出来时抛错；或任一 manifest 缺 `type` 字段时抛错
 *   （两者都是「不回落写死数字」的既有纪律 —— 静默回落/静默 0 = 假绿）
 */
export function catalogTotals(contentDir = join(REPO_ROOT, 'content')) {
  let packages = 0
  let allTypesItems = 0
  let vocabularyOnlyItems = 0
  /** 缺 `type` 字段的包数；>0 说明类型口径失效（vocabulary-only 会静默变 0） */
  let packagesMissingType = 0

  for (const typeDirName of readdirSync(contentDir)) {
    const td = join(contentDir, typeDirName)
    if (!statSync(td).isDirectory()) continue
    for (const name of readdirSync(td)) {
      const pd = join(td, name)
      if (!statSync(pd).isDirectory()) continue
      const mf = join(pd, 'manifest.json')
      if (!existsSync(mf)) continue
      packages++
      const m = JSON.parse(readFileSync(mf, 'utf8'))
      const n = typeof m.stats?.items === 'number' ? m.stats.items : 0

      // 同一次遍历、同一份 stats.items，同时累两个口径 —— 见文件头「一次遍历」理由
      allTypesItems += n
      const manifestType = m[VOCABULARY_TYPE_FIELD]
      if (typeof manifestType === 'string') {
        if (manifestType === VOCABULARY_TYPE) vocabularyOnlyItems += n
      } else {
        packagesMissingType++
      }
    }
  }

  if (packages === 0) throw new Error('content/ 下解析不出任何包 —— 不回落到写死的旧数字')
  // 字段名自检：拼错类型字段不会抛错、只会让 vocabularyOnlyItems 静默变 0，故显式拦
  if (packagesMissingType > 0) {
    throw new Error(
      `content/ 下有 ${packagesMissingType}/${packages} 个 manifest 缺 ` +
        `\`${VOCABULARY_TYPE_FIELD}\` 字段 —— vocabulary-only 口径已失效，不回落写死数字`,
    )
  }
  return { packages, allTypesItems, vocabularyOnlyItems }
}
