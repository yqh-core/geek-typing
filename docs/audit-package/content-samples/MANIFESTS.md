# 词库包 manifest 字段对照表（10 包）

> 本表由 `docs/audit-package/_generated/extract-samples.mjs` 从实际 JSON 读取生成，非手写。
> 生成时读取的仓库根：`D:/work/geek-typing`（工作副本，非提交快照）。
> 表中 `stats.*` 取自 manifest 的声明值（实测对照见 `FIELD-COVERAGE.md` 第五节）；`features` 为对象，序列化展示。
> 缺失字段统一记作 `—`。

## 宽表（每行一个包）

| 包目录名 | id | namespace | offline.policy | stats.items | stats.phonetic | stats.definition | contentVersion | contentRevision | schemaVersion | sources[0].origin | sources[0].license.name | sources[0].license.spdx | features | exam |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ai-core | content:vocabulary:curated-ai-core:ai-core | curated-ai-core | inline | 43 | 0 | 0 | 1 | 1 | 4 | curated in-repo (2026 AI 核心词库) | Proprietary (self-curated) | — | {"phonetic":false,"definition":false} | — |
| cet4 | content:vocabulary:ecdict-cet4:cet4 | ecdict-cet4 | inline | 84 | 84 | 84 | 1 | 1 | 4 | ECDICT | MIT License | MIT | {"phonetic":true,"definition":true} | CET-4 |
| cet6 | content:vocabulary:ecdict-cet6:cet6 | ecdict-cet6 | inline | 69 | 69 | 69 | 1 | 1 | 4 | ECDICT | MIT License | MIT | {"phonetic":true,"definition":true} | CET-6 |
| cloud-native | content:vocabulary:curated-cloud-native:cloud-native | curated-cloud-native | inline | 30 | 0 | 0 | 1 | 1 | 4 | curated in-repo (云原生词库) | Proprietary (self-curated) | — | {"phonetic":false,"definition":false} | — |
| frontend | content:vocabulary:curated-frontend:frontend | curated-frontend | inline | 20 | 0 | 0 | 1 | 1 | 4 | curated in-repo (前端词库) | Proprietary (self-curated) | — | {"phonetic":false,"definition":false} | — |
| go-code | content:vocabulary:curated-go-code:go-code | curated-go-code | inline | 50 | 0 | 0 | 1 | 1 | 4 | curated in-repo (Go 代码词库) | Proprietary (self-curated) | — | {"phonetic":false,"definition":false} | — |
| ielts | content:vocabulary:ecdict-ielts:ielts | ecdict-ielts | lazy | 3000 | 2986 | 2999 | 2 | 2 | 4 | ECDICT | MIT License | MIT | {"phonetic":true,"definition":true} | IELTS |
| kaoyan | content:vocabulary:ecdict-kaoyan:kaoyan | ecdict-kaoyan | lazy | 3000 | 2994 | 3000 | 2 | 2 | 4 | ECDICT | MIT License | MIT | {"phonetic":true,"definition":true} | 考研 |
| toefl | content:vocabulary:ecdict-toefl:toefl | ecdict-toefl | lazy | 3000 | 2943 | 2992 | 2 | 2 | 4 | ECDICT | MIT License | MIT | {"phonetic":true,"definition":true} | TOEFL |
| ts-code | content:vocabulary:curated-ts-code:ts-code | curated-ts-code | inline | 50 | 0 | 0 | 1 | 1 | 4 | curated in-repo (TS 代码词库) | Proprietary (self-curated) | — | {"phonetic":false,"definition":false} | — |

## 窄表（每行一个字段，逐包横向比对）

