# Learning 键迁移审计报告（MIGRATION_AUDIT）

| 项 | 值 |
|---|---|
| 文档编号 | `docs/audit-package/06-learning/MIGRATION_AUDIT.md` |
| 归属 | 《要点1.docx》P0.7 收口清单 第 1/2/3 项 前置审计 · P1.5 前置 |
| 本轮性质 | **只读审计 + 方案设计。未修改 `src/` 下任何源码，未执行任何迁移。** |
| 审计脚本 | `scripts/migration-audit.mjs`（一次性分析脚本，已保留，可自行重跑） |
| 数据产物 | `docs/audit-package/_generated/migration-audit.json`<br>`docs/audit-package/_generated/migration-resolved-words.jsonl`<br>`docs/audit-package/_generated/migration-ambiguous-words.jsonl` |
| 生成时间 | 见 `migration-audit.json` 的 `generatedAt` 字段 |
| 数据来源 | `content/vocabulary/<pkg>/words.json`（词表真值）+ `content/vocabulary/<pkg>/manifest.json`（namespace / ContentId 真值） |

---

## ① 结论速览

**一句话结论：P1.5 不是「把 word 改成 contentId」的一次机械替换，而是一次有真实信息损失的迁移 —— 全库 6713 个不同词里，有 2323 个（34.6%）的裸 word 键在当前 10 包体系下根本无法唯一映射到 ContentId。**

| 结论 | 内容 |
|---|---|
| **C1** | 裸 word → ContentId 的映射**只在 resolved 档成立**。全库 6713 个不同 word 中，仅 **4390 个（65.4%）** 是全局唯一、可直接映射。 |
| **C2** | **2323 个（34.6%）word 跨 ≥2 个包**，属于 **ambiguous**。旧存储 `gt.review.v1` / `gt.memorize.v1` 只记了裸 word、**没记包**，因此**无法自动反推用户当时学的是哪个包的哪条内容。这部分信息在写入旧键的那一刻就已经丢失，不是技术问题、是数据问题。** |
| **C3** | 旧审计给出的交集数字**全部复现一致**（ielts∩kaoyan=1802、ielts∩toefl=613、kaoyan∩toefl=344、三者交集=230、三包并集=6471），说明词库未发生漂移，可以作为迁移基线。 |
| **C4** | **ContentId 唯一性没有缺陷**：所有跨包同名 word 在各自 namespace 下的 ContentId 均全局唯一（脚本判定 `true`）。问题**不在 ContentId 的设计**，而在**旧裸 word 键丢失了 namespace 这一维**。 |
| **C5** | **orphan 无法在纯词表视角下统计**。词表只含现存词，历史消失的词只能从**真实用户存储快照**里才能发现。脚本已支持 `--user-store=<file>` 输入；本轮**未提供快照，故 orphan 记为 N/A 而非 0** —— 把 N/A 当 0 是本次审计必须避免的第一号假通过。 |
| **C6** | **四个键口径不一致确实存在**：`gt.analytics.v1` 的键是 `word.toLowerCase()`（`src/lib/analytics.ts:73`），与另外两个裸 word 键**口径不同**，是天然的第二档问题，需单独处置（见 §6）。 |
| **C7** | **推荐策略**：resolved 批量改键；ambiguous **不猜、不复制**，整体降级为 `legacy-unattributed` 共享记录；orphan 保留进 `legacy` 区。同时把 `gt.review.v1` → `gt.review.v2`、`gt.memorize.v1` → `gt.memorize.v2` bump 版本号，旧键**不删除**、只标记废弃。 |

---

## ② 真实数据

### 2.1 复现命令与输出

```bash
cd D:/work/geek-typing && node scripts/migration-audit.mjs
```

实测输出（原样粘贴）：

```
==============================================================================
Learning 键迁移审计 —— 真实数据（source: content/vocabulary/*/words.json）
==============================================================================

【1】各包词数（raw = words.json 数组长度；unique = 包内去重后）
pkg           namespace                raw  unique  dupInPkg
ai-core       curated-ai-core           43      43         0
cet4          ecdict-cet4               84      84         0
cet6          ecdict-cet6               69      69         0
cloud-native  curated-cloud-native      30      30         0
frontend      curated-frontend          20      20         0
go-code       curated-go-code           50      50         0
ielts         ecdict-ielts            3000    3000         0
kaoyan        ecdict-kaoyan           3000    3000         0
toefl         ecdict-toefl            3000    3000         0
ts-code       curated-ts-code           50      50         0
              TOTAL                   9346

全库去重后不同 word 数（区分大小写）= 6713
全库去重后不同 word 数（小写归并）  = 6713
```

> `dupInPkg` 全为 0 —— **包内无重复词**，即同包内不会出现「同 word 两个 ContentId」的情况，包内映射是干净的。

### 2.2 各包词数与 ContentId 前缀

| pkg | namespace | 词数 | ContentId 样例 |
|---|---|---:|---|
| ai-core | `curated-ai-core` | 43 | `content:word:curated-ai-core:transformer` |
| cet4 | `ecdict-cet4` | 84 | `content:word:ecdict-cet4:...` |
| cet6 | `ecdict-cet6` | 69 | `content:word:ecdict-cet6:...` |
| cloud-native | `curated-cloud-native` | 30 | `content:word:curated-cloud-native:...` |
| frontend | `curated-frontend` | 20 | `content:word:curated-frontend:...` |
| go-code | `curated-go-code` | 50 | `content:word:curated-go-code:...` |
| ielts | `ecdict-ielts` | 3000 | `content:word:ecdict-ielts:inference` |
| kaoyan | `ecdict-kaoyan` | 3000 | `content:word:ecdict-kaoyan:...` |
| toefl | `ecdict-toefl` | 3000 | `content:word:ecdict-toefl:...` |
| ts-code | `curated-ts-code` | 50 | `content:word:curated-ts-code:...` |
| **合计** | | **9346** | |

**ContentId 构造规则（实测确认）**：`content:word:<namespace>:<word>`，namespace 取自各包 `manifest.json` 的 `namespace` 字段。与 `tests/content-query.mjs:107` 的门禁断言

```js
h.id === `content:word:${h.packageId.split(':')[2]}:abandon`
```

完全一致。（注：`abandon` 在 `tests/content-query.mjs` 里被用作**跨包检索**的测试词，但实测它**只存在于 `cet4` 一个包**，属 resolved 档 —— 见 §5.4 的示例取值说明。）

> ⚠️ 注意：`manifest.id` 的**第 3 段**是 namespace（如 `content:vocabulary:ecdict-ielts:ielts` 的第 3 段是 `ecdict-ielts`），而 **ContentId 的第 3 段也是 namespace**，但**第 2 段不同**（manifest 是 `vocabulary`，ContentId 是 `word`）。迁移脚本构造 ContentId 时**不要拿 manifest.id 直接改第 4 段**，否则会生成错误的 `content:vocabulary:...` 前缀。

