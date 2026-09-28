# INCIDENT-ANALYTICS-IDENTITY · analytics 单词身份键 lowercase 事故（P0 Blocker）

| 项 | 内容 |
|---|---|
| 事故 ID | **INCIDENT-ANALYTICS-IDENTITY** |
| 严重度 | **P0 Blocker**（数据正确性：身份键错误导致跨口径静默错数据） |
| 发现时间 | 2026-09-28（G1-4 真实链路样本实测由 PENDING 转 🔴 FAIL 时定位） |
| 修复时间 | 2026-09-28（yqh 批准解冻后同一工作日完成，P1.5-S1） |
| 状态 | ✅ **CLOSED**（修复 + 锁死 + 真实数据复测 + UI 回归，证据链见下） |
| 关联门禁 | **G1-3 / G1-4**（`P1.5-RELEASE-GATE.md`） |
| 关闭人 | P1.5-S1（yqh 2026-09-28 批准解冻：「不要继续绕过去，直接把 analytics 的身份键彻底修掉」） |

---

## 1. 根因（一句话）

`src/lib/analytics.ts` 的 `recordWordDone()` 用 `word.toLowerCase()` 做**单词身份键**，
而 review（`gt.review.v1`）/ memorize（`gt.memorize.v1`）用**原词形** —— 同一个词在
analytics 里被改名，三个 store 无法 join。

`[实测]` 真实链路样本（含 `treeShaking`）上：analytics 键 = `treeshaking`，
review/memorize 键 = `treeShaking` ⇒ `learning-consistency` 判 **`Case conflict = 1`**。

## 2. 为什么是 P0 而不是「小瑕疵」

1. **静默错数据**，不是崩溃：`useEffect` / `Promise` / `treeShaking` 这类大小写敏感词条
   （`go-code` / `ts-code` / `frontend` 包）在 analytics 侧**全部丢失大小写**。
2. **跨口径分裂**：同一次答题在 review 侧记一条、analytics 侧记另一条 ⇒ 任何
   「三口径对齐」的统计/迁移都会**把它们当两个词**（一个永远 orphan）。
3. **阻碍迁移**：`migrate.ts:383` 不得不写专门的回推逻辑把 lowercase 键还原 ——
   属于「下游替上游擦屁股」，且回推依赖内容侧真值，含歧义时无解。

## 3. 修复（三段式：写入 / 读取 / 迁移）

| 层 | 改动 | 文件 |
|---|---|---|
| **① 写入** | 身份键 = **原词形**；函数体内**零** `toLowerCase` | `src/lib/analytics.ts` `recordWordDone()` |
| **② 读取兼容** | 新增 `wordStatOf(a, word)`：原词形优先、miss 才查 lowercase（**只读**，不回写） | 同上 |
| **③ 写入时迁移** | 新增 `absorbLegacyWordKey()`：同词的历史 lowercase 计数**并入原词形键后删除** lowercase 键（lazy migration：老用户打一次字即收敛） | 同上 |
| **④ 消费侧** | `analytics.words[word.toLowerCase()]` → `wordStatOf(analytics, word)` | `src/components/ReviewPanel.tsx:175` |

> **为什么不做一次性全量迁移**：`absorbLegacyWordKey` 在**写入时**收敛，无需单独的迁移任务、
> 无额外 IO、天然幂等（并入后 lowercase 键已删，再写不会重复累加）。V2 的 ContentId 化由
> `migrateV1toV2` 负责（`types.ts:54` 已声明），二者职责不重叠。

## 4. 证据链（缺一项不算 CLOSED）

| 环节 | 证据 | 结果 |
|---|---|---|
| 缺陷复现 | `learning-consistency --user-store=<真实链路样本>`（修复前） | `Case conflict = 1`（`treeshaking`），EXIT=1 |
| 修复实现 | `git diff src/lib/analytics.ts src/components/ReviewPanel.tsx` | 见 `02-current-diff.patch` |
| **行为锁死** | `npm run test:analytics`（**新增**） | **17/17 PASS**（源码级 2 + 行为 15） |
| 类型 | `npx tsc -b` | 干净（EXIT=0） |
| 构建 | `npm run build` | 干净，主 chunk 388.06 KiB raw / 121.25 KiB gzip |
| **真实数据复测** | `learning-consistency --user-store=<200 词快照>`（修复后） | ✅ **`Case conflict = 0`，EXIT=0**；Orphan 0 / Duplicate 0 / Invalid 0 |
| 样本有效性 | `gen-real-snapshot.mjs` 自校验 | 含 **26 个大写词形**（冲突路径**被真实触发**，非「没测到的 0」） |
| **UI 回归** | `npm run test:e2e` | **167/167 PASS**（ReviewPanel 数据通路无回归） |
| 白名单复核 | `git grep toLowerCase -- src/` | 29 行全部归属白名单；`recordWordDone` 函数体 **0 命中** |

## 5. 副作用与遗留

- **无破坏性副作用**：`wordStatOf` 对无 legacy 记录的用户与旧行为等价；`absorbLegacyWordKey`
  只在本词存在历史 lowercase 键时动作，纯小写词（绝大多数）走 `legacyKey === word` 早退分支。
- **遗留（非本单范围）**：`App.tsx:242/252` 用 lowercase 做「包内选词」比对 —— 属
  **A-1 UI 直读词数组债**，与身份键无关，等 `queryWord()` 落地时一并处理（门禁附录 E.5 已记账）。

## 6. 复盘（方法论沉淀）

1. **「PENDING 的实现依赖」可以是一个真缺陷** —— 本轮它把 G1-4 从「跑不出期望」变成
   「跑出了非期望」，这正是 PENDING→FAIL（而不是→PASS）的价值。
2. **修复范围要按「身份键」而不是「所有 toLowerCase」划** —— 字母统计的 lowercase 是合法的
   （`/^[a-z]$/` 语义本就小写）；把合法项一起改掉是**过度收紧**。判据因此从「数行数」升级为
   「写入路径函数体级零旁路 + 其余逐处归属检查」。
3. **真实数据第一次喂进审计器就顶出缺陷** —— 与 INCIDENT-ESAFENET 同一条教训：
   不喂真实输入，静默降级会一直绿下去。
