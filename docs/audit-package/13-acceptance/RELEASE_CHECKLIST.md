# RELEASE_CHECKLIST.md · 发布前检查单

> 状态：`【已有】` —— 所有命令与脚本名均在 commit `4152eb2` 的 `package.json` 中逐条核实
> 环境：Windows 11 + Git Bash；Node `v22.22.2`；npm `8.5.2`；生产 `https://geek-typing.pages.dev`
> 本文件用途：**发布前逐条勾选**。三条结论态：**可以发布 / 有条件发布 / 不可发布**

---

## 0. 当前判定

| 项 | 值 |
|---|---|
| **当前判定** | 🟡 **有条件发布** |
| 判定依据 | 本地 10 项门禁全绿（见 `FINAL_ACCEPTANCE.md` §1）；生产冒烟 21/22，唯一失败项 A3 为**流程性漂移**而非站点缺陷；存在 3 项需人工决策的阻塞项（见 §10） |
| 允许发布的前提 | §10 的 3 项阻塞项已由**人工**逐条处置（接受 / 修复 / 降级），且 §2 内容门禁与 §4 体积门禁**至少各跑过一次且全绿** |
| 为什么不是"可以发布" | CI 不跑任何内容门禁、体积门禁与测试（`DEBT-002`）；门禁全绿是**本机手动结论**，不可复现于流水线 |
| 为什么不是"不可发布" | 无内容合规失败、无类型错误、无体积破线、无 E2E 失败；唯一的失败项已被证明是"检查项按设计正常工作" |

**一句话**：**产物本身可以上线；但上线的质量保证目前只存在于开发者本机，不存在于流水线。** 这是"有条件"这个词的全部含义。

---

## 1. 使用说明

| 符号 | 含义 |
|---|---|
| ✅ | **自动化可判定** —— 命令退出码 / 输出即可判定通过，无需人工解释 |
| 👤 | **需人工确认** —— 命令只提供证据，是否通过需人判断（口径、视觉、政策） |
| 🔴 | **当前阻塞项或需人工决策项** |
| ⚪ | 非阻塞、可选加强项 |

**执行顺序有硬依赖**：§4 体积门禁**必须在 §4 的 build 之后**跑（`check-bundle.mjs` 读 `dist/`；`dist` 不存在时它判 `UNKNOWN` 并 `exit 1`）。§6 生产冒烟**必须在部署之后**跑。

---

## 2. 内容门禁（20 项）

| # | 检查 | 确切命令 | 期望结果 | 判定 |
|---|---|---|---|---|
| 2.1 | 内容校验 20 项全通过 | `npm run content:validate` | 末行 `[content:validate] PASS：10 包全部通过`；10 个包逐项 `✓` | ✅ |
| 2.2 | 内容契约测试 149 项 | `npm run test:content` | 末行 `共 149 项，通过 149，失败 0` | ✅ |
| 2.3 | 契约测试跑的是**生产源码**而非副本 | 见 `npm run test:content` 内部用 `vite ssrLoadModule` | 无需单独执行；确认它不读 `dist` | 👤 |
| 2.4 | 全库词条数符合预期 | `npm run content:list` | 10 包；全库 **9346** 词（inline 7 包/346 词，lazy 3 包/9000 词） | ✅ |
| 2.5 | 包内无重复词条 / 跨包无 duplicate ContentId | 含在 `npm run content:validate` 第 3、16 项 | 两项均 `✓` | ✅ |
| 2.6 | `stats.items` 与实际一致、checksum 一致 | 含在 `2.1` 第 4、5 项 | 均 `✓` | ✅ |
| 2.7 | 策略一致性（manifest ↔ registry）：inline 7 / lazy 3 | 含在 `2.1` 第 20 项 | `✓ 策略一致性（manifest ↔ registry）：10 包一致` | ✅ |
| 2.8 | inline 预算 ≤ 1000 词 / ≤ 64 KiB | 含在 `2.1` 第 19 项 | `✓ inline 预算（7 包 | Σ 346 词 / 36.17 KiB ≤ 1000 词 / 64 KiB）` | ✅ |

> **注**：2.1 已包含 20 个子项，本表把其中与发布风险最相关的 5 项单列，便于失败时快速定位。
> **注**：`content` 契约层的问题（CET 覆盖率 `CONTENT-001`、9 条空 definition `BUG-001`）**不会**被这 20 项拦住 —— 它们不在门禁设计范围内。发布前需人工评估是否接受（见 §10）。

---