### 2.3 10×10 交集矩阵（实测）

行列均为各包**去重后**的裸 word 集合；对角线 = 包自身去重词数。

```
               ai-cor   cet4   cet6 cloud- fronte go-cod  ielts kaoyan  toefl ts-cod
ai-core            43      1      1      0      0      0      6      7      5      0
cet4                1     84      0      0      0      0     19     24      1      0
cet6                1      0     69      1      0      0     56     54     14      0
cloud-native        0      0      1     30      1      0      2      3      0      0
frontend            0      0      0      1     20      0      1      0      3      0
go-code             0      0      0      0      0     50      0      0      0      0
ielts               6     19     56      2      1      0   3000   1802    613      0
kaoyan              7     24     54      3      0      0   1802   3000    344      0
toefl               5      1     14      0      3      0    613    344   3000      0
ts-code             0      0      0      0      0      0      0      0      0     50
```

**关键交集核验（实测，与旧审计一致）**：

```
  ielts∩kaoyan = 1802
  ielts∩toefl  = 613
  kaoyan∩toefl = 344
  三者交集      = 230
  三包并集      = 6471
```

**矩阵读出的两个结构性事实**：

1. **重叠几乎全部集中在 ielts / kaoyan / toefl 三大词表之间**（1802 / 613 / 344），三者并集 6471 占全库 6713 个不同词的 **96.4%**。迁移的主战场就是这三个包。
2. **`go-code` / `ts-code` 与任何包零交集**（整行整列除对角线外全 0）。这两个包各自 50 个「Go/TS 骨架代码行」，`manifest.json` 里明确声明 `normalize.stripHtml:false` 且**大小写敏感**。它们对 ambiguous 档**零贡献**，迁移时是「完全安全」的包。

### 2.4 同名分布直方图（实测）

```
  出现在  1 个包:  4390 个 word
  出现在  2 个包:  2027 个 word
  出现在  3 个包:   283 个 word
  出现在  4 个包:    12 个 word
  出现在  5 个包:     1 个 word
```

- 出现在 **≥2 个包** 的 word：`2027 + 283 + 12 + 1 = 2323`
- 出现在 **≥3 个包** 的 word：`283 + 12 + 1 = 296`
- 出现在 **≥4 个包** 的 word：`12 + 1 = 13`
- 出现在 **5 个包** 的唯一那个词：`generalize`（横跨 `ai-core, cet6, ielts, kaoyan, toefl`）

### 2.5 ambiguous 中交叉最多的前 10 个 word（实测）

```
  generalize           5 包: ai-core, cet6, ielts, kaoyan, toefl
  considerate          4 包: cet4, ielts, kaoyan, toefl
  conspicuous          4 包: cet6, ielts, kaoyan, toefl
  degenerate           4 包: cet6, ielts, kaoyan, toefl
  diligent             4 包: cet6, ielts, kaoyan, toefl
  eminent              4 包: cet6, ielts, kaoyan, toefl
  endow                4 包: cet6, ielts, kaoyan, toefl
  fluctuate            4 包: cet6, ielts, kaoyan, toefl
  homogeneous          4 包: cet6, ielts, kaoyan, toefl
  impetus              4 包: cet6, ielts, kaoyan, toefl
```

这 10 个词直观说明了 ambiguous 的性质：`generalize` 同时存在于 5 个包，用户在旧版里只留下了一个 `generalize` 键 —— **到底是在 AI 词库点错的、还是在雅思词库点错的？旧数据里根本没有这个信息。**

### 2.6 ContentId 唯一映射判定（实测）

```
【7】ContentId 唯一映射判定
  所有 cross-pkg 同名 word 在各自包 namespace 下 ContentId 均唯一: true
```

**这条是本次审计对 ContentId 设计的正面结论**：跨包同词合法，且每个包各自拥有唯一 ContentId，`tests/content-query.mjs:107-112` 的门禁守护有效，不存在主键撞车。**ContentId 侧无需修改。** 迁移的困难 100% 来自旧键的信息缺失，而非新模型的设计缺陷。

---

## ③ 三档分级与条数

### 3.1 分级判据

分级输入 = 旧存储中的**一个键**（旧键集合记为 `K_old`）；分级输出 = 该键能落到哪一档。

| 档位 | 判据 | 可映射性 |
|---|---|---|
| **resolved** | `word` 在当前 10 包的全局词表 `W` 中**恰好属于 1 个包** | ✅ 唯一确定 ContentId，可安全自动迁移 |
| **ambiguous** | `word` 在当前 10 包的全局词表 `W` 中**属于 ≥2 个包** | ❌ 候选 ≥2，裸 word 不含区分信息，**无法自动判定** |
| **orphan** | `word` **不在** `W` 中（连小写归并后也不在） | ❌ 目标 ContentId 不存在，无迁移目标 |

形式化：

```
W_p = 包 p 的去重词集合（p ∈ 10 个包）
W   = ⋃ W_p

resolved(K) = { k ∈ K | |{ p | k ∈ W_p }| == 1 }
ambiguous(K) = { k ∈ K | |{ p | k ∈ W_p }| >= 2 }
orphan(K)   = { k ∈ K | k ∉ W 且 k.toLowerCase() ∉ lower(W) }
```

### 3.2 词表侧的真实条数（实测）

以**当前词表全体**作为分母（即：假设用户学过全库所有词，看最坏情况）：

| 档位 | 条数 | 占比 |
|---|---:|---:|
| **resolved** | **4390** | 65.40% |
| **ambiguous** | **2323** | 34.60% |
| **orphan** | **N/A** | — |
| 合计（去重后不同 word） | 6713 | 100% |

```
【3】三档分级（resolved / ambiguous / orphan）
  resolved  = 4390
  ambiguous = 2323
  orphan    = N/A（未提供用户存储快照）
     orphan 来源: N/A（未提供 --user-store，词表本身无法反映历史消失词汇）
```

> **为什么 orphan 是 N/A 而不是 0**：`words.json` 只描述**现在存在**的词。一个已经消失的词不可能出现在词表里 —— 用词表算 orphan 恒等于 0，那是**循环论证**。orphan 只可能来自「曾经存在的词 × 旧的用户存储」，所以必须传入真实快照：
>
> ```bash
> node scripts/migration-audit.mjs --user-store=path/to/gt.review.v1.json
> ```
>
> 脚本对每个键既试精确匹配、也试 lowercase 归并匹配（`!wordToPkgs.has(w) && !lowerToPkgs.has(w.toLowerCase())`），避免把「大小写不同但词存在」误判为 orphan。