| 字段 | ai-core | cet4 | cet6 | cloud-native | frontend | go-code | ielts | kaoyan | toefl | ts-code |
|---|---|---|---|---|---|---|---|---|---|---|
| 包目录名 | `ai-core` | `cet4` | `cet6` | `cloud-native` | `frontend` | `go-code` | `ielts` | `kaoyan` | `toefl` | `ts-code` |
| id | `content:vocabulary:curated-ai-core:ai-core` | `content:vocabulary:ecdict-cet4:cet4` | `content:vocabulary:ecdict-cet6:cet6` | `content:vocabulary:curated-cloud-native:cloud-native` | `content:vocabulary:curated-frontend:frontend` | `content:vocabulary:curated-go-code:go-code` | `content:vocabulary:ecdict-ielts:ielts` | `content:vocabulary:ecdict-kaoyan:kaoyan` | `content:vocabulary:ecdict-toefl:toefl` | `content:vocabulary:curated-ts-code:ts-code` |
| namespace | `curated-ai-core` | `ecdict-cet4` | `ecdict-cet6` | `curated-cloud-native` | `curated-frontend` | `curated-go-code` | `ecdict-ielts` | `ecdict-kaoyan` | `ecdict-toefl` | `curated-ts-code` |
| offline.policy | `inline` | `inline` | `inline` | `inline` | `inline` | `inline` | `lazy` | `lazy` | `lazy` | `inline` |
| stats.items | `43` | `84` | `69` | `30` | `20` | `50` | `3000` | `3000` | `3000` | `50` |
| stats.phonetic | `0` | `84` | `69` | `0` | `0` | `0` | `2986` | `2994` | `2943` | `0` |
| stats.definition | `0` | `84` | `69` | `0` | `0` | `0` | `2999` | `3000` | `2992` | `0` |
| contentVersion | `1` | `1` | `1` | `1` | `1` | `1` | `2` | `2` | `2` | `1` |
| contentRevision | `1` | `1` | `1` | `1` | `1` | `1` | `2` | `2` | `2` | `1` |
| schemaVersion | `4` | `4` | `4` | `4` | `4` | `4` | `4` | `4` | `4` | `4` |
| sources[0].origin | `curated in-repo (2026 AI 核心词库)` | `ECDICT` | `ECDICT` | `curated in-repo (云原生词库)` | `curated in-repo (前端词库)` | `curated in-repo (Go 代码词库)` | `ECDICT` | `ECDICT` | `ECDICT` | `curated in-repo (TS 代码词库)` |
| sources[0].license.name | `Proprietary (self-curated)` | `MIT License` | `MIT License` | `Proprietary (self-curated)` | `Proprietary (self-curated)` | `Proprietary (self-curated)` | `MIT License` | `MIT License` | `MIT License` | `Proprietary (self-curated)` |
| sources[0].license.spdx | — | `MIT` | `MIT` | — | — | — | `MIT` | `MIT` | `MIT` | — |
| features | `{"phonetic":false,"definition":false}` | `{"phonetic":true,"definition":true}` | `{"phonetic":true,"definition":true}` | `{"phonetic":false,"definition":false}` | `{"phonetic":false,"definition":false}` | `{"phonetic":false,"definition":false}` | `{"phonetic":true,"definition":true}` | `{"phonetic":true,"definition":true}` | `{"phonetic":true,"definition":true}` | `{"phonetic":false,"definition":false}` |
| exam | — | `CET-4` | `CET-6` | — | — | — | `IELTS` | `考研` | `TOEFL` | — |

## 实测一致性观察

- `offline.policy` 分布：`inline`=7 包，`lazy`=3 包
- `namespace` 分布：`curated-ai-core`=1 包，`ecdict-cet4`=1 包，`ecdict-cet6`=1 包，`curated-cloud-native`=1 包，`curated-frontend`=1 包，`curated-go-code`=1 包，`ecdict-ielts`=1 包，`ecdict-kaoyan`=1 包，`ecdict-toefl`=1 包，`curated-ts-code`=1 包
- `schemaVersion` 取值集合：`4`
- `sources[0].origin` 取值集合：`curated in-repo (2026 AI 核心词库)`，`ECDICT`，`curated in-repo (云原生词库)`，`curated in-repo (前端词库)`，`curated in-repo (Go 代码词库)`，`curated in-repo (TS 代码词库)`
- `sources[0].license.spdx` 取值集合：`（字段缺失）`，`MIT`
  - 未声明 spdx 的包（自研许可、无 SPDX 标识符）：`ai-core`、`cloud-native`、`frontend`、`go-code`、`ts-code`。

### `stats.items` 声明值 vs `words.json` 实际条数

| 包 | stats.items（声明） | 实际条数 | 是否一致 |
|---|---|---|---|
| ai-core | 43 | 43 | ✅ 一致 |
| cet4 | 84 | 84 | ✅ 一致 |
| cet6 | 69 | 69 | ✅ 一致 |
| cloud-native | 30 | 30 | ✅ 一致 |
| frontend | 20 | 20 | ✅ 一致 |
| go-code | 50 | 50 | ✅ 一致 |
| ielts | 3000 | 3000 | ✅ 一致 |
| kaoyan | 3000 | 3000 | ✅ 一致 |
| toefl | 3000 | 3000 | ✅ 一致 |
| ts-code | 50 | 50 | ✅ 一致 |

结论：全部 10 包的 `stats.items` 声明值与实际词条数**完全一致**。
