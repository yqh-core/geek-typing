# 上传安全（Upload Security，待建）

> 状态：📐 待建
> 已有断言数：**0**
> 实测结论：**不存在服务端上传能力。唯一"上传"是浏览器内粘贴文本到自定义词库，且只存 localStorage，纯文本**

---

## 1. 先澄清：这不是传统意义上的"上传"

审计资料包里这一节容易产生误解，先把边界划清：

| 传统上传（本项目**没有**） | 本项目的"上传" |
|---|---|
| 用户 → 服务端 | 用户 → **浏览器 localStorage** |
| 需要存储桶 / 文件系统 | 无存储服务 |
| 需要 MIME 校验 / 病毒扫描 | 无文件概念，只有字符串 |
| 需要防 webshell / 路径穿越 | 无文件系统访问 |
| 需要配额 / 限流服务端 | 浏览器原生配额 |
| 有服务端解析风险 | **零服务端解析** |

**本项目不存在任何"数据离开浏览器"的路径。** 这一节讨论的是一个**纯客户端的数据入口**。

**但"纯客户端"不等于"无风险"** —— 见 §4。

---

## 2. 唯一的数据入口：自定义词库

### 2.1 实现文件

`src/lib/customBanks.ts`（**93 行**）

### 2.2 存储

```js
const KEY = 'gt.customBanks.v1'

function persist(banks: CustomBank[]) {
  localStorage.setItem(KEY, JSON.stringify(banks))
}
```

| 项 | 值 |
|---|---|
| 存储位置 | **localStorage**（仅本机、仅本浏览器） |
| 键名 | `gt.customBanks.v1`（**有版本后缀，好的做法**） |
| 是否需要登录 | ❌ 不需要 |
| 是否上传服务端 | ❌ **不上传** |
| 是否跨设备同步 | ❌ **不同步** |

### 2.3 数据结构

```ts
interface CustomBank {
  id: string        // `custom-${Date.now().toString(36)}`
  name: string      // 用户输入
  words: WordItem[] // 解析后的词条
  createdAt: number
}
```

### 2.4 三种输入格式（实测 `parseWords`，`:50-84`）

| 格式 | 示例 | 解析路径 |
|---|---|---|
| **JSON** | `[{"word":"xxx","translation":"yyy"}, ...]` | `JSON.parse` |
| **每行一个** | `word = translation` / `word,translation` / `word:translation` / `word：translation` / `word | translation` / Tab 分隔 / 两个以上空格分隔 | 正则逐行 |
| **纯英文单词** | `abandon` | 无释义 |

**分隔符实测**（`:75`）：

```js
/^([A-Za-z][A-Za-z'\- ]*?)\s*(?:=|,|\||:|：|\t| {2,})\s*(.+)$/
```

支持 `=`、`,`、`|`、`:`（半角）、`：`（全角）、Tab、两个以上空格 —— **考虑了中英文标点差异，细节到位**。

---

## 3. 现有校验（实测）

### 3.1 `word` 字段：有字符白名单 ✅

实测两处（`:64` 与 `:83`）：

```js
.filter((w: WordItem) => /^[A-Za-z][A-Za-z'\- ]*$/.test(w.word))
```

**白名单字符集**：

| 允许 | 说明 |
|---|---|
| `A-Za-z` | 英文字母 |
| `'` | 撇号（`don't`） |
| `-` | 连字符（`well-known`） |
| ` ` | 空格（`a b`） |

**拒绝的恶意输入**：

| 输入 | 拒绝原因 |
|---|---|
| `<script>alert(1)</script>` | 含 `<` `>` |
| `<img src=x onerror=alert(1)>` | 含 `<` `>` `=` `(` `)` |
| `javascript:alert(1)` | 含 `:` `(` `)` |
| `" onmouseover="alert(1)` | 含 `"` `=` `(` `)` |
| `\u202E evil` | 含非 ASCII 控制字符 |

**这是一个有效的针对性防御** —— 把 `word` 限制在"不可能构成 HTML/JS 语法"的字符集内。

### 3.2 `translation` 字段：**无校验** ⚠️

实测（`:62`）：

```js
translation: (o.translation ?? o.meaning ?? '').trim()
```