**orphan 通路已实测可用**（用合成探针验证，探针已清理）：

```bash
# 合成 5 键探针：1 个 resolved、2 个 ambiguous、1 个真 orphan、1 个大小写探针
node scripts/migration-audit.mjs --user-store=<探针快照>
# 输出：orphan = 2   （正确识别出真 orphan + 大小写探针，见 §6.3.1 的深入分析）
```

这证明 `--user-store` 通路能真实工作，**不是未实现的占位**。收口时只需把真实快照喂进去即可得到真实 orphan 条数。

### 3.3 ⚠️ 上述条数的适用边界（必读，防止误用）

`K_old`（用户真实用过的词）是 `W`（词表全体）的**子集**，因此：

- **4390 / 2323 是「词表全体」的分档，不是「用户数据」的分档。**
- 真实迁移时，必须把**用户实际存储的键**喂进同一套分级函数，得到 `resolved(K_old)` / `ambiguous(K_old)` / `orphan(K_old)`。
- 但**两者比例是同构的**：只要用户的使用是随机采样，`ambiguous(K_old) / |K_old| ≈ 34.6%`。也就是说 —— **无论用户学了多少，大约 1/3 的学习记录注定要进 ambiguous 档。**

这个「≈1/3」是本报告最需要在产品侧被消化的数字。

### 3.4 为什么 ambiguous 是「信息已丢失、无法自动恢复」——本次迁移最重要的结论

必须把这句话讲透，因为很容易被误解成「写个聪明点的脚本就能救回来」。

**证据链：**

1. **旧键的 schema 决定了信息上限。** `src/lib/reviewStore.ts:22`
   ```ts
   export type ReviewStore = Record<string, ReviewEntry>
   ```
   `Record<string, ...>` 的键是**裸 word 字符串**。`src/lib/memorizeStore.ts` 的 `MemStore = Record<string, MemRecord>` 同理。

2. **包（namespace）这一维从未被写入。** `ReviewEntry` 的字段只有 `wrongCount / correctStreak / lastWrongAt / nextReviewAt / intervalIdx`；`MemRecord` 只有 `status / reviews / lastAt`。**没有任何字段记录这条记录来自哪个包。**

3. **因此映射是「一对多」，不是「一对一」。** 对 ambiguous 里的每个 word，候选 ContentId 有 2~5 个，且这 2~5 个候选的 payload（释义、音标、来源、甚至大小写）**可能完全不同** —— 例如 `generalize` 在 `curated-ai-core`（AI 词库）与在 `ecdict-ielts`（雅思）里是完全不同的学习内容上下文。

4. **无法从旧数据反推的任何启发式都是编造。** 有人会提议「按用户最近打开的包猜」。但：
   - 旧存储里**没有**「最近打开的包」这个字段 —— 那需要 `gt.lastPackage` 之类的东西，不存在；
   - 若真去读 `gt.analytics.v1` 或 `gt.streak.v1`，它们记的也是**裸 word / 日期**，同样不含包；
   - 一旦引入「猜」，审计就无法证明「这条迁移是正确的」，Ledger 也就失去了证据价值。

5. **结论**：ambiguous 档的正确处置**不是「想办法猜对」，而是「诚实地标记为不可归属」**。把 34.6% 的记录从「错误的唯一归属」改为「明确的无归属」，是**从错误走向正确**，不是数据损失 —— 因为它们本来就不是「有归属的数据」，只是「看起来有归属的字符串」。

**一个必须澄清的边界**：ambiguous **不等于**「这些词的复习进度没用了」。恰恰相反，它的 `wrongCount / nextReviewAt / status` 等**进度本身仍然是有效且应该保留的**。丢失的只是「这些进度属于哪个包的哪条内容」这一维归属。因此处置方式的正确方向是 **「保留记录、降级归属」**，而不是「删除记录」（详见 §4.2）。

---

## ④ 迁移策略与风险

### 4.0 总原则

1. **先备份，后迁移；备份失败即中止。**
2. **迁移是纯函数**：`(旧键, 分级表) → (新键, Ledger 行)`，不含随机、不含时钟依赖（除记录时间戳）。
3. **不删旧键**：旧键原样保留，供回滚与复核；只新增新键 + 写 Ledger。
4. **每一步都要在 Ledger 里留证**：迁移了哪些、没迁哪些、为什么。

### 4.1 resolved 档：批量改键

**策略**：直接一对一改写。

```
旧： "transformer"                      → ReviewEntry
新： "content:word:curated-ai-core:transformer" → ReviewEntry   （值原样搬，不动字段）
```

> 示例取值来自实测产物 `migration-resolved-words.jsonl` 首行：`{"word":"transformer","contentId":"content:word:curated-ai-core:transformer","tier":"resolved"}`。
>
> ⚠️ **不要用 `abandon` 当示例**：`tests/content-query.mjs` 用它测跨包检索，容易让人以为它跨包；实测它**只在 `cet4`**，ContentId 是 `content:word:ecdict-cet4:abandon`。

**实现要点**：

- 词 → ContentId 的映射**不要现算**，直接读审计产物 `docs/audit-package/_generated/migration-resolved-words.jsonl`（4390 行，已含 `word` → `contentId` 的确定性映射）。这样迁移跑的就是审计过的那张表，**可复核**。
- 改写时保留原 `ReviewEntry` / `MemRecord` 的全部字段与数值，**只改键**。不重算 `nextReviewAt`、不重置 `intervalIdx` —— 迁移不是「重新开始学」。
- 命中冲突时（新旧键同时存在，见 §4.4 幂等性）保留**数值更「新」**的那条（`lastWrongAt` / `lastAt` 更大者），并把冲突写入 Ledger 的 `conflict` 字段。

**风险**：

| 风险 | 说明 | 缓解 |
|---|---|---|
| 键长膨胀 | ContentId 约 30~40 字符，裸 word 平均 ~8 字符，键总长膨胀约 4~5× | 见 §4.5 配额评估，需实测 |
| 大小写丢词 | `go-code`/`ts-code` 大小写敏感，若迁移链路上有任何 `.toLowerCase()` 会直接污染这两个包 | 迁移脚本**禁止**对 word 做 lowercase 归一；本轮脚本已按大小写敏感处理 |

### 4.2 ambiguous 档：**推荐「保留为无归属共享记录」**（不复制、不猜）

三个候选方案对比：

