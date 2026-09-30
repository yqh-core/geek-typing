# P1.8 证据树（`docs/p18/_generated/evidence/`）

P1.8 系列各波次的**机器证据**根目录。**不属于 P1.7 冻结区**（`docs/audit-package/**`），
由 `scripts/evidence-run.mjs` 生成、`scripts/evidence-verify.mjs` 校验。

## 目录布局

```
docs/p18/_generated/evidence/
├── README.md                 ← 本文件（系列级索引）
├── P18-0/                    ← P18-0 基线冻结（12/12 PASS，被测 commit 6ecbb06）
│   ├── <RunId>.txt
│   ├── evidence-matrix.json
│   └── evidence-matrix.md
└── P18-A/                    ← P18-A 内容类型契约
    ├── <RunId>.txt           ← 顶层 = 恰好 matrix 引用的那批
    ├── evidence-matrix.json
    ├── evidence-matrix.md
    └── _superseded/          ← 已退役的历史轮（不参与判定），见其 README
```

**每个波次一个独立证据根**（`<WAVE>`）：`P18-A` → `…/P18-A/`，`P18-B` → `…/P18-B/` …
`RunId` 形如 `<WAVE>-<TASK>-<yyyymmdd>-<hhmmss>-R<attempt>`。

## 生成与校验

```bash
node scripts/evidence-run.mjs    --wave=P18-A    # 生成证据（只写 docs/p18/**，不碰冻结区）
node scripts/evidence-verify.mjs --wave=P18-A    # 校验链路：CLOSED / BROKEN
```

- **任务表按「族」共用**：`P18-A` / `P18-B` / … 共用 `P18` 那份任务表
  （`TASK_TABLE[WAVE] ?? TASK_TABLE[WAVE.split('-')[0]]`）。因此**跑 P1.8 各波次只传波次名**，
  不必新增任务表条目。
- **证据根按「波次」独立**：各波次互不覆盖。
- ⚠️ **不要** `--wave=W*` 去 **run** —— `W*` 的证据根在 `docs/audit-package/_generated/evidence/`
  （P1.7 冻结区，INV-1）。`W*` 只允许 `evidence-verify` **只读校验**。

## 每次生成前「退役」旧产物

`evidence-run.mjs` 在写新产物之前，会把本波次**同任务**的旧 `<WAVE>-<task>-*.txt`
`rename` 进该波次的 `_superseded/`，并让 `RunId` 的 attempt 按代递增（`R01` → `R02` …）。于是：

> **波次目录顶层 == 恰好 matrix 引用的那批文件。**

## orphan 语义

「orphan」= 波次**顶层**里不被本波次 matrix 引用的 `.txt`。

| 波次 | 判据 | 原因 |
|------|------|------|
| `P18*`（P1.8） | **严格** —— 出现任何 orphan 即 `BROKEN`（exit 1） | 已恢复按波次独立证据根；顶层应恰好等于 matrix 引用集。 |
| `W*`（P1.7） | **宽松** —— 只列明，不判红 | P1.7 已封版，且 `docs/audit-package/**` 是冻结区（INV-1），不可追溯改判。 |

`_superseded/` 是波次目录的**子目录**，orphan 扫描只读顶层（`readdirSync` 非递归），
故 `_superseded/` 内的历史轮天然不计入判定；`evidence-verify` 会另行**信息性**列出其数量
与最近 3 个文件名。