**只有 `.trim()`。没有字符白名单、没有长度上限。**

⇒ `translation` 可以包含**任意字符**，包括完整的 HTML 标签、事件处理器、脚本内容。

### 3.3 `name`（词库名）：**无校验** ⚠️

实测（`:29`）：

```js
name: name.trim() || '我的词库',
```

同样只有 `.trim()` 与空值兜底。

### 3.4 `words` 数组：**无长度/数量上限** ⚠️

无 `maxLength`、无 `maxWords`、无总字节检查。

---

## 4. 当前为什么是安全的（以及为什么这不够）

### 4.1 唯一的防御层：React 自动转义

**实测确认：全仓库零 `innerHTML` / `dangerouslySetInnerHTML`**：

```
$ grep -rn "innerHTML\|dangerouslySetInnerHTML" src/
(以上为全部命中)          ← 零命中
```

**React 默认用 `textContent` 语义渲染文本**，所以：

```jsx
<span>{translation}</span>
// translation = "<script>alert(1)</script>"
// 渲染结果：页面上显示字面的 "<script>alert(1)</script>"
// 不会执行
```

**所以当前 `translation` 的任意字符是安全的。**

### 4.2 但这是一个**单层防线**

| 字段 | 防御层数 | 具体 |
|---|---|---|
| `word` | **2 层** | ① 字符白名单 ② React 转义 |
| `translation` | **1 层** | 仅 React 转义 |
| `name` | **1 层** | 仅 React 转义 |

**第 1 层（React 转义）没有任何断言守着。**

### 4.3 风险场景（具体化）

| # | 场景 | 后果 |
|---|---|---|
| 1 | 某天为渲染富文本释义引入 markdown 渲染 | `translation` 里的 `<script>` 生效 ⇒ **存储型 XSS** |
| 2 | 某天为性能优化把组件改成 `innerHTML` | 同上 |
| 3 | 引入一个用 `innerHTML` 的第三方组件（如高亮库） | 同上 |
| 4 | 用户粘贴了自己从不可信来源复制的"词库数据" | 若上面任一发生，**用户被自己的数据攻击** |
| 5 | localStorage 被其他方式篡改（浏览器扩展、开发者工具、XSS） | 绕过 `parseWords` 的白名单 ⇒ **`word` 的白名单失效** |

**第 5 条是关键**：`parseWords` 的白名单**只在解析时生效**。`loadCustomBanks()` 是：

```js
export function loadCustomBanks(): CustomBank[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as CustomBank[]) : []
  } catch {
    return []
  }
}
```

**它只做 `JSON.parse`，不做任何字段校验。** 即：

- 写入路径有白名单 ✅
- **读取路径零校验** ❌

**只要 localStorage 里被塞了 `{"word":"<img src=x onerror=alert(1)>"}`，它就会直接进入渲染流程。**

这条路径**不需要经过 `parseWords`**。攻击方式：浏览器扩展、开发者工具、或任何能执行脚本的途径（包括上一场景的 XSS 本身 —— 这就形成了自我放大）。

### 4.4 结论

| 项 | 状态 |
|---|---|
| 当前是否可被 XSS | **否**（依赖零 `innerHTML`） |
| 是否有主动防御 | **部分**（仅 `word` 白名单，且仅在写入路径） |
| 防线是否有测试 | **否**（零断言） |
| 防线是否是单层 | **是**（React 转义是唯一的兜底） |

**⇒ 这是一个"当前安全但脆弱"的状态。** 它的安全性取决于一个**全仓库的代码约定**（不能用 `innerHTML`），而这个约定**没有任何自动化检查守着**。

---

## 5. 待建测试清单

详见 `09-testing/SECURITY_TEST.md` §3.3。此处按"上传"视角重列：

### 5.1 XSS 负例（P0）

