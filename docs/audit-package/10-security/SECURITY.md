# 安全（Security）

> 状态：✅ 已有（部分安全头）+ 📐 待建（无 CSP、无安全测试）
> 实测环境：Windows 11 / Git Bash，仓库 `/d/work/geek-typing`
> 结论摘要：**安全响应头有 4 条；CSP 完全不存在；安全测试为零**

---

## 1. 架构特征（决定了威胁模型）

| 特征 | 实测 |
|---|---|
| 部署形态 | **纯静态站**（Cloudflare Pages） |
| 后端 | ❌ **无** |
| 数据库 | ❌ **无** |
| 鉴权 / 登录 | ❌ **无** |
| 文件上传（到服务端） | ❌ **无** |
| API 端点 | ❌ **无** |
| 用户数据存储 | **仅浏览器 localStorage** |
| 第三方脚本 | ❌ **无**（curl 外部 CDN、无 GA、无 Sentry） |
| Cookie | ❌ **无**（除 localStorage 的功能性存储） |
| 运行时依赖 | **4 个**（react / react-dom / lucide-react / canvas-confetti） |
| Service Worker | ✅ **有**（高权限、可持久化） |

**这套特征消除了绝大多数传统 Web 攻击面**：

| 攻击面 | 是否存在 | 原因 |
|---|---|---|
| SQL 注入 | ❌ | 无数据库 |
| 命令注入 | ❌ | 无服务端 |
| SSRF | ❌ | 无服务端发起的请求 |
| 会话劫持 / CSRF | ❌ | 无鉴权、无 Cookie |
| 越权访问（IDOR） | ❌ | 无用户账户 |
| 服务端文件上传 / webshell | ❌ | 无上传端点 |
| 服务端路径穿越 | ❌ | 无文件系统访问 |
| 服务端反序列化 | ❌ | 无服务端 |

**这是一个"攻击面天生极小"的系统。** 但**不是零**——见 §3。

---

## 2. 现有安全响应头（实测）

### 2.1 全部内容（`public/_headers`，共 19 行）

```
# 全局安全响应头
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: SAMEORIGIN
  Cross-Origin-Opener-Policy: same-origin

# Vite 带 hash 的静态资源：强缓存一年（内容变化 URL 就会变，安全）
/assets/*
  Cache-Control: public, max-age=31536000, immutable

# SW 自身禁止 HTTP 缓存：保证新版本 Service Worker 能被浏览器及时探测与更新
/sw.js
  Cache-Control: no-cache

# SVG 图标同样带指纹，可放心长缓存
/icons.svg
  Cache-Control: public, max-age=604800
```

### 2.2 逐条评估

| 头 | 值 | 防护作用 | 评估 |
|---|---|---|---|
| `X-Content-Type-Options` | `nosniff` | 阻止浏览器 MIME 嗅探（防"把 .txt 当 JS 执行"） | ✅ 正确 |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | 跨站时只发 origin，不发完整路径 | ✅ 正确（现代推荐值） |
| `X-Frame-Options` | `SAMEORIGIN` | 防点击劫持（禁止第三方 iframe 嵌入） | ✅ 正确 |
| `Cross-Origin-Opener-Policy` | `same-origin` | 隔离跨源窗口引用（防 Spectre 类旁路 + 跨窗口攻击） | ✅ 正确 |

**这 4 条选择得很专业。**

- `strict-origin-when-cross-origin` 是当前浏览器默认值中最安全的实用选择（比 `same-origin` 兼容性好，比 `no-referrer-when-downgrade` 安全）
- `COOP: same-origin` 是较新且常被忽略的头，**能配上说明作者了解现代的跨源隔离议题**
- 缓存策略的注释（"内容变化 URL 就会变，安全"）说明作者理解**为什么**带 hash 的资源可以长缓存

### 2.3 缺失的头

| 头 | 现状 | 影响 |
|---|---|---|
| **`Content-Security-Policy`** | ❌ **不存在** | **最大的缺失**（见 §2.4） |
| `Strict-Transport-Security`（HSTS） | ❌ 未设置 | 首次访问可能被降级到 HTTP（若用户手输 `http://`） |
| `Cross-Origin-Resource-Policy`（CORP） | ❌ 未设置 | 未限制本资源被跨源加载 |
| `Cross-Origin-Embedder-Policy`（COEP） | ❌ 未设置 | 若要用 `SharedArrayBuffer` 等需配 COOP+COEP 对 |
| `Permissions-Policy` | ❌ 未设置 | 未显式关闭不需要的浏览器特性（摄像头、麦克风、定位等） |
| `X-Permitted-Cross-Domain-Policies` | ❌ 未设置 | Flash 时代遗留，现代可忽略 |

