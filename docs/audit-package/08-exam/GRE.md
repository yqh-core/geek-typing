# GRE

> 状态：📐 待建
>
> 📐 **待建**：GRE 方向 —— **零实现**。无词汇包、无目录、无脚本、无数据、无 UI。
> ✅ **已有**（可参照的基础设施）：考试包的完整导入链路（以 ielts/kaoyan/toefl/cet4/cet6 为实例）
>
> 基线 commit：`4152eb2`　｜　实测日期：2026-09-27
> 证据来源：`content/vocabulary/`（10 包清单）、`scripts/build-bank.mjs`、`13-acceptance/GAP_ANALYSIS.md`、`content/README.md`

---

## 1. 一句话事实

**GRE 在仓库内不存在任何形式的实现 —— 连一条数据、一个文件、一行代码都没有。**

```
$ ls content/vocabulary/
ai-core  cet4  cet6  cloud-native  frontend  go-code  ielts  kaoyan  toefl  ts-code
#            ↑ 10 个包，无 gre

$ find . -path ./node_modules -prune -o -iname "*gre*" -print
（无输出）

$ grep -rn "gre\b\|GRE\b" scripts/*.mjs
（无输出）

$ grep -rn "GRE" src/ --include=*.ts --include=*.tsx
（无输出）
```

**`grep` 在 `src/`、`scripts/` 全文零命中。** GRE 只出现在**规划类文档**中。

---

## 2. 📐 已有记录的 GRE 相关记载（文档侧，非实现）

### 2.1 需求文档的规模要求（转述）

`13-acceptance/GAP_ANALYSIS.md:63`（A-3 条目内）：

> **为什么必须现在改**：需求文档明确要加 **GRE(12000)**、Oxford(30000)、Cambridge(20000)、TOEFL 扩展等。每加一个包需手改 registry，且极易击穿预算 → **离线打不开**。

即需求侧给出的 GRE 目标规模为 **12000 词**。同处还并列了 Oxford(30000) / Cambridge(20000)。

### 2.2 预热预算的强制前置（文档侧硬约束）

`content/README.md:607-611` 把预热列为**待办缺陷**：

> 🔴 **预热预算是最薄弱的一环（本轮未解决，属待办）**：
> `warmUpVocabulary()`（`src/core/content/registry.ts:139-141`）当前硬编码全量预热 3 个 lazy 包 = **497.03 KiB gzip**，已吃掉 600 KiB 预算的 83%。加包时它**不会自动加入**（漏预热 ⇒ 首次离线切库失败），手动加入又**没有上限**（流量随包数线性膨胀）。
> **在新增 GRE / Oxford 之前，必须先把它从「全量 `allSettled`」改成「按需 + 限量」。**

`03-architecture/INTEGRATION_ARCHITECTURE.md:151` 转述同一约束：

> 并提出约束：「在新增 GRE / Oxford 之前，必须先把它从『全量 allSettled』改成『按需 + 限量』」。

**这是 GRE 方向唯一一条「已写死的技术前置条件」**，且它是**阻塞性**的（文档用「必须…之前」的措辞）。

### 2.3 体积外推（文档侧定量预测）

`content/README.md:572-574` 给出 inline 误用的外推系数 **157.3 KiB/千词 raw、55.5 KiB/千词 gzip**：

> 外推：任一大包做成 inline（系数 **157.3 KiB/千词 raw、55.5 KiB/千词 gzip**）——
> 自建 5000 词 → gzip **397 KiB（×3.3）**；**GRE 12000 词 → 785 KiB（×5.9）**；
> Oxford 30000 词 → **1854 KiB（×13.4）**。

**务必注意这两个数字的口径差异**（本文核对后发现）：

| 口径 | 数值 | 含义 |
|---|---|---|
| **该包自身的 words chunk 体积** | **785 KiB gzip** | 词表内容本身的压缩体积（源自 `content/README.md:573`） |
| **按行内系数反推的主 chunk 增量** | 55.5 × 12 = **666 KiB gzip** / 157.3 × 12 = **1887.6 KiB raw** | 若该包改为 inline 传导进主 chunk 的增量 |

二者不等（785 vs 666，差 119 KiB），因为**系数 55.5 KiB/千词是从 7 个小包（346 词）反算的**，与 7000 词级大包的压缩特性不同（大包压缩率更高）。既有文档的「785 KiB」是**实测口径**（词表体积），系数是**外推口径**。

**两种口径下的共同结论**：无论取哪个数字，**主 chunk gzip（当前 118.89 KiB，阈值 135 KiB）都会被击穿 5~6 倍**。

**结论（实测推论）**：GRE 的 12000 词**只能走 `lazy`**，无第二种可能。这不是建议，是算出来的 —— 且两种口径给出的答案方向一致。

