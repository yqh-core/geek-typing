# Stage 1 收口评审材料（2026-10-02）

> 本文档服务于评审人第三轮的点名要求：「下一刀直接围绕 **判据 5 盲区① + 3b 是否值得做 +
> Stage 2 解冻条件** 做一次收口评审」。
> 全部结论都带 `文件:行号` 与实测数字；**未改动任何代码**，`git status --porcelain` 为空，`HEAD = 46bd7d8`。

---

## §0 先给三句结论

1. **「下一刀先修盲区①」这个排序，实测前提是错的 —— 盲区① 现在「未激活」。**
   `ts-code` / `go-code` 至今是 `words: parseWords(...)`（**inline**），压根不进 lazy 清单，
   而兜底路径只对 lazy 包执行 ⇒ **兜底在干净树上一次都没走到过**。修它 = 零收益。
2. **但盲区① 不该被划掉，它该换个位置：它是 3a 的前置，不是独立一刀。**
   盲区① 的**激活条件恰好就是 3a**（把 ts-code/go-code 改成 lazy）。实测：
   这两个包的主路径候选 = **0 条**（整串纯字母 `/^[a-z]{5,}$/i` 一个都不满足，因为 word 是
   `const [state, setState] = useState(initialState);` 这种整条代码骨架），必然 < `PROBE_MIN(3)` ⇒ 走兜底 ⇒ 盲区① 咬人。
3. **真正值得占这一刀的，是「同一个函数的三合一补强」。**
   兜底探测那一段藏着**三个**缺陷（撞源码 / 纯非 ASCII 包恒空 / 含 `"` 的串永远命中不了），
   共用 `asciiPhraseProbes`（`scripts/check-bundle.mjs:316-331`）一个函数，**一次性 25-35 行 + 1 条 falsify** 补完。
   补完之后 3a / 3b / Stage 2 才都有安全垫 —— 这既守住了 Slice 1 定下的「先补门、再谈改词库」，
   又不是为补门而补门。

---

## §1 盲区① 的再定性：未激活（附实测证据）

### 1.1 兜底只对 lazy 包执行

| 事实 | 出处 |
|---|---|
| `collectLazyProbes` 入口先 `entries.filter((e) => e.mode === 'lazy')` | `scripts/check-bundle.mjs:363` |
| `mode === 'lazy'` 由 `parseRegistryEntries` 判定：`有 load: ⇒ lazy`，`有 words/data ⇒ inline` | `scripts/check-bundle.mjs:171-183` |
| 兜底（vocabulary/load/ascii）的触发条件在主路径之后 | `scripts/check-bundle.mjs:382-393` |

### 1.2 现在 inline 的三个包（实测 `grep`）

```
src/core/content/registry.ts:99   { manifest: aiCoreManifest,  localId: 'ai-core',  words: parseWords(aiCoreWords)  }
src/core/content/registry.ts:107  { manifest: tsCodeManifest,  localId: 'ts-code',  words: parseWords(tsCodeWords)  }
src/core/content/registry.ts:108  { manifest: goCodeManifest,  localId: 'go-code',  words: parseWords(goCodeWords)  }
```

`grep -c "load: load" src/core/content/registry.ts` = **7**（cloud-native / frontend / cet4 / cet6 / ielts / kaoyan / toefl）。
⇒ **可能触发兜底的只有 ts-code / go-code，而它们现在是 inline。** 兜底包数实测 = **0**。

### 1.3 因此盲区① 的两个数字（实测）

| 项 | 值 |
|---|---|
| 干净树上走兜底的包数 | **0** |
| 兜底串撞 `src/**`（强制把 ts-code/go-code 置 lazy 后） | **0 / 16**（ts 8 + go 8；`.ts/.tsx` 与整个 src 树都是 0） |
| ts-code 候选池撞源码 | **1 / 50 = 2.0%** —— `export default function App() {` 实测命中 `src/App.tsx:60` |
| go-code 候选池撞源码 | **0 / 50 = 0%** |

⇒ **结论：B 案（不做过滤）今天不会红门，但它是一颗静默地雷 —— 风险面 2%，现在只是「选最长的 8 条」恰好没选中那条撞源码的。**
 whoever 往 ts-code 里挪一条与 App 同形的代码骨架，干净态立刻「部分命中 ⇒ UNKNOWN ⇒ exit 1」，
 且报错 `ts-code 部分命中 k/8（不视为通过）`（`check-bundle.mjs:575-576`）**不区分撞源码 / 真泄漏**，开发者只能自己 diff。

