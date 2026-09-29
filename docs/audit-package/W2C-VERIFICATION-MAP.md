# W2C 验证内容对照图（Verification Content Map）

> 用途：把已 CLOSED 的 W2C 证据链（matrix commit `3d24ea1`，verify **153/153**）
> 与 **实际验证了什么业务行为** 一一对应，供逐条审计。本文是审计索引，不是新证据；
> 原始输出见 `docs/audit-package/_generated/evidence/W2C/` 下 19 份 artifact。
>
> 本轮范围：**迁移批次②（legacy 三 store）+ 批次③（settings 辅助域）+ diagnostics 收口** ——
> 即把 W2A 的 Repository 边界从 learning 单域铺到**全站**，并落成 §1 A-1 要求的 `gate-persistence`。

## 0. 统计口径（四个数字的关系，审计前先读）

| 数字 | 统计层级 | 含义 |
|------|----------|------|
| **153/153** | Evidence Chain 链路层 | 19 个 Evidence 任务 × 每任务 8 项链检查 + 1 项 orphan 检查 = **19 × 8 + 1 = 153** |
| **598** | 测试断言层 | 15 个「带计数」的测试/门禁任务内部展开的断言总数：`598 = 597 + 1`（gate-persistence 1 项判据） |
| **23** | 接线规模 | 本轮改道的原生 `localStorage.*` 调用点：8 个业务文件 17 处 + `learning/diagnostics.ts` 6 处 |
| **0** | 剩余直连 | `src/` 下除 `src/core/persistence/**` 外**已无**原生 localStorage 直连（由 gate-persistence 自证） |

**597 的构成（机器统计，非心算）**：

```
TEST-CONTENT-QUERY            163      TEST-E2E                      169
TEST-LEARNING-STORAGE          78      TEST-PERSISTENCE-BOUNDARY      53
TEST-LEARNING-BOUNDARY-WIRING  28      TEST-MIGRATION-GUARDS          27
TEST-ANALYTICS-IDENTITY        17      TEST-LEARNING-SERVICE          15
GATE-G4                        18      TEST-LEARNING-INSIGHTS         12
GATE-LEARNING-BOUNDARY          4      DRYRUN-REAL                    10
GATE-LEGACY-WORDBANK            2      GATE-PRACTICE-ENGINE            1
------------------------------------------------------------------
合计                          597   + gate-persistence 1 = 598
```

**153/153 与 598 层级不同，不应直接比较**（同 W2A §0 / W2B §0 的口径）。
`AUDIT-LEARNING-R5` 是**报告式**审计（无断言计数行），判据为「五零计数 + 内容侧大小写冲突 count = 0」且 EXIT=0，因此不计入 598。

## 1. 十九项 Evidence 任务各自证明什么

| Task | 证明内容 | 证明力边界 |
|------|----------|-----------|
| TSC / LINT | 25 个改动文件类型正确、`oxlint src/` 零 error | 编译期 / 静态 |
| **GATE-PERSISTENCE**（新增） | **§1 A-1 的核心判据**：`src/` 下 `localStorage` 标识符只允许出现在 `src/core/persistence/**`（扫 92 个文件，违规 0，豁免 7 个文件 29 处提及） | 只扫 `src/`；`tests/` 的 localStorage 桩不在范围内 |
| GATE-LEARNING-BOUNDARY | 拆分未引入 UI→学习态直连（4/4） | 学习域既有规则 |
| **GATE-G4** | 18/18（含本轮范围修正，见 §3.1） | — |
| GATE-LEGACY-WORDBANK / GATE-PRACTICE-ENGINE | 2/2、1/1，既有防倒退门禁未破 | — |
| BUILD | 产物可构建 | 不证明产物行为 |
| TEST-PERSISTENCE-BOUNDARY 53 / WIRING 28 | W2A/W2B 的边界与接线未被本轮 25 文件改动破坏 | Node 内存桩 |
| TEST-LEARNING-STORAGE 78 | 含 **G 段回滚 19 项**：回滚要写 analytics / content 域旧键 —— 通道授权与域路由的直接回归面 | Node 内存桩 |
| TEST-LEARNING-SERVICE 15 / INSIGHTS 12 / ANALYTICS-IDENTITY 17 | 门面与统计身份不被 settings/legacy 接线影响 | Node 内存桩 |
| TEST-MIGRATION-GUARDS 27 | 迁移纯函数性 / 确定性 / 幂等 / 逐字节回滚 | Node 内存桩 |
| TEST-CONTENT-QUERY 163 | 内容层零回归（本轮改了 `zh.ts` 文案，须证明文案改动未破内容断言） | Node 内存桩 |
| **AUDIT-LEARNING-R5** | **§1「每批迁移后 R5 快照对照」的落点**：用**真实用户快照**（`_user-snapshot/real-user-localStorage.json`，非夹具）跑一致性审计，EXIT=0 | 报告式，无断言计数 |
| DRYRUN-REAL 10 | 真实快照经 Orchestrator 全流水线 + 7 项独立验收 | 演练，非生产写入 |
| TEST-E2E 169 | 真实浏览器 + 真实 localStorage：settings 域接线（theme/lang/voice/bank…）与 i18n 文案改动在真实交互下零回归 | 回归证明 |

