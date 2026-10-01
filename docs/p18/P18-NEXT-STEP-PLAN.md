# P18 之后的下一步计划（Contract Freeze + Implementation Expansion）

> 阶段定位：**P18 是「工程收口」，本阶段是「解冻增量」**。
> 解冻之前必须先做完本页 **Stage 0 / Stage 1** 里那些「不改产品行为、只补口径与机器判据」的活，
> 否则 D 步（产品内容扩充）会在 §3.1 那条 4.9% 余量上撞红。
> 本文件只排**下一阶段**的队列，不重复 P18 已经闭合的东西；P18 现状以
> `P18-CLOSURE-STATUS.md` 为准（总索引）、`_generated/review/P18-REVIEW-PACKAGE-2026-10-01.md` 为准（机器证据）。

## 0. 本页的三条口径（先说清楚，免得下一阶段又踩）

1. **「当前实测」不是契约。** 主 chunk 的
   `439.45 KiB raw / 141.60 KiB gzip` 是**契约阈值（原则）**，写在 `scripts/gate-perf.mjs`、
   由 `scripts/check-bundle.mjs` 分层校验；`424.47 KiB` 那组是**当前预算层的实测值**，
   只作为验证输出来源引 `npm run check:bundle` 的输出，**任何文档都不许再抄写它**。
   抄写是这个仓库恒久的失真源（见 `P18-CLOSURE-STATUS.md` §3.3）。
2. **9.1 依旧 `BLOCKED / WAITING EXTERNAL CREDENTIAL`。** Cloudflare R2 凭据没到位之前，
   工程侧不许自行造产物、不许把半波记成 PASS —— 这条不因进入下一阶段而改变。
3. **每条遗留都要标注「谁拍板 / 工程是否可控 / 证据落点」。** 三者缺一项就说明它还没资格进队列。

## 1. 队列（按优先级，全部可独立排期，彼此无环）

图例：`工程可控` = 不需要外部凭据或他人投票就能开工；`拍板` = 需要 yqh 先答一句话。

| # | 优先级 | 项 | 状态（ inheriting from P18） | 需拍板 | 工程可控 | 证据落点 |
|---|---|---|---|---|---|---|
| **N1** | **P0** | **判据 L1（`gate:lint`）未挂进 `verify-release-gate.mjs`** | 已登记，按计划写明「不进 P18 闭合 43 项」 | 否（一句话决定接 or 不接） | ✅ | `npm run release:gate` 的判据总数；`npm run gate:lint` 输出 |
| **N2** | **P0** | **`warmBanks` 生产缺口**：SW 激活 >5s 时预热在「未接管」状态下 import ⇒ 静默失效；`Promise.allSettled` 吞错无日志 | P18 只登记、未改（§4.1） | 否 | ✅ | e2e 预热探针观察 + 生产构建真机首访日志 |
| **N3** | **P0** | **9.1 R2 / `AssetManifest` 资产半波** | ⏸ `BLOCKED / WAITING EXTERNAL CREDENTIAL` | ✅ **是**（R2 凭据绑定） | ❌ | `DECISIONS-POST-P18.md` §9.1 前置条件已定稿，产物不存在即不许 PASS |
| **N4** | **P1** | **D 步内容扩充的前置：主 chunk 瘦身 or 正式重订分层预算** | 卡 §3.1 的 4.9% 余量 | ✅ **是**（选瘦身还是重订） | 部分 | `npm run check:bundle` 判据 1；`scripts/gate-perf.mjs` |
| **N5** | **P1** | **9.3 注册表自动化**（`import.meta.glob` 会把全量词库拖进主包） | 侦察结论已有，待裁定 | ✅ **是** | 部分 | `check-bundle` 判据 2/4/5 与 `validate.mjs` 判据 20 都是文本扫描 `registry.ts`，动了会一起动 |
| **N6** | **P1** | **9.5 的 UX 加载态真机视觉复核**（固定 6 行骨架 / 布局零跳动 / 文案走 i18n 三条） | 工程侧只交付到「门全绿 + e2e 全过」 | ✅ **是**（UX 那一票） | 部分 | `P1.8-SIGN-OFF-v1.0.md` §9.5 留给 UX 的那一票；真机截图 |
| **N7** | **P2** | **`test:offline` 非幂等**：每次跑都会改写已入库的 `tests/_evidence/offline-audit-result.json`（抽样词随机） | 已登记，判断为「非幂等缺陷、不能照 P18-G2 修法处理」 | 否 | ✅ | `git status --porcelain` 跑完是否干净 |
| **N8** | **P2** | **`verify-p17-frozen` 只拦增量，不查冻结区既有文件被改** | 只登记不下决定 | ✅ **是**（补强 or 维持） | ✅ | `npm run verify:p17-frozen` 的覆盖说明 |
| **N9** | **P2** | **`gate:todo` 按行号登记** —— 行号漂移会误登记/漏登记，宜改内容锚点（P18 遗留 9.6） | 低优先 | 否 | ✅ | `npm run gate:todo` 输出 |
| **N10** | **P2** | **CI 外部到期**：`Node.js 20 is deprecated`、`ubuntu-latest → Ubuntu 26`（2026-10-19） | 低优先，时间驱动 | 否 | ✅ | CI run 日志的 warning 行 |
| **N11** | **P2** | **e2e 预热探针根因仍未定死** | 已去敏处置（`a49bcc7`），处置有效 | 否（**不建议继续下沉**） | — | `P18-CLOSURE-STATUS.md` §4.1 + `tests/e2e.mjs` 探针注释 |
| **N12** | **P2** | **判据表「当前实测」列失真的根治**：改成「不抄、以后台输出为准」或加一条证伪式校对脚本（写反了会红） | 已识别为恒久问题 | ✅ **是** | ✅ | `CONTENT_CONTRACT.md` §13.5 / `content/README.md` §15.1 |

