// 探针 P1（**必须判红**）：UI 侧**直读词表 JSON 载荷**。
// 两条路径都算：静态 `import ... from '.../words.json'` 与动态 `import('.../items.json')`。
// 期望：tableJsonImports = 2，其余五桶 = 0。
import words from './_support/words.json'

export async function lazyItems() {
  return import('./_support/items.json')
}

export const WORDS = words