### 2.4 CSP 实测：完全不存在（关键发现）

实测命令与结果：

```
$ grep -rn "Content-Security-Policy\|csp" public/_headers index.html vite.config.ts src/
(以上为全部命中)          ← 零命中
```

| 检查位置 | 结果 |
|---|---|
| `public/_headers` | ❌ 无 `Content-Security-Policy` |
| `index.html` | ❌ 无 CSP meta 标签 |
| `vite.config.ts`（7 行，仅 `plugins: [react()]`） | ❌ 无 CSP 注入插件 |
| `src/` 全目录 | ❌ 无 |

**CSP 数量 = 0。**

#### 为什么这是最大缺口

CSP 是 XSS 的**最后一道防线**。它的作用不是"阻止 XSS 发生"，而是"**当 XSS 发生时让它执行不了**"。

对本项目，CSP 缺失的具体后果：

| 场景 | 无 CSP 的后果 |
|---|---|
| 未来某个环节出现 XSS（如 markdown 渲染、第三方组件） | 攻击者可任意执行脚本 |
| Service Worker 被污染 | 无 CSP 拦截能力。**SW 是高权限实体，比普通 XSS 更持久** |
| 未来引入第三方脚本（分析、客服、字体 CDN） | 供应链攻击无隔离 |
| `localStorage` 数据被注入（用户粘贴不可信内容） | 若渲染路径用 `innerHTML`，脚本会执行 |

**注意 `index.html` 的现状使 CSP 事实上是可行的**：

- ✅ **无内联脚本**（`index.html` 只有 `<script type="module" src="/src/main.tsx">`）
- ✅ **无外部 CDN**（PWA manifest、icons 全部是本地路径）
- ✅ **无内联事件处理器**（`onclick=` 等）

⇒ **一个严格的 CSP（`script-src 'self'`）大概率可以直接上**，这是本项目做 CSP 的最大有利条件。

**唯一的待验证点是 style**：tailwind / Vite 是否产生内联 `<style>`（可能需要 `style-src 'self' 'unsafe-inline'`，或者可以进一步收紧）。**建议先用 report-only 模式实测。**

详见 `09-testing/SECURITY_TEST.md` §3.2（含建议的 CSP 策略与验证方法）。

### 2.5 现有 4 条头**没有任何测试守着**

| 检查项 | 结果 |
|---|---|
| 安全响应头回归断言 | ❌ 无 |
| `tests/prod-smoke.mjs` 是否检查安全头 | ❌ **不检查** |

`tests/prod-smoke.mjs` Part A 检查了 HTTP 指纹（308 跳转、`sw.js` 的 `no-cache`、bundle 的 `immutable`），**但不检查任何安全头**。

**即：有人误删 `nosniff` 一行，CI 不会失败，测试不会失败，没人会发现。**

**修复成本 = 5 条断言。** 见 `09-testing/SECURITY_TEST.md` §3.1。

---

## 3. 真实攻击面

即使传统服务端攻击面为零，**仍有三个实质性攻击面**：

### 3.1 Service Worker（最高权限、可持久化）

SW 的能力清单：

| 能力 | 安全含义 |
|---|---|
| 拦截**所有**同源请求 | 可改写任何响应 |
| 永久驻留在用户设备 | **关掉标签页依然存活** |
| 可访问 Cache Storage | 可毒化缓存 |
| 可跨标签页通信（`clients`） | 影响范围不限于单页 |
| 生命周期长于任何页面 | 传统 XSS 随页面关闭失效，**SW 污染不会** |

**SW 一旦被污染，攻击效果远超普通 XSS**：所有后续访问都会被劫持，且用户很难察觉（没有可见的异常）。

#### 当前 SW 的防御措施（实测，值得肯定）

`public/sw.js`（178 行）已实现：

| # | 防御 | 实测位置 |
|---|---|---|
| 1 | 只处理同源请求（`url.origin !== self.location.origin` → return） | `fetch` handler |
| 2 | 只处理 GET（`req.method !== 'GET'` → return） | `fetch` handler |
| 3 | 非 2xx 不入缓存（`if (!res.ok) return res`） | `putClean` |
| 4 | 所有写入统一走 `sanitize()` 重建 | `putClean` + `precacheShell` |
| 5 | `sanitize()` 剥离 `content-encoding` / `content-length` / `vary` | `sanitize` |
| 6 | `activate` 清理非本版本缓存 | `activate` |
| 7 | `/sw.js` 设 `no-cache`，保证版本及时探测 | `public/_headers` |

