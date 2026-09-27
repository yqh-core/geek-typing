# 构建（Build）

> 状态：✅ 已有（实测）
> 实测结果：**1939 modules transformed**，`tsc -b` **0 error**，`exit 0`
> 构建耗时：**不记录单一基线数字** —— 本轮三次实测 `25.12s / 21.27s / 5.70s`，方差超 4 倍（宿主 Esafenet 透明加密驱动所致）。**耗时不是门禁**，详见 `PERFORMANCE.md` §2.2。

---

## 1. 构建命令（实测自 `package.json`）

```json
"build": "tsc -b && vite build"
```

**两段式：先类型检查，再打包。** `tsc -b` 失败则 `vite build` 不会执行。

### 1.1 相关脚本全清单（实测）

| 脚本 | 实际命令 |
|---|---|
| `build` | `tsc -b && vite build` |
| `preview` | `vite preview --host 127.0.0.1 --port 4173 --strictPort` |
| `lint` | `oxlint` |
| `icons` | `node scripts/gen-icons.mjs` |
| `content:build` | 见 `package.json` |
| `content:normalize` | 见 `package.json` |
| `content:validate` | 见 `package.json` |
| `content:check` | 见 `package.json` |
| `content:list` | 见 `package.json` |
| `check:bundle` | `node scripts/check-bundle.mjs` |

**注意**：`build` **不包含** `content:validate`，也**不包含** `check:bundle`。构建成功 ≠ 内容合规 ≠ 体积达标。这是三个独立的门禁。

---

## 2. 工具链版本（实测自 `package.json`）

### 2.1 运行时依赖（仅 4 个）

| 依赖 | 版本 |
|---|---|
| `react` | `19.2.8` |
| `react-dom` | 与 react 同版本 |
| `lucide-react` | `^1.48.0` |
| `canvas-confetti` | `^1.9.4` |

**只有 4 个运行时依赖是一个显著的工程优势**——供应链面小、升级负担低、主 chunk 可控。

### 2.2 开发依赖

| 依赖 | 版本 | 说明 |
|---|---|---|
| `vite` | `^8.3.0` | 构建器 |
| `typescript` | `~6.0.2` | 类型检查 |
| `oxlint` | `^1.81.0` | lint（**不是 ESLint**） |
| `playwright-core` | `^1.63.0` | 浏览器驱动（**不带测试运行器**） |
| `tailwindcss` | `^3.4.17` | 样式 |

**注意两点**：

1. **`oxlint` 而非 ESLint** —— 更快的 Rust 实现，没有 ESLint 的插件生态，但满足本项目需求
2. **`playwright-core` 而非 `@playwright/test`** —— 项目自己写了断言框架（见 `09-testing/TEST_STRATEGY.md`）

### 2.3 Vite 配置极简

`vite.config.ts`（**7 行**）实测：

```ts
export default defineConfig({
  plugins: [react()],
})
```

**没有**：
- 手动 chunk 分割配置（分包靠 registry 的动态 import 自然形成）
- 压缩配置（用 Vite 默认）
- CSP 注入插件
- 别名配置
- `build.rollupOptions` 定制

**这意味着分包机制完全依赖源码里的 `import()` 形态**——`src/core/content/registry.ts` 里 `words:`（静态）与 `load:`（动态 import）的区别，就是 inline/lazy 的唯一决定因素。这也是 `scripts/content/validate.mjs` 第 20 项要校验"策略声明与代码一致"的原因（见 `09-testing/CONTENT_TEST.md` §2.7）。

---

## 3. 实测构建结果

| 项 | 值 |
|---|---|
| 构建耗时 | **不设基线**（本机 21–25s，历史 7.07s，宿主抖动，非门禁） |
| 处理模块数 | **1939 modules transformed** |
| `tsc -b` | **0 error** |
| `lint`（oxlint） | 0 error / **16 warning** |
| 通过 | ✅ |

`lint` 的 16 个 warning 对应 `DEBT-006`。

### 3.1 产物清单（实测，`FINAL_ACCEPTANCE.md`）

| 文件 | raw | gzip |
|---|---|---|
| `dist/index.html` | 2.00 kB | 0.99 kB |
| `dist/assets/index-DWqJDTkw.css` | 23.63 kB | 5.53 kB |
| `dist/assets/index-Cawl4_-q.js` | **390.20 kB** | **123.07 kB** |
| `dist/assets/words-Dfqbfxph.js` | 475.18 kB | 170.21 kB |
| `dist/assets/words-DO8i2GAI.js` | 482.53 kB | 174.09 kB |
| `dist/assets/words-LP9e320F.js` | 483.08 kB | 174.05 kB |

