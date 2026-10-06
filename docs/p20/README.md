# P20 · 开源外链与许可改造

本目录是 P20 阶段的方案与证据。**不在 `docs/audit-package/` 内**（INV-1 冻结区，`verify:p17-frozen` 判红）。

## 为什么有这一刀

上一轮（O-SEO-16）修好了「13 个词库页零入站链接」，首页可见正文从 21 字符 → 1980 字符。
但那只是**让页面能被爬虫读到**。要让流量真正发生，还需要**外链**——
本页就是外链这条线的方案。

## 一句话结论

**词库可以合法开源了**（`f5deecf`）：13 个词库包已全部改标 MIT，
且「可否再分发」从此是**门禁判据**而不是口头约定；14 个自编教材包**明确排除**在外。

## 文件

| 文件 | 内容 |
|---|---|
| `O-SEO-17-OPEN-SOURCE-PACKAGE-AUDIT.md` | 13 个词库包的可开源审计（许可依据原文 + 体积 + 法律障碍） |
| `O-SEO-18-STAR-VS-TRAFFIC-VERIFICATION.md` | ⭐ 对「star ≠ 流量」判断的**独立验证结论**（推翻了原判断） |
| `O-SEO-19-EXECUTION-ORDER.md` | 执行顺序与前置条件 |
| `README-draft-vocabulary.md` | 开源仓库 README 中文成稿（⛔ 需人工润色，V2EX 禁止复制 AI 内容） |
| `V2EX-POST-DRAFT.md` | V2EX 发帖成稿（3 标题 + 正文 + 4 条退路） |

## 两处必须知道的纠正（原判断被推翻）

| # | 原判断 | 实测结论 |
|---|---|---|
| 1 | **star 数量与 SEO 流量几乎不相关**，静态正文是唯一决定变量 | ⛔ **错**。star 高度相关于外链数量：网易号/头条/开源榜的文章标题**直接印 star 数**（「这个 1 万 Star 的开源神器」「23k星 qwerty-learner」「10,271 Stars」）。正确表述：静态正文是**拿到流量的必要条件**，外链是**让流量发生的原因**，两者是上下游 |
| 2 | Qwerty Learner 的 Coder Dict「只有 60-70 词，很小」 | ⛔ **错**。`gh api` 实测 `public/dicts` 有 **380 个词库文件**，`linux-command` 单库 575 条。真实差异是**轴不同**：它的技术词库全是 `java-string`/`go-builtin` 这类 **API 索引**，**无容器编排类、无整行骨架代码类** |

## 当前可开源边界

-✅ **可开源 13 个**：`ai-core` `cet4` `cet6` `cloud-native` `frontend` `go-code` `ielts`
  `ielts-edu-01-vocab` `ielts-env-02-vocab` `ielts-tech-03-vocab` `kaoyan` `toefl` `ts-code`
- ⛔ **不可开源 14 个**（`redistributable: false`）：全部 `demo-*` 与 6 个 `ielts-*` 的
  `reading` / `exercise` —— 那是**自编教材正文**（如阅读 7 段 3406 字符 + 15 题 + 18 条搭配），
  改标 MIT 需**权利人另行拍板**，本轮未动。
- ⚠️ **ECDICT 5 个包（`cet4`/`cet6`/`ielts`/`kaoyan`/`toefl`）的署名义务已落实**：
  `attributionRequired` 由 `false` 改为 `true` + 补 `attribution` 文本 ⇒ MIT 的署名义务被门禁持续强制，
  不会被静默删掉。

## 词库内容真实性抽样（用于 README 诚实标注）

| 包 | 抽样词条 | 性质 |
|---|---|---|
| `go-code` | `if err != nil { return err }`、`data, err := os.ReadFile(path)` | ✅ 整行真实 Go 骨架代码 |
| `ts-code` | `const [count, setCount] = useState(0);`、`type Status = 'idle' \| 'loading' \| 'done'` | ✅ 整行真实 TS/React |
| `cloud-native` | `replicaset`、`configmap`、`statefulset`、`containerd` | ✅ 真 K8s 术语 |
| `ai-core` | `tokenizer`、`quantization`、`fine-tuning`、`embedding` | ✅ 真 AI 术语 |
| `frontend` | `asynchronous`、`component`、`middleware`、`repository` | ⚠️ **前端通用英文词，不是 React 专有术语** —— README 里已诚实标注 |

## 待办

- ⏳ **yqh 本人改写并发布 V2EX 帖**（`go` / `programming` 节点）。⛔ V2EX 明令禁止复制 AI 内容，
  成稿只是技术事实清单 + 语气参考，**必须逐句重写**。
- ⏳ 开源仓库创建与发布（待许可方案落地后执行）
- ⛔ `ContentLicense` 类型未加 `redistributable`（需改 `src/core/content/model/content.ts:116`，
  本轮禁改 `src/` 留到下轮）
- ⛔ 词库页面**尚未展示署名**（`attribution` 只存在于 manifest，UI 无渲染点）。
  MIT 要求署名随显著位置提供 ⇒ 开源仓库 README 顶部放这句署名。