## 2. 接线设计：一条通道工厂 + 五条最小授权通道

新增 `src/core/persistence/channel.ts`（`createChannel(label, owners, opts)` + `setChannelAdapter`）与
`src/core/persistence/channels.ts`（具名通道）。语义**照抄 W2B 已定夺的三条**：

1. **路由由 owner 驱动**：`resolveKey(key)?.owner` 决定走哪个 `KeyFamilyRepository`；`resolveKey` 为 null → `NamespaceError`（未注册键）。
2. **授权读写同约束**：owner 不在通道 allowlist → `NamespaceError`（读也判红）—— 避免「写不进但读得到」的半边界。
3. **错误分两类**：`NamespaceError` 是边界违规；存储不可用（隐私模式）是环境问题。通道 `read` 对环境问题降级 null，对边界违规抛出（调用点原有的 try/catch 会吃掉它 —— 与 W2B `upgrade.ts` 同口径，改动处已注明）。

| 通道 | allowlist | 供哪些文件 |
|------|-----------|-----------|
| `legacyStoreChannel` | `['learning']` | `reviewStore.ts`(3) / `memorizeStore.ts`(2) / `streak.ts`(2) |
| `analyticsChannel` | `['analytics']` | `analytics.ts`(2) |
| `contentChannel` | `['content']` | `customBanks.ts`(2) |
| `settingsChannel` | `['settings']` | `useSettings.ts`(2) / `i18n/index.tsx`(2) / `speech.ts`(2) |
| `diagnosticsChannel` | `['diagnostics']` + **跨域读 + `allKeys()`** | `learning/diagnostics.ts`(6，含 `length/key(i)` 全量枚举) |

`allKeys()`（全量键枚举）是**诊断域独占**能力：`opts.allKeys` 申请时校验 `label === 'diagnostics'`，其余通道传 true 在构造期即判红 —— 全量枚举只有一个合法通道。

## 3. 必须披露的四件事（诚实边界）

### 3.1 门禁范围被改了一处（`scripts/gate-g4.mjs`），已独立复核

G4-2 把 `src/core/persistence/namespace.ts` 判为「非法持有 learning 键字面量」。worker 主张这是误判（该文件是键名注册表，只登记不读写）。**我没有采信转述，而是把 gate-g4 还原到 `f44d963` 版实测**，结果 5 项 FAIL **全部且仅**指向 `namespace.ts`：

```
❌ 'gt.learning.v2*' 代码级字面量只在允许文件（注释不计） — 非法出现 = src/core/persistence/namespace.ts
❌ 'gt.letterStats.v1*' … ❌ 'gt.totals.v1*' … ❌ 'gt.migration.v1*' … ❌ 'gt.diag.v1*' …
共 18 项，通过 13，失败 5
```

结论：**该判据自 W2A 引入 namespace.ts 起恒定红，与 W2C 改动无关**（当时 W2A/W2B 的证据清单都没包含 gate-g4，所以一直没暴露）。列入允许集是补登记正当持有者（判据查「访问」不查「提及」，且门禁本身会先剥注释），**不是放宽判据迁就代码**。已按此保留。

### 3.2 改了 2 条用户可见中文文案（不是顺手改，是门禁逼出来的）

`src/i18n/zh.ts` 的 `panel.localOnly` / `streak.localOnly` 从「数据只保存在本机 localStorage」改为「数据只保存在本机浏览器」。原因：gate-persistence 对 `src/` 全量扫 `localStorage` 标识符（含字符串字面量）。**替代方案是给 i18n 开豁免 —— 那才是真放宽，所以选择改文案**，且改动后与 en 的 "in your browser" 对齐、对普通用户更可读。e2e 169 项已覆盖相关 UI 并全绿。

