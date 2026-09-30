# P18-B · 资产模型 + 许可硬门 —— CI 证据索引

> 口径与 P1.7 / P18-0 / P18-A 一致：**CI run 记录的是"该 Wave 证据提交"那一次运行的实测结果**。
> 承载 CI 证据的提交本身会再次触发 CI，属于正常现象（"文档不能引用包含自身的 CI run"约定）。
> P18-A 的索引在其自己的目录：`../P18-A/_CI-INDEX.md`。

## 运行记录

| 项 | 值 |
|---|---|
| Wave | P18-B（资产模型 + 许可硬门） |
| 被验证的提交（headSha） | `cfedbb930d929f73a89919a932a0d09482176dab` |
| 说明 | `evidence(P18-B): 许可硬门与资产模型证据 —— 17/17 PASS，链路 CLOSED 137/137` |
| RunId | `36720827743` |
| event | push（main） |
| conclusion | **success** |
| 前置实现提交 | `e3f4a07eb41d58e354ef6e14f5b4fc352eae8159`（`fix(p18-b)`；证据矩阵 `matrix.commit` 即此值） |
| 墙钟 | 232s（`13:19:39Z` → `13:23:31Z`） |

### 四个 job

| job | conclusion | 耗时 |
|---|---|---|
| 门禁① 静态与内容（无产物） | success | 12s |
| 门禁② 构建产物（体积 + 离线） | success | 69s |
| 门禁③ 端到端（test:e2e） | success | 188s |
| 部署到 Cloudflare Pages | success | 36s |

产物：`run-36720827743-jobs.json`。

> ⚠️ **本 Wave 之后门禁① 新增了一步**：`deploy.yml` 在 `content:validate` 之后接入
> `npm run gate:license`（许可/资产入库前置硬门）。也就是说**许可硬门现在每次 push 都会在 CI 里拦**，
> 不是"只在本地跑过"。

### 本 Wave 的机器证据链闭合

```
docs/p18/P1.8-PLAN-v1.0-FROZEN.md §3.1/§3.2/§4（资产模型 + 三条所有权规则 + 门禁规则）
docs/p18/P1.8-DESIGN-RULINGS-v1.0.md ①②③④（进入 P18-B 前的 4 项裁定）
        ↓
990b561  feat(p18-b)   资产模型定稿（assetId 新形态 / AssetManifest / 许可编译期互斥 / 删除 AssetRef）
6f71deb  feat(p18-b)   asset-rules.mjs 单一实现 + content:validate 资产校验扩展
6c2a474  feat(p18-b)   gate:license 入库前置硬门 + 判据 H3 + gate-architecture 接入
f301d6c  fix(p18-b)    evidence-run 破坏性默认值加固 + 删死函数 gitCommit()
261a8ab  docs(p18)     裁定 rev3（§4.1 全表机器化为硬要求）
37fcdcf  feat(p18-b)   §4.1 全表机器化 + PLAN_4_1_COVERAGE 覆盖矩阵与 Plan 逐行对账
e3f4a07  fix(p18-b)    修 TODO 门词法误伤 + 清 3 条失效登记
        ↓
node scripts/evidence-run.mjs --wave=P18-B    → 17/17 PASS（matrix.commit == e3f4a07）
node scripts/evidence-verify.mjs --wave=P18-B → Evidence Chain: CLOSED（137/137 = 17×8+1）
        ↓
cfedbb9  evidence(P18-B)   证据落盘（docs/p18/_generated/evidence/P18-B/）
        ↓
CI run 36720827743         四 job 全 success（含部署）
        ↓
本索引                     CI 证据留档
```

新增的 2 个 P18 证据任务（其余 15 条为系列通用回归）：

| 任务 | 耗时 | 结果 |
|---|---|---|
| `P18-B-GATE-LICENSE` | 0.5s | PASS —— 18 包逐条通过，且输出 **§4.1 覆盖矩阵 7 行**并打印"Plan §4.1 7 行 == 覆盖矩阵 7 行" |
| `P18-B-FALSIFY-GATE-LICENSE` | 2.9s | PASS —— **21/21 用例恰好判红**（含 **2 条判绿对照组**） |

## 本 Wave 的判据与实测数字

| 项 | 实测值 | 门限 / 口径 |
|---|---|---|
| 资产模型 | `AssetManifest = AssetBase & AssetLicense`；assetId = `<宿主包 ContentId>#a:<assetLocalId>` | Plan §3.1；`AssetRef` 已删除（零消费） |
| assetId 文法实现 | **0 条新正则** —— `indexOf('#a:')` 切分 + 复用 `parseContentId` / `isStableLocalId` | 裁定 ③「不引入第二套 ID 文法」 |
| 许可二选一 | 编译期互斥（`?: never`）：负路径实测 `tsc` 报 **2 条错**、正例 **0 错** | 裁定 ④-2b |
| 现有内容包 | 18 包 / 9 类型目录；`assets[]` 包数 = **0** | 资产规则此时"空转"⇒ 真证据在隔离副本证伪 |
| `gate:license --falsify` | **21/21 恰好判红 + 2 判绿对照组**，隔离副本字节还原 | 判定口径：命中集**精确等于**预期 |
| §4.1 覆盖 | Plan §4.1 **7 行 == 覆盖矩阵 7 行**；每行 `owner`/`check`/`falsify` 非空且用例 id 存在 | 裁定 ④-8；缺行/多行/悬空 → 判红 |
| 判据 H3 | TS == 字面真值 == `.mjs` 三方对齐（parseAssetId 13 例 + isAssetOwnedBy 4 例） | 兑现 `asset-rules.mjs` / `validate.mjs` 注释里承诺的 H3 |
| 契约门证伪 | **8/8 判据恰好判红** + 工作树字节还原 + 对照组复绿 | 判据 A–H + H3 |
| 架构门 | **9/9 通过**（`license` 由 PENDING 转为已接入） | `gate-architecture` |
| 主 chunk（raw） | **438.06 KiB**（与本 Wave 之前**一字不差**） | ≤ 439.45 KiB（余量 **0.3%**） |
| 主 chunk（gzip） | 135.83 KiB | ≤ 141.60 KiB（余量 4.1%） |
| 预热预算 | 496.89 KiB | ≤ 600 KiB（余量 17.2%） |
| `release:gate` | **41 PASS / 0 FAIL / 2 PENDING** → `EXIT=1` | 2 条 PENDING：`P18-G2`→P18-D、`P18-G4`→P18-F |
| 冻结区改动 | **0**（155 个登记 artifact 逐字节一致） | INV-1 |