## 3. 类型与静态检查

| # | 检查 | 确切命令 | 期望结果 | 判定 |
|---|---|---|---|---|
| 3.1 | TypeScript 类型检查 | `npx tsc -b`（亦含在 `npm run build` 内） | 退出码 0，无输出 | ✅ |
| 3.2 | lint | `npm run lint` | `oxlint` 退出码 0；**当前 0 error / 16 warning** | ✅ |
| 3.3 | 16 个 warning 是否可接受 | `npm run lint` 输出逐行阅读 | 均为字符类 `\-` 转义风格提示（`DEBT-006`） | 👤 |
| 3.4 | ⚪ 是否清理 16 warning | — | 非阻塞；可在本版清理或在 P1 处理 | 👤 |

**注意**：`npm run lint` 使用 **oxlint**（Rust 实现，非 ESLint）。CI 中**不存在** lint 步骤（`DEPLOYMENT.md` §4.1）。

---

## 4. 构建与体积

| # | 检查 | 确切命令 | 期望结果 | 判定 |
|---|---|---|---|---|
| 4.1 | 先清空产物，避免读到陈旧 dist | `rm -rf dist` | — | ✅ |
| 4.2 | 构建（含类型检查） | `npm run build` | `✓ 1939 modules transformed.` + `✓ built in …`；退出码 0 | ✅ |
| 4.3 | 体积门禁 3 项 | `npm run check:bundle` | 末行 `[check-bundle] PASS：3 项全部通过` | ✅ |
| 4.4 | 主 chunk raw ≤ 420 KiB | 见 `4.3` 第 1 项 | 实测 **381.09 KiB**（余量 **9.3%**） | ✅ |
| 4.5 | 主 chunk gzip ≤ 135 KiB | 见 `4.3` 第 1 项 | 实测 **118.91 KiB**（余量 **11.9%**） | ✅ |
| 4.6 | `words-*` chunk 数 ≥ registry lazy 包数 | 见 `4.3` 第 2 项 | `3 ≥ 3`（**刚好相等，无余量**） | ✅ |
| 4.7 | 预热预算 gzip ≤ 600 KiB | 见 `4.3` 第 3 项 | 实测 **497.03 KiB**（余量 **17.2%**） | ✅ |
| 4.8 | 产物结构与 hash 命名符合预期 | `ls dist/ dist/assets/` | `dist/` 含 `index.html` + `assets/` + `sw.js`/`_headers`/`manifest.webmanifest`/`robots.txt`/`sitemap.xml`/图标；`assets/` 内文件名带内容 hash | 👤 |
| 4.9 | 主 chunk 余量是否够本次发布的新增体积 | 对比本次 diff 预估增量 | **余量仅 9.3% raw / 11.9% gzip** —— 引入任何中等规模依赖即可能破线 | 👤 🔴 |

> **口径提醒（易踩坑）**：vite 自报用 **kB（十进制 1000）**，`check-bundle.mjs` 用 **KiB（二进制 1024）**。同一文件两个数字：主 chunk vite 报 `390.23 kB`，门禁报 `381.09 KiB`。**两者都对，不要互相"纠正"**。
> **本机实测注意**：本机装有 Esafenet 透明加密驱动，首次全新构建实测 `built in 25.12s`（Vite 自报 `vite:build-html transform 占 92% / 23.2s`），连跑第二次 `21.27s`；历史文档记录的 `7.07s` 未能在本机复现。**构建耗时不是门禁，不阻塞发布**，详见 `PERFORMANCE.md`。

---

## 5. 端到端（E2E）

| # | 检查 | 确切命令 | 期望结果 | 判定 |
|---|---|---|---|---|
| 5.1 | 起预览服务（另一终端） | `npm run preview` | 监听 `http://127.0.0.1:4173`（`--strictPort`，端口被占用会直接失败） | ✅ |
| 5.2 | 预览服务可访问 | `curl -sf http://127.0.0.1:4173/ >/dev/null && echo OK` | 输出 `OK` | ✅ |
| 5.3 | E2E 165 项 | `npm run test:e2e` | 末行 `共 165 项，通过 165，失败 0` | ✅ |
| 5.4 | E2E 无 console / page 运行时错误 | 见 `5.3` 的【12】分区 | 该分区 `✓` | ✅ |
| 5.5 | 移动端无横向溢出 | 见 `5.3` 的【11】分区 | 该分区 `✓` | ✅ |
| 5.6 | 懒加载 chunk 正常出词 | 见 `5.3` 的【15】分区 | 考研/托福 lazy chunk 正常出词 | ✅ |
| 5.7 | ⚪ 本机代理是否干扰测试 | `env | grep -i proxy` | 本机 `https_proxy=http://127.0.0.1:64500` 存在；若出现假失败，用 `--no-proxy-server` 或清代理后重跑 | 👤 |