**第 4 条是最有价值的**：**所有缓存写入都经过同一个函数**。这消除了"某个代码路径绕过了净化"的可能——这是一个正确的"瓶颈式设计"。

#### SW 的攻击面缺口

| # | 缺口 |
|---|---|
| 1 | **上述 7 项防御一个断言都没有**（见 `09-testing/SECURITY_TEST.md` S-1~S-8） |
| 2 | 缓存**无 URL 白名单** —— 所有同源 GET 都会被缓存（当前无害，但若未来加 `/api/*` 会立刻成为问题） |
| 3 | `precacheShell()` 的正则 `/(?:src\|href)="(\/assets\/[^"]+)"/g` **只匹配 `/assets/` 前缀** —— 若未来资源放其他地方不会被预缓存（功能问题，也意味着缓存内容不可预测） |
| 4 | 无 SRI（`integrity` 属性）—— 当前无外部资源，故无实际风险，但若引入 CDN 必须补 |

### 3.2 localStorage（用户可控的自由文本）

#### 实测：`src/lib/customBanks.ts`（93 行）

这是**用户唯一能输入自由文本的地方**。实测其数据处理：

**输入解析**（`parseWords`，`:50-84`）：

```js
// 格式 1：JSON
if (text.startsWith('[') || text.startsWith('{')) {
  const data = JSON.parse(text)
  const arr = Array.isArray(data) ? data : data.words ?? []
  return arr
    .map((w: unknown) => {
      if (typeof w === 'string') return { word: w.trim(), translation: '' }
      const o = w as Record<string, string>
      return { word: (o.word ?? o.name ?? '').trim(),
               translation: (o.translation ?? o.meaning ?? '').trim() }
    })
    .filter((w: WordItem) => /^[A-Za-z][A-Za-z'\- ]*$/.test(w.word))   // ← 白名单
}

// 格式 2：每行一个
return text.split(/\r?\n/)
  .map(line => line.trim()).filter(Boolean)
  .map(line => { /* 多种分隔符解析 */ })
  .filter((w) => /^[A-Za-z][A-Za-z'\- ]*$/.test(w.word))               // ← 白名单
```

**关键发现：`word` 字段有白名单正则**：

```regex
/^[A-Za-z][A-Za-z'\- ]*$/
```

**含义**：`word` **只允许英文字母、撇号、连字符、空格**。

| 恶意输入 | 是否通过白名单 |
|---|---|
| `<script>alert(1)</script>` | ✅ 被拒绝（含 `<` `>`） |
| `<img src=x onerror=alert(1)>` | ✅ 被拒绝（含 `<` `>` `(` `)` `=`） |
| `javascript:alert(1)` | ✅ 被拒绝（含 `:` `(` `)`） |
| `alert(1)` | ✅ 被拒绝（含 `(` `)`） |
| `"onmouseover="x` | ✅ 被拒绝（含 `"` `=`） |
| `normalword` | 通过 ✅ |
| `don't` | 通过 ✅ |
| `well-known` | 通过 ✅ |
| `a b`（含空格） | 通过 ✅ |

**这是一个有效的、有针对性的输入白名单。** 它把 `word` 字段的字符集限制到了"不可能构成 HTML/JS 语法"的范围。

#### 但 `translation` 字段没有白名单

实测（`:62`）：

```js
translation: (o.translation ?? o.meaning ?? '').trim()
```

**只有 `.trim()`，没有字符白名单。**

即：**`translation` 可以包含任意字符**，包括 `<script>alert(1)</script>`、`<img onerror=...>`、HTML 标签、事件处理器属性。

#### 那为什么当前仍然安全？

因为 **实测确认：全仓库零 `innerHTML` / `dangerouslySetInnerHTML`**：

```
$ grep -rn "innerHTML\|dangerouslySetInnerHTML" src/
(以上为全部命中)          ← 零命中
```

**React 默认使用 `textContent` 语义渲染文本**，所以即使 `translation` 里含 `<script>`，它会被**原样显示为文本**，不会被解析为 HTML。

#### 所以真实的状态是：