### 3.3 ⚠️ 本轮证据有一个缺口：CI 的体积门禁不在清单里，而它当前是红的

`scripts/check-bundle.mjs` **未列入** W2C 任务清单，但它在 CI `gate-build` 里（`deploy.yml:72-74`，`deploy` job 依赖它）。实测当前：

```
1. ✗ FAIL  主 chunk index-LABl2jvS.js：424.20 KiB raw / 133.27 KiB gzip —— raw > 420 KiB
2. ✓ PASS  words-* chunk 3 个 ≥ lazy 包 3 个
3. ✓ PASS  预热 gzip 合计 496.89 KiB ≤ 600 KiB
EXIT=1
```

即 **W2C 的 19/19 PASS 不等于「可以上线」** —— 现在 push 会让 CI `gate-build` 变红并阻断部署。
根因：主 chunk 自基线 `a8d10c0` 的 428,324 B 增至 434,385 B（**+6,061 B**，W2A/W2B/W2C 新增 persistence 层与通道所致）。
**处置**：不偷偷调阈值，按计划 §12 D-2 的预算表机制处理（baseline-derived ×1.15 与人工绝对预算取更严者，且记录 reason），并把 `check:bundle` 纳入 Wave 5 起的固定证据清单。见 §4。

### 3.4 其他不覆盖

- **`tests/` 下的 localStorage 桩**不在 gate-persistence 扫描范围（只扫 `src/`）；
- **浏览器真 IDB / 多页签**：本轮无 IDB 路径（W1A/W1B 已覆盖）；
- **diagnostics 逐键 try/continue**：未注册 `gt.*` 键在通道读时抛 `NamespaceError`，原循环的写法会让异常冲掉整轮 → 改为逐键 try/continue。**语义取舍：宁可少算一条，不可半截快照**（catch 体非空，G4「零静默 catch」不受影响）；
- **State A 的 legacy store 读**：`read` 对存储不可用降级 null，隐私模式下不再打 `console.warn`，返回空表的**结果语义不变**。

## 4. 后续 Wave 如何收口

| Wave | 动作 |
|------|------|
| Wave 3 | AST Boundary Gate（ts-morph 三阶段）+ `gate:architecture` 汇总门 + `docs/ARCHITECTURE-INVARIANTS.md` + TODO Gate |
| **Wave 5 D-1/D-2** | 落 `bench-content.mjs` / `bench-boot.mjs` / `perf-baseline.json` / `gate-perf.mjs`，用 D-2 预算表（derived ×1.15 vs absolute 取严）**解决 §3.3 的体积阻断**，并把 `check:bundle` 与 `gate:perf` 并入固定证据清单 |
| Wave 4 | Content B-1~B-5（新增 7 类试金石包会增大主 chunk —— 必须在 D-2 预算门落地后做，并受其约束） |
| Wave 5 C | Home 组合（不新增业务计算，e2e 新增 ≤6 条） |
| Wave 6 | Evidence/CLOSED：全 Wave 矩阵 + 交付包 HASH-MANIFEST + CI 三门全绿 → 部署 |

## 5. Acceptance Conclusion（W2C 收口结论）

1. **接线铺满全站**：8 个业务文件 17 处 + diagnostics 6 处原生读写已收口到 persistence 通道；`src/` 下除 `src/core/persistence/**` 外**零**原生直连（gate-persistence 自证，扫 92 文件违规 0）；
2. **通道授权是最小授权**：五条通道各持单域 allowlist，跨域读与全量枚举仅诊断域独占；
3. **R5 真实快照对照已做**：`AUDIT-LEARNING-R5` 用真实用户快照跑通（§1「每批后 R5 快照对照」的落点）；
4. **Evidence Chain**：19/19 全 PASS、153/153 链检查全绿，**matrix commit == HEAD == `3d24ea1`**；
5. **598 项断言全绿**，含真实浏览器 E2E 169 项与 content-query 163 项；
6. **§3 四项已显式披露**，其中 **§3.3 是本轮的真实缺口**（CI 体积门禁未入清单且当前 FAIL），**不作为 W2C 的隐含证明**，已分配 Wave 5 D-2。

**因此：W2C = CLOSED（证据链口径）；但「可上线」状态为 BLOCKED —— 阻断项是 §3.3 的主 chunk 体积，不是代码行为问题。**
