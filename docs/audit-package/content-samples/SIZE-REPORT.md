# 词库包体积报告（全库 10 包）

> 由 `docs/audit-package/_generated/extract-samples.mjs` 用 `fs.statSync(path).size` 实测生成。
> 所有体积为**磁盘文件字节数**（UTF-8 编码后的真实字节，不是字符数）。

## 一、逐包体积

| 包 | offline.policy | manifest.json (B) | manifest.json (KiB) | words.json (B) | words.json (KiB) | 词条数 | 平均字节/词条 |
|---|---|---|---|---|---|---|---|
| ai-core | inline | 1,323 | 1.29 | 2,324 | 2.27 | 43 | 54.0 |
| cet4 | inline | 1,439 | 1.41 | 12,353 | 12.06 | 84 | 147.1 |
| cet6 | inline | 1,424 | 1.39 | 9,840 | 9.61 | 69 | 142.6 |
| cloud-native | inline | 1,321 | 1.29 | 1,591 | 1.55 | 30 | 53.0 |
| frontend | inline | 1,304 | 1.27 | 992 | 0.97 | 20 | 49.6 |
| go-code | inline | 1,406 | 1.37 | 4,644 | 4.54 | 50 | 92.9 |
| ielts | lazy | 1,476 | 1.44 | 482,461 | 471.15 | 3000 | 160.8 |
| kaoyan | lazy | 1,486 | 1.45 | 483,016 | 471.70 | 3000 | 161.0 |
| toefl | lazy | 1,470 | 1.44 | 475,078 | 463.94 | 3000 | 158.4 |
| ts-code | inline | 1,437 | 1.40 | 5,299 | 5.17 | 50 | 106.0 |
| **10 包合计** | — | **14,086** | **13.76** | **1,477,598** | **1442.97** | **9346** | **158.1** |

- **10 个 manifest.json 合计：14,086 字节（13.76 KiB）**
- **全库 words.json 合计：1,477,598 字节（1442.97 KiB）**
- 全库内容总字节（manifest + words）：1,491,684 字节（1456.72 KiB）

## 二、inline / lazy 分组汇总

> 分组依据为各包 manifest 的 `offline.policy` 字段实测值。

| 分组 | 包数 | Σ 词数 | Σ words.json (B) | Σ words.json (KiB) | Σ manifest.json (B) | Σ manifest.json (KiB) | 平均字节/词条 |
|---|---|---|---|---|---|---|---|
| inline 包 | 7 | 346 | 37,043 | 36.17 | 9,654 | 9.43 | 107.1 |
| lazy 包 | 3 | 9000 | 1,440,555 | 1406.79 | 4,432 | 4.33 | 160.1 |
| **全库** | 10 | 9346 | 1,477,598 | 1442.97 | 14,086 | 13.76 | 158.1 |

### inline 包明细

| 包 | 词条数 | words.json (B) |
|---|---|---|
| ai-core | 43 | 2,324 |
| cet4 | 84 | 12,353 |
| cet6 | 69 | 9,840 |
| cloud-native | 30 | 1,591 |
| frontend | 20 | 992 |
| go-code | 50 | 4,644 |
| ts-code | 50 | 5,299 |
| **小计** | **346** | **37,043** |

### lazy 包明细

| 包 | 词条数 | words.json (B) |
|---|---|---|
| ielts | 3000 | 482,461 |
| kaoyan | 3000 | 483,016 |
| toefl | 3000 | 475,078 |
| **小计** | **9000** | **1,440,555** |

## 三、inline 预算门禁观察

- **inline 门禁对象 = 7 个包**：`ai-core`、`cet4`、`cet6`、`cloud-native`、`frontend`、`go-code`、`ts-code`。
- inline 包 **Σ 词数 = 346**，**Σ words.json 体积 = 37,043 字节（36.17 KiB）**。
- lazy 包 3 个（`ielts`、`kaoyan`、`toefl`），Σ 词数 = 9000，Σ words.json = 1,440,555 字节（1406.79 KiB）。
- 占比：inline 占全库词条 **3.70%**，但只占全库 words.json 体积的 **2.51%**；lazy 占体积 **97.49%**。
- 单包体积最大者：`kaoyan`；最小者：`frontend`。
- lazy 包平均每条 160.1 字节（含 phonetic + definition，字段最全）；inline 包平均每条 107.1 字节。