### 2.4 反向验证：lazy 加包的代价（文档侧实测）

`content/README.md:576-577`：

> 反之**全部 lazy** 地加 5 个大包（GRE 12000 / Oxford 30000 / Cambridge 20000 / 自建 5000 / TOEFL 10000 = 77000 词）：
> 词数 **×9.2**，主 chunk raw 只 **+6.55 KiB（+1.7%）**、gzip 只 **+1.11 KiB（+0.9%）** ⇒ 约束成立。

即：**lazy 加 GRE 对首屏体积几乎无影响（gzip 增量以个位数 KiB 计）**，唯一代价是 manifest 体积与预热预算。

### 2.5 审计包 README 的登记

`docs/audit-package/README.md:37`：`| **08-exam/ | IELTS/TOEFL/CET/考研/GRE/NCE |`
`docs/audit-package/README.md:139`：`| GRE.md | 📐 待建 | 零实现 |`

即**审计交付物清单中已为 GRE 预留位置**，状态明确标注为零实现。

---

## 3. 📐 待建：GRE 内容与能力的完整缺口

### 3.1 内容层缺口

| 项 | 现状 | 证据 |
|---|---|---|
| `content/vocabulary/gre/` 目录 | **不存在** | `ls content/vocabulary/` |
| `manifest.json` | 无 | — |
| `words.json` | 无 | — |
| `relations.json` | 无 | — |
| registry 登记 | 无 | `registry.ts:58-69` 只有 10 包 |
| 构建脚本 | 无（`build-bank.mjs` 的 `BANKS` 只有 ielts/kaoyan/toefl） | `build-bank.mjs:28-49` |
| 数据源 | **未确定** | 无任何记载 |
| 许可 | **未确定** | — |

**GRE 的 12000 词从哪来、许可如何、由谁加工 —— 三项目前全部空白。**

### 3.2 一个必须正视的来源问题：ECDICT 难以直接提供 GRE 12000

现有 5 个考试包**全部来自 ECDICT**（`sources[0].origin = "ECDICT"`，MIT）。但有两条实测事实使其难以承担 GRE 12000：

**① ECDICT 的 tag 体系没有 GRE 维度的完整标签。** 证据在 `scripts/build-bank.mjs:38-43` 的考研配置：

```js
kaoyan: {
  tagTokens: ['ky', 'kaoyan'], // ECDICT 考研 tag 为 ky（兼容 kaoyan 写法）
```

**考研标签在 ECDICT 里只有两字母缩写 `ky`**。而 `build-bank.mjs` 只支持 ielts / kaoyan / toefl 三个 token（`build-bank.mjs:28-49`），**无 `gre` 配置项**。若要接 GRE，需要先探明 ECDICT 中 GRE 的 tag 形态 —— 该信息仓库内无记载。

**② 现有最大包的规模都是 `LIMIT = 3000`**（`build-bank.mjs:21`）。GRE 要 12000 词，需要改 `LIMIT` 或另写脚本。

**③ 更根本的问题：ECDICT 的 tag 词数是否够 12000。** 实测线索：现有三个包的 tag 过滤后各自都能取满 3000（ielts 3000 / kaoyan 3000 / toefl 3000），说明这些 tag 的池子 ≥ 3000。但**没有任何实测数据能回答「GRE tag 池子有多大」** —— 仓库内无 `scan` 模式的运行记录。

`build-bank.mjs:11` 确实提供了探测入口：

```
node scripts/build-bank.mjs scan [csv路径]          # 打印 tag token 分布（探测用）
```

但 `scan` 依赖本地 CSV：`build-bank.mjs:20` 的默认路径是 **`D:/work/_ops/_ecdict/ecdict.csv`**（本机绝对路径，**不在仓库内**）。因此该探测**在仓库内不可复现**。

### 3.3 能力层缺口

| GRE 能力 | 类型槽位 | 数据 | 实现 |
|---|---|---|---|
| Verbal 填空（Text Completion / Sentence Equivalence） | `exercise` | 0 | 0 |
| Verbal 阅读（Reading Comprehension） | `reading` | 0 | 0 |
| Quantitative 数学（算数 / 代数 / 几何 / 数据分析） | `exercise` | 0 | 0 |
| Analytical Writing（Issue / Argument） | `writing` | 0 | 0 |
| 自适应计分（section-level adaptive） | — | 0 | 0 |
| 真题 / 模考 | `exercise` | 0 | 0 |

**注意**：GRE 的 Quantitative 部分**与英语词汇学习无关**（数学题），Analytical Writing 需要评分引擎 —— 这两项**超出当前产品的任何已有能力范围**，也超出「英语学习平台」的一般定位。这一点在仓库文档中**无任何记载或讨论**。

