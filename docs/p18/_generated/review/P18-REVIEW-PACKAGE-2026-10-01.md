# P18 审查包 · 2026-10-01（P18-0 … P18-H 全十二波）

> 用途：给评审人（yqh）一次性复核 P1.8 增量交付的**全部机器证据、CI 留档、线上核对与遗留项**。
> 口径照 `docs/audit-package/13-acceptance/`（确切命令 + 期望结果 + 判定；【实测】= 本轮真跑过）。
> 生成时间：2026-10-01（本地 Asia/Shanghai）。HEAD = `12de9c9`。Node `v22.22.2`。

---

## 0. 结论先行

| 项 | 结论 |
|---|---|
| 可否进入审查 | ✅ **可审**。十二波证据链全部 CLOSED、十二次 CI 全 success、全量复跑 28/28 EXIT=0 |
| 发布门（机器） | `RELEASE=APPROVED` —— **43 项判据 43 PASS / 0 FAIL / 0 PENDING**（PENDING 已清零） |
| 工程门 P18-G1..G6 | 🟢 **INVARIANTS READY**（六门全绿；P18-G4 于 P18-F 由 PENDING 翻 PASS） |
| 阶段发布门 P18-R1/R2 | 🟢 PHASE RELEASE READY（2/2） |
| 线上 | ✅ `https://geek-typing.pages.dev/` HTTP 200；部署 chunk 与本地构建**逐字节同尺寸**（436908 B） |
| 未提交改动 | ✅ 干净（本审查包自身 `docs/p18/_generated/review/**` 除外） |
| **需要评审人拍板的** | 3 项（见 §9）：R2 凭据半波、`warmUpVocabulary` 按需口径、inline 词库改 lazy |

---

## 1. 十二波提交链（`git log --oneline` 自 P18-D 起；更早见仓库历史）

| 波 | 关键提交 | 内容 |
|---|---|---|
| P18-D | `6e39c47` `e6d0b61` | CI 留档；去掉 CI 步名里易漂的计数，改为指向单一事实源 |
| P18-E | `9dc907d`→`963082c` `41641c8` `21cb11e` `aed28c3` `2338352` `8057977` | 裁定 ⑨ → Query/Index 放开 `reading` → 断言可证伪化 → 判据 I/I2 → 证据 → CI |
| P18-F | `08275d1` `ebc885c` `1e55421` `1bc5d21` `309dbd8` | 裁定 ⑩ → INV-4 判据（双通道 + 证伪）→ **P18-G4 翻 PASS** → 证据 → CI |
| P18-G0 | `425b0ae` `97ea176` `7312f9e` `7fb8499` `4af5681` | 裁定 ⑪ → relations 端点可达性扩展到非 word（共享模块 + `--root`）→ 证据 → CI |
| P18-E2 | `8d2df9f` `14565b7` `4b6ef62` `32b126f` `255cc8f` | 裁定 ⑫ → registry runtime 投影（判据 J）→ 证据 → CI |
| P18-G1 | `4084ac3` `beeb9cc` `a43ca32` `eb2194c` | 裁定 ⑬（字幕归属）→ 真实 relations 落地 → 证据 → CI |
| P18-G2 | `49d5f07` `99e6767` `ab43875` `fbe7804` | 修 `ingest` EMIT 幂等 → 回写 → 证据 → CI |
| P18-H | `d86dd03` `01aa1c5` `dba50ba` `12de9c9` | UI 门面收敛（`bypassFacadeImports` 2→0）→ 裁定 ⑭ → 证据 → CI |

> 更早四波（P18-0/A/B/C）的证据与 CI 留档见 `docs/p18/_generated/evidence|P18-CI 对应目录`，未在本表重列。

---

## 2. 证据链汇总（机器证据，`evidence-run` + `evidence-verify`）

