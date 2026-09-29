# W2B 验证内容对照图（Verification Content Map）

> 用途：把已 CLOSED 的 W2B 证据链（matrix commit `8eed60092affac49939ef49ada64cd832c9d431e`，verify **97/97**）
> 与 **实际验证了什么业务行为** 一一对应，供逐条审计。本文是审计索引，不是新证据；
> 原始断言输出见 `docs/audit-package/_generated/evidence/W2B/W2B-TEST-LEARNING-BOUNDARY-WIRING-20260930-003225-R01.txt`
> 等 12 份 artifact。
>
> 本轮要回答的核心审计问题：**W2A 建立的 Repository / namespace 边界，是否真的被 Service Split 接到了业务模块上。**

## 0. 统计口径（四个数字的关系，审计前先读）

| 数字 | 统计层级 | 含义 |
|------|----------|------|
| **97/97** | Evidence Chain 链路层 | 12 个 Evidence 任务 × 每任务 8 项链检查（RunId 格式 / RunId↔文件名 / 文件存在 / SHA256 全长 / 头部 RunId / 头部 Commit / 头部 ExitCode / Status⇔ExitCode）+ 1 项 orphan 检查 = **12 × 8 + 1 = 97** |
| **396** | 测试断言层 | 9 个「带计数」的测试/门禁任务**内部展开**的行为断言总数：`396 = 53 + 28 + 78 + 15 + 12 + 27 + 10 + 169 + 4` |
| **15** | 接线规模 | 本次改道的原生 `localStorage.*` 调用点：`storage.ts` 13（read 4 + write 6 + remove 3）+ `upgrade.ts` 2（read 1 + write 1） |
| **25** | 未接线规模 | `src/` 下除 `persistence/adapter.ts`（唯一合法入口）外**仍未接线**的原生调用点，分布在 10 个文件（§3 逐项列明） |

**396 的构成（机器统计，非心算）**：

```
TEST-PERSISTENCE-BOUNDARY    53   ← W2A 基础设施回归（算式同 W2A §0：7+24+6+15+1）
TEST-LEARNING-BOUNDARY-WIRING 28   ← 本轮新增，接线证明（算式：4+4+11+4+5）
TEST-LEARNING-STORAGE        78   ← 6+5+8+8+9+23+19（A/B/C/D/E/F/G 段）
TEST-LEARNING-SERVICE        15   ← 3+1+2+2+1+6（【1】~【6】）
TEST-LEARNING-INSIGHTS       12   ← 6+6（G6-2 / G6-3）
TEST-MIGRATION-GUARDS        27   ← 4+5+10+8（G3-3 纯函数/确定性 + G3-4 幂等 + G3-6 回滚）
DRYRUN-REAL                  10   ← 3+7（编排器全流水线 + 独立验收）
TEST-E2E                    169   ← 端到端回归
GATE-LEARNING-BOUNDARY        4
--------------------------------
合计                        396
```

**97/97 与 396 层级不同，不应直接比较**：97/97 回答「证据链是否自洽」；396 回答「这些测试任务覆盖了哪些业务行为」。任一 Evidence 任务内部的断言数可以增减，不影响链路验证项数（W2A 的 49/49 vs 53 是同一组关系）。

**口径更正（诚实披露）**：W2B 实现提交信息里写的是「11 处原生 localStorage 改道」，**实际为 13 处**（storage.ts read 4 / write 6 / remove 3），另有 upgrade.ts 2 处，合计 **15**。数字来自 `grep -c` 对本文件的实读，以本文为准；提交信息不改（已冻结在 `8eed600`，改它会破坏 matrix commit == HEAD 的一一对应）。

**漂移约束**：任一断言数或触点数变化时，本文 §0 算式必须与测试输出同步更新 —— 数字漂移视为文档缺陷，不靠审计者心算兜底。

## 1. 十二项 Evidence 任务各自证明什么

