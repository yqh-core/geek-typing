# INCIDENT-ESAFENET · 亿赛通透明加密密文文件事故独立立案

| 项 | 内容 |
|---|---|
| 事故 ID | **INCIDENT-ESAFENET** |
| 发现时间 | 2026-09-28 |
| 发现方式 | P1.5 第 ⑨ 步顺手造的治理工具 `scripts/scan-mojibake.mjs`（`npm run lint:text`）**第一次全仓跑**就把它揪出来 |
| 严重度 | **P1（生产伤害）** —— 含一个**已入库**文件与一个**上线产物** |
| 状态 | ✅ **CLOSED**（2026-09-28 处置完成，逐文件去向见 §7 处置实录） |
| 关联文档 | `docs/audit-package/13-acceptance/P1.5-RELEASE-GATE.md` **D.7**（首次立案处）；`docs/audit-package/12-infrastructure/BUILD.md`（宿主机驱动旁证） |

---

## 1. 现象（`[实测]`）

全仓非 UTF-8 文件普查（逐字节 UTF-8 解码，排除 `node_modules` / `dist` / `.git` / `.evidence-run`）：

| 文件 | 大小 | `Esafenet` 标记位置 | git 状态 | 性质 |
|---|---|---|---|---|
| `README.md` | 11312 B | 偏移 88 | **已入库**（tracked，未被修改） | 整文件密文 |
| `public/robots.txt` | 4171 B | 偏移 88 | **已入库** | 整文件密文 —— ⚠️ **上线产物** |
| `docs/功能总结.md` | 10682 B | 偏移 88 | 未入库（untracked） | 整文件密文 |
| `docs/测试方案.md` | 11348 B | 偏移 88 | 未入库（untracked） | 整文件密文 |

## 2. 判定依据（不是「看起来像乱码」）

四者文件头均为同一二进制魔数：

```
\xe0\xa8\x91\xe7\xd8\xf2\x05\xac\x00\x02\x00\x00\x00\x10\x00\x00 …
```

紧随其后**偏移 88 处**出现 ASCII 串 `Esafenet` —— 这是**亿赛通（EsafeNet）文档透明加密**的
封装格式。旁证：`docs/audit-package/12-infrastructure/BUILD.md` 正文早已记载
「宿主 Esafenet 透明加密驱动」，说明这套驱动在本机是**常驻**的 —— 不是一次性污染。

`[实测]` 与源码关系：`dist/robots.txt` 同为 4171 B 密文，`ls -la` 显示它被 `vite build`
**原样拷贝** —— 即密文已进入构建产物链路。

## 3. 为什么必须单独立案（三条独立危害）

1. **`README.md` 是仓库门面且已随 commit 入库** —— 任何人 clone 下来看到的都是二进制密文。
2. **`public/robots.txt` 是上线产物的一部分** —— 部署后爬虫拿到的是二进制垃圾而非 robots
   指令。对 **AdSense 审核 / SEO 是直接伤害**（本项目的主变现路径）。
3. **不可由 AI 复原**：密文意味着原始字节已不在；任何「猜着改回去」都属于**编造内容**，
   违反 C4「不猜」原则。这条约束是本事故**无法由 AI 单方闭环**的根本原因。

## 4. 本轮已做的处置（保守，不越界）

- ✅ **不动**这四个文件的任何字节；**不做**解密尝试；**不删除**。
- ✅ 在 `scripts/scan-mojibake.mjs` 中以 **FILE_IGNORE + 显式原因** 登记，且运行时
  **打印豁免清单**（不是静默跳过）—— 目的是让 `lint:text` 可日常运行，同时这四处
  **不会被忘掉**。
- ✅ `[实测]` 尴尬但不掩盖：`lint:text` 当前仍 `EXIT=1`，剩余判红项是
  `docs/audit-package/11-legal/CONTENT_RISK.md:231` 的两处 `U+FFFD`
  （原文 `架构问题而非许<FFFD><FFFD>问题`）。这是**旧的内容损坏**，同样没有猜测还原。
  → 按 yqh 指令 **U+FFFD 保持红**，不压白（压白等于把守卫降级成摆设）。

## 5. 需要 yqh 决策的事项

