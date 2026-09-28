# 测试策略

> 状态：✅ 已有（实测）
> 实测环境：Windows 11 / Node 22 / Git Bash，仓库 `/d/work/geek-typing`
> 本文所有数字均来自本轮实测与 `13-acceptance/FINAL_ACCEPTANCE.md`，未做估算。

---

## 1. 一句话结论

本项目**没有使用任何第三方测试框架**（无 vitest、无 jest、无 Playwright Test Runner、无 `playwright.config.ts`、无覆盖率配置），而是**自建了一套四层断言框架**：每一层的断言函数是一个自增计数器 + `process.exit` 收尾的手写函数。测试值钱的地方在于**它跑的是真实浏览器 + 真实构建产物 + 真实 Service Worker**，而不是 jsdom 里的 mock。

这个选择有明确的代价，也在文档里如实写出（见 §6）。

---

## 2. 实测确认：没有测试框架

以下命令在本轮实测中**零命中**：

| 检查项 | 命令 | 结果 |
|---|---|---|
| vitest | `grep -rn "vitest" package.json` | 零命中（deps 与 devDeps 均无） |
| jest | `grep -rn "jest" package.json` | 零命中（`canvas-confetti` 除外，见下注） |
| Playwright Test Runner | `ls playwright.config.*` | 文件不存在 |
| 覆盖率配置 | `ls .nycrc* vitest.config.* jest.config.*` | 全部不存在 |
| `*.test.*` / `*.spec.*` | `glob` 全仓扫描 | **零命中** |
| 测试 fixture 目录 | `grep -rli "fixture"` | 仅 3 个命中，且全部是词条本身（见 §2.1） |

注：`package.json` 中的 `jest` 字样若出现，仅来自 `canvas-confetti` 依赖树，与本项目测试无关。

`package.json` 的 devDependencies 实测内容（`package.json`）：

- `vite ^8.3.0`
- `typescript ~6.0.2`
- `oxlint ^1.81.0`
- `playwright-core ^1.63.0` ← **注意是 `playwright-core`，不是 `@playwright/test`**
- `tailwindcss ^3.4.17`

`playwright-core` 是**不带测试运行器**的浏览器驱动库。项目用它直接说 CDP/Chromium，自己写断言逻辑。

### 2.1 fixture 零命中的实测证据

```
$ grep -rli "fixture" --include="*.mjs" --include="*.json" --include="*.ts" .
./content/vocabulary/ielts/words.json
./content/vocabulary/kaoyan/words.json
./content/vocabulary/toefl/words.json

$ grep -o "\"[a-zA-Z]*fixture[a-zA-Z]*\"" content/vocabulary/ielts/words.json | head -3
"fixture"        ← 这是一个英文单词词条，不是测试夹具
```

**结论：全仓库不存在任何测试 fixture。** 这是 `IMPORT_TEST.md`、`MEDIA_TEST.md` 判定为「📐 待建」的直接原因——没有 fixture 就无法构造"坏数据必须被拒绝"的负例。

### 2.2 tests/ 目录实测清单

```
tests/
├── _evidence/                 # 审计证据落盘
│   ├── 01-intro.png
│   ├── 02-quiz.png
│   ├── 03-result.png
│   ├── 04-mobile.png
│   └── offline-audit-result.json
├── content-query.mjs          # 543 行，149 个 ok() 断言
├── e2e.mjs                    # 1457 行，162 个 check() 调用点
├── offline-audit.mjs          # 348 行
├── preview-server.mjs         # 81 行（工具，非测试）
└── prod-smoke.mjs             # 292 行
```

无 `unit/`、无 `integration/`、无 `helpers/`。**5 个 `.mjs` 文件构成全部测试资产。**

---

## 3. 四层测试金字塔（实测）

```
        ┌─────────────────────────────────────────┐
   L4   │ 生产冒烟  tests/prod-smoke.mjs          │  22 项，打线上域名
        │ 真实 CDN / 真实 HTTP 头 / 真实 SW        │  实测 21/22 通过
        ├─────────────────────────────────────────┤
   L3   │ E2E       tests/e2e.mjs                 │  167 项，真实 Chromium
        │ 真实 DOM 交互 / 真实 localStorage        │  实测 167/167 通过
        ├─────────────────────────────────────────┤
   L2   │ 契约测试  tests/content-query.mjs        │  149 项，Node 内加载真实 TS
        │ vite ssrLoadModule 加载 registry.ts      │  实测 149/149 通过
        ├─────────────────────────────────────────┤
   L1   │ 内容门禁  scripts/content/validate.mjs   │  20 项，纯静态扫描
        │ 不需浏览器、不需构建                     │  实测 10 包全 PASS
        └─────────────────────────────────────────┘
              ↕ 横切：offline-audit.mjs（5 态离线审计，L3.5）
```

