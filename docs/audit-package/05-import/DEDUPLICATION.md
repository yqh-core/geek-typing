# 去重（DEDUPLICATION）

> 状态：✅ 已有（实测）
>
> ✅ **已有**：内容层分级去重 —— 5 类判据（包内精确 / 包内归一化 / 跨包 ContentId / 来源重复 / 近似重复留白），有实现行号
> 📐 **待建**：用户上传链路的去重 —— 零实现（重复词照收）
>
> 基线 commit：`4152eb2`　｜　实测日期：2026-09-27
> 证据来源：`scripts/content/validate.mjs:16-23, 172-176, 275-310, 354-358`、`scripts/content/normalize.mjs:71-74, 138-143`、`content/README.md:506-516`

---

## 1. 一句话事实

**去重是分级的，且分级依据是「可判定性」而非「严重度」。**

核心原则（`validate.mjs:275-276` 原文）：

> 按「可判定性」分级：能判的判死，判不了的如实说跳过，**绝不用「假装通过」凑绿**。

**最重要的一条反常识结论**：**跨包同词是合法的、刻意支持的数据关系，不构成任何违规。**

`validate.mjs:6-8` 原文：

> 包内 duplicate word 检测（**跨包同词合法**：IELTS/CET/TOEFL 各有 abandon 是正常数据关系，是本平台刻意支持的能力，**任何「跨包词唯一」规则都是错误的**）

**实测**：全库 9346 词中 **2323 个跨包同名词**（如 `abandon` 同时在 ielts/cet4）。这些**全部合法**。

---

## 2. 五级去重判据总表

| 级 | 名称 | 判定 key | 是否 FAIL | 实现行号 | 实测状态 |
|---|---|---|---|---|---|
| **L1** | 包内 dup localId（精确词形） | `w.word` 原样 | ✅ FAIL | `validate.mjs:172-176` | 0 违规 |
| **L2** | 包内 dup **normalized** word | NFC + lowercase + 空白折叠 + trim | ✅ FAIL | `validate.mjs:282-292`；`normalize.mjs:138-143` | 0 违规 |
| **L3** | 跨包 dup ContentId | `${namespace}\|${normalized word}` 出现在 ≥2 包 | ✅ FAIL（兜底） | `validate.mjs:294-304, 354-358` | 0 违规 |
| **L4** | duplicate source origin | 同一 `origin` 在 `sources[]` 出现两次 | ✅ FAIL | `validate.mjs:306-310` | 0 违规 |
| **L5** | 近似重复（possible duplicate） | 无语义判据 | ❌ **不判、不删** | `content/README.md:631-632` | 刻意留白 |

---

## 3. L1：包内精确词形重复

`validate.mjs:172-176`：

```js
// 4. 包内重复词（跨包同词刻意允许，不做任何跨包唯一性约束）
const seen = new Set()
const dup = words.filter((w) => { const k = w?.word; if (seen.has(k)) return true; seen.add(k); return false })
if (dup.length === 0) ok(`无包内重复词条（${words.length} 词）`)
else fail(`包内重复词条 ${dup.length} 个：${dup.slice(0, 5).map((w) => w.word).join(', ')}...`)
```

判定用 **原始 `w.word`**（不做归一化）。所以 `Abandon` 与 `abandon` 在这一级**不算重复**，会落到 L2。

**实测**：10 个包全部 0 违规。

---

## 4. L2：包内归一化重复（大小写 / 空白差异撞车）

这是 L1 的补集 —— 大小写、空格、全角空格差异在这里才会被抓出来。

### 4.1 归一化 key 的实现

`validate.mjs:95-98`：

```js
/** 重复检测 key：NFC + lowercase + 空白折叠（含 \u00A0）。
 *  与第 4 项（精确词形）互补：大小写 / 空格差异在这里会撞车。 */
const WS_RE = /[\s\u00A0]+/g
const normKey = (raw) => String(raw ?? '').normalize('NFC').toLowerCase().replace(WS_RE, ' ').trim()
```

`normalize.mjs:71-74` 的 `dupKey()` 是**同一份逻辑的另一处实现**：

```js
/** 重复检测 key：NFC + lowercase + 空白折叠。大小写/空格差异 ⇒ 同一词 */
function dupKey(raw) {
  return String(raw ?? '').normalize('NFC').toLowerCase().replace(WS_RE, ' ').trim()
}
```

**实测撞车示例**（归一化后同 key ⇒ 判重复）：