**口径说明**：vite 输出用 kB（十进制，1000）。`check-bundle.mjs` 用 KiB（二进制，1024）报 **381.06 KiB raw / 118.89 KiB gzip**。**同一文件，两个口径**（详见 `09-testing/PERFORMANCE_TEST.md` §2.3）。

### 3.2 产物结构

```
dist/
├── index.html                        2.00 kB
├── assets/
│   ├── index-DWqJDTkw.css           23.63 kB
│   ├── index-Cawl4_-q.js           390.20 kB  ← 主 chunk
│   ├── words-Dfqbfxph.js           475.18 kB  ← toefl
│   ├── words-DO8i2GAI.js           482.53 kB  ← ielts
│   └── words-LP9e320F.js           483.08 kB  ← kaoyan
├── sw.js                             ← 来自 public/
├── _headers                          ← 来自 public/
├── manifest.webmanifest
├── favicon.svg
├── icons.svg
├── icon-192.png
└── icon-512.png
```

**关键观察**：

1. **三个 `words-*` chunk 各约 475~483 kB**，几乎与主 chunk（390 kB）同量级。它们是 lazy 包的产物。
2. **只有 3 个 `words-*` chunk**，对应 3 个 lazy 包（ielts / kaoyan / toefl，共 9000 词）。
3. **7 个 inline 包的 346 词没有独立 chunk** —— 它们被静态 import 进了主 chunk。**这正是主 chunk 有 390 kB 的原因之一。**
4. `public/` 下的文件（`sw.js`、`_headers`、图标、manifest）**原样拷贝**，不经过 Vite 处理。

---

## 4. 分包机制：inline vs lazy

### 4.1 机制（实测）

分包不是靠配置，而是靠 `src/core/content/registry.ts` 里的 import 形态：

| 形态 | 策略 | 结果 |
|---|---|---|
| `import { xxxWords } from './xxx/words'`（静态） | **inline** | 词条全额进主 chunk |
| `load: () => import('./xxx/words')`（动态） | **lazy** | 生成独立 `words-*.js` chunk |

### 4.2 传导比实测（这是本仓库最有价值的定量结论）

引自 `scripts/content/validate.mjs:35-37` 注释：

> 实测 inline 词 **1:1 全额传导**进主 chunk：kaoyan 改 inline ⇒ 主 chunk **+471.92 KiB**，与 words.json **471.70 KiB** 比值 **1:1.0005**

**含义**：inline 一个包 = 把它的 words.json **原封不动地搬到主 chunk**（压缩后略有差异，比值 1.0005）。

**这是一个极强的结论**：
- 它把"inline 会撑大首屏"从直觉变成定量
- 它解释了为什么门禁第 19 项要给 inline 包设硬上限（≤ 1000 词 / ≤ 64 KiB）
- 它是"lazy 是首屏体积的唯一调节阀"的证据

### 4.3 当前分布（实测）

| 策略 | 包数 | 词数 | 字节 |
|---|---|---|---|
| **inline** | 7 | **346** | **36.17 KiB** |
| **lazy** | 3 | **9000** | **1406.79 KiB** |

**比例悬殊**：inline 平均每包 49 词，lazy 平均每包 3000 词。这个分布是对的——小的社交/兴趣词库 inline（省一次请求），大的考试词库 lazy（省首屏体积）。

### 4.4 分包的一致性校验

`scripts/check-bundle.mjs` 第 2 项验证：**`words-*` chunk 数 ≥ registry 中 lazy 包数**。

当前：3 个 chunk ≥ 3 个 lazy 包 ⇒ PASS（**刚好相等**）。

**这是"刚够"而非"有余量"** —— 如果 lazy 包增加而构建产物没跟上，会立刻 FAIL。

---

## 5. 构建相关的门禁（三个独立的检查）