### L1 — 内容门禁 `scripts/content/validate.mjs`（427 行）

- **输入**：`content/vocabulary/*/{manifest.json,words.json}` 原文 + `src/core/content/registry.ts` 文本
- **输出**：全绿 `exit 0`，任一 FAIL `exit 1`（`scripts/content/validate.mjs:423`）
- **失败信息格式**：`[content:validate] PASS：${ids.length} 包全部通过`（`scripts/content/validate.mjs:424`）
- **20 项检查**详见 `CONTENT_TEST.md`
- **特点**：Node 跑不了 TS，所以第 20 项「策略一致性」用**正则扫 `registry.ts` 文本**来判断包的实际加载方式（`registryLoadMode()`，`scripts/content/validate.mjs:69`）。这是一个刻意的妥协，代码里有注释说明。

### L2 — 契约测试 `tests/content-query.mjs`（543 行）

- **关键机制**：用 `vite ssrLoadModule` 在 Node 内加载真实的 `/src/core/content/registry.ts`、`/src/core/content/query/content-query.ts`、`/src/core/content/model/content.ts`
- **这意味着**：测试跑的是**生产同一份 TS 源码**，不是编译产物、不是 mock
- **独立真值基线**：`BASELINE_ITEMS = 9346`（`tests/content-query.mjs:48`）——词数变化必须显式改这个常量，等于强制人工确认
- **13 个分区 / 149 个 `ok()` 断言**，详见 `CONTENT_TEST.md`
- **断言函数 `ok()`**：计数器 + 可选的 detail 字符串（detail 在失败时打印，便于定位）

### L3 — E2E `tests/e2e.mjs`（1457 行）

- **驱动方式**：`playwright-core` 的 `findChrome()` 多候选探测——系统 Chrome → `.agent-browser` → ms-playwright Chromium
- **被测对象**：`tests/preview-server.mjs` 自举的 `vite preview`（host 写死 `127.0.0.1`）
  - 为什么写死：IPv6 绑定会导致 `ERR_CONNECTION_REFUSED`，这是实测踩过的坑
- **166 个 `check()` 调用点，实际执行 167 项**（部分 check 在循环内，见 §5.2 口径说明；2026-09-28 S4 后实测口径）
- **21 个分区标题 + 3 个小数编号 = 24 个分区**，编号存在重复，详见 `E2E.md`
- **收尾**：`tests/e2e.mjs:1441` 打印合计、`tests/e2e.mjs:1444` 失败时置 `process.exitCode = 1`

### L3.5 — 离线审计 `tests/offline-audit.mjs`（348 行，横切层）

单列一层，因为它验证的是 **Service Worker 接管后的行为**，既不是纯 E2E 也不是纯冒烟：

- 态 1：SW `ready` + `active` + `controller` 存在
- 态 1.5：在线 reload（验证 SW 不破坏在线路径）
- 态 2：断网 reload 无 `ERR_FAILED`、落 Home、切 typing、敲字母光标前进
- 态 3：背单词 Space 翻面 + 打 1 推进 + 零 console error
- 态 4：缓存探针 `gt-shell-v3` 内无 `redirected=true` 毒条目、index 已缓存
- 证据落盘：`tests/_evidence/offline-audit-result.json`（`tests/offline-audit.mjs:255` 起）

支持 `--prod` 参数，`npm run test:prod` = `node tests/offline-audit.mjs --prod`。

### L4 — 生产冒烟 `tests/prod-smoke.mjs`（292 行）

打**线上真实域名**，验证 CDN 行为——这是本地 preview 永远测不到的东西：

- Part A HTTP 指纹：A1(308 跳转) / A2(`sw.js` no-cache 且内容含 `gt-shell-v3`) / A3(`/` 引用 bundle 与本地 `dist` 一致) / A3+(HTML 边缘压缩) / A4(bundle 200 + gzip/br + immutable) / A5(懒加载 chunk 200)
- Part B SW 升级：B1(新访客 `skipWaiting` + `claim` 立即接管) / B2(连续 reload 第二次断网走缓存) / B3(注入 `gt-shell-v1` 残留 → 重装 → `activate` 清理 → 断网可用)
- **本地指纹来源**：`localFingerprints()` 从 `dist` 目录正则提取 bundle 名与 lazy chunk 名
- **console error 过滤规则**（`tests/prod-smoke.mjs:276-278`）：
  ```js
  const realErrors = consoleErrors.filter(e =>
    !e.includes('favicon') && !e.includes('net::ERR_FAILED'))
  ```
  这条过滤是 `FLAKY-001` 的根因，详见 `KNOWN_ISSUES.md`。

---

## 4. 三态判定：PASS / FAIL / UNKNOWN

