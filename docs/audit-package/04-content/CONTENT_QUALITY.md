# 内容质量（Content Quality）实测

> 状态：🔄 混合（已有：字段级统计 + 结构门禁；待建：质量评分体系、内容正确性校验、覆盖率目标与门禁）
>
> 本文全部数字**由实测得出**：遍历 `content/vocabulary/*/words.json` 与 `manifest.json` 重算，未采用二手统计。
> 凡与既有统计文档不一致处，已在 §7 逐条列出（含一处**既有统计文档自身的内部矛盾**）。

---

## 1. 结论速览

| 维度 | 实测结果 | 状态 |
|---|---|---|
| 全库词条数 | **9346** | — |
| 全库出现的不同词条字段数 | **4**（`word` / `translation` / `phonetic` / `definition`） | ✅ 与契约白名单一致但只用了一半 |
| 全库唯一词形数 | **6713**（9346 − 6713 = **2633** 条重复词条） | — |
| 出现在 >1 个包里的词形 | **2323 个**（涉及 **4956** 条词条） | — |
| 含大写字母的词条数 | **93 条**（多为 go-code/ts-code/frontend 代码行，如 `var wg sync.WaitGroup`） | ⚠️ 见下方口径说明 |
| 词条必填字段覆盖（`word` / `translation`） | **100% / 100%** | ✅ |
| `definition` 覆盖 | **9144 / 9346 = 97.84%** | ⚠️ 5 包完全无此字段 |
| `phonetic` 覆盖 | **9076 / 9346 = 97.11%** | ⚠️ 5 包完全无此字段 |
| `partOfSpeech` 覆盖 | **0 / 9346 = 0%**（审计时点） | ❌ 白名单有、数据中零出现 ⇒ **P1.6-E 已移除该字段**，不再计入契约 |
| 只有 2 个字段（`word`+`translation`）的包 | **5 个**（ai-core / cloud-native / frontend / go-code / ts-code） | ⚠️ |
| 内容正确性校验（释义是否准确、音标是否规范） | **无任何实现** | 📐 |
| 质量评分 / 质量门禁 | **无任何实现** | 📐 |
| 覆盖率目标（如 CET-4 需 ≥ N 词） | **无任何实现** | 📐 |
| 已知缺陷（空 `definition`） | **9 条**（ielts 1 条 + toefl 8 条） | ⚠️ 门禁未拦 |

**一句话**：质量管控目前是**结构质量**（字段在不在、格式对不对、checksum 稳不稳），**不是内容质量**（释义准不准、覆盖够不够、音标对不对）。后者的实现量为零。

> ⚠️ **「93」的口径说明（易误读）**：**93 条**指「**词条中含大写字母的条数**」（全库 9346 条中）。
> 它**不等于**「大小写敏感碰撞组数」—— 实测「**仅大小写不同、其余完全相同**」的词形碰撞组 = **0 组**
> （不存在「某词的小写形态与大写形态在同一库并存」这类情况，例如 `transformer` 只在 ai-core 出现一次，
> 无大写版本并存）。因此多份文档中「以某个大小写变体对举」的举例是**错误**的，已全资料包改正。
> 相关条目：`KNOWN_ISSUES.md#CONTENT-006`、`GAP_ANALYSIS.md#A-4`。

---

## 2. 规模与字段分布（实测）

### 2.1 逐包字段覆盖率

| 包 | 词条数 | `word` | `translation` | `phonetic` | `definition` | phonetic 率 | definition 率 |
|---|---|---|---|---|---|---|---|
| ai-core | 43 | 43 | 43 | 0 | 0 | 0.00% | 0.00% |
| cet4 | 84 | 84 | 84 | 84 | 84 | 100.00% | 100.00% |
| cet6 | 69 | 69 | 69 | 69 | 69 | 100.00% | 100.00% |
| cloud-native | 30 | 30 | 30 | 0 | 0 | 0.00% | 0.00% |
| frontend | 20 | 20 | 20 | 0 | 0 | 0.00% | 0.00% |
| go-code | 50 | 50 | 50 | 0 | 0 | 0.00% | 0.00% |
| ielts | 3000 | 3000 | 3000 | 2986 | 2999 | 99.53% | 99.97% |
| kaoyan | 3000 | 3000 | 3000 | 2994 | 3000 | 99.80% | 100.00% |
| toefl | 3000 | 3000 | 3000 | 2943 | 2992 | 98.10% | 99.73% |
| ts-code | 50 | 50 | 50 | 0 | 0 | 0.00% | 0.00% |
| **全库合计** | **9346** | **9346** | **9346** | **9076** | **9144** | **97.11%** | **97.84%** |

