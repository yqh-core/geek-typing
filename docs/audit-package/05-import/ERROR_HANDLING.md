# 导入错误处理（ERROR_HANDLING）

> 状态：🔄 混合（本文分节标注）
>
> ✅ **已有**：内容脚本链路的错误处理 —— 检测即报、`exit 1`、异常兜底、幂等设计、静默跳过有据可查
> 📐 **待建**：用户上传链路的错误处理 —— 仅有 3 个友好提示语，其余 10 类错误场景全部未处理
>
> 基线 commit：`4152eb2`　｜　实测日期：2026-09-27
> 证据来源：`scripts/content/*.mjs`、`src/lib/customBanks.ts`、`src/components/BankManager.tsx`、`src/lib/reviewStore.ts`

---

## 1. 一句话事实

**内容脚本的错误处理是「检测即报 + 退出码 + 异常兜底」三段式，且明确区分「交由人工决策」与「脚本自动处理」。**

**用户上传链路的错误处理几乎为零**：只有 3 个提示语（解析失败 / 读文件失败 / 导入成功），其余全部未覆盖。

`normalize.mjs:20-23` 是内容侧错误处理哲学的最佳表述（原文）：

> **只检测、不自动修（交人工决策）：**
> · 包内重复 normalized word（NFC + lowercase + 空白折叠后同 key ⇒ 大小写/空格差异会撞车）
> · 空 word / 空 translation（规范化后为空串）
> · 非法字段（白名单外的键，白名单 = word/translation/phonetic/definition）

---

## 2. ✅ 已有：内容脚本链路的错误处理

### 2.1 三段式结构

| 段 | 机制 | 实现 |
|---|---|---|
| ① 检测即报 | 逐包收集问题，分类打印（重复 / 空字段 / 非法字段） | `normalize.mjs:113-160` |
| ② 退出码 | 有阻塞性问题 → `exit 1`；仅格式差异 → 不退出，提示加 `--write` | `normalize.mjs:180-183`、`:26-27` |
| ③ 异常兜底 | `main().catch()` 捕获一切未预期异常 | 每个脚本末尾 |

`normalize.mjs:186`：

```js
main().catch((e) => { console.error('[content:normalize] 异常：', e.message); process.exit(1) })
```

四个脚本均有同样的兜底（`validate.mjs:427`、`build.mjs:214`、`list.mjs:59`），且**都带脚本名前缀**，便于 CI 日志定位。

### 2.2 退出码语义（实测）

| 脚本 | 情形 | 退出码 | 实现 |
|---|---|---|---|
| `normalize.mjs` | 存在重复词 / 空字段 / 非法字段 | `1` | `:180-183` |
| `normalize.mjs` | 仅格式差异（未加 `--write`） | `0`（提示加 `--write`） | `:174-175` |
| `normalize.mjs` | 未知包 id | `1` | `:88` |
| `normalize.mjs` | `content/vocabulary` 不存在 | `1` | `:84` |
| `validate.mjs` | 任一 FAIL | `1` | `:423` |
| `build.mjs` | `content/vocabulary` 不存在 | `1` | `:88` |
| `list.mjs` | `content/vocabulary` 不存在 / 异常 | `1` | `:17, :59` |

> ⚠️ **`normalize.mjs` 的退出码设计值得注意**（`:25-27` 注释）：
> **「存在重复词 / 空字段 / 非法字段 → exit 1（CI 可用）；仅格式差异不 exit 1，提示加 `--write`」**
> 也就是说「格式脏」与「数据脏」被区分对待 —— 前者可安全自动化，后者必须人工。这是一个有意的分界。

### 2.3 不可解析文件的处理

**每个解析点都有 try/catch，且失败后 `continue` 而非崩溃**：

`normalize.mjs:100-103`：

