// 探针 P6（**必须判红**）：绕过门面直引 `core/content/**`。
//
// 顶层 barrel `src/core/content/index.ts` 是唯一门面（CONTENT_CONTRACT §12.1）；
// 直连 `catalog/catalog` 这种深路径即绕过门面。**type-only 直连放行**（无运行时耦合）。
//
// 期望：bypassFacadeImports = 1（深路径值导入那一条），其余五桶 = 0。
import { getCatalog } from '../../../src/core/content/catalog/catalog' // ← 命中（深路径值导入）
import { getCatalog as facadeGetCatalog } from '../../../src/core/content' // ← 门面本身，不得命中
import type { ContentCatalog } from '../../../src/core/content/catalog/catalog' // ← type-only，放行

export const deep = getCatalog()
export const facade = facadeGetCatalog()
export type C = ContentCatalog