| 波 | 任务数 | CLOSED checks | matrix commit |
|---|---|---|---|
| P18-0 | 12 | 97/97 | `6ecbb06` |
| P18-A | 15 | 121/121 | `2437f80` |
| P18-B | 17 | 137/137 | `e3f4a07` |
| P18-C | 18 | 145/145 | `eaab81e` |
| P18-D | 20 | 161/161 | `fd811b1` |
| P18-E | 20 | 161/161 | `963082c` |
| P18-F | 21 | 169/169 | `1e55421` |
| P18-G0 | 23 | 185/185 | `7312f9e` |
| P18-E2 | 23 | 185/185 | `4b6ef62` |
| P18-G1 | 23 | 185/185 | `beeb9cc` |
| P18-G2 | 23 | 185/185 | `99e6767` |
| P18-H | 23 | 185/185 | `01aa1c5` |

复查命令（任选一波）：

```bash
node scripts/evidence-verify.mjs --wave=P18-H     # 期望：Evidence Chain: CLOSED（checks 185/185）
```

> 纪律：先提交实现、后跑证据 ⇒ `matrix.commit == 当时 HEAD`（上表每行都可对）。
> 证伪自检是**独立证据任务**（`FALSIFY-*`），不进 CI 每次构建 —— 「不会失败的门等于没有门」。

---

## 3. CI 汇总（GitHub Actions · Build & Deploy to Cloudflare Pages）

| 波 | Run ID | 结论 | 墙钟 |
|---|---|---|---|
| P18-0 | `36694319846` | success | 见各波 `_CI-INDEX.md` |
| P18-A | `36697690677` | success | ″ |
| P18-B | `36720827743` | success | ″ |
| P18-C | `36727450290` | success | ″ |
| P18-D | `36734600260` | success | 208s |
| P18-E | `36741393552` | success | 212s |
| P18-F | `36747755644` | success | 203s |
| P18-G0 | `36792809578` | success | 196s |
| P18-E2 | `36804767876` | success | 215s |
| P18-G1 | `36806199114` | success | 211s |
| P18-G2 | `36807053274` | success | 230s |
| P18-H | `36812800054` | success | 242s |

每波均为**四 job 全 success**（门禁①静态与内容 / ②构建产物 / ③端到端 / 部署到 Cloudflare Pages）。
原始 job JSON 与逐波索引：`docs/p18/_generated/ci/<波>/`（`_CI-INDEX.md` + `run-<id>-jobs.json`）。

复查命令：

```bash
gh run view 36812800054 --repo yqh-core/geek-typing     # 期望：conclusion=success，4 job
```

---

## 4. 权威体积数字（INV-3：预算常量一行未动）

| 阶段 | 主 chunk | 余量（raw / gzip） |
|---|---|---|
| P18-C/D 基线 | 424.25 KiB raw / 134.21 gzip | 3.5% |
| P18-E 后（全表进 runtime） | **432.15 KiB** / 136.13 | 1.7% / 3.9% |
| P18-E′ 投影后 | 427.56 KiB / 134.86 | 2.7% / 4.8% |
| P18-E′ + query 去重（当前） | **426.67 KiB / 134.84**（436908 B） | **2.9% / 4.8%** |

预算：`439.45 KiB raw / 141.60 KiB gzip`（`scripts/gate-perf.mjs`，**未上调**）。
富元数据确已出包：主 chunk 内 `progressKind` / `packageLevel` 命中数均为 **0**。

复查命令：

```bash
git clean -xdf dist && npm run build && node scripts/check-bundle.mjs
# 期望：1. ✓ PASS 主 chunk … 426.67 KiB raw / 134.84 KiB gzip ≤ 439.45/141.60 KiB
```

---

## 5. 合同状态（`P1.8-RELEASE-GATE-CONTRACT.md`）

| 门 | 状态 |
|---|---|
| P18-G1 INV-1 P1.7 冻结零改动 | ✅ PASS |
| P18-G2 INV-2 UI 只经门面 | ✅ PASS（`bypassFacadeImports` 已归零） |
| P18-G3 INV-3 预算不得上调 | ✅ PASS |
| P18-G4 INV-4 媒体一律远程 | ✅ PASS（P18-F 落地第 22 项判据；`--falsify` 4/4） |
| P18-G5 INV-5 来源/版权硬门 | ✅ PASS |
| P18-G6 INV-6 类型契约唯一 | ✅ PASS（判据 A–H(+H3) + **I/I2 + J**，证伪 13/13） |
| P18-R1 / P18-R2 | ✅ PASS |