```js
try {
  words = JSON.parse(await readFile(file, 'utf8'))
} catch (e) { console.error(`▸ ${id}: words.json 不可解析：${e.message}`); blocked++; continue }
if (!Array.isArray(words)) { console.error(`▸ ${id}: words.json 不是数组`); blocked++; continue }
```

`validate.mjs:141-147`：

```js
try { manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8')) }
catch (e) { fail(`manifest.json 不可解析：${e.message}`); continue }
try { words = JSON.parse(await readFile(path.join(dir, 'words.json'), 'utf8')) }
catch (e) { fail(`words.json 不可解析：${e.message}`); continue }
```

**设计要点**：单包失败**不中断全库扫描** —— `continue` 保证其余包仍被检查，问题一次性全量暴露。

### 2.4 manifest 缺失时的降级处理

`normalize.mjs:106-111`：

```js
let stripHtml = true
try {
  const m = JSON.parse(await readFile(path.join(VOCAB_DIR, id, 'manifest.json'), 'utf8'))
  if (m?.normalize?.stripHtml === false) stripHtml = false
} catch { /* manifest 缺失/不可解析时按默认（剥离）处理，validate 会另行报错 */ }
```

**注释明确了分工**：normalize 遇 manifest 缺失**不报错、按默认处理**，把报错职责留给 validate（它的第 1/2 项专门查这个）。这是「不重复报错」的落实。

### 2.5 静默跳过 —— 但一定打印原因

**这是本项目最值得称赞的错误处理特征**：所有「跳过」都会打印可见的原因行，而不是悄悄放过。

| 跳过点 | 打印文案 | 行号 |
|---|---|---|
| 无 `relations.json` | `· 无 relations.json，跳过 relation 校验（V4.1-P0 尚不产出该文件）` | `validate.mjs:315` |
| 无 `manifest.assets` | `· manifest 无 assets 字段，跳过 asset 校验` | `validate.mjs:344` |
| 未知 offline 策略 | `· 策略一致性跳过 N 包（未知策略，不判通过也不判失败）` | `validate.mjs:413-415` |
| 代码词库关 HTML 剥离 | `· <id>: manifest.normalize.stripHtml=false → 跳过 HTML 剥离与实体解码（代码词库）` | `normalize.mjs:111` |

对应原则（`validate.mjs:275-276`）：**「能判的判死，判不了的如实说跳过，绝不用『假装通过』凑绿」**。

### 2.6 幂等作为「无变化」错误防线

`build.mjs` 的核心防御不是「处理错误」而是**「不产生假变化」**（`:110-120` 三条铁律）：

| 铁律 | 内容 | 行号 |
|---|---|---|
| 1 | 首次迁移（manifest 无 `contentHistory`）**不递增** —— 否则会凭空制造一次「内容变了」 | `:111-112` |
| 2 | 内容与上次一致 ⇒ revision/version/publishedAt/builtAt **一个字节都不改** —— 否则幂等被破坏 | `:113-115` |
| 3 | 内容确实变了 ⇒ 先查 history：命中（回滚）复用历史 version；未命中（新内容）revision/version 同步 +1 | `:116-120` |

幂等判据（`:192-194`）：

```js
// 幂等判据：canonical 序列化的语义比较（键序无关 / undefined 忽略），
// 不能用 JSON.stringify 直比 —— manifest 落盘会被 canonicalFile 重排键序。
const same = canonicalize(next) === canonicalize(m)
```

> **为什么这算错误处理**：如果幂等被破坏（每次 build 都「有变化」），`builtAt` 每次都会刷新 ⇒ 产生永无止境的「内容变更」伪信号 ⇒ 后续所有依赖版本号的逻辑（缓存失效、增量同步）全部失效。**防止静默的假变化，本身就是错误处理。**

### 2.7 checksum 漂移的处理

`validate.mjs:240-242`（第 15 项）：`contentChecksum` 必须等于 `sha256Canonical(words)`；不等则 FAIL 并给出**修复命令**：

```
✗ contentChecksum 漂移：manifest=xxx ≠ 实际 yyy → 运行 npm run content:build
```