## 2. 建议的排期形状（三小段，每段单独可验收）

### Stage 0 —— 闸门补强（不动产品行为，可立刻开工）

1. **N1**：决定 `gate:lint` 是否进发布门。若进，判据 43 → 44，要同步改发布门与所有引用总数的文档；
   若不进，把「不进」写成一行结论而不是继续挂着。
2. **N2**：单独一笔提交修 `warmBanks` 的 controller 等待与吞错（可加日志/可放宽上限），
   配一条能判红的证伪用例。**不要**顺手改预热清单。
3. **N7**：把 `test:offline` 的产物改成写入 `tests/_evidence/` 之外的地方（或明确「跑完必还原」写进 README），
   目标是跑完全套 `git status --porcelain` 干净。
4. **N9 / N10**：两笔零风险的机械活（内容锚点、action 版本升级）。

> Stage 0 做完的验收标准只有一条：**不新增任何产品行为，且 `npm run release:gate` 与
> `npm run test:e2e` 仍全过。**

### Stage 1 —— 解 D 步的预算锁（N4 先行，N5 视裁定结果顺位）

1. **N4 二选一**：
   - **瘦身**：把剩余可 lazy 的模块继续挪出主 chunk（9.5 已经走过一遍这条路，经验在
     `P18-CLOSURE-STATUS.md` §3.2 —— 落点只有 registry + 两份 manifest + 一处 e2e 假失败，没有想象中那么大）；
   - **正式重订分层预算**：`PLANNED_BASELINE` 层只有当次基线，**棘轮只许降不许升**，
     重订要先过 INV-3（预算不得上调）这条不变量的例外评审，不能悄悄改 `gate-perf.mjs`。
2. **N5**：若裁定要注册表自动化，先做**构建期 codegen + 同步判据**，
   并明确它会同时影响 `validate.mjs` 判据 20、`check-bundle` 判据 4/5（都以文本扫描 `registry.ts` 为生）。

### Stage 2 —— 解冻增量（D 步）

- **前提是 Stage 1 结清**：主 chunk 余量回到可扩容的水平，或预算被正式、显式地重订过。
- 内容扩充走「先 `content:ingest` 幂等 + `content:validate` + 媒体走远程（INV-4）」的老路，
  不要再新造一类工作流。
- **N6 / N3 与 Stage 2 并行待命**：UX 视觉复核与 R2 凭据不阻塞 Stage 0/1，可以插空做。

## 3. 明确「下一阶段不做」的事（省得重新讨论一遍）

- 不追 e2e 预热探针的**真根因**（N11）：已用独立证伪脚本把最像根因的那条推翻了，处置也验证有效，
  继续下沉的边际收益低于成本。真要追，只能换成「换 CI 机器复跑 N 次统计 flaky 率」这种办法，那是独立立项。
