# P18-E · 多类型 Query 放开（首个类型 `reading`）—— CI 证据索引

> 口径与 P1.7 / P18-0 / P18-A..P18-D 一致：**CI run 记录的是「该 Wave 证据提交」那一次运行的实测结果**。
> 承载 CI 证据的提交本身会再次触发 CI，属于正常现象（「文档不能引用包含自身的 CI run」约定）。
> 上一波索引：`../P18-D/_CI-INDEX.md`。

## 运行记录

| 项 | 值 |
|---|---|
| Wave | P18-E（`SUPPORTED_TYPES` 改注册表派生 + 首个类型 `reading` 放开） |
| 被验证的提交（headSha） | `2338352f6128394773752979dc093bdb96cf541f` |
| 说明 | `evidence(P18-E): Query/Index 多类型放开（reading）证据 —— 20/20 PASS，链路 CLOSED 161/161` |
| RunId | `36741393552` |
| event | push（main） |
| conclusion | **success** |
| 前置实现提交 | `963082c0de0d65b12f59d140a6e7c33c962e848c`（`docs(p18-e)` 回写；证据矩阵 `matrix.commit` 即此值） |
| 墙钟 | 212s（`16:03:26Z` → `16:06:58Z`） |

### 四个 job

| job | conclusion | 区间（UTC） | 耗时 |
|---|---|---|---|
| 门禁① 静态与内容（无产物） | success | `16:03:29` → `16:03:47` | 18s |
| 门禁② 构建产物（体积 + 离线） | success | `16:03:30` → `16:04:26` | 56s |
| 门禁③ 端到端（test:e2e） | success | `16:03:33` → `16:06:19` | 166s |
| 部署到 Cloudflare Pages | success | `16:06:21` → `16:06:57` | 36s |

产物：`run-36741393552-jobs.json`。

> 门禁① 的步骤名（`内容门禁（content:validate）` 等）**不再带计数** —— P18-D 收尾时已把
> 易漂的计数从步名里删掉（见 `../P18-D/_CI-INDEX.md` §「CI 步骤文案漂移」）。

## 本 Wave 的机器证据链闭合

```
docs/p18/P1.8-DESIGN-RULINGS-v1.0.md §⑨（P18-E：「放开」= 四段齐备；新增判据 I/I2）
        ↓
9dc907d  docs(p18-e)   裁定 §⑨（rev7）
41641c8  feat(p18-e)   Query/Index 多类型放开（reading）：类型派生路由 + ContentHit 联合 + 分族索引
21cb11e  test(p18-e)   sort:'word' 非 word 中性断言改成可证伪形态（order:'desc'）
aed28c3  gate(p18-e)   判据 I「启用即可达」/ I2「检索声明可解析」+ 重写 E 证伪 + I 路由破坏证伪
963082c  docs(p18-e)   回写 ⑨-11 实施结果 + 发布门 P18-G6 刷新 + 修 P18-D CI 索引的 gzip 数字
        ↓
node scripts/evidence-run.mjs --wave=P18-E     → 20/20 PASS（matrix.commit == 963082c）
node scripts/evidence-verify.mjs --wave=P18-E  → Evidence Chain: CLOSED（161/161 = 20×8+1）
        ↓
2338352  evidence(P18-E)  证据落盘（R01）
        ↓
CI run 36741393552        四 job 全 success（含部署）
        ↓
本索引                    CI 证据留档
```

**本波未新增证据任务**（P18 任务表保持 20 条）：P18-E 复用的是
`GATE-CONTENT-TYPE-CONTRACT` / `FALSIFY-CONTENT-TYPE-CONTRACT` / `TEST-CONTENT-QUERY` 三条**既有**任务 ——
改的是它们的**被测对象**（查询层 + 门禁脚本），不是任务清单。

## 本 Wave 的判据与实测数字

### 「放开」的四段（裁定 §⑨-2）

| 段 | 实现 | 机器判据 |
|---|---|---|
| ① 启用集 | `content-query.ts:178` `SUPPORTED_TYPES = queryEnabledTypes()`（**未包 `[...]`**，否则门禁 E 的正则会解析出空集而**假红**） | E `[契约派生]`（word, reading） |
| ② 包路由 | `packageTypesOf()` / `packagesOfTypes()` 由 `descriptor.itemType` 派生；`scopePackages()` **显式滤掉异族包** | **I**：`list` 非空且**每条 `packageLocalId` ∈ 该类型的包**（不外溢） |
| ③ 索引 | `content-index.ts` `buildOne` 改 `getPackage` + 按 **`itemType === 'word'` 形状族**分派；非 word 族条目**绝不进 `byWord`** | **I** + 测试【15】「`byWord` 不含 `content:reading:`」+ 非空对照组 |
| ④ 结果形状 | `ContentHit = WordHit \| ContentItemHit` 判别联合；**`WordHit` 一字不改**；`isWordHit` 收窄 | `tsc -b` + `I` 的 `hit.id` 可解析且 `type === itemType` |