| 层 | 状态 | 评估 |
|---|---|---|
| `word` 字段 | **白名单校验** | ✅ 主动防御 |
| `translation` 字段 | **无校验** | ⚠️ 依赖渲染层 |
| 渲染层 | **零 `innerHTML`** | ✅ 当前安全 |
| **但渲染层无任何测试守着** | ❌ | ⚠️ **这就是风险** |

**这是一个"纵深防御只有一层"的状态**：

- `word` 有 2 层（白名单 + React 转义）
- `translation` 只有 1 层（React 转义）
- **第 1 层（React 转义）没有任何断言守着**

**风险场景**：某天有人为了渲染一个富文本释义、或为了性能优化，把某个组件改成 `innerHTML` —— **`translation` 立即变成 XSS 注入点，而 `word` 的白名单拦不住 `translation`。**

**这就是 `09-testing/SECURITY_TEST.md` 里 X-1~X-10 存在的理由**，特别是 **X-9（localStorage 被手动注入带脚本的数据）**——因为攻击者不需要经过 `parseWords` 的白名单，可以直接改 localStorage。

#### 其他 localStorage 相关观察

| # | 观察 |
|---|---|
| 1 | `gt.customBanks.v1` 是唯一键名（`:3`）—— **有版本后缀 `.v1`**，这是好的做法 |
| 2 | `loadCustomBanks()` 有 `try/catch`，解析失败返回 `[]`（`:12-19`）—— **对损坏数据健壮** |
| 3 | `saveCustomBank` 的 `name` 只有 `.trim()` 和空值兜底（`:29`）—— **词库名无白名单，同样可以含任意字符** |
| 4 | **无字段级 schema 校验**（如 `words` 长度上限）—— 粘贴超大文本可能导致 localStorage 配额耗尽（对应 `T-2`） |
| 5 | `id` 用 `Date.now().toString(36)`（`:28`）—— 同一毫秒内连续调用会**撞 id** |

**第 5 条是一个具体的 bug**：`custom-${Date.now().toString(36)}` 在快速连续创建词库时会生成相同 id，`deleteCustomBank` 按 id 过滤会**一次删掉多个**。这不是安全问题，但是一个真实的缺陷。

### 3.3 供应链

| 项 | 现状 | 评估 |
|---|---|---|
| 运行时依赖 | **4 个** | ✅ **极小** |
| lockfile | ✅ 有（CI 用 `npm ci`） | ✅ 正确 |
| `npm audit` 接入 | ❌ 无 | ⚠️ 缺口 |
| Dependabot / Renovate | ❌ 无 | ⚠️ 缺口 |
| 第三方脚本 | ❌ 无 | ✅ **零外部脚本是最强防御** |
| SRI | ❌ 无 | 🟡 当前无外部资源，无实际风险 |

**"零第三方脚本"是本项目最被低估的安全优势。** 绝大多数 Web 安全事件来自第三方脚本（分析、广告、客服 SDK）。本项目一个都没有。

**4 个依赖的含义**：供应链攻击面约为典型 React 项目的 1/10。这是"极简依赖"带来的直接安全收益。

---

## 4. 数据与隐私

| 项 | 现状 |
|---|---|
| 收集的用户数据 | **无**（不上报任何数据） |
| 数据存放位置 | **仅用户浏览器 localStorage** |
| 是否有服务端存储 | ❌ 无 |
| 是否有 Cookie | ❌ 无 |
| 是否有第三方追踪 | ❌ 无 |
| 是否有隐私政策页 | ❌ 无 |

**隐私面极小** —— 严格说**没有收集任何个人数据**，因为数据从不出浏览器。

**但这带来两个连带问题**：

1. **无隐私政策页** —— 一个上线运营的站点（即使不收集数据）通常仍需要一页隐私说明，尤其如果要引入监控（见 `12-infrastructure/MONITORING.md` §4）
2. **用户数据只在一处** —— localStorage 清除、换设备、换浏览器都会丢失学习记录，且**无导出/同步能力**（`exportBanksAsJson` 只导出词库，不导出学习进度）

**第 2 条更偏产品问题，但在审计里属于"数据可用性"风险**：用户辛苦积累的学习记录可能在一次"清除浏览器数据"后全部消失。

---

## 5. 安全测试现状

**零。** 详见 `09-testing/SECURITY_TEST.md`。

| 类别 | 已有 | 待建数 |
|---|---|---|
| 安全响应头回归 | 0 | 6 |
| CSP 违规检测 | 0 | 6 |
| XSS（含 localStorage 注入） | 0 | 10 |
| SW 安全 | 0 | 8 |
| 依赖与供应链 | 0 | 4 |
| 存储安全 | 0 | 5 |
| **合计** | **0** | **39** |

