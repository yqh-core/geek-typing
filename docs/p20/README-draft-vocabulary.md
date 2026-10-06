# geek-typing 词库（geek-typing vocabulary packs）

> 一套面向「打字练习」场景的英语词条数据集。13 个包 / 9438 条词条，
> 每个包是一个目录，内含 `manifest.json`（元数据 + 许可 + 校验和）与 `words.json`（词条数组）。
>
> 词条数据可直接取用，无需注册、无需 API key、无请求频率限制。
> 仓库站点的完整练习功能另见文末。

---

## 这批词库是做什么的

市面上的背单词词库，绝大多数是为「看 → 选义」设计的：给你一个单词和 4 个中文释义，
你点一下。这套数据是为「敲出来」设计的 —— 词条字段围绕**能被打出来**来组织：

- 词条正文保留原始大小写与符号（`Go`、`gRPC`、`io/ioutil`、`[]byte`），
  因为练习端要大小写敏感地逐字符比对
- 代码类包（`go-code` / `ts-code`）的词条就是**整行骨架代码**，
  不是孤立单词 —— 练的是「这段代码你能不能不看就敲出来」
- 释义与音标是可选字段（`features.phonetic` / `features.definition` 逐包声明），
  不给就不给，不拿空字段充数

## 差异化：5 个技术细分词库

这是这套数据里比较特别的部分。9438 条中有 **193 条是技术细分词条**，
分属 5 个包：

| 包 | 词条数 | 内容 | 典型词条形态 |
|---|---|---|---|
| `ai-core` | 43 | 大模型 / AI 工程高频词 | `inference`、`embedding`、`RLHF` |
| `cloud-native` | 30 | Kubernetes 与容器生态 | `namespace`、`sidecar`、`ConfigMap` |
| `frontend` | 20 | 前端工程通用高频词 | `asynchronous`、`component` |
| `go-code` | 50 | Go 标志性骨架代码行 | 整行代码，大小写敏感 |
| `ts-code` | 50 | TS / React 骨架代码行 | 整行代码，大小写敏感 |

**为什么单独做这一档**：常见背单词应用的词库清单基本是考试与通用词汇，
技术词汇要么没有，要么是几百条笼统的「程序员常用词」混在一起。
`go-code` / `ts-code` 这种**整行骨架代码**形态（而不是单词列表），
在同类数据里更少见 —— 它的练习目标是肌肉记忆，评价标准是能不能盲打出来。

这些包体量很小（技术包合计约 14.5 KB），是刻意选的高频核心，
不是全量清单。

> ⚠️ **关于 `frontend` 包的诚实说明**：这个包的实际词条是
> 前端领域里**读文档时会遇到的通用英文词**（实测如 `asynchronous`、`component`），
> 不是 React / 构建工具的专有术语。把它算作「技术细分」偏勉强，
> 真正形态特殊的是 `go-code` / `ts-code` 的整行代码，
> 以及 `ai-core` / `cloud-native` 的领域术语密度。

## 数据格式

每个包一个目录：

```
ai-core/
  manifest.json    # 元数据：标题、许可、来源、内容校验和、条目统计
  words.json       # 词条数组
```

`words.json` 是普通 JSON 数组，没有自定义封装，可以直接 `JSON.parse` 读走。

字段以实际包为准：`manifest.json` 的 `features` 会声明该包有没有
`phonetic`（音标）与 `definition`（释义）。**不存在**的字段就是不存在，
消费方请按缺省处理，不要假设一定有中文释义。

每个包都带 `contentChecksum`（SHA-256），可用于校验你拿到的数据是否完整。

### 消费示例

```js
// 直接读走一个包
const words = await fetch('./ai-core/words.json').then(r => r.json())
console.log(words.length) // 43
```

## 许可

**按包区分，逐包以 `manifest.json` 的 `sources[].license` 为准。** 两类来源：

- **自有整理包**（`ai-core` / `cloud-native` / `frontend` / `go-code` / `ts-code`
  以及 3 个 IELTS 单元包）：由本项目整理，许可由本项目声明，
  具体条款见各包 `manifest.json`。
- **考试词库包**（`cet4` / `cet6` / `ielts` / `kaoyan` / `toefl`）：
  数据来自 [ECDICT](https://github.com/skywind3000/ECDICT)（MIT License），
  **使用这批包请保留对 ECDICT 原仓库的署名**。本项目不重新许可这批数据。

⚠️ **使用前请先读你打算用的那个包的 `manifest.json`**，不要凭本页表格推断。
本仓库词条按包独立授权，不存在「整库一个协议」这回事。

## 词库之外

这批数据来自一个开源的英语打字学习站点 —— 词条只是其中一部分，
站点把这些包接到了「逐词打字 + 艾宾浩斯复习调度 + 离线可用」上。
如果只想要数据，到这里就够了；如果想看这些词条实际怎么被用起来，
可以看站点的词库页（入口见仓库主页）。

## 参与

发现词条有错、想补自己领域的词、或者想讨论某个包的取舍，都欢迎提 issue。
新增词条包请遵循现有包的目录结构与 `manifest.json` 字段约定。