### 门禁：13 条子判据 + `--falsify` 12/12

| 项 | 实测 |
|---|---|
| `gate:content-type-contract` | EXIT=0（A–H(+H3) + **I 启用即可达** + **I2 检索声明可解析**） |
| 同上 `--falsify` | EXIT=0，**12/12 恰好判红**（新增注入 `I-routing` / `I-phonetic` / `I-sort` / `I2`；E 用例重写为「换回手写数组」） |
| E 用例期望命中集 | **`{E, I}`**（不是 `{E}`）—— 换回 `['word']` 漏掉已启用的 `reading` ⇒ 两把锁本该同时响 |
| **`I-routing` 注入实测** | 破坏路由后 `list({type:'reading'})` 返回 **9346 条 word 行**（首条 `content:word:ecdict-cet4:abandon`）、`count` 返回 **9346** —— **非空、不报错，且只被判据 I 看见**（裁定 §⑨-1 预言的静默错数据） |

### 查询层行为

| 项 | 实测 |
|---|---|
| `tests/content-query.mjs` | **179/179**（163 → 179；新增【15】reading 正向组 16 条） |
| `count({type:'reading'})` | **6** == reading 包 `manifest.stats.items`（**从注册表派生，不写死**） |
| 跨族不外溢 | `list({type:'word', packageId:'demo-reading-01'})` == `[]`；反向 `list({type:'reading', packageId:'ielts'})` == `[]` |
| `hasPhonetic` / `sort:'word'` | 非 word 族**中性**（不参与筛选/主序，不是"筛成空"或"反转"）—— 两条断言均经**注入实测**证明可判红 |
| 分页确定性 | `list({type:'reading', pageSize:2})` 两次 id 序列一致、page1/page2 无交集 |
| `queryWord` / `getWord` / `searchWords` / `listWords` / `countWords` | **逐字不动**（word 专属签名不变） |

### 体积（⚠️ 本波唯一的负向变化，INV-3 预算一行未动）

| 项 | P18-C/P18-D 基线 | P18-E | 变化 |
|---|---|---|---|
| 主 chunk（chunk 文件名） | `index-VHayP_Hy.js` | **`index-DXQgLpDB.js`** | 换名 |
| 主 chunk raw | 424.25 KiB（434433 B） | **432.15 KiB** | **+7.90 KiB** |
| 主 chunk gzip | 134.21 KiB | **136.13 KiB** | +1.92 KiB |
| **raw 余量** | **3.5%**（15.20 KiB） | **1.7%（7.29 KiB）** | **−7.90 KiB** |
| 门限 | 439.45 / 141.60 KiB（来源 `absolute`） | 同 | **未动（INV-3）** |
| lazy 语义 | — | **11/11 未进主 chunk**（含 `demo-reading-01`，其 items 在独立 410 B chunk） | ✓ |
| `check:bundle` | 5 项 PASS | 5 项 PASS | ✓ |

**涨的原因（裁定 ⑨-11 已回写）**：§⑨-5 要求查询层**从 `descriptor.query` 派生** ⇒
`content-query.ts` 必须 `import { CONTENT_TYPE_REGISTRY }` ⇒ 整张 14 条描述表进 runtime 图
（实测 `progressKind 0→10` / `packageLevel 0→14` / `labelKey 0→14`）。
**这推翻了裁定 ⑦-2 的前提**（「减少主包 registry metadata 已天然满足」）—— 已回写，并登记 **P18-E′**
（registry runtime 投影：只留 `type`/`itemType`/`queryEnabled`/`query`），
**触发条件 = raw 余量 < 1.0% 或 P18-F/G 引入主包增长**。

### 其余门

| 项 | 实测 |
|---|---|
| `tsc -b --noEmit` | EXIT=0 |
| `tests/ui-contract.mjs` | **19/19**（六桶计数与 P18-D 完全一致 —— core 改动不触 UI 域） |
| `content:validate` | 18 包 PASS |
| `gate:architecture` | 10/10（`content-type-contract` 子门 EXIT=0） |
| `verify:p17-frozen` | EXIT=0 / 155 文件 0 不符（INV-1 冻结区零改动） |
| `release:gate` | **42 PASS / 0 FAIL / 1 PENDING**（仅 `P18-G4` → P18-F） |