| 词 A | 词 B | 归一化 key | 判定 |
|---|---|---|---|
| `Abandon` | `abandon` | `abandon` | ⚠️ 撞车 |
| `ice cream` | `ice\u00A0cream` | `ice cream` | ⚠️ 撞车（全角空格） |
| `well-known` | `well-known ` | `well-known` | ⚠️ 撞车（尾随空格） |
| `Abandon` | `abandonment` | 不同 | ✅ 合法 |

### 4.2 双处检测的原因

| 检测点 | 位置 | 时机 | 行为 |
|---|---|---|---|
| `normalize.mjs` | `:113-118, 138-143` | 落数据后、build 前 | **只报告**，提示需人工合并 → `exit 1`（`:180-183`） |
| `validate.mjs` | `:282-292` | CI / build 前置 | FAIL |

`normalize.mjs:153` 的提示文案明确了职责：

```
✗ 重复词（需人工合并/去重，脚本不代改）
```

**「脚本不代改」是刻意的**（`:20-23`）：规范化只收敛格式（空白、实体、标签），**删词/合并词是产品决策**，脚本不代做。

---

## 5. L3：跨包 duplicate ContentId（兜底回归）

**这是最容易被误解的一级。它不查「跨包同词」，它查「跨包同 ContentId」。**

### 5.1 判定 key 与逻辑

`validate.mjs:294-304`（收集）：

```js
//   (c) 跨包 duplicate ContentId：key = namespace + normalized localId。
//       只统计「同一个 key 出现在 ≥2 个包」，包内重复由 12(b) 负责，不在这里重复计数。
//       namespace 每包唯一（第 9 项）后理论上不可能撞车，这里作兜底回归检测，
//       结果在所有包循环结束后统一判定。
for (const w of words) {
  const k = normKey(w?.word)
  if (!k) continue
  const gk = `${ns ?? '?'}|${k}`
  if (!globalIds.has(gk)) globalIds.set(gk, new Set())
  globalIds.get(gk).add(id)
}
```

`validate.mjs:354-358`（全库扫描后统一判定）：

```js
const crossDups = [...globalIds.entries()].filter(([, packs]) => packs.size > 1)
  .map(([k, packs]) => `${k.split('|')[1]}（${[...packs].join(' ↔ ')}）`)
if (crossDups.length > 0) fail(`跨包 duplicate ContentId ${crossDups.length} 处：${crossDups.slice(0, 5).join('；')}`)
else ok(`跨包无 duplicate ContentId（全库 ${totalWords} 词扫描，namespace 唯一 ⇒ 兜底回归）`)
```

### 5.2 为什么它理论上是恒绿的

词级 ContentId 形态是 `content:word:<namespace>:<词形>` —— **localId 只有词形，不含包 id**。
因此：**只要两个包共用 namespace，同名词的 ContentId 就必然撞车**。

这也是门禁第 9 项（namespace 每包唯一）存在的全部理由（`validate.mjs:207-211`）：

> 9. namespace 每包唯一 —— 词级 ContentId 全局唯一的**充要条件**。
> （曾踩坑：cet4/toefl/ielts 共用 namespace `ecdict` → abandon 三包同 id。
>   由 V4.1 契约测试 `tests/content-query.mjs` 实测捕获，规则固化为 `${来源族}-${包 id}`。）

所以第 9 项守住后，L3 变成**兜底回归检测**（防止未来有人绕过第 9 项）。

### 5.3 ✅ 实测：跨包同词 = 合法

**这是本文件最重要的一条结论。**

| 事实 | 数值 | 来源 |
|---|---|---|
| 全库词条总数 | **9346** | `content:list` 实测 |
| 跨包同名词数 | **2323** | `docs/audit-package/13-acceptance/GAP_ANALYSIS.md:72` |
| 含大写字母的词条数 | **93**（如 `var wg sync.WaitGroup`；**非**「大小写敏感碰撞组」） | 同上 `:73` |
| L3 违规数 | **0** | `content:validate` 实测输出 |

**2323 个跨包同词不是违规，是刻意设计。** `content/README.md:101-102`：

> **③ 跨包同词是合法数据关系**（IELTS/CET/TOEFL 各有 abandon），消歧靠 namespace，
> *不是*靠禁止同词。任何「跨包词唯一」的约束都是错的。

**但这条设计有一个已知的代价**（记入 `KNOWN_ISSUES` / `GAP_ANALYSIS` A-4）：

