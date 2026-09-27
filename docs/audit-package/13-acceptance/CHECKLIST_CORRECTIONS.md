# 整改项订正说明（P0.7 清单对照）

> **文档状态**：待审 —— 用户要求「先出一份订正说明给我审」，审阅通过后才动代码。
> **产出日期**：2026-09-27
> **核实方式**：全部结论均独立复跑命令 / 独立探针实测得出，非转述 worker 报告。
> **标注约定**：`[实测]` = 本轮亲自执行命令或探针得到的数据；`[契约]` = 引自项目文档原文；`[推断]` = 我的判断，未直接实测。

---

## 一、结论摘要

《要点1.docx》P0.7 清单共 16 项（P0 九项 + P1 七项）。经逐条核实：

| 分类 | 数量 | 项号 |
|---|---|---|
| **立论有误，建议撤销或改判** | 3 | 10、11、13 |
| **实际执行中发现问题，需另立缺陷** | 1 | （清单外新增）Memorize 加载态 |
| **计数/行号不可信，需订正基线** | 2 | 10、11 |
| 其余照原清单推进 | 10 | 1、2、3、4、5、6、7、8、9、12、14、15、16 |

---

## 二、逐项订正

### ✅ 第 13 项 `hasFeature()` 接线 —— **建议撤销（立论有误）**

**原清单要求**：把 UI 里「按包名硬编码的能力分支」替换为 `hasFeature(packageId, feature)` 查询。

**核实结果**：

| 核实点 | 实测证据 | 结论 |
|---|---|---|
| UI 是否存在硬编码包名分支 | `grep -rn "bankId ===\|=== 'cet4'\|=== 'ielts'\|packageId ===" src/` → **0 命中** `[实测]` | **不存在需要替换的东西** |
| `features` 是否可信 | 各包 manifest 的 `features.{phonetic,definition}` 由 `content:build` **自动派生**（`src/core/content/schema.ts:42` 注释明示）；ecdict 系 = `true`，curated 系 = `false`，与 `words.json` 实际字段一致 `[实测]` | 数据是准的，但没地方用 |
| UI 现在如何决定显示音标 | `ReviewPanel.tsx:147`、`ReviewPanel.tsx:173` 已是**词条级** `item.phonetic && ...` 条件渲染 `[实测]` | **比包级开关更精确** |
| 清单称「渲染侧 4 处」 | `grep -c phonetic src/components/Memorize.tsx` → **0**；实际渲染音标只有 2 处 `[实测]` | 计数错误 |
| 契约 §12.3 要求替换的目标 | 清单/契约指向 `App.tsx` 的 `mode === 'code'`。实测 `App.tsx:396` 注释为「code 模式大小写敏感：target 用原文比较」，`mode` 是**用户在练习下拉里显式选的** `[实测]` | 用包能力覆盖用户选择 → **会引入错误行为** |

**为什么词条级优于包级（关键论证）** `[推断]`：
包级开关 `hasFeature(pkg, 'phonetic')` 判断的是「这个包**整体**有没有音标」。但实测雅思包 `stats.phonetic = 2986 / items = 3000` `[实测]` —— **有 14 个词条缺音标**。若改用包级开关，这 14 个词会渲染出空的音标标签；现有的词条级判空则正确跳过。

**建议**：第 13 项标记为「**无需实施**」，并把「`hasFeature` 调用数 = 0」从债务指标中移除。`hasFeature()` 作为契约 API 保留（未来新增能力开关时可用），但不计入「未接线」债务。

---

### ⚠️ 第 10 / 11 项 UI 禁直读 words / Query 唯一入口 —— **基线计数与行号均不可信，需订正**

**原清单/契约 §12.6 的表述**：「UI 17 处直读词数组」。

**核实结果**：`[实测]`

| 核实点 | 结果 |
|---|---|
| 真正读词数组的位置 | 约 **11 处**（非 17） |
| 其中真正需要走 Query 层的 | **8 处** |
| 契约 §12.6 所列行号 `App.tsx:231/232/241/251/253/569/572`、`ReviewPanel.tsx:50-55` | **实测均非直读词数组** → 基线建在**失效行号**上 |
| 契约 §12.4 称「基线由 `tests/ui-contract.mjs` 落盘锁定」 | **该文件不存在**。`tests/` 实测只有 `_evidence/ content-query.mjs e2e.mjs offline-audit.mjs preview-server.mjs prod-smoke.mjs` → **棘轮判据当前无实现** |

**建议永久豁免的三类**（否则「归零」目标永远达不到，会把合法代码逼成违规代码）：

| # | 豁免对象 | 理由 | 证据 |
|---|---|---|---|
| 1 | `d.words`（热力图日统计）、`stats.words`（结果计数）、`analytics.words` | 是**统计计数对象**，不是词数组 | `StreakBar.tsx:63-64`、`ResultOverlay.tsx:45`、`ReviewPanel.tsx:136` `[实测]` |
| 2 | `BankManager.tsx:167` 的 `b.words.length` | 读的是 **`CustomBank`（用户自建词库）**——它在 `banks.map()` 里，类定义不在 `content/`、不在 registry，**Query 层看不见它**。改它会直接报错或显示 0 词 | `BankManager.tsx:162-168` 上下文为 `banks.map((b) => ...)` `[实测]` |
| 3 | `App.tsx:757`、`Header.tsx:200` | 读**词数元数据** `manifest.stats.items`。换成 `count()` 需异步化、引入加载态闪烁；而 `count()` 内部本就读同一个 `stats.items` → **绕一圈零收益** | `wordBanks.ts:70` = `bank.count = m.stats.items` `[实测]` |

