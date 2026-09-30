/* P18-C · Vite 插件：`manifest.json?runtime` —— 构建/开发期把 manifest 投影成 runtime 白名单形状。
 *
 * 用法（见 src/core/content/registry.ts）：
 *   import ieltsManifest from '../../../content/vocabulary/ielts/manifest.json?runtime'
 * 导入到的是**对象**（ProjectedManifest），不是字符串。
 *
 * 为什么用「构建期投影」而不是「预生成 runtime.json 入库」：
 *   派生值每次构建现算 ⇒ 不存在「忘记重建」的 drift；源码 content/**\/*.json 保持完整，
 *   门禁侧仍直读原文件，不受影响。
 *
 * 为什么白名单的唯一事实源在 scripts/content/manifest-runtime.mjs：
 *   投影规则只有一处实现，避免「两份事实源」漂移（P18-A 的 12→14 白名单漂移同型事故）。
 *
 * `?runtime` 是自定义后缀，与 Vite 内置的 `?raw` / `?url` 不冲突（本插件 enforce:'pre'，
 * 只认自己这一种；不匹配时一律返回 null，不干扰其它模块）。
 */
import { readFileSync } from 'node:fs'
import { projectManifest } from './content/manifest-runtime.mjs'

const RUNTIME_QUERY = '?runtime'

export function manifestRuntime() {
  return {
    name: 'content:manifest-runtime',
    enforce: 'pre',

    /** source 形如 `<相对或绝对路径>/manifest.json?runtime`。 */
    async resolveId(source, importer) {
      if (!source.endsWith(RUNTIME_QUERY)) return null
      const bare = source.slice(0, -RUNTIME_QUERY.length)
      // 交给 Vite 自身的解析链处理相对路径 / alias / 扩展名 —— 不自己拼路径。
      const resolved = await this.resolve(bare, importer, { skipSelf: true })
      if (!resolved) return null
      return `${resolved.id}${RUNTIME_QUERY}`
    },

    /** id 形如 `<绝对路径>/manifest.json?runtime`：读原文件 → 投影 → 导出为对象字面量。 */
    load(id) {
      if (!id.endsWith(RUNTIME_QUERY)) return null
      const file = id.slice(0, -RUNTIME_QUERY.length)
      const projected = projectManifest(JSON.parse(readFileSync(file, 'utf8')))
      return { code: `export default ${JSON.stringify(projected)}`, map: null }
    },
  }
}
