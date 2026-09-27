# 部署（Deployment）

> 状态：✅ 已有（实测）
> 平台：**Cloudflare Pages**（`geek-typing.pages.dev`）
> 流水线：**GitHub Actions**（2 个 workflow）
> **核心缺口：CI 未跑内容门禁、体积门禁与任何测试（`DEBT-002`）；且无 staging 环境**

---

## 1. 部署目标

| 项 | 值 | 证据 |
|---|---|---|
| 平台 | Cloudflare Pages | `.github/workflows/deploy.yml` |
| 项目名 | `geek-typing` | `--project-name=geek-typing` |
| 生产域名 | `https://geek-typing.pages.dev/` | `index.html` 的 `canonical` |
| 部署命令 | `pages deploy dist --project-name=geek-typing --commit-dirty=true` | `deploy.yml` |
| 环境数 | **1**（只有生产） | 无 staging / preview 分支配置 |

---

## 2. Workflow 1：`deploy.yml`（60 行）

### 2.1 触发条件（实测）

```yaml
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  workflow_dispatch:
```

| 事件 | 行为 |
|---|---|
| push 到 `main` | 构建 → Secret 自检 → **部署** |
| PR 到 `main` | **只构建**，不部署 |
| 手动 | 同 PR（只构建） |

并发控制：

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

### 2.2 步骤（实测，逐行核对）

| # | 步骤 | 命令 | 条件 |
|---|---|---|---|
| 1 | `Checkout` | `actions/checkout@v4` | 总是 |
| 2 | `Setup Node` | `actions/setup-node@v4`，node `'22'`，`cache: 'npm'` | 总是 |
| 3 | `Install dependencies` | `npm ci` | 总是 |
| 4 | **`Type check & build`** | **`npm run build`** | 总是 |
| 5 | `Verify Cloudflare secrets injected` | 自检两个 Secret 非空 | **仅 push main** |
| 6 | `Publish to Cloudflare Pages` | `cloudflare/wrangler-action@v3` | **仅 push main** |

权限：

```yaml
permissions:
  contents: read
  deployments: write
```

### 2.3 第 4 步是唯一的质量关卡 —— 而它只做两件事

`npm run build` = `tsc -b && vite build`

即 CI 的质量保证**只有**：

1. TypeScript 类型检查通过
2. Vite 能打包成功

**没有任何内容校验、没有任何体积校验、没有任何测试。**

### 2.4 第 5 步的 Secret 自检（值得称赞的一处设计）

```bash
missing=0
if [ -z "${{ secrets.CLOUDFLARE_API_TOKEN }}" ]; then
  echo "::error::Secret CLOUDFLARE_API_TOKEN 为空 —— 请在仓库 Settings → Secrets and variables → Actions 里重新添加"
  missing=1
fi
if [ -z "${{ secrets.CLOUDFLARE_ACCOUNT_ID }}" ]; then
  echo "::error::Secret CLOUDFLARE_ACCOUNT_ID 为空 —— 请在仓库 Settings → Secrets and variables → Actions 里重新添加"
  missing=1
fi
if [ "$missing" -ne 0 ]; then exit 1; fi
echo "两个 Secret 均已注入"
```

**为什么这是好设计**（代码注释也写了）：避免 wrangler 报出**含义模糊**的授权错误。Secret 缺失时 wrangler 通常报"未授权"，排查者会误以为是 token 过期或权限不够，而非"Secret 根本没注入"。这条自检把问题提前并说清楚了。

**这是一个"错误信息质量"的正面案例**，值得在审计报告中作为加分项列出。

### 2.5 `--commit-dirty=true` 的含义

```bash
command: pages deploy dist --project-name=geek-typing --commit-dirty=true
```

- **不带 `--branch`** ⇒ 确保发布到**生产环境**（注释明确写了这一点）
- `--commit-dirty=true` ⇒ 允许工作区有未提交变更时部署

**`--commit-dirty=true` 值得注意**：它意味着**部署的产物可能与 git 里记录的提交不一致**。这与 `FLAKY-001` 直接相关（见 §5）。

---

## 3. Workflow 2：`e2e.yml`（40 行）

### 3.1 触发条件（实测）

```yaml
on:
  pull_request:
    branches: [main]
  workflow_dispatch:
```