判定口径：该 key 存在，且值为**非空字符串**（`""` 与纯空白视为缺失）。分母为该包 `words.json` 实际数组长度，非 manifest 声明值。

### 2.2 逐包实际出现的字段集合

| 包 | 词条中出现的所有 key |
|---|---|
| ai-core | `word, translation` |
| cet4 | `word, translation, phonetic, definition` |
| cet6 | `word, translation, phonetic, definition` |
| cloud-native | `word, translation` |
| frontend | `word, translation` |
| go-code | `word, translation` |
| ielts | `word, translation, phonetic, definition` |
| kaoyan | `word, translation, phonetic, definition` |
| toefl | `word, translation, phonetic, definition` |
| ts-code | `word, translation` |

**只有两种字段组合**，无第三种。（审计时点）没有包使用 `partOfSpeech`；该字段已于 **P1.6-E** 从契约移除。

### 2.3 全库字段汇总

| 字段 | 全库出现条数 | 占全库词条比例 | 覆盖包数 | 契约必填性 |
|---|---|---|---|---|
| `word` | 9346 | 100.00% | 10 / 10 | 必填 |
| `translation` | 9346 | 100.00% | 10 / 10 | 必填 |
| `definition` | 9144 | 97.84% | 5 / 10 | 可选 |
| `phonetic` | 9076 | 97.11% | 5 / 10 | 可选 |
| `partOfSpeech` | 0 | 0.00% | 0 / 10 | ~~可选~~ **P1.6-E 已移除** |

契约侧字段白名单见 `scripts/content/normalize.mjs:46`：

```js
const FIELD_WHITELIST = ['word', 'translation', 'phonetic', 'definition']   // P1.6-E：移除 partOfSpeech
```

实测：审计时点白名单 5 个字段中**只出现了 4 个**，`partOfSpeech` 是**已声明但零数据**的空壳 ——
**P1.6-E 已把它从白名单移除**，现在白名单 4 个字段与数据实际用到的 4 个字段**一一对齐**。

另：`scripts/content/normalize.mjs:48` 的 `TEXT_FIELDS = ['word', 'translation', 'phonetic', 'definition']`
是参与文本规范化的字段集合 —— P1.6-E 后与白名单**完全相同**（原差别是「`partOfSpeech` 是枚举型不做文本清洗」，该字段已不存在）。

---

## 3. 词条级覆盖形态（实测）

### 3.1 phonetic 缺失分布

| 包 | `phonetic` 键缺失 | `phonetic` 为空串 |
|---|---|---|
| ai-core | 43 | 0 |
| cet4 | 0 | 0 |
| cet6 | 0 | 0 |
| cloud-native | 30 | 0 |
| frontend | 20 | 0 |
| go-code | 50 | 0 |
| ielts | 14 | 0 |
| kaoyan | 6 | 0 |
| toefl | 57 | 0 |
| ts-code | 50 | 0 |
| **合计** | **270** | **0** |

两种缺失形态不同，含义不同：

- **键缺失（270 条）**：字段根本没写。其中 193 条来自 5 个「只有 2 字段」的包（43+30+20+50+50），另 77 条来自三个大词库的零星缺失（ielts 14 / kaoyan 6 / toefl 57）。
- **空串（0 条）**：`phonetic` 键存在但值为 `""`。**实测为 0** —— 即音标字段虽不完整，但**没有「写了但写空」的情形**。

`definition` 的情况相反（见 §3.2）：缺失与空串**同时存在**。

### 3.2 definition 缺失与空串分布（关键发现）

| 包 | `definition` 键缺失 | `definition` 为空串 |
|---|---|---|
| ai-core | 43 | 0 |
| cet4 | 0 | 0 |
| cet6 | 0 | 0 |
| cloud-native | 30 | 0 |
| frontend | 20 | 0 |
| go-code | 50 | 0 |
| ielts | 0 | **1** |
| kaoyan | 0 | 0 |
| toefl | 0 | **8** |
| ts-code | 50 | 0 |
| **合计** | **193** | **9** |