> **已知环境坑**：本机 `https_proxy` 会拦截本地请求，历史上导致过假失败。抓截图脚本按 `FINAL_ACCEPTANCE.md` §6 的说明强制 `--no-proxy-server`。E2E 若出现可疑 `ERR_FAILED`，先排除代理因素（`FLAKY-002`）。

---

## 6. 生产冒烟（部署后）

| # | 检查 | 确切命令 | 期望结果 | 判定 |
|---|---|---|---|---|
| 6.1 | 生产冒烟 22 项 | `npm run test:smoke` | **当前实测 21 / 22** | 👤 🔴 |
| 6.2 | A1 `/index.html` → 308 重定向到 `/` | 见 `6.1` 输出 | `✅ 308 重定向到 /` | ✅ |
| 6.3 | A2 `/sw.js` → 200 + `Cache-Control: no-cache` | 见 `6.1` 输出 | `✅` | ✅ |
| 6.4 | A3 线上 `/` 引用 bundle 与本地 dist 一致 | 见 `6.1` 输出 | ❌ **当前 FAIL**（线上 `index-Cawl4_-q.js` ≠ 本地 `index-Dw5EkkBq.js`） | 👤 🔴 |
| 6.5 | A4 bundle 200 + br 压缩 + immutable 强缓存 | 见 `6.1` 输出 | `✅` | ✅ |
| 6.6 | A5 3 个懒加载 chunk 全部 200 | 见 `6.1` 输出 | `✅` | ✅ |
| 6.7 | B1 全新访客 SKIP_WAITING 立即接管 | 见 `6.1` 输出 | `✅` | ✅ |
| 6.8 | B2 断网 reload 走缓存成功 | 见 `6.1` 输出 | `✅` | ✅ |
| 6.9 | B3 v1 残留缓存被 activate 清理 | 见 `6.1` 输出 | `✅` | ✅ |
| 6.10 | 生产离线套件（打线上域名） | `npm run test:prod` | `结论：✅ 全部通过` | ✅ |

**A3 的处置口径（重要）**：A3 失败**不代表站点有缺陷**，它代表"本地构建产物 ≠ 线上部署产物"。本轮成因见 §10 阻塞项 ①。
**A3 的判定规则**：只有当"线上引用 == 本地 `dist/assets/` 里的 `index-*.js`"时才算通过。因此 **A3 只在"部署完成后、且本地未再改动源码"的窗口期内有效**。

---

## 7. 离线能力

| # | 检查 | 确切命令 | 期望结果 | 判定 |
|---|---|---|---|---|
| 7.1 | 离线套件（本地预览） | `npm run test:offline`（需 `5.1` 的预览服务） | `结论：✅ 全部通过` | ✅ |
| 7.2 | 态 1：SW ready + active + **controller 存在** | 见 `7.1` 输出 | `✅` | ✅ |
| 7.3 | 态 1.5：在线 reload 正常（对照组） | 见 `7.1` 输出 | `✅` | ✅ |
| 7.4 | 态 2：断网 reload 无 `ERR_FAILED`、落 Home、可打字 | 见 `7.1` 输出 | `✅` | ✅ |
| 7.5 | 态 3：断网下背单词功能完整 + 零 console error | 见 `7.1` 输出 | `✅` | ✅ |
| 7.6 | 态 4：`gt-shell-v3` 无 `redirected=true` 毒条目 | 见 `7.1` 输出 | `✅` | ✅ |
| 7.7 | 生产 SW 版本串正确 | `curl -s --noproxy '*' https://geek-typing.pages.dev/sw.js \| grep -o "gt-shell-v[0-9]*" \| sort -u` | 唯一值 `gt-shell-v3` | ✅ |
| 7.8 | 生产 `/sw.js` 不被 HTTP 缓存（升级链路启动条件） | `curl -sSI --noproxy '*' https://geek-typing.pages.dev/sw.js \| grep -i cache-control` | `cache-control: no-cache` | ✅ |
| 7.9 | 缓存条目证据落盘 | `cat tests/_evidence/offline-audit-result.json` | 文件存在且为本次运行结果 | 👤 |
| 7.10 | ⚪ SW 更新提示 / 离线状态 UI | — | **不存在**（`UX-001`、缺口 O-2）；`skipWaiting` 为立即接管，用户无感知 | 👤 |