**注意：只有 PR 与手动。`push: main` 不触发。**

workflow 顶部注释解释了原因：

> 只在 PR 与手动触发时跑端到端测试（**避免拖慢主部署流水线**，也保证 main 的部署徽章始终反映部署状态）

**这个理由在工程上可理解，但后果是：直接 push 到 main（或 merge 后）不再有 E2E 保护。**

### 3.2 步骤（实测）

| # | 步骤 | 命令 |
|---|---|---|
| 1 | `actions/checkout@v4` | |
| 2 | `actions/setup-node@v4`（node 22，npm cache） | |
| 3 | `npm ci` | |
| 4 | `npm run build` | |
| 5 | `npx playwright@1.49.1 install chromium --with-deps` | |
| 6 | `Start preview server` | `npm run preview -- --port 4173 --host 127.0.0.1 &` + `curl` 轮询 30 次 |
| 7 | `Run E2E suite` | `node tests/e2e.mjs` |

### 3.3 第 5 步的版本不一致（实测）

```yaml
npx playwright@1.49.1 install chromium --with-deps
```

而 `package.json` 里是：

```json
"playwright-core": "^1.63.0"
```

**两处细节**：

1. **CI 装的是标准 `playwright@1.49.1` 的 Chromium，本地用 `playwright-core@^1.63.0` + 系统 Chrome** —— 浏览器版本与驱动版本在 CI 与本地**不一致**
2. 1.49.1 vs 1.63.0 **跨了 14 个 minor 版本**

workflow 注释说明了它的期望：

> 安装 Chromium 供 playwright-core 驱动（`tests/e2e.mjs` 会自动探测 `.cache/ms-playwright`）

即：靠 `findChrome()` 的多候选探测能力去找到 CI 装的 Chromium。**能工作，但版本对齐是隐患**——本地通过、CI 失败（或反之）时，排查者要先排除版本差异这个变量。

### 3.4 起服务的细节

```bash
npm run preview -- --port 4173 --host 127.0.0.1 &
for i in $(seq 1 30); do
  curl -sf http://127.0.0.1:4173/ >/dev/null && break
  sleep 1
done
```

- 后台起 preview
- `curl -sf` 轮询最多 **30 次**（30 秒）
- **注意**：循环结束后**没有校验是否真的起来了** —— 若 30 次全失败，脚本仍继续往下走，接着 `node tests/e2e.mjs` 会以连接失败告终

**这是一个可以改进的点**：轮询超时后应当显式失败并说明"preview 未能启动"，而不是让 E2E 报出连接错误（错误信息会误导排查方向）。

---

## 4. ⚠️ 核心缺口：CI 未跑任何质量门禁（`DEBT-002`）

### 4.1 实测对比表

| 门禁 / 测试 | 本地命令 | `deploy.yml` | `e2e.yml` |
|---|---|---|---|
| 类型检查 | `tsc -b` | ✅（在 build 内） | ✅（在 build 内） |
| 构建 | `vite build` | ✅ | ✅ |
| **内容门禁（20 项）** | `npm run content:validate` | ❌ **未跑** | ❌ **未跑** |
| **体积门禁（3 项）** | `npm run check:bundle` | ❌ **未跑** | ❌ **未跑** |
| **契约测试（149 项）** | `npm run test:content` | ❌ **未跑** | ❌ **未跑** |
| **E2E（165 项）** | `npm run test:e2e` | ❌ **未跑** | ✅ 仅 PR |
| **离线审计（5 态，20 项断言）** | `npm run test:offline` | ❌ **未跑** | ❌ **未跑** |
| **生产冒烟（22 项）** | `npm run test:smoke` | ❌ **未跑** | ❌ **未跑** |
| **lint** | `npm run lint` | ❌ **未跑** | ❌ **未跑** |

**实测确认方法**：`grep -n "content:validate\|check:bundle\|test:" .github/workflows/*.yml` → **零命中**。

### 4.2 后果分析

