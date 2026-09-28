# TOTAL_AUDIT_REPORT.md · 全量审计总报告

> **基线 commit**：`4152eb2`（V4.1-P0.6.1 收口 + 测试门禁硬化）
> **审计日期**：2026-09-27
> **审计范围**：`geek-typing` 仓库全量（源码 / 内容 / 测试 / 构建 / 部署 / 合规）
> **资料包位置**：`docs/audit-package/`（83 份文档 / 25,163 行 / 3.5 MB + 17 张实拍截图）
>
> ⚠️ **本报告是 2026-09-27 审计轮的历史实跑记录**（下文 e2e 165/165、test:content 149/149
> 等数字均为当轮实测），不代表最新现状。最新口径（2026-09-28 S4 后）：e2e **167/167** /
> test:content 163/163 / test:storage 78/78 / test:insights 12/12 / test:analytics 17/17 /
> test:migration 27/27 / browser-migration-e2e 19/19 —— 以 `P1.5-RELEASE-GATE.md` §0
> 两层 Gate 为准。
>
> **本报告是顶层交付物。** 它把所有下层文档的结论压缩成「能直接做决策」的形态。
> 每个结论都给出**可复跑的命令**与**原始输出**，你可以自己验一遍。

---

## 0. TL;DR（30 秒版）

**这个项目的地基比同类项目严谨得多，但它不是一个"英语学习平台"，而是一个"内容基础设施 + 一个打字背单词的壳"。**

| 维度 | 评价 | 一句话 |
|---|---|---|
| **Content 架构** | 🟢 **优秀** | Content→Registry→Catalog→Index→Query→UI 分层真实存在，契约（ContentId/checksum/schemaVersion=4）冻结且 149 项断言全过 |
| **测试体系** | 🟢 **扎实但形态特殊** | 165 E2E + 149 契约 + 20 内容门禁 + 3 体积门禁全绿；**但零单元测试、零 fixture、零测试框架** |
| **产品完整度** | 🔴 **很低** | 音视频/字幕/学习图谱/导入体系/真题 **全部为零**；Content Matrix 23 类**只落地 1 类** |
| **内容可信度** | 🟠 **有硬伤** | 三个"考纲包"是同一词库的 tag 视图；CET 四六级**词形完全不相交**；CET 覆盖率 ~1.9% |
| **生产健壮性** | 🟢 **高危缺陷已修** | SW 缓存投毒（BUG-002）**已修复并加回归测试**；但**线上仍是旧版 SW，需部署才生效** |
| **合规闭环** | 🟠 **不闭环** | 无 `LICENSE` 文件、无 CSP、无 HSTS；内容侧声明 MIT 却不附许可全文 |

### 三句话结论

1. **可以继续投入** —— Content 层不需要推倒重来，A 类 5 项架构债是"改几处"而非"重写"。
2. **BUG-002 已修但未上线** —— 修复 + 回归测试均已落地并验证；**必须 push 部署**才能让存量用户摆脱中毒缓存。
3. **P1 的真瓶颈不是架构，是内容** —— 9346 词里 9000 词来自 3 个同源 ECDICT 包，**实际独立词形仅 6713**。

---

## 1. 交付清单（需求文档 §32「第一批 10 项」逐项对照）

| # | 需求项 | 交付物 | 状态 |
|---|---|---|---|
| 1 | GitHub / 源码 | 仓库 `geek-typing`，基线 `4152eb2`（3 个提交可考） | ✅ |
| 2 | README | 仓库根 `README.md` | ✅ |
| 3 | CONTENT_CONTRACT | 仓库根 `CONTENT_CONTRACT.md`（45 KiB 契约原文）+ 本包 `04-content/CONTENT_CONTRACT.md`（导读） | ✅ |
| 4 | P0.6.1 report | `13-acceptance/FINAL_ACCEPTANCE.md` | ✅ |
| 5 | content/README | `content/README.md` | ✅ |
| 6 | tests 目录 | `tests/`（6 个脚本）+ 本包 `09-testing/`（9 份） | ✅ |
| 7 | e2e 目录 | `tests/e2e.mjs`（165 用例）+ `09-testing/E2E.md` | ✅ |
| 8 | package.json | 全量 19 个 script 已在 `13-acceptance/RELEASE_CHECKLIST.md` 逐条编入 | ✅ |
| 9 | 目录树 | `_generated/files.txt`（125 个受版本控制文件）+ 行数统计 | ✅ |
| 10 | 页面截图 | `screenshots/`（**17 张真实截图**，无头 Chrome 153 CDP 实抓） | ✅ |

