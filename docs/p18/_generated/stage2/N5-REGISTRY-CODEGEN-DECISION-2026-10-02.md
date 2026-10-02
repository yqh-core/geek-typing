# N5 注册表 codegen · 裁定资料（2026-10-02）

> Stage 2 解冻后的**第一决策点**（S2-5）。本文只做**裁定依据**，不动任何代码。
> 全部结论来自读源码 + 判据实现，不引自文档转述。

---

## §0 一句话：N5 不是「做 / 不做」的二选一

「做 codegen」在源码层面至少是**三种做法，代价差一个数量级**：

| 做法 | 生成物形态 | 要改几个判据 |
|---|---|---|
| **A · 形状保持型** | 生成的 `registry.ts` 与手写时**逐字同形** | **0 个** |
| **B · 真重构型** | registry.ts 不再是可解析手写文本（改运行时目录发现 / 生成物注入） | **4 个 + falsify 全量复核** |
| **C · 不做** | 保持现状手写 | 0 |

把这三个混成「做 / 不做」，裁定完还是得回来问一句「那具体是哪种」——**这正是要避免的第五轮**。

---

## §1 实际 blast radius（精确到行，全部实测）

扫 `src/core/content/registry.ts` 文本的判据**一共 4 个入口**，其中两个是**同一条正则的两份拷贝**：

| # | 解析器 | 落点 | 正则 / 判据形态 |
|---|---|---|---|
| 1 | `parseRegistryEntries` | `scripts/check-bundle.mjs:171-182` | `\{[^{}]*localId:\s*['"`…`][^{}]*\}` → `{id, loader, mode}`，`loader` 有 ⇒ lazy，否则 `words/data:` 有 ⇒ inline |
| 2 | `parseWarmUpLiteral` | `scripts/content/warmup-ids.mjs:27` | `\bconst\s+WARMUP_IDS\s*=\s*\[([^\]]*)\]` —— 预热清单的唯一解析入口，判据 3/6 都吃它，**解析不到 ⇒ null ⇒ UNKNOWN（不视为通过）** |
| 3 | `registryLoadMode` | `scripts/content/validate.mjs:140-153` | **与 #1 完全同一条正则**（重复拷贝）→ `missing / ambiguous / conflict / unknown / inline / lazy` |
| 4 | `validate` 判据 20 本体 | `scripts/content/validate.mjs:596-624` | `manifest.offline.policy` ↔ 上表 #3 的 mode 必须一致，否则 FAIL |

### 消费关系

- `parseRegistryEntries` 的 `entries` ⇒ **判据 2**（`:805` lazyCount）、**判据 5**（`:401-402` collectLazyProbes 只取 `mode==='lazy'`）、`--record-baseline`（`:914`）
- `parseWarmUpLiteral` 的 `warmIds` ⇒ **判据 3**（预热字节预算）、**判据 6**（清单长度棘轮）
- `registryLoadMode` ⇒ **validate 判据 20**（22 项内容判据之一）

### ⚠️ 一处口径修正（与 `P18-NEXT-STEP-PLAN.md:30` 的写法不同）

计划里写的是「`check-bundle` 判据 2/4/5 + 判据 20 都是文本扫描 registry.ts」。实测：**判据 4 不扫 registry.ts**。

判据 4（J1/J2/J3）的输入是 `contentManifestKeyUnion()`（`check-bundle.mjs:472`），**读的是构建产物的 manifest 字段并集，跟 registry.ts 文本无关**。
所以真实影响面是 **判据 2 / 3 / 5 / 6 + validate 判据 20**，判据 1（体积）、判据 4、判据 7/8 都不吃 registry 文本。

> 这个修正不改变裁定的本质（三者都得多动判据 2/3/5/6/20），但它决定了 **A 方案到底能不能真的做到 0 改判据** ——
> 因为 A 的唯一前提就是「生成物同形」，而判据 4 不在其列，反而让 A 更好成立。

---

## §2 三个做法的真实代价

### A · 形状保持型构建期 codegen

- **做什么**：扫描 `content/` 目录 → 生成 `registry.ts` 里的 `packages[]` 与 loader 函数，
  **内联 / lazy 由 `manifest.offline.policy` 单一推导**（现在这个区别是手写在 `words:` vs `load:` 上的）。
- **为什么 0 个判据要改**：生成的字面量与手写时同形（`localId: 'x'` / `load: loadX` / `words: parseWords(...)`），
  正则逐字命中，判据 2/3/5/6/20 一律照旧。
- **真收益**：把「manifest 说 lazy、registry 却静态 import」这个**只能靠判据 20 事后兜底**的静默破坏，
  变成**生成即一致** —— 判据 20 从「事后检查」降级为「生成器的断言」。