## 本 Wave 暴露并修掉的真问题

1. **`VOCAB_QUERY.match` 漏声明 `definition`，而代码一直在匹配它**（P18-E 之前就存在）。
   声明少一条 ⇒ 契约与实现不符，且没有判据看得见。已补声明 + 新增判据 **I2** 守死
   （声明字段必须落在可实现字段集内；非 word 族的 `query.index` exact 只允许 `id` ——
   倒排未实现，一旦有人加别的 exact 字段即判红，强制先补机制）。
2. **恒真断言**（方法论教训，已并入 `gate-self-falsification` 技能）：
   「`sort:'word'` 对非 word 族中性」写成 `sort:'word'`（asc）**恒真** ——
   rank 恒 0 ⇒ `flip` 乘 0 无效；tie-break 恒升序且含 `title` ⇒ bug 形态给出**逐 id 相同**的顺序。
   改为 `sort:{field:'word', order:'desc'}` 才可证伪；**同一注入下实测 asc 仍绿、desc 判红**。
3. **SIGPIPE 事故**：`gate:content-type-contract --falsify | head` 让 `head` 提前关管道，
   进程在「已注入、未还原」中间态被打死 ⇒ 注入残留，由提交前 `git status` 抓到并还原。
   ⇒ **`--falsify` 严禁用 `head` 截断**；跑完必须 `git status --porcelain` 验残留。
4. **core 实施中的两个自研缺陷**：`search` 非 word 分支 exact 未命中即 `continue` ⇒ rank1/2 永不执行
   （`search({type:'reading', query:'tea'})` 返回 0 条）；测试直接索引 `readingList[0].itemId`
   ⇒ 回归时**崩掉整个脚本**（只有 exit 1、没有失败清单），已改守卫式。

## ⚠️ 遗留风险与移交

- **主 chunk 余量 3.5% → 1.7%（7.29 KiB）**。这是本波最需要被记住的数字：
  P18-F（资产实体化）/ P18-G（真实素材试点）任何一点主包增长都会撞线。
  **应对已就位**：P18-E′（registry runtime 投影，预计可回收大部分 7.90 KiB）已登记并带触发条件；
  **INV-3 预算常量仍然一行未动**。
- **`bypassFacadeImports = 2` 仍未清零**（同 P18-D 移交）；本波未动 UI。
- **UI 侧尚未消费 `reading`**：本波只做 core。UI 消费新类型时会触 `ui-contract` 六桶棘轮
  （尤其 `bypassFacadeImports` 只许降）—— 届时必须走 `./core/content` 门面 barrel（`ContentHit` 已从 barrel 导出）。
- **三处 Node 脚本的 `type === 'word'`**（`gate-content-contract.mjs:47` / `content/ingest.mjs:124` /
  `content/validate.mjs:447`）**登记为 P18-F 前置**：P18-G 试点引入 `relations.json` 前必须扩展它们，
  否则新类型 ContentId 会被判「不可达」。
- **`hasPhonetic` / `sort:'word'` 这类 word 族专属选项**仍挂在通用 `QueryOptions` 上（以"中性"语义 +
  测试断言守着）。把 filter/sort 维度迁进 `descriptor` 登记 **P18-E′**。
- **`evidence-run.mjs:302` 的 `gitCommit()` 死函数**仍未动（裁定：收口期控制变更面）。
- **CI 注解**：`Node.js 20 is deprecated`（checkout/setup-node/wrangler 被强制跑 Node 24）+
  `ubuntu-latest will migrate to Ubuntu 26`。均为低优先项。

## 与 P1.7 冻结基线的关系

- 冻结区 `docs/audit-package/` 在整个 P18-E 期间**零改动**：`verify:p17-frozen` 在实现提交后与本波
  证据里均实测 EXIT=0 / 155 文件 0 不符 —— 且它本身就是 P18 证据表的第 4 条任务。
- P18-E 的证据根落 `docs/p18/_generated/evidence/P18-E/`，**不写冻结区**（INV-1 结构性地成立）。
- `docs/audit-package/**` 里 P1.5 时代的历史数字（如「149 项」）保持原样 —— 那是**当时真值**且在 INV-1 冻结区。