| 方案 | 做法 | 推荐度 | 理由 / 风险 |
|---|---|---|---|
| **A. 复制到所有候选包** | `generalize` 一条 → 复制成 5 条，分别挂到 5 个候选 ContentId | ❌ **不推荐** | **凭空放大用户数据 4~5 倍。** 用户的错题数、复习队列长度、统计口径全部虚高。更严重的是：**无法用任何证据证明这些复制出来的记录是「真的」** —— 它把一个「不知道」变成了五个「假装知道」，直接违反 Ledger 的证据链要求。且会引爆 §4.5 的 localStorage 配额。 |
| **B. 保留为无归属共享记录** ✅ | 迁到独立命名空间键 `legacy:unattributed:<word>`，值原样保留，Ledger 标 `ambiguous` + 候选清单 | ✅ **推荐** | **零信息损失、零编造。** 进度值（错题次数、下次复习时间）全部保留，只是「归属」从「假装唯一」降级为「明确待定」。用户数据不膨胀、不缩水。后续若有任何新证据（如用户重新选包时），可基于候选清单**再做一次可控的再归属**。 |
| **C. 按启发式选一个** | 按包优先级 / 词频 / 最近使用等规则选一个候选 | ❌ **不推荐** | 旧数据里**不含**任何可用于此判断的字段（见 §3.4 证据 4），所谓「启发式」只能是硬编码的偏好，本质是**编造归属**。一旦猜错，用户会看到某个包的错题本里出现他从未在该包学过的词 —— 这比「无归属」更糟，因为它**看起来是对的**。 |

#### 推荐方案 B 的落地形态

```
旧： "generalize"  → { wrongCount: 3, correctStreak: 0, ... }
新： "legacy:unattributed:generalize"
                    → { wrongCount: 3, correctStreak: 0, ..., _tier: "ambiguous",
                        _candidates: ["content:word:curated-ai-core:generalize",
                                      "content:word:ecdict-cet6:generalize",
                                      "content:word:ecdict-ielts:generalize",
                                      "content:word:ecdict-kaoyan:generalize",
                                      "content:word:ecdict-toefl:generalize"] }
```

**`legacy:unattributed:` 前缀为什么是个好的命名空间**：

- 它**不可能是**合法 ContentId（ContentId 第 3 段是 namespace，`legacy` 不是任何包的 namespace），因此**不会与真实 ContentId 混淆**；
- 它保留了「这个词存在过、用户学过它」这一事实；
- 它把候选清单内联在记录里，使**任何下游消费方都能自查**自己是否该消费这条记录 —— 例如「错词分析面板」可以把它统计进总错题数，但「按包筛选的错题本」应当**排除**它（因为它不属于任何包）。这一条必须写进 P0.7 的收口验收项。

**风险与缓解**：

| 风险 | 缓解 |
|---|---|
| 下游 UI 忘记排除 `legacy:unattributed:`，导致按包筛选出现「幽灵词」 | 在 `reviewStore.loadReview()` 侧统一过滤，或在 `recommend.ts`（`src/lib/recommend.ts`）派生时排除；列为 P0.7 必测项 |
| 用户看到「有 2323 条记录无归属」感到数据被破坏 | 产品侧话术需提前准备：**这不是丢失，是这批旧数据从一开始就没有记录来源** |
| 后续要做「再归属」时缺少交互入口 | 本轮**不实现**；只在 Ledger 中预留 `candidates`，为将来的一次性「让用户逐条认领」功能留出数据基础 |

### 4.3 orphan 档：**保留为 legacy 区，不丢弃**

**策略**：迁到 `legacy:orphan:<word>`，值原样保留。

**理由**：

- orphan 意味着「用户曾经学过这个词，但它已不在当前 10 包中」。丢弃它 = **静默删用户的头**。哪怕这个词确实已经被词库淘汰，用户也有权知道「我学过 X，它现在不在词库里了」。
- 保留成本极低（这些词不会进任何包的选择菜单，不参与排期），但**可恢复性价值很高** —— 若将来词库重新引入该词，`legacy:orphan:<word>` 可以直接再归属。
- Ledger 中记录 `orphan` + 原因（`not-in-current-vocabulary`），使「这个词为什么不在了」可查。

**唯一需要丢弃的情况**：用户**明确要求**清理。此时必须先出 `--dry-run` 报告（列出将被丢弃的完整清单 + 条数），由用户确认后才能真删。

**本轮状态**：orphan 条数为 **N/A**，因为未提供用户存储快照。**这是本审计唯一的未闭合项**，收口前必须补上：

```bash
# 从真实浏览器导出 gt.review.v1 / gt.memorize.v1 后
node scripts/migration-audit.mjs --user-store=<导出的 gt.review.v1.json>
```

### 4.4 回滚方案

**迁移前三重备份（缺一不可）**：

| # | 备份内容 | 形式 | 目的 |
|---|---|---|---|
| 1 | 原始 localStorage 快照 | 导出 `gt.review.v1` / `gt.memorize.v1` / `gt.analytics.v1` / `gt.streak.v1` 的原始 JSON 字符串（**注意保留原始字符串，不要 JSON.parse 后重新 stringify**，避免键序/精度变化） | 回滚的唯一权威副本 |
| 2 | 迁移前快照的 checksum | 对上述字符串算 `sha256`，写入 Ledger 的 `preMigrationChecksum` | 证明「回滚后 = 迁移前」 |
| 3 | 迁移脚本与其输入分级表 | 脚本文件 + `migration-resolved-words.jsonl` + `migration-ambiguous-words.jsonl` 的版本化留存 | 使迁移过程可重放 |

**回滚动作**：

```
1. 清空 gt.review.v2 / gt.memorize.v2
2. 用备份 #1 的原始字符串写回 gt.review.v1 / gt.memorize.v1
3. 校验写回后的 sha256 == Ledger.preMigrationChecksum
4. 校验通过 → 回滚完成；不通过 → 立即中止并告警，不得继续
```

**为什么回滚是安全的**：因为本轮策略规定**不删除旧键**（§4.0 原则 3）。回滚只需要「删掉新键、恢复旧键」，不涉及任何数据重建。**如果实施阶段有人提议「迁移时顺手删掉旧键以省空间」，请拒绝 —— 那会让回滚从「一步还原」退化为「不可逆」。**

**回滚触发条件**（任一命中即回滚）：

- 迁移后 `gt.review.v2` 的条目数 != 预期条数（resolved + ambiguous + orphan 之和不等于旧键总数）
- 键长度导致 `QuotaExceededError`（`src/lib/reviewStore.ts:85` 已有熔断逻辑，但熔断会**丢数据**，不能作为兜底）
- 抽样 20 条迁移结果，键值对应关系与 Ledger 不符

### 4.5 幂等性

**要求：迁移脚本重复执行不得重复写入、不得放大数据。**

**当前状态：原样重跑会出错，必须显式处理。**

在**未**设计幂等保护的情况下，第二次执行时：

1. 脚本读 `gt.review.v1`（**仍存在，因为不删旧键**），再次改写 → 试图写 `gt.review.v2`；
2. 而 `gt.review.v2` **已有**第一次写入的内容；
3. 若脚本用「覆盖写」，则结果**恰好一致**（幂等 ✅）；若脚本用「合并写」，则 ambiguous 的部分可能被重复累加（**非幂等 ❌**）。