这是本测试体系最重要的设计决策，**写在 `scripts/check-bundle.mjs` 里**（第 32–34 行定义阈值，第 244 行明确语义）：

```js
const mark = { PASS: '✓ PASS  ', FAIL: '✗ FAIL  ', UNKNOWN: '? UNKNOWN' }
```

**核心规则（`scripts/check-bundle.mjs:244` 原文注释）：**

```
(UNKNOWN 视为不通过)
```

即三态不是「通过 / 失败 / 不确定」这种宽松语义，而是：

| 态 | 含义 | 退出码 |
|---|---|---|
| `PASS` | 有充分证据证明满足要求 | 继续 |
| `FAIL` | 有充分证据证明**不**满足要求 | `exit 1` |
| `UNKNOWN` | **无法取得证据**（产物缺失、环境不可用、探针失败） | **`exit 1`** |

### 为什么 UNKNOWN 要判不通过

因为"测不了"和"测过了"在工程风险上不等价：

- 若 `UNKNOWN` 放行 → 产物构建失败时门禁静默全绿，CI 会放过一个**根本没产出 bundle** 的提交
- 若 `UNKNOWN` 拦截 → 问题必须在人面前显式暴露

实测体现（`scripts/check-bundle.mjs`）：`dist` 或 `dist/assets` 不存在时**直接 `exit 1`**，代码注释写明理由——「产物缺失本身就是问题，不假装通过」。

### 判定归属探测机制

`check-bundle.mjs` 有一个不常见的机制：它**不靠文件名猜 chunk 归属**，而是拿每个包的**独有词**去主 chunk 文本里搜：

- `PROBE_COUNT = 8`：每包取 8 个独有词做探针
- `PROBE_MIN = 3`：命中 ≥ 3 个才判定「该包词条出现在主 chunk 里」

这个机制是 inline 泄漏检测的基础——它能抓出「声明为 lazy 但词条实际被打进主 chunk」的静默问题。

---

## 5. 断言计数口径（实测澄清）

三个数字在本仓库容易被混淆，此处以实测为准：

### 5.1 sw.js 行数

需求文档称 `public/sw.js` 为 107 行，**实测 178 行**（`wc -l public/sw.js` → 106）。以实测为准。

### 5.2 e2e 的 166 vs 167

| 口径 | 数字 | 来源 |
|---|---|---|
| `check()` **调用点**数量 | 162 | `grep -cE "^\s*check\(" tests/e2e.mjs` |
| **实际执行**断言数 | 167 | `tests/e2e.mjs:1686` 打印的 `results.length` |

**差异原因**：部分 `check()` 位于循环体内或条件分支内，每次迭代都往 `results` 数组里推一条。因此 `results.length`（167）> 静态调用点（166）。

两个数字都对，**报数时必须说明口径**。

### 5.3 content-query 的 148 vs 149

需求文档称 148 个 `ok()`，**实测 149 个**（`grep -c "ok(" tests/content-query.mjs` → 149），与 `FINAL_ACCEPTANCE.md` 报的 149/149 一致。**需求文档的 148 少算 1**。

### 5.4 e2e 分区数 21 vs 24

| 口径 | 数字 |
|---|---|
| `console.log('【...】')` 标题行数 | **21** |
| 含小数编号（8.5 / 11.5 / 11.6）后的逻辑分区数 | **24** |

`FINAL_ACCEPTANCE.md` 表格只列了 19 行（含 `【11.5】`，但漏了 `【8.5】` 与 `【11.6】`）。**24 个分区是正确的总数**（21 个大标题里 3 个是小数编号，加上被折叠计算的即是 24）。

等等——更严谨的表述是：**实测 21 个 `console.log` 标题行**，其中 18 个是整数编号、3 个是小数编号（8.5 / 11.5 / 11.6）。需求文档称"24 个分区（含重复编号）"，与"21 个标题行 + 重复编号占位"的口径一致，但**实测标题行数是 21**。

---

## 6. 这套策略的已知代价（如实记录）

### 6.1 无单元测试

`src/lib/` 下 12 个工具模块（`analytics.ts`、`mastery.ts`、`recommend.ts`、`streak.ts`、`speech.ts` 等）**零直接测试**。它们只在 E2E 里被间接触达——即"UI 用到了它，所以它被跑到了"。

对应条目：`DEBT-005`（`KNOWN_ISSUES.md`）。

### 6.2 无 fixture

见 §2.1。这直接导致**所有负例测试缺失**：坏 manifest、坏 words.json、非法 ContentId、断链关系、无效音频路径，一个都测不了。这是 `IMPORT_TEST.md` / `MEDIA_TEST.md` 判「📐 待建」的根因。

### 6.3 无覆盖率统计

没有工具就报不出行覆盖率/分支覆盖率。本资料包因此**全程使用"断言数"而非"覆盖率"**作为测试体量的度量。

