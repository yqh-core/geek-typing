/**
 * 控制字符判定（C0: U+0000–U+001F + DEL U+007F）在 **JS 侧的唯一解析入口**。
 *
 * 背景：三处实现（content.ts / asset-rules.mjs / normalize.mjs）都要判控制字符，
 * 而它们分属两层（TS 运行时 / Node 脚本），不能直接互相 import。此前各写一份
 * `[\u0000-\u001F\u007F]`，于是：
 *   - oxlint 的 `no-control-regex` 对**字面量**和 `new RegExp('[\\u0000-...]')` 都会报
 *     （后者会被常量折叠），3 条 warning 拆不掉；
 *   - 三份规则各改各的，迟早改出偏差 —— 而控制字符判错会直接动到 content 的 id。
 *
 * 因此把判定收敛到本文件，三处共用；TS 侧的镜像是
 * `src/core/content/model/content.ts` 的 `isControlChar`，**改一边必须同步另一边**。
 *
 * 为什么走**码点判断**而不是正则：
 *   - `\p{Cc}` 不行：它含 U+0080–U+009F（C1 段），多吃出去的那 32 个字符不属于原集合；
 *   - 正则字面量会命中 no-control-regex；换成 RegExp 构造器同样报（oxlint 常量折叠）；
 *   - 码点判断既无正则可报，语义也严格等于原集合。
 */

/** 单个字符是否为控制字符（C0 + DEL）。 */
export function isControlChar(ch) {
  const cp = ch.codePointAt(0) ?? 0
  return cp <= 0x1f || cp === 0x7f
}

/** 串内是否含控制字符。等价于旧写法的 `/[\u0000-\u001F\u007F]/.test(s)`。 */
export function hasControlChar(s) {
  return [...s].some(isControlChar)
}

/**
 * 删除串内全部控制字符。
 * 与旧写法的 `s.replace(/[\u0000-\u001F\u007F]/g, '')` **逐字符等价**：
 * 正则按 UTF-16 code unit 匹配，这里按码点迭代 —— 代理对被拆成两个代理项后各自
 * 因码点 > 0x1F 而保留，join 回来还是原字符； lone surrogate 同理保留。
 */
export function stripControlChars(s) {
  return [...s].filter((ch) => !isControlChar(ch)).join('')
}