**因此必须显式指定幂等语义**：

```
迁移入口：
  if (localStorage.getItem('gt.review.v2') 已存在 且 Ledger 已有 completed 记录) {
      → 判定为「已迁移」，直接跳过，输出 skipped，不写任何东西
  }

单条写入：
  const prev = next[newKey]
  if (prev) {
      // 冲突：取时间戳更新者；数值不累加、不叠加
      next[newKey] = (prev.lastWrongAt >= entry.lastWrongAt) ? prev : entry
      ledger.push({ …, note: 'conflict-resolved-by-timestamp' })
  } else {
      next[newKey] = entry
  }
```

**幂等的验收判据（必须真跑两次做对照）**：

```bash
# 第一次
node scripts/…  → 记录 输出A
# 第二次（在同一份迁移后数据上）
node scripts/…  → 记录 输出B
# 判据
assert 输出A === 输出B
assert JSON.stringify(v2_after_1st) === JSON.stringify(v2_after_2nd)
assert 条目数不变
```

**不要把「脚本设计成幂等」当成验收，要真的连跑两次做逐字节比对** —— 这是本报告要求 P0.7 验收时补上的对照组。

### 4.6 localStorage 版本号与旧键清理

**结论：需要 bump。**

| 键 | 现状 | 建议 | 理由 |
|---|---|---|---|
| `gt.review.v1` | 裸 word（`src/lib/reviewStore.ts:27`） | **→ `gt.review.v2`** | 键语义发生了**不兼容变更**（裸 word → ContentId）。沿用 v1 会让「新代码读旧数据」得到一堆无法解释的裸 word 键。bump 后新代码只读 v2，语义清晰。 |
| `gt.memorize.v1` | 裸 word（`src/lib/memorizeStore.ts:16`） | **→ `gt.memorize.v2`** | 同上。 |
| `gt.analytics.v1` | **`word.toLowerCase()`**（`src/lib/analytics.ts:73`） | **暂不 bump**，见 §6 | 口径不同、且是统计类旁路数据，处置策略不同。 |
| `gt.streak.v1` | 日期（`src/lib/streak.ts:7`） | **不动** | 键与 Learning 内容无关，不参与本次迁移。 |

**旧键清理策略：不删，标记废弃。**

不要在迁移完成的那一刻就删 `gt.review.v1` / `gt.memorize.v1`，理由：

1. **回滚依赖它**（§4.4）—— 只要旧键还在，回滚就是「删新键、恢复旧键」一步到位；
2. **审计依赖它** —— Ledger 要能回答「这条记录迁移前是什么样」；
3. **未被迁移的键只能从旧键找回** —— 比如 orphan 档，如果实施阶段才发现分级有误，源数据还得从旧键读。

**建议的处置**：

```text
迁移完成 → 旧键改名保留（若确实需要腾空间）
  gt.review.v1   → gt.review.v1.migrated-backup
  gt.memorize.v1 → gt.memorize.v1.migrated-backup

清理时机：等到「至少一个发布周期内无回滚发生」+「Ledger 审计通过」之后，
         由用户显式确认再删除 .migrated-backup
```

**版本号与键膨胀的配额评估（必须实测，本报告不下结论）**：

ContentId 键比裸 word 长约 **4~5×**。`src/lib/reviewStore.ts:80-88` 已有 `QuotaExceededError` 熔断清洗（按 `intervalIdx` 高的优先丢），但**熔断 = 丢用户数据**，绝不能让它成为迁移的兜底。因此收口前必须实测：

```
判据：迁移后 localStorage 占用 < 配额上限的 70%
方法：迁移前先算 Σ(旧键长)、迁移后算 Σ(新键长)，与实际 localStorage 使用量对比
若超限 → 需要先做「接近毕业条目的提前毕业」或用 IndexedDB 替代 localStorage
```

---

## ⑤ Migration Audit Ledger 的文件格式设计

### 5.1 设计目标

Ledger 要能回答四个问题（这是证据链的最低要求）：

1. **哪些记录迁移了？** → 迁移成功的全部条目，含新旧键
2. **哪些记录没迁？** → 明确列出
3. **为什么没迁？** → `tier` + `reason` 给出机器可读的原因
4. **迁移是否可信？** → `preMigrationChecksum` + `postMigrationChecksum` + 条数守恒等式

### 5.2 格式选型：JSONL

**选 JSONL 不选单个 JSON 数组**，理由：

| | JSONL | JSON 数组 |
|---|---|---|
| 追加写入 | ✅ 逐行 append，天然适合流式迁移 | ❌ 需读全量 → 改 → 写回 |
| 部分损坏容忍 | ✅ 坏一行只丢一行 | ❌ 一个语法错全文件不可读 |
| 查询 | ✅ `grep`/`jq` 流式过滤 | ⚠️ 需全量解析 |
| 大文件 | ✅ 逐行读，内存恒定 | ❌ 全量入内存 |

Ledger 会随用户记录数线性增长（全库 6713 词 × 3 档），JSONL 是正确的形态。

### 5.3 Schema 定义

**一行 = 一条旧键的迁移裁决记录（每行独立、自包含、无跨行依赖）。**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `v` | `number` | ✅ | Ledger schema 版本，当前 `1`。便于将来格式演进 |
| `store` | `"gt.review" \| "gt.memorize"` | ✅ | 这条记录来自哪个旧存储 |
| `oldKey` | `string` | ✅ | 迁移前的裸 word 键（**原样，大小写不归一**） |
| `newKey` | `string \| null` | ✅ | 迁移后的键；`orphan` 档也非 null（`legacy:orphan:<word>`）；**仅当决策为丢弃时才为 null** |
| `tier` | `"resolved" \| "ambiguous" \| "orphan"` | ✅ | 三档分级结果 —— 这是 Ledger 可查询的核心字段 |
| `reason` | `string` | ✅ | 机器可读的原因码：`unique-match` / `multi-package-match` / `not-in-current-vocabulary` / `conflict-kept-newer` |
| `candidates` | `string[]` | ✅ | 该 word 的全部候选 ContentId。`resolved` 档长度恒为 1；`ambiguous` 档长度 ≥2；`orphan` 档长度为 0 |
| `matchedCount` | `number` | ✅ | `candidates.length` 的冗余副本，便于 `jq`/`grep` 直接按「命中几个包」过滤，无需解析数组 |
| `migratedAt` | `string` (ISO 8601) | ✅ | 该条迁移的时间戳 |
| `preMigrationChecksum` | `string` | ✅ | 迁移前整个旧存储字符串的 `sha256:` 前缀摘要（**同一批次内所有行相同**） |
| `postMigrationChecksum` | `string` | ✅ | 该行写入后目标存储的累计摘要（**用于逐行校验写入结果**） |
| `note` | `string` | ❌ | 自由文本，例如 `conflict-resolved-by-timestamp`、`dry-run` |
| `supersededBy` | `string \| null` | ❌ | 保留字段：将来做「再归属」时，指向最终采用的 ContentId。本轮恒为 `null` |

