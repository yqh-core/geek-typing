/// <reference types="vite/client" />

/**
 * `manifest.json?runtime` 的 ambient 类型：构建期经 scripts/vite-plugin-manifest-runtime.mjs
 * 投影后，runtime 拿到的是**对象**（RuntimePackageManifest），不是字符串。
 *
 * ⚠️ 这里必须用**内联** `import type`（写在 declare module 块内）：
 * 若把 import 提到本文件顶层，本文件会变成模块，ambient `declare module` 随之失效。
 */
declare module '*.json?runtime' {
  import type { RuntimePackageManifest } from './core/content/schema'
  const manifest: RuntimePackageManifest
  export default manifest
}
