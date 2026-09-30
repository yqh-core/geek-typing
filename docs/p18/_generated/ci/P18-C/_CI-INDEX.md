# P18-C · manifest 体积投影 + 判据 4/5 —— CI 证据索引

> 口径与 P1.7 / P18-0 / P18-A / P18-B 一致：**CI run 记录的是"该 Wave 证据提交"那一次运行的实测结果**。
> 承载 CI 证据的提交本身会再次触发 CI，属于正常现象（"文档不能引用包含自身的 CI run"约定）。
> 上一波索引：`../P18-B/_CI-INDEX.md`。

## 运行记录

| 项 | 值 |
|---|---|
| Wave | P18-C（manifest 构建期投影 + 体积门判据 4/5） |
| 被验证的提交（headSha） | `3fddbfa4ee695678c5d60265fd71fbf9f74147a8` |
| 说明 | `evidence(P18-C): manifest 投影与体积判据 4/5 证据（R02）—— 18/18 PASS，CLOSED 145/145` |
| RunId | `36727450290` |
| event | push（main） |
| conclusion | **success** |
| 前置实现提交 | `eaab81ec5e26b9311e1ff0afbba00f819beb7006`（`fix(p18-c)`；证据矩阵 `matrix.commit` 即此值） |
| 墙钟 | 254s（`14:13:15Z` → `14:17:29Z`） |

### 四个 job

| job | conclusion | 耗时 |
|---|---|---|
| 门禁① 静态与内容（无产物） | success | 16s |
| 门禁② 构建产物（体积 + 离线） | success | 131s |
| 门禁③ 端到端（test:e2e） | success | 198s |
| 部署到 Cloudflare Pages | success | 42s |

产物：`run-36727450290-jobs.json`。

> 本 Wave 的 `check:bundle` 扩为 **5 项**（新增判据 4/5），因此**门禁② 在 CI 里现在会拦住
> "投影被撤销 / 被裁字段被写回 / lazy 包被 inline"** 三类回归 —— 不是只在本地跑过。

## 本 Wave 的机器证据链闭合

```
docs/p18/P1.8-DESIGN-RULINGS-v1.0.md §⑦（P18-C 体积落点：称重 → 裁定 → 判据设计）
        ↓
89a254e  docs(p18-c)   裁定 §⑦：逐模块/逐字段称重，否掉 ⑤ 的优先级 1、确认优先级 3
c50f81f  perf(p18-c)   manifest 构建期投影（白名单唯一事实源 + Vite 插件 + registry 18 处 ?runtime）
6a8ab55  gate(p18-c)   check-bundle 判据 4/5 + --falsify（补上注释承诺却不存在与 ⑦-8 盲区）
97cdc91  docs(p18-c)   回写实施结果 + 两处被实测推翻的原设计（⑦-6a）
43aaece  chore(p18-c)  P18 任务表接入 FALSIFY-CHECK-BUNDLE（17 → 18 条）
458587b  docs(p18-c)   契约 §7.5：runtime 侧是投影后的 manifest
eaab81e  fix(p18-c)    清掉 check-bundle 新引入的 lint 警告（字符串内多余转义）
        ↓
node scripts/evidence-run.mjs --wave=P18-C     → 18/18 PASS（matrix.commit == eaab81e）
node scripts/evidence-verify.mjs --wave=P18-C  → Evidence Chain: CLOSED（145/145 = 18×8+1）
        ↓
3fddbfa  evidence(P18-C)  证据落盘（R02；R01 因 eaab81e 退役进 _superseded/）
        ↓
CI run 36727450290        四 job 全 success（含部署）
        ↓
本索引                    CI 证据留档
```

新增的 1 个 P18 证据任务（其余 17 条为系列通用回归）：

| 任务 | 耗时 | 结果 |
|---|---|---|
| `P18-C-FALSIFY-CHECK-BUNDLE` | 1.9s | PASS —— **6/6 用例恰好判红**（含 1 条全 PASS 基线对照） |

⚠️ **R01 → R02 的退役是刻意的**：首轮证据（`63c17cd`）之后发现 `check-bundle.mjs` 引入了
2 条 lint 警告（CI 注释可见），修复后**重跑证据**而非沿用 —— `check-bundle.mjs` 本身是被测对象，
改了它旧证据就不再对应当前代码树。18 个 R01 产物已退役留档，`matrix.commit` 指向 `eaab81e`。

## 本 Wave 的判据与实测数字

| 项 | 改动前 | 改动后 | 门限 / 口径 |
|---|---|---|---|
| 主 chunk（raw） | 438.06 KiB | **424.25 KiB**（−13.81） | ≤ 439.45 KiB |
| 主 chunk 余量 | **0.3%**（1.39 KiB） | **3.5%**（15.20 KiB） | INV-3：预算**一行未动** |
| 主 chunk（gzip） | 135.83 KiB | **134.21 KiB** | ≤ 141.60 KiB（余量 5.2%） |
| 预热预算 | 496.89 KiB | 496.89 KiB | ≤ 600 KiB（余量 17.2%） |
| `check:bundle` 判据数 | 3 | **5** | 全 PASS |
| `--falsify` | — | **6/6 恰好判红** | 命中集精确等于预期 |
| 被裁字段在主 chunk | — | **0 命中**（全形态） | `sources` / `contentHistory` / `build` |
| 保留字段在主 chunk | — | `stats:`=22 / `description:`=20 / `contentChecksum:`=20 / `features:`=19 / `offline:`=19 | J3 防假绿对照组（要求 ≥4） |
| lazy 包反向校验 | 无 | **11/11 未进主 chunk** | 判据 5；判据 3 只覆盖 3 个预热包 |
| `tsc -b` | — | exit 0 | |
| `tests/content-query.mjs` | — | **163/163** | |
| `content:validate` | — | 18 包 PASS（仍读**完整**源码 manifest） | 投影只作用于 runtime |
| `verify:p17-frozen` | — | EXIT=0 / 155 文件 0 不符 | INV-1 冻结区零改动 |