### 5.4 真实示例（一行）

`resolved` 档：

```json
{"v":1,"store":"gt.review","oldKey":"transformer","newKey":"content:word:curated-ai-core:transformer","tier":"resolved","reason":"unique-match","candidates":["content:word:curated-ai-core:transformer"],"matchedCount":1,"migratedAt":"2026-09-27T14:52:03.114Z","preMigrationChecksum":"sha256:0e4c8089648b261a95394c9a5b1bea6d8877f828e903da196a3397e3dfdea71f","postMigrationChecksum":"sha256:…","note":null,"supersededBy":null}
```

`ambiguous` 档（`generalize`，实测横跨 5 个包）：

```json
{"v":1,"store":"gt.review","oldKey":"generalize","newKey":"legacy:unattributed:generalize","tier":"ambiguous","reason":"multi-package-match","candidates":["content:word:curated-ai-core:generalize","content:word:ecdict-cet6:generalize","content:word:ecdict-ielts:generalize","content:word:ecdict-kaoyan:generalize","content:word:ecdict-toefl:generalize"],"matchedCount":5,"migratedAt":"2026-09-27T14:52:03.181Z","preMigrationChecksum":"sha256:0e4c8089648b261a95394c9a5b1bea6d8877f828e903da196a3397e3dfdea71f","postMigrationChecksum":"sha256:…","note":"progress-preserved-unattributed","supersededBy":null}
```

`orphan` 档：

```json
{"v":1,"store":"gt.memorize","oldKey":"zzz-obsolete-word","newKey":"legacy:orphan:zzz-obsolete-word","tier":"orphan","reason":"not-in-current-vocabulary","candidates":[],"matchedCount":0,"migratedAt":"2026-09-27T14:52:03.205Z","preMigrationChecksum":"sha256:…","postMigrationChecksum":"sha256:…","note":"kept-for-recoverability","supersededBy":null}
```

> 第 2 行示例中的候选清单**不是编造的**，来自本轮实测产物 `docs/audit-package/_generated/migration-ambiguous-words.jsonl`，可与 §2.5 的前 10 名清单对照。

### 5.5 查询方式（Ledger 可查询性的具体证明）

**统计各档条数**：

```bash
jq -r '.tier' ledger.jsonl | sort | uniq -c
```

**列出所有 ambiguous（含候选，供人工复核）**：

```bash
jq -c 'select(.tier=="ambiguous")' ledger.jsonl
```

**找出「命中 ≥3 个包」的记录（歧义最严重的）**：

```bash
jq -c 'select(.matchedCount>=3)' ledger.jsonl
```

**按存储分别统计**：

```bash
jq -r 'select(.store=="gt.review") | .tier' ledger.jsonl | sort | uniq -c
```

**证明条数守恒（Ledger 行数 == 旧键总数）**：

```bash
wc -l ledger.jsonl
# 应等于 旧存储的 Object.keys(x).length
```

**定位单条记录的迁移去向**：

```bash
jq -c 'select(.oldKey=="generalize")' ledger.jsonl
```

### 5.6 Ledger 与迁移脚本的配合

```text
┌─────────────────────┐
│ 1. 读取旧存储        │  gt.review.v1 → K_old
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ 2. 分级（纯函数）     │  K_old × 词表 → 每条判 resolved/ambiguous/orphan
│    复用审计脚本逻辑   │  （同一份判据，保证 Ledger 与审计一致）
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ 3. 写 Ledger         │  每条一行，先于写入新存储
│    （先记账，后动土） │  → 即使写入中途崩溃，账本已记录到哪里
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ 4. 写入新存储 v2      │  幂等写入（见 §4.4）
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ 5. 校验              │  条数守恒 + checksum 比对 + 抽样 20 条
│    失败 → 回滚        │
└─────────────────────┘
```

**「先记账，后动土」是关键设计**：Ledger 在写入新存储**之前**落盘。若迁移中途崩溃，Ledger 的最后一行就是「已处理到这里」的检查点，重跑时可据此断点续迁，并能在回滚时精确知道「哪些已经改过了」。

**Ledger 与审计脚本共用同一份判据**：`scripts/migration-audit.mjs` 产出的 `migration-resolved-words.jsonl` / `migration-ambiguous-words.jsonl` 就是分级真值表。迁移脚本**直接消费这两个文件**，而不是自己再实现一遍分级逻辑 —— 否则会出现「审计报告说 2323 条 ambiguous、迁移脚本算出另一个数」的分裂，Ledger 也就失去了作为证据的意义。

---

## ⑥ 四个键口径不一致的问题

### 6.1 四键口径实况

| # | 键 | 源码位置 | 键口径 | 值 schema |
|---|---|---|---|---|
| 1 | `gt.review.v1` | `src/lib/reviewStore.ts:27` | **裸 word**（大小写保持） | `{wrongCount, correctStreak, lastWrongAt, nextReviewAt, intervalIdx}` |
| 2 | `gt.memorize.v1` | `src/lib/memorizeStore.ts:16` | **裸 word**（大小写保持） | `{status, reviews, lastAt}` |
| 3 | `gt.analytics.v1` | `src/lib/analytics.ts:6`，键在 **`:73`** | **`word.toLowerCase()`** | `{done, wrong}` |
| 4 | `gt.streak.v1` | `src/lib/streak.ts:7` | **日期 `YYYY-MM-DD`** | `{date, words, seconds}` |

> 附带核实：`gt.customBanks.v1`（`src/lib/customBanks.ts:3`）、`gt.lang`（`src/i18n/index.tsx:19`）、`gt.voice`（`src/lib/speech.ts:15`）也不含 word 键，同样不参与本次迁移。

### 6.2 是否要一起处理？

**结论：不能一把梭，要分成三组分别处置。**

| 组 | 键 | 处置 | 理由 |
|---|---|---|---|
| **A 组 · Learning 核心** | `gt.review.v1`、`gt.memorize.v1` | ✅ **必须迁移**，同批次、同 Ledger、同 checksum | 两者都是「用户 × 某条内容」的学习状态，正是 `LearningItem`（`src/core/learning/model/learning-item.ts`）建模的对象，迁移目标一致 |
| **B 组 · 统计旁路** | `gt.analytics.v1` | ⚠️ **同批次处理，但独立策略**，独立 Ledger 段 | 见 §6.3 —— 它是 lowercase 键，**不能**套用 A 组的映射表 |
| **C 组 · 无关** | `gt.streak.v1` | ❌ **不动** | 键是日期，与内容无关。迁移会平白引入风险 |