**「错误信息必须给出下一步动作」是贯穿全部 20 项门禁的一致做法** —— 第 5/6/10/11/13/14/15/16/17 项的失败信息均以「→ 运行 npm run content:build 同步」或类似指引结尾。

---

## 3. 🔄 用户上传链路：现状与缺口

### 3.1 ✅ 已有：3 个提示语（全部实测）

| 场景 | 提示 | 实现 |
|---|---|---|
| 解析出 0 词 | `bank.parseFail` | `BankManager.tsx:44-47` |
| 文件读取失败（`.catch`） | `bank.readFail` | `BankManager.tsx:70` |
| 文件解析出 0 词 | `bank.fileFail` | `BankManager.tsx:67` |

```tsx
const doFile = (file: File) => {
  file
    .text()
    .then((txt) => {
      setRaw(txt)
      const words = parseWords(txt)
      if (words.length) { /* 落盘 */ }
      else { setMsg(t('bank.fileFail')) }        // ← 提示
    })
    .catch(() => setMsg(t('bank.readFail')))     // ← 提示
}
```

`parseWords` 自身的错误处理是**静默的**（`customBanks.ts:65-67`）：

```ts
} catch {
  return []      // ← JSON 非法的唯一处理：返回空数组，不说明原因
}
```

`parseWords` 的 `return []` 在 `BankManager.tsx:44` 表现为通用的 `bank.parseFail`，用户**无法知道是「JSON 语法错」还是「格式不符」**。

### 3.2 📐 待建：应处理的 10 类错误场景

需求文档与常规工程实践下，用户上传链路**应当**处理以下场景。**当前全部未处理**（除标 ✅ 者）：

| # | 场景 | 现状 | 后果 | 依据 |
|---|---|---|---|---|
| 1 | **空文件** | 🟡 间接覆盖 | `parseWords('')` → `text.trim()` 为空 → `return []`（`customBanks.ts:51-52`）→ `bank.parseFail` | 用户看到笼统提示 |
| 2 | **超大文件** | ❌ 无 | 无 size 判断 ⇒ 大文件整读入内存 + 可能 `QuotaExceededError` | `BankManager.tsx:56-71` 无 size 检查 |
| 3 | **乱码 / 错误编码** | ❌ 无 | `file.text()` 恒按 UTF-8（`:58`）；GBK 文件 → 乱码 → 词形正则全丢弃 → 提示「解析失败」 | 无 `TextDecoder` 探测 |
| 4 | **错误 JSON** | 🟡 静默 | `catch { return [] }`（`customBanks.ts:65-67`）—— 不告诉用户哪里错 | 无错误位置 |
| 5 | **字段缺失** | 🟡 部分 | `word` 缺失 → `''` → 被词形正则过滤掉（`:64`）；`translation` 缺失 → 空串后**保留** | 无「N 条缺释义」报告 |
| 6 | **重复条目** | ❌ 无 | 照收，无去重无提示 | 见 `DEDUPLICATION.md` §9 |
| 7 | **非法路径** | 🟡 低风险 | 不存在路径穿越问题（不落文件系统）；文件名仅用于词库显示名（`BankManager.tsx:63`） | 风险低但未显式防御 |
| 8 | **恶意文件** | ❌ 无 | 无 MIME 嗅探、无内容扫描、无体积上限 | 见 `10-security/*` |
| 9 | **错误 MIME** | ❌ 无 | 只看内容不看 MIME（`file.text()`）—— 实际上**这是相对安全的做法**，因为不信任 MIME | — |
| 10 | **localStorage 配额溢出** | ❌ 无 | `customBanks.ts:22` 裸 `setItem` **无 try/catch** ⇒ 抛未捕获异常 | 见 §3.3 |

### 3.3 特别提示：配额缺口（建议优先修复）

这是本文件发现的**唯一一处「同项目内强度不一致」**的错误处理：

