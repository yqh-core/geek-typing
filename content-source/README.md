# content-source/ —— 单元内容脚手架的**源文件**

这三份 JSON 是 `scripts/content/scaffold-unit.mjs` 的输入：**单元内容包的「源」**。
`content/` 下的 27 个包是**产物**（落盘形态），这里是**原料**。

```
content-source/unit-source-ielts-*.json   ← 源（人/PM 编辑，本目录）
        │  npm run content:scaffold-unit -- --src=<源> --check   （只校验，不写盘）
        │  npm run content:scaffold-unit -- --src=<源>            （落盘，⛔ 勿在 CI 跑）
        ▼
content/{vocabulary,reading,exercise}/ielts-*-{vocab,reading,exercise}/   ← 产物
```

## 为什么源要入库（2026-10-07）

在此之前源只在仓库外的 `D:/work/_ops/`，**CI 的任何 step 都不读那个目录**。
后果是 `scaffold-unit.mjs` 的判据 ①（「源缺 `license` 段就拒跑」）**在 PR 阶段形同虚设**——
它只在有人手动跑脚手架时才触发。而 CI 里真正生效的是 `content:validate` 的**盘侧**判据 23
（`content/` 里的包一旦被降级就判红），它守的是「降级不许落盘」，**不是**「源不许缺段」。

⇒ 源入库后，`content:validate` 的**判据 24**（源侧 fail-closed）才能在 CI 里常驻执行：
「源里声明了某段内容 ⇒ 必须显式声明该段 `license`」，缺段即红。

## 判据 24 与判据 23 的关系

**同一条规则的两个观测点，缺一不可，谁也不能替代谁。**

| | 判据 23（盘侧） | 判据 24（源侧） |
|---|---|---|
| 守什么 | 已落盘的包**不许被降级**（棘轮） | 源**不许缺段**（fail-closed） |
| 在哪 | `content/*/*/manifest.json` | 本目录 `*.json` |
| 只有它没有对方 | 源合规但盘上被手改降级 ⇒ 漏 | 盘是对的，但「下次跑脚手架就会降级」的定时炸弹没人看见 ⇒ 漏 |

证伪自检（证明门会判红、且不是恒红门）：

```bash
npm run content:validate -- --falsify
```

## ⛔ 这个目录**不是**内容包根

`content:validate` / `content:ingest` 扫描的是 **`content/`**，不是仓库根。
所以本目录**不会**被当成内容包扫描。反过来，**别把源放进 `content/`**：

```bash
# 实测（复现「源放错位置 ⇒ 判红」）：
cp content-source/unit-source-ielts-edu-01.json content/          # → 静默忽略（是文件不是目录）
mkdir -p content/unit-source && cp …/edu-01.json content/unit-source/   # → ✗ 未知内容类型目录 ⇒ FAIL
```

## ⚠️ 改动纪律

- **纯移动，不许顺手改**：源文件入库时逐字节原样搬运（`.gitattributes` 对本目录标了 `-text`，
  因为 `unit-source-ielts-tech-03.json` 实际带 CRLF，被 git 归一后本地与 CI 拿到的就不是同一份字节）。
- 改源 ⇒ 必须跑 `content:validate`（判据 24）+ 下面这条 `--check`。
- ⛔ **不要**为了让 `--check` 变绿去改 `content/` 下的包：**磁盘现状是基准**，
  源与盘不一致时要先判断「谁错了」，而不是无脑迁就任何一侧。