**Query 层能力缺口** `[实测]`：现有导出仅 `contentQuery = { search, list, get, count }`（`content-query.ts:320`）。缺 **`queryWord(packageId, word): WordHit | null`**：
- 用不了 `getWord(contentId)` —— UI 手上只有 `{bank.id, word}`，**拼 ContentId 需要 namespace，而 namespace UI 拿不到也不该拿**（泄漏即违反 §12.1）
- 用不了 `searchWords({exact})` —— 检索语义、返回数组要 `[0]`，且**无法表达「未命中 → null」**，返回 `[]` 正是静默兜底的温床
- 补这一个函数，可同时修掉契约 §12.6 亲自点名的 🔴 静默空释义（`App.tsx:264` 的 `?? { word: w, translation: '' }`，已实测确认存在）

**建议**：第 10/11 项的基线从「17 处」订正为「**8 处需改 + 3 类永久豁免**」，并**补建 `tests/ui-contract.mjs`** 作为棘轮判据。

---

### 🔴 清单外新增缺陷：`Memorize.tsx:269` 加载中误判为空词库 —— **已实测复现**

**这不是架构洁癖，是真实的功能性缺陷。** 用户已批准「立即修」。

```
if (bank.words.length === 0) return <「当前词库为空」>
```

**触发路径** `[实测]`：懒加载词库（ielts/kaoyan/toefl）的 chunk 拉取中或失败时（断网 / 慢网 / SW 未缓存）→ `App.tsx:170` 显式 `setBankWords([])` 进入「加载词库中」态 → `App.tsx:789` 把该空数组作为 `words` 传给 Memorize → `:269` 判空为真 → **用户看到「当前词库为空」而非加载态**。

**复现输出**（`context.route` 拦 `words-*.js` 全部 hang）：

```
[BLOCK] words-DO8i2GAI.js
[BLOCK] words-LP9e320F.js
[BLOCK] words-Dfqbfxph.js
暖词库文案: true          ← 「当前词库为空」出现（错误）
今日新词: undefined       ← 无新词组
词条: null                ← 无词条
```

**复现要点**（供回归测试参考）：**必须用 `context.route` 而非 `page.route`**。因为 `main.tsx:53` 的 `warmUpVocabulary()` 在 window load 后立即抢跑，`page.route` 挂载太晚拦不住 —— 我前两次尝试因此**假阴性**（错误地判定「不可复现」）。

**根因**：状态机只有「有词」/「空」两态，**缺 loading 态**。

**修复方案**（已实施）：判据用 `bank.load` 存在性 —— `wordBanks.ts:67-71` 仅为 lazy 包挂 `load`/`count`；全部 10 个内置包 `stats.items > 0`（最小 20）⇒ 真·空词库在本项目不存在 `[实测]`。故 `words.length === 0 && bank.load` ⇒ 加载中；`!bank.load` ⇒ 真空。

---

### ℹ️ 第 12 项 `updated` 排序 —— **判定无需改（保留原判）**

`content-query.ts:225-227` 的 `updated` 排序是**有意的退化设计**：词级 `updatedAt` 未接入时退化为包内词序。属设计取舍，非缺陷。维持「无需实施」。

---

## 三、订正前后对照

| 项 | 原清单表述 | 实测 | 建议 |
|---|---|---|---|
| 13 | UI 硬编码能力分支需换 `hasFeature` | UI **零**硬编码分支；渲染已是词条级判空 | **撤销该项** |
| 10/11 | UI 17 处直读 words | 约 11 处真读，**8 处需改** | 订正为 8 处 + 3 类豁免 |
| 10/11 | 基线行号 `App.tsx:231/232/...` | 全部失效，非直读 | 重建基线 |
| 10/11 | §12.4 棘轮由 `tests/ui-contract.mjs` 锁定 | **该脚本不存在** | 补建脚本 |
| — | （清单未覆盖） | `Memorize.tsx:269` 加载中误判为空白 | **新增缺陷，已修** |
| 12 | `updated` 排序需修正 | 有意的退化设计 | 无需改（维持） |

---

## 四、待审事项

1. 第 13 项是否同意**撤销**（并移除 `hasFeature` 调用数债务指标）？
2. 第 10/11 项是否同意基线订正为「8 处 + 3 类永久豁免」？
3. 是否同意**补建 `tests/ui-contract.mjs`** 作为棘轮判据（当前该脚本不存在，契约 §12.4 的约束无实现）？
4. 第 12 项维持「无需改」，是否确认？

---

## 五、附：本轮已完成并验证的项

| 项 | 内容 | 验证 |
|---|---|---|
| 7 | `*:focus` → `:focus-visible`（`index.css:38`） | 探针实测：键盘 Tab → `solid 3px rgb(52,211,153)`；鼠标点击 → `outline: none` `[实测]` |
| 8 | ErrorBoundary（`AppErrorBoundary.tsx`，包在 LangProvider 外层） | 独立测试页实测：boundary 显示数 = 1、`role=alert` = 1、是否白屏 = false、`componentDidCatch` 日志正确 `[实测]` |
| 9 | CI 门禁（`.github/workflows/deploy.yml` 同文件三闸） | `yaml.safe_load` 后逐 job 校验 `needs` 全部有效。**修正了原方案跨文件 `needs` 的语法级致命错误** |
| 14 | testid 去重 | `Header.tsx:209` → `open-bank-manager-import`；`test:e2e` **165/165 PASS** `[实测]` |
| 3 | Audit Ledger 前置：migration dry-run | 全库 **6713** 词 / resolved **4390** / ambiguous **2323（34.6%）**，独立复算吻合 `[实测]` |