**全部 10 项已交付，无一项是"骨架占位"。**

---

## 2. 客观实测数据（全部可复跑）

### 2.1 十项门禁实测总表

| # | 门禁 | 命令 | 实测结果 | 判定 |
|---|---|---|---|---|
| 1 | 内容门禁 | `npm run content:validate` | 20 项规则 | ✅ PASS |
| 2 | 内容契约 | `npm run test:content` | **149 / 149** | ✅ PASS |
| 3 | 类型检查 | `tsc -b` | **0 error** | ✅ PASS |
| 4 | 静态检查 | `npm run lint`（oxlint） | **0 error / 16 warning** | 🟡 有警告 |
| 5 | 构建 | `npm run build` | 1939 modules / **退出码 0** | ✅ PASS |
| 6 | 体积门禁 | `npm run check:bundle` | **3 / 3** | ✅ PASS |
| 7 | 端到端 | `npm run test:e2e` | **165 / 165** | ✅ PASS |
| 8 | 离线 | `npm run test:offline` | **20 / 20**（含新增态 4b MIME 投毒探针） | ✅ PASS |
| 9 | 生产冒烟 | `npm run test:smoke` | **21 / 22** | 🟡 A3 失败（见 §5） |
| 10 | 截图 | `node scripts/audit-capture.mjs` | **17 张** | ✅ PASS |
| 11 | 样本复核 | `node docs/audit-package/_generated/verify-samples.mjs` | **76 / 76** | ✅ PASS |

> **关于构建耗时**：历史文档记录 `7.07s`。本轮三次实测为 `25.12s / 21.27s / **5.70s**`（产物哈希三次完全一致）。
> 结论：**耗时受宿主环境影响，方差超 4 倍，不应作为基线数字**。详见 `12-infrastructure/PERFORMANCE.md` §2.2。

### 2.2 体积基线（门禁口径：gzip level 9）

| 产物 | raw | gzip | 阈值 | 余量 |
|---|---|---|---|---|
| `index-*.js`（主 chunk） | **381.09 KiB** | **118.91 KiB** | 420 / 135 KiB | **9.3% / 11.9%** |
| `words-*.js` × 3（lazy） | 464–472 KiB | 163–167 KiB | — | — |
| `index-*.css` | 23.08 KiB | 5.34 KiB | — | — |
| **预热预算**（三包 gzip 合计） | — | **497.03 KiB** | 600 KiB | **17.2%** |

> **两处余量都已偏紧**。需求文档要加的 GRE(12000)/Oxford(30000)/Cambridge(20000) **必定击穿**。
> 另注：门禁用 `gzip level 9`（`scripts/check-bundle.mjs:146`），Vite 报的是 `level 6`，
> 两者相差约 1316 B —— **引用数字时必须说明用的是哪套口径**。

### 2.3 内容真实体量

| 指标 | 实测值 |
|---|---|
| 总词条数 | **9346** |
| **唯一词形数** | **6713**（即 2633 条是跨包重复） |
| 出现在 >1 个包的词形 | **2323 个**（涉及 4956 条词条） |
| 包数 | 10（inline 7 / lazy 3） |
| 字段数 | **仅 4 个**：`word` / `translation` / `definition` / `phonetic` |
| `definition` 非空覆盖 | **9144 / 9346 = 97.84%** |
| `phonetic` 非空覆盖 | **9076 / 9346 = 97.11%** |
| `partOfSpeech` 覆盖 | **0 / 9346 = 0%**（审计时点：白名单有、数据零出现）⇒ **P1.6-E 已移除该字段**，契约白名单现为 4 个字段且与数据完全对齐 |
| 含大写字母的词条 | **93 条**（多为 go-code/ts-code 代码行） |
| 仅大小写不同的碰撞组 | **0 组**（不存在 `Transformer` vs `transformer` 并存） |