| Task | 证明内容 | 证明力边界 |
|------|----------|-----------|
| TSC | 9 个新域模块 + storage-io 类型正确；门面再导出的函数签名与拆分前一致 | 编译期，不证明运行时行为 |
| LINT | `oxlint src/` 零 error（本轮抓到 3 条并修掉，见 §2.6） | 只扫 `src/` |
| GATE-LEARNING-BOUNDARY | 拆分未引入 UI→学习态直连的新违规（B02 门禁 4/4） | 只覆盖学习域既有规则 |
| BUILD | 产物可构建（dist 可出） | 不证明产物行为 |
| TEST-PERSISTENCE-BOUNDARY | **W2A 边界基础设施未被本次拆分破坏**（53 项全绿） | Node 内存桩语义 |
| **TEST-LEARNING-BOUNDARY-WIRING** | **本轮核心**：28 项接线断言（§2.1 逐条映射） | Node 内存适配器；真浏览器语义由 E2E 承担 |
| TEST-LEARNING-STORAGE | 78 项：读写 roundtrip / 写失败 diag 双路 / quota 熔断 / 脏数据 / **G3-6 一键回滚 19 项**（回滚要写 analytics、content 域旧键 —— 正是 owner 路由的真回归点） | Node 内存桩 |
| TEST-LEARNING-SERVICE | 15 项：门面 6 组行为不变（拆分后） | Node 内存桩 |
| TEST-LEARNING-INSIGHTS | 12 项：G6-2 / G6-3 行为不变 | Node 内存桩 |
| TEST-MIGRATION-GUARDS | 27 项：迁移纯函数性 / 确定性 / 幂等性 / 逐字节回滚 | Node 内存桩 |
| DRYRUN-REAL | 10 项：真实用户快照经 Orchestrator 全流水线 + 7 项独立验收（不信任编排器自报） | 演练非生产写入 |
| TEST-E2E | 169 项：**真实浏览器 + 真实 localStorage** 端到端全绿 —— 生产路径上 storage-io 已生效。`main.tsx:14` 在启动时必跑 `learningService.startupMigration()`，因此 **upgrade.ts 的读取改道被真实浏览器覆盖** | 回归证明，不是新功能证明。**覆盖边界**：`upgrade.ts` 的写入分支（`safeSetItem(KEY_BACKUP, …)`）仅在存在 v1 旧数据时触发，E2E 环境未必走到 —— 该分支由 TEST-LEARNING-STORAGE G 段（回滚 19 项）与 DRYRUN-REAL 兜底 |

## 2. TEST-LEARNING-BOUNDARY-WIRING 28 项逐条映射（本轮核心）

> 断言名与 artifact 输出逐字对应；`mem` = 注入的 `MemoryStorageAdapter`，被测代码对存储的全部读写都落在它上面 —— 这是「证明走了 Repository」的可观测手段。

### 2.1 第 1 组 · gt.learning.v2 经 Repository 接线（4 项）

| 断言 | 业务行为 |
|------|----------|
| `saveLearningV2 → ok` | 业务写路径畅通（返回 ok、evicted=0） |
| **字节与改造前一致**（`mem.get(KEY) === JSON.stringify(store)`） | 只走 `setRaw`，**不经 codec** → 落盘字节与改造前逐字节相同（存量数据格式零变更的前提） |
| **键落在 persistence 适配器上** | 写入真的经过了 Repository→StorageAdapter（若仍是原生 localStorage 直写，mem 上不会有这个键） |
| `loadLearningV2 读回等价` | 读路径同样经 Repository |

### 2.2 第 2 组 · letterStats / totals（4 项）

| 断言 | 业务行为 |
|------|----------|
| `saveLetterStats → ok 且字节一致` | 第二个 learning 域键族同样字节保真 |
| `loadLetterStats 读回等价` | 读回一致 |
| `saveTotals → ok 且字节一致` | 第三个键族字节保真（totals 属 learning 域） |
| `loadTotals 读回等价` | 读回一致 |

### 2.3 第 3 组 · migration 域隔离 + 分层约束（11 项）