### 投影白名单（runtime 保留集，25 字段）

```
id type version title titleEn description descriptionEn language exam tags icon
features stats offline packageId namespace
contentVersion contentRevision contentChecksum contentPublishedAt schemaVersion
normalize licenses provenance assets
```

裁剪集 = `sources`（5.35 KiB）+ `contentHistory`（3.82 KiB）+ `build`（2.87 KiB）= **12.04 KiB**。

## 本 Wave 暴露并修掉的真问题

1. **裁定文档自己写错了判据口径，且错的形态会让两个判据互相掩盖**（本轮最重要）。
   §⑦-6 原稿给的探测串是带引号形态 `"stats"`。实测在投影后的主 chunk 里**恒 0 命中** ——
   rolldown 对**标识符安全的键名会去掉引号**（实测 `stats:`=22 / `"stats"`=0）。
   后果：**J2（被裁字段不得出现）空转假绿** + **J3（保留字段必须出现）恒判红假红**，
   两个判据同时失效且**恰好互相掩盖**（都"不通过"或都"通过"时没人会怀疑探针本身）。
   修法：**两种形态并列** —— 裸键名抓"字段被写回白名单"，带引号抓"退回 `?raw`"
   （`?raw` 的 JSON 进模板字面量，内层引号**不转义**，故仍是 `"sources"`）；
   各配一条 falsify（J2 / **J2b**）。已回写 §⑦-6a 并写进 `gate-self-falsification` 技能。
2. **J1 的对账基准写错会必然判红**。原稿写"并集 == content 键并集"，但 18 个包**都没有**声明
   `licenses` / `provenance` / `assets`（P18-B 定的条件必填字段，当前无包触发），
   content 键并集只有 **25**，而 `PackageManifest` 是 **28**。已改为以 `PackageManifest`
   为准（Process 内 TS Compiler API 读类型）+ content 并集作**子集**校验。
3. **"注释承诺了不存在的判据"再次出现**。`manifest-runtime.mjs` 的注释写着
   「由门禁判据（J1）兜底」，而 J1 并不存在 —— 与 P18-B 的 H3 悬空同型。已补。
4. **判据 2 的反向盲区**（§⑦-8）。判据 2 只做正向计数（「数据 chunk 数 ≥ lazy 包数」），
   **不查**声明 lazy 的包是否真没进主 chunk。实测当前无泄漏（今天是好的），
   但门不会发现明天的泄漏。已由判据 5 补齐（覆盖 registry 全部 11 个 lazy 包）。
5. **新引入的 lint 警告**。`check-bundle.mjs` 在字符串里写了 `\/`（多余转义），
   CI 注释报 `Unnecessary escape character '/'`（:385 / :387）。
   注意**注释里的 `**\/` 必须保留**（`**/` 会提前结束块注释），只改字符串里的两处。

## ⚠️ 遗留风险与移交

- **体积余量 0.3% → 3.5%（15.20 KiB）**，悬崖已解除，但**未回到宽裕区间**。
  下一个自然增长点仍是 `/content/**` 与 7 个 inline 词库（约 36.31 KiB rendered，本波**刻意未动**）——
  若要再腾空间，那是最直接的目标，但需先解决 `Memorize.tsx` / `BankManager.tsx` 的**同步**
  `bank.words` 读取（"小库同步可用"是 registry 明写的产品语义）。
- **优先级 1（懒加载 `type.*`）仍未做**：实测仅 1.54 KiB，且 `labelKey`/`unitKey` 在 `src/` 内
  **零消费者**（仅门禁 C2 强制其存在）。属"收益小、改动面横跨字典 + 门禁 + falsify 用例"的项，
  本波明确不做；若日后 `type.*` 真被 UI 消费，再一并处理。
- **CI 注解 `Node.js 20 is deprecated`**（`actions/checkout@v4` / `actions/setup-node@v4` /
  `cloudflare/wrangler-action@v3` 被强制跑在 Node 24）—— 仍为低优先项，与 P18-B 移交时一致。
- **`release:gate`** 仍为 `41 PASS / 0 FAIL / 2 PENDING`（`P18-G2`→P18-D、`P18-G4`→P18-F），
  `RELEASE-GATE` 仍**不入** P18 证据表（触发条件：P18-F 后 PENDING 清零）。

## 与 P1.7 冻结基线的关系

- 冻结区 `docs/audit-package/` 在整个 P18-C 期间**零改动**：`verify:p17-frozen` 在
  实现提交后与本波证据里均实测 EXIT=0 / 155 文件 0 不符 —— 且它本身就是 P18 证据表的第 4 条任务。
- P18-C 的证据根落 `docs/p18/_generated/evidence/P18-C/`，**不写冻结区**（INV-1 结构性地成立）。
- 源码 `content/**/manifest.json` **未被改动**（`content:validate` 仍读到 24.29 KiB 全量与完整
  `sources` / `contentHistory` / `build`）—— 投影是**构建期行为**，不是数据改写。