---

## 3. 🔴 最高危缺陷：BUG-002（SW 缓存投毒致永久白屏）

> **这是本轮审计最重要的发现，也是唯一一个"正在生产上可触发"的缺陷。**

### 3.1 完整链路（四环，每环均已实测）

```
① 平台行为：Cloudflare Pages 对不存在的 /assets/* 不做 404，而是 SPA fallback
   → 返回 200 + Content-Type: text/html + 2007 B 的 index.html
        ↓
② 代码缺陷：public/sw.js 写缓存的两个入口（:44-46 precache / :57-63 putClean）
   → 只判 res.ok，零 Content-Type 校验 → 把 HTML 当 JS 存入缓存
        ↓
③ 策略放大：/assets/* 走「缓存优先」（:85-94），caches.match 命中即返回、永不回源
   → 一旦中毒，该 URL 永久返回 HTML
        ↓
④ nosniff 放大器：public/_headers 全局下发 X-Content-Type-Options: nosniff
   → 浏览器必定拒绝执行 HTML 冒充的 JS，不会 sniff 纠正 → 必定白屏（而非可能白屏）
```

### 3.2 关键证据（原始命令与输出）

```bash
# 不存在的资源：应为 404，实际返回 200 + HTML
$ curl -sk -o /dev/null -w "%{http_code} %{content_type} %{size_download}\n" \
    https://geek-typing.pages.dev/assets/does-not-exist.js
200 text/html; charset=utf-8 2007

# 线上真实资源对照
$ curl -sk -o /dev/null -w "%{http_code} %{content_type} %{size_download}\n" \
    https://geek-typing.pages.dev/assets/index-Cawl4_-q.js
200 application/javascript 390201

# 【致命】线上不存在的 hash —— 正是本地当前构建的主 chunk
$ curl -sk -o /dev/null -w "%{http_code} %{content_type} %{size_download}\n" \
    https://geek-typing.pages.dev/assets/index-Dw5EkkBq.js
200 text/html; charset=utf-8 2007      ← 漂移已实际发生
```

### 3.3 后果与修复

| 项 | 说明 |
|---|---|
| **触发条件** | 线上 index.html 与用户 SW 预缓存的 assets 清单出现 hash 漂移（**已发生**） |
| **后果** | 该用户 `/assets/*` 被永久投毒 → 应用白屏 → 且因白屏无法加载新 SW 自愈 → **只能手动清缓存** |
| **修复状态** | ✅ **已修复并验证，但未部署** |

### 3.4 修复内容与验证证据

| 项 | 内容 |
|---|---|
| **改动** | `public/sw.js` 新增 `typeMatches()`（扩展名 → MIME 主类型校验）；`precacheShell()` 与 `putClean()` **两个写缓存入口**均加守卫；`CACHE` 从 `gt-shell-v2` **升到 `v3`** |
| **降级语义** | `/assets/*` 类型不符 ⇒ **不写缓存** + 返回 **504**（不把 HTML 当 JS 交给页面）；其它路径保持原样 |
| **为何升版本号** | `activate` 的「删除非当前 CACHE」是清除**存量中毒条目**的唯一机制。不升版，已中毒用户因白屏永远收不到修复 |
| **兼容性** | 校验 MIME **主类型**（`application/javascript` 与 `text/javascript` 均算 JS），非写死字符串 ⇒ 换 CDN 不误杀 |

**三层验证证据**：

| 层 | 证据 | 结果 |
|---|---|---|
| ① 正常路径 | `npm run test:offline` | **20 / 20 通过**（含新增态 4b） |
| ② 无回归 | `npm run test:e2e` | **165 / 165 通过** |
| ③ **反证实验** | 临时摘除两处守卫 → 重跑态 4b | **立刻变红**：`已投毒：cachedType=text/html` + `status=200 pageGotHtml=true`；恢复后转绿 |

> **第 ③ 层最重要。** 它证明该回归测试**不是空转通过**（air test）。
> 审计过程中的一次失误恰好成为证据：最初的探针是**被动检查缓存**，我实测发现**即使删掉校验它仍然全绿** ——
> 因为本地 `vite preview` 对缺失资源返回 404，而 Cloudflare 才返回软 404，病态输入在本地根本不会自然出现。
> 改为 **`context.route` 主动注入软 404** 后才具备判别力（并用反证实验确认）。