---

## §2 同一函数上另外两个缺陷（前两轮评审都没出现过）

盲区① 不是唯一一条。兜底探测同一个函数上还压着两条，都会让「真泄漏」**到不了 FAIL**：

### 2.1 缺陷二：纯非 ASCII 内容包 ⇒ 候选恒空 ⇒ 判据 5 恒 UNKNOWN

`asciiPhraseProbes` 的正则 `/^[\x20-\x7e]{5,}$/`（`check-bundle.mjs:320`）只收**纯可打印 ASCII**。
Stage 2 若加中文文档包 / 中文新概念包（items 里全是中文），候选集恒为 `∅` ⇒
`probes.length = 0 < PROBE_MIN(3)` ⇒ 判据 5 报「只找到 **0** 个独有探测串」⇒ UNKNOWN ⇒ 恒红。

> 这是**逻辑必然**（正则可证），不是推测。当前仓库无此形态的词库包，实测 10 个 vocabulary 包
> 主路径候选全部 ≥ 29 条，**没有一个是空的** —— 所以它是未来风险，但会在「Stage 2 加第一个中文包」的那一刻毫无征兆地红。
> 前两轮评审材料里只提过「代码骨架类」，**没提纯 ASCII 包这一条**，属于漏项。

### 2.2 缺陷三：含 `"` 的探测串在产物里永远匹配不上

主 chunk 把 `words.json` 的原文塞进 JS 字符串字面量，骨架内部的 `"` 会变成 `\\\"`（3 反斜杠 + 引号）。
实测产物原文：
```
{\"word\":\"return <div className=\"app\">{children}</div>\",\"translation\":\"渲染外层容器并透传子元素\"}
```
⇒ `mainText.includes(probe)` 对含 `"` 的串**恒为 false**（ts-code 1/8、go-code 4/8，共 5/16）。

⇒ 后果：**判据 5 对这两个包的天花板只有 7/8 和 4/8，真泄漏也只能报 UNKNOWN，永远到不了 FAIL。**
顺带说明 `L5b`（`check-bundle.mjs:903-923`）为什么还是绿的：它把串塞进 `/* … */` 注释（`:921`），**绕过了产物转义**,
所以 L5b 绿只证明「FAIL 分支可达」，**不证明「真实 inline 泄漏会到 FAIL」**。

### 2.3 一处陈旧计数（顺手记）

`check-bundle.mjs:244/246` 注释写「13 个 lazy 包」→ 实测 **15**；
`registry.ts:97` 注释「10 vocabulary + 7 类型试金石 + 1 collection = 18 包」→ 实际 **10 + 8 = 18**（demo 有 8 个不是 7 个）。
不影响判据（都是注释），但会误导下一任——建议同刀改掉。

---

## §3 A / B 案实测对比（新数据，A 案内部还要分两种做法）

关键不是「A 还是 B」，而是 **A 按什么做过滤**。实测四组：

| 过滤基准 | 干净态 | 泄漏态分辨力 | 分辨力损失 |
|---|---|---|---|
| **现状（不过滤）** | PASS | 8 条中 7 条命中 ⇒ UNKNOWN | 撞源码时会假阳（见 §1.3） |
| **A-2 按 `src/**` 源码文本过滤** | PASS（0/16 碰撞 = 空操作） | **不变**（仍 7/8 ⇒ UNKNOWN） | **无损失** |
| **A-3 按主 chunk 原文过滤** | PASS | **塌了**：8 条被自己洗掉 ⇒ 样本不足 ⇒ UNKNOWN | 泄漏路径整条废掉 |
| **A-4 按 `stripOwnPayload` 残文** | PASS | **半塌**：probes 8→4，泄漏 3/4 ⇒ UNKNOWN | 泄漏失去 FAIL；且只剥掉 4/8 |
| **B 不做过滤** | 今日 PASS（0/16） | 不变 | 把假阳性保留为未来一次性红门，且报错不可诊断 |

**A-4 为什么只剥掉 4/8**（`check-bundle.mjs:276-279` + `:289`）：`stripOwnPayload` 按 `"${w}"` 整串剥离，
而 `w` 来自 `loadWordSets()` 的 `.toLowerCase()`，产物里带原始大小写（`useState` ≠ `usestate`）⇒ 带大写的 4 条剥不掉。