| 断言 | 业务行为 |
|------|----------|
| `saveMigrationMarker 落盘（migration 域仓路由）` | `gt.migration.v1` 属 **migration 域**，被路由到 migration 仓而非 learning 仓 —— 证明路由由 `resolveKey(key).owner` 驱动 |
| `loadMigrationMarker 读回` | 迁移标记读路径畅通 |
| `clearMigrationMarker 生效` | REMOVE 路径经 Repository |
| **跨域写判红**（settings 键经 learning 路径 → `NamespaceError`） | settings 域键不得由 learning 通道写入 |
| **未注册键写判红**（`gt.unknown.v9`） | §19 冻结不变量：未注册键写入判红，在**真实业务模块**上生效（不只是 Repository 单测里） |
| **非 gt 键写判红**（`other`） | 非 `gt.*` 键禁止经 persistence 层写入 |
| **越界域读判红**（settings 键经 learning 通道读 → throw，**不静默为 null**） | 授权对读写同约束；`NamespaceError` 不再被 `catch` 吞成 null —— 否则「读不到」与「不许读」不可区分，接线正确性无法证明 |
| **仓储层跨域读放行**（`new KeyFamilyRepository(mem,'learning').getRaw('gt.theme') === 'ide'`） | **分层证明**：W2A 契约未变（迁移批次需要跨键族读），收严只发生在「业务模块经本通道访问」这一层 |
| **仓储层跨域写仍判红**（同一仓 `setRaw('gt.theme')` → throw） | 仓储层的读放行 / 写判红不对称性仍在，未被本次改动顶替 |
| **允许域内跨域读放行**（`readKeyRaw('gt.analytics.v1')` 返回值） | 允许域不止 learning：回滚/迁移要读写 analytics、content 域旧键（owner 驱动路由的实际收益） |
| `removeKeyRaw 同域放行` | 合法删除路径畅通 |

### 2.4 第 4 组 · 既有语义保持（4 项）

| 断言 | 业务行为 |
|------|----------|
| 损坏数据 → 空表（`{ letters: {} }`，不抛、不静默构造） | 损坏语义与改造前一致（改造不得借机「顺手修好」） |
| 键缺失 → 空表 | 同上 |
| `learning.v2` 整表非法（数组）→ 空表 | 同上 |
| **存储不可用 → `readKeyRaw` null** | 环境类错误（隐私模式 SecurityError）仍降级为 null —— 与「边界判红」分开：环境问题是环境问题，不是数据损坏 |

### 2.5 第 5 组 · 服务拆分向后兼容（5 项）

| 断言 | 业务行为 |
|------|----------|
| 门面 24 个函数全部导出 | 268 行单体拆成 9 个域模块后，导出集合**不减**（既有 import 全部无需改动） |
| `learningService` 单例成员集合不减 | 单例形状不变 |
| 拆分后 `getState` 行为不变（无记录 → `{record: null, hasRecord: false}`） | 门面聚合未改变语义 |
| 拆分后 `resolveContentId` 行为不变（无 ctx → `''`） | 同上 |
| 拆分后 `rankByWeakness` 返回数组 | 同上 |

### 2.6 本轮抓到的真回归（证明断言非空转，不是摆设）

接线不是一次成功的，三轮缺陷都由测试抓出并修掉 —— 这是「测试确实在证明接线」的直接证据：

1. **owner 路由缺陷**（`learning-storage` 套件 EXIT=1，3 项红）：`repoFor` 最初把「非 migration 键一律路由 learning 仓」，导致回滚路径写 `gt.analytics.v1`（analytics 域）/ `gt.customBanks.v1`（content 域）被跨域判红。修为按 `resolveKey(key).owner` 选仓。
2. **授权只管写、不管读**：加上 owner 路由后 settings 键也能写通（越界域约束丢失）→ 加 `ALLOWED_OWNERS`；随即暴露读路径不对称（断言反变红）→ 定夺为**读写同约束 + NamespaceError 不静默**。
3. **lint 3 条新 error**：`useLearningAdapter` 的 `use*` 前缀被 oxlint 当 React Hook 判违规 → 改名 `setLearningAdapter`（它本就是注入 setter，不是 Hook）。

## 3. W2B 明确不覆盖（诚实边界）

1. **未接线的 25 处原生 `localStorage.*` 调用**（`src/`，10 个文件，剔除注释行后的实读）：

   | 文件 | 处数 | 归属责任 |
   |------|------|----------|
   | `src/lib/learning/diagnostics.ts` | 6 | **本 Wave 未接线**：含 `localStorage.length/key(i)` 全量枚举（Repository 当前不提供枚举原始通道），且该文件为规避循环依赖刻意不走 storage.ts —— 显式披露，待 W3 AST Gate 一并收口 |
   | `src/lib/reviewStore.ts` | 3 | 迁移批次 ②（legacy 三 store） |
   | `src/lib/memorizeStore.ts` | 2 | 迁移批次 ② |
   | `src/lib/analytics.ts` | 2 | 迁移批次 ② |
   | `src/lib/customBanks.ts` | 2 | 迁移批次 ②（content 域） |
   | `src/lib/streak.ts` | 2 | 迁移批次 ②（learning 域，NOT_IN_SCOPE） |
   | `src/lib/speech.ts` | 2 | 迁移批次 ③（settings 域） |
   | `src/hooks/useSettings.ts` | 2 | 迁移批次 ③（settings 域） |
   | `src/i18n/index.tsx` | 2 | 迁移批次 ③（settings 域） |
   | `src/core/persistence/migration-write-guard.ts` | 2 | **刻意不经 Repository**：W1B 冻结的 `applySwitch` 同步切换段（切换必须是无 await 的单一同步段），改道会破坏 commit 原子性 —— W2B 不动 |

