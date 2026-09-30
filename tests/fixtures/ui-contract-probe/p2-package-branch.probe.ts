// 探针 P2（**必须判红**）：UI 侧对**内容包 id** 做分支。
// 判据锚在「字面量取值 ∈ 从 content/ 派生的包 id 集合」上，**不是**「变量名含 id」。
// 期望：packageBranches = 1，其余五桶 = 0。
declare const pkgId: string
declare const themeId: string

export const hit = pkgId === 'ielts' // ← 命中（'ielts' 是真实内容包 localId）

// 以下三条都是**对照组**：都在比较字符串字面量，但取值不在包 id 集合里，**不得命中**。
//   · 主题 id（与 src/components/Header.tsx:241 的 `th.id === 'ide'` 同型，是最典型的假阳源）
//   · 另一个主题 id
//   · 包 id 的**前缀**（证明判据是取值等值，不是子串匹配）
export const negTheme = themeId === 'ide'
export const negTheme2 = themeId !== 'matrix'
export const negPrefix = pkgId === 'ielts-core'