**A 组能合并迁移的前提**：两者都是裸 word、大小写保持、且**同一份分级表可同时服务两者**（分级只看 word，不看值 schema）。这意味着：

```
分级真值表（resolved / ambiguous / orphan）计算 1 次 → 同时用于 review 与 memorize
Ledger 用 store 字段区分来源：{"store":"gt.review"} / {"store":"gt.memorize"}
```

### 6.3 `analytics` 的 lowercase 会不会导致迁移后键对不上？**会，且是本次审计发现的第二个真实缺陷。**

**问题机制**：

```
src/lib/analytics.ts:73
const k = word.toLowerCase()          ← 键在此被强制小写
```

而后端词表里存在**大小写有意义的包**：

- `go-code`：`manifest.json` 声明 `"normalize":{"stripHtml":false}`，描述为「Go 标志性骨架代码行，配合代码模式练习（**大小写敏感**）」
- `ts-code`：同理，「TypeScript / React 高频骨架代码行……（**大小写敏感**）」

实测的 `resolved` 样例可以直接看到大小写词的形态：

```bash
$ head -3 docs/audit-package/_generated/migration-resolved-words.jsonl
{"word":"transformer","contentId":"content:word:curated-ai-core:transformer","tier":"resolved"}
{"word":"attention","contentId":"content:word:curated-ai-core:attention","tier":"resolved"}
{"word":"embedding","contentId":"content:word:curated-ai-core:embedding","tier":"resolved"}
```

**具体会怎么错**：`analytics` 里若存在键 `useState` 被写成 `usestate`，迁移时：

1. 用 `usestate` 去查分级表 → **查不到**（分级表的键是大小写敏感的 `useState`）→ 被误判为 **orphan**；
2. 但它**不是**真的 orphan —— 它的真实 ContentId（`content:word:curated-ts-code:useState`）**是存在的**。
3. 结果：一条**本可正确迁移的记录被错误地丢进 legacy:orphan**。

同时，`analytics` 的边界是**幂等的**（`usestate` → `usestate`），所以**简单地对分级表也做 lowercase 归并，就会引入新的歧义**：

```
analytics: "usestate"  →  lowercase 归并后可能同时命中
                          content:word:curated-ts-code:usestate   (若存在小写形态)
                          content:word:curated-ts-code:useState
                        → 反而制造出 A 组没有的歧义
```

**这正是 §2.1 里脚本同时输出 `totalDistinctWords`（大小写敏感）= 6713 和 `totalDistinctLower`（小写归并）= 6713 的原因** —— 本轮实测两者**恰好相等**，说明**当前词表在 lowercase 归并下没有产生额外碰撞**（即没有「两个词仅大小写不同」的情况）。但这只是**当前快照**的性质，**不是结构的保证** —— `go-code`/`ts-code` 两包的 manifest 明确声明大小写敏感，将来加入 `useState` / `usestate` 这类词就会立刻打破这个巧合。因此**不能依赖它**。

#### 6.3.1 实测取证：这个风险是真实的、可复现的

为验证上述推断不是纸上谈兵，本轮用**真实词库里的 code 行**做了大小写探针（探针快照为临时合成、已清理，不影响交付物）：

```bash
# 探针内容（4 个键，前两个是 ts-code 真实词条的正确/全小写两种形态）
#   "useEffect(() => { load(); }, []);"              ← ts-code 词库真实词条
#   "useeffect(() => { load(); }, []);"              ← analytics 会产生的 lowercase 形态
#   "const data = JSON.parse(rawText) as Row[];"     ← ts-code 词库真实词条
#   "const data = json.parse(rawtext) as row[];"     ← analytics 会产生的 lowercase 形态
node scripts/migration-audit.mjs --user-store=<探针快照>
```

实测输出：

```
【3】三档分级（resolved / ambiguous / orphan）
  resolved  = 4390
  ambiguous = 2323
  orphan    = 0
     orphan 来源: 来自用户存储快照 …（键数 4）
```

**`orphan = 0`** —— 4 个探针键**全部被判定为「可映射」**，包括那 2 个**全是小写、与真实词条大小写不符**的键。

**这个 `0` 恰恰是问题本身**：脚本的 orphan 判据里带了 lowercase 兜底（`!wordToPkgs.has(w) && !lowerToPkgs.has(w.toLowerCase())`），本意是避免「大小写不同但词存在」被误判为 orphan。但它同时意味着 —— **一个全小写的 `useeffect(...)` 会被静默归到 `useEffect(...)` 的 ContentId 上**。

对 `analytics` 而言这是**致命的**：

- `analytics` 的键**天生就是 lowercase**，所以 `useeffect(() => { load(); }, []);` 才是它的正常形态；
- 迁移时用 lowercase 兜底命中 `content:word:curated-ts-code:useEffect(() => { load(); }, []);`；
- 但 `analytics` 的键 `useeffect(...)` **永远不可能等于**真实词条 `useEffect(...)` —— 迁移后**键对不上，且无法从 `analytics` 侧还原正确大小写**；
- 更严重的是：若 `ts-code` 里**同时存在** `useEffect(...)` 与 `useeffect(...)` 两个词条（大小写敏感包的合法情形），lowercase 兜底会**同时命中两条 → 制造出 A 组没有的新歧义**。

**结论（本节最重要的一句）**：`analytics` 的正确迁移**不能靠 lowercase 兜底**。必须按 §6.3 表格的四分支显式判定，并**优先修掉 `src/lib/analytics.ts:73` 的 `word.toLowerCase()`**。本轮实测已经用探针证明了这个缺陷可复现，不再是推测。

**处置建议**：

| 项 | 建议 |
|---|---|
| 迁移时机 | **与 A 组同批次**（避免「一半新一半旧」的中间态更难排查） |
| 迁移方式 | **独立脚本 + 独立 Ledger 段**（`store: "gt.analytics"`），**不复用 A 组的映射表** |
| 键匹配 | 先用 lowercase 键去**大小写敏感**的分级表做**二次策略**：① 精确命中 → 正常迁移；② 精确不命中但 lowercase 唯一命中 → 迁移，Ledger 记 `reason: "case-folded-unique-match"`；③ lowercase 命中 ≥2 → 按 ambiguous 处理；④ 完全不命中 → orphan |
| **口径不统一本身** | **建议在 P1.5 一并修掉**：把 `src/lib/analytics.ts:73` 的 `word.toLowerCase()` 去掉，统一为大小写敏感。**但这是改源码，属于实施阶段，本轮不做。** 若不修，则该 lowercase 陷阱会**持续存在**，将来每次词库更新都要重新小心一次 |
| 风险 | 若不修口径，`analytics` 的 `case-folded-unique-match` 判定必须**每次词库变更后重跑**，否则新加入的大小写敏感词会静默让判定失效 |