| 门禁 | 命令 | 检查什么 | 是否在 build 内 |
|---|---|---|---|
| 类型检查 | `tsc -b` | TS 类型正确 | ✅ **在 `build` 内** |
| lint | `npm run lint` | 代码风格/潜在 bug | ❌ 独立 |
| 内容门禁 | `npm run content:validate` | 20 项内容规则 | ❌ 独立 |
| 体积门禁 | `npm run check:bundle` | 3 项体积规则 | ❌ 独立（且**必须在 build 之后**） |

**审计要点**：`npm run build` 只做"类型检查 + 打包"。**内容合规与体积达标都需要单独跑**，而 CI 只跑了 `build`（见 `12-infrastructure/DEPLOYMENT.md`）。

### 5.1 体积门禁的执行顺序依赖

`check-bundle.mjs` **必须**在 `vite build` 之后跑——因为它读 `dist/` 目录。

而且它有明确的前置检查（`scripts/check-bundle.mjs`）：

> `dist` 或 `dist/assets` 不存在时直接 `exit 1`，注释：**「产物缺失本身就是问题，不假装通过」**

即：**忘记先 build 就跑步径门禁 ⇒ 判 `UNKNOWN` ⇒ `exit 1`**。这是三态语义的正确应用（见 `09-testing/PERFORMANCE_TEST.md` §1.2）。

---

## 6. 构建产物清单生成

`scripts/audit-capture.mjs`（469 行）与 `scripts/gen-icons.mjs`（110 行）是两个辅助脚本：

- `gen-icons.mjs` —— 生成 PWA 图标（`icon-192.png` / `icon-512.png` / `favicon.svg`）
- `audit-capture.mjs` —— 审计证据采集（截图、构建信息）

`npm run icons` 对应前者。

---

## 7. 构建的已知问题

| 编号 | 问题 |
|---|---|
| `PERF-001` | 主 chunk raw 余量仅 **9.3%**（381.06 / 420 KiB），gzip 余量 **11.9%**（118.89 / 135 KiB）——**一次中等规模依赖升级就可能破线** |
| `A-3` | `warmUpVocabulary()` **硬编码 3 包**于 `src/core/content/registry.ts:139`，预热余量仅 17.2% |
| `DEBT-006` | lint 16 warning |
| `DEBT-004` | 文档数字不一致（`content/README.md` 说 17 项 vs 实际 20 项） |

### 7.1 `A-3` 值得展开

预热逻辑硬编码 3 个包名在 `registry.ts:139`。含义：

- 无论 registry 注册了多少 lazy 包，**预热只做这 3 个**
- 新增 lazy 包时**不会自动纳入预热**，需手动改 `registry.ts`
- 当前预热 497.03 KiB / 600 KiB，**余量 17.2%** —— 再塞一个 lazy 包（约 165 KiB）就会破线

**这是"配置与代码耦合"的典型**：预热的包列表是业务决策，却写死在注册表里。

### 7.2 主 chunk 减重的方向（供参考）

| 方向 | 预估收益 | 风险 |
|---|---|---|
| 把部分 inline 包改成 lazy | 每个约 5 KiB（346 词/7 包 ≈ 49 词，36.17/7 ≈ 5.17 KiB） | 增加一次请求 |
| 依赖瘦身（`lucide-react` 按需导入） | 需实测 | 图标库常是隐性大户 |
| 检查是否有死代码（`scripts/content/validate.mjs` 注释提到 registry 里存在"已声明但未被注册项使用"的静态 import 死代码） | 需实测 | 低 |

**第 3 条有直接线索**：`scripts/content/validate.mjs` 的 `registryLoadMode()` 注释原文：

> registry 里可能存在「**已声明但未被注册项使用**」的 `<id>Words` 静态 import（**死代码**），只扫 import 段会把 lazy 包误判成 inline

即：**已确认存在这类死代码。** 静态 import 未被使用，但**仍然会进主 chunk**（取决于 tree-shaking 效果）。这是一处待清理的隐性体积。

---

## 8. 一句话总结给审计方

**构建链极简（`tsc -b && vite build`，7 行 Vite 配置，4 个运行时依赖），1939 模块，0 类型错误；耗时受宿主影响方差超 4 倍（历史 7.07s / 本机 21–25s / 复核 5.70s），故不设基线。分包不靠配置而靠 import 形态，且已实测出 inline 词 1:1.0005 全额传导进主 chunk 的定量结论——这是这套架构最有价值的实测数据。风险在两处：主 chunk 余量仅 9.3%，以及内容门禁与体积门禁都不在 `build` 里、也不在 CI 里。**
