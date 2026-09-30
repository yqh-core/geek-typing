/* 类型声明：vite.config.ts（tsconfig.node.json，moduleResolution: nodenext）import 本插件时，
 * TS 需要一个 `./vite-plugin-manifest-runtime.mjs` → `./vite-plugin-manifest-runtime.d.mts` 的声明，
 * 否则报 TS7016（implicitly any）。实现见同目录同名 .mjs。 */
import type { Plugin } from 'vite'

export function manifestRuntime(): Plugin