| # | 输入 | 注入位置 | 期望 |
|---|---|---|---|
| U-1 | `<img src=x onerror=alert(1)>` | `word` | 被白名单拒绝 |
| U-2 | `<script>alert(1)</script>` | `word` | 被白名单拒绝 |
| U-3 | `javascript:alert(1)` | `word` | 被白名单拒绝 |
| U-4 | `<img src=x onerror=alert(1)>` | **`translation`** | **原样显示为文本**（白名单拦不住） |
| U-5 | `<script>alert(1)</script>` | **`translation`** | **原样显示为文本** |
| U-6 | `<svg/onload=alert(1)>` | **`translation`** | **原样显示为文本** |
| U-7 | `<img src=x onerror=alert(1)>` | **`name`**（词库名） | **原样显示为文本** |
| U-8 | `<script>alert(1)</script>` | **localStorage 直接注入** ⭐ | **不执行**（绕过白名单的关键路径） |
| U-9 | `{"word":"<img src=x onerror=alert(1)>"}` | localStorage 直接注入 | **不执行**（**证明写入路径的白名单不是唯一防线**） |
| U-10 | `\u202E` + 文本 | `translation` | UI 不反向 |
| U-11 | 10000 字符 `translation` | `translation` | 不崩、有截断或正确处理 |
| U-12 | 含 `\u0000` | 任意字段 | 不破坏 DOM |

**U-8 / U-9 是最高价值的**：它们是唯一能验证"**读取路径也要有防御**"的用例。如果这两条通过，说明 React 转义确实在兜底；如果哪天引入了 `innerHTML`，这两条会立刻失败。

### 5.2 数据健壮性负例（P1）

| # | 输入 | 期望 |
|---|---|---|
| U-13 | 非法 JSON（`[{,`） | `parseWords` 返回 `[]`，不抛异常 |
| U-14 | 超大 JSON（10 MB） | 有上限或优雅失败，不卡死 |
| U-15 | 100000 行文本 | 有上限或分块处理 |
| U-16 | 深度嵌套对象 | 不崩、不栈溢出 |
| U-17 | `{"words": "not-an-array"}` | 不崩（实测 `:57` 的 `?? []` 有兜底，但无断言） |
| U-18 | 数组元素是 `null` / 数字 / 嵌套数组 | 不崩 |
| U-19 | localStorage 里存非数组（`"string"`） | `loadCustomBanks` 返回 `[]`（实测有 `try/catch`，但**类型不匹配不会抛**，会返回一个字符串） |
| U-20 | localStorage 写满（配额耗尽） | 熔断生效、有用户反馈 |

**U-19 是一个具体的实现细节**：`loadCustomBanks` 的 `try/catch` 能捕获 `JSON.parse` 异常，但**不能捕获"解析成功但类型不对"**。若 localStorage 存的是 `"hello"`（合法 JSON 字符串），`JSON.parse` 返回 `"hello"`，函数会返回一个字符串而不是数组 ⇒ 调用方 `.filter()` 会崩。

**当前无断言。**

### 5.3 资源耗尽

| # | 场景 | 期望 |
|---|---|---|
| U-21 | `words` 数组 100 万条 | 不崩、有上限或分片 |
| U-22 | 单条 `translation` 10 MB | 有上限 |
| U-23 | 连续保存 1000 个词库 | 配额熔断（**已有部分覆盖**：`tests/e2e.mjs:930`【13】批8 Quota 熔断） |
| U-24 | 粘贴操作导致主线程阻塞 | 不阻塞超过 X ms |

**U-24 与性能相关**：`parseWords` 是同步函数，在超大输入时会阻塞主线程（打字产品的主线程阻塞 = 输入卡顿，直接影响核心体验）。

---

## 6. 待建防御建议

### 6.1 补齐 `translation` / `name` 的校验

**不能像 `word` 那样用字符白名单** —— 释义必须允许中文、标点、括号等。建议：

| 措施 | 说明 |
|---|---|
| 长度上限（如 `word` 100 字符、`translation` 500 字符、`name` 50 字符） | 防资源耗尽 |
| 剥离控制字符（`\u0000`~`\u001F` 除 `\n` `\t`、`\u202A`~`\u202E`） | 防 UI 破坏 |
| **保持"渲染层禁止 `innerHTML`"的约定，并用 lint 规则守住** | 这是最根本的一条 |

### 6.2 在读取路径也做校验

**这是最重要的建议。** `loadCustomBanks()` 当前只 `JSON.parse`，建议加：