| # | 决策项 | 备选 |
|---|---|---|
| 1 | 这四个文件是否先从干净备份 / 重装环境导出再入库？（AI 无法解密） | A. 你提供明文原件 → 覆盖入库<br>B. `docs/功能总结.md` / `docs/测试方案.md` 本就未入库 → 直接丢弃，从 D 盘审计包重建<br>C. 暂不处理，保持登记 |
| 2 | `public/robots.txt` 是否**立即**用明文重写？ | 内容很短（`User-agent: *` + `Allow` + sitemap 三行即可），按站点约定写，风险极低 —— **建议优先做这条**（生产伤害直接） |
| 3 | 是否需要排查**其他仓库**是否也有 Esafenet 密文？ | 本机驱动常驻 ⇒ 任何被它「加密落盘」的文件都可能有同样问题。可跑一次跨仓库扫描（`D:\work\*`） |

## 6. 复现命令

```bash
npm run lint:text                 # 全仓乱码 / 非 UTF-8 扫描（会打印豁免清单）
node -e "const b=require('fs').readFileSync('public/robots.txt');console.log(b.subarray(80,96).toString('latin1'))"
# 期望看到 Esafenet 串 —— 即该文件是密文
```

---

## 7. 处置实录（2026-09-28，按已批准决策执行）

逐文件去向：

| 文件 | 去向 |
|---|---|
| `README.md` | **整文件替换为明文重写版**（基于 package.json / src/ 结构 / docs/audit-package/ 真实内容撰写）；文件顶部保留诚实声明：原 README 因本机透明加密驱动损坏不可恢复，本文件为重写版。 |
| `public/robots.txt` | **明文重写**为站点约定最简版：`User-agent: *` + `Allow: /` + `Sitemap: /sitemap.xml`（`public/sitemap.xml` 实测存在），共 46 B。 |
| `docs/功能总结.md` | **隔离不删除**：mv 至 `docs/_quarantine-esafenet/功能总结.md`（10682 B 原样保留）；目录内放隔离说明 README；`.gitignore` 追加 `docs/_quarantine-esafenet/`。 |
| `docs/测试方案.md` | **隔离不删除**：mv 至 `docs/_quarantine-esafenet/测试方案.md`（11348 B 原样保留）；同上。 |

配套改动：`scripts/scan-mojibake.mjs` FILE_IGNORE —— 移除 `README.md` 与 `public/robots.txt`（已恢复明文、恢复正常扫描）；两个密文文档改以隔离后新路径 `docs/_quarantine-esafenet/*.md` 保留豁免（隔离目录位于 docs/ 扫描范围内，新路径豁免已覆盖）。

证据链：

- 处置前取证：`_deliverable/esafenet-evidence-before.txt`（4 文件 size + xxd 前 96 字节，均在偏移 88 处实测到 ASCII 串 `Esafenet`）。
- 处置后验收：`_deliverable/esafenet-evidence-after.txt`（lint:text / build / cmp / release:gate 原始输出与真实退出码）。

复跑结果（真实退出码，临时文件取 `$?`，无管道遮蔽）：

| 命令 | 退出码 | 结果 |
|---|---|---|
| `npm run lint:text` | EXIT=1（期望内） | Esafenet 判红**归零**；豁免清单仅剩隔离区 2 个新路径；剩余红项仅 `docs/audit-package/11-legal/CONTENT_RISK.md:231` 的 2 处 U+FFFD（yqh 明令保持红，未修） |
| `npm run build` | EXIT=0 | `dist/robots.txt` 由密文 4171 B 自动重写为明文 46 B；`cmp public/robots.txt dist/robots.txt` → **CMP_EXIT=0，逐字节一致** |
| `npm run release:gate` | EXIT=0 | RELEASE=APPROVED（G1..G6 全 PASS，29/29） |

闭环条件对照：① 四文件去向明确（上表）✅；② `public/robots.txt` 与 `dist/robots.txt` 同一明文且符合站点约定 ✅；③ lint:text 剩余红项只剩 U+FFFD ✅；④ 修复前后各留一次 `lint:text` 原始输出 ✅。

遗留事项（不随本单关闭）：

1. **git 历史中仍有旧密文提交**（`README.md` / `public/robots.txt` 的历史版本为密文）：历史改写属破坏性操作，留给 yqh 单独决策。
2. **跨仓库 Esafenet 扫描（原决策项 3）未做**：本机驱动常驻 ⇒ 其它仓库可能有同类密文，保持登记待安排。

---

**闭环条件**（按 yqh 的验收习惯，本单不接受「看起来处理了」）：
① 四个文件的性质有明确去向（明文覆盖 / 丢弃重建 / 保留登记）；
② `public/robots.txt` 与 `dist/robots.txt` 为**同一明文**且内容符合站点约定；
③ `npm run lint:text` 的剩余红项只剩 `U+FFFD`（Esafenet 项归零）；
④ 修复前后各留一次 `lint:text` 原始输出作为证据链。
