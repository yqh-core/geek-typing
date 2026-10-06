# 外链方案 · 执行顺序总表（O-SEO-19 · 待批准）

> 状态：**全部待你确认，本轮零执行**。
> 硬约束遵守情况：`src/` 零改动 · `content/` 零改动 ·
> `docs/audit-package/**` 零改动 · 未新增 npm 依赖 ·
> 未发帖 · 未建远程仓库 · 未 push · `docs/content/SEO-GSC-OBSERVATION-BASELINE.md` 未动。

---

## 0. 本轮产出物（4 份，均在 `docs/p20/`，不属任何冻结区）

| 文件 | 内容 | 状态 |
|---|---|---|
| `O-SEO-17-OPEN-SOURCE-PACKAGE-AUDIT.md` | 可开源包清单 + 许可依据原文 + 真实体积 | ✅ 已完成 |
| `README-draft-vocabulary.md` | 词库 README 骨架（中文成稿，可直接用） | ✅ 已完成 |
| `V2EX-POST-DRAFT.md` | 标题 3 个 + 正文成稿 + 时机 + 退路 | ✅ 已完成 |
| `O-SEO-18-STAR-VS-TRAFFIC-VERIFICATION.md` | 「star ≠ 流量」独立验证 | ✅ 已完成 |
| 本文件 | 执行顺序与前置条件 | ✅ 已完成 |

---

## 1. ⛔ 有一个卡点必须你先裁定（其余步骤都依赖它）

**卡点：8 个技术/IELTS 包的 license 字段是 `Proprietary (self-curated)`（专有）。**

`gate:license` 判它们 `allowed`，是因为走了「自有内容 license 自主」的豁免分支，
**不是**因为声明了「允许再分发」。

而仓库根目录**无 LICENSE 文件**、`package.json` 的 `license` 是 `undefined`。

**这意味着：现在把词库发到公开仓库，是「专有声明」与「公开分发」的事实冲突。**

### 两个方案，请选一个

| | 方案 A：显式改标 MIT | 方案 B：只发元数据（不发词条） |
|---|---|---|
| 动作 | 把要开源的包在 `manifest.json` 里改标 `MIT` + 补 `url` + `attribution`，重跑 `gate:license` | 不碰 `words.json`，只发包清单 + 词条样例 + 设计说明 |
| 是否改 `content/` | ✅ **要改**（本轮禁止，需你单独批准） | ❌ 不改 |
| 门禁影响 | 需复跑 `gate:license` + `verify:provider` + `content:validate` | 零影响 |
| 外链说服力 | 🟢 强（可被直接使用） | 🟡 中（只能证明存在，不能直接拿走） |
| 法律风险 | 🟢 低（前提：这些包确实是我们自己整理的） | 🟢 零 |
| **我的推荐** | ✅ **推荐 A** | 备选 |

**⛔ 我不替你选 A 还是 B，但强烈建议 A**：
「自有内容 license 自主」在法律上成立 —— **自主的意思可以包括改成 MIT**。
这批包 `provider = geek-typing original`，是我们自己整理的，改标 MIT 没有第三方权利障碍。

---

## 2. 执行顺序（按依赖关系排序）

### 步骤 0 · 你确认许可裁定 🔴 **阻塞全部后续**

**产出**：你回答「选 A 还是 B」

- 选 A → 追加批准「允许改 `content/vocabulary/*/manifest.json` 的 license 字段」
- 选 B → 跳过步骤 1，直接做步骤 2

⛔ **我不动 `content/`，等你。**

---

### 步骤 1 · 词库开源（依赖步骤 0）