---

## 8. 截图与文档

| # | 检查 | 确切命令 | 期望结果 | 判定 |
|---|---|---|---|---|
| 8.1 | 重新抓取 17 张截图 | `node scripts/audit-capture.mjs` | 17 张全部成功；脚本自带 preview 生命周期，可重复执行 | ✅ |
| 8.2 | 截图与当前构建产物一致 | 目视 `docs/audit-package/screenshots/` | desktop 5 / mobile 3 / tablet 3 / states 6 = **17** | 👤 |
| 8.3 | 结算浮层截图可稳定抓取 | 见 `8.1` 的 `states/result-overlay.png` | 存在且为结算浮层 | 👤 🔴 |
| 8.4 | 内容样本数字可复核 | `node docs/audit-package/_generated/verify-samples.mjs` | 76 项断言通过 | ✅ |
| 8.5 | 资料包数字口径与本次实测一致 | 对照 `PERFORMANCE.md` 的基线表 | 主 chunk raw/gzip、预热合计三项对齐 | 👤 |
| 8.6 | 资料包状态标注未被误读为"已完成" | 检查目标文档顶部标注 | `【已有】`/`【待建】` 必须存在且准确 | 👤 |

---

## 9. 合规

| # | 检查 | 确切命令 | 期望结果 | 判定 |
|---|---|---|---|---|
| 9.1 | 仓库根有无 `LICENSE` | `ls LICENSE*` | ❌ **不存在**（`LEGAL-001`） | 👤 🔴 |
| 9.2 | `package.json` 有无 `license` 字段 | `grep '"license"' package.json` | ❌ **无**（仅 `private: true`） | 👤 🔴 |
| 9.3 | 内容侧 MIT 声明与随附许可全文是否闭环 | 读 `content/vocabulary/*/manifest.json` 的 `license` | 5 个包声明 MIT，但**仓库无许可全文** ⇒ 链条不闭环 | 👤 🔴 |
| 9.4 | 内容来源与许可元数据完整 | `npm run content:validate` 第 6 项 `license 结构化（self）` | `✓`（结构完整，但**不等于**法律链条完整） | ✅ |
| 9.5 | 有无 CSP | `curl -sSI --noproxy '*' https://geek-typing.pages.dev/ \| grep -i content-security-policy` | ❌ **零命中**（`SECURITY-001`） | 👤 |
| 9.6 | 已有 4 条安全头在生产生效 | `curl -sSI --noproxy '*' https://geek-typing.pages.dev/ \| grep -iE "x-content-type-options\|referrer-policy\|x-frame-options\|cross-origin-opener-policy"` | 4 条全部存在 | ✅ |
| 9.7 | 有无 `Strict-Transport-Security` | 同上，grep `strict-transport-security` | ❌ **未下发**（CF 面板侧可能已开 HSTS，**未能实测确认**） | 👤 |
| 9.8 | 是否有隐私政策 / 用户数据合规文本 | `ls docs/audit-package/11-legal/` | 需人工确认是否有对外发布所需文本 | 👤 |
| 9.9 | ⚪ 域名与备案 | 见 `PRODUCTION_CHECKLIST.md` §8 | **主域名未备案**；仅用 `*.pages.dev` 平台子域 | 👤 🔴 |

---

## 10. 阻塞项 / 需人工决策项

> 以下 3 项为**当前版本的确定性阻塞或决策点**。三项全部处置完毕前，本清单不得勾选为"可以发布"。

### 🔴 ① 20 项内容门禁 + 3 项体积门禁未接入 CI

| 项 | 值 |
|---|---|
| 现象 | `deploy.yml` 只跑 `npm run build`；`e2e.yml` 只跑 build + `node tests/e2e.mjs` |
| 未执行的门禁 | `content:validate`(20) / `check:bundle`(3) / `test:content`(149) / `test:offline`(4) / `test:smoke`(22) / `lint` |
| 实测确认方法 | `grep -n "content:validate\|check:bundle\|test:" .github/workflows/*.yml` → **零命中** |
| 后果 | 内容或体积击穿阈值**仍可正常部署**；历史上 namespace 撞车真实发生过一次 |
| 编号 | `DEBT-002` |
| 决策选项 | (a) 本次发布前补入 3 行 YAML（成本极低，`DEPLOYMENT.md` §4.3 已给出代码）；(b) 接受"本机手动跑"并在资料包中如实声明；(c) 降级为 P1 处理 |
| 我的建议（`【主观】`） | 选 (a)。**这是本资料包性价比最高的一处改动**，且能消除本条阻塞 |