```bash
node scripts/verify-release-gate.mjs
# 期望：总判定：43 项判据 —— 43 PASS / 0 FAIL / 0 PENDING；RELEASE=APPROVED
```

---

## 6. 全量复跑留档（发布门要求的收尾项）

- 留档文件：**`docs/p18/_generated/review/FINAL-TEST-OUTPUT-P18.md`**（本包同目录）
- 内容：28 项命令逐一执行 + 输出原文 + `EXIT=` —— **全部 EXIT=0**
  （build / tsc / lint / 冻结与 manifest 校验 / content 三件套含证伪 / 三个 gate 含证伪 /
  四个测试 / 体积与证伪 / perf / architecture / todo / learning-boundary / e2e / content / learning /
  offline / release:gate）
- 附带的两个验收点：
  1. `content:ingest` 幂等 —— 跑完 `content/license-policy-1.json` **未漂移**（P18-G2 修复）
  2. 跑完全套后 `git status --porcelain` 只剩本审查包目录

---

## 7. 线上核对（生产清单口径）

| # | 检查 | 命令 | 实测 |
|---|---|---|---|
| 7.1 | 站点可达 | `curl -s --noproxy '*' -o /dev/null -w '%{http_code}' https://geek-typing.pages.dev/` | **HTTP 200**（2007 B） |
| 7.2 | 部署 chunk 名 | `curl -s --noproxy '*' https://geek-typing.pages.dev/ \| grep -o 'assets/index-[A-Za-z0-9_-]*\.js'` | `index-BWml2sHn.js` |
| 7.3 | 与本地构建同尺寸 | 比对 `dist/assets/index-BWml2sHn.js` | 线上 **436908 B** = 本地 **436908 B** ✅ |

> 本机前提（照 `PRODUCTION_CHECKLIST.md` §0）：探测线上**必须**加 `--noproxy '*'`（本机有 4 个代理变量）；
> 用 `curl` 而不是裸 `urllib`（无 UA 会被 CF 403）。

---

## 8. 未提交改动清点

```bash
git status --porcelain     # 期望：空（本审查包提交后）
git log --oneline -1       # 期望：12de9c9 或更新
```

实测：干净（已还原 `test:offline` 造成的 `tests/_evidence/offline-audit-result.json` 漂移，见 §9.4）。

---

## 9. 遗留项（需要评审人拍板 / 已登记未做）

| # | 项 | 性质 | 现状与下一步 |
|---|---|---|---|
| 9.1 | **P18-G 资产半波**：`AssetManifest` 落盘 + `/media/*` 同源代理（R2） | **卡外部凭据** | 产物尚不存在 ⇒ 按裁定 ⑩-5 **不许记 PASS**。需 Cloudflare R2 绑定凭据后可开工 |
| 9.2 | `warmUpVocabulary` 改按需+限量（Plan P18-C 第二项） | **产品/UX 决策** | 当前预热 ielts/kaoyan/toefl 合计 496.89 KiB gzip（预算 600，余 17.2%）。"预热哪些库"需先定口径 |
| 9.3 | 注册表自动化（Plan P18-C 第一项） | 大改动，**需单独裁定** | 侦察结论：`import.meta.glob` 全量 eager 会把 496 KiB 词库拉进主包、破坏 inline/lazy 分流 ⇒ 只能走构建期 codegen + 同步判据；且会牵动以文本扫描 `registry.ts` 为生的判据（validate 判据 20、check-bundle 判据 4/5） |
| 9.4 | `test:offline` 会改写已入库的 `tests/_evidence/offline-audit-result.json` | **已知项（非幂等缺陷）** | 内容随运行变化（抽样词随机：`单词=classify` → `单词=pipeline`），不是时间戳漂移 ⇒ 不能照 P18-G2 的幂等修法处理。每次跑完需人工决定是否提交；本轮已还原 |
| 9.5 | 7 个 inline 词库改 lazy（约 36 KiB） | 低优先 · 产品决策 | inline 为"首屏可得"，改 lazy 需 UX 侧确认加载态 |
| 9.6 | `gate:todo` 按行号登记 | 低优先 | 行号漂移会导致误登记/漏登记，宜改内容锚点 |
| 9.7 | CI 注解：`Node.js 20 is deprecated` / `ubuntu-latest → Ubuntu 26`（2026-10-19） | 外部 · 低优先 | 升 action 版本即可；到期前关注 e2e |