**全库 9 条空字符串 `definition`**（逐条列出）：

| # | 包 | 包内序号 | 词形 | 其余字段 |
|---|---|---|---|---|
| 1 | ielts | #9 | `helpline` | translation=`n. 热线服务电话`，phonetic=`ˈhelplaɪn` |
| 2 | toefl | #41 | `supercontinent` | — |
| 3 | toefl | #64 | `springwater` | — |
| 4 | toefl | #126 | `geomagnetic` | — |
| 5 | toefl | #226 | `suburbanization` | — |
| 6 | toefl | #251 | `assistantship` | — |
| 7 | toefl | #287 | `survivability` | — |
| 8 | toefl | #433 | `urbanism` | — |
| 9 | toefl | #460 | `urbanite` | — |

`helpline` 一条已被既有缺陷清单记录（`docs/audit-package/13-acceptance/KNOWN_ISSUES.md:27` BUG-001，`:31` 现象描述「ielts 包第 9 条 `helpline` 的 `definition` 为 `""`（空串，非缺失）」）。

**本文新发现**：同类问题在 **toefl 包另有 8 条**，既有清单未记录。合计 9 条，是已知记录的 **9 倍**。

### 3.3 为什么这 9 条能通过全部门禁（根因）

`scripts/content/normalize.mjs:135-137` 的空字段检查只覆盖两个字段：