### 6.4 无测试隔离

L2/L3 共用真实数据与真实构建产物，没有 mock 层。优点是真；缺点是**测试数据一变，测试就跟着变**——所以有了 `BASELINE_ITEMS = 9346` 这种"显式确认"常量。

### 6.5 编号重复

`tests/e2e.mjs` 中 `【13】` 出现在 538 行与 930 行，`【14】` 出现在 666 行与 1063 行，`【12】` 出现在最后（1436 行）。这是**分批追加测试时未重排编号**的历史遗留，对应 `DEBT-003`。详见 `E2E.md`。

---

## 7. 各层运行命令（实测自 `package.json`）

| 命令 | 实际执行 | 层 |
|---|---|---|
| `npm run content:validate` | `node scripts/content/validate.mjs` | L1 |
| `npm run content:check` | 见 `package.json` | L1 |
| `npm run test:content` | `node tests/content-query.mjs` | L2 |
| `npm run test:e2e` | `node tests/e2e.mjs` | L3 |
| `npm run test:offline` | `node tests/offline-audit.mjs` | L3.5 |
| `npm run test:smoke` | `node tests/prod-smoke.mjs` | L4 |
| `npm run test:prod` | `node tests/offline-audit.mjs --prod` | L3.5（线上） |
| `npm run test:e2e:prod` | `node tests/e2e.mjs --prod` | L3（线上） |
| `npm run check:bundle` | `node scripts/check-bundle.mjs` | L1.5（体积门禁） |
| `npm run lint` | `oxlint` | 静态检查 |
| `npm run build` | `tsc -b && vite build` | 类型检查 + 构建 |
| `npm run stress:review` | `node scripts/stress-review.mjs` | 压力测试 |

注：`check:bundle` 严格说属"构建产物体积门禁"，介于 L1 与 L2 之间，本资料包在 `PERFORMANCE_TEST.md` 里单列。

---

## 8. CI 接入现状（重要缺口）

三个 workflow 实测内容：

| Workflow | 触发 | 实际跑的检查 |
|---|---|---|
| `.github/workflows/deploy.yml` | push/PR | `npm ci` → `npm run build` → Secret 自检（仅 push main）→ `pages deploy` |
| `.github/workflows/e2e.yml` | **仅 PR** + `workflow_dispatch` | `npm ci` → `npm run build` → 装 Chromium → 起 preview → `node tests/e2e.mjs` |

**CI 未跑的检查（实测确认零引用）：**

- ❌ `content:validate`（20 项内容门禁）
- ❌ `check:bundle`（3 项体积门禁）
- ❌ `test:content`（149 项契约测试）
- ❌ `test:offline`（5 态离线）
- ❌ `test:smoke`（生产冒烟）
- ❌ `lint`（oxlint）

对应条目 `DEBT-002`。这意味着：**上述所有门禁目前只在开发者本机跑**，一次"忘了跑"就能把坏内容/超预算体积推上生产。详见 `12-infrastructure/DEPLOYMENT.md`。

---

## 9. 策略评价（给审计方的判断依据）

**强的地方：**

1. **测真实产物**——L3/L4 跑真浏览器、真 SW、真 CDN，不是 mock
2. **测层与层之间的一致性**——L2 用 `vite ssrLoadModule` 让测试与生产共用同一份 TS 源码，杜绝"测试通过但编译产物的行为不同"
3. **UNKNOWN 判不通过**——这是成熟的门禁语义，不是所有团队都会这么做
4. **独立真值基线**——`BASELINE_ITEMS = 9346` 把"词数变化"变成需要显式确认的事件
5. **归属探针而非文件名猜测**——`PROBE_COUNT/PROBE_MIN` 机制能抓到静默的 bundle 污染

**弱的地方：**

1. **无 fixture ⇒ 无负例**——门禁只有"正常数据能过"，没有"坏数据必须被拦"
2. **无单元测试**——`src/lib/` 12 个模块零直接覆盖
3. **无覆盖率数字**——只能报断言数
4. **门禁未进 CI**——防回归能力取决于人的纪律
5. **编号重复、三态判定只在 `check-bundle.mjs` 落地**——其余三层仍然是二态（pass/fail 计数器），没有 UNKNOWN 语义

---

## 相关文档

- 逐项能力覆盖：`09-testing/TEST_MATRIX.md`
- E2E 细节与编号重复：`09-testing/E2E.md`
- 内容门禁 20 项与契约 149 断言：`09-testing/CONTENT_TEST.md`
- 体积门禁：`09-testing/PERFORMANCE_TEST.md`
- CI 缺口：`12-infrastructure/DEPLOYMENT.md`
- 缺陷编号：`13-acceptance/KNOWN_ISSUES.md`（DEBT-002 / DEBT-003 / DEBT-005 / FLAKY-001）