**残留风险**：线上仍是旧版 SW。**必须 commit + push 部署，存量用户才会在下次访问时升到 v3 并清除中毒缓存。**

---

## 4. 🟠 内容可信度问题（影响产品定位）

### 4.1 三个"考纲包"实为同一词库的 tag 视图 —— CONTENT-006

| 交集 | 数量 | 占比 |
|---|---|---|
| ielts ∩ kaoyan | **1802** | 60.1% of 3000 |
| ielts ∩ toefl | **613** | 20.4% |
| kaoyan ∩ toefl | **344** | 11.5% |
| 三者交集 | **230** | — |
| **并集去重** | **6471** | 而非 9000 |

**用户可见后果**：切包学习时会**重复见到同一单词**，去重/掌握度统计失真，"我在 IELTS 里学过的词为何考研包里还有"。

### 4.2 CET 四六级词形完全不相交 —— CONTENT-007

| 项 | 实测 |
|---|---|
| cet4 | **84** 词（考纲约 4500 → 覆盖 **~1.9%**） |
| cet6 | **69** 词（考纲约 5500 → 覆盖 **~1.3%**） |
| cet4 ∩ cet6 | **0** ← 这不合常理：CET-6 理论上包含 CET-4 |
| 排序 | cet4 前 5 条 = abandon/absolute/abstract/academic/accelerate → **按字母序，非词频序** |

**定性**：两包是**独立采样**而非"6 级 = 4 级 + 增量"。以"四级/六级"为名的功能**无法支撑真实备考**。

**附带阻塞**：CET 扩词到 4500+ 的**第一个动作必须是先改加载策略** —— 因为 inline 包词数有 **1000 硬上限**（`scripts/content/validate.mjs` #19），4500 词必然要走 lazy。

---

## 5. 关于生产冒烟 21/22 的诚实说明

| 项 | 说明 |
|---|---|
| **失败项** | A3（`/` 引用的 bundle 与本地 `dist` 一致） |
| **根因** | 本地重跑 `build` 后主 chunk hash 变为 `index-Dw5EkkBq.js`，而线上仍是 `index-Cawl4_-q.js` |
| **定性** | **这是检查项按设计正常工作**，报出了真实的"本地/线上漂移"，**不是站点缺陷** |
| **但** | 这个漂移恰好也是 BUG-002 的触发前提 —— 两者同源。**21/22 这个数字本身是健康的信号，不是噪音。** |
| **建议** | CI 中运行时加前置条件「仅比对 git 已提交产物」，或明确该检查仅在部署后窗口期有效 |

---

## 6. 缺口总览（详见 `13-acceptance/GAP_ANALYSIS.md`）

| 类别 | 数量 | 严重度 | 是否阻止 P1 |
|---|---|---|---|
| **A. 会返工的架构债** | 5 | 🔴 高 | **是，必须先改** |
| **B. 测试覆盖虚高** | 5 | 🟠 中高 | 否，但应伴随 P1 |
| **C. 内容体量与品类** | 8 | 🟠 中高 | 否，是 P1 之后主线 |
| **D. 能力完全缺失** | 7 | 🟡 中 | 否，是 P1+ 目标 |
| **E. 工程与治理** | 8 | 🟡 中 | 否 |

### A 类（🔴 必须现在改，否则加音视频/10 万词时返工）

| # | 事项 | 一句话 |
|---|---|---|
| A-1 | **UI 直读词数组 17 处** | `content-query.ts:4-5` 写明「UI 不得直接持有词表数组做 filter」，但 App/Memorize/ReviewPanel/Header/BankManager 共 17 处违规 |
| A-2 | **`updated` 排序语义是假的** | 它不是更新时间，只是包内原始顺序。UI 一旦暴露就是假功能欺诈 |
| A-3 | **`warmUpVocabulary()` 硬编码 3 包** | `registry.ts:139` 写死 ielts/kaoyan/toefl。加包需手改且极易击穿 600 KiB 预热预算（当前余量仅 17.2%） |
| A-4 | **Learning 用裸 `word` 做键** | 2323 个跨包同名词 → 无法回答"为什么我在 IELTS 里找不到学过的 abandon" |
| A-5 | **基座性引用错误 + testid 重复** | `TabId` 行号文档误写 `:52`（实为 `App.tsx:44`）；`open-bank-manager` testid 在 2 处同值重复 |

