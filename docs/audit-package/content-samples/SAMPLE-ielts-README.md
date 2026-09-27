# SAMPLE-ielts.json 说明

本文件为 `content/vocabulary/ielts/words.json` 的**前 200 条**词条，按原文件顺序、原样导出（未做任何字段改名/清洗/排序）。

## 来源与范围

| 项 | 值 |
|---|---|
| 源文件 | `content/vocabulary/ielts/words.json` |
| 源包总条数 | 3000 |
| 本样本条数 | 200 |
| 覆盖区间 | 第 1 ~ 200 条（1-based，保持源顺序） |
| 顶层结构 | JSON 数组，元素为对象 |
| 编码 | UTF-8 |

## 字段集合（本样本内实际出现）

| key | 出现条数 | 出现率 |
|---|---|---|
| `word` | 200 | 100.0% |
| `translation` | 200 | 100.0% |
| `definition` | 200 | 100.0% |
| `phonetic` | 196 | 98.0% |

## 缺失情况（本样本内，按「非空字符串」判定）

| 字段 | 缺失条数 | 缺失率 | 有值条数 |
|---|---|---|---|
| phonetic | 4 | 2.0% | 196 |
| definition | 1 | 0.5% | 199 |

## 源包（全 3000 条）的缺失情况 —— 用于与样本对照

| 字段 | 有值条数 | 缺失条数 | 有值率 |
|---|---|---|---|
| phonetic | 2986 | 14 | 99.53% |
| definition | 2999 | 1 | 99.97% |
| translation | 3000 | 0 | 100.00% |

> manifest 中 `stats.phonetic` 声明为 `2986`，实测非空 phonetic 条数为 `2986`；
> `stats.definition` 声明为 `2999`，实测非空 definition 条数为 `2999`。

## 词条形态示例（样本第 1 条，原样）

```json
{
  "word": "eagle",
  "translation": "n. 鹰, 鹰状标饰",
  "phonetic": "'i:gl",
  "definition": "n. any of various large keen-sighted diurnal birds of prey noted for their broad wings and strong soaring flight"
}
```