```js
// 空字段（规范化后为空串，含原值缺失/纯空白/纯标签）
if (!out.word) empties.push(`#${i} word 为空（原值："${String(item?.word ?? '').slice(0, 20)}"）`)
if (!out.translation) empties.push(`#${i} translation 为空（word=${out.word || '?'}）`)
```

**只查 `word` 与 `translation`，不查 `phonetic` 与 `definition`**。

推论：

- `definition: ""` 是**合法通过**的（`definition` 不在检查列表，且作为可选字段在缺失时也不报错）。
- 若哪天真出现 `phonetic: ""`，同样通过。
- 因此这 9 条不是「门禁漏了」，而是「**门禁从未设计检查这两个字段**」。

`normalize.mjs:162` 判定：`if (dups.length || empties.length || illegals.length) blocked++` —— 因为 `empties` 为空，这 9 条不会使任何包进入 `blocked` 状态，`node scripts/content/normalize.mjs` 返回 exit 0。

**建议方向（📐）**：把空值检查从「硬编码两个字段」改为「遍历白名单中的可空字段」，或引入分级——`word`/`translation` 为空 ⇒ FAIL；`phonetic`/`definition` 为空 ⇒ WARN 并输出清单（不阻断 CI，但可见）。

---

## 4. 内容正确性（📐 无实现）

以下维度**均无任何实现**。全库检索 `src/core/content/**` 与 `scripts/content/**`，无对应逻辑。

| 维度 | 现状 | 为什么现在做不到 |
|---|---|---|
| 释义准确性（`translation` 是否正确） | 无校验 | 需人工抽检或第二数据源交叉比对 |
| 音标规范（IPA 还是其他体系？） | 无校验 | 实测音标体系**不统一**（见 §4.1），无字段声明体系 |
| 词形合法性（是否为真实英文单词） | 无校验 | 无词典白名单 |
| 释义非空（`definition` 有内容） | 无校验 | 见 §3.3 根因 |
| 词性标注（`partOfSpeech` 填充） | **0% 覆盖**（审计时点） | 白名单已声明该字段，零数据 ⇒ **P1.6-E 已移除字段，本项作废** |
| 重复语义（同义词是否被当作两条） | 无校验 | 门禁第 4/12(a) 项只查**精确重复**（`validate.mjs:172-176`）与大小写折叠重复（`normalize.mjs:72-74`），不查同义 |
| 跨包内容一致性（同词在不同包释义是否矛盾） | 无校验 | 见 §6 |

### 4.1 音标体系不统一的实测证据

`phonetic` 字段无格式约束（`normalize.mjs:46` 白名单只约束**键名**，不约束**值格式**）。实测两种体系并存：

- cet4/cet6 样例：`helpline` → `ˈhelplaɪn`（**IPA**，含 `ˈ` 重音符）
- toefl 样例：`supercontinent` → `,sju:pә'kɔntinәnt`（**KK/旧式音标**，含 `,` `:` `ә` `'`）
- toefl 样例：`springwater` → `'spriŋwɒtә`

具体证据：`content/vocabulary/toefl/words.json` 中 `supercontinent`、`geomagnetic` 等条目使用 `,` 起头表示次重音、`'` 表示重音、`ә` 表示 schwa；而 `content/vocabulary/cet4/words.json` 使用 `ˈ`（U+02C8）。**同一字段承载两套标注体系，无字段区分**。

**建议方向（📐）**：新增 `phoneticScheme: 'ipa' | 'kk' | 'other'` 字段并在 manifest 或词条级声明；或统一归一化为 IPA。当前无任何字段可判定某条音标属于哪套体系。

### 4.2 `translation` 语言一致性（实测：一致）

检查项：`translation` 是否含汉字。实测结果：

| 包 | 无汉字 translation 条数 |
|---|---|
| 全部 10 包 | **0** |

即全库 9346 条 `translation` **均含汉字**，无一例外。这是一条**实测通过**的一致性事实（虽然无门禁守护）。附带结论：不存在「`translation` 里塞了英文原文」的情况。

---

## 5. 包级质量画像

### 5.1 5 个「2 字段包」的说明

ai-core / cloud-native / frontend / go-code / ts-code 共 193 条词条，**只有 `word` + `translation`**。

| 包 | 词条数 | `exam` | 用途推断（据 `tags` / `type` 字段） |
|---|---|---|---|
| ai-core | 43 | 无 | AI 术语 |
| cloud-native | 30 | 无 | 云原生术语 |
| frontend | 20 | 无 | 前端术语 |
| go-code | 50 | 无 | Go 语言 API 符号 |
| ts-code | 50 | 无 | TypeScript 语言 API 符号 |

实测 `exam` 字段：这 5 包均为 `null`；5 个考试类包（cet4/cet6/ielts/kaoyan/toefl）的 `exam` 分别为 `"CET-4"` / `"CET-6"` / `"IELTS"` / `"考研"` / `"TOEFL"`。

两个技术性原因使这 5 包缺少音标/释义：

1. **代码符号无音标/无词典释义**。`go-code` 与 `ts-code` 的词形是 API 符号（如 `useRef`、`Handler`），本身不是自然语言单词，加音标无意义。这两包的 `manifest.normalize.stripHtml = false`（`boolean`）也印证其「代码内容」定位（详见 `CONTENT_SCHEMA.md` §5.3）。
2. **术语类释义可省**。ai-core / cloud-native / frontend 的词是术语，`translation`（中文名）已表达主要信息，`definition`（英文释义）省略。

因此这 193 条的字段稀疏**部分是设计选择，部分是覆盖不足**，二者在数据中**无法区分**（无字段标记「本包不适用 phonetic」）。

**建议方向（📐）**：新增包级声明如 `fieldPolicy: { phonetic: 'not-applicable' | 'pending' | 'required' }`，区分「有意不提供」与「尚未补齐」。当前二者的数据形态完全相同（键缺失）。

### 5.2 manifest 声明值 vs 实测值（实测：全部一致）

| 包 | `stats.items` / 实测 | `stats.phonetic` / 实测 | `stats.definition` / 实测 |
|---|---|---|---|
| ai-core | 43 / 43 ✅ | 0 / 0 ✅ | 0 / 0 ✅ |
| cet4 | 84 / 84 ✅ | 84 / 84 ✅ | 84 / 84 ✅ |
| cet6 | 69 / 69 ✅ | 69 / 69 ✅ | 69 / 69 ✅ |
| cloud-native | 30 / 30 ✅ | 0 / 0 ✅ | 0 / 0 ✅ |
| frontend | 20 / 20 ✅ | 0 / 0 ✅ | 0 / 0 ✅ |
| go-code | 50 / 50 ✅ | 0 / 0 ✅ | 0 / 0 ✅ |
| ielts | 3000 / 3000 ✅ | 2986 / 2986 ✅ | 2999 / 2999 ✅ |
| kaoyan | 3000 / 3000 ✅ | 2994 / 2994 ✅ | 3000 / 3000 ✅ |
| toefl | 3000 / 3000 ✅ | 2943 / 2943 ✅ | 2992 / 2992 ✅ |
| ts-code | 50 / 50 ✅ | 0 / 0 ✅ | 0 / 0 ✅ |

**结论**：`stats` 三项声明值与实测值**全部一致**。这是 `validate.mjs:178-180`（第 5 项）门禁的直接效果 —— 注意：`stats.items` 一门禁会与实测比对，但 `stats.phonetic` / `stats.definition` **无对应门禁**，其一致性是 `build.mjs` 从数据自动生成的结果，非校验所得。

值得注意：`stats.definition` 声明值（如 ielts 2999）**是按「键存在」计数**，而非按「值非空」。ielts 的 2999 包含了 `helpline` 那条空串 —— 若门禁改为「非空计数」，这些 manifest 需要重新生成。

### 5.3 跨包规模失衡

| 规模档 | 包 | 词条数 | 合计 |
|---|---|---|---|
| 3000 词档 | ielts / kaoyan / toefl | 3000 × 3 | 9000 |
| 数十词档 | cet4(84) / cet6(69) / go-code(50) / ts-code(50) / ai-core(43) / cloud-native(30) / frontend(20) | — | 346 |
| — | **合计** | — | 9346 |

三个大词库占全库 **96.3%** 的词条；另 7 包共 346 条，占 **3.7%**。

`validate.mjs:59-62` 的阈值注释记录了这一分布：

```js
/** inline 包词条数上限。实测 7 包 346 词 */
const INLINE_MAX_ITEMS = 1000
/** inline 包 words.json 字节上限。实测 7 包 36.17 KiB */
const INLINE_MAX_BYTES = 64 * 1024
```

即 7 个小包（346 词）走 inline 加载，3 个大包走 lazy —— 与 `registry.ts` 的加载策略一致。

---

## 6. 考试覆盖度（实测：严重不足）

### 6.1 实测词条数 vs 考纲规模

| 考试 | 包 | 实测词条数 | 考纲规模（既有文档记载） | 覆盖率 |
|---|---|---|---|---|
| CET-4 | cet4 | 84 | 约 4500 | **约 1.9%** |
| CET-6 | cet6 | 69 | 约 5500 | **约 1.3%** |
| IELTS | ielts | 3000 | 未记载 | — |
| 考研 | kaoyan | 3000 | 未记载 | — |
| TOEFL | toefl | 3000 | 未记载 | — |

考纲规模来源：`docs/audit-package/13-acceptance/GAP_ANALYSIS.md:134`（「CET-4 考纲实际约 4500 词 —— 覆盖率约 1.9%」）与 `docs/audit-package/13-acceptance/KNOWN_ISSUES.md:17`（「CET-4 考纲约 4500 词，CET-6 约 5500 词」）。**注意这两个数字是既有文档的记载值，本文未独立核实**（考纲规模非代码可测事实）。

CET-6 覆盖率本文据同一考纲数字计算：69 / 5500 ≈ **1.25%**（既有文档未直接给出该比值）。

### 6.2 一个结构性事实：CET-4 是**拥有最完整字段**的包，但**词量最少之一**

| 包 | 词条数 | phonetic 率 | definition 率 | 字段完整度 |
|---|---|---|---|---|
| cet4 | 84 | 100.00% | 100.00% | 最高（4 字段全满） |
| cet6 | 69 | 100.00% | 100.00% | 最高 |
| ielts | 3000 | 99.53% | 99.97% | 高 |
| kaoyan | 3000 | 99.80% | 100.00% | 高 |
| toefl | 3000 | 98.10% | 99.73% | 较高 |

即：cet4/cet6 是**质量最高、规模最小**的两个包（唯一做到 100%/100% 配音标与释义）。若按「用户最可能先用的考试」排序，CET-4 恰是覆盖最薄弱的一环 —— **质量与覆盖在这两个包上呈现相反方向**。

### 6.3 缺口

`docs/audit-package/13-acceptance/GAP_ANALYSIS.md:138` 记载 C-6「无真考题库」：IELTS/TOEFL/CET 均只有词汇包，无听/说/读/写/真题。`:140` 结论「Content Matrix（23 个大类）目前只落地了 1 个（词汇），且该类别本身覆盖也不足」。

本文补充的实测事实：**词汇这一类的内部，5 个考试包的覆盖差异达 43 倍**（3000 / 69），且**无任何自动机制度量或约束这一差异**。

---

## 7. 与既有统计文档的差异（实测核对）

### 7.1 `content-samples/FIELD-COVERAGE.md` 存在内部矛盾（关键）

该文档 §一 与 §二/§三 **给出不同的 definition 统计值**：

| 位置 | 数值 | 比例 |
|---|---|---|
| `FIELD-COVERAGE.md` §一（逐包表，`:21` 合计行） | **9144** | **97.84%** |
| `FIELD-COVERAGE.md` §二（逐包 key 频次表，`:37` 合计行） | **9153** | — |
| `FIELD-COVERAGE.md` §三（全库 key 汇总，`:45`） | **9153** | **97.93%** |

**本文实测值：9144 / 97.84%**（与 §一 一致，与 §二/§三 不一致）。

差异来源分析：逐包相加 - 全库实测 = 9153 - 9144 = 9，恰为 §3.2 的 9 条空串。

- §二 的逐包值（ielts 3000 / kaoyan 3000 / toefl 3000）是**按「键存在」计**（含空串）。
- §一 的逐包值（ielts 2999 / kaoyan 3000 / toefl 2992）是**按「非空」计**。
- §三 的 9153 = 3000+3000+3000+84+69，用的是「键存在」口径，但写在标注「占全库词条比例」的表里，与 §一 的「非空」口径混用。

因此该文档 §二/§三 的 definition 统计（9153 / 97.93%）与其 §一 及本文实测（9144 / 97.84%）**相差 9 条**。这不是本文算错 —— 该文档在同一份文件内用了两种口径而未说明。

**影响**：若外部审计方引用 `FIELD-COVERAGE.md` §三 的 97.93%，会得到与真实值（97.84%）偏差 0.09 个百分点的结论；`phonetic` 的统计（9076 / 97.11%）§一 与 §三 **一致**，无此问题（因 phonetic 无空串，两种口径同值）。

### 7.2 与 `KNOWN_ISSUES.md` 的差异

| 项 | 既有文档 | 本文实测 | 差异 |
|---|---|---|---|
| 空 `definition` 词条数 | 1 条（`helpline`，BUG-001，`KNOWN_ISSUES.md:27-31`） | **9 条**（`helpline` + toefl 8 条） | **+8 条，既有记录遗漏** |
| 根因 | 未记载 | 已定位：`normalize.mjs:135-137` 不检查 `definition`/`phonetic` 空值 | 新增 |

### 7.3 与 `GAP_ANALYSIS.md` 的差异

| 项 | 既有文档 | 本文实测 | 差异 |
|---|---|---|---|
| CET-6 覆盖率 | 未给出比值 | 69 / 5500 ≈ 1.25% | 新增（补算） |
| 「7 包只有 2 字段」 | 未记载 | 实测 5 包只有 2 字段（共 193 条） | **口径不同**：`FIELD-COVERAGE.md:54-55` 的「无 phonetic 的包（5 个）」与「无 definition 的包（5 个）」为同一集合，共 **5** 包而非 7 包；7 包是「inline 包」的数目（`validate.mjs:59`），与「无音标包」不是同一组 |
| `partOfSpeech` 零覆盖 | 未记载 | 白名单已声明、数据 0 条 | 新增（**P1.6-E：已移除该字段，闭环**） |
| 音标体系不统一（IPA vs KK 混用） | 未记载 | 已给实测样例 | 新增 |

### 7.4 实测通过、但无门禁守护的项

| 事实 | 实测值 | 是否有门禁 | 风险 |
|---|---|---|---|
| `translation` 全部含汉字 | 10/10 包，0 例外 | ❌ 无 | 引入外文词库时会破 |
| `manifest.stats.phonetic` / `stats.definition` 与实测一致 | 10/10 包 | ❌ 无（`stats.items` 有，见 `validate.mjs:178-180`） | 手工改 manifest 不会被拦 |
| 音标字段无空串 | 0 条 | ❌ 无 | 见 §3.3 |

---

## 8. 建议清单（📐 全部为建议，当前无实现）

| # | 建议 | 针对的实测问题 | 参考位置 |
|---|---|---|---|
| Q-1 | 空值检查从硬编码 2 字段改为遍历白名单 | 9 条空 `definition` 静默通过 | `normalize.mjs:135-137` |
| Q-2 | 增加 `stats.phonetic` / `stats.definition` 的实测比对门禁 | 该两项无门禁，仅靠 build 自动生成 | `validate.mjs:178-180` |
| Q-3 | 新增 `phoneticScheme` 字段（`ipa`/`kk`/`other`） | 实测两套音标体系混用无标识 | 词条或 manifest |
| Q-4 | 新增包级 `fieldPolicy` 声明，区分「有意不提供」与「未补齐」 | 5 个 2 字段包的设计意图无法从数据判定 | 各包 manifest |
| ~~Q-5~~ | ~~填充 `partOfSpeech`（白名单已声明，覆盖 0%）~~ | **作废**：P1.6-E 已移除该字段（留着会误导为「有词性数据」）；真要上词性须先补真实数据源 | `normalize.mjs:46` |
| Q-6 | 为考试包定义覆盖率目标并入门禁 | CET-4 仅 84 词（约 1.9%） | 新增 |
| Q-7 | 引入释义准确性抽检机制（人工或第二数据源交叉） | 正确性维度实现量为零 | 新增 |
| Q-8 | 修正 `content-samples/FIELD-COVERAGE.md` §二/§三 的口径矛盾 | 同文件内两种统计口径混用，差 9 条 | `FIELD-COVERAGE.md:37,45` |
| Q-9 | 补记 toefl 的 8 条空 `definition` 入 `KNOWN_ISSUES` | 已知缺陷清单遗漏 8 条 | `KNOWN_ISSUES.md:27-31` |
| Q-10 | 增加跨包同词的释义一致性检查 | 2323 个词形跨包重复，无一致性校验 | 新增 |

---

## 9. 数据复现方式

本文所有数字可用下列方式复现（Node，无需构建）：

**字段覆盖率**（遍历真实 `words.json`，判定「键存在且值为非空字符串」）：

```bash
node -e "
const fs=require('fs');
let tot=0,ph=0,de=0;
for(const id of fs.readdirSync('content/vocabulary')){
  const ws=JSON.parse(fs.readFileSync('content/vocabulary/'+id+'/words.json','utf8'));
  let p=0,d=0;
  for(const x of ws){
    if(typeof x.phonetic==='string'&&x.phonetic.trim())p++;
    if(typeof x.definition==='string'&&x.definition.trim())d++;
  }
  console.log(id,ws.length,p,d);
  tot+=ws.length;ph+=p;de+=d;
}
console.log('合计',tot,ph,de);
"
```

**空 `definition` 逐条定位**：

```bash
node -e "
const fs=require('fs');
for(const id of fs.readdirSync('content/vocabulary')){
  const ws=JSON.parse(fs.readFileSync('content/vocabulary/'+id+'/words.json','utf8'));
  ws.forEach((x,i)=>{ if(('definition' in x)&&!(typeof x.definition==='string'&&x.definition.trim())) console.log(id+'#'+(i+1),x.word); });
}
"
```

**跨包同词统计**（NFC + lowercase + 空白折叠）：

```bash
node -e "
const fs=require('fs');const ov={};
for(const id of fs.readdirSync('content/vocabulary')){
  const ws=JSON.parse(fs.readFileSync('content/vocabulary/'+id+'/words.json','utf8'));
  ws.forEach(x=>{const k=String(x.word||'').normalize('NFC').toLowerCase().replace(/[\s\u00A0]+/g,' ').trim();if(k)(ov[k]=ov[k]||[]).push(id);});
}
console.log('distinct 词形',Object.keys(ov).length);
console.log('跨包同词',Object.entries(ov).filter(([k,v])=>new Set(v).size>1).length);
"
```

**结构门禁**（不含内容质量检查）：

```bash
node scripts/content/validate.mjs      # 20 项结构门禁
node scripts/content/normalize.mjs     # 干跑，检查空字段/重复/非法字段
node scripts/content/list.mjs          # 包清单
```

**注意**：上述三条命令**不会**发现 §3.2 的 9 条空 `definition` —— `validate.mjs` 无内容质量检查项，`normalize.mjs` 的空值检查不含 `definition`。这正是本文 §3.3 所述的缺口。