> 旧 Learning key 是裸 `word`，不是 `bankId + word` ⇒ 用户「以前学过 abandon」在迁移后会指向不确定的包。

也就是说：**内容层用 namespace 消歧是完备的，但学习层还没跟上** —— 详见 `06-learning/LEARNING_ENGINE.md` §5。

---

## 6. L4：duplicate source

`validate.mjs:306-310`：

```js
//   (d) duplicate source：同一 origin 在 sources[] 里出现两次
const origins = sources.map((s) => s?.origin)
const dupOrigin = [...new Set(origins.filter((o, i) => origins.indexOf(o) !== i))]
if (dupOrigin.length === 0) ok(`无 duplicate source（${origins.length} 条来源）`)
else fail(`duplicate source origin：${dupOrigin.join(', ')}`)
```

**实测**：10 个包均为单来源（1 条），全部 0 违规。

> ⚠️ 这一级用 `origin` 字符串精确比较。由于 `origin` 是**无约束自由文本**（如 `"ECDICT"` / `"curated in-repo (前端词库)"`），若同一来源被写成两种拼写（`"ECDICT"` vs `"ecdict"`），本项**不会**发现。这一点与门禁第 7 项同源（后者被 `GAP_ANALYSIS.md:173` 记为 E-10：用 `origin.includes('curated')` 判来源类型不可靠）。

---

## 7. L5：近似重复 —— 刻意不判

`content/README.md:631-632` 原文：

> **近似重复（possible duplicate，如 `car` vs `automobile`）**：语义相近 ≠ 数据重复，
> 门禁不判，也**禁止自动删**；只允许人工 review 后决定。

**这是正确的保守策略**：语义相似度检测需要模型或同义词库，误判会导致真实数据被删。本项目选择**不判**并明确写出理由，而不是用一个假阳性高的规则充数。

**实测**：无任何近似重复检测代码。

---

## 8. 去重与规范化/构建的关系

```
words.json（含脏数据）
   │
   ├─▶ normalize.mjs ── 规范化格式 + 报告 L2 重复/空字段/非法字段（不改数据）──▶ exit 1
   │
   └─▶ validate.mjs  ── 20 项门禁，含 L1/L2/L3/L4 ──▶ exit 1
                     │
                     └─▶ build.mjs ── 派生 checksum（内容身份，与去重互补）
```

**checksum 与去重是两个不同维度的「同一性」**：

| 机制 | 回答的问题 | 依据 |
|---|---|---|
| checksum（`canonical.mjs`） | 「这是不是**同一份内容**（整包）」 | 数据语义的 SHA-256 |
| 去重（本文件） | 「**包内/跨包**有没有不该重复的条目」 | 归一化 key 比较 |

**注意**：`sha256Canonical` 有一条铁律 —— **数组绝不重排、绝不去重**（`canonical.mjs:11-14, 57`）。这意味着 checksum **不承担去重职责**；它只回答「内容是否变化」，哪怕变化是「多了一个重复词」。

---

## 9. 📐 待建：用户上传去重

> 以下全部为**建议**，非实测事实。

`customBanks.ts` 的 `parseWords()`（`:50-84`）**没有任何去重**。用户粘贴 100 行相同的 `abandon = 放弃`，会得到 100 条词条。

| 应做 | 现状 | 建议 |
|---|---|---|
| 导入前报告重复 | 无 | 复用 `normKey` 逻辑（`content/README.md:95-98` 已有实现），提示「N 条重复，是否合并」 |
| 跨自定义词库去重 | 无 | 建议不做（不同词库同名是合法的，同 L3 逻辑） |
| 与内置词库去重 | 无 | 建议不做，但可在 UI 标注「此词已在 ielts 包中」 |
| 空词 / 空释义 | 无 | 建议至少拒绝空 word |

---

## 10. 结论

- **去重是分级实现的**：L1 精确 / L2 归一化 / L3 跨包 ContentId / L4 来源 —— 4 级 FAIL，L5 近似重复刻意留白。
- **「跨包同词合法」是本项目的核心数据立场**，实测 2323 个跨包同名词全部合规。审计时若按「跨包词唯一」标准检查，会得出错误的 2323 项违规。
- **L3 是兜底回归检测**，其成立依赖门禁第 9 项（namespace 每包唯一）—— 后者是本项目从一次真实踩坑（三包 namespace 撞车）中固化下来的规则。
- **用户上传零去重**，且 `parseWords` 无 dedup 逻辑 —— 与内容层的严谨形成明显落差。