---

## 10. 审查者自查清单（照 13-acceptance 清单口径）

| # | 检查 | 确切命令 | 期望 |
|---|---|---|---|
| 10.1 | 冻结区零改动 | `node scripts/verify-p17-frozen.mjs` | EXIT=0 |
| 10.2 | 交付包完整性 | `node scripts/verify-manifest-hashes.mjs` | 全 ✅、0 处不符 |
| 10.3 | 内容门禁 | `node scripts/content/validate.mjs` | EXIT=0（22 项判据、18 包） |
| 10.4 | INV-4 判据能判红 | `node scripts/content/validate.mjs --falsify` | EXIT=0，4/4 断言 |
| 10.5 | 类型契约 | `node scripts/gate-content-type-contract.mjs` | EXIT=0（含 J1/J2/J3） |
| 10.6 | 类型契约能判红 | `node scripts/gate-content-type-contract.mjs --falsify` | EXIT=0，13/13 |
| 10.7 | UI 契约 | `node tests/ui-contract.mjs` | `bypassFacadeImports=0`、两个硬零桶 =0 |
| 10.8 | UI 契约能判红 | `node tests/ui-contract.mjs --falsify` | EXIT=0，20/20 |
| 10.9 | relations 端点（真实数据） | `node scripts/content/validate.mjs \| grep relations` | reading 4 条 / collection 7 条"端点合法且可达" |
| 10.10 | 体积 | `git clean -xdf dist && npm run build && node scripts/check-bundle.mjs` | 424.47 KiB ≤ 439.45（9.5 已把这 2 包改 lazy；余量 3.4% / 4.9%） |
| 10.11 | 发布门 | `node scripts/verify-release-gate.mjs` | 43 PASS / 0 PENDING / APPROVED |
| 10.12 | 线上 | `curl -s --noproxy '*' -o /dev/null -w '%{http_code}' https://geek-typing.pages.dev/` | 200 |

> ⚠️ 跑 `--falsify` 时**严禁用 `| head` 截断**（SIGPIPE 会把进程打死在"已注入未还原"的中间态，
> 留下注入残留）；用 `| tail` 或重定向，跑完立刻 `git status --porcelain` 验残留。

---

## 11. 补录：上一轮评审之后又改的三处（2026-10-01 同日，含一条自我更正）

本审查包生成时的 HEAD 是 `12de9c9`。之后又推进了 A/B/C/D 四步与一次 Final Consistency Sweep，
有三处**会影响评审结论**，补在这里；`docs/p18/P18-CLOSURE-STATUS.md` 是总索引。

### 11.1 ⚠️ 自我更正：本包 §0「十二次 CI 全 success」当时说过头了

`e4b6674`（只改文档）那一笔 CI（`36840665242`）的 `门禁③ 端到端` 实际是 **failure**：
唯一红项是预热探针 `❌ 预热探针：… 轮询 120s 超时 — 0 个 words chunk`（其余 169/170 全过）。
同一份 src 的三笔 CI 是 **绿（515941c）/ 红（e4b6674）/ 绿（1f46ab9）** ⇒ 是 **flaky，不是代码回归**。
根因**没有定死**（详见 §11.3 那条被证伪的推断），处置是把出事的那一刀拔掉（§11.3）。

### 11.2 契约一致性（对应评审的第七项）已收

- `CONTENT_CONTRACT.md` §13.2 / `content/README.md` §15.2 改名「**历史基线**」并加 ⚠️ 说明，
  「当前实测」不再与「P0.6.1 时代基线」并存于同一层级；