```ts
// 概念示意
function isValidBank(b: unknown): b is CustomBank {
  if (!b || typeof b !== 'object') return false
  const o = b as Record<string, unknown>
  return typeof o.id === 'string'
    && typeof o.name === 'string'
    && Array.isArray(o.words)
    && o.words.every(w => w && typeof w === 'object'
        && typeof (w as any).word === 'string')
}
```

**理由**：写入路径的白名单只在"用户通过 UI 输入"时生效。**localStorage 是可被外部修改的**（扩展、工具、其他 XSS）。读取路径校验是唯一能覆盖这条路径的防御。

### 6.3 加 lint 规则禁 `innerHTML`

这是**真正的根因防御**。当前靠"全仓库零 `innerHTML`"这个事实，但没有任何机制保证它继续成立。

`oxlint` 是否支持 `no-dangerously-set-inner-html` 类规则需实测确认（`package.json` 里是 `oxlint ^1.81.0`）。若不支持，可用自定义脚本扫描。

### 6.4 加 CSP

即使有 XSS，严格 CSP（`script-src 'self'`）也能阻止 `<script>` 执行（**但阻止不了 `<img onerror>` 类的 inline 事件处理器**，除非配合 `'unsafe-inline'` 的排除）。

⇒ **CSP 是必要的第二道防线，但不能替代渲染层的正确性。** 详见 `10-security/SECURITY.md` §2.4。

### 6.5 配额耗尽要有用户反馈

对应 `UX-002` 的同类问题：加载/保存失败时应当有可见提示。

---

## 7. 优先级建议

| 优先级 | 事项 | 成本 | 理由 |
|---|---|---|---|
| 🔴 **P0** | **U-8 / U-9（localStorage 注入不执行）** | 2 条断言 | 唯一能验证"读取路径有兜底"的用例 |
| 🔴 **P0** | **U-4~U-7（`translation` / `name` 注入）** | 4 条断言 | 这两个字段无白名单，靠唯一一层防御 |
| 🔴 **P0** | **禁 `innerHTML` 的自动化检查** | 1 条 lint 或 1 个脚本 | **根因防御**。当前靠约定，无机制 |
| 🟠 P1 | `loadCustomBanks()` 加字段校验 | 少量代码 | 读取路径当前零校验 |
| 🟠 P1 | 长度上限（word / translation / name / words 数量） | 少量代码 | 防资源耗尽（U-21~U-24） |
| 🟠 P1 | U-19（localStorage 存非数组不崩） | 1 条断言 | 一个具体的现存 bug |
| 🟡 P2 | 剥离控制字符 | 少量代码 | 防 UI 破坏（U-10/U-12） |
| 🟡 P2 | 配额耗尽用户反馈 | 少量代码 | 同 `UX-002` |
| ⚪ P3 | 自定义词库导出/导入能力 | 功能 | `exportBanksAsJson` 已存在，导入未闭环 |

---

## 8. 与其他文档的关系

- 整体安全态势与响应头：`10-security/SECURITY.md`
- XSS / SW / 存储安全测试清单：`09-testing/SECURITY_TEST.md`
- 自定义词库实现细节：`src/lib/customBanks.ts`（93 行）
- SW 缓存防御：`12-infrastructure/OFFLINE.md` §2
- 配额熔断现有覆盖：`tests/e2e.mjs:930`【13】批8

---

## 9. 一句话总结给审计方

**不存在服务端上传能力，唯一的数据入口是浏览器内粘贴文本到自定义词库（`src/lib/customBanks.ts`，93 行），只存 localStorage，纯文本，零服务端解析。因此路径穿越、恶意文件、MIME 欺骗、服务端配额攻击这一整类风险都不存在。真实的风险是 XSS：`word` 字段有字符白名单（只允许英文字母、撇号、连字符、空格，能拦住全部 HTML/JS 语法），但 `translation` 与词库名 `name` 没有白名单，只靠"全仓库零 `innerHTML` + React 自动转义"这一层兜底——而这一层零断言守着。更关键的是白名单只在写入路径生效，`loadCustomBanks()` 读取时只做 `JSON.parse` 不做字段校验，所以直接改 localStorage 可以绕过白名单。P0 修复是三件事：加 localStorage 注入不执行的断言、加 `translation`/`name` 的注入断言、加"禁止 `innerHTML`"的自动化检查（这才是根因防御）。**
