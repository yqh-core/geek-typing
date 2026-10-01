# P18 收口状态总表（A/B/C/D 四步对照）

> 依据：评审结论「**P18 已基本完成工程收口，现在不是继续大改代码的阶段**」给出的四步。
> 评审同时认可 `RELEASE=APPROVED`，审查包落在 `docs/p18/_generated/review/`。
> 本文件只做**总索引 + 判定**，细节分见：
> - `ENGINEERING-HYGIENE-PLAN.md` —— C 步（Engineering Hygiene 53 条告警）分期与实施记录
> - `DECISIONS-POST-P18.md` —— B 步决策、C 步收口补记（§9.2.8–9.2.10）、9.1 前置条件
> - `P1.8-SIGN-OFF-v1.0.md` / `P1.8-DESIGN-RULINGS-v1.0.md` —— 设计裁定与签署

## 1. 四步对照

| 步 | 内容 | 状态 | 落点 |
|---|---|---|---|
| **A** | 先正式完成 P18 审查 / 收口 | ✅ | 审查包 `P18-REVIEW-PACKAGE-2026-10-01.md`；本文件补总收口状态 |
| **B** | 单独处理 3 个决策项 | ⚠️ **2 / 3** | 见 §2 |
| **C** | 另开 Engineering Hygiene 阶段消化 53 个 lint warnings | ✅ **53 → 0**，无一条靠放宽规则实现 | `ENGINEERING-HYGIENE-PLAN.md` §2.4–2.7、§3.1 |
| **D** | 进入产品内容扩充 | ⏸ **前置未满足**（主 chunk 余量只剩 4.9%，见 §3.1） | — |

## 2. B 步逐项（3 个决策项）

| # | 决策项 | 状态 | 依据 |
|---|---|---|---|
| 9.2 | `warmUpVocabulary` 改按需 + 限量 | ✅ 已实施（P18-I） | `DECISIONS-POST-P18.md` §9.2 |
| 9.5 | 7 个 inline 词库改 lazy | ✅ 已实施（P18-J，`9b468e0` / `28b4994` / `76d90ce`） | 见 §3.2，`DECISIONS-POST-P18.md` §9.5.5–9.5.6 |
| 9.1 | R2 / `AssetManifest` | ⏸ **卡外部凭据**（Cloudflare R2 绑定），工程侧无法自行造 | `DECISIONS-POST-P18.md` §9.1；产品前置条件已定稿，不自行推进 |

**B 步实质完成**：唯一挂起项 9.1 的外部依赖不在工程侧可控范围内，已完成的是它的产品前置定稿。

## 3. 三条必须写进下一阶段的硬事实（都是实测，不是估计）

### 3.1 主 chunk 余量只剩 4.9% —— D 步的前置约束

`check:bundle` 判据 1 实测 **424.47 KiB raw / 134.61 KiB gzip**，生效阈值
**439.45 / 141.60 KiB**（分层预算当前停在 `ABSOLUTE_BUDGET` 层，见 `check-bundle.mjs:98`）
⇒ 余量 **3.4% / 4.9%**。

- 这不是 P18 造成的：9.5 只让主 chunk **小 2.52 KiB**，余量变紧来自代码增长（V3-P0a 五页签等）。
- **但对 D 步是硬约束**：往主 chunk 加任何东西都会立刻撞红 ⇒
  扩充前必须先「给主 chunk 瘦身」或「正式重订分层预算」，不能边加边指望门放过。
- 文档里旧写的「420 / 135 KiB 阈值、381.06 / 118.89 KiB 实测、余量 10.2% / 12.0%」
  抄的是更早一次构建的快照，已随 9.5 订正。

### 3.2 9.5 的落点只有两处，不是「必须同步改一堆判据」

立项时判断的「必须同步改的判据」三条**被实测证伪为误判**：`validate.mjs` 判据 19 是
`inlinePkgs.push` 动态累加、判据 20 现算、`check-bundle` 判据 2 是 `dataChunks < lazyCount` 动态比较
⇒ **全仓库不存在 7 / 13 这类硬编码**。真落点 = `registry.ts` 两个注册项 + 两个 `manifest.json`
的 `offline.policy`，外加 e2e 一处假失败（`:bank 2` 段改 `waitForTestId` 轮询）。

结果：inline 7 → 5 包 / Σ 296 词 / 33.65 KiB，lazy 11 → 13，策略一致性 18/18。
`WARMUP_IDS` / `WARMUP_MAX_IDS` / `warmup-ids-baseline.json` **三处零改动** ——
预热时机在首屏之后的 `requestIdleCallback`，小包塞进去换不来首屏收益、只撞双棘轮。

### 3.3 判据表的「当前实测」列是全仓库最容易失真的文档，已经失真

`content/README.md` 与 `CONTENT_CONTRACT.md` 各抄了一份 20 项判据表；门禁每次跑都会打印
**新**的实测值，抄本没人同步 ⇒ 判据 18（1.40/13.08 → 1.78/24.28 KiB）、19（346/37.15 → 296/33.65）、
20（10/10 → 18/18）、21（381.06/118.89 → 424.47/134.61）**四项全部过期**（已随 9.5 订正）。
根治方案不在此阶段做：改成「实测值不在此抄写，以 `content:validate` / `check:bundle` 输出为准」，
或加一条**证伪式**校对脚本（写反了会红）。

## 4. 遗留清单（不进 P18 闭合 43 项）

- **9.1 R2 / AssetManifest** —— 卡 Cloudflare R2 凭据，产品前置已定稿；
- **判据 L1（`gate:lint`）未挂进 `verify-release-gate.mjs`** —— 按计划写明不进 P18 闭合 43 项；
- **9.5 的 UX 加载态未做真机视觉复核** —— 工程侧只交付到「门全绿 + e2e 170/170」为止，
  「固定 6 行骨架 / 布局零跳动 / 文案走 i18n」三条仍与 `P1.8-SIGN-OFF` §9.5 留给 UX 的那一票同一件事；
- **9.3 注册表自动化** 待裁定；`test:offline` 非幂等保持登记；
- **`verify-p17-frozen` 只拦增量、不查冻结区既有文件被改** —— 只登记不下决定；
- **D 步产品内容扩充** —— 须先解 §3.1 的 4.9% 余量。

## 5. 判定

C 步（53 → 0）与 B 步的 9.2 / 9.5 均已落地并推上 main，CI 真机全绿
（`gate-static` 含 `Lint（oxlint）` 跑 `gate:lint` 基线 0、`gate-build`、`gate-e2e`、
`deploy` 四 job 全过）。P18 处于**工程收口完成、仅剩外部凭据与 UX 视觉两票未签**的状态。