- 不在 9.1 上替产品编造 R2 产物来换收口。
- 不为了数字好看去放宽任何 lint 规则 / 调高预算（C 步 53 → 0 已经证过：能修就不让步）。

## 4. 一句话总结给评审人

> P18 该闭合的都闭合了；**下一阶段真正卡住进度的只有三件事**——
> **N3（R2 凭据，不在工程侧）、N4（主 chunk 余量，要你拍板瘦身 or 重订预算）、N5（注册表自动化，要你裁定）**，
> 其余九条都是工程侧可独立消化的中低优先项，Stage 0 就能清掉大半。

---

## 5. 本轮评审定调的边界与 Stage 2 路线（2026-10-01）

### 5.1 P18 本体冻结，N1–N12 是「之后」而不是「之内」

评审的定性是：**P18 已进入「工程收口完成 → 下一阶段扩展准备」，不再继续大改 P18 本体**。
于是本队列里那条唯一的例外要单独说清：**N2（`warmBanks`）**。它在 P18 里是「只登记未修」，
那次处置评审是对的（不去追 reload 竞态、只把出事的那一刀拔掉）；登记不等于处理完，
所以把它**落到下一阶段 Stage 0 做掉**，而不是继续留在遗留清单里 —— 这样 `warmBanks` 缺口
既不会让 P18 背着「已知的未修缺陷」睡觉，也不会变成「回头改 P18 本体」。

冻结区硬约束继续生效，不因进入下一阶段而松：

- **INV-1**：`docs/audit-package/` 零改动；
- **INV-3**：`scripts/gate-perf.mjs` 预算常量**一行未动**（瘦身的收益要落在别处，不是改阈值）。

### 5.2 Stage 2 不许再走「把新内容 import 进前端」

这是本轮评审对下一阶段最重要的一条架构定调。内容进包只能走四层：

```
内容层（course / chapter）
  IELTS / 新概念 / Vocabulary / Reading / Listening / Speaking / Video / Documents
        ↓
内容资产层
  manifest · metadata · audio · video · subtitle · image · document · word bank · relations
        ↓
远程资产层
  R2 / CDN / media proxy  ← 这就是 9.1 落地后的形态，不是另起一条路
        ↓
前端按需加载
  首页 → 课程 → 章节 → 学习内容 → 按需拉资源
```

**推论（机器可 enforcing，不要靠自觉）**：Stage 2 新增的任何内容**不允许进入主 chunk**。
谁把它 import 进主图，谁就被 `check-bundle` 判据 1 直接撞红 —— 这正好接上 §3.1 那条 4.9% 余量：
不是「别把内容塞进主包»是劝告句」，而是「塞进去就红」。

同时它反过来定义了 9.1 的价值：R2 / `AssetManifest` 不是「多存几张图的活」，
它是 Stage 2 那三层里**第三层本身的地基**；凭据不到位，第四层（按需加载）只能退化为
「按需 import JS 但没有媒体可远程拿」，等于路线缺一环。这也是为什么 9.1 保持
`BLOCKED / WAITING EXTERNAL CREDENTIAL`、不为了「看起来完成」伪造 PASS。

### 5.3 证据纪律换一档

- P18 的判定基线**锁死**在 `a49bcc7` ⇐ CI run **36846847388**，四门禁同源；
- 从 Stage 0 开始，新产生的证据只认**本阶段自己的同次 run**，
  **不再为了继续证明 P18 而复现整理旧资料**（评审明确： Stage 0/1 开始后按新证据继续即可）；
- 每一笔改动仍走「先提交实现、后跑证据」，门自带证伪自检（`--falsify`），UNKNOWN 视为不通过。

---

## 6. Stage 0 落地结果（2026-10-01，`16bb11a` + `2f0c43f`，CI run 36857119856 四门禁全过）

**N2 `warmBanks` 静默失效 —— 已修，不是只登记了**：
- `src/core/content/registry.ts` 的 `warmUpVocabulary()` 不再 `.catch(() => {})` 吞掉一切，
  改成回传 `{warmed, failed, missing}`；
- `src/main.tsx` 的 controller 等待预算 **5s → 15s**（`SW_CONTROLLER_WAIT_POLLS` 50 → 150），
  SW 未接管与预热未全覆盖两条降级路径都打 `console.warn`；