- §13.3/§13.4、§15.3 的实验表与外推明确标成 **Historical baseline / planning estimate**，
  「当前实测」一律集中到 §13.5 / §15.1，并以 `npm run check:bundle` / `npm run content:validate` 输出为准；
- **I-20 改为原则式、不抄任何动态数值**（契约阈值 ≠ 当前预算层，抄进来必然过期）；
- 状态措辞同步：DECISIONS §0、SIGN-OFF 4 行 + 汇总 + §5、HYGIENE PLAN §4 → §4.1/§4.2。

### 11.3 e2e 预热探针：处置方式 + 一条被证伪的推断

**先说被证伪的那条**，免得按它继续下沉：`src/main.tsx` 的 `warmBanks` 在 `await navigator.serviceWorker.ready`
之后只等 `navigator.serviceWorker.controller` **最多 5s** 就照样 `import()`，而未接管页面的动态
import 不经过 SW fetch handler ⇒ chunk 永不入缓存 —— **机制为真**，但改成「先按状态等接管（30s 上限）再 reload」
之后，独立证伪脚本**仍稳定复现 0 hits**（诊断显示 `controller` 恒 false、`gt-shell-v3` 全程没建出来）。
⇒ 「不等接管」不是充分条件，不能当根因结论写。

**处置（`a49bcc7`）**：直接删掉「清空 SW 缓存 + 重新加载」这一步。依据是它本就多余 ——
探针跑在 `mctx` 这个新开浏览器上下文（独立 profile ⇒ 独立 SW 缓存），该上下文只服务【14】的
移动端手势、**从不切词库**；套件【15】用的是主上下文（`tests/e2e.mjs:208`），两边共享不到。
探针改为**按状态等 SW 接管**（上限 30s），失败 Diagnosis 拆成「SW 没接管/缓存没建出来（**测不到**）」
与「预热没把 chunk 写进缓存（**测到没通过**）」两种，新增一条前提断言。
**证伪性质不削弱**：删掉 `warmUpVocabulary` ⇒ 0 hits ⇒ 仍判红。

**同时只登记、本轮不改的生产侧缺口**：慢设备上 SW 激活超过 5s 时 `warmBanks` 会在未接管状态 import
⇒ 预热静默失效（首次离线仍切不了大词库），而 `Promise.allSettled` 把失败吞掉、无日志。非 P18 引入。

### 11.4 门健壮性（`abc99af`）

`scripts/gate-lint.mjs` 的 spawn 失败原本是裸崩（未捕获异常栈，不属于三态之一）。
改为可读诊断 + 顶层 catch ⇒ **UNKNOWN / EXIT 2**，即「这台机器没能测 lint」≠「lint 通过」。
本机 sustained `EBUSY`（spawnSync / execFileSync / 绝对路径 node.exe 三种全挂，而直接 `node` 正常），
错误信息里直接给了分流：`node node_modules/oxlint/bin/oxlint --format=json` 能跑通就说明 oxlint 与门都没坏。

### 11.5 最终证据（同一次 run —— 对应评审第七项）

`a49bcc7` ⇐ CI run **36846847388**，四道门禁全过，下表数字**与这一次 run 同源**，不是各门禁分别挑最好的一次拼的：

| 门禁 | 结论 | 关键实测 |
|---|---|---|
| ① 静态与内容（无产物） | ✅ | `content:validate` 18 包全部通过、`test:content` 179/179、`test:ui-contract` 19/19、`gate:license`(INV-5)、`gate:lint` 当前 0 条 = 基线 0 条 |
| ② 构建产物（体积 + 离线） | ✅ | `check:bundle` 6/6；主 chunk **424.47 KiB raw / 134.61 KiB gzip** ≤ 439.45/141.60（余量 3.4% / 4.9%，即 §3.1 那个 4.9%）；`test:offline` 过 |
| ③ 端到端（`test:e2e`） | ✅ | **171/171**；含「✓ 预热探针前提：SW 已接管 — 等接管 19ms」+「✓ 预热探针：2 个 words chunk」 |
| 部署到 Cloudflare Pages | ✅ | 已部署 |

本地同源：`npm run test:e2e` 171/171、`oxlint` 0 warnings、`check:bundle` 6/6。