### 3.4 与现有考试方向的规模对照（实测）

| 方向 | 现有词条数 | 需求目标 | 差距 |
|---|---|---|---|
| ielts | 3000 | — | — |
| kaoyan | 3000 | — | — |
| toefl | 3000 | — | — |
| cet4 | 84 | 约 4500 | 缺约 4416 |
| cet6 | 69 | 约 5500 | 缺约 5431 |
| **GRE** | **0** | **12000**（需求文档） | **缺 12000** |
| **全库合计** | **9346** | — | — |

**GRE 一个方向的目标（12000 词）就达到现有全库总量（9346 词）的 128%。**

---

## 4. 建议（📐 全部为建议，非已承诺路线）

### 4.1 前置条件（阻塞性）

| # | 建议 | 依据 |
|---|---|---|
| G-1 | **先改 `warmUpVocabulary()` 为「按需 + 限量」** | `content/README.md:611` 明确「在新增 GRE / Oxford 之前，必须先…」 |
| G-2 | **确认 ECDICT 是否能提供 GRE 12000** | `build-bank.mjs` 无 `gre` 配置；需先跑 `scan`（但 CSV 路径在仓库外，需先解决可复现性） |
| G-3 | **确认数据源与许可** | 若 ECDICT 不足 12000，需引入第二来源 ⇒ 触发许可门禁（外部来源必须有 SPDX，第 7 项）与 `rightsStatus` 缺口（E-1） |

### 4.2 若决定推进，建议的落地顺序

| # | 步骤 | 说明 |
|---|---|---|
| G-4 | 走 `lazy`，不走 `inline` | 算出来的：12000 词 inline ⇒ 主 chunk gzip 增 **666~785 KiB**（阈值 135，当前 118.89） |
| G-5 | 复用「落数据 → 写骨架 → normalize → build → validate → 登记 registry」六步流程 | `content/README.md:463-473` |
| G-6 | registry 用 `load: () => import('...?raw')`，不用 `words:` | `content/README.md:597` |
| G-7 | 评估是否加入 `warmUpVocabulary`（注意 600 KiB 预算） | `content/README.md:598` |
| G-8 | 跑 `check:bundle` + `content:validate`（第 18/19/20 项） | `content/README.md:599-600` |

### 4.3 需要先做的产品澄清（超出文档能力范围）

| # | 待澄清问题 |
|---|---|
| G-9 | GRE 的 Quantitative（数学）部分是否在产品范围内？若在，需要全新的题型引擎 |
| G-10 | Analytical Writing 的评分如何做？现无任何评分能力 |
| G-11 | GRE 12000 词与现有 ielts/kaoyan/toefl 的重叠度如何？若高，扩词收益需重新评估（参考：ielts ∩ kaoyan = 1802） |
| G-12 | 「按考试分档」的粒度：GRE 是否需要区分 Verbal 高频 / 数学术语 / AW 词汇等子档？ |

---

## 5. 与其它审计文档的关系（不重复内容）

| 主题 | 详见 |
|---|---|
| 预热预算 A-3 / I-1 / I-2 | `13-acceptance/GAP_ANALYSIS.md:59-65`、`03-architecture/INTEGRATION_ARCHITECTURE.md` §2 |
| inline 体积传导与外推系数 | `content/README.md:557-577` |
| 新增大包的六步流程 | `content/README.md:593-601`、`05-import/IMPORT_PIPELINE.md` |
| 外部来源许可门禁 | `05-import/IMPORT_VALIDATION.md`（第 7 项）、`11-legal/*` |
| 12 类型落地率 | `04-content/CONTENT_TYPES.md` |
| 考试方向总览 | `08-exam/IELTS.md`、`TOEFL.md`、`CET.md`、`KAoyan.md`、`NCE.md` |

---

## 6. 一句话结论

> GRE 方向的「已有」= **零**。`grep` 在 `src/` 与 `scripts/` 全文**零命中**，`content/vocabulary/` 无 `gre` 目录。
> 唯一已写死的条件是**阻塞性的**：`content/README.md:611` 要求「**在新增 GRE / Oxford 之前**」必须先改 `warmUpVocabulary()`（当前 497.03 / 600 KiB，余量 17.2%）。
> 唯一已算出的结论是**定量的**：GRE 12000 词若走 inline ⇒ 主 chunk gzip 增 **666~785 KiB**（两种口径，阈值 135 KiB），**只能走 lazy**。
> 而两个更根本的前提 —— **12000 词从哪来**（ECDICT 无 `gre` 配置、`scan` 依赖仓库外 CSV）与**是否做数学/AW 部分** —— 仓库内**无任何记载**。
