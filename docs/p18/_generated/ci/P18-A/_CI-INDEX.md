# P18-A · 内容类型契约 —— CI 证据索引

> 口径与 P1.7 / P18-0 一致：**CI run 记录的是"该 Wave 证据提交"那一次运行的实测结果**。
> 承载 CI 证据的提交本身会再次触发 CI，属于正常现象（"文档不能引用包含自身的 CI run"约定）。
> P18-0 的索引在其自己的目录：`../P18-0/_CI-INDEX.md`。

## 运行记录

| 项 | 值 |
|---|---|
| Wave | P18-A（内容类型契约） |
| 被验证的提交（headSha） | `0fad3f18db6d7f1399404b9dbbee22c3f2363905` |
| 说明 | `evidence(P18-A): 内容类型契约门与证伪自检上线 —— 证据 15/15 PASS，链路 CLOSED 121/121` |
| RunId | `36697690677` |
| event | push（main） |
| conclusion | **success** |
| 前置实现提交 | `ee1fe29ced1f7fbc512e32dd87753e6f79b8c576`（`feat(p18-a)`；证据矩阵 `matrix.commit` 即此值） |

### 四个 job

| job | conclusion | 耗时 |
|---|---|---|
| 门禁① 静态与内容（无产物） | success | 10s |
| 门禁② 构建产物（体积 + 离线） | success | 40s |
| 门禁③ 端到端（test:e2e） | success | 2m38s |
| 部署到 Cloudflare Pages | success | 34s |

产物：`run-36697690677-summary.txt`、`run-36697690677-jobs.json`。

### 本 Wave 的机器证据链闭合

```
docs/p18/P1.8-PLAN-v1.0-FROZEN.md §6 行程 P18-A（评审意见②的落点）
        ↓
ee1fe29  feat(p18-a)                     实现（注册表 + 双向穷尽锁 + INV-6 门 + 证伪自检）
        ↓
node scripts/evidence-run.mjs --wave=P18    → 15/15 PASS（matrix.commit == ee1fe29）
node scripts/evidence-verify.mjs --wave=P18 → Evidence Chain: CLOSED（121/121 = 15×8+1）
        ↓
0fad3f1  evidence(P18-A)                 证据落盘（docs/p18/_generated/evidence/P18/）
        ↓
CI run 36697690677                       四 job 全 success（含部署）
        ↓
本索引                                   CI 证据留档
```

新增的 2 个 P18 证据任务（其余 13 条为系列通用回归）：

| 任务 | 耗时 | 结果 |
|---|---|---|
| `P18-GATE-CONTENT-TYPE-CONTRACT` | 7.0s | PASS —— 判据 A–G 全绿 |
| `P18-FALSIFY-CONTENT-TYPE-CONTRACT` | 31.1s | PASS —— 6/6 判据**恰好判红** + 工作树字节还原 + 对照组复绿 |

## 本 Wave 的判据与实测数字

| 项 | 实测值 | 门限 / 口径 |
|---|---|---|
| 契约类型数 | 14（注册表）/ 13（包级，进 Catalog 类型维度） | 双向穷尽锁：漏一或多一即 `tsc` 红 |
| 注册表引用的 i18n 键 | 28 个（14 类型 × label/unit），zh/en 各 217 条且逐一对齐 | 判据 C |
| 主 chunk（raw） | **438.06 KiB** | ≤ **439.45 KiB**（余量 **0.3%**） |
| 主 chunk（gzip） | 135.83 KiB | ≤ 141.60 KiB（余量 4.1%） |
| 预热预算 | 496.89 KiB | ≤ 600 KiB（余量 17.2%） |
| 内容库 | 18 包 / 9346 词 + 8 探针包 42 条 = 9388 条（10 词汇包 + 8 其他） | 生产实测一致 |
| 冻结区改动 | 0（155 个登记 artifact 逐字节一致） | INV-1 |

生产实测（`verify:prod-catalog`，针对本次部署）：`https://geek-typing.pages.dev/` HTTP **200**；
渲染 `18 词库 · 9388 词`；无 console / page 运行时错误。

## 本 Wave 暴露的两个真问题（已修 / 已记录）

1. **体积门曾在旧产物上假绿**。首次重构让主 chunk 涨到 444.94 KiB 越过预算，但 `check:bundle`
   量的是上一次构建遗留的 `dist`，报 PASS。**重建后重测才发现真 FAIL。**
   修法：`catalog.ts` 不再 import 富契约，app 侧只留精简槽位表，判据 D 强制两者逐项相等。
   教训与 `evidence-run.mjs` 的 `BUILD` 排序呼应（先清 dist 再跑体积门）。
2. **契约门不能依赖 spawn 子进程**。本机 Node 预加载 `node-language-shim`，从 node 进程内
   **同步** spawn 一律 `EBUSY`（异步 spawn 正常，`gate-architecture.mjs:70` 早有同类注记）。
   故判据 G 改用**进程内 TypeScript Compiler API**，并读项目自己的 `tsconfig.app.json`，
   避免"门与构建说的不是一回事"。

## ⚠️ 遗留风险（移交 P18-C）

- 主 chunk 余量仅 **0.3%**（1.39 KiB）。其中 28 个 `type.*` 类型标签约占 1.6 KiB，
  而**当前没有任何 UI 消费这些标签**。INV-3 明令"体积预算禁上调"，因此不能在预算侧让路。
  P18-C（注册表自动化 + 预热/体积改造）需正视：要么给类型标签做懒加载分片，
  要么在预热改造中腾出空间。

## 与 P1.7 冻结基线的关系

- 冻结区 `docs/audit-package/` 在 P18-A 全程**零改动**：`verify:p17-frozen` 在实现提交与证据提交后
  均**实测 PASS**（路径冻结 / 工作树冻结 / 155 个登记 artifact 逐字节一致）。
- P18-A 的证据根仍按波次分流落 `docs/p18/`，不写冻结区 —— INV-1 结构性地成立，
  而非靠人记得不要碰。

## 待办（非本 Wave 范围）

- `scripts/evidence-run.mjs:302` 的 `gitCommit()` 是**本次改动之前就存在的死函数**，
  CI 门禁① 会打印 `Function 'gitCommit' is declared but never used.`（警告，不失败）。
  本次未顺手删是为了避免在 P18-A 里再引入一次"改脚本 → 重跑证据"的循环，留待 P18-B 一并清理。