| 场景 | 当前会不会被拦住 |
|---|---|
| 提交一个 namespace 撞车的包（**历史上真实发生过**） | ❌ **不会** —— `content:validate` 不在 CI，坏包直接上线 |
| 提交一个 `stats.items` 与真实词数不符的包 | ❌ 不会 |
| 主 chunk 涨到 450 KiB（超 420 阈值） | ❌ **不会** —— `check:bundle` 不在 CI |
| 把某个 lazy 包误改成 inline（主 chunk 暴涨 471.92 KiB） | ❌ **不会**（同上） |
| 违反 query 契约（如 UI 直读词数组） | ❌ 不会 —— `test:content` 不在 CI |
| SW 改坏导致断网白屏 | ❌ **不会** —— `test:offline` 不在 CI |
| 线上 CDN 头配置被改错 | ❌ 不会 —— `test:smoke` 不在 CI |
| merge 后直接 push main（不经 PR） | ❌ **不会** —— `e2e.yml` 只在 PR 跑 |
| TS 类型错误 | ✅ **会**（`tsc -b` 在 build 内） |
| 代码被打包不出来 | ✅ 会 |

### 4.3 为什么这个缺口特别值得强调

**因为门禁本身做得很好**：

- 内容门禁 20 项，有历史战果（抓到过 namespace 撞车）
- 体积门禁有 **UNKNOWN 判失败** 的成熟语义
- 契约测试 149 项，用 `vite ssrLoadModule` 跑生产源码
- 离线审计 5 态，对应三类真实静默 `ERR_FAILED`
- 生产冒烟 22 项，覆盖 CDN 与 SW 升级

**这些资产都在，但都只在开发者本机跑。** 一个人的一次"忘了跑"就能让全部防线失效。

**修复成本极低** —— 在 `deploy.yml` 的第 4 步与第 5 步之间插入：

```yaml
- name: Content gate
  run: npm run content:validate

- name: Bundle budget
  run: npm run check:bundle

- name: Content contract
  run: npm run test:content
```

而 `e2e.yml` 只需在 `Run E2E suite` 前后补上 `test:offline`、`test:smoke`（smoke 需针对刚部署的环境）、`lint`。

---

## 5. 无 staging 环境

### 5.1 实测

| 环境 | 存在？ |
|---|---|
| 生产（`geek-typing.pages.dev`） | ✅ |
| Staging / Preview | ❌ **无任何分支/环境配置** |

`deploy.yml` 的注释明确写「不带 `--branch`，确保发布到生产环境」——**只有一个目标环境**。

### 5.2 后果

1. **无法在生产前验证** —— 每次部署都是直接上生产
2. **无法灰度** —— 无逐步放量的能力
3. **回滚靠 Cloudflare Pages 的历史部署**（平台提供，但项目内无回滚流程文档）
4. **验收只能在生产做** —— 这正是 `FLAKY-001` 的成因

### 5.3 Cloudflare Pages 的 Preview 能力未使用

Cloudflare Pages 原生支持"每个分支/PR 一个预览 URL"。**但 `--commit-dirty=true` 且不带 `--branch` 的配置主动绕过了这个能力。**

即：**平台有能力，配置选择了不用。** 这是一个可以低成本改善的点——把 PR 构建改为部署到 preview 分支，即可获得 staging 能力。

---

## 6. `FLAKY-001`：生产冒烟 A3 失败的真实成因（重要案例）

### 6.1 现象

`FINAL_ACCEPTANCE.md` 记录：`test:smoke` 实测 **21/22**，唯一失败项是 **A3**。

A3 的检查内容是：**线上 `/` 引用的 bundle 文件名，与本地 `dist` 里的 bundle 文件名一致。**

失败原因：

| 位置 | bundle 名 |
|---|---|
| 线上 `/` | `index-Cawl4_-q.js` |
| 本地 `dist` | `index-Dw5EkkBq.js` |

### 6.2 根因链（这条链值得审计方完整看到）

1. 本轮审计在 `src/components/ResultOverlay.tsx` 新增了 `data-testid`（为了 E2E 能稳定定位结算弹层元素）
2. 该改动**未提交**
3. 本轮审计**重跑了 `npm run build`** ⇒ 本地 `dist` 的 bundle hash 变了（因为源码变了）
4. 但**线上还是上一次部署的产物**（hash 是旧的）
5. A3 比对两者 ⇒ **不一致 ⇒ FAIL**

### 6.3 结论：这不是站点缺陷