## 本 Wave 暴露并修掉的真问题

1. **"门宣称覆盖全表"但实际没全覆盖**（本轮最重要的发现）。
   冻结 Plan §4.1 列 **7 条**许可规则、§5 声明 `gate:license` 覆盖「§4.1 **全表**」，
   但初版只机器化了 **5 条** —— `commercialUse !== true`、`attributionRequired === true 但无署名文本`
   这 2 条**没有任何判据**，只写在合同文档的一句「口径说明：本波未机器化」里。
   **门每次都绿，因为没实现的东西根本不被检查** —— 与体积门假绿、12→14 白名单漂移同一类。
   修法：7 条全部机器化（`ContentLicense` 增 `attribution?`；`decideLicense` 增两条；
   `gate-license` 增 source `origin`/`provider` 非空与 `sources[].checksum` 须等于载荷实体 SHA-256），
   并建 `PLAN_4_1_COVERAGE` 覆盖矩阵：**每次运行解析 Plan §4.1 表格逐行对账**，
   缺行/多行/证伪用例 id 悬空一律判红，矩阵本身也打印出来。
   证伪用例 `M1`：临时给 Plan §4.1 加一行 → 门**立刻判红**（证明这个绑定是活的）。
2. **判据 H3 原本是"悬空引用"**。`asset-rules.mjs` 与 `validate.mjs` 的注释都写着
   "一致性由判据 H3 证明"，但 **H3 当时并不存在**。已补：用**带字面真值**的语料做
   `TS == 字面真值 == .mjs` 三方对齐（而不是两边互相印证），改坏 `.mjs` 分隔符 → H3 判红并字节还原。
3. **`gate:todo` 词法误伤**。新写的 `asset-rules.mjs` 注释里写了「PENDING ⇒ BLOCKED」被判红
   —— `BLOCKED` 是发布门**状态值**，与 `verify-release-gate.mjs` 同型误伤。
   按 `P1.7-DEFERRED.md` 自身规则「应直接修代码而不是登记」**改写注释**（→「PENDING ⇒ 未通过」）
   而非新增豁免；同时删掉 3 条失效登记（该脚本重写后 `RELEASE=BLOCKED` 只剩在**字符串字面量**里，
   而字符串内容按 §14 本就 ALLOW）。登记数 16 → **13**。
   （这是本 Wave 首次证据生成时 `GATE-TODO` **唯一一次判红**的原因；那一代产物已退役留档。）
4. **`evidence-run.mjs` 的破坏性默认值**。该脚本原不处理 `--help` 且默认 `--wave=W0`，
   而 W0 证据根位于 INV-1 冻结区内 —— 一次「查用法」误触即对冻结区写入
   （退役 24 个已提交产物 + 写 11 个新产物）。已逐字节还原（`verify:p17-frozen` EXIT=0 / 155 文件 0 不符），
   并加固：参数白名单（未知参数 `exit 2`）、冻结区守卫（须显式 `--allow-frozen`，且守卫位于任何写入之前）、
   `--dry-run`（让守卫本身可被安全验证）。

## ⚠️ 遗留风险与移交

- **体积余量仍是 0.3%（1.39 KiB）**。本 Wave 未让它变差（438.06 KiB 不变），
  但**也没有变好** —— 移交 **P18-C**，按裁定 ⑤ 的优先级处理，`INV-3` 预算**禁上调**。
- `P1.8-RELEASE-GATE-CONTRACT.md` 里 `P18-G5` 已由 PENDING → **PASS**；
  剩余 PENDING 两条归属 **P18-D**（`P18-G2` UI 契约门）与 **P18-F**（`P18-G4` 媒体远程）。
- `RELEASE-GATE` **仍未**加入 P18 证据任务表 —— 触发条件是 P18-F 后 PENDING 清零（裁定 ⑥-1）。
- 资产**实体**落地（真实 `assets[]` + `/media/*` 同源代理 + R2）属 **P18-F**；
  本 Wave 只做模型与硬门，因此资产规则的"真证据"来自隔离副本证伪，而非线上真实资产。

## 与 P1.7 冻结基线的关系

- 冻结区 `docs/audit-package/` 在整个 P18-B 期间**零改动**（除上述一次事故外，
  该事故已逐字节还原）：`verify:p17-frozen` 在实现提交、证据提交、CI 三处均实测 PASS。
- P18-B 的证据根按波次分流落 `docs/p18/_generated/evidence/P18-B/`，**不写冻结区** ——
  INV-1 结构性地成立，而不是靠人记得不要碰。
- 冻结区文档里仍描述**旧的** assetId 形态（`asset:<kind>:<namespace>:<localId>`）——
  这是历史记录，按 INV-1 **刻意不改**；新形态以 `docs/p18/P1.8-DESIGN-RULINGS-v1.0.md` ③ 为准。