### 🔴 ② 生产冒烟 21/22，A3 因「本地 dist 与线上部署不一致」失败

| 项 | 值 |
|---|---|
| 现象 | `❌ A3: / → 200 且引用 bundle 与本地 dist 一致 — status=200 期望=/assets/index-Dw5EkkBq.js` |
| 线上引用 | `assets/index-Cawl4_-q.js` |
| 本地 `dist` | `assets/index-Dw5EkkBq.js`（本轮实测复现，见 §4.2） |
| 根因 | ① 本轮审计向 `ResultOverlay.tsx` 新增了 `data-testid`（未 commit）；② 本地重跑 `npm run build` ⇒ hash 变化；③ 未 push ⇒ 线上仍是上次部署产物 |
| 性质 | **这是 A3 按设计正常工作** —— 它准确报出了"本地/线上漂移"，**不是站点缺陷** |
| 编号 | `FLAKY-001` |
| 决策选项 | (a) 处置 ① 后重新部署，A3 自然恢复 22/22；(b) 明确"该检查仅在部署后窗口期有效"并在流程中记录；(c) 在 CI 运行时加"仅比对 git 已提交产物"的前置条件 |
| 我的建议（`【主观】`） | 选 (a)+(b)。(b) 是长期解 —— A3 天然对流程状态敏感，"flaky" 指的是**对流程状态敏感**而非测试不准 |

### 🔴 ③ `src/components/ResultOverlay.tsx` 的审计改动未 commit，需决定是否保留

| 项 | 值 |
|---|---|
| 改动 | 新增 `data-testid="result-overlay"` |
| 性质 | **零行为变更的测试钩子**；为稳定抓取"结算浮层"截图（`states/result-overlay.png`）所必需 |
| 当前状态 | `git status` → `M src/components/ResultOverlay.tsx`，**未 commit、未 push** |
| 决策选项 | (a) commit 并随本次发布上线；(b) 在 `audit-capture.mjs` 里改用其它选择器，回退源码改动；(c) 保留改动但不 commit（**不推荐**：会持续让 A3 失败） |
| 我的建议（`【主观】`） | 选 (a)。它让 E2E/截图对结算浮层有稳定锚点，零行为风险，且能顺手让 A3 恢复 22/22 |

### 附：非阻塞但建议知悉

| # | 事项 | 编号 |
|---|---|---|
| ④ | 9 条词条 `definition` 为空字符串（`ielts:helpline`、`toefl:supercontinent` 等 9 条）；非空覆盖率真值 9144/9346 = 97.84% | `BUG-001` |
| ⑤ | CET 词库覆盖率严重不足：`cet4` 84 词（≈1.9%）、`cet6` 69 词（≈1.3%） | `CONTENT-001` |
| ⑥ | 无 LICENSE 文件 + `package.json` 无 `license` 字段（成本极低） | `LEGAL-001` |
| ⑦ | 无 CSP（本项目无内联脚本、无外部 CDN，上严格 CSP 的条件已成熟） | `SECURITY-001` |
| ⑧ | 无 staging 环境；`--commit-dirty=true` 允许脏工作区部署 | `DEPLOYMENT.md` §5 |
| ⑨ | 无单元测试与 fixture；`src/lib/*` 12 个模块零直接测试 | `DEBT-005` |
| ⑩ | 主 chunk 余量仅 9.3% raw / 11.9% gzip；预热余量 17.2%（硬编码 3 包） | `PERF-001` / `A-3` |

---

## 11. 最小发布路径（本版）

```bash
# 0. 确保工作区状态已知（决定阻塞项 ③）
git status --short
git log --oneline -1

# 1. 内容门禁
npm run content:validate        # 期望 PASS：10 包全部通过
npm run test:content            # 期望 149/149

# 2. 静态检查
npx tsc -b                      # 期望 0 error
npm run lint                    # 期望 0 error / 16 warning

# 3. 构建 + 体积门禁（顺序不可颠倒）
rm -rf dist
npm run build                   # 期望 1939 modules / built in ...
npm run check:bundle            # 期望 PASS：3 项全部通过

# 4. E2E + 离线（另开终端跑 npm run preview）
npm run test:e2e                # 期望 165/165
npm run test:offline            # 期望 全部通过

# 5. 截图复核
node scripts/audit-capture.mjs  # 期望 17 张

# —— 人工处置 ① ② ③ 三项阻塞项 ——

# 6. 部署后生产冒烟（部署完成、且本地未再改源码的窗口期内）
npm run test:smoke              # 期望 22/22（处置 ①③ 后）
npm run test:prod               # 期望 全部通过
```