⇒ **实测结论：A 案只有「按 `src/**` 源码文本过滤」这一支是干净的（无损失）；按主 chunk / stripOwnPayload 过滤都会自我阉割。**

---

## §4 建议的一刀：A-2 + 顺带两条候选筛选

`asciiPhraseProbes`（`scripts/check-bundle.mjs:316-331`）加一个 `excludeText` 第三参，
`:328` 那层 `uniq.filter` 里加 `&& !excludeText.includes(s)`；调用方在兜底分支（`:389`）传入 `src/**` 全文。
`src/**` 全文扫描不用新写 —— `scanSrcManifestRaw()`（`:452-473`）已经是「递归读 `src/**/*.{ts,tsx}` + `scanned===0 ⇒ null`」，
抽出通用 `scanSrcText()` 即可（约 12-15 行复用，非新增）。

**顺带两条**（都在同一个 `uniq.filter` 里，一行一个条件）：
- 排除含 `"` 的候选 ⇒ 让「真泄漏 ⇒ FAIL」重新可达（实测：排除后 ts-code 剩 7 条、go-code 剩 4 条，
  两者 ≥ `PROBE_MIN`，全塞主包都判定 **FAIL**）。
- 兜底候选不足 `PROBE_MIN` 时（纯非 ASCII 包）给出**可诊断的报错**，而不是「找到 0 个」这种让人猜的说法。

**falsify 必须补 1 条（否则这刀等于没交付）**：新增 `L5c`，**按产物形态**（不是塞注释）把 ts-code 真实 word 原文
append 进 `mainText`，断言「真泄漏 ⇒ FAIL」。这条同时把 §2.2 那条隐藏缺陷钉成机器判据。
可选补 `L5d`：断言兜底串集合不含任何出现在 `src/**` 里的串（现成样本 `src/App.tsx:60` 那条），零成本证明「src 过滤真的在防假阳性」。

> 以上**全部未实现**，等评审人拍 A-2 这一支。

---

## §5 Stage 2 解冻条件：现在根本没有清单，只有散落

全仓找不出一份「条件 N 条 + 每条判据编号 + 每条落点」的清单。散在 6 份文档里、14 处表述，
其中 `P1.8-DESIGN-RULINGS-v1.0.md` 与 `P1.8-PLAN-v1.0-FROZEN.md` **对 Stage 2 零贡献**（grep 0 命中）。

| # | 前置条件 | 分类 | 落点 |
|---|---|---|---|
| C-01 | 主 chunk 余量先解开 | ✅ 机器判 + **门槛值缺口** | `check:bundle` 判据 1；「可扩容」的门槛**没定义阈值也没判据** |
| C-02 | N4 瘦身 or 重订预算 | 人工 | 已裁「先瘦身」，INV-3 有机器兜底 |
| C-03 | N5 注册表 codegen | 人工 + **零实现** | codegen 会同时打坏 `validate:20` + `parseRegistryEntries` + `parseWarmUpLiteral` 三处文本判据 ⇒ CI 全红 |
| C-04 | N6 UX 视觉复核（3 条） | 人工，**0 条机器判** | 见 §6 |
| C-05 | **判据 5 盲区① A/B** | 人工，**未激活**（见 §1） | `check-bundle` 判据 5 |
| C-06 | 新内容不得进主 chunk | ✅ 机器判 | 判据 1/2/5 + J2/J3 |
| C-07 | ingest→validate→远程媒体 | ✅ 机器判 | `content:validate` 22 项 + `gate:license` |
| C-08 | N3 R2 凭据 | 外部阻塞，无探针 | `BLOCKED / WAITING EXTERNAL CREDENTIAL` |
| C-09 | `PLANNED_BASELINE` 棘轮重订 | 人工 | INV-3 |
| C-10 | 四层架构路线 | 人工，后两层 0 判据 | — |
| C-11 | 3a/3b/3c 未清 | 人工 | — |
| C-12 | 「**Stage 1 结清**」的定义 | ⚠️ **只一句话，全仓没定义** | 无 |
| C-13 | 不许新增 CI job | ⚠️ 没写 | 无 |
| C-14 | N7–N12 是否阻塞 Stage 2 | ⚠️ 没交代 | 无 |

**建议压成 6 条可执行**（前 3 条机器已能判、后 3 条要人工）：