2. **静态 boundary gate 仍未建立**：`UI ❌→localStorage` / `业务域 ❌→StorageAdapter` 目前只有**运行时判红**（Repository / namespace / 模块授权三层），AST 静态门禁属 Wave 3（A-3）。
3. **浏览器真 IDB / 多页签**：本 Wave 无 IDB 路径（W1A/W1B 已覆盖）。E2E 是真实浏览器 localStorage，不是 IDB。
4. **迁移本身尚未执行**：W2B 只完成「接线 + 拆分」；learning 域键经 Orchestrator 的真实迁移与 R5 快照对照在 **W2C**。DRYRUN-REAL 是演练，不是生产写入。
5. **性能**：无性能断言（D 档基线属 Wave 5）。
6. **拆分是否「分得对」**：本轮只证明**导出集合不减、行为不变**；模块划分的合理性（9 域是否该再多/再少）是设计判断，不由本证据证明。

## 4. 这些改动在后续 Wave 如何被真实验证

| Wave | 验证方式 |
|------|----------|
| W2C 迁移批次① | learning 域键经 Orchestrator（W1D）+ Repository 真实迁移，R5 快照对照真实数据；届时 storage-io 是迁移写入的唯一通道 |
| Wave 3 AST Gate | `UI ❌→localStorage` / `业务域 ❌→StorageAdapter` 升级为 AST 静态门禁 —— §3.1 的 25 处未接线点将被机械列红，逐批清零 |
| Wave 4 / 5 | Content / Product-Perf：quota 与诊断模块落地，届时 `diagnostics.ts` 的枚举需求一并收口 |
| 每轮 Evidence | `TEST-LEARNING-BOUNDARY-WIRING`（28 项）与 `TEST-PERSISTENCE-BOUNDARY`（53 项）自 W2B 起进固定任务清单，防回退 |

## 5. Acceptance Conclusion（W2B 收口结论）

**W2B CLOSED 的证明范围**：

1. **接线成立**：`lib/learning/storage.ts` 13 处 + `upgrade.ts` 2 处原生读写已收口到 `storage-io → Repository`，且写入**字节与改造前一致**（只走 `setRaw`/`getRaw`，不经 codec），配额熔断 / 损坏告警 / diag 语义零改动；
2. **边界在业务模块上生效**：未注册键写判红、跨域写判红、越界域读写判红、仓储层跨域读放行 —— 四者各自有独立断言，且「仓库层放行 / 模块层收严」的分层被两条断言分别钉住（见 §2.3）；
3. **Evidence Chain**：12/12 Evidence tasks 全 PASS、97/97 chain checks 全绿，**matrix commit == HEAD == `8eed600`**（先提交实现、后跑证据，被测树与提交一一对应）；
4. **零回归**：396 项行为断言全绿，含真实浏览器 E2E 169 项与真实用户快照 DRYRUN 10 项；
5. **服务拆分向后兼容**：24 个函数导出 + `learningService` 单例成员集合不减，既有调用方无需改动；
6. §3 的 **25 处未接线点已逐项列明并分配责任 Wave**，**不作为 W2B 的隐含证明**；§2.6 的三轮真回归已披露（测试非空转）。

**因此：W2B = CLOSED，且不将未覆盖范围误计入 W2B 证明范围。**

（本节为结论钉死，不产生新证据；W2B 的全部证据仍以 `docs/audit-package/_generated/evidence/W2B/` 下的 12 份 artifact 与 verify 链输出为准。）

## 6. 下一步（待你验收后启动）

**W2C 迁移批次①**：learning 域键（`gt.learning.v2` / `gt.letterStats.v1` / `gt.totals.v1` / backup / marker）经 Orchestrator（W1D：Journal + Lock + Guard + Recovery + R5）**真实执行迁移**，落 R5 快照对照；此时 W2B 的接线成为迁移写入的唯一通道，边界从「运行时判红」升级为「生产路径必经」。
