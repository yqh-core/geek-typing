// 探针 P4（**新**探针 · **必须判红**）：字符串**常量折叠拼接**的动态导入路径。
// `import('./lib/' + 'analytics')` 在 AST 上折叠为 `./lib/analytics` → 命中；
// 纯正则是检测不到这条的（正则只能抓紧跟 `(` 的整字面量），因此它同时是 AST 版相对 oracle 的**增量能力**。
export async function loadAnalyticsSplit() {
  return import('./lib/' + 'analytics')
}

const SEGMENT = 'review'

export async function loadReviewViaTemplate() {
  return import(`./lib/${SEGMENT}Store`)
}