| 项 | 内容 |
|---|---|
| 前置 | 步骤 0 确认 + （若选 A）追加批准改 `content/` |
| 动作 A | 改 8 个包的 `license` 字段 → 复跑 `gate:license` / `verify:provider` / `content:validate` → 建**独立开源仓库**（`geek-typing-vocabulary`）→ 发 `README-draft-vocabulary.md` + 5 个技术包 |
| 动作 B | 建独立仓库 → 只发包清单 + 每包 3–5 条样例 + 设计说明 → 指向主仓库 |
| ⛔ 需你确认 | 仓库名、是否 public、是否带 `LICENSE`（选 A 建议 MIT） |
| 风险 | A 方案若误改 `contentChecksum` 会触发 INV-5 门禁红 —— 改完必须复跑全套 |
| 预期产出 | 1 个可被 star / fork / 引用的仓库 |

**⭐ 叙事核心（不可编造的部分）**：
「技术细分词库是空白档」必须改成 →
**「两个对手的技术词库都是 API 索引类（`java-string` / `python-builtin` / `rust-keyword` / `go-builtin`），
覆盖『语言 API 拼写』；我们覆盖『领域术语 + 整行骨架代码』。
容器编排/云原生这一档，两家都没有。」**

⛔ **不要说「对手词库很小」** —— Qwerty Learner 实测 380 个词库文件，
`linux-command` 单库 575 条。说小会被当场打脸。

---

### 步骤 2 · V2EX 发帖（**不依赖步骤 0，可并行推进**）🟢

| 项 | 内容 |
|---|---|
| 前置 | 仓库**已有公开地址**（现在有：`yqh-core/geek-typing`），但建议**步骤 1 完成后**再发 —— 帖子里要能给出「词库已开源」的具体位置，否则第一条帖子浪费 |
| 动作 | 按 `V2EX-POST-DRAFT.md` 逐句**用自己的话重写** → 发 `go` 节点 |
| 时机 | 工作日 10:00–11:30 |
| ⛔ 硬规则 | V2EX **禁止复制 AI 内容** —— 我的成稿只作素材，**必须重写** |
| ⛔ 硬规则 | 全帖只能出现**一个**自家链接 |
| 发布后 5 分钟 | 趁 300 秒编辑锁检查节点与措辞 |
| 退路 | 被删 → 换角度重发（去掉产品叙述，纯技术笔记）→ 或拆条 → 或停手 |

⛔ 需你确认：是否由你本人发布（强烈建议是）、发哪个节点。

---

### 步骤 3 · 效果观测（依赖步骤 1、2）

| 项 | 内容 |
|---|---|
| 前置 | 步骤 1、2 已执行且满 2 周 |
| 动作 | 观测 GitHub star / 仓库引用 / V2EX 帖回复与外链 |
| ⛔ 注意 | 观测窗至少 2 周，SEO 侧需等爬虫重抓 |

---

## 3. 依赖关系图

```
步骤 0（许可裁定）🔴 你决定
   │
   ├─ A 方案 → 步骤 1（改 content + 开源仓库）
   │              └─→ 步骤 2（V2EX，帖中给出词库位置）
   │
   └─ B 方案 ─────→ 步骤 1'（只发元数据）
                      └─→ 步骤 2（同上）

步骤 2 的内容准备【本轮已完成，不阻塞】
```

**关键**：**V2EX 成稿已可直接用**（唯一前置是「重写，不能直接复制」）。
许可裁定只卡住「开源词库」这一件事，**不卡 V2EX**。

---

## 4. 门禁状态（改动后实测）

| 命令 | 结果 |
|---|---|
| `npm run gate:license` | **PASS** — packages 27, violations 0 |
| `git status --short` | 仅 ` M docs/p18/P18-NEXT-STEP-PLAN.md`（你原有的未提交改动，**本轮未碰**） |

**新增文件**（全部在 `docs/p20/`，不属任何冻结区）：
```
docs/p20/O-SEO-17-OPEN-SOURCE-PACKAGE-AUDIT.md
docs/p20/O-SEO-18-STAR-VS-TRAFFIC-VERIFICATION.md
docs/p20/O-SEO-19-EXECUTION-ORDER.md      （本文件）
docs/p20/README-draft-vocabulary.md
docs/p20/V2EX-POST-DRAFT.md
```

⛔ **未 commit，未 push**（本轮只出方案）。