| 模块 | 写入方式 | QuotaExceeded 处理 |
|---|---|---|
| `customBanks.ts:21-23`（用户词库） | `localStorage.setItem(KEY, JSON.stringify(banks))` | ❌ **无 try/catch** |
| `reviewStore.ts:64-96`（错题本） | 同 | ✅ **三轮熔断清洗**（详见 `06-learning/REVIEW.md`） |
| `memorizeStore.ts:35-39`（背单词） | 同 | 🟡 `try/catch` 但静默忽略 |
| `streak.ts:34-40`（打卡） | 同 | 🟡 `try/catch` 但静默忽略 |

`reviewStore.ts:64-96` 的熔断实现是四个模块中最完整的：

```js
function save(store: ReviewStore): SaveResult {
  const json = JSON.stringify(store)
  try {
    localStorage.setItem(KEY, json)
    return { ok: true, evicted: 0 }
  } catch (e) {
    if (!isQuotaError(e)) return { ok: false, evicted: 0 }
  }
  // 熔断：副本上做清洗，避免污染调用方持有的 state
  const working: ReviewStore = { ...store }
  let evicted = 0
  for (let round = 1; round <= QUOTA_ROUNDS; round++) { ... }   // QUOTA_ROUNDS = 3
  ...
}
```

而 `customBanks.ts` 的对应代码只有 3 行，且无任何保护：

```ts
function persist(banks: CustomBank[]) {
  localStorage.setItem(KEY, JSON.stringify(banks))   // ← 无 try/catch
}
```

`BankManager.tsx:42-54` 的 `doImport` 同样无 try/catch：

```tsx
const doImport = () => {
  const words = parseWords(raw)
  if (words.length === 0) { setMsg(t('bank.parseFail')); return }
  const next = saveCustomBank(name || `...`, words)   // ← 可能抛 QuotaExceededError
  ...
}
```

> **建议**（📐，非实测）：把 `reviewStore.ts` 的熔断逻辑抽为共用工具，或至少在 `customBanks.ts:21-23` 与 `BankManager.tsx:42-54` 加 `try/catch` + 明确提示「词库过大，本地存储不足」。这也应同步记入 `13-acceptance/KNOWN_ISSUES.md`。

---

## 4. 错误处理的风格一致性（横向对照）

| 维度 | 内容脚本（✅ 强） | 用户上传（📐 弱） |
|---|---|---|
| 是否区分「可自动修」与「需人工」 | ✅ 区分（格式 vs 数据） | ❌ 不区分 |
| 退出码 / 明确失败信号 | ✅ `exit 1` | ❌ 仅 UI 文案 |
| 错误信息是否含下一步动作 | ✅ 几乎每条都含 | ❌ 无 |
| 单点失败是否中断全流程 | ✅ 不中断（`continue`） | ❌ 单次导入即全部 |
| 是否有可见日志 | ✅ `console.error` 带前缀 | 🟡 无（仅 UI 文案） |
| 配额 / 资源耗尽 | N/A（Node 侧） | ❌ **裸 `setItem`** |
| 静默兜底是否留痕 | ✅ 一律打印跳过原因 | ❌ `catch { return [] }` 无原因 |

---

## 5. 结论

- **内容脚本的错误处理是一条完整、有原则的链路**：检测即报、区分可自动/需人工、`exit 1`、异常兜底、跳过必留痕、错误信息带修复命令、幂等防假变化。这在同类项目中属上乘。
- **用户上传链路是空的**：3 个提示语 + 1 个静默 `return []`。10 类应处理场景中，7 类完全未处理、3 类部分覆盖。
- **最具体的缺陷是配额**：`customBanks.ts:22` 裸 `setItem`，而同一项目的 `reviewStore.ts:64-96` 已有完整熔断 —— 修复成本极低（复用现有模式），建议优先。
- **规划建议**（📐）见 §3.2 与 §3.3，全部标注为建议而非事实。