**`A3` 是对的，失败也是"正确"的失败。** 它准确地检测出了"本地产物 ≠ 线上产物"这一事实。

**真正的问题是流程**：
- 审计过程中改了源码并重跑构建，但没重新部署
- 线上与本地必然不一致

### 6.4 这条为什么值得单列

因为它**同时展示了三个系统性问题**：

| 问题 | 体现 |
|---|---|
| **1. 无 staging** | 如果有 staging，审计改动可以先部署到 staging 验证，不影响生产比对 |
| **2. `--commit-dirty=true`** | 允许工作区脏时部署，加剧了"线上产物与 git 提交不对应" |
| **3. 冒烟测试打进线上** | `test:smoke` 比对线上与本地，天然对"未部署的本地改动"敏感 ⇒ 时序脆弱（这就是 `FLAKY-001` 的命名含义） |

**`FLAKY-001` 的"flaky"不是"测试不准"，而是"测试对流程状态敏感"。** 这个区分很重要——它说明测试写对了，但流程没跟上。

### 6.5 处置

`KNOWN_ISSUES.md` 的 §7 待决事项已记录：**生产未更新**（本轮审计引入的 `ResultOverlay.tsx` 改动未提交、未部署）。

---

## 7. 部署可观测性

| 能力 | 现状 |
|---|---|
| 部署成功/失败通知 | GitHub Actions 默认（无自定义通知） |
| 部署产物指纹记录 | ❌ 无 |
| 线上版本与 git commit 对应关系 | ⚠️ `--commit-dirty=true` 破坏了这个对应 |
| 部署历史 | Cloudflare Pages 平台侧提供 |
| 回滚流程文档 | ❌ 无 |
| 部署后自动验证 | ❌ 无（`test:smoke` 需手动跑） |

**"部署后自动跑冒烟"是一个明显的缺失** —— 当前部署完就结束了，没有人自动确认"刚部署的东西是活的"。

---

## 8. 改进优先级

| 优先级 | 事项 | 成本 | 收益 |
|---|---|---|---|
| 🔴 **P0** | **`content:validate` 接入 `deploy.yml`** | 3 行 YAML | 拦下坏内容上线（**历史上已发生过一次**） |
| 🔴 **P0** | **`check:bundle` 接入 `deploy.yml`** | 3 行 YAML | 拦下体积超预算（余量仅 9.3%，很现实） |
| 🔴 **P0** | **`test:content` 接入 `deploy.yml`** | 3 行 YAML | 拦下契约破坏 |
| 🟠 P1 | `test:offline` 接入 `e2e.yml` | 1 行 | SW 改坏会被发现 |
| 🟠 P1 | `lint` 接入 CI | 1 行 | 16 warning 有个守卫 |
| 🟠 P1 | 部署后自动跑 `test:smoke` | 需编排 | 部署可观测性 |
| 🟠 P1 | 对齐 `playwright` 版本（1.49.1 vs 1.63.0） | 1 行 | 消除本地/CI 环境差异 |
| 🟠 P1 | 轮询超时后显式失败 | 3 行 | 错误信息更准确 |
| 🟡 P2 | 启用 Cloudflare Pages Preview 分支作为 staging | 中等 | 获得生产前验证能力 |
| 🟡 P2 | 去掉 `--commit-dirty=true` | 1 行 | 恢复"线上 = git 提交"的对应关系 |
| 🟡 P2 | 回滚流程文档 | 写文档 | 应急能力（见 `DISASTER_RECOVERY.md`） |

**前 3 项合计约 9 行 YAML，能堵上本资料包里最大的一处工程治理缺口。**

---

## 9. 一句话总结给审计方

**部署链路本身干净（Cloudflare Pages + GitHub Actions，Secret 自检这处设计尤其好，错误信息质量高），但质量门禁几乎全部缺席：CI 只跑 `tsc -b && vite build`，20 项内容门禁、3 项体积门禁、149 契约断言、5 态离线审计、22 项生产冒烟、lint 全部不在 CI 里；E2E 也只在 PR 触发，merge 后的 main 无保护。加上无 staging 环境、`--commit-dirty=true` 允许脏工作区部署，形成了"防线很强但只有人在守"的局面。修复前 3 项约需 9 行 YAML。**