1. **新内容不得进主 chunk** —— 机器已有（判据 1/2/5 + J2/J3）。
2. **内容链路 ingest → validate → 远程媒体** —— 机器已有（22 项 + INV-5）。
3. **主 chunk 余量 ≥ 12.6% raw / 15.9% gzip** —— 机器已有，**但「可扩容」的门槛值建议补一条判据**（目前是人工拍 + 机器判结果，中间那段没判据）。
4. **判据 5 三合一补强（本次 §4）** —— 补完才谈 3a/3b/加中文包。
5. **N5 codegen 的裁定 + 实现（含「codegen 后三条正则判据仍能解析出 18 条」的前置保险）** —— 现在零实现。
6. **N6 UX 三条的机器判化**：骨架固定 6 行（AST 桶：扫 `memorize-loading` 子元素 ≤ 6）、布局零跳动（CDP 前后 `boundingBox().y` Δ ≤ 2px，现在就能跑）、文案走 i18n（AST 桶 + zh/en 双份 key 存在性）。
   ⚠️ **文档打架**：`P18-NEXT-STEP-PLAN.md:31` 说 N6 是 Stage 1/P1 遗留、`STAGE1-SLICE1:42` 说「面板 lazy 必须等 N6 先签」，
   但 `:69` 又说「N6 不阻塞 Stage 2」——这三句互相矛盾，要评审人先裁一句。

---

## §6 三个未登记的 Stage 2 盲区（都不是本次改动引入）

1. **纯非 ASCII 内容包**（§2.1）—— 加第一个中文包时判据 5 恒 UNKNOWN。
2. **预热预算对新词库完全不生效**：`registry.ts:231` 明写「预热清单运行时不得自行扩张」，判据 3 只算 `WARMUP_IDS` 那 2 个包的 gzip 和。
   新词库进仓库后，chunk 体积只受 `gate-perf.mjs:57` 的 `words-chunk-raw-single = 550000` 单包硬顶约束，**没有 gzip 预算、没有总量**。
   加 10 个 3000 词的包也不会让判据 3 红。
3. **e2e「171 锁死」代码里零断言**：`tests/e2e.mjs` 找不到任何 `TOTAL_CASES` / `===171`，
   171 只存在于 `P18-CLOSURE-STATUS.md:118`、`STAGE1-SLICE2:37` 这类**文档纪律陈述**里 —— **用例数是可以偷加减而 CI 不红的。**
   （一行断言即可钉死，属顺手项，不占刀。）

---

## §7 收口后还剩几件要拍（从 4 件收敛到 2 件）

| 原 4 件 | 现在怎么定性 |
|---|---|
| ① 3b `ai-core` 是否 lazy（≈2.3 KiB） | **仍是独立问题**，且它走主路径（候选 42 条 ≥ 3），**不会激活盲区①**。⇒ 单拍 |
| ② 3a `ts-code`+`go-code`（≈9.7 KiB） | 评审倾向不做；**若不做，盲区① 就永久不激活 = 零风险**，两者一起拍最简单 |
| ③ 判据 5 盲区① A / B | **已降级**：从「Stage 1 结清前置」降为「3a 的前置」；采纳 §4 的 A-2 + 另两条（实测唯一无损失的一支） |
| ④ `PLANNED_BASELINE` 棘轮重订 | 不变，Stage 2 解冻前拍（只许降不许升） |

⇒ **真正要拍的只剩 2 组：A-2 那一刀做不做 / 3a+3b 怎么排；棘轮重订不重订。**
外加一件文档打架要裁：N6 到底是不是 Stage 2 前置（C-04）。

---

## §8 建议的下一刀

**「判据 5 探测三合一」**：`asciiPhraseProbes` 加 `excludeText`（按 `src/**` 过滤）+ 排除含 `"` 候选 +
纯非 ASCII 包可诊断报错；`check-bundle.mjs:355-360` 那段「兜底不做主 chunk 过滤」的注释必须同步改；
新增 `L5c`（按产物形态的真泄漏 ⇒ FAIL）与可选 `L5d`（兜底串不撞源码）。
外加顺手项：`check-bundle.mjs:244/246` 的「13 个 lazy 包」→ 15、`registry.ts:97` 的「7 类型试金石」→ 8，
以及 `tests/e2e.mjs` 末尾一行 `totalChecks === 171` 断言。

**这一刀不碰 3a / 3b / 源码 / 预算常量**，只动 `scripts/check-bundle.mjs` 一个文件。
补完之后 3a、3b、第一个中文内容包都能安全地开工 —— 门不会在加内容的那一刻毫无征兆地红。