- **代价**：新增 1 个生成脚本；生成器必须能区分 inline 与 lazy（inline 包只有 3 个：`ai-core` / `ts-code` / `go-code`，都是 `words: parseWords(...)`）；要补 falsify 证明「生成器输出 ⇒ 判据 2/3/5/6/20 仍全绿」。
- **遗留边角**：手写态下一个包的手工步骤 = manifest import + loader + packages 数组项；生成器需在 3 个 inline 包上保持一致。

### B · 真重构型（registry 不再是可解析文本）

- **代价最大**：判据 2/3/5/6/20 全部要重写解析源（改读 manifest 目录 / 生成物注入 / AST），
  `warmup-ids.mjs` 一旦解析不到 **返回 null ⇒ UNKNOWN ⇒ 门红**，这是 fail-closed 设计、不会静默放行。
- 且 `parseRegistryEntries` 与 `registryLoadMode` 是同一条正则的**两份拷贝**（见 §1 #1/#3），
  重构时这两处必须一起改，漏一处就会出现「判据 A 按新形态解析、判据 B 按旧形态解析」的口径漂移。
- 除非 Stage 2 的内容量大到手写 registry 真的成为瓶颈，否则收益/风险比不成立。

### C · 不做

- 加一个内容包仍要手工改 4 处（manifest import / loader / packages 项 / 必要时 WARMUP_IDS），
  但**判据 2/3/5/6/20 就是为这个手工态设计的**，写漏了会被当场拦住。
- 代价是批量导入（IELTS / 新概念 / 词汇书 …）时每次都要人工对齐，纯机械劳动 + 判据兜底。

---

## §3 建议（供拍板，不是结论）

**倾向 A，但把它排到样板之后，不是现在就做。**

理由三条：
1. A 是三个选项里唯一**不触碰判据语义**的（0 改判据），与「最小变更、证据优先」的纪律一致；
2. A 的收益在**批量导入阶段**才兑现，而 Stage 2 的下一步是先跑通「一个课程 → 一个章节 → 词汇/文本 → metadata → audio → subtitle → 练习 → validate → lazy loading → check-bundle → e2e」这条样板链路 ——
   样板跑通之前先上生成器，等于先造工具再定产品形状，生成器会被逼着重做一次；
3. C 也不是坏选项：靠判据兜底的手工态，在批量导入的前 2–3 个包内完全够用。

⇒ 三个选项都摆出来之后，真正要拍的是一句：**A / C / B**。

---

## §5 裁定（评审第五轮之后，2026-10-02）

> **N5 = 不做 codegen。`registry.ts` 保持现状，不改现有 5 个文本判据，不引入新的构建期生成链。**
> Stage 2 直接进入内容扩充。**B 明确否决**（架构级变化、推倒文本判据依赖）；**A 记为待启专项** ——
> 等「registry 维护成本已经成为真实瓶颈」时再单独开一轮，**不为「以后可能需要」提前改架构**。

裁定背后的五条理由（照评审原话留档）：

1. blast radius 已经核实清楚：扫 `registry.ts` 文本的判据是 **判据 2 / 3 / 5 / 6 + validate 判据 20**，
   不需要为了一个「可能的自动化」去动它们；
2. 判据 4 不吃 registry.ts 文本（见 §1 的口径修正）——没必要把影响面夸大；
3. Stage 2 刚解冻，首要目标是**稳定进入内容扩充**，不是在 `registry.ts` 上制造新的结构性变更；
4. A 会新增 codegen + 同步判据 + 构建链路，现在收益还盖不住引入的复杂度；
5. B 是架构级变化，与当前「执行模式」的节奏完全相反。

### 最重要的一条纪律

> **这一步的实际意义是：Stage 1 已经 CLOSED，现在要保护这个 CLOSED。
> 不能为了让 Stage 2 的第一项决策「有交代」，又去制造一层新的验证面。**

所以 N5 从一个「长期悬空项」转成：
**已裁定 · 不做 · 关闭**（A / B 双双记为待启专项，不挂在当前工作面上），
`registry.ts` 在 Stage 2 期间继续是**手写单一事实源**，判据 2/3/5/6/20 继续是它上面那 5 道闸。

---

## §4 无论怎么裁，解冻后第一步都不阻塞

S2-1 / S2-2（新内容不得进主 chunk + validate 链路）机器判已就位，
**N5 裁定前就可以开始攒第一批内容样板**，只要遵守：新包一律 lazy + 独立 chunk，manifest.offline.policy 与实际加载方式一致。