---

## 12. 客观实测 vs 主观判断（分离声明）

### 客观实测（可直接采信）

- §2~§9 表中所有**命令名、脚本名、期望输出字符串**，均取自 commit `4152eb2` 的 `package.json`、`.github/workflows/*.yml`、`public/_headers`、`scripts/check-bundle.mjs`。**共 12 个脚本名 / 命令逐一核对，无编造**：`npm run` 的 `build` / `lint` / `test:content` / `test:e2e` / `test:offline` / `test:prod` / `test:smoke` / `content:validate` / `check:bundle`，`npx tsc -b`，`node scripts/audit-capture.mjs`，`node docs/audit-package/_generated/verify-samples.mjs`。
- 【实测】Node `v22.22.2` / npm `8.5.2`；`git rev-parse HEAD` = `4152eb25f35dd63f9922f9cf132f28632d219b1c`；工作区三条改动路径（`M src/components/ResultOverlay.tsx` / `M tests/_evidence/offline-audit-result.json` / `?? docs/audit-package/`、`?? scripts/audit-capture.mjs`）。
- 【实测】§4.2 构建输出、§4.4~4.7 体积数字为**本轮实跑**（`rm -rf dist` → `npm run build` → `npm run check:bundle`）；主 chunk `381.09 KiB raw / 118.91 KiB gzip`，预热合计 `497.03 KiB`。
- 【实测】§6.2~6.10、§7.7~7.8 的生产行为为**本轮 curl 实测**（`--noproxy '*'`）：`/index.html` 308、`/sw.js` `no-cache` + 版本串唯一、`/assets/*` immutable。
- 【实测】§9.1、9.2、9.5、9.7 的合规缺口为**本轮 grep / curl 实测**（均为零命中）。
- 【实测】§10 ① 的"CI 零命中"。

### 主观判断（仅供参考，需你决策）

- **"有条件发布"这一判定本身** —— 依据是"门禁全绿但不在 CI"这一事实组合出的工程判断，不是可测量的量。
- §10 各项的**决策建议**（(a)/(b)/(c) 的选择）。
- "构建耗时 25.12s 是 Esafenet 透明加密导致" —— 这是基于 `vite:build-html` 占 92%（23.2s）与同机密文现象的**推断**，本轮**未能独立证实**（未能控制变量复现 `7.07s`）。
- §4.9 的"新增依赖可能破线"。
- §10 附表中各项的优先级排序。

### 未能实测 / 无法核实

| 项 | 原因 |
|---|---|
| §2 内容门禁、§3 lint、§5 E2E、§7.1 离线套件的本轮复跑 | 本轮聚焦发布单与性能基线的取证，未复跑；表内数字**引用 `FINAL_ACCEPTANCE.md` 既有结果并已标注** |
| §9.7 HSTS | 响应头未下发；Cloudflare 面板侧配置**无 API 凭据，未能核实** |
| §9.8 隐私政策合规性 | 需法律口径判断，**本轮未核实** |
| `/robots.txt` 正文规则（`User-agent` / `Disallow` / `Sitemap`） | **本机装有 Esafenet 透明加密驱动**：本地 `public/robots.txt` 与线上 `dist/robots.txt`（4171 B）两份副本均为密文 ⇒ 未能读取，不编规则 |

---

## 13. 关联文档

| 文档 | 关系 |
|---|---|
| `13-acceptance/FINAL_ACCEPTANCE.md` | 10 项门禁实测总表（本清单的数字来源） |
| `13-acceptance/KNOWN_ISSUES.md` | 全部问题编号定义 |
| `13-acceptance/GAP_ANALYSIS.md` | 缺口清单与优先级 |
| `13-acceptance/PRODUCTION_CHECKLIST.md` | **运行期**检查单（区别于本文件） |
| `12-infrastructure/DEPLOYMENT.md` | 部署链路、CI 缺口、A3 根因完整分析 |
| `12-infrastructure/BUILD.md` | 构建与分包机制 |
| `12-infrastructure/PERFORMANCE.md` | 性能基线与复现命令 |
| `12-infrastructure/OFFLINE.md` | SW 双策略与 4 态审计设计 |
