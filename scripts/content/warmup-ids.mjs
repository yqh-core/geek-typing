/* WARMUP_IDS（预热清单）的唯一解析入口 —— 供判据与测试夹具共用。
 *
 * 事实源只有一处：`src/core/content/registry.ts` 里的
 *   export const WARMUP_IDS = ['kaoyan', 'toefl'] as const
 * 它是「运行时预热哪些包」的唯一事实源。本模块只负责把它**读出来**，
 * 不复制一份清单、也不在别处再写一遍正则 —— 否则「判据按 A 写法解析 /
 * 夹具按 B 写法解析」迟早口径漂移（P18-B 遗留项 9.2 的收口点之一）。
 *
 * 消费方：
 *   - scripts/check-bundle.mjs  判据 3（预热字节预算从清单算）+ 判据 6（清单长度上限/棘轮）
 *   - tests/e2e.mjs             预热探针（SW 缓存里是否真有清单内 chunk）
 *
 * 解析不到 ⇒ 一律返回 null，由调用方记 UNKNOWN / 判 FAIL。
 * 本模块里**绝不**给出「解析不到就放行」的兜底：测不出来绝不等于通过。
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

/** registry.ts 相对仓库根的位置（单一事实源的文件路径也只在这里写一次） */
export const REGISTRY_REL = path.join('src', 'core', 'content', 'registry.ts')

/**
 * 解析 registry.ts 源码文本里的 WARMUP_IDS 字面量。
 * @param {string} src registry.ts 全文
 * @returns {string[] | null} 解析不到（常量缺失、为空、语法形态变化）⇒ null
 */
export function parseWarmUpLiteral(src) {
  const m = /\bconst\s+WARMUP_IDS\s*=\s*\[([^\]]*)\]/.exec(src)
  if (!m) return null
  const ids = [...m[1].matchAll(/['"`]([^'"`]+)['"`]/g)].map((x) => x[1]).filter(Boolean)
  if (ids.length === 0) return null
  return ids
}

/**
 * 读 registry.ts 并解析预热清单。
 * @param {string} [root] 仓库根，默认 process.cwd()
 * @returns {string[] | null} 文件缺失 / 解析不到 ⇒ null（调用方须记 UNKNOWN 或 FAIL）
 */
export function readWarmUpIds(root = process.cwd()) {
  try {
    return parseWarmUpLiteral(readFileSync(path.join(root, REGISTRY_REL), 'utf8'))
  } catch {
    return null
  }
}