---

## 6. 风险汇总

### 🔴 高风险

| # | 风险 | 说明 |
|---|---|---|
| 1 | **无 CSP** | XSS 的最后一道防线缺失。当前无内联脚本/无外部 CDN，**上严格 CSP 的条件很成熟** |
| 2 | **现有 4 条安全头零断言** | 存在但无人守，改错了不会有人发现。修复成本 5 条断言 |
| 3 | **`translation` 字段无白名单** | 纵深防御只有 React 转义一层；渲染层零断言守着 |

### 🟠 中风险

| # | 风险 | 说明 |
|---|---|---|
| 4 | **SW 的 7 项防御零断言** | 尤其"跨 origin 不拦截"与"非 GET 不拦截"这两条安全边界 |
| 5 | **缓存无 URL 白名单** | 当前无害；若未来加 `/api/*` 会立刻成为问题 |
| 6 | **无 `npm audit`** | 4 个依赖，接入成本极低 |
| 7 | **localStorage 无 schema 校验** | `words` 无长度上限，配额可被耗尽 |
| 8 | **无 HSTS** | 首次访问可能被降级 |

### 🟡 低风险 / 待改进

| # | 风险 | 说明 |
|---|---|---|
| 9 | `saveCustomBank` 的 `name` 无白名单 | 同 `translation`，依赖 React 转义 |
| 10 | `id` 用 `Date.now().toString(36)` 可撞车 | 功能缺陷而非安全问题 |
| 11 | 无 `Permissions-Policy` | 未显式关闭摄像头/麦克风/定位等 |
| 12 | 无 SRI | 当前无外部资源 |
| 13 | 无隐私政策页 | 引入监控前必须先补 |

---

## 7. 优先级建议

| 优先级 | 事项 | 成本 | 理由 |
|---|---|---|---|
| 🔴 **P0** | **给现有 4 条安全头加回归断言** | 5 条断言 | 成本最低、收益最直接 |
| 🔴 **P0** | **加 CSP（先 report-only）** | 需实测 inline style | 条件成熟（无内联脚本、无外部 CDN），是最大缺口 |
| 🔴 **P0** | **XSS 断言（尤其 X-9 localStorage 注入）** | 10 条断言 | 守护 `translation` 字段唯一的防御层 |
| 🟠 P1 | `npm audit` 接入 CI | 1 行 YAML | 4 个依赖，成本极低 |
| 🟠 P1 | SW 安全断言（跨 origin / 非 GET / 非 2xx） | 8 条断言 | 现有分支无守卫 |
| 🟠 P1 | 给 `translation` / `name` 加长度上限 | 少量代码 | 防配额耗尽 |
| 🟠 P1 | 加 HSTS | 1 行 `_headers` | 若已全程 HTTPS，无兼容风险 |
| 🟡 P2 | 加 `Permissions-Policy` | 1 行 | 显式关闭不需要的特性 |
| 🟡 P2 | 修 `id` 撞车 | 改用 `crypto.randomUUID()` | 真实功能缺陷 |
| 🟡 P2 | 缓存 URL 白名单 | 需设计 | 当前无害，为未来做铺垫 |
| ⚪ P3 | 隐私政策页 | 写文档 | 引入监控的前置 |
| ⚪ P3 | SRI | 待引入外部资源时 | 当前无实际风险 |

---

## 8. 一句话总结给审计方

**这是一个攻击面天生极小的系统（纯静态、无后端、无鉴权、无上传、无 Cookie、零第三方脚本、只有 4 个运行时依赖），传统服务端攻击面（SQLi / SSRF / CSRF / 越权 / 上传）全部不存在。已有 4 条安全响应头且选值专业（含常被忽略的 COOP）。真实攻击面集中在两处：Service Worker（高权限且可持久化，比普通 XSS 更持久；已实现 7 项防御但零断言）与 localStorage 自由文本（`word` 字段有字符白名单，`translation` 与词库名没有；当前靠"全仓库零 innerHTML + React 自动转义"兜底，但这一层零断言）。最大的两个缺口是：一、CSP 完全不存在（实测 `public/_headers` 与 `index.html` 均无，零命中），而本项目无内联脚本、无外部 CDN，上严格 CSP 的条件很成熟；二、现有 4 条安全头没有任何测试守着，误删不会失败。这两项修复成本都很低。**