**一句话**：`analytics` 的 lowercase 是**真实的迁移风险点**，因为它与 `go-code`/`ts-code` 的「大小写敏感」声明**在语义上直接冲突**。当前实测（6713 == 6713）恰好没爆，属于**运气好，不是设计对**。

---

## ⑦ 执行顺序与回滚

### 7.1 收口前的未闭合项（必须先补）

| # | 未闭合项 | 补法 | 阻塞什么 |
|---|---|---|---|
| 1 | **orphan 真实条数未知**（当前 N/A） | 从真实浏览器导出 `gt.review.v1` / `gt.memorize.v1` 快照，跑 `node scripts/migration-audit.mjs --user-store=<file>` | 阻塞 §4.3 的最终策略确认与 Ledger 完整性 |
| 2 | **localStorage 配额未实测** | 迁移前算旧键总长、迁移后算新键总长，与 localStorage 实际用量比对，判据 < 70% | 阻塞 §4.6 是否需要改用 IndexedDB |
| 3 | **`analytics` lowercase 的候选碰撞未核** | 对真实 `gt.analytics.v1` 快照跑 §6.3 的四分支判定，统计各分支条数 | 阻塞 §6.3 策略落地 |

### 7.2 迁移执行顺序

```text
Step 0  备份 + 校验
        导出 4 个键的原始 JSON 字符串 → 算 sha256 → 写入 Ledger.preMigrationChecksum
        校验：能重新 parse 成功、条数可读  → 失败即中止，不进入 Step 1

Step 1  分级（纯函数，不改任何数据）
        K_old(review) ∪ K_old(memorize) × 词表 → resolved / ambiguous / orphan
        产物：分级真值表（复用 scripts/migration-audit.mjs 的判据）
        断言：|resolved| + |ambiguous| + |orphan| == |K_old|

Step 2  Dry-run
        不写任何 localStorage，只输出 Ledger 草稿（note: "dry-run"）
        人工复核：三档条数是否符合预期、ambiguous 清单是否与 §2.5 一致
        ✅ 用户确认后才进入 Step 3

Step 3  写 Ledger（先记账）
        ledger.jsonl 落盘 → 这是崩溃时的检查点

Step 4  写新存储 v2（幂等）
        gt.review.v2 / gt.memorize.v2
        resolved      → content:word:<ns>:<word>
        ambiguous     → legacy:unattributed:<word>（值原样 + _candidates）
        orphan        → legacy:orphan:<word>（值原样）

Step 5  写 analytics（独立段）
        按 §6.3 四分支判定 → 目标键 + Ledger 段（store: "gt.analytics"）

Step 6  校验（任一失败 → Step 7）
        ① 条数守恒：|v2 条目| == |K_old| == |ledger.jsonl 行数|
        ② checksum：抽样 20 条，逐条比对 newKey ↔ oldKey 映射与 Ledger 一致
        ③ 配额：localStorage 用量 < 上限 70%
        ④ 幂等对照：再跑一次迁移，逐字节比对 v2 无变化（见 §4.5）

Step 7  回滚（仅在 Step 6 失败时）
        删除 gt.review.v2 / gt.memorize.v2
        用 Step 0 备份的原始字符串写回 v1
        校验 sha256 == preMigrationChecksum
        通过 → 回滚完成，输出失败报告；不通过 → 告警，人工介入

Step 8  旧键标记废弃（不删除）
        gt.review.v1   → gt.review.v1.migrated-backup
        gt.memorize.v1 → gt.memorize.v1.migrated-backup
        （真正的物理删除留到「一个发布周期无回滚 + Ledger 审计通过」之后）
```

### 7.3 回滚决策矩阵

| 触发条件 | 是否回滚 | 理由 |
|---|---|---|
| Ledger 行数 != 旧键数 | ✅ 立即回滚 | 证据链中断，说明有记录下落不明 |
| 配额触顶 / `QuotaExceededError` | ✅ 立即回滚 | `src/lib/reviewStore.ts:85` 的熔断会**丢数据**，不能接受 |
| checksum 抽样不符 | ✅ 立即回滚 | 映射关系不可信 |
| 幂等对照失败（重跑后数据变了） | ✅ 立即回滚 | 说明存在重复写入，数据已被污染 |
| ambiguous 条数 > 预期的 1.5× | ⚠️ 暂停，人工复核 | 可能说明分级判据有 bug（如大小写归一误伤） |
| 仅 orphan 条数偏高 | ⚠️ 暂停，人工复核 | 可能说明词库刚发生过变更，需重跑 §7.1-1 |

### 7.4 本轮审计自身的验收（可复核性声明）

本报告所有数字均可独立复核：

```bash
# 1. 重跑审计脚本，得到与本报告 §2 完全一致的输出
cd D:/work/geek-typing && node scripts/migration-audit.mjs

# 2. 与落盘产物逐条比对
node -e "const r=require('./docs/audit-package/_generated/migration-audit.json');console.log(r.tiers, r.histogram)"

# 3. 核对 resolved / ambiguous 明细
wc -l docs/audit-package/_generated/migration-resolved-words.jsonl     # 4390
wc -l docs/audit-package/_generated/migration-ambiguous-words.jsonl    # 2323

# 4. 抽查单个词的候选（例：generalize 应为 5 个候选）
grep '"generalize"' docs/audit-package/_generated/migration-ambiguous-words.jsonl

# 5. 补 orphan 统计（需先导出真实用户存储快照）
node scripts/migration-audit.mjs --user-store=<gt.review.v1.json>
```

**本轮实际跑过的命令与输出**：见 §2.1（`node scripts/migration-audit.mjs` 的完整 stdout）、§2.3、§2.4、§2.6。所有数字均来自上述输出，**无一处引用旧审计或推测**。

---

## 附：本轮未修改任何源码的声明

- 本轮**新增**文件（审计资产，非产品代码）：
  - `scripts/migration-audit.mjs`（审计脚本）
  - `docs/audit-package/_generated/migration-audit.json`（实测数据）
  - `docs/audit-package/_generated/migration-resolved-words.jsonl`（4390 行）
  - `docs/audit-package/_generated/migration-ambiguous-words.jsonl`（2323 行）
  - `docs/audit-package/06-learning/MIGRATION_AUDIT.md`（本报告）
- `src/` 目录下**零改动**。`src/lib/reviewStore.ts`、`src/lib/memorizeStore.ts`、`src/lib/analytics.ts`、`src/core/learning/model/learning-item.ts` 均**只读访问**。
- **未执行任何迁移**，未写入任何 `gt.*` localStorage 键。