---

## 7. 建议的行动顺序（我的判断，非实测）

### 🔴 立即（本次审计后、下次部署前）

| # | 事项 | 成本 | 状态 |
|---|---|---|---|
| 1 | **修 BUG-002（SW MIME 校验 + 升 CACHE）** | 低 | ✅ **已完成并验证** |
| 2 | **加态 4b 回归测试（主动注入软 404）** | 低 | ✅ **已完成，反证实验证明有效** |
| 3 | **commit + push 部署**（否则对存量用户不生效） | 极低 | ⏳ **待你决定** |
| 4 | 补 `LICENSE` 文件 + `package.json#license` | 极低 | ⏳ 待做 |
| 5 | 20 项门禁 + 体积门禁接入 CI | 低 | ⏳ 待做 |

### 🟠 P1 第一批

| # | 事项 |
|---|---|
| 5 | Learning 迁移 dry-run + Audit Ledger（`bound/ambiguous/orphan` 可查询） |
| 6 | `warmUpVocabulary()` 改预算型（按优先级在预算内贪心预载，清单由 manifest 自描述） |
| 7 | UI 17 处直读词数组 → 棘轮下降（先 App/Review/Memorize） |
| 8 | 修 `*:focus{outline:none}`（命令面板有输入框，注释前提已失效） |
| 9 | 补 `tests/unit/` + fixture，覆盖 `src/lib/*` 12 个模块 |
| 10 | 修 `normalize.mjs:135-137` 空值检查（现只覆盖 word/translation，漏 phonetic/definition → 9 条空 definition） |

### 🟡 P2（P1 产品化之后）

音视频 + 字幕、通用导入流水线、学习图谱、版权治理体系（`rightsStatus`）、监控与容灾、a11y 门禁、CSP。

---

## 8. 本报告的自我约束（方法论声明）

| 原则 | 落实方式 |
|---|---|
| **实测与判断分离** | 每个结论标 `【实测】` 或 `【主观】`。实测数字均附命令，可复跑 |
| **不美化缺口** | 高层结论优先写"没做到什么"，而非"架构多好" |
| **证据可复核** | `_generated/` 提供 6 个可重跑脚本；`content-samples/` 76 项断言独立复核 |
| **抓出自己的错** | 本报告与 `KNOWN_ISSUES.md` 已修正审计过程中自己写错的 3 处口径（空 definition 数量、包数字、同义词并集数） |
| **不掩盖不确定性** | 构建耗时波动、HTTP/2 未能实测、CF 面板配置无凭据 —— 全部如实标注，**不编数字** |

---

## 9. 未满足项（诚实列出）

| 项 | 状态 | 原因 |
|---|---|---|
| 需求文档 §三：GitHub 竞品调研（5 个项目） | **未做** | 独立调研任务，本包只留骨架（`01-product/COMPETITOR_ANALYSIS.md` 标 `📐 待建`） |
| Lighthouse / FCP / LCP / TTFB / 内存压测 | **未做** | 项目无采集工具，审计约束不改源码 ⇒ 文档明确写"无采集"，**不估算** |
| HTTP/2、HTTP/3 实测 | **未做** | 本机 libcurl 未编译 `--http2`/`--http3`；仅有 `alt-svc: h3` 弱证据 |
| Cloudflare 面板配置核实 | **未做** | 无 API 凭据 |
| 三份"待用户决策"项 | **待定** | ① `ResultOverlay.tsx` 的 testid 改动是否保留（未 commit）② 是否 push 部署 ③ lint 16 warning 是否清理 |

---

**报告结束。** 下层细节见同目录 `FINAL_ACCEPTANCE.md` / `GAP_ANALYSIS.md` / `KNOWN_ISSUES.md` / `RELEASE_CHECKLIST.md` / `PRODUCTION_CHECKLIST.md`。
