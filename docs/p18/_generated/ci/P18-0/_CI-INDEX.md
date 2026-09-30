# P1.8 CI 证据索引

> 口径与 P1.7 一致：**CI run 记录的是"该 Wave 证据提交"那一次运行的实测结果**。
> 承载 CI 证据的提交本身会再次触发 CI，属于正常现象（见 P1.7 的"文档不能引用包含自身的 CI run"约定）。

## P18-0 · 基线冻结与保护上线

| 项 | 值 |
|---|---|
| Wave | P18-0 |
| 被验证的提交（headSha） | `bb17148c96aab744ccbfb4eb20564b6b183b2314` |
| 说明 | `evidence(P18-0): 基线冻结与保护上线 —— 证据 12/12 PASS（commit 6ecbb06，matrix commit == HEAD）` |
| RunId | `36694319846` |
| conclusion | **success** |
| 前置实现提交 | `6ecbb06af7041539babe913ea3c45b656c8b7579`（`feat(p18-0)`；证据矩阵 `matrix.commit` 即此值） |

### 四个 job

| job | conclusion |
|---|---|
| 门禁① 静态与内容（无产物） | success |
| 门禁② 构建产物（体积 + 离线） | success |
| 门禁③ 端到端（test:e2e） | success |
| 部署到 Cloudflare Pages | success |

产物：`run-36694319846-summary.txt`、`run-36694319846-jobs.json`。

### 本 Wave 的机器证据链闭合

```
docs/p18/P1.8-PLAN-v1.0-FROZEN.md        冻结 Plan
        ↓
6ecbb06  feat(p18-0)                      实现（新增 INV-1 门 + 证据根分流）
        ↓
node scripts/evidence-run.mjs --wave=P18  → 12/12 PASS（matrix.commit == 6ecbb06）
node scripts/evidence-verify.mjs --wave=P18 → Evidence Chain: CLOSED（97/97 = 12×8+1）
        ↓
bb17148  evidence(P18-0)                  证据落盘（docs/p18/_generated/evidence/P18/）
        ↓
CI run 36694319846                        四 job 全 success（含部署）
        ↓
本索引                                    CI 证据留档
```

### 与 P1.7 冻结基线的关系

- 冻结区 `docs/audit-package/` 在 P18-0 全程**零改动**：
  - `verify:p17-frozen` 在实现提交（`6ecbb06`）与证据提交（`bb17148`）后**两次实测均 PASS**；
  - 证据根按波次分流（`P18*` → `docs/p18/`）使"跑证据"不再写入冻结区。
- INV-1 门的三条主判据（C 提交间路径冻结 / C3 工作树冻结 / D 登记 artifact 逐字节）均已做过**证伪测试**。