- 新增 **`scripts/gate-g4.mjs` 的 G4-3②**（W1「每个 `warmUpVocabulary()` 调用点必须处理返回值 + 附近有日志」、
  W2「SW 接管等待预算 ≥ 10s」），判据数 **18 → 20**，`--falsify` 三条注入**全部真判红并还原**
  （裸丢弃 / 预算打回 50 / 两条同时注入）。**这两条会把缺陷锁死，不会有人再把它改回静默。**

**N7 `test:offline` 非幂等 —— 已修**：产物 `tests/_evidence/offline-audit-result.json` 移出 git 跟踪
（`.gitignore` + `git rm --cached`），路径不变、落盘仍可读。实测：跑完 `npm run test:offline`
（`EXIT=0`、离线审计全部通过）后 `git status --porcelain` **只有本计划文档**。

**N9 / N10 —— 代码 0 行改动，因为它们在本阶段之前就已落地**：
N9 的 `gate:todo` 豁免键早已由行号改为内容锚点（实测：给两个锚点文件各插 5 个空行，仍是
`12 处命中：登记 12，违规 0` ⇒ 插空行不影响判定）；N10 的 CI 依赖早已升到
`ubuntu-24.04` / `checkout@v7` / `setup-node@v7`，全仓无 `ubuntu-latest`、无 Node 20。

**未动**：`gate:lint` 挂不挂进 `verify-release-gate.mjs`（N1，等你拍板）；
`WARMUP_IDS` / `WARMUP_MAX_IDS` / `warmup-ids-baseline.json` 三处零改动（沿用 9.5 的纪律）。

### 6.1 四项裁决（2026-10-01 已定，落在这一节，不再下次重开讨论）

| # | 问题 | 裁决 | 代价（如实记，不粉饰） |
|---|---|---|---|
| 1 | **G4-3② 那两条判据进不进 CI** | **不进。** 只作为 Stage 0 的本地 / 证据验证项 | 有人把 `warmBanks` 改回静默、或把预算打回 5s，**CI 不会红**，只有本地跑 `gate-g4 --falsify` 才抓得到。这是**已知且被接受**的代价 |
| 2 | **N1：`gate:lint` 挂不挂进发布门** | **不挂。** 判据数保持 **43**，职责分离 | `gate:lint` = 代码质量门禁（独立跑）；`verify-release-gate.mjs` = 发布验收门禁。lint 规则变化不再牵动发布矩阵 |
| 3 | **N4：主 chunk 路线** | **先瘦身，不动预算。** 正式重订分层预算等 Stage 2 开工前、有真实数据再定 | 4.9% / 3.4% 余量**暂不解锁**，Stage 2 仍未开工 |
| 4 | **`16bb11a` 混进 N7 的 `git rm --cached`** | **不重排历史。** SHA / 证据 / CI / 评审的对应关系保持不动 | `fix(warmup)` 那笔审阅时会看到 109 行不相干的文件删除 |

**升级为 CI 门禁的条件（写死，免得下个人凭感觉升）**：判据已连续多轮稳定通过；
无环境依赖（不依赖 runner 负载/时序）；+15s 预算在真实 CI runner 上验过而非只在本机成立；
失败时能明确判断是真实回归而不是机器波动；能给出稳定的机器 PASS/FAIL；且确实值得当长期质量门禁。
**在这五条都满足之前，G4-3② 一直停在 Evidence / Observation 层。**

于是本文件 §1 队列与 §2 排期随之修正：

- **N1 从「待拍板」改「已裁决：不挂」，判据数恒 43**；
- **N4 从「二选一待定」改「已裁决：先瘦身」** ⇒ Stage 1 第一次动作就是瘦身，动收益、不动 `gate-perf.mjs`；
- **N2 从「只登记未修」变「已修 + 本地可判红」**，同时保留「不进 CI」这一层定位。

**架构分层（这次裁决后的边界）**：

```
gate:lint            → 代码质量，独立跑
verify-release-gate  → 43 项正式 release 判据
Stage 0/1/2          → 本地 / 证据任务 + 阶段门禁，不为了「看起来完整」去扩冻结边界
```

一句总纲：**最小变更、证据优先、职责分离、历史不重写。**

**硬约束复核（我独立跑的，不是听转述）**：
`git diff 13dac12..2f0c43f -- docs/audit-package scripts/gate-perf.mjs scripts/check-bundle.mjs` **输出为空**
⇒ INV-1 冻结区零改动、INV-3 预算常量一行未动；`npm run test:e2e` 仍是 **171/171**（一条没动 e2e）。
